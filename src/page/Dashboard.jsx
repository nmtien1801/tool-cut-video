import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import '../index.css';

const SUBTITLE_STAGE_LABELS = {
  'extracting-audio': 'Đang tách âm thanh...',
  'loading-model': 'Đang tải mô hình AI (chỉ lần đầu, có thể mất vài phút)...',
  'transcribing': 'Đang nhận diện giọng nói...',
  'translating': 'Đang dịch phụ đề...',
  'subtitle-done': 'Đã tạo xong phụ đề...',
};

// --- HÀM TIỆN ÍCH PARSE / BUILD SRT ---
const parseSRT = (srtString) => {
  return srtString.trim().split(/\n\r?\n/).map(block => {
    const lines = block.split('\n');
    const id = lines[0];
    const time = lines[1];
    const text = lines.slice(2).join('\n');
    const [start, end] = time ? time.split(' --> ') : ['', ''];
    return { id, start, end, text };
  }).filter(sub => sub.id && sub.start);
};

// ==========================================
// COMPONENT: KHUNG LƯỚI KÉO THẢ (PAN/CROP) - ĐÃ FIX LỖI HOOKS
// ==========================================
const CropGridOverlay = ({ aspectRatio, cropPosition, setCropPosition }) => {
  const containerRef = useRef(null);
  const [dim, setDim] = useState({ w: 0, h: 0 });
  const isDragging = useRef(false);
  const startPos = useRef({ x: 0, y: 0, crop: 50 });

  // 1. Hook lấy kích thước
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries[0]) {
        setDim({ w: entries[0].contentRect.width, h: entries[0].contentRect.height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const isVertical = aspectRatio === '9:16';

  // Tính toán kích thước và giới hạn trượt
  let boxW = dim.w;
  let boxH = dim.h;

  if (isVertical) {
    boxW = dim.h * (9 / 16);
    if (boxW > dim.w) boxW = dim.w;
  } else {
    boxH = dim.w * (9 / 16);
    if (boxH > dim.h) boxH = dim.h;
  }

  const movableRangeX = Math.max(0, dim.w - boxW);
  const movableRangeY = Math.max(0, dim.h - boxH);

  // 2. Hook đăng ký event global (Phải đưa lên TRƯỚC lệnh return sớm)
  useEffect(() => {
    const handleMove = (clientX, clientY) => {
      if (!isDragging.current) return;
      const dx = clientX - startPos.current.x;
      const dy = clientY - startPos.current.y;

      if (isVertical && movableRangeX > 0) {
        const percent = (dx / movableRangeX) * 100;
        setCropPosition(Math.max(0, Math.min(100, startPos.current.crop + percent)));
      } else if (!isVertical && movableRangeY > 0) {
        const percent = (dy / movableRangeY) * 100;
        setCropPosition(Math.max(0, Math.min(100, startPos.current.crop + percent)));
      }
    };

    const handleUp = () => { isDragging.current = false; };

    const onMouseMove = (e) => handleMove(e.clientX, e.clientY);
    const onTouchMove = (e) => handleMove(e.touches[0].clientX, e.touches[0].clientY);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchend', handleUp);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchend', handleUp);
    };
  }, [dim, isVertical, movableRangeX, movableRangeY, setCropPosition]);

  // 3. LỆNH RETURN SỚM ĐƯỢC ĐƯA XUỐNG DƯỚI CÙNG (Sau khi đã gọi hết Hooks)
  if (!dim.w || !dim.h) {
    return <div ref={containerRef} className="absolute inset-0 pointer-events-none" />;
  }

  const left = isVertical ? (cropPosition / 100) * movableRangeX : 0;
  const top = !isVertical ? (cropPosition / 100) * movableRangeY : 0;

  const handleDown = (clientX, clientY) => {
    isDragging.current = true;
    startPos.current = { x: clientX, y: clientY, crop: cropPosition };
  };

  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none rounded-xl">
      <div
        className="absolute border-2 border-yellow-400 pointer-events-auto cursor-grab active:cursor-grabbing flex flex-col justify-between"
        style={{
          width: boxW, height: boxH, left, top,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.65)',
          touchAction: 'none'
        }}
        onMouseDown={(e) => handleDown(e.clientX, e.clientY)}
        onTouchStart={(e) => handleDown(e.touches[0].clientX, e.touches[0].clientY)}
      >
        <div className="absolute inset-0 flex justify-evenly pointer-events-none">
          <div className="w-px h-full bg-white/40" />
          <div className="w-px h-full bg-white/40" />
        </div>
        <div className="absolute inset-0 flex flex-col justify-evenly pointer-events-none">
          <div className="h-px w-full bg-white/40" />
          <div className="h-px w-full bg-white/40" />
        </div>
      </div>
    </div>
  );
};


// ==========================================
// DASHBOARD MAIN
// ==========================================
function Dashboard() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoMeta, setVideoMeta] = useState({ w: 0, h: 0 }); // Lưu kích thước video thực tế
  const [segmentCount, setSegmentCount] = useState(2);
  const [segments, setSegments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [etaSeconds, setEtaSeconds] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [aspectRatio, setAspectRatio] = useState('original');
  const [enableBlurBg, setEnableBlurBg] = useState(true);

  // Tọa độ Crop (%)
  const [cropPosition, setCropPosition] = useState(50);

  // Cấu hình tự động phiên dịch
  const [enableAutoSub, setEnableAutoSub] = useState(false);
  const [sourceLang, setSourceLang] = useState('vi');
  const [targetLang, setTargetLang] = useState('vi');
  const [enableSubtitleBg, setEnableSubtitleBg] = useState(true);

  // Trạng thái Phụ đề chỉnh sửa
  const [subtitleStage, setSubtitleStage] = useState(null);
  const [subtitleDetail, setSubtitleDetail] = useState('');
  const [generatingSub, setGeneratingSub] = useState(false);
  const [subtitleSegments, setSubtitleSegments] = useState([]);

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
    setSubtitleSegments([]);
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

  const handleGenerateSubtitles = async () => {
    if (!selectedFile) return;
    setGeneratingSub(true);
    setSubtitleStage('extracting-audio');

    try {
      const res = await window.electron.generateSubtitlesOnly({
        inputPath: selectedFile.filePath,
        sourceLang,
        targetLang
      });

      if (res.success) {
        const parsed = parseSRT(res.srtContent);
        setSubtitleSegments(parsed);
      } else {
        alert("Lỗi tạo phụ đề: " + res.message);
      }
    } catch (error) {
      alert("Lỗi kết nối AI: " + error.message);
    } finally {
      setGeneratingSub(false);
      setSubtitleStage(null);
      setSubtitleDetail('');
    }
  };

  const handleSubtitleTextChange = (id, newText) => {
    setSubtitleSegments(prev => prev.map(sub => sub.id === id ? { ...sub, text: newText } : sub));
  };

  const handleAction = async () => {
    if (!selectedFile || processing) return;

    setProcessing(true);
    setProgress(0);
    setEtaSeconds(null);

    const payload = {
      inputPath: selectedFile.filePath,
      aspectRatio,
      enableBlur: enableBlurBg,
      cropPosition: parseInt(cropPosition),
      segments,
      subtitles: {
        enabled: enableAutoSub && subtitleSegments.length > 0,
        rawSegments: subtitleSegments,
        exportGreenScreen: enableSubtitleBg
      }
    };

    const res = (aspectRatio === 'original')
      ? await window.electron.trimMultipleSegments(payload)
      : await window.electron.exportWithAspectRatio(payload);

    alert(res.message);
    setProcessing(false);

    if (res.success) {
      setSelectedFile(null);
      setVideoPreviewUrl(null);
      setVideoDuration(0);
      setSubtitleSegments([]);
      setSegments([]);
      setSegmentCount(2);
      setProgress(0);
      setEtaSeconds(null);
      setEnableAutoSub(false);
    }
  };

  const totalSegDuration = segments.reduce((sum, s) => sum + (s.duration || 0), 0);
  const isOverDuration = totalSegDuration > videoDuration;

  // Tính toán giới hạn khung chứa video để Overlay phủ vừa khít
  const maxVideoHeight = 320;
  const containerStyle = {
    aspectRatio: videoMeta.w && videoMeta.h ? `${videoMeta.w}/${videoMeta.h}` : '16/9',
    maxHeight: `${maxVideoHeight}px`,
    width: '100%',
    maxWidth: videoMeta.w && videoMeta.h ? `${maxVideoHeight * (videoMeta.w / videoMeta.h)}px` : '100%'
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-8 font-sans">
      <div className="max-w-6xl mx-auto flex items-center mb-10">
        <h1 className="text-3xl font-black text-blue-500 mr-auto">CUT VIDEO</h1>
        <button onClick={() => { logout(); navigate('/login'); }} className="text-red-400 border border-red-500/50 px-4 py-1.5 rounded-lg hover:bg-red-500 hover:text-white transition-all">Đăng Xuất</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 max-w-6xl mx-auto">

        {/* ===================== CỘT TRÁI ===================== */}
        <div className="space-y-6">
          <button onClick={handleSelectFile} disabled={processing || loading || generatingSub} className="w-full py-12 border-2 border-dashed border-slate-700 rounded-2xl hover:border-blue-500 text-slate-500 font-bold disabled:opacity-50">
            {loading ? 'ĐANG ĐỌC VIDEO...' : selectedFile ? `✅ ${selectedFile.fileName}` : '📁 CHỌN VIDEO ĐẦU VÀO'}
          </button>

          {selectedFile && (
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-slate-700 shadow-xl">

              {/* KHUNG VIDEO VÀ OVERLAY KÉO THẢ */}
              <div className="flex justify-center bg-black rounded-xl mb-4 p-2">
                <div className="relative flex justify-center items-center" style={containerStyle}>
                  <video
                    src={videoPreviewUrl}
                    controls={aspectRatio === 'original'} // Ẩn control để dễ kéo thả khung
                    className="w-full h-full object-contain"
                    onLoadedMetadata={(e) => setVideoMeta({ w: e.target.videoWidth, h: e.target.videoHeight })}
                  />
                  {/* Hiển thị khung cắt nếu khác tỉ lệ gốc */}
                  {aspectRatio !== 'original' && (
                    <CropGridOverlay
                      aspectRatio={aspectRatio}
                      cropPosition={cropPosition}
                      setCropPosition={setCropPosition}
                    />
                  )}
                </div>
              </div>

              <div className="flex justify-between text-sm font-mono text-slate-400">
                <span>THỜI LƯỢNG GỐC:</span>
                <span className="text-blue-400">{formatTime(videoDuration)}</span>
              </div>
            </div>
          )}

          {/* EDITOR SỬA PHỤ ĐỀ */}
          {enableAutoSub && subtitleSegments.length > 0 && (
            <div className="bg-slate-800/50 p-4 rounded-2xl border border-blue-500/30 flex flex-col h-96">
              <h3 className="text-sm font-bold text-blue-400 mb-3 flex items-center justify-between">
                <span>📝 CHỈNH SỬA PHỤ ĐỀ ({subtitleSegments.length} câu)</span>
                <button onClick={() => setSubtitleSegments([])} className="text-xs text-red-400 hover:text-red-300">Hủy tạo lại</button>
              </h3>
              <div className="overflow-y-auto space-y-3 pr-2 custom-scrollbar flex-1">
                {subtitleSegments.map((sub) => (
                  <div key={sub.id} className="bg-slate-900 rounded-lg p-3 border border-slate-700 focus-within:border-blue-500">
                    <div className="flex justify-between text-xs font-mono text-slate-500 mb-2">
                      <span>Câu {sub.id}</span>
                      <span>{sub.start} ➝ {sub.end}</span>
                    </div>
                    <textarea
                      value={sub.text}
                      onChange={(e) => handleSubtitleTextChange(sub.id, e.target.value)}
                      className="w-full bg-transparent text-sm text-slate-200 outline-none resize-none"
                      rows={2}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===================== CỘT PHẢI ===================== */}
        <div className="space-y-6">
          <div className="bg-slate-800/50 p-6 rounded-2xl border border-slate-700 space-y-6">

            <div className="grid grid-cols-3 gap-3">
              {['original', '16:9', '9:16'].map(r => (
                <button key={r} onClick={() => { setAspectRatio(r); setCropPosition(50); }} className={`p-3 rounded-xl border-2 transition-all ${aspectRatio === r ? 'border-blue-500 bg-blue-500/10 text-blue-400' : 'border-slate-700 text-slate-500'}`}>
                  <div className="font-bold uppercase text-xs">{r === 'original' ? 'Gốc (Cắt)' : r}</div>
                </button>
              ))}
            </div>

            {/* Thông báo hướng dẫn thay cho thanh kéo slider */}
            {aspectRatio !== 'original' && (
              <div className="bg-slate-900/50 p-3 rounded-xl border border-yellow-500/30">
                <p className="text-xs text-yellow-400/80 font-medium text-center">
                  ☝️ Hãy dùng chuột kéo khung lưới màu vàng trên Video để chọn góc cần xuất.
                </p>
              </div>
            )}

            <label className="flex items-center space-x-2.5 bg-slate-900/50 p-3 rounded-xl border border-slate-700/60 cursor-pointer">
              <input
                type="checkbox"
                checked={enableBlurBg}
                onChange={(e) => setEnableBlurBg(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500"
              />
              <span className="text-xs font-semibold text-slate-300">
                Làm mờ nền khi đổi tỉ lệ (Bỏ chọn nếu muốn nền đen)
              </span>
            </label>

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

            {/* Cấu hình phụ đề */}
            <div className="space-y-3 pt-4 border-t border-slate-700">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableAutoSub}
                  onChange={(e) => setEnableAutoSub(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500"
                />
                <span className="text-sm font-bold text-slate-200">✨ Kèm Phụ Đề AI (Cần tạo & duyệt trước)</span>
              </label>

              {enableAutoSub && subtitleSegments.length === 0 && (
                <div className="pl-8 space-y-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">NGÔN NGỮ GỐC</label>
                      <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white">
                        <option value="vi">Tiếng Việt (Mặc định)</option>
                        <option value="en">Tiếng Anh</option>
                        <option value="zh">Tiếng Trung</option>
                        <option value="auto">Tự động nhận diện</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1">DỊCH SANG</label>
                      <select value={targetLang} onChange={(e) => setTargetLang(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-2 text-xs text-white">
                        <option value="vi">Tiếng Việt</option>
                        <option value="en">Tiếng Anh</option>
                        <option value="zh">Tiếng Trung</option>
                      </select>
                    </div>
                  </div>

                  <label className="flex items-center space-x-2 pt-2 cursor-pointer pb-2">
                    <input type="checkbox" checked={enableSubtitleBg} onChange={(e) => setEnableSubtitleBg(e.target.checked)} className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500" />
                    <span className="text-xs font-medium text-slate-300">Thêm nền xanh mờ dưới đáy cho phụ đề</span>
                  </label>

                  <button
                    onClick={handleGenerateSubtitles}
                    disabled={!selectedFile || generatingSub}
                    className="w-full py-2.5 rounded-lg font-bold bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 transition-all text-sm"
                  >
                    {generatingSub ? `ĐANG XỬ LÝ AI...` : `🛠 1. TẠO & KIỂM TRA PHỤ ĐỀ TRƯỚC`}
                  </button>

                  {generatingSub && subtitleStage && (
                    <div className="flex items-center gap-2 text-xs font-mono text-purple-400 mt-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                      <span>{SUBTITLE_STAGE_LABELS[subtitleStage] || 'Đang xử lý phụ đề...'}</span>
                      {subtitleDetail && <span className="text-purple-300">({subtitleDetail})</span>}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={handleAction}
              disabled={!selectedFile || isOverDuration || processing || generatingSub || (enableAutoSub && subtitleSegments.length === 0)}
              className="w-full py-4 rounded-xl font-bold bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 transition-all shadow-lg shadow-blue-900/20"
            >
              {processing ? `ĐANG XỬ LÝ VIDEO...` : enableAutoSub ? `🚀 2. ÁP DỤNG PHỤ ĐỀ & XUẤT VIDEO` : `🚀 XUẤT VIDEO`}
            </button>

            {processing && (
              <div className="space-y-2 mt-4">
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