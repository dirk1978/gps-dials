import { copyFileSync, mkdirSync } from 'node:fs';
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
