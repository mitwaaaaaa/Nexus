import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:8000',
  withCredentials: true, // Crucial for HTTPOnly cookies
});

// Request Interceptor (authorization header fallback)
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor for Token Refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    // Do not attempt to refresh token for auth-specific requests (login, register, refresh)
    const isAuthRequest = originalRequest.url?.includes('/api/auth/login') || 
                          originalRequest.url?.includes('/api/auth/register') || 
                          originalRequest.url?.includes('/api/auth/refresh');
    
    // If unauthorized error, hasn't retried yet, and is not an auth request
    if (error.response?.status === 401 && !originalRequest._retry && !isAuthRequest) {
      originalRequest._retry = true;
      try {
        // Trigger Token Refresh
        const refreshRes = await axios.post(
          `${api.defaults.baseURL}/api/auth/refresh`,
          {},
          { withCredentials: true }
        );
        
        const newAccessToken = refreshRes.data.access_token;
        localStorage.setItem('token', newAccessToken);
        
        // Retry original request
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        }
        return api(originalRequest);
      } catch (refreshError) {
        // Refresh token failed -> clear storage and trigger redirect to login
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth-logout'));
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  }
);

export default api;
