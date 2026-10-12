import * as THREE from 'three';
import './style.css';
import { stateHash } from './sim/hash';
import { updateRenderCamera } from './render/camera';
import { inFrame } from './sim/frame';
import { NEUTRAL_INPUT, step } from './sim/step';
import { lodTier } from './sim/lod';
import { TUNING } from './sim/tuning';
import { createGeneratedState, createState } from './sim/world';
import { createValidatedState } from './gen/validated';
import { createShootState, createShootSceneState, stepShoot } from './sim/shoot';
import { inputForBot, type BotKind } from './bots/players';
import { mulberry32 } from './sim/rng';
import { UrchinLodBuckets } from './render/lod-buckets';
import { CastBounds } from './render/cast-bounds';
import { DPR_SCALES, nextDprTier } from './render/adaptive-dpr';
import { AudioDirector, type AudioSettings } from './audio/director';
import { dailySeed } from './meta/daily';
import { loadFilmography, personalBest, recordResult } from './meta/filmography';
import { gradeMetrics, smoothnessFromMeanJerk, thirdsDistance } from './meta/grade';
import { decodeReplay, encodeReplay } from './replay/codec';
import { makeContactSheet, type ContactFrame } from './ui/contact-sheet';
import type { CastEntity, InputFrame, SimState } from './sim/types';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing app root');
const audio = new AudioDirector();
const unlockAudio = () => { if (!audio.started) void audio.startFromGesture().catch(() => undefined); };
const query = new URLSearchParams(location.search);
const frozen = query.has('frozen');
const daily = query.has('daily');
const utcDate = new Date().toISOString().slice(0, 10);
const urlSeed = Number(query.get('seed') ?? '1');
let replayData: ReturnType<typeof decodeReplay> | undefined;
let invalidReplay = false;
let overcrank = query.has('assist');
if (location.hash.length > 1) {
  try { replayData = decodeReplay(location.hash.slice(1)); } catch { invalidReplay = true; }
}
const seed = replayData?.seed ?? (daily ? dailySeed(utcDate) : Number.isFinite(urlSeed) ? urlSeed : 1);
const botName = query.get('bot');
const bot = (['tracker', 'wide', 'close', 'adaptive', 'chaos'] as string[]).includes(botName ?? '') ? botName as BotKind : undefined;
const createTake = (takeSeed: number) => query.has('shoot') ? createShootState(takeSeed) : query.has('roster') ? createState(takeSeed) : query.has('validated') ? createValidatedState(takeSeed) : createGeneratedState(takeSeed);
let botRandom = mulberry32((seed ^ 0xb07b07) >>> 0);
let state: SimState = createTake(seed);
let replayIndex = 0;
let inputLog: InputFrame[] = [];
interface ScoredFrame extends ContactFrame { tick: number; rank: number; }
const contactFrames: ScoredFrame[] = [];
const closeCallFrames: ScoredFrame[] = [];
// Tick zero is rendered before the first layout resize on some browsers.
// Start sampling only after play advances so that frame cannot enter exports.
let lastContactTick = 0;
let bestThirdsDistance = Number.POSITIVE_INFINITY;
let thirdsTicks = 0;
let activeTicks = 0;
let jerkTotal = 0;
let priorVelocityDelta = { x: 0, z: 0 };
let closeCallCount = 0;
let reelsCollected = 0;
const reelIds = new Set(state.entities.filter((entity) => entity.kind === 'reel').map((entity) => entity.id));
let pendingCloseCall = false;
let pendingCloseCallRank = Number.POSITIVE_INFINITY;
let resultSaved = false;
let paused = false;
let leftHanded = false;
let overcrankUsed = false;
let pointer: { id: number; x: number; y: number } | null = null;
const keys = new Set<string>();
let frameInput: InputFrame = { ...NEUTRAL_INPUT };
let sliderZoomTarget: number | null = null;
let pointerPan: Pick<InputFrame, 'panX' | 'panZ'> | null = null;
let zoomPulse = 0;
let rotationPulse: -1 | 0 | 1 = 0;
let simAccumulator = 0;
let previousTime = 0;
let frameSamples: number[] = [];

const shell = document.createElement('section');
shell.className = 'stage';
shell.innerHTML = `
  <header class="topbar"><div class="brand"><span class="rec-dot"></span><strong>CULL</strong><span class="tagline">CAMERA DEPARTMENT</span></div><details class="sound-settings" id="sound-settings"><summary>SOUND</summary><div class="sound-panel"><label>MASTER <input id="volume-master" aria-label="Master volume" type="range" min="0" max="100" value="100" /></label><label>MUSIC <input id="volume-music" aria-label="Music volume" type="range" min="0" max="100" value="80" /></label><label>EFFECTS <input id="volume-sfx" aria-label="Effects volume" type="range" min="0" max="100" value="80" /></label><label><input id="mono-audio" type="checkbox" /> MONO</label><label><input id="calm-audio" type="checkbox" /> CALM MIX</label></div></details><div class="readout"><a class="daily-link" href="?daily=1">DAILY</a><span>TAKE 01</span><b id="timecode">01:30</b><span id="lens">35 MM</span><button class="pause-button" id="pause" aria-label="Pause game">Ⅱ</button></div></header>
  <div class="composition"><aside class="margin margin-left"><div class="slate">SCENE 01<br><strong>BACKLOT</strong><small>SEED <span id="seed">00001</span></small><small id="best">BEST —</small></div><div class="hint"><span class="hint-mark">↖</span> WASD / DRAG<br>TO FRAME THE SHOT<div class="preview" id="preview"></div></div></aside>
    <div class="gate-wrap"><div class="gate-label"><span>VIEWFINDER · GATE 1:1</span><span id="lod">TALENT · CLOSE</span></div><div class="gate" id="gate"><div class="thirds"></div><div class="gate-corners"></div><div id="mount" class="mount"></div><div class="frame-message" id="message">KEEP THEM IN THE SHOT</div><div class="cut-flash" id="cut-flash"></div></div><div class="gate-foot"><span>55° · ORTHOGRAPHIC</span><span id="status">ROLLING</span></div></div>
    <aside class="margin margin-right"><div class="camera-mark">⌑<small>CAM 01</small></div><div class="call-sheet"><span>CALL SHEET</span><div id="call-sheet">SCANNING FRAME…</div></div></aside>
  </div>
  <footer class="controlbar"><div class="controls"><span><kbd>WASD</kbd> PAN</span><span><kbd>−</kbd> / <kbd>+</kbd> ZOOM</span><span><kbd>SPACE</kbd> HOLD</span><span><kbd>Q</kbd> / <kbd>E</kbd> ROTATE</span></div><div class="mobile-controls"><button id="hold" aria-label="Hold Talent">HOLD</button><label>ZOOM <input id="zoom-slider" aria-label="Zoom" type="range" min="10" max="48" value="30" /></label></div><div class="assist-controls"><button id="left-hand" type="button" aria-pressed="false">LEFT HAND</button><button id="overcrank" type="button" aria-pressed="false">75% SPEED</button></div><div class="film"><span>FILM</span><div class="film-track"><i id="filmbar"></i></div><b id="film">90 s</b></div></footer>
  <div class="end-card hidden" id="end-card"><div class="end-stamp">TAKE ENDED</div><h1 id="end-title">CUT</h1><p id="end-detail"></p><p id="share-card"></p><div id="grade-detail" class="grade-detail"></div><details class="grade-method"><summary>GRADE MATH</summary><p>Average of thirds time, smoothness (100 ÷ (1 + 8 × mean jerk)), close calls (10 points each, capped at 100), and Reel coverage. S ≥90 · A ≥75 · B ≥60 · otherwise C.</p></details><div class="end-actions"><a id="download-sheet" download>CONTACT SHEET ↓</a><button id="share">SHARE</button><a id="replay-link" target="_blank" rel="noreferrer">REPLAY ↗</a></div><details class="filmography"><summary>FILMOGRAPHY · LAST 5 TAKES</summary><ol id="filmography-list"></ol></details><button id="restart">NEW TAKE ↗</button></div>
`;
app.append(shell);
const $ = <T extends HTMLElement>(selector: string) => shell.querySelector<T>(selector)!;
try {
  if (replayData) overcrank = query.get('assist') === '75';
  else overcrank ||= window.localStorage.getItem('cull.overcrank') === 'true';
  leftHanded = window.localStorage.getItem('cull.leftHanded') === 'true';
} catch { /* Storage can be disabled in private browsing modes. */ }
let audioSettings: AudioSettings = audio.settings;
try {
  const saved = JSON.parse(window.localStorage.getItem('cull.audio.v1') ?? 'null') as Partial<AudioSettings> | null;
  if (saved) { audio.setSettings(saved); audioSettings = audio.settings; }
} catch { /* Keep the default mix when storage is unavailable or malformed. */ }
for (const [id, key] of [['volume-master', 'master'], ['volume-music', 'music'], ['volume-sfx', 'sfx']] as const) {
  const input = $(`#${id}`) as HTMLInputElement;
  input.value = String(Math.round(audioSettings[key] * 100));
  input.addEventListener('input', () => {
    audio.setSettings({ [key]: Number(input.value) / 100 });
    try { window.localStorage.setItem('cull.audio.v1', JSON.stringify(audio.settings)); } catch { /* Setting remains active for this visit. */ }
  });
}
for (const [id, key] of [['mono-audio', 'mono'], ['calm-audio', 'calm']] as const) {
  const input = $(`#${id}`) as HTMLInputElement;
  input.checked = audioSettings[key];
  input.addEventListener('change', () => {
    audio.setSettings({ [key]: input.checked });
    try { window.localStorage.setItem('cull.audio.v1', JSON.stringify(audio.settings)); } catch { /* Setting remains active for this visit. */ }
  });
}
overcrankUsed = overcrank;
shell.classList.toggle('left-handed', leftHanded);
$('#left-hand').setAttribute('aria-pressed', String(leftHanded));
$('#overcrank').setAttribute('aria-pressed', String(overcrank));
const mount = $('#mount');
$('#seed').textContent = String(state.seed).padStart(5, '0');

function locationFor(current: SimState) {
  return current.shoot?.biome ?? 'BACKLOT';
}
let displayedLocation = locationFor(state);
function refreshPersonalBest() {
  try {
    const best = personalBest(window.localStorage, locationFor(state));
    $('#best').textContent = best ? `BEST ${Math.floor(best.meters)} M` : 'BEST —';
  } catch { $('#best').textContent = 'BEST —'; }
}
refreshPersonalBest();

const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8e4da');
const camera = new THREE.OrthographicCamera(-15, 15, 15, -15, 0.1, 200);
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
const baseDpr = Math.min(window.devicePixelRatio, 1.25);
let dprTier = 0;
renderer.setPixelRatio(baseDpr * DPR_SCALES[dprTier]);
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
const castBounds = new CastBounds();
scene.add(castBounds.mesh);

const floorMaterial = new THREE.MeshLambertMaterial({ color: '#b9ad98' });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 30), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.12;
scene.add(floor);
const grid = new THREE.GridHelper(400, 80, '#8a7f6e', '#c6b9a3');
grid.position.y = -0.1;
scene.add(grid);
const path = new THREE.Mesh(new THREE.BoxGeometry(400, 0.05, 2), new THREE.MeshBasicMaterial({ color: '#d2c8b6' }));
path.position.y = 0.01;
scene.add(path);
const terrainGroup = new THREE.Group();
scene.add(terrainGroup);
let terrainTiles: SimState['tiles'] | null = null;
let renderedNightPalette = false;
function syncTerrain() {
  if (state.tiles === terrainTiles) return;
  terrainTiles = state.tiles;
  for (const child of [...terrainGroup.children]) {
    terrainGroup.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  }
  for (const kind of ['path', 'set'] as const) {
    const tiles = state.tiles.filter((tile) => tile.kind === kind);
    if (!tiles.length) continue;
    const isPath = kind === 'path';
    const mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(isPath ? 1 : 0.65, isPath ? 0.05 : 0.5, isPath ? 1 : 0.65),
      new THREE.MeshLambertMaterial({ color: isPath ? '#d2c8b6' : '#8d765b' }),
      tiles.length,
    );
    tiles.forEach((tile, index) => mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(tile.x, isPath ? -0.02 : 0.25, tile.z)));
    mesh.instanceMatrix.needsUpdate = true;
    terrainGroup.add(mesh);
  }
}

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
  } else if (kind === 'rumour') {
    material = new THREE.MeshLambertMaterial({ color: '#8a9290', transparent: true, opacity: 0.62, flatShading: true });
    group.add(new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 1), material));
  } else if (kind === 'monitor' || kind === 'red-monitor') {
    material = new THREE.MeshLambertMaterial({ color: kind === 'monitor' ? '#424a4a' : '#c72d29', flatShading: true });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 1.2, 5), material);
    pole.position.y = 0.6; group.add(pole);
    const lens = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.3), material);
    lens.position.set(0, 1.25, 0); group.add(lens);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.3, 4, 1, true), new THREE.MeshBasicMaterial({ color: kind === 'monitor' ? '#43c9d8' : '#e43b33', transparent: true, opacity: 0.22, wireframe: true }));
    cone.name = 'monitor-cone'; cone.position.set(0, 0.6, 1.2); group.add(cone);
  } else if (kind === 'continuity') {
    const propKind = entity.propSequence?.[entity.propIndex ?? 0] ?? entity.propIndex ?? 0;
    material = new THREE.MeshLambertMaterial({ color: ['#aa7651', '#b43a31', '#9e8a72', '#745b40'][propKind % 4], flatShading: true });
    group.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 1), material));
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
    if (entity.kind === 'rumour') object.scale.setScalar(Math.max(0.1, entity.radius ?? 0.5));
    if (entity.kind === 'monitor' || entity.kind === 'red-monitor') {
      object.rotation.y = -(entity.heading ?? 0) + Math.PI / 2;
      const cone = object.getObjectByName('monitor-cone');
      if (cone) cone.scale.set(1, 1, Math.min(2, (entity.range ?? 18) / 14));
    }
    if (entity.kind === 'continuity') {
      const mesh = object.children.find((child): child is THREE.Mesh => child instanceof THREE.Mesh);
      const propKind = entity.propSequence?.[entity.propIndex ?? 0] ?? entity.propIndex ?? 0;
      if (mesh?.material instanceof THREE.MeshLambertMaterial) mesh.material.color.set(['#aa7651', '#b43a31', '#9e8a72', '#745b40'][propKind % 4]!);
      object.scale.set(1 + (propKind % 2) * 0.25, 1, 1);
    }
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
    if (!found || found.cut || !found.spawned) object.visible = false;
  }
  urchinBuckets.update(state.entities, state.camera.zoom, state.tick, !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

function syncCamera() {
  updateRenderCamera(camera, state.camera);
}
function captureContactFrame() {
  if (state.tick === 0) return;
  const thirds = thirdsDistance(state.talent.x, state.talent.z, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw);
  const isBestThirds = thirds < bestThirdsDistance;
  if (isBestThirds) bestThirdsDistance = thirds;
  const sampled = state.tick === 1 || state.tick % 300 === 0 || state.failed !== null || pendingCloseCall || isBestThirds;
  if (!sampled || state.tick === lastContactTick) return;
  const frame = document.createElement('canvas');
  frame.width = 180; frame.height = 180;
  const context = frame.getContext('2d');
  if (!context) return;
  context.drawImage(renderer.domElement, 0, 0, frame.width, frame.height);
  const label = state.tick === 1 ? 'Opening' : state.failed ? 'Final frame' : pendingCloseCall ? 'Close call' : isBestThirds ? 'Thirds' : `Take · ${Math.floor(state.totalDistance)} m`;
  const candidate = { image: frame, label, tick: state.tick, rank: pendingCloseCall ? pendingCloseCallRank : thirds };
  if (state.tick === 1) contactFrames.unshift(candidate);
  else if (pendingCloseCall) {
    closeCallFrames.push(candidate);
    closeCallFrames.sort((a, b) => a.rank - b.rank);
    closeCallFrames.splice(3);
  } else if (isBestThirds) {
    const existing = contactFrames.findIndex((item) => item.label === 'Thirds');
    if (existing >= 0) contactFrames.splice(existing, 1);
    contactFrames.push({ ...candidate, label: 'Best thirds' });
  } else if (state.failed) contactFrames.push({ ...candidate, label: 'Fatal frame' });
  else {
    contactFrames.push(candidate);
    const samples = contactFrames.filter((item) => item.label.startsWith('Take'));
    if (samples.length > 10) contactFrames.splice(contactFrames.indexOf(samples[0]!), 1);
  }
  pendingCloseCall = false;
  pendingCloseCallRank = Number.POSITIVE_INFINITY;
  lastContactTick = state.tick;
}
function saveRunSummary() {
  if (!state.failed || resultSaved) return;
  resultSaved = true;
  const metrics = {
    thirdsPercent: activeTicks ? Math.round(thirdsTicks / activeTicks * 100) : 0,
    smoothness: smoothnessFromMeanJerk(activeTicks ? jerkTotal / activeTicks : 0),
    closeCalls: closeCallCount,
    reelsCollected,
    reelsAvailable: reelIds.size,
  };
  const grade = gradeMetrics(metrics);
  const entry = {
    date: utcDate, seed: state.seed, location: locationFor(state), meters: Math.floor(state.totalDistance),
    cuts: state.cuts.length, score: state.score, cause: state.failed, grade, ...metrics,
  };
  try { recordResult(window.localStorage, entry); } catch { /* Local storage may be disabled by the browser. */ }
  refreshPersonalBest();
  const sheetFrames: ScoredFrame[] = [];
  const addFrame = (frame: ScoredFrame | undefined) => { if (frame && !sheetFrames.includes(frame) && sheetFrames.length < 9) sheetFrames.push(frame); };
  addFrame(contactFrames.find((frame) => frame.label === 'Opening'));
  closeCallFrames.forEach(addFrame);
  addFrame(contactFrames.find((frame) => frame.label === 'Best thirds'));
  addFrame(contactFrames.find((frame) => frame.label === 'Fatal frame'));
  const samples = contactFrames.filter((frame) => frame.label.startsWith('Take'));
  for (const index of [0, Math.floor(samples.length / 2), samples.length - 1]) addFrame(samples[index]);
  for (const frame of contactFrames) addFrame(frame);
  const sheet = makeContactSheet(sheetFrames);
  const download = $('#download-sheet') as HTMLAnchorElement;
  download.href = sheet.toDataURL('image/png');
  download.download = `cull-${state.seed}.png`;
  const shareCard = `CULL #${state.seed} · ${entry.location} · ${entry.meters} m · ✂ ${entry.cuts} cuts · ${entry.score} pts · ${grade} grade${overcrankUsed ? ' · 75% SPEED ASSIST' : ''}`;
  $('#share-card').textContent = shareCard;
  $('#grade-detail').textContent = `GRADE ${grade} · THIRDS ${metrics.thirdsPercent}% · SMOOTH ${Math.round(metrics.smoothness)} · CLOSE CALLS ${metrics.closeCalls} · REELS ${metrics.reelsCollected}/${metrics.reelsAvailable}`;
  const historyList = $('#filmography-list');
  try {
    const history = loadFilmography(window.localStorage).slice(0, 5);
    historyList.replaceChildren(...history.map((run) => {
      const item = document.createElement('li');
      item.textContent = `${run.date} · ${run.location} · ${Math.floor(run.meters)} m · ${run.grade ?? '—'} · ${run.cause}`;
      return item;
    }));
  } catch { historyList.replaceChildren(); }
  const replay = new URL(location.href);
  replay.searchParams.delete('frozen');
  if (overcrankUsed) replay.searchParams.set('assist', '75');
  replay.hash = encodeReplay(state.seed, inputLog);
  const replayLink = $('#replay-link') as HTMLAnchorElement;
  replayLink.href = replay.toString();
}
function render() {
  audio.update(state);
  const nightPalette = state.shoot?.sceneIndex === 2;
  if (nightPalette !== renderedNightPalette) {
    renderedNightPalette = nightPalette;
    scene.background = new THREE.Color(nightPalette ? '#17191d' : '#e8e4da');
    floorMaterial.color.set(nightPalette ? '#363238' : '#b9ad98');
    keyLight.intensity = nightPalette ? 0.42 : 1.2;
  }
  syncCamera();
  syncTerrain();
  syncTalentLod();
  talent.position.set(state.talent.x, 0, state.talent.z);
  syncEntities();
  castBounds.update(state.entities);
  renderer.render(scene, camera);
  captureContactFrame();
  updateHud();
}
function updateHud() {
  if (state.shoot) $('.slate').innerHTML = `SCENE 0${Math.min(state.shoot.sceneIndex + 1, 3)}<br><strong>${state.shoot.biome}</strong><small>SEED <span>${String(state.seed).padStart(5, '0')}</span></small><small id="best">BEST —</small>`;
  if (locationFor(state) !== displayedLocation) { displayedLocation = locationFor(state); refreshPersonalBest(); }
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
  if (invalidReplay) $('#message').textContent = 'INVALID REPLAY URL';
  if (sliderZoomTarget !== null && Math.abs(sliderZoomTarget - state.camera.zoom) < 0.12) sliderZoomTarget = null;
  ($('#zoom-slider') as HTMLInputElement).value = String(Math.round(sliderZoomTarget ?? state.camera.zoom));
  $('#call-sheet').textContent = state.entities.filter((entity) => !entity.spawned && !entity.cut && Math.abs(entity.x - state.camera.x) < state.camera.zoom * (0.5 + TUNING.callSheetMargin)).map((entity) => `${entity.kind.toUpperCase()} · PREVIEW`).join(' / ') || 'NO CAST IN FRAME';
  const filmBar = shell.querySelector<HTMLElement>('.film-track')!;
  filmBar.style.setProperty('--remaining', `${Math.max(0, state.film / 90 * 100)}%`);
  if (state.failed) {
    $('#message').textContent = 'THAT’S A WRAP';
    $('#end-title').textContent = state.failed.toUpperCase().replaceAll('-', ' ');
    $('#end-detail').textContent = `TAKE ${String(state.seed).padStart(5, '0')} · ${Math.floor(state.talent.x)} METRES · ${state.cuts.length} CUT`;
    $('#end-card').classList.remove('hidden');
    saveRunSummary();
  }
}

function buildInput(): InputFrame {
  const keyInput = panFromKeys();
  const sliderZoom = sliderZoomTarget === null ? 0 : Math.abs(sliderZoomTarget - state.camera.zoom) < 0.12 ? 0 : sliderZoomTarget > state.camera.zoom ? -127 : 127;
  return quantizeInput({
    ...frameInput, ...keyInput,
    panX: pointerPan?.panX ?? (keys.size ? keyInput.panX : frameInput.panX),
    panZ: pointerPan?.panZ ?? (keys.size ? keyInput.panZ : frameInput.panZ),
    zoom: keyInput.zoom || zoomPulse || sliderZoom || frameInput.zoom,
    rotate: rotationPulse || frameInput.rotate,
    hold: keyInput.hold || frameInput.hold,
    steady: keyInput.steady || frameInput.steady,
  });
}
function quantizeInput(input: InputFrame): InputFrame {
  const axis = (value: number) => Math.max(-127, Math.min(127, Math.round(value)));
  return { panX: axis(input.panX), panZ: axis(input.panZ), zoom: axis(input.zoom), rotate: input.rotate, hold: Boolean(input.hold), steady: Boolean(input.steady) };
}
function advanceTick() {
  if (!paused && !state.failed) {
    const input = replayData ? replayData.frames[replayIndex++] ?? NEUTRAL_INPUT : bot ? inputForBot(state, bot, botRandom) : buildInput();
    inputLog.push(input);
    const previousCuts = state.cuts.length;
    const previousSpawned = state.entities.filter((entity) => entity.spawned && !entity.cut).length;
    const previousWrap = state.shoot?.wrapCaught ?? false;
    const previousScore = state.score;
    const previousTalent = { x: state.talent.x, z: state.talent.z };
    const previousEntities = state.entities.map((entity) => ({ id: entity.id, kind: entity.kind, x: entity.x, z: entity.z, cut: entity.cut }));
    const previousCameraVelocity = { x: state.camera.vx, z: state.camera.vz };
    const previousTalentTier = state.talent.lodTier;
    const previousEntityTiers = new Map(state.entities.map((entity) => [entity.id, entity.lodTier]));
    state = state.shoot ? stepShoot(state, input) : step(state, input);
    const velocityDelta = { x: state.camera.vx - previousCameraVelocity.x, z: state.camera.vz - previousCameraVelocity.z };
    jerkTotal += Math.hypot(velocityDelta.x - priorVelocityDelta.x, velocityDelta.z - priorVelocityDelta.z);
    priorVelocityDelta = velocityDelta;
    activeTicks++;
    if (thirdsDistance(state.talent.x, state.talent.z, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw) <= 0.1) thirdsTicks++;
    state.entities.filter((entity) => entity.kind === 'reel').forEach((entity) => reelIds.add(entity.id));
    const newlyCut = previousEntities.filter((before) => !before.cut && state.entities.find((after) => after.id === before.id)?.cut);
    if (state.score > previousScore) {
      const collected = newlyCut.find((entity) => entity.kind === 'reel');
      if (collected) reelsCollected++;
    }
    for (const entity of newlyCut) {
      if (['reel', 'monitor', 'red-monitor', 'continuity'].includes(entity.kind)) continue;
      if (Math.hypot(entity.x - previousTalent.x, entity.z - previousTalent.z) <= 1.5) {
        closeCallCount++;
        pendingCloseCall = true;
        pendingCloseCallRank = Math.min(pendingCloseCallRank, Math.hypot(entity.x - previousTalent.x, entity.z - previousTalent.z));
      }
    }
    if (state.score > previousScore) audio.playCue('reel');
    else if (state.cuts.length > previousCuts) audio.playCue('cut');
    else if (state.entities.filter((entity) => entity.spawned && !entity.cut).length > previousSpawned) audio.playCue('pop');
    else if (state.talent.lodTier !== previousTalentTier || state.entities.some((entity) => entity.lodTier !== previousEntityTiers.get(entity.id))) audio.playCue('lod');
    if (!previousWrap && state.shoot?.wrapCaught) audio.playCue('wrap');
  }
  audio.update(state);
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
  const frameTime = now - previousTime;
  if (frameTime > 0 && !document.hidden) frameSamples.push(frameTime);
  if (frameSamples.length >= 60) {
    const nextTier = nextDprTier(dprTier, frameSamples.slice(-60));
    frameSamples = [];
    if (nextTier > dprTier) {
      dprTier = nextTier;
      renderer.setPixelRatio(baseDpr * DPR_SCALES[dprTier]);
      const rect = mount.getBoundingClientRect();
      const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
      renderer.setSize(size, size, true);
    }
  }
  simAccumulator += Math.min(frameTime / 1000, 0.1);
  previousTime = now;
  let ticks = 0;
  const tickInterval = 1 / (TUNING.tickRate * (overcrank ? 0.75 : 1));
  while (simAccumulator >= tickInterval && ticks < TUNING.maxCatchupTicks) {
    stepFrame(); simAccumulator -= tickInterval; ticks++;
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
  unlockAudio();
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
  keys.add(event.key.toLowerCase());
  if (!event.repeat && event.key.toLowerCase() === 'q') rotationPulse = -1;
  if (!event.repeat && event.key.toLowerCase() === 'e') rotationPulse = 1;
  if (event.key === 'Escape' || event.key.toLowerCase() === 'p') paused = !paused;
});
window.addEventListener('keyup', (event) => { keys.delete(event.key.toLowerCase()); });
renderer.domElement.addEventListener('pointerdown', (event) => {
  unlockAudio();
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
$('#zoom-slider').addEventListener('input', (event) => { sliderZoomTarget = Number((event.currentTarget as HTMLInputElement).value); });
$('#pause').addEventListener('click', () => { paused = !paused; });
$('#restart').addEventListener('click', () => { const nextSeed = state.seed + 1; replayData = undefined; invalidReplay = false; state = createTake(nextSeed); botRandom = mulberry32((nextSeed ^ 0xb07b07) >>> 0); inputLog = []; replayIndex = 0; contactFrames.length = 0; closeCallFrames.length = 0; lastContactTick = 0; bestThirdsDistance = Number.POSITIVE_INFINITY; thirdsTicks = 0; activeTicks = 0; jerkTotal = 0; priorVelocityDelta = { x: 0, z: 0 }; closeCallCount = 0; reelsCollected = 0; reelIds.clear(); state.entities.filter((entity) => entity.kind === 'reel').forEach((entity) => reelIds.add(entity.id)); pendingCloseCall = false; pendingCloseCallRank = Number.POSITIVE_INFINITY; sliderZoomTarget = null; frameInput = { ...NEUTRAL_INPUT }; resultSaved = false; displayedLocation = locationFor(state); refreshPersonalBest(); entityMeshes.clear(); urchinBuckets.reset(); for (const child of [...scene.children]) if (child instanceof THREE.Group && child !== talent && child !== terrainGroup) scene.remove(child); terrainTiles = null; $('#end-card').classList.add('hidden'); });
$('#left-hand').addEventListener('click', () => {
  leftHanded = !leftHanded;
  shell.classList.toggle('left-handed', leftHanded);
  $('#left-hand').setAttribute('aria-pressed', String(leftHanded));
  try { window.localStorage.setItem('cull.leftHanded', String(leftHanded)); } catch { /* Settings remain available for this take. */ }
});
$('#overcrank').addEventListener('click', () => {
  overcrank = !overcrank;
  if (overcrank) overcrankUsed = true;
  $('#overcrank').setAttribute('aria-pressed', String(overcrank));
  try { window.localStorage.setItem('cull.overcrank', String(overcrank)); } catch { /* Settings remain available for this take. */ }
});
$('#share').addEventListener('click', async () => {
  const title = $('#share-card').textContent ?? `CULL #${state.seed}`;
  try {
    if (navigator.share) await navigator.share({ title: 'CULL Contact Sheet', text: title, url: ($('#replay-link') as HTMLAnchorElement).href });
    else await navigator.clipboard.writeText(`${title}\n${($('#replay-link') as HTMLAnchorElement).href}`);
  } catch { /* The user may dismiss the native share sheet. */ }
});

if (query.has('debug')) {
  Object.assign(window, { __cull: { step: (n = 1) => { for (let i = 0; i < n; i++) advanceTick(); render(); }, input: (input: InputFrame) => { frameInput = input; }, hash: () => stateHash(state), state: () => structuredClone(state), diagnostics: () => ({ paused, keys: [...keys], hidden: document.hidden, focused: document.hasFocus(), dprTier, pointerPan: pointerPan && { ...pointerPan } }), performance: () => ({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }), lod: () => urchinBuckets.diagnostics(), load: (seed: number) => { state = createGeneratedState(seed); terrainTiles = null; urchinBuckets.reset(); }, loadShootScene: (sceneIndex: number) => { state = createShootSceneState(state.seed, sceneIndex); terrainTiles = null; urchinBuckets.reset(); render(); }, finishForShare: () => { state.failed = 'hit'; render(); }, loadLodDemo: () => { state = createGeneratedState(1, 0, 2); state.entities = [{ id: 'lod-demo-urchin', kind: 'urchin', x: 0, z: 2, vx: 0, vz: 0, spawned: true, cut: false, age: 0 }]; state.talent.x = -4; render(); }, setTier: (tier: number) => { const size = [64, 36, 17, 7, 2][tier] ?? 36; state.camera.zoom = TUNING.urchinRadius * 1000 / size; }, setCamera: (x: number, z: number, zoom: number) => { state.camera.x = x; state.camera.z = z; state.camera.zoom = zoom; } } });
}

new ResizeObserver(() => {
  const rect = mount.getBoundingClientRect();
  const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
  renderer.setSize(size, size, true);
  render();
}).observe(mount);
render();
if (!frozen) requestAnimationFrame(loop);
