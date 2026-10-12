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
  Plane,
  MapPin,
  Clock,
  ArrowRight,
  Check,
  Layers,
  Search,
  Route,
  Trash2,
  Gauge,
  Navigation,
  Pencil,
  CheckCircle2,
  XCircle,
  Users,
  ArrowUpDown,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { formatDistance, formatDuration, formatSpeed } from '../utils/geo';
import { formatNameString } from '../utils/auth';

interface MovementLogsProps {
  segments: JourneySegment[];
  recordedPlaces: RecordedPlace[];
  customMarkers: CustomMarker[];
  routes: RouteOption[];
  completedRoutes?: CompletedRouteLog[];
  selectedRouteId: number | null;
  selectedSegmentId: number | null;
  currentPoint: LocationPoint | null;
  stats: TrackingStats;
  theme: AppTheme;
  userAvatarUrl?: string;
  isNavigating?: boolean;
  allUsers?: AppUser[];
  selectedUserIdFilter?: number | 'all';
  onSelectUserFilter?: (userId: number | 'all') => void;
  onStartNavigation?: () => void;
  onClearRoute?: () => void;
  onSelectSegment: (segmentId: number | null) => void;
  onSelectPlace: (place: RecordedPlace) => void;
  onSelectCustomMarker: (marker: CustomMarker) => void;
  onEditCustomMarker?: (marker: CustomMarker) => void;
  onDeleteCustomMarker: (id: number) => void;
  onEditStayPointAsMarker?: (place: RecordedPlace) => void;
  onRequestRoute: (dest: { lat: number; lng: number }, name?: string) => void;
  onSelectRoute: (routeId: number) => void;
  onOpenDataSchema?: () => void;
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
  userAvatarUrl,
  isNavigating = false,
  allUsers,
  selectedUserIdFilter = 'all',
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
  const [activeTab, setActiveTab] = useState<'segments' | 'markers' | 'routes'>('segments');
  const [modeFilter, setModeFilter] = useState<'all' | 'walking' | 'vehicle' | 'airplane'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Marker search, sorting by user, editing, and deletion states
  const [markerSearchQuery, setMarkerSearchQuery] = useState('');
  const [markerUserFilter, setMarkerUserFilter] = useState<number | 'all'>('all');
  const [isMarkerUserDropdownOpen, setIsMarkerUserDropdownOpen] = useState(false);
  const [editingMarkerId, setEditingMarkerId] = useState<number | null>(null);
  const [editingMarkerName, setEditingMarkerName] = useState('');
  const [editingMarkerCategory, setEditingMarkerCategory] = useState('generic');
  const [editingMarkerColor, setEditingMarkerColor] = useState('#3B82F6');
  const [markerToDelete, setMarkerToDelete] = useState<CustomMarker | null>(null);

  // Route status filter and sorting
  const [routeStatusFilter, setRouteStatusFilter] = useState<'all' | 'active' | 'completed' | 'cancelled'>('all');
  const [routeSortOrder, setRouteSortOrder] = useState<'newest' | 'status' | 'distance' | 'duration'>('newest');

  const isDark = theme === 'dark';

  // Strictly enforce: Places are only recorded/visible if dwell >= 90 seconds (1m 30s)
  const visibleRecordedPlaces = recordedPlaces.filter((p) => p.dwellDurationSeconds >= 90);

  // Filter segments (Privacy-first: does not expose or match raw coordinates)
  const filteredSegments = segments.filter((seg) => {
    if (modeFilter !== 'all' && seg.mode !== modeFilter) return false;
    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      const matchMode = seg.mode.toLowerCase().includes(q);
      const matchTime =
        seg.startPoint.timeString.toLowerCase().includes(q) ||
        seg.endPoint.timeString.toLowerCase().includes(q);
      return matchMode || matchTime;
    }
    return true;
  });

  // Filter and search markers by name and by user
  const filteredCustomMarkers = customMarkers.filter((marker) => {
    // Filter by user selection if not 'all'
    if (markerUserFilter !== 'all') {
      if (marker.userId !== markerUserFilter) return false;
    }

    // Search through markers by name
    if (markerSearchQuery.trim() !== '') {
      const q = markerSearchQuery.toLowerCase().trim();
      if (!marker.name.toLowerCase().includes(q)) {
        return false;
      }
    }

    return true;
  });

  const handleSaveInlineMarkerName = (marker: CustomMarker) => {
    const trimmed = editingMarkerName.trim();
    if (onEditCustomMarker) {
      onEditCustomMarker({
        ...marker,
        name: trimmed || marker.name,
        category: editingMarkerCategory.trim() || marker.category || 'generic',
        userColor: editingMarkerColor || marker.userColor || '#3B82F6',
      });
    }
    setEditingMarkerId(null);
  };

  // Unified Routes Construction (Active, Completed, and Cancelled)
  const otherNavigatingRoutes = (allUsers || [])
    .filter((u) => !u.isCurrentUser && u.id !== 1 && u.isNavigating && u.activeDestinationCoords)
    .map((u) => ({
      id: u.id * 100000 + 777,
      type: 'active-user' as const,
      status: 'active' as const,
      userId: u.id,
      userName: formatNameString(u.name),
      userColor: u.color,
      userAvatar: u.avatar,
      destinationName: u.activeDestinationName || 'Navigating Destination',
      destinationCoords: u.activeDestinationCoords!,
      distanceMeters: 1800,
      durationSeconds: 300,
      durationFormatted: '5 min',
      timestamp: u.navigationStartTime || Date.now() - 60000,
      timeDisplayString: 'Active Navigation',
      travelMode: (u.mode === 'vehicle' ? 'DRIVING' : 'WALKING') as 'DRIVING' | 'WALKING',
      isFastest: false,
      speedKmH: u.speedKmH,
      routeOption: undefined as RouteOption | undefined,
    }));

  const historyRoutes = (completedRoutes || []).map((r) => ({
    id: r.id,
    type: r.status === 'completed' ? ('completed' as const) : ('cancelled' as const),
    status: r.status || 'completed',
    userId: r.userId,
    userName: formatNameString(r.userName),
    userColor: r.userColor,
    userAvatar: r.userAvatar,
    destinationName: r.destinationName,
    destinationCoords: r.destinationCoords,
    distanceMeters: r.distanceMeters,
    durationSeconds: r.durationSeconds,
    durationFormatted: r.durationFormatted,
    timestamp: r.endTime || r.startTime || Date.now(),
    timeDisplayString: r.completedAtTimeString,
    travelMode: r.travelMode,
    speedKmH: r.averageSpeedKmH,
    isFastest: false,
    routeOption: undefined as RouteOption | undefined,
  }));

  const allUnifiedRoutes = [
    ...routes.map((rt) => {
      const matchedUser = (allUsers || []).find((u) => u.id === (rt.userId ?? 1));
      return {
        id: rt.id,
        type: 'active-option' as const,
        status: 'active' as const,
        userId: rt.userId ?? 1,
        userName: formatNameString(rt.userName ?? (matchedUser ? matchedUser.name : 'Inioluwa Johansson')),
        userColor: rt.userColor ?? (matchedUser ? matchedUser.color : '#2563EB'),
        userAvatar: matchedUser?.avatar || userAvatarUrl || '',
        destinationName: rt.summary,
        destinationCoords: rt.path && rt.path.length > 0 ? rt.path[rt.path.length - 1] : { lat: 7.1475, lng: 3.3619 },
        distanceMeters: rt.distanceMeters,
        durationSeconds: rt.durationSeconds,
        durationFormatted: rt.durationFormatted,
        timestamp: Date.now(),
        timeDisplayString: 'In Progress',
        travelMode: rt.travelMode,
        isFastest: rt.isFastest,
        routeOption: rt as RouteOption | undefined,
        speedKmH: currentPoint?.speed || 0,
      };
    }),
    ...otherNavigatingRoutes,
    ...historyRoutes,
  ];

  const activeCount = allUnifiedRoutes.filter(
    (r) => r.status === 'active' && (selectedUserIdFilter === 'all' || r.userId === selectedUserIdFilter)
  ).length;
  const completedCount = allUnifiedRoutes.filter(
    (r) => r.status === 'completed' && (selectedUserIdFilter === 'all' || r.userId === selectedUserIdFilter)
  ).length;
  const cancelledCount = allUnifiedRoutes.filter(
    (r) => r.status === 'cancelled' && (selectedUserIdFilter === 'all' || r.userId === selectedUserIdFilter)
  ).length;
  const allRoutesCount = activeCount + completedCount + cancelledCount;

  const filteredByStatusRoutes = allUnifiedRoutes.filter((r) => {
    if (routeStatusFilter !== 'all' && r.status !== routeStatusFilter) return false;
    if (selectedUserIdFilter && selectedUserIdFilter !== 'all' && r.userId !== selectedUserIdFilter) return false;
    return true;
  });

  const sortedRoutes = [...filteredByStatusRoutes].sort((a, b) => {
    if (routeSortOrder === 'status') {
      const rank = { active: 0, completed: 1, cancelled: 2 };
      if (rank[a.status] !== rank[b.status]) {
        return rank[a.status] - rank[b.status];
      }
      return b.timestamp - a.timestamp;
    }
    if (routeSortOrder === 'distance') {
      return a.distanceMeters - b.distanceMeters;
    }
    if (routeSortOrder === 'duration') {
      return a.durationSeconds - b.durationSeconds;
    }
    return b.timestamp - a.timestamp;
  });

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
              <p className="text-[11px] text-zinc-500">Telemetry &amp; Routes</p>
            </div>
          </div>

          {onOpenDataSchema && (
            <button
              id="data-collected-info-btn"
              onClick={onOpenDataSchema}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 border transition ${
                isDark
                  ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                  : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
              }`}
            >
              <Gauge className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">Schema</span>
            </button>
          )}
        </div>

        {/* Navigation Tabs (without any shade of blue) */}
        <div
          className={`flex border-b overflow-x-auto no-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] -mb-2 mt-1 ${
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
            id="tab-routes-btn"
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
            Routes ({allRoutesCount})
          </button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div className="flex-1 overflow-y-auto no-scrollbar [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] p-3 space-y-3">
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
                  onClick={() => setModeFilter('walking')}
                  className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                    modeFilter === 'walking'
                      ? isDark
                        ? 'bg-zinc-800 text-emerald-400'
                        : 'bg-white text-emerald-700 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Footprints className="w-3 h-3 text-emerald-500" />
                  Walking
                </button>
                <button
                  onClick={() => setModeFilter('vehicle')}
                  className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                    modeFilter === 'vehicle'
                      ? isDark
                        ? 'bg-zinc-800 text-blue-400'
                        : 'bg-white text-blue-700 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Car className="w-3 h-3 text-blue-500" />
                  Vehicle
                </button>
                <button
                  onClick={() => setModeFilter('airplane')}
                  className={`px-2 py-1 rounded text-[11px] font-medium flex items-center gap-1 transition ${
                    modeFilter === 'airplane'
                      ? isDark
                        ? 'bg-zinc-800 text-purple-400'
                        : 'bg-white text-purple-700 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-700'
                  }`}
                >
                  <Plane className="w-3 h-3 text-purple-500" />
                  Airplane
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
                  const isWalking = seg.mode === 'walking';
                  const isAirplane = seg.mode === 'airplane';

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
                            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold flex items-center gap-1 border ${
                              isWalking
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                                : isAirplane
                                ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                                : 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                            }`}
                          >
                            {isWalking ? (
                              <>
                                <Footprints className="w-3 h-3 text-emerald-500" /> Walking
                              </>
                            ) : isAirplane ? (
                              <>
                                <Plane className="w-3 h-3 text-purple-500" /> Airplane
                              </>
                            ) : (
                              <>
                                <Car className="w-3 h-3 text-blue-500" /> Vehicle
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

                      {/* Checkpoint Status (Protected GPS Telemetry) */}
                      <div className="space-y-1 text-[11px] text-zinc-500">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-zinc-400">Origin Point:</span>
                          <span className="text-zinc-700 dark:text-zinc-300 font-mono text-[10.5px]">
                            {seg.startPoint.timeString} • GPS Fix Active
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-zinc-400">Destination Point:</span>
                          <span className="text-zinc-700 dark:text-zinc-300 font-mono text-[10.5px]">
                            {seg.endPoint.timeString} • Verified
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

        {/* TAB 2: CUSTOM USER MARKERS */}
        {activeTab === 'markers' && (
          <div className="space-y-3">
            {/* Search and User Select Filter Controls placed side by side */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Search by Marker Name */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-2.5 top-2.5 pointer-events-none" />
                <input
                  type="text"
                  id="search-markers-name-input"
                  placeholder="Search markers by name..."
                  value={markerSearchQuery}
                  onChange={(e) => setMarkerSearchQuery(e.target.value)}
                  className={`w-full rounded-xl pl-8 pr-7 py-2 text-xs border focus:outline-none transition ${
                    isDark
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-100 placeholder-zinc-500 focus:border-zinc-600'
                      : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400 focus:border-zinc-500'
                  }`}
                />
                {markerSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setMarkerSearchQuery('')}
                    className="absolute right-2.5 top-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 text-xs p-0.5 cursor-pointer"
                    title="Clear search"
                  >
                    &times;
                  </button>
                )}
              </div>

              {/* Select Filter by User Dropdown showing user images (without label) */}
              <div className="relative w-full">
                {(() => {
                  const selectedUserObj =
                    markerUserFilter === 'all' ? null : allUsers?.find((u) => u.id === markerUserFilter);

                  return (
                    <>
                      <button
                        id="marker-user-select-dropdown-btn"
                        type="button"
                        onClick={() => setIsMarkerUserDropdownOpen(!isMarkerUserDropdownOpen)}
                        className={`w-full px-3 py-2 text-xs font-semibold rounded-xl border flex items-center justify-between gap-2 focus:outline-none cursor-pointer transition ${
                          isDark
                            ? 'bg-zinc-900 border-zinc-800 text-zinc-100 hover:border-zinc-700'
                            : 'bg-white border-zinc-300 text-zinc-900 hover:border-zinc-400'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          {selectedUserObj ? (
                            <>
                              <img
                                src={
                                  selectedUserObj.avatar ||
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(formatNameString(selectedUserObj.name))}&background=3b82f6&color=fff`
                                }
                                alt={formatNameString(selectedUserObj.name)}
                                className="w-5 h-5 rounded-full object-cover shrink-0 border"
                                style={{ borderColor: selectedUserObj.color || '#3b82f6' }}
                              />
                              <span className="truncate">{formatNameString(selectedUserObj.name)}</span>
                            </>
                          ) : (
                            <>
                              <div className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0">
                                <Users className="w-3 h-3" />
                              </div>
                              <span className="truncate">All Users ({allUsers?.length || 0})</span>
                            </>
                          )}
                        </div>
                        <ChevronDown
                          className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-200 ${
                            isMarkerUserDropdownOpen ? 'rotate-180' : ''
                          }`}
                        />
                      </button>

                      {isMarkerUserDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-30"
                            onClick={() => setIsMarkerUserDropdownOpen(false)}
                          />
                          <div
                            className={`absolute right-0 left-0 top-full mt-1.5 z-40 rounded-2xl border shadow-xl py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-150 ${
                              isDark
                                ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
                                : 'bg-white border-zinc-200 text-zinc-900'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => {
                                setMarkerUserFilter('all');
                                setIsMarkerUserDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-2 text-xs flex items-center justify-between font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer ${
                                markerUserFilter === 'all'
                                  ? 'text-blue-500 font-bold bg-blue-500/10'
                                  : 'text-zinc-700 dark:text-zinc-200'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0">
                                  <Users className="w-3 h-3" />
                                </div>
                                <span>All Users ({allUsers?.length || 0})</span>
                              </div>
                              {markerUserFilter === 'all' && <Check className="w-3.5 h-3.5 text-blue-500" />}
                            </button>

                            {allUsers?.map((u) => {
                              const isSelected = markerUserFilter === u.id;
                              return (
                                <button
                                  key={u.id}
                                  type="button"
                                  onClick={() => {
                                    setMarkerUserFilter(u.id);
                                    setIsMarkerUserDropdownOpen(false);
                                  }}
                                  className={`w-full px-3 py-2 text-xs flex items-center justify-between hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer ${
                                    isSelected
                                      ? 'text-blue-500 font-bold bg-blue-500/10'
                                      : 'text-zinc-700 dark:text-zinc-200'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <img
                                      src={
                                        u.avatar ||
                                        `https://ui-avatars.com/api/?name=${encodeURIComponent(formatNameString(u.name))}&background=3b82f6&color=fff`
                                      }
                                      alt={formatNameString(u.name)}
                                      className="w-5 h-5 rounded-full object-cover shrink-0 border"
                                      style={{ borderColor: u.color || '#3b82f6' }}
                                    />
                                    <span className="truncate">{formatNameString(u.name)}</span>
                                    <span
                                      className="w-2 h-2 rounded-full shrink-0"
                                      style={{ backgroundColor: u.color || '#3b82f6' }}
                                    />
                                  </div>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {customMarkers.length === 0 ? (
              <div className="text-center py-10 px-4 text-zinc-500 space-y-2">
                <MapPin className="w-7 h-7 mx-auto opacity-40" />
                <p className="text-xs font-medium">No custom markers added yet.</p>
                <p className="text-[11px] text-zinc-400">
                  Tap or click any spot on the map to drop a new marker!
                </p>
              </div>
            ) : filteredCustomMarkers.length === 0 ? (
              <div className="text-center py-8 px-4 text-zinc-500 space-y-2">
                <MapPin className="w-6 h-6 mx-auto opacity-40" />
                <p className="text-xs font-medium">No markers found</p>
                <p className="text-[11px] text-zinc-400">
                  No markers match &ldquo;{markerSearchQuery}&rdquo;{markerUserFilter !== 'all' ? ' for the selected user' : ''}.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setMarkerSearchQuery('');
                    setMarkerUserFilter('all');
                  }}
                  className="text-xs font-semibold text-blue-500 hover:underline pt-1 cursor-pointer"
                >
                  Reset search and user filter
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {filteredCustomMarkers.map((marker) => {
                  const isEditingThisMarker = editingMarkerId === marker.id;

                  return (
                    <div
                      key={marker.id}
                      onClick={() => onSelectCustomMarker(marker)}
                      className={`p-3 rounded-xl border transition cursor-pointer space-y-2 ${
                        isDark
                          ? 'bg-zinc-900/60 border-zinc-800 hover:border-zinc-700'
                          : 'bg-white border-zinc-200 hover:border-zinc-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center border shadow-xs shrink-0 mt-0.5"
                            style={{
                              backgroundColor: marker.userColor ? `${marker.userColor}20` : undefined,
                              borderColor: marker.userColor || undefined,
                            }}
                          >
                            <MapPin className="w-3.5 h-3.5" style={{ color: marker.userColor || '#3b82f6' }} />
                          </div>

                          {isEditingThisMarker ? (
                            /* Inline Edit Mode: Input field with name, category, color and save button at bottom left */
                            <div
                              className="flex-1 min-w-0 space-y-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div>
                                <label
                                  htmlFor={`edit-marker-name-${marker.id}`}
                                  className="block text-[10px] font-semibold text-zinc-400 mb-0.5"
                                >
                                  Marker Name:
                                </label>
                                <input
                                  type="text"
                                  id={`edit-marker-name-${marker.id}`}
                                  value={editingMarkerName}
                                  onChange={(e) => setEditingMarkerName(e.target.value)}
                                  autoFocus
                                  className={`w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border focus:outline-none focus:ring-1 ${
                                    isDark
                                      ? 'bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-zinc-400 focus:ring-zinc-400'
                                      : 'bg-white border-zinc-300 text-zinc-900 focus:border-zinc-500 focus:ring-zinc-500'
                                  }`}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSaveInlineMarkerName(marker);
                                    } else if (e.key === 'Escape') {
                                      setEditingMarkerId(null);
                                    }
                                  }}
                                />
                              </div>

                              <div>
                                <label
                                  htmlFor={`edit-marker-cat-${marker.id}`}
                                  className="block text-[10px] font-semibold text-zinc-400 mb-0.5"
                                >
                                  Category:
                                </label>
                                <input
                                  type="text"
                                  id={`edit-marker-cat-${marker.id}`}
                                  value={editingMarkerCategory}
                                  onChange={(e) => setEditingMarkerCategory(e.target.value)}
                                  placeholder="e.g. Work, Cafe, Home, Gym"
                                  className={`w-full px-2.5 py-1 text-xs rounded-lg border focus:outline-none ${
                                    isDark
                                      ? 'bg-zinc-950 border-zinc-700 text-zinc-100 focus:border-zinc-400'
                                      : 'bg-white border-zinc-300 text-zinc-900 focus:border-zinc-500'
                                  }`}
                                />
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {['work', 'cafe', 'home', 'gym', 'store', 'landmark'].map((cat) => (
                                    <button
                                      key={cat}
                                      type="button"
                                      onClick={() => setEditingMarkerCategory(cat)}
                                      className={`text-[9px] px-1.5 py-0.5 rounded capitalize transition cursor-pointer border ${
                                        editingMarkerCategory.toLowerCase() === cat
                                          ? 'bg-blue-500/20 text-blue-500 border-blue-500/40 font-bold'
                                          : isDark
                                          ? 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:text-zinc-200'
                                          : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:text-zinc-900'
                                      }`}
                                    >
                                      {cat}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <label className="block text-[10px] font-semibold text-zinc-400 mb-0.5">
                                  Color:
                                </label>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'].map((c) => (
                                    <button
                                      key={c}
                                      type="button"
                                      onClick={() => setEditingMarkerColor(c)}
                                      style={{ backgroundColor: c }}
                                      className={`w-4 h-4 rounded-full border transition cursor-pointer ${
                                        editingMarkerColor === c ? 'ring-2 ring-offset-1 ring-blue-500 scale-110' : 'opacity-85 hover:opacity-100'
                                      }`}
                                    />
                                  ))}
                                  <label className="relative cursor-pointer ml-0.5" title="Custom color picker">
                                    <input
                                      type="color"
                                      value={editingMarkerColor}
                                      onChange={(e) => setEditingMarkerColor(e.target.value)}
                                      className="w-4 h-4 rounded-full border cursor-pointer appearance-none bg-transparent overflow-hidden"
                                    />
                                  </label>
                                </div>
                              </div>

                              {/* Save button with icon at bottom left below the input field */}
                              <div className="flex items-center gap-2 pt-1 justify-start">
                                <button
                                  type="button"
                                  id={`save-marker-btn-${marker.id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleSaveInlineMarkerName(marker);
                                  }}
                                  className="px-3 py-1 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Save</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingMarkerId(null);
                                  }}
                                  className="px-2 py-1 text-xs font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="text-xs font-semibold truncate">{marker.name}</h4>
                                {marker.userName && (
                                  <span
                                    className="text-[9px] px-1.5 py-0.2 rounded-full text-white font-medium shrink-0"
                                    style={{ backgroundColor: marker.userColor || '#6366f1' }}
                                  >
                                    {formatNameString(marker.userName)}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-zinc-500 truncate max-w-[190px]">
                                {marker.description}
                              </p>
                            </div>
                          )}
                        </div>

                        {!isEditingThisMarker && (
                          <div className="flex items-center gap-1 shrink-0">
                            {onEditCustomMarker && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingMarkerId(marker.id);
                                  setEditingMarkerName(marker.name);
                                  setEditingMarkerCategory(marker.category || 'generic');
                                  setEditingMarkerColor(marker.userColor || '#3B82F6');
                                }}
                                className="text-zinc-400 hover:text-blue-500 p-1 rounded-md transition cursor-pointer"
                                title="Edit marker"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMarkerToDelete(marker);
                              }}
                              className="text-zinc-400 hover:text-red-500 p-1 rounded-md transition cursor-pointer"
                              title="Delete marker"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequestRoute({ lat: marker.lat, lng: marker.lng }, marker.name);
                        }}
                        className={`w-full py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition cursor-pointer ${
                          isDark
                            ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100 border-zinc-700'
                            : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300'
                        }`}
                      >
                        <Route className="w-3.5 h-3.5" />
                        <span>Find Route to Marker</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 4: ROUTES (ACTIVE, COMPLETED, CANCELLED) */}
        {activeTab === 'routes' && (
          <div className="space-y-3">
            {/* Top Sort and Status Filtering Toolbar */}
            <div
              className={`p-3 rounded-2xl border space-y-2.5 ${
                isDark ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              {/* Row 1: Status Filter Buttons with required Icons */}
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                <button
                  id="route-filter-all-btn"
                  onClick={() => setRouteStatusFilter('all')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                    routeStatusFilter === 'all'
                      ? isDark
                        ? 'bg-zinc-100 text-zinc-900 border-zinc-100 shadow-xs'
                        : 'bg-zinc-900 text-white border-zinc-900 shadow-xs'
                      : isDark
                      ? 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
                      : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-200'
                  }`}
                >
                  <Route className="w-3.5 h-3.5" />
                  <span>All ({allRoutesCount})</span>
                </button>

                <button
                  id="route-filter-active-btn"
                  onClick={() => setRouteStatusFilter('active')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                    routeStatusFilter === 'active'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                      : isDark
                      ? 'bg-blue-950/40 hover:bg-blue-950/70 text-blue-300 border-blue-800/60'
                      : 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                  }`}
                >
                  <Navigation className="w-3.5 h-3.5 text-blue-500 fill-current" />
                  <span>Active ({activeCount})</span>
                </button>

                <button
                  id="route-filter-completed-btn"
                  onClick={() => setRouteStatusFilter('completed')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                    routeStatusFilter === 'completed'
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                      : isDark
                      ? 'bg-emerald-950/40 hover:bg-emerald-950/70 text-emerald-300 border-emerald-800/60'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Completed ({completedCount})</span>
                </button>

                <button
                  id="route-filter-cancelled-btn"
                  onClick={() => setRouteStatusFilter('cancelled')}
                  className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold transition flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                    routeStatusFilter === 'cancelled'
                      ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                      : isDark
                      ? 'bg-rose-950/40 hover:bg-rose-950/70 text-rose-300 border-rose-800/60'
                      : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                  }`}
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                  <span>Cancelled ({cancelledCount})</span>
                </button>
              </div>
            </div>

            {/* Active Turn-by-Turn Navigation Live Banner */}
            {routes.length > 0 && (
              <div
                className={`p-3 rounded-2xl border space-y-2 ${
                  isDark ? 'bg-blue-950/30 border-blue-800/70' : 'bg-blue-50/70 border-blue-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                    <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                      {isNavigating ? 'Turn-by-Turn Navigation Live' : 'Calculated Routes Ready'}
                    </span>
                  </div>
                  <span className="text-[10px] font-mono text-zinc-500 dark:text-zinc-400">
                    Speed: {currentPoint ? `${currentPoint.speed.toFixed(1)} km/h` : '0.0 km/h'}
                  </span>
                </div>

                {!isNavigating ? (
                  <button
                    id="sidebar-start-directions-btn"
                    onClick={onStartNavigation}
                    className="w-full py-2 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5 fill-white" />
                    <span>Start Directions</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="flex-1 py-1.5 px-3 rounded-xl bg-blue-500/15 border border-blue-500/30 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center gap-2">
                      <Navigation className="w-3.5 h-3.5 animate-pulse text-blue-500" />
                      <span>Directions Active</span>
                    </div>
                    {onClearRoute && (
                      <button
                        id="sidebar-exit-route-btn"
                        onClick={onClearRoute}
                        className="py-1.5 px-3 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/40 transition cursor-pointer flex items-center gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Cancel Route</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Render Sorted Routes List with Active, Completed, Cancelled tags */}
            {sortedRoutes.length === 0 ? (
              <div className="text-center py-10 px-4 text-zinc-500 space-y-2">
                <Route className="w-7 h-7 mx-auto opacity-40" />
                <p className="text-xs font-medium">No routes found.</p>
                <p className="text-[11px] text-zinc-400">
                  {routeStatusFilter !== 'all'
                    ? `No ${routeStatusFilter} routes found for this filter.`
                    : 'Search for a location or tap "Find Route" on any marker to plot a route.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {sortedRoutes.map((rt) => {
                  const isSelected = selectedRouteId ? rt.id === selectedRouteId : rt.isFastest;
                  const isActive = rt.status === 'active';
                  const isCompleted = rt.status === 'completed';
                  const isCancelled = rt.status === 'cancelled';

                  return (
                    <div
                      key={rt.id}
                      onClick={() => {
                        if (rt.routeOption) {
                          onSelectRoute(rt.routeOption.id);
                        }
                      }}
                      className={`p-3 rounded-2xl border transition space-y-2.5 ${
                        isActive && isSelected
                          ? isDark
                            ? 'bg-blue-950/25 border-blue-500 ring-1 ring-blue-500/50 shadow-xs'
                            : 'bg-blue-50/80 border-blue-500 ring-1 ring-blue-500/40 shadow-xs'
                          : isDark
                          ? 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700'
                          : 'bg-white border-zinc-200 hover:border-zinc-300'
                      } ${rt.routeOption ? 'cursor-pointer' : ''}`}
                    >
                      {/* Header: User Profile & Destination & Status Tag */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          {rt.userAvatar ? (
                            <img
                              src={rt.userAvatar}
                              alt={formatNameString(rt.userName)}
                              className="w-7 h-7 rounded-full object-cover border shrink-0"
                              style={{ borderColor: rt.userColor }}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div
                              className="w-7 h-7 rounded-full flex items-center justify-center text-xs text-white font-bold shrink-0 shadow-xs"
                              style={{ backgroundColor: rt.userColor }}
                            >
                              {formatNameString(rt.userName).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <span className="font-semibold text-xs block truncate text-zinc-900 dark:text-zinc-100">
                              {rt.destinationName}
                            </span>
                            <span className="text-[10px] text-zinc-400 block truncate">
                              {formatNameString(rt.userName)} &bull; {rt.timeDisplayString}
                            </span>
                          </div>
                        </div>

                        {/* Status Tag with Mandatory Icon */}
                        {isActive && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 flex items-center gap-1 shrink-0">
                            <Navigation className="w-2.5 h-2.5 fill-current" />
                            <span>Active</span>
                          </span>
                        )}
                        {isCompleted && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shrink-0">
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            <span>Completed</span>
                          </span>
                        )}
                        {isCancelled && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 flex items-center gap-1 shrink-0">
                            <XCircle className="w-2.5 h-2.5" />
                            <span>Cancelled</span>
                          </span>
                        )}
                      </div>

                      {/* Route Metrics Grid */}
                      <div
                        className={`grid grid-cols-3 gap-1.5 p-2 rounded-xl font-mono text-[11px] border ${
                          isDark ? 'bg-zinc-950/70 border-zinc-800 text-zinc-300' : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        }`}
                      >
                        <div>
                          <span className="text-[9px] text-zinc-400 block uppercase tracking-wide">Duration</span>
                          <span className="font-semibold">{rt.durationFormatted}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-400 block uppercase tracking-wide">Distance</span>
                          <span className="font-semibold">{formatDistance(rt.distanceMeters)}</span>
                        </div>
                        <div>
                          <span className="text-[9px] text-zinc-400 block uppercase tracking-wide">
                            {isActive ? 'Mode' : 'Avg Speed'}
                          </span>
                          <span className="font-semibold">
                            {isActive ? rt.travelMode : `${rt.speedKmH || 25} km/h`}
                          </span>
                        </div>
                      </div>

                      {/* Action Button: Re-plot or Fastest badge */}
                      <div className="flex items-center justify-between pt-0.5">
                        {rt.isFastest && isActive ? (
                          <span className="text-[9px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30">
                            Fastest Option
                          </span>
                        ) : <span />}
                        {!isActive && (rt.userId === 1 || rt.userName === 'You' || rt.userName?.includes('You')) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onRequestRoute(rt.destinationCoords, rt.destinationName);
                            }}
                            className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer border ml-auto ${
                              isDark
                                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                                : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-800 border-zinc-300'
                            }`}
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>{isCompleted ? 'Re-plot Route' : 'Retry Route'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modern Footer with Status Tracker */}
      <div
        className={`p-3 border-t flex items-center justify-between text-xs text-zinc-500 transition-colors ${
          isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Real-time Telemetry &amp; Route Sync</span>
        </span>
        <span className="text-[11px] font-mono text-zinc-400">
          {filteredByStatusRoutes.length} Route Record{filteredByStatusRoutes.length === 1 ? '' : 's'}
        </span>
      </div>

      {/* Delete Marker Confirmation Modal */}
      {markerToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setMarkerToDelete(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`w-full max-w-sm p-5 rounded-2xl shadow-2xl border space-y-4 animate-in zoom-in-95 duration-150 ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold">Delete Marker</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                  Are you sure you want to delete <span className="font-semibold text-zinc-800 dark:text-zinc-200">&ldquo;{markerToDelete.name}&rdquo;</span>? This will permanently remove the marker from the map.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                id="cancel-delete-marker-btn"
                onClick={() => setMarkerToDelete(null)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                  isDark
                    ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border-zinc-300'
                }`}
              >
                Cancel
              </button>
              <button
                type="button"
                id="confirm-delete-marker-btn"
                onClick={() => {
                  onDeleteCustomMarker(markerToDelete.id);
                  setMarkerToDelete(null);
                }}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete Marker</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
