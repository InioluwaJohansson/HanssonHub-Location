import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Database,
  Navigation,
  Sun,
  Moon,
  Clock,
} from 'lucide-react';
import { AppTheme } from '../types';

interface HeaderBarProps {
  isTracking: boolean;
  theme: AppTheme;
  userName?: string;
  onToggleTracking: () => void;
  onResetTrail: () => void;
  onFastForwardDwell: () => void;
  onOpenDataCollected: () => void;
  onToggleTheme: () => void;
}

export const HeaderBar: React.FC<HeaderBarProps> = ({
  isTracking,
  theme,
  userName = 'Inioluwa',
  onToggleTracking,
  onResetTrail,
  onFastForwardDwell,
  onOpenDataCollected,
  onToggleTheme,
}) => {
  const isDark = theme === 'dark';

  return (
    <header
      id="app-header-bar"
      className={`w-full px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b select-none transition-colors duration-200 ${
        isDark
          ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
          : 'bg-white border-zinc-200 text-zinc-900'
      }`}
    >
      {/* App Identity & User Avatar */}
      <div className="flex items-center gap-3">
        <div
          className={`w-8 h-8 rounded-xl flex items-center justify-center border shadow-xs ${
            isDark
              ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
              : 'bg-zinc-100 text-zinc-800 border-zinc-300'
          }`}
        >
          <Navigation className="w-4 h-4" />
        </div>

        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-bold tracking-tight">
              Location &amp; Journey Tracker
            </h1>
            {/* User Name Pill (Inioluwa) */}
            <div
              className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1.5 ${
                isDark
                  ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                  : 'bg-zinc-100 text-zinc-700 border-zinc-200'
              }`}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{userName}</span>
            </div>
          </div>

          <p className="text-[11px] text-zinc-500">
            Trekking &bull; Vehicle &bull; Record Places &bull; Suggested Routes
          </p>
        </div>
      </div>

      {/* Action Controls */}
      <div className="flex items-center flex-wrap gap-2 text-xs">
        {/* Play / Pause Tracking */}
        <button
          id="tracking-toggle-btn"
          onClick={onToggleTracking}
          className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition-all shadow-xs ${
            isTracking
              ? isDark
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border border-zinc-300'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {isTracking ? (
            <>
              <Pause className="w-3.5 h-3.5" /> Pause GPS
            </>
          ) : (
            <>
              <Play className="w-3.5 h-3.5" /> Resume GPS
            </>
          )}
        </button>

        {/* Fast-forward 90s stay simulator button */}
        <button
          id="fastforward-dwell-btn"
          onClick={onFastForwardDwell}
          className={`px-2.5 py-1.5 rounded-xl font-medium flex items-center gap-1.5 border transition ${
            isDark
              ? 'bg-zinc-800/80 hover:bg-zinc-750 text-zinc-300 border-zinc-700'
              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
          }`}
          title="Simulate staying stationary for 90 seconds to trigger place recording"
        >
          <Clock className="w-3.5 h-3.5 text-zinc-400" />
          <span className="hidden sm:inline">Simulate 90s Stay</span>
        </button>

        {/* Data Collected Schema button */}
        <button
          id="data-collected-modal-btn"
          onClick={onOpenDataCollected}
          className={`px-3 py-1.5 rounded-xl font-medium flex items-center gap-1.5 border transition ${
            isDark
              ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
              : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          <span>Schema</span>
        </button>

        {/* Theme Toggle (Light / Dark) */}
        <button
          id="theme-toggle-btn"
          onClick={onToggleTheme}
          className={`p-1.5 rounded-xl border transition ${
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
          className={`p-1.5 rounded-xl border transition ${
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
