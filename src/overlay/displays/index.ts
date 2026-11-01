import { bar } from './bar.ts';
import type { DisplayDef } from './common.ts';
import { counter } from './counter.ts';
import { arc, dial } from './dial.ts';
import { graph } from './graph.ts';
import { profile } from './profile.ts';
import { route } from './route.ts';
import { text } from './text.ts';

/** Add a new way of showing data here. Every kind of data can then use it. */
export const DISPLAYS: DisplayDef[] = [dial, arc, bar, counter, graph, profile, route, text];

export const displayDef = (id: string): DisplayDef => DISPLAYS.find(d => d.id === id) ?? counter;
