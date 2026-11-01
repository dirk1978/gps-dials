import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '@fontsource/barlow-condensed/latin-600.css';
import '@fontsource/barlow-condensed/latin-700.css';
import '@fontsource/barlow-condensed/latin-600-italic.css';
import '@fontsource/barlow-condensed/latin-700-italic.css';
import './styles.css';
import { createCompareView, type CompareApi, type SourceItem } from './compare-view.ts';
import { createEditor } from './editor.ts';
import type { ClipSensors } from '../../devices/types.ts';
import type { ChannelId } from '../../overlay/channels.ts';
import type { ActivityKind } from '../../activity/types.ts';
import { clipStartFromPin, indexAtTime, nearestIndex, positionAt, type TrackColumns } from '../../sync/timeline.ts';
import type { SessionResult, SyncResult } from '../../sync/engine.ts';
import { prepareOverlayData, type OverlayData } from '../../overlay/data.ts';
import { DISPLAY_FONT, drawFrame, type Ctx } from '../../overlay/draw.ts';
import { layoutFor } from '../../overlay/presets.ts';
import { normaliseTemplate, type Template } from '../../overlay/template.ts';
import type { FolderClip, FolderTrack } from '../folder.ts';
import { projectName, type ProjectFile } from '../project.ts';
import type { BatchProgress, OverlayBatch } from '../overlay-queue.ts';

type Mode = 'sync' | 'design' | 'compare';

interface Clip {
  path: string;
  name: string;
  url: string;
  duration: number;
  fps: number;
  /** Clockwise turn the file asks for. */
  fileRotation: number;
  upsideDown: boolean;
  clockTime: number;
  /** A subtitle track recorded with this clip, if there is one beside it. */
  ownTrack: string | null;
  proxyMethod: string;
  proxySeconds: number;
  saved: SavedSync | null;
}

interface Track {
  path: string;
  name: string;
  columns: TrackColumns;
  kind: ActivityKind;
}

interface SavedSync {
  version: 1;
  track: string;
  clipStart: number;
  method: 'auto' | 'manual';
  confident: boolean;
  /** Turn added by hand, on top of the file's own and any auto-correction. */
  manualRotation?: number;
  basis?: SessionResult['basis'];
  /** Where Auto-sync put the clip, kept so a hand correction can still be measured later. */
  autoStart?: number;
}

declare global {
  interface Window {
    gpsDials: CompareApi & {
      pickFile(kind: 'clip' | 'track'): Promise<string | null>;
      pickFolder(): Promise<string | null>;
      scanFolder(dir: string): Promise<{ clips: FolderClip[]; tracks: FolderTrack[] }>;
      loadTrack(path: string): Promise<Track>;
      loadClip(path: string): Promise<Clip>;
      /** Resolves to null if it was cancelled. */
      autoSync(job: { clip: string; upsideDown?: boolean; trackPath: string }): Promise<SyncResult | null>;
      autoSync(job: { clips: string[]; trackPath: string }): Promise<SessionResult[] | null>;
      cancelSync(): Promise<void>;
      readSensors(clip: string): Promise<ClipSensors | null>;
      pickProjectSave(name: string): Promise<string | null>;
      pickProjectOpen(): Promise<string | null>;
      writeProject(path: string, project: ProjectFile): Promise<void>;
      readProject(path: string): Promise<{ project: ProjectFile; missing: string[] }>;
      recentProjects(): Promise<string[]>;
      confirmDiscard(): Promise<'save' | 'discard' | 'cancel'>;
      setDirty(value: boolean): Promise<void>;
      closeWindow(): Promise<void>;
      onSaveThenClose(listener: () => void): void;
      listLayouts(): Promise<string[]>;
      loadLayout(name: string): Promise<Template>;
      saveLayout(name: string, template: Template): Promise<void>;
      deleteLayout(name: string): Promise<void>;
      loadWorkingCopy(): Promise<Template | null>;
      saveWorkingCopy(template: Template): Promise<void>;
      importLayout(): Promise<Template | null>;
      importLayoutPath(path: string): Promise<Template>;
      exportLayout(template: Template): Promise<string | null>;
      exportOverlays(batch: OverlayBatch): Promise<{ done: number; failed: number; cancelled: boolean; outDir: string; missingTiles: number }>;
      cancelOverlays(): Promise<void>;
      onOverlayProgress(listener: (progress: BatchProgress) => void): void;
      getMapToken(): Promise<string>;
      setMapToken(token: string): Promise<void>;
      pathForFile(file: File): string;
      onProxyProgress(listener: (fraction: number, clip: string) => void): void;
      onSyncProgress(listener: (done: number, total: number) => void): void;
    };
    app: {
      loadPaths(paths: string[]): Promise<void>;
      openFolder(dir: string): Promise<void>;
      selectClip(path: string): Promise<void>;
      generate(options?: { outDir?: string; limit?: number }): Promise<void>;
      saveProjectTo(path: string): Promise<boolean>;
      openProject(path?: string): Promise<void>;
      newProject(): Promise<void>;
      setMode(next: Mode): void;
      template(): Template;
      importLayoutFile(path: string): Promise<void>;
      selectWidget(id: string | null): void;
      state(): unknown;
    };
  }
}

const MPH_PER_MS = 2.23694;
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_CREDIT = 'Imagery &copy; Esri, Vantor, Earthstar Geographics, and the GIS User Community';
const LAYER_KEY = 'gps-dials.map-layer';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const video = $<HTMLVideoElement>('video');
const videoScrub = $<HTMLInputElement>('video-scrub');
const trackScrub = $<HTMLInputElement>('track-scrub');
const api = window.gpsDials;

let clip: Clip | null = null;
let track: Track | null = null;
/** Set once the video and track are matched. They then move together. */
let clipStart: number | null = null;
let method: 'auto' | 'manual' = 'manual';
let confident = false;
let trackTime = 0;
let draggingVideo = false;
let manualRotation = 0;
let folderClips: FolderClip[] = [];
let folderTracks: FolderTrack[] = [];
/** Clip results for each GPS source, because the same clip lands at a different time on each device's clock. */
const sessions = new Map<string, Map<string, SessionResult>>();
let sessionResults = new Map<string, SessionResult>();
/** Where Auto-sync put each clip, to measure how far a hand correction moved it. */
const autoStarts = new Map<string, number>();
/** Rotation added by hand to each clip, so it survives moving on to another one. */
const manualRotations = new Map<string, number>();
const PREVIEW_PANEL_DELAY_MS = 150;
const PROJECT_TO_OPEN = 'gps-dials.project-to-open';
let projectPath: string | null = null;
let projectTitle = 'Untitled project';
/** Unsaved changes in the open project. */
let dirty = false;
/** True while loading, so putting things back isn't counted as changing them. */
let restoring = false;
/** Clocks can be hours out, so a clip counts as near a track within this much. */
const TRACK_MATCH_MARGIN_S = 2 * 3600 + 300;
const MAX_PREVIEW_TILES = 600;
let mapToken = '';
let clipRequest = 0;
/** The clip being opened, which is highlighted straight away while its preview builds. */
let pendingClip: string | null = null;
let overlayData: OverlayData | null = null;
let lastOverlayDraw = 0;
let exporting = false;
const exportProgress = new Map<string, BatchProgress>();
let template: Template = layoutFor('cycling');
let syncing = false;
/** Tracks recorded by a drone along with one clip, in its subtitles or inside the video. */
const OWN_TRACK = /\.(srt|mp4|mov)$/i;
/** What the open clip's camera recorded about itself. */
let clipSensors: ClipSensors | null = null;
const SYNC_CANCELLED = 'Sync cancelled. Nothing was changed.';
let mode: Mode = 'sync';

const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([52, 0], 5);
let tileFailures = 0;

function tileLayer(url: string, attribution: string): L.TileLayer {
  const layer = L.tileLayer(url, { maxZoom: 19, attribution });
  layer.on('tileerror', () => {
    // The track still works without a basemap, which is the failure that broke VIRB's sync screen.
    if (++tileFailures === 4) showMapNote('Map images unavailable. The track still works.');
  });
  layer.on('tileload', () => {
    tileFailures = 0;
    $('map-note').hidden = true;
  });
  return layer;
}

const esriSatellite = () => tileLayer(`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`, ESRI_CREDIT);

function mapLayers(mapboxToken: string): Record<string, L.Layer> {
  const layers: Record<string, L.Layer> = {
    Street: tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'),
    Satellite: esriSatellite(),
    Hybrid: L.layerGroup([
      esriSatellite(),
      tileLayer(`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, ''),
      tileLayer(`${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`, ''),
    ]),
  };
  if (mapboxToken) {
    const mapbox = (style: string) => tileLayer(
      `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/256/{z}/{x}/{y}?access_token=${encodeURIComponent(mapboxToken)}`,
      '&copy; Mapbox &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    );
    layers['Mapbox Satellite'] = mapbox('satellite-v9');
    layers['Mapbox Hybrid'] = mapbox('satellite-streets-v12');
  }
  return layers;
}

function savedLayerName(): string | null {
  try {
    return localStorage.getItem(LAYER_KEY);
  } catch {
    return null;
  }
}

let layerControl: L.Control.Layers | null = null;
let currentLayers: L.Layer[] = [];

async function buildMapLayers(): Promise<void> {
  mapToken = await api.getMapToken();
  const layers = mapLayers(mapToken);
  currentLayers.forEach(layer => layer.remove());
  layerControl?.remove();
  currentLayers = Object.values(layers);
  const wanted = savedLayerName();
  layers[wanted && layers[wanted] ? wanted : 'Street'].addTo(map);
  layerControl = L.control.layers(layers, undefined, { position: 'topright', collapsed: false }).addTo(map);
}

map.on('baselayerchange', event => {
  tileFailures = 0;
  $('map-note').hidden = true;
  try {
    localStorage.setItem(LAYER_KEY, event.name);
  } catch {
    // Remembering the layer is only a convenience.
  }
});

const line = L.polyline([], { color: '#3fb6a8', weight: 4, opacity: 0.9, interactive: false }).addTo(map);
const clipLine = L.polyline([], { color: '#e9b44c', weight: 6, opacity: 0.95, interactive: false }).addTo(map);
const marker = L.circleMarker([0, 0], { radius: 8, color: '#fff', weight: 3, fillColor: '#e4572e', fillOpacity: 1, interactive: false });

function showMapNote(text: string): void {
  const note = $('map-note');
  note.textContent = text;
  note.hidden = false;
}

function setStatus(text: string): void {
  $('status').textContent = text;
}

function fail(error: unknown): void {
  setStatus(String((error as Error)?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
}

const clockText = (seconds: number, tenths = false) => {
  const s = Math.max(0, seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  const secs = tenths ? rest.toFixed(1).padStart(4, '0') : String(Math.floor(rest)).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${secs}` : `${m}:${secs}`;
};

const utcText = (t: number) => new Date(t * 1000).toISOString().slice(11, 22);

function renderVideoPosition(): void {
  if (!clip) return;
  if (!draggingVideo) videoScrub.value = String(video.currentTime);
  $('video-time').textContent = `${clockText(video.currentTime, true)} / ${clockText(clip.duration)}`;
}

function renderTrackPosition(): void {
  if (!track) return;
  const { columns } = track;
  const p = positionAt(columns, trackTime);
  marker.setLatLng([p.lat, p.lon]);
  if (!map.hasLayer(marker)) marker.addTo(map);
  if (!map.getBounds().pad(-0.15).contains(marker.getLatLng())) map.panTo(marker.getLatLng(), { animate: false });

  const start = columns.t[0];
  trackScrub.value = String(trackTime - start);
  $('track-time').textContent = `${clockText(trackTime - start)} / ${clockText(columns.t[columns.t.length - 1] - start)}`;
  $('read-speed').textContent = p.speed != null ? (p.speed * MPH_PER_MS).toFixed(1) : '-';
  $('read-hr').textContent = p.heartRate != null ? p.heartRate.toFixed(0) : '-';
  $('read-alt').textContent = p.altitude != null ? p.altitude.toFixed(0) : '-';
}

/** Highlights the stretch of track this clip covers. */
function renderClipLine(): void {
  if (!track || !clip || clipStart == null) {
    clipLine.setLatLngs([]);
    return;
  }
  const { columns } = track;
  const from = indexAtTime(columns.t, clipStart);
  const to = indexAtTime(columns.t, clipStart + clip.duration);
  const points: L.LatLngTuple[] = [];
  for (let i = from; i <= to; i++) points.push([columns.lat[i], columns.lon[i]]);
  clipLine.setLatLngs(points);
}

function renderSyncState(detail?: string): void {
  const badge = $('sync-badge');
  const linked = clipStart != null;
  badge.className = `badge ${linked ? (confident ? 'good' : 'warn') : ''}`;
  badge.textContent = !linked ? 'Not synced' : confident ? 'Synced' : 'Check this sync';
  if (detail) $('sync-detail').textContent = detail;
  else if (!clip || !track) $('sync-detail').textContent = 'Open a video and a track to begin.';
  else if (!linked) $('sync-detail').textContent = 'Find a frame you recognise, click that spot on the track, then match them.';

  $('nudge').hidden = !linked;
  $<HTMLButtonElement>('lock').textContent = linked ? 'Adjust by hand' : 'Match these two points';
  $<HTMLButtonElement>('lock').disabled = !(clip && track);
  const whole = clipsForTrack().length > 1;
  $<HTMLButtonElement>('auto-sync').disabled = !syncing && !(track && (clip || folderClips.length > 0));
  $('auto-sync').textContent = syncing ? 'Cancel' : whole ? 'Auto-sync all clips' : 'Auto-sync';
  renderApplyShift();
  renderClipLine();
  renderGenerateButton();
  renderOverlayPreview();
  if (mode === 'design') editor.renderSelection();
}

const estimatedClips = () => [...sessionResults.values()].filter(r => r.basis === 'clock from other clips');

/** How far by hand the current clip has moved from Auto-sync, if at all. */
function handShift(): number {
  if (!clip || clipStart == null || sessionResults.get(clip.path)?.basis !== 'set by hand') return 0;
  const auto = autoStarts.get(clip.path);
  return auto == null ? 0 : clipStart - auto;
}

function renderApplyShift(): void {
  const button = $('apply-shift');
  const count = estimatedClips().length;
  const shift = handShift();
  button.hidden = count === 0 || Math.abs(shift) < 0.01;
  button.textContent = `Move ${count} estimated clips by ${shift > 0 ? '+' : ''}${shift.toFixed(1)} s too`;
}

function applyShiftToEstimated(): void {
  const shift = handShift();
  const estimated = estimatedClips();
  for (const r of estimated) sessionResults.set(r.path, { ...r, clipStart: r.clipStart + shift });
  markDirty();
  renderClipList();
  renderSyncState($('sync-detail').textContent ?? undefined);
  setStatus(`Moved ${estimated.length} estimated clips. Matched and by-hand clips were left alone.`);
}

/** After a sync, the map follows the video. */
function followVideo(): void {
  if (clipStart == null || !track) return;
  trackTime = clipStart + video.currentTime;
  renderTrackPosition();
}

/** Same drawing code as the export, sized to sit exactly over the picture. */
function renderOverlayPreview(): void {
  const canvas = $<HTMLCanvasElement>('overlay');
  const ctx = canvas.getContext('2d')!;
  if (track && overlayData && ((template.gradientSpan != null && overlayData.gradientSpan !== template.gradientSpan) || (template.launchSpeed != null && overlayData.launchSpeed !== template.launchSpeed))) {
    overlayData = prepareOverlayData(track.columns, template.gradientSpan, template.launchSpeed);
  }
  const start = clipStart ?? (mode === 'design' ? designStart() : null);
  const show = ($<HTMLInputElement>('show-dials').checked || mode === 'design') && start != null && clip && overlayData && video.videoWidth > 0;
  if (!show || start == null || !clip || !overlayData) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const sideways = rotation() % 180 !== 0;
  const aspect = sideways ? video.videoHeight / video.videoWidth : video.videoWidth / video.videoHeight;
  const stage = $('video-stage');
  const cssWidth = Math.min(stage.clientWidth, stage.clientHeight * aspect);
  const width = 1920;
  const height = Math.round(width / aspect);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssWidth / aspect}px`;
  ctx.clearRect(0, 0, width, height);
  drawFrame(ctx as unknown as Ctx, {
    width,
    height,
    template,
    data: overlayData,
    clipStart: start,
    clipEnd: start + clip.duration,
    tiles: previewTiles,
    mapToken,
    sensors: clipSensors,
  }, start + video.currentTime);
}

/** Map images for the preview, fetched as they come into view. */
const tileImages = new Map<string, HTMLImageElement>();
const previewTiles = {
  image(url: string): HTMLImageElement | null {
    let image = tileImages.get(url);
    if (!image) {
      if (tileImages.size >= MAX_PREVIEW_TILES) tileImages.clear();
      image = new Image();
      image.addEventListener('load', scheduleOverlayDraw);
      image.src = url;
      tileImages.set(url, image);
    }
    return image.complete && image.naturalWidth > 0 ? image : null;
  },
};

let overlayDrawQueued = false;
function scheduleOverlayDraw(): void {
  if (overlayDrawQueued) return;
  overlayDrawQueued = true;
  requestAnimationFrame(() => {
    overlayDrawQueued = false;
    renderOverlayPreview();
  });
}

/** Lets a layout be designed before the clip is synced, using whatever part of the track its clock points to. */
function designStart(): number | null {
  if (!track) return null;
  const { t } = track.columns;
  return clip && clip.clockTime >= t[0] && clip.clockTime <= t[t.length - 1] ? clip.clockTime : t[0];
}

function pictureRect(): { left: number; top: number; width: number; height: number } | null {
  const canvas = $<HTMLCanvasElement>('overlay');
  const stage = $('video-stage');
  if (!clip || !canvas.clientWidth) return null;
  return {
    left: (stage.clientWidth - canvas.clientWidth) / 2,
    top: (stage.clientHeight - canvas.clientHeight) / 2,
    width: canvas.clientWidth,
    height: canvas.clientHeight,
  };
}

const editor = createEditor({
  template: () => template,
  activity: () => track?.kind ?? 'cycling',
  setTemplate: next => {
    template = next;
    renderOverlayPreview();
  },
  pictureRect,
  redraw: renderOverlayPreview,
  channelsWithData: () => overlayData ? new Set([...overlayData.available, ...Object.keys(clipSensors?.series ?? {}) as ChannelId[]]) : null,
  status: setStatus,
  saveWorkingCopy: t => {
    void api.saveWorkingCopy(t);
    markDirty();
  },
});

/** Every recording that overlaps the current one in time. */
function overlappingSources(): SourceItem[] {
  const selected = folderTracks.find(t => t.path === track?.path);
  if (!selected) return [];
  const same = folderTracks.filter(t => t.start < selected.end && t.end > selected.start && t.device !== 'Combined');
  // Names can match, for example two Garmins, and the comparison has to tell them apart.
  return same.map(t => ({ path: t.path, name: same.filter(o => o.device === t.device).length > 1 ? `${t.device} (${t.name})` : t.device }));
}

const compareView = createCompareView($('compare-pane'), api, {
  sources: overlappingSources,
  status: setStatus,
  addCombined: async (result, name) => {
    const entry: FolderTrack = { path: result.path, name, device: 'Combined', start: result.start, end: result.end, points: result.points, clips: clipsForTrack().length };
    folderTracks = [...folderTracks.filter(t => t.path !== result.path), entry];
    const select = $<HTMLSelectElement>('track-select');
    const option = document.createElement('option');
    option.value = result.path;
    option.textContent = `Combined: ${name}, ${entry.clips} clips`;
    select.append(option);
    await loadTrack(result.path);
    renderClipList();
  },
});

function setMode(next: Mode): void {
  mode = next;
  document.body.classList.toggle('mode-design', next === 'design');
  document.body.classList.toggle('mode-compare', next === 'compare');
  for (const name of ['sync', 'design', 'compare'] as Mode[]) {
    $(`tab-${name}`).setAttribute('aria-pressed', String(name === next));
  }
  $('video-pane').hidden = next === 'compare';
  $('map-pane').hidden = next !== 'sync';
  $('clip-panel').hidden = next === 'compare' || (next === 'design' ? true : folderTracks.length === 0);
  $('layers-panel').hidden = next !== 'design';
  $('inspector').hidden = next !== 'design';
  $('compare-pane').hidden = next !== 'compare';
  renderRotation();
  renderOverlayPreview();
  if (next === 'sync') map.invalidateSize();
  if (next === 'compare') compareView.show().catch(fail);
  if (next === 'design') {
    editor.refresh();
    if (!clip) setStatus('Open a folder or video to design over your own footage.');
  }
}

async function refreshLayouts(selected = ''): Promise<void> {
  const names = await api.listLayouts();
  const select = $<HTMLSelectElement>('layout-select');
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Saved layouts';
  select.replaceChildren(placeholder, ...names.map(name => {
    const option = document.createElement('option');
    option.value = name;
    option.textContent = name;
    return option;
  }));
  select.value = selected;
}

async function bringInLayout(imported: Template): Promise<void> {
  editor.replace(imported);
  setStatus(`Opened ${imported.name}.`);
}

function wireLayoutTools(): void {
  $<HTMLSelectElement>('layout-select').addEventListener('change', async event => {
    const name = (event.target as HTMLSelectElement).value;
    if (name) editor.replace(await api.loadLayout(name));
  });
  $('layout-save').addEventListener('click', () => {
    const input = $<HTMLInputElement>('layout-name');
    input.value = template.name;
    $<HTMLDialogElement>('layout-dialog').showModal();
  });
  $('layout-confirm').addEventListener('click', async () => {
    const name = $<HTMLInputElement>('layout-name').value.trim();
    if (!name) return;
    template.name = name;
    await api.saveLayout(name, template);
    await refreshLayouts(name);
    setStatus(`Saved ${name}`);
  });
  $('layout-delete').addEventListener('click', async () => {
    const name = $<HTMLSelectElement>('layout-select').value;
    if (!name) {
      setStatus('Choose a saved layout to delete first.');
      return;
    }
    await api.deleteLayout(name);
    await refreshLayouts();
    setStatus(`Deleted ${name}`);
  });
  $('layout-import').addEventListener('click', async () => {
    try {
      const imported = await api.importLayout();
      if (imported) await bringInLayout(imported);
    } catch (error) {
      fail(error);
    }
  });
  $('layout-export').addEventListener('click', async () => {
    const path = await api.exportLayout(template);
    if (path) setStatus(`Exported to ${path}`);
  });
  $('layout-reset').addEventListener('click', () => {
    editor.replace(layoutFor(track?.kind ?? 'cycling', overlayData?.available), true);
    setStatus(`Using the ${template.name} layout. It will change to suit whatever activity you open.`);
  });
  $('undo').addEventListener('click', () => editor.undo());
  $('redo').addEventListener('click', () => editor.redo());
}

function tick(now: number): void {
  if (!video.paused) {
    renderVideoPosition();
    followVideo();
    // Dials update ten times a second in the export, so match that here.
    if (now - lastOverlayDraw >= 100) {
      lastOverlayDraw = now;
      renderOverlayPreview();
    }
  }
  requestAnimationFrame(tick);
}

function renderGenerateButton(): void {
  const button = $<HTMLButtonElement>('generate');
  const count = sessionResults.size;
  button.disabled = !exporting && count === 0;
  button.textContent = exporting ? 'Cancel' : count > 0 ? `Generate ${count} overlay${count === 1 ? '' : 's'}` : 'Generate overlays';
}

function reportExport(): void {
  const all = [...exportProgress.values()];
  const finished = all.filter(p => p.state !== 'running').length;
  const active = all.filter(p => p.state === 'running').map(p => `${(p.fraction * 100).toFixed(0)}%`).join(', ');
  setStatus(`Generated ${finished} of ${sessionResults.size}${active ? ` (working on ${active})` : ''}`);
}

async function generateOverlays(options: { outDir?: string; limit?: number } = {}): Promise<void> {
  if (exporting) {
    await api.cancelOverlays();
    setStatus('Stopping after removing unfinished files');
    return;
  }
  if (!track) return;
  const items = [...sessionResults.values()].slice(0, options.limit ?? Infinity).map(r => ({
    clip: r.path,
    clipStart: r.clipStart,
    extraRotation: r.path === clip?.path ? (rotation() - clip.fileRotation + 360) % 360 : manualRotations.get(r.path) ?? 0,
  }));
  if (items.length === 0) return;
  // Generating is the end of the job, so a saved project shouldn't lose the review behind it.
  if (projectPath && dirty) await saveProject();
  exporting = true;
  exportProgress.clear();
  renderGenerateButton();
  const started = performance.now();
  try {
    const format = $<HTMLSelectElement>('overlay-format').value as OverlayBatch['format'];
    const result = await api.exportOverlays({ items, trackPath: track.path, format, template, outDir: options.outDir });
    const minutes = ((performance.now() - started) / 60000).toFixed(1);
    const reason = [...exportProgress.values()].find(p => p.state === 'failed')?.error;
    const failed = result.failed ? `, ${result.failed} failed${reason ? `: ${reason}` : ''}` : '';
    const blank = result.missingTiles ? ` ${result.missingTiles} map images couldn't load, so parts of a map are blank.` : '';
    setStatus(`${result.cancelled ? 'Cancelled. ' : ''}${result.done} overlays in ${minutes} min${failed}. Saved in ${result.outDir}.${blank}`);
  } catch (error) {
    fail(error);
  } finally {
    exporting = false;
    renderGenerateButton();
  }
}

function seekVideo(seconds: number): void {
  if (!clip) return;
  video.currentTime = Math.min(clip.duration, Math.max(0, seconds));
  renderVideoPosition();
  followVideo();
  renderOverlayPreview();
}

function setTrackTime(time: number): void {
  if (!track) return;
  const { t } = track.columns;
  trackTime = Math.min(t[t.length - 1], Math.max(t[0], time));
  if (clipStart != null) seekVideo(trackTime - clipStart);
  renderTrackPosition();
}

function applySync(start: number, how: 'auto' | 'manual', sure: boolean, detail: string): void {
  if (how === 'manual') markDirty();
  clipStart = start;
  method = how;
  confident = sure;
  // A correction has to survive moving on to the next clip in the list.
  if (clip && how === 'manual') {
    sessionResults.set(clip.path, {
      clockTime: clip.clockTime, turnR: 0, speedR: null, lead: 0, runnerUp: null, deviceName: '', source: '', motionSeconds: 0,
      ...sessionResults.get(clip.path),
      path: clip.path,
      clipStart: start,
      confident: true,
      basis: 'set by hand',
    });
    renderClipList();
  }
  renderSyncState(detail);
  followVideo();
}

function describeOffset(start: number): string {
  if (!clip || !track) return '';
  const intoTrack = clockText(start - track.columns.t[0], true);
  return `Video starts ${intoTrack} into the track (${utcText(start)} UTC).`;
}

/** Clips near the selected track, which is the set a day's sync works on. */
function clipsForTrack(): FolderClip[] {
  const selected = folderTracks.find(t => t.path === track?.path);
  if (!selected) return folderClips;
  return folderClips.filter(c => c.clockTime >= selected.start - TRACK_MATCH_MARGIN_S && c.clockTime <= selected.end + TRACK_MATCH_MARGIN_S);
}

const BASIS_TEXT: Record<SessionResult['basis'], string> = {
  'clock from other clips': 'Too little turning to check alone, so it uses the camera clock worked out from other clips.',
  'guided by other clips': 'Matched from camera movement and the rest of the day.',
  'own motion': 'Matched from camera movement.',
  'set by hand': 'Set by hand. This changes this clip only.',
  'from its own subtitles': 'Exact, from the GPS recorded with this clip.',
};

const CLIP_LABELS: Record<SessionResult['basis'], string> = {
  'clock from other clips': 'Estimated',
  'guided by other clips': 'Matched',
  'own motion': 'Matched',
  'set by hand': 'By hand',
  'from its own subtitles': 'Exact',
};

function applySessionResult(r: SessionResult): void {
  applySync(r.clipStart, r.basis === 'set by hand' ? 'manual' : 'auto', r.confident, `${BASIS_TEXT[r.basis]} ${describeOffset(r.clipStart)}`);
}

function renderProjectName(): void {
  $('project-name').textContent = `${projectTitle}${dirty ? ' •' : ''}`;
  $('project-name').title = projectPath ?? 'Not saved yet';
  document.title = `${projectTitle}${dirty ? ' •' : ''} - GPS Dials`;
}

function markDirty(): void {
  if (restoring || dirty) return;
  dirty = true;
  renderProjectName();
  void api.setDirty(true);
}

function markSaved(): void {
  dirty = false;
  renderProjectName();
  void api.setDirty(false);
}

function collectProject(): ProjectFile {
  return {
    version: 1,
    name: projectTitle,
    clips: folderClips,
    tracks: folderTracks,
    sessions: Object.fromEntries([...sessions].map(([path, results]) => [path, [...results.values()]])),
    autoStarts: Object.fromEntries(autoStarts),
    manualRotations: Object.fromEntries(manualRotations),
    template,
    format: $<HTMLSelectElement>('overlay-format').value,
    activeTrack: track?.path ?? null,
    activeClip: pendingClip ?? clip?.path ?? null,
  };
}

/** Returns whether it saved, which is false if someone cancels choosing where. */
async function saveProject(chooseFile = false): Promise<boolean> {
  let path = projectPath;
  if (!path || chooseFile) {
    path = await api.pickProjectSave(projectTitle);
    if (!path) return false;
  }
  projectPath = path;
  projectTitle = projectName(path);
  await api.writeProject(path, collectProject());
  markSaved();
  void refreshRecent();
  setStatus(`Saved ${projectTitle}`);
  return true;
}

/** Offers to save unfinished work. Returns false if the person would rather stay where they are. */
async function canLeaveProject(): Promise<boolean> {
  if (!dirty) return true;
  const choice = await api.confirmDiscard();
  if (choice === 'cancel') return false;
  return choice === 'save' ? saveProject() : true;
}

/** A full reload is what guarantees nothing from the last project lingers. */
async function startAfresh(nextProject?: string): Promise<void> {
  markSaved();
  await api.saveWorkingCopy(layoutFor('cycling'));
  try {
    if (nextProject) sessionStorage.setItem(PROJECT_TO_OPEN, nextProject);
  } catch {
    // Opening still works from the Project menu if this is unavailable.
  }
  location.reload();
}

async function newProject(): Promise<void> {
  if (await canLeaveProject()) await startAfresh();
}

async function openProject(path?: string): Promise<void> {
  if (!(await canLeaveProject())) return;
  const chosen = path ?? await api.pickProjectOpen();
  if (chosen) await startAfresh(chosen);
}

function trackLabel(t: FolderTrack): string {
  if (t.device === 'Combined') return `Combined: ${t.name}, ${t.clips} clips`;
  return `${t.device}, ${new Date(t.start * 1000).toISOString().slice(0, 10)}, ${t.clips} clips`;
}

async function loadProject(path: string): Promise<void> {
  try {
    const { project, missing } = await api.readProject(path);
    restoring = true;
    projectPath = path;
    projectTitle = projectName(path);
    const gone = new Set(missing);
    folderClips = project.clips.filter(c => !gone.has(c.path));
    folderTracks = project.tracks.filter(t => !gone.has(t.path));
    for (const [trackPath, results] of Object.entries(project.sessions)) {
      sessions.set(trackPath, new Map(results.filter(r => !gone.has(r.path)).map(r => [r.path, r])));
    }
    for (const [key, value] of Object.entries(project.autoStarts)) autoStarts.set(key, value);
    for (const [key, value] of Object.entries(project.manualRotations)) manualRotations.set(key, value);
    editor.replace(project.template, true);
    $<HTMLSelectElement>('overlay-format').value = project.format;
    $<HTMLSelectElement>('track-select').replaceChildren(...folderTracks.map(t => {
      const option = document.createElement('option');
      option.value = t.path;
      option.textContent = trackLabel(t);
      return option;
    }));
    if (folderClips.length > 0 || folderTracks.length > 0) document.body.classList.add('has-folder');
    const active = folderTracks.find(t => t.path === project.activeTrack) ?? folderTracks[0];
    if (active) await loadTrack(active.path);
    if (project.activeClip && !gone.has(project.activeClip) && folderClips.some(c => c.path === project.activeClip)) await loadClip(project.activeClip);
    setMode(mode);
    renderClipList();
    renderSyncState(clipStart != null ? $('sync-detail').textContent ?? undefined : undefined);
    const lost = missing.length === 1 ? ' 1 file has moved and was left out.' : missing.length ? ` ${missing.length} files have moved and were left out.` : '';
    setStatus(`Opened ${projectTitle}.${lost}`);
  } catch (error) {
    fail(error);
  } finally {
    restoring = false;
    markSaved();
  }
}

async function refreshRecent(): Promise<void> {
  const recent = await api.recentProjects();
  $('recent-heading').hidden = recent.length === 0;
  $('recent-list').replaceChildren(...recent.map(path => {
    const button = document.createElement('button');
    button.textContent = projectName(path);
    button.title = path;
    button.addEventListener('click', () => { void openProject(path); });
    return button;
  }));
}

/** Puts results saved beside the clips by earlier versions back in the list. */
function restoreSavedResults(): void {
  for (const c of folderClips) {
    const saved = c.saved;
    if (!saved) continue;
    const results = sessions.get(saved.track) ?? new Map<string, SessionResult>();
    sessions.set(saved.track, results);
    results.set(c.path, {
      clockTime: c.clockTime, turnR: 0, speedR: null, lead: 0, runnerUp: null, deviceName: '', source: '', motionSeconds: 0,
      path: c.path,
      clipStart: saved.clipStart,
      confident: saved.confident,
      basis: saved.basis ?? (saved.method === 'manual' ? 'set by hand' : 'guided by other clips'),
    });
    if (saved.manualRotation) manualRotations.set(c.path, saved.manualRotation);
    if (saved.autoStart != null) autoStarts.set(c.path, saved.autoStart);
  }
}

async function runAutoSync(): Promise<void> {
  if (syncing) {
    await api.cancelSync();
    return;
  }
  if (!track) return;
  const button = $<HTMLButtonElement>('auto-sync');
  syncing = true;
  button.textContent = 'Cancel';
  const started = performance.now();
  setStatus('Matching the camera\'s movement to the track');
  try {
    const seconds = () => ((performance.now() - started) / 1000).toFixed(0);
    const day = clipsForTrack();
    // A drone track belongs to one clip exactly, so it takes the same route as a whole folder.
    const droneClips = OWN_TRACK.test(track.path) ? (clip ? [clip.path] : day.map(c => c.path)) : null;
    if (droneClips || day.length > 1 || (day.length === 1 && !clip)) {
      const results = await api.autoSync({ clips: droneClips ?? day.map(c => c.path), trackPath: track.path });
      if (!results) {
        setStatus(SYNC_CANCELLED);
        return;
      }
      let kept = 0;
      for (const r of results) {
        autoStarts.set(r.path, r.clipStart);
        if (sessionResults.get(r.path)?.basis === 'set by hand') kept++;
        else sessionResults.set(r.path, r);
      }
      markDirty();
      renderClipList();
      const current = clip && sessionResults.get(clip.path);
      if (current) applySessionResult(current);
      else renderSyncState();
      const steady = results.filter(r => r.confident).length;
      setStatus(`${steady} of ${results.length} clips synced in ${seconds()} s${kept ? `, kept ${kept} set by hand` : ''}`);
    } else if (clip) {
      const r = await api.autoSync({ clip: clip.path, upsideDown: isInverted(), trackPath: track.path });
      if (!r) {
        setStatus(SYNC_CANCELLED);
        return;
      }
      const note = r.confident
        ? 'Matched from camera movement.'
        : 'Likely, but another match was close. Play it and check.';
      sessionResults.set(clip.path, { ...r, path: clip.path, basis: 'own motion' });
      autoStarts.set(clip.path, r.clipStart);
      markDirty();
      applySync(r.clipStart, 'auto', r.confident, `${note} ${describeOffset(r.clipStart)}`);
      renderClipList();
      setStatus(`Matched in ${seconds()} s, r=${r.turnR.toFixed(2)}, lead ${r.lead.toFixed(2)}`);
    }
  } catch (error) {
    fail(error);
  } finally {
    syncing = false;
    button.textContent = clipsForTrack().length > 1 ? 'Auto-sync all clips' : 'Auto-sync';
  }
}

/** The total clockwise turn on screen. */
function rotation(): number {
  if (!clip) return 0;
  const auto = $<HTMLInputElement>('auto-rotate').checked && clip.upsideDown ? 180 : 0;
  return (clip.fileRotation + auto + manualRotation) % 360;
}

/** Whether the picture is inverted compared with how the file says to show it. */
function isInverted(): boolean {
  if (!clip) return false;
  return (rotation() - clip.fileRotation + 360) % 360 === 180;
}

function renderRotation(): void {
  const stage = $('video-stage');
  const degrees = rotation();
  const sideways = degrees % 180 !== 0;
  // A sideways picture has to fit the stage the other way round.
  video.style.width = sideways ? `${stage.clientHeight}px` : '';
  video.style.height = sideways ? `${stage.clientWidth}px` : '';
  video.style.transform = `translate(-50%, -50%) rotate(${degrees}deg)`;
  const corrected = clip?.upsideDown && $<HTMLInputElement>('auto-rotate').checked;
  $('rotate-note').textContent = corrected ? 'Turned the right way up' : clip?.upsideDown ? 'Looks upside down' : '';
  renderOverlayPreview();
}

function renderClipList(): void {
  const list = clipsForTrack();
  $('clip-count').textContent = `${list.length} clip${list.length === 1 ? '' : 's'}`;
  const items = list.map(c => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const r = sessionResults.get(c.path);
    // Once synced this is the corrected time, not what the camera's clock said.
    const start = new Date((r?.clipStart ?? c.clockTime) * 1000).toLocaleTimeString('en-GB');
    const name = document.createElement('span');
    name.className = 'clip-start';
    name.textContent = start;
    const length = document.createElement('span');
    length.className = 'clip-length';
    length.textContent = clockText(c.duration);
    const state = document.createElement('span');
    const estimated = r?.basis === 'clock from other clips';
    state.className = `clip-state ${r ? (estimated || !r.confident ? 'warn' : r.basis === 'set by hand' ? '' : 'good') : ''}`;
    state.textContent = r ? (r.confident ? CLIP_LABELS[r.basis] : 'Check') : 'Not synced';
    button.title = `${c.name}\nStarts ${start}${r ? '' : " by the camera's clock"}, runs for ${clockText(c.duration)}`;
    button.append(name, length, state);
    if (c.path === (pendingClip ?? clip?.path)) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => { void selectClip(c.path); });
    item.append(button);
    return item;
  });
  $('clip-list').replaceChildren(...items);

  const all = [...sessionResults.values()];
  const count = (basis: SessionResult['basis'][]) => all.filter(r => basis.includes(r.basis)).length;
  $('clip-summary').textContent = all.length
    ? `${count(['own motion', 'guided by other clips', 'from its own subtitles'])} matched, ${count(['clock from other clips'])} estimated, ${count(['set by hand'])} by hand. Fixing a clip changes that clip only.`
    : track ? 'Not synced with this GPS source yet. Press Auto-sync all clips.' : '';
}

async function selectClip(path: string): Promise<void> {
  try {
    await loadClip(path);
    renderClipList();
  } catch (error) {
    fail(error);
  }
}

async function openFolder(dir: string): Promise<void> {
  try {
    setStatus('Looking through the folder');
    const found = await api.scanFolder(dir);
    folderClips = found.clips;
    folderTracks = found.tracks;
    sessions.clear();
    autoStarts.clear();
    manualRotations.clear();
    restoreSavedResults();
    markDirty();
    if (folderTracks.length === 0) {
      setStatus('No FIT or SRT tracks found in that folder.');
      return;
    }
    const select = $<HTMLSelectElement>('track-select');
    select.replaceChildren(...folderTracks.map(t => {
      const option = document.createElement('option');
      option.value = t.path;
      const day = new Date(t.start * 1000).toISOString().slice(0, 10);
      option.textContent = `${t.device}, ${day}, ${t.clips} clips`;
      return option;
    }));
    $('track-picker').hidden = false;
    $('track-name').hidden = true;
    document.body.classList.add('has-folder');
    await loadTrack(folderTracks[0].path);
    // Puts every panel right for the current tab, as the folder may be opened from any of them.
    setMode(mode);
    map.invalidateSize();
    renderClipList();
    renderSyncState();
    setStatus(`Found ${folderClips.length} videos and ${folderTracks.length} tracks`);
  } catch (error) {
    fail(error);
  }
}

function toggleLock(): void {
  if (!clip || !track) return;
  if (clipStart != null) {
    clipStart = null;
    confident = false;
    renderSyncState('Video and track now move separately. Line them up, then match them.');
    return;
  }
  const start = clipStartFromPin(video.currentTime, trackTime);
  applySync(start, 'manual', true, `Matched by hand. ${describeOffset(start)}`);
}

/** Makes sure a track can be chosen again later, however it was opened. */
function listTrack(loaded: Track): void {
  const select = $<HTMLSelectElement>('track-select');
  $('track-picker').hidden = false;
  $('track-name').hidden = true;
  if ([...select.options].some(o => o.value === loaded.path)) return;
  const { t } = loaded.columns;
  const device = loaded.kind === 'drone' ? 'Drone' : loaded.kind === 'other' ? 'Track' : loaded.kind[0].toUpperCase() + loaded.kind.slice(1);
  const day = new Date(t[0] * 1000).toISOString().slice(0, 10);
  folderTracks = [...folderTracks, { path: loaded.path, name: loaded.name, device, start: t[0], end: t[t.length - 1], points: t.length, clips: 0 }];
  const option = document.createElement('option');
  option.value = loaded.path;
  option.textContent = `${device}, ${day}, ${loaded.name}`;
  select.append(option);
}

/** A clip opened on its own joins the list, so it can be synced and generated like any other. */
function listClip(loaded: Clip): void {
  if (folderClips.some(c => c.path === loaded.path)) return;
  folderClips = [...folderClips, { path: loaded.path, name: loaded.name, clockTime: loaded.clockTime, duration: loaded.duration }]
    .sort((a, b) => a.clockTime - b.clockTime);
}

/** A clip's own drone track beats whatever is selected, unless that track covers the clip anyway. */
function shouldUseOwnTrack(loaded: Clip): boolean {
  if (!loaded.ownTrack || loaded.ownTrack === track?.path) return false;
  if (!track || OWN_TRACK.test(track.path)) return true;
  const { t } = track.columns;
  return loaded.clockTime < t[0] - TRACK_MATCH_MARGIN_S || loaded.clockTime > t[t.length - 1] + TRACK_MATCH_MARGIN_S;
}

async function loadTrack(path: string): Promise<void> {
  setStatus('Reading track');
  track = await api.loadTrack(path);
  const { columns } = track;
  $('track-name').textContent = track.name;
  listTrack(track);
  $<HTMLSelectElement>('track-select').value = path;
  sessionResults = sessions.get(path) ?? new Map();
  sessions.set(path, sessionResults);
  overlayData = prepareOverlayData(columns, template.gradientSpan, template.launchSpeed);
  clipStart = null;
  confident = false;
  const best = layoutFor(track.kind, overlayData.available);
  if (template.auto && (template.name !== best.name || JSON.stringify(template.widgets) !== JSON.stringify(best.widgets))) editor.replace(best, true);
  else editor.refresh();
  const points = columns.t.map((_, i) => [columns.lat[i], columns.lon[i]] as L.LatLngTuple);
  line.setLatLngs(points);
  map.invalidateSize();
  map.fitBounds(line.getBounds(), { padding: [24, 24] });
  trackScrub.max = String(columns.t[columns.t.length - 1] - columns.t[0]);
  trackScrub.disabled = false;
  trackTime = columns.t[0];
  placeTrackAtClipClock();
  renderTrackPosition();
  const held = clip && sessionResults.get(clip.path);
  if (held) applySessionResult(held);
  else applySaved();
  renderSyncState(clipStart != null ? $('sync-detail').textContent ?? undefined : undefined);
  setStatus('');
}

/** Before any sync, start the map near the clip's own timestamp if it falls in the track. */
function placeTrackAtClipClock(): void {
  if (!clip || !track) return;
  const { t } = track.columns;
  if (clip.clockTime >= t[0] && clip.clockTime <= t[t.length - 1]) trackTime = clip.clockTime;
}

function applySaved(): void {
  const saved = clip?.saved;
  if (saved && !manualRotations.has(clip!.path)) {
    manualRotation = saved.manualRotation ?? 0;
    renderRotation();
  }
  if (!saved || !track || saved.track !== track.path) return;
  applySync(saved.clipStart, saved.method, saved.confident, `Saved sync loaded. ${describeOffset(saved.clipStart)}`);
}

function showPreviewStatus(name: string, fraction: number | null): void {
  $('preview-status').hidden = false;
  $('preview-name').textContent = name;
  $('preview-percent').textContent = fraction == null ? '' : `${(fraction * 100).toFixed(0)}%`;
  $('preview-bar').style.width = `${(fraction ?? 0) * 100}%`;
}

async function loadClip(path: string): Promise<void> {
  // A later click wins, so a slow preview finishing late can't replace the clip now chosen.
  const request = ++clipRequest;
  pendingClip = path;
  renderClipList();
  const name = path.split(/[\\/]/).pop()!;
  // Clips with a preview already open at once, so don't flash the panel for those.
  const timer = setTimeout(() => {
    if (request === clipRequest) showPreviewStatus(name, null);
  }, PREVIEW_PANEL_DELAY_MS);
  let loaded: Clip;
  try {
    loaded = await api.loadClip(path);
  } catch (error) {
    if (request === clipRequest) {
      pendingClip = null;
      $('preview-status').hidden = true;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (request !== clipRequest) return;
  pendingClip = null;
  $('preview-status').hidden = true;
  const keepPlaying = !video.paused;
  clip = loaded;
  clipSensors = null;
  void api.readSensors(loaded.path).then(sensors => {
    if (clip?.path !== loaded.path) return;
    clipSensors = sensors;
    editor.refresh();
    renderOverlayPreview();
  });
  listClip(loaded);
  clipStart = null;
  confident = false;
  manualRotation = manualRotations.get(path) ?? 0;
  $('clip-name').textContent = loaded.name;
  $('video-empty').hidden = true;
  video.src = loaded.url;
  if (keepPlaying) void video.play();
  videoScrub.max = String(loaded.duration);
  videoScrub.disabled = false;
  renderRotation();
  if (shouldUseOwnTrack(loaded)) await loadTrack(loaded.ownTrack!);
  placeTrackAtClipClock();
  renderVideoPosition();
  renderTrackPosition();
  renderClipList();
  const fromDay = sessionResults.get(loaded.path);
  if (fromDay) applySessionResult(fromDay);
  else applySaved();
  renderSyncState(clipStart != null ? $('sync-detail').textContent ?? undefined : undefined);
  setStatus(loaded.proxyMethod === 'cached' ? '' : `Preview built in ${loaded.proxySeconds.toFixed(0)} s (${loaded.proxyMethod})`);
}

async function loadPaths(paths: string[]): Promise<void> {
  try {
    for (const path of paths) {
      if (/\.(fit|srt)$/i.test(path)) await loadTrack(path);
      else await loadClip(path);
    }
  } catch (error) {
    fail(error);
  }
}

$('open-folder').addEventListener('click', async () => {
  const dir = await api.pickFolder();
  if (dir) await openFolder(dir);
});
$<HTMLSelectElement>('track-select').addEventListener('change', async event => {
  await loadTrack((event.target as HTMLSelectElement).value);
  renderClipList();
});
$('apply-shift').addEventListener('click', applyShiftToEstimated);
$('show-dials').addEventListener('change', renderOverlayPreview);
$('generate').addEventListener('click', () => { void generateOverlays(); });
video.addEventListener('loadedmetadata', () => { renderOverlayPreview(); });
video.addEventListener('seeked', renderOverlayPreview);
$('map-settings').addEventListener('click', async () => {
  $<HTMLInputElement>('mapbox-token').value = await api.getMapToken();
  $('settings-error').textContent = '';
  $<HTMLDialogElement>('settings-dialog').showModal();
  $('mapbox-token').focus();
});
$('settings-save').addEventListener('click', async event => {
  event.preventDefault();
  try {
    await api.setMapToken($<HTMLInputElement>('mapbox-token').value);
    await buildMapLayers();
    $<HTMLDialogElement>('settings-dialog').close();
  } catch (error) {
    $('settings-error').textContent = String((error as Error)?.message ?? error).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
  }
});
$('rotate').addEventListener('click', () => {
  manualRotation = (manualRotation + 90) % 360;
  if (clip) manualRotations.set(clip.path, manualRotation);
  markDirty();
  renderRotation();
});
$('auto-rotate').addEventListener('change', renderRotation);

$('open-clip').addEventListener('click', async () => {
  const path = await api.pickFile('clip');
  if (path) await loadPaths([path]);
});
$('open-track').addEventListener('click', async () => {
  const path = await api.pickFile('track');
  if (path) await loadPaths([path]);
});

$('play').addEventListener('click', () => { if (clip) void (video.paused ? video.play() : video.pause()); });
video.addEventListener('play', () => { $('play').textContent = 'Pause'; });
video.addEventListener('pause', () => { $('play').textContent = 'Play'; });
// Loading a new clip stops playback without firing `pause`.
video.addEventListener('emptied', () => { $('play').textContent = video.paused ? 'Play' : 'Pause'; });
video.addEventListener('seeked', renderVideoPosition);

videoScrub.addEventListener('input', () => { draggingVideo = true; seekVideo(Number(videoScrub.value)); });
videoScrub.addEventListener('change', () => { draggingVideo = false; });
trackScrub.addEventListener('input', () => { if (track) setTrackTime(track.columns.t[0] + Number(trackScrub.value)); });

document.querySelectorAll<HTMLElement>('[data-frames]').forEach(button => {
  button.addEventListener('click', () => {
    if (clip) seekVideo(video.currentTime + Number(button.dataset.frames) / clip.fps);
  });
});
document.querySelectorAll<HTMLElement>('[data-track-step]').forEach(button => {
  button.addEventListener('click', () => setTrackTime(trackTime + Number(button.dataset.trackStep)));
});
document.querySelectorAll<HTMLElement>('[data-nudge]').forEach(button => {
  button.addEventListener('click', () => {
    if (clipStart == null) return;
    applySync(clipStart + Number(button.dataset.nudge), 'manual', true, `Adjusted by hand. ${describeOffset(clipStart + Number(button.dataset.nudge))}`);
  });
});

map.on('click', event => {
  if (!track) return;
  setTrackTime(track.columns.t[nearestIndex(track.columns, event.latlng.lat, event.latlng.lng)]);
});

$('auto-sync').addEventListener('click', () => { void runAutoSync(); });
$('lock').addEventListener('click', toggleLock);
const closeMenu = () => { $<HTMLDetailsElement>('project-menu').open = false; };
$('project-new').addEventListener('click', () => { closeMenu(); void newProject(); });
$('project-open').addEventListener('click', () => { closeMenu(); void openProject(); });
$('project-save').addEventListener('click', () => { closeMenu(); void saveProject(); });
$('project-save-as').addEventListener('click', () => { closeMenu(); void saveProject(true); });
document.addEventListener('click', event => {
  if (!(event.target as HTMLElement).closest('#project-menu')) closeMenu();
});
api.onSaveThenClose(async () => {
  if (await saveProject()) await api.closeWindow();
});

document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
    const action = { s: () => saveProject(), o: () => openProject(), n: () => newProject() }[event.key.toLowerCase()];
    if (action) {
      event.preventDefault();
      void action();
      return;
    }
  }
  if (mode === 'design' && editor.keydown(event)) {
    event.preventDefault();
    return;
  }
  if (event.target instanceof HTMLButtonElement || /^(INPUT|SELECT)$/.test((event.target as HTMLElement).tagName)) return;
  if (event.code === 'Space') {
    event.preventDefault();
    $('play').click();
  } else if (event.key === ',' && clip) {
    seekVideo(video.currentTime - 1 / clip.fps);
  } else if (event.key === '.' && clip) {
    seekVideo(video.currentTime + 1 / clip.fps);
  }
});

document.addEventListener('dragover', event => {
  event.preventDefault();
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', event => {
  if (!event.relatedTarget) document.body.classList.remove('dragging');
});
document.addEventListener('drop', event => {
  event.preventDefault();
  document.body.classList.remove('dragging');
  void loadPaths(Array.from(event.dataTransfer?.files ?? []).map(f => api.pathForFile(f)));
});

api.onProxyProgress((fraction, path) => {
  if (path === pendingClip) showPreviewStatus(path.split(/[\\/]/).pop()!, fraction);
});
api.onSyncProgress((done, total) => setStatus(`Matching clip ${done} of ${total}`));
api.onOverlayProgress(progress => {
  exportProgress.set(progress.clip, progress);
  reportExport();
});
window.app = {
  loadPaths,
  openFolder,
  selectClip,
  generate: generateOverlays,
  saveProjectTo: async path => {
    projectPath = path;
    return saveProject();
  },
  openProject,
  newProject,
  setMode,
  template: () => template,
  importLayoutFile: async path => bringInLayout(await api.importLayoutPath(path)),
  selectWidget: id => editor.select(id),
  state: () => ({ clipStart, method, confident, trackTime, videoTime: video.currentTime, readyState: video.readyState, videoWidth: video.videoWidth, videoError: video.error?.message ?? null, rotation: rotation(), upsideDown: clip?.upsideDown, fileRotation: clip?.fileRotation }),
};
window.addEventListener('resize', () => {
  map.invalidateSize();
  renderRotation();
  editor.renderSelection();
});
for (const name of ['sync', 'design', 'compare'] as Mode[]) {
  $(`tab-${name}`).addEventListener('click', () => setMode(name));
}
wireLayoutTools();
void refreshLayouts();
void (async () => {
  restoring = true;
  const saved = await api.loadWorkingCopy();
  // Restoring what was there isn't an edit, so a layout on auto stays on auto.
  if (saved) editor.replace(normaliseTemplate(saved), true);
  restoring = false;
  renderProjectName();
  void api.setDirty(false);
  void refreshRecent();
  let pending: string | null = null;
  try {
    pending = sessionStorage.getItem(PROJECT_TO_OPEN);
    sessionStorage.removeItem(PROJECT_TO_OPEN);
  } catch {
    pending = null;
  }
  if (pending) await loadProject(pending);
})();
void buildMapLayers();
// Canvas text won't load a web font by itself, and would draw the first dials in a fallback.
void Promise.all([
  document.fonts.load(`italic 700 40px ${DISPLAY_FONT}`),
  document.fonts.load(`600 40px ${DISPLAY_FONT}`),
]).then(renderOverlayPreview);
renderSyncState();
requestAnimationFrame(tick);
