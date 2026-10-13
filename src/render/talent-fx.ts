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
 * Squash & stretch across the 4-frame walk. Frames 0 and 2 are contacts (squash ~0.88 Y / 1.10 X), 1 and 3 are
 * passing (stretch ~1.08 Y / 0.94 X, lifted). `phase` is continuous in frames, so the scale eases between them.
 */
export function walkPlay(phase: number, height: number): TalentPlay {
  const c = Math.cos(Math.PI * (phase - 0.5));
  // Hold a little longer at the extremes so the pose reads before it eases away.
  const k = Math.sign(c) * Math.abs(c) ** 0.6;
  return { sx: 1.02 + 0.08 * k, sy: 0.98 - 0.1 * k, lift: height * 0.065 * (1 - k) / 2, lean: 0 };
}

/** Flinch: snap back away from travel, hop and pop in the first ~10 frames, then hold the lean. */
export function flinchPlay(age: number, height: number, facing: number): TalentPlay {
  const pop = age < 10 ? Math.sin(Math.PI * age / 10) : 0;
  return { sx: 1 - 0.08 * pop, sy: 1 + 0.12 * pop, lift: height * 0.1 * pop, lean: facing * (0.2 + 0.1 * pop) };
}

export function restPlay(): TalentPlay {
  return REST;
}

function inkCanvas(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!;
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
