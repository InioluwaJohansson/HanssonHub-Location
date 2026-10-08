import React, { useState, useEffect, useCallback } from 'react';
import {
  CloudSun,
  Car,
  RefreshCw,
  ExternalLink,
  Volume2,
  VolumeX,
  MapPin,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Radio,
} from 'lucide-react';
import { speakVoice } from '../utils/voiceNavigation';

export interface GroundedSource {
  title: string;
  uri: string;
}

export interface StationaryNewsData {
  weatherSummary: string;
  trafficSummary: string;
  locationName?: string;
  alertBadge?: string;
  temperature?: string;
  trafficStatus?: 'Clear' | 'Moderate' | 'Heavy' | string;
}

interface StationaryNewsCardProps {
  lat: number;
  lng: number;
  speedKmH: number;
  isStationary: boolean;
  locationName?: string;
  isDark?: boolean;
}

export const StationaryNewsCard: React.FC<StationaryNewsCardProps> = ({
  lat,
  lng,
  speedKmH,
  isStationary,
  locationName,
  isDark = true,
}) => {
  const [data, setData] = useState<StationaryNewsData | null>(null);
  const [sources, setSources] = useState<GroundedSource[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [lastFetchedKey, setLastFetchedKey] = useState<string | null>(null);

  const fetchStationaryNews = useCallback(
    async (force = false) => {
      if (!lat || !lng) return;

      const currentKey = `${lat.toFixed(3)},${lng.toFixed(3)}`;
      if (!force && currentKey === lastFetchedKey && data) {
        return; // Avoid unnecessary refetches at same stationary point
      }

      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch('/api/stationary-news', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            lat,
            lng,
            locationName,
            speedKmH: Math.round(speedKmH),
          }),
        });

        if (!res.ok) {
          throw new Error(`Server returned status ${res.status}`);
        }

        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data);
          setSources(json.searchSources || []);
          setLastFetchedKey(currentKey);
        } else {
          throw new Error(json.error || 'Failed to parse response');
        }
      } catch (err: any) {
        console.warn('Stationary news fetch failed:', err);
        setError('Unable to fetch live local weather/traffic via Gemini Search Grounding.');
      } finally {
        setIsLoading(false);
      }
    },
    [lat, lng, speedKmH, locationName, lastFetchedKey, data]
  );

  // Auto-fetch when user becomes stationary or location updates while stationary
  useEffect(() => {
    if (isStationary || speedKmH <= 1.5) {
      const timer = setTimeout(() => {
        fetchStationaryNews();
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isStationary, speedKmH, fetchStationaryNews]);

  const handleSpeakSummary = () => {
    if (!data) return;
    if (isSpeaking) {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
      return;
    }

    const textToSpeak = `Stationary update for ${data.locationName || 'your area'}. Weather: ${data.weatherSummary}. Traffic: ${data.trafficSummary}.`;
    setIsSpeaking(true);
    speakVoice(textToSpeak, true);

    setTimeout(() => {
      setIsSpeaking(false);
    }, 12000);
  };

  const getTrafficColor = (status?: string) => {
    switch (status?.toLowerCase()) {
      case 'heavy':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'moderate':
        return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
      case 'clear':
      default:
        return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    }
  };

  return (
    <div
      className={`rounded-2xl border p-4 shadow-xl transition-all duration-300 backdrop-blur-md ${
        isDark
          ? 'bg-zinc-900/90 border-zinc-800 text-zinc-100 shadow-black/40'
          : 'bg-white/95 border-zinc-200 text-zinc-900 shadow-zinc-300/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800/60 pb-3 mb-3">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-3 w-3">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                isStationary || speedKmH <= 1.5 ? 'bg-emerald-400' : 'bg-blue-400'
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-3 w-3 ${
                isStationary || speedKmH <= 1.5 ? 'bg-emerald-500' : 'bg-blue-500'
              }`}
            ></span>
          </div>

          <div>
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Stationary Spot Insights</span>
            </div>
            <p className="text-[11px] text-zinc-400 flex items-center gap-1">
              <MapPin className="w-3 h-3 text-zinc-500 inline" />
              {locationName || `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`}
              {speedKmH <= 1.5 && (
                <span className="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Stopped
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {data && (
            <button
              onClick={handleSpeakSummary}
              className={`p-1.5 rounded-lg border transition cursor-pointer ${
                isSpeaking
                  ? 'bg-blue-600 text-white border-blue-500'
                  : isDark
                  ? 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700'
                  : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:bg-zinc-200'
              }`}
              title={isSpeaking ? 'Stop Voice' : 'Read Weather & Traffic Aloud'}
            >
              {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            onClick={() => fetchStationaryNews(true)}
            disabled={isLoading}
            className={`p-1.5 rounded-lg border transition cursor-pointer ${
              isLoading ? 'opacity-50 animate-spin' : ''
            } ${
              isDark
                ? 'bg-zinc-800/80 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-700'
                : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:bg-zinc-200'
            }`}
            title="Refresh Grounded Search Data"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Content Body */}
      {isLoading && !data ? (
        <div className="py-6 flex flex-col items-center justify-center gap-2 text-center">
          <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
          <p className="text-xs text-zinc-400 font-medium">
            Fetching today's weather & traffic news via Gemini Grounded Search...
          </p>
        </div>
      ) : error && !data ? (
        <div className="py-3 px-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Search Grounding Warning</p>
            <p className="text-[11px] opacity-90">{error}</p>
            <button
              onClick={() => fetchStationaryNews(true)}
              className="mt-2 px-2.5 py-1 text-[10px] font-semibold rounded-lg bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-300 cursor-pointer"
            >
              Retry Search
            </button>
          </div>
        </div>
      ) : data ? (
        <div className="space-y-3">
          {/* Badge & Temperature Row */}
          <div className="flex items-center justify-between gap-2">
            {data.alertBadge && (
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400">
                {data.alertBadge}
              </span>
            )}
            {data.trafficStatus && (
              <span
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${getTrafficColor(
                  data.trafficStatus
                )}`}
              >
                Traffic: {data.trafficStatus}
              </span>
            )}
          </div>

          {/* Today's Weather Section */}
          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
            <div className="flex items-center gap-2 text-xs font-semibold text-blue-400 mb-1">
              <CloudSun className="w-4 h-4" />
              <span>Today's Weather</span>
              {data.temperature && (
                <span className="ml-auto text-xs font-bold text-zinc-300 bg-blue-500/10 px-2 py-0.5 rounded-md border border-blue-500/20">
                  {data.temperature}
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">{data.weatherSummary}</p>
          </div>

          {/* Local Traffic News Section */}
          <div className={`p-2.5 rounded-xl border ${isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'}`}>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 mb-1">
              <Car className="w-4 h-4" />
              <span>Traffic & Road News</span>
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">{data.trafficSummary}</p>
          </div>

          {/* Grounding Sources / Links */}
          {sources.length > 0 && (
            <div className="pt-2 border-t border-zinc-800/60">
              <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-400" /> Grounded Search Sources
              </p>
              <div className="flex flex-wrap gap-1.5">
                {sources.map((src, i) => (
                  <a
                    key={i}
                    href={src.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-lg border transition truncate max-w-[200px] ${
                      isDark
                        ? 'bg-zinc-800/60 border-zinc-700 text-zinc-300 hover:text-white hover:border-emerald-500/50'
                        : 'bg-zinc-100 border-zinc-200 text-zinc-700 hover:text-zinc-900 hover:border-emerald-500/50'
                    }`}
                  >
                    <span className="truncate">{src.title}</span>
                    <ExternalLink className="w-2.5 h-2.5 shrink-0 opacity-70" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-4 text-center">
          <p className="text-xs text-zinc-400">
            Click refresh or pause movement to view hyper-local grounded search news.
          </p>
          <button
            onClick={() => fetchStationaryNews(true)}
            className="mt-2.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer transition shadow-lg shadow-emerald-900/30"
          >
            Fetch Spot Insights
          </button>
        </div>
      )}
    </div>
  );
};
