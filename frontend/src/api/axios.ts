/// <reference types="vite/client" />
import axios from 'axios';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  withCredentials: true,
});

// Interceptor to add auth headers from stub
api.interceptors.request.use((config) => {
  const userId = localStorage.getItem('userId');
  const role = localStorage.getItem('role');

  if (userId) {
    config.headers['x-user-id'] = userId;
  }
  if (role) {
    config.headers['x-user-role'] = role;
  }
  
  return config;
});
