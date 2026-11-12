// Bundles src/scene.js with three.js into lib/scene.js for the composition.
// Two things keep the bundle deterministic for frame-by-frame rendering:
//  - Math.random (three.js uses it for object ids) is swapped for a seeded generator.
//  - three.js's own animation-loop helper is disabled; frames are only ever drawn from the hf-seek event.
import { build } from 'esbuild';
import fs from 'node:fs';

const out = 'lib/scene.js';
await build({
  entryPoints: ['src/scene.js'], bundle: true, format: 'iife', minify: true, target: 'chrome120', outfile: out,
  define: { 'Math.random': '__seeded' },
  banner: { js: 'var __seeded=(function(){var s=20261112;return function(){s|=0;s=s+0x6D2B79F5|0;var t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}})();' },
});
const js = fs.readFileSync(out, 'utf8');
fs.writeFileSync(out, js.replaceAll('requestAnimationFrame', '__hfNoFrameLoop'));
fs.copyFileSync('node_modules/gsap/dist/gsap.min.js', 'lib/gsap.min.js');
console.log('built', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
