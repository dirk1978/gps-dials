import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('gpsDials', {
  pickFile: (kind: 'clip' | 'track') => ipcRenderer.invoke('pick-file', kind),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scanFolder: (dir: string) => ipcRenderer.invoke('scan-folder', dir),
  loadTrack: (path: string) => ipcRenderer.invoke('load-track', path),
  loadClip: (path: string) => ipcRenderer.invoke('load-clip', path),
  autoSync: (job: unknown) => ipcRenderer.invoke('auto-sync', job),
  saveSync: (clip: string, data: unknown) => ipcRenderer.invoke('save-sync', clip, data),
  compareSources: (items: unknown) => ipcRenderer.invoke('compare-sources', items),
  checkTerrain: (items: unknown) => ipcRenderer.invoke('check-terrain', items),
  combineSources: (items: unknown, choices: unknown, name: string) => ipcRenderer.invoke('combine-sources', items, choices, name),
  listLayouts: () => ipcRenderer.invoke('list-layouts'),
  loadLayout: (name: string) => ipcRenderer.invoke('load-layout', name),
  saveLayout: (name: string, template: unknown) => ipcRenderer.invoke('save-layout', name, template),
  deleteLayout: (name: string) => ipcRenderer.invoke('delete-layout', name),
  loadWorkingCopy: () => ipcRenderer.invoke('load-working-copy'),
  saveWorkingCopy: (template: unknown) => ipcRenderer.invoke('save-working-copy', template),
  importLayout: () => ipcRenderer.invoke('import-layout'),
  importLayoutPath: (path: string) => ipcRenderer.invoke('import-layout-path', path),
  exportLayout: (template: unknown) => ipcRenderer.invoke('export-layout', template),
  exportOverlays: (batch: unknown) => ipcRenderer.invoke('export-overlays', batch),
  cancelOverlays: () => ipcRenderer.invoke('cancel-overlays'),
  onOverlayProgress: (listener: (progress: unknown) => void) => {
    ipcRenderer.on('overlay-progress', (_event, progress) => listener(progress));
  },
  getMapToken: () => ipcRenderer.invoke('get-map-token'),
  setMapToken: (token: string) => ipcRenderer.invoke('set-map-token', token),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  onProxyProgress: (listener: (fraction: number, clip: string) => void) => {
    ipcRenderer.on('proxy-progress', (_event, fraction, clip) => listener(fraction, clip));
  },
  onSyncProgress: (listener: (done: number, total: number) => void) => {
    ipcRenderer.on('sync-progress', (_event, done, total) => listener(done, total));
  },
});
