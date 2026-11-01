import type { TerrainPoint } from './compare.ts';

const ENDPOINT = 'https://api.open-meteo.com/v1/elevation';
const BATCH = 100;

/** Credit the service asks for. Shown wherever its numbers are. */
export const TERRAIN_CREDIT = 'Terrain from the Copernicus GLO-90 elevation model, via Open-Meteo';

/** Sends only these coordinates to Open-Meteo. Only ever called when someone asks for the check. */
export async function fetchTerrain(points: { t: number; lat: number; lon: number }[]): Promise<TerrainPoint[]> {
  const out: TerrainPoint[] = [];
  for (let i = 0; i < points.length; i += BATCH) {
    const batch = points.slice(i, i + BATCH);
    const latitude = batch.map(p => p.lat.toFixed(5)).join(',');
    const longitude = batch.map(p => p.lon.toFixed(5)).join(',');
    const response = await fetch(`${ENDPOINT}?latitude=${latitude}&longitude=${longitude}`);
    if (!response.ok) throw new Error(`The terrain service said no (${response.status}). Try again later.`);
    const { elevation } = await response.json() as { elevation: number[] };
    batch.forEach((p, j) => out.push({ ...p, elevation: elevation[j] }));
  }
  return out;
}
