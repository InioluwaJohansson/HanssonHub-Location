import { LocationPoint, JourneySegment, RecordedPlace } from '../types';

/**
 * Calculates Haversine distance in meters between two lat/lng pairs.
 */
export function calculateDistanceMeters(
  lat1?: number | null,
  lon1?: number | null,
  lat2?: number | null,
  lon2?: number | null
): number {
  if (
    lat1 == null ||
    lon1 == null ||
    lat2 == null ||
    lon2 == null ||
    isNaN(lat1) ||
    isNaN(lon1) ||
    isNaN(lat2) ||
    isNaN(lon2)
  ) {
    return 0;
  }
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
  const result = R * c;
  return isNaN(result) ? 0 : result;
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
 * Creates a circular user avatar SVG icon with the user's name below,
 * displaying their profile image if available or their first letter initial.
 */
export function createUserAvatarIcon(
  userName = 'Inioluwa',
  userColor = '#3B82F6',
  avatarUrl?: string
): {
  url: string;
  scaledSize: google.maps.Size;
  anchor: google.maps.Point;
} {
  const safeName = (userName || 'Inioluwa').trim();
  const initial = safeName.charAt(0).toUpperCase();
  const width = Math.max(82, safeName.length * 8 + 26);
  const height = 66;
  const cx = width / 2;
  const safeId = safeName.replace(/[^a-zA-Z0-9]/g, '_');

  const avatarContent = avatarUrl
    ? `<image href="${avatarUrl}" x="${cx - 16}" y="2" width="32" height="32" preserveAspectRatio="xMidYMid slice" clip-path="url(#avatar-clip-${safeId})"/>`
    : `<text x="${cx}" y="23" fill="#ffffff" font-size="13" font-family="system-ui, -apple-system, sans-serif" font-weight="800" text-anchor="middle">${initial}</text>`;

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <filter id="marker-shadow-${safeId}" x="-30%" y="-20%" width="160%" height="150%">
        <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="#000000" flood-opacity="0.45"/>
      </filter>
      <clipPath id="avatar-clip-${safeId}">
        <circle cx="${cx}" cy="18" r="16" />
      </clipPath>
    </defs>

    <!-- Outer Circular Avatar Ring in User Color -->
    <circle cx="${cx}" cy="18" r="16" fill="${userColor}" stroke="#ffffff" stroke-width="2.5" filter="url(#marker-shadow-${safeId})"/>

    <!-- User Profile Image or First Letter Initial Fallback -->
    ${avatarContent}

    <!-- Online/Active GPS Beacon Ring -->
    <circle cx="${cx + 12}" cy="8" r="4.5" fill="#10b981" stroke="#ffffff" stroke-width="1.5"/>

    <!-- Pointer stem -->
    <polygon points="${cx - 4},34 ${cx + 4},34 ${cx},40" fill="${userColor}"/>

    <!-- User Name Pill Label -->
    <rect x="${cx - (width - 12) / 2}" y="40" width="${width - 12}" height="20" rx="10" fill="#18181b" stroke="${userColor}" stroke-width="1.8" filter="url(#marker-shadow-${safeId})"/>
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

const avatarIconCache = new Map<string, { url: string; scaledSize: google.maps.Size; anchor: google.maps.Point }>();

export function getCachedUserAvatarIcon(
  userName = 'Inioluwa',
  userColor = '#3B82F6',
  avatarUrl?: string
) {
  const key = `${userName}_${userColor}_${avatarUrl || 'none'}`;
  if (!avatarIconCache.has(key)) {
    const icon = createUserAvatarIcon(userName, userColor, avatarUrl);
    avatarIconCache.set(key, icon);

    // If there's an image URL, preload with offscreen canvas to guarantee perfect rendering across all browsers
    if (avatarUrl && typeof window !== 'undefined') {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const safeName = (userName || 'Inioluwa').trim();
          const width = Math.max(82, safeName.length * 8 + 26);
          const height = 66;
          const cx = width / 2;
          const canvas = document.createElement('canvas');
          const dpr = 2;
          canvas.width = width * dpr;
          canvas.height = height * dpr;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          ctx.scale(dpr, dpr);

          // Draw stem pointer
          ctx.beginPath();
          ctx.moveTo(cx - 4, 34);
          ctx.lineTo(cx + 4, 34);
          ctx.lineTo(cx, 40);
          ctx.fillStyle = userColor;
          ctx.fill();

          // Draw outer ring
          ctx.beginPath();
          ctx.arc(cx, 18, 17, 0, Math.PI * 2);
          ctx.fillStyle = userColor;
          ctx.fill();

          // Clip inner circle for avatar image
          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, 18, 15, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(img, cx - 15, 3, 30, 30);
          ctx.restore();

          // White border
          ctx.beginPath();
          ctx.arc(cx, 18, 15, 0, Math.PI * 2);
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          // Online green dot
          ctx.beginPath();
          ctx.arc(cx + 12, 8, 4.5, 0, Math.PI * 2);
          ctx.fillStyle = '#10b981';
          ctx.fill();
          ctx.lineWidth = 1.5;
          ctx.strokeStyle = '#ffffff';
          ctx.stroke();

          // Name pill
          const pillW = width - 12;
          const pillH = 20;
          const pillX = cx - pillW / 2;
          const pillY = 40;
          const r = 10;
          ctx.beginPath();
          ctx.moveTo(pillX + r, pillY);
          ctx.arcTo(pillX + pillW, pillY, pillX + pillW, pillY + pillH, r);
          ctx.arcTo(pillX + pillW, pillY + pillH, pillX, pillY + pillH, r);
          ctx.arcTo(pillX, pillY + pillH, pillX, pillY, r);
          ctx.arcTo(pillX, pillY, pillX + pillW, pillY, r);
          ctx.closePath();
          ctx.fillStyle = '#18181b';
          ctx.fill();
          ctx.lineWidth = 1.8;
          ctx.strokeStyle = userColor;
          ctx.stroke();

          // Text
          ctx.fillStyle = '#ffffff';
          ctx.font = '700 10px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(safeName, cx, 50.5);

          const canvasUrl = canvas.toDataURL('image/png');
          avatarIconCache.set(key, {
            url: canvasUrl,
            scaledSize: new google.maps.Size(width, height),
            anchor: new google.maps.Point(cx, 18),
          });
        } catch (e) {
          // If tainted or error, retain SVG
        }
      };
      img.src = avatarUrl;
    }
  }
  return avatarIconCache.get(key)!;
}

const placeMarkerIconCache = new Map<string, { url: string; scaledSize: google.maps.Size; anchor: google.maps.Point }>();

export function getCachedPlaceMarkerIcon(category: string = 'generic', isRecordedStay: boolean = false, userColor?: string) {
  const key = `${category}_${isRecordedStay}_${userColor || ''}`;
  if (!placeMarkerIconCache.has(key)) {
    placeMarkerIconCache.set(key, createPlaceMarkerIcon(category, isRecordedStay, userColor));
  }
  return placeMarkerIconCache.get(key)!;
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
    name: 'Stationary Recorded Spot',
    address: 'Abeokuta, Ogun State',
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
    id: 1,
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
      id: 10 + idx,
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
      id: 100 + idx,
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
      id: 200 + j,
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
    id: 501,
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
      id: 300 + idx,
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
      id: 400 + idx,
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
