// Bundles the three browser screens and the stylesheet into dist/.
import {build} from 'esbuild';
import {copyFileSync, mkdirSync} from 'node:fs';

mkdirSync('dist', {recursive: true});
await build({
  entryPoints: ['src/client/participant.mjs', 'src/client/stage.mjs', 'src/client/admin.mjs'],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: ['es2022'],
  minify: true,
  sourcemap: true,
  outdir: 'dist',
  logLevel: 'info',
});
copyFileSync('src/client/app.css', 'dist/app.css');
