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
  const [etaSeconds, setEtaSeconds] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [aspectRatio, setAspectRatio] = useState('original');
  const [encoderName, setEncoderName] = useState('đang kiểm tra...');

  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    // Kiểm tra GPU ngay khi vào Dashboard
    window.electron.detectHwEncoder().then(enc => setEncoderName(enc));

    // Đăng ký lắng nghe tiến độ từ Backend
    const removeTrimListener = window.electron.onTrimProgress((data) => {
      setProgress(Math.round(data.percent || 0));
      if (data.eta !== undefined) setEtaSeconds(data.eta);
    });
    const removeExportListener = window.electron.onExportProgress((data) => {
      setProgress(Math.round(data.percent || 0));
      if (data.eta !== undefined) setEtaSeconds(data.eta);
    });

    return () => {
      removeTrimListener?.();
      removeExportListener?.();
    };
  }, []);

  const handleSelectFile = async () => {
    setLoading(true);
    try {
      const res = await window.electron.selectVideo();
      if (res?.success) {
        setSelectedFile({ filePath: res.filePath, fileName: res.fileName });
        const normalized = res.filePath.replace(/\\/g, '/');
        setVideoPreviewUrl(`file:///${normalized}`);
        const durationRes = await window.electron.getVideoDuration(res.filePath);
        if (durationRes?.success) {
          setVideoDuration(durationRes.duration);
          initializeSegments(segmentCount, durationRes.duration);
        }
      }
    } catch (err) {
      console.error("Lỗi chọn file:", err);
    } finally {
      setLoading(false);
    }
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

  const handleSegmentChange = (id, field, value) => {
    setSegments(prev => prev.map(seg => seg.id === id ? { ...seg, [field]: parseInt(value) || 0 } : seg));
  };

  const handleSegmentCountChange = (e) => {
    const count = e.target.value;
    setSegmentCount(count);
    if (videoDuration > 0) initializeSegments(count, videoDuration);
  };

  const formatTime = (s) => {
    if (!s && s !== 0) return '00:00:00';
    const res = new Date(s * 1000).toISOString().substr(11, 8);
    return res;
  };

  const handleAction = async () => {
    if (!selectedFile || processing) return;
    setProcessing(true);
    setProgress(0);
    setEtaSeconds(null);

    const payload = { inputPath: selectedFile.filePath, aspectRatio, segments };
    const res = (aspectRatio === 'original')
      ? await window.electron.trimMultipleSegments(payload)
      : await window.electron.exportWithAspectRatio(payload);

    alert(res.message);
    setProcessing(false);
  };

  const totalSegDuration = segments.reduce((sum, s) => sum + (s.duration || 0), 0);
  const isOverDuration = totalSegDuration > videoDuration;
  const isGpu = encoderName !== "libx264" && !encoderName.includes("kiểm tra");

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8 font-sans">
      {/* Header & GPU Badge */}
      <div className="max-w-6xl mx-auto flex items-center mb-10">
        <h1 className="text-3xl font-black text-blue-500 mr-auto">CUT VIDEO PRO</h1>
        <div className={`mr-4 px-4 py-1.5 rounded-lg border text-xs font-bold transition-all ${isGpu ? 'bg-purple-500/20 border-purple-500/50 text-purple-400' : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}>
          {isGpu ? `⚡ GPU: ${encoderName.toUpperCase()}` : `🖥 CPU: LIBX264`}
        </div>
        <button onClick={() => { logout(); navigate('/login'); }} className="text-red-400 border border-red-500/50 px-4 py-1.5 rounded-lg hover:bg-red-500 hover:text-white transition-all">Đăng Xuất</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mx-auto">
        {/* Left Panel: Preview */}
        <div className="space-y-6">
          <button onClick={handleSelectFile} disabled={processing} className="w-full py-12 border-2 border-dashed border-slate-700 rounded-2xl hover:border-blue-500 text-slate-500 font-bold disabled:opacity-50">
            {selectedFile ? `✅ ${selectedFile.fileName}` : '📁 CHỌN VIDEO ĐẦU VÀO'}
          </button>
          {selectedFile && (
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-xl">
              <video src={videoPreviewUrl} controls className="w-full rounded-xl bg-black mb-4" style={{ maxHeight: '320px' }} />
              <div className="flex justify-between text-sm font-mono text-slate-400">
                <span>THỜI LƯỢNG GỐC:</span>
                <span className="text-blue-400">{formatTime(videoDuration)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel: Settings */}
        <div className="space-y-6">
          <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-6">
            {/* Ratio Selection */}
            <div className="grid grid-cols-3 gap-3">
              {['original', '16:9', '9:16'].map(r => (
                <button key={r} onClick={() => setAspectRatio(r)} className={`p-3 rounded-xl border-2 transition-all ${aspectRatio === r ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-700 text-slate-500'}`}>
                  <div className="font-bold uppercase text-xs">{r === 'original' ? 'Gốc (Cắt)' : r}</div>
                </button>
              ))}
            </div>

            {/* Segments Config */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-400 uppercase">Số đoạn:</span>
              <input type="number" value={segmentCount} onChange={handleSegmentCountChange} className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-center" />
            </div>

            <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
              {segments.map((seg, idx) => (
                <div key={seg.id} className="grid grid-cols-2 gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-700">
                  <input type="number" value={seg.startTime} onChange={(e) => handleSegmentChange(seg.id, 'startTime', e.target.value)} className="bg-transparent text-blue-400 text-sm font-mono" />
                  <input type="number" value={seg.duration} onChange={(e) => handleSegmentChange(seg.id, 'duration', e.target.value)} className="bg-transparent text-purple-400 text-sm font-mono text-right" />
                </div>
              ))}
            </div>

            {/* Action Button & Progress */}
            <button onClick={handleAction} disabled={!selectedFile || isOverDuration || processing} className="w-full py-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 transition-all shadow-lg shadow-blue-900/20">
              {processing ? `ĐANG XỬ LÝ...` : `🚀 XUẤT VIDEO`}
            </button>

            {processing && (
              <div className="space-y-2">
                <div className="w-full h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <div className="flex justify-between text-xs font-mono text-slate-500">
                  <span>{progress}%</span>
                  <span>{etaSeconds > 0 ? `CÒN LẠI: ~${formatTime(etaSeconds)}` : 'ĐANG KHỞI TẠO...'}</span>
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