import { CHANNELS, channelDef, type ChannelId } from '../../overlay/channels.ts';
import { DEFAULT_GRADIENT_SPAN_M } from '../../overlay/data.ts';
import { DISPLAYS, displayDef } from '../../overlay/displays/index.ts';
import { fieldsFor, type Field } from '../../overlay/fields.ts';
import { MAP_PROVIDERS } from '../../overlay/map-view.ts';
import { PRESETS } from '../../overlay/presets.ts';
import { DEFAULT_RIDER, type Rider } from '../../overlay/zones.ts';
import { FONTS, THEMES, newId, newWidget, resolveStyle, type DisplayId, type Style, type Template, type Theme, type Widget } from '../../overlay/template.ts';

export interface EditorHost {
  template(): Template;
  setTemplate(template: Template): void;
  /** The drawn picture, relative to the stage. Null until a clip is showing. */
  pictureRect(): { left: number; top: number; width: number; height: number } | null;
  redraw(): void;
  channelsWithData(): Set<ChannelId> | null;
  status(text: string): void;
  saveWorkingCopy(template: Template): void;
}

type Handle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLES: Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const SNAP = 0.006;
const SIZE_SNAP = 0.008;
const MIN_SIZE = 0.02;
const NUDGE = 0.002;
const HISTORY_LIMIT = 100;

const THEME_FIELDS: [keyof Theme, string, 'color' | 'range' | 'select' | 'toggle'][] = [
  ['accent', 'Main colour', 'color'],
  ['accent2', 'Second colour', 'color'],
  ['text', 'Text', 'color'],
  ['muted', 'Labels', 'color'],
  ['panel', 'Panels', 'color'],
  ['panelOpacity', 'Panel opacity', 'range'],
  ['border', 'Borders', 'color'],
  ['track', 'Tracks', 'color'],
  ['up', 'Climbing', 'color'],
  ['down', 'Descending', 'color'],
  ['font', 'Font', 'select'],
  ['bold', 'Bold', 'toggle'],
  ['italic', 'Italic', 'toggle'],
  ['cornerRadius', 'Corner radius', 'range'],
  ['shadow', 'Shadow', 'range'],
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

export function createEditor(host: EditorHost) {
  const layer = document.getElementById('editor-layer')!;
  const layers = document.getElementById('layer-list')!;
  const inspector = document.getElementById('inspector-body')!;
  const addData = document.getElementById('add-channel') as HTMLSelectElement;
  const addDisplay = document.getElementById('add-display') as HTMLSelectElement;

  let selected: string | null = null;
  let past: string[] = [];
  let future: string[] = [];
  let saved = JSON.stringify(host.template());
  let openSections = new Set(['Data', 'Look', 'Theme']);
  /** Shown beside the selection while resizing. */
  let sizeNote = '';

  const current = () => host.template().widgets.find(w => w.id === selected) ?? null;

  /** Records the change for undo. Called once a drag or edit has finished. */
  function commit(keepAuto: boolean | Event = false): void {
    // Once someone has made a layout their own, opening another activity must not replace it.
    if (keepAuto !== true && JSON.stringify(host.template()) !== saved) host.template().auto = false;
    const now = JSON.stringify(host.template());
    if (now === saved) return;
    past.push(saved);
    if (past.length > HISTORY_LIMIT) past.shift();
    future = [];
    saved = now;
    host.saveWorkingCopy(host.template());
  }

  function restore(json: string): void {
    saved = json;
    host.setTemplate(JSON.parse(json));
    if (!current()) selected = null;
    host.saveWorkingCopy(host.template());
    refresh();
  }

  function undo(): void {
    const previous = past.pop();
    if (previous == null) return;
    future.push(saved);
    restore(previous);
  }

  function redo(): void {
    const next = future.pop();
    if (next == null) return;
    past.push(saved);
    restore(next);
  }

  function changed(): void {
    host.redraw();
    renderSelection();
  }

  // Selection box and handles, positioned over the picture.
  function renderSelection(): void {
    const rect = host.pictureRect();
    layer.style.display = rect ? '' : 'none';
    if (!rect) return;
    Object.assign(layer.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    layer.querySelectorAll('.selection').forEach(n => n.remove());
    const widget = current();
    if (!widget) return;
    const box = el('div', { className: 'selection' });
    Object.assign(box.style, {
      left: `${widget.x * 100}%`, top: `${widget.y * 100}%`, width: `${widget.width * 100}%`, height: `${widget.height * 100}%`,
    });
    for (const handle of HANDLES) {
      const dot = el('span', { className: `handle ${handle}` });
      dot.dataset.handle = handle;
      box.append(dot);
    }
    if (sizeNote) box.append(el('span', { className: 'size-note', textContent: sizeNote }));
    layer.append(box);
  }

  /** Another visible widget this size is close to, checking only the sides being changed. */
  function sameSizeAs(moving: Widget, width: number, height: number, checkWidth: boolean, checkHeight: boolean): Widget | null {
    let best: Widget | null = null;
    let closest = SIZE_SNAP;
    for (const w of host.template().widgets) {
      if (w.id === moving.id || w.hidden) continue;
      const gaps = [checkWidth ? Math.abs(w.width - width) : 0, checkHeight ? Math.abs(w.height - height) : 0];
      const gap = Math.max(...gaps);
      if (gap < closest) {
        closest = gap;
        best = w;
      }
    }
    return best;
  }

  /** Outlines the widget being matched, so it's clear which one the size came from. */
  function showTwin(twin: Widget | null): void {
    layer.querySelectorAll('.twin').forEach(n => n.remove());
    if (!twin) return;
    const box = el('div', { className: 'twin' });
    Object.assign(box.style, {
      left: `${twin.x * 100}%`, top: `${twin.y * 100}%`, width: `${twin.width * 100}%`, height: `${twin.height * 100}%`,
    });
    layer.append(box);
  }

  function showGuides(xs: number[], ys: number[]): void {
    layer.querySelectorAll('.guide').forEach(n => n.remove());
    for (const x of xs) {
      const g = el('div', { className: 'guide vertical' });
      g.style.left = `${x * 100}%`;
      layer.append(g);
    }
    for (const y of ys) {
      const g = el('div', { className: 'guide horizontal' });
      g.style.top = `${y * 100}%`;
      layer.append(g);
    }
  }

  function snapTargets(moving: Widget): { xs: number[]; ys: number[] } {
    const xs = [0, 0.5, 1];
    const ys = [0, 0.5, 1];
    for (const w of host.template().widgets) {
      if (w.id === moving.id || w.hidden) continue;
      xs.push(w.x, w.x + w.width / 2, w.x + w.width);
      ys.push(w.y, w.y + w.height / 2, w.y + w.height);
    }
    return { xs, ys };
  }

  /** How far to move so that any of `edges` lands on a target, and which target it was. */
  function snapBy(edges: number[], targets: number[]): { shift: number; at: number[] } {
    let best = SNAP;
    let shift = 0;
    const at: number[] = [];
    for (const edge of edges) {
      for (const target of targets) {
        const distance = Math.abs(target - edge);
        if (distance < best - 1e-9) {
          best = distance;
          shift = target - edge;
          at.length = 0;
          at.push(target);
        }
      }
    }
    return { shift, at };
  }

  function hitTest(x: number, y: number): Widget | null {
    const { widgets } = host.template();
    for (let i = widgets.length - 1; i >= 0; i--) {
      const w = widgets[i];
      if (!w.hidden && x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height) return w;
    }
    return null;
  }

  layer.addEventListener('pointerdown', event => {
    const rect = layer.getBoundingClientRect();
    const start = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height };
    const handle = (event.target as HTMLElement).dataset.handle as Handle | undefined;
    if (!handle) {
      const hit = hitTest(start.x, start.y);
      select(hit?.id ?? null);
      if (!hit) return;
    }
    const widget = current();
    if (!widget) return;
    event.preventDefault();
    layer.setPointerCapture(event.pointerId);
    const origin = { x: widget.x, y: widget.y, width: widget.width, height: widget.height };
    const ratio = origin.width / origin.height;

    const move = (e: PointerEvent) => {
      const dx = (e.clientX - rect.left) / rect.width - start.x;
      const dy = (e.clientY - rect.top) / rect.height - start.y;
      const targets = e.altKey ? { xs: [], ys: [] } : snapTargets(widget);
      if (!handle) {
        const x = origin.x + dx;
        const y = origin.y + dy;
        const sx = snapBy([x, x + origin.width / 2, x + origin.width], targets.xs);
        const sy = snapBy([y, y + origin.height / 2, y + origin.height], targets.ys);
        widget.x = x + sx.shift;
        widget.y = y + sy.shift;
        showGuides(sx.at, sy.at);
      } else {
        let { x, y, width, height } = origin;
        if (handle.includes('e')) width = Math.max(MIN_SIZE, origin.width + dx);
        if (handle.includes('s')) height = Math.max(MIN_SIZE, origin.height + dy);
        if (handle.includes('w')) {
          width = Math.max(MIN_SIZE, origin.width - dx);
          x = origin.x + origin.width - width;
        }
        if (handle.includes('n')) {
          height = Math.max(MIN_SIZE, origin.height - dy);
          y = origin.y + origin.height - height;
        }
        // Dials are round, so corner drags keep their shape unless Shift is held.
        const corner = handle.length === 2;
        const keepShape = corner && !e.shiftKey;
        if (keepShape) height = width / ratio;
        const twin = e.altKey ? null : sameSizeAs(widget, width, height, keepShape || handle === 'e' || handle === 'w', keepShape || handle === 'n' || handle === 's');
        if (twin) {
          if (keepShape || handle.includes('e') || handle.includes('w')) width = twin.width;
          if (keepShape || handle.includes('n') || handle.includes('s')) height = twin.height;
        }
        if (handle.includes('w')) x = origin.x + origin.width - width;
        if (handle.includes('n')) y = origin.y + origin.height - height;
        Object.assign(widget, { x, y, width, height });
        showGuides([], []);
        sizeNote = twin ? `Same size as ${twin.name}` : `${(width * 100).toFixed(1)} × ${(height * 100).toFixed(1)}%`;
        showTwin(twin);
      }
      changed();
      renderPosition();
    };
    const finish = () => {
      layer.removeEventListener('pointermove', move);
      showGuides([], []);
      showTwin(null);
      sizeNote = '';
      renderSelection();
      commit();
    };
    layer.addEventListener('pointermove', move);
    layer.addEventListener('pointerup', finish, { once: true });
    layer.addEventListener('pointercancel', finish, { once: true });
  });

  function select(id: string | null): void {
    selected = id;
    renderLayers();
    renderInspector();
    renderSelection();
  }

  function moveInOrder(id: string, by: number): void {
    const { widgets } = host.template();
    const i = widgets.findIndex(w => w.id === id);
    const j = i + by;
    if (i < 0 || j < 0 || j >= widgets.length) return;
    [widgets[i], widgets[j]] = [widgets[j], widgets[i]];
    host.redraw();
    commit();
    renderLayers();
  }

  function remove(id: string): void {
    const t = host.template();
    t.widgets = t.widgets.filter(w => w.id !== id);
    if (selected === id) selected = null;
    host.redraw();
    commit();
    refresh();
  }

  function duplicate(id: string): void {
    const t = host.template();
    const w = t.widgets.find(x => x.id === id);
    if (!w) return;
    const copy: Widget = { ...structuredClone(w), id: newId(), name: `${w.name} copy`, x: Math.min(0.98, w.x + 0.02), y: Math.min(0.98, w.y + 0.02) };
    t.widgets.push(copy);
    selected = copy.id;
    host.redraw();
    commit();
    refresh();
  }

  function renderLayers(): void {
    const { widgets } = host.template();
    const rows = [...widgets].reverse().map(w => {
      const row = el('li', { className: w.id === selected ? 'layer selected' : 'layer' });
      const name = el('button', { className: 'layer-name', title: 'Select', textContent: w.name });
      name.addEventListener('click', () => select(w.id));
      const data = host.channelsWithData();
      const empty = data && !displayDef(w.display).usesTrack && !data.has(w.channel);
      const kind = el('span', { className: 'layer-kind', textContent: empty ? 'No data in this file' : displayDef(w.display).label });
      const eye = el('button', { className: 'icon', title: w.hidden ? 'Show' : 'Hide', textContent: w.hidden ? 'Off' : 'On' });
      eye.addEventListener('click', () => {
        w.hidden = !w.hidden;
        host.redraw();
        commit();
        renderLayers();
      });
      const up = el('button', { className: 'icon', title: 'Bring forward', textContent: '▲' });
      up.addEventListener('click', () => moveInOrder(w.id, 1));
      const down = el('button', { className: 'icon', title: 'Send back', textContent: '▼' });
      down.addEventListener('click', () => moveInOrder(w.id, -1));
      row.append(el('div', { className: 'layer-main' }, name, kind), eye, up, down);
      return row;
    });
    layers.replaceChildren(...rows);
  }

  function section(title: string, body: Node[]): HTMLElement {
    const box = el('details', { className: 'section', open: openSections.has(title) });
    box.addEventListener('toggle', () => {
      if (box.open) openSections.add(title);
      else openSections.delete(title);
    });
    box.append(el('summary', { textContent: title }), ...body);
    return box;
  }

  function row(label: string, control: Node, reset?: () => void, hint?: string): HTMLElement {
    const wrapper = el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: label }), control);
    if (reset) {
      const button = el('button', { className: 'icon reset', title: 'Back to default', textContent: '↺', type: 'button' });
      button.addEventListener('click', event => {
        event.preventDefault();
        reset();
      });
      wrapper.append(button);
    }
    return hint ? el('div', {}, wrapper, el('p', { className: 'hint', textContent: hint })) : wrapper;
  }

  function control(kind: string, value: unknown, options: { min?: number; max?: number; step?: number; choices?: [string, string][] }, onInput: (v: unknown) => void, onCommit: () => void): HTMLElement {
    if (kind === 'select') {
      const select = el('select');
      select.append(...(options.choices ?? []).map(([v, label]) => el('option', { value: v, textContent: label })));
      select.value = String(value);
      select.addEventListener('change', () => {
        onInput(select.value);
        onCommit();
      });
      return select;
    }
    if (kind === 'toggle') {
      const box = el('input', { type: 'checkbox', checked: Boolean(value) });
      box.addEventListener('change', () => {
        onInput(box.checked);
        onCommit();
      });
      return box;
    }
    if (kind === 'range') {
      const wrap = el('span', { className: 'range' });
      const range = el('input', { type: 'range', min: String(options.min), max: String(options.max), step: String(options.step) });
      const number = el('input', { type: 'number', min: String(options.min), max: String(options.max), step: String(options.step) });
      range.value = number.value = String(value);
      range.addEventListener('input', () => {
        number.value = range.value;
        onInput(Number(range.value));
      });
      number.addEventListener('input', () => {
        range.value = number.value;
        if (number.value !== '') onInput(Number(number.value));
      });
      range.addEventListener('change', onCommit);
      number.addEventListener('change', onCommit);
      wrap.append(range, number);
      return wrap;
    }
    const input = el('input', { type: kind === 'number' ? 'number' : kind === 'color' ? 'color' : 'text' });
    input.value = String(value);
    input.addEventListener('input', () => {
      if (kind === 'number' && input.value === '') return;
      onInput(kind === 'number' ? Number(input.value) : input.value);
    });
    input.addEventListener('change', onCommit);
    return input;
  }

  function styleField(widget: Widget, field: Field): HTMLElement {
    const resolved = resolveStyle(widget, host.template().theme, host.template().rider);
    const set = (v: unknown) => {
      (widget.style as Record<string, unknown>)[field.key] = v;
      host.redraw();
    };
    const choices = field.key === 'font'
      ? FONTS.map(f => [f, f] as [string, string])
      : field.key === 'mapProvider' ? MAP_PROVIDERS.map(p => [p.id, p.label] as [string, string]) : field.options;
    const input = control(field.kind, resolved[field.key], { min: field.min, max: field.max, step: field.step, choices }, set, () => commit());
    const reset = field.key in widget.style ? () => {
      delete widget.style[field.key];
      host.redraw();
      commit();
      renderInspector();
    } : undefined;
    return row(field.label, input, reset, field.hint);
  }

  let positionInputs: { key: 'x' | 'y' | 'width' | 'height'; input: HTMLInputElement }[] = [];

  function renderPosition(): void {
    const widget = current();
    if (!widget) return;
    for (const { key, input } of positionInputs) {
      if (document.activeElement !== input) input.value = (widget[key] * 100).toFixed(1);
    }
  }

  function zonesEditor(widget: Widget): HTMLElement {
    const list = el('div', { className: 'zones' });
    // Starts from the zones in use, so a small change doesn't mean rebuilding the whole list.
    const zones = () => {
      if (!widget.style.zones?.length) widget.style.zones = structuredClone(resolveStyle(widget, host.template().theme, host.template().rider).zones);
      return widget.style.zones;
    };
    const draw = () => {
      const shown = widget.style.zones?.length ? widget.style.zones : resolveStyle(widget, host.template().theme, host.template().rider).zones;
      list.replaceChildren(...shown.map((zone, i) => {
        const upTo = el('input', { type: 'number', title: 'Up to this value', value: String(zone.upTo) });
        upTo.addEventListener('input', () => {
          zones()[i].upTo = Number(upTo.value);
          host.redraw();
        });
        upTo.addEventListener('change', () => commit());
        const color = el('input', { type: 'color', value: zone.color });
        color.addEventListener('input', () => {
          zones()[i].color = color.value;
          host.redraw();
        });
        color.addEventListener('change', () => commit());
        const drop = el('button', { className: 'icon', textContent: '×', title: 'Remove this zone', type: 'button' });
        drop.addEventListener('click', () => {
          zones().splice(i, 1);
          host.redraw();
          commit();
          draw();
        });
        return el('div', { className: 'zone' }, el('span', { textContent: 'Up to' }), upTo, color, drop);
      }));
      const add = el('button', { textContent: 'Add zone', type: 'button' });
      add.addEventListener('click', () => {
        const last = zones().at(-1);
        zones().push({ upTo: (last?.upTo ?? 100) + 20, color: '#ffc23d' });
        host.redraw();
        commit();
        draw();
      });
      list.append(add);
    };
    draw();
    return list;
  }

  function widgetInspector(widget: Widget): void {
    const data = host.channelsWithData();
    const def = channelDef(widget.channel);

    const name = el('input', { type: 'text', value: widget.name });
    name.addEventListener('input', () => {
      widget.name = name.value;
      renderLayers();
    });
    name.addEventListener('change', commit);

    const channelSelect = control('select', widget.channel, {
      choices: CHANNELS.map(c => [c.id, `${c.label}${data && !data.has(c.id) ? ' (none in this file)' : ''}`]),
    }, v => {
      widget.channel = v as ChannelId;
      delete widget.style.unit;
      delete widget.style.labelText;
      delete widget.style.min;
      delete widget.style.max;
      delete widget.style.step;
      delete widget.style.decimals;
      host.redraw();
    }, () => {
      commit();
      renderInspector();
    });
    const displaySelect = control('select', widget.display, { choices: DISPLAYS.map(d => [d.id, d.label]) }, v => {
      widget.display = v as DisplayId;
      host.redraw();
    }, () => {
      commit();
      renderLayers();
      renderInspector();
    });

    const dataRows: Node[] = [row('Name', name), row('Data', channelSelect), row('Show as', displaySelect)];
    if (def.units.length > 1) {
      const resolved = resolveStyle(widget, host.template().theme);
      dataRows.push(row('Units', control('select', resolved.unit || def.units[0].id, { choices: def.units.map(u => [u.id, u.label]) }, v => {
        widget.style.unit = String(v);
        host.redraw();
      }, commit)));
    }

    positionInputs = [];
    const place = (key: 'x' | 'y' | 'width' | 'height', label: string) => {
      const input = el('input', { type: 'number', step: '0.1', value: (widget[key] * 100).toFixed(1) });
      input.addEventListener('input', () => {
        if (input.value === '') return;
        widget[key] = Number(input.value) / 100;
        changed();
      });
      input.addEventListener('change', commit);
      positionInputs.push({ key, input });
      return row(`${label} %`, input);
    };
    const quick = (label: string, apply: () => void) => {
      const b = el('button', { textContent: label, type: 'button' });
      b.addEventListener('click', () => {
        apply();
        changed();
        commit();
        renderPosition();
      });
      return b;
    };
    const aligners = el('div', { className: 'button-row' },
      quick('Left', () => { widget.x = 0.02; }),
      quick('Centre', () => { widget.x = 0.5 - widget.width / 2; }),
      quick('Right', () => { widget.x = 0.98 - widget.width; }),
      quick('Top', () => { widget.y = 0.03; }),
      quick('Middle', () => { widget.y = 0.5 - widget.height / 2; }),
      quick('Bottom', () => { widget.y = 0.97 - widget.height; }));
    const others = host.template().widgets.filter(w => w.id !== widget.id);
    const match = control('select', '', { choices: [['', 'Choose a widget'], ...others.map(w => [w.id, w.name] as [string, string])] }, v => {
      const source = others.find(w => w.id === v);
      if (!source) return;
      // Stays anchored to its centre, so matching a size doesn't push it off the frame.
      const cx = widget.x + widget.width / 2;
      const cy = widget.y + widget.height / 2;
      Object.assign(widget, { width: source.width, height: source.height, x: cx - source.width / 2, y: cy - source.height / 2 });
      changed();
    }, () => {
      commit();
      renderInspector();
    });
    const copy = el('button', { textContent: 'Duplicate', type: 'button' });
    copy.addEventListener('click', () => duplicate(widget.id));
    const drop = el('button', { textContent: 'Delete', type: 'button' });
    drop.addEventListener('click', () => remove(widget.id));
    const wipe = el('button', { textContent: 'Reset style', type: 'button' });
    wipe.addEventListener('click', () => {
      widget.style = {};
      host.redraw();
      commit();
      renderInspector();
    });

    const sections = new Map<string, Node[]>();
    for (const field of fieldsFor(widget.display)) {
      sections.set(field.section, [...(sections.get(field.section) ?? []), styleField(widget, field)]);
    }
    if (sections.has('Colour zones')) sections.get('Colour zones')!.push(zonesEditor(widget));

    inspector.replaceChildren(
      section('Data', dataRows),
      section('Position and size', [place('x', 'Left'), place('y', 'Top'), place('width', 'Width'), place('height', 'Height'), row('Same size as', match), aligners]),
      ...[...sections].map(([title, body]) => section(title, body)),
      el('div', { className: 'button-row' }, copy, wipe, drop),
    );
  }

  function riderField(key: keyof Rider, label: string, hint: string): HTMLElement {
    const t = host.template();
    const input = control('number', (t.rider ?? DEFAULT_RIDER)[key], {}, v => {
      if (!(Number(v) > 0)) return;
      t.rider = { ...DEFAULT_RIDER, ...t.rider, [key]: Number(v) };
      host.redraw();
    }, () => commit(true));
    return row(label, input, undefined, hint);
  }

  function themeInspector(): void {
    const t = host.template();
    const picker = control('select', THEMES.some(x => x.name === t.theme.name) ? t.theme.name : '', {
      choices: [['', 'Custom'], ...THEMES.map(x => [x.name, x.name] as [string, string])],
    }, v => {
      const theme = THEMES.find(x => x.name === v);
      if (theme) t.theme = { ...theme };
      host.redraw();
    }, () => {
      commit();
      renderInspector();
    });
    const rows: Node[] = [row('Theme', picker)];
    for (const [key, label, kind] of THEME_FIELDS) {
      const ranges = key === 'panelOpacity' ? { min: 0, max: 1, step: 0.01 } : key === 'shadow' ? { min: 0, max: 30, step: 1 } : { min: 0, max: 80, step: 1 };
      const choices = key === 'font' ? FONTS.map(f => [f, f] as [string, string]) : undefined;
      rows.push(row(label, control(kind, t.theme[key], { ...ranges, choices }, v => {
        (t.theme as unknown as Record<string, unknown>)[key] = v;
        t.theme.name = 'Custom';
        host.redraw();
      }, commit)));
    }
    const span = control('range', t.gradientSpan ?? DEFAULT_GRADIENT_SPAN_M, { min: 20, max: 400, step: 10 }, v => {
      t.gradientSpan = Number(v);
      host.redraw();
    }, commit);
    inspector.replaceChildren(
      el('p', { className: 'hint', textContent: 'Select a widget on the picture to change it. The theme sets everything a widget hasn\'t changed itself.' }),
      section('Theme', rows),
      section('Data', [row('Gradient over (m)', span, undefined, 'Shorter reacts faster but is noisier. Longer is steadier but flattens short ramps.')]),
      section('You', [
        riderField('maxHeartRate', 'Max heart rate', 'Heart rate zones are percentages of this.'),
        riderField('ftp', 'FTP (watts)', 'Power zones are percentages of this.'),
      ]),
    );
  }

  function renderInspector(): void {
    const widget = current();
    document.getElementById('inspector-title')!.textContent = widget ? widget.name : 'Theme';
    if (widget) widgetInspector(widget);
    else themeInspector();
  }

  function refresh(): void {
    renderLayers();
    renderInspector();
    renderSelection();
  }

  document.getElementById('preset-grid')!.replaceChildren(...PRESETS.map(preset => {
    const thumb = el('span', { className: 'preset-thumb' }, ...preset.widgets.map(w => {
      const round = w.display === 'dial' || w.display === 'arc' || w.style.mapShape === 'circle';
      const box = el('span', { className: `${round ? 'round ' : ''}${w.display === 'map' ? 'map' : ''}`.trim() });
      Object.assign(box.style, { left: `${w.x * 100}%`, top: `${w.y * 100}%`, width: `${w.width * 100}%`, height: `${w.height * 100}%` });
      return box;
    }));
    const button = el('button', { className: 'preset', title: `Start from ${preset.name}. You can undo this.`, type: 'button' }, thumb, preset.name);
    button.addEventListener('click', () => {
      const copy = structuredClone(preset);
      for (const w of copy.widgets) w.name ||= channelDef(w.channel).label;
      host.setTemplate(copy);
      selected = null;
      commit();
      refresh();
      host.status(`Using ${preset.name}. Change anything you like.`);
    });
    return button;
  }));

  addData.replaceChildren(...CHANNELS.map(c => el('option', { value: c.id, textContent: c.label })));
  addDisplay.replaceChildren(...DISPLAYS.map(d => el('option', { value: d.id, textContent: d.label })));
  document.getElementById('add-widget')!.addEventListener('click', () => {
    const widget = newWidget(addData.value as ChannelId, addDisplay.value as DisplayId);
    host.template().widgets.push(widget);
    selected = widget.id;
    host.redraw();
    commit();
    refresh();
  });

  function keydown(event: KeyboardEvent): boolean {
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test((event.target as HTMLElement).tagName);
    const ctrl = event.ctrlKey || event.metaKey;
    if (ctrl && event.key.toLowerCase() === 'z') {
      if (event.shiftKey) redo();
      else undo();
      return true;
    }
    if (ctrl && event.key.toLowerCase() === 'y') {
      redo();
      return true;
    }
    const widget = current();
    if (typing || !widget) return false;
    if (event.key === 'Delete' || event.key === 'Backspace') {
      remove(widget.id);
      return true;
    }
    if (ctrl && event.key.toLowerCase() === 'd') {
      duplicate(widget.id);
      return true;
    }
    if (event.key === 'Escape') {
      select(null);
      return true;
    }
    const step = event.shiftKey ? NUDGE * 5 : NUDGE;
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = moves[event.key];
    if (!move) return false;
    widget.x += move[0];
    widget.y += move[1];
    changed();
    commit();
    renderPosition();
    return true;
  }

  return {
    refresh,
    renderSelection,
    keydown,
    undo,
    redo,
    select,
    /** Takes in a different layout, as one step that can be undone. */
    replace(template: Template, keepAuto = false) {
      host.setTemplate(template);
      selected = null;
      commit(keepAuto);
      refresh();
    },
    selectedId: () => selected,
  };
}
