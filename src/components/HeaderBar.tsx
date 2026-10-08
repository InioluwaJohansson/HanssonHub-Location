import React from 'react';
import {
  RotateCcw,
  Sun,
  Moon,
  LogIn,
  LogOut,
  User,
} from 'lucide-react';
import { AppTheme } from '../types';

interface HeaderBarProps {
  theme: AppTheme;
  userName?: string;
  userAvatarUrl?: string;
  isLoggedIn?: boolean;
  onResetTrail: () => void;
  onToggleTheme: () => void;
  onOpenLoginOverlay: () => void;
  onLogoutClick: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  theme,
  userName = 'inioluwa_johansson',
  userAvatarUrl,
  isLoggedIn = false,
  onResetTrail,
  onToggleTheme,
  onOpenLoginOverlay,
  onLogoutClick,
}) => {
  const isDark = theme === 'dark';

  return (
    <header
      id="app-header-bar"
      className={`w-full px-4 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-3 border-b select-none transition-colors duration-200 ${
        isDark
          ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
          : 'bg-white border-zinc-200 text-zinc-900'
      }`}
    >
      {/* LEFT: User Profile Image & Name */}
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
              src={userAvatarUrl}
              alt={userName}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
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
              {userName}
            </span>
          </div>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
            {isLoggedIn ? 'Authenticated User' : 'Guest Mode'}
          </span>
        </div>
      </div>

      {/* CENTER: App Title & Subtitle */}
      <div className="flex flex-col items-center justify-center text-center flex-1 min-w-[200px]">
        <h1 className="text-sm sm:text-base font-black tracking-tight">
          Location &amp; Journey Tracker
        </h1>
        <p className="text-[10px] sm:text-[11px] text-zinc-500 dark:text-zinc-400 font-medium">
          Walking &bull; Vehicle &bull; Airplane &bull; Record Places &bull; Suggested Routes
        </p>
      </div>

      {/* RIGHT: Action Controls & Red Logout / Login Button */}
      <div className="flex items-center justify-end gap-2 text-xs sm:w-1/4 min-w-[180px]">
        {/* Red Theme Logout Button when Logged In, or Blue Login Button when Logged Out */}
        {isLoggedIn ? (
          <button
            id="app-logout-btn"
            onClick={onLogoutClick}
            className="px-3.5 py-1.5 rounded-xl font-bold flex items-center gap-1.5 bg-rose-600/15 hover:bg-rose-600/25 active:scale-95 text-rose-500 hover:text-rose-400 border border-rose-500/30 transition cursor-pointer shadow-xs"
            title="Log out of current session"
          >
            <LogOut className="w-3.5 h-3.5 text-rose-500" />
            <span>Logout</span>
          </button>
        ) : (
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

        {/* Reset Trail */}
        <button
          id="reset-trail-btn"
          onClick={onResetTrail}
          className={`p-1.5 rounded-xl border transition cursor-pointer ${
            isDark
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 border-zinc-700'
              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-700 border-zinc-300'
          }`}
          title="Reset trail and recorded logs"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
