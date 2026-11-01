import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, delimiter, extname, join } from 'node:path';
import { Readable } from 'node:stream';
import { BrowserWindow, app, dialog, ipcMain, protocol, safeStorage, session, shell, utilityProcess } from 'electron';
import { COMBINED_EXTENSION, writeCombined } from '../activity/combined.ts';
import { toColumns } from '../activity/columns.ts';
import { activityKind, readActivity } from '../activity/index.ts';
import { clipClockTime } from '../sync/engine.ts';
import { displayRotation, isUpsideDown } from '../sync/orientation.ts';
import {
  altitudeProfiles, checkAgainstTerrain, combineSources, compareSources, summarise, terrainAscent, terrainSamples, type Choices, type Source,
} from '../compare/compare.ts';
import { TERRAIN_CREDIT, fetchTerrain } from '../compare/terrain.ts';
import type { Template } from '../overlay/template.ts';
import { scanFolder } from './folder.ts';
import { deleteLayout, importLayout, listLayouts, loadLayout, loadWorkingCopy, saveLayout, saveWorkingCopy } from './layouts.ts';
import { cancelOverlays, renderBatch, type OverlayBatch } from './overlay-queue.ts';
import { PROJECT_EXTENSION, addRecent, missingFiles, parseProject } from './project.ts';
import { ensureProxy } from './proxy.ts';

const MEDIA_SCHEME = 'gpsdials-media';
const TILE_HOST = 'tile.openstreetmap.org';
const TERRAIN_SPACING_M = 200;
const PROJECT_URL = 'https://github.com/dirk1978/gps-dials';

// Everything spawned from here, including the worker processes, finds these through the environment.
process.env.GPS_DIALS_FONT_DIR = join(__dirname, 'fonts');
if (app.isPackaged) process.env.PATH = `${join(process.resourcesPath, 'bin')}${delimiter}${process.env.PATH}`;

protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { stream: true, supportFetchAPI: true, standard: true, secure: true } }]);

let window: BrowserWindow;
const proxies = new Map<string, string>();
/** Whether the open project has changes that aren't saved. */
let dirty = false;

/** Ends the auto-sync in progress, leaving whatever was synced before it. */
let stopSync: (() => void) | null = null;

const UNSAVED_CHOICES = ['save', 'discard', 'cancel'] as const;
const UNSAVED_PROMPT = {
  type: 'question' as const,
  message: 'Save changes to this project?',
  detail: 'Your sync, corrections and layout will be lost if you don\'t save them.',
  buttons: ['Save', 'Don\'t save', 'Cancel'],
  defaultId: 0,
  cancelId: 2,
};

function serveProxy(request: Request): Response {
  const path = proxies.get(new URL(request.url).hostname);
  if (!path) return new Response('Not found', { status: 404 });
  const size = statSync(path).size;
  const range = request.headers.get('range')?.match(/bytes=(\d+)-(\d*)/);
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  const headers = new Headers({
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Content-Length': String(end - start + 1),
  });
  if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
  const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream;
  return new Response(body, { status: range ? 206 : 200, headers });
}

function probe(clip: string): { duration: number; fps: number } {
  const out = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=r_frame_rate:format=duration', '-of', 'json', clip]).toString();
  const info = JSON.parse(out);
  const [num, den] = info.streams[0].r_frame_rate.split('/').map(Number);
  return { duration: Number(info.format.duration), fps: num / (den || 1) };
}

const sidecarPath = (clip: string) => `${clip}.gpsdials.json`;

/** A subtitle track saved beside a clip under the same name, as DJI drones write them. */
function ownTrackFor(clip: string): string | null {
  const stem = clip.slice(0, -extname(clip).length);
  return [`${stem}.SRT`, `${stem}.srt`].find(path => existsSync(path)) ?? null;
}
const tokenPath = () => join(app.getPath('userData'), 'mapbox-token.bin');

function readMapToken(): string {
  if (!existsSync(tokenPath()) || !safeStorage.isEncryptionAvailable()) return '';
  return safeStorage.decryptString(readFileSync(tokenPath()));
}

function saveMapToken(token: string): void {
  if (!token) {
    rmSync(tokenPath(), { force: true });
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('This PC can\'t store the token securely, so it wasn\'t saved.');
  writeFileSync(tokenPath(), safeStorage.encryptString(token));
}

function registerIpc(): void {
  ipcMain.handle('get-map-token', readMapToken);
  ipcMain.handle('set-map-token', (_event, token: string) => saveMapToken(token.trim()));

  ipcMain.handle('pick-file', async (_event, kind: 'clip' | 'track') => {
    const filters = kind === 'clip'
      ? [{ name: 'Video', extensions: ['mp4', 'mov', 'insv'] }]
      : [{ name: 'Track', extensions: ['fit', 'srt'] }];
    const { canceled, filePaths } = await dialog.showOpenDialog(window, { properties: ['openFile'], filters });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle('load-track', (_event, path: string) => {
    const points = readActivity(path);
    if (points.length < 2) throw new Error('That file has no usable GPS track.');
    return { path, name: basename(path), columns: toColumns(points), kind: activityKind(path) };
  });

  ipcMain.handle('load-clip', async (event, clip: string) => {
    const { duration, fps } = probe(clip);
    const started = Date.now();
    const proxy = await ensureProxy(clip, join(app.getPath('userData'), 'proxies'), duration, fraction => {
      event.sender.send('proxy-progress', fraction, clip);
    });
    const id = `p${proxies.size}`;
    proxies.set(id, proxy.path);
    const saved = existsSync(sidecarPath(clip)) ? JSON.parse(readFileSync(sidecarPath(clip), 'utf8')) : null;
    return {
      path: clip,
      name: basename(clip),
      url: `${MEDIA_SCHEME}://${id}/clip.mp4`,
      duration,
      fps,
      ownTrack: ownTrackFor(clip),
      fileRotation: displayRotation(clip),
      upsideDown: await isUpsideDown(clip),
      clockTime: clipClockTime(clip),
      proxyMethod: proxy.method,
      proxySeconds: (Date.now() - started) / 1000,
      saved,
    };
  });

  const readSources = (items: { path: string; name: string }[]): Source[] => items.map(i => ({ name: i.name, points: readActivity(i.path) }));

  ipcMain.handle('compare-sources', (_event, items: { path: string; name: string }[]) => {
    const sources = readSources(items);
    const pairs = sources.slice(1).map(s => compareSources(sources[0], s));
    const lags = [0, ...pairs.map(p => p.clockOffset)];
    return { summaries: sources.map(summarise), pairs, profile: altitudeProfiles(sources, lags) };
  });

  // Sends coordinates to an outside service, so this only ever runs from its own button.
  ipcMain.handle('check-terrain', async (_event, items: { path: string; name: string }[]) => {
    const sources = readSources(items);
    const lags = [0, ...sources.slice(1).map(s => compareSources(sources[0], s).clockOffset)];
    const terrain = await fetchTerrain(terrainSamples(sources[0], TERRAIN_SPACING_M));
    return {
      credit: TERRAIN_CREDIT,
      points: terrain.length,
      terrainAscent: terrainAscent(terrain),
      checks: sources.map((s, i) => checkAgainstTerrain(s, terrain, lags[i])),
      profile: terrain.map(p => ({ t: p.t, elevation: p.elevation })),
    };
  });

  ipcMain.handle('combine-sources', (_event, items: { path: string; name: string }[], choices: Choices, name: string) => {
    const sources = readSources(items);
    const lags = [0, ...sources.slice(1).map(s => compareSources(sources[0], s).clockOffset)];
    const points = combineSources(sources, lags, choices);
    const dir = join(app.getPath('userData'), 'combined');
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${sources[0].points[0].t}-${name.replace(/[^\p{L}\p{N} _-]/gu, '')}${COMBINED_EXTENSION}`);
    writeCombined(path, points);
    return { path, points: points.length, start: points[0].t, end: points.at(-1)!.t };
  });

  const layoutsDir = () => join(app.getPath('userData'), 'layouts');
  ipcMain.handle('list-layouts', () => listLayouts(layoutsDir()));
  ipcMain.handle('load-layout', (_event, name: string) => loadLayout(layoutsDir(), name));
  ipcMain.handle('save-layout', (_event, name: string, template: Template) => saveLayout(layoutsDir(), name, template));
  ipcMain.handle('delete-layout', (_event, name: string) => deleteLayout(layoutsDir(), name));
  ipcMain.handle('load-working-copy', () => loadWorkingCopy(layoutsDir()));
  ipcMain.handle('save-working-copy', (_event, template: Template) => saveWorkingCopy(layoutsDir(), template));
  ipcMain.handle('import-layout', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'GPS Dials layout', extensions: ['json'] }],
    });
    return canceled ? null : importLayout(filePaths[0]);
  });
  ipcMain.handle('import-layout-path', (_event, path: string) => importLayout(path));
  ipcMain.handle('export-layout', async (_event, template: Template) => {
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath: `${template.name}.layout.json`,
      filters: [{ name: 'gps-dials layout', extensions: ['json'] }],
    });
    if (canceled || !filePath) return null;
    writeFileSync(filePath, JSON.stringify(template, null, 2));
    return filePath;
  });

  ipcMain.handle('export-overlays', (event, batch: OverlayBatch) => (
    renderBatch(join(__dirname, 'overlay-worker.cjs'), { ...batch, mapToken: readMapToken() }, progress => event.sender.send('overlay-progress', progress))
  ));
  ipcMain.handle('cancel-overlays', () => cancelOverlays());

  ipcMain.handle('pick-folder', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle('scan-folder', (_event, dir: string) => scanFolder(dir));

  ipcMain.handle('auto-sync', (event, job: { clip?: string; clips?: string[]; upsideDown?: boolean; trackPath: string }) => new Promise((resolve, reject) => {
    const worker = utilityProcess.fork(join(__dirname, 'sync-worker.cjs'), [], { serviceName: 'gps-dials sync' });
    worker.on('message', message => {
      if (message.progress) event.sender.send('sync-progress', message.done, message.total);
      else if (message.ok) resolve(message.result);
      else reject(new Error(message.error));
    });
    worker.once('exit', code => {
      stopSync = null;
      if (code !== 0) reject(new Error(`Sync stopped unexpectedly (${code}).`));
    });
    stopSync = () => {
      resolve(null);
      worker.kill();
    };
    worker.postMessage(job);
  }));
  ipcMain.handle('cancel-sync', () => stopSync?.());

  ipcMain.handle('project-pick-save', async (_event, name: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      defaultPath: `${name}.${PROJECT_EXTENSION}`,
      filters: [{ name: 'GPS Dials project', extensions: [PROJECT_EXTENSION] }],
    });
    return canceled ? null : filePath ?? null;
  });

  ipcMain.handle('project-pick-open', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'GPS Dials project', extensions: [PROJECT_EXTENSION] }],
    });
    return canceled ? null : filePaths[0];
  });

  ipcMain.handle('project-write', (_event, path: string, project: unknown) => {
    // Written alongside first, so a crash partway can't damage the saved project.
    const partial = `${path}.saving`;
    writeFileSync(partial, JSON.stringify(project));
    renameSync(partial, path);
    rememberProject(path);
  });

  ipcMain.handle('project-read', (_event, path: string) => {
    const project = parseProject(JSON.parse(readFileSync(path, 'utf8')));
    rememberProject(path);
    return { project, missing: missingFiles(project, existsSync) };
  });

  ipcMain.handle('project-recent', () => readRecent().filter(path => existsSync(path)));

  ipcMain.handle('confirm-discard', async () => {
    const { response } = await dialog.showMessageBox(window, UNSAVED_PROMPT);
    return UNSAVED_CHOICES[response];
  });

  ipcMain.handle('set-dirty', (_event, value: boolean) => {
    dirty = value;
  });

  ipcMain.handle('close-window', () => {
    dirty = false;
    window.close();
  });
}

const recentPath = () => join(app.getPath('userData'), 'recent-projects.json');

function readRecent(): string[] {
  try {
    return JSON.parse(readFileSync(recentPath(), 'utf8'));
  } catch {
    return [];
  }
}

function rememberProject(path: string): void {
  writeFileSync(recentPath(), JSON.stringify(addRecent(readRecent(), path)));
}

app.whenReady().then(async () => {
  process.env.GPS_DIALS_TILE_CACHE = join(app.getPath('userData'), 'map-tiles');
  process.env.GPS_DIALS_VERSION = app.getVersion();
  protocol.handle(MEDIA_SCHEME, serveProxy);

  // OpenStreetMap's tile policy asks apps to identify themselves.
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: [`https://${TILE_HOST}/*`] }, (details, callback) => {
    details.requestHeaders['Referer'] = PROJECT_URL;
    details.requestHeaders['User-Agent'] = `gps-dials/${app.getVersion()} (+${PROJECT_URL})`;
    callback({ requestHeaders: details.requestHeaders });
  });

  registerIpc();
  window = new BrowserWindow({
    width: 1500,
    height: 900,
    minWidth: 1000,
    minHeight: 640,
    backgroundColor: '#14171a',
    title: 'gps-dials',
    autoHideMenuBar: true,
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true },
  });
  window.on('close', event => {
    if (!dirty) return;
    event.preventDefault();
    void dialog.showMessageBox(window, UNSAVED_PROMPT).then(({ response }) => {
      const choice = UNSAVED_CHOICES[response];
      if (choice === 'save') window.webContents.send('save-then-close');
      if (choice === 'discard') {
        dirty = false;
        window.close();
      }
    });
  });

  // Links open in the person's own browser, and only ever to the sites the app links to.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://www.mapbox.com/') || url.startsWith('https://account.mapbox.com/')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  await window.loadFile(join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
