import { app, BrowserWindow, Menu, ipcMain, shell, dialog } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

// Cấu hình FFmpeg
const ffmpegPath = process.platform === "win32" 
  ? path.join(__dirname, "../resources/ffmpeg.exe")
  : "ffmpeg";
const ffprobePath = process.platform === "win32"
  ? path.join(__dirname, "../resources/ffprobe.exe")
  : "ffprobe";

// Nếu FFmpeg không tồn tại, sử dụng ffmpeg từ PATH
if (!fs.existsSync(ffmpegPath)) {
  // ffmpeg sẽ tìm từ system PATH
} else {
  ffmpeg.setFfmpegPath(ffmpegPath);
  ffmpeg.setFfprobePath(ffprobePath);
}

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
  // Chỉ mở DevTools khi dev
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

// 1. Chọn file video từ máy tính
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
  
  console.log("✅ Chọn file video:", filePath);

  return { success: true, filePath, fileName };
});

// 2. Cắt video 2 phút đầu
ipcMain.handle("trim-video", async (event, inputPath) => {
  return new Promise((resolve) => {
    const outputFolder = path.join(os.homedir(), "Downloads");
    const inputFileName = path.basename(inputPath, path.extname(inputPath));
    const outputPath = path.join(outputFolder, `${inputFileName}_2min.mp4`);

    console.log("🚀 Bắt đầu cắt video...");
    console.log("Input:", inputPath);
    console.log("Output:", outputPath);

    ffmpeg(inputPath)
      .setStartTime("00:00:00")
      .duration(120) // 2 phút = 120 giây
      .output(outputPath)
      .on("start", (cmd) => {
        console.log("🎬 FFmpeg command:", cmd);
      })
      .on("progress", (progress) => {
        console.log(`⏳ Tiến độ: ${progress.percent?.toFixed(2) || 0}%`);
        // Có thể gửi tiến độ cho frontend nếu cần
        mainWindow.webContents.send("trim-progress", {
          percent: progress.percent || 0,
        });
      })
      .on("end", () => {
        console.log("✅ Cắt video thành công!");
        shell.openPath(outputFolder);
        resolve({
          success: true,
          message: "✅ Cắt video thành công! Đã mở thư mục Downloads.",
          outputPath,
        });
      })
      .on("error", (err) => {
        console.error("❌ Lỗi cắt video:", err.message);
        resolve({
          success: false,
          message: `❌ Lỗi: ${err.message}`,
        });
      })
      .save();
  });
});

// --------------------- Kết thúc IPC Handlers --------------------

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
        { label: "DevTools", role: "toggleDevTools", accelerator: "F12" },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};