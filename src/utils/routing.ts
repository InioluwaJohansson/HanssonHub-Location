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
            id: `route-${idx}-${Date.now()}`,
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
      id: 'fallback-fastest',
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
      steps: ['Head toward destination', 'Turn at intersection', 'Arrive at selected destination'],
    },
    {
      id: 'fallback-alternative',
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
      steps: ['Take alternate street corridor', 'Follow perimeter path', 'Arrive at destination'],
    },
  ];
}

export const fetchRouteOptions = fetchSuggestedRoutes;
