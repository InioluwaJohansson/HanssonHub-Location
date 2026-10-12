import React from 'react';
import {
  Sun,
  Moon,
  LogIn,
  LogOut,
  User,
} from 'lucide-react';
import { AppTheme } from '../types';
import { formatProfileImageUrl } from '../utils/auth';

interface HeaderBarProps {
  theme: AppTheme;
  userName?: string;
  userFullName?: string;
  userAvatarUrl?: string;
  isLoggedIn?: boolean;
  onToggleTheme: () => void;
  onOpenLoginOverlay: () => void;
  onLogoutClick: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  theme,
  userName = 'inioluwa_johansson',
  userFullName = 'Inioluwa Johansson',
  userAvatarUrl,
  isLoggedIn = false,
  onToggleTheme,
  onOpenLoginOverlay,
  onLogoutClick,
}) => {
  const isDark = theme === 'dark';
  const displayName = userFullName || userName || 'Inioluwa Johansson';

  return (
    <header
      id="app-header-bar"
      className={`w-full px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 border-b select-none transition-colors duration-200 ${
        isDark
          ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
          : 'bg-white border-zinc-200 text-zinc-900'
      }`}
    >
      {/* LEFT: User Profile Image & Name (firstname and lastname) */}
      <div className="flex items-center gap-2.5 sm:w-1/4 min-w-[180px]">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center border-2 shadow-xs overflow-hidden shrink-0 ${
            isDark
              ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
              : 'bg-zinc-100 text-zinc-800 border-zinc-300'
          }`}
        >
          {userAvatarUrl ? (
            <img
              src={formatProfileImageUrl(userAvatarUrl)}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                const target = e.target as HTMLImageElement;
                if (!target.dataset.retried && userAvatarUrl.includes('/storage/')) {
                  target.dataset.retried = 'true';
                  const storageSubPath = userAvatarUrl.split('/storage/')[1];
                  target.src = `/storage/${storageSubPath}`;
                  return;
                }
                target.style.display = 'none';
              }}
            />
          ) : (
            <User className="w-4 h-4 text-blue-500" />
          )}
        </div>

        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                isLoggedIn ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
              }`}
            />
            <span className="text-xs sm:text-sm font-extrabold truncate tracking-tight">
              {displayName}
            </span>
          </div>
        </div>
      </div>

      {/* CENTER: App Title & Subtitle */}
      <div className="flex flex-col items-center justify-center text-center flex-1 min-w-[200px]">
        <h1 className="text-sm sm:text-base font-black tracking-tight">
          Location &amp; Journey Tracker
        </h1>
        <p className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
          Walking &bull; Vehicle &bull; Airplane &bull; Suggested Routes
        </p>
      </div>

      {/* RIGHT: Action Controls & Buttons */}
      <div className="flex items-center justify-end gap-2 text-xs sm:w-1/4 min-w-[180px]">
        {/* Blue Login Button when Logged Out */}
        {!isLoggedIn && (
          <button
            id="open-login-overlay-btn"
            onClick={onOpenLoginOverlay}
            className="px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 bg-blue-600/15 hover:bg-blue-600/25 active:scale-95 text-blue-500 border border-blue-500/30 transition cursor-pointer shadow-xs"
            title="Login to authorized session"
          >
            <LogIn className="w-3.5 h-3.5 text-blue-500" />
            <span>Login / Account</span>
          </button>
        )}

        {/* Theme Toggle (Light / Dark) */}
        <button
          id="theme-toggle-btn"
          onClick={onToggleTheme}
          className={`p-1.5 rounded-xl border transition cursor-pointer ${
            isDark
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
          }`}
          title={`Switch to ${isDark ? 'Soft Light' : 'Soft Black'} Theme`}
        >
          {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Logout button placed after the theme toggle button */}
        {isLoggedIn && (
          <button
            id="app-logout-btn"
            onClick={onLogoutClick}
            className="px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 bg-rose-600/15 hover:bg-rose-600/25 active:scale-95 text-rose-500 hover:text-rose-400 border border-rose-500/30 transition cursor-pointer shadow-xs"
            title="Log out of current session"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500" />
            <span>Logout</span>
          </button>
        )}
      </div>
    </header>
  );
};
