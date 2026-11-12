// Composes the 22 s soundtrack in code and writes assets/music.wav.
// The synthesis runs in a headless browser's OfflineAudioContext, so it is rendered, not recorded.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

function compose() {
  const SR = 48000, DUR = 22;
  const c = new OfflineAudioContext(2, SR * DUR, SR);
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const master = c.createGain(); master.gain.value = 0.8;
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.16;
  master.connect(comp); comp.connect(c.destination);
  master.gain.setValueAtTime(0.8, 21.1); master.gain.linearRampToValueAtTime(0.0001, 21.98);

  const noise = c.createBuffer(1, SR * 2, SR); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; }
  const conv = c.createConvolver(); { const len = SR * 2.6 | 0, ib = c.createBuffer(2, len, SR); for (let ch = 0; ch < 2; ch++) { const d = ib.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / len, 3); } conv.buffer = ib; }
  const rev = c.createGain(); rev.connect(conv); const rv = c.createGain(); rv.gain.value = 0.42; conv.connect(rv); rv.connect(master);
  const dl = c.createDelay(1); dl.delayTime.value = 0.375; const fb = c.createGain(); fb.gain.value = 0.34; const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 3600;
  const dly = c.createGain(); dly.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); const dw = c.createGain(); dw.gain.value = 0.36; dlp.connect(dw); dw.connect(master);
  const duck = c.createGain(); duck.connect(master);            // music bus, pumped by the kick
  const drums = c.createGain(); drums.gain.value = 0.95; drums.connect(master);

  function nz(t, dur, type, f0, f1, q, peak, dest, att) {
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(); s.buffer = noise; s.loop = true;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (att) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + att); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); }
    else { g.gain.setValueAtTime(peak, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); }
    s.connect(f); f.connect(g); dest.forEach(d => g.connect(d)); s.start(t, rnd()); s.stop(t + dur + 0.02);
  }
  function kick(t, v = 1) {
    const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.1);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3); o.connect(g); g.connect(drums); o.start(t); o.stop(t + 0.32);
    nz(t, 0.025, 'highpass', 2600, 2600, 0.5, 0.2 * v, [drums]);
    duck.gain.cancelScheduledValues(t); duck.gain.setValueAtTime(0.4, t); duck.gain.linearRampToValueAtTime(1, t + 0.36);
  }
  const clap = (t, v = 1) => { for (const d of [0, 0.011, 0.023]) nz(t + d, 0.16, 'bandpass', 1500, 1500, 0.9, 0.34 * v, [drums, rev]); };
  const hat = (t, v, open) => nz(t, open ? 0.24 : 0.045, 'highpass', 8200, 8200, 0.7, v, [drums]);
  const snare = (t, v) => { nz(t, 0.11, 'bandpass', 2100, 2100, 0.8, 0.3 * v, [drums, rev]); };
  function bass(t, m, d) {
    const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(), g2 = c.createGain();
    o.type = 'sawtooth'; o.frequency.value = mtof(m); o2.type = 'square'; o2.frequency.value = mtof(m + 12) * 1.004; g2.gain.value = 0.3;
    f.type = 'lowpass'; f.Q.value = 6; f.frequency.setValueAtTime(1700, t); f.frequency.exponentialRampToValueAtTime(280, t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.24, t + 0.006); g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(f); o2.connect(g2); g2.connect(f); f.connect(g); g.connect(duck); o.start(t); o2.start(t); o.stop(t + d + 0.03); o2.stop(t + d + 0.03);
  }
  function pluck(t, m, v) {
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth'; o.frequency.value = mtof(m);
    f.type = 'lowpass'; f.Q.value = 3; f.frequency.setValueAtTime(5200, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.16);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0006, t + 0.22);
    o.connect(f); f.connect(g); g.connect(duck); g.connect(dly); g.connect(rev); o.start(t); o.stop(t + 0.26);
  }
  function pad(t, notes, d, v, bright = 1600) {
    const f = c.createBiquadFilter(), g = c.createGain(); f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(bright, t + d * 0.5); f.frequency.linearRampToValueAtTime(700, t + d + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.08); g.gain.setValueAtTime(v, t + d - 0.1); g.gain.linearRampToValueAtTime(0.0001, t + d + 0.5);
    for (const n of notes) for (const det of [-8, 8]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(n); o.detune.value = det; o.connect(f); o.start(t); o.stop(t + d + 0.6); }
    f.connect(g); g.connect(duck); g.connect(rev);
  }
  function bell(t, m, v, len = 1.4) {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = mtof(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + 0.005); g.gain.exponentialRampToValueAtTime(0.0003, t + len);
    o.connect(g); g.connect(master); g.connect(rev); g.connect(dly); o.start(t); o.stop(t + len + 0.05);
  }
  function impact(t, v = 1) {
    const o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.5);
    g.gain.setValueAtTime(0.9 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9); o.connect(g); g.connect(master); o.start(t); o.stop(t + 1);
    const o2 = c.createOscillator(), g2 = c.createGain(); o2.type = 'triangle'; o2.frequency.setValueAtTime(300, t); o2.frequency.exponentialRampToValueAtTime(84, t + 0.4);
    g2.gain.setValueAtTime(0.35 * v, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.6); o2.connect(g2); g2.connect(master); o2.start(t); o2.stop(t + 0.7);
    nz(t, 1.5, 'highpass', 3500, 3500, 0.5, 0.34 * v, [master, rev]);     // crash
    nz(t, 0.3, 'lowpass', 900, 200, 0.6, 0.5 * v, [master]);
  }
  const whoosh = (t0, t1, v) => nz(t0, t1 - t0 + 0.25, 'bandpass', 300, 5200, 1.6, v, [master, rev], t1 - t0);
  function riser(t0, t1, v) {
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t0); o.frequency.exponentialRampToValueAtTime(880, t1);
    f.type = 'bandpass'; f.Q.value = 2; f.frequency.setValueAtTime(400, t0); f.frequency.exponentialRampToValueAtTime(4000, t1);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(v, t1); g.gain.linearRampToValueAtTime(0.0001, t1 + 0.03);
    o.connect(f); f.connect(g); g.connect(master); g.connect(rev); o.start(t0); o.stop(t1 + 0.05);
    whoosh(t0, t1, v * 1.5);
  }

  const CH = { Am: { r: 45, n: [57, 60, 64] }, F: { r: 41, n: [57, 60, 65] }, C: { r: 48, n: [55, 60, 64] }, G: { r: 43, n: [55, 59, 62] } };

  // 0-4: two hits, then a wind-up
  impact(0, 1); impact(2, 1);
  pad(0, [45, 52, 57, 60, 64], 1.7, 0.035, 900); pad(2, [45, 52, 57, 62, 65], 1.7, 0.04, 1300);
  for (let t = 0.5; t < 4; t += 0.25) if (Math.abs(t - 2) > 0.01) hat(t, (t * 4) % 2 ? 0.05 : 0.09);
  [0.5, 1, 1.5].forEach((t, i) => pluck(t, [69, 72, 76][i], 0.07)); [2.5, 2.75, 3].forEach((t, i) => pluck(t, [69, 74, 77][i], 0.08));
  kick(1, 0.7); kick(1.5, 0.7); kick(3, 0.7);
  riser(2.7, 4, 0.1);
  for (let i = 0; i < 8; i++) snare(3 + i * 0.125, 0.35 + i * 0.09);

  // 4-16: the groove, two bars per piece
  const prog = [[4, 'Am'], [6, 'F'], [8, 'C'], [10, 'G'], [12, 'Am'], [14, 'F']];
  const ARP = [0, 1, 2, 1, 2, 1, 0, 2, 0, 1, 2, 1, 2, 0, 1, 2];
  for (const [t0, name] of prog) {
    const ch = CH[name], lift = t0 >= 12 ? 12 : 0, fillBar = (t0 - 4) % 4 === 2;
    pad(t0, ch.n.concat([ch.n[0] + 12]), 1.9, 0.034, t0 >= 12 ? 2400 : 1700);
    for (let s = 0; s < 16; s++) {
      const t = t0 + s * 0.125, inFill = fillBar && s >= 12;
      if (s % 4 === 0 && !inFill) kick(t, 1);
      if ((s === 4 || s === 12) && !inFill) clap(t, 1);
      if (!inFill) { if (s % 4 === 2) hat(t, 0.13); else if (s % 2 === 1) hat(t, 0.045); }
      if (s % 2 === 0 && !inFill) bass(t, ch.r + (s === 14 || s === 6 ? 12 : 0), 0.21);
      pluck(t, ch.n[ARP[s]] + 12 + lift, inFill ? 0.035 : (s % 4 === 0 ? 0.085 : 0.06));
    }
    if (fillBar) { riser(t0 + 1.45, t0 + 2, 0.09); for (let i = 0; i < 4; i++) snare(t0 + 1.5 + i * 0.125, 0.5 + i * 0.15); }
  }
  impact(4, 0.9); impact(8, 0.8); impact(12, 0.8);

  // 16-22: half time, resolve
  impact(16, 1.1);
  [[16, 'F'], [18, 'G'], [20, 'C']].forEach(([t0, name], bi) => {
    const ch = CH[name];
    pad(t0, [ch.r, ch.r + 7].concat(ch.n, [ch.n[0] + 12, ch.n[1] + 12]), bi === 2 ? 1.6 : 1.9, 0.05, 2600);
    kick(t0, 1); if (bi < 2) { clap(t0 + 1, 0.9); kick(t0 + 1.5, 0.7); }
    bass(t0, ch.r, 0.9); if (bi < 2) bass(t0 + 1.5, ch.r + 12, 0.3);
    for (let s = 0; s < (bi === 2 ? 8 : 16); s++) if (s % 2 === 0 || bi < 2) pluck(t0 + s * 0.125, ch.n[ARP[s]] + 24, 0.05 * (bi === 2 ? 1 - s / 9 : 1));
    for (let s = 2; s < 16; s += 4) if (bi < 2) hat(t0 + s * 0.125, 0.09);
  });
  impact(20, 0.9);
  [84, 88, 91, 96].forEach((m, i) => bell(20 + i * 0.11, m, 0.08, 1.6));

  return c.startRendering().then(buf => {
    const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length;
    let peak = 0, sum = 0; for (let i = 0; i < n; i++) { peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i])); sum += L[i] * L[i] + R[i] * R[i]; }
    const k = 0.89 / peak, out = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) { out[i * 2] = Math.max(-1, Math.min(1, L[i] * k)) * 32767; out[i * 2 + 1] = Math.max(-1, Math.min(1, R[i] * k)) * 32767; }
    const bytes = new Uint8Array(out.buffer); let bin = ''; const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return { b64: btoa(bin), peak, rms: Math.sqrt(sum / (2 * n)) * k, sr: SR, frames: n };
  });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGEERROR', e.message));
  await page.goto('about:blank');
  const r = await page.evaluate('(' + compose.toString() + ')()');
  await browser.close();
  const pcm = Buffer.from(r.b64, 'base64'), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22);
  h.writeUInt32LE(r.sr, 24); h.writeUInt32LE(r.sr * 4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  const out = path.join(__dirname, '..', 'assets', 'music.wav');
  const raw = path.join(require('os').tmpdir(), 'one-conversation-raw.wav');
  fs.writeFileSync(raw, Buffer.concat([h, pcm]));
  // master for phones and feeds: about -15 LUFS with the true peak under -1 dBTP
  require('child_process').execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', raw,
    '-af', 'volume=9dB,alimiter=level_in=1:level_out=1:limit=0.76:attack=3:release=60:level=disabled', '-ar', '48000', '-c:a', 'pcm_s16le', out]);
  console.log('music.wav written and mastered (raw peak ' + r.peak.toFixed(2) + ')');
})();
