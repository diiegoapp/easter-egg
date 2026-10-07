// Teste de fumaça: joga o jogo inteiro "por baixo dos panos" (sem navegador e sem GPU).
// Empacota src/main.js com esbuild, troca só o WebGLRenderer por um falso e simula as 5 fases + final.
// Uso: npm test
import { build } from 'esbuild';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cache = path.join(root, 'node_modules', '.cache', 'sim');
fs.mkdirSync(cache, { recursive: true });

// 1) "three" real, exceto o renderer (que precisa de GPU)
const realThree = path.join(root, 'node_modules', 'three', 'build', 'three.module.js').replace(/\\/g, '/');
const shim = path.join(cache, 'three-shim.mjs');
fs.writeFileSync(shim, `export * from '${realThree}';
export class WebGLRenderer { constructor() { this.shadowMap = {}; this.capabilities = { getMaxAnisotropy: () => 8 }; }
  setPixelRatio() {} setSize() {} render() {} }\n`);

const out = path.join(cache, 'game.mjs');
await build({
  entryPoints: [path.join(root, 'src', 'main.js')], bundle: true, format: 'esm', platform: 'node', target: 'esnext',
  outfile: out, logLevel: 'silent',
  loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty' },
  define: { 'import.meta.env': '{"DEV":true}', 'import.meta.env.DEV': 'true' },
  plugins: [{ name: 'three-shim', setup(b) { b.onResolve({ filter: /^three$/ }, () => ({ path: shim })); } }]
});

// 2) DOM e navegador falsos
const mkEl = () => ({
  style: { setProperty() {} }, children: [], className: '', textContent: '', value: '', hidden: false,
  classList: { add() {}, remove() {}, toggle() {} }, listeners: {},
  addEventListener(n, f) { this.listeners[n] = f; }, appendChild() {}, setAttribute() {}, focus() {}, blur() {},
  querySelector() { return mkEl(); }, get offsetWidth() { return 0; }
});
const els = {};
const ctx2d = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}),
  set: (t, k, v) => { t[k] = v; return true; }
});
const win = { listeners: {}, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
  addEventListener(n, f) { this.listeners[n] = f; } };
globalThis.window = win;
globalThis.document = {
  getElementById: id => els[id] || (els[id] = mkEl()),
  createElement: t => (t === 'canvas' ? { width: 0, height: 0, getContext: () => ctx2d } : mkEl()),
  activeElement: null, fonts: { load() {} }
};
Object.defineProperty(globalThis, 'navigator', { value: { getGamepads: () => [] }, configurable: true });
globalThis.requestAnimationFrame = () => {};
globalThis.setTimeout = () => 0;

await import(pathToFileURL(out).href);
const G = win.__game;
if (!G) { console.error('window.__game não foi exposto (veja o contrato no fim de src/main.js).'); process.exit(1); }

// 3) utilitários de teste
const dt = 1 / 60;
const step = n => { for (let i = 0; i < n; i++) { G.update(dt); G.frame(dt); } };
let falhas = 0;
const check = (ok, msg) => { console.log((ok ? 'OK    ' : 'FALHA ') + msg); if (!ok) falhas++; };
const key = (type, code) => win.listeners[type]({ code, target: { tagName: 'BODY' }, preventDefault() {} });
const tp = (p, x, z, y = 0) => { p.x = x; p.z = z; p.y = y; p.vx = p.vy = p.vz = 0; p.px = x; p.pz = z; };
const press = (codes, frames) => { codes.forEach(c => G.keys.add(c)); step(frames); codes.forEach(c => G.keys.delete(c)); };

// 4) cenário completo
els.s1.value = 'menina'; els.s2.value = 'menina'; els.go.listeners.click();
check(G.state === 'lobby' && G.SECRET === 'a', 'segredo guardado leva ao lobby');
key('keydown', 'KeyA'); key('keyup', 'KeyA'); key('keydown', 'ArrowLeft'); key('keyup', 'ArrowLeft');
step(200);
check(G.state === 'play', 'contagem regressiva leva ao jogo');
const [P, M] = G.players;

press(['KeyW'], 60);
check(P.z < -5 && Math.abs(P.y) < 0.01, 'Papai anda para frente no chão');
press(['Space'], 8); check(P.y > 0.3, 'Papai pula'); step(60);
check(!!P.ground && Math.abs(P.y) < 0.01, 'Papai aterrissa');

tp(P, 0, -30); tp(M, 2, -29); step(5); press(['KeyW'], 180);
check(P.z > -33.5, 'a porta bloqueia a passagem');
tp(P, -6, -26); tp(M, 6, -26); step(200);
check(G.stage1.open, 'dois botões abrem a porta');
tp(P, -3, -41); tp(M, 3, -41); step(10);
check(G.blocks[0].active, 'bloco 0 fica ativo depois da porta');
tp(M, 0, -41); step(3); press(['Enter'], 14); step(40);
check(G.cur === 0, 'Mamãe não revela a letra do Papai');
tp(P, 0, -41); tp(M, 3, -38); step(3); press(['Space'], 14); step(40);
check(G.cur === 1 && G.blocks[0].revealed, 'Papai bate no bloco M');

const m1 = G.solids.find(s => s.moving && Math.abs(s.z + 57) < 0.1);
tp(P, 0, -57); step(2); P.x = m1.x; P.z = m1.z; P.y = m1.y + m1.hy; step(30);
check(P.ground === m1, 'Papai sobe na plataforma móvel');
const x0 = P.x - m1.x; step(90);
check(Math.abs(P.x - m1.x - x0) < 0.3, 'a plataforma carrega o jogador');
tp(P, 20, -60); P.y = -8.9; step(10);
check(P.y > -5, 'cair no vazio faz voltar ao último trecho firme');
tp(P, 0, -70); tp(M, 0, -52); step(5); press(['KeyW'], 120);
check(Math.hypot(P.x - M.x, P.z - M.z) <= 15.2, 'a corda limita a distância entre os dois');
tp(P, 2, -76); tp(M, 0, -80); step(5); press(['Enter'], 14); step(40);
check(G.cur === 2, 'Mamãe bate no bloco E');

tp(M, 7, -89); tp(P, -4, -94, 0.65); step(5); step(240);
check(G.elev.h > 0.99, 'elevador sobe com o botão pressionado');
check(P.y > 4.5, 'Papai subiu no elevador');
tp(P, -4, -100, 4.65); step(5); press(['Space'], 14); step(40);
check(G.cur === 3, 'Papai bate no bloco N da saliência');

tp(P, 0, -114); tp(M, 2, -114); step(5);
let bateu = false; tp(P, 3, -120);
for (let i = 0; i < 400 && !bateu; i++) { step(1); if (P.stun > 0) bateu = true; }
check(bateu, 'a vassoura acerta e derruba o jogador');
step(120);
tp(P, 0, -141); tp(M, 3, -142.5); step(40); // fora do alcance da vassoura (raio 7); espera o atordoamento passar
check(G.blocks[3].active, 'bloco 3 fica ativo');
tp(M, 0, -141); step(3); press(['Enter'], 14); step(40);
check(G.cur === 4, 'Mamãe bate no bloco I');

tp(P, -4, -150); tp(M, 4, -150); step(5); step(120);
check(G.simon.state === 'show' || G.simon.state === 'pause', 'memória começa a mostrar a sequência');
step(480);
check(G.simon.state === 'input', 'memória espera os jogadores');
const seq = G.simon.seq.slice();
const errado = [0, 1, 2, 3].find(k => k !== seq[0]);
tp(M, 0, -150); step(2); tp(M, G.pads[errado].x, -156); step(3);
check(G.simon.state === 'retry', 'pad errado reinicia a sequência');
step(600);
check(G.simon.state === 'input', 'memória volta a pedir depois do replay');
for (const k of G.simon.seq.slice()) { tp(P, 0, -150); step(2); tp(P, G.pads[k].x, -156); step(3); }
check(G.simon.state === 'done', 'sequência certa conclui a fase');
tp(P, 0, -172); tp(M, 3, -170); step(5); press(['Space'], 14); step(40);
check(G.cur === 5, 'Papai bate no último N');

tp(P, -0.4, -196); tp(M, 0.4, -196); step(5); press(['Space', 'Enter'], 14); step(40);
check(G.fin.unlocked, 'pulo sincronizado quebra o selo');
tp(P, -4.5, -199); tp(M, 4.5, -199); step(5); press(['KeyE', 'ShiftRight'], 190);
check(G.state === 'reveal', 'segurar juntos por 3s inicia a revelação');
step(180);
check(G.revealed, 'a revelação acontece (resultado: ' + (G.SECRET === 'o' ? 'menino' : 'menina') + ')');

key('keydown', 'KeyR'); step(1); step(480);
check(['reveal', 'countdown', 'play'].includes(G.state), 'reiniciar não quebra o jogo');

console.log(falhas ? `\n${falhas} verificação(ões) falharam.` : '\nTudo certo.');
process.exit(falhas ? 1 : 0);
