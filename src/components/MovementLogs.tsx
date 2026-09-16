import React, { useState } from 'react';
import {
  JourneySegment,
  RecordedPlace,
  TrackingStats,
  LocationPoint,
  CustomMarker,
  RouteOption,
  AppTheme,
  CompletedRouteLog,
  AppUser,
} from '../types';
import {
  Footprints,
  Car,
  MapPin,
  Clock,
  ArrowRight,
  Download,
  Copy,
  Check,
  Layers,
  Database,
  Search,
  Route,
  Trash2,
  Gauge,
  Navigation,
  Pencil,
  CheckCircle2,
  Users,
} from 'lucide-react';
import { formatDistance, formatDuration, formatSpeed } from '../utils/geo';

interface MovementLogsProps {
  segments: JourneySegment[];
  recordedPlaces: RecordedPlace[];
  customMarkers: CustomMarker[];
  routes: RouteOption[];
  completedRoutes?: CompletedRouteLog[];
  selectedRouteId: string | null;
  selectedSegmentId: string | null;
  currentPoint: LocationPoint | null;
  stats: TrackingStats;
  theme: AppTheme;
  isNavigating?: boolean;
  allUsers?: AppUser[];
  selectedUserIdFilter?: string;
  onSelectUserFilter?: (userId: string) => void;
  onStartNavigation?: () => void;
  onClearRoute?: () => void;
  onSelectSegment: (segmentId: string | null) => void;
  onSelectPlace: (place: RecordedPlace) => void;
  onSelectCustomMarker: (marker: CustomMarker) => void;
  onEditCustomMarker?: (marker: CustomMarker) => void;
  onDeleteCustomMarker: (id: string) => void;
  onEditStayPointAsMarker?: (place: RecordedPlace) => void;
  onRequestRoute: (dest: { lat: number; lng: number }, name?: string) => void;
  onSelectRoute: (routeId: string) => void;
  onOpenDataSchema: () => void;
}

export const MovementLogs: React.FC<MovementLogsProps> = ({
  segments,
  recordedPlaces,
  customMarkers,
  routes,
  completedRoutes,
  selectedRouteId,
  selectedSegmentId,
  currentPoint,
  stats,
  theme,
  isNavigating = false,
  allUsers,
  selectedUserIdFilter,
  onSelectUserFilter,
  onStartNavigation,
  onClearRoute,
  onSelectSegment,
  onSelectPlace,
  onSelectCustomMarker,
  onEditCustomMarker,
  onDeleteCustomMarker,
  onEditStayPointAsMarker,
  onRequestRoute,
  onSelectRoute,
  onOpenDataSchema,
}) => {
  const [activeTab, setActiveTab] = useState<'segments' | 'places' | 'markers' | 'routes' | 'backend'>('segments');
  const [modeFilter, setModeFilter] = useState<'all' | 'trekking' | 'vehicle'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedJson, setCopiedJson] = useState(false);

  const isDark = theme === 'dark';

  // Strictly enforce: Places are only recorded/visible if dwell >= 90 seconds (1m 30s)
  const visibleRecordedPlaces = recordedPlaces.filter((p) => p.dwellDurationSeconds >= 90);

  // Filter segments
  const filteredSegments = segments.filter((seg) => {
    if (modeFilter !== 'all' && seg.mode !== modeFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchCoord =
        seg.startPoint.lat.toString().includes(q) ||
        seg.startPoint.lng.toString().includes(q) ||
        seg.endPoint.lat.toString().includes(q) ||
        seg.endPoint.lng.toString().includes(q);
      const matchTime =
        seg.startPoint.timeString.toLowerCase().includes(q) ||
        seg.endPoint.timeString.toLowerCase().includes(q);
      return matchCoord || matchTime;
    }
    return true;
  });

  // Exportable backend payload structure
  const backendPayload = {
    exportTimestamp: new Date().toISOString(),
    sessionSummary: {
      totalDistanceMeters: stats.totalDistanceMeters,
      totalDurationSeconds: stats.totalDurationSeconds,
      trekkingDistanceMeters: stats.trekkingDistanceMeters,
      vehicleDistanceMeters: stats.vehicleDistanceMeters,
      maxSpeedKmH: stats.maxSpeedKmH,
      placesRecordedCount: visibleRecordedPlaces.length,
      customMarkersCount: customMarkers.length,
      segmentsCount: segments.length,
    },
    customMarkers: customMarkers.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      category: m.category,
      coordinates: { latitude: m.lat, longitude: m.lng },
      createdAt: new Date(m.createdAt).toISOString(),
    })),
    recordedPlaces: visibleRecordedPlaces.map((p) => ({
      id: p.id,
      coordinates: { latitude: p.lat, longitude: p.lng },
      accuracyMeters: p.accuracy,
      name: p.name,
      address: p.address,
      dwellDurationSeconds: p.dwellDurationSeconds,
      arrivedAt: new Date(p.arrivedAt).toISOString(),
      departedAt: p.departedAt ? new Date(p.departedAt).toISOString() : null,
      notes: p.notes,
    })),
    journeySegments: segments.map((s, idx) => ({
      segmentIndex: idx + 1,
      id: s.id,
      mode: s.mode,
      averageSpeedKmH: Number(s.averageSpeedKmH.toFixed(2)),
      averageSpeedMps: Number((s.averageSpeedKmH / 3.6).toFixed(2)),
      distanceMeters: Number(s.distanceMeters.toFixed(1)),
      durationSeconds: s.durationSeconds,
      start: {
        timestamp: new Date(s.startTime).toISOString(),
        latitude: s.startPoint.lat,
        longitude: s.startPoint.lng,
      },
      end: {
        timestamp: new Date(s.endTime).toISOString(),
        latitude: s.endPoint.lat,
        longitude: s.endPoint.lng,
      },
    })),
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(backendPayload, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backendPayload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute(
      'download',
      `journey-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`
    );
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <aside
      id="movement-logs-panel"
      className={`w-full h-full flex flex-col border-l select-text overflow-hidden transition-colors ${
        isDark
          ? 'bg-zinc-950 text-zinc-100 border-zinc-800'
          : 'bg-zinc-50 text-zinc-900 border-zinc-200'
      }`}
    >
      {/* Panel Header */}
      <div
        className={`p-3.5 border-b flex flex-col gap-2.5 transition-colors ${
          isDark ? 'bg-zinc-900/70 border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-lg flex items-center justify-center border ${
                isDark
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                  : 'bg-zinc-100 text-zinc-800 border-zinc-300'
              }`}
            >
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold tracking-tight">Movement Logs</h2>
              <p className="text-[11px] text-zinc-500">Telemetry, Places &amp; Routes</p>
            </div>
          </div>

          <button
            id="data-collected-info-btn"
            onClick={onOpenDataSchema}
            className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition ${
              isDark
                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Schema</span>
          </button>
        </div>

        {/* Navigation Tabs (without any shade of blue) */}
        <div
          className={`flex border-b overflow-x-auto no-scrollbar -mb-2 mt-1 ${
            isDark ? 'border-zinc-800' : 'border-zinc-200'
          }`}
        >
          <button
            onClick={() => setActiveTab('segments')}
            className={`py-1.5 px-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'segments'
                ? isDark
                  ? 'border-zinc-100 text-zinc-100 font-semibold'
                  : 'border-zinc-900 text-zinc-900 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <Layers className="w-3 h-3" />
            Segments ({segments.length})
          </button>

          <button
            onClick={() => setActiveTab('places')}
            className={`py-1.5 px-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'places'
                ? isDark
                  ? 'border-zinc-100 text-zinc-100 font-semibold'
                  : 'border-zinc-900 text-zinc-900 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <MapPin className="w-3 h-3" />
            Places ({visibleRecordedPlaces.length})
          </button>

          <button
            onClick={() => setActiveTab('markers')}
            className={`py-1.5 px-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'markers'
                ? isDark
                  ? 'border-zinc-100 text-zinc-100 font-semibold'
                  : 'border-zinc-900 text-zinc-900 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <MapPin className="w-3 h-3" />
            Markers ({customMarkers.length})
          </button>

          <button
            onClick={() => setActiveTab('routes')}
            className={`py-1.5 px-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'routes'
                ? isDark
                  ? 'border-zinc-100 text-zinc-100 font-semibold'
                  : 'border-zinc-900 text-zinc-900 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <Route className="w-3 h-3" />
            Routes {routes.length > 0 ? `(${routes.length})` : ''}
          </button>

          <button
            onClick={() => setActiveTab('backend')}
            className={`py-1.5 px-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition flex items-center gap-1.5 ${
              activeTab === 'backend'
                ? isDark
                  ? 'border-zinc-100 text-zinc-100 font-semibold'
                  : 'border-zinc-900 text-zinc-900 font-semibold'
                : 'border-transparent text-zinc-400 hover:text-zinc-600'
            }`}
          >
            <Database className="w-3 h-3" />
            Export JSON
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* TAB 1: SEGMENTS */}
        {activeTab === 'segments' && (
          <div className="space-y-2.5">
            {/* Filter controls */}
            <div className="flex items-center justify-between gap-1.5 text-xs">
              <div
                className={`flex items-center gap-1 p-0.5 rounded-lg border ${
                  isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-zinc-100 border-zinc-200'
                }`}
              >
                <button
                  onClick={() => setModeFilter('all')}
                  className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                    modeFilter === 'all'
                      ? isDark
                        ? 'bg-zinc-800 text-white'
                        : 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  All
                </button>
                <button
                  onClick={() => setModeFilter('trekking')}
                  className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                    modeFilter === 'trekking'
                      ? isDark
                        ? 'bg-zinc-800 text-emerald-400'
                        : 'bg-white text-emerald-700 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Footprints className="w-3 h-3 text-emerald-500" />
                  Trekking
                </button>
                <button
                  onClick={() => setModeFilter('vehicle')}
                  className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                    modeFilter === 'vehicle'
                      ? isDark
                        ? 'bg-zinc-800 text-zinc-200'
                        : 'bg-white text-zinc-900 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Car className="w-3 h-3" />
                  Vehicle
                </button>
              </div>

              <div className="relative flex-1 max-w-[140px]">
                <Search className="w-3 h-3 text-zinc-400 absolute left-2 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter logs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className={`w-full rounded-lg pl-6 pr-2 py-1 text-[11px] border focus:outline-none ${
                    isDark
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-200 placeholder-zinc-500 focus:border-zinc-600'
                      : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500'
                  }`}
                />
              </div>
            </div>

            {filteredSegments.length === 0 ? (
              <div className="text-center py-12 px-4 text-zinc-500 space-y-2">
                <Footprints className="w-7 h-7 mx-auto opacity-40" />
                <p className="text-xs">No movement segments recorded yet.</p>
                <p className="text-[11px] text-zinc-400">
                  Move with your device to log journey segments.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredSegments.map((seg, idx) => {
                  const isSelected = seg.id === selectedSegmentId;
                  const isTrekking = seg.mode === 'trekking';

                  return (
                    <div
                      key={`${seg.id}-${idx}`}
                      onClick={() => onSelectSegment(isSelected ? null : seg.id)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? isDark
                            ? 'bg-zinc-800 border-zinc-500 ring-1 ring-zinc-500'
                            : 'bg-zinc-200/80 border-zinc-400 ring-1 ring-zinc-400'
                          : isDark
                          ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/40'
                          : 'bg-white border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                              isDark ? 'bg-zinc-800 text-zinc-400' : 'bg-zinc-100 text-zinc-600'
                            }`}
                          >
                            #{segments.length - idx}
                          </span>
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 border ${
                              isTrekking
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                : isDark
                                ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                                : 'bg-zinc-100 text-zinc-800 border-zinc-300'
                            }`}
                          >
                            {isTrekking ? (
                              <>
                                <Footprints className="w-3 h-3" /> Trekking
                              </>
                            ) : (
                              <>
                                <Car className="w-3 h-3" /> Vehicle
                              </>
                            )}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="text-xs font-mono font-bold">
                            {formatSpeed(seg.averageSpeedKmH)}
                          </span>
                        </div>
                      </div>

                      {/* Timestamps */}
                      <div
                        className={`flex items-center justify-between text-[11px] font-mono px-2 py-1 rounded border mb-2 ${
                          isDark
                            ? 'bg-zinc-950/80 border-zinc-800 text-zinc-400'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                        }`}
                      >
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-zinc-400" />
                          {seg.startPoint.timeString}
                        </span>
                        <ArrowRight className="w-3 h-3 text-zinc-400" />
                        <span>{seg.endPoint.timeString}</span>
                        <span className="text-[10px] text-zinc-500 font-sans">
                          ({seg.durationSeconds}s)
                        </span>
                      </div>

                      {/* Coordinates */}
                      <div className="space-y-1 text-[11px] font-mono text-zinc-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase">Origin:</span>
                          <span className="text-zinc-700 dark:text-zinc-300">
                            {seg.startPoint.lat.toFixed(5)}, {seg.startPoint.lng.toFixed(5)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] uppercase">Destination:</span>
                          <span className="text-zinc-700 dark:text-zinc-300">
                            {seg.endPoint.lat.toFixed(5)}, {seg.endPoint.lng.toFixed(5)}
                          </span>
                        </div>
                      </div>

                      <div
                        className={`flex items-center justify-between pt-2 mt-2 border-t text-[10px] text-zinc-500 ${
                          isDark ? 'border-zinc-800' : 'border-zinc-200'
                        }`}
                      >
                        <span>Distance: {formatDistance(seg.distanceMeters)}</span>
                        <span className="hover:underline font-medium">
                          {isSelected ? 'Highlighted on Map' : 'Click to highlight'}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PLACES (Without speed, total distance, requirement, or 1:30s text as requested) */}
        {activeTab === 'places' && (
          <div className="space-y-2.5">
            {visibleRecordedPlaces.length === 0 ? (
              <div className="text-center py-10 px-4 text-zinc-500 space-y-2">
                <MapPin className="w-7 h-7 mx-auto opacity-40" />
                <p className="text-xs">No stationary places recorded yet.</p>
                <p className="text-[11px] text-zinc-400">
                  Places are recorded automatically after staying stationary for 1 minute and 30 seconds.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleRecordedPlaces.map((place, idx) => (
                  <div
                    key={`${place.id}-${idx}`}
                    onClick={() => onSelectPlace(place)}
                    className={`p-3 rounded-xl border transition cursor-pointer space-y-2 ${
                      isDark
                        ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs border ${
                            isDark
                              ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                              : 'bg-zinc-100 text-zinc-800 border-zinc-300'
                          }`}
                        >
                          #{idx + 1}
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold">
                            {place.name || 'Recorded Place'}
                          </h4>
                          {place.address && (
                            <p className="text-[10px] text-zinc-400 truncate max-w-[190px]">
                              {place.address}
                            </p>
                          )}
                        </div>
                      </div>

                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium border ${
                          isDark
                            ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                            : 'bg-zinc-100 text-zinc-700 border-zinc-300'
                        }`}
                      >
                        {formatDuration(place.dwellDurationSeconds)}
                      </span>
                    </div>

                    <div
                      className={`grid grid-cols-2 gap-1.5 text-[11px] font-mono p-2 rounded-lg border ${
                        isDark ? 'bg-zinc-950/70 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      <div>
                        <span className="text-zinc-500 text-[10px] block">Arrived:</span>
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {new Date(place.arrivedAt).toLocaleTimeString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-zinc-500 text-[10px] block">Departed:</span>
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {place.departedAt
                            ? new Date(place.departedAt).toLocaleTimeString()
                            : 'Present'}
                        </span>
                      </div>
                    </div>

                    <div className="text-[11px] font-mono text-zinc-500 flex justify-between">
                      <span className="text-[10px]">Coords:</span>
                      <span className="text-zinc-700 dark:text-zinc-300">
                        {place.lat.toFixed(5)}, {place.lng.toFixed(5)}
                      </span>
                    </div>

                    <div className="pt-1 flex gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestRoute({ lat: place.lat, lng: place.lng }, place.name);
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 border transition ${
                          isDark
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                            : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300'
                        }`}
                      >
                        <Route className="w-3.5 h-3.5" />
                        Find Route
                      </button>

                      {onEditStayPointAsMarker && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditStayPointAsMarker(place);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 border transition ${
                            isDark
                              ? 'bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border-emerald-800'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                          }`}
                          title="Save and edit this 90s stay point as a custom marker"
                        >
                          <Pencil className="w-3 h-3" />
                          <span>Edit Marker</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CUSTOM USER MARKERS */}
        {activeTab === 'markers' && (
          <div className="space-y-2.5">
            <div
              className={`p-2.5 rounded-xl border text-xs ${
                isDark ? 'bg-zinc-900/60 border-zinc-800 text-zinc-400' : 'bg-white border-zinc-200 text-zinc-600'
              }`}
            >
              <p className="leading-relaxed">
                Click anywhere on the map or edit a 90s stay point to create a marker. Markers can be edited or deleted by their creator.
              </p>
            </div>

            {customMarkers.length === 0 ? (
              <div className="text-center py-10 px-4 text-zinc-500 space-y-2">
                <MapPin className="w-7 h-7 mx-auto opacity-40" />
                <p className="text-xs">No custom markers added yet.</p>
                <p className="text-[11px] text-zinc-400">
                  Tap or click any spot on the map to drop a new marker!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {customMarkers.map((marker) => (
                  <div
                    key={marker.id}
                    onClick={() => onSelectCustomMarker(marker)}
                    className={`p-3 rounded-xl border transition cursor-pointer space-y-2 ${
                      isDark
                        ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-sm border shadow-xs"
                          style={{
                            backgroundColor: marker.userColor ? `${marker.userColor}20` : undefined,
                            borderColor: marker.userColor || undefined,
                          }}
                        >
                          {marker.category === 'cafe'
                            ? '☕'
                            : marker.category === 'work'
                            ? '💼'
                            : marker.category === 'home'
                            ? '🏠'
                            : marker.category === 'store'
                            ? '🛒'
                            : marker.category === 'landmark'
                            ? '⭐'
                            : '📍'}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-xs font-semibold">{marker.name}</h4>
                            {marker.userName && (
                              <span
                                className="text-[9px] px-1.5 py-0.2 rounded-full text-white font-medium"
                                style={{ backgroundColor: marker.userColor || '#6366f1' }}
                              >
                                {marker.userName}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-zinc-500 truncate max-w-[190px]">
                            {marker.description}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {onEditCustomMarker && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditCustomMarker(marker);
                            }}
                            className="text-zinc-400 hover:text-zinc-200 p-1 transition"
                            title="Edit marker"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteCustomMarker(marker.id);
                          }}
                          className="text-zinc-400 hover:text-red-500 p-1 transition"
                          title="Delete marker"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div
                      className={`text-[11px] font-mono p-1.5 rounded border flex justify-between ${
                        isDark ? 'bg-zinc-950/70 border-zinc-800 text-zinc-400' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                      }`}
                    >
                      <span className="text-[10px]">Location:</span>
                      <span>
                        {marker.lat.toFixed(5)}, {marker.lng.toFixed(5)}
                      </span>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onRequestRoute({ lat: marker.lat, lng: marker.lng }, marker.name);
                      }}
                      className={`w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${
                        isDark
                          ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                          : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300'
                      }`}
                    >
                      <Route className="w-3.5 h-3.5" />
                      Find Route to Marker
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: SUGGESTED ROUTES & COMPLETED ROUTE HISTORY */}
        {activeTab === 'routes' && (
          <div className="space-y-4">
            {/* 1. Active Suggested Routes */}
            <div className="space-y-2.5">
              <div
                className={`p-2.5 rounded-xl border text-xs flex items-center justify-between ${
                  isDark ? 'bg-zinc-900/80 border-zinc-800 text-zinc-300' : 'bg-white border-zinc-200 text-zinc-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold">Suggested Routes ({routes.length})</span>
                  {isNavigating && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-500/15 px-2 py-0.5 rounded-full border border-blue-500/30">
                      Navigating
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">
                  Speed: {currentPoint ? `${currentPoint.speed.toFixed(1)} km/h` : '0.0 km/h'}
                </span>
              </div>

              {routes.length === 0 ? (
                <div className="text-center py-6 px-4 text-zinc-500 space-y-2">
                  <Route className="w-6 h-6 mx-auto opacity-40" />
                  <p className="text-xs">No active route requested.</p>
                  <p className="text-[11px] text-zinc-400">
                    Tap &quot;Find Route&quot; on any marker or place to generate route options.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {!isNavigating ? (
                    <button
                      id="sidebar-start-directions-btn"
                      onClick={onStartNavigation}
                      className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-98 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-md transition cursor-pointer"
                    >
                      <Navigation className="w-3.5 h-3.5 fill-white" />
                      <span>Start Directions</span>
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <div className="flex-1 py-2 px-3 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-600 dark:text-blue-400 text-xs font-semibold flex items-center gap-2">
                        <Navigation className="w-3.5 h-3.5 animate-pulse" />
                        <span>Directions Active (Blue)</span>
                      </div>
                      {onClearRoute && (
                        <button
                          onClick={onClearRoute}
                          className="py-2 px-3 rounded-xl border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-xs font-semibold transition"
                        >
                          Exit
                        </button>
                      )}
                    </div>
                  )}

                  {routes.map((rt) => {
                    const isSelected = selectedRouteId ? rt.id === selectedRouteId : rt.isFastest;
                    return (
                      <div
                        key={rt.id}
                        onClick={() => onSelectRoute(rt.id)}
                        className={`p-3 rounded-xl border transition cursor-pointer space-y-2 ${
                          isSelected
                            ? isDark
                              ? 'bg-blue-950/25 border-blue-500 ring-1 ring-blue-500/50 shadow-sm'
                              : 'bg-blue-50/60 border-blue-500 ring-1 ring-blue-500/40 shadow-sm'
                            : isDark
                            ? 'bg-sky-950/15 border-sky-800/70 hover:border-sky-700'
                            : 'bg-sky-50/30 border-sky-200 hover:border-sky-300'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <div
                              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                isSelected ? 'bg-blue-600' : 'bg-sky-300 dark:bg-sky-400'
                              }`}
                              title={isSelected ? 'Active Route (Blue)' : 'Alternative Route (Light Blue)'}
                            />
                            <span className="font-semibold text-xs truncate">{rt.summary}</span>
                            {rt.isFastest && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded-full font-bold uppercase bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                                Fastest
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className="inline-flex items-center gap-1 text-[10.5px] font-mono font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-500/20"
                            >
                              <Footprints className="w-3 h-3 shrink-0" />
                              <span>{rt.trekkingDurationFormatted}</span>
                            </span>
                            <span
                              className="inline-flex items-center gap-1 text-[10.5px] font-mono font-medium text-blue-600 dark:text-blue-400 bg-blue-500/10 dark:bg-blue-950/40 px-2 py-0.5 rounded border border-blue-500/20"
                            >
                              <Car className="w-3 h-3 shrink-0" />
                              <span>{rt.vehicleDurationFormatted}</span>
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-[11px] text-zinc-500">
                          <span>Distance: {formatDistance(rt.distanceMeters)}</span>
                          <span className="text-[10.5px] font-medium text-blue-600 dark:text-blue-400">
                            {isSelected ? 'Active Route (Blue)' : 'Alternative (Light Blue)'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 2. Completed Routes History Metadata Log */}
            <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  Completed Route Logs ({completedRoutes?.length || 0})
                </span>
                <span className="text-[10px] text-zinc-400">Saved Metadata</span>
              </div>

              {!completedRoutes || completedRoutes.length === 0 ? (
                <p className="text-[11px] text-zinc-500 italic p-3 text-center border rounded-xl border-dashed border-zinc-300 dark:border-zinc-800">
                  No completed route history recorded yet. Complete a route to save destination and time taken!
                </p>
              ) : (
                <div className="space-y-2">
                  {completedRoutes.map((log) => (
                    <div
                      key={log.id}
                      className={`p-3 rounded-xl border text-xs space-y-2 ${
                        isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded-full flex items-center justify-center text-xs text-white font-bold shrink-0"
                            style={{ backgroundColor: log.userColor }}
                          >
                            {log.userName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span className="font-semibold block text-xs">{log.destinationName}</span>
                            <span className="text-[10px] text-zinc-400">{log.userName}</span>
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {log.completedAtTimeString}
                        </span>
                      </div>

                      <div
                        className={`grid grid-cols-3 gap-1 p-2 rounded-lg font-mono text-[11px] border ${
                          isDark ? 'bg-zinc-950/70 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        }`}
                      >
                        <div>
                          <span className="text-[9px] text-zinc-400 block">Duration</span>
                          <span className="font-semibold">{log.durationFormatted}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-400 block">Distance</span>
                          <span className="font-semibold">{formatDistance(log.distanceMeters)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-400 block">Avg Speed</span>
                          <span className="font-semibold">{log.averageSpeedKmH} km/h</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 5: BACKEND JSON */}
        {activeTab === 'backend' && (
          <div className="space-y-3">
            <div
              className={`p-2.5 rounded-xl border space-y-2 ${
                isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold flex items-center gap-1.5">
                  <Database className="w-3.5 h-3.5 text-emerald-500" />
                  Backend Storage Payload
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={handleCopyJson}
                    className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 border transition ${
                      isDark
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                        : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
                    }`}
                  >
                    {copiedJson ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-500" /> Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3" /> Copy JSON
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleDownloadJson}
                    className={`px-2 py-1 rounded text-[11px] flex items-center gap-1 font-semibold transition ${
                      isDark
                        ? 'bg-zinc-100 text-zinc-900 hover:bg-white'
                        : 'bg-zinc-900 text-white hover:bg-zinc-800'
                    }`}
                  >
                    <Download className="w-3 h-3" /> Export
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`rounded-xl p-3 border max-h-96 overflow-auto font-mono text-[11px] ${
                isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-300' : 'bg-zinc-900 border-zinc-800 text-zinc-200'
              }`}
            >
              <pre>{JSON.stringify(backendPayload, null, 2)}</pre>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className={`p-3 border-t flex items-center justify-between text-xs text-zinc-500 transition-colors ${
          isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Telemetry Collector
        </span>
        <button
          onClick={handleDownloadJson}
          className="hover:text-zinc-800 dark:hover:text-zinc-200 font-medium flex items-center gap-1"
        >
          <Download className="w-3.5 h-3.5" /> Save JSON
        </button>
      </div>
    </aside>
  );
};
