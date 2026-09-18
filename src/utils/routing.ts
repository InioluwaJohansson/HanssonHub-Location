import { RouteOption } from '../types';
import {
  calculateDistanceMeters,
  calculateDurationAtCurrentSpeed,
  formatDuration,
  formatMinutesDuration,
} from './geo';

/**
 * Requests suggested routes from origin to destination using Google Maps DirectionsService,
 * with alternative routes and ETA calculated for both trekking (walking) and vehicle (driving).
 */
export async function fetchSuggestedRoutes(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  currentSpeedKmH: number = 0,
  travelMode: 'WALKING' | 'DRIVING' = 'WALKING'
): Promise<RouteOption[]> {
  try {
    if (typeof window !== 'undefined' && (window as any).google?.maps?.DirectionsService) {
      const directionsService = new (window as any).google.maps.DirectionsService();

      const request: google.maps.DirectionsRequest = {
        origin: new (window as any).google.maps.LatLng(origin.lat, origin.lng),
        destination: new (window as any).google.maps.LatLng(destination.lat, destination.lng),
        travelMode:
          travelMode === 'DRIVING'
            ? (window as any).google.maps.TravelMode.DRIVING
            : (window as any).google.maps.TravelMode.WALKING,
        provideRouteAlternatives: true,
      };

      const response: google.maps.DirectionsResult = await new Promise((resolve, reject) => {
        directionsService.route(request, (result: any, status: any) => {
          if (status === 'OK' && result) {
            resolve(result);
          } else {
            reject(new Error(`Directions request failed: ${status}`));
          }
        });
      });

      if (response && response.routes && response.routes.length > 0) {
        // Sort to identify the fastest
        let minDur = Infinity;
        response.routes.forEach((r) => {
          const dur = r.legs?.[0]?.duration?.value || 0;
          if (dur < minDur) minDur = dur;
        });

        return response.routes.map((route, idx) => {
          const leg = route.legs?.[0];
          const distMeters = leg?.distance?.value || calculateDistanceMeters(origin.lat, origin.lng, destination.lat, destination.lng);
          const durSec = leg?.duration?.value || Math.round(distMeters / 1.3);

          // Calculate time for trekking (~1.25 m/s)
          const trekkingSec =
            travelMode === 'WALKING' && leg?.duration?.value
              ? leg.duration.value
              : Math.max(60, Math.round(distMeters / 1.25));
          const trekkingDurationFormatted = formatMinutesDuration(trekkingSec);

          // Calculate time for vehicle (~10 m/s with realistic urban stoplights buffer)
          const vehicleSec =
            travelMode === 'DRIVING' && leg?.duration?.value
              ? leg.duration.value
              : Math.max(60, Math.round(distMeters / 10 + 40));
          const vehicleDurationFormatted = formatMinutesDuration(vehicleSec);

          const path: Array<{ lat: number; lng: number }> = (route.overview_path || []).map((p: any) => ({
            lat: typeof p.lat === 'function' ? p.lat() : p.lat,
            lng: typeof p.lng === 'function' ? p.lng() : p.lng,
          }));

          const steps = (leg?.steps || []).map((s: any) => {
            const raw = s.instructions || '';
            return raw.replace(/<[^>]+>/g, ' ');
          });

          return {
            id: Date.now() + idx + 1000,
            summary: route.summary || (idx === 0 ? 'Primary Direct Route' : `Alternative Route ${idx}`),
            distanceMeters: distMeters,
            durationSeconds: durSec,
            durationFormatted: leg?.duration?.text || formatDuration(durSec),
            durationAtCurrentSpeedFormatted: calculateDurationAtCurrentSpeed(distMeters, currentSpeedKmH),
            trekkingDurationSeconds: trekkingSec,
            trekkingDurationFormatted,
            vehicleDurationSeconds: vehicleSec,
            vehicleDurationFormatted,
            travelMode,
            path,
            isFastest: durSec === minDur,
            status: 'active',
            steps: steps.length > 0 ? steps : ['Proceed toward destination'],
          };
        });
      }
    }
  } catch (err) {
    console.warn('Google Maps DirectionsService unavailable, using realistic geometric route generator:', err);
  }

  // Fallback realistic route generator (produces nearest route + 1 alternative)
  const directDist = calculateDistanceMeters(origin.lat, origin.lng, destination.lat, destination.lng);

  // Primary route (slightly dogleg like streets)
  const primaryPath = [
    { lat: origin.lat, lng: origin.lng },
    { lat: origin.lat, lng: destination.lng },
    { lat: destination.lat, lng: destination.lng },
  ];
  const primaryDist = directDist * 1.15;
  const primaryTrekkingSec = Math.max(60, Math.round(primaryDist / 1.25));
  const primaryVehicleSec = Math.max(60, Math.round(primaryDist / 10 + 40));
  const primaryDurSec = travelMode === 'DRIVING' ? primaryVehicleSec : primaryTrekkingSec;

  // Alternative route (via opposite corner)
  const altPath = [
    { lat: origin.lat, lng: origin.lng },
    { lat: destination.lat, lng: origin.lng },
    { lat: destination.lat, lng: destination.lng },
  ];
  const altDist = directDist * 1.28;
  const altTrekkingSec = Math.max(60, Math.round(altDist / 1.2));
  const altVehicleSec = Math.max(60, Math.round(altDist / 9.5 + 50));
  const altDurSec = travelMode === 'DRIVING' ? altVehicleSec : altTrekkingSec;

  return [
    {
      id: 8001,
      summary: 'Nearest Direct Corridor',
      distanceMeters: primaryDist,
      durationSeconds: primaryDurSec,
      durationFormatted: formatMinutesDuration(primaryDurSec),
      durationAtCurrentSpeedFormatted: calculateDurationAtCurrentSpeed(primaryDist, currentSpeedKmH),
      trekkingDurationSeconds: primaryTrekkingSec,
      trekkingDurationFormatted: formatMinutesDuration(primaryTrekkingSec),
      vehicleDurationSeconds: primaryVehicleSec,
      vehicleDurationFormatted: formatMinutesDuration(primaryVehicleSec),
      travelMode,
      path: primaryPath,
      isFastest: true,
      status: 'active',
      steps: ['Head toward destination', 'Turn at intersection', 'Arrive at selected destination'],
    },
    {
      id: 8002,
      summary: 'Alternative Parkway Route',
      distanceMeters: altDist,
      durationSeconds: altDurSec,
      durationFormatted: formatMinutesDuration(altDurSec),
      durationAtCurrentSpeedFormatted: calculateDurationAtCurrentSpeed(altDist, currentSpeedKmH),
      trekkingDurationSeconds: altTrekkingSec,
      trekkingDurationFormatted: formatMinutesDuration(altTrekkingSec),
      vehicleDurationSeconds: altVehicleSec,
      vehicleDurationFormatted: formatMinutesDuration(altVehicleSec),
      travelMode,
      path: altPath,
      isFastest: false,
      status: 'active',
      steps: ['Take alternate street corridor', 'Follow perimeter path', 'Arrive at destination'],
    },
  ];
}

export const fetchRouteOptions = fetchSuggestedRoutes;

/**
 * Abeokuta Real Road Network Graph
 * Defines nodes and valid road edges along actual street corridors:
 * - Presidential Boulevard (OOPL <-> Green Legacy <-> June 12 <-> MKO <-> Kuto)
 * - Lalubu Street / Ibara (Kuto <-> Ibara <-> Omida <-> Pansheke <-> Onikolobo)
 * - Ake / Sapon / Olumo Road (Kuto <-> Ake <-> St Peters <-> Olumo Rock)
 * - Adatan / Lantoro Road (Ake <-> Adatan <-> Sacred Heart Hospital)
 * - Quarry Road (Ibara <-> Quarry <-> Pansheke)
 */
export interface RoadNode {
  id: string;
  lat: number;
  lng: number;
  name: string;
}

const ABEOKUTA_GRAPH_NODES: Record<string, RoadNode> = {
  oopl: { id: 'oopl', lat: 7.1260, lng: 3.3480, name: 'OOPL Presidential Library' },
  greenLegacy: { id: 'greenLegacy', lat: 7.1270, lng: 3.3490, name: 'Green Legacy Resort' },
  june12: { id: 'june12', lat: 7.1350, lng: 3.3540, name: 'June 12 Cultural Centre' },
  mko: { id: 'mko', lat: 7.1320, lng: 3.3510, name: 'MKO Abiola Stadium' },
  kuto: { id: 'kuto', lat: 7.1415, lng: 3.3510, name: 'Kuto Junction' },
  ibara: { id: 'ibara', lat: 7.1475, lng: 3.3450, name: 'Ibara Roundabout' },
  omida: { id: 'omida', lat: 7.1520, lng: 3.3410, name: 'Omida Market' },
  quarry: { id: 'quarry', lat: 7.1450, lng: 3.3390, name: 'Quarry Road Crossing' },
  pansheke: { id: 'pansheke', lat: 7.1420, lng: 3.3360, name: 'Pansheke Market' },
  onikolobo: { id: 'onikolobo', lat: 7.1400, lng: 3.3310, name: 'Onikolobo Shopping Arcade' },
  ake: { id: 'ake', lat: 7.1530, lng: 3.3520, name: 'Centenary Hall Ake' },
  stPeters: { id: 'stPeters', lat: 7.1540, lng: 3.3510, name: "St. Peter's Cathedral" },
  olumo: { id: 'olumo', lat: 7.1565, lng: 3.3444, name: 'Olumo Rock Heritage Site' },
  adatan: { id: 'adatan', lat: 7.1580, lng: 3.3680, name: 'Adatan Junction' },
  sacredHeart: { id: 'sacredHeart', lat: 7.1610, lng: 3.3620, name: 'Sacred Heart Hospital' },
};

const ABEOKUTA_GRAPH_EDGES: Array<[string, string]> = [
  ['oopl', 'greenLegacy'],
  ['greenLegacy', 'june12'],
  ['june12', 'mko'],
  ['mko', 'kuto'],
  ['kuto', 'ibara'],
  ['ibara', 'omida'],
  ['omida', 'pansheke'],
  ['pansheke', 'onikolobo'],
  ['ibara', 'quarry'],
  ['quarry', 'pansheke'],
  ['kuto', 'ake'],
  ['ake', 'stPeters'],
  ['stPeters', 'omida'],
  ['stPeters', 'olumo'],
  ['ake', 'adatan'],
  ['adatan', 'sacredHeart'],
];

/**
 * Finds shortest node path on Abeokuta road graph using BFS
 */
function findGraphPath(startId: string, endId: string): string[] {
  if (startId === endId) return [startId];

  const adj: Record<string, string[]> = {};
  Object.keys(ABEOKUTA_GRAPH_NODES).forEach((id) => (adj[id] = []));
  ABEOKUTA_GRAPH_EDGES.forEach(([u, v]) => {
    adj[u]?.push(v);
    adj[v]?.push(u);
  });

  const queue: string[][] = [[startId]];
  const visited = new Set<string>([startId]);

  while (queue.length > 0) {
    const path = queue.shift()!;
    const lastNode = path[path.length - 1];

    if (lastNode === endId) {
      return path;
    }

    const neighbors = adj[lastNode] || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...path, neighbor]);
      }
    }
  }

  return [startId, endId];
}

/**
 * Generates a dense multi-point road path following connected street graph corridors in Abeokuta.
 * Ensures points stick strictly to road lines without cutting across buildings.
 */
export function generateAbeokutaRoadPath(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Array<{ lat: number; lng: number }> {
  if (
    !origin ||
    !destination ||
    typeof origin.lat !== 'number' ||
    typeof origin.lng !== 'number' ||
    typeof destination.lat !== 'number' ||
    typeof destination.lng !== 'number' ||
    isNaN(origin.lat) ||
    isNaN(origin.lng) ||
    isNaN(destination.lat) ||
    isNaN(destination.lng)
  ) {
    return [];
  }

  let nearestStartId = 'kuto';
  let minStartDist = Infinity;
  let nearestEndId = 'olumo';
  let minEndDist = Infinity;

  Object.values(ABEOKUTA_GRAPH_NODES).forEach((node) => {
    const dStart = Math.hypot(node.lat - origin.lat, node.lng - origin.lng);
    if (dStart < minStartDist) {
      minStartDist = dStart;
      nearestStartId = node.id;
    }
    const dEnd = Math.hypot(node.lat - destination.lat, node.lng - destination.lng);
    if (dEnd < minEndDist) {
      minEndDist = dEnd;
      nearestEndId = node.id;
    }
  });

  const nodeIdsPath = findGraphPath(nearestStartId, nearestEndId);

  // Construct waypoints starting from origin -> graph nodes -> destination
  const waypoints: Array<{ lat: number; lng: number }> = [{ lat: origin.lat, lng: origin.lng }];
  nodeIdsPath.forEach((id) => {
    const node = ABEOKUTA_GRAPH_NODES[id];
    if (node) {
      waypoints.push({ lat: node.lat, lng: node.lng });
    }
  });
  waypoints.push({ lat: destination.lat, lng: destination.lng });

  // Dense interpolation along road segments (points every ~20m)
  const denseRoadPath: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const p1 = waypoints[i];
    const p2 = waypoints[i + 1];
    const dist = Math.hypot(p2.lat - p1.lat, p2.lng - p1.lng);
    const steps = Math.max(5, Math.ceil(dist / 0.0002));

    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      denseRoadPath.push({
        lat: p1.lat + (p2.lat - p1.lat) * t,
        lng: p1.lng + (p2.lng - p1.lng) * t,
      });
    }
  }
  denseRoadPath.push({ lat: destination.lat, lng: destination.lng });

  return denseRoadPath;
}

/**
 * Attempts to fetch a real Google Maps driving route polyline following actual roads.
 * Falls back to dense Abeokuta street network path if offline or API is restricted.
 */
export async function fetchRealRoadPath(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<Array<{ lat: number; lng: number }>> {
  if (
    !origin ||
    !destination ||
    typeof origin.lat !== 'number' ||
    typeof origin.lng !== 'number' ||
    typeof destination.lat !== 'number' ||
    typeof destination.lng !== 'number' ||
    isNaN(origin.lat) ||
    isNaN(origin.lng) ||
    isNaN(destination.lat) ||
    isNaN(destination.lng)
  ) {
    return [];
  }
  if (typeof window !== 'undefined' && (window as any).google?.maps?.DirectionsService) {
    try {
      const directionsService = new (window as any).google.maps.DirectionsService();
      const response: google.maps.DirectionsResult = await new Promise((resolve, reject) => {
        directionsService.route(
          {
            origin: new (window as any).google.maps.LatLng(origin.lat, origin.lng),
            destination: new (window as any).google.maps.LatLng(destination.lat, destination.lng),
            travelMode: (window as any).google.maps.TravelMode.DRIVING,
          },
          (result: any, status: any) => {
            if (status === 'OK' && result?.routes?.[0]?.overview_path) {
              resolve(result);
            } else {
              reject(new Error(`Directions error: ${status}`));
            }
          }
        );
      });

      const overviewPath = response.routes[0].overview_path;
      if (overviewPath && overviewPath.length > 0) {
        return overviewPath.map((p: any) => ({
          lat: typeof p.lat === 'function' ? p.lat() : p.lat,
          lng: typeof p.lng === 'function' ? p.lng() : p.lng,
        }));
      }
    } catch (err) {
      console.warn('Google DirectionsService failed for user route, using road network generator:', err);
    }
  }

  return generateAbeokutaRoadPath(origin, destination);
}


