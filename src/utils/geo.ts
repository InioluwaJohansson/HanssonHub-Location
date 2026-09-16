import { LocationPoint, JourneySegment, RecordedPlace } from '../types';

/**
 * Calculates Haversine distance in meters between two lat/lng pairs.
 */
export function calculateDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Speed threshold: Trekking (walking/running/hiking) is <= 15 km/h (4.17 m/s).
 * Anything above 15 km/h is classified as Moving Vehicle.
 */
export const TREKKING_SPEED_THRESHOLD_KMH = 15;

/**
 * Stationarity threshold in meters. If points are within this radius,
 * the user is considered stationary at this spot.
 */
export const STATIONARY_RADIUS_METERS = 28;

/**
 * Stationary duration threshold to record a place: 1 minute and a half (90 seconds).
 */
export const STAY_RECORD_THRESHOLD_SECONDS = 90;

export function classifyTravelMode(speedKmH: number): 'trekking' | 'vehicle' {
  return speedKmH > TREKKING_SPEED_THRESHOLD_KMH ? 'vehicle' : 'trekking';
}

export function formatSpeed(speedKmH: number): string {
  if (speedKmH <= 0.5) return '0.0 km/h';
  return `${speedKmH.toFixed(1)} km/h`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  if (mins === 0) {
    return `${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

export function formatMinutesDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  if (mins < 1) return '< 1 min';
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    return remMins > 0 ? `${hrs}h ${remMins}m` : `${hrs}h`;
  }
  return `${mins} min${mins > 1 ? 's' : ''}`;
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(2)} km`;
  }
  return `${Math.round(meters)} m`;
}

/**
 * Creates a circular user avatar SVG icon with the user's name below and user's distinct color.
 */
export function createUserAvatarIcon(
  userName = 'Inioluwa',
  userColor = '#3B82F6'
): {
  url: string;
  scaledSize: google.maps.Size;
  anchor: google.maps.Point;
} {
  const safeName = (userName || 'Inioluwa').trim();
  const initial = safeName.charAt(0).toUpperCase();
  const width = Math.max(80, safeName.length * 8 + 26);
  const height = 66;
  const cx = width / 2;

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="marker-shadow" x="-30%" y="-20%" width="160%" height="150%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.4"/>
      </filter>
    </defs>

    <!-- Outer Circular Avatar Ring in User Color -->
    <circle cx="${cx}" cy="18" r="16" fill="${userColor}" stroke="#ffffff" stroke-width="2.5" filter="url(#marker-shadow)"/>

    <!-- User Initial Text -->
    <text x="${cx}" y="23" fill="#ffffff" font-size="13" font-family="system-ui, -apple-system, sans-serif" font-weight="800" text-anchor="middle">${initial}</text>

    <!-- Online/Active GPS Beacon Ring -->
    <circle cx="${cx + 12}" cy="8" r="4.5" fill="#10b981" stroke="#ffffff" stroke-width="1.5"/>

    <!-- Pointer stem -->
    <polygon points="${cx - 4},34 ${cx + 4},34 ${cx},40" fill="${userColor}"/>

    <!-- User Name Pill Label -->
    <rect x="${cx - (width - 12) / 2}" y="40" width="${width - 12}" height="20" rx="10" fill="#18181b" stroke="${userColor}" stroke-width="1.8" filter="url(#marker-shadow)"/>
    <text x="${cx}" y="53.5" fill="#ffffff" font-size="10" font-family="system-ui, -apple-system, sans-serif" font-weight="700" text-anchor="middle" letter-spacing="0.2">${safeName}</text>
  </svg>
  `.trim();

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(width, height),
    anchor: new google.maps.Point(cx, 18),
  };
}

/**
 * Creates an icon for generic custom locations or recorded places with user color support
 */
export function createPlaceMarkerIcon(
  category: string = 'generic',
  isRecordedStay: boolean = false,
  userColor?: string
): {
  url: string;
  scaledSize: google.maps.Size;
  anchor: google.maps.Point;
} {
  const bg = userColor || (isRecordedStay ? '#7c3aed' : '#27272a'); // user color or soft purple/neutral
  const borderColor = '#ffffff';

  const iconChar =
    category === 'cafe'
      ? '☕'
      : category === 'work'
      ? '💼'
      : category === 'home'
      ? '🏠'
      : category === 'store'
      ? '🛒'
      : category === 'landmark'
      ? '⭐'
      : isRecordedStay
      ? '📍'
      : '📍';

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">
    <defs>
      <filter id="pin-shadow" x="-30%" y="-20%" width="160%" height="150%">
        <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000000" flood-opacity="0.35"/>
      </filter>
    </defs>
    <path d="M18 2 C9.16 2 2 9.16 2 18 C2 28.5 18 44 18 44 C18 44 34 28.5 34 18 C34 9.16 26.84 2 18 2 Z" fill="${bg}" stroke="${borderColor}" stroke-width="2" filter="url(#pin-shadow)"/>
    <circle cx="18" cy="18" r="8" fill="#ffffff"/>
    <text x="18" y="22" fill="${bg}" font-size="9" font-family="system-ui, sans-serif" font-weight="bold" text-anchor="middle">
      ${iconChar}
    </text>
  </svg>
  `.trim();

  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(36, 46),
    anchor: new google.maps.Point(18, 44),
  };
}

/**
 * Calculates duration in human text given distance in meters and current speed in km/h.
 */
export function calculateDurationAtCurrentSpeed(distanceMeters: number, currentSpeedKmH: number): string {
  if (currentSpeedKmH > 1.5) {
    const speedMps = currentSpeedKmH / 3.6;
    const seconds = Math.max(1, Math.round(distanceMeters / speedMps));
    return `At current speed (${currentSpeedKmH.toFixed(1)} km/h): ${formatDuration(seconds)}`;
  }

  // Stationary / idle fallback calculations
  const walkingSec = Math.round(distanceMeters / (4.8 / 3.6)); // 4.8 km/h standard walk
  const drivingSec = Math.round(distanceMeters / (32 / 3.6)); // 32 km/h city drive
  return `Stationary • Est. walking: ${formatDuration(walkingSec)} (driving: ${formatDuration(drivingSec)})`;
}


/**
 * Reverse geocode a lat/lng using Google Maps Geocoder API if available
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<{ name: string; address: string }> {
  try {
    if (typeof window !== 'undefined' && (window as any).google?.maps?.Geocoder) {
      const geocoder = new (window as any).google.maps.Geocoder();
      const response = await geocoder.geocode({
        location: { lat, lng },
      });
      if (response.results && response.results.length > 0) {
        const topResult = response.results[0];
        const formattedAddress = topResult.formatted_address;
        // Try to get a POI or establishment name
        const poiComponent = topResult.address_components.find(
          (c: any) =>
            c.types.includes('point_of_interest') ||
            c.types.includes('establishment') ||
            c.types.includes('premise')
        );
        const name = poiComponent?.long_name || topResult.address_components[0]?.long_name || 'Recorded Place';
        return { name, address: formattedAddress };
      }
    }
  } catch (err) {
    console.warn('Reverse geocoding error:', err);
  }

  return {
    name: `Location @ ${lat.toFixed(4)}, ${lng.toFixed(4)}`,
    address: `${lat.toFixed(5)}° N, ${lng.toFixed(5)}° W`,
  };
}

/**
 * Generates an initial realistic simulated trail starting at a center coordinate.
 * Demonstrates:
 * 1. Trekking segment (speed 4-6 km/h) -> Green dotted polyline
 * 2. 90-second stay at a Cafe/Park -> Triggers 1.5-minute place record
 * 3. Vehicle ride segment (speed 35-50 km/h) -> Blue solid polyline
 * 4. 90-second stay at Destination -> Triggers 2nd recorded place
 */
export function generateSampleJourney(centerLat = 37.7749, centerLng = -122.4194): {
  points: LocationPoint[];
  segments: JourneySegment[];
  places: RecordedPlace[];
} {
  const points: LocationPoint[] = [];
  const segments: JourneySegment[] = [];
  const places: RecordedPlace[] = [];
  const baseTime = Date.now() - 360000; // 6 mins ago

  // Step 1: Initial point (Origin)
  let curLat = centerLat;
  let curLng = centerLng;
  let curTime = baseTime;

  points.push({
    id: 'pt-0',
    lat: curLat,
    lng: curLng,
    accuracy: 8,
    speed: 0,
    speedMps: 0,
    timestamp: curTime,
    timeString: new Date(curTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  });

  // Step 2: Trekking from origin to Central Cafe (walking ~4.5 km/h, 5 points)
  const walkingOffsets = [
    { dLat: 0.0006, dLng: 0.0005, speed: 4.8 },
    { dLat: 0.0005, dLng: 0.0007, speed: 4.2 },
    { dLat: 0.0006, dLng: 0.0004, speed: 5.1 },
    { dLat: 0.0004, dLng: 0.0008, speed: 4.4 },
  ];

  walkingOffsets.forEach((offset, idx) => {
    const prev = points[points.length - 1];
    curLat += offset.dLat;
    curLng += offset.dLng;
    curTime += 20000; // 20s per step

    const newPt: LocationPoint = {
      id: `pt-trek-${idx}`,
      lat: curLat,
      lng: curLng,
      accuracy: 6,
      speed: offset.speed,
      speedMps: offset.speed / 3.6,
      timestamp: curTime,
      timeString: new Date(curTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    points.push(newPt);

    const dist = calculateDistanceMeters(prev.lat, prev.lng, newPt.lat, newPt.lng);
    segments.push({
      id: `seg-trek-${idx}`,
      startPoint: prev,
      endPoint: newPt,
      path: [
        { lat: prev.lat, lng: prev.lng },
        { lat: newPt.lat, lng: newPt.lng },
      ],
      distanceMeters: dist,
      durationSeconds: 20,
      averageSpeedKmH: offset.speed,
      mode: 'trekking',
      startTime: prev.timestamp,
      endTime: newPt.timestamp,
    });
  });

  // Step 3: Stationary at Cafe for 96 seconds (> 90 seconds threshold!)
  const cafeStart = curTime;
  const cafeLat = curLat;
  const cafeLng = curLng;

  // Add small micro-jitters (< 5 meters) simulating GPS jitter while sitting
  for (let j = 1; j <= 4; j++) {
    curTime += 24000; // 24s * 4 = 96 seconds
    const jitterLat = cafeLat + (Math.random() - 0.5) * 0.00004;
    const jitterLng = cafeLng + (Math.random() - 0.5) * 0.00004;
    points.push({
      id: `pt-cafe-${j}`,
      lat: jitterLat,
      lng: jitterLng,
      accuracy: 5,
      speed: 0.2,
      speedMps: 0.05,
      timestamp: curTime,
      timeString: new Date(curTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    });
  }

  // Recorded place #1 for >= 90s dwell
  places.push({
    id: 'place-cafe-1',
    lat: cafeLat,
    lng: cafeLng,
    accuracy: 5,
    name: 'Artisan Espresso Bar & Bakery',
    address: 'Corner of 4th & Market St',
    category: 'cafe',
    arrivedAt: cafeStart,
    departedAt: curTime,
    dwellDurationSeconds: 96,
    isCurrentStationary: false,
    notes: 'Stayed 1m 36s (Exceeded 90s requirement - Recorded automatically)',
  });

  // Step 4: Moving vehicle trip (car/rideshare, speeds 32 to 46 km/h)
  const vehicleOffsets = [
    { dLat: 0.0035, dLng: 0.0042, speed: 38.5, dur: 15 },
    { dLat: 0.0042, dLng: 0.0051, speed: 45.2, dur: 15 },
    { dLat: 0.0038, dLng: 0.0048, speed: 42.0, dur: 15 },
    { dLat: 0.0029, dLng: 0.0036, speed: 28.5, dur: 15 },
  ];

  vehicleOffsets.forEach((offset, idx) => {
    const prev = points[points.length - 1];
    curLat += offset.dLat;
    curLng += offset.dLng;
    curTime += offset.dur * 1000;

    const newPt: LocationPoint = {
      id: `pt-veh-${idx}`,
      lat: curLat,
      lng: curLng,
      accuracy: 7,
      speed: offset.speed,
      speedMps: offset.speed / 3.6,
      timestamp: curTime,
      timeString: new Date(curTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };
    points.push(newPt);

    const dist = calculateDistanceMeters(prev.lat, prev.lng, newPt.lat, newPt.lng);
    segments.push({
      id: `seg-veh-${idx}`,
      startPoint: prev,
      endPoint: newPt,
      path: [
        { lat: prev.lat, lng: prev.lng },
        { lat: newPt.lat, lng: newPt.lng },
      ],
      distanceMeters: dist,
      durationSeconds: offset.dur,
      averageSpeedKmH: offset.speed,
      mode: 'vehicle',
      startTime: prev.timestamp,
      endTime: newPt.timestamp,
    });
  });

  return { points, segments, places };
}
