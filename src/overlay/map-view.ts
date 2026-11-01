import { indexAtTime, positionAt } from '../sync/timeline.ts';
import { seriesValue, type OverlayData } from './data.ts';
import type { Style } from './template.ts';

export interface MapProvider {
  id: string;
  label: string;
  /** Uses {z}, {x}, {y} and {token}. */
  url: string;
  credit: string;
  maxZoom: number;
  needsToken?: boolean;
  /** Steps down a zoom level for providers whose tiles carry twice the pixels. */
  tileBias?: number;
  /** Only draws the track, with no map behind it. */
  none?: boolean;
}

const OSM_CREDIT = '© OpenStreetMap contributors';
const MAPBOX_CREDIT = `© Mapbox ${OSM_CREDIT}`;
const mapbox = (id: string, label: string, style: string): MapProvider => ({
  id, label, needsToken: true, credit: MAPBOX_CREDIT, maxZoom: 19,
  // 256 pixel tiles take four times as many billable requests to cover the same area.
  url: `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/{z}/{x}/{y}?access_token={token}`,
  tileBias: -1,
});

/** Add a map style here and it appears in the options for every map. */
export const MAP_PROVIDERS: MapProvider[] = [
  { id: 'osm', label: 'OpenStreetMap', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', credit: OSM_CREDIT, maxZoom: 19 },
  mapbox('mapbox-streets', 'Mapbox Streets', 'streets-v12'),
  mapbox('mapbox-outdoors', 'Mapbox Outdoors', 'outdoors-v12'),
  mapbox('mapbox-satellite', 'Mapbox Satellite', 'satellite-v9'),
  mapbox('mapbox-hybrid', 'Mapbox Hybrid', 'satellite-streets-v12'),
  mapbox('mapbox-dark', 'Mapbox Dark', 'dark-v11'),
  mapbox('mapbox-light', 'Mapbox Light', 'light-v11'),
  { id: 'custom', label: 'Your own tile address', url: '', credit: '', maxZoom: 19 },
  { id: 'none', label: 'No map, just the track', url: '', credit: '', maxZoom: 19, none: true },
];

export function mapProvider(style: Style, token: string): MapProvider {
  const chosen = MAP_PROVIDERS.find(p => p.id === style.mapProvider) ?? MAP_PROVIDERS[0];
  if (chosen.needsToken && !token) return MAP_PROVIDERS[0];
  if (chosen.id === 'custom') {
    if (!style.mapCustomUrl) return MAP_PROVIDERS[0];
    return { ...chosen, url: style.mapCustomUrl, credit: style.mapCredit };
  }
  return chosen;
}

export const projectX = (lon: number) => (lon + 180) / 360;

export function projectY(lat: number): number {
  const s = Math.sin((lat * Math.PI) / 180);
  return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
}

export interface MapView {
  /** Middle of the view, as a fraction of the world. */
  cx: number;
  cy: number;
  zoom: number;
  /** Which set of tiles to use. */
  tileZoom: number;
  /** Radians the map is turned, for heading-up maps. */
  rotation: number;
  /** Pixels across the whole world at this zoom. */
  worldSize: number;
}

export interface ViewInput {
  style: Style;
  data: OverlayData;
  width: number;
  height: number;
  time: number;
  clipStart: number;
  clipEnd: number;
  unit: number;
  maxZoom: number;
  tileBias?: number;
}

const FIT_MARGIN = 0.85;
const HEADING_SMOOTHING_S = 6;
const TILE_SIZE = 256;

function fitTo(input: ViewInput, from: number, to: number): { cx: number; cy: number; zoom: number } {
  const { track } = input.data;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = from; i <= to; i++) {
    const x = projectX(track.lon[i]);
    const y = projectY(track.lat[i]);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const size = TILE_SIZE * input.unit;
  const scale = Math.min(input.width / Math.max(1e-7, maxX - minX), input.height / Math.max(1e-7, maxY - minY)) * FIT_MARGIN;
  return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, zoom: Math.min(input.maxZoom, Math.log2(scale / size)) };
}

/** Where a map looks at one moment. Export and preview both use this, so they frame it the same. */
export function mapView(input: ViewInput): MapView {
  const { style, data, time, clipStart, clipEnd, unit, maxZoom } = input;
  const { track } = data;
  let view: { cx: number; cy: number; zoom: number };
  if (style.mapMode === 'fitRide') {
    view = fitTo(input, 0, track.t.length - 1);
  } else if (style.mapMode === 'fitClip') {
    view = fitTo(input, indexAtTime(track.t, clipStart), indexAtTime(track.t, clipEnd));
  } else {
    const p = positionAt(track, time);
    view = { cx: projectX(p.lon), cy: projectY(p.lat), zoom: style.mapZoom };
  }
  const heading = style.mapRotate && style.mapMode === 'follow' ? seriesValue(data, 'heading', time, HEADING_SMOOTHING_S) ?? 0 : 0;
  return {
    ...view,
    // Chosen as if for 4K at every size, so a 1080p preview shows the same tiles as the export.
    tileZoom: Math.min(maxZoom, Math.max(1, Math.round(view.zoom + 1) + (input.tileBias ?? 0))),
    rotation: heading ? (-heading * Math.PI) / 180 : 0,
    worldSize: TILE_SIZE * 2 ** view.zoom * unit,
  };
}

export interface Tile {
  z: number;
  x: number;
  y: number;
  /** Top left corner and size, in pixels from the middle of the view. */
  left: number;
  top: number;
  size: number;
}

export function visibleTiles(view: MapView, width: number, height: number): Tile[] {
  // A turning map has to cover its corners at every angle.
  const reach = view.rotation !== 0 ? Math.hypot(width, height) / 2 : 0;
  const halfW = (reach || width / 2) / view.worldSize;
  const halfH = (reach || height / 2) / view.worldSize;
  const n = 2 ** view.tileZoom;
  const size = view.worldSize / n;
  const tiles: Tile[] = [];
  for (let x = Math.floor((view.cx - halfW) * n); x <= Math.floor((view.cx + halfW) * n); x++) {
    for (let y = Math.floor((view.cy - halfH) * n); y <= Math.floor((view.cy + halfH) * n); y++) {
      if (y < 0 || y >= n) continue;
      tiles.push({
        z: view.tileZoom,
        x: ((x % n) + n) % n,
        y,
        left: (x / n - view.cx) * view.worldSize,
        top: (y / n - view.cy) * view.worldSize,
        size,
      });
    }
  }
  return tiles;
}

export function tileUrl(provider: MapProvider, tile: Pick<Tile, 'z' | 'x' | 'y'>, token: string): string {
  return provider.url
    .replaceAll('{z}', String(tile.z))
    .replaceAll('{x}', String(tile.x))
    .replaceAll('{y}', String(tile.y))
    .replaceAll('{token}', encodeURIComponent(token));
}
