import type { Template } from '../overlay/template.ts';

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
  /** The starting layout. Hidden automatically where a file has no data, so list everything useful. */
  layout: Template;
}
