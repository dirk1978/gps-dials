import { indexAtTime, positionAt } from '../../sync/timeline.ts';
import { mapProvider, mapView, projectX, projectY, tileUrl, visibleTiles } from '../map-view.ts';
import { rgba, setFont, type DisplayDef, type DrawEnv } from './common.ts';
import { drawMarker, drawRoute, trackHeading } from './route-line.ts';

function shapePath(env: DrawEnv): void {
  const { ctx, box, style, unit } = env;
  ctx.beginPath();
  if (style.mapShape === 'circle') {
    ctx.arc(box.x + box.w / 2, box.y + box.h / 2, Math.min(box.w, box.h) / 2, 0, Math.PI * 2);
  } else {
    ctx.roundRect(box.x, box.y, box.w, box.h, style.mapShape === 'square' ? 0 : Math.min(style.cornerRadius * unit, box.h / 2, box.w / 2));
  }
}

/** A real map behind your track, framed however the widget asks. */
export const map: DisplayDef = {
  id: 'map',
  label: 'Map',
  usesTrack: true,
  draw(env) {
    const { ctx, box, style, data, time, clipStart, clipEnd, unit } = env;
    const { track } = data;
    const provider = mapProvider(style, env.mapToken);
    const view = mapView({ style, data, width: box.w, height: box.h, time, clipStart, clipEnd, unit, maxZoom: provider.maxZoom, tileBias: provider.tileBias });
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;

    shapePath(env);
    ctx.fillStyle = rgba(style.panelColor, Math.max(style.panelOpacity, provider.none ? 0 : 0.85));
    ctx.fill();

    ctx.save();
    shapePath(env);
    ctx.clip();
    ctx.shadowColor = 'transparent';
    ctx.translate(cx, cy);
    ctx.rotate(view.rotation);

    if (!provider.none) {
      ctx.save();
      ctx.globalAlpha *= style.mapOpacity;
      const filter = `saturate(${style.mapSaturation}) brightness(${style.mapBrightness}) contrast(${style.mapContrast})`;
      if (filter !== 'saturate(1) brightness(1) contrast(1)') ctx.filter = filter;
      for (const tile of visibleTiles(view, box.w, box.h)) {
        const image = env.tiles?.image(tileUrl(provider, tile, env.mapToken));
        // A hair of overlap stops seams showing between tiles when the map turns.
        if (image) ctx.drawImage(image, tile.left - 0.5, tile.top - 0.5, tile.size + 1, tile.size + 1);
      }
      ctx.restore();
      if (style.mapDarken > 0) {
        const reach = Math.hypot(box.w, box.h);
        ctx.fillStyle = `rgba(0, 0, 0, ${style.mapDarken})`;
        ctx.fillRect(-reach, -reach, reach * 2, reach * 2);
      }
    }

    const project = (i: number): [number, number] => [
      (projectX(track.lon[i]) - view.cx) * view.worldSize,
      (projectY(track.lat[i]) - view.cy) * view.worldSize,
    ];
    const last = track.t.length - 1;
    const from = style.fullRide ? 0 : indexAtTime(track.t, clipStart);
    const to = style.fullRide ? last : indexAtTime(track.t, clipEnd);
    const now = indexAtTime(track.t, time);
    const here = positionAt(track, time);
    const head: [number, number] = [(projectX(here.lon) - view.cx) * view.worldSize, (projectY(here.lat) - view.cy) * view.worldSize];
    drawRoute(env, project, from, to, now, head);
    drawMarker(env, head[0], head[1], trackHeading(track, now) + view.rotation);
    ctx.restore();

    if (style.borderWidth > 0) {
      shapePath(env);
      ctx.strokeStyle = rgba(style.borderColor, 0.35);
      ctx.lineWidth = style.borderWidth * unit;
      ctx.stroke();
    }

    // The credit is a condition of using the map, so it stays on unless there is no map.
    if (!provider.none && provider.credit) {
      const size = Math.max(9 * unit, box.h * 0.035);
      const creditStyle = { ...style, italic: false, font: 'Arial' };
      setFont(ctx, creditStyle, size, false);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      const inset = style.mapShape === 'circle' ? box.w * 0.16 : 6 * unit;
      // It has to stay readable whole, even on a map as narrow as a vertical crop makes it.
      const room = box.w - inset * 2;
      const wide = ctx.measureText(provider.credit).width;
      if (wide > room) setFont(ctx, creditStyle, size * (room / wide), false);
      ctx.lineWidth = 3 * unit;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.strokeText(provider.credit, box.x + box.w - inset, box.y + box.h - (style.mapShape === 'circle' ? box.h * 0.06 : 4 * unit));
      ctx.fillStyle = '#ffffff';
      ctx.fillText(provider.credit, box.x + box.w - inset, box.y + box.h - (style.mapShape === 'circle' ? box.h * 0.06 : 4 * unit));
    }
  },
};
