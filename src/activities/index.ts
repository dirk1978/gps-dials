import type { Template } from '../overlay/template.ts';
import { boating } from './boating.ts';
import { cycling } from './cycling.ts';
import { drone } from './drone.ts';
import { flying } from './flying.ts';
import { running } from './running.ts';
import type { ActivityDef } from './types.ts';

/** Add a new activity here. The first one is also the fallback for anything unrecognised. */
export const ACTIVITIES: ActivityDef[] = [cycling, running, drone, boating, flying];

export const activityForFitSport = (sport: number | undefined): string =>
  ACTIVITIES.find(a => sport != null && a.fitSports?.includes(sport))?.id ?? 'other';

export const activityForExtension = (extension: string): string | undefined =>
  ACTIVITIES.find(a => a.extensions?.includes(extension))?.id;

/** The built-in layout for an activity, marked so it can change if a different activity is opened. */
export function layoutFor(id: string): Template {
  const activity = ACTIVITIES.find(a => a.id === id) ?? ACTIVITIES[0];
  return { ...structuredClone(activity.layout), auto: true };
}
