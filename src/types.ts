export type TravelMode = 'walking' | 'vehicle' | 'airplane' | 'stationary';

export type AppTheme = 'light' | 'dark';

export type RouteStatus = 'active' | 'completed' | 'cancelled';

export type ContentTypeFilter = 'all' | 'markers' | 'routes' | 'movements' | 'heatmap';

export type TimeRangeFilter = 'all' | '1w' | '2w' | '1m' | '3m' | '6m';

export interface LocationPoint {
  id: number;
  userId?: number; // Integer identifier for the user
  journeyId?: number; // Integer identifier for the specific journey
  routeId?: number; // Route integer identifier for plotting
  sequenceIndex?: number; // Zero-based sequence number in the journey path
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
  id: number;
  name: string;
  avatar: string;
  color: string;
  role?: string;
  isCurrentUser: boolean;
  currentPoint: LocationPoint;
  isTracking: boolean;
  isStationary: boolean;
  stationaryStartTime: number | null;
  dwellDurationSeconds: number;
  activeDestinationName: string | null;
  activeDestinationCoords: { lat: number; lng: number } | null;
  originName?: string;
  originCoords?: { lat: number; lng: number };
  activeRoutePath?: Array<{ lat: number; lng: number }>;
  isNavigating: boolean;
  navigationStartTime: number | null;
  speedKmH: number;
  mode: 'walking' | 'vehicle' | 'airplane';
}

export interface CompletedRouteLog {
  id: number;
  userId: number;
  userName: string;
  userColor: string;
  userAvatar: string;
  destinationName: string;
  destinationCoords: { lat: number; lng: number };
  startTime: number;
  endTime?: number;
  durationSeconds: number;
  durationFormatted: string;
  distanceMeters: number;
  averageSpeedKmH: number;
  travelMode: 'WALKING' | 'DRIVING' | 'FLIGHT';
  status: RouteStatus;
  completedAtTimeString: string;
}

export interface JourneySegment {
  id: number;
  userId?: number;
  userName?: string;
  userColor?: string;
  journeyId?: number;
  startPoint: LocationPoint;
  endPoint: LocationPoint;
  path: Array<{ lat: number; lng: number }>;
  distanceMeters: number;
  durationSeconds: number;
  averageSpeedKmH: number;
  mode: 'walking' | 'vehicle' | 'airplane';
  startTime: number;
  endTime: number;
}

export interface RecordedPlace {
  id: number;
  userId?: number;
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
  id: number;
  userId: number; // Strictly tied to a specific user (integer id)
  userName: string; // Name of user who created this marker
  userColor?: string;
  lat: number;
  lng: number;
  name: string;
  description: string;
  category: string;
  createdAt: number;
  isFromStayPoint?: boolean;
}

export interface JourneySession {
  id: number; // Unique integer ID for easy identification and plotting
  userId: number;
  userName: string;
  userColor: string;
  routeName: string;
  travelMode: TravelMode;
  startTime: number;
  endTime?: number | null;
  totalDistanceMeters: number;
  coordinates: LocationPoint[];
}

export interface RouteOption {
  id: number;
  userId?: number;
  userName?: string;
  userColor?: string;
  status?: RouteStatus;
  summary: string;
  distanceMeters: number;
  durationSeconds: number;
  durationFormatted: string;
  durationAtCurrentSpeedFormatted: string;
  walkingDurationSeconds: number;
  walkingDurationFormatted: string;
  vehicleDurationSeconds: number;
  vehicleDurationFormatted: string;
  airplaneDurationSeconds?: number;
  airplaneDurationFormatted?: string;
  trekkingDurationSeconds?: number;
  trekkingDurationFormatted?: string;
  travelMode: 'WALKING' | 'DRIVING' | 'FLIGHT';
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
  recordedPlaceId: number | null;
}

export interface TrackingStats {
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  walkingDistanceMeters: number;
  vehicleDistanceMeters: number;
  airplaneDistanceMeters: number;
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

export type { ApiEndpointSpec, SignalRHubSpec } from './schema/apiSchema';
export { APP_API_ENDPOINTS, SIGNALR_HUB_CONFIG } from './schema/apiSchema';

