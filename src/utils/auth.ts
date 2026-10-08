/**
 * Authentication and LocalStorage Management for RouteTracker
 */

import { apiClient } from './apiClient';

export interface AuthUserData {
  id: number;
  userName: string;
  roleName: string;
  role: number;
  personId: number;
  authorizationCode: string | null;
}

export interface LoginResponse {
  data: AuthUserData;
  token: string;
  imageUrl: string;
  message: string;
  status: boolean;
}

export const AUTH_KEYS = {
  TOKEN: 'route_tracker_auth_token',
  USER: 'route_tracker_auth_user',
  IMAGE_URL: 'route_tracker_auth_image_url',
};

export const API_BASE_URL = 'https://kv5zhpcr-7044.uks1.devtunnels.ms';
export const DEV_TUNNEL_BASE_URL = API_BASE_URL;

/**
 * Normalizes backslashes in profile image paths and constructs full image URL using former login host
 */
export function formatProfileImageUrl(rawPath?: string | null): string {
  if (!rawPath) {
    return 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80';
  }
  const cleanPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  return `${DEV_TUNNEL_BASE_URL}/storage/${cleanPath}`;
}

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem(AUTH_KEYS.TOKEN);
  } catch (err) {
    console.warn('Failed to load auth token from localStorage:', err);
    return null;
  }
}

export function getStoredAuthUser(): AuthUserData | null {
  try {
    const raw = localStorage.getItem(AUTH_KEYS.USER);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    console.warn('Failed to load auth user from localStorage:', err);
    return null;
  }
}

export function getStoredAuthImageUrl(): string | null {
  try {
    return localStorage.getItem(AUTH_KEYS.IMAGE_URL);
  } catch (err) {
    return null;
  }
}

export function setStoredAuth(token: string, user: AuthUserData, imageUrl: string): void {
  try {
    localStorage.setItem(AUTH_KEYS.TOKEN, token);
    localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(user));
    localStorage.setItem(AUTH_KEYS.IMAGE_URL, imageUrl);
  } catch (err) {
    console.warn('Failed to save auth credentials to localStorage:', err);
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem(AUTH_KEYS.TOKEN);
    localStorage.removeItem(AUTH_KEYS.USER);
    localStorage.removeItem(AUTH_KEYS.IMAGE_URL);
  } catch (err) {
    console.warn('Failed to clear auth storage:', err);
  }
}

/**
 * Returns Authorization header with stored bearer token
 */
export function getAuthHeaders(): Record<string, string> {
  const token = getStoredAuthToken();
  const headers: Record<string, string> = {
    'accept': '*/*',
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/**
 * Performs Login GET Request to backend dev tunnel API using former login URL host
 */
export async function loginUserApi(userNameVal: string, passwordVal: string): Promise<LoginResponse> {
  const url = `${DEV_TUNNEL_BASE_URL}/LocationTracker/User/Login?username=${encodeURIComponent(userNameVal)}&password=${encodeURIComponent(passwordVal)}`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'accept': '*/*',
      },
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Login failed (${response.status}): ${errText || response.statusText}`);
    }

    const json: LoginResponse = await response.json();
    if (!json.status) {
      throw new Error(json.message || 'Invalid credentials or login failed.');
    }

    return json;
  } catch (err: any) {
    throw err;
  }
}
