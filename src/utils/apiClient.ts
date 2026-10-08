import axios, { AxiosInstance, AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { DEV_TUNNEL_BASE_URL, getStoredAuthToken, clearStoredAuth } from './auth';

/**
 * Centralized Axios Instance with Automatic JWT Bearer Interceptor
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: DEV_TUNNEL_BASE_URL,
  timeout: 15000,
  headers: {
    'accept': '*/*',
    'Content-Type': 'application/json',
  },
});

/**
 * REQUEST INTERCEPTOR:
 * Automatically retrieves the JWT token stored in localStorage and attaches it
 * to the 'Authorization' header as 'Bearer <token>' for every outgoing request.
 */
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getStoredAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

/**
 * RESPONSE INTERCEPTOR:
 * Handles responses and automatically manages 401 Unauthorized errors (token expiry/invalidation).
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      console.warn('API returned 401 Unauthorized. Clearing expired auth credentials.');
      clearStoredAuth();
    }
    return Promise.reject(error);
  }
);

/**
 * Custom Wrapper Functions for Standard HTTP Requests
 */
export async function apiGet<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.get<T>(url, config);
  return response.data;
}

export async function apiPost<T = any, D = any>(url: string, data?: D, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.post<T>(url, data, config);
  return response.data;
}

export async function apiPut<T = any, D = any>(url: string, data?: D, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.put<T>(url, data, config);
  return response.data;
}

export async function apiDelete<T = any>(url: string, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.delete<T>(url, config);
  return response.data;
}

export async function apiPatch<T = any, D = any>(url: string, data?: D, config?: AxiosRequestConfig): Promise<T> {
  const response = await apiClient.patch<T>(url, data, config);
  return response.data;
}
