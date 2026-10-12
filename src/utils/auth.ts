/**
 * Authentication and LocalStorage Management for RouteTracker
 */

import { apiClient } from './apiClient';

export interface AuthUserData {
  id: number;
  userName: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  name?: string;
  roleName?: string;
  role?: number;
  personId?: number;
  authorizationCode?: string | null;
}

export interface LoginResponse {
  data: AuthUserData;
  token: string;
  imageUrl?: string;
  message?: string;
  status?: boolean;
}

export const AUTH_KEYS = {
  TOKEN: 'token',
  LEGACY_TOKEN: 'route_tracker_auth_token',
  USER: 'route_tracker_auth_user',
  IMAGE_URL: 'route_tracker_auth_image_url',
};

export const LOGIN_BASE_URL = 'https://kv5zhpcr-7044.uks1.devtunnels.ms';
export const API_BASE_URL = 'https://kv5zhpcr-7044.uks1.devtunnels.ms';
export const DEV_TUNNEL_BASE_URL = API_BASE_URL;

/**
 * Formats a user's display name as Firstname and Lastname
 */
export function formatUserFullName(user?: AuthUserData | null, fallbackUsername = 'inioluwa_johansson'): string {
  if (user) {
    if (user.firstName && user.lastName) {
      return `${user.firstName} ${user.lastName}`;
    }
    if (user.fullName) return user.fullName;
    if (user.name) return user.name;
    const raw = user.userName || fallbackUsername;
    if (raw) {
      return formatNameString(raw);
    }
  }
  if (fallbackUsername) {
    return formatNameString(fallbackUsername);
  }
  return 'Inioluwa Johansson';
}

/**
 * Formats any raw username, email, or identifier into Firstname and Lastname
 * e.g. "inioluwa_makinde" -> "Inioluwa Makinde", "john.doe" -> "John Doe"
 */
export function formatNameString(rawName?: string | null): string {
  if (!rawName) return '';
  const trimmed = rawName.trim();
  if (trimmed.toLowerCase() === 'you') return 'Inioluwa Johansson';
  
  // If user identifier like "User #3"
  if (/^User\s*#?\d+$/i.test(trimmed)) {
    return trimmed;
  }

  // Remove email domain if an email was passed as username
  const withoutDomain = trimmed.includes('@') ? trimmed.split('@')[0] : trimmed;

  // Split on underscores, dots, hyphens or spaces
  const parts = withoutDomain
    .split(/[_.\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());

  if (parts.length > 0) {
    return parts.join(' ');
  }
  return trimmed;
}

/**
 * Normalizes backslashes in profile image paths and constructs full image URL using API base host
 */
export function formatProfileImageUrl(rawPath?: string | null): string {
  if (!rawPath || !rawPath.trim()) {
    return '';
  }
  if (rawPath.startsWith('http://') || rawPath.startsWith('https://')) {
    return rawPath;
  }
  const cleanPath = rawPath.replace(/\\/g, '/').replace(/^\/+/, '');
  if (cleanPath.startsWith('storage/')) {
    return `${DEV_TUNNEL_BASE_URL}/${cleanPath}`;
  }
  return `${DEV_TUNNEL_BASE_URL}/storage/${cleanPath}`;
}

export function getStoredAuthToken(): string | null {
  try {
    return localStorage.getItem('token') || localStorage.getItem(AUTH_KEYS.LEGACY_TOKEN);
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
    localStorage.setItem('token', token);
    localStorage.setItem(AUTH_KEYS.TOKEN, token);
    localStorage.setItem(AUTH_KEYS.LEGACY_TOKEN, token);
    localStorage.setItem(AUTH_KEYS.USER, JSON.stringify(user));
    localStorage.setItem(AUTH_KEYS.IMAGE_URL, imageUrl);
  } catch (err) {
    console.warn('Failed to save auth credentials to localStorage:', err);
  }
}

export function clearStoredAuth(): void {
  try {
    localStorage.removeItem('token');
    localStorage.removeItem(AUTH_KEYS.TOKEN);
    localStorage.removeItem(AUTH_KEYS.LEGACY_TOKEN);
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
 * Performs Login GET Request to backend dev tunnel API:
 * GET https://kv5zhpcr-7044.uks1.devtunnels.ms/LocationTracker/User/Login?username=inioluwa_johansson&password=Johansson13
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

    const json = await response.json();
    
    // Normalize response if returned wrapped in data or directly
    const token = json.token || json.Token || json.data?.token || json.data?.Token || (typeof json.data === 'string' ? json.data : '');
    const rawUser = json.data?.id || json.data?.Id ? json.data : (json.id || json.Id ? json : json.data || json);
    
    const userData: AuthUserData = {
      id: Number(rawUser?.id ?? rawUser?.Id ?? 1),
      userName: String(rawUser?.userName ?? rawUser?.UserName ?? userNameVal),
      firstName: rawUser?.firstName ?? rawUser?.FirstName,
      lastName: rawUser?.lastName ?? rawUser?.LastName,
      fullName: rawUser?.fullName ?? rawUser?.FullName ?? rawUser?.name ?? rawUser?.Name,
      roleName: String(rawUser?.roleName ?? rawUser?.RoleName ?? 'Owner'),
      role: Number(rawUser?.role ?? rawUser?.Role ?? 1),
      personId: Number(rawUser?.personId ?? rawUser?.PersonId ?? 1),
      authorizationCode: null,
    };
    
    const imageUrl = json.imageUrl || json.ImageUrl || json.data?.imageUrl || json.data?.ImageUrl || rawUser?.imageUrl || rawUser?.ImageUrl || '';

    return {
      data: userData,
      token,
      imageUrl,
      status: json.status !== false,
      message: json.message || 'Login Successful',
    };
  } catch (err: any) {
    throw err;
  }
}
