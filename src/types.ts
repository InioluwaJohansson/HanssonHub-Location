export type TravelMode = 'trekking' | 'vehicle' | 'stationary';

export type AppTheme = 'light' | 'dark';

export interface LocationPoint {
  id: string;
  lat: number;
  lng: number;
  accuracy: number; // in meters
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  heading?: number | null; // degrees (0-360)
  speed: number; // in km/h
  speedMps: number; // in m/s
  timestamp: number; // unix timestamp ms
  timeString: string; // ISO or human readable
}

export interface AppUser {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isCurrentUser: boolean;
  currentPoint: LocationPoint;
  isTracking: boolean;
  isStationary: boolean;
  stationaryStartTime: number | null;
  dwellDurationSeconds: number;
  activeDestinationName: string | null;
  activeDestinationCoords: { lat: number; lng: number } | null;
  isNavigating: boolean;
  navigationStartTime: number | null;
  speedKmH: number;
  mode: 'trekking' | 'vehicle';
}

export interface CompletedRouteLog {
  id: string;
  userId: string;
  userName: string;
  userColor: string;
  userAvatar: string;
  destinationName: string;
  destinationCoords: { lat: number; lng: number };
  startTime: number;
  endTime: number;
  durationSeconds: number;
  durationFormatted: string;
  distanceMeters: number;
  averageSpeedKmH: number;
  travelMode: 'WALKING' | 'DRIVING';
  completedAtTimeString: string;
}

export interface JourneySegment {
  id: string;
  userId?: string;
  userName?: string;
  userColor?: string;
  startPoint: LocationPoint;
  endPoint: LocationPoint;
  path: Array<{ lat: number; lng: number }>;
  distanceMeters: number;
  durationSeconds: number;
  averageSpeedKmH: number;
  mode: 'trekking' | 'vehicle';
  startTime: number;
  endTime: number;
}

export interface RecordedPlace {
  id: string;
  userId?: string;
  userName?: string;
  userColor?: string;
  lat: number;
  lng: number;
  accuracy: number;
  name?: string;
  address?: string;
  category?: 'home' | 'work' | 'cafe' | 'transit' | 'park' | 'spot' | 'custom';
  arrivedAt: number;
  departedAt?: number;
  dwellDurationSeconds: number;
  isCurrentStationary: boolean;
  notes?: string;
}

export interface CustomMarker {
  id: string;
  userId?: string;
  userName?: string;
  userColor?: string;
  lat: number;
  lng: number;
  name: string;
  description: string;
  category: 'generic' | 'work' | 'cafe' | 'home' | 'landmark' | 'store';
  createdAt: number;
  isFromStayPoint?: boolean;
}

export interface RouteOption {
  id: string;
  userId?: string;
  userName?: string;
  userColor?: string;
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  durationFormatted: string;
  durationAtCurrentSpeedFormatted: string;
  trekkingDurationSeconds: number;
  trekkingDurationFormatted: string;
  vehicleDurationSeconds: number;
  vehicleDurationFormatted: string;
  travelMode: 'WALKING' | 'DRIVING';
  path: Array<{ lat: number; lng: number }>;
  isFastest: boolean;
  steps: string[];
}

export interface StationaryState {
  isStationary: boolean;
  anchorPoint: LocationPoint | null;
  startTime: number | null;
  dwellDurationSeconds: number;
  qualifiesForRecordedPlace: boolean; // >= 90 seconds
  recordedPlaceId: string | null;
}

export interface TrackingStats {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  trekkingDistanceMeters: number;
  vehicleDistanceMeters: number;
  maxSpeedKmH: number;
  currentSpeedKmH: number;
  placesVisitedCount: number;
}

export interface CollectedFieldSpec {
  field: string;
  dataType: string;
  source: string;
  unit: string;
  description: string;
  backendNote: string;
}

