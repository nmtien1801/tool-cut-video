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
    const listener = (event, data) => callback(data);
    ipcRenderer.on("trim-progress", listener);
    // Trả về hàm để gỡ bỏ listener này khi component unmount
    return () => ipcRenderer.removeListener("trim-progress", listener);
  },

  // Xuất video theo tỉ lệ khung hình (16:9 hoặc 9:16) với blur background
  exportWithAspectRatio: (data) => ipcRenderer.invoke("export-with-aspect-ratio", data),

  // Lắng nghe tiến độ xuất video theo tỉ lệ
  onExportProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("export-progress", listener);
    // Trả về hàm để gỡ bỏ listener này
    return () => ipcRenderer.removeListener("export-progress", listener);
  },
});