import axios, { type InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
});

export const authApi = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  withCredentials: true,
});

let accessToken: string | null = null;

export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
  _retry?: boolean;
}

let refreshRequest: Promise<void> | null = null;

api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error)) {
    return Promise.reject(error);
  }

  const request = error.config as RetriableRequestConfig | undefined;
  const isRefreshRequest = request?.url?.includes('/api/v1/auth/refresh');
  if (error.response?.status !== 401 || !request || request._retry || isRefreshRequest) {
    return Promise.reject(error);
  }

  request._retry = true;
  if (!refreshRequest) {
    refreshRequest = authApi
      .post<{ accessToken: string }>('/api/v1/auth/refresh')
      .then(({ data }) => {
        setAccessToken(data.accessToken);
      })
      .finally(() => {
        refreshRequest = null;
      });
  }

  try {
    await refreshRequest;
    return api(request);
  } catch (refreshError) {
    setAccessToken(null);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('auth:session-expired'));
    }
    return Promise.reject(refreshError);
  }
});

export { API_URL };
