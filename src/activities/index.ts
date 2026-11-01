import { CHANNELS, type ChannelId } from '../overlay/channels.ts';
import type { Template } from '../overlay/template.ts';
import { boating } from './boating.ts';
import { cycling } from './cycling.ts';
import { drone } from './drone.ts';
import { flying } from './flying.ts';
import { bestForData } from './layout.ts';
import { running } from './running.ts';
import type { ActivityDef } from './types.ts';

/** Add a new activity here. The first one is also the fallback for anything unrecognised. */
export const ACTIVITIES: ActivityDef[] = [cycling, running, drone, boating, flying];

export const activityForFitSport = (sport: number | undefined): string =>
  ACTIVITIES.find(a => sport != null && a.fitSports?.includes(sport))?.id ?? 'other';

export const activityForExtension = (extension: string): string | undefined =>
  ACTIVITIES.find(a => a.extensions?.includes(extension))?.id;

export interface ChannelGroup {
  name: string;
  channels: ChannelId[];
}

/**
 * The data pickers' groups: everything for this activity first, then what only the others
 * add, so data shared between activities appears once and the list stays short.
 */
export function channelGroups(id: string): ChannelGroup[] {
  const current = ACTIVITIES.find(a => a.id === id) ?? ACTIVITIES[0];
  const seen = new Set<ChannelId>();
  const take = (name: string, channels: ChannelId[]): ChannelGroup => {
    const fresh = channels.filter(c => !seen.has(c));
    for (const c of fresh) seen.add(c);
    return { name, channels: fresh };
  };
  const groups = [current, ...ACTIVITIES.filter(a => a !== current)].map(a => take(a.name, a.channels));
  groups.push(take('Other', CHANNELS.map(c => c.id)));
  return groups.filter(g => g.channels.length > 0);
}

/**
 * The built-in layout for an activity, marked so it can change if a different activity is
 * opened. Given what a file has, gauges it can't fill give way to the next best thing.
 */
export function layoutFor(id: string, available: Set<ChannelId> = new Set(CHANNELS.map(c => c.id))): Template {
  const activity = ACTIVITIES.find(a => a.id === id) ?? ACTIVITIES[0];
  const copy = structuredClone(activity.layout);
  return { ...copy, widgets: copy.widgets.map(w => bestForData(w, available)), auto: true };
}
