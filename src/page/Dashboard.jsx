import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../index.css';

const SUBTITLE_STAGE_LABELS = {
  'extracting-audio': 'Đang tách âm thanh...',
  'loading-model': 'Đang tải mô hình AI (chỉ lần đầu, có thể mất vài phút)...',
  'transcribing': 'Đang nhận diện giọng nói...',
  'translating': 'Đang dịch phụ đề...',
  'subtitle-done': 'Đã tạo xong phụ đề, đang xử lý video...',
};

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

  // --- Cấu hình tự động phiên dịch (Mặc định: Tiếng Việt) ---
  const [enableAutoSub, setEnableAutoSub] = useState(false);
  const [sourceLang, setSourceLang] = useState('vi');
  const [targetLang, setTargetLang] = useState('vi');
  const [enableSubtitleBg, setEnableSubtitleBg] = useState(true);

  // --- Trạng thái tiến độ tạo phụ đề ---
  const [subtitleStage, setSubtitleStage] = useState(null);
  const [subtitleDetail, setSubtitleDetail] = useState('');

  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const removeTrimListener = window.electron.onTrimProgress((data) => {
      setProgress(Math.round(data.percent || 0));
      if (data.eta !== undefined) setEtaSeconds(data.eta);
    });
    const removeExportListener = window.electron.onExportProgress((data) => {
      setProgress(Math.round(data.percent || 0));
      if (data.eta !== undefined) setEtaSeconds(data.eta);
    });
    const removeSubtitleListener = window.electron.onSubtitleProgress((data) => {
      setSubtitleStage(data.stage);

      if (data.stage === 'translating' && data.total) {
        setSubtitleDetail(`${data.index}/${data.total} câu`);
      } else if (data.stage === 'loading-model' && data.model) {
        setSubtitleDetail(data.model === 'whisper' ? 'nhận diện giọng nói' : 'dịch');
      } else {
        setSubtitleDetail('');
      }
    });

    return () => {
      removeTrimListener?.();
      removeExportListener?.();
      removeSubtitleListener?.();
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
    return new Date(s * 1000).toISOString().substr(11, 8);
  };

  const handleAction = async () => {
    if (!selectedFile || processing) return;

    setProcessing(true);
    setProgress(0);
    setEtaSeconds(null);
    setSubtitleStage(enableAutoSub ? 'extracting-audio' : null);
    setSubtitleDetail('');

    const payload = {
      inputPath: selectedFile.filePath,
      aspectRatio,
      segments,
      subtitles: {
        enabled: enableAutoSub,
        sourceLang,
        targetLang,
        exportGreenScreen: enableSubtitleBg
      }
    };

    const res = (aspectRatio === 'original')
      ? await window.electron.trimMultipleSegments(payload)
      : await window.electron.exportWithAspectRatio(payload);

    alert(res.message);
    setProcessing(false);
    setSubtitleStage(null);
  };

  const totalSegDuration = segments.reduce((sum, s) => sum + (s.duration || 0), 0);
  const isOverDuration = totalSegDuration > videoDuration;
  return (
    <div className="min-h-screen bg-slate-900 text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto flex items-center mb-10">
        <h1 className="text-3xl font-black text-blue-500 mr-auto">CUT VIDEO PRO</h1>
        <div className="mr-4 px-4 py-1.5 rounded-lg border bg-slate-800 border-slate-700 text-slate-400 text-xs font-bold">
          TỰ ĐỘNG TỐI ƯU ENCODER
        </div>
        <button onClick={() => { logout(); navigate('/login'); }} className="text-red-400 border border-red-500/50 px-4 py-1.5 rounded-lg hover:bg-red-500 hover:text-white transition-all">Đăng Xuất</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mx-auto">
        <div className="space-y-6">
          <button onClick={handleSelectFile} disabled={processing || loading} className="w-full py-12 border-2 border-dashed border-slate-700 rounded-2xl hover:border-blue-500 text-slate-500 font-bold disabled:opacity-50">
            {loading ? 'ĐANG ĐỌC VIDEO...' : selectedFile ? `✅ ${selectedFile.fileName}` : '📁 CHỌN VIDEO ĐẦU VÀO'}
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

        <div className="space-y-6">
          <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-6">
            <div className="grid grid-cols-3 gap-3">
              {['original', '16:9', '9:16'].map(r => (
                <button key={r} onClick={() => setAspectRatio(r)} className={`p-3 rounded-xl border-2 transition-all ${aspectRatio === r ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-700 text-slate-500'}`}>
                  <div className="font-bold uppercase text-xs">{r === 'original' ? 'Gốc (Cắt)' : r}</div>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-400 uppercase">Số đoạn:</span>
              <input type="number" value={segmentCount} onChange={handleSegmentCountChange} className="w-16 bg-slate-900 border border-slate-700 rounded p-1 text-center" />
            </div>

            <div className="space-y-3 max-h-48 overflow-y-auto pr-2">
              {segments.map((seg) => (
                <div key={seg.id} className="grid grid-cols-2 gap-3 bg-slate-900/50 p-3 rounded-xl border border-slate-700">
                  <input type="number" value={seg.startTime} onChange={(e) => handleSegmentChange(seg.id, 'startTime', e.target.value)} className="bg-transparent text-blue-400 text-sm font-mono" />
                  <input type="number" value={seg.duration} onChange={(e) => handleSegmentChange(seg.id, 'duration', e.target.value)} className="bg-transparent text-purple-400 text-sm font-mono text-right" />
                </div>
              ))}
            </div>

            {/* --- Cấu hình phụ đề / Auto-translate --- */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableAutoSub}
                  onChange={(e) => setEnableAutoSub(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-bold text-slate-200">✨ Tự động nhận diện & Phiên dịch giọng nói</span>
              </label>

              {enableAutoSub && (
                <div className="pl-8 space-y-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">NGÔN NGỮ GỐC</label>
                      <select
                        value={sourceLang}
                        onChange={(e) => setSourceLang(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                      >
                        <option value="vi">Tiếng Việt (Mặc định)</option>
                        <option value="en">Tiếng Anh</option>
                        <option value="zh">Tiếng Trung</option>
                        <option value="auto">Tự động nhận diện</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">DỊCH SANG</label>
                      <select
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white"
                      >
                        <option value="vi">Tiếng Việt</option>
                        <option value="en">Tiếng Anh</option>
                        <option value="zh">Tiếng Trung</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center space-x-2 pt-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableSubtitleBg}
                      onChange={(e) => setEnableSubtitleBg(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                    />
                    <span className="text-xs font-medium text-slate-300">Thêm nền xanh mờ dưới đáy cho phụ đề</span>
                  </label>
                </div>
              )}
            </div>

            <button onClick={handleAction} disabled={!selectedFile || isOverDuration || processing} className="w-full py-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 transition-all shadow-lg shadow-blue-900/20">
              {processing ? `ĐANG XỬ LÝ...` : `🚀 XUẤT VIDEO`}
            </button>

            {processing && (
              <div className="space-y-2">
                {enableAutoSub && subtitleStage && subtitleStage !== 'subtitle-done' && (
                  <div className="flex items-center gap-2 text-xs font-mono text-purple-400 bg-purple-500/10 border border-purple-500/30 rounded-lg px-3 py-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                    <span>{SUBTITLE_STAGE_LABELS[subtitleStage] || 'Đang xử lý phụ đề...'}</span>
                    {subtitleDetail && <span className="text-purple-300">({subtitleDetail})</span>}
                  </div>
                )}
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