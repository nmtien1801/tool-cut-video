import { app, BrowserWindow, Menu, ipcMain, shell } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";
import fs from "fs";
import { create as createYoutubeDl } from "youtube-dl-exec"; // Thư viện mới

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

// Đường dẫn tới file yt-dlp.exe
// Khi dev: lấy trong /resources/
// Khi build: Electron sẽ bỏ nó vào /resources/ của bản cài đặt
const ytdlpPath = isDev 
  ? path.join(__dirname, "../resources/yt-dlp.exe")
  : path.join(process.resourcesPath, "yt-dlp.exe");

const ytdlp = createYoutubeDl(ytdlpPath);

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

// 1. Lấy thông tin video (Dùng yt-dlp để lấy info cực nhanh)
ipcMain.handle("get-youtube-info", async (event, url) => {
  try {
    console.log("Đang gọi yt-dlp tại:", ytdlpPath);
    const info = await ytdlp(url, {
      dumpSingleJson: true,
      noWarnings: true,
    });
    
    return {
      success: true,
      title: info.title,
      thumbnail: info.thumbnail,
      author: info.uploader,
    };
  } catch (err) {
    return { success: false, message: "Không thể lấy thông tin video" };
  }
});

// 2. Tải video (yt-dlp tự động gộp audio + video chất lượng cao nhất)
ipcMain.handle("download-video", async (event, url) => {
  try {
    const downloadFolder = path.join(os.homedir(), "Downloads");
    
    // Lệnh tải của yt-dlp
    await ytdlp(url, {
      output: path.join(downloadFolder, "%(title)s.%(ext)s"),
      format: "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best",
      noCheckCertificates: true,
    });

    shell.openPath(downloadFolder); // Mở thư mục Downloads sau khi xong
    return { success: true };
  } catch (err) {
    console.error("Lỗi tải:", err);
    return { success: false, message: "YouTube đã chặn hoặc lỗi định dạng" };
  }
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