import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  AlertCircle,
  MapPin,
  Navigation,
  CheckCircle2,
  X,
  Layers,
  Clock,
  Trash2,
  ChevronUp,
} from 'lucide-react';
import { ToastNotification } from '../App';

interface NotificationStackProps {
  notifications: ToastNotification[];
  onDismiss: (id: number) => void;
  onClearAll: () => void;
  isDark: boolean;
}

export const NotificationStack: React.FC<NotificationStackProps> = ({
  notifications,
  onDismiss,
  onClearAll,
  isDark,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  // Store remaining time (ms) for each notification ID (default 10,000ms = 10s)
  const remainingTimesRef = useRef<Map<number, number>>(new Map());
  const [remainingPercentages, setRemainingPercentages] = useState<{ [id: number]: number }>({});
  const lastTickTimeRef = useRef<number>(Date.now());

  // Initialize remaining times for newly arrived notifications
  useEffect(() => {
    notifications.forEach((n) => {
      if (!remainingTimesRef.current.has(n.id)) {
        remainingTimesRef.current.set(n.id, 10000);
      }
    });

    // Clean up IDs that are no longer in notifications
    const activeIds = new Set(notifications.map((n) => n.id));
    Array.from(remainingTimesRef.current.keys()).forEach((id) => {
      if (!activeIds.has(id)) {
        remainingTimesRef.current.delete(id);
      }
    });
  }, [notifications]);

  // Run 10s countdown tick when not hovered
  useEffect(() => {
    if (notifications.length === 0) return;

    lastTickTimeRef.current = Date.now();

    const interval = setInterval(() => {
      const now = Date.now();
      const delta = now - lastTickTimeRef.current;
      lastTickTimeRef.current = now;

      if (isHovered) {
        // Paused while user hovers to read details!
        return;
      }

      const updatedPercents: { [id: number]: number } = {};
      const toDismiss: number[] = [];

      remainingTimesRef.current.forEach((timeLeft, id) => {
        const newTime = timeLeft - delta;
        if (newTime <= 0) {
          toDismiss.push(id);
        } else {
          remainingTimesRef.current.set(id, newTime);
          updatedPercents[id] = Math.max(0, Math.min(100, (newTime / 10000) * 100));
        }
      });

      setRemainingPercentages(updatedPercents);

      // Dismiss any that reached 0
      toDismiss.forEach((id) => {
        remainingTimesRef.current.delete(id);
        onDismiss(id);
      });
    }, 100);

    return () => clearInterval(interval);
  }, [notifications, isHovered, onDismiss]);

  if (notifications.length === 0) return null;

  // Render appropriate badge icon & colors depending on notification type
  const getNotificationTheme = (notif: ToastNotification) => {
    const titleLower = (notif.title || '').toLowerCase();
    const isCancelled = notif.isCancelledType || titleLower.includes('cancel');
    const isSuccess =
      titleLower.includes('complet') ||
      titleLower.includes('arriv') ||
      titleLower.includes('success');
    const isMarker = titleLower.includes('marker');
    const isJourney = titleLower.includes('journey') || titleLower.includes('navigation');

    if (isCancelled) {
      return {
        badgeBg: 'bg-rose-500/15 border-rose-500/30 text-rose-500',
        borderColor: isDark ? 'border-rose-500/50' : 'border-rose-500/40',
        glowColor: isDark ? 'shadow-rose-950/40' : 'shadow-rose-500/15',
        titleColor: 'text-rose-500',
        progressBarColor: 'bg-rose-500',
        icon: <AlertCircle className="w-4 h-4 text-rose-500" />,
      };
    }
    if (isSuccess) {
      return {
        badgeBg: 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500',
        borderColor: isDark ? 'border-emerald-500/40' : 'border-emerald-500/30',
        glowColor: isDark ? 'shadow-emerald-950/40' : 'shadow-emerald-500/15',
        titleColor: 'text-emerald-500',
        progressBarColor: 'bg-emerald-500',
        icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      };
    }
    if (isMarker) {
      return {
        badgeBg: 'bg-sky-500/15 border-sky-500/30 text-sky-500',
        borderColor: isDark ? 'border-sky-500/40' : 'border-sky-500/30',
        glowColor: isDark ? 'shadow-sky-950/40' : 'shadow-sky-500/15',
        titleColor: 'text-sky-500',
        progressBarColor: 'bg-sky-500',
        icon: <MapPin className="w-4 h-4 text-sky-500" />,
      };
    }
    if (isJourney) {
      return {
        badgeBg: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-500',
        borderColor: isDark ? 'border-indigo-500/40' : 'border-indigo-500/30',
        glowColor: isDark ? 'shadow-indigo-950/40' : 'shadow-indigo-500/15',
        titleColor: 'text-indigo-400',
        progressBarColor: 'bg-indigo-500',
        icon: <Navigation className="w-4 h-4 text-indigo-400" />,
      };
    }

    return {
      badgeBg: 'bg-blue-500/15 border-blue-500/30 text-blue-500',
      borderColor: isDark ? 'border-blue-500/40' : 'border-blue-500/30',
      glowColor: isDark ? 'shadow-blue-950/40' : 'shadow-blue-500/15',
      titleColor: 'text-blue-500',
      progressBarColor: 'bg-blue-500',
      icon: <Bell className="w-4 h-4 text-blue-500" />,
    };
  };

  const count = notifications.length;

  return (
    <div
      id="notification-banner-stack-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="fixed bottom-6 right-6 z-50 pointer-events-auto select-none transition-all duration-300 max-w-sm w-[calc(100vw-2.5rem)] sm:w-96"
    >
      {/* Expanded Header Bar when Hovered */}
      {isHovered && count > 1 && (
        <div
          className={`flex items-center justify-between px-3 py-1.5 mb-2 rounded-xl border backdrop-blur-md text-xs font-semibold shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200 ${
            isDark
              ? 'bg-zinc-900/95 border-zinc-700/80 text-zinc-300'
              : 'bg-white/95 border-zinc-200/90 text-zinc-700'
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-blue-500" />
            <span>
              {count} Active Notification{count > 1 ? 's' : ''}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 font-medium">
              Paused
            </span>
          </div>
          <button
            type="button"
            onClick={onClearAll}
            className="flex items-center gap-1 text-[11px] text-zinc-400 hover:text-rose-400 transition cursor-pointer px-1 py-0.5 rounded hover:bg-rose-500/10"
            title="Clear all notifications"
          >
            <Trash2 className="w-3 h-3" />
            <span>Clear all</span>
          </button>
        </div>
      )}

      {/* Main Container: Stacks when NOT hovered, Opens up to see full details when hovered */}
      <div
        className={`relative transition-all duration-300 ease-out ${
          isHovered
            ? 'flex flex-col gap-2.5 max-h-[75vh] overflow-y-auto no-scrollbar pr-0.5'
            : 'relative h-24'
        }`}
      >
        {notifications.map((notif, index) => {
          const themeStyles = getNotificationTheme(notif);
          const percent = remainingPercentages[notif.id] ?? 100;
          const timeAgo = Math.max(0, Math.round((Date.now() - notif.timestamp) / 1000));
          const timeFormatted =
            timeAgo < 5 ? 'Just now' : `${timeAgo}s ago`;

          // When collapsed / not hovered, calculate stacking offsets
          // Index 0 is the newest notification (at top/front of stack)
          const stackDepth = index;
          const isFrontCard = stackDepth === 0;

          // Maximum 3 visible cards stacked behind in collapsed mode
          if (!isHovered && stackDepth > 2) {
            return null;
          }

          // Collapsed transformation: cards stack directly in front / behind each other
          const collapsedTransform = !isHovered
            ? `translateY(-${stackDepth * 8}px) scale(${1 - stackDepth * 0.04})`
            : 'translateY(0) scale(1)';

          const collapsedOpacity = !isHovered
            ? Math.max(0.4, 1 - stackDepth * 0.2)
            : 1;

          const zIndex = !isHovered ? 30 - stackDepth : 10 + index;

          return (
            <div
              key={notif.id}
              style={{
                transform: collapsedTransform,
                opacity: collapsedOpacity,
                zIndex,
              }}
              className={`rounded-2xl border shadow-xl backdrop-blur-xl transition-all duration-300 ease-out overflow-hidden ${
                !isHovered ? 'absolute inset-x-0 bottom-0 origin-bottom' : 'relative w-full'
              } ${
                isDark
                  ? `bg-zinc-900/95 ${themeStyles.borderColor} text-zinc-100 ${themeStyles.glowColor}`
                  : `bg-white/95 ${themeStyles.borderColor} text-zinc-900 ${themeStyles.glowColor}`
              }`}
            >
              {/* Card Content */}
              <div className="p-3.5 flex items-start gap-3">
                {/* User/Category Avatar or Icon Badge */}
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 shadow-xs border ${themeStyles.badgeBg}`}
                >
                  {themeStyles.icon}
                </div>

                {/* Details Body */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className={`text-xs font-extrabold uppercase tracking-wide truncate ${themeStyles.titleColor}`}>
                        {notif.title}
                      </span>
                      {/* User Attribution pill */}
                      {notif.userName && (
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.2 rounded-md bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 truncate max-w-[90px]"
                          style={{ borderLeft: `2.5px solid ${notif.userColor || '#3B82F6'}` }}
                        >
                          {notif.userName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0 text-[10px] text-zinc-400">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{timeFormatted}</span>
                    </div>
                  </div>

                  {/* Message details */}
                  <p
                    className={`text-xs mt-1 text-zinc-700 dark:text-zinc-200 leading-snug font-medium ${
                      !isHovered ? 'line-clamp-2' : ''
                    }`}
                  >
                    {notif.message}
                  </p>
                </div>

                {/* Dismiss Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDismiss(notif.id);
                  }}
                  className="p-1 -mr-1 -mt-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-zinc-800/60 transition cursor-pointer shrink-0"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Stacked Indicator Hint (Only shown on front card when collapsed and count > 1) */}
              {!isHovered && isFrontCard && count > 1 && (
                <div
                  className={`px-3 py-1 text-[10px] font-semibold flex items-center justify-between border-t ${
                    isDark
                      ? 'bg-zinc-950/60 border-zinc-800 text-zinc-400'
                      : 'bg-zinc-100/70 border-zinc-200 text-zinc-500'
                  }`}
                >
                  <div className="flex items-center gap-1">
                    <Layers className="w-3 h-3 text-blue-500" />
                    <span>
                      +{count - 1} more notification{count - 1 > 1 ? 's' : ''} stacked
                    </span>
                  </div>
                  <div className="flex items-center gap-0.5 text-blue-400">
                    <span>Hover to see all</span>
                    <ChevronUp className="w-3 h-3" />
                  </div>
                </div>
              )}

              {/* 10s Countdown Animated Progress Bar at Bottom Edge */}
              <div
                className={`w-full h-1 overflow-hidden ${
                  isDark ? 'bg-zinc-800/60' : 'bg-zinc-200/60'
                }`}
              >
                <div
                  className={`h-full transition-all duration-100 ease-linear ${themeStyles.progressBarColor}`}
                  style={{
                    width: `${percent}%`,
                    opacity: isHovered ? 0.4 : 0.85,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
