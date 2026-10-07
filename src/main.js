import * as THREE from 'three';
import '@fontsource/fredoka/400.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/fredoka/700.css';
import './style.css';

// Garante que a fonte esteja carregada antes de desenhar texto nas texturas (blocos, placas, rótulos).
try {
  await Promise.all([
    document.fonts.load('700 170px Fredoka'),
    document.fonts.load('700 34px Fredoka'),
    document.fonts.load('600 38px Fredoka')
  ]);
} catch (e) { /* segue com a fonte reserva */ }

const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* =========================================================
   ESTADO GLOBAL E TELA DO SEGREDO (não depende do 3D)
   ========================================================= */
let SECRET = null, REHEARSAL = false;
let state = 'secret';                 // secret | lobby | countdown | play | reveal
const norm = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
function parseSecret(s) {
  s = norm(s);
  if (['menino', 'o', 'boy', 'azul'].includes(s)) return 'o';
  if (['menina', 'a', 'girl', 'rosa'].includes(s)) return 'a';
  return null;
}
function toast(m) { const t = $('toast'); t.textContent = m; t.classList.add('on'); setTimeout(() => t.classList.remove('on'), 3400); }


/* =========================================================
   CONSTANTES
   ========================================================= */
const HW = 0.4, PH = 1.4;                       // meia largura e altura do jogador
const GRAV = 26, JUMP = 10, SPEED = 6.5, LEASH = 15;
const E = 0.001, E2 = 0.002;
const BS = 1.6;                                  // tamanho dos blocos
const LETTERS = ['M', 'E', 'N', 'I', 'N'];
const OWNER = [0, 1, 0, 1, 0, -1];
const NAMES = ['Papai', 'Mamãe'];
const PCOL = [
  { color: '#ff8a3d', dark: '#c8601a', over: '#6b4423', css: '#e8710a' },
  { color: '#a45ee0', dark: '#7a3fb0', over: '#34495e', css: '#8e44ad' }
];
const BOY = ['#4aa3ff', '#8cc8ff', '#ffffff', '#ffe066', '#2f6fed', '#a5d8ff'];
const GIRL = ['#ff7eb6', '#ffb3d4', '#ffffff', '#ffe066', '#e84393', '#ffd6e8'];
const ZS = [-2, -20, -46, -86, -114, -146, -180];  // início de cada fase
const KB = {
  wasd:   { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', jump: 'Space', hold: 'KeyE', label: 'TECLADO 1 (WASD)' },
  arrows: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', jump: 'Enter', hold: 'ShiftRight', label: 'TECLADO 2 (SETAS)' }
};

/* =========================================================
   RENDERER, CENA, LUZES
   ========================================================= */
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
} catch (e) { $('fatal').hidden = false; throw e; }
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const MAXANI = Math.min(8, renderer.capabilities && renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 500);
function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();

function gradTex(stops) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}
scene.background = gradTex([[0, '#74c3ff'], [0.55, '#cdeeff'], [1, '#fff1de']]);
scene.fog = new THREE.Fog(0xd4efff, 55, 240);

const hemi = new THREE.HemisphereLight(0xffffff, 0xa9b6d6, 0.62);
const sun = new THREE.DirectionalLight(0xfff0d8, 0.55);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005;
Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
scene.add(hemi, sun, sun.target);
const glow = new THREE.PointLight(0xffe9a8, 0, 28); scene.add(glow);

/* =========================================================
   MATERIAIS E UTILIDADES
   ========================================================= */
const matCache = {};
function lam(color, extra) {
  const k = color + (extra ? JSON.stringify(extra) : '');
  return matCache[k] || (matCache[k] = new THREE.MeshLambertMaterial(Object.assign({ color: new THREE.Color(color) }, extra || {})));
}
function rr(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function faceTex(ch, c1, c2, fg, sh) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 256);
  gr.addColorStop(0, c1); gr.addColorStop(1, c2); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  g.lineWidth = 14; g.strokeStyle = 'rgba(0,0,0,.22)'; g.strokeRect(7, 7, 242, 242);
  g.lineWidth = 6; g.strokeStyle = 'rgba(255,255,255,.6)'; g.strokeRect(20, 20, 216, 216);
  [[28, 28], [228, 28], [28, 228], [228, 228]].forEach(([x, y]) => { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); });
  g.font = '700 170px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = sh; g.fillText(ch, 134, 144); g.fillStyle = fg; g.fillText(ch, 128, 138);
  const t = new THREE.CanvasTexture(c); t.anisotropy = MAXANI; return t;
}
function makeLabel(text, color, w, h) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.94)'; rr(g, 4, 4, 248, 56, 28); g.fill();
  g.lineWidth = 6; g.strokeStyle = color; g.stroke();
  g.font = '700 34px Fredoka, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#2b2540'; g.fillText(text, 128, 35);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, fog: false }));
  s.scale.set(w, h, 1); s.renderOrder = 20; return s;
}
function makeBoard(title, sub, w, h) {
  const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * h / w);
  const g = c.getContext('2d');
  g.fillStyle = '#fff8e8'; rr(g, 6, 6, c.width - 12, c.height - 12, 34); g.fill();
  g.lineWidth = 10; g.strokeStyle = '#e8a53c'; g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#2b2540';
  g.font = '700 58px Fredoka, system-ui, sans-serif'; g.fillText(title, c.width / 2, c.height * 0.38);
  g.font = '600 38px Fredoka, system-ui, sans-serif'; g.fillStyle = '#6a5f8a'; g.fillText(sub, c.width / 2, c.height * 0.72);
  const t = new THREE.CanvasTexture(c); t.anisotropy = MAXANI;
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, fog: false }));
}

/* =========================================================
   SÓLIDOS (colisão AABB) E MOVEDORES
   ========================================================= */
const solids = [], movers = [];
const THEME = {
  grass: { top: '#9be3a8', side: '#e7b98a' },
  mint:  { top: '#8fe3d0', side: '#d9ad86' },
  peach: { top: '#ffd1a8', side: '#d9ad86' },
  gold:  { top: '#ffd36e', side: '#e39b55' },
  lav:   { top: '#c4b0ff', side: '#8f7fc9' },
  gate:  { top: '#ffb454', side: '#ff9f2e' }
};
function addSolid(o) {
  const t = o.t || 1, th = THEME[o.theme || 'grass'], top = o.top || 0;
  const s = { x: o.x, y: top - t / 2, z: o.z, hx: o.w / 2, hy: t / 2, hz: o.d / 2, top: top,
    cp: !!o.cp, moving: !!o.moving, dx: 0, dy: 0, dz: 0, block: null, off: false };
  const side = lam(th.side), topM = lam(th.top), bot = lam(th.side);
  const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, t, o.d), [side, side, topM, bot, side, side]);
  m.position.set(s.x, s.y, s.z); m.castShadow = true; m.receiveShadow = true; scene.add(m); s.mesh = m;
  if (o.cone) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(Math.min(o.w, o.d) * 0.55, 5, 10), side);
    cone.rotation.x = Math.PI; cone.position.y = -t / 2 - 2.5; m.add(cone);
  }
  solids.push(s); return s;
}
function addMover(s, fn) { movers.push({ s, fn }); }
function updateMovers(dt) {
  for (const m of movers) {
    const s = m.s, ox = s.x, oy = s.y, oz = s.z;
    m.fn(s, dt);
    s.dx = s.x - ox; s.dy = s.y - oy; s.dz = s.z - oz; s.top = s.y + s.hy;
    s.mesh.position.set(s.x, s.y, s.z);
  }
}
function ov(p, s) {
  return !s.off && Math.abs(p.x - s.x) < HW + s.hx - E && Math.abs(p.z - s.z) < HW + s.hz - E &&
    p.y < s.y + s.hy - E && p.y + PH > s.y - s.hy + E;
}

/* =========================================================
   MUNDO
   ========================================================= */
let T = 0;                                  // relógio do mundo (s)
const blocks = [], plates = [], pads = [], sweepers = [], decor = [];
const world = { gate: null, elev: null, ledge: null };
const stage1 = { prog: 0, open: false, anim: 0, bar: null };
const elev = { h: 0, plate: null };
const simon = { state: 'wait', seq: [], k: 0, idx: 0, t: 0, phase: 0 };
const fin = { unlocked: false, charge: 0, bonk: [-1e9, -1e9], hb: 0, circles: [], ok: [false, false], beam: null };
const PADTONES = [329.63, 392, 440, 523.25];
const PADCOL = ['#ff5a5f', '#ffd23f', '#3ddc97', '#2ec4b6'];

function makePlate(x, z, r, color) {
  const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color) });
  mat.emissive.multiplyScalar(0.1);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.16, 32), mat);
  m.position.set(x, 0.08, z); m.receiveShadow = true; scene.add(m);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.09, 8, 40), lam('#ffffff'));
  rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.17, z); scene.add(rim);
  const p = { x, z, r, color, mesh: m, mat, pressed: false, rim };
  plates.push(p); return p;
}
function playerOn(x, z, r) {
  return players.some(p => p.ground && Math.hypot(p.x - x, p.z - z) < r);
}

function addBlock(i, x, z, baseTop) {
  const cy = baseTop + 2.6 + BS / 2;
  const s = { x, y: cy, z, hx: BS / 2, hy: BS / 2, hz: BS / 2, top: cy + BS / 2, cp: false, moving: false, dx: 0, dy: 0, dz: 0, block: i, off: false };
  solids.push(s);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(BS, BS, BS), blockMats(TEX.locked, '#000000'));
  mesh.position.set(x, cy, z); mesh.castShadow = true; scene.add(mesh);
  const marker = new THREE.Group();
  const col = i < 5 ? PCOL[OWNER[i]].color : '#ffe066';
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 14), new THREE.MeshBasicMaterial({ color: new THREE.Color(col), fog: false }));
  arrow.rotation.x = Math.PI; marker.add(arrow);
  const lab = makeLabel(i < 5 ? NAMES[OWNER[i]].toUpperCase() : 'OS DOIS!', col, 2.5, 0.64);
  lab.position.y = 0.95; marker.add(lab);
  marker.visible = false; scene.add(marker);
  const b = { i, x, y: cy, z, s, mesh, marker, owner: OWNER[i], revealed: false, active: false, vis: 'locked', bump: 0, letter: i < 5 ? LETTERS[i] : '?' };
  s.blockRef = b; blocks.push(b); return b;
}
function blockMats(tex, emissive) {
  const side = new THREE.MeshLambertMaterial({ map: tex, emissive: new THREE.Color(emissive) });
  const tb = new THREE.MeshLambertMaterial({ color: 0xf2f0ff, emissive: new THREE.Color(emissive) });
  return [side, side, tb, tb, side, side];
}
const TEX = {};
function buildTextures() {
  TEX.locked = faceTex('?', '#d4d4e2', '#a3a3bb', '#ffffff', '#6d6d85');
  TEX.active = faceTex('?', '#ffd75a', '#f2a516', '#ffffff', '#a85800');
  LETTERS.forEach(ch => { if (!TEX[ch]) TEX[ch] = faceTex(ch, '#fffbe6', '#ffe9a8', '#d6361f', '#f2c85b'); });
}

function buildWorld() {
  buildTextures();

  /* --- piso inicial e fase 1 --- */
  addSolid({ x: 0, z: -6, w: 24, d: 24, t: 1.2, cp: true });                  // z -18..6
  addSolid({ x: 0, z: -33, w: 24, d: 30, t: 1.2, cp: true, theme: 'mint' });   // z -48..-18
  makePlate(-6, -26, 1.7, PCOL[0].color); makePlate(6, -26, 1.7, PCOL[1].color);
  const gate = addSolid({ x: 0, z: -34, w: 24, d: 1.2, top: 4, t: 4, theme: 'gate' });
  for (let k = -5; k <= 5; k++) {                                              // grades decorativas
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 4.3, 8), lam(k % 2 ? '#ffffff' : '#ff6b6b'));
    bar.position.set(k * 2.1, 0, 0.7); gate.mesh.add(bar);
  }
  world.gate = gate;
  stage1.bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.35, 0.35), new THREE.MeshBasicMaterial({ color: 0x7CFC7C, fog: false }));
  stage1.bar.position.set(0, 5.2, -34); stage1.bar.visible = false; scene.add(stage1.bar);
  addBlock(0, 0, -41, 0);

  /* --- fase 2: travessia --- */
  addSolid({ x: 0, z: -51.5, w: 6, d: 4, t: 0.8, cp: true, cone: true, theme: 'peach' });
  const m1 = addSolid({ x: 0, z: -57, w: 4, d: 4, t: 0.6, moving: true, cone: true, theme: 'gold' });
  addMover(m1, s => { s.x = 3 * Math.sin(T * 0.9); });
  addSolid({ x: 0, z: -62.5, w: 6, d: 4, t: 0.8, cp: true, cone: true, theme: 'peach' });
  const m2 = addSolid({ x: 0, z: -68, w: 4, d: 4, t: 0.6, moving: true, cone: true, theme: 'gold' });
  addMover(m2, s => { s.z = -68 + 1.0 * Math.sin(T * 1.1 + 1); });
  addSolid({ x: 0, z: -78, w: 16, d: 12, t: 1.2, cp: true, cone: true });      // z -84..-72
  addBlock(1, 0, -80, 0);

  /* --- fase 3: elevador --- */
  addSolid({ x: 0, z: -98, w: 24, d: 28, t: 1.2, cp: true });                 // z -112..-84
  makePlate(7, -89, 1.7, '#ffd23f'); elev.plate = plates[plates.length - 1];
  const el = addSolid({ x: -4, z: -94, w: 4, d: 4, top: 0.65, t: 0.6, moving: true, theme: 'lav' });
  addMover(el, s => { s.y = 0.65 + elev.h * 4.0 - s.hy; });
  world.elev = el;
  world.ledge = addSolid({ x: -4, z: -100, w: 6, d: 6, top: 4.65, t: 1.2, cone: true, theme: 'peach' });
  addBlock(2, -4, -100, 4.65);
  // coluna decorativa sob o elevador
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), lam('#cfc7ee')); col.position.set(-4, 2.5, -90.6); scene.add(col);

  /* --- fase 4: vassouras --- */
  addSolid({ x: 0, z: -128, w: 18, d: 32, t: 1.2, cp: true, theme: 'mint' }); // z -144..-112
  addSweeper(0, -120, 14, 1.3, 0.5);
  addSweeper(0, -133, 14, -1.7, 2.0);
  addBlock(3, 0, -141, 0);

  /* --- fase 5: memória --- */
  addSolid({ x: 0, z: -160, w: 24, d: 32, t: 1.2, cp: true, theme: 'peach' }); // z -176..-144
  [-7.5, -2.5, 2.5, 7.5].forEach((x, k) => {
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(PADCOL[k]), emissive: new THREE.Color(PADCOL[k]) });
    mat.emissive.multiplyScalar(0.12);
    const m = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.18, 32), mat);
    m.position.set(x, 0.09, -156); m.receiveShadow = true; scene.add(m);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.1, 8, 40), lam('#ffffff'));
    rim.rotation.x = Math.PI / 2; rim.position.set(x, 0.19, -156); scene.add(rim);
    pads.push({ x, z: -156, r: 1.9, k, mesh: m, mat, glow: 0, color: PADCOL[k] });
  });
  addBlock(4, 0, -172, 0);

  /* --- final --- */
  addSolid({ x: 0, z: -192, w: 28, d: 32, t: 1.2, cp: true });                // z -208..-176
  addBlock(5, 0, -196, 0);
  [-4.5, 4.5].forEach((x, i) => {
    const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(PCOL[i].color), emissive: new THREE.Color(PCOL[i].color) });
    mat.emissive.multiplyScalar(0.08);
    const d = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, 0.14, 40), mat); d.position.set(x, 0.07, -199); d.receiveShadow = true;
    const r = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.1, 8, 48), lam('#ffffff')); r.rotation.x = Math.PI / 2; r.position.set(x, 0.16, -199);
    d.visible = r.visible = false; scene.add(d, r);
    fin.circles.push({ x, z: -199, r: 1.9, mesh: d, rim: r, mat });
  });
  fin.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 48, 24, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  fin.beam.position.set(0, 24, -196); scene.add(fin.beam);

  /* --- placas de fase, faixa e decoração --- */
  const titles = [
    ['Chá Revelação', 'Bebê a caminho!'], ['Fase 1: Botões em dupla', 'Cada um em um botão'], ['Fase 2: Travessia', 'Cuidado para não cair'],
    ['Fase 3: Elevador', 'Um segura, o outro sobe'], ['Fase 4: Vassouras', 'Pulem na hora certa'],
    ['Fase 5: Memória', 'Repitam a sequência'], ['Final', 'O grande segredo']
  ];
  const signX = [-8, -8, -8, -9, -7.5, -9, -10];
  titles.forEach(([t, s], k) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 3.2, 8), lam('#a9855c')); pole.position.y = 1.6; g.add(pole);
    const bd = makeBoard(t, s, 5.2, 1.7); bd.position.y = 3.3; g.add(bd);
    g.position.set(signX[k], 0, ZS[k] - 1.5); scene.add(g);
  });
  const banner = makeBoard('Chá Revelação', 'Menino ou menina?', 14, 4.2);
  banner.position.set(0, 10.5, -12); scene.add(banner);
  [-7.2, 7.2].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 10.4, 8), lam('#a9855c')); p.position.set(x, 5.2, -12.2); scene.add(p); });

  const ABC = 'BEBÊ'.split(''), cols = ['#ffd23f', '#ff6b6b', '#3ddc97', '#a45ee0', '#ff8a3d', '#2ec4b6'];
  const cubeZ = [2, -4, -10, -24, -30, -42, -92, -104, -118, -138, -150, -168, -184, -202];
  cubeZ.forEach((z, k) => {
    const sx = k % 2 ? 1 : -1, size = 1.1 + (k % 3) * 0.25, x = sx * (solidHalfW(z) - 1.2);
    const m = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), lam(cols[k % cols.length]));
    m.position.set(x, size / 2, z); m.rotation.y = k * 0.7; m.castShadow = true; m.receiveShadow = true; scene.add(m);
  });

  /* --- balões, nuvens e mar de nuvens --- */
  const bc = ['#ffffff', '#ffd23f', '#ff8a3d', '#a45ee0', '#3ddc97', '#ff5a5f', '#2ec4b6'];
  for (let k = 0; k < 26; k++) {
    const g = new THREE.Group(), c = bc[k % bc.length];
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.95, 16, 12), lam(c)); b.scale.y = 1.2; b.position.y = 2.2; g.add(b);
    const str = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 4), lam('#ffffff')); str.position.y = 0.9; g.add(str);
    const sx = k % 2 ? 1 : -1;
    g.position.set(sx * (15 + (k * 7) % 14), 2 + (k * 3) % 8, 4 - k * 8.4);
    g.userData = { ph: k * 1.3, base: g.position.y }; scene.add(g); decor.push(g);
  }
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x9fb4d0) });
  for (let k = 0; k < 34; k++) {
    const g = new THREE.Group(), n = 3 + (k % 3);
    for (let j = 0; j < n; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(2 + (j % 2) * 1.2, 12, 10), cloudMat);
      s.position.set(j * 2.4 - n, (j % 2) * 0.6, (j % 3) * 0.8); g.add(s);
    }
    const sx = k % 2 ? 1 : -1;
    g.position.set(sx * (22 + (k * 11) % 34), -4 + (k * 5) % 16 - (k % 4 === 0 ? 8 : 0), 20 - k * 7);
    g.userData = { sp: 0.3 + (k % 5) * 0.12, base: g.position.x }; scene.add(g); decor.push(g);
  }
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ color: 0xeaf6ff }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = -18; scene.add(sea);
}
function solidHalfW(z) { return z < -112 && z > -144 ? 9 : z < -176 ? 14 : 12; }

function addSweeper(cx, cz, len, speed, phase) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz);
  const n = 7, segL = len / n;
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(segL, 0.5, 0.5), lam(k % 2 ? '#ffffff' : '#ff6b6b'));
    m.position.set(-len / 2 + segL * (k + 0.5), 0.65, 0); m.castShadow = true; g.add(m);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 1.5, 20), lam('#ffd23f')); hub.position.y = 0.75; hub.castShadow = true; g.add(hub);
  scene.add(g);
  sweepers.push({ cx, cz, len, speed, ang: phase, g });
}

/* =========================================================
   PERSONAGENS
   ========================================================= */
function buildChar(c, mama) {
  const g = new THREE.Group(), skin = lam('#ffd2ac');
  const add = (m, x, y, z) => { m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.4, 0.7, 18), lam(c.color)), 0, 0.64, 0);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.43, 0.38, 18), lam(c.over)), 0, 0.38, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 18), skin), 0, 1.2, 0);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.385, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.5), lam(c.color)), 0, 1.25, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.32), lam(c.dark)), 0, 1.27, 0.4);
  const eg = new THREE.SphereGeometry(0.055, 10, 8), em = lam('#1b1b2f');
  add(new THREE.Mesh(eg, em), -0.13, 1.2, 0.33); add(new THREE.Mesh(eg, em), 0.13, 1.2, 0.33);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), lam('#f0a77c')), 0, 1.12, 0.36);
  if (mama) {
    add(new THREE.Mesh(new THREE.SphereGeometry(0.37, 20, 14), lam('#6b3f1d')), 0, 1.2, -0.08);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), lam('#6b3f1d')), 0, 1.1, -0.42);
    add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), lam('#ff6fa5')), 0, 1.33, -0.3);
  } else {
    add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.07), lam('#4a2a10')), 0, 1.07, 0.36);
  }
  const mkArm = sx => {
    const a = new THREE.Group(); a.position.set(sx * 0.46, 0.92, 0);
    const u = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), lam(c.color)); u.position.y = -0.2; u.castShadow = true; a.add(u);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 10), skin); h.position.y = -0.4; h.castShadow = true; a.add(h);
    g.add(a); return a;
  };
  const armL = mkArm(-1), armR = mkArm(1);
  const mkFoot = sx => {
    const f = new THREE.Group(); f.position.set(sx * 0.17, 0.14, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.16, 0.38), lam('#4a2a10')); m.position.set(0, -0.06, 0.05); m.castShadow = true; f.add(m);
    g.add(f); return f;
  };
  const footL = mkFoot(-1), footR = mkFoot(1);
  const lab = makeLabel(c.name, c.css, 1.7, 0.43); lab.position.y = 2.15; g.add(lab);
  return { g, armL, armR, footL, footR };
}

const players = [0, 1].map(i => {
  const p = {
    i, src: null, x: i ? 2 : -2, y: 0, z: -2, vx: 0, vy: 0, vz: 0, px: 0, pz: 0,
    ground: null, coyote: 0, jbuf: 0, jumped: false, stun: 0, invul: 0, pj: false, ph: false, emoteCd: 0, cel: 0,
    safe: { x: i ? 2 : -2, y: 0, z: -2 }, padPrev: -1, anim: 0, face: 0,
    inp: { ax: 0, ay: 0, jump: false, hold: false }
  };
  const o = buildChar({ ...PCOL[i], name: NAMES[i] }, i === 1);
  scene.add(o.g); p.o = o;
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.66, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(PCOL[i].color), transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 5; scene.add(ring); p.ring = ring;
  return p;
});
const beads = [];
for (let k = 0; k < 14; k++) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(PCOL[k % 2].color), fog: false }));
  scene.add(m); beads.push(m);
}

/* =========================================================
   ÁUDIO
   ========================================================= */
let AC = null;
function initAudio() {
  try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { /* sem áudio */ }
}
function tone(f, d, type, v, f2, delay) {
  if (!AC) return;
  type = type || 'square'; v = v == null ? 0.06 : v; delay = delay || 0;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
  o.connect(g); g.connect(AC.destination); o.start(t); o.stop(t + d + 0.03);
}
function noise(d, v) {
  if (!AC) return;
  const n = Math.floor(AC.sampleRate * d), buf = AC.createBuffer(1, n, AC.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = AC.createBufferSource(), g = AC.createGain(); g.gain.value = v; s.buffer = buf; s.connect(g); g.connect(AC.destination); s.start();
}
const sfx = {
  jump: () => tone(300, .14, 'square', .045, 720),
  land: () => tone(140, .08, 'sine', .08, 80),
  bump: () => tone(120, .1, 'square', .07, 70),
  wrong: () => { tone(190, .12, 'sawtooth', .05, 120); tone(150, .16, 'sawtooth', .05, 90, .1); },
  letter: i => { const b = [523, 587, 659, 698, 784][i] || 660; tone(b, .08, 'square', .06); tone(b * 1.5, .22, 'square', .06, null, .08); tone(b * 2, .3, 'triangle', .05, null, .16); },
  crack: () => { noise(.3, .14); tone(90, .3, 'sawtooth', .07, 40); },
  thump: () => { tone(70, .12, 'sine', .3, 45); tone(60, .14, 'sine', .25, 40, .16); },
  fanfare: () => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, .18, 'square', .06, null, i * .12));
    [784, 988, 1175, 1568].forEach(f => tone(f, .8, 'square', .045, null, .55));
    [262, 392].forEach(f => tone(f, .8, 'triangle', .1, null, .55));
  },
  ready: () => tone(660, .1, 'square', .05, 990),
  count: go => tone(go ? 880 : 440, go ? .35 : .15, 'square', .06),
  pad: k => { tone(PADTONES[k], .4, 'triangle', .13); tone(PADTONES[k] * 2, .3, 'sine', .04); },
  boing: () => tone(200, .3, 'sine', .1, 700),
  pip: () => { tone(880, .06, 'square', .04); tone(1320, .1, 'square', .04, null, .06); },
  open: () => { tone(220, .5, 'sawtooth', .05, 440); tone(330, .5, 'square', .04, 660, .2); },
  boom: () => { noise(.7, .22); tone(70, .6, 'sine', .3, 30); }
};

/* =========================================================
   ENTRADA (teclado + controles)
   ========================================================= */
const keys = new Set();
function getPad(i) {
  const g = navigator.getGamepads ? navigator.getGamepads() : [];
  const p = g[i]; return p && p.connected ? p : null;
}
function readInput(p) {
  const o = { ax: 0, ay: 0, jump: false, hold: false }, s = p.src;
  if (!s) return o;
  if (s.type === 'kb') {
    const k = KB[s.set];
    o.ax = (keys.has(k.right) ? 1 : 0) - (keys.has(k.left) ? 1 : 0);
    o.ay = (keys.has(k.down) ? 1 : 0) - (keys.has(k.up) ? 1 : 0);
    o.jump = keys.has(k.jump); o.hold = keys.has(k.hold);
    return o;
  }
  const g = getPad(s.index);
  if (!g) return o;
  const b = i => !!(g.buttons[i] && g.buttons[i].pressed);
  let ax = g.axes[0] || 0, ay = g.axes[1] || 0;
  const m = Math.hypot(ax, ay);
  if (m < 0.22) { ax = 0; ay = 0; } else { const k = Math.min(1, ((m - 0.22) / 0.78) * 1.15); ax = ax / m * k; ay = ay / m * k; }
  if (b(14)) ax = -1; if (b(15)) ax = 1; if (b(12)) ay = -1; if (b(13)) ay = 1;
  o.ax = ax; o.ay = ay; o.jump = b(0) || b(2);
  o.hold = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11].some(b);
  return o;
}
function sameSrc(a, b) { return a && b && a.type === b.type && (a.type === 'pad' ? a.index === b.index : a.set === b.set); }
function assign(src) {
  if (players.some(p => sameSrc(p.src, src))) return false;
  const p = players.find(q => !q.src); if (!p) return false;
  p.src = src; p.pj = true; p.ph = true; sfx.ready(); return true;
}
function tryAssignPads() {
  const g = navigator.getGamepads ? navigator.getGamepads() : [];
  for (const pad of g) {
    if (!pad || !pad.connected) continue;
    if (players.some(p => p.src && p.src.type === 'pad' && p.src.index === pad.index)) continue;
    if (pad.buttons.some(b => b.pressed)) assign({ type: 'pad', index: pad.index });
  }
}
function kbAssign(code) {
  const w = ['KeyA', 'KeyD', 'KeyW', 'KeyS', 'Space', 'KeyE'], a = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter', 'ShiftRight'];
  if (w.includes(code)) assign({ type: 'kb', set: 'wasd' }); else if (a.includes(code)) assign({ type: 'kb', set: 'arrows' });
}
function srcName(s) { return !s ? '' : s.type === 'pad' ? 'CONTROLE ' + (s.index + 1) : KB[s.set].label; }
function toggleFS() { try { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen(); } catch (e) { /* ignorado */ } }

window.addEventListener('keydown', e => {
  if (e.target && e.target.tagName === 'INPUT') return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (state === 'secret') return;
  initAudio();
  if (e.code === 'KeyF') toggleFS();
  if (e.code === 'KeyT' && (state === 'lobby' || state === 'countdown')) { const t = players[0].src; players[0].src = players[1].src; players[1].src = t; sfx.ready(); }
  if (e.code === 'KeyR' && state === 'reveal' && rt > 6) resetGame('countdown');
  if (e.code === 'KeyN' && REHEARSAL && state === 'play') debugSkip();
  kbAssign(e.code);
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

/* =========================================================
   PARTÍCULAS (confete, fagulhas, poeira)
   ========================================================= */
const NP = 1000;
const pm = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, fog: false }), NP);
pm.instanceMatrix.setUsage(THREE.DynamicDrawUsage); pm.frustumCulled = false; scene.add(pm);
const PA = { x: new Float32Array(NP), y: new Float32Array(NP), z: new Float32Array(NP), vx: new Float32Array(NP), vy: new Float32Array(NP), vz: new Float32Array(NP),
  rx: new Float32Array(NP), ry: new Float32Array(NP), rz: new Float32Array(NP), wx: new Float32Array(NP), wy: new Float32Array(NP), wz: new Float32Array(NP),
  life: new Float32Array(NP), max: new Float32Array(NP), size: new Float32Array(NP), g: new Float32Array(NP), vis: new Uint8Array(NP) };
const dummy = new THREE.Object3D(), tmpCol = new THREE.Color();
let pidx = 0, colorDirty = false;
for (let i = 0; i < NP; i++) { pm.setColorAt(i, tmpCol.set('#ffffff')); dummy.scale.set(0, 0, 0); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); }
function emit(x, y, z, vx, vy, vz, hex, size, life, g) {
  const i = pidx; pidx = (pidx + 1) % NP;
  PA.x[i] = x; PA.y[i] = y; PA.z[i] = z; PA.vx[i] = vx; PA.vy[i] = vy; PA.vz[i] = vz;
  PA.rx[i] = Math.random() * 6; PA.ry[i] = Math.random() * 6; PA.rz[i] = Math.random() * 6;
  PA.wx[i] = (Math.random() - .5) * 10; PA.wy[i] = (Math.random() - .5) * 10; PA.wz[i] = (Math.random() - .5) * 10;
  PA.life[i] = life; PA.max[i] = life; PA.size[i] = size; PA.g[i] = g; PA.vis[i] = 1;
  pm.setColorAt(i, tmpCol.set(hex)); colorDirty = true;
}
function palette() { return SECRET === 'o' ? BOY : GIRL; }
function resultHex() { return SECRET === 'o' ? '#4aa3ff' : '#ff7eb6'; }
function confetti(x, y, z, n, spread) {
  const cols = palette();
  for (let k = 0; k < n; k++) {
    const a = Math.random() * 6.283, up = 4 + Math.random() * 9, sp = Math.random() * (spread || 6);
    emit(x, y, z, Math.cos(a) * sp, up, Math.sin(a) * sp, cols[(Math.random() * cols.length) | 0], 0.9 + Math.random() * 0.9, 4 + Math.random() * 3, 7);
  }
}
function rainConfetti(cx, cz, n) {
  const cols = palette();
  for (let k = 0; k < n; k++)
    emit(cx + (Math.random() - .5) * 34, 16 + Math.random() * 6, cz + (Math.random() - .5) * 30, (Math.random() - .5) * 1.5, -1 - Math.random(), (Math.random() - .5) * 1.5,
      cols[(Math.random() * cols.length) | 0], 0.9 + Math.random() * 0.9, 7, 0.4);
}
function sparkle(x, y, z, n) {
  for (let k = 0; k < (n || 16); k++) {
    const a = Math.random() * 6.283, e = Math.random() * 3.14 - 1.57, sp = 2 + Math.random() * 4;
    emit(x, y, z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 2, Math.sin(a) * Math.cos(e) * sp, Math.random() < .5 ? '#ffe066' : '#ffffff', 0.55, 0.7 + Math.random() * 0.4, 7);
  }
}
function firework(x, y, z) {
  const cols = palette();
  for (let k = 0; k < 70; k++) {
    const a = Math.random() * 6.283, e = Math.acos(2 * Math.random() - 1), sp = 5 + Math.random() * 4;
    emit(x, y, z, Math.sin(e) * Math.cos(a) * sp, Math.cos(e) * sp, Math.sin(e) * Math.sin(a) * sp, cols[(Math.random() * cols.length) | 0], 0.7, 1.1 + Math.random() * 0.6, 5);
  }
}
function dust(p) {
  for (let k = 0; k < 6; k++) {
    const a = Math.random() * 6.283;
    emit(p.x, p.y + 0.1, p.z, Math.cos(a) * 1.4, 0.8 + Math.random(), Math.sin(a) * 1.4, '#ffffff', 0.5, 0.5, 2);
  }
}
function updateParticles(dt) {
  for (let i = 0; i < NP; i++) {
    if (PA.life[i] <= 0) { if (PA.vis[i]) { PA.vis[i] = 0; dummy.scale.set(0, 0, 0); dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix); } continue; }
    PA.life[i] -= dt;
    PA.vy[i] -= PA.g[i] * dt; if (PA.vy[i] < -3.2 && PA.g[i] > 3) PA.vy[i] = -3.2;
    const drag = Math.exp(-0.7 * dt); PA.vx[i] *= drag; PA.vz[i] *= drag;
    PA.x[i] += PA.vx[i] * dt; PA.y[i] += PA.vy[i] * dt; PA.z[i] += PA.vz[i] * dt;
    PA.rx[i] += PA.wx[i] * dt; PA.ry[i] += PA.wy[i] * dt; PA.rz[i] += PA.wz[i] * dt;
    const sc = PA.size[i] * Math.min(1, PA.life[i] / 0.35);
    dummy.position.set(PA.x[i], PA.y[i], PA.z[i]); dummy.rotation.set(PA.rx[i], PA.ry[i], PA.rz[i]); dummy.scale.set(sc, sc, sc);
    dummy.updateMatrix(); pm.setMatrixAt(i, dummy.matrix);
  }
  pm.instanceMatrix.needsUpdate = true;
  if (colorDirty && pm.instanceColor) { pm.instanceColor.needsUpdate = true; colorDirty = false; }
}

/* =========================================================
   LÓGICA DO JOGO
   ========================================================= */
let cur = 0, rt = 0, flash = 0, shake = 0, cdT = 0, lastN = 4, goT = 0, playT = 0, leashHit = 0, revealed = false, fwQueue = [], msg = { text: '', t: 0 };

function say(text, secs) { msg = { text, t: secs }; }
function resetGame(next) {
  blocks.forEach(b => { b.revealed = false; b.active = false; b.vis = 'locked'; b.bump = 0; b.mesh.scale.set(1, 1, 1); b.mesh.material = blockMats(TEX.locked, '#000000'); b.marker.visible = false; });
  cur = 0; rt = 0; flash = 0; shake = 0; goT = 0; playT = 0; leashHit = 0; revealed = false; fwQueue = []; msg = { text: '', t: 0 };
  stage1.prog = 0; stage1.open = false; stage1.anim = 0; world.gate.off = false; world.gate.y = 2; world.gate.top = 4; world.gate.mesh.position.y = 2; world.gate.mesh.visible = true;
  elev.h = 0; simon.state = 'wait'; simon.seq = []; simon.k = 0; simon.idx = 0;
  fin.unlocked = false; fin.charge = 0; fin.bonk = [-1e9, -1e9]; fin.hb = 0; fin.circles.forEach(c => { c.mesh.visible = c.rim.visible = false; });
  pads.forEach(p => { p.glow = 0; });
  PA.life.fill(0); hemi.color.set(0xffffff);
  players.forEach((p, i) => {
    p.x = i ? 2 : -2; p.y = 0; p.z = -2; p.vx = p.vy = p.vz = 0; p.ground = null; p.stun = 0; p.invul = 0; p.cel = 0;
    p.safe = { x: p.x, y: 0, z: p.z }; p.px = p.x; p.pz = p.z;
  });
  $('banner').classList.remove('on'); $('vig').style.opacity = 0;
  buildSlots();
  snapCamera();
  state = next;
  if (next === 'countdown') { cdT = 3; lastN = 4; }
}
function respawn(p, i) {
  const s = p.safe;
  p.x = s.x + (i ? 0.7 : -0.7); p.y = s.y + 0.3; p.z = s.z; p.vx = p.vy = p.vz = 0; p.ground = null; p.invul = 1.4; p.stun = 0; p.px = p.x; p.pz = p.z;
  sfx.boing(); sparkle(p.x, p.y + 1, p.z, 10);
  say(NAMES[i] + ' voltou! Sem problema.', 2.2);
}

function hitBlock(pi, bi) {
  const b = blocks[bi];
  b.bump = 0.28;
  if (state !== 'play' || b.revealed) { sfx.bump(); return; }
  if (bi !== cur || !b.active) { sfx.bump(); say(bi === cur ? 'Esse bloco ainda está travado. Resolvam o desafio!' : 'Calma! Ainda não é o bloco da vez.', 2.4); return; }
  if (bi < 5) {
    if (b.owner !== pi) { sfx.wrong(); say('É a vez de ' + NAMES[b.owner] + '!', 2.4); return; }
    revealLetter(b);
  } else {
    if (fin.unlocked) { sfx.bump(); return; }
    const now = performance.now(); fin.bonk[pi] = now;
    if (Math.abs(fin.bonk[pi] - fin.bonk[1 - pi]) <= 550) {
      fin.unlocked = true; sfx.crack(); sparkle(b.x, b.y, b.z, 30); shake = 6;
      fin.circles.forEach(c => { c.mesh.visible = c.rim.visible = true; });
      say('', 0);
    } else { sfx.bump(); say('Os dois juntos! Pulem na mesma hora.', 2.6); }
  }
}
function revealLetter(b) {
  b.revealed = true; b.active = false; b.vis = 'done';
  b.mesh.material = blockMats(TEX[b.letter], '#221a00');
  sfx.letter(b.i); sparkle(b.x, b.y, b.z, 26); shake = 3;
  cur++; say('', 0); buildSlots(b.i);
}

/* ---- movimento do jogador ---- */
function axisX(p, d) {
  for (const s of solids) {
    if (!ov(p, s)) continue;
    if (d > 0) p.x = s.x - s.hx - HW - E2; else if (d < 0) p.x = s.x + s.hx + HW + E2; else p.x += (p.x < s.x ? -1 : 1) * (HW + s.hx - Math.abs(p.x - s.x) + E2);
    p.vx = 0;
  }
}
function axisZ(p, d) {
  for (const s of solids) {
    if (!ov(p, s)) continue;
    if (d > 0) p.z = s.z - s.hz - HW - E2; else if (d < 0) p.z = s.z + s.hz + HW + E2; else p.z += (p.z < s.z ? -1 : 1) * (HW + s.hz - Math.abs(p.z - s.z) + E2);
    p.vz = 0;
  }
}
function resolveY(p, i) {
  let land = null, bonk = null;
  for (const s of solids) {
    if (!ov(p, s)) continue;
    if (p.vy <= 0) { if (!land || s.y + s.hy > land.y + land.hy) land = s; }
    else if (!bonk || s.y - s.hy < bonk.y - bonk.hy) bonk = s;
  }
  if (land) { p.y = land.y + land.hy; p.vy = 0; p.ground = land; }
  else if (bonk) { p.y = bonk.y - bonk.hy - PH - E2; p.vy = 0; if (bonk.block !== null) hitBlock(i, bonk.block); }
}

function stepPlayer(p, i, dt) {
  const inp = readInput(p), jp = inp.jump && !p.pj, hp = inp.hold && !p.ph;
  p.pj = inp.jump; p.ph = inp.hold; p.inp = inp; p.px = p.x; p.pz = p.z;
  const frozen = state === 'reveal' || state === 'secret';
  let mx = frozen ? 0 : inp.ax, mz = frozen ? 0 : inp.ay;
  const stunned = p.stun > 0;
  if (stunned) { p.stun -= dt; mx = mz = 0; }
  if (p.invul > 0) p.invul -= dt;
  if (p.emoteCd > 0) p.emoteCd -= dt;
  const len = Math.hypot(mx, mz); if (len > 1) { mx /= len; mz /= len; }
  if (!stunned) { const k = 1 - Math.exp(-(p.ground ? 18 : 7) * dt); p.vx += (mx * SPEED - p.vx) * k; p.vz += (mz * SPEED - p.vz) * k; }
  else { const f = Math.exp(-2.2 * dt); p.vx *= f; p.vz *= f; }

  if (jp && !frozen) p.jbuf = 0.13; else p.jbuf = Math.max(0, p.jbuf - dt);
  p.coyote = p.ground ? 0.1 : Math.max(0, p.coyote - dt);
  if (p.jbuf > 0 && p.coyote > 0 && !stunned && !frozen) { p.vy = JUMP; p.jbuf = 0; p.coyote = 0; p.ground = null; p.jumped = true; sfx.jump(); dust(p); }
  if (!inp.jump && p.vy > 3.5 && p.jumped && !stunned && !frozen) p.vy = 3.5;

  if (frozen && revealed && p.ground) { p.cel -= dt; if (p.cel <= 0) { p.vy = 8 + Math.random() * 2; p.ground = null; p.cel = 0.5 + Math.random() * 0.6; } }

  p.vy = Math.max(-26, p.vy - GRAV * dt);
  if (p.ground && p.ground.moving) { p.x += p.ground.dx; p.y += p.ground.dy; p.z += p.ground.dz; }
  p.x += p.vx * dt; axisX(p, p.vx * dt);
  p.z += p.vz * dt; axisZ(p, p.vz * dt);
  const wasGround = !!p.ground, preVy = p.vy;
  p.y += p.vy * dt; p.ground = null; resolveY(p, i);
  if (p.ground) {
    p.jumped = false;
    if (!wasGround && preVy < -7) { sfx.land(); dust(p); }
    if (p.ground.cp) { const s = p.ground; p.safe = { x: clamp(p.x, s.x - s.hx + 1.2, s.x + s.hx - 1.2), y: s.y + s.hy, z: clamp(p.z, s.z - s.hz + 1.2, s.z + s.hz - 1.2) }; }
  }
  if (hp && !frozen && state === 'play' && p.emoteCd <= 0) { p.emoteCd = 0.6; sfx.pip(); sparkle(p.x, p.y + 1.7, p.z, 12); p.vy = Math.max(p.vy, 0); }
  if (p.y < -9) respawn(p, i);
}

function leash() {
  const a = players[0], b = players[1];
  leashHit = Math.max(0, leashHit - 1 / 60);
  if (Math.hypot(a.x - b.x, a.z - b.z) <= LEASH) return;
  for (const p of players) {
    const o = p === a ? b : a;
    const dN = Math.hypot(p.x - o.x, p.z - o.z), dP = Math.hypot(p.px - o.x, p.pz - o.z);
    if (dN > LEASH && dN > dP) { p.x = p.px; p.z = p.pz; p.vx *= 0.2; p.vz *= 0.2; leashHit = 0.6; }
  }
}

/* ---- lógica de cada fase ---- */
function updateSweepers(dt) {
  for (const s of sweepers) {
    s.ang += s.speed * dt; s.g.rotation.y = s.ang;
    if (state !== 'play') continue;
    const dx = Math.cos(s.ang), dz = -Math.sin(s.ang);
    players.forEach((p, i) => {
      if (p.invul > 0 || p.stun > 0 || p.y > 0.88) return;
      const rx = p.x - s.cx, rz = p.z - s.cz, t = clamp(rx * dx + rz * dz, -s.len / 2, s.len / 2);
      const qx = s.cx + dx * t, qz = s.cz + dz * t, ex = p.x - qx, ez = p.z - qz, d = Math.hypot(ex, ez);
      if (d < 0.7) {
        let nx = ex, nz = ez; if (d < 0.01) { nx = -dz; nz = dx; } const l = Math.hypot(nx, nz); nx /= l; nz /= l;
        p.vx = nx * 9; p.vz = nz * 9; p.vy = 6; p.ground = null; p.stun = 0.5; p.invul = 1.0; sfx.wrong(); shake = 2.5;
        say('Ai! Pulem por cima da vassoura.', 2.2);
      }
    });
  }
}
function padUnder(p) {
  if (!p.ground) return -1;
  for (const d of pads) if (Math.hypot(p.x - d.x, p.z - d.z) < d.r) return d.k;
  return -1;
}
function lightPad(k, secs) { pads[k].glow = secs; sfx.pad(k); }
function genSeq(n) { const s = []; while (s.length < n) { const k = (Math.random() * 4) | 0; if (s.length && s[s.length - 1] === k) continue; s.push(k); } return s; }
function updateSimon(dt) {
  const S = simon;
  pads.forEach(d => { if (d.glow > 0) d.glow -= dt; d.mat.emissive.set(d.color).multiplyScalar(d.glow > 0 ? 1.0 : 0.12); d.mesh.scale.y = d.glow > 0 ? 1.6 : 1; });
  if (cur !== 4 || state !== 'play') { players.forEach(p => { p.padPrev = padUnder(p); }); return; }
  if (S.state === 'wait') { if (players.every(p => p.z < -148)) { S.seq = genSeq(5); S.state = 'pause'; S.t = 1.4; } }
  else if (S.state === 'pause') { S.t -= dt; if (S.t <= 0) { S.state = 'show'; S.k = 0; S.phase = 0; S.t = 0; } }
  else if (S.state === 'show') {
    S.t -= dt;
    if (S.t <= 0) {
      if (S.phase === 0) { if (S.k >= S.seq.length) { S.state = 'input'; S.idx = 0; } else { lightPad(S.seq[S.k], 0.5); S.phase = 1; S.t = 0.65; } }
      else { S.phase = 0; S.k++; S.t = 0.2; }
    }
  } else if (S.state === 'input') {
    for (const p of players) {
      const k = padUnder(p);
      if (k !== p.padPrev && k >= 0) {
        if (k === S.seq[S.idx]) {
          lightPad(k, 0.4); S.idx++;
          if (S.idx >= S.seq.length) { S.state = 'done'; sfx.open(); pads.forEach(d => { d.glow = 1.2; }); sparkle(0, 1, -156, 30); }
        } else { sfx.wrong(); S.state = 'retry'; S.t = 1.3; say('Quase! Olhem a sequência de novo.', 2.5); }
      }
      p.padPrev = k;
    }
    if (S.state === 'input') players.forEach(p => { p.padPrev = padUnder(p); });
  } else if (S.state === 'retry') { S.t -= dt; players.forEach(p => { p.padPrev = padUnder(p); }); if (S.t <= 0) { S.state = 'show'; S.k = 0; S.phase = 0; S.t = 0.2; } }
  else players.forEach(p => { p.padPrev = padUnder(p); });
}

function stageLogic(dt) {
  /* fase 1: botões */
  plates.forEach(pl => {
    pl.pressed = playerOn(pl.x, pl.z, pl.r);
    pl.mat.emissive.set(pl.color).multiplyScalar(pl.pressed ? 0.9 : 0.1);
    pl.mesh.scale.y = pl.pressed ? 0.5 : 1; pl.rim.position.y = pl.pressed ? 0.1 : 0.17;
  });
  if (!stage1.open) {
    if (plates[0].pressed && plates[1].pressed) stage1.prog = Math.min(1, stage1.prog + dt / 1.4); else stage1.prog = Math.max(0, stage1.prog - dt / 0.9);
    stage1.bar.visible = stage1.prog > 0;
    stage1.bar.scale.x = Math.max(0.01, stage1.prog * 12); stage1.bar.material.color.set(stage1.prog > 0.66 ? '#7CFC7C' : '#ffd23f');
    if (stage1.prog >= 1) { stage1.open = true; sfx.open(); stage1.bar.visible = false; shake = 3; sparkle(0, 3, -34, 24); }
  } else if (stage1.anim < 1) {
    stage1.anim = Math.min(1, stage1.anim + dt / 1.2);
    world.gate.y = 2 - 4.5 * stage1.anim; world.gate.top = world.gate.y + 2; world.gate.mesh.position.y = world.gate.y;
    if (stage1.anim >= 1) world.gate.off = true;
  }
  /* fase 3: elevador */
  if (elev.plate.pressed) elev.h = Math.min(1, elev.h + dt / 2.8); else elev.h = Math.max(0, elev.h - dt / 3.6);
  /* fase 4 e 5 */
  updateSweepers(dt);
  updateSimon(dt);
  /* blocos ativos */
  const cond = [stage1.open, true, true, true, simon.state === 'done', true];
  blocks.forEach(b => { b.active = !b.revealed && b.i === cur && cond[b.i] && state === 'play'; });
  /* final */
  const b5 = blocks[5];
  if (fin.unlocked && state === 'play') {
    fin.ok = fin.circles.map(c => players.some(p => p.ground && Math.hypot(p.x - c.x, p.z - c.z) < c.r && p.inp.hold));
    if (fin.ok[0] && fin.ok[1]) fin.charge = Math.min(1, fin.charge + dt / 3); else fin.charge = Math.max(0, fin.charge - dt / 1.5);
    fin.circles.forEach((c, k) => { c.mat.emissive.set(PCOL[k].color).multiplyScalar(fin.ok[k] ? 0.9 : 0.08); });
    if (fin.charge > 0) { fin.hb -= dt; if (fin.hb <= 0) { sfx.thump(); fin.hb = 0.9 - 0.62 * fin.charge; } } else fin.hb = 0;
    if (fin.charge >= 1) { state = 'reveal'; rt = 0; revealed = false; fwQueue = [1.3, 1.9, 2.5, 3.1, 3.9]; }
  }
}

function revealUpdate(dt) {
  rt += dt;
  const b = blocks[5];
  if (!revealed) {
    shake = 2 + rt * 4;
    if (rt >= 1.0) {
      revealed = true; flash = 1; shake = 10; b.revealed = true; b.vis = 'final'; b.bump = 0.4;
      const hexA = SECRET === 'o' ? ['#cfeaff', '#4aa3ff', '#ffffff', '#1b4f8a'] : ['#ffe0ee', '#ff7eb6', '#ffffff', '#8f2a58'];
      b.mesh.material = blockMats(faceTex(SECRET === 'o' ? 'O' : 'A', hexA[0], hexA[1], hexA[2], hexA[3]), '#000000');
      b.marker.visible = false; sfx.boom(); sfx.fanfare();
      confetti(b.x, b.y + 1, b.z, 320, 7); confetti(b.x, b.y, b.z, 200, 10); firework(b.x, b.y + 6, b.z);
      const bn = $('banner'); bn.style.setProperty('--res', resultHex());
      bn.querySelector('.b1').textContent = SECRET === 'o' ? 'É um' : 'É uma';
      bn.querySelector('.b2').textContent = SECRET === 'o' ? 'MENINO!' : 'MENINA!';
      bn.querySelector('.b3').textContent = 'Papai e Mamãe, vocês conseguiram!';
      bn.classList.add('on'); buildSlots(5);
      hemi.color.set(resultHex()).lerp(new THREE.Color(0xffffff), 0.55);
    }
  } else {
    shake *= 0.9;
    rainConfetti(b.x, b.z, 5);
    while (fwQueue.length && rt >= fwQueue[0]) {
      fwQueue.shift(); firework(b.x + (Math.random() - .5) * 26, b.y + 6 + Math.random() * 8, b.z + (Math.random() - .5) * 16);
    }
    if (rt > 4.5 && Math.random() < dt * 0.9) firework(b.x + (Math.random() - .5) * 28, b.y + 6 + Math.random() * 9, b.z + (Math.random() - .5) * 18);
    if (rt > 6 && !fwQueue.length) { const k = $('keys'); if (k.textContent.indexOf('R') < 0) k.textContent = 'R: jogar de novo · F: tela cheia'; }
  }
}

function update(dt) {
  T += dt;
  if (state === 'secret') return;
  for (const p of players) if (p.src && p.src.type === 'pad' && !getPad(p.src.index)) p.src = null;
  if (players.some(p => !p.src)) tryAssignPads();
  if (state === 'lobby' && players.every(p => p.src)) { state = 'countdown'; cdT = 3; lastN = 4; }
  if (state === 'countdown') {
    if (!players.every(p => p.src)) state = 'lobby';
    else {
      cdT -= dt;
      const n = Math.ceil(cdT);
      if (n !== lastN && n > 0) { lastN = n; sfx.count(false); }
      if (cdT <= 0) { state = 'play'; goT = 0.9; sfx.count(true); }
    }
  }
  updateMovers(dt);
  players.forEach((p, i) => stepPlayer(p, i, dt));
  leash();
  if (state === 'play') { playT += dt; stageLogic(dt); }
  else {
    plates.forEach(pl => { pl.pressed = false; });
    updateSweepers(dt); updateSimon(dt);
    blocks.forEach(b => { b.active = false; });
    if (state === 'reveal') revealUpdate(dt);
  }
  if (goT > 0) goT -= dt;
  if (msg.t > 0) msg.t -= dt;
  flash *= Math.exp(-4 * dt);
  if (state !== 'reveal') shake *= Math.exp(-6 * dt);
}

function debugSkip() {           // só no modo ensaio: tecla N
  if (cur > 4) return;
  const b = blocks[cur];
  { stage1.open = true; stage1.anim = 1; world.gate.off = true; world.gate.y = -2.5; world.gate.top = -0.5; world.gate.mesh.position.y = -2.5; }
  if (cur === 4) simon.state = 'done';
  revealLetter(b);
  const z = ZS[cur + 1] !== undefined ? ZS[cur + 1] : ZS[6];
  players.forEach((p, i) => { p.x = i ? 2 : -2; p.z = z; p.y = 0.5; p.vy = 0; p.vx = p.vz = 0; p.px = p.x; p.pz = p.z; p.safe = { x: p.x, y: 0, z }; });
}

/* =========================================================
   CÂMERA, SINCRONIA VISUAL E INTERFACE
   ========================================================= */
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function camTargets(out) {
  const a = players[0], b = players[1];
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, my = (Math.max(a.y, 0) + Math.max(b.y, 0)) / 2;
  const sep = Math.hypot(a.x - b.x, a.z - b.z) + Math.abs(a.y - b.y) * 0.6;
  const height = 5.6 + sep * 0.5, back = 9.2 + sep * 0.85;
  let px = mx * 0.85, py = my + height, pz = mz + back, lx = mx, ly = my + 1, lz = mz - 3;
  const b5 = blocks[5];
  if (state === 'play' && fin.unlocked) {
    const k = fin.charge; px = (px) * (1 - 0.4 * k); py = py - 2.5 * k; pz = lz + (pz - lz) * (1 - 0.35 * k); ly += 1.5 * k; lx = lx * (1 - k); lz = lz + (b5.z - lz) * 0.3 * k;
  }
  if (state === 'reveal') {
    const ang = rt * 0.28 + 0.4, e = clamp(rt / 1.2, 0, 1);
    px = b5.x + Math.sin(ang) * 15 * e + px * (1 - e) * 0.5; pz = b5.z + Math.cos(ang) * 15 * e + (pz - b5.z) * (1 - e);
    py = 6.5 + 1.5 * Math.sin(rt * 0.4); lx = b5.x; ly = b5.y + 1.5 - 1.5 * e; lz = b5.z;
  }
  out.p.set(px, py, pz); out.l.set(lx, ly, lz);
}
const ct = { p: new THREE.Vector3(), l: new THREE.Vector3() };
function snapCamera() { camTargets(ct); camPos.copy(ct.p); camLook.copy(ct.l); }

let lastFrame = performance.now();
function frame(dt) {
  /* personagens */
  players.forEach((p, i) => {
    const o = p.o, g = o.g;
    g.position.set(p.x, p.y, p.z);
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.8 && p.stun <= 0) {
      const ty = Math.atan2(p.vx, p.vz); let d = ty - g.rotation.y;
      while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      g.rotation.y += d * Math.min(1, 14 * dt);
    }
    p.anim += sp * dt * 1.7;
    const air = !p.ground, sw = air ? 0.5 : Math.sin(p.anim * 2.6) * Math.min(1, sp / 4);
    o.footL.position.z = sw * 0.25; o.footR.position.z = -sw * 0.25;
    o.armL.rotation.x = air ? -2.4 : -sw * 0.9; o.armR.rotation.x = air ? -2.4 : sw * 0.9;
    if (state === 'reveal' && revealed) { o.armL.rotation.x = o.armR.rotation.x = -2.6; }
    const st = clamp(p.vy * 0.012, -0.1, 0.12);
    g.scale.set(1 - st * 0.6, 1 + st, 1 - st * 0.6);
    g.position.y += air ? 0 : Math.abs(Math.sin(p.anim * 2.6)) * 0.05 * Math.min(1, sp / 4);
    g.visible = !(p.invul > 0 && Math.floor(T * 14) % 2);
    // anel no chão
    let gy = null;
    for (const s of solids) {
      if (s.block !== null || s.off) continue;
      if (Math.abs(p.x - s.x) < s.hx + 0.2 && Math.abs(p.z - s.z) < s.hz + 0.2) { const tp = s.y + s.hy; if (tp <= p.y + 0.05 && (gy === null || tp > gy)) gy = tp; }
    }
    p.ring.visible = gy !== null && !!state && state !== 'secret';
    if (gy !== null) { p.ring.position.set(p.x, gy + 0.04, p.z); const k = clamp(1 - (p.y - gy) * 0.08, 0.55, 1); p.ring.scale.set(k, k, k); }
  });
  /* fio de contas entre os dois */
  const a = players[0], b = players[1], dist = Math.hypot(a.x - b.x, a.z - b.z), ten = clamp((dist - 8) / (LEASH - 8), 0, 1);
  beads.forEach((m, k) => {
    const u = (k + 0.5) / beads.length, sag = Math.max(0, (LEASH - dist)) * 0.07 * 4 * u * (1 - u) * 1.0;
    m.position.set(a.x + (b.x - a.x) * u, a.y + 0.9 + (b.y - a.y) * u - Math.min(sag, 1.6), a.z + (b.z - a.z) * u);
    m.material.color.set(ten > 0.55 ? (k % 2 ? '#ff5252' : '#ffffff') : PCOL[k % 2].color);
    m.visible = state === 'play' || state === 'countdown';
  });
  /* blocos */
  blocks.forEach(bk => {
    const want = bk.revealed ? bk.vis : (bk.active ? 'active' : 'locked');
    if (want !== bk.vis && !bk.revealed) { bk.vis = want; bk.mesh.material = blockMats(want === 'active' ? TEX.active : TEX.locked, want === 'active' ? '#3a2a00' : '#000000'); }
    let off = 0;
    if (bk.bump > 0) { bk.bump -= dt; off = Math.sin(clamp(bk.bump / 0.28, 0, 1) * Math.PI) * 0.4; }
    let sx = 0, sz = 0;
    if (bk.i === 5 && !bk.revealed && ((state === 'play' && fin.unlocked) || (state === 'reveal'))) {
      const amp = state === 'reveal' ? 0.05 + rt * 0.12 : 0.02 + fin.charge * 0.16; sx = (Math.random() - .5) * amp; sz = (Math.random() - .5) * amp;
    }
    bk.mesh.position.set(bk.x + sx, bk.y + off, bk.z + sz);
    bk.mesh.rotation.y = bk.active ? Math.sin(T * 2) * 0.12 : 0;
    if (bk.i === 5 && bk.revealed) { const s = 1 + 0.6 * clamp((rt - 1) * 2.5, 0, 1); bk.mesh.scale.set(s, s, s); bk.mesh.rotation.y += dt * 0.8; }
    const showM = state === 'play' && bk.active && !(bk.i === 5 && fin.unlocked);
    bk.marker.visible = showM;
    if (showM) bk.marker.position.set(bk.x, bk.y + BS / 2 + 1.5 + Math.sin(T * 3) * 0.25, bk.z);
  });
  /* feixe de luz, luz pontual e vinheta */
  const b5 = blocks[5];
  const charge = state === 'play' ? fin.charge : (state === 'reveal' && !revealed ? Math.min(1, 0.6 + rt * 0.4) : 0);
  fin.beam.material.opacity = state === 'reveal' && revealed ? Math.max(0, 0.5 - (rt - 1) * 0.25) : charge * 0.5 * (0.85 + 0.15 * Math.sin(T * 30));
  fin.beam.scale.set(1 + charge * 0.8, 1, 1 + charge * 0.8);
  glow.position.set(b5.x, b5.y + 1, b5.z); glow.intensity = charge * 2.2 * (0.8 + 0.2 * Math.sin(T * 25));
  hemi.intensity = 0.62 * (1 - 0.45 * charge);
  sun.intensity = 0.55 * (1 - 0.45 * charge);
  $('vig').style.opacity = String(state === 'reveal' && revealed ? 0 : charge * 0.85);
  $('flash').style.opacity = String(flash);
  /* decoração viva */
  decor.forEach(g => {
    if (g.userData.ph !== undefined) g.position.y = g.userData.base + Math.sin(T * 0.8 + g.userData.ph) * 0.5;
    else { g.position.x = g.userData.base + Math.sin(T * 0.05 * g.userData.sp * 4) * 6; }
  });
  /* sol e câmera */
  const a2 = players[0], b2 = players[1];
  const mx = (a2.x + b2.x) / 2, mz = (a2.z + b2.z) / 2;
  sun.position.set(mx + 20, 42, mz + 16); sun.target.position.set(mx, 0, mz);
  camTargets(ct);
  const k = 1 - Math.exp(-3.2 * dt);
  camPos.lerp(ct.p, k); camLook.lerp(ct.l, 1 - Math.exp(-4.5 * dt));
  camera.position.copy(camPos);
  if (shake > 0.05) camera.position.add(new THREE.Vector3((Math.random() - .5) * shake * 0.07, (Math.random() - .5) * shake * 0.07, (Math.random() - .5) * shake * 0.07));
  camera.lookAt(camLook);
  updateParticles(dt);
  ui();
}

/* ---- interface (DOM) ---- */
const slotEls = [];
(function mkSlots() {
  const box = $('slots');
  for (let i = 0; i < 6; i++) { const d = document.createElement('div'); d.className = 'slot q'; d.textContent = '?'; box.appendChild(d); slotEls.push(d); }
})();
function buildSlots(pop) {
  slotEls.forEach((el, i) => {
    let cls = 'slot q', txt = '?';
    if (i < 5 && i < cur) { cls = 'slot on'; txt = LETTERS[i]; }
    if (i === 5 && state === 'reveal' && revealed) { cls = 'slot ' + (SECRET === 'o' ? 'fin-o' : 'fin-a'); txt = SECRET === 'o' ? 'O' : 'A'; }
    el.className = cls; el.textContent = txt;
    el.style.animation = pop === i ? '' : 'none';
  });
}
function setText(el, v) { if (el._v !== v) { el.textContent = v; el._v = v; } }
function stageHint() {
  const lost = players.find(p => !p.src);
  if (lost) return { t: 'Controle do ' + NAMES[lost.i] + ' sumiu! Aperte um botão para voltar.', w: true };
  if (msg.t > 0) return { t: msg.text, w: false };
  if (leashHit > 0) return { t: 'Esperem um pelo outro! Vocês estão muito longe.', w: true };
  const L = i => 'Vez ' + (i ? 'da ' : 'do ') + NAMES[i];
  switch (cur) {
    case 0:
      if (players.every(p => p.z > -20)) return { t: 'Sigam em frente!', w: false };
      return { t: stage1.open ? L(0) + ': pule embaixo do bloco brilhante!' : 'Cada um em um botão colorido! Fiquem juntos até a porta abrir.', w: false };
    case 1: return { t: 'Atravessem as plataformas. ' + L(1) + ' acerta o bloco no fim!', w: false };
    case 2: return { t: 'Um segura o botão amarelo, o outro sobe no elevador. ' + L(0) + ' acerta o bloco!', w: false };
    case 3: return { t: 'Pulem por cima das vassouras! ' + L(1) + ' acerta o bloco no fim.', w: false };
    case 4:
      if (simon.state === 'wait') return { t: 'Memória! Cheguem nos botões coloridos.', w: false };
      if (simon.state === 'pause' || simon.state === 'show') return { t: 'Olhem a sequência com atenção…', w: false };
      if (simon.state === 'input') return { t: 'Agora repitam pisando nos botões! (' + simon.idx + '/' + simon.seq.length + ')', w: false };
      if (simon.state === 'retry') return { t: 'Vamos de novo…', w: false };
      return { t: L(0) + ': acerte o bloco brilhante!', w: false };
    default:
      return { t: fin.unlocked ? 'Cada um em um círculo: segurem B juntos até o fim!' : 'O último bloco! Os dois pulem embaixo dele ao mesmo tempo.', w: false };
  }
}
function ui() {
  const showHud = state === 'play' || state === 'reveal' || state === 'countdown';
  $('hud').classList.toggle('on', showHud);
  $('tag').classList.toggle('on', REHEARSAL && state !== 'secret');
  $('lobby').classList.toggle('on', state === 'lobby');
  for (let i = 0; i < 2; i++) {
    const p = players[i], ok = !!p.src;
    setText($('st' + i), ok ? 'Pronto! ' + srcName(p.src) : 'Aperte um botão…');
    $('p' + i + 'box').classList.toggle('ok', ok);
  }
  const c = $('count');
  if (state === 'countdown') { const n = String(Math.max(1, Math.ceil(cdT))); if (c._v !== n) { c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); c.textContent = n; c._v = n; } c.classList.add('on'); }
  else if (state === 'play' && goT > 0) { if (c._v !== 'JÁ!') { c.classList.remove('on'); void c.offsetWidth; c.classList.add('on'); c.textContent = 'JÁ!'; c._v = 'JÁ!'; } }
  else { c.classList.remove('on'); c._v = ''; }
  if (state === 'play') { const h = stageHint(); setText($('hint'), h.t); $('hint').classList.toggle('warn', h.w); $('hint').style.display = h.t ? '' : 'none'; }
  else if (state === 'countdown') { setText($('hint'), 'Preparem-se!'); $('hint').style.display = ''; }
  else if (state === 'reveal') { $('hint').style.display = 'none'; }
  const s = Math.floor(playT), tm = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
  setText($('timer'), tm);
}

/* =========================================================
   TELA DO SEGREDO: ligações
   ========================================================= */
function showErr(m) { $('err').textContent = m; }
function startGame(msgText) {
  $('secret').hidden = true; showErr('');
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  initAudio(); resetGame('lobby'); toast(msgText);
}
function submitSecret() {
  const a = parseSecret($('s1').value), b = parseSecret($('s2').value);
  $('s1').value = ''; $('s2').value = '';
  if (!a || !b) { showErr('Não entendi. Digite menino ou menina nos dois campos.'); $('s1').focus(); return; }
  if (a !== b) { showErr('Os dois campos não batem. Digite de novo.'); $('s1').focus(); return; }
  SECRET = a; REHEARSAL = false; $('keys').textContent = 'F: tela cheia';
  startGame('Segredo guardado. Pode devolver o notebook!');
}
$('go').addEventListener('click', submitSecret);
$('s1').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('s2').focus(); } });
$('s2').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submitSecret(); } });
$('rehearsal').addEventListener('click', () => {
  $('s1').value = ''; $('s2').value = '';
  SECRET = Math.random() < 0.5 ? 'o' : 'a'; REHEARSAL = true; $('keys').textContent = 'F: tela cheia · N: pular fase (só no ensaio)';
  startGame('Modo ensaio: resultado sorteado, não vale.');
});
setTimeout(() => $('s1').focus(), 50);

/* =========================================================
   INÍCIO
   ========================================================= */
buildWorld();
snapCamera();
buildSlots();
let acc = 0;
function loop(t) {
  const dt = Math.min(0.1, (t - lastFrame) / 1000); lastFrame = t; acc += dt;
  let guard = 0;
  while (acc >= 1 / 60 && guard++ < 6) { update(1 / 60); acc -= 1 / 60; }
  frame(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
// DEV-HOOK-START
// Atalho para depurar no console do navegador (só no `npm run dev`): window.__game
// Também usado pelos testes automatizados (tests/simulate.mjs).
if (import.meta.env && import.meta.env.DEV) {
  window.__game = {
    players, blocks, solids, stage1, elev, simon, fin, pads, sweepers, plates, scene, camera,
    keys,
    update, frame,
    get state()    { return state; },
    get cur()      { return cur; },
    get SECRET()   { return SECRET; },
    get revealed() { return revealed; },
    skip: debugSkip
  };
}
// DEV-HOOK-END
