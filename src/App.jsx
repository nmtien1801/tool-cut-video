import React, { useState } from 'react';
import './index.css';

function App() {
  const [info, setInfo] = useState(null);

  const checkSystem = async () => {
    // Gọi hàm đã định nghĩa trong preload
    const result = await window.electron.getSystemInfo();
    setInfo(result);
  };

  return (
    <div className="h-screen bg-gray-900 text-white flex flex-col items-center justify-center p-5">
      <h1 className="text-3xl font-bold text-blue-400 mb-6">CMIC System Tool</h1>

      <button
        onClick={checkSystem}
        className="bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-medium transition-all"
      >
        Kiểm tra cấu hình máy
      </button>

      {info && (
        <div className="mt-8 p-6 bg-gray-800 rounded-xl border border-gray-700 w-full max-w-md">
          <p><strong>Người dùng:</strong> {info.user}</p>
          <p><strong>Hệ điều hành:</strong> {info.platform}</p>
          <p><strong>Dung lượng RAM:</strong> {info.mem}</p>
        </div>
      )}
    </div>
  );
}

export default App;