// Converts League Gothic (SIL Open Font License) into the typeface JSON that three.js extrudes into 3D letters.
import fs from 'node:fs';
import opentype from 'opentype.js';

const src = fs.readFileSync(new URL('../node_modules/@fontsource/league-gothic/files/league-gothic-latin-400-normal.woff', import.meta.url));
const font = opentype.parse(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
const scale = 100000 / ((font.unitsPerEm || 2048) * 72), r = Math.round;
const glyphs = {};
for (const ch of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789?!.,&-') {
  const g = font.charToGlyph(ch);
  if (!g || !g.unicode) continue;
  let o = '';
  for (const c of g.path.commands) {
    const t = c.type.toLowerCase() === 'c' ? 'b' : c.type.toLowerCase();
    o += t + ' ';
    if (c.x !== undefined) o += r(c.x * scale) + ' ' + r(c.y * scale) + ' ';
    if (c.x1 !== undefined) o += r(c.x1 * scale) + ' ' + r(c.y1 * scale) + ' ';
    if (c.x2 !== undefined) o += r(c.x2 * scale) + ' ' + r(c.y2 * scale) + ' ';
  }
  glyphs[ch] = { ha: r(g.advanceWidth * scale), x_min: r(g.xMin * scale), x_max: r(g.xMax * scale), o };
}
fs.writeFileSync(new URL('./font.json', import.meta.url), JSON.stringify({ glyphs, familyName: 'League Gothic', ascender: r(font.ascender * scale), descender: r(font.descender * scale), underlinePosition: -100, underlineThickness: 50, boundingBox: { xMin: 0, xMax: 1000, yMin: -200, yMax: 1000 }, resolution: 1000 }));
console.log('font.json:', Object.keys(glyphs).length, 'glyphs');
