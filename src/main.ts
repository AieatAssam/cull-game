import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import './style.css';
import { stateHash } from './sim/hash';
import { updateRenderCamera } from './render/camera';
import { cameraBasis, inFrame, projectPoint } from './sim/frame';
import { NEUTRAL_INPUT, step } from './sim/step';
import { lodTier } from './sim/lod';
import { TUNING } from './sim/tuning';
import { createGeneratedState, createState } from './sim/world';
import { createValidatedState } from './gen/validated';
import { createShootState, createShootSceneState, stepShoot } from './sim/shoot';
import { inputForBot, type BotKind } from './bots/players';
import { mulberry32 } from './sim/rng';
import { UrchinLodBuckets } from './render/lod-buckets';
import { createDailiesCast, SCENE_LOOKS } from './render/dailies';
import { measureSilhouettes } from './render/silhouettes';
import { PATH_RISE, SPRITE_SIZE, bevelledBlockGeometry, createTableTextures, raisedPathGeometry } from './render/set-dressing';
import { DPR_SCALES, nextDprTier } from './render/adaptive-dpr';
import { AudioDirector, type AudioSettings } from './audio/director';
import { dailySeed } from './meta/daily';
import { loadFilmography, personalBest, recordResult } from './meta/filmography';
import { gradeMetrics, smoothnessFromMeanJerk, thirdsDistance } from './meta/grade';
import { decodeReplay, encodeReplay } from './replay/codec';
import { selectReplayContactFrames } from './replay/contact-frames';
import { makeContactSheet, type ContactFrame } from './ui/contact-sheet';
import { filmStocks, loadFilmStock, saveFilmStock, unlockedFilmStocks, type FilmStock } from './meta/film-stock';
import { lensFeats, unlockedLenses } from './meta/lenses';
import { monitorConeContains } from './sim/m6';
import { lensAspect, lensLodFactor, lensRenderTicks, type LensId } from './sim/lenses';
import type { CastEntity, InputFrame, SimState } from './sim/types';

const spriteAssets = createDailiesCast();

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
let dailyRun = daily && seed === dailySeed(utcDate);
const botName = query.get('bot');
const bot = (['tracker', 'wide', 'close', 'adaptive', 'chaos'] as string[]).includes(botName ?? '') ? botName as BotKind : undefined;
const createTake = (takeSeed: number) => query.has('roster') ? createState(takeSeed) : query.has('validated') ? createValidatedState(takeSeed) : query.has('scene') && !query.has('shoot') ? createGeneratedState(takeSeed) : createShootState(takeSeed);
function initialLens(): LensId {
  if (replayData) return replayData.lens;
  let requested = query.get('lens');
  try {
    requested ??= window.localStorage.getItem('cull.lens.v1');
    const unlocked = unlockedLenses(loadFilmography(window.localStorage));
    return requested && unlocked.includes(requested as LensId) ? requested as LensId : '35mm';
  } catch { return '35mm'; }
}
let pendingLens = initialLens();
let botRandom = mulberry32((seed ^ 0xb07b07) >>> 0);
let state: SimState = createTake(seed);
state.lens = pendingLens;
if (state.lens === 'long-lens') state.camera.zoom = TUNING.minZoom;
let replayIndex = 0;
let inputLog: InputFrame[] = [];
interface ScoredFrame extends ContactFrame { tick: number; rank: number; }
const contactFrames: ScoredFrame[] = [];
const closeCallFrames: ScoredFrame[] = [];
let directorReelFrames: CanvasImageSource[] = [];
let directorReelUrl: string | null = null;
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
let monitorUses = 0;
let monitorWasActive = false;
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
let hitStopUntil = 0;
let coachStarted = 0;

const shell = document.createElement('section');
shell.className = 'stage';
shell.innerHTML = `
  <header class="topbar"><div class="brand"><span class="rec-dot"></span><strong>CULL</strong><span class="tagline">CAMERA DEPARTMENT</span></div><label class="stock-control">STOCK <select id="film-stock" aria-label="Film stock"><option value="clean">35 MM · CLEAN</option><option value="kodachrome">KODACHROME · B</option><option value="bleach">BLEACH BYPASS · A</option><option value="ilford">ILFORD B&W · S</option></select></label><details class="sound-settings" id="sound-settings"><summary>SOUND</summary><div class="sound-panel"><label>MASTER <input id="volume-master" aria-label="Master volume" type="range" min="0" max="100" value="100" /></label><label>MUSIC <input id="volume-music" aria-label="Music volume" type="range" min="0" max="100" value="80" /></label><label>EFFECTS <input id="volume-sfx" aria-label="Effects volume" type="range" min="0" max="100" value="80" /></label><label><input id="mono-audio" type="checkbox" /> MONO</label><label><input id="calm-audio" type="checkbox" /> CALM MIX</label></div></details><div class="readout"><a class="daily-link" href="?daily=1">DAILY</a><span>TAKE 01</span><b id="timecode">01:30</b><span id="lens">35 MM</span><button class="pause-button" id="pause" aria-label="Pause game">Ⅱ</button></div></header>
  <div class="composition"><aside class="margin margin-left"><div class="slate">SCENE 01<br><strong>BACKLOT</strong><small>SEED <span id="seed">00001</span></small><small id="best">BEST —</small></div><div class="hint"><span class="hint-mark">↖</span> WASD / DRAG<br>TO FRAME THE SHOT<div class="preview" id="preview"></div></div></aside>
    <div class="gate-wrap"><div class="gate-label"><span id="gate-ratio">VIEWFINDER · GATE 1:1</span><span id="lod">SHE IS IN A MEDIUM SHOT</span></div><div class="gate" id="gate"><div class="thirds"></div><div class="focus-band" id="focus-band" hidden></div><div class="gate-corners"></div><div class="sprockets left"></div><div class="sprockets right"></div><div id="mount" class="mount"></div><div class="frame-message" id="message">Keep her in the shot.</div><p class="coach hidden" id="coach"></p><div class="title-card hidden" id="title-card"><p class="title-kicker">SCENE 01 · TAKE 01</p><h1>CULL</h1><p>Nothing exists unless it is in the shot. You hold the camera. She walks.</p></div><div class="cut-flash" id="cut-flash"></div><div class="slice" id="slice"></div><div class="peel" id="peel"></div><div class="cut-stamp" id="cut-stamp">CUT</div><i class="spark" style="--dx:-18px;--dy:-24px;left:70%;top:40%"></i><i class="spark" style="--dx:16px;--dy:-20px;left:72%;top:46%"></i><i class="spark" style="--dx:8px;--dy:18px;left:68%;top:50%"></i><i class="spark" style="--dx:-22px;--dy:8px;left:74%;top:42%"></i></div><div class="gate-foot"><span>55° TABLETOP</span><span id="status">ROLLING</span></div></div>
    <aside class="margin margin-right"><div class="camera-mark">Slate<small>CAM 01</small></div><div class="call-sheet"><span>CALL SHEET</span><div id="call-sheet">Looking outside the frame…</div></div></aside>
  </div>
  <footer class="controlbar"><div class="controls"><span><kbd>WASD</kbd> PAN</span><span><kbd>−</kbd> / <kbd>+</kbd> ZOOM</span><span><kbd>SPACE</kbd> HOLD</span><span><kbd>Q</kbd> / <kbd>E</kbd> ROTATE</span></div><div class="mobile-controls"><button id="hold" aria-label="Hold Talent">HOLD</button><label>ZOOM <input id="zoom-slider" aria-label="Zoom" type="range" min="10" max="48" value="30" /></label></div><div class="assist-controls"><button id="left-hand" type="button" aria-pressed="false">LEFT HAND</button><button id="overcrank" type="button" aria-pressed="false">75% SPEED</button></div><div class="film"><span>FILM</span><div class="film-track"><i id="filmbar"></i></div><b id="film">90s</b></div></footer>
  <div class="end-card hidden" id="end-card"><div class="end-stamp">TAKE ENDED</div><h1 id="end-title">CUT</h1><p id="end-detail"></p><p id="share-card"></p><div id="grade-detail" class="grade-detail"></div><details class="grade-method"><summary>How the grade works</summary><p>The grade averages four things: how often she sits on a thirds mark, how smooth the camera was, close cuts (10 points each, up to 100), and how many film reels you kept. S is 90 or above, A is 75, B is 60, and the rest is C.</p></details><details class="lens-feats"><summary>LENS FEATS</summary><ul id="lens-feat-list"></ul></details><label class="next-lens">NEXT TAKE LENS <select id="lens-select" aria-label="Lens for next take"></select></label><div class="end-actions"><a id="download-sheet" download>CONTACT SHEET ↓</a><button id="make-reel">DIRECTOR'S REEL</button><a id="download-reel" class="hidden" download>WEBM ↓</a><button id="share">SHARE</button><a id="replay-link" target="_blank" rel="noreferrer">REPLAY ↗</a></div><details class="filmography"><summary>FILMOGRAPHY · LAST 5 TAKES</summary><ol id="filmography-list"></ol></details><button id="restart">NEW TAKE ↗</button></div>
`;
app.append(shell);
const $ = <T extends HTMLElement>(selector: string) => shell.querySelector<T>(selector)!;
const stockFilters: Record<FilmStock, string> = {
  clean: 'none', kodachrome: 'sepia(.18) saturate(1.32) contrast(1.06)',
  bleach: 'saturate(.68) contrast(1.3) brightness(1.03)', ilford: 'grayscale(1) contrast(1.15)',
};
let currentStock: FilmStock = 'clean';
function refreshFilmStocks() {
  let entries: ReturnType<typeof loadFilmography> = [];
  try { entries = loadFilmography(window.localStorage); } catch { /* Keep the clean stock when storage is unavailable. */ }
  const unlocked = unlockedFilmStocks(entries);
  const select = $('#film-stock') as HTMLSelectElement;
  for (const option of [...select.options]) {
    if (option.value === 'clean') continue;
    option.disabled = !unlocked.includes(option.value as FilmStock);
    const stock = filmStocks.find((item) => item.id === option.value);
    if (stock) option.textContent = `${stock.label} · ${stock.minimum}${option.disabled ? ' · LOCKED' : ''}`;
  }
  currentStock = loadFilmStock(window.localStorage, entries);
  select.value = currentStock;
  renderer.domElement.style.filter = stockFilters[currentStock];
}
function refreshLensSelector() {
  let entries: ReturnType<typeof loadFilmography> = [];
  try { entries = loadFilmography(window.localStorage); } catch { /* Keep only the default lens available. */ }
  const unlocked = new Set(unlockedLenses(entries));
  const select = $('#lens-select') as HTMLSelectElement;
  const options = [Object.assign(document.createElement('option'), { value: '35mm', textContent: '35 MM · STANDARD' }),
    ...lensFeats.map((feat) => Object.assign(document.createElement('option'), { value: feat.id, textContent: `${feat.name}${unlocked.has(feat.id) ? '' : ' · LOCKED'}`, disabled: !unlocked.has(feat.id) }))];
  select.replaceChildren(...options);
  if (!unlocked.has(pendingLens)) pendingLens = '35mm';
  select.value = pendingLens;
  select.disabled = !state.failed;
}
$('#lens-select').addEventListener('change', () => {
  pendingLens = ($('#lens-select') as HTMLSelectElement).value as LensId;
  try { window.localStorage.setItem('cull.lens.v1', pendingLens); } catch { /* Lens remains selected for the next take in this page. */ }
});
$('#film-stock').addEventListener('change', () => {
  const selected = ($('#film-stock') as HTMLSelectElement).value as FilmStock;
  try {
    const entries = loadFilmography(window.localStorage);
    saveFilmStock(window.localStorage, selected, entries);
    currentStock = selected;
    renderer.domElement.style.filter = stockFilters[currentStock];
  } catch { refreshFilmStocks(); }
});
const directorReelMimeType = typeof MediaRecorder === 'undefined' ? undefined
  : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find((candidate) => MediaRecorder.isTypeSupported(candidate));
$('#make-reel').hidden = !directorReelMimeType || typeof HTMLCanvasElement.prototype.captureStream !== 'function';
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
    const best = personalBest(window.localStorage, locationFor(state), state.lens);
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
refreshFilmStocks();
refreshLensSelector();
const hemi = new THREE.HemisphereLight('#fff1dc', '#8d6b4a', 0.7);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight('#ffd9a0', 1.85);
keyLight.position.set(-14, 18, 6);
scene.add(keyLight);
const urchinBuckets = new UrchinLodBuckets(scene, spriteAssets.urchinTiers);
function displayPoint(x: number, z: number) {
  if (state.lens !== 'fisheye') return { x, z };
  const basis = cameraBasis(state.camera.yaw);
  const dx = x - state.camera.x; const dz = z - state.camera.z;
  const width = state.camera.zoom * lensAspect(state.lens);
  const localX = dx * basis.cos - dz * basis.sin;
  const wrappedX = ((localX + width / 2) % width + width) % width - width / 2;
  const shift = wrappedX - localX;
  return { x: x + basis.cos * shift, z: z - basis.sin * shift };
}
function detailFactor(x: number, z: number) {
  const projected = projectPoint(x, z, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw);
  return lensLodFactor(state.lens, projected.x, projected.y);
}
const tableTextures = createTableTextures();
const floorMaterial = new THREE.MeshLambertMaterial({ map: tableTextures.cork, color: '#c9a46b', emissive: '#000000' });
const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 30), floorMaterial);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.12;
scene.add(floor);
const pathMaterial = new THREE.MeshLambertMaterial({ map: tableTextures.felt, color: '#3f6b4f' });
const path = new THREE.Mesh(new THREE.BoxGeometry(400, PATH_RISE, 2.4), pathMaterial);
path.position.y = PATH_RISE / 2;
scene.add(path);
const terrainGroup = new THREE.Group();
scene.add(terrainGroup);
let terrainTiles: SimState['tiles'] | null = null;
let renderedLook = -1;
function sceneLookIndex() {
  return state.shoot?.sceneIndex ?? 0;
}
function syncTerrain() {
  const lookIndex = sceneLookIndex();
  if (state.tiles === terrainTiles && lookIndex === renderedLook) return;
  terrainTiles = state.tiles;
  renderedLook = lookIndex;
  const look = SCENE_LOOKS[Math.min(lookIndex, SCENE_LOOKS.length - 1)]!;
  const dress = new THREE.Object3D();
  for (const child of [...terrainGroup.children]) {
    terrainGroup.remove(child);
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
  }
  const pathTiles = state.tiles.filter((tile) => tile.kind === 'path');
  const setTiles = state.tiles.filter((tile) => tile.kind === 'set');
  if (pathTiles.length) {
    const mesh = new THREE.Mesh(
      raisedPathGeometry(pathTiles),
      new THREE.MeshLambertMaterial({
        map: tableTextures.felt, color: look.path, vertexColors: true, side: THREE.DoubleSide,
        emissive: lookIndex === 2 ? '#3a2a16' : '#000000',
      }),
    );
    mesh.name = 'felt-path';
    terrainGroup.add(mesh);
  }
  if (setTiles.length) {
    const mesh = new THREE.InstancedMesh(
      bevelledBlockGeometry(),
      new THREE.MeshLambertMaterial({ map: tableTextures.cardboard, color: look.block, vertexColors: true, side: THREE.DoubleSide }),
      setTiles.length,
    );
    setTiles.forEach((tile, index) => mesh.setMatrixAt(index, new THREE.Matrix4().makeTranslation(tile.x, 0, tile.z)));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.name = 'cardboard-flats';
    terrainGroup.add(mesh);
    const shades = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: tableTextures.shadow, transparent: true, depthWrite: false }),
      setTiles.length,
    );
    setTiles.forEach((tile, index) => {
      dress.position.set(tile.x, 0.02, tile.z);
      dress.rotation.set(-Math.PI / 2, 0, 0);
      dress.scale.set(1.35, 1.15, 1);
      dress.updateMatrix();
      shades.setMatrixAt(index, dress.matrix);
    });
    shades.instanceMatrix.needsUpdate = true;
    shades.renderOrder = 2;
    terrainGroup.add(shades);
  }
  const lampSpots = lookIndex === 2
    ? pathTiles.filter((tile, index, all) => all.findIndex((other) => Math.abs(other.x - tile.x) < 9) === index)
    : [];
  if (lampSpots.length) {
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: tableTextures.pool, color: '#ffb347', transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      blending: THREE.AdditiveBlending,
    }), lampSpots.length);
    const posts = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.18, 2.2, 0.18),
      new THREE.MeshLambertMaterial({ color: '#1e1a17' }),
      lampSpots.length,
    );
    const heads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.78, 0.22, 0.78),
      new THREE.MeshBasicMaterial({ color: '#ffb347' }),
      lampSpots.length,
    );
    lampSpots.forEach((tile, index) => {
      dress.position.set(tile.x, PATH_RISE + 0.08, tile.z);
      dress.rotation.set(-Math.PI / 2, 0, 0);
      dress.scale.set(12, 12, 1);
      dress.updateMatrix();
      pools.setMatrixAt(index, dress.matrix);
      dress.position.set(tile.x, 1.1, tile.z + 1.7);
      dress.rotation.set(0, 0, 0);
      dress.scale.set(1, 1, 1);
      dress.updateMatrix();
      posts.setMatrixAt(index, dress.matrix);
      dress.position.set(tile.x, 2.24, tile.z + 1.7);
      dress.updateMatrix();
      heads.setMatrixAt(index, dress.matrix);
    });
    pools.instanceMatrix.needsUpdate = true;
    posts.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
    pools.renderOrder = 2;
    terrainGroup.add(pools);
    terrainGroup.add(posts);
    terrainGroup.add(heads);
  }
}

const castShadows = new THREE.InstancedMesh(
  new THREE.PlaneGeometry(1, 1),
  new THREE.MeshBasicMaterial({ map: tableTextures.shadow, transparent: true, depthWrite: false }),
  512,
);
castShadows.frustumCulled = false;
castShadows.renderOrder = 2;
scene.add(castShadows);
const talent = new THREE.Group();
const talentSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteAssets.walk[0], transparent: true, alphaTest: 0.04, depthWrite: false }));
talentSprite.center.set(0.5, 0);
talentSprite.scale.set(2.3, 3.5, 1);
talent.add(talentSprite);
scene.add(talent);
let renderedTalentTier = -1;
function syncTalentLod() {
  const tier = state.talent.lodTier ?? Math.min(lodTier(1000 / state.camera.zoom * detailFactor(state.talent.x, state.talent.z)), 3);
  if (tier !== renderedTalentTier) {
    renderedTalentTier = tier;
    talent.visible = tier < 4;
    const height = tier <= 1 ? 3.5 : tier === 2 ? 2.8 : 2;
    talentSprite.scale.set(height * 0.66, height, 1);
  }
  const frame = state.waiting ? 0 : Math.floor(state.tick / 8) % spriteAssets.walk.length;
  const map = spriteAssets.walk[frame]!;
  if (talentSprite.material.map !== map) talentSprite.material.map = map;
}

const entityMeshes = new Map<string, THREE.Object3D>();
const transform = new THREE.Object3D();
function batchStaticMeshes(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const materialGeometries = new Map<THREE.Material, Array<{ mesh: THREE.Mesh; geometry: THREE.BufferGeometry }>>();
  const dynamicParts = new Set(['monitor-cone', 'continuity-prop', 'extras-crowd-0', 'extras-crowd-1', 'extras-crowd-2', 'extras-crowd-3', 'swarm-cloud', 'bridge-planks']);
  for (const child of [...group.children]) {
    if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh || dynamicParts.has(child.name) || Array.isArray(child.material)) continue;
    const transformed = child.geometry.clone();
    transformed.applyMatrix4(child.matrixWorld);
    const geometry = transformed.index ? transformed.toNonIndexed() : transformed;
    if (geometry !== transformed) transformed.dispose();
    const parts = materialGeometries.get(child.material) ?? [];
    parts.push({ mesh: child, geometry });
    materialGeometries.set(child.material, parts);
  }
  for (const [material, parts] of materialGeometries) {
    if (parts.length < 2) { parts.forEach(({ geometry }) => geometry.dispose()); continue; }
    const geometry = mergeGeometries(parts.map(({ geometry: part }) => part), false);
    parts.forEach(({ geometry: part }) => part.dispose());
    if (!geometry) continue;
    for (const { mesh } of parts) group.remove(mesh);
    group.add(new THREE.Mesh(geometry, material));
  }
}
function buildEntity(entity: CastEntity) {
  const kind = entity.kind;
  const group = new THREE.Group();
  let material: THREE.Material;
  if (kind === 'glass') {
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(SPRITE_SIZE.glass[0], SPRITE_SIZE.glass[1]), new THREE.MeshBasicMaterial({
      map: spriteAssets.glass, transparent: true, alphaTest: 0.015, side: THREE.DoubleSide, depthWrite: false,
    }));
    glass.name = 'glass-surface'; glass.rotation.x = -Math.PI / 2; glass.position.y = 0.04; group.add(glass);
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
    const rock = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteAssets.boulder, transparent: true, alphaTest: 0.02, depthWrite: false }));
    rock.center.set(0.5, 0); rock.scale.set(SPRITE_SIZE.boulder[0], SPRITE_SIZE.boulder[1], 1); group.add(rock);
  } else if (kind === 'extras') {
    const capacity = Math.max(12, entity.members?.length ?? 0);
    spriteAssets.extras.forEach((texture, index) => {
      const crowd = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
        map: texture, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, depthWrite: false,
      }), capacity);
      crowd.name = `extras-crowd-${index}`; crowd.count = 0; group.add(crowd);
    });
  } else if (kind === 'swarm') {
    const swarm = new THREE.InstancedMesh(new THREE.PlaneGeometry(SPRITE_SIZE.swarm, SPRITE_SIZE.swarm), new THREE.MeshBasicMaterial({
      map: spriteAssets.swarmMoth, transparent: true, alphaTest: 0.02, side: THREE.DoubleSide, depthWrite: false,
    }), 12);
    swarm.name = 'swarm-cloud'; swarm.count = 0; group.add(swarm);
  } else if (kind === 'stagehand') {
    const stagehand = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteAssets.stagehand, transparent: true, alphaTest: 0.02, depthWrite: false }));
    stagehand.center.set(0.5, 0); stagehand.scale.set(SPRITE_SIZE.stagehand[0], SPRITE_SIZE.stagehand[1], 1); group.add(stagehand);
  } else if (kind === 'bridge') {
    const bridge = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.8), new THREE.MeshBasicMaterial({
      map: spriteAssets.bridge, transparent: true, alphaTest: 0.015, side: THREE.DoubleSide, depthWrite: false,
    }));
    bridge.name = 'bridge-planks'; bridge.rotation.x = -Math.PI / 2; bridge.position.y = 0.04; group.add(bridge);
  } else if (kind === 'rumour') {
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteAssets.rumour, transparent: true, alphaTest: 0.015, depthWrite: false }));
    smoke.center.set(0.5, 0.1); smoke.scale.set(SPRITE_SIZE.rumour[0], SPRITE_SIZE.rumour[1], 1); group.add(smoke);
  } else if (kind === 'monitor' || kind === 'red-monitor') {
    const texture = kind === 'monitor' ? spriteAssets.monitorTeal : spriteAssets.monitorRed;
    const monitor = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.02, depthWrite: false }));
    monitor.center.set(0.5, 0); monitor.scale.set(SPRITE_SIZE.monitor[0], SPRITE_SIZE.monitor[1], 1); group.add(monitor);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.3, 4, 1, true), new THREE.MeshBasicMaterial({ color: kind === 'monitor' ? '#e2b04a' : '#c8322a', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    cone.name = 'monitor-cone'; cone.position.set(0, 0.6, 1.2); group.add(cone);
  } else if (kind === 'continuity') {
    const propKind = entity.propSequence?.[entity.propIndex ?? 0] ?? entity.propIndex ?? 0;
    const prop = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteAssets.continuity[propKind % 4], transparent: true, alphaTest: 0.02, depthWrite: false }));
    prop.name = 'continuity-prop'; prop.center.set(0.5, 0); prop.scale.set(SPRITE_SIZE.continuity[0], SPRITE_SIZE.continuity[1], 1); group.add(prop);
  } else if (kind === 'reel') {
    const reel = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteAssets.reel, transparent: true, alphaTest: 0.02, depthWrite: false }));
    reel.center.set(0.5, 0); reel.scale.set(SPRITE_SIZE.reel[0], SPRITE_SIZE.reel[1], 1); group.add(reel);
  } else {
    material = new THREE.MeshLambertMaterial({ color: '#e2b04a', flatShading: true });
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.7, 8), material));
  }
  batchStaticMeshes(group);
  return group;
}
function syncEntities(showTransientRings = true) {
  for (const entity of state.entities) {
    if (entity.kind === 'urchin') continue;
    if (entity.cut || !entity.spawned) continue;
    let object = entityMeshes.get(entity.id);
    if (!object) { object = buildEntity(entity); entityMeshes.set(entity.id, object); scene.add(object); }
    const point = displayPoint(entity.x, entity.z);
    const spriteEntity = entity.kind === 'boulder' || entity.kind === 'stagehand' || entity.kind === 'reel' || entity.kind === 'extras' || entity.kind === 'continuity';
    object.position.set(point.x, entity.kind === 'swarm' ? 0.55 : PATH_RISE, point.z);
    object.rotation.y = spriteEntity ? 0 : entity.age * 0.015;
    if (entity.kind === 'rumour') object.scale.setScalar(Math.max(0.1, entity.radius ?? 0.5));
    if (entity.kind === 'monitor' || entity.kind === 'red-monitor') {
      object.rotation.y = -(entity.heading ?? 0) + Math.PI / 2;
      const cone = object.getObjectByName('monitor-cone');
      if (cone) cone.scale.set(1, 1, Math.min(2, (entity.range ?? 18) / 14));
    }
    if (entity.kind === 'continuity') {
      const prop = object.getObjectByName('continuity-prop') as THREE.Sprite | undefined;
      const propKind = entity.propSequence?.[entity.propIndex ?? 0] ?? entity.propIndex ?? 0;
      if (prop?.material instanceof THREE.SpriteMaterial) {
        prop.material.map = spriteAssets.continuity[propKind % 4]!;
        prop.material.needsUpdate = true;
      }
      object.scale.set(1 + (propKind % 2) * 0.25, 1, 1);
    }
    if (entity.kind === 'extras') {
      const tier = entity.lodTier ?? lodTier(1000 / state.camera.zoom * detailFactor(entity.x, entity.z));
      const crowds = spriteAssets.extras.map((_, index) => object.getObjectByName(`extras-crowd-${index}`) as THREE.InstancedMesh);
      crowds.forEach((crowd) => { crowd.count = 0; });
      for (const member of entity.members ?? []) {
        if (member.cut) continue;
        const costume = Math.abs(Math.floor(member.dx * 11 + member.dz * 17)) % crowds.length;
        const crowd = crowds[costume]!;
        const index = crowd.count++;
        const isWide = tier >= 2;
        const fitted = isWide ? SPRITE_SIZE.extrasWide : SPRITE_SIZE.extrasClose;
        transform.position.set(member.dx, fitted[1] / 2, member.dz);
        transform.quaternion.copy(camera.quaternion);
        transform.scale.set(fitted[0], fitted[1], 1);
        transform.updateMatrix();
        crowd.setMatrixAt(index, transform.matrix);
      }
      crowds.forEach((crowd) => { crowd.instanceMatrix.needsUpdate = true; });
    }
    if (entity.kind === 'swarm') {
      const swarm = object.getObjectByName('swarm-cloud') as THREE.InstancedMesh;
      const tier = entity.lodTier ?? lodTier(TUNING.swarmRadius * 1000 / state.camera.zoom * detailFactor(entity.x, entity.z));
      object.visible = tier < 4; swarm.count = tier < 4 ? 12 : 0;
      for (let i = 0; i < swarm.count; i++) {
        const angle = i * Math.PI * 2 / 12;
        transform.position.set(Math.cos(angle) * 0.42, 0.2 + Math.sin(i * 1.7) * 0.12, Math.sin(angle) * 0.42);
        transform.quaternion.copy(camera.quaternion);
        transform.rotation.z = angle + Math.sin(state.tick * 0.07 + i) * 0.2;
        transform.scale.setScalar(1);
        transform.updateMatrix();
        swarm.setMatrixAt(i, transform.matrix);
      }
      swarm.instanceMatrix.needsUpdate = true;
    }
    if (entity.kind === 'bridge') {
      const planks = object.getObjectByName('bridge-planks')!;
      const tier = entity.lodTier ?? lodTier(1000 / state.camera.zoom * detailFactor(entity.x, entity.z));
      planks.visible = tier <= 1;
    }
    object.visible = true;
  }
  for (const [id, object] of entityMeshes) {
    const found = state.entities.find((entity) => entity.id === id);
    if (!found || found.cut || !found.spawned) object.visible = false;
  }
  urchinBuckets.update(state.entities, state.camera.zoom, state.tick, showTransientRings && !window.matchMedia('(prefers-reduced-motion: reduce)').matches, detailFactor, displayPoint, camera.quaternion);
  let shade = 0;
  const putShade = (x: number, z: number, width: number, depth: number) => {
    if (shade >= 512) return;
    transform.position.set(x, PATH_RISE + 0.03, z);
    transform.rotation.set(-Math.PI / 2, 0, 0);
    transform.scale.set(width, depth, 1);
    transform.updateMatrix();
    castShadows.setMatrixAt(shade++, transform.matrix);
  };
  if (talent.visible) {
    const foot = displayPoint(state.talent.x, state.talent.z);
    putShade(foot.x, foot.z, 1.2, 0.75);
  }
  for (const entity of state.entities) {
    if (!entity.spawned || entity.cut) continue;
    const point = displayPoint(entity.x, entity.z);
    if (entity.kind === 'urchin') putShade(point.x, point.z, 1.35, 0.9);
    else if (entity.kind === 'boulder') putShade(point.x, point.z, 1.9, 1.05);
    else if (entity.kind === 'stagehand') putShade(point.x, point.z, 2.1, 0.95);
    else if (entity.kind === 'monitor' || entity.kind === 'red-monitor') putShade(point.x, point.z, 1.25, 0.8);
    else if (entity.kind === 'continuity' || entity.kind === 'reel') putShade(point.x, point.z, 1.15, 0.75);
    else if (entity.kind === 'rumour') putShade(point.x, point.z, 1.6, 1);
    else if (entity.kind === 'swarm') putShade(point.x, point.z, 2.2, 1.4);
    else if (entity.kind === 'extras') {
      for (const member of entity.members ?? []) if (!member.cut) putShade(point.x + member.dx, point.z + member.dz, 0.85, 0.5);
    }
  }
  castShadows.count = shade;
  castShadows.instanceMatrix.needsUpdate = true;
}

function syncCamera() {
  updateRenderCamera(camera, { ...state.camera, lens: state.lens });
}
function captureContactFrame() {
  if (state.tick === 0) return;
  const thirds = thirdsDistance(state.talent.x, state.talent.z, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, lensAspect(state.lens));
  const isBestThirds = thirds < bestThirdsDistance;
  if (isBestThirds) bestThirdsDistance = thirds;
  const sampled = state.tick === 1 || state.tick % 300 === 0 || state.failed !== null || pendingCloseCall || isBestThirds;
  if (!sampled || state.tick === lastContactTick) return;
  const frame = document.createElement('canvas');
  frame.width = 180; frame.height = 180;
  const context = frame.getContext('2d');
  if (!context) return;
  context.fillStyle = '#1b1e24'; context.fillRect(0, 0, frame.width, frame.height);
  context.filter = stockFilters[currentStock];
  const source = renderer.domElement;
  const sourceAspect = source.width / source.height;
  const drawWidth = sourceAspect >= 1 ? frame.width : frame.height * sourceAspect;
  const drawHeight = sourceAspect >= 1 ? frame.width / sourceAspect : frame.height;
  context.drawImage(source, (frame.width - drawWidth) / 2, (frame.height - drawHeight) / 2, drawWidth, drawHeight);
  context.filter = 'none';
  const opening = state.tick === 1 || !contactFrames.some((item) => item.label === 'Opening');
  const label = opening ? 'Opening' : state.failed ? 'Final frame' : pendingCloseCall ? 'Close call' : isBestThirds ? 'Thirds' : `Take · ${Math.floor(state.totalDistance)} m`;
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
async function saveRunSummary() {
  if (!state.failed || resultSaved) return;
  resultSaved = true;
  const download = $('#download-sheet') as HTMLAnchorElement;
  const shareButton = $('#share') as HTMLButtonElement;
  const reelButton = $('#make-reel') as HTMLButtonElement;
  download.removeAttribute('href'); download.dataset.ready = 'false'; download.setAttribute('aria-busy', 'true'); download.textContent = 'REPLAYING TAKE…';
  shareButton.disabled = true; reelButton.disabled = true; reelButton.textContent = 'REPLAYING…';
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
    shootSceneIndex: state.shoot?.sceneIndex ?? -1,
    finishedShoot: state.shoot?.sceneIndex === 3 && state.failed === 'wrapped' && state.shoot.finaleTicks >= TUNING.finalTakeSeconds * TUNING.tickRate,
    daily: dailyRun, monitorUses, lens: state.lens,
  };
  try { recordResult(window.localStorage, entry); } catch { /* Local storage may be disabled by the browser. */ }
  refreshFilmStocks();
  refreshLensSelector();
  let history: ReturnType<typeof loadFilmography> = [];
  try { history = loadFilmography(window.localStorage); } catch { /* Lens feats stay locked when storage is unavailable. */ }
  const unlocked = new Set(unlockedLenses(history));
  $('#lens-feat-list').replaceChildren(...lensFeats.map((feat) => {
    const item = document.createElement('li');
    item.textContent = `${unlocked.has(feat.id) ? 'UNLOCKED' : 'LOCKED'} · ${feat.name} — ${feat.feat}`;
    item.classList.toggle('unlocked', unlocked.has(feat.id));
    return item;
  }));
  refreshPersonalBest();
  const sheetFrames = await renderReplayContactFrames();
  const sheet = makeContactSheet(sheetFrames);
  directorReelFrames = sheetFrames.map((frame) => frame.image);
  download.href = sheet.toDataURL('image/png');
  download.download = `cull-${state.seed}.png`;
  download.textContent = 'CONTACT SHEET ↓';
  download.dataset.ready = 'true'; download.setAttribute('aria-busy', 'false');
  shareButton.disabled = false; reelButton.disabled = false; reelButton.textContent = "DIRECTOR'S REEL";
  const shareCard = `CULL #${state.seed} · ${entry.location} · ${state.lens} · ${entry.meters} m · ✂ ${entry.cuts} cuts · ${entry.score} pts · ${grade} grade${overcrankUsed ? ' · 75% SPEED ASSIST' : ''}`;
  $('#share-card').textContent = shareCard;
  $('#grade-detail').textContent = `GRADE ${grade} · THIRDS ${metrics.thirdsPercent}% · SMOOTH ${Math.round(metrics.smoothness)} · CLOSE CALLS ${metrics.closeCalls} · REELS ${metrics.reelsCollected}/${metrics.reelsAvailable}`;
  const historyList = $('#filmography-list');
  try {
    const history = loadFilmography(window.localStorage).slice(0, 5);
    historyList.replaceChildren(...history.map((run) => {
      const item = document.createElement('li');
      item.textContent = `${run.date} · ${run.location} · ${run.lens ?? '35mm'} · ${Math.floor(run.meters)} m · ${run.grade ?? '—'} · ${run.cause}`;
      return item;
    }));
  } catch { historyList.replaceChildren(); }
  const replay = new URL(location.href);
  replay.searchParams.delete('frozen');
  if (!dailyRun) replay.searchParams.delete('daily');
  if (overcrankUsed) replay.searchParams.set('assist', '75');
  replay.hash = encodeReplay(state.seed, inputLog, state.lens);
  const replayLink = $('#replay-link') as HTMLAnchorElement;
  replayLink.href = replay.toString();
}
function renderViewfinder(showTransientRings = true) {
  const look = SCENE_LOOKS[Math.min(sceneLookIndex(), SCENE_LOOKS.length - 1)]!;
  if (scene.background instanceof THREE.Color) scene.background.set(look.sky);
  floorMaterial.color.set(look.ground);
  path.visible = state.tiles.length === 0;
  pathMaterial.color.set(look.path);
  keyLight.color.set(look.key);
  const night = sceneLookIndex() === 2;
  keyLight.intensity = night ? 1.65 : 1.85;
  hemi.intensity = night ? 1.85 : 0.7;
  hemi.color.set(look.hemi);
  hemi.groundColor.set(look.fill);
  floorMaterial.emissive.set(night ? '#152033' : '#000000');
  syncCamera();
  syncTerrain();
  syncTalentLod();
  const talentPoint = displayPoint(state.talent.x, state.talent.z);
  talent.position.set(talentPoint.x, PATH_RISE, talentPoint.z);
  syncEntities(showTransientRings);
  renderer.render(scene, camera);
}
async function renderReplayContactFrames(): Promise<ScoredFrame[]> {
  const terminalState = state;
  let selected: Awaited<ReturnType<typeof selectReplayContactFrames>>['frames'] = [];
  try {
    const initial = createTake(terminalState.seed);
    initial.lens = terminalState.lens;
    if (initial.lens === 'long-lens') initial.camera.zoom = TUNING.minZoom;
    selected = (await selectReplayContactFrames(initial, inputLog, terminalState)).frames;
    const rendered: ScoredFrame[] = [];
    for (const candidate of selected) {
      state = candidate.state;
      renderedTalentTier = -1;
      renderViewfinder(false);
      const frame = document.createElement('canvas'); frame.width = 180; frame.height = 180;
      const context = frame.getContext('2d');
      if (!context) continue;
      context.fillStyle = '#1b1e24'; context.fillRect(0, 0, frame.width, frame.height);
      context.filter = stockFilters[currentStock];
      const source = renderer.domElement;
      const sourceAspect = source.width / source.height;
      const drawWidth = sourceAspect >= 1 ? frame.width : frame.height * sourceAspect;
      const drawHeight = sourceAspect >= 1 ? frame.width / sourceAspect : frame.height;
      context.drawImage(source, (frame.width - drawWidth) / 2, (frame.height - drawHeight) / 2, drawWidth, drawHeight);
      context.filter = 'none';
      rendered.push({ image: frame, label: candidate.label, tick: candidate.tick, rank: candidate.rank });
    }
    return rendered.length ? rendered : contactFrames;
  } catch {
    return contactFrames;
  } finally {
    state = terminalState;
    urchinBuckets.reset();
    renderedTalentTier = -1;
    renderViewfinder();
  }
}
function render() {
  audio.update(state);
  renderViewfinder();
  captureContactFrame();
  updateHud();
}
const CAST_NAMES: Record<string, string> = {
  urchin: 'spiny ball', boulder: 'rolling rock', glass: 'glass floor', reel: 'film reel', extras: 'crowd',
  swarm: 'moths', stagehand: 'stagehand', bridge: 'rope bridge', rumour: 'growing smoke', monitor: 'friendly camera',
  'red-monitor': 'hostile camera', continuity: 'swappable prop',
};
function coachMessage(): string | null {
  if (!coachStarted) return null;
  const elapsed = performance.now() - coachStarted;
  if (elapsed < 0 || elapsed > 20_000) return null;
  if (elapsed < 7_000) return 'She walks on her own. Keep her in the shot.';
  if (elapsed < 14_000) return 'Zoom out and the spikes go dull. Zoom in to grab a film reel.';
  return 'Push a hazard past the frame edge to cut it. A close cut scores more.';
}
function callSheetLines() {
  const aspect = lensAspect(state.lens);
  const lines: string[] = [];
  for (const entity of state.entities) {
    if (entity.cut) continue;
    const projected = projectPoint(entity.x, entity.z, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, aspect);
    const outside = Math.max(Math.abs(projected.x), Math.abs(projected.y)) - 0.5;
    const name = CAST_NAMES[entity.kind] ?? entity.kind;
    if (!entity.spawned && outside >= 0 && outside <= TUNING.callSheetMargin) lines.push(`Coming in · ${name}`);
    else if (entity.spawned && outside <= 0 && entity.kind !== 'reel') lines.push(`In the shot · ${name}`);
  }
  return lines.slice(0, 4).join('\n') || 'Nothing waiting just outside the frame.';
}
function updateHud() {
  if (state.shoot) $('.slate').innerHTML = `SCENE 0${Math.min(state.shoot.sceneIndex + 1, 3)}<br><strong>${state.shoot.biome}</strong><small>SEED <span>${String(state.seed).padStart(5, '0')}</span></small><small id="best">BEST —</small>`;
  if (locationFor(state) !== displayedLocation) { displayedLocation = locationFor(state); refreshPersonalBest(); }
  const seconds = Math.max(0, Math.ceil(state.film));
  $('#timecode').textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  $('#film').textContent = `${seconds}s`;
  $('#filmbar').style.width = `${Math.max(0, Math.min(100, state.film / 180 * 100))}%`;
  $('#filmbar').style.background = state.film < 20 ? '#c8322a' : '#ff7a1a';
  $('#lens').textContent = state.lens === 'long-lens' ? '85 MM' : `${Math.round(Math.max(24, Math.min(85, 85 - (state.camera.zoom - 10) * 61 / 38)))} MM`;
  shell.classList.toggle('anamorphic', state.lens === 'anamorphic');
  shell.classList.toggle('fisheye', state.lens === 'fisheye');
  $('#gate-ratio').textContent = state.lens === 'anamorphic' ? 'VIEWFINDER · GATE 2.39:1'
    : state.lens === 'tilt-shift' ? 'VIEWFINDER · FOCUS BAND 40% · W/S MOVE'
      : state.lens === 'fisheye' ? 'FISHEYE · WRAP GATE EDGES'
        : state.lens === 'super8' ? 'SUPER 8 · 12 FPS' : 'VIEWFINDER · GATE 1:1';
  const panHint = $('.controls span');
  panHint.innerHTML = state.lens === 'tilt-shift' ? '<kbd>A</kbd> / <kbd>D</kbd> PAN · <kbd>W</kbd> / <kbd>S</kbd> FOCUS' : '<kbd>WASD</kbd> PAN';
  const focusBand = $('#focus-band');
  focusBand.hidden = state.lens !== 'tilt-shift';
  focusBand.style.top = `${(0.5 - state.camera.focusOffset - 0.2) * 100}%`;
  $('#status').textContent = state.waiting ? 'HOLDING FOR SET…' : paused ? 'PAUSED' : state.camera.moving ? 'IN MOTION' : 'ROLLING';
  const tierIndex = state.talent.lodTier ?? lodTier(1000 / state.camera.zoom);
  const tierName = ['Close-up', 'Medium shot', 'Wide shot', 'Stand-in', 'Gone'][tierIndex] ?? 'Medium shot';
  const urchin = state.entities.find((entity) => entity.kind === 'urchin' && entity.spawned && !entity.cut);
  const urchinTier = urchin?.lodTier ?? lodTier(TUNING.urchinRadius * 1000 / state.camera.zoom);
  const spikeName = ['spikes will hit her', 'spikes still hurt', 'spikes are gone', 'just a block', 'gone'][urchinTier] ?? 'in shot';
  $('#lod').textContent = `${tierName} · ${spikeName}`;
  const urchinInShot = state.entities.some((entity) => entity.kind === 'urchin' && entity.spawned && !entity.cut && inFrame(entity.x, entity.z, TUNING.urchinRadius, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, 0.8, lensAspect(state.lens), state.lens === 'tilt-shift' ? state.camera.focusOffset : null, state.lens === 'fisheye') && urchinTier < 4);
  const blockedShot = state.shots?.find((shot) => !shot.done && state.talent.x >= shot.at - 0.35);
  $('#message').textContent = blockedShot?.kind === 'defang'
    ? 'Shot list: zoom out until the spikes go dull, or cut one close.'
    : blockedShot?.kind === 'portrait'
      ? 'Shot list: come back to a medium shot of her.'
      : urchinInShot
        ? ['Very close. That spiny ball will hit her.', 'Medium shot. The spikes still hurt.', 'Wide shot. The spikes are gone.', 'So wide it is only a harmless block.', 'The spiny ball is gone.'][urchinTier]
        : 'Keep her in the shot.';
  const lesson = coachMessage();
  const coach = $('#coach');
  coach.textContent = lesson ?? '';
  coach.classList.toggle('hidden', !lesson);
  if (invalidReplay) $('#message').textContent = 'INVALID REPLAY URL';
  if (sliderZoomTarget !== null && Math.abs(sliderZoomTarget - state.camera.zoom) < 0.12) sliderZoomTarget = null;
  const zoomSlider = $('#zoom-slider') as HTMLInputElement;
  zoomSlider.value = String(Math.round(sliderZoomTarget ?? state.camera.zoom));
  zoomSlider.disabled = state.lens === 'long-lens';
  $('#call-sheet').textContent = callSheetLines();
  const filmBar = shell.querySelector<HTMLElement>('.film-track')!;
  filmBar.style.setProperty('--remaining', `${Math.max(0, state.film / 90 * 100)}%`);
  if (state.failed) {
    $('#message').textContent = state.failed === 'wrapped' ? "That's a wrap." : 'The take is over.';
    const endings: Record<string, string> = { 'lost-talent': 'LOST HER', hit: 'HIT', fell: 'SHE FELL', 'out-of-film': 'OUT OF FILM', wrapped: "THAT'S A WRAP" };
    $('#end-title').textContent = endings[state.failed] ?? 'CUT';
    $('#end-detail').textContent = `Take ${String(state.seed).padStart(5, '0')} · ${Math.floor(state.totalDistance)} metres · ${state.cuts.length} cuts`;
    $('#end-card').classList.remove('hidden');
    void saveRunSummary();
  }
}

function buildInput(): InputFrame {
  const keyInput = panFromKeys();
  const sliderZoom = sliderZoomTarget === null ? 0 : Math.abs(sliderZoomTarget - state.camera.zoom) < 0.12 ? 0 : sliderZoomTarget > state.camera.zoom ? -127 : 127;
  return leashInput(quantizeInput({
    ...frameInput, ...keyInput,
    panX: pointerPan?.panX ?? (keys.size ? keyInput.panX : frameInput.panX),
    panZ: pointerPan?.panZ ?? (keys.size ? keyInput.panZ : frameInput.panZ),
    zoom: keyInput.zoom || zoomPulse || sliderZoom || frameInput.zoom,
    rotate: rotationPulse || frameInput.rotate,
    hold: keyInput.hold || frameInput.hold,
    steady: keyInput.steady || frameInput.steady,
  }));
}
function leashInput(input: InputFrame): InputFrame {
  const dx = state.talent.x - state.camera.x;
  const dz = state.talent.z - state.camera.z;
  const reach = Math.max(1, state.camera.zoom * 0.5);
  const edge = Math.max(Math.abs(dx), Math.abs(dz) * TUNING.projectionPitchScale) / reach;
  if (edge < 0.34) return input;
  const blend = Math.min(1, (edge - 0.34) / 0.22) * 0.9;
  return quantizeInput({
    ...input,
    panX: input.panX * (1 - blend) + Math.sign(dx || 1) * 100 * blend,
    panZ: input.panZ * (1 - blend) + Math.sign(dz || 1) * 100 * blend,
  });
}
function quantizeInput(input: InputFrame): InputFrame {
  const axis = (value: number) => Math.max(-127, Math.min(127, Math.round(value)));
  return { panX: axis(input.panX), panZ: axis(input.panZ), zoom: axis(input.zoom), rotate: input.rotate, hold: Boolean(input.hold), steady: Boolean(input.steady) };
}
function advanceTick(forcedInput?: InputFrame) {
  if (!paused && !state.failed) {
    const input = replayData ? replayData.frames[replayIndex++] ?? NEUTRAL_INPUT : bot ? inputForBot(state, bot, botRandom) : forcedInput ?? buildInput();
    inputLog.push(input);
    const previousCuts = state.cuts.length;
    const previousSpawned = state.entities.filter((entity) => entity.spawned && !entity.cut).length;
    const previousWrap = state.shoot?.wrapCaught ?? false;
    const previousMonitorActive = monitorWasActive;
    const previousScore = state.score;
    const previousTalent = { x: state.talent.x, z: state.talent.z };
    const previousEntities = state.entities.map((entity) => ({ id: entity.id, kind: entity.kind, x: entity.x, z: entity.z, cut: entity.cut }));
    const previousCameraVelocity = { x: state.camera.vx, z: state.camera.vz };
    const previousTalentTier = state.talent.lodTier;
    const previousEntityTiers = new Map(state.entities.map((entity) => [entity.id, entity.lodTier]));
    state = state.shoot ? stepShoot(state, input) : step(state, input);
    monitorWasActive = state.entities.some((entity) => entity.kind === 'monitor' && entity.spawned && !entity.cut
      && monitorConeContains({ origin: { x: entity.x, z: entity.z }, heading: entity.heading ?? 0, range: entity.range ?? 0, halfAngle: entity.halfAngle ?? 0 }, state.talent));
    if (monitorWasActive && !previousMonitorActive) monitorUses++;
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
    const cutHazard = newlyCut.find((entity) => !['reel', 'monitor', 'red-monitor', 'continuity'].includes(entity.kind));
    if (state.score > previousScore && !cutHazard) audio.playCue('reel');
    else if (cutHazard) {
      audio.playCue('cut');
      showCut(cutHazard);
    } else if (state.cuts.length > previousCuts) audio.playCue('cut');
    else if (state.entities.filter((entity) => entity.spawned && !entity.cut).length > previousSpawned) audio.playCue('pop');
    else if (state.talent.lodTier !== previousTalentTier || state.entities.some((entity) => entity.lodTier !== previousEntityTiers.get(entity.id))) audio.playCue('lod');
    if (!previousWrap && state.shoot?.wrapCaught) audio.playCue('wrap');
  }
  audio.update(state);
  frameInput = { ...NEUTRAL_INPUT };
  zoomPulse = 0;
  rotationPulse = 0;
}
function showCut(entity: { x: number; z: number }) {
  const projected = projectPoint(entity.x, entity.z, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, lensAspect(state.lens));
  const edge = Math.abs(projected.x) > Math.abs(projected.y) ? (projected.x < 0 ? 'left' : 'right') : (projected.y > 0 ? 'top' : 'bottom');
  const gate = $('#gate');
  gate.dataset.edge = edge;
  gate.classList.remove('cutting');
  void gate.offsetWidth;
  gate.classList.add('cutting');
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) hitStopUntil = performance.now() + 70;
}
function stepFrame() {
  advanceTick();
  render();
}
function loop(now: number) {
  if (!previousTime) previousTime = now;
  if (now < hitStopUntil) { previousTime = now; requestAnimationFrame(loop); return; }
  const frameTime = now - previousTime;
  if (frameTime > 0 && !document.hidden) frameSamples.push(frameTime);
  if (frameSamples.length >= 60) {
    const nextTier = nextDprTier(dprTier, frameSamples.slice(-60));
    frameSamples = [];
    if (nextTier > dprTier) {
      dprTier = nextTier;
      renderer.setPixelRatio(baseDpr * DPR_SCALES[dprTier]);
      const rect = mount.getBoundingClientRect();
      renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), true);
    }
  }
  simAccumulator += Math.min(frameTime / 1000, 0.1);
  previousTime = now;
  let ticks = 0;
  const ticksPerRender = lensRenderTicks(state.lens);
  const tickInterval = ticksPerRender / (TUNING.tickRate * (overcrank ? 0.75 : 1));
  while (simAccumulator >= tickInterval && ticks < TUNING.maxCatchupTicks) {
    if (ticksPerRender === 1) stepFrame();
    else {
      const sampledInput = replayData || bot ? undefined : buildInput();
      for (let tick = 0; tick < ticksPerRender; tick++) advanceTick(sampledInput);
      render();
    }
    simAccumulator -= tickInterval; ticks++;
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
$('#make-reel').addEventListener('click', () => {
  if (typeof MediaRecorder === 'undefined' || !directorReelMimeType || typeof HTMLCanvasElement.prototype.captureStream !== 'function' || directorReelFrames.length === 0) return;
  const mimeType = directorReelMimeType;
  if (!mimeType) return;
  const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 720;
  const context = canvas.getContext('2d');
  if (!context) return;
  const frames = directorReelFrames;
  const stream = canvas.captureStream(12);
  const recorder = new MediaRecorder(stream, { mimeType });
  const chunks: BlobPart[] = [];
  let frameIndex = 0;
  const draw = () => {
    context.fillStyle = '#1b1e24'; context.fillRect(0, 0, 720, 720);
    context.drawImage(frames[frameIndex % frames.length]!, 0, 0, 720, 720);
    context.fillStyle = '#ff4b3e'; context.font = 'bold 24px monospace'; context.fillText(`CULL · ${String(state.seed).padStart(5, '0')}`, 24, 690);
  };
  draw();
  recorder.addEventListener('dataavailable', (event) => { if (event.data.size > 0) chunks.push(event.data); });
  recorder.addEventListener('stop', () => {
    stream.getTracks().forEach((track) => track.stop());
    if (directorReelUrl) URL.revokeObjectURL(directorReelUrl);
    directorReelUrl = URL.createObjectURL(new Blob(chunks, { type: mimeType }));
    const link = $('#download-reel') as HTMLAnchorElement;
    link.href = directorReelUrl; link.download = `cull-${state.seed}-reel.webm`; link.classList.remove('hidden');
    ($('#make-reel') as HTMLButtonElement).textContent = "MAKE REEL AGAIN";
  }, { once: true });
  recorder.start();
  ($('#make-reel') as HTMLButtonElement).textContent = 'RECORDING…';
  const interval = window.setInterval(() => { frameIndex++; draw(); }, 1000 / 12);
  window.setTimeout(() => { window.clearInterval(interval); if (recorder.state !== 'inactive') recorder.stop(); }, 6000);
});
$('#restart').addEventListener('click', () => {
  const nextSeed = state.seed + 1;
  dailyRun = false;
  replayData = undefined; invalidReplay = false; state = createTake(nextSeed); state.lens = pendingLens;
  if (state.lens === 'long-lens') state.camera.zoom = TUNING.minZoom;
  botRandom = mulberry32((nextSeed ^ 0xb07b07) >>> 0); inputLog = []; replayIndex = 0;
  contactFrames.length = 0; closeCallFrames.length = 0; lastContactTick = 0; bestThirdsDistance = Number.POSITIVE_INFINITY;
  thirdsTicks = 0; activeTicks = 0; jerkTotal = 0; priorVelocityDelta = { x: 0, z: 0 };
  closeCallCount = 0; reelsCollected = 0; monitorUses = 0; monitorWasActive = false; reelIds.clear();
  state.entities.filter((entity) => entity.kind === 'reel').forEach((entity) => reelIds.add(entity.id));
  pendingCloseCall = false; pendingCloseCallRank = Number.POSITIVE_INFINITY; sliderZoomTarget = null;
  frameInput = { ...NEUTRAL_INPUT }; resultSaved = false; displayedLocation = locationFor(state); refreshPersonalBest();
  entityMeshes.clear(); urchinBuckets.reset();
  for (const child of [...scene.children]) if (child instanceof THREE.Group && child !== talent && child !== terrainGroup) scene.remove(child);
  terrainTiles = null; $('#end-card').classList.add('hidden'); refreshLensSelector();
});
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
  const replayUrl = ($('#replay-link') as HTMLAnchorElement).href;
  try {
    if (navigator.share) {
      const sheetData = ($('#download-sheet') as HTMLAnchorElement).href.split(',')[1] ?? '';
      const bytes = Uint8Array.from(atob(sheetData), (character) => character.charCodeAt(0));
      const sheetFile = new File([bytes], `cull-${state.seed}.png`, { type: 'image/png' });
      const shareText = `${title}\n${replayUrl}`;
      if (navigator.canShare?.({ files: [sheetFile] })) await navigator.share({ title: 'CULL Contact Sheet', text: shareText, files: [sheetFile] });
      else await navigator.share({ title: 'CULL Contact Sheet', text: shareText, url: replayUrl });
    } else await navigator.clipboard.writeText(`${title}\n${replayUrl}`);
  } catch { /* The user may dismiss the native share sheet. */ }
});

if (query.has('debug')) {
  Object.assign(window, { __cull: { step: (n = 1) => { for (let i = 0; i < n; i++) advanceTick(); render(); }, input: (input: InputFrame) => { frameInput = input; }, hash: () => stateHash(state), state: () => structuredClone(state), diagnostics: () => ({ paused, keys: [...keys], hidden: document.hidden, focused: document.hasFocus(), dprTier, pointerPan: pointerPan && { ...pointerPan } }), performance: () => ({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }), lod: () => urchinBuckets.diagnostics(), load: (seed: number) => { state = createGeneratedState(seed); terrainTiles = null; urchinBuckets.reset(); }, loadShootScene: (sceneIndex: number) => { state = createShootSceneState(state.seed, sceneIndex); terrainTiles = null; urchinBuckets.reset(); render(); }, finishForShare: () => { state.failed = 'hit'; render(); }, loadLodDemo: () => { state = createGeneratedState(1, 0, 2); state.entities = [{ id: 'lod-demo-urchin', kind: 'urchin', x: 0, z: 2, vx: 0, vz: 0, spawned: true, cut: false, age: 0 }]; state.talent.x = -4; render(); }, setTier: (tier: number) => { const size = [64, 36, 17, 7, 2][tier] ?? 36; state.camera.zoom = TUNING.urchinRadius * 1000 / size; }, setCamera: (x: number, z: number, zoom: number) => { state.camera.x = x; state.camera.z = z; state.camera.zoom = zoom; }, silhouettes: () => measureSilhouettes({ urchin: spriteAssets.urchinTiers[2]!, boulder: spriteAssets.boulder, glass: spriteAssets.glass, extras: spriteAssets.extras[0]!, swarm: spriteAssets.swarmMoth, rumour: spriteAssets.rumour, stagehand: spriteAssets.stagehand, monitor: spriteAssets.monitorTeal, redMonitor: spriteAssets.monitorRed, continuity: spriteAssets.continuity[2]!, talent: spriteAssets.walk[0]! }) } });
}

new ResizeObserver(() => {
  const rect = mount.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), true);
  render();
}).observe(mount);
render();
if (!frozen && !bot && !replayData) {
  paused = true;
  $('#title-card').classList.remove('hidden');
  const beginTake = () => {
    if (coachStarted) return;
    paused = false;
    coachStarted = performance.now();
    $('#title-card').classList.add('hidden');
  };
  window.setTimeout(beginTake, 3800);
  window.addEventListener('pointerdown', beginTake, { once: true });
  window.addEventListener('keydown', beginTake, { once: true });
}
if (!frozen) requestAnimationFrame(loop);
