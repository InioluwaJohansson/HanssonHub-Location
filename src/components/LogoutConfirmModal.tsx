import React from 'react';
import { LogOut, AlertTriangle, X } from 'lucide-react';
import { AppTheme } from '../types';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  theme: AppTheme;
  userName?: string;
  onConfirmLogout: () => void;
  onCancel: () => void;
}

export const LogoutConfirmModal: React.FC<LogoutConfirmModalProps> = ({
  isOpen,
  theme,
  userName,
  onConfirmLogout,
  onCancel,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  return (
    <div
      id="logout-confirm-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-zinc-950/70 backdrop-blur-md"
        onClick={onCancel}
      />

      {/* Modal Card */}
      <div
        className={`relative w-full max-w-sm rounded-3xl p-6 shadow-2xl border backdrop-blur-2xl transition-all duration-200 z-10 ${
          isDark
            ? 'bg-zinc-900/95 border-zinc-800 text-zinc-100 shadow-zinc-950/80'
            : 'bg-white/95 border-zinc-200 text-zinc-900 shadow-zinc-500/30'
        }`}
      >
        <button
          onClick={onCancel}
          className={`absolute top-4 right-4 p-1.5 rounded-xl border transition cursor-pointer ${
            isDark
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700'
              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-200'
          }`}
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 shadow-inner">
            <AlertTriangle className="w-6 h-6 text-rose-500" />
          </div>

          <div>
            <h3 className="text-base font-extrabold tracking-tight">Confirm Log Out</h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
              Are you sure you want to log out{userName ? `, ${userName}` : ''}? Live location recording and data updates will be paused until you sign back in.
            </p>
          </div>

          <div className="flex items-center gap-3 w-full pt-2">
            <button
              type="button"
              onClick={onCancel}
              className={`flex-1 py-2.5 px-4 rounded-xl font-bold text-xs border transition cursor-pointer ${
                isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
              }`}
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={onConfirmLogout}
              className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs bg-rose-600 hover:bg-rose-500 active:scale-95 text-white border border-rose-400/40 shadow-lg hover:shadow-rose-600/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Yes, Log Out</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
