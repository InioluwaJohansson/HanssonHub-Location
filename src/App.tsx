/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  LocationPoint,
  JourneySegment,
  RecordedPlace,
  StationaryState,
  TrackingStats,
  CustomMarker,
  RouteOption,
  AppTheme,
  AppUser,
  CompletedRouteLog,
} from './types';
import {
  calculateDistanceMeters,
  classifyTravelMode,
  STATIONARY_RADIUS_METERS,
  STAY_RECORD_THRESHOLD_SECONDS,
  reverseGeocode,
  formatDuration,
} from './utils/geo';
import { fetchRouteOptions } from './utils/routing';
import { INITIAL_DEMO_USERS, INITIAL_COMPLETED_ROUTES, INITIAL_DEMO_MARKERS, PALETTE_30_COLORS } from './utils/users';
import { MapTracker } from './components/MapTracker';
import { MovementLogs } from './components/MovementLogs';
import { HeaderBar } from './components/HeaderBar';
import { DataCollectedModal } from './components/DataCollectedModal';
import { AlertCircle, Map, Layers, ChevronLeft, ChevronRight, Bell } from 'lucide-react';

export interface ToastNotification {
  id: string;
  userName: string;
  userColor: string;
  title: string;
  message: string;
  timestamp: number;
}

export default function App() {
  const apiKey =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    'AIzaSyBG5S4rauwAYF-7BhkQQ2-Hm03VMVMR4jE';

  // Theme
  const [theme, setTheme] = useState<AppTheme>('dark');

  // User Profile
  const userName = 'Inioluwa';

  // Multi-User Management
  const [allUsers, setAllUsers] = useState<AppUser[]>(INITIAL_DEMO_USERS);
  const [selectedUserIdFilter, setSelectedUserIdFilter] = useState<string>('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<'all' | 'markers' | 'routes' | 'movements'>('all');
  const [timeRangeFilter, setTimeRangeFilter] = useState<'all' | '1w' | '2w' | '1m' | '3m' | '6m'>('all');
  const [completedRoutes, setCompletedRoutes] = useState<CompletedRouteLog[]>(INITIAL_COMPLETED_ROUTES);

  // Toast Notifications state
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  // Collapsible sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Tracking state - Auto starts GPS automatically
  const [isTracking, setIsTracking] = useState<boolean>(true);
  const [currentPoint, setCurrentPoint] = useState<LocationPoint | null>(null);
  const [pointsHistory, setPointsHistory] = useState<LocationPoint[]>([]);
  const [segments, setSegments] = useState<JourneySegment[]>([]);
  const [recordedPlaces, setRecordedPlaces] = useState<RecordedPlace[]>([]);
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null);

  // Custom User Markers initialized to Abeokuta landmarks
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>(INITIAL_DEMO_MARKERS);

  // Suggested Routes & Alternatives
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [activeDestinationName, setActiveDestinationName] = useState<string | null>(null);
  const [activeDestinationCoords, setActiveDestinationCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isNavigating, setIsNavigating] = useState<boolean>(false);
  const [navigationStartTime, setNavigationStartTime] = useState<number | null>(null);

  // Stationary state tracking
  const [stationaryState, setStationaryState] = useState<StationaryState>({
    isStationary: false,
    anchorPoint: null,
    startTime: null,
    dwellDurationSeconds: 0,
    qualifiesForRecordedPlace: false,
    recordedPlaceId: null,
  });

  // Modal and layout states
  const [isDataModalOpen, setIsDataModalOpen] = useState<boolean>(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mobileActiveView, setMobileActiveView] = useState<'map' | 'logs'>('map');

  // Watcher ref for cleanup
  const watchIdRef = useRef<number | null>(null);
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPointRef = useRef<LocationPoint | null>(null);
  const stationaryRef = useRef<StationaryState>({
    isStationary: false,
    anchorPoint: null,
    startTime: null,
    dwellDurationSeconds: 0,
    qualifiesForRecordedPlace: false,
    recordedPlaceId: null,
  });
  const isRecordingPlaceRef = useRef<boolean>(false);
  const segmentSeqRef = useRef<number>(0);

  // Stats calculation
  const stats: TrackingStats = {
    totalDistanceMeters: segments.reduce((acc, s) => acc + s.distanceMeters, 0),
    totalDurationSeconds: segments.reduce((acc, s) => acc + s.durationSeconds, 0),
    trekkingDistanceMeters: segments
      .filter((s) => s.mode === 'trekking')
      .reduce((acc, s) => acc + s.distanceMeters, 0),
    vehicleDistanceMeters: segments
      .filter((s) => s.mode === 'vehicle')
      .reduce((acc, s) => acc + s.distanceMeters, 0),
    maxSpeedKmH: segments.reduce(
      (max, s) => Math.max(max, s.averageSpeedKmH),
      0
    ),
    currentSpeedKmH: currentPoint ? currentPoint.speed : 0,
    placesVisitedCount: recordedPlaces.filter((p) => p.dwellDurationSeconds >= 90).length,
  };

  /**
   * Records a stationary place when dwell >= 90 seconds (1.5 minutes)
   */
  const recordStationaryPlace = useCallback(
    async (point: LocationPoint, durationSec: number) => {
      const geoInfo = await reverseGeocode(point.lat, point.lng);
      const newPlace: RecordedPlace = {
        id: `place-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        lat: point.lat,
        lng: point.lng,
        accuracy: point.accuracy,
        name: geoInfo.name,
        address: geoInfo.address,
        arrivedAt: point.timestamp - durationSec * 1000,
        dwellDurationSeconds: Math.round(durationSec),
        isCurrentStationary: true,
        notes: `Stayed constant for ${Math.round(durationSec)}s.`,
      };

      setRecordedPlaces((prev) => {
        if (prev.some((p) => p.id === newPlace.id)) return prev;
        return [newPlace, ...prev];
      });
      return newPlace.id;
    },
    []
  );

  /**
   * Process a new coordinate update from Geolocation
   */
  const handleNewLocation = useCallback(
    (coords: GeolocationCoordinates, timestamp: number) => {
      const now = timestamp || Date.now();
      const newPoint: LocationPoint = {
        id: `pt-${now}-${Math.random().toString(36).slice(2, 6)}`,
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy || 10,
        altitude: coords.altitude,
        altitudeAccuracy: coords.altitudeAccuracy,
        heading: coords.heading,
        speed: coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : 0,
        speedMps: coords.speed != null && coords.speed >= 0 ? coords.speed : 0,
        timestamp: now,
        timeString: new Date(now).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };

      setCurrentPoint(newPoint);

      const lastPoint = lastPointRef.current;

      if (!lastPoint) {
        // First point: initialize stationary candidate
        lastPointRef.current = newPoint;
        const initialStationary: StationaryState = {
          isStationary: true,
          anchorPoint: newPoint,
          startTime: now,
          dwellDurationSeconds: 0,
          qualifiesForRecordedPlace: false,
          recordedPlaceId: null,
        };
        stationaryRef.current = initialStationary;
        setStationaryState(initialStationary);
        setPointsHistory([newPoint]);
        return;
      }

      const dist = calculateDistanceMeters(
        lastPoint.lat,
        lastPoint.lng,
        newPoint.lat,
        newPoint.lng
      );
      const timeDiffSec = Math.max(1, (now - lastPoint.timestamp) / 1000);

      // Calculate speed if GPS reported 0 or null
      let calculatedSpeedKmH = newPoint.speed;
      if (calculatedSpeedKmH <= 0 && dist > 1) {
        calculatedSpeedKmH = (dist / timeDiffSec) * 3.6;
        newPoint.speed = calculatedSpeedKmH;
        newPoint.speedMps = dist / timeDiffSec;
      }

      // Only register a segment if points moved more than 2 meters
      if (dist >= 2.0) {
        segmentSeqRef.current += 1;
        const mode = classifyTravelMode(calculatedSpeedKmH);
        const newSegment: JourneySegment = {
          id: `seg-${now}-${segmentSeqRef.current}`,
          startPoint: lastPoint,
          endPoint: newPoint,
          path: [
            { lat: lastPoint.lat, lng: lastPoint.lng },
            { lat: newPoint.lat, lng: newPoint.lng },
          ],
          distanceMeters: dist,
          durationSeconds: timeDiffSec,
          averageSpeedKmH: calculatedSpeedKmH,
          mode: mode,
          startTime: lastPoint.timestamp,
          endTime: now,
        };

        setSegments((prevSegs) => {
          if (prevSegs.some((s) => s.id === newSegment.id)) return prevSegs;
          return [newSegment, ...prevSegs];
        });
      }

      // Dwell / Stationary Evaluation (1.5-minute constant location)
      const prevStationary = stationaryRef.current;
      if (!prevStationary.anchorPoint || !prevStationary.startTime) {
        const nextStationary: StationaryState = {
          isStationary: true,
          anchorPoint: newPoint,
          startTime: now,
          dwellDurationSeconds: 0,
          qualifiesForRecordedPlace: false,
          recordedPlaceId: null,
        };
        stationaryRef.current = nextStationary;
        setStationaryState(nextStationary);
      } else {
        const distFromAnchor = calculateDistanceMeters(
          prevStationary.anchorPoint.lat,
          prevStationary.anchorPoint.lng,
          newPoint.lat,
          newPoint.lng
        );

        if (distFromAnchor <= STATIONARY_RADIUS_METERS) {
          // Still in the constant location
          const dwellSec = (now - prevStationary.startTime) / 1000;
          const qualifies = dwellSec >= STAY_RECORD_THRESHOLD_SECONDS;

          // Trigger place recording if just reached 90 seconds (1.5 minutes)
          if (qualifies && !prevStationary.recordedPlaceId && !isRecordingPlaceRef.current) {
            isRecordingPlaceRef.current = true;
            recordStationaryPlace(prevStationary.anchorPoint, dwellSec)
              .then((placeId) => {
                isRecordingPlaceRef.current = false;
                if (stationaryRef.current.anchorPoint === prevStationary.anchorPoint) {
                  stationaryRef.current.recordedPlaceId = placeId;
                  setStationaryState((curr) => ({
                    ...curr,
                    recordedPlaceId: placeId,
                  }));
                }
              })
              .catch(() => {
                isRecordingPlaceRef.current = false;
              });
          }

          const nextStationary: StationaryState = {
            ...prevStationary,
            isStationary: true,
            dwellDurationSeconds: dwellSec,
            qualifiesForRecordedPlace: qualifies,
          };
          stationaryRef.current = nextStationary;
          setStationaryState(nextStationary);
        } else {
          // Moved away beyond radius - mark departure of previous place if recorded
          if (prevStationary.recordedPlaceId) {
            const departedPlaceId = prevStationary.recordedPlaceId;
            setRecordedPlaces((currPlaces) =>
              currPlaces.map((p) =>
                p.id === departedPlaceId
                  ? {
                      ...p,
                      departedAt: now,
                      isCurrentStationary: false,
                      dwellDurationSeconds:
                        (now - (prevStationary.startTime || now)) / 1000,
                    }
                  : p
              )
            );
          }

          // Start new stationary candidate at new location
          const nextStationary: StationaryState = {
            isStationary: true,
            anchorPoint: newPoint,
            startTime: now,
            dwellDurationSeconds: 0,
            qualifiesForRecordedPlace: false,
            recordedPlaceId: null,
          };
          stationaryRef.current = nextStationary;
          setStationaryState(nextStationary);
        }
      }

      lastPointRef.current = newPoint;
      setPointsHistory((prevHistory) => [...prevHistory, newPoint]);
    },
    [recordStationaryPlace]
  );

  // Periodic timer to increment dwell time if stationary
  useEffect(() => {
    if (!isTracking) return;

    dwellTimerRef.current = setInterval(() => {
      const prev = stationaryRef.current;
      if (!prev.anchorPoint || !prev.startTime) return;
      const now = Date.now();
      const dwellSec = (now - prev.startTime) / 1000;
      const qualifies = dwellSec >= STAY_RECORD_THRESHOLD_SECONDS;

      if (qualifies && !prev.recordedPlaceId && !isRecordingPlaceRef.current) {
        isRecordingPlaceRef.current = true;
        recordStationaryPlace(prev.anchorPoint, dwellSec)
          .then((placeId) => {
            isRecordingPlaceRef.current = false;
            if (stationaryRef.current.anchorPoint === prev.anchorPoint) {
              stationaryRef.current.recordedPlaceId = placeId;
              setStationaryState((curr) => ({
                ...curr,
                recordedPlaceId: placeId,
              }));
            }
          })
          .catch(() => {
            isRecordingPlaceRef.current = false;
          });
      }

      const next: StationaryState = {
        ...prev,
        dwellDurationSeconds: dwellSec,
        qualifiesForRecordedPlace: qualifies,
      };
      stationaryRef.current = next;
      setStationaryState(next);
    }, 1000);

    return () => {
      if (dwellTimerRef.current) clearInterval(dwellTimerRef.current);
    };
  }, [isTracking, recordStationaryPlace]);

  // Geolocation watchPosition setup - starts GPS automatically!
  useEffect(() => {
    if (!isTracking) {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      // Fallback default coordinates
      const fallbackPoint: LocationPoint = {
        id: 'fallback-init',
        lat: 37.7749,
        lng: -122.4194,
        accuracy: 15,
        speed: 0,
        speedMps: 0,
        timestamp: Date.now(),
        timeString: new Date().toLocaleTimeString(),
      };
      setCurrentPoint(fallbackPoint);
      lastPointRef.current = fallbackPoint;
      return;
    }

    // Auto-start GPS: acquire immediate current location
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoError(null);
        handleNewLocation(pos.coords, pos.timestamp);
      },
      (err) => {
        console.warn('Geolocation query note:', err.message);
        setGeoError('Waiting for GPS permission or fix. You can still navigate the map and add markers.');
        const fallbackPoint: LocationPoint = {
          id: 'fallback-init',
          lat: 37.7749,
          lng: -122.4194,
          accuracy: 15,
          speed: 0,
          speedMps: 0,
          timestamp: Date.now(),
          timeString: new Date().toLocaleTimeString(),
        };
        setCurrentPoint((curr) => curr || fallbackPoint);
        if (!lastPointRef.current) {
          lastPointRef.current = fallbackPoint;
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    // Continuous watchPosition
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setGeoError(null);
        handleNewLocation(pos.coords, pos.timestamp);
      },
      (err) => {
        console.warn('Geolocation watch notice:', err.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000,
      }
    );

    watchIdRef.current = id;

    return () => {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, [isTracking, handleNewLocation]);

  /**
   * Add a custom marker
   */
  const handleAddCustomMarker = (markerData: {
    lat: number;
    lng: number;
    name: string;
    description: string;
    category: 'generic' | 'work' | 'cafe' | 'home' | 'landmark' | 'store';
  }) => {
    const newMarker: CustomMarker = {
      ...markerData,
      id: `marker-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: Date.now(),
      userId: 'user-1',
      userName: userName,
      userColor: PALETTE_30_COLORS[0],
    };
    setCustomMarkers((prev) => [newMarker, ...prev]);
  };

  /**
   * Edit an existing custom marker
   */
  const handleEditCustomMarker = (updatedMarker: CustomMarker) => {
    setCustomMarkers((prev) =>
      prev.map((m) => (m.id === updatedMarker.id ? updatedMarker : m))
    );
  };

  /**
   * Convert a 90s stay point (recorded place) into a custom marker
   */
  const handleEditStayPointAsMarker = (place: RecordedPlace) => {
    const newMarker: CustomMarker = {
      id: `marker-stay-${place.id}`,
      lat: place.lat,
      lng: place.lng,
      name: place.name || 'Stationary Spot',
      description: place.notes || `Stayed here for ${formatDuration(place.dwellDurationSeconds)}`,
      category: 'landmark',
      createdAt: Date.now(),
      userId: 'user-1',
      userName: userName,
      userColor: PALETTE_30_COLORS[0],
      isFromStayPoint: true,
    };
    setCustomMarkers((prev) => {
      if (prev.some((m) => m.id === newMarker.id)) return prev;
      return [newMarker, ...prev];
    });
  };

  /**
   * Delete a custom marker
   */
  const handleDeleteCustomMarker = (id: string) => {
    setCustomMarkers((prev) => prev.filter((m) => m.id !== id));
  };

  /**
   * Request route from user's current location to a destination
   */
  const handleRequestRoute = async (
    destination: { lat: number; lng: number },
    destName?: string
  ) => {
    setActiveDestinationName(destName || 'Selected Destination');
    setActiveDestinationCoords(destination);
    setIsNavigating(false);
    const origin = currentPoint
      ? { lat: currentPoint.lat, lng: currentPoint.lng }
      : { lat: 37.7749, lng: -122.4194 };

    const currentSpeed = currentPoint ? currentPoint.speed : 0;
    const computedRoutes = await fetchRouteOptions(origin, destination, currentSpeed);

    setRoutes(computedRoutes);
    if (computedRoutes.length > 0) {
      setSelectedRouteId(computedRoutes[0].id);
    }
  };

  /**
   * Initiate turn-by-turn navigation along the selected route
   */
  const handleStartNavigation = () => {
    setIsNavigating(true);
    setNavigationStartTime(Date.now());
  };

  // Helper to trigger toast notification
  const addNotification = useCallback((uName: string, uColor: string, title: string, message: string) => {
    const newNotif: ToastNotification = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userName: uName,
      userColor: uColor,
      title,
      message,
      timestamp: Date.now(),
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 4)]);
  }, []);

  /**
   * Complete route and record history log
   */
  const handleCompleteRoute = useCallback(() => {
    const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
    const durationSeconds = navigationStartTime
      ? Math.max(1, Math.round((Date.now() - navigationStartTime) / 1000))
      : 180;
    const distanceMeters = activeRoute ? activeRoute.distanceMeters : 1200;
    const speedKmH = Number((distanceMeters / 1000 / (durationSeconds / 3600)).toFixed(1)) || 25;
    const destName = activeDestinationName || 'Selected Destination';

    const newCompletedLog: CompletedRouteLog = {
      id: `croute-${Date.now()}`,
      userId: 'user-1',
      userName: userName,
      userColor: PALETTE_30_COLORS[0],
      userAvatar: '',
      destinationName: destName,
      destinationCoords: activeDestinationCoords || { lat: currentPoint?.lat || 7.1475, lng: currentPoint?.lng || 3.3619 },
      startTime: navigationStartTime || Date.now() - durationSeconds * 1000,
      endTime: Date.now(),
      durationSeconds: durationSeconds,
      durationFormatted: formatDuration(durationSeconds),
      distanceMeters: distanceMeters,
      averageSpeedKmH: speedKmH,
      travelMode: activeRoute?.travelMode || 'DRIVING',
      completedAtTimeString: new Date().toLocaleString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    };

    setCompletedRoutes((prev) => [newCompletedLog, ...prev]);
    setIsNavigating(false);
    setNavigationStartTime(null);
    setRoutes([]);
    setSelectedRouteId(null);
    setActiveDestinationName(null);
    setActiveDestinationCoords(null);

    // Auto Arrival notification
    addNotification(userName, PALETTE_30_COLORS[0], 'Route Completed!', `You have automatically arrived at ${destName}!`);
  }, [routes, selectedRouteId, navigationStartTime, activeDestinationName, activeDestinationCoords, currentPoint, addNotification]);

  /**
   * Clear active route and cancel navigation
   */
  const handleClearRoute = () => {
    setIsNavigating(false);
    setNavigationStartTime(null);
    setRoutes([]);
    setSelectedRouteId(null);
    setActiveDestinationName(null);
    setActiveDestinationCoords(null);
  };

  // Real-time animation tick for demo users
  useEffect(() => {
    const interval = setInterval(() => {
      setAllUsers((prevUsers) =>
        prevUsers.map((usr) => {
          if (usr.id === 'user-1') return usr; // Primary user moves via real GPS
          if (usr.isNavigating && usr.destinationCoords) {
            // Step user slightly towards destination
            const dLat = usr.destinationCoords.lat - usr.currentPoint.lat;
            const dLng = usr.destinationCoords.lng - usr.currentPoint.lng;
            const distRemaining = Math.sqrt(dLat * dLat + dLng * dLng);

            if (distRemaining < 0.0003) {
              // Reached destination! Trigger arrival notification!
              const targetMarkerName = usr.activeDestinationName || 'destination';
              addNotification(usr.name, usr.color, 'Marker Arrival', `${usr.name} reached ${targetMarkerName}!`);

              return {
                ...usr,
                isNavigating: false,
                isStationary: true,
                dwellDurationSeconds: 95,
                destinationName: undefined,
                destinationCoords: undefined,
              };
            }

            const stepRatio = 0.05;
            const nextLat = usr.currentPoint.lat + dLat * stepRatio;
            const nextLng = usr.currentPoint.lng + dLng * stepRatio;

            return {
              ...usr,
              currentPoint: {
                ...usr.currentPoint,
                lat: nextLat,
                lng: nextLng,
                speed: 18.5,
                timestamp: Date.now(),
              },
            };
          } else {
            // Small subtle jitter for live position indicator
            const jitterLat = (Math.random() - 0.5) * 0.00008;
            const jitterLng = (Math.random() - 0.5) * 0.00008;
            return {
              ...usr,
              currentPoint: {
                ...usr.currentPoint,
                lat: usr.currentPoint.lat + jitterLat,
                lng: usr.currentPoint.lng + jitterLng,
                timestamp: Date.now(),
              },
            };
          }
        })
      );
    }, 2500);

    return () => clearInterval(interval);
  }, [addNotification]);

  /**
   * Fast-forward dwell timer to >= 90s to easily test constant location place recording
   */
  const handleFastForwardDwell = async () => {
    if (!currentPoint) return;
    const dwellDuration = 95; // 1m 35s
    const placeId = await recordStationaryPlace(currentPoint, dwellDuration);
    const updatedStationary: StationaryState = {
      isStationary: true,
      anchorPoint: currentPoint,
      startTime: Date.now() - dwellDuration * 1000,
      dwellDurationSeconds: dwellDuration,
      qualifiesForRecordedPlace: true,
      recordedPlaceId: placeId,
    };
    stationaryRef.current = updatedStationary;
    setStationaryState(updatedStationary);
  };

  /**
   * Reset trail and logs
   */
  const handleResetTrail = () => {
    setSegments([]);
    setRecordedPlaces([]);
    setSelectedSegmentId(null);
    setRoutes([]);
    setSelectedRouteId(null);
    setIsNavigating(false);
    segmentSeqRef.current = 0;
    if (currentPoint) {
      lastPointRef.current = currentPoint;
      setPointsHistory([currentPoint]);
      const initialStationary: StationaryState = {
        isStationary: true,
        anchorPoint: currentPoint,
        startTime: Date.now(),
        dwellDurationSeconds: 0,
        qualifiesForRecordedPlace: false,
        recordedPlaceId: null,
      };
      stationaryRef.current = initialStationary;
      setStationaryState(initialStationary);
    } else {
      lastPointRef.current = null;
      setPointsHistory([]);
      const emptyStationary: StationaryState = {
        isStationary: false,
        anchorPoint: null,
        startTime: null,
        dwellDurationSeconds: 0,
        qualifiesForRecordedPlace: false,
        recordedPlaceId: null,
      };
      stationaryRef.current = emptyStationary;
      setStationaryState(emptyStationary);
    }
  };

  const isDark = theme === 'dark';

  return (
    <div
      className={`flex flex-col h-screen w-screen overflow-hidden font-sans select-none transition-colors duration-200 ${
        isDark ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
      }`}
    >
      {/* Top Header Controls (Adhering strictly to soft light/dark theme, no blue) */}
      <HeaderBar
        isTracking={isTracking}
        theme={theme}
        userName={userName}
        onToggleTracking={() => setIsTracking((prev) => !prev)}
        onResetTrail={handleResetTrail}
        onFastForwardDwell={handleFastForwardDwell}
        onOpenDataCollected={() => setIsDataModalOpen(true)}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
      />

      {/* Geolocation notice banner if waiting for fix */}
      {geoError && (
        <div
          className={`px-4 py-1.5 text-xs flex items-center justify-between border-b ${
            isDark
              ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
              : 'bg-zinc-100 border-zinc-200 text-zinc-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>{geoError}</span>
          </div>
          <button
            onClick={() => setGeoError(null)}
            className="text-zinc-400 hover:text-zinc-600 px-1"
          >
            &times;
          </button>
        </div>
      )}

      {/* Mobile View Toggle Bar (Without 70% or 30% text) */}
      <div
        className={`md:hidden flex border-b ${
          isDark ? 'border-zinc-800 bg-zinc-900' : 'border-zinc-200 bg-white'
        }`}
      >
        <button
          onClick={() => setMobileActiveView('map')}
          className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 flex items-center justify-center gap-1.5 transition ${
            mobileActiveView === 'map'
              ? isDark
                ? 'border-zinc-100 text-zinc-100'
                : 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-400'
          }`}
        >
          <Map className="w-3.5 h-3.5" />
          Interactive Map
        </button>
        <button
          onClick={() => setMobileActiveView('logs')}
          className={`flex-1 py-2 text-xs font-semibold text-center border-b-2 flex items-center justify-center gap-1.5 transition ${
            mobileActiveView === 'logs'
              ? isDark
                ? 'border-zinc-100 text-zinc-100'
                : 'border-zinc-900 text-zinc-900'
              : 'border-transparent text-zinc-400'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Movement Logs
        </button>
      </div>

      {/* Floating Arrival Notification Toasts */}
      {notifications.length > 0 && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none">
          {notifications.map((notif) => (
            <div
              key={notif.id}
              className={`p-3 rounded-2xl shadow-xl border backdrop-blur-md flex items-start gap-3 pointer-events-auto transition-all animate-in fade-in slide-in-from-top-2 ${
                isDark
                  ? 'bg-zinc-900/95 border-emerald-500/40 text-zinc-100 shadow-emerald-950/40'
                  : 'bg-white/95 border-emerald-500/30 text-zinc-900 shadow-emerald-500/10'
              }`}
            >
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-sm"
                style={{ backgroundColor: notif.userColor }}
              >
                <Bell className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-500">{notif.title}</span>
                  <span className="text-[10px] text-zinc-400">Just now</span>
                </div>
                <p className="text-xs font-semibold mt-0.5 text-zinc-800 dark:text-zinc-200 leading-snug">
                  {notif.message}
                </p>
              </div>
              <button
                onClick={() => setNotifications((prev) => prev.filter((n) => n.id !== notif.id))}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Main Core Layout: Map & Movement Logs Sidebar */}
      <main className="flex-1 flex flex-col md:flex-row w-full h-full overflow-hidden relative">
        {/* LEFT: Map Container taking 70% (or 100% when collapsed) */}
        <section
          id="map-container"
          className={`h-full relative transition-all duration-300 ease-in-out ${
            isSidebarCollapsed ? 'w-full md:w-full' : 'md:w-[70%] w-full'
          } ${mobileActiveView === 'map' ? 'flex' : 'hidden md:flex'}`}
        >
          <MapTracker
            apiKey={apiKey}
            currentPoint={currentPoint}
            segments={segments}
            recordedPlaces={recordedPlaces}
            customMarkers={customMarkers}
            routes={routes}
            selectedRouteId={selectedRouteId}
            selectedSegmentId={selectedSegmentId}
            stationaryState={stationaryState}
            isTracking={isTracking}
            theme={theme}
            userName={userName}
            activeDestinationName={activeDestinationName}
            isNavigating={isNavigating}
            allUsers={allUsers}
            selectedUserIdFilter={selectedUserIdFilter}
            contentTypeFilter={contentTypeFilter}
            timeRangeFilter={timeRangeFilter}
            onSelectUserFilter={(userId) => setSelectedUserIdFilter(userId)}
            onSelectContentTypeFilter={(type) => setContentTypeFilter(type)}
            onSelectTimeRangeFilter={(range) => setTimeRangeFilter(range)}
            onStartNavigation={handleStartNavigation}
            onSelectPlace={(place) => {
              setSelectedSegmentId(null);
            }}
            onSelectCustomMarker={(marker) => {
              setSelectedSegmentId(null);
            }}
            onAddCustomMarker={handleAddCustomMarker}
            onEditCustomMarker={handleEditCustomMarker}
            onDeleteCustomMarker={handleDeleteCustomMarker}
            onRequestRoute={handleRequestRoute}
            onSelectRoute={(id) => setSelectedRouteId(id)}
            onClearRoute={handleClearRoute}
            onCompleteRoute={handleCompleteRoute}
          />

          {/* Collapsible Sidebar Button hugged on the right border */}
          <button
            id="toggle-sidebar-collapse-btn"
            onClick={() => setIsSidebarCollapsed((prev) => !prev)}
            className={`hidden md:flex absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 z-30 w-7 h-12 rounded-full items-center justify-center border shadow-xl transition-all cursor-pointer ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                : 'bg-white border-zinc-300 text-zinc-800 hover:bg-zinc-100'
            }`}
            title={isSidebarCollapsed ? 'Expand Movement Logs' : 'Collapse Movement Logs'}
          >
            {isSidebarCollapsed ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </section>

        {/* RIGHT: Movement Logs taking at most 30% width (hidden when collapsed) */}
        {!isSidebarCollapsed && (
          <section
            id="logs-container"
            className={`h-full md:w-[30%] w-full flex-col transition-all duration-300 ease-in-out ${
              mobileActiveView === 'logs' ? 'flex' : 'hidden md:flex'
            }`}
          >
            <MovementLogs
              segments={segments}
              recordedPlaces={recordedPlaces}
              customMarkers={customMarkers}
              routes={routes}
              completedRoutes={completedRoutes}
              selectedRouteId={selectedRouteId}
              selectedSegmentId={selectedSegmentId}
              currentPoint={currentPoint}
              stats={stats}
              theme={theme}
              isNavigating={isNavigating}
              allUsers={allUsers}
              selectedUserIdFilter={selectedUserIdFilter}
              onSelectUserFilter={(userId) => setSelectedUserIdFilter(userId)}
              onStartNavigation={handleStartNavigation}
              onClearRoute={handleClearRoute}
              onSelectSegment={(id) => setSelectedSegmentId(id)}
              onSelectPlace={(place) => {
                setCurrentPoint({
                  id: `focus-${place.id}`,
                  lat: place.lat,
                  lng: place.lng,
                  accuracy: place.accuracy,
                  speed: 0,
                  speedMps: 0,
                  timestamp: place.arrivedAt,
                  timeString: new Date(place.arrivedAt).toLocaleTimeString(),
                });
              }}
              onSelectCustomMarker={(marker) => {
                setCurrentPoint({
                  id: `focus-${marker.id}`,
                  lat: marker.lat,
                  lng: marker.lng,
                  accuracy: 10,
                  speed: 0,
                  speedMps: 0,
                  timestamp: marker.createdAt,
                  timeString: new Date(marker.createdAt).toLocaleTimeString(),
                });
              }}
              onEditCustomMarker={handleEditCustomMarker}
              onDeleteCustomMarker={handleDeleteCustomMarker}
              onEditStayPointAsMarker={handleEditStayPointAsMarker}
              onRequestRoute={handleRequestRoute}
              onSelectRoute={(id) => setSelectedRouteId(id)}
              onOpenDataSchema={() => setIsDataModalOpen(true)}
            />
          </section>
        )}
      </main>

      {/* Data Collected Specification Modal */}
      <DataCollectedModal
        isOpen={isDataModalOpen}
        theme={theme}
        onClose={() => setIsDataModalOpen(false)}
      />
    </div>
  );
}
