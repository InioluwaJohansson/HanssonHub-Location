import React, { useState } from 'react';
import {
  Lock,
  User,
  LogIn,
  AlertCircle,
  CheckCircle2,
  X,
  ShieldCheck,
  KeyRound,
  ArrowLeft,
  Sparkles,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  loginUserApi,
  setStoredAuth,
  formatProfileImageUrl,
  AuthUserData,
  LoginResponse,
} from '../utils/auth';
import { AppTheme } from '../types';

interface LoginOverlayProps {
  isOpen: boolean;
  theme: AppTheme;
  currentUser?: AuthUserData | null;
  onLoginSuccess: (token: string, user: AuthUserData, imageUrl: string) => void;
  onClose?: () => void;
}

export const LoginOverlay: React.FC<LoginOverlayProps> = ({
  isOpen,
  theme,
  currentUser,
  onLoginSuccess,
  onClose,
}) => {
  if (!isOpen) return null;

  const isDark = theme === 'dark';

  const [userName, setUserName] = useState('inioluwa_johansson');
  const [password, setPassword] = useState('Johansson13');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userName.trim() || !password.trim()) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res: LoginResponse = await loginUserApi(userName.trim(), password.trim());
      const fullAvatarUrl = formatProfileImageUrl(res.imageUrl);

      // Save token, user data, and full image url in localstorage
      setStoredAuth(res.token, res.data, fullAvatarUrl);
      setSuccessMessage('Login Successful! Authenticating session...');

      setTimeout(() => {
        onLoginSuccess(res.token, res.data, fullAvatarUrl);
      }, 600);
    } catch (err: any) {
      console.error('Login Error:', err);
      setErrorMessage(
        err.message || 'Login failed. Please verify your credentials and network connection.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handlePrefillDemo = () => {
    setUserName('inioluwa_johansson');
    setPassword('Johansson13');
    setErrorMessage(null);
  };

  return (
    <div
      id="login-overlay-container"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-200"
    >
      {/* Grainy Transparent Background Overlay */}
      <div
        className={`absolute inset-0 backdrop-blur-xl transition-colors duration-300 ${
          isDark
            ? 'bg-zinc-950/80 text-zinc-100'
            : 'bg-zinc-900/65 text-zinc-900'
        }`}
      >
        {/* Grain Noise SVG Overlay Pattern */}
        <div
          className="absolute inset-0 opacity-[0.08] pointer-events-none mix-blend-overlay"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />
      </div>

      {/* Login Card Modal */}
      <div
        className={`relative w-full max-w-md rounded-3xl p-6 sm:p-8 shadow-2xl border backdrop-blur-2xl transition-all duration-200 z-10 ${
          isDark
            ? 'bg-zinc-900/90 border-zinc-800 text-zinc-100 shadow-zinc-950/50'
            : 'bg-white/95 border-zinc-200/80 text-zinc-900 shadow-zinc-500/20'
        }`}
      >
        {/* Top Header Controls (Back / Close) */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center border shadow-xs ${
                isDark
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'bg-blue-50 text-blue-600 border-blue-200'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-blue-500">
                Location Tracker
              </span>
              <h2 className="text-base font-extrabold tracking-tight">User Authentication</h2>
            </div>
          </div>

          {onClose && (
            <button
              id="close-login-overlay-btn"
              onClick={onClose}
              className={`p-2 rounded-xl transition cursor-pointer border ${
                isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700'
                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600 border-zinc-200'
              }`}
              title="Close login overlay"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Current Authenticated User Banner if already logged in */}
        {currentUser && (
          <div
            className={`mb-5 p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
              isDark
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                : 'bg-emerald-50 border-emerald-200 text-emerald-800'
            }`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
              <span className="truncate">
                Logged in as <strong>{currentUser.userName}</strong> ({currentUser.roleName})
              </span>
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="text-[11px] font-bold underline cursor-pointer shrink-0"
              >
                Return to App
              </button>
            )}
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
          {/* Username Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold flex items-center justify-between">
              <span>Username</span>
              <span className="text-[10px] text-zinc-400">Required</span>
            </label>
            <div className="relative">
              <User
                className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${
                  isDark ? 'text-zinc-500' : 'text-zinc-400'
                }`}
              />
              <input
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                placeholder="Enter username..."
                disabled={isLoading}
                autoComplete="off"
                name="username_no_autocomplete"
                className={`w-full pl-10 pr-4 py-2.5 text-xs rounded-2xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDark
                    ? 'bg-zinc-950/80 border-zinc-800 text-zinc-100 placeholder:text-zinc-600'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold flex items-center justify-between">
              <span>Password</span>
              <span className="text-[10px] text-zinc-400">Required</span>
            </label>
            <div className="relative">
              <KeyRound
                className={`absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 ${
                  isDark ? 'text-zinc-500' : 'text-zinc-400'
                }`}
              />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password..."
                disabled={isLoading}
                autoComplete="new-password"
                name="password_no_autocomplete"
                className={`w-full pl-10 pr-10 py-2.5 text-xs rounded-2xl border transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  isDark
                    ? 'bg-zinc-950/80 border-zinc-800 text-zinc-100 placeholder:text-zinc-600'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900 placeholder:text-zinc-400'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg transition cursor-pointer ${
                  isDark
                    ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                    : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/60'
                }`}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {/* Quick Fill Preset Credentials Button */}
          <div className="flex items-center justify-between text-[11px] pt-1">
            <button
              type="button"
              onClick={handlePrefillDemo}
              className="text-blue-500 hover:text-blue-400 font-medium flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3 h-3" />
              <span>Fill Credentials (inioluwa_johansson)</span>
            </button>
          </div>

          {/* Error Message Alert */}
          {errorMessage && (
            <div
              className={`p-3 rounded-2xl border text-xs flex items-start gap-2 animate-in fade-in duration-150 ${
                isDark
                  ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}
            >
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Message Alert */}
          {successMessage && (
            <div
              className={`p-3 rounded-2xl border text-xs flex items-center gap-2 animate-in fade-in duration-150 ${
                isDark
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Action Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 active:scale-[0.98] text-white font-bold text-xs shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 cursor-pointer border border-blue-400/30 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Authenticating User...</span>
              </>
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>Sign In &amp; Authorize</span>
              </>
            )}
          </button>
        </form>

        {/* Footer info notice */}
        <div className="mt-5 pt-4 border-t border-zinc-200/50 dark:border-zinc-800/80 text-[11px] text-zinc-500 text-center">
          Authorization tokens are stored securely in <code>localStorage</code> and appended to all API requests as Bearer headers.
        </div>
      </div>
    </div>
  );
};
