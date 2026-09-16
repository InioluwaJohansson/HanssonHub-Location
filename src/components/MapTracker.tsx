import React, { useState, useRef } from 'react';
import { APIProvider, Map, useMap } from '@vis.gl/react-google-maps';
import {
  JourneySegment,
  RecordedPlace,
  LocationPoint,
  StationaryState,
  CustomMarker,
  RouteOption,
  AppTheme,
  AppUser,
} from '../types';
import { MapOverlays } from './MapOverlays';
import {
  LocateFixed,
  Layers,
  Footprints,
  Car,
  MapPin,
  Route,
  X,
  Plus,
  Navigation,
  Users,
  Filter,
  Clock,
  Pencil,
  Trash2,
  CheckCircle2,
  Minimize2,
  Maximize2,
  GripHorizontal,
  Calendar,
} from 'lucide-react';
import { formatDistance, formatDuration } from '../utils/geo';

interface MapTrackerProps {
  apiKey: string;
  currentPoint: LocationPoint | null;
  segments: JourneySegment[];
  recordedPlaces: RecordedPlace[];
  customMarkers: CustomMarker[];
  routes: RouteOption[];
  selectedRouteId: string | null;
  selectedSegmentId: string | null;
  stationaryState: StationaryState;
  isTracking: boolean;
  theme: AppTheme;
  userName?: string;
  activeDestinationName?: string | null;
  isNavigating: boolean;
  allUsers?: AppUser[];
  selectedUserIdFilter?: string;
  contentTypeFilter?: 'all' | 'markers' | 'routes' | 'movements';
  timeRangeFilter?: 'all' | '1w' | '2w' | '1m' | '3m' | '6m';
  onSelectUserFilter?: (userId: string) => void;
  onSelectContentTypeFilter?: (type: 'all' | 'markers' | 'routes' | 'movements') => void;
  onSelectTimeRangeFilter?: (range: 'all' | '1w' | '2w' | '1m' | '3m' | '6m') => void;
  onStartNavigation: () => void;
  onSelectPlace: (place: RecordedPlace) => void;
  onSelectCustomMarker: (marker: CustomMarker) => void;
  onAddCustomMarker: (marker: {
    lat: number;
    lng: number;
    name: string;
    description: string;
    category: 'generic' | 'work' | 'cafe' | 'home' | 'landmark' | 'store';
  }) => void;
  onEditCustomMarker?: (marker: CustomMarker) => void;
  onDeleteCustomMarker?: (markerId: string) => void;
  onEditStayPointAsMarker?: (place: RecordedPlace) => void;
  onRequestRoute: (dest: { lat: number; lng: number }, destName?: string) => void;
  onSelectRoute: (routeId: string) => void;
  onClearRoute: () => void;
  onCompleteRoute?: () => void;
  countdownSecondsRemaining?: number | null;
}

// Sub-component to handle map camera actions like re-centering and route framing
const MapCameraController: React.FC<{
  targetPoint: { lat: number; lng: number } | null;
  triggerCenter: number;
  routes: RouteOption[];
}> = ({ targetPoint, triggerCenter, routes }) => {
  const map = useMap();
  const prevRoutesLen = React.useRef(0);

  React.useEffect(() => {
    if (map && targetPoint && triggerCenter > 0) {
      map.panTo(targetPoint);
      if (map.getZoom() && (map.getZoom() as number) < 15) {
        map.setZoom(16);
      }
    }
  }, [map, targetPoint, triggerCenter]);

  // Fit bounds when routes are first calculated
  React.useEffect(() => {
    if (!map || routes.length === 0 || typeof google === 'undefined' || !google.maps) {
      prevRoutesLen.current = routes.length;
      return;
    }

    if (prevRoutesLen.current === 0 && routes.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      routes.forEach((r) => {
        r.path.forEach((p) => bounds.extend(p));
      });
      if (targetPoint) {
        bounds.extend(targetPoint);
      }
      map.fitBounds(bounds, { top: 80, right: 60, bottom: 100, left: 60 });
    }
    prevRoutesLen.current = routes.length;
  }, [map, routes, targetPoint]);

  return null;
};

export const MapTracker: React.FC<MapTrackerProps> = ({
  apiKey,
  currentPoint,
  segments,
  recordedPlaces,
  customMarkers,
  routes,
  selectedRouteId,
  selectedSegmentId,
  stationaryState: _stationaryState,
  isTracking,
  theme,
  userName = 'Inioluwa',
  activeDestinationName,
  isNavigating,
  allUsers = [],
  selectedUserIdFilter = 'all',
  contentTypeFilter = 'all',
  timeRangeFilter = 'all',
  onSelectUserFilter,
  onSelectContentTypeFilter,
  onSelectTimeRangeFilter,
  onStartNavigation,
  onSelectPlace,
  onSelectCustomMarker,
  onAddCustomMarker,
  onEditCustomMarker,
  onDeleteCustomMarker,
  onEditStayPointAsMarker,
  onRequestRoute,
  onSelectRoute,
  onClearRoute,
  onCompleteRoute,
  countdownSecondsRemaining,
}) => {
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'terrain'>('roadmap');
  const [recenterCount, setRecenterCount] = useState<number>(0);

  // Draggable HUD state
  const [hudPos, setHudPos] = useState({ x: 0, y: 0 });
  const [isHudMinimized, setIsHudMinimized] = useState(false);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    dragOffsetRef.current = { x: e.clientX - hudPos.x, y: e.clientY - hudPos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    setHudPos({
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    });
  };

  const handlePointerUp = () => {
    isDraggingRef.current = false;
  };

  // New marker creation state from clicking map
  const [pendingMarkerPoint, setPendingMarkerPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [markerDesc, setMarkerDesc] = useState('');
  const [markerCategory, setMarkerCategory] = useState<'generic' | 'work' | 'cafe' | 'home' | 'landmark' | 'store'>('generic');

  // Editing existing marker state
  const [editingMarker, setEditingMarker] = useState<CustomMarker | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCat, setEditCat] = useState<'generic' | 'work' | 'cafe' | 'home' | 'landmark' | 'store'>('generic');

  const defaultCenter = currentPoint
    ? { lat: currentPoint.lat, lng: currentPoint.lng }
    : { lat: 7.1475, lng: 3.3619 };

  // Currently active route (either selected or fastest default)
  const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  const handlePlaceClick = (place: RecordedPlace) => {
    onSelectPlace(place);
    onRequestRoute({ lat: place.lat, lng: place.lng }, place.name || 'Recorded Place');
  };

  const handleCustomMarkerClick = (marker: CustomMarker) => {
    onSelectCustomMarker(marker);
    onRequestRoute({ lat: marker.lat, lng: marker.lng }, marker.name);
  };

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    setPendingMarkerPoint(coords);
    setMarkerName('');
    setMarkerDesc('');
    setMarkerCategory('generic');
  };

  const handleCreateMarkerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingMarkerPoint) return;
    const finalName = markerName.trim() || 'Custom Location';
    onAddCustomMarker({
      lat: pendingMarkerPoint.lat,
      lng: pendingMarkerPoint.lng,
      name: finalName,
      description: markerDesc.trim() || 'User added point of interest',
      category: markerCategory,
    });
    setPendingMarkerPoint(null);
  };

  const openMarkerEditModal = (marker: CustomMarker) => {
    setEditingMarker(marker);
    setEditName(marker.name);
    setEditDesc(marker.description || '');
    setEditCat(marker.category);
  };

  const handleSaveEditMarker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMarker || !onEditCustomMarker) return;
    onEditCustomMarker({
      ...editingMarker,
      name: editName.trim() || editingMarker.name,
      description: editDesc.trim(),
      category: editCat,
    });
    setEditingMarker(null);
  };

  const handleRecenter = () => {
    setRecenterCount((c) => c + 1);
  };

  const isDark = theme === 'dark';

  return (
    <div
      id="map-section-container"
      className={`relative w-full h-full overflow-hidden ${
        isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'
      }`}
    >
      <APIProvider apiKey={apiKey}>
        <Map
          id="tracking-google-map"
          defaultCenter={defaultCenter}
          defaultZoom={16}
          mapTypeId={mapType}
          gestureHandling="greedy"
          disableDefaultUI={true}
          zoomControl={false}
          mapTypeControl={false}
          streetViewControl={false}
          fullscreenControl={false}
          className="w-full h-full"
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        >
          <MapOverlays
            segments={segments}
            currentPoint={currentPoint}
            recordedPlaces={recordedPlaces}
            customMarkers={customMarkers}
            routes={routes}
            selectedRouteId={selectedRouteId}
            selectedSegmentId={selectedSegmentId}
            userName={userName}
            isNavigating={isNavigating}
            theme={theme}
            allUsers={allUsers}
            selectedUserIdFilter={selectedUserIdFilter}
            onSelectPlace={handlePlaceClick}
            onSelectCustomMarker={handleCustomMarkerClick}
            onSelectRoute={onSelectRoute}
            onMapClick={handleMapClick}
          />
          <MapCameraController
            targetPoint={currentPoint ? { lat: currentPoint.lat, lng: currentPoint.lng } : null}
            triggerCenter={recenterCount}
            routes={routes}
          />
        </Map>
      </APIProvider>

      {/* Multi-User & Multi-Filter Bar below header */}
      {allUsers.length > 0 && (
        <div
          id="top-multi-user-bar"
          className={`absolute top-3 left-3 right-3 z-20 flex flex-wrap items-center justify-between gap-2.5 p-2 rounded-2xl backdrop-blur-md border shadow-md transition-all ${
            isDark
              ? 'bg-zinc-950/80 border-zinc-800/80 text-zinc-100'
              : 'bg-white/85 border-zinc-200/80 text-zinc-900'
          }`}
        >
          {/* Left: Horizontal Users Bar (No Emoji Icons Next to Names) */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-[65%]">
            <button
              id="filter-user-all-btn"
              onClick={() => onSelectUserFilter && onSelectUserFilter('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition border cursor-pointer ${
                selectedUserIdFilter === 'all'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent shadow-xs'
                  : 'bg-white/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800/80 hover:bg-white dark:hover:bg-zinc-800'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>All Users ({allUsers.length})</span>
            </button>

            {allUsers.map((u) => {
              const isSelected = selectedUserIdFilter === u.id;
              return (
                <button
                  key={u.id}
                  id={`filter-user-${u.id}-btn`}
                  onClick={() => onSelectUserFilter && onSelectUserFilter(u.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition border cursor-pointer ${
                    isSelected
                      ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border-zinc-400 dark:border-zinc-500 ring-2'
                      : 'bg-white/60 dark:bg-zinc-900/60 text-zinc-700 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-800/80 hover:bg-white dark:hover:bg-zinc-800'
                  }`}
                  style={{
                    borderColor: isSelected ? u.color : undefined,
                  }}
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: u.color }} />
                  <span className="font-bold">{u.name}</span>
                  {/* Status Indicator */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                      u.isNavigating
                        ? 'bg-blue-500 animate-pulse'
                        : u.isStationary
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Right: User Sort, Content Sort, and Time Range Selectors */}
          <div className="flex items-center gap-2 shrink-0">
            {/* User Dropdown */}
            <div className="relative flex items-center">
              <Filter className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 absolute left-2.5 pointer-events-none" />
              <select
                id="user-sort-dropdown"
                value={selectedUserIdFilter}
                onChange={(e) => onSelectUserFilter && onSelectUserFilter(e.target.value)}
                className={`pl-8 pr-3 py-1.5 text-xs font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs transition ${
                  isDark
                    ? 'bg-zinc-900/90 border-zinc-700 text-zinc-100'
                    : 'bg-white/95 border-zinc-300 text-zinc-800'
                }`}
              >
                <option value="all">All</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Content Type Sub-Sort Dropdown */}
            {onSelectContentTypeFilter && (
              <select
                id="content-type-sort-dropdown"
                value={contentTypeFilter}
                onChange={(e) => onSelectContentTypeFilter(e.target.value as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs transition ${
                  isDark
                    ? 'bg-zinc-900/90 border-zinc-700 text-zinc-100'
                    : 'bg-white/95 border-zinc-300 text-zinc-800'
                }`}
              >
                <option value="all">Sort: All Content</option>
                <option value="markers">Sort: Markers Only</option>
                <option value="routes">Sort: Routes Only</option>
                <option value="movements">Sort: Live Movements</option>
              </select>
            )}

            {/* Time Range Filter Dropdown (1w, 2w, 1M, 3M, 6M) */}
            {onSelectTimeRangeFilter && (
              <div className="relative flex items-center">
                <Calendar className="w-3.5 h-3.5 text-zinc-500 dark:text-zinc-400 absolute left-2.5 pointer-events-none" />
                <select
                  id="time-range-filter-dropdown"
                  value={timeRangeFilter}
                  onChange={(e) => onSelectTimeRangeFilter(e.target.value as any)}
                  className={`pl-8 pr-3 py-1.5 text-xs font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs transition ${
                    isDark
                      ? 'bg-zinc-900/90 border-zinc-700 text-zinc-100'
                      : 'bg-white/95 border-zinc-300 text-zinc-800'
                  }`}
                >
                  <option value="all">Time: All</option>
                  <option value="1w">Last 1w</option>
                  <option value="2w">Last 2w</option>
                  <option value="1m">Last 1M</option>
                  <option value="3m">Last 3M</option>
                  <option value="6m">Last 6M</option>
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Draggable & Minimizable Active Navigation HUD */}
      {routes.length > 0 && isNavigating && (
        <div
          id="active-navigation-hud"
          style={{
            transform: `translate(${hudPos.x}px, ${hudPos.y}px)`,
          }}
          className="absolute top-20 left-1/2 -translate-x-1/2 z-30 pointer-events-auto transition-transform duration-75 select-none"
        >
          {isHudMinimized ? (
            /* MINIMIZED HUD: Blue Background, Navigation Icon, Instruction, ETA, Maximize & Close */
            <div
              className="flex items-center gap-3 px-4 py-2.5 rounded-full bg-blue-600 text-white shadow-2xl border border-blue-400/40 backdrop-blur-md cursor-grab active:cursor-grabbing"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <Navigation className="w-4 h-4 fill-white animate-pulse" />
              </div>
              <div className="flex items-center gap-2 max-w-xs truncate text-xs font-semibold">
                <span className="truncate">{activeRoute?.steps?.[0] || 'Proceed along blue route'}</span>
                <span className="text-[11px] font-mono bg-blue-700/80 px-2 py-0.5 rounded-md shrink-0">
                  {countdownSecondsRemaining !== undefined && countdownSecondsRemaining !== null
                    ? formatDuration(countdownSecondsRemaining)
                    : activeRoute?.durationFormatted}
                </span>
              </div>

              <button
                id="maximize-nav-hud-btn"
                onClick={() => setIsHudMinimized(false)}
                className="p-1 rounded-full hover:bg-white/20 transition cursor-pointer"
                title="Expand Navigation Guidance"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
              <button
                id="exit-nav-hud-btn"
                onClick={onClearRoute}
                className="p-1 rounded-full hover:bg-red-500/80 transition cursor-pointer"
                title="Cancel Route"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            /* EXPANDED FULL HUD: Draggable header, turn directions, live ETA countdown */
            <div
              className={`w-80 md:w-96 p-4 rounded-2xl shadow-2xl border backdrop-blur-md transition-all ${
                isDark
                  ? 'bg-zinc-900/95 border-blue-500/40 text-zinc-100 shadow-blue-950/40'
                  : 'bg-white/95 border-blue-500/30 text-zinc-900 shadow-blue-500/10'
              }`}
            >
              {/* Drag Handle Top Bar */}
              <div
                className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-200/60 dark:border-zinc-800/60 cursor-grab active:cursor-grabbing"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              >
                <div className="flex items-center gap-1.5 text-zinc-400 text-xs font-medium">
                  <GripHorizontal className="w-4 h-4" />
                  <span>Drag Guidance HUD</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    id="minimize-nav-hud-btn"
                    onClick={() => setIsHudMinimized(true)}
                    className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                    title="Minimize to Pill"
                  >
                    <Minimize2 className="w-4 h-4" />
                  </button>
                  <button
                    id="exit-navigation-btn"
                    onClick={onClearRoute}
                    className="p-1 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                    title="Exit Directions"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md">
                  <Navigation className="w-5 h-5 fill-white animate-pulse" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                      Navigating
                    </span>
                    <span className="text-xs font-semibold text-zinc-500 truncate">
                      {activeDestinationName ? `To: ${activeDestinationName}` : 'Destination'}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold mt-1 text-zinc-900 dark:text-zinc-50 leading-snug">
                    {activeRoute?.steps?.[0] || 'Proceed along the blue route'}
                  </h3>
                </div>
              </div>

              {/* Countdown Arrival Timer (Automatic arrival upon reaching target) */}
              <div className="mt-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-500 animate-spin" style={{ animationDuration: '4s' }} />
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      ETA Countdown
                    </div>
                    <div className="text-sm font-bold font-mono text-blue-600 dark:text-blue-400">
                      {countdownSecondsRemaining !== undefined && countdownSecondsRemaining !== null
                        ? formatDuration(countdownSecondsRemaining)
                        : activeRoute?.durationFormatted}
                    </div>
                  </div>
                </div>

                <span className="text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  Auto-Arrival Enabled
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Start Button Controls */}
      {routes.length > 0 && !isNavigating && (
        <div
          id="start-route-controls"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 pointer-events-auto select-none animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <button
            id="start-directions-btn"
            onClick={onStartNavigation}
            className="flex items-center gap-2.5 px-7 py-3 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-sm shadow-xl hover:shadow-2xl transition border border-blue-400/40 cursor-pointer"
          >
            <Navigation className="w-4 h-4 fill-white" />
            <span>Start Route</span>
          </button>
          <button
            id="cancel-route-btn"
            onClick={onClearRoute}
            className={`p-3 rounded-full border shadow-xl transition active:scale-95 cursor-pointer ${
              isDark
                ? 'bg-zinc-900/90 border-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-800'
                : 'bg-white/95 border-zinc-300 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50'
            }`}
            title="Cancel Route"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Non-Modal Add Marker Floating Panel */}
      {pendingMarkerPoint && !routes.length && (
        <div className="absolute top-16 right-4 z-20 max-w-sm w-[calc(100%-2rem)] sm:w-80 pointer-events-auto animate-in fade-in slide-in-from-top-2 duration-150">
          <div
            className={`p-4 rounded-2xl shadow-xl border backdrop-blur-md space-y-3 transition-all ${
              isDark ? 'bg-zinc-900/95 border-zinc-800 text-zinc-100' : 'bg-white/95 border-zinc-200 text-zinc-900'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    isDark ? 'bg-zinc-800 text-zinc-200' : 'bg-zinc-100 text-zinc-800'
                  }`}
                >
                  <Plus className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <h4 className="text-xs font-bold">Add Point on Map</h4>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    {pendingMarkerPoint.lat.toFixed(5)}, {pendingMarkerPoint.lng.toFixed(5)}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPendingMarkerPoint(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateMarkerSubmit} className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-medium mb-1 text-zinc-500">Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Work, Gym, Cafe"
                  value={markerName}
                  onChange={(e) => setMarkerName(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none ${
                    isDark
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-zinc-600'
                      : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-zinc-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1 text-zinc-500">Category</label>
                <div className="grid grid-cols-6 gap-1 text-xs">
                  {(
                    [
                      { id: 'generic', label: '📍' },
                      { id: 'work', label: '💼' },
                      { id: 'cafe', label: '☕' },
                      { id: 'home', label: '🏠' },
                      { id: 'store', label: '🛒' },
                      { id: 'landmark', label: '⭐' },
                    ] as const
                  ).map((cat) => (
                    <button
                      type="button"
                      key={cat.id}
                      onClick={() => setMarkerCategory(cat.id)}
                      className={`py-1 rounded-md border text-sm flex items-center justify-center transition ${
                        markerCategory === cat.id
                          ? isDark
                            ? 'bg-zinc-800 border-zinc-600'
                            : 'bg-zinc-200 border-zinc-400'
                          : isDark
                          ? 'bg-zinc-950 border-zinc-800'
                          : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!pendingMarkerPoint) return;
                    onRequestRoute(pendingMarkerPoint, markerName || 'Selected Point');
                    setPendingMarkerPoint(null);
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border flex items-center justify-center gap-1 transition ${
                    isDark
                      ? 'bg-zinc-800 border-zinc-700 text-zinc-100 hover:bg-zinc-750'
                      : 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200'
                  }`}
                >
                  <Route className="w-3.5 h-3.5 text-emerald-500" />
                  Route Here
                </button>

                <button
                  type="submit"
                  className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${
                    isDark
                      ? 'bg-zinc-100 text-zinc-900 hover:bg-white'
                      : 'bg-zinc-900 text-white hover:bg-zinc-800'
                  }`}
                >
                  Save Marker
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Marker Modal */}
      {editingMarker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div
            className={`w-full max-w-sm p-5 rounded-2xl shadow-2xl border space-y-4 ${
              isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between border-b pb-3 border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center gap-2">
                <Pencil className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold">Edit Custom Marker</h3>
              </div>
              <button
                onClick={() => setEditingMarker(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditMarker} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-500">Marker Name</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${
                    isDark
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500'
                      : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-blue-500'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-500">Category</label>
                <div className="grid grid-cols-6 gap-1 text-xs">
                  {(
                    [
                      { id: 'generic', label: '📍' },
                      { id: 'work', label: '💼' },
                      { id: 'cafe', label: '☕' },
                      { id: 'home', label: '🏠' },
                      { id: 'store', label: '🛒' },
                      { id: 'landmark', label: '⭐' },
                    ] as const
                  ).map((cat) => (
                    <button
                      type="button"
                      key={cat.id}
                      onClick={() => setEditCat(cat.id)}
                      className={`py-1.5 rounded-lg border text-sm flex items-center justify-center transition ${
                        editCat === cat.id
                          ? isDark
                            ? 'bg-blue-950 border-blue-500 text-blue-400'
                            : 'bg-blue-50 border-blue-500 text-blue-600'
                          : isDark
                          ? 'bg-zinc-950 border-zinc-800'
                          : 'bg-zinc-50 border-zinc-200'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-500">Description / Notes</label>
                <textarea
                  rows={2}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  placeholder="Optional notes or details..."
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${
                    isDark
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500'
                      : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-blue-500'
                  }`}
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                {onDeleteCustomMarker && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingMarker) return;
                      onDeleteCustomMarker(editingMarker.id);
                      setEditingMarker(null);
                    }}
                    className="p-2.5 rounded-xl border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
                    title="Delete Marker"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setEditingMarker(null)}
                  className="flex-1 py-2 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-5 left-4 z-10 flex items-center gap-2 select-none">
        <div
          id="minimal-map-legend"
          className={`flex items-center gap-2 sm:gap-3 px-2.5 sm:px-3 py-1.5 rounded-full shadow-md border backdrop-blur-md text-[11px] font-medium transition-all ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 text-zinc-300'
              : 'bg-white/95 border-zinc-200 text-zinc-700'
          }`}
        >
          <div className="flex items-center gap-1.5" title="Trekking (walking/hiking)">
            <Footprints className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="hidden sm:inline">Trekking</span>
          </div>

          <span className="w-px h-3 bg-zinc-300 dark:bg-zinc-700" />

          <div className="flex items-center gap-1.5" title="Vehicle (car/transit)">
            <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="hidden sm:inline">Vehicle</span>
          </div>

          <span className="w-px h-3 bg-zinc-300 dark:bg-zinc-700" />

          <div className="flex items-center gap-1.5" title="Recorded Places">
            <MapPin className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <span className="hidden sm:inline">Places</span>
          </div>
        </div>

        {/* Icon Button: Re-center */}
        <button
          id="icon-recenter-btn"
          onClick={handleRecenter}
          className={`p-2 rounded-full shadow-md border backdrop-blur-md transition-all active:scale-95 cursor-pointer ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 text-zinc-200 hover:bg-zinc-800'
              : 'bg-white/95 border-zinc-200 text-zinc-700 hover:bg-zinc-50'
          }`}
          title="Recenter Map to Current Location"
        >
          <LocateFixed className="w-4 h-4" />
        </button>

        {/* Icon Button: Map Type Switcher */}
        <button
          id="icon-maptype-btn"
          onClick={() =>
            setMapType((prev) =>
              prev === 'roadmap' ? 'satellite' : prev === 'satellite' ? 'terrain' : 'roadmap'
            )
          }
          className={`p-2 rounded-full shadow-md border backdrop-blur-md transition-all active:scale-95 cursor-pointer ${
            isDark
              ? 'bg-zinc-900/90 border-zinc-800 text-zinc-200 hover:bg-zinc-800'
              : 'bg-white/95 border-zinc-200 text-zinc-700 hover:bg-zinc-50'
          }`}
          title={`Switch Map Type (Current: ${mapType})`}
        >
          <Layers className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
