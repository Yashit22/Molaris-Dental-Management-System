import axios from 'axios';
import { API_BASE_URL } from '../config/env.js';

const cdApi = axios.create({
  baseURL: `${API_BASE_URL}/connect-desk`,
});

cdApi.interceptors.request.use(cfg => {
  const token = localStorage.getItem('cd_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

cdApi.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('cd_token');
      window.location.href = '/connect-desk/login';
    }
    return Promise.reject(err);
  }
);

export default cdApi;
