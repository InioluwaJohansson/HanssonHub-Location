import { AppUser, CompletedRouteLog, CustomMarker, RecordedPlace } from '../types';
import { generateAbeokutaRoadPath } from './routing';


/**
 * 30 distinct high-visibility colors for up to 30 users
 */
export const PALETTE_30_COLORS: string[] = [
  '#3B82F6', // 1 Blue (Inioluwa - You)
  '#10B981', // 2 Emerald (Alex Vance)
  '#F59E0B', // 3 Amber (Sophia Chen)
  '#EC4899', // 4 Pink (Marcus Reed)
  '#8B5CF6', // 5 Purple (Elena Rostova)
  '#06B6D4', // 6 Cyan (Babatunde Egun)
  '#EF4444', // 7 Red (Chidimma Okafor)
  '#6366F1', // 8 Indigo (Amina Bello)
  '#14B8A6', // 9 Teal
  '#F97316', // 10 Orange
  '#84CC16', // 11 Lime
  '#F43F5E', // 12 Rose
  '#7C3AED', // 13 Violet
  '#0EA5E9', // 14 Sky
  '#D946EF', // 15 Fuchsia
  '#22C55E', // 16 Green
  '#EAB308', // 17 Yellow
  '#A855F7', // 18 Deep Purple
  '#64748B', // 19 Slate
  '#00D2FF', // 20 Electric Blue
  '#FF5252', // 21 Bright Coral
  '#FFB100', // 22 Bright Gold
  '#2ECC71', // 23 Neon Green
  '#9B59B6', // 24 Royal Purple
  '#1ABC9C', // 25 Turquoise
  '#E67E22', // 26 Dark Orange
  '#34495E', // 27 Midnight Blue
  '#FF4081', // 28 Neon Pink
  '#00E676', // 29 Emerald Neon
  '#651FFF', // 30 Deep Violet
];

// Abeokuta Landmarks & Coordinates
export const ABEOKUTA_LOCATIONS = {
  kutoCentral: { lat: 7.1475, lng: 3.3619, name: 'Kuto Junction, Abeokuta' },
  olumoRock: { lat: 7.1565, lng: 3.3444, name: 'Olumo Rock Heritage Site' },
  june12Cultural: { lat: 7.1350, lng: 3.3540, name: 'June 12 Cultural Centre, Kuto' },
  ooplLibrary: { lat: 7.1260, lng: 3.3480, name: 'Olusegun Obasanjo Presidential Library (OOPL)' },
  stPetersCathedral: { lat: 7.1540, lng: 3.3510, name: "St. Peter's Cathedral, Ake" },
  centenaryHall: { lat: 7.1530, lng: 3.3520, name: 'Centenary Hall, Ake' },
  panshekeMarket: { lat: 7.1420, lng: 3.3360, name: 'Pansheke Market & Plaza' },
  greenLegacyCafe: { lat: 7.1270, lng: 3.3490, name: 'Green Legacy Resort Cafe' },
  kutoPark: { lat: 7.1370, lng: 3.3570, name: 'Kuto Central Motor Park' },
  mkoStadium: { lat: 7.1320, lng: 3.3510, name: 'MKO Abiola Stadium, Kuto' },
  sacredHeart: { lat: 7.1610, lng: 3.3620, name: 'Sacred Heart Hospital, Lantoro' },
  adatanJunction: { lat: 7.1580, lng: 3.3680, name: 'Adatan Junction & Hub' },
  onikoloboPlaza: { lat: 7.1400, lng: 3.3310, name: 'Onikolobo Shopping Arcade' },
};

const NOW = Date.now();
const ONE_DAY = 86400000;

export function getInitialDemoUsers(): AppUser[] {
  const locList = Object.values(ABEOKUTA_LOCATIONS);
  // Shuffle locations randomly so every app load starts users at different known points
  const shuffled = [...locList].sort(() => Math.random() - 0.5);

  const demoUserProfiles = [
    {
      id: 1,
      name: 'Inioluwa (You)',
      isCurrentUser: true,
      color: PALETTE_30_COLORS[0],
      avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 2,
      name: 'Alex Vance',
      isCurrentUser: false,
      color: PALETTE_30_COLORS[1],
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 3,
      name: 'Sophia Chen',
      isCurrentUser: false,
      color: PALETTE_30_COLORS[2],
      avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 4,
      name: 'Marcus Reed',
      isCurrentUser: false,
      color: PALETTE_30_COLORS[3],
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 5,
      name: 'Elena Rostova',
      isCurrentUser: false,
      color: PALETTE_30_COLORS[4],
      avatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 6,
      name: 'Babatunde Egun',
      isCurrentUser: false,
      color: PALETTE_30_COLORS[5],
      avatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 7,
      name: 'Chidimma Okafor',
      isCurrentUser: false,
      color: PALETTE_30_COLORS[6],
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    },
    {
      id: 8,
      name: 'Amina Bello',
      isCurrentUser: false,
      color: PALETTE_30_COLORS[7],
      avatar: '', // Intentionally empty so first letter in name is used
    },
  ];

  const now = Date.now();

  return demoUserProfiles.map((prof, idx) => {
    const startLoc = shuffled[idx % shuffled.length];
    const destIdx = (idx + 4) % shuffled.length;
    const destLoc = shuffled[destIdx] !== startLoc ? shuffled[destIdx] : shuffled[(destIdx + 1) % shuffled.length];

    const initialRoutePath = generateAbeokutaRoadPath(
      { lat: startLoc.lat, lng: startLoc.lng },
      { lat: destLoc.lat, lng: destLoc.lng }
    );

    const userMode: 'walking' | 'vehicle' | 'airplane' =
      idx === 2 ? 'walking' : idx === 4 ? 'airplane' : 'vehicle';
    const userSpeed =
      userMode === 'walking' ? 4.8 : userMode === 'airplane' ? 520.0 : 28.0 + (idx % 5) * 4.5;

    return {
      id: prof.id,
      name: prof.name,
      avatar: prof.avatar,
      color: prof.color,
      isCurrentUser: prof.isCurrentUser,
      currentPoint: {
        id: 1000 + prof.id,
        userId: prof.id,
        journeyId: 5000 + prof.id,
        routeId: 6000 + prof.id,
        lat: startLoc.lat,
        lng: startLoc.lng,
        accuracy: 8,
        speed: userSpeed,
        speedMps: userSpeed / 3.6,
        timestamp: now,
        timeString: new Date().toLocaleTimeString(),
      },
      isTracking: true,
      isStationary: false,
      stationaryStartTime: null,
      dwellDurationSeconds: 0,
      originName: startLoc.name,
      originCoords: { lat: startLoc.lat, lng: startLoc.lng },
      activeDestinationName: destLoc.name,
      activeDestinationCoords: { lat: destLoc.lat, lng: destLoc.lng },
      activeRoutePath: initialRoutePath,
      isNavigating: true,
      navigationStartTime: now - 60000 * (idx + 1),
      speedKmH: userSpeed,
      mode: userMode,
    };
  });
}

export const INITIAL_DEMO_USERS: AppUser[] = getInitialDemoUsers();

export const INITIAL_DEMO_MARKERS: CustomMarker[] = [
  {
    id: 101,
    userId: 1,
    userName: 'Inioluwa (You)',
    userColor: PALETTE_30_COLORS[0],
    lat: ABEOKUTA_LOCATIONS.olumoRock.lat,
    lng: ABEOKUTA_LOCATIONS.olumoRock.lng,
    name: 'Olumo Rock Heritage Site',
    description: 'Ancient tourist landmark & mountain view in Abeokuta',
    category: 'landmark',
    createdAt: NOW - 3600000, // 1 hr ago
  },
  {
    id: 102,
    userId: 2,
    userName: 'Alex Vance',
    userColor: PALETTE_30_COLORS[1],
    lat: ABEOKUTA_LOCATIONS.centenaryHall.lat,
    lng: ABEOKUTA_LOCATIONS.centenaryHall.lng,
    name: 'Centenary Hall, Ake',
    description: 'Historical monument built in 1930',
    category: 'landmark',
    createdAt: NOW - ONE_DAY * 2, // 2 days ago (1w)
  },
  {
    id: 103,
    userId: 3,
    userName: 'Sophia Chen',
    userColor: PALETTE_30_COLORS[2],
    lat: ABEOKUTA_LOCATIONS.june12Cultural.lat,
    lng: ABEOKUTA_LOCATIONS.june12Cultural.lng,
    name: 'June 12 Cultural Centre',
    description: 'Stay point recorded (90s dwell) in Kuto',
    category: 'landmark',
    createdAt: NOW - ONE_DAY * 4, // 4 days ago (1w)
    isFromStayPoint: true,
  },
  {
    id: 104,
    userId: 4,
    userName: 'Marcus Reed',
    userColor: PALETTE_30_COLORS[3],
    lat: ABEOKUTA_LOCATIONS.panshekeMarket.lat,
    lng: ABEOKUTA_LOCATIONS.panshekeMarket.lng,
    name: 'Pansheke Market Plaza',
    description: 'Bustling commercial market center',
    category: 'store',
    createdAt: NOW - ONE_DAY * 9, // 9 days ago (2w)
  },
  {
    id: 105,
    userId: 5,
    userName: 'Elena Rostova',
    userColor: PALETTE_30_COLORS[4],
    lat: ABEOKUTA_LOCATIONS.stPetersCathedral.lat,
    lng: ABEOKUTA_LOCATIONS.stPetersCathedral.lng,
    name: "St. Peter's Cathedral, Ake",
    description: 'First church built in Nigeria (1846)',
    category: 'landmark',
    createdAt: NOW - ONE_DAY * 18, // 18 days ago (1m)
  },
  {
    id: 106,
    userId: 6,
    userName: 'Babatunde Egun',
    userColor: PALETTE_30_COLORS[5],
    lat: ABEOKUTA_LOCATIONS.greenLegacyCafe.lat,
    lng: ABEOKUTA_LOCATIONS.greenLegacyCafe.lng,
    name: 'Green Legacy Resort Cafe',
    description: 'Relaxing cafe & dining spot at OOPL',
    category: 'cafe',
    createdAt: NOW - ONE_DAY * 45, // 45 days ago (3m)
  },
  {
    id: 107,
    userId: 7,
    userName: 'Chidimma Okafor',
    userColor: PALETTE_30_COLORS[6],
    lat: ABEOKUTA_LOCATIONS.adatanJunction.lat,
    lng: ABEOKUTA_LOCATIONS.adatanJunction.lng,
    name: 'Adatan Commercial Hub',
    description: 'Major transit & commerce hub',
    category: 'work',
    createdAt: NOW - ONE_DAY * 85, // 85 days ago (3m)
  },
  {
    id: 108,
    userId: 8,
    userName: 'Amina Bello',
    userColor: PALETTE_30_COLORS[7],
    lat: ABEOKUTA_LOCATIONS.onikoloboPlaza.lat,
    lng: ABEOKUTA_LOCATIONS.onikoloboPlaza.lng,
    name: 'Onikolobo Shopping Arcade',
    description: 'Boutique stores & fashion complex',
    category: 'store',
    createdAt: NOW - ONE_DAY * 140, // 140 days ago (6m)
  },
];

export const INITIAL_RECORDED_PLACES: RecordedPlace[] = [
  {
    id: 201,
    userId: 3,
    userName: 'Sophia Chen',
    userColor: PALETTE_30_COLORS[2],
    lat: ABEOKUTA_LOCATIONS.june12Cultural.lat,
    lng: ABEOKUTA_LOCATIONS.june12Cultural.lng,
    accuracy: 10,
    name: 'June 12 Cultural Centre Dwell',
    address: 'Kuto Road, Abeokuta, Ogun State',
    category: 'spot',
    arrivedAt: NOW - 95000,
    dwellDurationSeconds: 95,
    isCurrentStationary: true,
    notes: 'Stationary place created after 90s stay duration',
  },
];

export const INITIAL_COMPLETED_ROUTES: CompletedRouteLog[] = [
  {
    id: 301,
    userId: 1,
    userName: 'Inioluwa (You)',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    userColor: PALETTE_30_COLORS[0],
    destinationName: 'Kuto Central Motor Park',
    destinationCoords: { lat: ABEOKUTA_LOCATIONS.kutoPark.lat, lng: ABEOKUTA_LOCATIONS.kutoPark.lng },
    startTime: NOW - ONE_DAY * 1 - 3600000,
    endTime: NOW - ONE_DAY * 1 - 3000000,
    durationSeconds: 600,
    durationFormatted: '10 min 00 sec',
    distanceMeters: 2800,
    averageSpeedKmH: 16.8,
    travelMode: 'DRIVING',
    status: 'completed',
    completedAtTimeString: new Date(NOW - ONE_DAY * 1 - 3000000).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  },
  {
    id: 302,
    userId: 2,
    userName: 'Alex Vance',
    userAvatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=120&auto=format&fit=crop&q=80',
    userColor: PALETTE_30_COLORS[1],
    destinationName: 'Olusegun Obasanjo Presidential Library',
    destinationCoords: { lat: ABEOKUTA_LOCATIONS.ooplLibrary.lat, lng: ABEOKUTA_LOCATIONS.ooplLibrary.lng },
    startTime: NOW - ONE_DAY * 3 - 7200000,
    endTime: NOW - ONE_DAY * 3 - 6300000,
    durationSeconds: 900,
    durationFormatted: '15 min 00 sec',
    distanceMeters: 4200,
    averageSpeedKmH: 16.8,
    travelMode: 'DRIVING',
    status: 'completed',
    completedAtTimeString: new Date(NOW - ONE_DAY * 3 - 6300000).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  },
  {
    id: 303,
    userId: 3,
    userName: 'Sophia Chen',
    userAvatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=120&auto=format&fit=crop&q=80',
    userColor: PALETTE_30_COLORS[2],
    destinationName: 'Centenary Hall, Ake',
    destinationCoords: { lat: ABEOKUTA_LOCATIONS.centenaryHall.lat, lng: ABEOKUTA_LOCATIONS.centenaryHall.lng },
    startTime: NOW - ONE_DAY * 5 - 4000000,
    endTime: NOW - ONE_DAY * 5 - 3200000,
    durationSeconds: 800,
    durationFormatted: '13 min 20 sec',
    distanceMeters: 3100,
    averageSpeedKmH: 13.95,
    travelMode: 'WALKING',
    status: 'completed',
    completedAtTimeString: new Date(NOW - ONE_DAY * 5 - 3200000).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  },
  {
    id: 304,
    userId: 4,
    userName: 'Marcus Reed',
    userAvatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=120&auto=format&fit=crop&q=80',
    userColor: PALETTE_30_COLORS[3],
    destinationName: 'MKO Abiola Stadium, Kuto',
    destinationCoords: { lat: ABEOKUTA_LOCATIONS.mkoStadium.lat, lng: ABEOKUTA_LOCATIONS.mkoStadium.lng },
    startTime: NOW - ONE_DAY * 11 - 5000000,
    endTime: NOW - ONE_DAY * 11 - 4100000,
    durationSeconds: 900,
    durationFormatted: '15 min 00 sec',
    distanceMeters: 5500,
    averageSpeedKmH: 22.0,
    travelMode: 'DRIVING',
    status: 'completed',
    completedAtTimeString: new Date(NOW - ONE_DAY * 11 - 4100000).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  },
  {
    id: 305,
    userId: 5,
    userName: 'Elena Rostova',
    userAvatar: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=120&auto=format&fit=crop&q=80',
    userColor: PALETTE_30_COLORS[4],
    destinationName: 'Sacred Heart Hospital, Lantoro',
    destinationCoords: { lat: ABEOKUTA_LOCATIONS.sacredHeart.lat, lng: ABEOKUTA_LOCATIONS.sacredHeart.lng },
    startTime: NOW - ONE_DAY * 22 - 2000000,
    endTime: NOW - ONE_DAY * 22 - 1200000,
    durationSeconds: 800,
    durationFormatted: '13 min 20 sec',
    distanceMeters: 3800,
    averageSpeedKmH: 17.1,
    travelMode: 'DRIVING',
    status: 'completed',
    completedAtTimeString: new Date(NOW - ONE_DAY * 22 - 1200000).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  },
  {
    id: 306,
    userId: 6,
    userName: 'Babatunde Egun',
    userAvatar: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=120&auto=format&fit=crop&q=80',
    userColor: PALETTE_30_COLORS[5],
    destinationName: 'Pansheke Market & Plaza',
    destinationCoords: { lat: ABEOKUTA_LOCATIONS.panshekeMarket.lat, lng: ABEOKUTA_LOCATIONS.panshekeMarket.lng },
    startTime: NOW - ONE_DAY * 50 - 3000000,
    endTime: NOW - ONE_DAY * 50 - 2200000,
    durationSeconds: 800,
    durationFormatted: '13 min 20 sec',
    distanceMeters: 4600,
    averageSpeedKmH: 20.7,
    travelMode: 'DRIVING',
    status: 'completed',
    completedAtTimeString: new Date(NOW - ONE_DAY * 50 - 2200000).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  },
  {
    id: 307,
    userId: 7,
    userName: 'Chidimma Okafor',
    userAvatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=120&auto=format&fit=crop&q=80',
    userColor: PALETTE_30_COLORS[6],
    destinationName: 'June 12 Cultural Centre, Kuto',
    destinationCoords: { lat: ABEOKUTA_LOCATIONS.june12Cultural.lat, lng: ABEOKUTA_LOCATIONS.june12Cultural.lng },
    startTime: NOW - ONE_DAY * 110 - 4500000,
    endTime: NOW - ONE_DAY * 110 - 3600000,
    durationSeconds: 900,
    durationFormatted: '15 min 00 sec',
    distanceMeters: 5100,
    averageSpeedKmH: 20.4,
    travelMode: 'DRIVING',
    status: 'cancelled',
    completedAtTimeString: new Date(NOW - ONE_DAY * 110 - 3600000).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  },
  {
    id: 308,
    userId: 1,
    userName: 'Inioluwa (You)',
    userAvatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=120&auto=format&fit=crop&q=80',
    userColor: PALETTE_30_COLORS[0],
    destinationName: 'Olumo Rock Heritage Site',
    destinationCoords: { lat: ABEOKUTA_LOCATIONS.olumoRock.lat, lng: ABEOKUTA_LOCATIONS.olumoRock.lng },
    startTime: NOW - ONE_DAY * 2 - 5400000,
    endTime: NOW - ONE_DAY * 2 - 5100000,
    durationSeconds: 300,
    durationFormatted: '5 min 00 sec',
    distanceMeters: 1800,
    averageSpeedKmH: 21.6,
    travelMode: 'DRIVING',
    status: 'cancelled',
    completedAtTimeString: new Date(NOW - ONE_DAY * 2 - 5100000).toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  },
];
