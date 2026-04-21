import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../index.css';

function Dashboard() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [segmentCount, setSegmentCount] = useState(2);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);

  // Gộp Option: Tỉ lệ khung hình
  const [aspectRatio, setAspectRatio] = useState('original'); // 'original' | '16:9' | '9:16'

  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    // Lắng nghe chung cho cả cắt thường và xuất tỉ lệ
    const removeTrimListener = window.electron.onTrimProgress((data) => {
      setProgress(Math.round(data.percent || 0));
    });
    const removeExportListener = window.electron.onExportProgress((data) => {
      setProgress(Math.round(data.percent || 0));
    });
    return () => {
      removeTrimListener();
      removeExportListener();
    };
  }, []);

  const handleSelectFile = async () => {
    setLoading(true);
    const res = await window.electron.selectVideo();
    if (res.success) {
      setSelectedFile({ filePath: res.filePath, fileName: res.fileName });
      const normalized = res.filePath.replace(/\\/g, '/');
      setVideoPreviewUrl(`file:///${normalized}`);
      const durationRes = await window.electron.getVideoDuration(res.filePath);
      if (durationRes.success) {
        setVideoDuration(durationRes.duration);
        initializeSegments(segmentCount, durationRes.duration);
      }
    }
    setLoading(false);
  };

  const initializeSegments = (count, duration) => {
    const segmentDuration = Math.floor(duration / count);
    const newSegments = Array.from({ length: count }, (_, i) => ({
      id: i,
      startTime: i * segmentDuration,
      duration: i === count - 1 ? duration - (i * segmentDuration) : segmentDuration,
    }));
    setSegments(newSegments);
  };

  const handleAction = async () => {
    if (!selectedFile || !segments.length) return;
    setProcessing(true);
    setProgress(0);

    let res;
    if (aspectRatio === 'original') {
      // Cắt nhanh (Stream copy)
      res = await window.electron.trimMultipleSegments({
        inputPath: selectedFile.filePath,
        segments: segments,
      });
    } else {
      // Xuất có tỉ lệ (Re-encode + Blur background)
      res = await window.electron.exportWithAspectRatio({
        inputPath: selectedFile.filePath,
        aspectRatio: aspectRatio,
        segments: segments,
      });
    }

    if (res.success) alert(res.message);
    else alert(res.message);
    setProcessing(false);
  };

  const formatTime = (s) => new Date(s * 1000).toISOString().substr(11, 8);
  const isValidSegments = () => segments.length > 0 && segments.reduce((sum, s) => sum + s.duration, 0) <= videoDuration;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-10">
        <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">CREATIMIC STUDIO</h1>
        <button onClick={() => { logout(); navigate('/login'); }} className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-5 py-2 rounded-lg transition-all border border-red-500/50">Đăng Xuất</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mx-auto">
        {/* Cột trái: Media */}
        <div className="space-y-6">
          <button onClick={handleSelectFile} disabled={processing} className="w-full py-8 border-2 border-dashed border-slate-700 rounded-2xl hover:border-blue-500 transition-all text-slate-400 hover:text-blue-400 font-bold">
            {selectedFile ? `✅ ${selectedFile.fileName}` : "📁 Kéo thả hoặc Chọn Video"}
          </button>
          
          {selectedFile && (
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
              <video src={videoPreviewUrl} controls className="w-full rounded-xl bg-black mb-4 shadow-2xl" />
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Thời lượng gốc:</span>
                <span className="text-green-400 font-mono">{formatTime(videoDuration)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Cột phải: Cấu hình */}
        <div className="space-y-6">
          <h2 className="text-xl font-bold text-slate-300">Cấu hình Cắt & Xuất</h2>
          
          <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-6">
            {/* Tùy chọn tỉ lệ khung hình */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tỉ lệ đầu ra</label>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  { id: 'original', label: 'Gốc', sub: 'Cắt nhanh' },
                  { id: '16:9', label: '16 : 9', sub: 'Ngang' },
                  { id: '9:16', label: '9 : 16', sub: 'Dọc' }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setAspectRatio(item.id)}
                    className={`p-3 rounded-xl border-2 transition-all text-left ${aspectRatio === item.id ? 'border-blue-500 bg-blue-500/10' : 'border-slate-700 bg-slate-900/50'}`}
                  >
                    <div className={`font-bold ${aspectRatio === item.id ? 'text-blue-400' : 'text-slate-400'}`}>{item.label}</div>
                    <div className="text-[10px] text-slate-500">{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Số lượng đoạn */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Số đoạn muốn cắt:</span>
              <input type="number" value={segmentCount} onChange={(e) => {setSegmentCount(e.target.value); initializeSegments(e.target.value, videoDuration);}} className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-2 text-center" />
            </div>

            {/* List Segments */}
            <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {segments.map((seg, idx) => (
                <div key={seg.id} className="grid grid-cols-2 gap-4 bg-slate-900/80 p-3 rounded-xl border border-slate-700">
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase">Bắt đầu (s)</label>
                    <input type="number" value={seg.startTime} onChange={(e) => handleSegmentChange(seg.id, 'startTime', e.target.value)} className="w-full bg-transparent font-mono text-blue-400 focus:outline-none" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 uppercase">Thời lượng (s)</label>
                    <input type="number" value={seg.duration} onChange={(e) => handleSegmentChange(seg.id, 'duration', e.target.value)} className="w-full bg-transparent font-mono text-purple-400 focus:outline-none" />
                  </div>
                </div>
              ))}
            </div>

            {/* Nút thực hiện chính */}
            <button
              onClick={handleAction}
              disabled={!selectedFile || !isValidSegments() || processing}
              className="w-full py-5 rounded-2xl font-black text-lg shadow-xl transition-all disabled:opacity-50 disabled:grayscale
                bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-blue-500/20"
            >
              {processing ? `ĐANG XỬ LÝ... ${progress}%` : `BẮT ĐẦU XUẤT (${aspectRatio.toUpperCase()})`}
            </button>

            {processing && (
              <div className="w-full h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;