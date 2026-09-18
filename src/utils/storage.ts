/**
 * Persistent Local Storage Engine
 * Prevents app reloads or crashes from wiping user coordinates,
 * custom markers, segments, and journey session data.
 */

export const STORAGE_KEYS = {
  POINTS_HISTORY: 'route_tracker_points_history_v2',
  SEGMENTS: 'route_tracker_segments_v2',
  CUSTOM_MARKERS: 'route_tracker_custom_markers_v2',
  RECORDED_PLACES: 'route_tracker_recorded_places_v2',
  COMPLETED_ROUTES: 'route_tracker_completed_routes_v2',
  ACTIVE_JOURNEY_ID: 'route_tracker_active_journey_id_v2',
} as const;

export function safeSaveStorage<T>(key: string, data: T): void {
  try {
    if (typeof window === 'undefined') return;
    const serialized = JSON.stringify(data);
    localStorage.setItem(key, serialized);
  } catch (err) {
    console.warn(`Failed to save data to localStorage for key: ${key}`, err);
    // If quota exceeded, attempt to clear non-essential old items
    if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.code === 22)) {
      try {
        // Truncate large arrays to prevent persistent quota lock
        if (Array.isArray(data) && data.length > 500) {
          const truncated = data.slice(-400);
          localStorage.setItem(key, JSON.stringify(truncated));
        }
      } catch (innerErr) {
        console.error('Could not recover localStorage quota:', innerErr);
      }
    }
  }
}

export function safeLoadStorage<T>(key: string, fallback: T): T {
  try {
    if (typeof window === 'undefined') return fallback;
    const item = localStorage.getItem(key);
    if (!item) return fallback;
    const parsed = JSON.parse(item);
    return parsed !== null && parsed !== undefined ? parsed : fallback;
  } catch (err) {
    console.warn(`Failed to load data from localStorage for key: ${key}`, err);
    return fallback;
  }
}
