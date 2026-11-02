import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('gpsDials', {
  pickFile: (kind: 'clip' | 'track') => ipcRenderer.invoke('pick-file', kind),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scanFolder: (dir: string) => ipcRenderer.invoke('scan-folder', dir),
  loadTrack: (path: string) => ipcRenderer.invoke('load-track', path),
  loadClip: (path: string) => ipcRenderer.invoke('load-clip', path),
  autoSync: (job: unknown) => ipcRenderer.invoke('auto-sync', job),
  cancelSync: () => ipcRenderer.invoke('cancel-sync'),
  readSensors: (clip: string) => ipcRenderer.invoke('read-sensors', clip),
  pickProjectSave: (name: string) => ipcRenderer.invoke('project-pick-save', name),
  pickProjectOpen: () => ipcRenderer.invoke('project-pick-open'),
  writeProject: (path: string, project: unknown) => ipcRenderer.invoke('project-write', path, project),
  readProject: (path: string) => ipcRenderer.invoke('project-read', path),
  recentProjects: () => ipcRenderer.invoke('project-recent'),
  confirmDiscard: () => ipcRenderer.invoke('confirm-discard'),
  setDirty: (value: boolean) => ipcRenderer.invoke('set-dirty', value),
  closeWindow: () => ipcRenderer.invoke('close-window'),
  onSaveThenClose: (listener: () => void) => {
    ipcRenderer.on('save-then-close', () => listener());
  },
  compareSources: (items: unknown) => ipcRenderer.invoke('compare-sources', items),
  checkTerrain: (items: unknown) => ipcRenderer.invoke('check-terrain', items),
  combineSources: (items: unknown, choices: unknown, name: string) => ipcRenderer.invoke('combine-sources', items, choices, name),
  tracksNear: (clip: string, clockTime: number) => ipcRenderer.invoke('tracks-near', clip, clockTime),
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
  videoCodecs: () => ipcRenderer.invoke('video-codecs'),
  videoPlan: (item: unknown, settings: unknown) => ipcRenderer.invoke('video-plan', item, settings),
  pickVideoSave: (name: string) => ipcRenderer.invoke('pick-video-save', name),
  exportVideo: (batch: unknown) => ipcRenderer.invoke('export-video', batch),
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
