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
  ContentTypeFilter,
  TimeRangeFilter,
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
import {
  PALETTE_30_COLORS,
  ABEOKUTA_LOCATIONS,
} from './utils/users';
import { safeLoadStorage, safeSaveStorage, STORAGE_KEYS } from './utils/storage';
import { setNavigationActive } from './utils/voiceNavigation';
import {
  initSignalRConnection,
  sendStartRouteSignal,
  sendCancelRouteSignal,
  onMarkerAdded,
  onMarkerUpdated,
  onMarkerDeleted,
  onJourneySessionStarted,
  onJourneySessionUpdated,
  onJourneySessionCancelled,
  onRouteLogAdded,
  onRouteLogUpdated,
} from './utils/signalrClient';
import { locationTrackerService, CreateCoordinatePayload } from './services/locationTrackerService';
import { MapTracker } from './components/MapTracker';
import { MovementLogs } from './components/MovementLogs';
import { HeaderBar } from './components/HeaderBar';
import { LoginOverlay } from './components/LoginOverlay';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { NotificationStack } from './components/NotificationStack';
import {
  getStoredAuthToken,
  getStoredAuthUser,
  getStoredAuthImageUrl,
  clearStoredAuth,
  AuthUserData,
  formatUserFullName,
  formatProfileImageUrl,
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
  const userFullName = formatUserFullName(authUser, userName);

  // Multi-User Management - prioritize real backend user data
  const [allUsers, setAllUsers] = useState<AppUser[]>(() => {
    const storedUser = getStoredAuthUser();
    const storedImage = getStoredAuthImageUrl();
    if (storedUser) {
      const fullName = formatUserFullName(storedUser, storedUser.userName);
      return [
        {
          id: storedUser.id,
          name: fullName,
          avatar: storedImage ? formatProfileImageUrl(storedImage) : '',
          color: PALETTE_30_COLORS[0],
          isCurrentUser: true,
          currentPoint: {
            id: 1000 + storedUser.id,
            userId: storedUser.id,
            journeyId: 5000 + storedUser.id,
            routeId: 6000 + storedUser.id,
            lat: 7.1475,
            lng: 3.3619,
            accuracy: 8,
            speed: 0,
            speedMps: 0,
            timestamp: Date.now(),
            timeString: new Date().toLocaleTimeString(),
          },
          isTracking: true,
          isStationary: true,
          stationaryStartTime: null,
          dwellDurationSeconds: 0,
          originName: 'Starting Point',
          originCoords: { lat: 7.1475, lng: 3.3619 },
          activeDestinationName: null,
          activeDestinationCoords: null,
          activeRoutePath: undefined,
          isNavigating: false,
          navigationStartTime: null,
          speedKmH: 0,
          mode: 'vehicle',
        },
      ];
    }
    return [];
  });

  const handleLoginSuccess = (token: string, userData: AuthUserData, imageUrl: string) => {
    setAuthToken(token);
    setAuthUser(userData);
    setUserAvatarUrl(imageUrl);
    setIsLoginOverlayOpen(false);
    setIsTracking(true); // Start live tracking upon successful login

    // Load real users directly from ASP.NET Core backend
    locationTrackerService.getAllUsers().then((backendUsers) => {
      if (backendUsers && Array.isArray(backendUsers) && backendUsers.length > 0) {
        const activeUsersList = backendUsers.filter((u) => !u.isHidden);
        if (activeUsersList.length > 0) {
          const mappedUsers: AppUser[] = activeUsersList.map((u, idx) => {
            const isCurrent = u.id === userData.id;
            const resolvedAvatar = isCurrent && imageUrl ? imageUrl : formatProfileImageUrl(u.imageUrl);
            const userLat = 7.1475 + (idx % 3 === 0 ? 0.005 : -0.005) * (Math.floor(idx / 3) + 1);
            const userLng = 3.3619 + (idx % 2 === 0 ? 0.006 : -0.006) * (Math.floor(idx / 2) + 1);

            return {
              id: u.id,
              name: u.name,
              avatar: resolvedAvatar,
              color: PALETTE_30_COLORS[idx % PALETTE_30_COLORS.length],
              isCurrentUser: isCurrent,
              currentPoint: isCurrent && currentPoint ? currentPoint : {
                id: 1000 + u.id,
                userId: u.id,
                journeyId: 5000 + u.id,
                routeId: 6000 + u.id,
                lat: userLat,
                lng: userLng,
                accuracy: 8,
                speed: 0,
                speedMps: 0,
                timestamp: Date.now(),
                timeString: new Date().toLocaleTimeString(),
              },
              isTracking: true,
              isStationary: true,
              stationaryStartTime: null,
              dwellDurationSeconds: 0,
              originName: 'Starting Point',
              originCoords: { lat: userLat, lng: userLng },
              activeDestinationName: null,
              activeDestinationCoords: null,
              activeRoutePath: undefined,
              isNavigating: false,
              navigationStartTime: null,
              speedKmH: 0,
              mode: 'vehicle',
            };
          });
          setAllUsers(mappedUsers);
          return;
        }
      }
      // Fallback update current user
      const fullName = formatUserFullName(userData, userData.userName);
      setAllUsers((prevUsers) =>
        prevUsers.map((u) =>
          u.id === userData.id || u.isCurrentUser
            ? {
                ...u,
                id: userData.id,
                name: fullName,
                avatar: imageUrl,
              }
            : u
        )
      );
    }).catch(() => {
      const fullName = formatUserFullName(userData, userData.userName);
      setAllUsers((prevUsers) =>
        prevUsers.map((u) =>
          u.id === userData.id || u.isCurrentUser
            ? {
                ...u,
                id: userData.id,
                name: fullName,
                avatar: imageUrl,
              }
            : u
        )
      );
    });
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
  const [contentTypeFilter, setContentTypeFilter] = useState<ContentTypeFilter>('all');
  const [timeRangeFilter, setTimeRangeFilter] = useState<TimeRangeFilter>('1w');
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
  const [activeJourneySessionId, setActiveJourneySessionId] = useState<number | null>(null);

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
  const coordinateBufferRef = useRef<CreateCoordinatePayload[]>([]);

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
      const currentJourneyId = activeJourneySessionId || activeJourneyIdRef.current || 0;

      const newPoint: LocationPoint = {
        id: now + (coordinateSeqRef.current % 1000),
        userId: authUser.id,
        journeyId: currentJourneyId,
        routeId: 0,
        sequenceIndex: coordinateSeqRef.current++,
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: Math.round(coords.accuracy || 10),
        altitude: Math.round(coords.altitude || 0),
        altitudeAccuracy: Math.round(coords.altitudeAccuracy || 0),
        heading: Math.round(coords.heading || 0),
        speed: coords.speed != null && coords.speed >= 0 ? coords.speed * 3.6 : 0,
        speedMps: coords.speed != null && coords.speed >= 0 ? coords.speed : 0,
        timestamp: now,
        timeString: new Date(now).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        }),
      };

      const coordinatePayload: CreateCoordinatePayload = {
        userId: authUser.id,
        journeyId: currentJourneyId,
        routeId: 0,
        sequenceIndex: newPoint.sequenceIndex || 0,
        latitude: coords.latitude,
        longitude: coords.longitude,
        altitude: Math.round(coords.altitude || 0),
        accuracyMeters: Math.round(coords.accuracy || 0),
        headingDegrees: Math.round(coords.heading || 0),
        speedKmH: Math.round(newPoint.speed || 0),
      };

      // POST /LocationTracker/Coordinate/CreateCoordinate
      locationTrackerService.createCoordinate(coordinatePayload);

      // Buffer coordinates and send batch updates via POST /LocationTracker/Coordinate/CreateBatchCoordinates
      coordinateBufferRef.current.push(coordinatePayload);
      if (coordinateBufferRef.current.length >= 10) {
        const batch = [...coordinateBufferRef.current];
        coordinateBufferRef.current = [];
        locationTrackerService.createBatchCoordinates(batch);
      }
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
        const mapped: CustomMarker[] = backendMarkers.map((m) => {
          const matchedUser = allUsers.find((u) => u.id === m.userId);
          return {
            id: m.id,
            userId: m.userId,
            userName: m.userId === authUser.id ? userFullName : (matchedUser ? matchedUser.name : `User #${m.userId}`),
            userColor: m.userColor || PALETTE_30_COLORS[m.userId % PALETTE_30_COLORS.length],
            lat: m.latitude,
            lng: m.longitude,
            name: m.name,
            description: `Category: ${m.category || 'generic'}`,
            category: (m.category as any) || 'generic',
            createdAt: new Date(m.createdAt).getTime() || Date.now(),
            isFromStayPoint: m.isFromStayPoint,
          };
        });
        setCustomMarkers(mapped);
      }
    }).catch((err) => {
      console.warn('API Warning [getAllCustomMarkers]:', err);
    });

    // Fetch initial backend journey sessions
    locationTrackerService.getAllJourneySessions().then((backendSessions) => {
      if (backendSessions && Array.isArray(backendSessions) && backendSessions.length > 0) {
        const currentUserId = authUser ? authUser.id : 1;
        const mappedSessions: CompletedRouteLog[] = backendSessions.map((s) => {
          const isCompleted = s.status === 2;
          const startTimeMs = new Date(s.startTime).getTime() || Date.now();
          const endTimeMs = s.endTime ? new Date(s.endTime).getTime() : startTimeMs + (s.totalDurationSeconds || 60) * 1000;
          const isMe = s.userId === currentUserId;
          const matchedUser = allUsers.find((u) => u.id === s.userId);
          return {
            id: s.id,
            userId: s.userId,
            userName: isMe ? userFullName : (matchedUser ? matchedUser.name : `User #${s.userId}`),
            userColor: PALETTE_30_COLORS[s.userId % PALETTE_30_COLORS.length],
            userAvatar: isMe ? (userAvatarUrl || '') : (matchedUser?.avatar || ''),
            destinationName: `Journey Session #${s.id}`,
            destinationCoords: s.coordinates && s.coordinates.length > 0
              ? { lat: s.coordinates[s.coordinates.length - 1].latitude, lng: s.coordinates[s.coordinates.length - 1].longitude }
              : { lat: 7.1475, lng: 3.3619 },
            startTime: startTimeMs,
            endTime: endTimeMs,
            durationSeconds: s.totalDurationSeconds || Math.max(1, Math.round((endTimeMs - startTimeMs) / 1000)),
            durationFormatted: formatDuration(s.totalDurationSeconds || 60),
            distanceMeters: s.totalDistanceMeters || 0,
            averageSpeedKmH: s.averageSpeedKmH || 0,
            travelMode: 'DRIVING',
            status: isCompleted ? 'completed' : 'cancelled',
            completedAtTimeString: new Date(endTimeMs).toLocaleString('en-US', {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            }),
          };
        });
        setCompletedRoutes(mappedSessions);
      }
    }).catch((err) => {
      console.warn('API Warning [getAllJourneySessions]:', err);
    });

    // Fetch initial backend route logs
    locationTrackerService.getAllRouteLogs().then((backendLogs) => {
      if (backendLogs && Array.isArray(backendLogs) && backendLogs.length > 0) {
        const currentUserId = authUser ? authUser.id : 1;
        const mappedLogs: CompletedRouteLog[] = backendLogs.map((l) => {
          const matchedUser = allUsers.find((u) => u.id === l.userId);
          return {
            id: l.id,
            userId: l.userId,
            userName: l.userId === currentUserId ? userFullName : (matchedUser ? matchedUser.name : `User #${l.userId}`),
            userColor: PALETTE_30_COLORS[l.userId % PALETTE_30_COLORS.length],
            userAvatar: l.userId === currentUserId && userAvatarUrl ? userAvatarUrl : (matchedUser?.avatar || ''),
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
        };
      });
        setCompletedRoutes((prev) => {
          const ids = new Set(prev.map((p) => p.id));
          const newEntries = mappedLogs.filter((m) => !ids.has(m.id));
          return [...prev, ...newEntries];
        });
      }
    }).catch((err) => {
      console.warn('API Warning [getAllRouteLogs]:', err);
    });

    // Fetch all users from ASP.NET Core backend
    locationTrackerService.getAllUsers().then((backendUsers) => {
      if (backendUsers && Array.isArray(backendUsers) && backendUsers.length > 0) {
        const activeUsersList = backendUsers.filter((u) => !u.isHidden);
        if (activeUsersList.length > 0) {
          const currentId = authUser ? authUser.id : 1;
          const mappedUsers: AppUser[] = activeUsersList.map((u, idx) => {
            const isCurrent = u.id === currentId;
            const resolvedAvatar = isCurrent && userAvatarUrl ? userAvatarUrl : formatProfileImageUrl(u.imageUrl);
            const userLat = 7.1475 + (idx % 3 === 0 ? 0.005 : -0.005) * (Math.floor(idx / 3) + 1);
            const userLng = 3.3619 + (idx % 2 === 0 ? 0.006 : -0.006) * (Math.floor(idx / 2) + 1);

            return {
              id: u.id,
              name: u.name,
              avatar: resolvedAvatar,
              color: PALETTE_30_COLORS[idx % PALETTE_30_COLORS.length],
              isCurrentUser: isCurrent,
              currentPoint: isCurrent && currentPoint ? currentPoint : {
                id: 1000 + u.id,
                userId: u.id,
                journeyId: 5000 + u.id,
                routeId: 6000 + u.id,
                lat: userLat,
                lng: userLng,
                accuracy: 8,
                speed: 0,
                speedMps: 0,
                timestamp: Date.now(),
                timeString: new Date().toLocaleTimeString(),
              },
              isTracking: true,
              isStationary: true,
              stationaryStartTime: null,
              dwellDurationSeconds: 0,
              originName: 'Starting Point',
              originCoords: { lat: userLat, lng: userLng },
              activeDestinationName: null,
              activeDestinationCoords: null,
              activeRoutePath: undefined,
              isNavigating: false,
              navigationStartTime: null,
              speedKmH: 0,
              mode: 'vehicle',
            };
          });
          setAllUsers(mappedUsers);
        }
      }
    }).catch((err) => {
      console.warn('API Warning [getAllUsers in sync effect]:', err);
    });
  }, [authToken, authUser, userName, userAvatarUrl]);

  // Initial mount: load real users from backend API
  useEffect(() => {
    locationTrackerService.getAllUsers().then((backendUsers) => {
      if (backendUsers && Array.isArray(backendUsers) && backendUsers.length > 0) {
        const activeUsersList = backendUsers.filter((u) => !u.isHidden);
        if (activeUsersList.length > 0) {
          const storedUser = getStoredAuthUser();
          const storedImage = getStoredAuthImageUrl();
          const currentId = storedUser?.id || 1;
          const mappedUsers: AppUser[] = activeUsersList.map((u, idx) => {
            const isCurrent = u.id === currentId;
            const resolvedAvatar = isCurrent && storedImage ? formatProfileImageUrl(storedImage) : formatProfileImageUrl(u.imageUrl);
            const userLat = 7.1475 + (idx % 3 === 0 ? 0.005 : -0.005) * (Math.floor(idx / 3) + 1);
            const userLng = 3.3619 + (idx % 2 === 0 ? 0.006 : -0.006) * (Math.floor(idx / 2) + 1);

            return {
              id: u.id,
              name: u.name,
              avatar: resolvedAvatar,
              color: PALETTE_30_COLORS[idx % PALETTE_30_COLORS.length],
              isCurrentUser: isCurrent,
              currentPoint: {
                id: 1000 + u.id,
                userId: u.id,
                journeyId: 5000 + u.id,
                routeId: 6000 + u.id,
                lat: userLat,
                lng: userLng,
                accuracy: 8,
                speed: 0,
                speedMps: 0,
                timestamp: Date.now(),
                timeString: new Date().toLocaleTimeString(),
              },
              isTracking: true,
              isStationary: true,
              stationaryStartTime: null,
              dwellDurationSeconds: 0,
              originName: 'Starting Point',
              originCoords: { lat: userLat, lng: userLng },
              activeDestinationName: null,
              activeDestinationCoords: null,
              activeRoutePath: undefined,
              isNavigating: false,
              navigationStartTime: null,
              speedKmH: 0,
              mode: 'vehicle',
            };
          });
          setAllUsers(mappedUsers);
        }
      }
    }).catch(() => {});
  }, []);

  /**
   * Add a custom marker and sync with ASP.NET Core backend
   */
  const handleAddCustomMarker = async (markerData: {
    lat: number;
    lng: number;
    name: string;
    description: string;
    category?: string;
    color?: string;
  }) => {
    const activeUserId = authUser?.id || 1;
    const activeUserColor = markerData.color || PALETTE_30_COLORS[0];
    const markerCategory = markerData.category || 'generic';

    // POST /LocationTracker/CustomMarker/CreateCustomMarker
    const res = await locationTrackerService.createCustomMarker({
      userId: activeUserId,
      userColor: activeUserColor,
      name: markerData.name,
      category: markerCategory,
      latitude: markerData.lat,
      longitude: markerData.lng,
      isFromStayPoint: false,
    });

    const newMarker: CustomMarker = {
      lat: markerData.lat,
      lng: markerData.lng,
      name: markerData.name,
      description: markerData.description,
      category: markerCategory,
      id: res?.id || Date.now() + Math.floor(Math.random() * 1000),
      createdAt: Date.now(),
      userId: activeUserId,
      userName: userFullName,
      userColor: activeUserColor,
    };
    setCustomMarkers((prev) => [newMarker, ...prev]);
  };

  /**
   * Edit an existing custom marker
   * POST /LocationTracker/CustomMarker/UpdateCustomMarker
   */
  const handleEditCustomMarker = async (updatedMarker: CustomMarker) => {
    setCustomMarkers((prev) =>
      prev.map((m) => (m.id === updatedMarker.id ? updatedMarker : m))
    );

    try {
      await locationTrackerService.updateCustomMarker({
        id: updatedMarker.id,
        userId: updatedMarker.userId || (authUser?.id || 1),
        userColor: updatedMarker.userColor || PALETTE_30_COLORS[0],
        name: updatedMarker.name,
        category: updatedMarker.category,
        latitude: updatedMarker.lat,
        longitude: updatedMarker.lng,
        isFromStayPoint: Boolean(updatedMarker.isFromStayPoint),
      });
      addNotification(
        updatedMarker.userName || userFullName,
        updatedMarker.userColor || PALETTE_30_COLORS[0],
        'Marker Updated',
        `"${updatedMarker.name}" details updated successfully`
      );
    } catch (err) {
      console.warn('API Warning [updateCustomMarker]:', err);
    }
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
      userName: userFullName,
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

  /**
   * Start live navigation and create a continuous journey session on backend
   * POST /LocationTracker/JourneySession/CreateJourneySession
   */
  const handleStartNavigation = async () => {
    setIsNavigating(true);
    setNavigationActive(true);
    const startMs = Date.now();
    setNavigationStartTime(startMs);

    const activeRoute = routes.find((r) => r.id === selectedRouteId) || routes[0];
    const distanceMeters = activeRoute ? activeRoute.distanceMeters : 1200;
    const durationSeconds = activeRoute ? activeRoute.durationSeconds : 180;
    const speedKmH = distanceMeters && durationSeconds
      ? Number((distanceMeters / 1000 / (durationSeconds / 3600)).toFixed(1))
      : 25;
    const destName = activeDestinationName || 'Destination';
    const destCoords = activeDestinationCoords || (currentPoint ? { lat: currentPoint.lat, lng: currentPoint.lng } : { lat: 7.1475, lng: 3.3619 });
    const currentUserId = authUser?.id || 1;

    // Send SignalR Start Route signal
    sendStartRouteSignal(currentUserId, destName, destCoords);

    // Initial coordinate if available
    const initialCoords = currentPoint
      ? [
          {
            userId: currentUserId,
            journeyId: 0,
            routeId: 0, // Explicitly set to integer 0 as required by backend
            sequenceIndex: 0,
            latitude: currentPoint.lat,
            longitude: currentPoint.lng,
            altitude: Math.round(currentPoint.altitude || 0),
            accuracyMeters: Math.round(currentPoint.accuracy || 0),
            headingDegrees: Math.round(currentPoint.heading || 0),
            speedKmH: Math.round(currentPoint.speed || 0),
          },
        ]
      : [];

    try {
      const newSession = await locationTrackerService.createJourneySession({
        userId: currentUserId,
        startTime: new Date(startMs).toISOString(),
        endTime: new Date(startMs).toISOString(),
        totalDistanceMeters: distanceMeters,
        totalDurationSeconds: durationSeconds,
        averageSpeedKmH: speedKmH,
        status: 1, // 1 = Active
        coordinates: initialCoords,
      });

      if (newSession && newSession.id) {
        setActiveJourneySessionId(newSession.id);
        activeJourneyIdRef.current = newSession.id;
        safeSaveStorage(STORAGE_KEYS.ACTIVE_JOURNEY_ID, newSession.id);
      }
    } catch (err) {
      console.warn('API Warning [createJourneySession]:', err);
    }

    addNotification(userFullName, PALETTE_30_COLORS[0], 'Navigation Started', `Navigating to ${destName}...`);
  };

  // Helper to dismiss notification
  const dismissNotification = useCallback((id: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  // Helper to clear all notifications
  const handleClearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Helper to trigger toast notification (10s auto-dismiss and stack hover managed by NotificationStack)
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
    // Put newest at front, keep up to 8 notifications in buffer
    setNotifications((prev) => [newNotif, ...prev.slice(0, 7)]);
  }, []);

  // Initialize SignalR connection and listen for real-time notifications via _realTimeNotificationService.NotifyAll
  useEffect(() => {
    initSignalRConnection();

    // 1. Marker Added: await _realTimeNotificationService.NotifyAll("Marker Added", newCustomMarker)
    const unsubMarkerAdded = onMarkerAdded((newCustomMarker) => {
      if (!newCustomMarker) return;
      const markerId = Number(newCustomMarker.id ?? newCustomMarker.Id ?? Date.now());
      const markerUserId = Number(newCustomMarker.userId ?? newCustomMarker.UserId ?? 1);
      const matchedUser = allUsers.find((u) => u.id === markerUserId);
      const markerColor = newCustomMarker.userColor ?? newCustomMarker.UserColor ?? (matchedUser ? matchedUser.color : PALETTE_30_COLORS[markerUserId % PALETTE_30_COLORS.length]);
      const markerUserName = newCustomMarker.userName ?? newCustomMarker.UserName ?? (matchedUser ? matchedUser.name : `User #${markerUserId}`);

      const marker: CustomMarker = {
        id: markerId,
        userId: markerUserId,
        userName: markerUserName,
        userColor: markerColor,
        lat: Number(newCustomMarker.latitude ?? newCustomMarker.Latitude ?? newCustomMarker.lat ?? newCustomMarker.Lat ?? 0),
        lng: Number(newCustomMarker.longitude ?? newCustomMarker.Longitude ?? newCustomMarker.lng ?? newCustomMarker.Lng ?? 0),
        name: String(newCustomMarker.name ?? newCustomMarker.Name ?? 'New Saved Marker'),
        description: String(newCustomMarker.description ?? newCustomMarker.Description ?? `Category: ${newCustomMarker.category ?? newCustomMarker.Category ?? 'generic'}`),
        category: (newCustomMarker.category ?? newCustomMarker.Category ?? 'generic') as any,
        createdAt: newCustomMarker.createdAt || newCustomMarker.CreatedAt ? new Date(newCustomMarker.createdAt || newCustomMarker.CreatedAt).getTime() : Date.now(),
        isFromStayPoint: Boolean(newCustomMarker.isFromStayPoint ?? newCustomMarker.IsFromStayPoint ?? false),
      };

      setCustomMarkers((prev) => {
        if (prev.some((m) => m.id === marker.id)) {
          return prev.map((m) => (m.id === marker.id ? marker : m));
        }
        return [marker, ...prev];
      });

      addNotification(marker.userName, marker.userColor || '#3B82F6', 'Marker Added', `"${marker.name}" added to map in real-time`);
    });

    // 2. Marker Updated: await _realTimeNotificationService.NotifyAll("Marker Updated", existingCustomMarker)
    const unsubMarkerUpdated = onMarkerUpdated((existingCustomMarker) => {
      if (!existingCustomMarker) return;
      const markerId = Number(existingCustomMarker.id ?? existingCustomMarker.Id);
      if (!markerId) return;

      setCustomMarkers((prev) =>
        prev.map((m) => {
          if (m.id !== markerId) return m;
          const updatedLat = Number(existingCustomMarker.latitude ?? existingCustomMarker.Latitude ?? existingCustomMarker.lat ?? existingCustomMarker.Lat ?? m.lat);
          const updatedLng = Number(existingCustomMarker.longitude ?? existingCustomMarker.Longitude ?? existingCustomMarker.lng ?? existingCustomMarker.Lng ?? m.lng);
          const updatedName = String(existingCustomMarker.name ?? existingCustomMarker.Name ?? m.name);
          const updatedCategory = (existingCustomMarker.category ?? existingCustomMarker.Category ?? m.category) as any;
          const updatedDescription = String(existingCustomMarker.description ?? existingCustomMarker.Description ?? m.description);
          return {
            ...m,
            lat: updatedLat,
            lng: updatedLng,
            name: updatedName,
            category: updatedCategory,
            description: updatedDescription,
          };
        })
      );

      const markerName = String(existingCustomMarker.name ?? existingCustomMarker.Name ?? 'Marker');
      addNotification('Map', '#3B82F6', 'Marker Updated', `"${markerName}" has been updated`);
    });

    // 3. Marker Deleted: await _realTimeNotificationService.NotifyAll("Marker Deleted", existingCustomMarker)
    const unsubMarkerDeleted = onMarkerDeleted((existingCustomMarker) => {
      if (!existingCustomMarker) return;
      const markerId = typeof existingCustomMarker === 'number'
        ? existingCustomMarker
        : Number(existingCustomMarker.id ?? existingCustomMarker.Id ?? existingCustomMarker.customMarkerId ?? existingCustomMarker.CustomMarkerId);
      if (!markerId) return;

      setCustomMarkers((prev) => {
        const found = prev.find((m) => m.id === markerId);
        if (found) {
          addNotification(found.userName, '#EF4444', 'Marker Deleted', `"${found.name}" was removed from the map`);
        }
        return prev.filter((m) => m.id !== markerId);
      });
    });

    // 4. Journey Session Started: await _realtimeNotificationService.NotifyAll("Journey Session Started", newJourneySession)
    const unsubSessionStarted = onJourneySessionStarted((newJourneySession) => {
      if (!newJourneySession) return;
      const sessId = Number(newJourneySession.id ?? newJourneySession.Id ?? Date.now());
      const sessUserId = Number(newJourneySession.userId ?? newJourneySession.UserId ?? 1);
      const matchedUser = allUsers.find((u) => u.id === sessUserId);
      const isMe = sessUserId === (authUser?.id || 1);
      const userColor = matchedUser ? matchedUser.color : PALETTE_30_COLORS[sessUserId % PALETTE_30_COLORS.length];
      const uName = matchedUser ? matchedUser.name : (isMe ? userName : `User #${sessUserId}`);
      const avatar = matchedUser ? matchedUser.avatar : (isMe ? (userAvatarUrl || '') : '');
      const startTimeMs = newJourneySession.startTime || newJourneySession.StartTime
        ? new Date(newJourneySession.startTime || newJourneySession.StartTime).getTime()
        : Date.now();
      const coords = newJourneySession.coordinates || newJourneySession.Coordinates || [];
      const destCoords = coords.length > 0
        ? {
            lat: Number(coords[coords.length - 1].latitude ?? coords[coords.length - 1].Latitude ?? 7.1475),
            lng: Number(coords[coords.length - 1].longitude ?? coords[coords.length - 1].Longitude ?? 3.3619),
          }
        : { lat: 7.1475, lng: 3.3619 };
      const destName = String(newJourneySession.destinationName ?? newJourneySession.DestinationName ?? `Journey Session #${sessId}`);

      const sessionLog: CompletedRouteLog = {
        id: sessId,
        userId: sessUserId,
        userName: uName,
        userColor: userColor,
        userAvatar: avatar,
        destinationName: destName,
        destinationCoords: destCoords,
        startTime: startTimeMs,
        endTime: startTimeMs,
        durationSeconds: Number(newJourneySession.totalDurationSeconds ?? newJourneySession.TotalDurationSeconds ?? 0),
        durationFormatted: '0 sec',
        distanceMeters: Number(newJourneySession.totalDistanceMeters ?? newJourneySession.TotalDistanceMeters ?? 0),
        averageSpeedKmH: Number(newJourneySession.averageSpeedKmH ?? newJourneySession.AverageSpeedKmH ?? 0),
        travelMode: 'DRIVING',
        status: 'active',
        completedAtTimeString: new Date(startTimeMs).toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setCompletedRoutes((prev) => {
        if (prev.some((s) => s.id === sessionLog.id)) {
          return prev.map((s) => (s.id === sessionLog.id ? sessionLog : s));
        }
        return [sessionLog, ...prev];
      });

      if (!isMe) {
        setAllUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.id === sessUserId
              ? {
                  ...u,
                  isNavigating: true,
                  activeDestinationName: destName,
                  activeDestinationCoords: destCoords,
                  navigationStartTime: startTimeMs,
                }
              : u
          )
        );
      }

      addNotification(uName, userColor, 'Journey Session Started', `${uName} started a new journey session`);
    });

    // 5. Journey Session Updated: await _realtimeNotificationService.NotifyAll("Journey Session Updated", existingJourneySession)
    const unsubSessionUpdated = onJourneySessionUpdated((existingJourneySession) => {
      if (!existingJourneySession) return;
      const sessId = Number(existingJourneySession.id ?? existingJourneySession.Id);
      if (!sessId) return;
      const sessUserId = Number(existingJourneySession.userId ?? existingJourneySession.UserId ?? 1);
      const matchedUser = allUsers.find((u) => u.id === sessUserId);
      const isMe = sessUserId === (authUser?.id || 1);
      const userColor = matchedUser ? matchedUser.color : PALETTE_30_COLORS[sessUserId % PALETTE_30_COLORS.length];
      const uName = matchedUser ? matchedUser.name : (isMe ? userName : `User #${sessUserId}`);
      const statusNum = Number(existingJourneySession.status ?? existingJourneySession.Status ?? 1);
      const isCompleted = statusNum === 2;
      const isCancelled = statusNum === 3;
      const durationSec = Number(existingJourneySession.totalDurationSeconds ?? existingJourneySession.TotalDurationSeconds ?? 0);
      const distanceM = Number(existingJourneySession.totalDistanceMeters ?? existingJourneySession.TotalDistanceMeters ?? 0);
      const speedKmH = Number(existingJourneySession.averageSpeedKmH ?? existingJourneySession.AverageSpeedKmH ?? 0);

      setCompletedRoutes((prev) =>
        prev.map((s) => {
          if (s.id !== sessId) return s;
          return {
            ...s,
            durationSeconds: durationSec || s.durationSeconds,
            durationFormatted: formatDuration(durationSec || s.durationSeconds),
            distanceMeters: distanceM || s.distanceMeters,
            averageSpeedKmH: speedKmH || s.averageSpeedKmH,
            status: isCompleted ? 'completed' : isCancelled ? 'cancelled' : s.status,
          };
        })
      );

      if (isCompleted && !isMe) {
        setAllUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.id === sessUserId
              ? { ...u, isNavigating: false, activeDestinationName: null, activeDestinationCoords: null }
              : u
          )
        );
      }

      addNotification(uName, userColor, 'Journey Session Updated', `${uName}'s journey session #${sessId} was updated`);
    });

    // 6. Journey Session Cancelled: await _realtimeNotificationService.NotifyAll("Journey Session Cancelled", existingJourneySession)
    const unsubSessionCancelled = onJourneySessionCancelled((existingJourneySession) => {
      if (!existingJourneySession) return;
      const sessId = Number(existingJourneySession.id ?? existingJourneySession.Id);
      if (!sessId) return;
      const sessUserId = Number(existingJourneySession.userId ?? existingJourneySession.UserId ?? 1);
      const matchedUser = allUsers.find((u) => u.id === sessUserId);
      const isMe = sessUserId === (authUser?.id || 1);
      const uName = matchedUser ? matchedUser.name : (isMe ? userName : `User #${sessUserId}`);

      setCompletedRoutes((prev) =>
        prev.map((s) => (s.id === sessId ? { ...s, status: 'cancelled' } : s))
      );

      if (!isMe) {
        setAllUsers((prevUsers) =>
          prevUsers.map((u) =>
            u.id === sessUserId
              ? { ...u, isNavigating: false, activeDestinationName: null, activeDestinationCoords: null }
              : u
          )
        );
      }

      addNotification(uName, '#EF4444', 'Journey Session Cancelled', `${uName} cancelled journey session #${sessId}`);
    });

    // 7. Route Log Added: await _realTimeNotificationService.NotifyAll("Route Log Added", newRouteLog)
    const unsubRouteLogAdded = onRouteLogAdded((newRouteLog) => {
      if (!newRouteLog) return;
      const logId = Number(newRouteLog.id ?? newRouteLog.Id ?? Date.now());
      const logUserId = Number(newRouteLog.userId ?? newRouteLog.UserId ?? 1);
      const matchedUser = allUsers.find((u) => u.id === logUserId);
      const isMe = logUserId === (authUser?.id || 1);
      const userColor = matchedUser ? matchedUser.color : PALETTE_30_COLORS[logUserId % PALETTE_30_COLORS.length];
      const uName = matchedUser ? matchedUser.name : (isMe ? userName : `User #${logUserId}`);
      const avatar = matchedUser ? matchedUser.avatar : (isMe ? (userAvatarUrl || '') : '');
      const rawDuration = Number(newRouteLog.durationSeconds ?? newRouteLog.DurationSeconds ?? 60);
      const distMeters = Number(newRouteLog.totalDistanceMeters ?? newRouteLog.TotalDistanceMeters ?? 1000);
      const completedDate = newRouteLog.completedAt || newRouteLog.CompletedAt
        ? new Date(newRouteLog.completedAt || newRouteLog.CompletedAt)
        : new Date();
      const endTimeMs = completedDate.getTime();
      const startTimeMs = endTimeMs - rawDuration * 1000;
      const avgSpeed = distMeters > 0 && rawDuration > 0
        ? Number((distMeters / 1000 / (rawDuration / 3600)).toFixed(1))
        : 20;
      const travelModeNum = Number(newRouteLog.travelMode ?? newRouteLog.TravelMode ?? 1);
      const modeStr: 'WALKING' | 'DRIVING' | 'FLIGHT' = travelModeNum === 2 ? 'WALKING' : travelModeNum === 3 ? 'FLIGHT' : 'DRIVING';
      const destName = String(newRouteLog.destinationName ?? newRouteLog.DestinationName ?? 'Destination');

      const logItem: CompletedRouteLog = {
        id: logId,
        userId: logUserId,
        userName: uName,
        userColor: userColor,
        userAvatar: avatar,
        destinationName: destName,
        destinationCoords: { lat: 7.1475, lng: 3.3619 },
        startTime: startTimeMs,
        endTime: endTimeMs,
        durationSeconds: rawDuration,
        durationFormatted: formatDuration(rawDuration),
        distanceMeters: distMeters,
        averageSpeedKmH: avgSpeed,
        travelMode: modeStr,
        status: 'completed',
        completedAtTimeString: completedDate.toLocaleString('en-US', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      };

      setCompletedRoutes((prev) => {
        if (prev.some((r) => r.id === logItem.id)) {
          return prev.map((r) => (r.id === logItem.id ? logItem : r));
        }
        return [logItem, ...prev];
      });

      addNotification(uName, userColor, 'Route Log Added', `Route log to ${destName} was recorded`);
    });

    // 8. Route Log Updated: await _realTimeNotificationService.NotifyAll("Route Log Updated", existingRouteLog)
    const unsubRouteLogUpdated = onRouteLogUpdated((existingRouteLog) => {
      if (!existingRouteLog) return;
      const logId = Number(existingRouteLog.id ?? existingRouteLog.Id);
      if (!logId) return;
      const destName = String(existingRouteLog.destinationName ?? existingRouteLog.DestinationName ?? 'Destination');
      const distMeters = Number(existingRouteLog.totalDistanceMeters ?? existingRouteLog.TotalDistanceMeters ?? 0);
      const durationSec = Number(existingRouteLog.durationSeconds ?? existingRouteLog.DurationSeconds ?? 0);

      setCompletedRoutes((prev) =>
        prev.map((r) => {
          if (r.id !== logId) return r;
          return {
            ...r,
            destinationName: destName || r.destinationName,
            distanceMeters: distMeters || r.distanceMeters,
            durationSeconds: durationSec || r.durationSeconds,
            durationFormatted: formatDuration(durationSec || r.durationSeconds),
          };
        })
      );

      addNotification('Route Log', '#3B82F6', 'Route Log Updated', `Route log #${logId} to ${destName} was updated`);
    });

    return () => {
      unsubMarkerAdded();
      unsubMarkerUpdated();
      unsubMarkerDeleted();
      unsubSessionStarted();
      unsubSessionUpdated();
      unsubSessionCancelled();
      unsubRouteLogAdded();
      unsubRouteLogUpdated();
    };
  }, [allUsers, authUser, userName, userAvatarUrl, addNotification]);

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
    const currentUserId = authUser?.id || 1;

    // POST /LocationTracker/JourneySession/UpdateJourneySession
    if (activeJourneySessionId) {
      locationTrackerService.updateJourneySession({
        id: activeJourneySessionId,
        userId: currentUserId,
        startTime: new Date(navigationStartTime || Date.now() - durationSeconds * 1000).toISOString(),
        endTime: new Date().toISOString(),
        totalDistanceMeters: distanceMeters,
        totalDurationSeconds: durationSeconds,
        averageSpeedKmH: speedKmH,
        status: 2, // 2 = Completed
      }).catch((err) => {
        console.warn('API Warning [updateJourneySession]:', err);
      });
      setActiveJourneySessionId(null);
    }

    // Flush any pending coordinates via CreateBatchCoordinates
    if (coordinateBufferRef.current.length > 0) {
      const finalBatch = [...coordinateBufferRef.current];
      coordinateBufferRef.current = [];
      locationTrackerService.createBatchCoordinates(finalBatch);
    }

    const newCompletedLog: CompletedRouteLog = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      userId: currentUserId,
      userName: userFullName,
      userColor: PALETTE_30_COLORS[0],
      userAvatar: userAvatarUrl || '',
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
    addNotification(userFullName, PALETTE_30_COLORS[0], 'Route Completed!', `You have automatically arrived at ${destName}!`);
  }, [routes, selectedRouteId, navigationStartTime, activeDestinationName, activeDestinationCoords, currentPoint, addNotification, activeJourneySessionId, authUser, userName, userAvatarUrl]);

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
      const currentUserId = authUser?.id || 1;

      // GET /LocationTracker/JourneySession/CancelJourneySession?journeyId={id}
      if (activeJourneySessionId) {
        locationTrackerService.cancelJourneySession(activeJourneySessionId).catch((err) => {
          console.warn('API Warning [cancelJourneySession]:', err);
        });
        setActiveJourneySessionId(null);
      }

      // Send SignalR cancel route event
      sendCancelRouteSignal(currentUserId, destName, durationSeconds);

      const cancelledLog: CompletedRouteLog = {
        id: Date.now() + Math.floor(Math.random() * 1000),
        userId: currentUserId,
        userName: userFullName,
        userColor: PALETTE_30_COLORS[0],
        userAvatar: userAvatarUrl || '',
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
      addNotification(userFullName, PALETTE_30_COLORS[0], 'Route Cancelled', `Route to ${destName} has been cancelled and saved.`);
    }

    setIsNavigating(false);
    setNavigationActive(false);
    setNavigationStartTime(null);
    setActiveJourneySessionId(null);
    coordinateBufferRef.current = [];
    setRoutes([]);
    setSelectedRouteId(null);
    setActiveDestinationName(null);
    setActiveDestinationCoords(null);
  };

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
        userFullName={userFullName}
        userAvatarUrl={userAvatarUrl || undefined}
        isLoggedIn={!!authToken && !!authUser}
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

      {/* Bottom Right Floating Stacked Notification Banners (Stacks in front, opens on hover, disappears after 10s) */}
      <NotificationStack
        notifications={notifications}
        onDismiss={dismissNotification}
        onClearAll={handleClearAllNotifications}
        isDark={isDark}
      />

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
            userName={userFullName || userName}
            userAvatarUrl={userAvatarUrl || undefined}
            activeDestinationName={activeDestinationName}
            isNavigating={isNavigating}
            allUsers={allUsers}
            selectedUserIdFilter={selectedUserIdFilter}
            contentTypeFilter={contentTypeFilter}
            timeRangeFilter={timeRangeFilter}
            pointsHistory={pointsHistory}
            completedRoutes={completedRoutes}
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
              userAvatarUrl={userAvatarUrl}
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
