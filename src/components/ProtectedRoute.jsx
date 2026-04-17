import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function ProtectedRoute({ children }) {
  const { isLoggedIn } = useAuth();

  // Nếu chưa đăng nhập (session hiện tại), chuyển hướng đến /login
  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  // Nếu đã đăng nhập, hiển thị component
  return children;
}

export default ProtectedRoute;
