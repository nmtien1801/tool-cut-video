import { app, BrowserWindow, Menu, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os'; // CẦN THÊM DÒNG NÀY

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !app.isPackaged;

let mainWindow;

const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
} else {
  app.on('second-instance', () => {
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
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`;

  mainWindow.loadURL(startUrl);
  if (isDev) mainWindow.webContents.openDevTools();
  mainWindow.on('closed', () => { mainWindow = null; });
};

app.on('ready', async () => {
  if (isDev) {
    try {
      const waitOn = (await import('wait-on')).default;
      await waitOn({ resources: ['http://localhost:5173'], timeout: 5000 });
    } catch (error) {
      console.warn('Vite dev server chưa sẵn sàng...');
    }
  }
  createWindow();
  createMenu();
});

// --- IPC Handlers (PHẦN QUAN TRỌNG ĐÃ BỔ SUNG) ---

// 1. Handler lấy thông tin hệ thống (Khớp với preload.js)
ipcMain.handle('get-os-info', () => {
  return {
    platform: os.platform(), // win32, linux, darwin...
    mem: (os.totalmem() / 1024 / 1024 / 1024).toFixed(2) + " GB", // Tính dung lượng RAM
    user: os.hostname() // Tên máy tính
  };
});

// 2. Các handler khác của bạn
ipcMain.handle('get-app-version', () => app.getVersion());
ipcMain.handle('get-app-path', () => app.getAppPath());
ipcMain.handle('ping', () => 'pong từ Node.js');

// --- Kết thúc IPC Handlers ---

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

const createMenu = () => {
  const template = [
    { label: 'File', submenu: [{ label: 'Exit', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() }] },
    { label: 'View', submenu: [{ label: 'DevTools', accelerator: 'F12', click: () => mainWindow.webContents.toggleDevTools() }] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};