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
// Interceptor to handle 401 Unauthorized globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear all auth data if the server rejects the session (e.g., user deleted)
      const keys = ['userId', 'userEmail', 'userName', 'userRole', 'role'];
      keys.forEach((key) => localStorage.removeItem(key));
      sessionStorage.clear();
      
      // Prevent infinite redirect loops if we're already on login/register
      if (window.location.pathname !== '/login' && window.location.pathname !== '/register' && window.location.pathname !== '/') {
        window.location.href = '/login?expired=true';
      } else {
        // If we are on home page, just reload to reflect logged-out state
        window.dispatchEvent(new Event('auth:logout'));
      }
    }
    return Promise.reject(error);
  }
);
