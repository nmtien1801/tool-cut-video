import React, { useState, useEffect } from 'react';
import './index.css';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [segmentCount, setSegmentCount] = useState(2);
  const [segments, setSegments] = useState([]);
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
      
      // Lấy duration video
      const durationRes = await window.electron.getVideoDuration(res.filePath);
      if (durationRes.success) {
        setVideoDuration(durationRes.duration);
        // Khởi tạo segments mặc định
        initializeSegments(segmentCount, durationRes.duration);
      }
    } else {
      alert(res.message);
    }
    setLoading(false);
  };

  const initializeSegments = (count, duration) => {
    const segmentDuration = Math.floor(duration / count);
    const newSegments = [];
    for (let i = 0; i < count; i++) {
      newSegments.push({
        id: i,
        startTime: i * segmentDuration,
        duration: i === count - 1 ? duration - (i * segmentDuration) : segmentDuration,
      });
    }
    setSegments(newSegments);
  };

  const handleSegmentCountChange = (e) => {
    const count = parseInt(e.target.value) || 1;
    setSegmentCount(count);
    if (videoDuration > 0) {
      initializeSegments(count, videoDuration);
    }
  };

  const handleSegmentChange = (id, field, value) => {
    const newSegments = segments.map(seg =>
      seg.id === id ? { ...seg, [field]: parseInt(value) || 0 } : seg
    );
    setSegments(newSegments);
  };

  const getTotalDuration = () => {
    return segments.reduce((sum, seg) => sum + seg.duration, 0);
  };

  const isValidSegments = () => {
    if (segments.length === 0) return false;
    const totalDuration = getTotalDuration();
    return totalDuration <= videoDuration && segments.every(s => s.duration > 0);
  };

  const handleTrimVideo = async () => {
    if (!selectedFile || !isValidSegments()) {
      alert("Vui lòng kiểm tra lại thời gian đoạn cắt");
      return;
    }

    setTrimming(true);
    setProgress(0);
    
    const res = await window.electron.trimMultipleSegments({
      inputPath: selectedFile.filePath,
      segments: segments,
    });

    if (res.success) {
      alert(res.message);
      setSelectedFile(null);
      setSegments([]);
      setVideoDuration(0);
      setProgress(0);
    } else {
      alert(res.message);
    }
    setTrimming(false);
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white p-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 mb-3">
           VIDEO SEGMENT CUTTER
        </h1>
        <p className="text-slate-400 text-lg">Cắt video thành nhiều đoạn tùy ý</p>
      </div>

      {/* Main Container - 2 Columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
        
        {/* Column 1: Video Selection */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-blue-400 mb-4">Chọn Video</h2>
          
          <button
            onClick={handleSelectFile}
            disabled={loading || trimming}
            className="w-full py-6 px-8 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 disabled:from-slate-600 disabled:to-slate-700 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-blue-500/50 disabled:shadow-none"
          >
            {loading ? "⏳ Đang chọn..." : selectedFile ? "✅ Đã chọn" : "📁 Chọn Video"}
          </button>

          {selectedFile && (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 space-y-3">
              <div>
                <p className="text-sm text-slate-400 font-semibold">Tên file:</p>
                <p className="text-blue-400 break-all">{selectedFile.fileName}</p>
              </div>
              <div>
                <p className="text-sm text-slate-400 font-semibold">Thời lượng:</p>
                <p className="text-green-400 font-bold text-lg">{formatTime(videoDuration)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Column 2: Segment Settings */}
        <div className="space-y-6">
          <h2 className="text-2xl font-bold text-purple-400 mb-4">Cắt Đoạn</h2>

          {selectedFile && videoDuration > 0 ? (
            <>
              {/* Segment Count */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                <label className="text-sm text-slate-400 font-semibold">Số lượng đoạn:</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={segmentCount}
                  onChange={handleSegmentCountChange}
                  disabled={trimming}
                  className="w-full mt-2 px-4 py-2 bg-slate-700 border border-slate-600 rounded text-white disabled:opacity-50"
                />
              </div>

              {/* Segments List */}
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 max-h-96 overflow-y-auto space-y-3">
                <p className="text-sm text-slate-400 font-semibold mb-2">Chi tiết từng đoạn:</p>
                {segments.map((seg, idx) => (
                  <div key={seg.id} className="bg-slate-700 p-3 rounded space-y-2">
                    <p className="text-sm font-bold text-blue-300">Đoạn {idx + 1}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-400">Bắt đầu (s):</label>
                        <input
                          type="number"
                          min="0"
                          value={seg.startTime}
                          onChange={(e) => handleSegmentChange(seg.id, 'startTime', e.target.value)}
                          disabled={trimming}
                          className="w-full px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white text-sm disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-400">Thời lượng (s):</label>
                        <input
                          type="number"
                          min="1"
                          value={seg.duration}
                          onChange={(e) => handleSegmentChange(seg.id, 'duration', e.target.value)}
                          disabled={trimming}
                          className="w-full px-2 py-1 bg-slate-600 border border-slate-500 rounded text-white text-sm disabled:opacity-50"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Total Duration Info */}
              <div className={`p-3 rounded-lg border ${getTotalDuration() <= videoDuration ? 'bg-green-900/30 border-green-600' : 'bg-red-900/30 border-red-600'}`}>
                <p className="text-sm text-slate-300">
                  Tổng thời gian cắt: <span className="font-bold">{formatTime(getTotalDuration())}</span>
                </p>
                <p className="text-sm text-slate-300">
                  Thời gian video: <span className="font-bold">{formatTime(videoDuration)}</span>
                </p>
              </div>

              {/* Trim Button */}
              <button
                onClick={handleTrimVideo}
                disabled={!isValidSegments() || trimming}
                className="w-full py-6 px-8 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 disabled:from-slate-600 disabled:to-slate-700 rounded-xl font-bold text-lg transition-all shadow-lg hover:shadow-purple-500/50 disabled:shadow-none"
              >
                {trimming ? `🚀 Đang cắt... ${progress}%` : "🎬 Cắt Video"}
              </button>

              {/* Progress Bar */}
              {trimming && (
                <div className="space-y-2">
                  <div className="w-full h-3 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="text-center text-sm text-slate-400">
                    Tiến độ: <span className="text-purple-400 font-bold">{progress}%</span>
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 text-center">
              <p className="text-slate-400">Vui lòng chọn video từ cột bên trái</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
