import React, { useState, useEffect } from 'react';
import './index.css';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [trimming, setTrimming] = useState(false);
  const [progress, setProgress] = useState(0);

  // Lắng nghe tiến độ cắt video
  useEffect(() => {
    window.electron.onTrimProgress((data) => {
      setProgress(Math.round(data.percent || 0));
    });
  }, []);

  const handleSelectFile = async () => {
    setLoading(true);
    const res = await window.electron.selectVideo();
    if (res.success) {
      setSelectedFile({
        filePath: res.filePath,
        fileName: res.fileName,
      });
    } else {
      alert(res.message);
    }
    setLoading(false);
  };

  const handleTrimVideo = async () => {
    if (!selectedFile) {
      alert("Vui lòng chọn file video trước");
      return;
    }

    setTrimming(true);
    setProgress(0);
    const res = await window.electron.trimVideo(selectedFile.filePath);
    
    if (res.success) {
      alert(res.message);
      setSelectedFile(null);
      setProgress(0);
    } else {
      alert(res.message);
    }
    setTrimming(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col items-center justify-center p-10">
      {/* Header */}
      <div className="mb-16 text-center">
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-3">
          🎬 VIDEO TRIMMER
        </h1>
        <p className="text-slate-400 text-lg">Cắt 2 phút đầu từ video của bạn</p>
      </div>

      {/* Main Container */}
      <div className="w-full max-w-2xl">
        {/* Step 1: Select File */}
        <div className="bg-slate-800 border-2 border-slate-700 rounded-2xl p-8 mb-6 hover:border-blue-500 transition-colors">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
              1
            </div>
            <h2 className="text-2xl font-bold">Chọn Video</h2>
          </div>
          
          <button
            onClick={handleSelectFile}
            disabled={loading || trimming}
            className="w-full py-6 px-8 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-blue-500/50 disabled:shadow-none"
          >
            {loading ? "⏳ Đang chọn..." : selectedFile ? "✅ Đã chọn: " + selectedFile.fileName : "📁 Chọn File Video"}
          </button>

          {selectedFile && (
            <div className="mt-4 p-4 bg-slate-700 rounded-lg">
              <p className="text-sm text-slate-300">
                <span className="font-semibold">Đường dẫn:</span><br />
                <span className="text-blue-400 break-all text-xs">{selectedFile.filePath}</span>
              </p>
            </div>
          )}
        </div>

        {/* Step 2: Trim Video */}
        <div className={`bg-slate-800 border-2 rounded-2xl p-8 transition-colors ${selectedFile ? 'border-purple-500 hover:border-purple-400' : 'border-slate-700'}`}>
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-lg">
              2
            </div>
            <h2 className="text-2xl font-bold">Cắt Video (2 phút)</h2>
          </div>

          <button
            onClick={handleTrimVideo}
            disabled={!selectedFile || trimming}
            className="w-full py-6 px-8 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-700 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-purple-500/50 disabled:shadow-none"
          >
            {trimming ? `🚀 Đang cắt... ${progress}%` : selectedFile ? "🎬 Cắt Video" : "⛔ Chọn Video Trước"}
          </button>

          {/* Progress Bar */}
          {trimming && (
            <div className="mt-6">
              <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-center mt-2 text-sm text-slate-400">
                Tiến độ: <span className="text-purple-400 font-bold">{progress}%</span>
              </p>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="mt-8 bg-slate-800 border border-slate-700 rounded-xl p-6">
          <div className="flex gap-3">
            <span className="text-2xl">ℹ️</span>
            <div>
              <h3 className="font-bold mb-2">Cách hoạt động</h3>
              <ul className="text-sm text-slate-400 space-y-1">
                <li>✓ Chọn file video từ máy tính</li>
                <li>✓ Ứng dụng sẽ trích xuất 2 phút đầu</li>
                <li>✓ Video được lưu tại: <span className="text-blue-400">Downloads</span></li>
                <li>✓ Tên file: <span className="text-blue-400">original_2min.mp4</span></li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;