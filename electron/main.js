import { app, BrowserWindow, Menu, ipcMain, shell, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

/**
 * CẤU HÌNH FFMPEG
 * Ưu tiên file trong thư mục resources (khi đóng gói)
 * Nếu không có thì dùng từ thư viện static (khi dev)
 */
const fixPathForAsar = (path) => path.replace("app.asar", "app.asar.unpacked");

let ffmpegPath = ffmpegStatic;
let ffprobePath = ffprobeStatic.path;

if (!isDev) {
  // Khi đóng gói, electron-builder thường bỏ file vào resources
  const prodFfmpeg = path.join(process.resourcesPath, "ffmpeg.exe");
  const prodFfprobe = path.join(process.resourcesPath, "ffprobe.exe");
  if (fs.existsSync(prodFfmpeg)) ffmpegPath = prodFfmpeg;
  if (fs.existsSync(prodFfprobe)) ffprobePath = prodFfprobe;
}

ffmpeg.setFfmpegPath(fixPathForAsar(ffmpegPath));
ffmpeg.setFfprobePath(fixPathForAsar(ffprobePath));

console.log("🎬 FFmpeg Path:", ffmpegPath);

let mainWindow;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Automation Tool YT Downloader",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      webSecurity: false, // Cho phép load file
    },
  });

  const startUrl = isDev
    ? "http://localhost:5173"
    : `file://${path.join(__dirname, "../dist/index.html")}`;

  mainWindow.loadURL(startUrl);
  if (isDev) mainWindow.webContents.openDevTools();
};

app.on("ready", async () => {
  if (isDev) {
    try {
      const waitOn = (await import("wait-on")).default;
      await waitOn({ resources: ["http://localhost:5173"], timeout: 5000 });
    } catch (e) {
      console.warn("Vite dev server chưa sẵn sàng");
    }
  }
  createWindow();
  createMenu();
});

// --------------------- HELPERS --------------------

/**
 * Chuyển timemark "HH:MM:SS.ms" từ ffmpeg progress → seconds.
 * Dùng timemark thay vì progress.percent vì percent tính theo input bitrate,
 * không chính xác với filter_complex hoặc khi encode nặng hơn input.
 */
const timemarkToSeconds = (timemark) => {
  if (!timemark || typeof timemark !== "string") return 0;
  const parts = timemark.split(":").map(parseFloat);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return parseFloat(timemark) || 0;
};

// --------------------- IPC Handlers --------------------

ipcMain.handle("select-video", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      {
        name: "Video Files",
        extensions: ["mp4", "avi", "mkv", "mov", "flv", "wmv", "webm"],
      },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled) return { success: false, message: "Đã hủy chọn file" };

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  return { success: true, filePath, fileName };
});

ipcMain.handle("get-video-duration", async (event, inputPath) => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(inputPath, (err, metadata) => {
      if (err) {
        console.error("❌ Lỗi lấy duration:", err.message);
        resolve({ success: false, duration: 0, message: err.message });
      } else {
        const duration = Math.floor(metadata.format.duration);
        resolve({ success: true, duration });
      }
    });
  });
});

// Cắt nhiều đoạn - stream copy (không re-encode, rất nhanh)
ipcMain.handle(
  "trim-multiple-segments",
  async (event, { inputPath, segments }) => {
    return new Promise((resolve) => {
      const outputFolder = path.join(os.homedir(), "Downloads");
      const inputFileName = path.basename(inputPath, path.extname(inputPath));
      const safeName = inputFileName.replace(/[^a-zA-Z0-9_-]/g, "");

      if (!fs.existsSync(outputFolder))
        fs.mkdirSync(outputFolder, { recursive: true });

      const segmentsFolder = path.join(outputFolder, `${safeName}_segments`);
      if (!fs.existsSync(segmentsFolder))
        fs.mkdirSync(segmentsFolder, { recursive: true });

      const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
      const segmentProcessed = new Array(segments.length).fill(0);
      let completedSegments = 0;
      const totalSegments = segments.length;

      segments.forEach((segment, index) => {
        const outputPath = path.join(
          segmentsFolder,
          `segment_${index + 1}.mp4`,
        );

        ffmpeg(inputPath)
          .setStartTime(segment.startTime)
          .duration(segment.duration)
          .outputOptions([
            "-c:v copy",
            "-c:a copy",
            "-f mp4",
            "-movflags +faststart",
            "-y",
          ])
          .output(outputPath)
          .on("start", (cmd) =>
            console.log(`🎬 Segment ${index + 1}/${totalSegments}:`, cmd),
          )
          .on("progress", (prog) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              // Dùng timemark để biết đã encode bao nhiêu giây thực tế
              const processedSecs = timemarkToSeconds(prog.timemark);
              segmentProcessed[index] = Math.min(
                processedSecs,
                segment.duration,
              );
              const totalProcessed = segmentProcessed.reduce(
                (a, b) => a + b,
                0,
              );
              const percent = Math.min(
                (totalProcessed / totalDuration) * 100,
                99,
              );
              mainWindow.webContents.send("trim-progress", {
                percent,
                currentSegment: index + 1,
                totalSegments,
              });
            }
          })
          .on("end", () => {
            completedSegments++;
            segmentProcessed[index] = segment.duration;
            console.log(`✅ Segment ${index + 1} hoàn thành`);

            // Nếu tất cả đoạn đã xong
            if (completedSegments === totalSegments) {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("trim-progress", {
                  percent: 100,
                  currentSegment: totalSegments,
                  totalSegments,
                });
              }
              shell.openPath(segmentsFolder);
              resolve({
                success: true,
                message: `✅ Cắt ${totalSegments} đoạn thành công!`,
                outputFolder: segmentsFolder,
              });
            }
          })
          .on("error", (err) => {
            console.error(`❌ Lỗi segment ${index + 1}:`, err.message);
            resolve({
              success: false,
              message: `❌ Lỗi cắt segment ${index + 1}: ${err.message}`,
            });
          })
          .run();
      });
    });
  },
);

/**
 * XUẤT VIDEO THEO TỈ LỆ KHUNG HÌNH (16:9 hoặc 9:16) với blur background.
 *
 * === BUG FIX: Input seeking thay vì output seeking ===
 * Khi dùng .setStartTime() của fluent-ffmpeg, nó đặt -ss SAU -i (output seeking).
 * Với filter_complex, điều này khiến ffmpeg decode toàn bộ video từ đầu rồi mới skip.
 * Fix: tạo ffmpeg() không có input, rồi dùng .inputOptions(['-ss X']) TRƯỚC .input(path)
 * để -ss nằm trước -i → input seeking → seek nhanh, đúng thời điểm.
 *
 * === BUG FIX: Progress chính xác ===
 * progress.percent từ fluent-ffmpeg tính theo input bitrate, không phản ánh đúng
 * khi output có filter nặng. Dùng timemark (giây đã encode thực tế) để tính %.
 */
ipcMain.handle(
  "export-with-aspect-ratio",
  async (event, { inputPath, aspectRatio, segments }) => {
    return new Promise((resolve) => {
      let outW, outH;
      if (aspectRatio === "16:9") {
        outW = 1920;
        outH = 1080;
      } else if (aspectRatio === "9:16") {
        outW = 1080;
        outH = 1920;
      } else return resolve({ success: false, message: "Tỉ lệ không hợp lệ" });

      const outputFolder = path.join(os.homedir(), "Downloads");
      const inputFileName = path.basename(inputPath, path.extname(inputPath));
      const safeName = inputFileName.replace(/[^a-zA-Z0-9_-]/g, "");
      const ratioLabel = aspectRatio.replace(":", "x");

      if (!fs.existsSync(outputFolder))
        fs.mkdirSync(outputFolder, { recursive: true });

      const exportFolder = path.join(outputFolder, `${safeName}_${ratioLabel}`);
      if (!fs.existsSync(exportFolder))
        fs.mkdirSync(exportFolder, { recursive: true });

      // filter_complex: nền blur + video contain căn giữa
      const filterComplex =
        `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=increase,` +
        `crop=${outW}:${outH},boxblur=luma_radius=15:luma_power=2[bg];` +
        `[0:v]scale=${outW}:${outH}:force_original_aspect_ratio=decrease[fg];` +
        `[bg][fg]overlay=(W-w)/2:(H-h)/2[out]`;

      const exportList =
        segments && segments.length > 0
          ? segments.map((seg, i) => ({ ...seg, index: i, fullVideo: false }))
          : [{ startTime: 0, duration: null, index: 0, fullVideo: true }];

      const totalDuration = exportList.reduce(
        (sum, s) => sum + (s.duration || 0),
        0,
      );
      const itemProcessed = new Array(exportList.length).fill(0);
      let completed = 0;
      const total = exportList.length;
      let hasError = false;

      exportList.forEach(({ startTime, duration, index, fullVideo }) => {
        const outputPath = path.join(
          exportFolder,
          fullVideo
            ? `${safeName}_${ratioLabel}.mp4`
            : `segment_${index + 1}_${ratioLabel}.mp4`,
        );

        // ffmpeg(inputPath) — fluent-ffmpeg nhận input đúng cách.
        // addInputOption() inject flags TRƯỚC -i trong lệnh thực tế (input seeking).
        const cmd = ffmpeg(inputPath);

        if (!fullVideo && startTime > 0) {
          cmd.addInputOption(`-ss ${startTime}`);
        }
        if (!fullVideo && duration) {
          cmd.addInputOption(`-t ${duration}`);
        }

        cmd
          .complexFilter(filterComplex, "out")
          .outputOptions([
            "-map [out]", // Video từ filter
            "-map 0:a?", // Audio gốc (? = không lỗi nếu không có)
            "-c:v libx264",
            "-preset ultrafast",
            "-tune fastdecode",
            "-crf 26",
            "-threads 0",
            "-c:a aac",
            "-b:a 192k",
            "-pix_fmt yuv420p",
            "-movflags +faststart",
            "-y",
          ])
          .output(outputPath)
          .on("start", (cmdStr) => {
            console.log(
              `🎬 Xuất ${ratioLabel} [${index + 1}/${total}]:`,
              cmdStr,
            );
          })
          .on("progress", (prog) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              const processedSecs = timemarkToSeconds(prog.timemark);

              if (totalDuration > 0 && duration) {
                // Có segments với duration rõ ràng: tính theo tổng giây đã xử lý
                itemProcessed[index] = Math.min(processedSecs, duration);
                const totalProcessed = itemProcessed.reduce((a, b) => a + b, 0);
                const percent = Math.min(
                  (totalProcessed / totalDuration) * 100,
                  99,
                );
                mainWindow.webContents.send("export-progress", {
                  percent,
                  currentItem: index + 1,
                  totalItems: total,
                  timemark: prog.timemark,
                });
              } else {
                // Xuất cả file (không biết duration): hiển thị timemark trực tiếp
                const percent = Math.min(
                  ((completed + Math.min(processedSecs / 3600, 0.99)) / total) *
                    100,
                  99,
                );
                mainWindow.webContents.send("export-progress", {
                  percent,
                  currentItem: index + 1,
                  totalItems: total,
                  timemark: prog.timemark,
                });
              }
            }
          })
          .on("end", () => {
            completed++;
            if (duration) itemProcessed[index] = duration;
            console.log(`✅ Xuất xong [${index + 1}/${total}]`);

            if (completed === total && !hasError) {
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send("export-progress", {
                  percent: 100,
                  currentItem: total,
                  totalItems: total,
                });
              }
              shell.openPath(exportFolder);
              resolve({
                success: true,
                message: `✅ Xuất ${total} video (${aspectRatio}) thành công!`,
                outputFolder: exportFolder,
              });
            }
          })
          .on("error", (err) => {
            if (!hasError) {
              hasError = true;
              console.error(`❌ Lỗi xuất [${index + 1}]:`, err.message);
              resolve({
                success: false,
                message: `❌ Lỗi xuất video: ${err.message}`,
              });
            }
          })
          .run();
      });
    });
  },
);

// -------------------------------------------------------

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

const createMenu = () => {
  const template = [
    { label: "File", submenu: [{ label: "Exit", role: "quit" }] },
    {
      label: "View",
      submenu: [
        { label: "Reload", role: "reload" },
        { label: "DevTools", role: "toggleDevTools" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};
