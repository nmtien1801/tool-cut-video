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

// Thiết lập cho fluent-ffmpeg
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

// --------------------- IPC Handlers --------------------

ipcMain.handle("select-video", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: [
      { name: "Video Files", extensions: ["mp4", "avi", "mkv", "mov", "flv", "wmv", "webm"] },
      { name: "All Files", extensions: ["*"] },
    ],
  });

  if (result.canceled) {
    return { success: false, message: "Đã hủy chọn file" };
  }

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  return { success: true, filePath, fileName };
});

ipcMain.handle("trim-video", async (event, inputPath) => {
  return new Promise((resolve) => {
    const outputFolder = path.join(os.homedir(), "Downloads");
    const inputFileName = path.basename(inputPath, path.extname(inputPath));
    // Xóa ký tự đặc biệt từ tên file
    const safeName = inputFileName.replace(/[^a-zA-Z0-9_-]/g, "");
    const outputPath = path.join(outputFolder, `${safeName}_2min.mp4`);

    if (!fs.existsSync(outputFolder)) {
      fs.mkdirSync(outputFolder, { recursive: true });
    }

    console.log("📝 Input file:", inputPath);
    console.log("📝 Output file:", outputPath);

    ffmpeg(inputPath)
      .setStartTime("00:00:00")
      .duration(120)
      .outputOptions([
        "-c:v copy",
        "-c:a copy",
        "-f mp4",
        "-movflags +faststart",
        "-y"
      ])
      .output(outputPath)
      .on("start", (cmd) => {
        console.log("🎬 FFmpeg Command:", cmd);
      })
      .on("progress", (progress) => {
        console.log(`⏳ Progress: ${progress.percent?.toFixed(2) || 0}%`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("trim-progress", {
            percent: progress.percent || 0,
          });
        }
      })
      .on("end", () => {
        console.log("✅ Cắt video thành công!");
        shell.openPath(outputFolder);
        resolve({
          success: true,
          message: "✅ Cắt video thành công!",
          outputPath,
        });
      })
      .on("error", (err) => {
        console.error("❌ FFmpeg Error:", err.message);
        resolve({
          success: false,
          message: `❌ Lỗi: ${err.message}`,
        });
      })
      .run();
  });
});

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