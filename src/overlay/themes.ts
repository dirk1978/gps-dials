import type { Theme } from './template.ts';

type Look = Partial<Omit<Theme, 'name' | 'group' | 'accent' | 'accent2' | 'text' | 'muted' | 'panel' | 'panelOpacity' | 'font'>>;

/** Fonts on every system fall back to Arial, so these still look right without them. */
const SPORT = 'Barlow Condensed';
const CLEAN = 'Segoe UI';
const LOUD = 'Impact';
const PLAIN = 'Arial';
const MONO = 'Consolas';
const CLASSIC = 'Georgia';

function theme(group: string, name: string, accent: string, accent2: string, text: string, muted: string, panel: string, panelOpacity: number, font: string, look: Look = {}): Theme {
  return { group, name, accent, accent2, text, muted, panel, panelOpacity, border: text, track: text, up: '#ff6b5e', down: '#4fd67a', font, italic: false, bold: true, cornerRadius: 12, shadow: 4, ...look };
}

/** Add a look here and it joins the picker, in its group. Keep them original rather than copying a brand. */
export const THEMES: Theme[] = [
  theme('Classic', 'RideWorld', '#ff9a3d', '#ff3d7f', '#ffffff', '#c3cad6', '#0e121e', 0.72, SPORT, { italic: true, cornerRadius: 16 }),
  theme('Classic', 'Clean white', '#ffffff', '#d7dde6', '#ffffff', '#e6e9ee', '#000000', 0, CLEAN, { up: '#ffffff', down: '#ffffff', cornerRadius: 0, shadow: 8 }),
  theme('Classic', 'Amber', '#ffbe3d', '#5fad60', '#ffffff', '#ffffff', '#000000', 0, PLAIN, { up: '#ff4d85', down: '#80ffd1', cornerRadius: 0, shadow: 5 }),
  theme('Classic', 'Neon', '#29f3e1', '#b84dff', '#f2fbff', '#a9d9e8', '#070b18', 0.6, SPORT, { border: '#29f3e1', track: '#29f3e1', up: '#ff4d9d', down: '#29f3a0', cornerRadius: 6, shadow: 10 }),

  theme('Road and racing', 'Race day', '#ff2d3f', '#ffb020', '#ffffff', '#c9ccd2', '#101114', 0.82, LOUD, { cornerRadius: 4 }),
  theme('Road and racing', 'Maillot', '#ffd21f', '#ff8a00', '#ffffff', '#d9d4c0', '#16140c', 0.78, SPORT, { italic: true, up: '#ffd21f', down: '#ffffff', cornerRadius: 8 }),
  theme('Road and racing', 'Velodrome', '#ff4fa3', '#37c8ff', '#ffffff', '#c9d3e6', '#121733', 0.78, SPORT, { italic: true, cornerRadius: 20 }),
  theme('Road and racing', 'Carbon', '#e8483f', '#8a8f98', '#f1f2f4', '#aab0b9', '#1b1d20', 0.88, PLAIN, { cornerRadius: 3, shadow: 2 }),
  theme('Road and racing', 'Grand tour', '#ff6fb1', '#ffd21f', '#ffffff', '#e2d6dc', '#2a1420', 0.76, CLASSIC, { italic: true, cornerRadius: 10 }),
  theme('Road and racing', 'Time trial', '#37e0a0', '#2aa8ff', '#ffffff', '#b8c7c2', '#0a1512', 0.7, SPORT, { italic: true, cornerRadius: 2 }),

  theme('Running and fitness', 'Track and field', '#ff5a36', '#ffc145', '#ffffff', '#d8cfc8', '#241410', 0.75, SPORT, { cornerRadius: 14 }),
  theme('Running and fitness', 'Marathon', '#35b6ff', '#3de8c8', '#ffffff', '#bcd0de', '#0d1b2a', 0.74, CLEAN, { cornerRadius: 18 }),
  theme('Running and fitness', 'Pulse', '#ff3b6b', '#ff9ac0', '#ffffff', '#e4c8d2', '#1d0d14', 0.72, SPORT, { cornerRadius: 24 }),
  theme('Running and fitness', 'Fresh lime', '#b6ff3b', '#3dffb0', '#ffffff', '#c8d6c0', '#10160c', 0.72, SPORT, { italic: true, cornerRadius: 10 }),

  theme('Outdoors', 'Trail', '#c8b25a', '#7fae52', '#f6f1e2', '#cfc8ae', '#1e2115', 0.76, SPORT, { track: '#e8dfc0', cornerRadius: 8 }),
  theme('Outdoors', 'Alpine', '#7fd4ff', '#ffffff', '#ffffff', '#cfe3ee', '#10222f', 0.62, CLEAN, { up: '#ff8a7a', down: '#7fd4ff', cornerRadius: 14, shadow: 6 }),
  theme('Outdoors', 'Desert', '#e8924a', '#d8c28a', '#fff6e8', '#dfcdb0', '#2c1a10', 0.74, CLASSIC, { track: '#f0dcc0', cornerRadius: 6 }),
  theme('Outdoors', 'Forest', '#5fd38a', '#c8e06a', '#f2fbf2', '#bcd2bf', '#0d2016', 0.76, SPORT, { track: '#d8ecd8', cornerRadius: 12 }),
  theme('Outdoors', 'Autumn', '#ff8c3a', '#ffd166', '#fff4e6', '#dcc6ae', '#2a160c', 0.76, CLASSIC, { italic: true, track: '#f4dcc0', cornerRadius: 10 }),
  theme('Outdoors', 'Golden hour', '#ffc46b', '#ff7a59', '#fff7ea', '#ecd7bb', '#2b1a1f', 0.55, CLEAN, { cornerRadius: 20, shadow: 8 }),

  theme('Water', 'Ocean', '#2fd6d0', '#3a8bff', '#f0fbff', '#b3d3dc', '#06202e', 0.74, CLEAN, { track: '#bdeaf0', cornerRadius: 18 }),
  theme('Water', 'Regatta', '#ff4a4a', '#ffffff', '#ffffff', '#c8d3e6', '#0c1f47', 0.84, CLASSIC, { cornerRadius: 4 }),
  theme('Water', 'Surf', '#ff7f6a', '#31e0d0', '#ffffff', '#c3e6e6', '#0a3440', 0.7, SPORT, { italic: true, cornerRadius: 24 }),
  theme('Water', 'Deep sea', '#46e0ff', '#6a7dff', '#e8f8ff', '#92b6c8', '#020d18', 0.82, MONO, { track: '#46e0ff', cornerRadius: 6 }),

  theme('Sky and drones', 'Glass cockpit', '#2fe0ff', '#ff4fd8', '#ffffff', '#a7c1cc', '#05090f', 0.86, PLAIN, { up: '#2fe05f', down: '#ffc23d', cornerRadius: 2, shadow: 1 }),
  theme('Sky and drones', 'Heads-up', '#3dff7a', '#3dff7a', '#3dff7a', '#3dff7a', '#000000', 0, MONO, { border: '#3dff7a', track: '#3dff7a', up: '#3dff7a', down: '#3dff7a', cornerRadius: 0, shadow: 6 }),
  theme('Sky and drones', 'Sky blue', '#ffffff', '#8fd3ff', '#ffffff', '#e0f0fb', '#1a5a96', 0.62, CLEAN, { up: '#ffe07a', down: '#ffffff', cornerRadius: 22, shadow: 5 }),
  theme('Sky and drones', 'Flight ops', '#ffb000', '#ffffff', '#ffffff', '#bfc3c9', '#14171b', 0.84, MONO, { cornerRadius: 3, shadow: 2 }),
  theme('Sky and drones', 'Night vision', '#7dff5a', '#d4ff9a', '#d8ffcc', '#92c884', '#04140a', 0.74, MONO, { border: '#7dff5a', track: '#7dff5a', cornerRadius: 0, up: '#d4ff9a', down: '#7dff5a' }),

  theme('Retro', 'Vintage speedo', '#d94f30', '#c79a4b', '#2b2318', '#5e5240', '#efe6d2', 0.94, CLASSIC, { border: '#2b2318', track: '#2b2318', up: '#b5301c', down: '#2f7a4a', cornerRadius: 30, shadow: 3 }),
  theme('Retro', 'Synthwave', '#ff3df0', '#3df0ff', '#fdf0ff', '#d2b8e6', '#1a0b33', 0.74, LOUD, { italic: true, border: '#ff3df0', track: '#3df0ff', cornerRadius: 4, shadow: 12 }),
  theme('Retro', 'Arcade', '#ffe600', '#ff3d3d', '#ffffff', '#c8c8d8', '#0a0a2a', 0.88, MONO, { border: '#3d6dff', track: '#3d6dff', cornerRadius: 0, shadow: 0 }),
  theme('Retro', 'Rally', '#ffffff', '#ffcb2e', '#ffffff', '#dfe3e8', '#0b3b82', 0.86, LOUD, { italic: true, up: '#ffcb2e', down: '#ffffff', cornerRadius: 2 }),
  theme('Retro', 'Terminal', '#39ff88', '#ffb000', '#d6ffe4', '#7fc79c', '#031008', 0.9, MONO, { border: '#39ff88', track: '#39ff88', cornerRadius: 0, shadow: 0 }),

  theme('Minimal', 'Monochrome', '#ffffff', '#9aa0a8', '#ffffff', '#c8ccd2', '#000000', 0.45, CLEAN, { up: '#ffffff', down: '#c8ccd2', cornerRadius: 8 }),
  theme('Minimal', 'Outline', '#ffffff', '#ffffff', '#ffffff', '#ffffff', '#000000', 0, PLAIN, { up: '#ffffff', down: '#ffffff', cornerRadius: 0, shadow: 12 }),
  theme('Minimal', 'Paper', '#2a6df4', '#e0457b', '#1b1f27', '#515866', '#f7f6f2', 0.95, CLEAN, { border: '#1b1f27', track: '#1b1f27', up: '#c9382c', down: '#1f8a4c', cornerRadius: 10, shadow: 3 }),
  theme('Minimal', 'Cinema', '#e8d9b8', '#a89878', '#f5efe2', '#c9c0ae', '#000000', 0.32, CLASSIC, { up: '#e8d9b8', down: '#a89878', cornerRadius: 2, shadow: 6 }),
  theme('Minimal', 'Pastel', '#ff9db8', '#9adcff', '#ffffff', '#e4e0ec', '#3a3350', 0.66, CLEAN, { cornerRadius: 26, shadow: 3 }),
  theme('Minimal', 'High contrast', '#ffff00', '#00e5ff', '#ffffff', '#ffffff', '#000000', 0.95, PLAIN, { up: '#ff8080', down: '#80ff80', cornerRadius: 4, shadow: 0 }),

  theme('Luxury', 'Black and gold', '#d8b25a', '#f2dc9e', '#f8f1dd', '#c2b48c', '#0e0c08', 0.86, CLASSIC, { border: '#d8b25a', track: '#d8b25a', cornerRadius: 6 }),
  theme('Luxury', 'British green', '#e3c578', '#ffffff', '#f4f0e0', '#c8c4a8', '#0c2c20', 0.88, CLASSIC, { track: '#e3c578', cornerRadius: 8 }),
  theme('Luxury', 'Rosso', '#ff3b30', '#ffcf40', '#ffffff', '#d8c8c8', '#2a0608', 0.84, CLEAN, { italic: true, cornerRadius: 6 }),
];
