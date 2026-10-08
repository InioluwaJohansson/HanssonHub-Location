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
import { fetchRouteOptions, generateAbeokutaRoadPath, fetchRealRoadPath } from './utils/routing';
import {
  INITIAL_DEMO_USERS,
  getInitialDemoUsers,
  INITIAL_COMPLETED_ROUTES,
  INITIAL_DEMO_MARKERS,
  INITIAL_RECORDED_PLACES,
  PALETTE_30_COLORS,
  ABEOKUTA_LOCATIONS,
} from './utils/users';
import { safeLoadStorage, safeSaveStorage, STORAGE_KEYS } from './utils/storage';
import { setNavigationActive } from './utils/voiceNavigation';
import {
  initSignalRConnection,
  sendStartRouteSignal,
  sendCancelRouteSignal,
} from './utils/signalrClient';
import { locationTrackerService } from './services/locationTrackerService';
import { MapTracker } from './components/MapTracker';
import { MovementLogs } from './components/MovementLogs';
import { HeaderBar } from './components/HeaderBar';
import { LoginOverlay } from './components/LoginOverlay';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import {
  getStoredAuthToken,
  getStoredAuthUser,
  getStoredAuthImageUrl,
  clearStoredAuth,
  AuthUserData,
} from './utils/auth';
import { AlertCircle, Map, Layers, ChevronLeft, ChevronRight, Bell } from 'lucide-react';

export interface ToastNotification {
  id: number;
  userName: string;
  userColor: string;
  title: string;
  message: string;
  timestamp: number;
  isCancelledType?: boolean;
  isExiting?: boolean;
}

export default function App() {
  const apiKey =
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY ||
    'AIzaSyBG5S4rauwAYF-7BhkQQ2-Hm03VMVMR4jE';

  // Theme
  const [theme, setTheme] = useState<AppTheme>('dark');

  // Authentication & Session State
  const [authToken, setAuthToken] = useState<string | null>(() => getStoredAuthToken());
  const [authUser, setAuthUser] = useState<AuthUserData | null>(() => getStoredAuthUser());
  const [userAvatarUrl, setUserAvatarUrl] = useState<string | null>(() => getStoredAuthImageUrl());
  const [isLoginOverlayOpen, setIsLoginOverlayOpen] = useState<boolean>(
    () => !getStoredAuthToken() || !getStoredAuthUser()
  );
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState<boolean>(false);

  // User Profile
  const userName = authUser?.userName || 'inioluwa_johansson';

  // Multi-User Management
  const [allUsers, setAllUsers] = useState<AppUser[]>(() => {
    const users = getInitialDemoUsers();
    const storedUser = getStoredAuthUser();
    const storedImage = getStoredAuthImageUrl();
    if (storedUser) {
      return users.map((u) =>
        u.id === 1 || u.isCurrentUser
          ? {
              ...u,
              id: storedUser.id,
              name: storedUser.userName,
              avatar: storedImage || u.avatar,
            }
          : u
      );
    }
    return users;
  });

  const handleLoginSuccess = (token: string, userData: AuthUserData, imageUrl: string) => {
    setAuthToken(token);
    setAuthUser(userData);
    setUserAvatarUrl(imageUrl);
    setIsLoginOverlayOpen(false);
    setIsTracking(true); // Start live tracking upon successful login

    // Update primary user details across active users list
    setAllUsers((prevUsers) =>
      prevUsers.map((u) =>
        u.id === 1 || u.isCurrentUser
          ? {
              ...u,
              id: userData.id,
              name: userData.userName,
              avatar: imageUrl,
            }
          : u
      )
    );
  };

  const handleLogoutConfirm = () => {
    clearStoredAuth();
    setAuthToken(null);
    setAuthUser(null);
    setUserAvatarUrl(null);
    setIsLogoutModalOpen(false);
    setIsLoginOverlayOpen(true);
    setIsTracking(false); // Immediately stop live location recording upon logout
  };
  const [selectedUserIdFilter, setSelectedUserIdFilter] = useState<number | 'all'>('all');
  const [contentTypeFilter, setContentTypeFilter] = useState<'all' | 'markers' | 'routes' | 'movements'>('all');
  const [timeRangeFilter, setTimeRangeFilter] = useState<'all' | '1w' | '2w' | '1m' | '3m' | '6m'>('1w');
  const [completedRoutes, setCompletedRoutes] = useState<CompletedRouteLog[]>(() =>
    safeLoadStorage(STORAGE_KEYS.COMPLETED_ROUTES, [])
  );

  // Toast Notifications state
  const [notifications, setNotifications] = useState<ToastNotification[]>([]);

  // Collapsible sidebar state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);

  // Tracking state - Auto starts GPS automatically
  const [isTracking, setIsTracking] = useState<boolean>(true);
  const [currentPoint, setCurrentPoint] = useState<LocationPoint | null>(null);
  const [pointsHistory, setPointsHistory] = useState<LocationPoint[]>(() =>
    safeLoadStorage(STORAGE_KEYS.POINTS_HISTORY, [])
  );
  const [segments, setSegments] = useState<JourneySegment[]>(() =>
    safeLoadStorage(STORAGE_KEYS.SEGMENTS, [])
  );
  const [recordedPlaces, setRecordedPlaces] = useState<RecordedPlace[]>(() =>
    safeLoadStorage(STORAGE_KEYS.RECORDED_PLACES, [])
  );
  const [selectedSegmentId, setSelectedSegmentId] = useState<number | null>(null);

  // Custom User Markers initialized from backend or storage (fallback to demo if empty)
  const [customMarkers, setCustomMarkers] = useState<CustomMarker[]>(() =>
    safeLoadStorage(STORAGE_KEYS.CUSTOM_MARKERS, [])
  );

  // Suggested Routes & Alternatives
  const [routes, setRoutes] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<number | null>(null);
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
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mobileActiveView, setMobileActiveView] = useState<'map' | 'logs'>('map');

  // Watcher ref for cleanup
  const watchIdRef = useRef<number | null>(null);
  const dwellTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastPointRef = useRef<LocationPoint | null>(null);
  const lastVisualPointRef = useRef<LocationPoint | null>(null);
  const activeJourneyIdRef = useRef<number>(
    safeLoadStorage<number>(STORAGE_KEYS.ACTIVE_JOURNEY_ID, 1) || 1
  );
  const coordinateSeqRef = useRef<number>(0);
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

  // Sync data to localStorage on changes to prevent data loss on crashes or reloads
  useEffect(() => {
    safeSaveStorage(STORAGE_KEYS.POINTS_HISTORY, pointsHistory);
  }, [pointsHistory]);

  useEffect(() => {
    safeSaveStorage(STORAGE_KEYS.SEGMENTS, segments);
  }, [segments]);

  useEffect(() => {
    safeSaveStorage(STORAGE_KEYS.RECORDED_PLACES, recordedPlaces);
  }, [recordedPlaces]);

  useEffect(() => {
    safeSaveStorage(STORAGE_KEYS.CUSTOM_MARKERS, customMarkers);
  }, [customMarkers]);

  useEffect(() => {
    safeSaveStorage(STORAGE_KEYS.COMPLETED_ROUTES, completedRoutes);
  }, [completedRoutes]);

  // Stats calculation
  const stats: TrackingStats = {
    totalDistanceMeters: segments.reduce((acc, s) => acc + (s.distanceMeters || 0), 0),
    totalDurationSeconds: segments.reduce((acc, s) => acc + (s.durationSeconds || 0), 0),
    walkingDistanceMeters: segments
      .filter((s) => s.mode === 'walking')
      .reduce((acc, s) => acc + (s.distanceMeters || 0), 0),
    vehicleDistanceMeters: segments
      .filter((s) => s.mode === 'vehicle')
      .reduce((acc, s) => acc + (s.distanceMeters || 0), 0),
    airplaneDistanceMeters: segments
      .filter((s) => s.mode === 'airplane')
      .reduce((acc, s) => acc + (s.distanceMeters || 0), 0),
    maxSpeedKmH: segments.reduce(
      (max, s) => Math.max(max, s.averageSpeedKmH || 0),
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
        id: Date.now() + Math.floor(Math.random() * 1000),
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
      // Do NOT record, process, or send location data unless user is logged in
      if (!authToken || !authUser) return;

      const now = timestamp || Date.now();
      const currentJourneyId = activeJourneyIdRef.current;

      const newPoint: LocationPoint = {
        id: now + (coordinateSeqRef.current % 1000),
        userId: 1,
        journeyId: currentJourneyId,
        routeId: selectedRouteId || undefined,
        sequenceIndex: coordinateSeqRef.current++,
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

      // Stream coordinate update to ASP.NET Core backend endpoint POST /LocationTracker/Coordinate/CreateCoordinate
      locationTrackerService.createCoordinate({
        userId: authUser.id,
        journeyId: currentJourneyId || 1,
        routeId: selectedRouteId || undefined,
        sequenceIndex: newPoint.sequenceIndex || 0,
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: coords.altitude || undefined,
        accuracyMeters: coords.accuracy || undefined,
        headingDegrees: coords.heading || undefined,
        speedKmH: newPoint.speed || 0,
      });
      const lastVisual = lastVisualPointRef.current;
      let isSignificantMovement = false;
      if (!lastVisual) {
        isSignificantMovement = true;
      } else {
        const moveDist = calculateDistanceMeters(
          lastVisual.lat,
          lastVisual.lng,
          newPoint.lat,
          newPoint.lng
        );
        if (moveDist >= 3.0) {
          isSignificantMovement = true;
        }
      }

      // Silently take the data point for history and telemetry without triggering unnecessary marker re-renders
      if (isSignificantMovement) {
        lastVisualPointRef.current = newPoint;
        setCurrentPoint(newPoint);

        // Sync user 1 (Inioluwa) in allUsers state only on significant movement
        setAllUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.id === 1 || u.isCurrentUser
              ? {
                  ...u,
                  currentPoint: newPoint,
                  speedKmH: newPoint.speed,
                }
              : u
          )
        );
      }

      const lastPoint = lastPointRef.current;

      if (!lastPoint) {
        // First point: initialize stationary candidate
        lastPointRef.current = newPoint;
        lastVisualPointRef.current = newPoint;
        setCurrentPoint(newPoint);
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
          id: now + segmentSeqRef.current,
          userId: 1,
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
      setPointsHistory((prevHistory) => [...prevHistory, newPoint].slice(-400));
    },
    [recordStationaryPlace, selectedRouteId]
  );

  // Periodic timer to increment dwell time if stationary
  useEffect(() => {
    const isLoggedIn = !!authToken && !!authUser;
    if (!isTracking || !isLoggedIn) return;

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

  // Geolocation watchPosition setup - starts GPS automatically ONLY when user is logged in!
  useEffect(() => {
    const isLoggedIn = !!authToken && !!authUser;
    if (!isTracking || !isLoggedIn) {
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
        id: 999999,
        lat: 7.1475,
        lng: 3.3619,
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
          id: 999999,
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
   * Synchronize Custom Markers and Route Logs from ASP.NET Core backend
   */
  useEffect(() => {
    if (!authToken || !authUser) return;

    // Fetch initial backend custom markers
    locationTrackerService.getAllCustomMarkers().then((backendMarkers) => {
      if (backendMarkers && Array.isArray(backendMarkers) && backendMarkers.length > 0) {
        const mapped: CustomMarker[] = backendMarkers.map((m) => ({
          id: m.id,
          userId: m.userId,
          userName: m.userId === authUser.id ? userName : `User #${m.userId}`,
          userColor: m.userColor || PALETTE_30_COLORS[m.userId % PALETTE_30_COLORS.length],
          lat: m.latitude,
          lng: m.longitude,
          name: m.name,
          description: `Category: ${m.category || 'generic'}`,
          category: (m.category as any) || 'generic',
          createdAt: new Date(m.createdAt).getTime() || Date.now(),
          isFromStayPoint: m.isFromStayPoint,
        }));
        setCustomMarkers(mapped);
      } else {
        // If backend returned empty or unavailable, check local storage or fallback option
        setCustomMarkers((prev) => {
          if (prev.length > 0) return prev;
          return INITIAL_DEMO_MARKERS;
        });
      }
    }).catch(() => {
      setCustomMarkers((prev) => {
        if (prev.length > 0) return prev;
        return INITIAL_DEMO_MARKERS;
      });
    });

    // Fetch initial backend route logs
    locationTrackerService.getAllRouteLogs().then((backendLogs) => {
      if (backendLogs && Array.isArray(backendLogs) && backendLogs.length > 0) {
        const mappedLogs: CompletedRouteLog[] = backendLogs.map((l) => ({
          id: l.id,
          userId: l.userId,
          userName: l.userId === authUser.id ? userName : `User #${l.userId}`,
          userColor: PALETTE_30_COLORS[l.userId % PALETTE_30_COLORS.length],
          userAvatar: l.userId === authUser.id && userAvatarUrl
            ? userAvatarUrl
            : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
          destinationName: l.destinationName || 'Destination',
          destinationCoords: { lat: 7.1475, lng: 3.3619 },
          startTime: new Date(l.completedAt).getTime() - (l.durationSeconds || 60) * 1000,
          endTime: new Date(l.completedAt).getTime(),
          durationSeconds: l.durationSeconds || 60,
          durationFormatted: formatDuration(l.durationSeconds || 60),
          distanceMeters: l.totalDistanceMeters || 1000,
          averageSpeedKmH: l.totalDistanceMeters > 0 && l.durationSeconds > 0
            ? Number((l.totalDistanceMeters / 1000 / (l.durationSeconds / 3600)).toFixed(1))
            : 20,
          travelMode: l.travelMode === 2 ? 'WALKING' : l.travelMode === 3 ? 'FLIGHT' : 'DRIVING',
          status: 'completed',
          completedAtTimeString: new Date(l.completedAt).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          }),
        }));
        setCompletedRoutes(mappedLogs);
      } else {
        setCompletedRoutes((prev) => {
          if (prev.length > 0) return prev;
          return INITIAL_COMPLETED_ROUTES;
        });
      }
    }).catch(() => {
      setCompletedRoutes((prev) => {
        if (prev.length > 0) return prev;
        return INITIAL_COMPLETED_ROUTES;
      });
    });

    // Synchronize recorded places fallback if empty
    setRecordedPlaces((prev) => {
      if (prev.length > 0) return prev;
      return INITIAL_RECORDED_PLACES;
    });
  }, [authToken, authUser, userName, userAvatarUrl]);

  /**
   * Add a custom marker and sync with ASP.NET Core backend
   */
  const handleAddCustomMarker = async (markerData: {
    lat: number;
    lng: number;
    name: string;
    description: string;
    category: 'generic' | 'work' | 'cafe' | 'home' | 'landmark' | 'store';
  }) => {
    const activeUserId = authUser?.id || 1;
    const activeUserColor = PALETTE_30_COLORS[0];

    // POST /LocationTracker/CustomMarker/CreateCustomMarker
    const res = await locationTrackerService.createCustomMarker({
      userId: activeUserId,
      userColor: activeUserColor,
      name: markerData.name,
      category: markerData.category,
      latitude: markerData.lat,
      longitude: markerData.lng,
      isFromStayPoint: false,
    });

    const newMarker: CustomMarker = {
      ...markerData,
      id: res?.id || Date.now() + Math.floor(Math.random() * 1000),
      createdAt: Date.now(),
      userId: activeUserId,
      userName: userName,
      userColor: activeUserColor,
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
  const handleEditStayPointAsMarker = async (place: RecordedPlace) => {
    const activeUserId = authUser?.id || 1;
    const activeUserColor = PALETTE_30_COLORS[0];

    const res = await locationTrackerService.createCustomMarker({
      userId: activeUserId,
      userColor: activeUserColor,
      name: place.name || 'Stationary Spot',
      category: 'landmark',
      latitude: place.lat,
      longitude: place.lng,
      isFromStayPoint: true,
    });

    const newMarker: CustomMarker = {
      id: res?.id || Date.now() + Math.floor(Math.random() * 1000),
      lat: place.lat,
      lng: place.lng,
      name: place.name || 'Stationary Spot',
      description: place.notes || `Stayed here for ${formatDuration(place.dwellDurationSeconds)}`,
      category: 'landmark',
      createdAt: Date.now(),
      userId: activeUserId,
      userName: userName,
      userColor: activeUserColor,
      isFromStayPoint: true,
    };
    setCustomMarkers((prev) => {
      if (prev.some((m) => m.id === newMarker.id)) return prev;
      return [newMarker, ...prev];
    });
  };

  /**
   * Delete a custom marker and delete on backend
   */
  const handleDeleteCustomMarker = async (id: number) => {
    await locationTrackerService.deleteCustomMarker(id);
    setCustomMarkers((prev) => prev.filter((m) => m.id !== id));
  };

  /**
   * Request route from user's current location to a destination
   */
  const handleRequestRoute = async (
    destination: { lat: number; lng: number },
    destName?: string
  ) => {
    // In mobile view, immediately switch to the Map tab to display the route
    setMobileActiveView('map');
    setActiveDestinationName(destName || 'Selected Destination');
    setActiveDestinationCoords(destination);
    setIsNavigating(false);
    setNavigationActive(false);
    const origin = currentPoint
      ? { lat: currentPoint.lat, lng: currentPoint.lng }
      : { lat: 7.1475, lng: 3.3619 };

    const currentSpeed = currentPoint ? currentPoint.speed : 0;
    const computedRoutes = await fetchRouteOptions(origin, destination, currentSpeed);

    setRoutes(computedRoutes);
    if (computedRoutes.length > 0) {
      setSelectedRouteId(computedRoutes[0].id);
    }
  };

  // Initialize SignalR connection on app load for real-time hub updates
  useEffect(() => {
    initSignalRConnection();
  }, []);

  /**
   * Initiate turn-by-turn navigation along the selected route
   */
  const handleStartNavigation = () => {
    setIsNavigating(true);
    setNavigationActive(true);
    setNavigationStartTime(Date.now());
    if (activeDestinationName && activeDestinationCoords) {
      sendStartRouteSignal(1, activeDestinationName, activeDestinationCoords);
    }
  };

  // Helper to dismiss notification with slide-out animation
  const dismissNotification = useCallback((id: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, isExiting: true } : n))
    );
    setTimeout(() => {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }, 380);
  }, []);

  // Helper to trigger toast notification
  const addNotification = useCallback((uName: string, uColor: string, title: string, message: string) => {
    const notifId = Date.now() + Math.floor(Math.random() * 1000);
    const isCancelled = title.toLowerCase().includes('cancel');
    const newNotif: ToastNotification = {
      id: notifId,
      userName: uName,
      userColor: uColor,
      title,
      message,
      timestamp: Date.now(),
      isCancelledType: isCancelled,
      isExiting: false,
    };
    setNotifications((prev) => [newNotif, ...prev.slice(0, 4)]);

    // Auto-dismiss notification after 6 seconds
    setTimeout(() => {
      dismissNotification(notifId);
    }, 6000);
  }, [dismissNotification]);

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
      id: Date.now() + Math.floor(Math.random() * 1000),
      userId: 1,
      userName: userName,
      userColor: PALETTE_30_COLORS[0],
      userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
      destinationName: destName,
      destinationCoords: activeDestinationCoords || { lat: currentPoint?.lat || 7.1475, lng: currentPoint?.lng || 3.3619 },
      startTime: navigationStartTime || Date.now() - durationSeconds * 1000,
      endTime: Date.now(),
      durationSeconds: durationSeconds,
      durationFormatted: formatDuration(durationSeconds),
      distanceMeters: distanceMeters,
      averageSpeedKmH: speedKmH,
      travelMode: activeRoute?.travelMode || 'DRIVING',
      status: 'completed',
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
    setNavigationActive(false);
    setNavigationStartTime(null);
    setRoutes([]);
    setSelectedRouteId(null);
    setActiveDestinationName(null);
    setActiveDestinationCoords(null);

    // Auto Arrival notification
    addNotification(userName, PALETTE_30_COLORS[0], 'Route Completed!', `You have automatically arrived at ${destName}!`);
  }, [routes, selectedRouteId, navigationStartTime, activeDestinationName, activeDestinationCoords, currentPoint, addNotification]);

  /**
   * Clear active route and cancel navigation (saves cancelled route ONLY if start navigation was clicked)
   */
  const handleClearRoute = () => {
    // Save as cancelled route log ONLY if start navigation was clicked and active!
    if (isNavigating) {
      const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
      const durationSeconds = navigationStartTime
        ? Math.max(1, Math.round((Date.now() - navigationStartTime) / 1000))
        : 60;
      const distanceMeters = activeRoute ? activeRoute.distanceMeters : 1000;
      const speedKmH = Number((distanceMeters / 1000 / (durationSeconds / 3600)).toFixed(1)) || 20;
      const destName = activeDestinationName || 'Selected Destination';

      // Send SignalR cancel route event
      sendCancelRouteSignal(1, destName, durationSeconds);

      const cancelledLog: CompletedRouteLog = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        userId: 1,
        userName: userName,
        userColor: PALETTE_30_COLORS[0],
        userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
        destinationName: destName,
        destinationCoords: activeDestinationCoords || { lat: currentPoint?.lat || 7.1475, lng: currentPoint?.lng || 3.3619 },
        startTime: navigationStartTime || Date.now() - durationSeconds * 1000,
        endTime: Date.now(),
        durationSeconds: durationSeconds,
        durationFormatted: formatDuration(durationSeconds),
        distanceMeters: distanceMeters,
        averageSpeedKmH: speedKmH,
        travelMode: activeRoute?.travelMode || 'DRIVING',
        status: 'cancelled',
        completedAtTimeString: new Date().toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setCompletedRoutes((prev) => [cancelledLog, ...prev]);
      addNotification(userName, PALETTE_30_COLORS[0], 'Route Cancelled', `Route to ${destName} has been cancelled and saved.`);
    }

    setIsNavigating(false);
    setNavigationActive(false);
    setNavigationStartTime(null);
    setRoutes([]);
    setSelectedRouteId(null);
    setActiveDestinationName(null);
    setActiveDestinationCoords(null);
  };

  // Auto-upgrade initial demo user routes to real Google Maps road network paths as soon as API is available
  useEffect(() => {
    let isMounted = true;
    const timeout = setTimeout(() => {
      allUsers.forEach((usr) => {
        if (!usr.isCurrentUser && usr.id !== 1 && usr.activeDestinationCoords && usr.currentPoint) {
          fetchRealRoadPath(usr.currentPoint, usr.activeDestinationCoords)
            .then((realPath) => {
              if (isMounted && realPath && realPath.length > 3) {
                setAllUsers((currentList) =>
                  currentList.map((u) => (u.id === usr.id ? { ...u, activeRoutePath: realPath } : u))
                );
              }
            })
            .catch((err) => {
              console.warn('Initial road path fetch warning:', err);
            });
        }
      });
    }, 1200);

    return () => {
      isMounted = false;
      clearTimeout(timeout);
    };
  }, []);

  // Real-time animation tick for demo users following street road paths
  useEffect(() => {
    const locValues = Object.values(ABEOKUTA_LOCATIONS);
    const interval = setInterval(() => {
      setAllUsers((prevUsers) =>
        prevUsers.map((usr) => {
          if (usr.isCurrentUser || usr.id === 1) return usr; // Primary user moves via real GPS
          if (!usr.currentPoint || typeof usr.currentPoint.lat !== 'number' || isNaN(usr.currentPoint.lat)) {
            return usr;
          }

          const destCoords = usr.activeDestinationCoords;
          if (usr.isNavigating && destCoords && typeof destCoords.lat === 'number') {
            let routePath = usr.activeRoutePath;
            if (!routePath || routePath.length === 0) {
              routePath = generateAbeokutaRoadPath(usr.currentPoint, destCoords);
            }

            // Find target waypoint along the road path
            const targetIdx = routePath.findIndex(
              (p) => p && typeof p.lat === 'number' && Math.hypot(p.lat - usr.currentPoint.lat, p.lng - usr.currentPoint.lng) > 0.00012
            );

            if (targetIdx === -1) {
              // Reached final destination along the road! Pick next Abeokuta landmark & generate new road path
              const targetMarkerName = usr.activeDestinationName || 'destination';
              const nextLoc = locValues[Math.floor(Math.random() * locValues.length)];
              const newRoadPath = generateAbeokutaRoadPath(destCoords, { lat: nextLoc.lat, lng: nextLoc.lng });

              addNotification(
                usr.name,
                usr.color,
                'Marker Arrival',
                `${usr.name} reached ${targetMarkerName} & en route to ${nextLoc.name}!`
              );

              // Asynchronously upgrade to exact Google Maps street polyline
              fetchRealRoadPath(destCoords, { lat: nextLoc.lat, lng: nextLoc.lng })
                .then((realPath) => {
                  if (realPath && realPath.length > 3) {
                    setAllUsers((prev) =>
                      prev.map((u) => (u.id === usr.id ? { ...u, activeRoutePath: realPath } : u))
                    );
                  }
                })
                .catch((err) => console.warn('Road path upgrade warning:', err));

              return {
                ...usr,
                isNavigating: true,
                isStationary: false,
                mode: 'vehicle',
                speedKmH: 22.0 + Math.random() * 15,
                originName: targetMarkerName,
                originCoords: destCoords,
                activeDestinationName: nextLoc.name,
                activeDestinationCoords: { lat: nextLoc.lat, lng: nextLoc.lng },
                activeRoutePath: newRoadPath,
              };
            }

            // Step along the road segment towards the target waypoint
            const targetPoint = routePath[targetIdx];
            if (!targetPoint || typeof targetPoint.lat !== 'number' || typeof targetPoint.lng !== 'number') {
              return usr;
            }

            const dLat = targetPoint.lat - usr.currentPoint.lat;
            const dLng = targetPoint.lng - usr.currentPoint.lng;
            const dist = Math.hypot(dLat, dLng);
            const stepSize = 0.00022; // Smooth travel speed along road line
            const ratio = dist > 0 ? Math.min(1, stepSize / dist) : 1;

            const nextLat = usr.currentPoint.lat + dLat * ratio;
            const nextLng = usr.currentPoint.lng + dLng * ratio;

            return {
              ...usr,
              isNavigating: true,
              mode: 'vehicle',
              speedKmH: usr.speedKmH || 25.0,
              activeRoutePath: routePath,
              currentPoint: {
                ...usr.currentPoint,
                lat: nextLat,
                lng: nextLng,
                speed: usr.speedKmH || 25.0,
                timestamp: Date.now(),
              },
            };
          } else {
            // Assign next target in Abeokuta to keep in continuous vehicle motion along roads
            const nextLoc = locValues[Math.floor(Math.random() * locValues.length)];
            const newRoadPath = generateAbeokutaRoadPath(usr.currentPoint, { lat: nextLoc.lat, lng: nextLoc.lng });
            return {
              ...usr,
              isNavigating: true,
              isStationary: false,
              mode: 'vehicle',
              speedKmH: 24.0,
              activeDestinationName: nextLoc.name,
              activeDestinationCoords: { lat: nextLoc.lat, lng: nextLoc.lng },
              activeRoutePath: newRoadPath,
            };
          }
        })
      );
    }, 1100);

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
      {/* Top Header Controls */}
      <HeaderBar
        theme={theme}
        userName={userName}
        userAvatarUrl={userAvatarUrl || undefined}
        isLoggedIn={!!authToken && !!authUser}
        onResetTrail={handleResetTrail}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onOpenLoginOverlay={() => setIsLoginOverlayOpen(true)}
        onLogoutClick={() => setIsLogoutModalOpen(true)}
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

      {/* Top Floating Notifications (Completion / Arrival) */}
      {notifications.filter((n) => !n.isCancelledType).length > 0 && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 max-w-md w-full px-4 pointer-events-none">
          {notifications
            .filter((n) => !n.isCancelledType)
            .map((notif) => (
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
                  onClick={() => dismissNotification(notif.id)}
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-1 cursor-pointer"
                >
                  &times;
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Bottom Right Floating Route Cancelled Notification Toasts (With Slide-In & Slide-Out) */}
      {notifications.filter((n) => n.isCancelledType).length > 0 && (
        <div
          id="route-cancelled-toast-container"
          className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2.5 max-w-sm w-[calc(100%-3rem)] pointer-events-none select-none"
        >
          {notifications
            .filter((n) => n.isCancelledType)
            .map((notif) => (
              <div
                key={notif.id}
                className={`p-4 rounded-2xl shadow-2xl border backdrop-blur-md flex items-start gap-3.5 pointer-events-auto w-full transition-all ${
                  notif.isExiting ? 'toast-slide-out' : 'toast-slide-in'
                } ${
                  isDark
                    ? 'bg-zinc-900/95 border-rose-500/50 text-zinc-100 shadow-rose-950/50'
                    : 'bg-white/95 border-rose-500/40 text-zinc-900 shadow-rose-500/20'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-rose-500 font-bold shrink-0 shadow-sm">
                  <AlertCircle className="w-5 h-5 text-rose-500 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold uppercase tracking-wider text-rose-500">
                      {notif.title}
                    </span>
                    <span className="text-[10px] font-semibold text-zinc-400">Just now</span>
                  </div>
                  <p className="text-xs font-semibold mt-1 text-zinc-800 dark:text-zinc-200 leading-snug">
                    {notif.message}
                  </p>
                </div>
                <button
                  onClick={() => dismissNotification(notif.id)}
                  className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer shrink-0"
                  title="Dismiss"
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
            isSidebarCollapsed={isSidebarCollapsed}
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
              onSelectPlace={(_place) => {
                setSelectedSegmentId(null);
              }}
              onSelectCustomMarker={(_marker) => {
                setSelectedSegmentId(null);
              }}
              onEditCustomMarker={handleEditCustomMarker}
              onDeleteCustomMarker={handleDeleteCustomMarker}
              onRequestRoute={handleRequestRoute}
              onSelectRoute={(id) => setSelectedRouteId(id)}
            />
          </section>
        )}
      </main>

      {/* Grainy Transparent Theme-Aware Login Overlay */}
      <LoginOverlay
        isOpen={isLoginOverlayOpen}
        theme={theme}
        currentUser={authUser}
        onLoginSuccess={handleLoginSuccess}
        onClose={
          authToken && authUser ? () => setIsLoginOverlayOpen(false) : undefined
        }
      />

      {/* Logout Confirmation Dialog */}
      <LogoutConfirmModal
        isOpen={isLogoutModalOpen}
        theme={theme}
        userName={userName}
        onConfirmLogout={handleLogoutConfirm}
        onCancel={() => setIsLogoutModalOpen(false)}
      />
    </div>
  );
}
