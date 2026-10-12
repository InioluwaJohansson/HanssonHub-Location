import React, { useState, useRef, useMemo, useCallback, useEffect } from 'react';
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
  CompletedRouteLog,
  ContentTypeFilter,
  TimeRangeFilter,
} from '../types';
import { MapOverlays } from './MapOverlays';
import {
  LocateFixed,
  Layers,
  Footprints,
  Car,
  Plane,
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
  CornerUpLeft,
  CornerUpRight,
  ArrowUp,
  RotateCcw,
  Search,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Globe,
  Loader2,
  Volume2,
  VolumeX,
  Building2,
  Flame,
} from 'lucide-react';
import { TemporalHeatmap } from './TemporalHeatmap';
import { formatDistance, formatDuration, calculateDistanceMeters } from '../utils/geo';
import {
  speakVoice,
  isVoiceMuted,
  setVoiceMuted,
  formatVoiceDistance,
  VOICE_THRESHOLDS,
} from '../utils/voiceNavigation';

interface MapTrackerProps {
  apiKey: string;
  currentPoint: LocationPoint | null;
  segments: JourneySegment[];
  recordedPlaces: RecordedPlace[];
  customMarkers: CustomMarker[];
  routes: RouteOption[];
  selectedRouteId: number | null;
  selectedSegmentId: number | null;
  stationaryState: StationaryState;
  isTracking: boolean;
  theme: AppTheme;
  userName?: string;
  userAvatarUrl?: string;
  activeDestinationName?: string | null;
  isNavigating: boolean;
  allUsers?: AppUser[];
  selectedUserIdFilter?: number | 'all';
  contentTypeFilter?: ContentTypeFilter;
  timeRangeFilter?: TimeRangeFilter;
  pointsHistory?: LocationPoint[];
  completedRoutes?: CompletedRouteLog[];
  isSidebarCollapsed?: boolean;
  onSelectUserFilter?: (userId: number | 'all') => void;
  onSelectContentTypeFilter?: (type: ContentTypeFilter) => void;
  onSelectTimeRangeFilter?: (range: TimeRangeFilter) => void;
  onStartNavigation: () => void;
  onSelectPlace: (place: RecordedPlace) => void;
  onSelectCustomMarker: (marker: CustomMarker) => void;
  onAddCustomMarker: (marker: {
    lat: number;
    lng: number;
    name: string;
    description: string;
    category?: string;
    color?: string;
  }) => void;
  onEditCustomMarker?: (marker: CustomMarker) => void;
  onDeleteCustomMarker?: (markerId: number) => void;
  onEditStayPointAsMarker?: (place: RecordedPlace) => void;
  onRequestRoute: (dest: { lat: number; lng: number }, destName?: string) => void;
  onSelectRoute: (routeId: number) => void;
  onClearRoute: () => void;
  onCompleteRoute?: () => void;
  countdownSecondsRemaining?: number | null;
}

// Sub-component to handle map camera actions like re-centering and route framing
const MapCameraController: React.FC<{
  targetPoint: { lat: number; lng: number } | null;
  triggerCenter: number;
  routes: RouteOption[];
  allUsers?: AppUser[];
  selectedUserIdFilter?: number | 'all';
}> = ({ targetPoint, triggerCenter, routes, allUsers = [], selectedUserIdFilter = 'all' }) => {
  const map = useMap();
  const prevTriggerCenter = React.useRef(triggerCenter);
  const prevRoutesLen = React.useRef(0);
  const initialFitDoneRef = React.useRef(false);
  const prevFilterRef = React.useRef(selectedUserIdFilter);
  const animFrameRef = React.useRef<number | null>(null);

  // Clean up any running animation frame on unmount
  React.useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, []);

  // Automatically fit camera bounds to include ALL users or smoothly glide to selected user
  React.useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps || !allUsers || allUsers.length === 0) return;

    if (routes.length > 0) return; // Respect active route bounds when navigating or viewing routes

    const isFilterChangedToAll = selectedUserIdFilter === 'all' && prevFilterRef.current !== 'all';

    if (!initialFitDoneRef.current || isFilterChangedToAll) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      const bounds = new google.maps.LatLngBounds();
      let validCount = 0;
      allUsers.forEach((u) => {
        if (u.currentPoint && typeof u.currentPoint.lat === 'number' && !isNaN(u.currentPoint.lat)) {
          bounds.extend({ lat: u.currentPoint.lat, lng: u.currentPoint.lng });
          validCount++;
        }
      });

      if (validCount > 0) {
        map.fitBounds(bounds, { top: 90, right: 70, bottom: 90, left: 70 });
        initialFitDoneRef.current = true;
      }
    } else if (selectedUserIdFilter !== 'all' && prevFilterRef.current !== selectedUserIdFilter) {
      const selectedUser = allUsers.find((u) => u.id === selectedUserIdFilter);
      if (selectedUser?.currentPoint) {
        const targetLat = selectedUser.currentPoint.lat;
        const targetLng = selectedUser.currentPoint.lng;

        if (animFrameRef.current) {
          cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = null;
        }

        const center = map.getCenter();
        if (center) {
          const startLat = center.lat();
          const startLng = center.lng();
          const deltaLat = targetLat - startLat;
          const deltaLng = targetLng - startLng;
          const dist = Math.sqrt(deltaLat * deltaLat + deltaLng * deltaLng);

          // If distance is exceedingly small, simple pan
          if (dist < 0.00003) {
            map.panTo({ lat: targetLat, lng: targetLng });
          } else {
            const startZoom = map.getZoom() || 15;
            const targetZoom = 15;
            // Adaptive duration: 900ms to 1400ms based on distance
            const durationMs = Math.min(1400, Math.max(900, Math.round(dist * 28000)));
            const startTime = performance.now();

            // Smooth cubic ease-in-out easing function
            const easeInOutCubic = (t: number) =>
              t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            const step = (now: number) => {
              const elapsed = now - startTime;
              const progress = Math.min(1, elapsed / durationMs);
              const ease = easeInOutCubic(progress);

              const curLat = startLat + deltaLat * ease;
              const curLng = startLng + deltaLng * ease;

              map.setCenter(new google.maps.LatLng(curLat, curLng));

              // Gentle camera elevation arc over distance so motion feels cinematic
              if (dist > 0.012) {
                const zoomArc = Math.sin(progress * Math.PI) * (dist > 0.04 ? 1.5 : 0.8);
                const interimZoom = Math.round(startZoom + (targetZoom - startZoom) * ease - zoomArc);
                if (map.getZoom() !== interimZoom) {
                  map.setZoom(interimZoom);
                }
              }

              if (progress < 1) {
                animFrameRef.current = requestAnimationFrame(step);
              } else {
                map.setCenter(new google.maps.LatLng(targetLat, targetLng));
                if (map.getZoom() !== targetZoom) {
                  map.setZoom(targetZoom);
                }
                animFrameRef.current = null;
              }
            };

            animFrameRef.current = requestAnimationFrame(step);
          }
        } else {
          map.panTo({ lat: targetLat, lng: targetLng });
        }
      }
    }

    prevFilterRef.current = selectedUserIdFilter;
  }, [map, allUsers, selectedUserIdFilter, routes.length]);

  // Re-center map ONLY when triggerCenter explicitly increments
  React.useEffect(() => {
    if (map && targetPoint && triggerCenter > prevTriggerCenter.current) {
      map.panTo(targetPoint);
      if (map.getZoom() && (map.getZoom() as number) < 14) {
        map.setZoom(15);
      }
    }
    prevTriggerCenter.current = triggerCenter;
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
      map.fitBounds(bounds, { top: 80, right: 60, bottom: 100, left: 60 });
    }
    prevRoutesLen.current = routes.length;
  }, [map, routes]);

  return null;
};

interface SearchLocationItem {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: string;
  subtitle?: string;
  minDistKm?: number;
  scopeTier?: 1 | 2 | 3; // 1: Around Users, 2: State Level, 3: Country / Global
  scopeLabel?: string;
}

const PRESET_LOCATIONS: SearchLocationItem[] = [
  { id: 'loc-olumo', name: 'Olumo Rock Heritage Site', lat: 7.1565, lng: 3.3444, type: 'Historic Landmark', subtitle: 'Ikija, Abeokuta' },
  { id: 'loc-oopl', name: 'Olusegun Obasanjo Presidential Library (OOPL)', lat: 7.1260, lng: 3.3480, type: 'Cultural Complex', subtitle: 'Oke-Mosan, Abeokuta' },
  { id: 'loc-june12', name: 'June 12 Cultural Centre', lat: 7.1350, lng: 3.3540, type: 'Civic Centre', subtitle: 'Kuto, Abeokuta' },
  { id: 'loc-kuto-junction', name: 'Kuto Junction Hub', lat: 7.1475, lng: 3.3619, type: 'Transit Hub', subtitle: 'Kuto, Abeokuta' },
  { id: 'loc-mko-stadium', name: 'MKO Abiola Stadium', lat: 7.1320, lng: 3.3510, type: 'Sports Arena', subtitle: 'Kuto, Abeokuta' },
  { id: 'loc-green-legacy', name: 'Green Legacy Resort & Cafe', lat: 7.1270, lng: 3.3490, type: 'Resort & Dining', subtitle: 'Oke-Mosan, Abeokuta' },
  { id: 'loc-kuto-park', name: 'Kuto Central Motor Park', lat: 7.1370, lng: 3.3570, type: 'Transit Station', subtitle: 'Kuto, Abeokuta' },
  { id: 'loc-alake-palace', name: 'Alake of Egbaland Palace', lat: 7.1539, lng: 3.3546, type: 'Royal Palace', subtitle: 'Ake, Abeokuta' },
  { id: 'loc-centenary', name: 'Centenary Hall', lat: 7.1530, lng: 3.3520, type: 'Historic Monument', subtitle: 'Ake, Abeokuta' },
  { id: 'loc-st-peters', name: "St. Peter's Cathedral Ake", lat: 7.1540, lng: 3.3510, type: 'Cathedral', subtitle: 'Ake, Abeokuta' },
  { id: 'loc-panseke', name: 'Panseke Market & Plaza', lat: 7.1420, lng: 3.3360, type: 'Commercial Market', subtitle: 'Panseke, Abeokuta' },
  { id: 'loc-sweet-sensation', name: 'Sweet Sensation Panseke', lat: 7.1505, lng: 3.3395, type: 'Restaurant', subtitle: 'Panseke, Abeokuta' },
  { id: 'loc-onikolobo', name: 'Onikolobo Shopping Arcade', lat: 7.1400, lng: 3.3310, type: 'Shopping Arcade', subtitle: 'Onikolobo, Abeokuta' },
  { id: 'loc-adatan', name: 'Adatan Junction & Commercial Hub', lat: 7.1580, lng: 3.3680, type: 'Junction Hub', subtitle: 'Adatan, Abeokuta' },
  { id: 'loc-sacred-heart', name: 'Sacred Heart Hospital Lantoro', lat: 7.1610, lng: 3.3620, type: 'Hospital', subtitle: 'Lantoro, Abeokuta' },
  { id: 'loc-funaab', name: 'Federal University of Agriculture (FUNAAB)', lat: 7.2286, lng: 3.4449, type: 'University', subtitle: 'Alabata Road, Abeokuta' },
  { id: 'loc-mapoly', name: 'Moshood Abiola Polytechnic (MAPOLY)', lat: 7.1180, lng: 3.3210, type: 'Higher Institution', subtitle: 'Ojere, Abeokuta' },
  { id: 'loc-tech-hub', name: 'Ogun State Tech Hub', lat: 7.1460, lng: 3.3640, type: 'Tech & Innovation', subtitle: 'Kobape Road, Abeokuta' },
  { id: 'loc-gov-office', name: "Governor's Office Oke-Mosan", lat: 7.1320, lng: 3.3670, type: 'Government Secretariat', subtitle: 'Oke-Mosan, Abeokuta' },
  { id: 'loc-fmc', name: 'Federal Medical Centre (FMC) Idi-Aba', lat: 7.1510, lng: 3.3760, type: 'Medical Centre', subtitle: 'Idi-Aba, Abeokuta' },
  { id: 'loc-ibara-estate', name: 'Ibara Housing Estate', lat: 7.1450, lng: 3.3420, type: 'Residential Area', subtitle: 'Ibara, Abeokuta' },
  { id: 'loc-aro-hospital', name: 'Neuropsychiatric Hospital Aro', lat: 7.1750, lng: 3.3280, type: 'Specialist Hospital', subtitle: 'Aro, Abeokuta' },
];

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
  userAvatarUrl,
  activeDestinationName,
  isNavigating,
  allUsers = [],
  selectedUserIdFilter = 'all',
  contentTypeFilter = 'all',
  timeRangeFilter = 'all',
  pointsHistory = [],
  completedRoutes = [],
  isSidebarCollapsed = false,
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
  const [mapCameraTarget, setMapCameraTarget] = useState<{ lat: number; lng: number } | null>(null);

  // References for container and HUD sizing
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);

  // Location Search State for finding locations and autocomplete
  const [searchLocationQuery, setSearchLocationQuery] = useState('');
  const [selectedSearchLocation, setSelectedSearchLocation] = useState<SearchLocationItem | null>(null);
  const [isAutocompleteOpen, setIsAutocompleteOpen] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Worldwide location search state using Photon OpenStreetMap geocoding
  const [worldwideResults, setWorldwideResults] = useState<SearchLocationItem[]>([]);
  const [isSearchingWorldwide, setIsSearchingWorldwide] = useState(false);

  // Custom User Dropdown state
  const [isUserDropdownOpen, setIsUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setIsAutocompleteOpen(false);
      }
      if (userDropdownRef.current && !userDropdownRef.current.contains(e.target as Node)) {
        setIsUserDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Navigate dynamically between users
  const handleCycleUser = useCallback(
    (direction: 'prev' | 'next') => {
      if (!allUsers || allUsers.length === 0 || !onSelectUserFilter) return;
      const currentIdx = allUsers.findIndex((u) => u.id === selectedUserIdFilter);
      let nextIdx = 0;
      if (direction === 'next') {
        nextIdx = currentIdx === -1 || currentIdx >= allUsers.length - 1 ? 0 : currentIdx + 1;
      } else {
        nextIdx = currentIdx <= 0 ? allUsers.length - 1 : currentIdx - 1;
      }
      const targetUser = allUsers[nextIdx];
      if (targetUser) {
        onSelectUserFilter(targetUser.id);
      }
    },
    [allUsers, selectedUserIdFilter, onSelectUserFilter]
  );

  // Search known locations all around the world via Photon Geocoding API (biased around user cluster center)
  useEffect(() => {
    if (!searchLocationQuery || searchLocationQuery.trim().length < 2) {
      setWorldwideResults([]);
      setIsSearchingWorldwide(false);
      return;
    }

    const query = searchLocationQuery.trim();
    setIsSearchingWorldwide(true);

    // Compute user cluster center coordinate to bias photon geocoder towards user area
    const userPts = allUsers
      .map((u) => u.currentPoint)
      .filter((p): p is LocationPoint => !!p && typeof p.lat === 'number' && !isNaN(p.lat));
    const centerLat = userPts.length
      ? userPts.reduce((acc, p) => acc + p.lat, 0) / userPts.length
      : 7.1475;
    const centerLng = userPts.length
      ? userPts.reduce((acc, p) => acc + p.lng, 0) / userPts.length
      : 3.3619;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&lat=${centerLat}&lon=${centerLng}&limit=15`
        );
        if (res.ok) {
          const data = await res.json();
          if (data && Array.isArray(data.features)) {
            const remoteItems: SearchLocationItem[] = data.features.map(
              (feat: any, idx: number) => {
                const props = feat.properties || {};
                const coords = feat.geometry?.coordinates || [0, 0];
                const lng = coords[0];
                const lat = coords[1];

                const name = props.name || props.street || props.city || query;
                const subParts = [props.city, props.state, props.country].filter(Boolean);
                const subtitle = subParts.join(', ');
                const type =
                  props.osm_value ||
                  props.type ||
                  (props.city ? 'City' : props.country ? 'Country' : 'Worldwide Location');

                return {
                  id: `world-${props.osm_id || idx}-${lat.toFixed(4)}`,
                  name,
                  lat,
                  lng,
                  type: type.charAt(0).toUpperCase() + type.slice(1),
                  subtitle: subtitle || 'Global location',
                };
              }
            );
            setWorldwideResults(remoteItems);
          }
        }
      } catch (err) {
        console.warn('Worldwide geocoding fetch error:', err);
      } finally {
        setIsSearchingWorldwide(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [searchLocationQuery, allUsers]);

  // Search catalog combining preset landmarks, custom markers, and recorded places
  const searchableLocations = useMemo(() => {
    const list: SearchLocationItem[] = [...PRESET_LOCATIONS];
    customMarkers.forEach((m) => {
      list.push({
        id: `marker-${m.id}`,
        name: m.name,
        lat: m.lat,
        lng: m.lng,
        type: 'Saved Marker',
        subtitle: m.description || (m.userName ? `Added by ${m.userName}` : undefined),
      });
    });
    recordedPlaces.forEach((p) => {
      list.push({
        id: `place-${p.id}`,
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        type: 'Visited Place',
        subtitle: p.address || (p.notes ? p.notes : 'Visited location'),
      });
    });
    return list;
  }, [customMarkers, recordedPlaces]);

  // Merge local matches with geocoded results, categorized by scope tier:
  // Scope 1: Area around all users (Immediate local area / < 20km)
  // Scope 2: State level (Ogun State / Regional / < 120km)
  // Scope 3: Country & Global level (Nigeria nationwide & worldwide)
  const filteredLocations = useMemo(() => {
    if (!searchLocationQuery.trim()) return [];
    const q = searchLocationQuery.toLowerCase().trim();

    // 1. Local catalog matches
    const localMatches = searchableLocations.filter(
      (loc) =>
        loc.name.toLowerCase().includes(q) ||
        (loc.subtitle && loc.subtitle.toLowerCase().includes(q)) ||
        loc.type.toLowerCase().includes(q)
    );

    // 2. Merge worldwide results, deduplicating by normalized name
    const seenNames = new Set(localMatches.map((m) => m.name.toLowerCase()));
    const merged = [...localMatches];

    worldwideResults.forEach((worldItem) => {
      if (!seenNames.has(worldItem.name.toLowerCase())) {
        seenNames.add(worldItem.name.toLowerCase());
        merged.push(worldItem);
      }
    });

    // Compute scope tier for each location relative to all active user positions
    const userPts = allUsers
      .map((u) => u.currentPoint)
      .filter((p): p is LocationPoint => !!p && typeof p.lat === 'number' && !isNaN(p.lat));

    const scored = merged.map((loc) => {
      let minDistKm = 99999;
      if (userPts.length > 0) {
        userPts.forEach((p) => {
          const distM = calculateDistanceMeters(loc.lat, loc.lng, p.lat, p.lng);
          const distKm = distM / 1000;
          if (distKm < minDistKm) minDistKm = distKm;
        });
      } else {
        minDistKm = calculateDistanceMeters(loc.lat, loc.lng, 7.1475, 3.3619) / 1000;
      }

      const isLocalPreset = PRESET_LOCATIONS.some((p) => p.name === loc.name);
      const isOgunState =
        loc.subtitle?.toLowerCase().includes('ogun') ||
        loc.name.toLowerCase().includes('ogun') ||
        loc.subtitle?.toLowerCase().includes('abeokuta') ||
        (minDistKm > 20 && minDistKm <= 120);

      let scopeTier: 1 | 2 | 3 = 3;
      let scopeLabel = '🇳🇬 Nigeria & Country Level';

      if (minDistKm <= 20 || isLocalPreset || loc.type === 'Saved Marker' || loc.type === 'Visited Place') {
        scopeTier = 1;
        scopeLabel = '📍 Around All Users (Local Area)';
      } else if (isOgunState) {
        scopeTier = 2;
        scopeLabel = '🏛️ State Level (Ogun State)';
      }

      return {
        ...loc,
        minDistKm: Number(minDistKm.toFixed(1)),
        scopeTier,
        scopeLabel,
      };
    });

    // Hierarchical sorting: Scope 1 (Area around all users) FIRST, Scope 2 (State) SECOND, Scope 3 (Country) THIRD
    scored.sort((a, b) => {
      if (a.scopeTier !== b.scopeTier) {
        return a.scopeTier - b.scopeTier;
      }
      return (a.minDistKm || 0) - (b.minDistKm || 0);
    });

    return scored.slice(0, 15);
  }, [searchLocationQuery, searchableLocations, worldwideResults, allUsers]);

  // Draggable Direction Overlay HUD state
  const [hudPos, setHudPos] = useState({ x: 20, y: 75 });
  const [isHudMinimized, setIsHudMinimized] = useState(false);
  const [isHudInitialized, setIsHudInitialized] = useState(false);
  const isDraggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Calculate HUD bounds dynamically based on the current map container size.
  // When movement logs panel is expanded or collapsed, containerWidth updates automatically,
  // pushing or constraining the direction notification so it always remains fully visible inside the map view.
  const getHudBounds = useCallback(() => {
    const container = mapContainerRef.current;
    const containerWidth =
      container?.clientWidth ||
      (typeof window !== 'undefined' ? window.innerWidth * (isSidebarCollapsed ? 1 : 0.7) : 800);
    const containerHeight =
      container?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);

    const hudW = hudRef.current?.offsetWidth || (isHudMinimized ? 112 : 384);
    const hudH = hudRef.current?.offsetHeight || (isHudMinimized ? 112 : 210);

    const minX = 12;
    const maxX = Math.max(minX, containerWidth - hudW - 12);
    const minY = 65; // Below the top multi-user / search bar
    const maxY = Math.max(minY, containerHeight - hudH - 20);

    return { minX, maxX, minY, maxY, hudW, hudH, containerWidth };
  }, [isSidebarCollapsed, isHudMinimized]);

  // Initialize and keep HUD clamped inside the visible map area
  useEffect(() => {
    if (routes.length === 0) return;
    const { minX, maxX, minY, maxY, hudW, containerWidth } = getHudBounds();
    setHudPos((prev) => {
      if (!isHudInitialized) {
        const initialX = Math.max(minX, Math.round((containerWidth - hudW) / 2));
        return { x: Math.min(initialX, maxX), y: 75 };
      }
      return {
        x: Math.min(Math.max(minX, prev.x), maxX),
        y: Math.min(Math.max(minY, prev.y), maxY),
      };
    });
    if (!isHudInitialized) {
      setIsHudInitialized(true);
    }
  }, [routes.length, isSidebarCollapsed, isHudMinimized, getHudBounds, isHudInitialized]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, select, input, a')) return;
    isDraggingRef.current = true;
    dragOffsetRef.current = { x: e.clientX - hudPos.x, y: e.clientY - hudPos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingRef.current) return;
    const { minX, maxX, minY, maxY } = getHudBounds();
    const rawX = e.clientX - dragOffsetRef.current.x;
    const rawY = e.clientY - dragOffsetRef.current.y;
    setHudPos({
      x: Math.min(Math.max(minX, rawX), maxX),
      y: Math.min(Math.max(minY, rawY), maxY),
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch (_) {}
  };

  // New marker creation state from clicking map
  const [pendingMarkerPoint, setPendingMarkerPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [markerName, setMarkerName] = useState('');
  const [markerDesc, setMarkerDesc] = useState('');
  const [markerCategory, setMarkerCategory] = useState('generic');
  const [markerColor, setMarkerColor] = useState('#3B82F6');

  // Editing existing marker state
  const [editingMarker, setEditingMarker] = useState<CustomMarker | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editCategory, setEditCategory] = useState('generic');
  const [editColor, setEditColor] = useState('#3B82F6');
  const [confirmDeleteMarkerId, setConfirmDeleteMarkerId] = useState<number | null>(null);

  const defaultCenter = currentPoint
    ? { lat: currentPoint.lat, lng: currentPoint.lng }
    : { lat: 7.1475, lng: 3.3619 };

  // Currently active route (either selected or fastest default)
  const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];

  // Voice Navigation State & Spoken Thresholds Ref
  const [isVoiceMutedState, setIsVoiceMutedState] = useState<boolean>(isVoiceMuted());
  const spokenThresholdsRef = useRef<Set<number>>(new Set());
  const prevNavigatingRef = useRef<boolean>(false);

  // Toggle voice navigation
  const handleToggleVoice = useCallback(() => {
    const nextMuted = !isVoiceMutedState;
    setIsVoiceMutedState(nextMuted);
    setVoiceMuted(nextMuted);
    if (!nextMuted && isNavigating) {
      speakVoice('Voice navigation enabled.', true);
    }
  }, [isVoiceMutedState]);

  // Turn-by-Turn Voice Navigation Guidance Effect (50m, 100m, 200m, 500m, 1km thresholds)
  useEffect(() => {
    // When navigation starts (transitions from false -> true)
    if (isNavigating && !prevNavigatingRef.current) {
      spokenThresholdsRef.current.clear();
      const destName = activeDestinationName || 'Destination';
      const firstStep = activeRoute?.steps?.[0] || 'Proceed along the highlighted route';
      speakVoice(`Navigation started to ${destName}. ${firstStep}.`);
    }
    prevNavigatingRef.current = isNavigating;

    if (!isNavigating) {
      spokenThresholdsRef.current.clear();
      return;
    }

    // Determine current remaining distance
    const totalDistance = activeRoute?.distanceMeters || 1200;
    let remainingMeters = totalDistance;

    if (countdownSecondsRemaining !== undefined && countdownSecondsRemaining !== null) {
      const durationSec = activeRoute?.durationSeconds || 180;
      const ratio = Math.max(0, countdownSecondsRemaining) / Math.max(1, durationSec);
      remainingMeters = Math.round(totalDistance * ratio);
    } else if (currentPoint && activeRoute?.path && activeRoute.path.length > 0) {
      const destPt = activeRoute.path[activeRoute.path.length - 1];
      remainingMeters = calculateDistanceMeters(
        currentPoint.lat,
        currentPoint.lng,
        destPt.lat,
        destPt.lng
      );
    }

    const stepText = activeRoute?.steps?.[0] || 'turn towards your destination';

    // Voice announcements for exact thresholds: 1km (1000m), 500m, 200m, 100m, 50m
    VOICE_THRESHOLDS.forEach((threshold) => {
      const upperLimit = threshold === 1000 ? 1100 : threshold * 1.15;
      const lowerLimit = threshold * 0.75;

      if (remainingMeters <= upperLimit && remainingMeters >= lowerLimit) {
        if (!spokenThresholdsRef.current.has(threshold)) {
          spokenThresholdsRef.current.add(threshold);
          const distPhrase = formatVoiceDistance(threshold);
          speakVoice(`In ${distPhrase}, ${stepText}`);
        }
      }
    });

    // Destination arrival voice prompt
    if (remainingMeters <= 20 && !spokenThresholdsRef.current.has(0)) {
      spokenThresholdsRef.current.add(0);
      const destName = activeDestinationName || 'Destination';
      speakVoice(`You have arrived at your destination: ${destName}.`);
    }
  }, [
    isNavigating,
    countdownSecondsRemaining,
    activeRoute,
    activeDestinationName,
    currentPoint,
  ]);

  const handlePlaceClick = (place: RecordedPlace) => {
    onSelectPlace(place);
    setMapCameraTarget({ lat: place.lat, lng: place.lng });
    setRecenterCount((c) => c + 1);
    onRequestRoute({ lat: place.lat, lng: place.lng }, place.name || 'Recorded Place');
  };

  const handleCustomMarkerClick = (marker: CustomMarker) => {
    onSelectCustomMarker(marker);
    setMapCameraTarget({ lat: marker.lat, lng: marker.lng });
    setRecenterCount((c) => c + 1);
    onRequestRoute({ lat: marker.lat, lng: marker.lng }, marker.name);
  };

  const handleMapClick = (coords: { lat: number; lng: number }) => {
    setPendingMarkerPoint(coords);
    setMarkerName('');
    setMarkerDesc('');
    setMarkerCategory('generic');
    setMarkerColor('#3B82F6');
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
      category: markerCategory.trim() || 'generic',
      color: markerColor,
    });
    setPendingMarkerPoint(null);
  };

  const openMarkerEditModal = (marker: CustomMarker) => {
    setEditingMarker(marker);
    setEditName(marker.name);
    setEditDesc(marker.description || '');
    setEditCategory(marker.category || 'generic');
    setEditColor(marker.userColor || '#3B82F6');
  };

  const handleSaveEditMarker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMarker || !onEditCustomMarker) return;
    onEditCustomMarker({
      ...editingMarker,
      name: editName.trim() || editingMarker.name,
      description: editDesc.trim(),
      category: editCategory.trim() || 'generic',
      userColor: editColor,
    });
    setEditingMarker(null);
  };

  const handleRecenter = () => {
    if (currentPoint) {
      setMapCameraTarget({ lat: currentPoint.lat, lng: currentPoint.lng });
    }
    setRecenterCount((c) => c + 1);
  };

  const isDark = theme === 'dark';

  return (
    <div
      ref={mapContainerRef}
      id="map-section-container"
      className={`relative w-full h-full overflow-hidden ${
        isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-100 text-zinc-900'
      }`}
    >
      <APIProvider apiKey={apiKey}>
        <Map
          id="tracking-google-map"
          defaultCenter={defaultCenter}
          defaultZoom={13}
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
            userAvatarUrl={userAvatarUrl}
            isNavigating={isNavigating}
            theme={theme}
            allUsers={allUsers}
            selectedUserIdFilter={selectedUserIdFilter}
            contentTypeFilter={contentTypeFilter}
            onSelectUser={onSelectUserFilter}
            onSelectPlace={handlePlaceClick}
            onSelectCustomMarker={handleCustomMarkerClick}
            onSelectRoute={onSelectRoute}
            onMapClick={handleMapClick}
            onRequestRoute={onRequestRoute}
          />
          {(contentTypeFilter === 'all' || contentTypeFilter === 'heatmap') && (
            <TemporalHeatmap
              theme={theme}
              timeRangeFilter={timeRangeFilter}
              selectedUserIdFilter={selectedUserIdFilter}
              pointsHistory={pointsHistory}
              segments={segments}
              completedRoutes={completedRoutes}
              allUsers={allUsers}
              onClose={() => onSelectContentTypeFilter && onSelectContentTypeFilter('all')}
              onSelectTimeRangeFilter={onSelectTimeRangeFilter}
            />
          )}
          <MapCameraController
            targetPoint={mapCameraTarget || (currentPoint ? { lat: currentPoint.lat, lng: currentPoint.lng } : null)}
            triggerCenter={recenterCount}
            routes={routes}
            allUsers={allUsers}
            selectedUserIdFilter={selectedUserIdFilter}
          />
        </Map>
      </APIProvider>

      {/* Reconfigured Top Toolbar: Location Search + Autocomplete & Plot Route Button, Users Dropdown, Content Sort, Time Range */}
      <div
        id="top-multi-user-bar"
        className={`absolute top-3 left-3 z-20 flex items-center justify-between gap-2.5 p-2 rounded-2xl backdrop-blur-md border shadow-md transition-all ${
          isSidebarCollapsed
            ? 'w-full max-w-[70%] flex-nowrap overflow-x-auto no-scrollbar'
            : 'w-[calc(100%-1.5rem)] max-w-2xl lg:max-w-3xl flex-wrap md:flex-nowrap'
        } ${
          isDark
            ? 'bg-zinc-950/85 border-zinc-800/80 text-zinc-100'
            : 'bg-white/90 border-zinc-200/80 text-zinc-900'
        }`}
      >
        {/* Left: Worldwide Location Search Bar + Autocomplete + Plot Route Primary Button (Width increased by 50% on laptop screens) */}
        <div
          ref={searchContainerRef}
          className="relative flex items-center gap-2 flex-1 min-w-[200px] max-w-md lg:max-w-[405px] xl:max-w-[420px]"
        >
          <div className="relative flex-1 flex items-center">
            <Globe className="w-3.5 h-3.5 text-blue-500 absolute left-3 pointer-events-none" />
            <input
              id="location-search-input"
              type="text"
              value={searchLocationQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchLocationQuery(val);
                setIsAutocompleteOpen(true);
                if (selectedSearchLocation && selectedSearchLocation.name !== val) {
                  setSelectedSearchLocation(null);
                }
              }}
              onFocus={() => {
                if (searchLocationQuery.trim()) {
                  setIsAutocompleteOpen(true);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && filteredLocations.length > 0) {
                  const firstLoc = filteredLocations[0];
                  setSearchLocationQuery(firstLoc.name);
                  setSelectedSearchLocation(firstLoc);
                  setIsAutocompleteOpen(false);
                  setMapCameraTarget({ lat: firstLoc.lat, lng: firstLoc.lng });
                  setRecenterCount((c) => c + 1);
                }
              }}
              placeholder="Search locations (Area ➔ State ➔ Country)..."
              className={`w-full pl-9 pr-8 py-1.5 text-xs rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-xs transition ${
                isDark
                  ? 'bg-zinc-900/90 border-zinc-700 text-zinc-100 placeholder:text-zinc-500'
                  : 'bg-white/95 border-zinc-300 text-zinc-900 placeholder:text-zinc-400'
              }`}
            />
            {isSearchingWorldwide && (
              <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin absolute right-8 pointer-events-none" />
            )}
            {searchLocationQuery && (
              <button
                type="button"
                id="clear-search-location-btn"
                onClick={() => {
                  setSearchLocationQuery('');
                  setSelectedSearchLocation(null);
                  setIsAutocompleteOpen(false);
                }}
                className="absolute right-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* If a viable location from autocomplete is selected, show the "Plot Route" primary button */}
          {selectedSearchLocation && (
            <button
              type="button"
              id="search-plot-route-btn"
              onClick={() => {
                setMapCameraTarget({ lat: selectedSearchLocation.lat, lng: selectedSearchLocation.lng });
                setRecenterCount((c) => c + 1);
                onRequestRoute(
                  { lat: selectedSearchLocation.lat, lng: selectedSearchLocation.lng },
                  selectedSearchLocation.name
                );
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white text-xs font-bold shadow-md hover:shadow-lg transition cursor-pointer shrink-0 animate-in fade-in"
            >
              <Navigation className="w-3.5 h-3.5 fill-white" />
              <span>Plot Route</span>
            </button>
          )}

          {/* Autocomplete Dropdown Categorized by Search Scope Hierarchy */}
          {isAutocompleteOpen && filteredLocations.length > 0 && (
            <div
              id="location-search-autocomplete"
              className={`absolute top-full left-0 mt-1.5 rounded-xl border shadow-xl backdrop-blur-md overflow-hidden z-40 max-h-72 min-w-[280px] sm:min-w-[340px] max-w-md w-full overflow-y-auto no-scrollbar py-1 ${
                isDark ? 'bg-zinc-900/98 border-zinc-700 text-zinc-100' : 'bg-white/98 border-zinc-200 text-zinc-900'
              }`}
            >
              {(() => {
                const tier1 = filteredLocations.filter((item) => item.scopeTier === 1);
                const tier2 = filteredLocations.filter((item) => item.scopeTier === 2);
                const tier3 = filteredLocations.filter((item) => item.scopeTier === 3);

                const renderLocationItem = (loc: SearchLocationItem) => (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      setSearchLocationQuery(loc.name);
                      setSelectedSearchLocation(loc);
                      setIsAutocompleteOpen(false);
                      setMapCameraTarget({ lat: loc.lat, lng: loc.lng });
                      setRecenterCount((c) => c + 1);
                    }}
                    className={`w-full px-3 py-2 text-left flex items-start gap-2.5 hover:bg-blue-500/10 transition cursor-pointer border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 ${
                      selectedSearchLocation?.id === loc.id ? 'bg-blue-500/15' : ''
                    }`}
                  >
                    <MapPin className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold truncate text-zinc-900 dark:text-zinc-100">{loc.name}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {loc.minDistKm !== undefined && loc.minDistKm < 1000 && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono font-bold">
                              {loc.minDistKm} km
                            </span>
                          )}
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                            {loc.type}
                          </span>
                        </div>
                      </div>
                      {loc.subtitle && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">{loc.subtitle}</p>
                      )}
                    </div>
                  </button>
                );

                return (
                  <div>
                    {tier1.length > 0 && (
                      <div>
                        <div className="px-3 py-1 bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-[10px] uppercase tracking-wider flex items-center justify-between border-y border-blue-500/20">
                          <span className="flex items-center gap-1">📍 Around All Users (Local Area)</span>
                          <span className="text-[9px] font-mono text-blue-500">1st Priority</span>
                        </div>
                        {tier1.map(renderLocationItem)}
                      </div>
                    )}

                    {tier2.length > 0 && (
                      <div>
                        <div className="px-3 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold text-[10px] uppercase tracking-wider flex items-center justify-between border-y border-amber-500/20">
                          <span className="flex items-center gap-1">🏛️ State Level (Ogun State)</span>
                          <span className="text-[9px] font-mono text-amber-500">2nd Priority</span>
                        </div>
                        {tier2.map(renderLocationItem)}
                      </div>
                    )}

                    {tier3.length > 0 && (
                      <div>
                        <div className="px-3 py-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 font-bold text-[10px] uppercase tracking-wider flex items-center justify-between border-y border-purple-500/20">
                          <span className="flex items-center gap-1">🇳🇬 Nigeria & Country Level</span>
                          <span className="text-[9px] font-mono text-purple-500">3rd Priority</span>
                        </div>
                        {tier3.map(renderLocationItem)}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>

        {/* Right: Users Dropdown, Content Sort, Time Range Filter */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Custom Users Dropdown with Profile Avatars & Color Indicators (placed to the left of the sort) */}
          {allUsers.length > 0 && (
            <div ref={userDropdownRef} className="relative shrink-0">
              {(() => {
                const activeUser =
                  selectedUserIdFilter && selectedUserIdFilter !== 'all'
                    ? allUsers.find((u) => u.id === selectedUserIdFilter)
                    : null;

                return (
                  <div
                    className={`inline-flex items-center rounded-xl border shadow-xs transition ${
                      isDark
                        ? 'bg-zinc-900/90 border-zinc-700'
                        : 'bg-white/95 border-zinc-300'
                    }`}
                  >
                    {/* Previous User Navigation Arrow */}
                    <button
                      type="button"
                      title="Navigate to previous user dynamically"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCycleUser('prev');
                      }}
                      className={`p-1.5 transition cursor-pointer border-r rounded-l-xl ${
                        isDark
                          ? 'border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                          : 'border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                      }`}
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>

                    {/* Active User Dropdown Trigger */}
                    <button
                      type="button"
                      id="users-filter-dropdown-trigger"
                      onClick={() => setIsUserDropdownOpen((prev) => !prev)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                        isDark
                          ? 'text-zinc-100 hover:bg-zinc-800'
                          : 'text-zinc-800 hover:bg-zinc-50'
                      }`}
                    >
                      {activeUser ? (
                        <>
                          {activeUser.avatar ? (
                            <img
                              src={activeUser.avatar}
                              alt={activeUser.name}
                              className="w-5 h-5 rounded-full object-cover border shrink-0"
                              style={{ borderColor: activeUser.color }}
                            />
                          ) : (
                            <div
                              className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                              style={{ backgroundColor: activeUser.color || '#3B82F6' }}
                            >
                              {activeUser.name.charAt(0).toUpperCase()}
                            </div>
                          )}
                          <span
                            className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                            style={{ backgroundColor: activeUser.color || '#3B82F6' }}
                          />
                          <span className="truncate max-w-[85px]">{activeUser.name}</span>
                        </>
                      ) : (
                        <>
                          <Users className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>All Users ({allUsers.length})</span>
                        </>
                      )}
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400 shrink-0 ml-0.5" />
                    </button>

                    {/* Next User Navigation Arrow */}
                    <button
                      type="button"
                      title="Navigate to next user dynamically"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCycleUser('next');
                      }}
                      className={`p-1.5 transition cursor-pointer border-l rounded-r-xl ${
                        isDark
                          ? 'border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                          : 'border-zinc-200 text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100'
                      }`}
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })()}

              {/* Dropdown Menu */}
              {isUserDropdownOpen && (
                <div
                  id="users-filter-dropdown-menu"
                  className={`absolute top-full left-0 mt-1 min-w-[210px] rounded-xl border shadow-xl backdrop-blur-md overflow-hidden z-40 p-1 animate-in fade-in zoom-in-95 duration-100 ${
                    isDark ? 'bg-zinc-900/98 border-zinc-700 text-zinc-100' : 'bg-white/98 border-zinc-200 text-zinc-900'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectUserFilter && onSelectUserFilter('all');
                      setIsUserDropdownOpen(false);
                    }}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 text-xs font-semibold hover:bg-blue-500/10 transition cursor-pointer ${
                      selectedUserIdFilter === 'all' ? 'bg-blue-500/15 text-blue-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 shrink-0">
                        <Users className="w-3.5 h-3.5" />
                      </div>
                      <span>All Users ({allUsers.length})</span>
                    </div>
                    {selectedUserIdFilter === 'all' && <Check className="w-3.5 h-3.5 text-blue-500" />}
                  </button>

                  <div className="my-1 border-t border-zinc-200 dark:border-zinc-800" />

                  <div className="max-h-56 overflow-y-auto no-scrollbar space-y-0.5">
                    {allUsers.map((u) => {
                      const isSelected = selectedUserIdFilter === u.id;
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            onSelectUserFilter && onSelectUserFilter(u.id);
                            setIsUserDropdownOpen(false);
                          }}
                          className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between gap-2 text-xs font-semibold hover:bg-blue-500/10 transition cursor-pointer ${
                            isSelected ? 'bg-blue-500/15 text-blue-500' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {u.avatar ? (
                              <img
                                src={u.avatar}
                                alt={u.name}
                                className="w-6 h-6 rounded-full object-cover border shrink-0"
                                style={{ borderColor: u.color }}
                              />
                            ) : (
                              <div
                                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                                style={{ backgroundColor: u.color }}
                              >
                                {u.name.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <span
                              className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                              style={{ backgroundColor: u.color }}
                              title={`Indicator: ${u.color}`}
                            />
                            <span className="truncate">{u.name}</span>
                            {u.isCurrentUser && (
                              <span className="text-[9px] px-1 py-0.2 rounded bg-blue-500/15 text-blue-500 font-bold shrink-0">
                                You
                              </span>
                            )}
                          </div>
                          {isSelected && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Content Type Selector: All, Routes Only, Heatmap */}
          {onSelectContentTypeFilter && (
            <div className="flex items-center gap-1.5 shrink-0">
              <select
                id="content-type-sort-dropdown"
                value={contentTypeFilter}
                onChange={(e) => onSelectContentTypeFilter(e.target.value as any)}
                className={`px-3 py-1.5 text-xs font-bold rounded-xl border focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs transition shrink-0 ${
                  isDark
                    ? 'bg-zinc-900/90 border-zinc-700 text-zinc-100'
                    : 'bg-white/95 border-zinc-300 text-zinc-800'
                }`}
              >
                <option value="all">All</option>
                <option value="routes">Routes Only</option>
                <option value="heatmap">Heatmap</option>
              </select>
            </div>
          )}

          {/* Time Range Filter Dropdown */}
          {onSelectTimeRangeFilter && (
            <div className="relative flex items-center shrink-0">
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
                <option value="1w">Last 1 Week</option>
                <option value="2w">Last 2 Weeks</option>
                <option value="1m">Last 1 Month</option>
                <option value="3m">Last 3 Months</option>
                <option value="6m">Last 6 Months</option>
                <option value="all">All Time</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Draggable Direction Overlay (Restricted to 70% of the Map & keeps showing when 30% log holder is collapsed) */}
      {routes.length > 0 && (
        <div
          ref={hudRef}
          id="active-navigation-hud"
          style={{
            left: `${hudPos.x}px`,
            top: `${hudPos.y}px`,
          }}
          className="absolute z-30 pointer-events-auto select-none transition-all duration-75"
        >
          {isHudMinimized ? (
            /* MINIMIZED HUD: Square Widget showing direction icon, direction text, and ETA */
            <div
              className={`w-28 h-28 rounded-2xl p-2.5 flex flex-col items-center justify-between shadow-2xl border backdrop-blur-md transition-all cursor-grab active:cursor-grabbing ${
                isDark
                  ? 'bg-zinc-900/95 border-blue-500/40 text-zinc-100 shadow-blue-950/40'
                  : 'bg-white/95 border-blue-500/40 text-zinc-900 shadow-xl shadow-blue-500/15'
              }`}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              {/* Top Controls: Voice Mute, Maximize & Close */}
              <div className="flex items-center justify-between w-full">
                <button
                  id="toggle-voice-nav-min-btn"
                  onClick={handleToggleVoice}
                  className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-blue-500 transition cursor-pointer"
                  title={isVoiceMutedState ? 'Unmute Voice Navigation' : 'Mute Voice Navigation'}
                >
                  {isVoiceMutedState ? <VolumeX className="w-3.5 h-3.5 text-zinc-400" /> : <Volume2 className="w-3.5 h-3.5 text-blue-500" />}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    id="maximize-nav-hud-btn"
                    onClick={() => setIsHudMinimized(false)}
                    className="p-1 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300 transition cursor-pointer"
                    title="Expand Guidance"
                  >
                    <Maximize2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    id="exit-nav-hud-btn"
                    onClick={onClearRoute}
                    className="p-1 rounded-lg hover:bg-red-500/20 text-red-500 transition cursor-pointer"
                    title={isNavigating ? 'Cancel Active Route' : 'Close Preview'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Direction Turn Icon & Text */}
              <div className="flex flex-col items-center justify-center my-auto text-center w-full px-0.5">
                {(() => {
                  const stepText = activeRoute?.steps?.[0] || 'Go straight';
                  const lower = stepText.toLowerCase();
                  let TurnIcon = ArrowUp;
                  if (lower.includes('left')) TurnIcon = CornerUpLeft;
                  else if (lower.includes('right')) TurnIcon = CornerUpRight;
                  else if (lower.includes('u-turn')) TurnIcon = RotateCcw;

                  return (
                    <>
                      <TurnIcon className="w-5 h-5 text-blue-500 dark:text-blue-400 mb-0.5 animate-pulse" />
                      <span className="text-[10px] font-bold line-clamp-2 leading-tight text-zinc-800 dark:text-zinc-200">
                        {stepText}
                      </span>
                    </>
                  );
                })()}
              </div>

              {/* ETA Countdown or Duration */}
              <span className="text-xs font-bold font-mono text-blue-600 dark:text-blue-400">
                {isNavigating && countdownSecondsRemaining !== undefined && countdownSecondsRemaining !== null
                  ? formatDuration(countdownSecondsRemaining)
                  : activeRoute?.durationFormatted}
              </span>
            </div>
          ) : (
            /* EXPANDED FULL HUD: Draggable header, turn directions, live ETA countdown / Start button */
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
                <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300 text-xs font-semibold">
                  <GripHorizontal className="w-4 h-4 text-zinc-400" />
                  <span>Drag Guidance HUD</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-zinc-200/80 dark:bg-zinc-800/90 text-zinc-700 dark:text-zinc-300 font-bold">
                    Visible Map Area
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    id="toggle-voice-nav-exp-btn"
                    onClick={handleToggleVoice}
                    className="p-1 rounded-lg text-blue-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                    title={isVoiceMutedState ? 'Unmute Voice Navigation' : 'Mute Voice Navigation'}
                  >
                    {isVoiceMutedState ? (
                      <VolumeX className="w-4 h-4 text-zinc-400" />
                    ) : (
                      <Volume2 className="w-4 h-4 text-blue-500 animate-pulse" />
                    )}
                  </button>
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
                    title={isNavigating ? 'Cancel Active Route' : 'Close Preview'}
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
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                        isNavigating
                          ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                          : 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                      }`}
                    >
                      {isNavigating ? 'Navigating' : 'Route Ready'}
                    </span>
                    <span className="text-xs font-semibold text-zinc-500 truncate">
                      {activeDestinationName ? `To: ${activeDestinationName}` : 'Destination'}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-500 dark:text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-md">
                      {isVoiceMutedState ? <VolumeX className="w-3 h-3 text-zinc-400" /> : <Volume2 className="w-3 h-3 text-blue-500" />}
                      <span>Voice {isVoiceMutedState ? 'Off' : 'On'}</span>
                    </span>
                  </div>
                  <h3 className="text-sm font-bold mt-1 text-zinc-900 dark:text-zinc-50 leading-snug">
                    {activeRoute?.steps?.[0] || 'Proceed along the highlighted route'}
                  </h3>
                </div>
              </div>

              {/* Stats & Controls */}
              {isNavigating ? (
                /* Active Turn-by-Turn with Countdown */
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
              ) : (
                /* Route Overview with Start Navigation Button */
                <div className="mt-3 pt-3 border-t border-zinc-200/60 dark:border-zinc-800/60 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">
                      Distance & Est. Time
                    </div>
                    <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {activeRoute ? `${formatDistance(activeRoute.distanceMeters)} • ${activeRoute.durationFormatted}` : ''}
                    </div>
                  </div>

                  <button
                    id="hud-start-navigation-btn"
                    onClick={onStartNavigation}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-md transition cursor-pointer"
                  >
                    <Navigation className="w-3.5 h-3.5 fill-white" />
                    <span>Start Navigation</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Start Button Controls (Route Planned - Navigation Not Started) */}
      {routes.length > 0 && !isNavigating && (
        <div
          id="start-route-controls"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 pointer-events-auto select-none animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <button
            id="start-directions-btn"
            onClick={onStartNavigation}
            className="flex items-center gap-2.5 px-8 py-3 rounded-full bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-sm shadow-xl hover:shadow-2xl transition border border-blue-400/40 cursor-pointer"
          >
            <Navigation className="w-4 h-4 fill-white" />
            <span>Start Route</span>
          </button>
        </div>
      )}

      {/* Active Route Cancellation Controls (Available only AFTER route has started) */}
      {routes.length > 0 && isNavigating && (
        <div
          id="active-route-controls"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 pointer-events-auto select-none animate-in fade-in slide-in-from-bottom-3 duration-200"
        >
          <button
            id="cancel-active-route-btn"
            onClick={onClearRoute}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs shadow-xl transition cursor-pointer border border-rose-400/40"
          >
            <X className="w-4 h-4" />
            <span>Cancel Active Route</span>
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
                    Protected Point of Interest
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
                <input
                  type="text"
                  placeholder="e.g. Work, Cafe, Gym, Home, Landmark"
                  value={markerCategory}
                  onChange={(e) => setMarkerCategory(e.target.value)}
                  className={`w-full px-2.5 py-1.5 rounded-lg border text-xs focus:outline-none ${
                    isDark
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-zinc-600'
                      : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-zinc-500'
                  }`}
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['work', 'cafe', 'home', 'gym', 'store', 'landmark'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setMarkerCategory(cat)}
                      className={`text-[10px] px-1.5 py-0.5 rounded capitalize transition cursor-pointer border ${
                        markerCategory.toLowerCase() === cat
                          ? 'bg-blue-500/20 text-blue-500 border-blue-500/40 font-bold'
                          : isDark
                          ? 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60 hover:text-zinc-200'
                          : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:text-zinc-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium mb-1 text-zinc-500">Marker Color</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setMarkerColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-5 h-5 rounded-full border transition cursor-pointer ${
                        markerColor === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'opacity-85 hover:opacity-100'
                      }`}
                    />
                  ))}
                  <label className="relative cursor-pointer ml-1" title="Custom color picker">
                    <input
                      type="color"
                      value={markerColor}
                      onChange={(e) => setMarkerColor(e.target.value)}
                      className="w-5 h-5 rounded-full border cursor-pointer appearance-none bg-transparent overflow-hidden"
                    />
                  </label>
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

      {/* Edit Marker Modal (Name only, Save button with icon at bottom left below input field) */}
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
                <h3 className="text-sm font-bold">Edit Marker</h3>
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
                  placeholder="Enter marker name"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-500">Category</label>
                <input
                  type="text"
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs focus:outline-none ${
                    isDark
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-blue-500'
                      : 'bg-zinc-50 border-zinc-300 text-zinc-900 focus:border-blue-500'
                  }`}
                  placeholder="e.g. Work, Cafe, Gym, Home, Landmark"
                />
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {['work', 'cafe', 'home', 'gym', 'store', 'landmark'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setEditCategory(cat)}
                      className={`text-[10px] px-2 py-0.5 rounded capitalize transition cursor-pointer border ${
                        editCategory.toLowerCase() === cat
                          ? 'bg-blue-500/20 text-blue-500 border-blue-500/40 font-bold'
                          : isDark
                          ? 'bg-zinc-800/60 text-zinc-400 border-zinc-700/60 hover:text-zinc-200'
                          : 'bg-zinc-100 text-zinc-600 border-zinc-200 hover:text-zinc-900'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1 text-zinc-500">Marker Color</label>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      style={{ backgroundColor: c }}
                      className={`w-6 h-6 rounded-full border transition cursor-pointer ${
                        editColor === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'opacity-85 hover:opacity-100'
                      }`}
                    />
                  ))}
                  <label className="relative cursor-pointer ml-1" title="Custom color picker">
                    <input
                      type="color"
                      value={editColor}
                      onChange={(e) => setEditColor(e.target.value)}
                      className="w-6 h-6 rounded-full border cursor-pointer appearance-none bg-transparent overflow-hidden"
                    />
                  </label>
                </div>
              </div>

              {/* Save button with icon at bottom left below input field */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200/60 dark:border-zinc-800/60">
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold shadow-md flex items-center gap-1.5 cursor-pointer transition"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingMarker(null)}
                    className="px-3 py-1.5 rounded-xl border border-zinc-300 dark:border-zinc-700 text-xs font-semibold cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                  >
                    Cancel
                  </button>
                </div>

                {onDeleteCustomMarker && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!editingMarker) return;
                      setConfirmDeleteMarkerId(editingMarker.id);
                    }}
                    className="p-2 rounded-xl border border-red-200 dark:border-red-900/50 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition cursor-pointer"
                    title="Delete Marker"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Marker Confirmation Modal in MapTracker */}
      {confirmDeleteMarkerId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => setConfirmDeleteMarkerId(null)}
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
                  Are you sure you want to delete this marker? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setConfirmDeleteMarkerId(null)}
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
                onClick={() => {
                  if (onDeleteCustomMarker && confirmDeleteMarkerId !== null) {
                    onDeleteCustomMarker(confirmDeleteMarkerId);
                  }
                  setConfirmDeleteMarkerId(null);
                  setEditingMarker(null);
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
          <div className="flex items-center gap-1.5" title="Walking">
            <Footprints className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="hidden sm:inline">Walking</span>
          </div>

          <span className="w-px h-3 bg-zinc-300 dark:bg-zinc-700" />

          <div className="flex items-center gap-1.5" title="Vehicle (car/transit)">
            <Car className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            <span className="hidden sm:inline">Vehicle</span>
          </div>

          <span className="w-px h-3 bg-zinc-300 dark:bg-zinc-700" />

          <div className="flex items-center gap-1.5" title="Airplane Flight">
            <Plane className="w-3.5 h-3.5 text-purple-500 shrink-0" />
            <span className="hidden sm:inline">Airplane</span>
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
