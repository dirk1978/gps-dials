import { bar } from './bar.ts';
import type { DisplayDef } from './common.ts';
import { compass } from './compass.ts';
import { counter } from './counter.ts';
import { arc, centreDial, dial } from './dial.ts';
import { graph } from './graph.ts';
import { horizon } from './horizon.ts';
import { imageGauge } from './image.ts';
import { lapBars, lapTable } from './laps.ts';
import { map } from './map.ts';
import { profile } from './profile.ts';
import { route } from './route.ts';
import { scope } from './scope.ts';
import { stats } from './stats.ts';
import { tape } from './tape.ts';
import { text } from './text.ts';
import { tilt } from './tilt.ts';
import { zones } from './zones.ts';

/** Add a new way of showing data here. Every kind of data can then use it. */
export const DISPLAYS: DisplayDef[] = [dial, arc, centreDial, compass, tape, tilt, horizon, scope, bar, zones, counter, stats, lapTable, lapBars, graph, profile, map, route, text, imageGauge];

export const displayDef = (id: string): DisplayDef => DISPLAYS.find(d => d.id === id) ?? counter;
