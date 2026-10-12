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
  return [];
}

export const INITIAL_DEMO_USERS: AppUser[] = [];

export const INITIAL_DEMO_MARKERS: CustomMarker[] = [];

export const INITIAL_RECORDED_PLACES: RecordedPlace[] = [];

export const INITIAL_COMPLETED_ROUTES: CompletedRouteLog[] = [];
