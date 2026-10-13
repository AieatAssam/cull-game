import * as THREE from 'three';
import { PALETTE } from './dailies';

/**
 * Render-time acting for the Talent puppet. Presentation only: these read the pose and a frame age and return
 * transforms or small ink props; the walk textures (and the silhouettes they're measured by) stay untouched.
 */

export interface TalentPlay {
  sx: number;
  sy: number;
  lift: number;
  lean: number;
}

const REST: TalentPlay = { sx: 1, sy: 1, lift: 0, lean: 0 };

/**
 * Squash & stretch across the 4-frame walk. Frames 0 and 2 are contacts (squash ~0.955 Y / 1.03 X), 1 and 3 are
 * passing (stretch ~1.045 Y / 0.97 X, lifted). `phase` is continuous in frames, so the scale eases between them.
 */
export function walkPlay(phase: number, height: number): TalentPlay {
  const c = Math.cos(Math.PI * (phase - 0.5));
  // Hold a little longer at the extremes so the pose reads before it eases away.
  const k = Math.sign(c) * Math.abs(c) ** 0.6;
  return { sx: 1 + 0.03 * k, sy: 1 - 0.045 * k, lift: height * 0.035 * (1 - k) / 2, lean: 0 };
}

/** Flinch: snap back away from travel, hop and pop in the first ~10 frames, then hold the lean. */
export function flinchPlay(age: number, height: number, facing: number): TalentPlay {
  const pop = age < 10 ? Math.sin(Math.PI * age / 10) : 0;
  return { sx: 1 - 0.08 * pop, sy: 1 + 0.12 * pop, lift: height * 0.1 * pop, lean: facing * (0.2 + 0.1 * pop) };
}

export function restPlay(): TalentPlay {
  return REST;
}

const easeOutBack = (t: number) => 1 + 2.4 * (t - 1) ** 3 + 1.4 * (t - 1) ** 2;
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

/** Idle: slow breathing, ~0.28 Hz, chest up = a hair taller and narrower. */
export function idlePlay(seconds: number, height: number): TalentPlay {
  const b = Math.sin(seconds * Math.PI * 2 * 0.28);
  return { sx: 1 - 0.012 * b, sy: 1 + 0.02 * b, lift: height * 0.004 * (b + 1), lean: 0 };
}

/**
 * Flinch over real time: a 90 ms anticipation crouch, an overshooting recoil up and back, then a trembling hold.
 * `seconds` since the flinch began.
 */
export function flinchPlay2(seconds: number, height: number, facing: number): TalentPlay {
  const crouch = clamp01(seconds / 0.09);
  const recoil = clamp01((seconds - 0.09) / 0.26);
  const pre = seconds < 0.09 ? Math.sin(crouch * Math.PI / 2) : 1 - easeOutBack(recoil);
  const pop = seconds < 0.09 ? 0 : Math.sin(Math.PI * clamp01((seconds - 0.09) / 0.3));
  const tremble = seconds > 0.4 ? Math.sin(seconds * 46) * 0.012 : 0;
  return {
    sx: 1 + 0.1 * pre - 0.07 * pop,
    sy: 1 - 0.14 * pre + 0.12 * pop,
    lift: height * 0.11 * pop,
    lean: facing * (0.22 * easeOutBack(recoil) + 0.06 * pop + tremble),
  };
}

/**
 * Fall over real time on the square fallen texture: starts tipped back near upright, topples with gravity ease-in,
 * lands with a squash and two small bounces. The fallen art lies with her feet to the right, so +lean stands it up.
 */
export function fallPlay(seconds: number, height: number, facing: number): TalentPlay {
  const t = clamp01(seconds / 0.42);
  const tip = (1 - t * t) * 1.15;
  const after = Math.max(0, seconds - 0.42);
  const bounce = Math.abs(Math.sin(after * 15)) * Math.exp(-after * 9);
  const land = seconds > 0.42 ? Math.exp(-after * 14) : 0;
  return { sx: 1 + 0.1 * land, sy: 1 - 0.14 * land, lift: height * 0.06 * bounce, lean: facing * tip };
}

/** One critically-under-damped spring step: overshoots and settles, so hair and cloth lag motion and swing past stops. */
export function springStep(spring: { x: number; v: number }, target: number, dt: number, stiffness = 110, damping = 7) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    spring.v += (stiffness * (target - spring.x) - damping * spring.v) * h;
    spring.x += spring.v * h;
  }
  return spring.x;
}

function inkCanvas(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  draw(ctx);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function drop(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, tilt: number) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(tilt);
  ctx.beginPath();
  ctx.moveTo(0, -size * 1.5);
  ctx.quadraticCurveTo(size * 1.05, -size * 0.1, size * 0.85, size * 0.45);
  ctx.arc(0, size * 0.45, size * 0.85, 0, Math.PI);
  ctx.quadraticCurveTo(-size * 1.05, -size * 0.1, 0, -size * 1.5);
  ctx.closePath();
  ctx.lineWidth = 9; ctx.strokeStyle = PALETTE.paper; ctx.stroke();
  ctx.fillStyle = '#8fc6e8'; ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = PALETTE.ink; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.ellipse(-size * 0.3, size * 0.1, size * 0.18, size * 0.32, -0.3, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** A hand-inked "!" with two sweat drops, floated above her head while she flinches. */
export function createShockMark(): THREE.Sprite {
  const map = inkCanvas(128, 128, (ctx) => {
    // Tapered bar: paper halo first so it reads on felt and plywood alike.
    const bar = () => {
      ctx.beginPath();
      ctx.moveTo(52, 14); ctx.lineTo(76, 12); ctx.lineTo(68, 78); ctx.lineTo(60, 79); ctx.closePath();
    };
    ctx.lineWidth = 12; ctx.strokeStyle = PALETTE.paper; bar(); ctx.stroke();
    ctx.beginPath(); ctx.arc(64, 98, 15, 0, Math.PI * 2); ctx.fillStyle = PALETTE.paper; ctx.fill();
    ctx.fillStyle = PALETTE.ink; bar(); ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = PALETTE.ink; ctx.stroke();
    ctx.beginPath(); ctx.arc(64, 98, 9, 0, Math.PI * 2); ctx.fill();
    // Little shock ticks either side.
    ctx.lineWidth = 9; ctx.strokeStyle = PALETTE.paper;
    const ticks = [[34, 30, 22, 18], [30, 52, 14, 50], [94, 30, 106, 18]] as const;
    for (const [x0, y0, x1, y1] of ticks) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    ctx.lineWidth = 4; ctx.strokeStyle = PALETTE.ink;
    for (const [x0, y0, x1, y1] of ticks) { ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    drop(ctx, 100, 66, 11, 0.35);
    drop(ctx, 108, 98, 8, 0.5);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, depthTest: false }));
  sprite.center.set(0.5, 0);
  sprite.renderOrder = 6;
  sprite.visible = false;
  return sprite;
}

/** A low, lumpy dust cloud that the fall lands in; drawn as overlapping paper puffs with an ink scallop edge. */
export function createDustPuff(): THREE.Sprite {
  const map = inkCanvas(256, 96, (ctx) => {
    const puffs = [[40, 64, 22], [78, 54, 28], [124, 50, 32], [170, 54, 28], [212, 64, 22], [100, 72, 22], [150, 72, 22]] as const;
    const fill = (radiusPad: number, style: string) => {
      ctx.fillStyle = style;
      ctx.beginPath();
      for (const [x, y, r] of puffs) { ctx.moveTo(x + r + radiusPad, y); ctx.arc(x, y, r + radiusPad, 0, Math.PI * 2); }
      ctx.fill();
    };
    fill(4, PALETTE.ink);
    fill(0, '#e6d4b0');
    // Inner shade lumps give the cloud some volume.
    ctx.fillStyle = 'rgba(138,90,58,0.28)';
    for (const [x, y, r] of puffs) { ctx.beginPath(); ctx.arc(x + r * 0.2, y + r * 0.3, r * 0.55, 0, Math.PI * 2); ctx.fill(); }
    // Flying specks.
    ctx.fillStyle = PALETTE.ink;
    for (const [x, y, r] of [[18, 30, 4], [236, 28, 4], [60, 16, 3], [196, 14, 3], [128, 10, 3.5]] as const) {
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, alphaTest: 0.04, depthWrite: false }));
  // Drawn just behind her (her sprite sits at renderOrder 4) so she lies in the cloud rather than under it.
  sprite.center.set(0.5, 0.32);
  sprite.renderOrder = 3;
  sprite.visible = false;
  return sprite;
}

/**
 * The ACTION exit telegraph (loop review 2026-10-13 round 2): three inked chevrons on the floor at her feet, pointing
 * the way she will walk off her mark. A flat mesh in the floor plane, pointing +X; the caller turns it about Y.
 */
export function createExitArrow(): THREE.Mesh {
  const map = inkCanvas(256, 96, (ctx) => {
    const chevron = (x: number) => { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x + 34, 48); ctx.lineTo(x, 78); };
    for (const x of [62, 122, 182]) {
      ctx.lineWidth = 22; ctx.strokeStyle = PALETTE.ink; chevron(x); ctx.stroke();
      ctx.lineWidth = 12; ctx.strokeStyle = PALETTE.brass; chevron(x); ctx.stroke();
    }
  });
  const geometry = new THREE.PlaneGeometry(1, 0.375);
  geometry.rotateX(-Math.PI / 2);
  // The arrow starts at her feet and runs ahead of her.
  geometry.translate(0.5, 0, 0);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map, transparent: true, alphaTest: 0.04, depthWrite: false, depthTest: false }));
  // Over the floor and path, under her body (renderOrder 4).
  mesh.renderOrder = 2;
  mesh.visible = false;
  return mesh;
}
