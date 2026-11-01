import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';
import { clipStartFromPin, indexAtTime, nearestIndex, positionAt, type TrackColumns } from '../../sync/timeline.ts';
import type { SessionResult, SyncResult } from '../../sync/engine.ts';
import type { FolderClip, FolderTrack } from '../folder.ts';

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
  proxyMethod: string;
  proxySeconds: number;
  saved: SavedSync | null;
}

interface Track {
  path: string;
  name: string;
  columns: TrackColumns;
}

interface SavedSync {
  version: 1;
  track: string;
  clipStart: number;
  method: 'auto' | 'manual';
  confident: boolean;
  /** Turn added by hand, on top of the file's own and any auto-correction. */
  manualRotation?: number;
}

declare global {
  interface Window {
    gpsDials: {
      pickFile(kind: 'clip' | 'track'): Promise<string | null>;
      pickFolder(): Promise<string | null>;
      scanFolder(dir: string): Promise<{ clips: FolderClip[]; tracks: FolderTrack[] }>;
      loadTrack(path: string): Promise<Track>;
      loadClip(path: string): Promise<Clip>;
      autoSync(job: { clip: string; upsideDown?: boolean; trackPath: string }): Promise<SyncResult>;
      autoSync(job: { clips: string[]; trackPath: string }): Promise<SessionResult[]>;
      saveSync(clip: string, data: SavedSync): Promise<string>;
      pathForFile(file: File): string;
      onProxyProgress(listener: (fraction: number) => void): void;
      onSyncProgress(listener: (done: number, total: number) => void): void;
    };
    app: { loadPaths(paths: string[]): Promise<void>; openFolder(dir: string): Promise<void>; selectClip(path: string): Promise<void>; state(): unknown };
  }
}

const MPH_PER_MS = 2.23694;
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

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
const sessionResults = new Map<string, SessionResult>();

const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([52, 0], 5);
const tiles = L.tileLayer(TILE_URL, {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
let tileFailures = 0;
tiles.on('tileerror', () => {
  // The track still works without a basemap, which is the failure that broke VIRB's sync screen.
  if (++tileFailures === 4) showMapNote('Map images unavailable. The track still works.');
});
tiles.on('tileload', () => {
  tileFailures = 0;
  $('map-note').hidden = true;
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
  $<HTMLButtonElement>('auto-sync').disabled = !(track && (clip || folderClips.length > 0));
  $<HTMLButtonElement>('save').disabled = !linked;
  renderClipLine();
}

/** After a sync, the map follows the video. */
function followVideo(): void {
  if (clipStart == null || !track) return;
  trackTime = clipStart + video.currentTime;
  renderTrackPosition();
}

function tick(): void {
  if (!video.paused) {
    renderVideoPosition();
    followVideo();
  }
  requestAnimationFrame(tick);
}

function seekVideo(seconds: number): void {
  if (!clip) return;
  video.currentTime = Math.min(clip.duration, Math.max(0, seconds));
  renderVideoPosition();
  followVideo();
}

function setTrackTime(time: number): void {
  if (!track) return;
  const { t } = track.columns;
  trackTime = Math.min(t[t.length - 1], Math.max(t[0], time));
  if (clipStart != null) seekVideo(trackTime - clipStart);
  renderTrackPosition();
}

function applySync(start: number, how: 'auto' | 'manual', sure: boolean, detail: string): void {
  clipStart = start;
  method = how;
  confident = sure;
  // A correction has to survive moving on to the next clip in the list.
  const held = clip && sessionResults.get(clip.path);
  if (held && how === 'manual') {
    sessionResults.set(held.path, { ...held, clipStart: start, confident: true, basis: 'set by hand' });
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
  const margin = 2 * 3600 + 300;
  return folderClips.filter(c => c.clockTime >= selected.start - margin && c.clockTime <= selected.end + margin);
}

const BASIS_TEXT: Record<SessionResult['basis'], string> = {
  'clock from other clips': 'Too little turning to check alone, so it uses the camera clock worked out from other clips.',
  'guided by other clips': 'Matched from camera movement and the rest of the day.',
  'own motion': 'Matched from camera movement.',
  'set by hand': 'Set by hand.',
};

function applySessionResult(r: SessionResult): void {
  applySync(r.clipStart, r.basis === 'set by hand' ? 'manual' : 'auto', r.confident, `${BASIS_TEXT[r.basis]} ${describeOffset(r.clipStart)}`);
}

async function saveAll(): Promise<void> {
  if (!track) return;
  const trackPath = track.path;
  const saved = (r: SessionResult): SavedSync => ({
    version: 1,
    track: trackPath,
    clipStart: r.clipStart,
    method: r.basis === 'set by hand' ? 'manual' : 'auto',
    confident: r.confident,
    manualRotation: r.path === clip?.path ? manualRotation : 0,
  });
  for (const r of sessionResults.values()) await api.saveSync(r.path, saved(r));
  setStatus(`Sync saved next to ${sessionResults.size} videos`);
}

async function runAutoSync(): Promise<void> {
  if (!track) return;
  const button = $<HTMLButtonElement>('auto-sync');
  button.disabled = true;
  button.textContent = 'Matching...';
  const started = performance.now();
  setStatus('Matching the camera\'s movement to the track');
  try {
    const seconds = () => ((performance.now() - started) / 1000).toFixed(0);
    const day = clipsForTrack();
    if (day.length > 1) {
      const results = await api.autoSync({ clips: day.map(c => c.path), trackPath: track.path });
      sessionResults.clear();
      for (const r of results) sessionResults.set(r.path, r);
      renderClipList();
      const current = clip && sessionResults.get(clip.path);
      if (current) applySessionResult(current);
      else renderSyncState();
      const steady = results.filter(r => r.confident).length;
      setStatus(`${steady} of ${results.length} clips synced in ${seconds()} s`);
    } else if (clip) {
      const r = await api.autoSync({ clip: clip.path, upsideDown: isInverted(), trackPath: track.path });
      const note = r.confident
        ? 'Matched from camera movement.'
        : 'Likely, but another match was close. Play it and check.';
      applySync(r.clipStart, 'auto', r.confident, `${note} ${describeOffset(r.clipStart)}`);
      setStatus(`Matched in ${seconds()} s, r=${r.turnR.toFixed(2)}, lead ${r.lead.toFixed(2)}`);
    }
  } catch (error) {
    fail(error);
  } finally {
    button.textContent = 'Auto-sync';
    button.disabled = false;
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
}

function renderClipList(): void {
  const list = clipsForTrack();
  $('clip-count').textContent = `${list.length} clip${list.length === 1 ? '' : 's'}`;
  const items = list.map(c => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    const name = document.createElement('span');
    name.textContent = new Date(c.clockTime * 1000).toISOString().slice(11, 19);
    name.title = c.name;
    const state = document.createElement('span');
    const r = sessionResults.get(c.path);
    state.className = `clip-state ${r ? (r.confident ? 'good' : 'warn') : ''}`;
    const label = r?.basis === 'set by hand' ? 'by hand' : r?.basis === 'clock from other clips' ? 'from day clock' : r?.confident ? 'synced' : 'check';
    state.textContent = r ? label : clockText(c.duration);
    button.append(name, state);
    if (c.path === clip?.path) button.setAttribute('aria-current', 'true');
    button.addEventListener('click', () => { void selectClip(c.path); });
    item.append(button);
    return item;
  });
  $('clip-list').replaceChildren(...items);
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
    sessionResults.clear();
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
    select.hidden = false;
    $('open-track').hidden = true;
    $('track-name').hidden = true;
    $('clip-panel').hidden = false;
    document.body.classList.add('has-folder');
    await loadTrack(folderTracks[0].path);
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

async function loadTrack(path: string): Promise<void> {
  setStatus('Reading track');
  track = await api.loadTrack(path);
  const { columns } = track;
  $('track-name').textContent = track.name;
  const points = columns.t.map((_, i) => [columns.lat[i], columns.lon[i]] as L.LatLngTuple);
  line.setLatLngs(points);
  map.invalidateSize();
  map.fitBounds(line.getBounds(), { padding: [24, 24] });
  trackScrub.max = String(columns.t[columns.t.length - 1] - columns.t[0]);
  trackScrub.disabled = false;
  trackTime = columns.t[0];
  placeTrackAtClipClock();
  renderTrackPosition();
  applySaved();
  renderSyncState();
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
  if (saved) {
    manualRotation = saved.manualRotation ?? 0;
    renderRotation();
  }
  if (!saved || !track || saved.track !== track.path) return;
  applySync(saved.clipStart, saved.method, saved.confident, `Saved sync loaded. ${describeOffset(saved.clipStart)}`);
}

async function loadClip(path: string): Promise<void> {
  setStatus('Preparing video');
  const loaded = await api.loadClip(path);
  clip = loaded;
  clipStart = null;
  confident = false;
  manualRotation = 0;
  $('clip-name').textContent = loaded.name;
  $('video-empty').hidden = true;
  video.src = loaded.url;
  videoScrub.max = String(loaded.duration);
  videoScrub.disabled = false;
  renderRotation();
  placeTrackAtClipClock();
  renderVideoPosition();
  renderTrackPosition();
  const fromDay = sessionResults.get(loaded.path);
  if (fromDay) applySessionResult(fromDay);
  applySaved();
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
  sessionResults.clear();
  await loadTrack((event.target as HTMLSelectElement).value);
  renderClipList();
});
$('rotate').addEventListener('click', () => {
  manualRotation = (manualRotation + 90) % 360;
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
$('save').addEventListener('click', async () => {
  if (sessionResults.size > 0) {
    await saveAll();
    return;
  }
  if (!clip || !track || clipStart == null) return;
  await api.saveSync(clip.path, { version: 1, track: track.path, clipStart, method, confident, manualRotation });
  setStatus('Sync saved next to the video');
});

document.addEventListener('keydown', event => {
  if (event.target instanceof HTMLButtonElement) return;
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

api.onProxyProgress(fraction => setStatus(`Preparing video ${(fraction * 100).toFixed(0)}%`));
api.onSyncProgress((done, total) => setStatus(`Matching clip ${done} of ${total}`));
window.app = {
  loadPaths,
  openFolder,
  selectClip,
  state: () => ({ clipStart, method, confident, trackTime, videoTime: video.currentTime, readyState: video.readyState, videoWidth: video.videoWidth, videoError: video.error?.message ?? null, rotation: rotation(), upsideDown: clip?.upsideDown, fileRotation: clip?.fileRotation }),
};
window.addEventListener('resize', () => {
  map.invalidateSize();
  renderRotation();
});
renderSyncState();
requestAnimationFrame(tick);
