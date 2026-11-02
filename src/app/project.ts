import type { Template } from '../overlay/template.ts';
import type { VideoSettings } from '../overlay/video-settings.ts';
import { normaliseTemplate } from '../overlay/template.ts';
import type { SessionResult } from '../sync/engine.ts';
import type { FolderClip, FolderTrack } from './folder.ts';

export const PROJECT_EXTENSION = 'gpsdials';
const VERSION = 1;

/** Everything about a piece of work, so it can be closed and picked up later. The videos stay where they are. */
export interface ProjectFile {
  version: 1;
  name: string;
  clips: FolderClip[];
  tracks: FolderTrack[];
  /** Sync results for each GPS source, by track path. */
  sessions: Record<string, SessionResult[]>;
  autoStarts: Record<string, number>;
  manualRotations: Record<string, number>;
  template: Template;
  format: string;
  activeTrack: string | null;
  activeClip: string | null;
  /** What's kept of each clip in the finished video. */
  cuts?: Record<string, { from: number; to: number | null; skip: boolean }>;
  video?: Partial<VideoSettings>;
}

/** Accepts a saved project, or explains why it can't be opened. */
export function parseProject(raw: unknown): ProjectFile {
  const p = raw as Partial<ProjectFile> | null;
  if (!p || typeof p !== 'object' || p.version !== VERSION || !Array.isArray(p.clips) || !Array.isArray(p.tracks)) {
    throw new Error('That isn\'t a GPS Dials project.');
  }
  return {
    version: VERSION,
    name: String(p.name ?? 'Untitled project'),
    clips: p.clips,
    tracks: p.tracks,
    sessions: p.sessions ?? {},
    autoStarts: p.autoStarts ?? {},
    manualRotations: p.manualRotations ?? {},
    template: normaliseTemplate(p.template),
    format: String(p.format ?? 'png-alpha'),
    activeTrack: p.activeTrack ?? null,
    activeClip: p.activeClip ?? null,
    cuts: p.cuts ?? {},
    video: p.video ?? {},
  };
}

/** Videos and tracks that have moved since the project was saved. */
export function missingFiles(project: ProjectFile, exists: (path: string) => boolean): string[] {
  return [...project.clips, ...project.tracks].map(f => f.path).filter(path => !exists(path));
}

export function projectName(path: string): string {
  return path.split(/[\\/]/).pop()!.replace(new RegExp(`\\.${PROJECT_EXTENSION}$`, 'i'), '');
}

/** Most recent first, without repeats, and short enough for a menu. */
export function addRecent(recent: string[], path: string, limit = 8): string[] {
  const same = (a: string) => a.toLowerCase() === path.toLowerCase();
  return [path, ...recent.filter(p => !same(p))].slice(0, limit);
}
