import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  // Lấy thông tin Hardware Encoder (GPU) từ hệ thống[cite: 3]
  detectHwEncoder: () => ipcRenderer.invoke("detect-hw-encoder"),

  // Chọn file video từ máy tính[cite: 3]
  selectVideo: () => ipcRenderer.invoke("select-video"),

  // Lấy thời lượng (duration) của video[cite: 3]
  getVideoDuration: (filePath) => ipcRenderer.invoke("get-video-duration", filePath),

  // Cắt nhanh video[cite: 3]
  trimMultipleSegments: (data) => ipcRenderer.invoke("trim-multiple-segments", data),

  // Lắng nghe tiến độ cắt video (percent, eta)[cite: 3]
  onTrimProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("trim-progress", listener);
    return () => ipcRenderer.removeListener("trim-progress", listener);
  },

  // Xuất video theo tỉ lệ khung hình (Blur background)[cite: 3]
  exportWithAspectRatio: (data) => ipcRenderer.invoke("export-with-aspect-ratio", data),

  // Lắng nghe tiến độ xuất video (percent, eta)[cite: 3]
  onExportProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("export-progress", listener);
    return () => ipcRenderer.removeListener("export-progress", listener);
  },

  // Lắng nghe tiến độ xử lý phụ đề & dịch tự động
  onSubtitleProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("subtitle-progress", listener);
    return () => ipcRenderer.removeListener("subtitle-progress", listener);
  },
});