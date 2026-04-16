import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld("electron", {
  // Cầu nối chung cho IPC
  ipcRenderer: {
    on: (channel, func) => {
      ipcRenderer.on(channel, (event, ...args) => func(...args));
    },
    once: (channel, func) => {
      ipcRenderer.once(channel, (event, ...args) => func(...args));
    },
    invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
    send: (channel, ...args) => ipcRenderer.send(channel, ...args),
  },

  // Khai báo rõ ràng các hàm để React gọi (Tránh lỗi undefined)
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getAppPath: () => ipcRenderer.invoke("get-app-path"),

  // Hàm mới để tải video YouTube
  getYoutubeInfo: (url) => ipcRenderer.invoke("get-youtube-info", url),
  downloadVideo: (url) => ipcRenderer.invoke("download-video", url),
});
