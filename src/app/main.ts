import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import { BrowserWindow, app, dialog, ipcMain, protocol, session, utilityProcess } from 'electron';
import { readActivity } from '../activity/index.ts';
import { clipClockTime } from '../sync/engine.ts';
import { displayRotation, isUpsideDown } from '../sync/orientation.ts';
import type { TrackColumns } from '../sync/timeline.ts';
import { scanFolder } from './folder.ts';
import { ensureProxy } from './proxy.ts';

const MEDIA_SCHEME = 'gpsdials-media';
const TILE_HOST = 'tile.openstreetmap.org';
const PROJECT_URL = 'https://github.com/dirk1978/gps-dials';

protocol.registerSchemesAsPrivileged([{ scheme: MEDIA_SCHEME, privileges: { stream: true, supportFetchAPI: true, standard: true, secure: true } }]);

let window: BrowserWindow;
const proxies = new Map<string, string>();

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

function registerIpc(): void {
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
    const columns: TrackColumns = {
      t: points.map(p => p.t),
      lat: points.map(p => p.lat),
      lon: points.map(p => p.lon),
      speed: points.map(p => p.speed ?? null),
      heartRate: points.map(p => p.heartRate ?? null),
      altitude: points.map(p => p.altitude ?? null),
    };
    return { path, name: basename(path), columns };
  });

  ipcMain.handle('load-clip', async (event, clip: string) => {
    const { duration, fps } = probe(clip);
    const started = Date.now();
    const proxy = await ensureProxy(clip, join(app.getPath('userData'), 'proxies'), duration, fraction => {
      event.sender.send('proxy-progress', fraction);
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
      fileRotation: displayRotation(clip),
      upsideDown: await isUpsideDown(clip),
      clockTime: clipClockTime(clip),
      proxyMethod: proxy.method,
      proxySeconds: (Date.now() - started) / 1000,
      saved,
    };
  });

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
    worker.once('exit', code => { if (code !== 0) reject(new Error(`Sync stopped unexpectedly (${code}).`)); });
    worker.postMessage(job);
  }));

  ipcMain.handle('save-sync', (_event, clip: string, data: unknown) => {
    writeFileSync(sidecarPath(clip), JSON.stringify(data, null, 2));
    return sidecarPath(clip);
  });
}

app.whenReady().then(async () => {
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
  await window.loadFile(join(__dirname, 'index.html'));
});

app.on('window-all-closed', () => app.quit());
