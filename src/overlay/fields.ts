import type { DisplayId, Style } from './template.ts';

export type FieldKind = 'color' | 'range' | 'number' | 'toggle' | 'select' | 'text';

export interface Field {
  key: keyof Style;
  label: string;
  kind: FieldKind;
  section: string;
  min?: number;
  max?: number;
  step?: number;
  options?: [string, string][];
  /** Displays this applies to. All of them when left out. */
  only?: DisplayId[];
  hint?: string;
}

const GAUGES: DisplayId[] = ['dial', 'arc'];
const SCALED: DisplayId[] = ['dial', 'arc', 'bar', 'graph'];
const READOUTS: DisplayId[] = ['dial', 'arc', 'bar', 'counter', 'graph'];
const LINES: DisplayId[] = ['graph', 'profile'];
const TRACKS: DisplayId[] = ['route', 'profile'];

/** Add an option here and the inspector shows it. Everything on the panel comes from this list. */
export const FIELDS: Field[] = [
  { section: 'Look', key: 'opacity', label: 'Opacity', kind: 'range', min: 0, max: 1, step: 0.01 },
  { section: 'Look', key: 'color', label: 'Main colour', kind: 'color' },
  { section: 'Look', key: 'color2', label: 'Gradient end', kind: 'color', only: ['bar', 'graph', 'route', 'profile'] },
  { section: 'Look', key: 'textColor', label: 'Text', kind: 'color' },
  { section: 'Look', key: 'mutedColor', label: 'Labels', kind: 'color', only: READOUTS },
  { section: 'Look', key: 'trackColor', label: 'Track colour', kind: 'color', only: [...GAUGES, 'bar', 'route', 'profile'] },
  { section: 'Look', key: 'trackOpacity', label: 'Track opacity', kind: 'range', min: 0, max: 1, step: 0.01, only: [...GAUGES, 'bar', 'route', 'profile'] },
  { section: 'Look', key: 'shadow', label: 'Shadow', kind: 'range', min: 0, max: 30, step: 1 },
  { section: 'Look', key: 'shadowColor', label: 'Shadow colour', kind: 'color' },

  { section: 'Background', key: 'panelColor', label: 'Colour', kind: 'color' },
  { section: 'Background', key: 'panelOpacity', label: 'Opacity', kind: 'range', min: 0, max: 1, step: 0.01 },
  { section: 'Background', key: 'borderColor', label: 'Border colour', kind: 'color' },
  { section: 'Background', key: 'borderWidth', label: 'Border width', kind: 'range', min: 0, max: 10, step: 0.5 },
  { section: 'Background', key: 'cornerRadius', label: 'Corner radius', kind: 'range', min: 0, max: 80, step: 1 },

  { section: 'Value and text', key: 'showValue', label: 'Show value', kind: 'toggle', only: READOUTS },
  { section: 'Value and text', key: 'showLabel', label: 'Show label', kind: 'toggle', only: READOUTS },
  { section: 'Value and text', key: 'showUnits', label: 'Show units', kind: 'toggle', only: READOUTS },
  { section: 'Value and text', key: 'labelText', label: 'Label text', kind: 'text', only: READOUTS },
  { section: 'Value and text', key: 'text', label: 'Text', kind: 'text', only: ['text'], hint: '{value}, {units} and {label} are filled in.' },
  { section: 'Value and text', key: 'decimals', label: 'Decimals', kind: 'range', min: 0, max: 4, step: 1 },
  { section: 'Value and text', key: 'showSign', label: 'Always show + or -', kind: 'toggle' },
  { section: 'Value and text', key: 'smoothing', label: 'Smoothing (seconds)', kind: 'range', min: 0, max: 30, step: 1 },
  { section: 'Value and text', key: 'valueSize', label: 'Value size', kind: 'range', min: 0.3, max: 3, step: 0.05 },
  { section: 'Value and text', key: 'labelSize', label: 'Label size', kind: 'range', min: 0.3, max: 3, step: 0.05, only: READOUTS },
  { section: 'Value and text', key: 'unitsSize', label: 'Units size', kind: 'range', min: 0.3, max: 3, step: 0.05, only: GAUGES },
  { section: 'Value and text', key: 'align', label: 'Alignment', kind: 'select', options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], only: ['counter', 'text'] },

  { section: 'Font', key: 'font', label: 'Font', kind: 'select' },
  { section: 'Font', key: 'bold', label: 'Bold', kind: 'toggle' },
  { section: 'Font', key: 'italic', label: 'Italic', kind: 'toggle' },
  { section: 'Font', key: 'outlineColor', label: 'Text outline colour', kind: 'color' },
  { section: 'Font', key: 'outlineWidth', label: 'Text outline width', kind: 'range', min: 0, max: 12, step: 0.5 },

  { section: 'Scale', key: 'autoRange', label: 'Fit scale to this clip', kind: 'toggle', only: SCALED },
  { section: 'Scale', key: 'min', label: 'Minimum', kind: 'number', only: SCALED },
  { section: 'Scale', key: 'max', label: 'Maximum', kind: 'number', only: SCALED },
  { section: 'Scale', key: 'step', label: 'Number spacing', kind: 'number', only: GAUGES },
  { section: 'Scale', key: 'showTicks', label: 'Show ticks', kind: 'toggle', only: GAUGES },
  { section: 'Scale', key: 'showNumbers', label: 'Show numbers', kind: 'toggle', only: GAUGES },
  { section: 'Scale', key: 'minorTicks', label: 'Small ticks between', kind: 'range', min: 0, max: 19, step: 1, only: GAUGES },
  { section: 'Scale', key: 'tickLength', label: 'Tick length', kind: 'range', min: 0.02, max: 0.4, step: 0.01, only: GAUGES },
  { section: 'Scale', key: 'tickWidth', label: 'Tick width', kind: 'range', min: 0.002, max: 0.08, step: 0.002, only: GAUGES },
  { section: 'Scale', key: 'tickColor', label: 'Tick colour', kind: 'color', only: GAUGES },
  { section: 'Scale', key: 'scaleSize', label: 'Number size', kind: 'range', min: 0.3, max: 3, step: 0.05, only: GAUGES },

  { section: 'Shape', key: 'thickness', label: 'Thickness', kind: 'range', min: 0.01, max: 0.5, step: 0.005, only: [...GAUGES, 'bar'] },
  { section: 'Shape', key: 'roundEnds', label: 'Round ends', kind: 'toggle', only: [...GAUGES, 'bar'] },
  { section: 'Shape', key: 'startAngle', label: 'Start angle', kind: 'range', min: -180, max: 360, step: 5, only: GAUGES },
  { section: 'Shape', key: 'sweepAngle', label: 'Sweep', kind: 'range', min: 30, max: 360, step: 5, only: GAUGES },
  { section: 'Shape', key: 'reverse', label: 'Run backwards', kind: 'toggle', only: GAUGES },
  { section: 'Shape', key: 'orientation', label: 'Direction', kind: 'select', options: [['horizontal', 'Horizontal'], ['vertical', 'Vertical']], only: ['bar'] },

  { section: 'Needle', key: 'showNeedle', label: 'Show needle', kind: 'toggle', only: ['dial'] },
  { section: 'Needle', key: 'needleColor', label: 'Colour', kind: 'color', only: ['dial'] },
  { section: 'Needle', key: 'needleLength', label: 'Length', kind: 'range', min: 0.2, max: 1, step: 0.01, only: ['dial'] },
  { section: 'Needle', key: 'needleWidth', label: 'Width', kind: 'range', min: 0.005, max: 0.15, step: 0.005, only: ['dial'] },
  { section: 'Needle', key: 'showHub', label: 'Show centre', kind: 'toggle', only: ['dial'] },

  { section: 'Graph', key: 'windowSeconds', label: 'Time shown (seconds)', kind: 'range', min: 5, max: 900, step: 5, only: ['graph'] },
  { section: 'Graph', key: 'fillArea', label: 'Fill under line', kind: 'toggle', only: ['graph'] },
  { section: 'Graph', key: 'lineWidth', label: 'Line width', kind: 'range', min: 0.5, max: 12, step: 0.5, only: ['graph'] },
  { section: 'Graph', key: 'showMarker', label: 'Show current point', kind: 'toggle', only: LINES },

  { section: 'Track', key: 'routeWidth', label: 'Line width', kind: 'range', min: 0.5, max: 14, step: 0.5, only: ['route'] },
  { section: 'Track', key: 'dotSize', label: 'Marker size', kind: 'range', min: 1, max: 30, step: 0.5, only: ['route', 'graph'] },
  { section: 'Track', key: 'showRemaining', label: 'Show the part still to come', kind: 'toggle', only: TRACKS },
  { section: 'Track', key: 'fullRide', label: 'Whole activity', kind: 'toggle', only: TRACKS, hint: 'Off shows only the road around this clip.' },
  { section: 'Track', key: 'zoomToClip', label: 'Zoom to this clip', kind: 'toggle', only: ['route'] },

  { section: 'Colour zones', key: 'useZones', label: 'Colour by value', kind: 'toggle', only: [...READOUTS] },
];

export function fieldsFor(display: DisplayId): Field[] {
  return FIELDS.filter(f => !f.only || f.only.includes(display));
}
