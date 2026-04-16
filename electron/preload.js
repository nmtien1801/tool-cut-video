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

  // Hàm để chọn file video
  selectVideo: () => ipcRenderer.invoke("select-video"),
  
  // Hàm để cắt video 2 phút đầu
  trimVideo: (filePath) => ipcRenderer.invoke("trim-video", filePath),
  
  // Lắng nghe sự kiện tiến độ cắt video
  onTrimProgress: (callback) => {
    ipcRenderer.on("trim-progress", (event, data) => callback(data));
  },
});
