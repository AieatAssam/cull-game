import * as THREE from 'three';
import './style.css';
import { stateHash } from './sim/hash';
import { updateRenderCamera } from './render/camera';
import { inFrame } from './sim/frame';
import { NEUTRAL_INPUT, step } from './sim/step';
import { lodTier } from './sim/lod';
import { TUNING } from './sim/tuning';
import { createState } from './sim/world';
import { UrchinLodBuckets } from './render/lod-buckets';
import type { CastEntity, InputFrame, SimState } from './sim/types';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing app root');
const query = new URLSearchParams(location.search);
const frozen = query.has('frozen');
const urlSeed = Number(query.get('seed') ?? '1');
let state: SimState = createState(Number.isFinite(urlSeed) ? urlSeed : 1);
let paused = false;
let pointer: { id: number; x: number; y: number } | null = null;
const keys = new Set<string>();
let frameInput: InputFrame = { ...NEUTRAL_INPUT };
let pointerPan: Pick<InputFrame, 'panX' | 'panZ'> | null = null;
let zoomPulse = 0;
let rotationPulse: -1 | 0 | 1 = 0;
let simAccumulator = 0;
let previousTime = 0;

const shell = document.createElement('section');
shell.className = 'stage';
shell.innerHTML = `
  <header class="topbar"><div class="brand"><span class="rec-dot"></span><strong>CULL</strong><span class="tagline">CAMERA DEPARTMENT</span></div><div class="readout"><span>TAKE 01</span><b id="timecode">01:30</b><span id="lens">35 MM</span><button class="pause-button" id="pause">Ⅱ</button></div></header>
  <div class="composition"><aside class="margin margin-left"><div class="slate">SCENE 01<br><strong>BACKLOT</strong><small>SEED <span id="seed">00001</span></small></div><div class="hint"><span class="hint-mark">↖</span> WASD / DRAG<br>TO FRAME THE SHOT<div class="preview" id="preview"></div></div></aside>
    <div class="gate-wrap"><div class="gate-label"><span>VIEWFINDER · GATE 1:1</span><span id="lod">TALENT · CLOSE</span></div><div class="gate" id="gate"><div class="thirds"></div><div class="gate-corners"></div><div id="mount" class="mount"></div><div class="frame-message" id="message">KEEP THEM IN THE SHOT</div><div class="cut-flash" id="cut-flash"></div></div><div class="gate-foot"><span>55° · ORTHOGRAPHIC</span><span id="status">ROLLING</span></div></div>
    <aside class="margin margin-right"><div class="camera-mark">⌑<small>CAM 01</small></div><div class="call-sheet"><span>CALL SHEET</span><div id="call-sheet">SCANNING FRAME…</div></div></aside>
  </div>
  <footer class="controlbar"><div class="controls"><span><kbd>WASD</kbd> PAN</span><span><kbd>−</kbd> / <kbd>+</kbd> ZOOM</span><span><kbd>SPACE</kbd> HOLD</span><span><kbd>Q</kbd> / <kbd>E</kbd> ROTATE</span></div><div class="mobile-controls"><button id="hold" aria-label="Hold Talent">HOLD</button><label>ZOOM <input id="zoom-slider" aria-label="Zoom" type="range" min="10" max="48" value="30" /></label></div><div class="film"><span>FILM</span><div class="film-track"><i id="filmbar"></i></div><b id="film">90 s</b></div></footer>
  <div class="end-card hidden" id="end-card"><div class="end-stamp">TAKE ENDED</div><h1 id="end-title">CUT</h1><p id="end-detail"></p><button id="restart">NEW TAKE ↗</button></div>
`;
app.append(shell);
const $ = <T extends HTMLElement>(selector: string) => shell.querySelector<T>(selector)!;
const mount = $('#mount');
$('#seed').textContent = String(state.seed).padStart(5, '0');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8e4da');
const camera = new THREE.OrthographicCamera(-15, 15, 15, -15, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
renderer.setSize(1, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.domElement.setAttribute('aria-label', 'CULL game view');
renderer.domElement.setAttribute('tabindex', '0');
mount.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#fff9ec', '#716a60', 2.1));
const keyLight = new THREE.DirectionalLight('#fffaf2', 1.2);
keyLight.position.set(-8, 14, 9);
scene.add(keyLight);
const urchinBuckets = new UrchinLodBuckets(scene);

const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 30), new THREE.MeshLambertMaterial({ color: '#b9ad98' }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.12;
scene.add(floor);
const grid = new THREE.GridHelper(400, 80, '#8a7f6e', '#c6b9a3');
grid.position.y = -0.1;
scene.add(grid);
const path = new THREE.Mesh(new THREE.BoxGeometry(400, 0.05, 2), new THREE.MeshBasicMaterial({ color: '#d2c8b6' }));
path.position.y = 0.01;
scene.add(path);

const talent = new THREE.Group();
const talentGeometry = [
  new THREE.CylinderGeometry(0.24, 0.36, 0.8, 7),
  new THREE.CylinderGeometry(0.24, 0.36, 0.8, 5),
  new THREE.OctahedronGeometry(0.65, 0),
  new THREE.BoxGeometry(0.9, 0.9, 0.9),
];
const coat = new THREE.Mesh(talentGeometry[1], new THREE.MeshLambertMaterial({ color: '#d23a2a', flatShading: true }));
coat.position.y = 0.5;
talent.add(coat);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshLambertMaterial({ color: '#dfc3a1', flatShading: true }));
head.position.y = 1.05;
talent.add(head);
scene.add(talent);
let renderedTalentTier = -1;
function syncTalentLod() {
  const tier = state.talent.lodTier ?? Math.min(lodTier(1000 / state.camera.zoom), 3);
  if (tier === renderedTalentTier) return;
  renderedTalentTier = tier;
  talent.visible = tier < 4;
  if (tier < 4) coat.geometry = talentGeometry[tier]!;
  head.visible = tier <= 1;
}

const entityMeshes = new Map<string, THREE.Object3D>();
function buildEntity(entity: CastEntity) {
  const kind = entity.kind;
  const group = new THREE.Group();
  let material: THREE.Material;
  if (kind === 'glass') {
    material = new THREE.MeshBasicMaterial({ color: '#3fd8ff', transparent: true, opacity: 0.54, wireframe: true });
    const mesh = new THREE.BoxGeometry(1.5, 0.08, 1.5);
    const pad = new THREE.Mesh(mesh, material);
    pad.position.y = 0.1;
    group.add(pad);
  } else if (kind === 'urchin') {
    material = new THREE.MeshLambertMaterial({ color: '#ff4b3e', flatShading: true });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.62, 0), material);
    core.name = 'urchin-core';
    group.add(core);
    const spikeMaterial = new THREE.MeshLambertMaterial({ color: '#232323', flatShading: true });
    for (let i = 0; i < 8; i++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.48, 4), spikeMaterial);
      const angle = (i * Math.PI) / 4;
      spike.position.set(Math.cos(angle) * 0.52, 0.12, Math.sin(angle) * 0.52);
      spike.rotation.z = -Math.cos(angle) * 0.9;
      spike.rotation.x = Math.sin(angle) * 0.9;
      spike.name = 'urchin-spike';
      group.add(spike);
    }
  } else if (kind === 'boulder') {
    material = new THREE.MeshLambertMaterial({ color: '#ff4b3e', flatShading: true });
    group.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.72, 0), material));
  } else if (kind === 'extras') {
    const crowd = new THREE.InstancedMesh(new THREE.ConeGeometry(0.16, 0.48, 4), new THREE.MeshLambertMaterial({ color: '#9b6041', flatShading: true }), Math.max(12, entity.members?.length ?? 0));
    crowd.name = 'extras-crowd'; crowd.count = 0; group.add(crowd);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 0.45), new THREE.MeshLambertMaterial({ color: '#9b6041', flatShading: true }));
    wall.name = 'extras-wall'; wall.position.y = 0.6; wall.visible = false; group.add(wall);
  } else if (kind === 'swarm') {
    const swarm = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.08, 0), new THREE.MeshBasicMaterial({ color: '#ff4b3e' }), 12);
    swarm.name = 'swarm-cloud'; swarm.count = 0; group.add(swarm);
  } else if (kind === 'stagehand') {
    material = new THREE.MeshLambertMaterial({ color: '#232323', flatShading: true });
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.42, 3, 5), material);
    body.position.y = 0.45; group.add(body);
  } else if (kind === 'bridge') {
    const planks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.48, 0.1, 1.8), new THREE.MeshLambertMaterial({ color: '#8d6040', flatShading: true }), 28);
    planks.name = 'bridge-planks'; planks.count = 28;
    for (let i = 0; i < 28; i++) {
      const matrix = new THREE.Matrix4().makeTranslation(-6.75 + i * 0.5, 0, 0);
      planks.setMatrixAt(i, matrix);
    }
    group.add(planks);
    const ropePoints = [new THREE.Vector3(-7, 0.5, -0.8), new THREE.Vector3(7, 0.5, -0.8), new THREE.Vector3(-7, 0.5, 0.8), new THREE.Vector3(7, 0.5, 0.8)];
    const ropes = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(ropePoints), new THREE.LineBasicMaterial({ color: '#554332' }));
    ropes.name = 'bridge-ropes'; group.add(ropes);
  } else {
    material = new THREE.MeshLambertMaterial({ color: '#3fd8ff', flatShading: true });
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.7, 8), material));
  }
  return group;
}
function syncEntities() {
  for (const entity of state.entities) {
    if (entity.kind === 'urchin') continue;
    if (entity.cut || !entity.spawned) continue;
    let object = entityMeshes.get(entity.id);
    if (!object) { object = buildEntity(entity); entityMeshes.set(entity.id, object); scene.add(object); }
    object.position.set(entity.x, entity.kind === 'glass' ? 0 : entity.kind === 'boulder' ? 0.72 : 0.68, entity.z);
    object.rotation.y = entity.age * 0.015;
    if (entity.kind === 'extras') {
      const crowd = object.getObjectByName('extras-crowd') as THREE.InstancedMesh;
      const wall = object.getObjectByName('extras-wall')!;
      const tier = lodTier(1000 / state.camera.zoom, entity.lodTier as 0 | 1 | 2 | 3 | 4 | undefined);
      let count = 0;
      for (const member of entity.members ?? []) {
        if (member.cut || tier >= 2) continue;
        const matrix = new THREE.Matrix4().makeTranslation(member.dx, 0.3, member.dz);
        crowd.setMatrixAt(count++, matrix);
      }
      crowd.count = count; crowd.instanceMatrix.needsUpdate = true; wall.visible = tier >= 2;
    }
    if (entity.kind === 'swarm') {
      const swarm = object.getObjectByName('swarm-cloud') as THREE.InstancedMesh;
      const tier = lodTier(TUNING.swarmRadius * 1000 / state.camera.zoom, entity.lodTier as 0 | 1 | 2 | 3 | 4 | undefined);
      object.visible = tier < 4; swarm.count = tier < 4 ? 12 : 0;
      for (let i = 0; i < swarm.count; i++) {
        const angle = i * Math.PI * 2 / 12;
        swarm.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(angle) * 0.55, 0.35 + Math.sin(i * 1.7) * 0.16, Math.sin(angle) * 0.55));
      }
      swarm.instanceMatrix.needsUpdate = true;
    }
    if (entity.kind === 'bridge') {
      const planks = object.getObjectByName('bridge-planks')!;
      const tier = lodTier(1000 / state.camera.zoom, entity.lodTier as 0 | 1 | 2 | 3 | 4 | undefined);
      planks.visible = tier <= 1;
    }
    object.visible = true;
  }
  for (const [id, object] of entityMeshes) {
    const found = state.entities.find((entity) => entity.id === id);
    if (!found || found.cut) object.visible = false;
  }
  urchinBuckets.update(state.entities, state.camera.zoom, state.tick);
}

function syncCamera() {
  updateRenderCamera(camera, state.camera);
}
function render() {
  syncCamera();
  syncTalentLod();
  talent.position.set(state.talent.x, 0, state.talent.z);
  syncEntities();
  renderer.render(scene, camera);
  updateHud();
}
function updateHud() {
  const seconds = Math.max(0, Math.ceil(state.film));
  $('#timecode').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('#film').textContent = `${seconds} s`;
  $('#filmbar').style.width = `${Math.max(0, state.film / 90 * 100)}%`;
  $('#filmbar').style.background = state.film < 20 ? '#ff4b3e' : '#ff7a1a';
  $('#lens').textContent = `${Math.round(Math.max(24, Math.min(85, 85 - (state.camera.zoom - 10) * 61 / 38)))} MM`;
  $('#status').textContent = state.waiting ? 'HOLDING FOR SET…' : paused ? 'PAUSED' : state.camera.moving ? 'IN MOTION' : 'ROLLING';
  const tierIndex = state.talent.lodTier ?? lodTier(1000 / state.camera.zoom);
  const tier = ['CLOSE', 'MEDIUM', 'WIDE', 'PROXY', 'SUB-PIXEL'][tierIndex];
  const urchin = state.entities.find((entity) => entity.kind === 'urchin' && entity.spawned && !entity.cut);
  const urchinTier = urchin?.lodTier ?? lodTier(TUNING.urchinRadius * 1000 / state.camera.zoom);
  $('#lod').textContent = `TALENT · ${tier} / URCHIN · ${['CLOSE', 'MEDIUM', 'WIDE', 'PROXY', 'GONE'][urchinTier]}`;
  const urchinInShot = state.entities.some((entity) => entity.kind === 'urchin' && entity.spawned && !entity.cut && inFrame(entity.x, entity.z, TUNING.urchinRadius, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, 0.8) && urchinTier < 4);
  $('#message').textContent = urchinInShot ? ['CLOSE-UP · FULL THREAT', 'MEDIUM · lethal', 'WIDE · urchin defanged', 'PROXY · harmless cube', 'SUB-PIXEL · gone'][urchinTier] : 'KEEP THEM IN THE SHOT';
  ($('#zoom-slider') as HTMLInputElement).value = String(Math.round(state.camera.zoom));
  $('#call-sheet').textContent = state.entities.filter((entity) => !entity.spawned && !entity.cut && Math.abs(entity.x - state.camera.x) < state.camera.zoom * (0.5 + TUNING.callSheetMargin)).map((entity) => `${entity.kind.toUpperCase()} · PREVIEW`).join(' / ') || 'NO CAST IN FRAME';
  const filmBar = shell.querySelector<HTMLElement>('.film-track')!;
  filmBar.style.setProperty('--remaining', `${Math.max(0, state.film / 90 * 100)}%`);
  if (state.failed) {
    $('#message').textContent = 'THAT’S A WRAP';
    $('#end-title').textContent = state.failed.toUpperCase().replaceAll('-', ' ');
    $('#end-detail').textContent = `TAKE ${String(state.seed).padStart(5, '0')} · ${Math.floor(state.talent.x)} METRES · ${state.cuts.length} CUT`;
    $('#end-card').classList.remove('hidden');
  }
}

function buildInput(): InputFrame {
  const keyInput = panFromKeys();
  return {
    ...frameInput, ...keyInput,
    panX: pointerPan?.panX ?? (keys.size ? keyInput.panX : frameInput.panX),
    panZ: pointerPan?.panZ ?? (keys.size ? keyInput.panZ : frameInput.panZ),
    zoom: keyInput.zoom || zoomPulse || frameInput.zoom,
    rotate: rotationPulse || frameInput.rotate,
    hold: keyInput.hold || frameInput.hold,
    steady: keyInput.steady || frameInput.steady,
  };
}
function advanceTick() {
  if (!paused && !state.failed) state = step(state, buildInput());
  frameInput = { ...NEUTRAL_INPUT };
  zoomPulse = 0;
  rotationPulse = 0;
}
function stepFrame() {
  advanceTick();
  render();
}
function loop(now: number) {
  if (!previousTime) previousTime = now;
  simAccumulator += Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  let ticks = 0;
  while (simAccumulator >= 1 / TUNING.tickRate && ticks < TUNING.maxCatchupTicks) {
    stepFrame(); simAccumulator -= 1 / TUNING.tickRate; ticks++;
  }
  requestAnimationFrame(loop);
}
function panFromKeys(): InputFrame {
  let x = 0; let z = 0;
  if (keys.has('a') || keys.has('arrowleft')) x -= 90;
  if (keys.has('d') || keys.has('arrowright')) x += 90;
  if (keys.has('w') || keys.has('arrowup')) z -= 90;
  if (keys.has('s') || keys.has('arrowdown')) z += 90;
  return { ...NEUTRAL_INPUT, panX: x, panZ: z, zoom: (keys.has('x') || keys.has('=') || keys.has('+') ? 60 : 0) - (keys.has('z') || keys.has('-') ? 60 : 0), rotate: 0, hold: keys.has(' ') || holdButton, steady: keys.has('shift') };
}
let holdButton = false;
window.addEventListener('keydown', (event) => {
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
  keys.add(event.key.toLowerCase());
  if (!event.repeat && event.key.toLowerCase() === 'q') rotationPulse = -1;
  if (!event.repeat && event.key.toLowerCase() === 'e') rotationPulse = 1;
  if (event.key === 'Escape' || event.key.toLowerCase() === 'p') paused = !paused;
});
window.addEventListener('keyup', (event) => { keys.delete(event.key.toLowerCase()); });
renderer.domElement.addEventListener('pointerdown', (event) => {
  pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
  try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* synthetic touch events have no browser pointer capture */ }
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  pointerPan = { panX: Math.max(-127, Math.min(127, -dx / rect.width * 127)), panZ: Math.max(-127, Math.min(127, dy / rect.height * 127)) };
  pointer.x = event.clientX; pointer.y = event.clientY;
});
renderer.domElement.addEventListener('pointerup', () => { pointer = null; pointerPan = null; });
renderer.domElement.addEventListener('wheel', (event) => { event.preventDefault(); zoomPulse = -Math.sign(event.deltaY) * 60; }, { passive: false });
document.addEventListener('visibilitychange', () => { if (document.hidden) paused = true; });
$('#hold').addEventListener('pointerdown', () => { holdButton = true; frameInput.hold = true; });
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) $('#hold').addEventListener(type, () => { holdButton = false; frameInput.hold = false; });
$('#zoom-slider').addEventListener('input', (event) => {
  const value = Number((event.currentTarget as HTMLInputElement).value);
  state.camera.zoom = value;
});
$('#pause').addEventListener('click', () => { paused = !paused; });
$('#restart').addEventListener('click', () => { state = createState(state.seed + 1); entityMeshes.clear(); urchinBuckets.reset(); for (const child of [...scene.children]) if (child instanceof THREE.Group && child !== talent) scene.remove(child); $('#end-card').classList.add('hidden'); });

if (query.has('debug')) {
  Object.assign(window, { __cull: { step: (n = 1) => { for (let i = 0; i < n; i++) advanceTick(); render(); }, input: (input: InputFrame) => { frameInput = input; }, hash: () => stateHash(state), state: () => structuredClone(state), diagnostics: () => ({ paused, keys: [...keys], hidden: document.hidden, focused: document.hasFocus() }), performance: () => ({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }), lod: () => urchinBuckets.diagnostics(), load: (seed: number) => { state = createState(seed); urchinBuckets.reset(); }, loadLodDemo: () => { state = createState(1, [{ id: 'lod-demo-urchin', kind: 'urchin', x: 0, z: 2, vx: 0, vz: 0, spawned: true, cut: false, age: 0 }]); state.talent.x = -4; render(); }, setTier: (tier: number) => { const size = [64, 36, 17, 7, 2][tier] ?? 36; state.camera.zoom = TUNING.urchinRadius * 1000 / size; }, setCamera: (x: number, z: number, zoom: number) => { state.camera.x = x; state.camera.z = z; state.camera.zoom = zoom; } } });
}

new ResizeObserver(() => {
  const rect = mount.getBoundingClientRect();
  const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
  renderer.setSize(size, size, true);
  render();
}).observe(mount);
render();
if (!frozen) requestAnimationFrame(loop);
