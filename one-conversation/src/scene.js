/* One Conversation: a 22 s vertical recap in 3D.
   Every frame is a pure function of timeline time (HyperFrames seeks frames out of order). */
import * as THREE from 'three';
import { Font } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import fontData from './font.json';

const W = 1080, H = 1920, DUR = 22;
const GAP = 30, D = 16, CUT = [2, 4, 8, 12, 16];
const ZS = k => -k * GAP;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
const eOutCubic = x => 1 - Math.pow(1 - x, 3);
const eInCubic = x => x * x * x;
const eOutExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const eInOutQuint = x => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2);
const eOutBack = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
const smooth = x => x * x * (3 - 2 * x);
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------- renderer ---------- */
const canvas = document.getElementById('stage');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const GROUND = 0x05040a;
const scene = new THREE.Scene();
scene.background = new THREE.Color(GROUND);
scene.fog = new THREE.Fog(GROUND, 20, 46);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.5;

const camera = new THREE.PerspectiveCamera(35, W / H, 0.25, 220);
const key = new THREE.DirectionalLight(0xffe4c8, 2.6); key.position.set(-5, 7, 9); scene.add(key);
const rim = new THREE.DirectionalLight(0x86dcff, 2.2); rim.position.set(6, 3, -7); scene.add(rim);
scene.add(new THREE.HemisphereLight(0x8a90c8, 0x08060c, 0.5));

/* ---------- type ---------- */
const font = new Font(fontData);
const RES = fontData.resolution;
const glyphCache = new Map();
function glyph(ch, depth) {
  const k = ch + depth;
  if (!glyphCache.has(k)) {
    const g = new TextGeometry(ch, { font, size: 1, depth, curveSegments: 8, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.011, bevelOffset: 0, bevelSegments: 2 });
    g.computeBoundingBox();
    glyphCache.set(k, g);
  }
  return glyphCache.get(k);
}
const CAP = glyph('H', 0.2).boundingBox.max.y;
function makeWord(str, mat, depth = 0.2) {
  const g = new THREE.Group(), letters = [];
  let x = 0;
  for (const ch of str) {
    const gl = fontData.glyphs[ch];
    const a = (gl ? gl.ha : RES * 0.28) / RES;
    if (ch !== ' ' && gl) {
      const m = new THREE.Mesh(glyph(ch, depth), mat);
      const pv = new THREE.Group();
      m.position.set(-a / 2, -CAP / 2, -depth / 2);
      pv.add(m); g.add(pv);
      letters.push({ pv, x0: x + a / 2, y0: 0, i: letters.length });
    }
    x += a;
  }
  for (const L of letters) { L.x0 -= x / 2; L.pv.position.set(L.x0, 0, 0); }
  g.userData = { width: x, letters, s: 1 };
  return g;
}
function fit(g, targetW, maxCap) {
  let s = targetW / g.userData.width;
  if (maxCap) s = Math.min(s, maxCap / CAP);
  g.scale.setScalar(s); g.userData.s = s;
  return g;
}
/* letters land one after another */
function landLetters(word, t, t0, step = 0.04, dur = 0.5) {
  for (const L of word.userData.letters) {
    const p = eOutBack(seg(t, t0 + L.i * step, t0 + L.i * step + dur));
    const v = Math.max(p, 0.0001);
    L.pv.scale.setScalar(v);
    L.pv.rotation.set((1 - p) * 1.5, 0, 0);
    L.pv.position.set(L.x0, (1 - p) * -0.7, 0);
  }
}
/* letters scatter outward so the camera can pass through */
function scatterLetters(word, t, t0, t1, cy, seed) {
  const u = seg(t, t0, t1); if (u <= 0) return;
  const e = eInCubic(u), s = word.userData.s;
  for (const L of word.userData.letters) {
    const wx = L.x0 * s, wy = cy, n = Math.hypot(wx, wy) || 1;
    const r1 = hash(seed + L.i * 3.1), r2 = hash(seed + L.i * 7.7);
    const dx = (wx / n + (r1 - 0.5) * 0.9) * e * 9, dy = (wy / n + (r2 - 0.5) * 0.9) * e * 9 + (Math.abs(wx) < 0.4 ? e * 5 : 0);
    L.pv.position.set(L.x0 + dx / s, dy / s, e * 5 / s);
    L.pv.rotation.set(e * (r1 - 0.5) * 7, e * (r2 - 0.5) * 7, e * (r1 - r2) * 4);
  }
}

const typeMat = new THREE.MeshStandardMaterial({ color: 0xf4f2ff, roughness: 0.42, metalness: 0.12 });
const glowMat = c => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.1 });
const ION = 0x6ff3ff, PINK = 0xff4fa3, PEACH = 0xffb37a, BLUE = 0x6fa8ff, VIOLET = 0xb69cff, GOLD = 0xffd27a;

/* ---------- small makers ---------- */
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
const glowTex = canvasTex(256, 256, (g, w) => {
  const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,.32)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, w, w);
});
function makeGlow(color, size) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  m.renderOrder = -2; return m;
}
function makeStrip(color, len, x, y, z, rot) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(len, 0.045, 0.045), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z); m.rotation.z = rot; return m;
}
function label(text, color, worldW) {
  const tex = canvasTex(1400, 120, (g, w, h) => {
    g.font = '500 58px "IBM Plex Mono", ui-monospace, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
    try { g.letterSpacing = '5px'; } catch (e) {}
    g.fillStyle = color; g.fillText(text, w / 2, h / 2 + 2);
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(worldW, worldW * 120 / 1400), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  m.renderOrder = 3; return m;
}

/* phone: bevelled slab + emissive screen with rounded corners */
const PW = 2, PH = 4.16, PD = 0.13, PB = 0.035;
const phoneGeo = (() => {
  const r = 0.3, w = PW - PB * 2, h = PH - PB * 2, s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2); s.lineTo(w / 2 - r, -h / 2); s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r); s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2); s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r); s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: PD, bevelEnabled: true, bevelThickness: PB, bevelSize: PB, bevelSegments: 4, curveSegments: 10 });
  g.translate(0, 0, -PD / 2); return g;
})();
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0c0c13, roughness: 0.3, metalness: 0.9 });
const SW = PW - 0.15, SH = PH - 0.15;
function screenMat() {
  return new THREE.ShaderMaterial({
    transparent: true,
    uniforms: { tA: { value: null }, tB: { value: null }, uMix: { value: 0 }, uAspect: { value: SW / SH }, uRadius: { value: 0.052 }, uCrop: { value: new THREE.Vector2(1, 1) }, uGain: { value: 1.25 } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform sampler2D tA,tB;uniform float uMix,uAspect,uRadius,uGain;uniform vec2 uCrop;
      void main(){
        vec2 q=(vUv-.5)*vec2(uAspect,1.);vec2 b=vec2(uAspect*.5,.5)-uRadius;
        float d=length(max(abs(q)-b,0.))-uRadius;float a=clamp(-d/.004,0.,1.);if(a<=0.)discard;
        vec2 uv=(vUv-.5)*uCrop+.5;
        float m=1.-smoothstep(uMix*1.4-.25,uMix*1.4,1.-vUv.y+(vUv.x-.5)*.12);
        vec3 c=mix(texture2D(tB,uv).rgb,texture2D(tA,uv).rgb,m)*uGain;
        c+=smoothstep(.62,1.05,vUv.y+vUv.x*.4)*.035;
        gl_FragColor=vec4(c,a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
function makePhone(mat) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(phoneGeo, bodyMat));
  const s = new THREE.Mesh(new THREE.PlaneGeometry(SW, SH), mat); s.position.z = PD / 2 + PB + 0.004; g.add(s);
  return g;
}

/* ---------- world ---------- */
const stations = [];
for (let k = 0; k < 6; k++) { const g = new THREE.Group(); g.position.z = ZS(k); scene.add(g); stations.push(g); }

// drifting dust for depth and speed
{
  const N = 1500, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    let x, y, n = 0; do { x = (hash(i * 1.3 + n * 17.7) - 0.5) * 22; y = (hash(i * 2.9 + 4 + n * 9.1) - 0.5) * 26; n++; } while (Math.abs(x) < 1.7 && Math.abs(y) < 2.8 && n < 20);
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = 14 - hash(i * 5.3 + 9) * 185;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xbcd6ff, size: 0.16, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })));
}

/* S1 / S2: the two counts */
function makeCount(k, numeral, word, color) {
  const g = stations[k];
  const num = fit(makeWord(numeral, glowMat(color), 0.26), 99, 3.5); num.position.y = 2.05; g.add(num);
  const w = fit(makeWord(word, typeMat), 4.75, 1.32); g.add(w);
  w.position.y = -0.72 - (w.userData.s * CAP) / 2 + 0.66;
  const glow = makeGlow(color, 15); glow.position.set(0, 1.4, -5); g.add(glow);
  const strips = [makeStrip(color, 11, -1.5, 3.6, -4, 0.5), makeStrip(0xf4f2ff, 9, 2, -1.2, -6, 0.5), makeStrip(color, 7, 3.2, 1.6, -3, -1.05)];
  strips.forEach(s => g.add(s));
  return { num, w, glow, strips };
}
const c1 = makeCount(0, '3', 'PROMPTS', ION);
const c2 = makeCount(1, '1', 'CONVERSATION', GOLD);

/* S3 / S4 / S5: the three things */
function makeShow(k, title, caption, a, b, mat) {
  const g = stations[k];
  const head = fit(makeWord(title, typeMat), 3.9, 1.12); head.position.y = 3.36; g.add(head);
  const cap = label(caption, '#' + new THREE.Color(a).getHexString(), 4.9); cap.position.set(0, 2.42, 0.2); g.add(cap);
  const phone = makePhone(mat); phone.scale.setScalar(0.955); g.add(phone);
  const glow = makeGlow(a, 13); glow.position.set(0, 0, -4); g.add(glow);
  const strips = [makeStrip(a, 12, -2.2, 2.2, -5, 0.62), makeStrip(b, 10, 2.4, -1.6, -4, 0.62), makeStrip(b, 6, -3, -2.6, -3, -0.95)];
  strips.forEach(s => g.add(s));
  return { head, cap, phone, glow, strips, mat };
}
const gameMat = screenMat(), filmMat = screenMat(), recMat = screenMat();
const s3 = makeShow(2, 'A GAME', '3D world · physics · live music', ION, PINK, gameMat);
const s4 = makeShow(3, 'A FILM', 'written · painted · scored', PEACH, BLUE, filmMat);
const s5 = makeShow(4, 'THIS VIDEO', '3D · motion · rendered from code', VIOLET, ION, recMat);

/* S6: the question */
const end = (() => {
  const g = stations[5];
  const l1 = fit(makeWord('WHAT WOULD', typeMat), 4.5, 0.98); l1.position.y = 3.02; g.add(l1);
  const l2 = fit(makeWord('YOU ASK FOR?', glowMat(GOLD)), 4.95, 1.12); l2.position.y = 1.7; g.add(l2);
  const m1 = screenMat(), m2 = screenMat();
  const phones = [makePhone(m1), makePhone(recMat), makePhone(m2)];
  phones.forEach((p, i) => { p.scale.setScalar(i === 1 ? 0.46 : 0.41); g.add(p); });
  const glow = makeGlow(GOLD, 13); glow.position.set(0, 0.6, -5); g.add(glow);
  const strips = [makeStrip(GOLD, 12, -2, 0.3, -5, 0.5), makeStrip(ION, 10, 2.5, 2.6, -6, 0.5), makeStrip(VIOLET, 7, 2.6, -2.4, -3, -1.0)];
  strips.forEach(s => g.add(s));
  return { l1, l2, phones, glow, strips, m1, m2 };
})();

/* the video inside the video: the scene renders into the third phone's screen */
const rtOpts = { samples: 2, colorSpace: THREE.LinearSRGBColorSpace };
const rtA = new THREE.WebGLRenderTarget(540, 960, rtOpts), rtB = new THREE.WebGLRenderTarget(540, 960, rtOpts);
const blackTex = new THREE.DataTexture(new Uint8Array([6, 5, 12, 255]), 1, 1); blackTex.needsUpdate = true;
recMat.uniforms.tA.value = blackTex; recMat.uniforms.tB.value = blackTex; recMat.uniforms.uMix.value = 1;
recMat.uniforms.uCrop.value.set((SW / SH) / (540 / 960), 1); recMat.uniforms.uGain.value = 1;

/* ---------- camera ---------- */
function holdZ(k, t) {
  const a = k === 0 ? 0 : CUT[k - 1] + 0.3, d = k === 5 ? DUR : CUT[k] - 0.5;
  return ZS(k) + D + lerp(0.8, -0.8, seg(t, a, d));
}
function camPath(t) {
  for (let k = 0; k < 5; k++) {
    const d = CUT[k] - 0.5, a = CUT[k] + 0.3;
    if (t < d) return { z: holdZ(k, t), tr: 0, k };
    if (t < a) { const u = (t - d) / (a - d); return { z: lerp(holdZ(k, d), holdZ(k + 1, a), eInOutQuint(u)), tr: Math.sin(u * Math.PI), k }; }
  }
  return { z: holdZ(5, t), tr: 0, k: 5 };
}

/* ---------- per-shot motion ---------- */
function strips(list, t, t0) { list.forEach((s, i) => { s.scale.x = Math.max(0.0001, eOutExpo(seg(t, t0 + i * 0.12, t0 + 0.9 + i * 0.12))); }); }

function updCount(c, t, t0, out0, first) {
  const tt = t - t0;
  if (first) {
    c.num.rotation.y = lerp(-0.7, 0, eOutBack(seg(tt, 0, 0.95))) + Math.sin(tt * 1.4) * 0.06;
    c.num.scale.setScalar(c.num.userData.s * lerp(1.14, 1, eOutExpo(seg(tt, 0, 0.7))));
    c.num.position.y = 2.05;
    for (const L of c.w.userData.letters) { const p = eOutBack(seg(tt, 0.12 + L.i * 0.07, 0.8 + L.i * 0.07)); L.pv.rotation.set((1 - p) * -Math.PI * 2, 0, 0); L.pv.position.set(L.x0, 0, 0); L.pv.scale.setScalar(1); }
  } else {
    c.num.visible = tt > -0.15;
    const p = eOutBack(seg(tt, -0.12, 0.5));
    c.num.position.y = lerp(9, 2.05, p);
    c.num.rotation.y = lerp(1.2, 0, eOutCubic(seg(tt, -0.12, 0.7))) + Math.sin(tt * 1.4) * 0.06;
    c.num.scale.setScalar(c.num.userData.s);
    landLetters(c.w, tt, 0.1, 0.032, 0.42);
  }
  c.num.userData.letters[0].pv.position.set(0, 0, 0); c.num.userData.letters[0].pv.rotation.set(0, 0, 0);
  scatterLetters(c.w, t, out0, out0 + 0.62, -0.7, t0 * 13 + 1);
  scatterLetters(c.num, t, out0, out0 + 0.62, 2.05, t0 * 13 + 5);
  c.glow.material.opacity = 0.42 * seg(tt, first ? -1 : -0.2, first ? -0.9 : 0.5);
  strips(c.strips, first ? tt + 1 : tt, 0);
}

function updShow(s, t, t0, k) {
  const tt = t - t0;
  s.phone.visible = tt > -0.3; s.cap.visible = tt > 0.5;
  const pin = eOutExpo(seg(tt, -0.25, 0.75));
  const face = smooth(seg(tt, 3.0, 3.45));
  s.phone.position.set(0, lerp(-8, -0.05, pin) + Math.sin(tt * 1.6) * 0.045 * (1 - face), 0);
  s.phone.rotation.set(lerp(0.5, 0, pin) + Math.sin(tt * 0.9) * 0.04 * (1 - face), (lerp(-1.5, 0, pin) + Math.sin(tt * 1.15 + k) * 0.26) * (1 - face), lerp(-0.25, 0, pin));
  landLetters(s.head, tt, 0.18, 0.045, 0.5);
  scatterLetters(s.head, t, t0 + 3.4, t0 + 4.0, 3.36, k * 17);
  const co = seg(tt, 0.62, 0.95) * (1 - seg(tt, 3.25, 3.5));
  s.cap.material.opacity = co; s.cap.position.y = 2.42 - (1 - eOutCubic(seg(tt, 0.62, 1.0))) * 0.25;
  s.glow.material.opacity = 0.5 * seg(tt, -0.2, 0.6) * (1 - seg(tt, 3.5, 4.0) * 0.7);
  strips(s.strips, tt, 0.05);
}

function updEnd(t) {
  const tt = t - 16;
  landLetters(end.l1, tt, 0.32, 0.035, 0.5);
  landLetters(end.l2, tt, 0.62, 0.035, 0.5);
  const xs = [-1.62, 0, 1.62], ys = [0.4, 0, -0.4];
  end.phones.forEach((p, i) => {
    p.visible = tt > 0.45 + i * 0.14;
    const pin = eOutBack(seg(tt, 0.5 + i * 0.14, 1.25 + i * 0.14));
    p.position.set(xs[i], lerp(-7, -0.3, pin) + Math.sin(tt * 1.3 + i * 1.7) * 0.05, i === 1 ? 0.5 : 0);
    p.rotation.set(Math.sin(tt * 0.8 + i) * 0.04, ys[i] + Math.sin(tt * 0.7 + i * 2) * 0.1, (1 - pin) * (i - 1) * 0.5);
  });
  end.glow.material.opacity = 0.46 * seg(tt, -0.2, 0.8);
  strips(end.strips, tt, 0.1);
}

function update(t) {
  const cp = camPath(t);
  const orbit = smooth(seg(t, 12.4, 13.2)) * (1 - smooth(seg(t, 14.9, 15.5)));
  const cx = Math.sin(t * 0.6) * 0.22 + orbit * Math.sin((t - 12.4) * 1.25) * 1.9;
  const cy = 0.5 + Math.sin(t * 0.45 + 1) * 0.14;
  camera.position.set(cx, cy, cp.z);
  camera.lookAt(cx * 0.25 * (1 - orbit), 0.5, cp.z - D);
  camera.rotation.z += cp.tr * 0.16 * (cp.k % 2 ? -1 : 1) + Math.sin(t * 0.5) * 0.008;
  camera.fov = 35 + cp.tr * 15; camera.updateProjectionMatrix();

  stations.forEach((g, k) => { const dz = cp.z - ZS(k); g.visible = dz > -3 && dz < 52; });
  if (stations[0].visible) updCount(c1, t, 0, 1.5, true);
  if (stations[1].visible) updCount(c2, t, 2, 3.5, false);
  if (stations[2].visible) { updShow(s3, t, 4, 2); gameMat.uniforms.uMix.value = smooth(seg(t, 5.5, 6.1)); }
  if (stations[3].visible) {
    updShow(s4, t, 8, 3);
    const second = t >= 10.3;
    filmMat.uniforms.tB.value = second ? TX.dawn : TX.words; filmMat.uniforms.tA.value = second ? TX.morning : TX.dawn;
    filmMat.uniforms.uMix.value = second ? smooth(seg(t, 10.5, 11.1)) : smooth(seg(t, 9.2, 9.8));
  }
  if (stations[4].visible) updShow(s5, t, 12, 4);
  if (stations[5].visible) updEnd(t);
}

/* ---------- build + seek ---------- */
const TX = {};
let ready = false, pending = 0;
function renderAt(t) {
  pending = t; if (!ready) return;
  t = clamp(t, 0, DUR - 1e-4);
  update(t);
  if (stations[4].visible || stations[5].visible) {
    recMat.uniforms.tA.value = blackTex; renderer.setRenderTarget(rtA); renderer.render(scene, camera);
    recMat.uniforms.tA.value = rtA.texture; renderer.setRenderTarget(rtB); renderer.render(scene, camera);
    recMat.uniforms.tA.value = rtB.texture; renderer.setRenderTarget(null);
  }
  renderer.render(scene, camera);
}
const build = (async () => {
  const loader = new THREE.TextureLoader();
  const load = (key, file) => new Promise((res, rej) => loader.load('assets/' + file, tx => { tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 8; TX[key] = tx; res(); }, undefined, rej));
  await Promise.all([load('title', 'game-title.jpg'), load('play', 'game-play.jpg'), load('words', 'film-words.jpg'), load('dawn', 'film-dawn.jpg'), load('morning', 'film-morning.jpg')]);
  gameMat.uniforms.tB.value = TX.title; gameMat.uniforms.tA.value = TX.play;
  filmMat.uniforms.tB.value = TX.words; filmMat.uniforms.tA.value = TX.dawn;
  end.m1.uniforms.tA.value = end.m1.uniforms.tB.value = TX.play; end.m1.uniforms.uMix.value = 1;
  end.m2.uniforms.tA.value = end.m2.uniforms.tB.value = TX.dawn; end.m2.uniforms.uMix.value = 1;
  ready = true; renderAt(pending);
})();
window.__hf = window.__hf || {}; window.__hf.buildReady = window.__hf.buildReady || {};
window.__hf.buildReady.scene = build;
window.addEventListener('hf-seek', e => renderAt(e.detail.time));
window.__renderAt = renderAt;
renderAt(0);
