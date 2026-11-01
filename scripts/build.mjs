import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

mkdirSync('dist', { recursive: true });

await build({
  entryPoints: {
    main: 'src/app/main.ts',
    preload: 'src/app/preload.ts',
    'sync-worker': 'src/app/sync-worker.ts',
    'overlay-worker': 'src/app/overlay-worker.ts',
  },
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: ['electron', '@napi-rs/canvas'],
});

await build({
  entryPoints: { renderer: 'src/app/renderer/renderer.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome130',
  loader: { '.png': 'dataurl', '.woff': 'file', '.woff2': 'file' },
});

copyFileSync('src/app/renderer/index.html', 'dist/index.html');

// The export draws text outside the browser, so it needs the font files themselves.
mkdirSync('dist/fonts', { recursive: true });
for (const weight of ['600-normal', '700-normal', '600-italic', '700-italic']) {
  const file = `barlow-condensed-latin-${weight}.woff2`;
  // A running copy of the app keeps these open, and they never change between builds.
  if (!existsSync(`dist/fonts/${file}`)) copyFileSync(`node_modules/@fontsource/barlow-condensed/files/${file}`, `dist/fonts/${file}`);
}
