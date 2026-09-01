import axios, { type InternalAxiosRequestConfig } from 'axios';

type AdminAccount = { id: string; email: string; name: string; role: 'VIEWER' | 'EDITOR' | 'ADMIN' | 'SUPER_ADMIN' };
type AuthResponse = { accessToken: string; expiresIn: number; user: AdminAccount };
type RetryConfig = InternalAxiosRequestConfig & { _retry?: boolean };

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api/v1',
  withCredentials: true
});

let accessToken: string | null = null;
let adminAccount: AdminAccount | null = null;
let refreshPromise: Promise<AdminAccount> | null = null;

function acceptAuth(result: AuthResponse) {
  accessToken = result.accessToken;
  adminAccount = result.user;
  return result.user;
}

export function currentAdminAccount() {
  return adminAccount;
}

export async function loginAdmin(credentials: { email: string; password: string }) {
  const { data } = await api.post<AuthResponse>('/auth/admin/login', credentials);
  return acceptAuth(data);
}

export async function refreshAdminSession() {
  if (!refreshPromise) {
    refreshPromise = api.post<AuthResponse>('/auth/admin/refresh').then(({ data }) => acceptAuth(data)).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

export async function ensureAdminSession() {
  return adminAccount || refreshAdminSession();
}

export async function logoutAdmin() {
  try {
    await api.post('/auth/admin/logout');
  } finally {
    accessToken = null;
    adminAccount = null;
  }
}

api.interceptors.request.use(config => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(response => response, async error => {
  const config = error.config as RetryConfig | undefined;
  const url = String(config?.url || '');
  const isAuthRequest = url.includes('/auth/admin/login') || url.includes('/auth/admin/refresh');
  if (error.response?.status === 401 && config && !config._retry && !isAuthRequest && location.pathname.startsWith('/admin')) {
    config._retry = true;
    try {
      await refreshAdminSession();
      return api(config);
    } catch {
      accessToken = null;
      adminAccount = null;
      if (location.pathname !== '/admin/login') location.href = `/admin/login?redirect=${encodeURIComponent(location.pathname)}`;
    }
  }
  return Promise.reject(error);
});
