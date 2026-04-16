import React, { useState } from 'react';
import './index.css';

function App() {
  const [url, setUrl] = useState('');
  const [videoData, setVideoData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const fetchInfo = async () => {
    if (!url) return;
    setLoading(true);
    const res = await window.electron.getYoutubeInfo(url);
    if (res.success) setVideoData(res);
    else alert(res.message);
    setLoading(false);
  };

  const download = async () => {
    setDownloading(true);
    const res = await window.electron.downloadVideo(url);
    if (res.success) alert("Đã tải xong vào thư mục Downloads!");
    else alert("Lỗi: " + res.message);
    setDownloading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center p-10">
      <h1 className="text-4xl font-black text-red-500 mb-10 tracking-tighter">CMIC YT DOWNLOADER</h1>

      <div className="w-full max-w-2xl flex gap-2 mb-8">
        <input
          className="flex-1 bg-slate-800 border border-slate-700 p-4 rounded-xl focus:ring-2 ring-red-500 outline-none"
          placeholder="Dán link YouTube tại đây..."
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button onClick={fetchInfo} disabled={loading} className="bg-red-600 px-8 rounded-xl font-bold hover:bg-red-700">
          {loading ? "Đang tìm..." : "Kiểm tra"}
        </button>
      </div>

      {videoData && (
        <div className="bg-slate-800 p-6 rounded-3xl w-full max-w-md shadow-2xl border border-slate-700">
          <img src={videoData.thumbnail} className="w-full rounded-2xl mb-4 shadow-lg" />
          <h2 className="text-xl font-bold line-clamp-2 mb-1">{videoData.title}</h2>
          <p className="text-slate-400 text-sm mb-6">Kênh: {videoData.author}</p>
          <button
            onClick={download}
            disabled={downloading}
            className="w-full bg-green-600 py-4 rounded-2xl font-black text-lg hover:bg-green-700 transition-all shadow-lg"
          >
            {downloading ? "🚀 ĐANG TẢI XUỐNG..." : "📥 TẢI VIDEO NGAY"}
          </button>
        </div>
      )}
    </div>
  );
}

export default App;