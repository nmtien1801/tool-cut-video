import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import { AuthProvider } from './context/AuthContext';
import Login from './page/Login';
import Dashboard from './page/Dashboard';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Route Đăng nhập */}
          <Route path="/login" element={<Login />} />

          {/* Route Dashboard (Trang chính) - Protected */}
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          {/* Route mặc định - Redirect đến /login (không token persistence) */}
          <Route path="/" element={<Navigate to="/login" />} />

          {/* Route không tồn tại - Chuyển hướng về login */}
          <Route path="*" element={<Navigate to="/login" />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
