import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import './style.css';
import { stateHash } from './sim/hash';
import { updateRenderCamera } from './render/camera';
import { cameraBasis, projectPoint } from './sim/frame';
import { NEUTRAL_INPUT, lostProgress, step, talentLost } from './sim/step';
import { lodTier } from './sim/lod';
import { assistInput, composeInput, dragCameraTarget, dragSettled, pinchZoomTarget, type DragTarget } from './ui/input-map';
import { nextZoomStep } from './ui/zoom-control';
import { TUNING } from './sim/tuning';
import { createGeneratedState, createState } from './sim/world';
import { createValidatedState } from './gen/validated';
import { createShootState, createShootSceneState, stepShoot } from './sim/shoot';
import { inputForBot, type BotKind } from './bots/players';
import { mulberry32 } from './sim/rng';
import { UrchinLodBuckets } from './render/lod-buckets';
import { createDailiesCast, SCENE_LOOKS, TALENT_ASPECT } from './render/dailies';
import { measureSilhouettes } from './render/silhouettes';
import { PATH_RISE, SPRITE_SIZE, createSetDressing, createTableTextures, raisedPathGeometry } from './render/set-dressing';
import { DPR_SCALES, nextDprTier } from './render/adaptive-dpr';
import { LockOverlay, lockFan, updateLockFan, type LockMark } from './render/hostile-lock';
import { createDustPuff, createShockMark, fallPlay, flinchPlay2, idlePlay, springStep, walkPlay } from './render/talent-fx';
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
import { COACH_LINES, closeCallsForGrade, describeShot } from './ui/describe-shot';
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
// A zoom key or − + button that is down: a tap snaps a framing step, holding past the hold delay zooms at full speed.
let zoomPress: { direction: 1 | -1; since: number } | null = null;
let lastWheelStep = 0;
let dragTarget: DragTarget | null = null;
/** A short HUD line after a far cut or a re-dressed stand-in; it overrides the toast until `until`. */
let cutNote: { text: string; until: number } | null = null;
let rotationPulse: -1 | 0 | 1 = 0;
let simAccumulator = 0;
let previousTime = 0;
let frameSamples: number[] = [];
let hitStopUntil = 0;
/** The intro and the coach lines are cards read before the take rolls; while one shows the loop advances no ticks. */
const TUTORIAL_STEPS = ['Nothing exists unless it is in the shot. You hold the camera. She walks.', ...COACH_LINES] as const;
const tutorial = { step: 0, steps: 0, showing: false };

const shell = document.createElement('section');
shell.className = 'stage';
shell.innerHTML = `
  <header class="topbar"><div class="brand"><span class="rec-dot"></span><strong>CULL</strong><span class="tagline">CAMERA DEPARTMENT</span></div><label class="stock-control">STOCK <select id="film-stock" aria-label="Film stock"><option value="clean">35 MM · CLEAN</option><option value="kodachrome">KODACHROME · B</option><option value="bleach">BLEACH BYPASS · A</option><option value="ilford">ILFORD B&W · S</option></select></label><details class="sound-settings" id="sound-settings"><summary id="sound-summary">SOUND</summary><div class="sound-panel"><button id="mute-audio" type="button" aria-pressed="false">MUTE ALL</button><label>MASTER <input id="volume-master" aria-label="Master volume" type="range" min="0" max="100" value="100" /></label><label>MUSIC <input id="volume-music" aria-label="Music volume" type="range" min="0" max="100" value="80" /></label><label>EFFECTS <input id="volume-sfx" aria-label="Effects volume" type="range" min="0" max="100" value="80" /></label><label><input id="mono-audio" type="checkbox" /> MONO</label><label><input id="calm-audio" type="checkbox" /> CALM MIX</label></div></details><div class="readout"><a class="daily-link" href="?daily=1">DAILY</a><span>TAKE 01</span><b id="timecode">01:30</b><span id="lens">35 MM</span><button class="pause-button" id="pause" aria-label="Pause game">Ⅱ</button></div></header>
  <div class="composition"><aside class="margin margin-left"><div class="slate">SCENE 01<br><strong>BACKLOT</strong><small>SEED <span id="seed">00001</span></small><small id="best">BEST —</small></div><div class="hint"><span class="hint-mark">↖</span> <span class="key-hint">WASD / DRAG<br>TO FRAME THE SHOT</span><span class="touch-hint">DRAG TO FRAME<br>PINCH TO ZOOM</span><div class="preview" id="preview"></div></div></aside>
    <div class="gate-wrap"><div class="gate-label"><span id="gate-ratio">VIEWFINDER · GATE 1:1</span><span id="lod">SHE IS IN A MEDIUM SHOT</span></div><div class="gate" id="gate"><div class="thirds"></div><div class="focus-band" id="focus-band" hidden></div><div class="gate-corners"></div><div class="sprockets left"></div><div class="sprockets right"></div><div id="mount" class="mount"></div><div class="depth-blur top"></div><div class="depth-blur bottom"></div><div class="lost-edge" id="lost-edge"></div><div class="lost-arrow hidden" id="lost-arrow"><span>➤</span><b>HER</b></div><div class="lost-banner hidden" id="lost-banner"><strong>LOST HER</strong><small id="lost-count">2.5 s TO CUT</small><div class="lost-track"><i id="lost-bar"></i></div></div><div class="title-card hidden" id="title-card"><p class="title-kicker">SCENE 01 · TAKE 01</p><h1>CULL</h1></div><div class="cut-flash" id="cut-flash"></div><div class="slice" id="slice"></div><div class="peel" id="peel"></div><div class="cut-stamp" id="cut-stamp">CUT</div><i class="spark" style="--dx:-18px;--dy:-24px;left:70%;top:40%"></i><i class="spark" style="--dx:16px;--dy:-20px;left:72%;top:46%"></i><i class="spark" style="--dx:8px;--dy:18px;left:68%;top:50%"></i><i class="spark" style="--dx:-22px;--dy:8px;left:74%;top:42%"></i></div><div class="gate-notes"><p class="frame-message" id="message">Keep her in the shot.</p><div class="tutorial hidden" id="tutorial" role="dialog" aria-labelledby="tutorial-text"><p class="tutorial-kicker" id="tutorial-kicker"></p><p class="tutorial-text" id="tutorial-text"></p><button id="tutorial-next" type="button">CONTINUE</button></div></div><div class="gate-foot"><span>55° TABLETOP</span><span id="status">ROLLING</span></div></div>
    <aside class="margin margin-right"><div class="camera-mark">Slate<small>CAM 01</small></div><div class="call-sheet"><span>CALL SHEET</span><div id="call-sheet">Looking outside the frame…</div></div></aside>
  </div>
  <footer class="controlbar"><div class="controls"><span><kbd>WASD</kbd> PAN</span><span><kbd>−</kbd> / <kbd>+</kbd> ZOOM</span><span><kbd>SPACE</kbd> HOLD</span><span><kbd>Q</kbd> / <kbd>E</kbd> ROTATE</span></div><p class="touch-hint">Drag to frame · pinch to zoom</p><div class="mobile-controls"><button id="hold" type="button" aria-label="Hold Talent">HOLD</button><div class="touch-buttons"><button id="rotate-left" type="button" aria-label="Rotate left">↺</button><button id="rotate-right" type="button" aria-label="Rotate right">↻</button><button id="zoom-out" type="button" aria-label="Zoom out">−</button><button id="zoom-in" type="button" aria-label="Zoom in">+</button></div><label class="zoom-slider">ZOOM <input id="zoom-slider" aria-label="Zoom" type="range" min="10" max="48" value="30" /></label></div><div class="assist-controls"><button id="left-hand" type="button" aria-pressed="false">LEFT HAND</button><button id="overcrank" type="button" aria-pressed="false">75% SPEED</button></div><div class="film"><span>FILM</span><div class="film-track"><i id="filmbar"></i></div><b id="film">90s</b><em id="film-drain" hidden>−${TUNING.offscreenFilmDrainPerSecond}s/s</em></div></footer>
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
const muteButton = $('#mute-audio');
const showMute = () => {
  muteButton.setAttribute('aria-pressed', String(audio.settings.muted));
  muteButton.textContent = audio.settings.muted ? 'UNMUTE' : 'MUTE ALL';
  $('#sound-summary').textContent = audio.settings.muted ? 'SOUND OFF' : 'SOUND';
};
showMute();
muteButton.addEventListener('click', () => {
  audio.setSettings({ muted: !audio.settings.muted });
  showMute();
  try { window.localStorage.setItem('cull.audio.v1', JSON.stringify(audio.settings)); } catch { /* Setting remains active for this visit. */ }
});
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
const keyLight = new THREE.DirectionalLight('#ffd9a0', 0.45);
keyLight.position.set(-14, 18, 6);
scene.add(keyLight);
const keySpot = new THREE.SpotLight('#ffd9a0', 28, 52, 1.05, 0.88, 1);
keySpot.position.set(-10, 18, 7);
scene.add(keySpot, keySpot.target);
const moon = new THREE.DirectionalLight('#d5e4f5', 0);
moon.position.set(16, 12, -9);
scene.add(moon);
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
const floorMaterial = new THREE.MeshPhongMaterial({ map: tableTextures.cork, color: '#c9a46b', emissive: '#000000', shininess: 2, specular: '#000000' });
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
  const disposeObject = (child: THREE.Object3D) => {
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.forEach((material) => material.dispose());
    }
    child.children.forEach(disposeObject);
  };
  for (const child of [...terrainGroup.children]) {
    terrainGroup.remove(child);
    disposeObject(child);
  }
  const pathTiles = state.tiles.filter((tile) => tile.kind === 'path');
  const setTiles = state.tiles.filter((tile) => tile.kind === 'set');
  if (pathTiles.length) {
    const night = lookIndex === 2;
    const mesh = new THREE.Mesh(
      raisedPathGeometry(pathTiles),
      night
        ? new THREE.MeshPhongMaterial({
          map: tableTextures.felt, color: look.path, vertexColors: true, side: THREE.DoubleSide,
          emissive: '#3a2a16', shininess: 26, specular: '#9bb4d0',
        })
        : new THREE.MeshLambertMaterial({
          map: lookIndex === 1 ? tableTextures.paper : tableTextures.felt,
          color: look.path, vertexColors: true, side: THREE.DoubleSide,
        }),
    );
    mesh.name = 'felt-path';
    terrainGroup.add(mesh);
  }
  terrainGroup.add(createSetDressing(lookIndex, pathTiles, setTiles, tableTextures));
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
talentSprite.renderOrder = 4;
// Ponytail layer behind the body, picked from pre-drawn swings by a spring so it lags and overshoots.
const tailSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteAssets.tails[4], transparent: true, alphaTest: 0.04, depthWrite: false }));
tailSprite.center.set(0.5, 0);
tailSprite.renderOrder = 3;
talent.add(tailSprite);
const shockMark = createShockMark();
const dustPuff = createDustPuff();
talent.add(talentSprite, shockMark, dustPuff);
scene.add(talent);
/** Real-time pose clock and the springs behind her secondary motion. All render-only. */
let talentPoseKind = '';
let talentPoseStart = 0;
let talentClock = 0;
let renderedTalentTier = -1;
let renderedTalentHeight = 3.5;
let walkCycle = 0;
let lastFoot: { x: number; z: number } | null = null;
let smoothSpeed = 0;
const tailSpring = { x: 0, v: 0 };
const leanSpring = { x: 0, v: 0 };
const hemSpring = { x: 0, v: 0 };
/** Body pivot as a fraction of sprite height: about where her coat is belted. */
const WAIST = 0.44;
/** Metres per full stride (two steps): the walk phase advances with distance, so feet don't skate. */
const STRIDE = 1.5;
function syncTalentLod() {
  const tier = state.talent.lodTier ?? Math.min(lodTier(1000 / state.camera.zoom * detailFactor(state.talent.x, state.talent.z)), 3);
  if (tier !== renderedTalentTier) {
    renderedTalentTier = tier;
    talent.visible = tier < 4;
    renderedTalentHeight = tier <= 1 ? 3.5 : tier === 2 ? 2.8 : 2;
  }
  const now = performance.now() / 1000;
  const dt = talentClock ? Math.min(0.1, Math.max(0, now - talentClock)) : 1 / 60;
  talentClock = now;
  const moved = lastFoot ? Math.hypot(state.talent.x - lastFoot.x, state.talent.z - lastFoot.z) : 0;
  lastFoot = { x: state.talent.x, z: state.talent.z };
  const step = moved > 2 ? 0 : moved;
  const kind = talentPose();
  if (kind === 'walk') walkCycle = (walkCycle + step / STRIDE) % 1;
  smoothSpeed += ((dt > 0 ? step / dt : 0) - smoothSpeed) * Math.min(1, dt * 10);
  if (kind !== talentPoseKind) { talentPoseKind = kind; talentPoseStart = now; }
  const age = now - talentPoseStart;
  const height = renderedTalentHeight;
  const facing = talentFacing();
  const map = kind === 'walk' ? spriteAssets.walkCycle[Math.floor(walkCycle * spriteAssets.walkCycle.length) % spriteAssets.walkCycle.length]!
    : kind === 'idle' ? spriteAssets.standBody : spriteAssets[kind];
  if (talentSprite.material.map !== map) talentSprite.material.map = map;
  // Squash, stretch, bob, recoil and topple are eased transforms on the rig, so the drawn parts stay as authored.
  const play = kind === 'walk' ? walkPlay(walkCycle * 4, height) : kind === 'flinch' ? flinchPlay2(age, height, facing)
    : kind === 'fall' ? fallPlay(age, height, facing) : idlePlay(now, height);
  // Follow-through: she leans into her pace and rocks back past upright when she stops.
  const pace = Math.min(1, smoothSpeed / 3);
  const lean = springStep(leanSpring, kind === 'walk' ? 0.05 * pace : 0, dt, 60, 6);
  // The ponytail is thrown back by speed and swings with the stride a beat behind her steps.
  const tailTarget = kind === 'walk' ? 0.35 * pace + 0.55 * Math.sin(walkCycle * Math.PI * 4 - 1.1) : 0;
  const sway = springStep(tailSpring, tailTarget, dt, 90, 5);
  // Coat hem: the body swings a hair about the waist, trailing her pace and the stride, and swinging past on stops.
  const upright = kind === 'walk' || kind === 'idle';
  const hemTarget = kind === 'walk' ? 0.03 * pace + 0.008 * Math.sin(walkCycle * Math.PI * 4 - 0.6) : 0;
  const hem = springStep(hemSpring, hemTarget, dt, 70, 4);
  const width = height * (kind === 'fall' ? 1 : TALENT_ASPECT);
  talentSprite.scale.set(width * facing * play.sx, height * play.sy, 1);
  // Lean still pivots at her feet; the sprite is centred on the waist so the hem swing pivots there.
  const bodyLean = play.lean - facing * lean;
  const waist = WAIST * height * play.sy;
  talentSprite.center.set(0.5, WAIST);
  talentSprite.position.set(-Math.sin(bodyLean) * waist, play.lift + Math.cos(bodyLean) * waist, 0).applyQuaternion(camera.quaternion);
  talentSprite.material.rotation = bodyLean - (upright ? facing * hem : 0);
  tailSprite.visible = kind === 'walk' || kind === 'idle';
  if (tailSprite.visible) {
    const tails = spriteAssets.tails;
    const index = Math.round((Math.max(-1.4, Math.min(1.4, sway)) + 1.4) / 2.8 * (tails.length - 1));
    if (tailSprite.material.map !== tails[index]) tailSprite.material.map = tails[index]!;
    tailSprite.scale.copy(talentSprite.scale);
    tailSprite.center.copy(talentSprite.center);
    tailSprite.position.copy(talentSprite.position);
    tailSprite.material.rotation = talentSprite.material.rotation;
  }
  shockMark.visible = kind === 'flinch';
  if (shockMark.visible) {
    const jitter = Math.sin(age * 26) > 0 ? 1 : 0.92;
    const pop = Math.min(1, age / 0.18);
    shockMark.scale.set(height * 0.5 * jitter * pop, height * 0.5 * jitter * pop, 1);
    // Follow her head through the lean, then float clear above it and a touch behind, away from what she's recoiling from.
    const headX = -Math.sin(play.lean) * height * 0.9;
    // Sprites stand in the camera plane, so the offset is built in view space too.
    shockMark.position.set(headX - facing * height * 0.1, play.lift + Math.cos(play.lean) * height * 0.88, 0).applyQuaternion(camera.quaternion);
  }
  dustPuff.visible = kind === 'fall' && age > 0.38;
  if (dustPuff.visible) {
    const spread = 0.6 + 0.4 * Math.min((age - 0.38) / 0.35, 1);
    dustPuff.scale.set(width * 1.75 * spread, width * 0.42 * spread, 1);
  }
}

/** Read-only pose pick: fall on a failed take, flinch when a hazard is within the close-call radius, idle while waiting. */
function talentPose(): 'walk' | 'idle' | 'flinch' | 'fall' {
  if (poseDemo) return poseDemo;
  if (state.failed === 'hit' || state.failed === 'fell') return 'fall';
  const danger = state.entities.some((entity) => entity.spawned && !entity.cut
    && entity.kind !== 'reel' && entity.kind !== 'monitor' && entity.kind !== 'continuity'
    && Math.hypot(entity.x - state.talent.x, entity.z - state.talent.z) <= TUNING.closeCallRadius);
  if (danger && !state.failed) return 'flinch';
  if (state.waiting || state.failed) return 'idle';
  return 'walk';
}

const facingFrom = new THREE.Vector3();
const facingTo = new THREE.Vector3();
let talentFacingSign = 1;
function talentFacing() {
  const next = state.path[state.talent.pathIndex + 1];
  if (!next) return talentFacingSign;
  const here = displayPoint(state.talent.x, state.talent.z);
  const there = displayPoint(next.x, next.z);
  facingFrom.set(here.x, PATH_RISE, here.z).project(camera);
  facingTo.set(there.x, PATH_RISE, there.z).project(camera);
  const dx = facingTo.x - facingFrom.x;
  if (Math.abs(dx) > 1e-4) talentFacingSign = dx < 0 ? -1 : 1;
  return talentFacingSign;
}

const entityMeshes = new Map<string, THREE.Object3D>();
const transform = new THREE.Object3D();
function batchStaticMeshes(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const materialGeometries = new Map<THREE.Material, Array<{ mesh: THREE.Mesh; geometry: THREE.BufferGeometry }>>();
  const dynamicParts = new Set(['monitor-cone', 'lock-fan-fill', 'lock-fan-rim', 'continuity-prop', 'extras-crowd-0', 'extras-crowd-1', 'extras-crowd-2', 'extras-crowd-3', 'swarm-cloud', 'bridge-planks']);
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
    if (kind === 'red-monitor') group.add(lockFan(entity.range ?? 14, entity.halfAngle ?? 0.5));
    else {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.3, 4, 1, true), new THREE.MeshBasicMaterial({ color: kind === 'monitor' ? '#e2b04a' : '#c8322a', transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    cone.name = 'monitor-cone'; cone.position.set(0, 0.6, 1.2); group.add(cone);
    }
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
/** Render-only debug overrides (window.__cull.poseDemo / lockDemo / lostDemo). They never enter the sim or its hash. */
let poseDemo: 'flinch' | 'fall' | null = null;
let lostDemoTicks: number | null = null;
let lockDemo: number | null = null;
let demoMonitor: CastEntity | null = null;
function renderEntities(): CastEntity[] {
  return demoMonitor ? [...state.entities, demoMonitor] : state.entities;
}
function lockProgress(entity: CastEntity) {
  if (entity === demoMonitor && lockDemo !== null) return lockDemo;
  return Math.min(1, (entity.lockTicks ?? 0) / (TUNING.hostileLockSeconds * TUNING.tickRate));
}
const lockMarkPoint = new THREE.Vector3();
const lockOverlay = new LockOverlay($('#gate'), mount);
// The tally blinks faster as the lock builds: ~2.5 Hz at first, ~14 Hz just before it fails the take.
let tallyPhase = 0;
let tallyOn = false;
let tallyTime = 0;
function advanceTally(now: number) {
  const progress = renderEntities().reduce((max, entity) => entity.kind === 'red-monitor' && entity.spawned && !entity.cut ? Math.max(max, lockProgress(entity)) : max, 0);
  const dt = tallyTime ? Math.min(0.1, (now - tallyTime) / 1000) : 0;
  tallyTime = now;
  if (progress <= 0 || state.failed) { tallyPhase = 0; tallyOn = false; return; }
  const wasOn = tallyOn;
  tallyPhase = (tallyPhase + dt * (2.5 + 11.5 * progress * progress)) % 1;
  tallyOn = lockDemo !== null && demoMonitor ? true : tallyPhase < 0.5;
  if (tallyOn && !wasOn && lockDemo === null) audio.playLockBeep(progress);
}
/** Stable per-entity phase so idle breathing never beats in unison. */
function entityPhase(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h >>> 0) % 1000 / 1000 * Math.PI * 2;
}
/** 0..1 over the last ~250 ms before a hazard's current heading brings it into contact with her. */
function anticipation(entity: CastEntity, reach: number) {
  const dx = state.talent.x - entity.x, dz = state.talent.z - entity.z;
  const distance = Math.hypot(dx, dz);
  const closing = distance > 1e-6 ? (dx * entity.vx + dz * entity.vz) / distance : 0;
  if (closing <= 0.05 || state.failed) return 0;
  const contact = Math.max(0, distance - reach) / closing;
  return contact < 0.25 ? 1 - contact / 0.25 : 0;
}
function urchinPose(entity: CastEntity) {
  const now = performance.now() / 1000;
  const breath = Math.sin(now * 2.4 + entityPhase(entity.id)) * 0.03;
  const ready = anticipation(entity, TUNING.urchinRadius + 0.35);
  const wind = Math.sin(Math.PI * Math.min(1, ready * 1.15));
  return {
    sx: 1 + breath + 0.16 * wind,
    sy: 1 - breath - 0.2 * wind,
    spin: Math.sin(now * 55) * 0.09 * ready,
    lift: -SPRITE_SIZE.urchin * 0.08 * wind,
  };
}
/** Render-only acting on non-urchin cast: breathing, hop squash for rollers, lean and shudder as a lock fills. */
function actEntity(entity: CastEntity, object: THREE.Object3D) {
  const now = performance.now() / 1000;
  const phase = entityPhase(entity.id);
  const breath = 1 + 0.03 * Math.sin(now * 2.2 + phase);
  if (entity.kind === 'glass' || entity.kind === 'bridge') return;
  if (entity.kind === 'boulder' || entity.kind === 'stagehand') {
    // A small hop per metre travelled; it squashes on each landing and stretches at the top.
    const hop = Math.abs(Math.sin((entity.x + entity.z) * (entity.kind === 'boulder' ? 1.4 : 2.2) + phase));
    const landing = (1 - hop) ** 6;
    const moving = Math.min(1, Math.hypot(entity.vx, entity.vz));
    object.position.y += (entity.kind === 'boulder' ? 0.22 : 0.12) * hop * moving;
    const ready = anticipation(entity, (entity.kind === 'boulder' ? TUNING.boulderRadius : 0.5) + 0.35);
    object.scale.set(object.scale.x * (breath + 0.12 * landing * moving + 0.08 * ready), object.scale.y * (2 - breath - 0.16 * landing * moving - 0.1 * ready), object.scale.z);
    return;
  }
  if (entity.kind === 'red-monitor') {
    const progress = lockProgress(entity);
    const eased = progress * progress * (3 - 2 * progress);
    object.rotation.x = 0.16 * eased;
    object.position.x += Math.sin(now * 61 + phase) * 0.05 * progress * progress;
    object.position.z += Math.sin(now * 47 + phase * 2) * 0.04 * progress * progress;
  }
  object.scale.multiplyScalar(breath);
}
function syncEntities(showTransientRings = true) {
  const marks: LockMark[] = [];
  for (const entity of renderEntities()) {
    if (entity.kind === 'urchin') continue;
    if (entity.cut || !entity.spawned) continue;
    let object = entityMeshes.get(entity.id);
    if (!object) { object = buildEntity(entity); entityMeshes.set(entity.id, object); scene.add(object); }
    const point = displayPoint(entity.x, entity.z);
    const spriteEntity = entity.kind === 'boulder' || entity.kind === 'stagehand' || entity.kind === 'reel' || entity.kind === 'extras' || entity.kind === 'continuity';
    object.position.set(point.x, entity.kind === 'swarm' ? 0.55 : PATH_RISE, point.z);
    object.rotation.y = spriteEntity ? 0 : entity.age * 0.015;
    object.scale.set(1, 1, 1);
    if (entity.kind === 'rumour') object.scale.setScalar(Math.max(0.1, entity.radius ?? 0.5));
    if (entity.kind === 'monitor' || entity.kind === 'red-monitor') {
      object.rotation.y = -(entity.heading ?? 0) + Math.PI / 2;
      const cone = object.getObjectByName('monitor-cone');
      if (cone) cone.scale.set(1, 1, Math.min(2, (entity.range ?? 18) / 14));
      const fan = object.getObjectByName('lock-fan');
      if (fan) {
        const progress = lockProgress(entity);
        const on = progress > 0 && tallyOn;
        updateLockFan(fan, progress, on);
        if (!state.failed || entity === demoMonitor) {
          lockMarkPoint.set(point.x, PATH_RISE + SPRITE_SIZE.monitor[1] + 0.9, point.z).project(camera);
          if (Math.abs(lockMarkPoint.x) <= 1.1 && Math.abs(lockMarkPoint.y) <= 1.1) {
            marks.push({ x: (lockMarkPoint.x + 1) / 2 * mount.clientWidth, y: (1 - lockMarkPoint.y) / 2 * mount.clientHeight, progress, on: progress > 0 ? on : false });
          }
        }
      }
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
    actEntity(entity, object);
    object.visible = true;
  }
  lockOverlay.update(marks);
  for (const [id, object] of entityMeshes) {
    const found = renderEntities().find((entity) => entity.id === id);
    if (!found || found.cut || !found.spawned) object.visible = false;
  }
  urchinBuckets.update(state.entities, state.camera.zoom, state.tick, showTransientRings && !window.matchMedia('(prefers-reduced-motion: reduce)').matches, detailFactor, displayPoint, camera.quaternion, urchinPose);
  let shade = 0;
  const putShade = (x: number, z: number, width: number, depth: number) => {
    if (shade >= 512) return;
    transform.position.set(x + 0.46, PATH_RISE + 0.04, z + 0.32);
    transform.rotation.set(-Math.PI / 2, 0.4, 0);
    transform.scale.set(width * 1.35, depth * 0.85, 1);
    transform.updateMatrix();
    castShadows.setMatrixAt(shade++, transform.matrix);
  };
  if (talent.visible) {
    const foot = displayPoint(state.talent.x, state.talent.z);
    putShade(foot.x, foot.z, 1.2, 0.75);
  }
  for (const entity of renderEntities()) {
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
    closeCalls: closeCallsForGrade(state),
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
  const city = sceneLookIndex() === 1;
  keyLight.intensity = night ? 0.25 : 0.4;
  keySpot.color.set(look.key);
  keySpot.intensity = night ? 16 : 34;
  keySpot.position.set(state.camera.x - 9, 18, state.camera.z + 6);
  keySpot.target.position.set(state.camera.x + 6, 0, state.camera.z - 4);
  moon.intensity = night ? 0.9 : 0;
  hemi.intensity = night ? 1.35 : 0.55;
  hemi.color.set(look.hemi);
  hemi.groundColor.set(look.fill);
  floorMaterial.emissive.set(night ? '#152033' : '#000000');
  floorMaterial.shininess = night ? 22 : 2;
  floorMaterial.specular.set(night ? '#8aa4c0' : '#000000');
  $('#gate').classList.toggle('tilt-shift', city);
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
/** `draw = false` lets the real-time loop draw once per display frame, interpolated, instead of once per tick. */
function render(draw = true) {
  audio.update(state);
  advanceTally(performance.now());
  if (draw) { renderViewfinder(); captureContactFrame(); } else captureDue = true;
  updateHud();
}
let captureDue = false;
/** Positions before the latest tick, so a display frame can draw between ticks (render alpha). Render-only. */
const lerpFrom = new Map<string, { x: number; z: number }>();
const lerpTalent = { x: 0, z: 0 };
const lerpCamera = { x: 0, z: 0, zoom: 1 };
function snapshotForLerp() {
  for (const entity of state.entities) {
    const from = lerpFrom.get(entity.id);
    if (from) { from.x = entity.x; from.z = entity.z; } else lerpFrom.set(entity.id, { x: entity.x, z: entity.z });
  }
  lerpTalent.x = state.talent.x; lerpTalent.z = state.talent.z;
  lerpCamera.x = state.camera.x; lerpCamera.z = state.camera.z; lerpCamera.zoom = state.camera.zoom;
}
/** Draws the viewfinder `alpha` of the way from the previous tick to this one, then puts the sim state back untouched. */
function drawInterpolated(alpha: number) {
  const mix = (a: number, b: number) => (Math.abs(b - a) > 3 ? b : a + (b - a) * alpha);
  const saved = state.entities.map((entity) => [entity.x, entity.z] as const);
  const talentAt = [state.talent.x, state.talent.z] as const;
  const cameraAt = [state.camera.x, state.camera.z, state.camera.zoom] as const;
  for (const entity of state.entities) {
    const from = lerpFrom.get(entity.id);
    if (from) { entity.x = mix(from.x, entity.x); entity.z = mix(from.z, entity.z); }
  }
  state.talent.x = mix(lerpTalent.x, state.talent.x); state.talent.z = mix(lerpTalent.z, state.talent.z);
  state.camera.x = mix(lerpCamera.x, state.camera.x); state.camera.z = mix(lerpCamera.z, state.camera.z);
  state.camera.zoom = lerpCamera.zoom + (state.camera.zoom - lerpCamera.zoom) * alpha;
  try {
    renderViewfinder();
    if (captureDue) { captureDue = false; captureContactFrame(); }
  } finally {
    state.entities.forEach((entity, index) => { const at = saved[index]; if (at) { entity.x = at[0]; entity.z = at[1]; } });
    state.talent.x = talentAt[0]; state.talent.z = talentAt[1];
    state.camera.x = cameraAt[0]; state.camera.z = cameraAt[1]; state.camera.zoom = cameraAt[2];
  }
}
const CAST_NAMES: Record<string, string> = {
  urchin: 'spiny ball', boulder: 'rolling rock', glass: 'glass floor', reel: 'film reel', extras: 'crowd',
  swarm: 'moths', stagehand: 'stagehand', bridge: 'rope bridge', rumour: 'growing smoke', monitor: 'friendly camera',
  'red-monitor': 'hostile camera', continuity: 'swappable prop',
};
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
/** Out-of-frame feedback: past the grace the gate flashes, a banner counts down to the cut, the film meter shows the burn and an edge arrow points to her. */
function updateLostHer() {
  const ticks = lostDemoTicks ?? state.talent.offscreenTicks;
  const view = { talent: { ...state.talent, offscreenTicks: ticks } };
  const lost = !state.failed && talentLost(view);
  const gate = $('#gate');
  gate.classList.toggle('talent-lost', lost);
  $('#lost-banner').classList.toggle('hidden', !lost);
  $('#lost-arrow').classList.toggle('hidden', !lost);
  $('#film-drain').hidden = !lost;
  shell.querySelector('.film')!.classList.toggle('draining', lost);
  if (!lost) return;
  const progress = lostProgress(view);
  gate.style.setProperty('--lost', String(progress));
  $('#lost-bar').style.width = `${(1 - progress) * 100}%`;
  $('#lost-count').textContent = `${Math.max(0, TUNING.offscreenFailSeconds - ticks / TUNING.tickRate).toFixed(1)} s TO CUT · FILM BURNING`;
  const aspect = lensAspect(state.lens);
  const at = projectPoint(state.talent.x, state.talent.z, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, aspect);
  const angle = Math.atan2(at.y, at.x);
  // Pin the arrow to the gate edge along the ray from the centre toward her.
  const reach = 0.4 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));
  const arrow = $('#lost-arrow');
  arrow.style.left = `${50 + Math.cos(angle) * reach * 100}%`;
  arrow.style.top = `${50 + Math.sin(angle) * reach * 100}%`;
  arrow.style.setProperty('--angle', `${angle}rad`);
  arrow.style.setProperty('--tag-x', `${-Math.cos(angle) * 34}px`);
  arrow.style.setProperty('--tag-y', `${-Math.sin(angle) * 30}px`);
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
  $('#status').textContent = tutorial.showing ? 'STANDING BY' : state.waiting ? 'HOLDING FOR SET…' : paused ? 'PAUSED' : state.camera.moving ? 'IN MOTION' : 'ROLLING';
  const copy = describeShot(state);
  $('#lod').textContent = copy.gate;
  const cutNoteLive = cutNote && performance.now() < cutNote.until && !state.failed && !talentLost(state);
  $('#message').textContent = !state.failed && invalidReplay ? 'INVALID REPLAY URL' : cutNoteLive ? cutNote!.text : copy.toast;
  if (sliderZoomTarget !== null && Math.abs(sliderZoomTarget - state.camera.zoom) < 0.12) sliderZoomTarget = null;
  const zoomSlider = $('#zoom-slider') as HTMLInputElement;
  zoomSlider.value = String(Math.round(sliderZoomTarget ?? state.camera.zoom));
  zoomSlider.disabled = state.lens === 'long-lens';
  $('#call-sheet').textContent = callSheetLines();
  updateLostHer();
  const filmBar = shell.querySelector<HTMLElement>('.film-track')!;
  filmBar.style.setProperty('--remaining', `${Math.max(0, state.film / 90 * 100)}%`);
  if (state.failed) {
    const endings: Record<string, string> = { 'lost-talent': 'LOST HER', hit: 'HIT', fell: 'SHE FELL', 'out-of-film': 'OUT OF FILM', wrapped: "THAT'S A WRAP" };
    $('#end-title').textContent = endings[state.failed] ?? 'CUT';
    $('#end-detail').textContent = `Take ${String(state.seed).padStart(5, '0')} · ${Math.floor(state.totalDistance)} metres · ${state.cuts.length} cuts`;
    $('#end-card').classList.remove('hidden');
    void saveRunSummary();
  }
}

function buildInput(): InputFrame {
  const composed = composeInput({
    keys, holdButton, dragTarget, rotationPulse, frameInput, zoomTarget: sliderZoomTarget,
    zoomPress: zoomPress && { direction: zoomPress.direction, heldSeconds: (performance.now() - zoomPress.since) / 1000 },
  }, state);
  sliderZoomTarget = composed.zoomTarget;
  // A lifted drag settles onto where the finger left the world, then stops: no residual drift.
  if (dragTarget && !pointer && dragSettled(state, dragTarget)) dragTarget = null;
  return assistInput(composed.input, state);
}
function advanceTick(forcedInput?: InputFrame) {
  // A tutorial card blocks the take: no ticks run, so nothing can reach her while it is read.
  if (!paused && !tutorial.showing && !state.failed) {
    const input = replayData ? replayData.frames[replayIndex++] ?? NEUTRAL_INPUT : bot ? inputForBot(state, bot, botRandom) : forcedInput ?? buildInput();
    inputLog.push(input);
    const previousCuts = state.cuts.length;
    const previousCloseCalls = state.closeCalls;
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
    if (state.closeCalls > previousCloseCalls) {
      pendingCloseCall = true;
      for (const entity of newlyCut) {
        if (['reel', 'monitor', 'red-monitor', 'continuity'].includes(entity.kind)) continue;
        pendingCloseCallRank = Math.min(pendingCloseCallRank, Math.hypot(entity.x - previousTalent.x, entity.z - previousTalent.z));
      }
    }
    const cutHazard = newlyCut.find((entity) => !['reel', 'monitor', 'red-monitor', 'continuity'].includes(entity.kind));
    const redressed = previousEntities.some((before) => before.cut && state.entities.some((after) => after.id === before.id && !after.cut && after.gate !== undefined));
    if (redressed) cutNote = { text: 'Shot called: the stand-in is back on its mark. Cut it close to her.', until: performance.now() + 3000 };
    if (state.score > previousScore && !cutHazard) audio.playCue('reel');
    else if (cutHazard) {
      audio.playCue('cut');
      // Only a cut within close-call reach of her counts for the close-call bonus and the defang mark: say so when it was too far.
      const far = state.closeCalls === previousCloseCalls;
      showCut(cutHazard, far ? 'TOO FAR' : 'CUT');
      if (far) cutNote = { text: 'Cut — but too far from her. Only a cut close to her scores or clears a defang mark.', until: performance.now() + 2500 };
    } else if (state.cuts.length > previousCuts) audio.playCue('cut');
    else if (state.entities.filter((entity) => entity.spawned && !entity.cut).length > previousSpawned) audio.playCue('pop');
    else if (state.talent.lodTier !== previousTalentTier || state.entities.some((entity) => entity.lodTier !== previousEntityTiers.get(entity.id))) audio.playCue('lod');
    if (!previousWrap && state.shoot?.wrapCaught) audio.playCue('wrap');
  }
  audio.update(state);
  frameInput = { ...NEUTRAL_INPUT };
  rotationPulse = 0;
}
function showCut(entity: { x: number; z: number }, label: 'CUT' | 'TOO FAR') {
  $('#cut-stamp').textContent = label;
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
  snapshotForLerp();
  advanceTick();
  render(false);
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
  // Super 8 keeps its deliberate stutter; every other lens draws at display rate between ticks.
  if (ticksPerRender === 1) drawInterpolated(Math.min(1, simAccumulator / tickInterval));
  else if (captureDue) { captureDue = false; renderViewfinder(); captureContactFrame(); }
  requestAnimationFrame(loop);
}
let holdButton = false;
window.addEventListener('keydown', (event) => {
  unlockAudio();
  if (tutorial.showing) {
    if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); if (!event.repeat) advanceTutorial(); }
    return;
  }
  if ([' ', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) event.preventDefault();
  keys.add(event.key.toLowerCase());
  const zoomDirection = zoomKeyDirection(event.key);
  if (zoomDirection && !event.repeat) startZoomPress(zoomDirection);
  if (!event.repeat && event.key.toLowerCase() === 'q') rotationPulse = -1;
  if (!event.repeat && event.key.toLowerCase() === 'e') rotationPulse = 1;
  if (event.key === 'Escape' || event.key.toLowerCase() === 'p') paused = !paused;
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.key.toLowerCase());
  if (zoomKeyDirection(event.key) === zoomPress?.direction) zoomPress = null;
});
window.addEventListener('blur', () => { zoomPress = null; });
const touches = new Map<number, { x: number; y: number }>();
let pinch: { distance: number; zoom: number } | null = null;
const touchSpread = () => { const [a, b] = [...touches.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
const zoomKeyDirection = (key: string): 1 | -1 | 0 => (['x', '=', '+'].includes(key.toLowerCase()) ? 1 : ['z', '-', '_'].includes(key.toLowerCase()) ? -1 : 0);
/** A tap: snap to the next framing step, chaining from a snap still in progress so a double tap goes two steps. */
function stepZoom(direction: 1 | -1) {
  if (state.lens !== 'long-lens') sliderZoomTarget = nextZoomStep(sliderZoomTarget ?? state.camera.zoom, direction);
}
function startZoomPress(direction: 1 | -1) {
  stepZoom(direction);
  zoomPress = { direction, since: performance.now() };
}
renderer.domElement.addEventListener('pointerdown', (event) => {
  unlockAudio();
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  try { renderer.domElement.setPointerCapture(event.pointerId); } catch { /* synthetic touch events have no browser pointer capture */ }
  if (touches.size >= 2) {
    // A second finger turns the drag into a pinch: the camera holds its pan while the spread sets the zoom.
    pointer = null; dragTarget = null;
    pinch = { distance: Math.max(1, touchSpread()), zoom: sliderZoomTarget ?? state.camera.zoom };
  } else {
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    dragTarget = { x: state.camera.x, z: state.camera.z };
  }
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (!touches.has(event.pointerId)) return;
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
  if (pinch) {
    if (state.lens !== 'long-lens') sliderZoomTarget = pinchZoomTarget(pinch.zoom, pinch.distance, touchSpread());
    return;
  }
  if (!pointer || pointer.id !== event.pointerId) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const dx = event.clientX - pointer.x;
  const dy = event.clientY - pointer.y;
  dragTarget = dragCameraTarget(dragTarget ?? { x: state.camera.x, z: state.camera.z }, dx, dy, rect.width, rect.height, state);
  pointer.x = event.clientX; pointer.y = event.clientY;
});
for (const type of ['pointerup', 'pointercancel'] as const) {
  renderer.domElement.addEventListener(type, (event) => {
    touches.delete(event.pointerId);
    if (touches.size < 2) pinch = null;
    // Lifting one finger of a pinch hands the drag back to the finger still down, from where it is now.
    const [rest] = [...touches.entries()];
    pointer = rest && !pinch ? { id: rest[0], x: rest[1].x, y: rest[1].y } : null;
  });
}
renderer.domElement.addEventListener('wheel', (event) => {
  event.preventDefault();
  // One framing step per wheel notch; a trackpad's burst of small deltas still steps at most every 120 ms.
  if (!event.deltaY || performance.now() - lastWheelStep < 120) return;
  lastWheelStep = performance.now();
  stepZoom(event.deltaY < 0 ? 1 : -1);
}, { passive: false });
document.addEventListener('visibilitychange', () => { if (document.hidden) paused = true; });
$('#hold').addEventListener('pointerdown', () => { holdButton = true; frameInput.hold = true; });
for (const type of ['pointerup', 'pointercancel', 'pointerleave']) $('#hold').addEventListener(type, () => { holdButton = false; frameInput.hold = false; });
$('#rotate-left').addEventListener('click', () => { rotationPulse = -1; });
$('#rotate-right').addEventListener('click', () => { rotationPulse = 1; });
for (const [id, direction] of [['#zoom-in', 1], ['#zoom-out', -1]] as const) {
  const button = $(id);
  button.addEventListener('pointerdown', (event) => { event.preventDefault(); unlockAudio(); startZoomPress(direction); });
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) button.addEventListener(type, () => { if (zoomPress?.direction === direction) zoomPress = null; });
  // Keyboard activation (Enter/Space on the focused button) has no pointer: treat it as a tap.
  button.addEventListener('click', (event) => { if (event.detail === 0) stepZoom(direction); });
}
// Keep the page itself still: drags and pinches on the viewfinder and the camera controls belong to the camera, never to browser scroll or zoom.
for (const surface of [$('#gate'), $('.controlbar')]) surface.addEventListener('touchmove', (event) => { event.preventDefault(); }, { passive: false });
document.addEventListener('touchmove', (event) => { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });
for (const type of ['gesturestart', 'gesturechange']) document.addEventListener(type, (event) => { event.preventDefault(); });
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
  reelsCollected = 0; monitorUses = 0; monitorWasActive = false; reelIds.clear();
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
  Object.assign(window, { __cull: { step: (n = 1) => { for (let i = 0; i < n; i++) advanceTick(); render(); }, input: (input: InputFrame) => { frameInput = input; }, hash: () => stateHash(state), state: () => structuredClone(state), diagnostics: () => ({ paused, keys: [...keys], hidden: document.hidden, focused: document.hasFocus(), dprTier, dragTarget: dragTarget && { ...dragTarget } }), performance: () => ({ drawCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles }), lod: () => urchinBuckets.diagnostics(), load: (seed: number) => { state = createGeneratedState(seed); terrainTiles = null; urchinBuckets.reset(); }, loadShootScene: (sceneIndex: number) => { state = createShootSceneState(state.seed, sceneIndex); terrainTiles = null; urchinBuckets.reset(); render(); }, finishForShare: () => { state.failed = 'hit'; render(); }, loadLodDemo: () => { state = createGeneratedState(1, 0, 2); state.entities = [{ id: 'lod-demo-urchin', kind: 'urchin', x: 0, z: 2, vx: 0, vz: 0, spawned: true, cut: false, age: 0 }]; state.talent.x = -4; render(); }, setTier: (tier: number) => { const size = [64, 36, 17, 7, 2][tier] ?? 36; state.camera.zoom = TUNING.urchinRadius * 1000 / size; }, setCamera: (x: number, z: number, zoom: number) => { state.camera.x = x; state.camera.z = z; state.camera.zoom = zoom; }, poseDemo: (kind: 'flinch' | 'fall' | null = null) => { poseDemo = kind; render(); }, lostDemo: (seconds: number | null = null) => { lostDemoTicks = seconds === null ? null : Math.round(Math.max(0, seconds) * TUNING.tickRate); render(); }, talentScreen: () => { const rect = renderer.domElement.getBoundingClientRect(); const at = (v: THREE.Vector3) => { const p = v.clone().project(camera); return { x: rect.left + (p.x + 1) / 2 * rect.width, y: rect.top + (1 - p.y) / 2 * rect.height }; }; const foot = at(talent.getWorldPosition(new THREE.Vector3())); const head = at(talent.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, renderedTalentHeight, 0))); return { foot, head, mark: at(shockMark.getWorldPosition(new THREE.Vector3())), lean: talentSprite.material.rotation, flip: talentSprite.scale.x < 0 }; }, lockDemo: (progress: number | null = null) => {
    lockDemo = progress === null ? null : Math.max(0, Math.min(1, progress));
    demoMonitor = lockDemo === null ? null : { id: 'demo-red-monitor', kind: 'red-monitor', x: state.talent.x + 5, z: state.talent.z - 3.5, vx: 0, vz: 0, spawned: true, cut: false, age: 0, heading: Math.atan2(3.5, -5), range: 8, halfAngle: 0.45 };
    render();
  }, tutorial: () => ({ step: tutorial.step, steps: tutorial.steps, showing: tutorial.showing, paused: paused || tutorial.showing }), silhouettes: () => measureSilhouettes({ urchin: spriteAssets.urchinTiers[2]!, boulder: spriteAssets.boulder, glass: spriteAssets.glass, extras: spriteAssets.extras[0]!, swarm: spriteAssets.swarmMoth, rumour: spriteAssets.rumour, stagehand: spriteAssets.stagehand, monitor: spriteAssets.monitorTeal, redMonitor: spriteAssets.monitorRed, continuity: spriteAssets.continuity[2]!, talent: spriteAssets.walk[0]! }) } });
}

new ResizeObserver(() => {
  const rect = mount.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), true);
  render();
}).observe(mount);
render();
function showTutorialStep() {
  const last = tutorial.step >= tutorial.steps - 1;
  $('#tutorial-kicker').textContent = tutorial.step === 0 ? `SCENE 01 · TAKE 01${tutorial.steps > 1 ? ` · 1/${tutorial.steps}` : ''}` : `HOW TO SHOOT · ${tutorial.step + 1}/${tutorial.steps}`;
  $('#tutorial-text').textContent = TUTORIAL_STEPS[tutorial.step]!;
  $('#tutorial-next').textContent = last ? 'ROLL CAMERA ▶' : 'CONTINUE ▶';
  $('#title-card').classList.toggle('hidden', tutorial.step !== 0);
}
function advanceTutorial() {
  if (!tutorial.showing) return;
  unlockAudio();
  if (tutorial.step < tutorial.steps - 1) { tutorial.step++; showTutorialStep(); return; }
  tutorial.showing = false;
  // Drop the time spent reading so the first frame after the card does not try to catch up.
  previousTime = 0; simAccumulator = 0;
  shell.classList.remove('tutorial-open');
  $('#tutorial').classList.add('hidden');
  $('#title-card').classList.add('hidden');
  try { window.localStorage.setItem('cull.tutorial.v1', 'seen'); } catch { /* The full tutorial shows again next visit. */ }
  render();
}
if (!frozen && !bot && !replayData) {
  let seen = false;
  try { seen = window.localStorage.getItem('cull.tutorial.v1') === 'seen'; } catch { /* Treat as a first visit. */ }
  // A first visit walks every coach card; a return visit only waits on the slate.
  tutorial.steps = seen ? 1 : TUTORIAL_STEPS.length;
  tutorial.showing = true;
  shell.classList.add('tutorial-open');
  $('#tutorial').classList.remove('hidden');
  showTutorialStep();
  $('#tutorial-next').addEventListener('click', advanceTutorial);
  render();
}
if (!frozen) requestAnimationFrame(loop);
