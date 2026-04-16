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

  // Chọn file video
  selectVideo: () => ipcRenderer.invoke("select-video"),
  
  // Lấy duration video
  getVideoDuration: (filePath) => ipcRenderer.invoke("get-video-duration", filePath),
  
  // Cắt nhiều đoạn video
  trimMultipleSegments: (data) => ipcRenderer.invoke("trim-multiple-segments", data),
  
  // Lắng nghe tiến độ cắt video
  onTrimProgress: (callback) => {
    ipcRenderer.on("trim-progress", (event, data) => callback(data));
  },
});
