import { contextBridge, ipcRenderer, webUtils } from 'electron';

contextBridge.exposeInMainWorld('gpsDials', {
  pickFile: (kind: 'clip' | 'track') => ipcRenderer.invoke('pick-file', kind),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  scanFolder: (dir: string) => ipcRenderer.invoke('scan-folder', dir),
  loadTrack: (path: string) => ipcRenderer.invoke('load-track', path),
  loadClip: (path: string) => ipcRenderer.invoke('load-clip', path),
  autoSync: (job: unknown) => ipcRenderer.invoke('auto-sync', job),
  saveSync: (clip: string, data: unknown) => ipcRenderer.invoke('save-sync', clip, data),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  onProxyProgress: (listener: (fraction: number) => void) => {
    ipcRenderer.on('proxy-progress', (_event, fraction) => listener(fraction));
  },
  onSyncProgress: (listener: (done: number, total: number) => void) => {
    ipcRenderer.on('sync-progress', (_event, done, total) => listener(done, total));
  },
});
