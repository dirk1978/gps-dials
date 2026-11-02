import { CAMERA_CHANNELS, type ChannelId } from '../overlay/channels.ts';
import { DEFAULT_SIZES, type Template } from '../overlay/template.ts';
import { ACTIVITIES } from './index.ts';
import { layout, type Example, type Spec } from './layout.ts';

const FRAME_ASPECT = 16 / 9;
const GAP = 0.008;
const SMALLEST = 0.25;
const LARGEST = 1.6;
const SEARCH_STEPS = 24;

/** Shown on top of each activity's own examples, as they suit anything with GPS. */
const EVERY_ACTIVITY: Example[] = [
  ['distance', 'map', { mapMode: 'follow', mapZoom: 16.5, mapShape: 'circle', mapRotate: true, markerStyle: 'arrow' }],
  ['distance', 'map', { mapMode: 'fitRide' }],
  ['distance', 'route', { mapMode: 'fitRide', routeColorBy: 'speed' }],
  ['speed', 'tape'],
  ['speed', 'stats'],
  ['speed', 'graph', { windowSeconds: 60 }],
  ['altitude', 'profile'],
  ['heading', 'compass'],
];

interface Box {
  example: Example;
  width: number;
  height: number;
}

function placeRows(boxes: Box[], scale: number, aspect: number): { box: Box; x: number; y: number; width: number; height: number }[] | null {
  const across = FRAME_ASPECT / aspect;
  const placed: { box: Box; x: number; y: number; width: number; height: number }[] = [];
  let x = GAP;
  let y = GAP;
  let rowHeight = 0;
  for (const box of boxes) {
    const width = Math.min(1 - GAP * 2, box.width * scale * across);
    const height = box.height * scale;
    if (x + width > 1 - GAP + 1e-9 && x > GAP) {
      x = GAP;
      y += rowHeight + GAP;
      rowHeight = 0;
    }
    if (y + height > 1 - GAP + 1e-9) return null;
    placed.push({ box, x, y, width, height });
    x += width + GAP;
    rowHeight = Math.max(rowHeight, height);
  }
  return placed;
}

/** Spreads each row out to the frame's edges and the rows down it, so nothing bunches up in a corner. */
function spread(placed: NonNullable<ReturnType<typeof placeRows>>): typeof placed {
  const rows = new Map<number, typeof placed>();
  for (const item of placed) rows.set(item.y, [...(rows.get(item.y) ?? []), item]);
  const ordered = [...rows.values()];
  const heights = ordered.map(row => Math.max(...row.map(i => i.height)));
  const spare = Math.max(0, 1 - heights.reduce((a, b) => a + b, 0) - GAP * (ordered.length + 1));
  const rowGap = GAP + spare / (ordered.length + 1);
  let y = rowGap;
  return ordered.flatMap((row, r) => {
    const used = row.reduce((total, i) => total + i.width, 0);
    const gap = row.length > 1 ? (1 - GAP * 2 - used) / (row.length - 1) : 0;
    let x = row.length > 1 ? GAP : (1 - used) / 2;
    const top = y;
    y += heights[r] + rowGap;
    return row.map(item => {
      const moved = { ...item, x, y: top + (heights[r] - item.height) / 2 };
      x += item.width + gap;
      return moved;
    });
  });
}

/**
 * Everything this activity can show from the data there is, packed to fill the frame.
 * It's a set of worked examples: people remove what they don't want and keep the rest.
 */
export function allDials(id: string, available: Set<ChannelId>, aspect = FRAME_ASPECT): Template {
  const activity = ACTIVITIES.find(a => a.id === id) ?? ACTIVITIES[0];
  const examples = [...activity.examples, ...EVERY_ACTIVITY].filter(([channel]) => available.has(channel));
  const shown = new Set(examples.map(([channel]) => channel));
  const rest = [...activity.channels, ...CAMERA_CHANNELS].filter(c => available.has(c) && !shown.has(c));
  const all: Example[] = [...examples, ...[...new Set(rest)].map(c => [c, 'counter'] as Example)];

  // Tallest first, so each row holds things of a similar size.
  const boxes: Box[] = all
    .map(example => ({ example, width: DEFAULT_SIZES[example[1]][0], height: DEFAULT_SIZES[example[1]][1] }))
    .sort((a, b) => b.height - a.height);
  let low = SMALLEST;
  let high = LARGEST;
  for (let i = 0; i < SEARCH_STEPS; i++) {
    const middle = (low + high) / 2;
    if (placeRows(boxes, middle, aspect)) low = middle;
    else high = middle;
  }
  const placed = spread(placeRows(boxes, low, aspect) ?? []);
  const specs: Spec[] = placed.map(({ box, x, y, width, height }) => [box.example[0], box.example[1], x, y, width, height, box.example[2]]);
  return layout(`All ${activity.name.toLowerCase()} dials`, specs);
}
