import type { Choice, ChoiceChannel, Choices, PairComparison, ProfilePoint, SourceSummary, TerrainCheck } from '../../compare/compare.ts';

export interface SourceItem {
  path: string;
  name: string;
}

interface Comparison {
  summaries: SourceSummary[];
  pairs: PairComparison[];
  profile: ProfilePoint[];
}

interface TerrainResult {
  credit: string;
  points: number;
  terrainAscent: number;
  checks: TerrainCheck[];
  profile: { t: number; elevation: number }[];
}

export interface CompareApi {
  compareSources(items: SourceItem[]): Promise<Comparison>;
  checkTerrain(items: SourceItem[]): Promise<TerrainResult>;
  combineSources(items: SourceItem[], choices: Choices, name: string): Promise<{ path: string; points: number; start: number; end: number }>;
}

export interface CompareHost {
  sources(): SourceItem[];
  addCombined(result: { path: string; points: number; start: number; end: number }, name: string): Promise<void>;
  status(text: string): void;
}

/** Validated against the dark panel for colour-blind separation. Terrain stays neutral and dashed. */
const SERIES = ['#d9772e', '#2e97df', '#d64f86'];
const TERRAIN_COLOR = '#c3cad6';

const CHANNELS: [ChoiceChannel, string][] = [
  ['position', 'Position'],
  ['altitude', 'Altitude'],
  ['speed', 'Speed'],
  ['heartRate', 'Heart rate'],
  ['cadence', 'Cadence'],
  ['power', 'Power'],
  ['temperature', 'Temperature'],
];

const SVG_NS = 'http://www.w3.org/2000/svg';
const fixed = (v: number | null | undefined, d = 1) => (v == null ? '-' : v.toFixed(d));

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

function table(headers: string[], rows: (string | number)[][]): HTMLTableElement {
  const head = el('tr', {}, ...headers.map(h => el('th', { scope: 'col', textContent: h })));
  const body = rows.map(row => el('tr', {}, ...row.map((cell, i) => (i === 0 ? el('th', { scope: 'row', textContent: String(cell) }) : el('td', { textContent: String(cell) })))));
  return el('table', { className: 'compare-table' }, el('thead', {}, head), el('tbody', {}, ...body));
}

/** Plain findings, worded so that disagreement isn't mistaken for knowing which is right. */
function findings(result: Comparison, terrain: TerrainResult | null): string[] {
  const out: string[] = [];
  const [first] = result.summaries;
  result.pairs.forEach((pair, i) => {
    const other = result.summaries[i + 1];
    if (pair.clockOffset !== 0) {
      out.push(`${other.name}'s data runs ${Math.abs(pair.clockOffset)} s ${pair.clockOffset > 0 ? 'behind' : 'ahead of'} ${first.name}. Devices smooth GPS differently, so this may be processing delay rather than a wrong clock.`);
    }
    out.push(`The two tracks are typically ${fixed(pair.positionMedianM, 0)} m apart, and 95% of the time within ${fixed(pair.positionP95M, 0)} m.`);
    if (pair.altitudeOffsetM != null) {
      out.push(`${other.name} reads ${fixed(Math.abs(pair.altitudeOffsetM), 0)} m ${pair.altitudeOffsetM > 0 ? 'higher' : 'lower'} than ${first.name} overall. Removing that, they still differ by about ${fixed(pair.altitudeSpreadM, 1)} m on the ups and downs.`);
    }
    if (pair.gradientRms != null) out.push(`Gradient differs by about ${fixed(pair.gradientRms, 1)} percentage points at any moment, because both compute it from altitude.`);
  });
  if (terrain) {
    const best = [...terrain.checks].sort((a, b) => a.shapeErrorM - b.shapeErrorM)[0];
    out.push(`${best.name} follows the terrain's shape most closely (${fixed(best.shapeErrorM, 1)} m). Terrain data is a coarse reference, not the truth: it smooths out bridges, cuttings and hilltops.`);
  }
  return out;
}

function altitudeChart(result: Comparison, terrain: { km: number; elevation: number }[] | null): HTMLElement {
  const width = 1000;
  const height = 300;
  const margin = { left: 50, right: 16, top: 12, bottom: 28 };
  const plotW = width - margin.left - margin.right;
  const plotH = height - margin.top - margin.bottom;
  const { profile, summaries } = result;
  const values = profile.flatMap(p => p.altitude).filter((v): v is number => v != null);
  if (terrain) values.push(...terrain.map(t => t.elevation));
  const low = Math.floor(Math.min(...values) / 20) * 20;
  const high = Math.ceil(Math.max(...values) / 20) * 20;
  const maxKm = profile.at(-1)!.km;
  const x = (km: number) => margin.left + (km / maxKm) * plotW;
  const y = (m: number) => margin.top + (1 - (m - low) / (high - low || 1)) * plotH;

  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': 'Altitude against distance for each source', class: 'compare-chart' });
  const step = (high - low) / 4;
  for (let i = 0; i <= 4; i++) {
    const m = low + step * i;
    chart.append(svg('line', { x1: margin.left, x2: width - margin.right, y1: y(m), y2: y(m), class: 'grid' }));
    const label = svg('text', { x: margin.left - 8, y: y(m) + 4, 'text-anchor': 'end', class: 'axis' });
    label.textContent = `${Math.round(m)} m`;
    chart.append(label);
  }
  const kmStep = maxKm > 40 ? 10 : maxKm > 15 ? 5 : 1;
  for (let km = 0; km <= maxKm; km += kmStep) {
    const label = svg('text', { x: x(km), y: height - 8, 'text-anchor': 'middle', class: 'axis' });
    label.textContent = `${km} km`;
    chart.append(label);
  }

  summaries.slice(0, SERIES.length).forEach((_, s) => {
    const d = profile
      .map(p => (p.altitude[s] == null ? null : `${x(p.km).toFixed(1)},${y(p.altitude[s]!).toFixed(1)}`))
      .filter(Boolean)
      .join(' ');
    chart.append(svg('polyline', { points: d, fill: 'none', stroke: SERIES[s], 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  });
  if (terrain) {
    const d = terrain.map(p => `${x(p.km).toFixed(1)},${y(p.elevation).toFixed(1)}`).join(' ');
    chart.append(svg('polyline', { points: d, fill: 'none', stroke: TERRAIN_COLOR, 'stroke-width': 2, 'stroke-dasharray': '6 5' }));
  }

  const cross = svg('line', { y1: margin.top, y2: margin.top + plotH, class: 'cross', visibility: 'hidden' });
  chart.append(cross);

  const legend = el('div', { className: 'chart-legend' }, ...summaries.slice(0, SERIES.length).map((s, i) => {
    const swatch = el('span', { className: 'swatch' });
    swatch.style.background = SERIES[i];
    return el('span', {}, swatch, s.name);
  }));
  if (terrain) {
    const swatch = el('span', { className: 'swatch dashed' });
    legend.append(el('span', {}, swatch, 'Terrain data'));
  }

  const tip = el('div', { className: 'chart-tip', hidden: true });
  const wrap = el('div', { className: 'chart-wrap' }, chart, tip);
  chart.addEventListener('pointermove', event => {
    const rect = chart.getBoundingClientRect();
    const scale = width / rect.width;
    const km = (((event.clientX - rect.left) * scale - margin.left) / plotW) * maxKm;
    if (km < 0 || km > maxKm) return;
    const point = profile.reduce((best, p) => (Math.abs(p.km - km) < Math.abs(best.km - km) ? p : best));
    cross.setAttribute('x1', String(x(point.km)));
    cross.setAttribute('x2', String(x(point.km)));
    cross.setAttribute('visibility', 'visible');
    const rows = summaries.map((s, i) => `${s.name}: ${fixed(point.altitude[i], 0)} m`);
    if (terrain) {
      const near = terrain.reduce((best, p) => (Math.abs(p.km - point.km) < Math.abs(best.km - point.km) ? p : best));
      rows.push(`Terrain: ${fixed(near.elevation, 0)} m`);
    }
    tip.textContent = `${fixed(point.km, 1)} km  |  ${rows.join('  |  ')}`;
    tip.hidden = false;
  });
  chart.addEventListener('pointerleave', () => {
    cross.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });

  return el('div', {}, legend, wrap);
}

export function createCompareView(root: HTMLElement, api: CompareApi, host: CompareHost) {
  let current: Comparison | null = null;
  let terrain: TerrainResult | null = null;
  let items: SourceItem[] = [];
  let loadedFor = '';

  const terrainProfile = () => {
    if (!terrain || !current) return null;
    // Terrain points come at even distances along the first source, so spread them over its length.
    const maxKm = current.profile.at(-1)!.km;
    return terrain.profile.map((p, i) => ({ km: (i / (terrain!.profile.length - 1)) * maxKm, elevation: p.elevation }));
  };

  function combiner(): HTMLElement {
    const options = [...items.map((s, i) => [String(i), s.name]), ['average', 'Average']];
    const selects = CHANNELS.map(([key, label]) => {
      const select = el('select', { id: `combine-${key}` }, ...options.map(([value, text]) => el('option', { value, textContent: text })));
      // Positions averaged across devices can land between the two tracks, so default to one source.
      select.value = key === 'altitude' ? 'average' : '0';
      return el('label', { className: 'combine-field' }, el('span', { textContent: label }), select);
    });
    const name = el('input', { type: 'text', value: 'Combined', maxLength: 40, ariaLabel: 'Name for the combined source' });
    const build = el('button', { className: 'primary', textContent: 'Create combined source' });
    build.addEventListener('click', async () => {
      const read = (key: ChoiceChannel): Choice => {
        const value = (root.querySelector(`#combine-${key}`) as HTMLSelectElement).value;
        return value === 'average' ? 'average' : Number(value);
      };
      const choices = Object.fromEntries(CHANNELS.map(([key]) => [key, read(key)])) as Choices;
      try {
        const result = await api.combineSources(items, choices, name.value || 'Combined');
        await host.addCombined(result, name.value || 'Combined');
        host.status(`Created ${name.value || 'Combined'} with ${result.points} points. It's now in the GPS source list.`);
      } catch (error) {
        host.status(String((error as Error)?.message ?? error));
      }
    });
    return el('section', {},
      el('h3', { textContent: 'Best of each' }),
      el('p', { className: 'hint', textContent: 'Choose where each reading comes from, or average them. Altitudes are levelled first, so averaging meets in the middle of the hills.' }),
      el('div', { className: 'combine-grid' }, ...selects),
      el('div', { className: 'combine-actions' }, name, build));
  }

  function terrainSection(): HTMLElement {
    const box = el('section', {}, el('h3', { textContent: 'Check against terrain data' }));
    if (!terrain) {
      const button = el('button', { textContent: 'Check against terrain data' });
      box.append(
        el('p', { className: 'hint', textContent: 'This sends your route to Open-Meteo, about one point every 200 m, and nothing else about you. It only happens when you press the button.' }),
        button,
      );
      button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'Checking...';
        try {
          terrain = await api.checkTerrain(items);
          render();
        } catch (error) {
          button.disabled = false;
          button.textContent = 'Check against terrain data';
          host.status(String((error as Error)?.message ?? error));
        }
      });
      return box;
    }
    box.append(
      table(['Source', 'Level vs terrain', 'Shape error', 'Climbing'], [
        ...terrain.checks.map(c => [c.name, `${c.offsetM > 0 ? '+' : ''}${fixed(c.offsetM, 0)} m`, `${fixed(c.shapeErrorM, 1)} m`, `${fixed(c.ascentM, 0)} m`]),
        ['Terrain data', '-', '-', `${fixed(terrain.terrainAscent, 0)} m`],
      ]),
      el('p', { className: 'hint', textContent: `Lower shape error means closer to the terrain's ups and downs. Treat this as a sanity check: 90 m data smooths out bridges and hilltops. ${terrain.credit}.` }),
    );
    return box;
  }

  function render(): void {
    if (!current) return;
    const { summaries, pairs } = current;
    const names = ['', ...summaries.map(s => s.name)];
    root.replaceChildren(
      el('h2', { textContent: 'Compare sources' }),
      el('p', { className: 'hint', textContent: 'Where your devices agree you can trust the numbers. Where they differ, nothing here proves which is right, so use this to choose.' }),
      el('section', {}, el('h3', { textContent: 'What this shows' }), el('ul', {}, ...findings(current, terrain).map(text => el('li', { textContent: text })))),
      el('section', {}, el('h3', { textContent: 'Altitude' }), altitudeChart(current, terrainProfile())),
      el('section', {}, el('h3', { textContent: 'Side by side' }), table(names, [
        ['Recording interval', ...summaries.map(s => `${fixed(s.interval, 0)} s`)],
        ['Points', ...summaries.map(s => s.points)],
        ['Distance', ...summaries.map(s => `${fixed(s.distanceKm, 2)} km`)],
        ['Climbing', ...summaries.map(s => `${fixed(s.ascentM, 0)} m`)],
        ['Lowest', ...summaries.map(s => `${fixed(s.minAltitude, 0)} m`)],
        ['Highest', ...summaries.map(s => `${fixed(s.maxAltitude, 0)} m`)],
        ['Top speed', ...summaries.map(s => `${fixed(s.maxMph, 1)} mph`)],
        ['Average heart rate', ...summaries.map(s => `${fixed(s.averageHr, 0)} bpm`)],
        ['Speed difference', '-', ...pairs.map(p => `${fixed(p.speedRmsMph, 2)} mph`)],
        ['Heart rate difference', '-', ...pairs.map(p => `${fixed(p.heartRateRms, 1)} bpm`)],
      ])),
      terrainSection(),
      combiner(),
    );
  }

  return {
    async show() {
      items = host.sources();
      const key = items.map(i => i.path).join('|');
      if (items.length < 2) {
        current = null;
        root.replaceChildren(
          el('h2', { textContent: 'Compare sources' }),
          el('p', { className: 'hint', textContent: 'Open a folder holding two or more recordings of the same activity, such as your watch and your bike computer, to compare them here.' }),
        );
        return;
      }
      if (key === loadedFor && current) return;
      root.replaceChildren(el('p', { className: 'hint', textContent: 'Comparing...' }));
      current = await api.compareSources(items);
      terrain = null;
      loadedFor = key;
      render();
    },
  };
}
