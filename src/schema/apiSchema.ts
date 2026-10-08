/**
 * API Schema and Endpoint Specifications
 *
 * NOTE: Per project design guidelines, all date filtering and collection sorting
 * (by date, duration, name, user, etc.) are performed strictly on the FRONT END client.
 * API endpoints return raw collection data without forced server-side ordering.
 */

import {
  AppUser,
  LocationPoint,
  CustomMarker,
  RecordedPlace,
  RouteOption,
  CompletedRouteLog,
  JourneySegment,
} from '../types';

export interface ApiEndpointSpec {
  endpoint: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  title: string;
  description: string;
  category: 'Users & Location' | 'Routes & Navigation' | 'Markers & Places' | 'Movement Logs' | 'Realtime SignalR';
  requiresDataFetching: boolean;
  requestSchema?: {
    params?: Record<string, string>;
    query?: Record<string, string>;
    body?: Record<string, string>;
  };
  responseSchema: {
    statusCode: number;
    description: string;
    bodyExample: string;
  };
}

/**
 * Complete List of Required API Endpoints for the Application
 */
export const APP_API_ENDPOINTS: ApiEndpointSpec[] = [
  // ----------------------------------------------------
  // 1. USERS & LOCATION FETCHING ENDPOINTS
  // ----------------------------------------------------
  {
    endpoint: '/api/users',
    method: 'GET',
    title: 'Fetch All Active Users and Current Locations',
    description: 'Retrieves all users with their current real-time GPS location points, active destination, and navigation state. Sorting and date range filters are handled client-side.',
    category: 'Users & Location',
    requiresDataFetching: true,
    responseSchema: {
      statusCode: 200,
      description: 'List of all users with current coordinates and navigation status.',
      bodyExample: '{"users": [/* Array of AppUser objects */]}',
    },
  },
  {
    endpoint: '/api/users/:id/location',
    method: 'GET',
    title: 'Fetch Current Location for Specific User',
    description: 'Returns the most recent GPS location point recorded for a specified user ID.',
    category: 'Users & Location',
    requiresDataFetching: true,
    requestSchema: {
      params: { id: 'number (User ID)' },
    },
    responseSchema: {
      statusCode: 200,
      description: 'User location point.',
      bodyExample: '{"userId": 1, "lat": 7.1475, "lng": 3.3619, "speed": 24.5, "timestamp": 1758382400000}',
    },
  },
  {
    endpoint: '/api/users/:id/location',
    method: 'POST',
    title: 'Post Live GPS Location Update',
    description: 'Pushes a new GPS location update for a user. Broadcasted to other users via SignalR hub.',
    category: 'Users & Location',
    requiresDataFetching: false,
    requestSchema: {
      params: { id: 'number (User ID)' },
      body: {
        lat: 'number',
        lng: 'number',
        accuracy: 'number (meters)',
        speed: 'number (km/h)',
        heading: 'number (0-360 degrees)',
        timestamp: 'number (epoch ms)',
      },
    },
    responseSchema: {
      statusCode: 200,
      description: 'Location update acknowledged.',
      bodyExample: '{"success": true, "pointId": 10842}',
    },
  },

  // ----------------------------------------------------
  // 2. ROUTES & NAVIGATION ENDPOINTS (START & CANCEL)
  // ----------------------------------------------------
  {
    endpoint: '/api/routes/calculate',
    method: 'POST',
    title: 'Calculate Directions and Alternative Routes',
    description: 'Calculates driving and walking route options between user current location and destination coordinates.',
    category: 'Routes & Navigation',
    requiresDataFetching: true,
    requestSchema: {
      body: {
        origin: 'LocationPoint or { lat, lng }',
        destination: '{ lat, lng }',
        destinationName: 'string',
        travelMode: 'DRIVING | WALKING',
      },
    },
    responseSchema: {
      statusCode: 200,
      description: 'Array of calculated route options including path points and steps.',
      bodyExample: '{"routes": [/* Array of RouteOption objects */]}',
    },
  },
  {
    endpoint: '/api/routes/start',
    method: 'POST',
    title: 'Start Route Navigation',
    description: 'Initiates turn-by-turn navigation for a user along a selected route. Triggers real-time navigation broadcast via SignalR.',
    category: 'Routes & Navigation',
    requiresDataFetching: false,
    requestSchema: {
      body: {
        userId: 'number (User ID initiating navigation)',
        routeId: 'number (Selected Route Option ID)',
        destinationName: 'string',
        destinationCoords: '{ lat: number, lng: number }',
        startTime: 'number (epoch ms)',
      },
    },
    responseSchema: {
      statusCode: 200,
      description: 'Navigation session successfully started.',
      bodyExample: '{"success": true, "navigationSessionId": "nav_98214", "status": "active", "startTime": 1758382400000}',
    },
  },
  {
    endpoint: '/api/routes/cancel',
    method: 'POST',
    title: 'Cancel Active Route Navigation',
    description: 'Cancels an ongoing navigation route after it has started. Logs the route as "cancelled" in history and triggers bottom-right slide notification.',
    category: 'Routes & Navigation',
    requiresDataFetching: false,
    requestSchema: {
      body: {
        userId: 'number (User ID cancelling route)',
        routeId: 'number (Active Route ID)',
        destinationName: 'string',
        durationSeconds: 'number (Elapsed navigation duration in seconds)',
        distanceMeters: 'number (Distance covered prior to cancellation)',
        reason: 'string (optional cancellation note)',
      },
    },
    responseSchema: {
      statusCode: 200,
      description: 'Route successfully cancelled and saved to history.',
      bodyExample: '{"success": true, "logId": 8912, "status": "cancelled", "cancelledAt": 1758382520000}',
    },
  },
  {
    endpoint: '/api/routes/complete',
    method: 'POST',
    title: 'Complete Route Navigation',
    description: 'Marks a route navigation as completed upon arrival at destination.',
    category: 'Routes & Navigation',
    requiresDataFetching: false,
    requestSchema: {
      body: {
        userId: 'number',
        routeId: 'number',
        destinationName: 'string',
        durationSeconds: 'number',
        distanceMeters: 'number',
      },
    },
    responseSchema: {
      statusCode: 200,
      description: 'Route navigation logged as completed.',
      bodyExample: '{"success": true, "logId": 8913, "status": "completed"}',
    },
  },
  {
    endpoint: '/api/routes/history',
    method: 'GET',
    title: 'Fetch Route Navigation History Logs',
    description: 'Retrieves completed and cancelled route logs. Note: Date filtering and sorting are executed client-side.',
    category: 'Routes & Navigation',
    requiresDataFetching: true,
    responseSchema: {
      statusCode: 200,
      description: 'List of completed and cancelled route logs.',
      bodyExample: '{"history": [/* Array of CompletedRouteLog objects */]}',
    },
  },

  // ----------------------------------------------------
  // 3. MARKERS & PLACES ENDPOINTS
  // ----------------------------------------------------
  {
    endpoint: '/api/markers',
    method: 'GET',
    title: 'Fetch All Custom Saved Markers',
    description: 'Fetches custom map markers created by users. Sorting (by user name/date) is performed on front-end.',
    category: 'Markers & Places',
    requiresDataFetching: true,
    responseSchema: {
      statusCode: 200,
      description: 'Array of custom markers.',
      bodyExample: '{"markers": [/* Array of CustomMarker objects */]}',
    },
  },
  {
    endpoint: '/api/markers',
    method: 'POST',
    title: 'Create Custom Saved Marker',
    description: 'Saves a new custom marker pinned by a user on the map.',
    category: 'Markers & Places',
    requiresDataFetching: false,
    requestSchema: {
      body: {
        userId: 'number',
        userName: 'string',
        lat: 'number',
        lng: 'number',
        name: 'string',
        description: 'string',
        category: 'generic | work | cafe | home | landmark | store',
      },
    },
    responseSchema: {
      statusCode: 201,
      description: 'Marker created successfully.',
      bodyExample: '{"success": true, "marker": {/* CustomMarker object */}}',
    },
  },
  {
    endpoint: '/api/markers/:id',
    method: 'PUT',
    title: 'Update Custom Saved Marker',
    description: 'Updates name or description of an existing custom marker.',
    category: 'Markers & Places',
    requiresDataFetching: false,
    requestSchema: {
      params: { id: 'number (Marker ID)' },
      body: { name: 'string', description: 'string' },
    },
    responseSchema: {
      statusCode: 200,
      description: 'Marker updated.',
      bodyExample: '{"success": true, "updatedMarker": {/* CustomMarker object */}}',
    },
  },
  {
    endpoint: '/api/markers/:id',
    method: 'DELETE',
    title: 'Delete Custom Saved Marker',
    description: 'Removes a custom marker by ID.',
    category: 'Markers & Places',
    requiresDataFetching: false,
    requestSchema: {
      params: { id: 'number (Marker ID)' },
    },
    responseSchema: {
      statusCode: 200,
      description: 'Marker deleted.',
      bodyExample: '{"success": true, "deletedId": 45}',
    },
  },
  {
    endpoint: '/api/places',
    method: 'GET',
    title: 'Fetch Recorded Places & Stay Points',
    description: 'Retrieves automatically detected stay places (dwell time >= 90s). Date filtering & sorting done on front-end.',
    category: 'Markers & Places',
    requiresDataFetching: true,
    responseSchema: {
      statusCode: 200,
      description: 'Array of recorded stay places.',
      bodyExample: '{"places": [/* Array of RecordedPlace objects */]}',
    },
  },

  // ----------------------------------------------------
  // 4. MOVEMENT LOGS & JOURNEY SEGMENTS ENDPOINTS
  // ----------------------------------------------------
  {
    endpoint: '/api/movements/segments',
    method: 'GET',
    title: 'Fetch Recorded Journey Segments',
    description: 'Fetches recorded movement journey segments (speed, distance, mode, duration). Client handles date range and speed sorting.',
    category: 'Movement Logs',
    requiresDataFetching: true,
    responseSchema: {
      statusCode: 200,
      description: 'Array of journey segments.',
      bodyExample: '{"segments": [/* Array of JourneySegment objects */]}',
    },
  },

  // ----------------------------------------------------
  // 5. SIGNALR REALTIME HUB SPECIFICATION
  // ----------------------------------------------------
  {
    endpoint: 'https://kv5zhpcr-7044.uks1.devtunnels.ms/LocationTracker',
    method: 'GET',
    title: 'SignalR Realtime WebSocket / Long-Polling Hub Connection',
    description: 'SignalR Hub endpoint mapped at /LocationTracker for real-time bi-directional streaming of user location coordinates, route starts, and route cancellations.',
    category: 'Realtime SignalR',
    requiresDataFetching: true,
    responseSchema: {
      statusCode: 101,
      description: 'SignalR WebSocket Connection Handshake upgraded.',
      bodyExample: '{"connectionId": "sig_abc123xyz", "availableTransports": ["WebSockets", "ServerSentEvents", "LongPolling"]}',
    },
  },
];

/**
 * SignalR Hub Methods and Event Definitions
 */
export interface SignalRHubSpec {
  hubUrl: string;
  serverInvocations: {
    UpdateLocation: string;
    StartRoute: string;
    CancelRoute: string;
    AddMarker: string;
  };
  clientEvents: {
    ReceiveLocationUpdate: string;
    ReceiveRouteStarted: string;
    ReceiveRouteCancelled: string;
    ReceiveMarkerAdded: string;
  };
}

export const SIGNALR_HUB_CONFIG: SignalRHubSpec = {
  hubUrl: 'https://kv5zhpcr-7044.uks1.devtunnels.ms/LocationTracker',
  serverInvocations: {
    UpdateLocation: 'UpdateLocation',
    StartRoute: 'StartRoute',
    CancelRoute: 'CancelRoute',
    AddMarker: 'AddMarker',
  },
  clientEvents: {
    ReceiveLocationUpdate: 'ReceiveLocationUpdate',
    ReceiveRouteStarted: 'ReceiveRouteStarted',
    ReceiveRouteCancelled: 'ReceiveRouteCancelled',
    ReceiveMarkerAdded: 'ReceiveMarkerAdded',
  },
};
