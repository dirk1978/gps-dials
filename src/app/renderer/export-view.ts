import { DEFAULT_VIDEO, frameAspect, type VideoCodec, type VideoSettings } from '../../overlay/video-settings.ts';
import type { VideoItem } from '../overlay-queue.ts';

export interface Cut {
  from: number;
  /** Null runs to the end of the clip. */
  to: number | null;
  skip: boolean;
}

export interface VideoPlan {
  width: number;
  height: number;
  fps: string;
  kbps: number;
  encoder: string;
}

interface ExportClip {
  path: string;
  name: string;
  duration: number;
}

export interface ExportHost {
  clips(): ExportClip[];
  current(): ExportClip | null;
  position(): number;
  items(cuts: (clip: ExportClip) => { from: number; to: number } | null): VideoItem[];
  canHaveDials(): boolean;
  plan(item: VideoItem, settings: VideoSettings): Promise<VideoPlan>;
  codecs(): Promise<{ codec: VideoCodec; label: string }[]>;
  run(items: VideoItem[], settings: VideoSettings, outPath?: string): Promise<void>;
  cancel(): Promise<void>;
  /** The picture's look has changed, or a clip has been trimmed. */
  changed(): void;
  clipsChanged(): void;
  edited(): void;
  clock(seconds: number): string;
}

const MIN_KEPT_S = 0.2;
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function createExportView(host: ExportHost) {
  let settings: VideoSettings = { ...DEFAULT_VIDEO };
  const cuts = new Map<string, Cut>();
  let running = false;
  let codecsLoaded = false;
  let planRequest = 0;

  const cutFor = (path: string): Cut => cuts.get(path) ?? { from: 0, to: null, skip: false };
  const kept = (clip: ExportClip) => {
    const cut = cutFor(clip.path);
    return { from: cut.from, to: cut.to ?? clip.duration };
  };
  const keptLength = (clip: ExportClip) => {
    const { from, to } = kept(clip);
    return Math.max(0, to - from);
  };
  const included = () => host.clips().filter(c => !cutFor(c.path).skip);

  function setCut(path: string, change: Partial<Cut>): void {
    cuts.set(path, { ...cutFor(path), ...change });
    host.edited();
    render();
    host.clipsChanged();
  }

  function renderTrim(): void {
    const clip = host.current();
    $('trim-bar').hidden = !clip || !document.body.classList.contains('mode-export') || settings.kind === 'overlays';
    if (!clip) return;
    const { from, to } = kept(clip);
    const bar = $('trim-kept');
    bar.style.left = `${(from / clip.duration) * 100}%`;
    bar.style.width = `${((to - from) / clip.duration) * 100}%`;
    $('trim-note').textContent = `Keeps ${host.clock(from)} to ${host.clock(to)} (${host.clock(to - from)})`;
  }

  async function renderPlan(): Promise<void> {
    const clips = included();
    const seconds = clips.reduce((total, c) => total + keptLength(c), 0);
    $('export-summary').textContent = settings.kind === 'overlays'
      ? `${clips.length} of ${host.clips().length} clips ticked`
      : `${clips.length} of ${host.clips().length} clips, ${host.clock(seconds)} in total`;
    $<HTMLButtonElement>('export-video').disabled = !running && clips.length === 0;
    $('export-video').textContent = running ? 'Cancel' : settings.join || clips.length < 2 ? 'Export video' : `Export ${clips.length} videos`;
    $('export-no-dials').hidden = !settings.dials || host.canHaveDials();
    const request = ++planRequest;
    const [first] = host.items(c => (cutFor(c.path).skip ? null : kept(c)));
    if (!first) {
      $('export-plan').textContent = '';
      return;
    }
    const plan = await host.plan(first, settings);
    if (request !== planRequest) return;
    const [top, bottom] = plan.fps.split('/').map(Number);
    const gigabytes = (plan.kbps * 1000 * seconds) / 8 / 1e9 + (settings.audio ? (192000 * seconds) / 8 / 1e9 : 0);
    $('export-plan').textContent = `${plan.width} x ${plan.height}, ${(top / (bottom || 1)).toFixed(2).replace(/\.?0+$/, '')} fps, ${(plan.kbps / 1000).toFixed(0)} Mbps, using ${plan.encoder}. About ${gigabytes < 1 ? `${(gigabytes * 1000).toFixed(0)} MB` : `${gigabytes.toFixed(1)} GB`}.`;
  }

  function renderControls(): void {
    for (const key of ['kind', 'frame', 'resolution', 'fps', 'bitrate', 'codec'] as const) {
      $<HTMLSelectElement>(`export-${key}`).value = settings[key];
    }
    $('export-video-options').hidden = settings.kind !== 'video';
    $('export-overlay-options').hidden = settings.kind !== 'overlays';
    for (const key of ['customWidth', 'customHeight', 'customFps', 'customBitrate', 'cropX', 'cropY'] as const) {
      $<HTMLInputElement>(`export-${key}`).value = String(settings[key]);
    }
    for (const key of ['audio', 'dials', 'join'] as const) $<HTMLInputElement>(`export-${key}`).checked = settings[key];
    const cropping = frameAspect(settings) != null;
    $('export-custom-size').hidden = settings.resolution !== 'custom';
    $('export-custom-fps').hidden = settings.fps !== 'custom';
    $('export-custom-bitrate').hidden = settings.bitrate !== 'custom';
    $('export-crop').hidden = !cropping;
    $<HTMLSelectElement>('export-frame').disabled = settings.resolution === 'custom';
  }

  function render(): void {
    renderTrim();
    void renderPlan();
  }

  function change(next: Partial<VideoSettings>): void {
    settings = { ...settings, ...next };
    host.edited();
    renderControls();
    render();
    host.changed();
  }

  for (const key of ['kind', 'frame', 'resolution', 'fps', 'bitrate', 'codec'] as const) {
    $<HTMLSelectElement>(`export-${key}`).addEventListener('change', event => change({ [key]: (event.target as HTMLSelectElement).value }));
  }
  for (const key of ['customWidth', 'customHeight', 'customFps', 'customBitrate', 'cropX', 'cropY'] as const) {
    $<HTMLInputElement>(`export-${key}`).addEventListener('input', event => {
      const value = Number((event.target as HTMLInputElement).value);
      if (value > 0 || key.startsWith('crop')) change({ [key]: value });
    });
  }
  for (const key of ['audio', 'dials', 'join'] as const) {
    $<HTMLInputElement>(`export-${key}`).addEventListener('change', event => change({ [key]: (event.target as HTMLInputElement).checked }));
  }

  $('trim-start').addEventListener('click', () => {
    const clip = host.current();
    if (!clip) return;
    const { to } = kept(clip);
    setCut(clip.path, { from: Math.min(host.position(), to - MIN_KEPT_S) });
  });
  $('trim-end').addEventListener('click', () => {
    const clip = host.current();
    if (!clip) return;
    const { from } = kept(clip);
    setCut(clip.path, { to: Math.max(host.position(), from + MIN_KEPT_S) });
  });
  $('trim-reset').addEventListener('click', () => {
    const clip = host.current();
    if (clip) setCut(clip.path, { from: 0, to: null });
  });

  async function start(outPath?: string): Promise<void> {
    if (running) {
      await host.cancel();
      return;
    }
    running = true;
    render();
    try {
      await host.run(host.items(c => (cutFor(c.path).skip ? null : kept(c))), settings, outPath);
    } finally {
      running = false;
      render();
    }
  }
  $('export-video').addEventListener('click', () => { void start(); });

  return {
    start,
    render,
    cutFor,
    keptLength,
    setSkip: (path: string, skip: boolean) => setCut(path, { skip }),
    settings: () => settings,
    cuts: () => Object.fromEntries(cuts),
    /** The finished frame's shape, for the preview. Null keeps the picture's own, as overlays always do. */
    aspect: () => (settings.kind === 'video' ? frameAspect(settings) : null),
    restore(savedCuts: Record<string, Cut>, savedSettings: Partial<VideoSettings>): void {
      cuts.clear();
      for (const [path, cut] of Object.entries(savedCuts)) cuts.set(path, cut);
      settings = { ...DEFAULT_VIDEO, ...savedSettings };
      renderControls();
    },
    async show(): Promise<void> {
      if (!codecsLoaded) {
        codecsLoaded = true;
        const codecs = await host.codecs();
        $<HTMLSelectElement>('export-codec').replaceChildren(...codecs.map(({ codec, label }) => {
          const option = document.createElement('option');
          option.value = codec;
          option.textContent = label;
          return option;
        }));
      }
      renderControls();
      render();
    },
  };
}
