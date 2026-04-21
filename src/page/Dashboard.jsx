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
  const [timemark, setTimemark] = useState(''); // Hiển thị thời gian thực khi xuất full video
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);

  const [aspectRatio, setAspectRatio] = useState('original'); // 'original' | '16:9' | '9:16'

  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const removeTrimListener = window.electron.onTrimProgress((data) => {
      setProgress(Math.round(data.percent || 0));
      if (data.timemark) setTimemark(data.timemark);
    });
    const removeExportListener = window.electron.onExportProgress((data) => {
      setProgress(Math.round(data.percent || 0));
      if (data.timemark) setTimemark(data.timemark);
    });
    return () => {
      removeTrimListener?.();
      removeExportListener?.();
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
    const c = Math.max(1, parseInt(count) || 1);
    const segmentDuration = Math.floor(duration / c);
    const newSegments = Array.from({ length: c }, (_, i) => ({
      id: i,
      startTime: i * segmentDuration,
      duration: i === c - 1 ? duration - i * segmentDuration : segmentDuration,
    }));
    setSegments(newSegments);
  };

  // FIX: hàm này bị thiếu trong phiên bản trước
  const handleSegmentChange = (id, field, value) => {
    setSegments(prev =>
      prev.map(seg =>
        seg.id === id ? { ...seg, [field]: parseInt(value) || 0 } : seg
      )
    );
  };

  const handleSegmentCountChange = (e) => {
    const count = e.target.value;
    setSegmentCount(count);
    if (videoDuration > 0) initializeSegments(count, videoDuration);
  };

  const getTotalDuration = () => segments.reduce((sum, s) => sum + (s.duration || 0), 0);

  const isValidSegments = () =>
    segments.length > 0 &&
    segments.every(s => s.duration > 0) &&
    getTotalDuration() <= videoDuration;

  const handleAction = async () => {
    if (!selectedFile || !isValidSegments()) return;
    setProcessing(true);
    setProgress(0);
    setTimemark('');

    let res;
    if (aspectRatio === 'original') {
      res = await window.electron.trimMultipleSegments({
        inputPath: selectedFile.filePath,
        segments,
      });
    } else {
      res = await window.electron.exportWithAspectRatio({
        inputPath: selectedFile.filePath,
        aspectRatio,
        segments,
      });
    }

    alert(res.message);
    setProcessing(false);
    setProgress(0);
    setTimemark('');
  };

  const formatTime = (s) => {
    if (!s && s !== 0) return '00:00:00';
    return new Date(s * 1000).toISOString().substr(11, 8);
  };

  const totalSegDuration = getTotalDuration();
  const isOverDuration = totalSegDuration > videoDuration;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto flex justify-between items-center mb-10">
        <h1 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-500">
          CREATIMIC STUDIO
        </h1>
        <button
          onClick={handleLogout}
          className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-5 py-2 rounded-lg transition-all border border-red-500/50"
        >
          Đăng Xuất
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mx-auto">

        {/* Cột trái: Media */}
        <div className="space-y-6">
          <button
            onClick={handleSelectFile}
            disabled={processing || loading}
            className="w-full py-8 border-2 border-dashed border-slate-700 rounded-2xl hover:border-blue-500 transition-all text-slate-400 hover:text-blue-400 font-bold disabled:opacity-50"
          >
            {loading
              ? '⏳ Đang chọn...'
              : selectedFile
                ? `✅ ${selectedFile.fileName}`
                : '📁 Kéo thả hoặc Chọn Video'}
          </button>

          {selectedFile && (
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700">
              <video
                src={videoPreviewUrl}
                controls
                className="w-full rounded-xl bg-black mb-4 shadow-2xl"
                style={{ maxHeight: '300px' }}
              />
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

            {/* Tỉ lệ đầu ra */}
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tỉ lệ đầu ra</label>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  { id: 'original', label: 'Gốc', sub: 'Cắt nhanh' },
                  { id: '16:9', label: '16 : 9', sub: 'Ngang (YouTube)' },
                  { id: '9:16', label: '9 : 16', sub: 'Dọc (Reels/TikTok)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setAspectRatio(item.id)}
                    disabled={processing}
                    className={`p-3 rounded-xl border-2 transition-all text-left disabled:opacity-50 ${aspectRatio === item.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-900/50 hover:border-slate-500'
                      }`}
                  >
                    <div className={`font-bold text-sm ${aspectRatio === item.id ? 'text-blue-400' : 'text-slate-400'}`}>
                      {item.label}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.sub}</div>
                  </button>
                ))}
              </div>
              {aspectRatio !== 'original' && (
                <p className="text-xs text-slate-500 mt-2">
                  ✨ Video sẽ được <span className="text-yellow-400">contain</span> trong khung — phần trống lấp bằng <span className="text-yellow-400">blur</span>
                </p>
              )}
            </div>

            {/* Số lượng đoạn */}
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-slate-300">Số đoạn muốn cắt:</span>
              <input
                type="number"
                min="1"
                max="20"
                value={segmentCount}
                onChange={handleSegmentCountChange}
                disabled={processing || !selectedFile}
                className="w-20 bg-slate-900 border border-slate-700 rounded-lg p-2 text-center text-white disabled:opacity-50"
              />
            </div>

            {/* Thông tin tổng duration */}
            {segments.length > 0 && (
              <div className={`flex justify-between text-xs px-3 py-2 rounded-lg border ${isOverDuration
                ? 'bg-red-900/30 border-red-600 text-red-400'
                : 'bg-green-900/20 border-green-800 text-green-400'
                }`}>
                <span>Tổng thời gian cắt: <strong>{formatTime(totalSegDuration)}</strong></span>
                <span>Video gốc: <strong>{formatTime(videoDuration)}</strong></span>
              </div>
            )}

            {/* List Segments */}
            {segments.length > 0 && (
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {segments.map((seg, idx) => (
                  <div
                    key={seg.id}
                    className="grid grid-cols-2 gap-3 bg-slate-900/80 p-3 rounded-xl border border-slate-700"
                  >
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                        Đoạn {idx + 1} — Bắt đầu (s)
                      </label>
                      <input
                        type="number"
                        min="0"
                        max={videoDuration}
                        value={seg.startTime}
                        onChange={(e) => handleSegmentChange(seg.id, 'startTime', e.target.value)}
                        disabled={processing}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 font-mono text-blue-400 text-sm disabled:opacity-50"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-slate-500 uppercase tracking-wider">
                        Thời lượng (s)
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={seg.duration}
                        onChange={(e) => handleSegmentChange(seg.id, 'duration', e.target.value)}
                        disabled={processing}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 font-mono text-purple-400 text-sm disabled:opacity-50"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Nút thực hiện */}
            <button
              onClick={handleAction}
              disabled={!selectedFile || !isValidSegments() || processing || isOverDuration}
              className="w-full py-5 rounded-2xl font-black text-lg shadow-xl transition-all disabled:opacity-40 disabled:grayscale
                bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 shadow-blue-500/20"
            >
              {processing
                ? `⚙️ ĐANG XỬ LÝ... ${progress}%`
                : !selectedFile
                  ? 'Chọn video trước'
                  : isOverDuration
                    ? '⚠️ Tổng đoạn vượt quá thời lượng'
                    : `🚀 BẮT ĐẦU XUẤT (${aspectRatio.toUpperCase()})`}
            </button>

            {/* Progress bar + timemark */}
            {processing && (
              <div className="space-y-2">
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-400 to-purple-500 transition-all duration-300 ease-out"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{progress}%</span>
                  {timemark && (
                    <span className="font-mono text-slate-400">
                      ⏱ {timemark.split('.')[0]} {/* Chỉ hiển thị HH:MM:SS, bỏ milliseconds */}
                    </span>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;