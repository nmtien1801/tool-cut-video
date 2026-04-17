import axios from 'axios';
const BASE_URL = import.meta.env.VITE_BACKEND_URL;

// Tạo axios instance
const ApiManager = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
});

export default ApiManager;
