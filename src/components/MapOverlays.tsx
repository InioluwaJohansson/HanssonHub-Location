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
  ContentTypeFilter,
} from '../types';
import {
  createUserAvatarIcon,
  createPlaceMarkerIcon,
  getCachedUserAvatarIcon,
  getCachedPlaceMarkerIcon,
  calculateDistanceMeters,
  formatDistance,
} from '../utils/geo';
import { formatProfileImageUrl } from '../utils/auth';

interface MapOverlaysProps {
  segments: JourneySegment[];
  currentPoint: LocationPoint | null;
  recordedPlaces: RecordedPlace[];
  customMarkers: CustomMarker[];
  routes: RouteOption[];
  selectedRouteId: number | null;
  selectedSegmentId: number | null;
  userName?: string;
  userAvatarUrl?: string;
  isNavigating?: boolean;
  theme?: AppTheme;
  allUsers?: AppUser[];
  selectedUserIdFilter?: number | 'all';
  contentTypeFilter?: ContentTypeFilter;
  onRequestRoute?: (dest: { lat: number; lng: number }, destName?: string) => void;
  onSelectUser?: (userId: number) => void;
  onSelectPlace?: (place: RecordedPlace) => void;
  onSelectCustomMarker?: (marker: CustomMarker) => void;
  onSelectRoute?: (routeId: number) => void;
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
  userAvatarUrl,
  isNavigating = false,
  theme = 'light',
  allUsers,
  selectedUserIdFilter,
  contentTypeFilter = 'all',
  onRequestRoute,
  onSelectUser,
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

    if (contentTypeFilter === 'markers') return;

    segments.forEach((seg) => {
      const isSelected = seg.id === selectedSegmentId;

      if (seg.mode === 'walking') {
        // Green dotted lines for Walking
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
      } else if (seg.mode === 'airplane') {
        // Purple dotted lines for Airplane flight corridor
        const polyline = new google.maps.Polyline({
          path: seg.path,
          strokeOpacity: 0,
          icons: [
            {
              icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                fillOpacity: 1,
                scale: isSelected ? 4.8 : 3.6,
                fillColor: isSelected ? '#7C3AED' : '#8B5CF6',
                strokeColor: '#5B21B6',
                strokeWeight: 1,
              },
              offset: '0',
              repeat: '18px',
            },
          ],
          map: map,
          zIndex: isSelected ? 40 : 20,
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
  }, [map, segments, selectedSegmentId, contentTypeFilter]);

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

    if (routes.length === 0 || contentTypeFilter === 'markers') return;

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
            <span style="color: #059669; display: inline-flex; align-items: center; gap: 2px;" title="Walking Duration">
              <span>👣</span><span>${route.walkingDurationFormatted || route.trekkingDurationFormatted || 'N/A'}</span>
            </span>
            <span style="opacity: 0.25;">|</span>
            <span style="color: #2563eb; display: inline-flex; align-items: center; gap: 2px;" title="Vehicle Duration">
              <span>🚗</span><span>${route.vehicleDurationFormatted}</span>
            </span>
            <span style="opacity: 0.25;">|</span>
            <span style="color: #8b5cf6; display: inline-flex; align-items: center; gap: 2px;" title="Airplane Duration">
              <span>✈️</span><span>${route.airplaneDurationFormatted || 'N/A'}</span>
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

  const placeMarkersMapRef = useRef<Map<number, google.maps.Marker>>(new Map());
  const customMarkerOverlaysMapRef = useRef<Map<number, CustomMarkerOverlay>>(new Map());

  // Sync Recorded Places Markers (anti-blinking in-place updates, shown at all times)
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    // Strictly enforce: Do not show on the map until the 1m 30s dwell duration has elapsed
    const visiblePlaces = recordedPlaces.filter((p) => p.dwellDurationSeconds >= 90);
    const activePlaceIds = new Set<number>();

    visiblePlaces.forEach((place) => {
      activePlaceIds.add(place.id);
      const iconData = getCachedPlaceMarkerIcon(place.category || 'generic', true, place.userColor);
      let marker = placeMarkersMapRef.current.get(place.id);

      if (!marker) {
        marker = new google.maps.Marker({
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

        placeMarkersMapRef.current.set(place.id, marker);
      } else {
        marker.setMap(map);
        const curPos = marker.getPosition();
        if (!curPos || curPos.lat() !== place.lat || curPos.lng() !== place.lng) {
          marker.setPosition({ lat: place.lat, lng: place.lng });
        }
      }
    });

    placeMarkersMapRef.current.forEach((marker, id) => {
      if (!activePlaceIds.has(id)) {
        marker.setMap(null);
        placeMarkersMapRef.current.delete(id);
      }
    });
  }, [map, recordedPlaces, userName, onSelectPlace]);

  // Sync Custom Markers added by users: DOM-based CustomMarkerOverlay
  // Shows name below the point on the map, and on hover displays name and category
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    const activeMarkerIds = new Set<number>();

    customMarkers.forEach((cm) => {
      activeMarkerIds.add(cm.id);
      let overlay = customMarkerOverlaysMapRef.current.get(cm.id);

      if (!overlay) {
        overlay = new CustomMarkerOverlay(
          cm,
          isDark,
          () => {
            if (onSelectCustomMarker) {
              onSelectCustomMarker(cm);
            }
          },
          onRequestRoute
        );
        overlay.setMap(map);
        customMarkerOverlaysMapRef.current.set(cm.id, overlay);
      } else {
        overlay.setMap(map);
        overlay.update(cm, isDark, onRequestRoute);
      }
    });

    customMarkerOverlaysMapRef.current.forEach((overlay, id) => {
      if (!activeMarkerIds.has(id)) {
        overlay.setMap(null);
        customMarkerOverlaysMapRef.current.delete(id);
      }
    });
  }, [map, customMarkers, userName, onSelectCustomMarker, onRequestRoute, isDark]);

/**
 * Custom Google Maps OverlayView for Custom Markers.
 * Shows the pin with selected color, displays the marker name below the point on the map,
 * and on hover shows the name, category, and a button to Route to Marker adhering to theme.
 */
class CustomMarkerOverlay extends google.maps.OverlayView {
  private pos: { lat: number; lng: number };
  private marker: CustomMarker;
  private isDark: boolean;
  private onClickHandler: () => void;
  private onRequestRoute?: (dest: { lat: number; lng: number }, destName?: string) => void;
  private containerEl: HTMLDivElement;
  private hoverCardEl: HTMLDivElement | null = null;
  private hideTimeout: any = null;

  constructor(
    marker: CustomMarker,
    isDark: boolean,
    onClick: () => void,
    onRequestRoute?: (dest: { lat: number; lng: number }, destName?: string) => void
  ) {
    super();
    this.marker = marker;
    this.pos = { lat: marker.lat, lng: marker.lng };
    this.isDark = isDark;
    this.onClickHandler = onClick;
    this.onRequestRoute = onRequestRoute;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'custom-marker-overlay-container';
    this.containerEl.style.position = 'absolute';
    this.containerEl.style.transform = 'translate(-50%, -100%)';
    this.containerEl.style.cursor = 'pointer';
    this.containerEl.style.zIndex = '35';
    this.containerEl.style.display = 'flex';
    this.containerEl.style.flexDirection = 'column';
    this.containerEl.style.alignItems = 'center';
    this.containerEl.style.pointerEvents = 'auto';
    this.containerEl.style.userSelect = 'none';

    this.renderContent();

    this.containerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClickHandler();
    });
  }

  private renderContent() {
    this.containerEl.innerHTML = '';
    const safeName = (this.marker.name || 'Marker').trim();
    const markerColor = this.marker.userColor || '#3B82F6';
    const category = (this.marker.category || 'generic').trim();

    // 1. Hover Card (Popover on hover above point showing Name, Category, and Route to marker button)
    const hoverCard = document.createElement('div');
    hoverCard.className = 'custom-marker-hover-card';
    hoverCard.style.position = 'absolute';
    hoverCard.style.bottom = 'calc(100% + 6px)';
    hoverCard.style.left = '50%';
    hoverCard.style.transform = 'translateX(-50%)';
    hoverCard.style.minWidth = '150px';
    hoverCard.style.padding = '9px 12px';
    hoverCard.style.borderRadius = '14px';
    hoverCard.style.backgroundColor = this.isDark ? '#18181b' : '#ffffff';
    hoverCard.style.color = this.isDark ? '#f4f4f5' : '#18181b';
    hoverCard.style.border = `1px solid ${this.isDark ? '#27272a' : '#e4e4e7'}`;
    hoverCard.style.boxShadow = '0 12px 28px -4px rgba(0,0,0,0.45)';
    hoverCard.style.whiteSpace = 'nowrap';
    hoverCard.style.pointerEvents = 'auto';
    hoverCard.style.display = 'none';
    hoverCard.style.flexDirection = 'column';
    hoverCard.style.alignItems = 'center';
    hoverCard.style.gap = '6px';
    hoverCard.style.zIndex = '120';
    hoverCard.style.cursor = 'default';

    // Marker Name
    const nameEl = document.createElement('div');
    nameEl.style.fontSize = '12px';
    nameEl.style.fontWeight = '800';
    nameEl.style.lineHeight = '1.2';
    nameEl.style.textAlign = 'center';
    nameEl.style.maxWidth = '180px';
    nameEl.style.overflow = 'hidden';
    nameEl.style.textOverflow = 'ellipsis';
    nameEl.innerText = safeName;
    hoverCard.appendChild(nameEl);

    // Category Badge
    const catBadge = document.createElement('span');
    catBadge.style.display = 'inline-block';
    catBadge.style.padding = '2px 8px';
    catBadge.style.borderRadius = '9999px';
    catBadge.style.fontSize = '10px';
    catBadge.style.fontWeight = '700';
    catBadge.style.backgroundColor = `${markerColor}20`;
    catBadge.style.color = markerColor;
    catBadge.style.border = `1px solid ${markerColor}40`;
    catBadge.style.textTransform = 'capitalize';
    catBadge.innerText = category;
    hoverCard.appendChild(catBadge);

    // Route to marker button
    const routeMarkerBtn = document.createElement('button');
    routeMarkerBtn.type = 'button';
    routeMarkerBtn.style.width = '100%';
    routeMarkerBtn.style.marginTop = '4px';
    routeMarkerBtn.style.padding = '5px 10px';
    routeMarkerBtn.style.borderRadius = '8px';
    routeMarkerBtn.style.fontSize = '11px';
    routeMarkerBtn.style.fontWeight = '700';
    routeMarkerBtn.style.display = 'flex';
    routeMarkerBtn.style.alignItems = 'center';
    routeMarkerBtn.style.justifyContent = 'center';
    routeMarkerBtn.style.gap = '5px';
    routeMarkerBtn.style.backgroundColor = '#2563eb';
    routeMarkerBtn.style.color = '#ffffff';
    routeMarkerBtn.style.border = 'none';
    routeMarkerBtn.style.cursor = 'pointer';
    routeMarkerBtn.style.boxShadow = '0 2px 6px rgba(37,99,235,0.35)';
    routeMarkerBtn.style.transition = 'background-color 0.15s';
    routeMarkerBtn.innerHTML = `
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="6" cy="19" r="3"></circle>
        <path d="M9 19h8.5a4.5 4.5 0 0 0 0-9H11"></path>
        <polyline points="14 7 11 10 14 13"></polyline>
      </svg>
      <span>Route to marker</span>
    `;

    routeMarkerBtn.addEventListener('mouseenter', () => {
      routeMarkerBtn.style.backgroundColor = '#1d4ed8';
    });
    routeMarkerBtn.addEventListener('mouseleave', () => {
      routeMarkerBtn.style.backgroundColor = '#2563eb';
    });
    routeMarkerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onRequestRoute) {
        this.onRequestRoute({ lat: this.marker.lat, lng: this.marker.lng }, this.marker.name);
      }
    });

    hoverCard.appendChild(routeMarkerBtn);

    // Caret downward pointer
    const arrow = document.createElement('div');
    arrow.style.position = 'absolute';
    arrow.style.bottom = '-6px';
    arrow.style.left = '50%';
    arrow.style.transform = 'translateX(-50%)';
    arrow.style.width = '0';
    arrow.style.height = '0';
    arrow.style.borderLeft = '6px solid transparent';
    arrow.style.borderRight = '6px solid transparent';
    arrow.style.borderTop = `6px solid ${this.isDark ? '#27272a' : '#e4e4e7'}`;
    hoverCard.appendChild(arrow);

    this.containerEl.appendChild(hoverCard);
    this.hoverCardEl = hoverCard;

    // Hover listener to reveal hover card with smooth debounce
    this.containerEl.addEventListener('mouseenter', () => {
      if (this.hideTimeout) clearTimeout(this.hideTimeout);
      if (this.hoverCardEl) {
        this.hoverCardEl.style.display = 'flex';
      }
    });
    this.containerEl.addEventListener('mouseleave', () => {
      this.hideTimeout = setTimeout(() => {
        if (this.hoverCardEl) {
          this.hoverCardEl.style.display = 'none';
        }
      }, 150);
    });

    // 2. The Pin Icon with marker color
    const pin = document.createElement('div');
    pin.style.width = '24px';
    pin.style.height = '24px';
    pin.style.borderRadius = '50% 50% 50% 0';
    pin.style.transform = 'rotate(-45deg)';
    pin.style.backgroundColor = markerColor;
    pin.style.border = '2px solid #ffffff';
    pin.style.boxShadow = '0 3px 8px rgba(0,0,0,0.35)';
    pin.style.display = 'flex';
    pin.style.alignItems = 'center';
    pin.style.justifyContent = 'center';

    const innerDot = document.createElement('div');
    innerDot.style.width = '7px';
    innerDot.style.height = '7px';
    innerDot.style.borderRadius = '50%';
    innerDot.style.backgroundColor = '#ffffff';
    innerDot.style.transform = 'rotate(45deg)';
    pin.appendChild(innerDot);

    this.containerEl.appendChild(pin);

    // 3. Name of custom marker BELOW the point
    const nameLabel = document.createElement('div');
    nameLabel.style.marginTop = '4px';
    nameLabel.style.padding = '1.5px 7px';
    nameLabel.style.borderRadius = '9999px';
    nameLabel.style.backgroundColor = this.isDark ? '#18181b' : '#ffffff';
    nameLabel.style.border = `1.5px solid ${markerColor}`;
    nameLabel.style.color = this.isDark ? '#f4f4f5' : '#18181b';
    nameLabel.style.fontSize = '10px';
    nameLabel.style.fontWeight = '700';
    nameLabel.style.letterSpacing = '0.2px';
    nameLabel.style.whiteSpace = 'nowrap';
    nameLabel.style.textAlign = 'center';
    nameLabel.style.maxWidth = '130px';
    nameLabel.style.overflow = 'hidden';
    nameLabel.style.textOverflow = 'ellipsis';
    nameLabel.style.boxShadow = '0 2px 6px rgba(0,0,0,0.25)';
    nameLabel.innerText = safeName;
    this.containerEl.appendChild(nameLabel);
  }

  onAdd() {
    const panes = this.getPanes();
    if (panes) {
      panes.overlayMouseTarget.appendChild(this.containerEl);
    }
  }

  draw() {
    const projection = this.getProjection();
    if (!projection) return;
    const point = projection.fromLatLngToDivPixel(
      new google.maps.LatLng(this.pos.lat, this.pos.lng)
    );
    if (point) {
      this.containerEl.style.left = `${point.x}px`;
      this.containerEl.style.top = `${point.y}px`;
    }
  }

  update(
    marker: CustomMarker,
    isDark: boolean,
    onRequestRoute?: (dest: { lat: number; lng: number }, destName?: string) => void
  ) {
    const changed =
      this.marker.name !== marker.name ||
      this.marker.category !== marker.category ||
      this.marker.userColor !== marker.userColor ||
      this.isDark !== isDark ||
      this.onRequestRoute !== onRequestRoute;
    this.marker = marker;
    this.pos = { lat: marker.lat, lng: marker.lng };
    this.isDark = isDark;
    this.onRequestRoute = onRequestRoute;
    if (changed) {
      this.renderContent();
    }
    this.draw();
  }

  onRemove() {
    if (this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl);
    }
  }
}

/**
 * Custom Google Maps OverlayView for placing real DOM elements with <img> tags for user avatars.
 * This completely eliminates SVG data URL limitations and Canvas cross-origin tainting,
 * guaranteeing that user profile images always show up crisply on the map for all users.
 */
class UserMarkerOverlay extends google.maps.OverlayView {
  private pos: { lat: number; lng: number };
  private user: AppUser;
  private isDark: boolean;
  private onClickHandler: () => void;
  private onRouteToUser?: (pos: { lat: number; lng: number }, name: string) => void;
  private containerEl: HTMLDivElement;
  private hoverCardEl: HTMLDivElement | null = null;
  private fallbackAvatarUrl?: string;

  constructor(
    pos: { lat: number; lng: number },
    user: AppUser,
    isDark: boolean,
    onClick: () => void,
    fallbackAvatarUrl?: string,
    onRouteToUser?: (pos: { lat: number; lng: number }, name: string) => void
  ) {
    super();
    this.pos = pos;
    this.user = user;
    this.isDark = isDark;
    this.onClickHandler = onClick;
    this.fallbackAvatarUrl = fallbackAvatarUrl;
    this.onRouteToUser = onRouteToUser;

    this.containerEl = document.createElement('div');
    this.containerEl.className = 'user-marker-overlay-container';
    this.containerEl.style.position = 'absolute';
    this.containerEl.style.transform = 'translate(-50%, -46px)';
    this.containerEl.style.cursor = 'pointer';
    this.containerEl.style.zIndex = user.isCurrentUser ? '75' : '50';
    this.containerEl.style.display = 'flex';
    this.containerEl.style.flexDirection = 'column';
    this.containerEl.style.alignItems = 'center';
    this.containerEl.style.pointerEvents = 'auto';
    this.containerEl.style.userSelect = 'none';

    this.renderContent();

    this.containerEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onClickHandler();
    });
  }

  private renderContent() {
    this.containerEl.innerHTML = '';
    const safeName = (this.user.name || 'User').trim();
    const initial = safeName.charAt(0).toUpperCase();
    const userColor = this.user.color || '#3B82F6';
    const rawAvatar = this.user.avatar || (this.user.isCurrentUser ? this.fallbackAvatarUrl : '') || '';
    const avatarUrl = formatProfileImageUrl(rawAvatar);

    // Hover card for another user with Route to User button (adheres to theme, no coordinates, no active user text)
    if (!this.user.isCurrentUser) {
      const hoverCard = document.createElement('div');
      hoverCard.className = 'user-hover-card';
      hoverCard.style.position = 'absolute';
      hoverCard.style.bottom = 'calc(100% + 8px)';
      hoverCard.style.left = '50%';
      hoverCard.style.transform = 'translateX(-50%)';
      hoverCard.style.minWidth = '160px';
      hoverCard.style.padding = '10px 12px';
      hoverCard.style.borderRadius = '14px';
      hoverCard.style.backgroundColor = this.isDark ? '#18181b' : '#ffffff';
      hoverCard.style.color = this.isDark ? '#f4f4f5' : '#18181b';
      hoverCard.style.border = `1px solid ${this.isDark ? '#27272a' : '#e4e4e7'}`;
      hoverCard.style.boxShadow = '0 12px 28px -4px rgba(0,0,0,0.45)';
      hoverCard.style.display = 'none';
      hoverCard.style.flexDirection = 'column';
      hoverCard.style.alignItems = 'center';
      hoverCard.style.gap = '8px';
      hoverCard.style.zIndex = '120';
      hoverCard.style.cursor = 'default';

      // User Avatar in card
      const avatarContainer = document.createElement('div');
      avatarContainer.style.width = '40px';
      avatarContainer.style.height = '40px';
      avatarContainer.style.borderRadius = '50%';
      avatarContainer.style.overflow = 'hidden';
      avatarContainer.style.border = `2.5px solid ${userColor}`;
      avatarContainer.style.display = 'flex';
      avatarContainer.style.alignItems = 'center';
      avatarContainer.style.justifyContent = 'center';
      avatarContainer.style.backgroundColor = `${userColor}20`;
      avatarContainer.style.flexShrink = '0';
      avatarContainer.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';

      if (avatarUrl) {
        const img = document.createElement('img');
        img.src = avatarUrl;
        img.alt = safeName;
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        img.onerror = () => {
          img.remove();
          avatarContainer.innerText = initial;
          avatarContainer.style.fontSize = '15px';
          avatarContainer.style.fontWeight = 'bold';
          avatarContainer.style.color = userColor;
        };
        avatarContainer.appendChild(img);
      } else {
        avatarContainer.innerText = initial;
        avatarContainer.style.fontSize = '15px';
        avatarContainer.style.fontWeight = 'bold';
        avatarContainer.style.color = userColor;
      }
      hoverCard.appendChild(avatarContainer);

      // User Name
      const nameEl = document.createElement('div');
      nameEl.style.fontSize = '12px';
      nameEl.style.fontWeight = '800';
      nameEl.style.color = this.isDark ? '#f4f4f5' : '#18181b';
      nameEl.style.textAlign = 'center';
      nameEl.innerText = safeName;
      hoverCard.appendChild(nameEl);

      // Route to user button
      const routeBtn = document.createElement('button');
      routeBtn.type = 'button';
      routeBtn.style.width = '100%';
      routeBtn.style.padding = '6px 12px';
      routeBtn.style.borderRadius = '10px';
      routeBtn.style.fontSize = '11px';
      routeBtn.style.fontWeight = '700';
      routeBtn.style.display = 'flex';
      routeBtn.style.alignItems = 'center';
      routeBtn.style.justifyContent = 'center';
      routeBtn.style.gap = '6px';
      routeBtn.style.backgroundColor = '#2563eb';
      routeBtn.style.color = '#ffffff';
      routeBtn.style.border = 'none';
      routeBtn.style.cursor = 'pointer';
      routeBtn.style.boxShadow = '0 2px 8px rgba(37,99,235,0.35)';
      routeBtn.style.transition = 'background-color 0.15s';
      routeBtn.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="6" cy="19" r="3"></circle>
          <path d="M9 19h8.5a4.5 4.5 0 0 0 0-9H11"></path>
          <polyline points="14 7 11 10 14 13"></polyline>
        </svg>
        <span>Route to user</span>
      `;

      routeBtn.addEventListener('mouseenter', () => {
        routeBtn.style.backgroundColor = '#1d4ed8';
      });
      routeBtn.addEventListener('mouseleave', () => {
        routeBtn.style.backgroundColor = '#2563eb';
      });

      routeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.onRouteToUser) {
          this.onRouteToUser(this.pos, this.user.name);
        }
      });

      hoverCard.appendChild(routeBtn);

      // Caret downward pointer
      const arrow = document.createElement('div');
      arrow.style.position = 'absolute';
      arrow.style.bottom = '-6px';
      arrow.style.left = '50%';
      arrow.style.transform = 'translateX(-50%)';
      arrow.style.width = '0';
      arrow.style.height = '0';
      arrow.style.borderLeft = '6px solid transparent';
      arrow.style.borderRight = '6px solid transparent';
      arrow.style.borderTop = `6px solid ${this.isDark ? '#27272a' : '#e4e4e7'}`;
      hoverCard.appendChild(arrow);

      this.containerEl.appendChild(hoverCard);
      this.hoverCardEl = hoverCard;

      let hideTimeout: any = null;
      this.containerEl.addEventListener('mouseenter', () => {
        if (hideTimeout) clearTimeout(hideTimeout);
        if (this.hoverCardEl) this.hoverCardEl.style.display = 'flex';
      });
      this.containerEl.addEventListener('mouseleave', () => {
        hideTimeout = setTimeout(() => {
          if (this.hoverCardEl) this.hoverCardEl.style.display = 'none';
        }, 150);
      });
    }

    // Outer wrapper for ring + online green dot
    const wrapper = document.createElement('div');
    wrapper.style.position = 'relative';
    wrapper.style.width = '38px';
    wrapper.style.height = '38px';

    // Ring circle
    const ring = document.createElement('div');
    ring.style.width = '38px';
    ring.style.height = '38px';
    ring.style.borderRadius = '50%';
    ring.style.backgroundColor = userColor;
    ring.style.border = '2.5px solid #ffffff';
    ring.style.boxShadow = '0 4px 10px rgba(0,0,0,0.35)';
    ring.style.overflow = 'hidden';
    ring.style.display = 'flex';
    ring.style.alignItems = 'center';
    ring.style.justifyContent = 'center';

    const fallback = document.createElement('div');
    fallback.style.width = '100%';
    fallback.style.height = '100%';
    fallback.style.display = avatarUrl ? 'none' : 'flex';
    fallback.style.alignItems = 'center';
    fallback.style.justifyContent = 'center';
    fallback.style.fontWeight = '800';
    fallback.style.fontSize = '14px';
    fallback.style.color = '#ffffff';
    fallback.innerText = initial;

    if (avatarUrl) {
      const img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = safeName;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      img.style.display = 'block';
      let retried = false;
      img.onerror = () => {
        if (!retried && avatarUrl.includes('/storage/')) {
          retried = true;
          const storageSubPath = avatarUrl.split('/storage/')[1];
          if (avatarUrl.startsWith('http')) {
            img.src = `/storage/${storageSubPath}`;
            return;
          } else {
            img.src = `https://kv5zhpcr-7044.uks1.devtunnels.ms/storage/${storageSubPath}`;
            return;
          }
        }
        img.style.display = 'none';
        fallback.style.display = 'flex';
      };
      img.onload = () => {
        img.style.display = 'block';
        fallback.style.display = 'none';
      };
      ring.appendChild(img);
    }
    ring.appendChild(fallback);
    wrapper.appendChild(ring);

    // Online indicator green dot
    const onlineDot = document.createElement('div');
    onlineDot.style.position = 'absolute';
    onlineDot.style.top = '-1px';
    onlineDot.style.right = '-1px';
    onlineDot.style.width = '10px';
    onlineDot.style.height = '10px';
    onlineDot.style.borderRadius = '50%';
    onlineDot.style.backgroundColor = '#10b981';
    onlineDot.style.border = '2px solid #ffffff';
    onlineDot.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3)';
    wrapper.appendChild(onlineDot);

    this.containerEl.appendChild(wrapper);

    // Downward stem pointer
    const stem = document.createElement('div');
    stem.style.width = '0';
    stem.style.height = '0';
    stem.style.borderLeft = '4px solid transparent';
    stem.style.borderRight = '4px solid transparent';
    stem.style.borderTop = `5px solid ${userColor}`;
    stem.style.margin = '0 auto';
    this.containerEl.appendChild(stem);

    // User Name Pill Label
    const pill = document.createElement('div');
    pill.style.marginTop = '2px';
    pill.style.padding = '1.5px 7px';
    pill.style.borderRadius = '9999px';
    pill.style.backgroundColor = '#18181b';
    pill.style.border = `1.5px solid ${userColor}`;
    pill.style.color = '#ffffff';
    pill.style.fontSize = '10px';
    pill.style.fontWeight = '700';
    pill.style.letterSpacing = '0.2px';
    pill.style.whiteSpace = 'nowrap';
    pill.style.textAlign = 'center';
    pill.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
    pill.innerText = safeName;
    this.containerEl.appendChild(pill);
  }

  onAdd() {
    const panes = this.getPanes();
    if (panes) {
      panes.overlayMouseTarget.appendChild(this.containerEl);
    }
  }

  draw() {
    const projection = this.getProjection();
    if (!projection) return;
    const point = projection.fromLatLngToDivPixel(
      new google.maps.LatLng(this.pos.lat, this.pos.lng)
    );
    if (point) {
      this.containerEl.style.left = `${point.x}px`;
      this.containerEl.style.top = `${point.y}px`;
    }
  }

  update(
    pos: { lat: number; lng: number },
    user: AppUser,
    isDark: boolean,
    fallbackAvatarUrl?: string,
    onRouteToUser?: (pos: { lat: number; lng: number }, name: string) => void
  ) {
    const avatarChanged = this.user.avatar !== user.avatar || this.fallbackAvatarUrl !== fallbackAvatarUrl;
    const nameChanged = this.user.name !== user.name;
    const colorChanged = this.user.color !== user.color;
    const isDarkChanged = this.isDark !== isDark;
    this.pos = pos;
    this.user = user;
    this.isDark = isDark;
    if (fallbackAvatarUrl !== undefined) {
      this.fallbackAvatarUrl = fallbackAvatarUrl;
    }
    if (onRouteToUser !== undefined) {
      this.onRouteToUser = onRouteToUser;
    }
    this.containerEl.style.zIndex = user.isCurrentUser ? '75' : '50';

    if (avatarChanged || nameChanged || colorChanged || isDarkChanged) {
      this.renderContent();
    }
    this.draw();
  }

  onRemove() {
    if (this.containerEl.parentNode) {
      this.containerEl.parentNode.removeChild(this.containerEl);
    }
  }
}

  // Multi-User Markers & Active Route Lines: Render all active users and their active route paths
  const userMarkerOverlaysRef = useRef<Map<number, UserMarkerOverlay>>(new Map());
  const singleUserOverlayRef = useRef<UserMarkerOverlay | null>(null);
  const userRoutePolylinesRef = useRef<Map<number, google.maps.Polyline>>(new Map());
  const userInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Synchronize User Active Route Polylines (from start location to destination)
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    const activeUserIdsWithRoute = new Set<number>();
    const usersToRender =
      selectedUserIdFilter && selectedUserIdFilter !== 'all'
        ? (allUsers || []).filter((u) => u && u.id === selectedUserIdFilter)
        : (allUsers || []).filter(Boolean);

    usersToRender.forEach((user) => {
      if (user && user.activeRoutePath && user.activeRoutePath.length > 1) {
        activeUserIdsWithRoute.add(user.id);

        let polyline = userRoutePolylinesRef.current.get(user.id);
        if (!polyline) {
          polyline = new google.maps.Polyline({
            path: user.activeRoutePath,
            strokeColor: user.color || '#3B82F6',
            strokeOpacity: 0.85,
            strokeWeight: 5,
            map: map,
            zIndex: user.isCurrentUser ? 42 : 36,
          });
          userRoutePolylinesRef.current.set(user.id, polyline);
        } else {
          polyline.setMap(map);
          polyline.setPath(user.activeRoutePath);
          polyline.setOptions({
            strokeColor: user.color || '#3B82F6',
            strokeOpacity: 0.85,
            strokeWeight: 5,
          });
        }
      }
    });

    userRoutePolylinesRef.current.forEach((polyline, userId) => {
      if (!activeUserIdsWithRoute.has(userId)) {
        polyline.setMap(null);
        userRoutePolylinesRef.current.delete(userId);
      }
    });

    return () => {
      userRoutePolylinesRef.current.forEach((polyline) => polyline.setMap(null));
      userRoutePolylinesRef.current.clear();
    };
  }, [map, allUsers, selectedUserIdFilter]);

  // Synchronize User Avatars with UserMarkerOverlay (DOM-based OverlayView)
  useEffect(() => {
    if (!map || typeof google === 'undefined' || !google.maps) return;

    const openUserInfoWindow = (user: AppUser, pos: { lat: number; lng: number }) => {
      if (!userInfoWindowRef.current) {
        userInfoWindowRef.current = new google.maps.InfoWindow();
      }

      const bgColor = isDark ? '#09090b' : '#ffffff';
      const textColor = isDark ? '#f4f4f5' : '#18181b';
      const cardBg = isDark ? '#18181b' : '#f4f4f5';
      const subTextColor = isDark ? '#a1a1aa' : '#71717a';
      const borderColor = isDark ? '#27272a' : '#e4e4e7';
      const userAvatar = formatProfileImageUrl(user.avatar || (user.isCurrentUser ? userAvatarUrl : ''));

      const contentString = `
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 12px; max-width: 250px; background-color: ${bgColor}; color: ${textColor}; border-radius: 16px; border: 1px solid ${borderColor}; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.3);">
          <!-- User Avatar Centered on Top -->
          <div style="text-align: center; margin-bottom: 8px;">
            ${userAvatar ? `<img src="${userAvatar}" alt="${user.name}" style="width: 52px; height: 52px; border-radius: 50%; object-fit: cover; margin: 0 auto; border: 3px solid ${user.color || '#3b82f6'}; box-shadow: 0 4px 8px rgba(0,0,0,0.2);" onerror="this.style.display='none';" />` : ''}
          </div>
          
          <!-- User Name -->
          <div style="text-align: center; margin-bottom: 8px;">
            <div style="font-size: 14px; font-weight: 800; color: ${textColor}; line-height: 1.2;">${user.name}</div>
            ${user.isCurrentUser ? `
              <div style="margin-top: 3px;">
                <span style="display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 10px; font-weight: 700; background-color: ${user.color || '#3b82f6'}20; color: ${user.color || '#3b82f6'}; border: 1px solid ${user.color || '#3b82f6'}40;">
                  Primary User
                </span>
              </div>
            ` : ''}
          </div>

          <!-- Details Card (No coordinates, No active user text) -->
          <div style="background-color: ${cardBg}; border-radius: 12px; padding: 10px; font-size: 11px; line-height: 1.5; border: 1px solid ${borderColor};">
            <div style="color: ${textColor};">
              <strong style="color: ${subTextColor}; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; display: block;">Status</strong>
              ${user.isCurrentUser ? 'Live GPS Location' : 'Connected'}
            </div>
            ${!user.isCurrentUser ? `
              <div style="margin-top: 8px;">
                <button id="info-route-to-user-btn" style="width: 100%; padding: 6px 12px; border-radius: 10px; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; background-color: #2563eb; color: #ffffff; border: none; cursor: pointer; box-shadow: 0 2px 8px rgba(37,99,235,0.35);">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="6" cy="19" r="3"></circle>
                    <path d="M9 19h8.5a4.5 4.5 0 0 0 0-9H11"></path>
                    <polyline points="14 7 11 10 14 13"></polyline>
                  </svg>
                  <span>Route to user</span>
                </button>
              </div>
            ` : ''}
          </div>
        </div>
      `;
      userInfoWindowRef.current.setContent(contentString);
      userInfoWindowRef.current.setPosition(new google.maps.LatLng(pos.lat, pos.lng));
      userInfoWindowRef.current.open(map);

      if (!user.isCurrentUser && onRequestRoute) {
        google.maps.event.addListenerOnce(userInfoWindowRef.current, 'domready', () => {
          const btn = document.getElementById('info-route-to-user-btn');
          if (btn) {
            btn.onclick = () => {
              onRequestRoute(pos, user.name);
              userInfoWindowRef.current?.close();
            };
          }
        });
      }

      if (onSelectUser) {
        onSelectUser(user.id);
      }
    };

    if (!allUsers || allUsers.length === 0) {
      // Fallback single-user rendering if allUsers is empty
      if (currentPoint && typeof currentPoint.lat === 'number' && typeof currentPoint.lng === 'number') {
        const pos = { lat: currentPoint.lat, lng: currentPoint.lng };
        const dummyUser: AppUser = {
          id: 1,
          name: userName,
          avatar: userAvatarUrl || '',
          color: '#3B82F6',
          isCurrentUser: true,
          currentPoint,
          isTracking: true,
          isStationary: false,
          stationaryStartTime: null,
          dwellDurationSeconds: 0,
          activeDestinationName: null,
          activeDestinationCoords: null,
          isNavigating: false,
          navigationStartTime: null,
          speedKmH: 0,
          mode: 'vehicle',
        };

        if (!singleUserOverlayRef.current) {
          singleUserOverlayRef.current = new UserMarkerOverlay(
            pos,
            dummyUser,
            isDark,
            () => openUserInfoWindow(dummyUser, pos),
            userAvatarUrl,
            onRequestRoute ? (p, n) => onRequestRoute(p, n) : undefined
          );
          singleUserOverlayRef.current.setMap(map);
        } else {
          singleUserOverlayRef.current.setMap(map);
          singleUserOverlayRef.current.update(
            pos,
            dummyUser,
            isDark,
            userAvatarUrl,
            onRequestRoute ? (p, n) => onRequestRoute(p, n) : undefined
          );
        }
      }
      return;
    }

    // Clear single-user fallback overlay if using multi-user map
    if (singleUserOverlayRef.current) {
      singleUserOverlayRef.current.setMap(null);
      singleUserOverlayRef.current = null;
    }

    const currentActiveIds = new Set<number>();
    const usersToRender =
      selectedUserIdFilter && selectedUserIdFilter !== 'all'
        ? allUsers.filter((u) => u && u.id === selectedUserIdFilter)
        : allUsers.filter(Boolean);

    usersToRender.forEach((user) => {
      if (!user || !user.currentPoint || typeof user.currentPoint.lat !== 'number' || typeof user.currentPoint.lng !== 'number') {
        return;
      }

      currentActiveIds.add(user.id);
      const pos = { lat: user.currentPoint.lat, lng: user.currentPoint.lng };

      let overlay = userMarkerOverlaysRef.current.get(user.id);
      if (!overlay) {
        overlay = new UserMarkerOverlay(
          pos,
          user,
          isDark,
          () => openUserInfoWindow(user, pos),
          user.isCurrentUser ? userAvatarUrl : undefined,
          onRequestRoute ? (p, n) => onRequestRoute(p, n) : undefined
        );
        overlay.setMap(map);
        userMarkerOverlaysRef.current.set(user.id, overlay);
      } else {
        overlay.setMap(map);
        overlay.update(
          pos,
          user,
          isDark,
          user.isCurrentUser ? userAvatarUrl : undefined,
          onRequestRoute ? (p, n) => onRequestRoute(p, n) : undefined
        );
      }
    });

    // Remove overlays for users no longer rendered
    userMarkerOverlaysRef.current.forEach((overlay, userId) => {
      if (!currentActiveIds.has(userId)) {
        overlay.setMap(null);
        userMarkerOverlaysRef.current.delete(userId);
      }
    });
  }, [map, allUsers, selectedUserIdFilter, currentPoint, userName, isDark, onRequestRoute]);

  return null;
};

