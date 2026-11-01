import type { DisplayId, Style } from './template.ts';

export type FieldKind = 'color' | 'range' | 'number' | 'toggle' | 'select' | 'text' | 'image';

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

const GAUGES: DisplayId[] = ['dial', 'arc', 'vsi'];
const ROUND: DisplayId[] = [...GAUGES, 'compass'];
const TICKED: DisplayId[] = [...ROUND, 'tape', 'tilt', 'horizon'];
const SCALED: DisplayId[] = [...GAUGES, 'bar', 'graph', 'tape', 'tilt', 'horizon', 'zones', 'image'];
const READOUTS: DisplayId[] = [...GAUGES, 'compass', 'tape', 'tilt', 'horizon', 'scope', 'bar', 'zones', 'counter', 'stats', 'graph'];
const NEEDLES: DisplayId[] = ['dial', 'vsi', 'tilt'];
const LINES: DisplayId[] = ['graph', 'profile'];
const TRACKS: DisplayId[] = ['route', 'map', 'profile'];
const ROUTES: DisplayId[] = ['route', 'map'];

/** Add an option here and the inspector shows it. Everything on the panel comes from this list. */
export const FIELDS: Field[] = [
  { section: 'Look', key: 'hideWhenNoData', label: 'Hide if the file has no data', kind: 'toggle' },
  { section: 'Look', key: 'opacity', label: 'Opacity', kind: 'range', min: 0, max: 1, step: 0.01 },
  { section: 'Look', key: 'color', label: 'Main colour', kind: 'color' },
  { section: 'Look', key: 'color2', label: 'Gradient end', kind: 'color', only: ['bar', 'graph', 'route', 'map', 'profile'] },
  { section: 'Look', key: 'textColor', label: 'Text', kind: 'color' },
  { section: 'Look', key: 'mutedColor', label: 'Labels', kind: 'color', only: READOUTS },
  { section: 'Look', key: 'trackColor', label: 'Track colour', kind: 'color', only: [...GAUGES, 'bar', 'route', 'map', 'profile'] },
  { section: 'Look', key: 'trackOpacity', label: 'Track opacity', kind: 'range', min: 0, max: 1, step: 0.01, only: [...GAUGES, 'bar', 'route', 'map', 'profile'] },
  { section: 'Look', key: 'shadow', label: 'Shadow', kind: 'range', min: 0, max: 30, step: 1 },
  { section: 'Look', key: 'shadowColor', label: 'Shadow colour', kind: 'color' },

  { section: 'Background', key: 'panelColor', label: 'Colour', kind: 'color' },
  { section: 'Background', key: 'panelOpacity', label: 'Opacity', kind: 'range', min: 0, max: 1, step: 0.01 },
  { section: 'Background', key: 'borderColor', label: 'Border colour', kind: 'color' },
  { section: 'Background', key: 'borderWidth', label: 'Border width', kind: 'range', min: 0, max: 10, step: 0.5 },
  { section: 'Background', key: 'cornerRadius', label: 'Corner radius', kind: 'range', min: 0, max: 80, step: 1 },

  { section: 'Value and text', key: 'showValue', label: 'Show value', kind: 'toggle', only: [...READOUTS, 'image'] },
  { section: 'Value and text', key: 'showLabel', label: 'Show label', kind: 'toggle', only: READOUTS },
  { section: 'Value and text', key: 'showUnits', label: 'Show units', kind: 'toggle', only: READOUTS },
  { section: 'Value and text', key: 'labelText', label: 'Label text', kind: 'text', only: READOUTS },
  { section: 'Value and text', key: 'text', label: 'Text', kind: 'text', only: ['text'], hint: '{value}, {units} and {label} are filled in.' },
  { section: 'Value and text', key: 'decimals', label: 'Decimals', kind: 'range', min: 0, max: 4, step: 1 },
  { section: 'Value and text', key: 'showSign', label: 'Always show + or -', kind: 'toggle' },
  { section: 'Value and text', key: 'smoothing', label: 'Smoothing (seconds)', kind: 'range', min: 0, max: 30, step: 1 },
  { section: 'Value and text', key: 'valueSize', label: 'Value size', kind: 'range', min: 0.3, max: 3, step: 0.05 },
  { section: 'Value and text', key: 'labelSize', label: 'Label size', kind: 'range', min: 0.3, max: 3, step: 0.05, only: READOUTS },
  { section: 'Value and text', key: 'unitsSize', label: 'Units size', kind: 'range', min: 0.3, max: 3, step: 0.05, only: ROUND },
  { section: 'Value and text', key: 'align', label: 'Alignment', kind: 'select', options: [['left', 'Left'], ['center', 'Centre'], ['right', 'Right']], only: ['counter', 'text'] },

  { section: 'Font', key: 'font', label: 'Font', kind: 'select' },
  { section: 'Font', key: 'bold', label: 'Bold', kind: 'toggle' },
  { section: 'Font', key: 'italic', label: 'Italic', kind: 'toggle' },
  { section: 'Font', key: 'outlineColor', label: 'Text outline colour', kind: 'color' },
  { section: 'Font', key: 'outlineWidth', label: 'Text outline width', kind: 'range', min: 0, max: 12, step: 0.5 },

  { section: 'Scale', key: 'autoRange', label: 'Fit scale to this clip', kind: 'toggle', only: SCALED },
  { section: 'Scale', key: 'min', label: 'Minimum', kind: 'number', only: SCALED },
  { section: 'Scale', key: 'max', label: 'Maximum', kind: 'number', only: SCALED },
  { section: 'Scale', key: 'step', label: 'Number spacing', kind: 'number', only: [...GAUGES, 'tape', 'tilt'] },
  { section: 'Scale', key: 'showTicks', label: 'Show ticks', kind: 'toggle', only: TICKED },
  { section: 'Scale', key: 'showNumbers', label: 'Show numbers', kind: 'toggle', only: [...GAUGES, 'tape', 'tilt'] },
  { section: 'Scale', key: 'showNumbers', label: 'Show N, E, S, W', kind: 'toggle', only: ['compass'] },
  { section: 'Scale', key: 'minorTicks', label: 'Small ticks between', kind: 'range', min: 0, max: 19, step: 1, only: GAUGES },
  { section: 'Scale', key: 'tickLength', label: 'Tick length', kind: 'range', min: 0.02, max: 0.4, step: 0.01, only: TICKED },
  { section: 'Scale', key: 'tickWidth', label: 'Tick width', kind: 'range', min: 0.002, max: 0.08, step: 0.002, only: TICKED },
  { section: 'Scale', key: 'tickColor', label: 'Tick colour', kind: 'color', only: TICKED },
  { section: 'Scale', key: 'scaleSize', label: 'Number size', kind: 'range', min: 0.3, max: 3, step: 0.05, only: TICKED },

  { section: 'Shape', key: 'thickness', label: 'Thickness', kind: 'range', min: 0.01, max: 0.5, step: 0.005, only: [...GAUGES, 'bar'] },
  { section: 'Shape', key: 'roundEnds', label: 'Round ends', kind: 'toggle', only: [...GAUGES, 'bar'] },
  { section: 'Shape', key: 'startAngle', label: 'Start angle', kind: 'range', min: -180, max: 360, step: 5, only: [...GAUGES, 'image'] },
  { section: 'Shape', key: 'sweepAngle', label: 'Sweep', kind: 'range', min: 30, max: 360, step: 5, only: [...GAUGES, 'image'] },
  { section: 'Shape', key: 'reverse', label: 'Run backwards', kind: 'toggle', only: [...GAUGES, 'image'] },
  { section: 'Shape', key: 'orientation', label: 'Direction', kind: 'select', options: [['horizontal', 'Horizontal'], ['vertical', 'Vertical']], only: ['bar', 'tape'] },
  { section: 'Shape', key: 'compassMode', label: 'What turns', kind: 'select', options: [['card', 'The card, like a real compass'], ['needle', 'A needle, with north up']], only: ['compass'] },

  { section: 'Shape', key: 'tapeSteps', label: 'Numbers shown at once', kind: 'range', min: 2, max: 12, step: 1, only: ['tape'] },
  { section: 'Shape', key: 'skyColor', label: 'Sky colour', kind: 'color', only: ['horizon'] },
  { section: 'Shape', key: 'groundColor', label: 'Ground colour', kind: 'color', only: ['horizon'] },
  { section: 'Shape', key: 'scopeRange', label: 'G-force at the rim', kind: 'range', min: 0.2, max: 3, step: 0.1, only: ['scope'] },
  { section: 'Shape', key: 'trailSeconds', label: 'Trail (seconds)', kind: 'range', min: 0, max: 20, step: 1, only: ['scope'] },
  { section: 'Shape', key: 'statsSpan', label: 'Worked out over', kind: 'select', options: [['rideSoFar', 'The ride so far'], ['ride', 'The whole ride'], ['soFar', 'The clip so far'], ['clip', 'The whole clip']], only: ['stats'] },
  { section: 'Image', key: 'imageDial', label: 'Dial face', kind: 'image', only: ['image'], hint: 'A PNG with a clear background works best.' },
  { section: 'Image', key: 'imageMode', label: 'Picture', kind: 'select', options: [['still', 'Stays still'], ['fill', 'Fills with the value'], ['scale', 'Grows with the value']], only: ['image'] },
  { section: 'Image', key: 'imageNeedle', label: 'Needle', kind: 'image', only: ['image'], hint: 'Pointing straight up and centred in its picture. It turns around the middle.' },

  { section: 'Needle', key: 'showNeedle', label: 'Show needle', kind: 'toggle', only: ['dial', 'vsi'] },
  { section: 'Needle', key: 'needleColor', label: 'Colour', kind: 'color', only: NEEDLES },
  { section: 'Needle', key: 'needleLength', label: 'Length', kind: 'range', min: 0.2, max: 1, step: 0.01, only: NEEDLES },
  { section: 'Needle', key: 'needleWidth', label: 'Width', kind: 'range', min: 0.005, max: 0.15, step: 0.005, only: NEEDLES },
  { section: 'Needle', key: 'showHub', label: 'Show centre', kind: 'toggle', only: ['dial', 'vsi'] },

  { section: 'Map', key: 'routeColorBy', label: 'Colour route by', kind: 'select', options: [['', 'One colour'], ['speed', 'Speed'], ['gradient', 'Gradient'], ['altitude', 'Altitude'], ['heartRate', 'Heart rate'], ['power', 'Power']], only: ROUTES },
  { section: 'Graph', key: 'graphSpan', label: 'Shows', kind: 'select', options: [['ride', 'The whole ride'], ['recent', 'The last stretch']], only: ['graph'] },
  { section: 'Graph', key: 'graphAxis', label: 'Along the bottom', kind: 'select', options: [['time', 'Time'], ['distance', 'Distance']], only: ['graph'] },
  { section: 'Graph', key: 'windowMetres', label: 'Distance shown (metres)', kind: 'range', min: 100, max: 20000, step: 100, only: ['graph'] },
  { section: 'Graph', key: 'windowSeconds', label: 'Time shown (seconds)', kind: 'range', min: 5, max: 900, step: 5, only: ['graph'] },
  { section: 'Graph', key: 'fillArea', label: 'Fill under line', kind: 'toggle', only: ['graph'] },
  { section: 'Graph', key: 'lineWidth', label: 'Line width', kind: 'range', min: 0.5, max: 12, step: 0.5, only: ['graph'] },
  { section: 'Graph', key: 'showMarker', label: 'Show current point', kind: 'toggle', only: LINES },

  { section: 'Map', key: 'mapProvider', label: 'Map style', kind: 'select', only: ['map'], hint: 'Mapbox styles need your token in Map settings. Check your provider\'s terms before publishing its maps in video.' },
  { section: 'Map', key: 'mapCustomUrl', label: 'Tile address', kind: 'text', only: ['map'], hint: 'For "Your own tile address". Use {z}, {x} and {y}, and include any key.' },
  { section: 'Map', key: 'mapCredit', label: 'Credit text', kind: 'text', only: ['map'], hint: 'The credit your tile provider requires.' },
  { section: 'Map', key: 'mapMode', label: 'Framing', kind: 'select', options: [['follow', 'Follow me'], ['fitClip', 'Fit this clip'], ['fitRide', 'Fit the whole activity']], only: ['map'] },
  { section: 'Map', key: 'mapZoom', label: 'Zoom', kind: 'range', min: 5, max: 19, step: 0.25, only: ['map'], hint: 'Used when following you. Closer shows less area, but the map moves more.' },
  { section: 'Map', key: 'mapRotate', label: 'Turn with direction of travel', kind: 'toggle', only: ['map'], hint: 'Used when following you.' },
  { section: 'Map', key: 'mapShape', label: 'Shape', kind: 'select', options: [['rounded', 'Rounded'], ['square', 'Square'], ['circle', 'Circle']], only: ['map'] },
  { section: 'Map', key: 'mapOpacity', label: 'Map opacity', kind: 'range', min: 0, max: 1, step: 0.01, only: ['map'] },
  { section: 'Map', key: 'mapDarken', label: 'Darken', kind: 'range', min: 0, max: 1, step: 0.01, only: ['map'] },
  { section: 'Map', key: 'mapSaturation', label: 'Colour', kind: 'range', min: 0, max: 2, step: 0.05, only: ['map'] },
  { section: 'Map', key: 'mapBrightness', label: 'Brightness', kind: 'range', min: 0.2, max: 2, step: 0.05, only: ['map'] },
  { section: 'Map', key: 'mapContrast', label: 'Contrast', kind: 'range', min: 0.2, max: 2, step: 0.05, only: ['map'] },

  { section: 'Track', key: 'routeWidth', label: 'Line width', kind: 'range', min: 0.5, max: 24, step: 0.5, only: ROUTES },
  { section: 'Track', key: 'routeOutlineColor', label: 'Outline colour', kind: 'color', only: ROUTES },
  { section: 'Track', key: 'routeOutlineWidth', label: 'Outline width', kind: 'range', min: 0, max: 10, step: 0.5, only: ROUTES },
  { section: 'Track', key: 'markerStyle', label: 'Marker', kind: 'select', options: [['dot', 'Dot'], ['ring', 'Ring'], ['arrow', 'Arrow']], only: ROUTES },
  { section: 'Track', key: 'markerColor', label: 'Marker colour', kind: 'color', only: ROUTES },
  { section: 'Track', key: 'dotSize', label: 'Marker size', kind: 'range', min: 1, max: 30, step: 0.5, only: [...ROUTES, 'graph'] },
  { section: 'Track', key: 'showRemaining', label: 'Show the part still to come', kind: 'toggle', only: TRACKS },
  { section: 'Track', key: 'fullRide', label: 'Whole activity', kind: 'toggle', only: TRACKS, hint: 'Off shows only the road around this clip.' },
  { section: 'Track', key: 'profileSmoothing', label: 'Curve smoothing (m)', kind: 'range', min: 0, max: 200, step: 5, only: ['profile'], hint: 'Higher gives a softer curve. Zero shows every bump.' },
  { section: 'Track', key: 'zoomToClip', label: 'Zoom to this clip', kind: 'toggle', only: ['route'] },

  { section: 'Colour zones', key: 'useZones', label: 'Colour by value', kind: 'toggle', only: [...READOUTS] },
];

export function fieldsFor(display: DisplayId): Field[] {
  return FIELDS.filter(f => !f.only || f.only.includes(display));
}
