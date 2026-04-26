import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld("electron", {
  // Lấy thông tin Hardware Encoder (GPU) từ hệ thống
  detectHwEncoder: () => ipcRenderer.invoke("detect-hw-encoder"),

  // Chọn file video từ máy tính
  selectVideo: () => ipcRenderer.invoke("select-video"),

  // Lấy thời lượng (duration) của video
  getVideoDuration: (filePath) => ipcRenderer.invoke("get-video-duration", filePath),

  // Cắt nhanh video (Stream Copy - Không encode lại)
  trimMultipleSegments: (data) => ipcRenderer.invoke("trim-multiple-segments", data),

  // Lắng nghe tiến độ cắt video (nhận percent và eta)
  onTrimProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("trim-progress", listener);
    return () => ipcRenderer.removeListener("trim-progress", listener);
  },

  // Xuất video có Blur background (Có re-encode + GPU)
  exportWithAspectRatio: (data) => ipcRenderer.invoke("export-with-aspect-ratio", data),

  // Lắng nghe tiến độ xuất Blur (nhận percent và eta)
  onExportProgress: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on("export-progress", listener);
    return () => ipcRenderer.removeListener("export-progress", listener);
  },
});