import { apiClient } from '../utils/apiClient';

/**
 * TypeScript Payload Interfaces for LocationTracker API Controllers
 */

export interface CreateCoordinatePayload {
  userId: number;
  journeyId: number;
  routeId: number;
  sequenceIndex: number;
  latitude: number;
  longitude: number;
  altitude: number;
  accuracyMeters: number;
  headingDegrees: number;
  speedKmH: number;
}

export interface GetCoordinateDto extends CreateCoordinatePayload {
  id: number;
  timestamp: string;
}

export interface CreateCustomMarkerPayload {
  userId: number;
  userColor?: string;
  name: string;
  category?: string;
  latitude: number;
  longitude: number;
  isFromStayPoint: boolean;
}

export interface UpdateCustomMarkerPayload {
  id: number;
  userId: number;
  userColor?: string;
  name: string;
  category?: string;
  latitude: number;
  longitude: number;
  isFromStayPoint: boolean;
}

export interface GetCustomMarkerDto extends CreateCustomMarkerPayload {
  id: number;
  createdAt: string;
}

export interface CreateJourneySessionPayload {
  userId: number;
  startTime: string; // ISO string
  endTime?: string;  // ISO string
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  averageSpeedKmH: number;
  status: number; // 1 = Active, 2 = Completed, 3 = Cancelled
  coordinates?: CreateCoordinatePayload[];
}

export interface GetJourneySessionDto {
  id: number;
  userId: number;
  startTime: string;
  endTime?: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  averageSpeedKmH: number;
  status: number;
  coordinates?: GetCoordinateDto[];
}

export interface UpdateJourneySessionPayload {
  id: number;
  userId: number;
  startTime: string;
  endTime?: string;
  totalDistanceMeters: number;
  totalDurationSeconds: number;
  averageSpeedKmH: number;
  status: number;
}

export interface GenericIdNames {
  id: number;
  name: string;
}

export interface GenericNames extends GenericIdNames {
  isHidden: boolean;
  imageUrl: string;
}

export interface CreateRouteLogPayload {
  userId: number;
  routeId: number;
  journeyId: number;
  originName: string;
  destinationName: string;
  totalDistanceMeters: number;
  durationSeconds: number;
  travelMode: number; // 1 = Vehicle, 2 = Walking, 3 = Airplane
  completedAt: string; // ISO string
}

export interface GetRouteLogDto extends CreateRouteLogPayload {
  id: number;
}

export interface UpdateRouteLogPayload extends CreateRouteLogPayload {
  id: number;
}

/**
 * Service Layer for ASP.NET Core LocationTracker Controllers
 */
export const locationTrackerService = {
  // ----------------------------------------------------
  // 1. COORDINATE ENDPOINTS
  // ----------------------------------------------------

  /**
   * Post a single coordinate update
   * POST /LocationTracker/Coordinate/CreateCoordinate
   */
  async createCoordinate(payload: CreateCoordinatePayload): Promise<GetCoordinateDto | null> {
    try {
      const response = await apiClient.post<GetCoordinateDto>(
        '/LocationTracker/Coordinate/CreateCoordinate',
        payload
      );
      return response.data;
    } catch (error) {
      console.warn('API Warning [createCoordinate]:', error);
      return null;
    }
  },

  /**
   * Post a batch array of coordinates
   * POST /LocationTracker/Coordinate/CreateBatchCoordinates
   */
  async createBatchCoordinates(payload: CreateCoordinatePayload[]): Promise<GetCoordinateDto[] | null> {
    try {
      const response = await apiClient.post<GetCoordinateDto[]>(
        '/LocationTracker/Coordinate/CreateBatchCoordinates',
        payload
      );
      return response.data;
    } catch (error) {
      console.warn('API Warning [createBatchCoordinates]:', error);
      return null;
    }
  },

  // ----------------------------------------------------
  // 2. CUSTOM MARKER ENDPOINTS
  // ----------------------------------------------------

  /**
   * Create a new custom saved marker on the map
   * POST /LocationTracker/CustomMarker/CreateCustomMarker
   */
  async createCustomMarker(payload: CreateCustomMarkerPayload): Promise<GetCustomMarkerDto | null> {
    try {
      const response = await apiClient.post<GetCustomMarkerDto>(
        '/LocationTracker/CustomMarker/CreateCustomMarker',
        payload
      );
      return response.data;
    } catch (error) {
      console.warn('API Warning [createCustomMarker]:', error);
      return null;
    }
  },

  /**
   * Update an existing custom marker
   * POST /LocationTracker/CustomMarker/UpdateCustomMarker
   */
  async updateCustomMarker(payload: UpdateCustomMarkerPayload): Promise<GetCustomMarkerDto | null> {
    try {
      const response = await apiClient.post<GetCustomMarkerDto>(
        '/LocationTracker/CustomMarker/UpdateCustomMarker',
        payload
      );
      return response.data;
    } catch (error) {
      console.warn('API Warning [updateCustomMarker]:', error);
      return null;
    }
  },

  /**
   * Fetch all custom markers
   * GET /LocationTracker/CustomMarker/GetAllCustomMarkers
   */
  async getAllCustomMarkers(): Promise<GetCustomMarkerDto[]> {
    try {
      const response = await apiClient.get<GetCustomMarkerDto[]>(
        '/LocationTracker/CustomMarker/GetAllCustomMarkers'
      );
      return response.data || [];
    } catch (error) {
      console.warn('API Warning [getAllCustomMarkers]:', error);
      return [];
    }
  },

  /**
   * Delete a custom marker by ID
   * DELETE /LocationTracker/CustomMarker/DeleteCustomMarker?customMarkerId={id}
   */
  async deleteCustomMarker(customMarkerId: number): Promise<boolean> {
    try {
      await apiClient.delete(
        `/LocationTracker/CustomMarker/DeleteCustomMarker?customMarkerId=${customMarkerId}`
      );
      return true;
    } catch (error) {
      console.warn('API Warning [deleteCustomMarker]:', error);
      return false;
    }
  },

  // ----------------------------------------------------
  // 3. JOURNEY SESSION ENDPOINTS
  // ----------------------------------------------------

  /**
   * Create a new continuous journey session
   * POST /LocationTracker/JourneySession/CreateJourneySession
   */
  async createJourneySession(payload: CreateJourneySessionPayload): Promise<GetJourneySessionDto | null> {
    try {
      const sanitizedPayload: CreateJourneySessionPayload = {
        ...payload,
        coordinates: payload.coordinates
          ? payload.coordinates.map((c) => ({
              ...c,
              routeId: 0, // Explicitly set to integer 0 as required by backend
              sequenceIndex: Number(c.sequenceIndex) || 0,
              latitude: Number(c.latitude),
              longitude: Number(c.longitude),
              altitude: Math.round(Number(c.altitude) || 0),
              accuracyMeters: Math.round(Number(c.accuracyMeters) || 0),
              headingDegrees: Math.round(Number(c.headingDegrees) || 0),
              speedKmH: Math.round(Number(c.speedKmH) || 0),
            }))
          : [],
      };
      const response = await apiClient.post<GetJourneySessionDto>(
        '/LocationTracker/JourneySession/CreateJourneySession',
        sanitizedPayload
      );
      return response.data;
    } catch (error) {
      console.warn('API Warning [createJourneySession]:', error);
      return null;
    }
  },

  /**
   * Update an existing journey session (distance, duration, speed, status)
   * POST /LocationTracker/JourneySession/UpdateJourneySession
   */
  async updateJourneySession(payload: UpdateJourneySessionPayload): Promise<GetJourneySessionDto | null> {
    try {
      const response = await apiClient.post<GetJourneySessionDto>(
        '/LocationTracker/JourneySession/UpdateJourneySession',
        payload
      );
      return response.data;
    } catch (error) {
      console.warn('API Warning [updateJourneySession]:', error);
      return null;
    }
  },

  /**
   * Cancel an ongoing journey session
   * GET /LocationTracker/JourneySession/CancelJourneySession?journeyId={journeyId}
   */
  async cancelJourneySession(journeyId: number): Promise<boolean> {
    try {
      await apiClient.get(
        `/LocationTracker/JourneySession/CancelJourneySession?journeyId=${journeyId}`
      );
      return true;
    } catch (error) {
      console.warn('API Warning [cancelJourneySession]:', error);
      return false;
    }
  },

  /**
   * Fetch all recorded journey sessions
   * GET /LocationTracker/JourneySession/GetAllJourneySessions
   */
  async getAllJourneySessions(): Promise<GetJourneySessionDto[]> {
    try {
      const response = await apiClient.get<GetJourneySessionDto[]>(
        '/LocationTracker/JourneySession/GetAllJourneySessions'
      );
      return response.data || [];
    } catch (error) {
      console.warn('API Warning [getAllJourneySessions]:', error);
      return [];
    }
  },

  /**
   * Fetch all recorded journey sessions by date
   * GET /LocationTracker/JourneySession/GetAllJourneySessionsByDate?date={date}
   */
  async getAllJourneySessionsByDate(date: string): Promise<GetJourneySessionDto[]> {
    try {
      const response = await apiClient.get<GetJourneySessionDto[]>(
        `/LocationTracker/JourneySession/GetAllJourneySessionsByDate?date=${encodeURIComponent(date)}`
      );
      return response.data || [];
    } catch (error) {
      console.warn('API Warning [getAllJourneySessionsByDate]:', error);
      return [];
    }
  },

  /**
   * Fetch a single journey session by ID
   * GET /LocationTracker/JourneySession/GetJourneySession?journeyId={journeyId}
   */
  async getJourneySession(journeyId: number): Promise<GetJourneySessionDto | null> {
    try {
      const response = await apiClient.get<GetJourneySessionDto>(
        `/LocationTracker/JourneySession/GetJourneySession?journeyId=${journeyId}`
      );
      return response.data || null;
    } catch (error) {
      console.warn('API Warning [getJourneySession]:', error);
      return null;
    }
  },

  // ----------------------------------------------------
  // 4. ROUTE LOG ENDPOINTS
  // ----------------------------------------------------

  /**
   * Create a completed or cancelled route log
   * POST /LocationTracker/RouteLog/CreateRouteLog
   */
  async createRouteLog(payload: CreateRouteLogPayload): Promise<GetRouteLogDto | null> {
    try {
      const response = await apiClient.post<GetRouteLogDto>(
        '/LocationTracker/RouteLog/CreateRouteLog',
        payload
      );
      return response.data;
    } catch (error) {
      console.warn('API Warning [createRouteLog]:', error);
      return null;
    }
  },

  /**
   * Update an existing route log
   * POST /LocationTracker/RouteLog/UpdateRouteLog
   */
  async updateRouteLog(payload: UpdateRouteLogPayload): Promise<GetRouteLogDto | null> {
    try {
      const response = await apiClient.post<GetRouteLogDto>(
        '/LocationTracker/RouteLog/UpdateRouteLog',
        payload
      );
      return response.data;
    } catch (error) {
      console.warn('API Warning [updateRouteLog]:', error);
      return null;
    }
  },

  /**
   * Fetch all route logs
   * GET /LocationTracker/RouteLog/GetAllRouteLogs
   */
  async getAllRouteLogs(): Promise<GetRouteLogDto[]> {
    try {
      const response = await apiClient.get<GetRouteLogDto[]>(
        '/LocationTracker/RouteLog/GetAllRouteLogs'
      );
      return response.data || [];
    } catch (error) {
      console.warn('API Warning [getAllRouteLogs]:', error);
      return [];
    }
  },

  /**
   * Fetch route logs by date
   * GET /LocationTracker/RouteLog/GetRouteLogsByDate?date={date}
   */
  async getRouteLogsByDate(date: string): Promise<GetRouteLogDto[]> {
    try {
      const response = await apiClient.get<GetRouteLogDto[]>(
        `/LocationTracker/RouteLog/GetRouteLogsByDate?date=${encodeURIComponent(date)}`
      );
      return response.data || [];
    } catch (error) {
      console.warn('API Warning [getRouteLogsByDate]:', error);
      return [];
    }
  },

  // ----------------------------------------------------
  // 5. USER ENDPOINTS
  // ----------------------------------------------------

  /**
   * Fetch a specific user's current location
   * GET /LocationTracker/User/GetUserLocation?userId={userId}
   */
  async getUserLocation(userId: number): Promise<GetCoordinateDto | null> {
    try {
      const response = await apiClient.get<GetCoordinateDto>(
        `/LocationTracker/User/GetUserLocation?userId=${userId}`
      );
      return response.data || null;
    } catch (error) {
      console.warn('API Warning [getUserLocation]:', error);
      return null;
    }
  },

  /**
   * Fetch all users
   * GET /LocationTracker/User/GetAllUsers
   */
  async getAllUsers(): Promise<GenericNames[]> {
    try {
      const response = await apiClient.get<any>('/LocationTracker/User/GetAllUsers');
      const rawList = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
        ? response.data.data
        : [];
      return rawList.map((item: any) => ({
        id: Number(item.id ?? item.Id),
        name: String(item.name ?? item.Name ?? ''),
        imageUrl: String(item.imageUrl ?? item.ImageUrl ?? ''),
        isHidden: Boolean(item.isHidden ?? item.IsHidden ?? false),
      }));
    } catch (error) {
      console.warn('API Warning [getAllUsers]:', error);
      return [];
    }
  },
};
