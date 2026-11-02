import type { ChannelId } from '../overlay/channels.ts';
import type { Template } from '../overlay/template.ts';
import type { Example } from './layout.ts';

/**
 * Teaches the app about one kind of activity. Add a file in this folder and list it
 * in `index.ts`. Opening a matching recording then starts with this layout.
 */
export interface ActivityDef {
  /** Stable lowercase id. */
  id: string;
  /** Name as people know it, shown in the presets. */
  name: string;
  /** Numbers from the `sport` list in the FIT file format that mean this activity. */
  fitSports?: number[];
  /** Track files that can only be this activity, with the dot. */
  extensions?: string[];
  /** The data that matters for this activity, most useful first. Activities can share data freely. */
  channels: ChannelId[];
  /** Good ways to show this activity's data, used by Load all dials. Anything left out still appears as a number. */
  examples: Example[];
  /** The starting layout. Hidden automatically where a file has no data, so list everything useful. */
  layout: Template;
}
