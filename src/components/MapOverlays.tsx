import React, { useEffect, useRef } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import {
  JourneySegment,
  RecordedPlace,
  LocationPoint,
  CustomMarker,
  RouteOption,
  AppTheme,
  AppUser,
} from '../types';
import { createUserAvatarIcon, createPlaceMarkerIcon, formatDistance } from '../utils/geo';

interface MapOverlaysProps {
  segments: JourneySegment[];
  currentPoint: LocationPoint | null;
  recordedPlaces: RecordedPlace[];
  customMarkers: CustomMarker[];
  routes: RouteOption[];
  selectedRouteId: string | null;
  selectedSegmentId: string | null;
  userName?: string;
  isNavigating?: boolean;
  theme?: AppTheme;
  allUsers?: AppUser[];
  selectedUserIdFilter?: string;
  onSelectPlace?: (place: RecordedPlace) => void;
  onSelectCustomMarker?: (marker: CustomMarker) => void;
  onSelectRoute?: (routeId: string) => void;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  onUserPannedMap?: () => void;
}

/**
 * Calculates a point along a path at a given fractional ratio (0 to 1).
 */
function getPointAlongPath(
  path: Array<{ lat: number; lng: number }>,
  ratio: number = 0.5
): { lat: number; lng: number } {
  if (!path || path.length === 0) return { lat: 0, lng: 0 };
  if (path.length === 1) return path[0];

  let totalDist = 0;
  const dists: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const dLat = curr.lat - prev.lat;
    const dLng = (curr.lng - prev.lng) * Math.cos(((prev.lat + curr.lat) * Math.PI) / 360);
    const d = Math.sqrt(dLat * dLat + dLng * dLng);
    totalDist += d;
    dists.push(totalDist);
  }

  if (totalDist === 0) return path[0];

  const targetDist = totalDist * ratio;
  for (let i = 1; i < path.length; i++) {
    if (dists[i] >= targetDist) {
      const segDist = dists[i] - dists[i - 1];
      const frac = segDist > 0 ? (targetDist - dists[i - 1]) / segDist : 0;
      return {
        lat: path[i - 1].lat + (path[i].lat - path[i - 1].lat) * frac,
        lng: path[i - 1].lng + (path[i].lng - path[i - 1].lng) * frac,
      };
    }
  }
  return path[Math.floor(path.length / 2)];
}

/**
 * Creates a custom Google Maps OverlayView for placing a DOM element next to a route.
 */
function createRouteOverlay(
  position: { lat: number; lng: number },
  element: HTMLElement
): google.maps.OverlayView {
  class CustomRouteOverlay extends google.maps.OverlayView {
    private pos: { lat: number; lng: number };
    private el: HTMLElement;

    constructor(pos: { lat: number; lng: number }, el: HTMLElement) {
      super();
      this.pos = pos;
      this.el = el;
    }

    onAdd() {
      const panes = this.getPanes();
      if (panes) {
        panes.overlayMouseTarget.appendChild(this.el);
      }
    }

    draw() {
      const projection = this.getProjection();
      if (!projection) return;
      const point = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(this.pos.lat, this.pos.lng)
      );
      if (point) {
        this.el.style.position = 'absolute';
        this.el.style.left = `${point.x}px`;
        this.el.style.top = `${point.y - 12}px`;
        this.el.style.transform = 'translate(-50%, -100%)';
        this.el.style.pointerEvents = 'auto';
        this.el.style.zIndex = '60';
      }
    }

    onRemove() {
      if (this.el.parentNode) {
        this.el.parentNode.removeChild(this.el);
      }
    }
  }

  return new CustomRouteOverlay(position, element);
}

export const MapOverlays: React.FC<MapOverlaysProps> = ({
  segments,
  currentPoint,
  recordedPlaces,
  customMarkers,
  routes,
  selectedRouteId,
  selectedSegmentId,
  userName = 'Inioluwa',
  isNavigating = false,
  theme = 'light',
  allUsers,
  selectedUserIdFilter,
  onSelectPlace,
  onSelectCustomMarker,
  onSelectRoute,
  onMapClick,
  onUserPannedMap,
}) => {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);
  const routePolylinesRef = useRef<google.maps.Polyline[]>([]);
  const routeBadgeOverlaysRef = useRef<google.maps.OverlayView[]>([]);
  const placeMarkersRef = useRef<google.maps.Marker[]>([]);
  const customMarkersRef = useRef<google.maps.Marker[]>([]);
  const currentMarkerRef = useRef<google.maps.Marker | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);

  const isDark = theme === 'dark';

  // Attach map dragstart and click listeners
  useEffect(() => {
    if (!map) return;

    const dragListener = map.addListener('dragstart', () => {
      if (onUserPannedMap) onUserPannedMap();
    });

    const clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng && onMapClick) {
        onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }
    });

    return () => {
      google.maps.event.removeListener(dragListener);
      google.maps.event.removeListener(clickListener);
    };
  }, [map, onUserPannedMap, onMapClick]);

  // Sync Polylines: Trekking (Green Dotted) and Vehicle (Blue Dotted)
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    // Clear existing polylines
    polylinesRef.current.forEach((line) => line.setMap(null));
    polylinesRef.current = [];

    segments.forEach((seg) => {
      const isSelected = seg.id === selectedSegmentId;

      if (seg.mode === 'trekking') {
        // Green dotted lines for Trekking
        const polyline = new google.maps.Polyline({
          path: seg.path,
          strokeOpacity: 0,
          icons: [
            {
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillOpacity: 1,
                scale: isSelected ? 4.5 : 3.2,
                fillColor: isSelected ? '#059669' : '#10B981',
                strokeColor: '#047857',
                strokeWeight: 1,
              },
              offset: '0',
              repeat: '12px',
            },
          ],
          map: map,
          zIndex: isSelected ? 30 : 10,
        });
        polylinesRef.current.push(polyline);
      } else {
        // Dotted Blue lines for Moving Vehicle
        const polyline = new google.maps.Polyline({
          path: seg.path,
          strokeOpacity: 0,
          icons: [
            {
              icon: {
                path: google.maps.SymbolPath.CIRCLE,
                fillOpacity: 1,
                scale: isSelected ? 4.5 : 3.2,
                fillColor: isSelected ? '#1D4ED8' : '#2563EB',
                strokeColor: '#1E40AF',
                strokeWeight: 1,
              },
              offset: '0',
              repeat: '12px',
            },
          ],
          map: map,
          zIndex: isSelected ? 30 : 15,
        });
        polylinesRef.current.push(polyline);
      }
    });

    return () => {
      polylinesRef.current.forEach((line) => line.setMap(null));
      polylinesRef.current = [];
    };
  }, [map, segments, selectedSegmentId]);

  // Sync Route options & Small Modals next to each route:
  // Routes must be blue when proceeding to a marker / taking a route, and alternative routes light blue.
  // Before starting, each route shows only distance and time in a small modal next to the route.
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    // Clear previous polylines & badge overlays
    routePolylinesRef.current.forEach((l) => l.setMap(null));
    routePolylinesRef.current = [];
    routeBadgeOverlaysRef.current.forEach((o) => o.setMap(null));
    routeBadgeOverlaysRef.current = [];

    if (routes.length === 0) return;

    routes.forEach((route, idx) => {
      const isSelected = selectedRouteId ? route.id === selectedRouteId : route.isFastest;

      // Active/proceeding route gets a subtle deep blue underlay halo for contrast
      if (isSelected) {
        const halo = new google.maps.Polyline({
          path: route.path,
          strokeColor: '#1E3A8A',
          strokeOpacity: 0.35,
          strokeWeight: 10,
          map: map,
          zIndex: 44,
        });
        routePolylinesRef.current.push(halo);
      }

      // Route polyline: BLUE (#2563EB) when proceeding or taking route, LIGHT BLUE (#93C5FD) for alternatives
      const polyline = new google.maps.Polyline({
        path: route.path,
        strokeColor: isSelected ? '#2563EB' : '#93C5FD',
        strokeOpacity: isSelected ? 1.0 : 0.85,
        strokeWeight: isSelected ? 6 : 4.5,
        map: map,
        zIndex: isSelected ? 48 : 38,
      });

      if (onSelectRoute) {
        polyline.addListener('click', () => {
          onSelectRoute(route.id);
        });
      }

      routePolylinesRef.current.push(polyline);

      // Before start button is clicked: Show only distance and time in a small modal next to the route
      if (!isNavigating) {
        // Compute position along this route's path to place the small modal next to the route
        const ratio = routes.length > 1 ? (idx === 0 ? 0.45 : 0.58) : 0.5;
        const anchorPos = getPointAlongPath(route.path, ratio);

        const modalEl = document.createElement('div');
        modalEl.className = 'route-small-modal cursor-pointer select-none transition-all active:scale-95';
        modalEl.style.cssText = `
          background: ${isSelected ? (isDark ? '#18181b' : '#ffffff') : (isDark ? '#27272a' : '#f8fafc')};
          color: ${isSelected ? (isDark ? '#ffffff' : '#0f172a') : (isDark ? '#e4e4e7' : '#334155')};
          border: ${isSelected ? '2.5px solid #2563eb' : '1.5px solid #93c5fd'};
          box-shadow: ${isSelected ? '0 6px 18px rgba(37, 99, 235, 0.45)' : '0 2px 10px rgba(0, 0, 0, 0.15)'};
          border-radius: 12px;
          padding: 6px 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          white-space: nowrap;
          position: relative;
        `;

        // Small modal displays ONLY distance and time (including walking/vehicle breakdown)
        modalEl.innerHTML = `
          <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700;">
            <span style="color: ${isSelected ? '#2563eb' : 'inherit'}; font-weight: 800;">${formatDistance(route.distanceMeters)}</span>
            <span style="opacity: 0.35;">•</span>
            <span>${route.durationFormatted}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 5px; font-size: 10px; font-family: ui-monospace, monospace; margin-top: 1px;">
            <span style="color: #059669; display: inline-flex; align-items: center; gap: 2px;">
              <span>👣</span><span>${route.trekkingDurationFormatted}</span>
            </span>
            <span style="opacity: 0.25;">|</span>
            <span style="color: #2563eb; display: inline-flex; align-items: center; gap: 2px;">
              <span>🚗</span><span>${route.vehicleDurationFormatted}</span>
            </span>
          </div>
          <div style="
            position: absolute;
            bottom: -6px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 5px solid transparent;
            border-right: 5px solid transparent;
            border-top: 6px solid ${isSelected ? '#2563eb' : '#93c5fd'};
          "></div>
        `;

        modalEl.addEventListener('click', (e) => {
          e.stopPropagation();
          if (onSelectRoute) {
            onSelectRoute(route.id);
          }
        });

        const overlay = createRouteOverlay(anchorPos, modalEl);
        overlay.setMap(map);
        routeBadgeOverlaysRef.current.push(overlay);
      }
    });

    return () => {
      routePolylinesRef.current.forEach((l) => l.setMap(null));
      routePolylinesRef.current = [];
      routeBadgeOverlaysRef.current.forEach((o) => o.setMap(null));
      routeBadgeOverlaysRef.current = [];
    };
  }, [map, routes, selectedRouteId, isNavigating, isDark, onSelectRoute]);

  // Sync Recorded Places Markers (only locations where stationary dwell >= 90 seconds (1m 30s))
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    placeMarkersRef.current.forEach((m) => m.setMap(null));
    placeMarkersRef.current = [];

    // Strictly enforce: Do not show on the map until the 1m 30s has elapsed
    const visiblePlaces = recordedPlaces.filter((p) => p.dwellDurationSeconds >= 90);

    visiblePlaces.forEach((place) => {
      const iconData = createPlaceMarkerIcon(place.category || 'generic', true, place.userColor);
      const marker = new google.maps.Marker({
        position: { lat: place.lat, lng: place.lng },
        map: map,
        title: `${place.name || 'Recorded Place'} (${place.userName || userName})`,
        icon: {
          url: iconData.url,
          scaledSize: iconData.scaledSize,
          anchor: iconData.anchor,
        },
        zIndex: 25,
      });

      marker.addListener('click', () => {
        if (onSelectPlace) {
          onSelectPlace(place);
        }
      });

      placeMarkersRef.current.push(marker);
    });

    return () => {
      placeMarkersRef.current.forEach((m) => m.setMap(null));
      placeMarkersRef.current = [];
    };
  }, [map, recordedPlaces, userName, onSelectPlace]);

  // Sync Custom Markers added by users
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    customMarkersRef.current.forEach((m) => m.setMap(null));
    customMarkersRef.current = [];

    customMarkers.forEach((cm) => {
      const iconData = createPlaceMarkerIcon(cm.category, false, cm.userColor);
      const marker = new google.maps.Marker({
        position: { lat: cm.lat, lng: cm.lng },
        map: map,
        title: `${cm.name} (${cm.userName || userName})`,
        icon: {
          url: iconData.url,
          scaledSize: iconData.scaledSize,
          anchor: iconData.anchor,
        },
        zIndex: 28,
      });

      marker.addListener('click', () => {
        if (onSelectCustomMarker) {
          onSelectCustomMarker(cm);
        }
      });

      customMarkersRef.current.push(marker);
    });

    return () => {
      customMarkersRef.current.forEach((m) => m.setMap(null));
      customMarkersRef.current = [];
    };
  }, [map, customMarkers, userName, onSelectCustomMarker]);

  // Multi-User Markers: Render all active users on the map with their distinct colors and avatar icons
  const userMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());

  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    if (!allUsers || allUsers.length === 0) {
      // Fallback single-user rendering if allUsers is empty
      if (currentPoint) {
        const pos = { lat: currentPoint.lat, lng: currentPoint.lng };
        const avatarIcon = createUserAvatarIcon(userName, '#3B82F6');
        if (!currentMarkerRef.current) {
          currentMarkerRef.current = new google.maps.Marker({
            position: pos,
            map: map,
            title: `${userName}'s Location`,
            icon: { url: avatarIcon.url, scaledSize: avatarIcon.scaledSize, anchor: avatarIcon.anchor },
            zIndex: 50,
          });
        } else {
          currentMarkerRef.current.setPosition(pos);
        }
      }
      return;
    }

    // Clear single user marker if using multi-user map
    if (currentMarkerRef.current) {
      currentMarkerRef.current.setMap(null);
      currentMarkerRef.current = null;
    }

    const currentActiveIds = new Set<string>();
    const usersToRender =
      selectedUserIdFilter && selectedUserIdFilter !== 'all'
        ? allUsers.filter((u) => u.id === selectedUserIdFilter)
        : allUsers;

    usersToRender.forEach((user) => {
      currentActiveIds.add(user.id);
      const pos = { lat: user.currentPoint.lat, lng: user.currentPoint.lng };
      const avatarIcon = createUserAvatarIcon(user.name, user.color);

      let marker = userMarkersRef.current.get(user.id);
      if (!marker) {
        marker = new google.maps.Marker({
          position: pos,
          map: map,
          title: `${user.name} (${user.speedKmH.toFixed(1)} km/h)`,
          icon: {
            url: avatarIcon.url,
            scaledSize: avatarIcon.scaledSize,
            anchor: avatarIcon.anchor,
          },
          zIndex: user.isCurrentUser ? 60 : 40,
        });
        userMarkersRef.current.set(user.id, marker);
      } else {
        marker.setMap(map);
        marker.setPosition(pos);
        marker.setIcon({
          url: avatarIcon.url,
          scaledSize: avatarIcon.scaledSize,
          anchor: avatarIcon.anchor,
        });
        marker.setTitle(`${user.name} (${user.speedKmH.toFixed(1)} km/h)`);
      }
    });

    // Remove markers for users no longer rendered
    userMarkersRef.current.forEach((marker, userId) => {
      if (!currentActiveIds.has(userId)) {
        marker.setMap(null);
        userMarkersRef.current.delete(userId);
      }
    });
  }, [map, allUsers, selectedUserIdFilter, currentPoint, userName]);

  return null;
};

