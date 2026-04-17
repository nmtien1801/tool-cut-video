import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ApiAuth from '../api/ApiAuth';

function Login() {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth();

    const handleLogin = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            // Gửi username và password lên API
            const response = await ApiAuth.LoginApi({ username, password });

            // Lưu user info vào context (không lưu localStorage)
            const userData = response.data?.DT || {};
            if (userData) {
                login(userData);
                // Chuyển hướng đến dashboard sau khi đăng nhập thành công
                navigate('/dashboard');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Đăng nhập thất bại. Vui lòng thử lại.');
            console.error('Login error:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-2xl p-8 w-full max-w-md">
                <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">
                    Đăng Nhập
                </h1>
                <p className="text-gray-600 text-center mb-6">
                    Vui lòng nhập thông tin tài khoản của bạn
                </p>

                {error && (
                    <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-gray-700 font-medium mb-2">
                            username
                        </label>
                        <input
                            //   type="username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="username"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <div>
                        <label className="block text-gray-700 font-medium mb-2">
                            Mật khẩu
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Nhập mật khẩu"
                            required
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white font-bold py-2 px-4 rounded-lg transition duration-200"
                    >
                        {loading ? 'Đang đăng nhập...' : 'Đăng Nhập'}
                    </button>
                </form>
            </div>
        </div>
    );
}

export default Login;
