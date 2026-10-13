import * as THREE from 'three';
import type { SpriteAssets } from './sprite-assets';

/** Locked Dailies palette. Scene sets change; Talent carmine and hazard clay stay put. */
export const PALETTE = {
  ink: '#1e1a17',
  paper: '#f3ead7',
  plywood: '#c9a46b',
  felt: '#3f6b4f',
  carmine: '#c8322a',
  clay: '#d4846a',
  brass: '#e2b04a',
  burn: '#ff7a1a',
  earth: '#8a5a3a',
  violet: '#6d6487',
} as const;

export interface SceneLook {
  sky: string;
  ground: string;
  path: string;
  block: string;
  key: string;
  fill: string;
  hemi: string;
}

export const SCENE_LOOKS: SceneLook[] = [
  { sky: '#f0d7b0', ground: '#c9a46b', path: '#3f6b4f', block: '#a56b3c', key: '#ffd9a0', fill: '#8d6b4a', hemi: '#fff1dc' },
  { sky: '#d5e6ee', ground: '#7eaea4', path: '#f4ead4', block: '#c4513a', key: '#fff6e4', fill: '#5d7c99', hemi: '#e7f3f6' },
  { sky: '#141a24', ground: '#31445c', path: '#c9a46b', block: '#3d4e68', key: '#ffb347', fill: '#243044', hemi: '#8ea6c2' },
  { sky: '#1a120e', ground: '#4a3024', path: '#c8322a', block: '#2a1c16', key: '#ffd9a0', fill: '#3a2418', hemi: '#3a2a22' },
];

export interface DailiesCast extends SpriteAssets {
  walk: [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture];
  /** Tail-less body: 16 walk phases and a standing pose; `tails` are the ponytail layer at evenly spaced swings. */
  walkCycle: THREE.Texture[];
  standBody: THREE.Texture;
  tails: THREE.Texture[];
  /** Breathing in, breathing out: plays while she waits. */
  idle: [THREE.Texture, THREE.Texture];
  /** Arms up, eyes wide: a hazard is inside the close-call radius. */
  flinch: THREE.Texture;
  /** Toppled over: the take failed on a hit or a fall. */
  fall: THREE.Texture;
  plywood: THREE.Texture;
}

type Ctx = CanvasRenderingContext2D;
type Rand = () => number;
/** x, y, w, h in design units. */
type Box = [number, number, number, number];

/** Cast art is drawn in a 128-unit design space and rasterised at CAST_SIZE. */
const U = 128;
const CAST_SIZE = 256;

function ctx2d(canvas: HTMLCanvasElement): Ctx {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  return ctx;
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

/** Raw pixel-space texture, used for set dressing. */
function texture(draw: (ctx: Ctx, size: number) => void, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = ctx2d(canvas);
  draw(ctx, size);
  return toTexture(canvas);
}

function rng(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rgbOf(color: string): [number, number, number] {
  if (color.startsWith('rgb')) {
    const [r = 0, g = 0, b = 0] = color.replace(/[^\d,]/g, '').split(',').map(Number);
    return [r, g, b];
  }
  const n = parseInt(color.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Shade a palette colour toward ink (t < 0) or lift it toward paper (t > 0). */
function tint(color: string, t: number): string {
  const [r, g, b] = rgbOf(color);
  const [tr, tg, tb] = rgbOf(t < 0 ? PALETTE.ink : PALETTE.paper);
  const k = Math.abs(t);
  return `rgb(${Math.round(r + (tr - r) * k)},${Math.round(g + (tg - g) * k)},${Math.round(b + (tb - b) * k)})`;
}

function rgba(color: string, alpha: number): string {
  const [r, g, b] = rgbOf(color);
  return `rgba(${r},${g},${b},${alpha})`;
}

interface Finish {
  /** Outer ink outline, in design units. */
  ink?: number;
  /** Paper halo outside the ink so the cast lifts off every set. */
  halo?: number;
  haloAlpha?: number;
  /** Soft contact shadow: cx, cy, rx, ry. */
  shadow?: Box;
  /** Fine parts (needles) drawn after the outline pass, tucked underneath, so their tips stay sharp. */
  under?: (ctx: Ctx, r: Rand) => void;
}

function silhouette(src: HTMLCanvasElement, color: string, alpha: number) {
  const canvas = document.createElement('canvas');
  canvas.width = src.width;
  canvas.height = src.height;
  const ctx = ctx2d(canvas);
  ctx.drawImage(src, 0, 0);
  ctx.globalCompositeOperation = 'source-in';
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return canvas;
}

/** One consistent outer ink line and paper halo for every cast member, by dilating the silhouette. */
function finishCast(canvas: HTMLCanvasElement, f: Finish) {
  const k = canvas.width / U;
  const ctx = ctx2d(canvas);
  const ink = (f.ink ?? 1.7) * k;
  const halo = (f.halo ?? 1.3) * k;
  const inkSil = silhouette(canvas, PALETTE.ink, 1);
  const haloSil = halo > 0 ? silhouette(canvas, PALETTE.paper, f.haloAlpha ?? 0.92) : null;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-over';
  const ring = (img: HTMLCanvasElement, r: number) => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      ctx.drawImage(img, Math.cos(a) * r, Math.sin(a) * r);
    }
  };
  ring(inkSil, ink * 0.5);
  ring(inkSil, ink);
  if (haloSil) ring(haloSil, ink + halo);
  if (f.shadow) {
    const [cx, cy, rx, ry] = f.shadow;
    ctx.translate(cx * k, cy * k);
    ctx.scale(rx * k, ry * k);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, rgba(PALETTE.ink, 0.42));
    g.addColorStop(0.6, rgba(PALETTE.ink, 0.18));
    g.addColorStop(1, rgba(PALETTE.ink, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * `aspect` is the width/height of the sprite this texture is shown on (SPRITE_SIZE). The art is drawn
 * undistorted on a square canvas; the UV window is cropped or padded around the centre to match.
 */
function cast(draw: (ctx: Ctx, r: Rand) => void, finish: Finish | null = {}, seed = 7, aspect = 1): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CAST_SIZE;
  const ctx = ctx2d(canvas);
  ctx.scale(CAST_SIZE / U, CAST_SIZE / U);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx, rng(seed));
  if (finish) finishCast(canvas, finish);
  if (finish?.under) {
    const layer = document.createElement('canvas');
    layer.width = layer.height = CAST_SIZE;
    const lctx = ctx2d(layer);
    lctx.scale(CAST_SIZE / U, CAST_SIZE / U);
    lctx.lineJoin = 'round';
    lctx.lineCap = 'round';
    finish.under(lctx, rng(seed + 1));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(layer, 0, 0);
    ctx.restore();
  }
  const map = toTexture(canvas);
  map.repeat.set(aspect, 1);
  map.offset.set((1 - aspect) / 2, 0);
  return map;
}

function rr(x: number, y: number, w: number, h: number, r: number, p = new Path2D()) {
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}

function oval(cx: number, cy: number, rx: number, ry: number, rot = 0) {
  const p = new Path2D();
  p.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
  return p;
}

/** Felt/wool nap: short light and dark fibres. */
function fibre(ctx: Ctx, box: Box, r: Rand, n: number, alpha = 0.16, len = 2.2) {
  const [x, y, w, h] = box;
  ctx.lineWidth = 0.45;
  for (let i = 0; i < n; i++) {
    const px = x + r() * w;
    const py = y + r() * h;
    const a = r() * Math.PI;
    const l = len * (0.5 + r());
    ctx.strokeStyle = r() < 0.5 ? rgba(PALETTE.paper, alpha) : rgba(PALETTE.ink, alpha);
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    ctx.stroke();
  }
}

/** Key light from the upper left, falling to a darker edge at the lower right. */
function light(ctx: Ctx, box: Box, amount = 1, hx = 0.3, hy = 0.25) {
  const [x, y, w, h] = box;
  const cx = x + w * hx;
  const cy = y + h * hy;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(w, h) * 0.85);
  g.addColorStop(0, rgba(PALETTE.paper, 0.36 * amount));
  g.addColorStop(0.4, rgba(PALETTE.paper, 0));
  g.addColorStop(0.6, rgba(PALETTE.ink, 0));
  g.addColorStop(1, rgba(PALETTE.ink, 0.46 * amount));
  ctx.fillStyle = g;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
}

interface PartOpts { line?: number; fibre?: number; light?: number; hx?: number; hy?: number }

function part(ctx: Ctx, path: Path2D, base: string, box: Box, r: Rand, o: PartOpts = {}) {
  ctx.fillStyle = base;
  ctx.fill(path);
  ctx.save();
  ctx.clip(path);
  light(ctx, box, o.light ?? 1, o.hx, o.hy);
  const density = o.fibre ?? 0.35;
  if (density > 0) fibre(ctx, box, r, Math.round(box[2] * box[3] * density));
  ctx.restore();
  const line = o.line ?? 1.4;
  if (line > 0) {
    ctx.lineWidth = line;
    ctx.strokeStyle = PALETTE.ink;
    ctx.stroke(path);
  }
}

function stitch(ctx: Ctx, path: Path2D, color: string, width = 0.75) {
  ctx.save();
  ctx.setLineDash([1.7, 1.3]);
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke(path);
  ctx.restore();
}

function line(ctx: Ctx, pts: number[], color: string, width: number) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(pts[0]!, pts[1]!);
  if (pts.length === 6) ctx.quadraticCurveTo(pts[2]!, pts[3]!, pts[4]!, pts[5]!);
  else for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i]!, pts[i + 1]!);
  ctx.stroke();
}

/** A sewn fold: dark crease with a lit ridge beside it. */
function fold(ctx: Ctx, pts: number[], base: string, alpha = 1) {
  line(ctx, pts, rgba(tint(base, -0.5), 0.8 * alpha), 1.2);
  line(ctx, pts.map((v, i) => (i % 2 === 0 ? v - 1 : v)), rgba(tint(base, 0.4), 0.6 * alpha), 0.6);
}

/** Wood grain along the long axis of a box. */
function grain(ctx: Ctx, box: Box, r: Rand, base: string, vertical = false) {
  const [x, y, w, h] = box;
  const across = vertical ? w : h;
  ctx.lineWidth = 0.55;
  for (let i = 0.8; i < across; i += 1.6 + r() * 1.4) {
    ctx.strokeStyle = rgba(tint(base, -0.35), 0.35 + r() * 0.3);
    ctx.beginPath();
    const wob = r() * 6;
    if (vertical) {
      ctx.moveTo(x + i, y);
      ctx.bezierCurveTo(x + i + wob * 0.2, y + h * 0.3, x + i - wob * 0.2, y + h * 0.6, x + i + 0.3, y + h);
    } else {
      ctx.moveTo(x, y + i);
      ctx.bezierCurveTo(x + w * 0.3, y + i + wob * 0.2, x + w * 0.6, y + i - wob * 0.2, x + w, y + i + 0.3);
    }
    ctx.stroke();
  }
  if (r() < 0.8) {
    const kx = x + w * (0.2 + r() * 0.6);
    const ky = y + h * (0.2 + r() * 0.6);
    ctx.strokeStyle = rgba(tint(base, -0.45), 0.6);
    ctx.beginPath();
    ctx.ellipse(kx, ky, vertical ? 1 : 2.4, vertical ? 2.4 : 1, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/** A strip of tape with torn ends. */
function tape(ctx: Ctx, x: number, y: number, w: number, h: number, angle: number, color: string, r: Rand) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  const p = new Path2D();
  p.moveTo(-w / 2, -h / 2);
  p.lineTo(w / 2, -h / 2);
  for (let i = 0; i <= 4; i++) p.lineTo(w / 2 + (i % 2 ? 1 : 0) * (0.6 + r()), -h / 2 + (h * i) / 4);
  p.lineTo(-w / 2, h / 2);
  for (let i = 4; i >= 0; i--) p.lineTo(-w / 2 - (i % 2 ? 1 : 0) * (0.6 + r()), -h / 2 + (h * i) / 4);
  p.closePath();
  ctx.fillStyle = color;
  ctx.fill(p);
  ctx.save();
  ctx.clip(p);
  light(ctx, [-w / 2, -h / 2, w, h], 0.6);
  ctx.restore();
  ctx.lineWidth = 0.6;
  ctx.strokeStyle = rgba(PALETTE.ink, 0.55);
  ctx.stroke(p);
  ctx.restore();
}

function googlyEye(ctx: Ctx, x: number, y: number, rad: number, px: number, py: number, lid = 0, lidColor: string = PALETTE.ink) {
  const eye = oval(x, y, rad, rad);
  ctx.fillStyle = PALETTE.paper;
  ctx.fill(eye);
  ctx.save();
  ctx.clip(eye);
  light(ctx, [x - rad, y - rad, rad * 2, rad * 2], 0.5);
  ctx.fillStyle = PALETTE.ink;
  ctx.beginPath();
  ctx.arc(x + px * rad * 0.45, y + py * rad * 0.45, rad * 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = PALETTE.paper;
  ctx.beginPath();
  ctx.arc(x + px * rad * 0.45 - rad * 0.18, y + py * rad * 0.45 - rad * 0.2, rad * 0.14, 0, Math.PI * 2);
  ctx.fill();
  if (lid > 0) {
    ctx.fillStyle = lidColor;
    ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2 * lid);
    line(ctx, [x - rad, y - rad + rad * 2 * lid, x + rad, y - rad + rad * 2 * lid], PALETTE.ink, 1);
  }
  ctx.restore();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = PALETTE.ink;
  ctx.stroke(eye);
  // Domed plastic glint.
  ctx.strokeStyle = rgba('#ffffff', 0.7);
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(x, y, rad * 0.78, Math.PI * 1.1, Math.PI * 1.45);
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// Talent: a felt stop-motion puppet in a fitted carmine coat-dress, three-quarter view facing right.

const COAT = PALETTE.carmine;
const COAT_D = tint(PALETTE.carmine, -0.35);
const SKIN = tint(PALETTE.clay, 0.42);
const TIGHTS = tint(PALETTE.violet, -0.5);
const BOOT = tint(PALETTE.earth, -0.5);
const HAIR = tint(PALETTE.earth, -0.62);
const HAIR_LIT = tint(PALETTE.earth, 0.1);
const LIP = tint(PALETTE.carmine, 0.08);

interface Pose {
  bob: number;
  sy: number;
  /** Back, front: radians from hanging straight; negative swings toward her facing (+x). */
  legs: [number, number];
  lift: [number, number];
  arms: [number, number];
  lean: number;
  eyes: 'open' | 'wide' | 'x';
  mouth: 'smile' | 'o' | 'wobble';
  brows: number;
  /** Ponytail swing: positive throws it back and up, negative lets it swing in behind her. */
  sway: number;
  fallen?: boolean;
  /** Which layers to paint: the body without its ponytail, or the ponytail alone (main.ts springs it separately). */
  layer?: 'body' | 'tail';
}

function drawLeg(ctx: Ctx, r: Rand, hx: number, hy: number, angle: number, lift: number, back: boolean) {
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(angle);
  const len = 23 * (1 - lift);
  const leg = new Path2D();
  leg.moveTo(-3.6, -2);
  leg.lineTo(3.4, -2);
  leg.quadraticCurveTo(3.4, len * 0.5, 2.4, len);
  leg.lineTo(-2.6, len);
  leg.quadraticCurveTo(-4, len * 0.45, -3.6, -2);
  leg.closePath();
  part(ctx, leg, back ? tint(TIGHTS, -0.25) : TIGHTS, [-4, -2, 8, len + 2], r, { fibre: 0.3, light: 0.5, line: 0.9 });
  // Heeled ankle boot: slim shaft, pointed toe, block heel under the back.
  const by = len;
  const boot = new Path2D();
  boot.moveTo(-3.4, by - 5.5);
  boot.lineTo(3.2, by - 5.5);
  boot.lineTo(3.3, by + 1.2);
  boot.quadraticCurveTo(7.5, by + 3, 10.5, by + 6.6);
  boot.lineTo(10.2, by + 7.6);
  boot.lineTo(1.8, by + 7.6);
  boot.quadraticCurveTo(0, by + 5.4, -1.4, by + 5.6);
  boot.lineTo(-1.6, by + 8.4);
  boot.lineTo(-4.4, by + 8.4);
  boot.lineTo(-4, by + 3);
  boot.closePath();
  part(ctx, boot, back ? tint(BOOT, -0.25) : BOOT, [-5, by - 6, 16, 15], r, { fibre: 0.15, line: 1.2, hx: 0.45, hy: 0.1 });
  line(ctx, [-3.3, by - 3.8, 3.2, by - 3.8], rgba(PALETTE.paper, 0.45), 0.5);
  line(ctx, [-4.3, by + 7.4, -1.7, by + 7.4], tint(PALETTE.earth, 0.25), 1);
  line(ctx, [4.4, by + 2.4, 7, by + 4.2], rgba(PALETTE.paper, 0.6), 0.6);
  ctx.restore();
}

function drawArm(ctx: Ctx, r: Rand, sx: number, sy: number, angle: number, back: boolean) {
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(angle);
  const sleeve = new Path2D();
  sleeve.moveTo(-4.2, -2.5);
  sleeve.quadraticCurveTo(0, -6.5, 4.2, -2.5);
  sleeve.quadraticCurveTo(3.8, 8, 3.2, 18.5);
  sleeve.lineTo(-3.2, 18.5);
  sleeve.quadraticCurveTo(-3.9, 8, -4.2, -2.5);
  sleeve.closePath();
  part(ctx, sleeve, COAT, [-4.5, -6.5, 9, 25], r, { fibre: 0, light: 0, line: back ? 1.1 : 0.9 });
  fold(ctx, [-2.4, 9, 0, 11, 2.4, 8.6], COAT, 0.5);
  const cuff = rr(-3.6, 16, 7.2, 3.6, 1.1);
  part(ctx, cuff, tint(COAT, -0.22), [-4, 16, 8, 4], r, { fibre: 0.3, line: 0.9 });
  const hand = new Path2D();
  hand.ellipse(0, 22.4, 3.2, 3.7, 0, 0, Math.PI * 2);
  hand.moveTo(4.2, 21);
  hand.ellipse(2.8, 21, 1.4, 1.8, -0.5, 0, Math.PI * 2);
  part(ctx, hand, back ? tint(SKIN, -0.15) : SKIN, [-3.5, 18.5, 8, 8], r, { fibre: 0.2, line: 1 });
  ctx.restore();
}

/** High ponytail from the crown, long enough to fall past her shoulders; `s` swings the tip. */
function ponytail(ctx: Ctx, r: Rand, hy: number, s: number) {
  const tx = -24 - 5 * s;
  const ty = hy + 34 - 7 * s;
  const tail = new Path2D();
  tail.moveTo(-4, hy - 17);
  tail.bezierCurveTo(-24 - 2 * s, hy - 20 - 3 * s, -28 - 4 * s, hy + 8 - 4 * s, tx - 2, ty - 2);
  tail.quadraticCurveTo(tx + 1, ty + 4, tx + 4.5, ty + 1);
  tail.bezierCurveTo(-17 - 3 * s, hy + 18 - 4 * s, -15 - s, hy - 2, -9, hy - 7);
  tail.closePath();
  part(ctx, tail, HAIR, [-32, hy - 21, 30, 58], r, { fibre: 0.12, line: 1, light: 0.2, hx: 0.6, hy: 0.15 });
  ctx.save();
  ctx.clip(tail);
  line(ctx, [-9, hy - 15, -24 - 3 * s + 2, hy + 4 - 4 * s, tx + 2, ty - 4], rgba(tint(HAIR, -0.35), 0.7), 0.8);
  ctx.restore();
}

function talentPuppet(p: Pose) {
  return (ctx: Ctx, r: Rand) => {
    if (p.fallen) {
      ctx.translate(114, 102);
      ctx.rotate(-Math.PI / 2 * 0.93);
      ctx.scale(0.86, 0.86);
    } else {
      ctx.translate(62, 121);
      ctx.scale(0.93, 0.93);
    }
    ctx.rotate(p.lean);
    ctx.scale(1 + (1 - p.sy) * 0.9, p.sy);
    const b = p.bob;
    const hy = -93 + b;

    if (p.layer !== 'body') ponytail(ctx, r, hy, p.sway);
    if (p.layer === 'tail') return;
    drawArm(ctx, r, -9, -68 + b, p.arms[0], true);
    drawLeg(ctx, r, -3.5, -30 + b, p.legs[0], p.lift[0], true);
    drawLeg(ctx, r, 3.5, -30 + b, p.legs[1], p.lift[1], false);

    // Neck.
    part(ctx, rr(-3, -83 + b, 8, 10, 2.5), tint(SKIN, -0.1), [-3, -83 + b, 8, 10], r, { fibre: 0, line: 1 });

    // Coat-dress: fitted bodice, cinched waist, flared skirt.
    const coat = new Path2D();
    coat.moveTo(-9, -77 + b);
    coat.quadraticCurveTo(-14, -77 + b, -14, -70 + b);
    coat.quadraticCurveTo(-11.5, -60 + b, -9.5, -52 + b);
    coat.quadraticCurveTo(-20, -38 + b, -28, -22 + b);
    coat.quadraticCurveTo(-20, -18 + b, -13, -21 + b);
    coat.quadraticCurveTo(-7, -17.5 + b, 0, -20.5 + b);
    coat.quadraticCurveTo(7, -17 + b, 13.5, -20.5 + b);
    coat.quadraticCurveTo(21, -17.5 + b, 28.5, -22.5 + b);
    coat.quadraticCurveTo(20, -38 + b, 10.5, -52 + b);
    coat.bezierCurveTo(14.5, -57 + b, 17, -65 + b, 14, -71 + b);
    coat.quadraticCurveTo(13, -77 + b, 9, -77 + b);
    coat.closePath();
    part(ctx, coat, COAT, [-26, -78 + b, 53, 61], r, { fibre: 0, light: 0, line: 0.9 });
    ctx.save();
    ctx.clip(coat);
    const hem = new Path2D();
    hem.moveTo(-26, -24 + b);
    hem.quadraticCurveTo(-20, -21 + b, -13, -24 + b);
    hem.quadraticCurveTo(-7, -20.5 + b, 0, -23.5 + b);
    hem.quadraticCurveTo(7, -20 + b, 13.5, -23.5 + b);
    hem.quadraticCurveTo(21, -20.5 + b, 27, -25 + b);
    stitch(ctx, hem, tint(COAT, 0.55));
    // Godet folds fan out from the waist to each scallop of the hem.
    fold(ctx, [-6, -48 + b, -10, -34 + b, -13, -21 + b], COAT, 0.5);
    fold(ctx, [1, -48 + b, 0.5, -34 + b, 0, -20 + b], COAT, 0.5);
    fold(ctx, [7, -48 + b, 10, -34 + b, 13.5, -20.5 + b], COAT, 0.5);
    // Princess seam and bust dart.
    const seam = new Path2D();
    seam.moveTo(-5, -76 + b);
    seam.quadraticCurveTo(-7, -64 + b, -5, -54 + b);
    stitch(ctx, seam, tint(COAT, 0.5));
    fold(ctx, [7, -66 + b, 10.5, -62 + b, 13, -64 + b], COAT, 0.5);
    // Placket.
    line(ctx, [5.5, -76 + b, 6.6, -64 + b, 7.4, -54 + b], tint(COAT, -0.4), 0.8);
    // Narrow belt cinching the waist.
    const belt = rr(-20, -55.5 + b, 40, 4.6, 1);
    part(ctx, belt, COAT, [-20, -56 + b, 40, 5], r, { fibre: 0, line: 0.7, light: 0 });
    const beltStitch = new Path2D();
    beltStitch.moveTo(-20, -53.2 + b); beltStitch.lineTo(20, -53.2 + b);
    stitch(ctx, beltStitch, tint(COAT, 0.35), 0.5);
    ctx.restore();
    // Buckle and buttons sit proud of the cloth.
    part(ctx, rr(3.6, -56.6 + b, 5.6, 6.4, 1.2), PALETTE.brass, [3.6, -56.6 + b, 6, 6.4], r, { fibre: 0, line: 0.9 });
    ctx.fillStyle = COAT_D;
    ctx.fillRect(5.3, -54.8 + b, 2.2, 2.8);
    for (const [bx, by] of [[8.2, -70], [8.8, -63]] as const) {
      part(ctx, oval(bx, by + b, 1.7, 1.7), PALETTE.brass, [bx - 2, by + b - 2, 4, 4], r, { fibre: 0, line: 0.8 });
    }
    // Rounded collar points.
    const collar = new Path2D();
    collar.moveTo(-7, -78 + b);
    collar.quadraticCurveTo(-4, -71 + b, 2, -72 + b);
    collar.quadraticCurveTo(4, -76 + b, 2, -78.5 + b);
    collar.moveTo(2, -78.5 + b);
    collar.quadraticCurveTo(5, -71 + b, 10, -72.5 + b);
    collar.quadraticCurveTo(12, -76 + b, 9.5, -78.5 + b);
    collar.closePath();
    part(ctx, collar, COAT, [-7, -79 + b, 19, 8], r, { fibre: 0, light: 0, line: 0.8 });

    // Head.
    ctx.save();
    if (p.fallen) { ctx.translate(2, hy); ctx.rotate(0.12); ctx.translate(-2, -hy); }
    // Hair volume behind the skull: a soft rim at the crown and the back.
    part(ctx, oval(0.5, hy - 2, 17.4, 16.8), HAIR, [-17, hy - 19, 35, 34], r, { fibre: 0.12, line: 1, light: 0.2 });
    const head = oval(2.5, hy + 0.5, 15.6, 15);
    part(ctx, head, SKIN, [-13, hy - 14.5, 31, 30], r, { fibre: 0.18, light: 0.75, hx: 0.55, hy: 0.3 });
    // Hair cap with a side-swept fringe, cut by the hairline.
    const cap = new Path2D();
    cap.moveTo(19, hy - 6);
    cap.quadraticCurveTo(12, hy - 6.5, 8, hy - 9.5);
    cap.quadraticCurveTo(5, hy - 4, -1, hy - 6);
    cap.quadraticCurveTo(-4, hy - 3, -4, hy + 3);
    cap.quadraticCurveTo(-6, hy + 10, -9, hy + 14);
    cap.lineTo(-22, hy + 14); cap.lineTo(-22, hy - 22); cap.lineTo(22, hy - 22);
    cap.closePath();
    ctx.save();
    ctx.clip(head);
    part(ctx, cap, HAIR, [-14, hy - 16, 33, 30], r, { fibre: 0.12, line: 1, light: 0.2, hx: 0.6, hy: 0.15 });
    // One glossy streak across the crown.
    line(ctx, [-5, hy - 11, 4, hy - 14, 13, hy - 10], rgba(HAIR_LIT, 0.85), 1.3);
    ctx.restore();
    // Ear peeking out under the hair.
    part(ctx, oval(-2.6, hy + 3.4, 2.5, 3.4), tint(SKIN, -0.12), [-5, hy, 5, 7], r, { fibre: 0, line: 1 });
    // Rosy felt cheeks.
    ctx.fillStyle = rgba(PALETTE.carmine, 0.42);
    ctx.beginPath(); ctx.ellipse(4, hy + 7, 3.2, 2.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16.4, hy + 6.5, 2, 2, 0, 0, Math.PI * 2); ctx.fill();
    // Small almond eyes: dark iris, one catchlight, an inked top lash line flicking off the outer corner.
    const eyes: Array<[number, number, number, number]> = [[6, 2.8, 2, -1], [13.6, 2.3, 1.85, 1]];
    for (const [ex, rx, ry, out] of eyes) {
      const ey = hy + 1;
      if (p.eyes === 'x') {
        line(ctx, [ex - 2.3, ey - 2.3, ex + 2.3, ey + 2.3], PALETTE.ink, 1.4);
        line(ctx, [ex + 2.3, ey - 2.3, ex - 2.3, ey + 2.3], PALETTE.ink, 1.4);
        line(ctx, [ex + out * 2.4, ey - 2.6, ex + out * 4.2, ey - 4], PALETTE.ink, 0.8);
        continue;
      }
      const ay = ry + (p.eyes === 'wide' ? 0.8 : 0);
      const ix = ex - out * rx;
      const ox = ex + out * rx;
      const almond = new Path2D();
      almond.moveTo(ix, ey + 0.3);
      almond.quadraticCurveTo(ex, ey - ay * 2, ox, ey - 0.5);
      almond.quadraticCurveTo(ex, ey + ay * 1.6, ix, ey + 0.3);
      almond.closePath();
      ctx.fillStyle = PALETTE.paper;
      ctx.fill(almond);
      ctx.save();
      ctx.clip(almond);
      ctx.fillStyle = tint(PALETTE.earth, -0.75);
      ctx.beginPath(); ctx.arc(ex + 0.4, ey - 0.1, ay * 0.95, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(ex - 0.2, ey - ay * 0.4, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      line(ctx, [ix, ey + 0.3, ex, ey - ay * 2, ox, ey - 0.5], PALETTE.ink, 1.1);
      for (const [t, len] of [[0.62, 1.4], [0.8, 1.8], [0.96, 2]] as const) {
        const lx = (1 - t) ** 2 * ix + 2 * (1 - t) * t * ex + t * t * ox;
        const ly = (1 - t) ** 2 * (ey + 0.3) + 2 * (1 - t) * t * (ey - ay * 2) + t * t * (ey - 0.5);
        line(ctx, [lx, ly, lx + out * len * 0.75, ly - len * 0.7], PALETTE.ink, 0.6);
      }
    }
    // Brows: thin defined arches; positive lifts the inner ends (worry).
    const br = p.brows;
    const BROW = tint(HAIR, -0.35);
    line(ctx, [2.4, hy - 4.6 - br * 0.4, 5.4, hy - 7.4 - br * 1.1, 8.8, hy - 6.4 - br * 1.6], BROW, 1.1);
    line(ctx, [11.4, hy - 6.4 - br * 1.6, 14, hy - 7.6 - br * 1.1, 16.6, hy - 5 - br * 0.4], BROW, 1);
    // Small button nose pokes past the cheek: reads as three-quarter at a glance.
    part(ctx, oval(17.8, hy + 4, 2, 1.8), tint(SKIN, -0.08), [15.5, hy + 2, 5, 4], r, { fibre: 0, line: 0.9, hx: 0.3, hy: 0.2 });
    // Painted lips.
    if (p.mouth === 'smile') {
      const lips = new Path2D();
      lips.moveTo(8.2, hy + 8.2);
      lips.quadraticCurveTo(11.2, hy + 7.2, 14.4, hy + 8);
      lips.quadraticCurveTo(11.4, hy + 12, 8.2, hy + 8.2);
      lips.closePath();
      ctx.fillStyle = LIP; ctx.fill(lips);
      ctx.lineWidth = 0.7; ctx.strokeStyle = PALETTE.ink; ctx.stroke(lips);
      line(ctx, [9.6, hy + 8.4, 11.3, hy + 9, 13, hy + 8.3], rgba(PALETTE.ink, 0.7), 0.6);
    } else if (p.mouth === 'o') {
      ctx.fillStyle = LIP;
      ctx.beginPath(); ctx.ellipse(11.4, hy + 9.6, 2.5, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 0.7; ctx.strokeStyle = PALETTE.ink; ctx.stroke();
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath(); ctx.ellipse(11.4, hy + 9.8, 1.3, 1.8, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      line(ctx, [7.8, hy + 9.2, 9.3, hy + 8.2, 10.8, hy + 9.6, 12.3, hy + 8.2, 13.8, hy + 9.4], LIP, 2);
      line(ctx, [7.8, hy + 9.2, 9.3, hy + 8.2, 10.8, hy + 9.6, 12.3, hy + 8.2, 13.8, hy + 9.4], PALETTE.ink, 0.6);
    }
    // Carmine ribbon bow tying the ponytail at the crown.
    ctx.save();
    ctx.translate(-7, hy - 14);
    ctx.rotate(p.fallen ? -0.3 : -0.35);
    const bow = new Path2D();
    bow.moveTo(0, 0);
    bow.quadraticCurveTo(-5, -6.5, -7.5, -1.5);
    bow.quadraticCurveTo(-6, 3.5, 0, 0);
    bow.quadraticCurveTo(5, -6.5, 7.5, -1.5);
    bow.quadraticCurveTo(6, 3.5, 0, 0);
    bow.closePath();
    part(ctx, bow, COAT, [-8, -6, 16, 10], r, { fibre: 0.25, line: 1 });
    part(ctx, oval(0, -0.6, 2, 2.2), COAT_D, [-2, -3, 4, 5], r, { fibre: 0, line: 0.9 });
    ctx.restore();
    ctx.restore();

    drawArm(ctx, r, 10.5, -68 + b, p.arms[1], false);
  };
}

const STAND: Pose = { bob: 0, sy: 1, legs: [0.05, -0.05], lift: [0, 0], arms: [0.12, -0.08], lean: 0, eyes: 'open', mouth: 'smile', brows: 0, sway: 0 };
const WALK: Pose[] = [
  { ...STAND, bob: 1.6, sy: 0.955, legs: [0.4, -0.4], arms: [-0.5, 0.5], sway: -0.6 },
  { ...STAND, bob: -1.2, sy: 1.04, legs: [0.05, -0.08], lift: [0.22, 0], arms: [-0.1, 0.12], sway: 0.5 },
  { ...STAND, bob: 1.6, sy: 0.955, legs: [-0.4, 0.4], arms: [0.5, -0.5], sway: 1 },
  { ...STAND, bob: -1.2, sy: 1.04, legs: [-0.08, 0.05], lift: [0, 0.22], arms: [0.12, -0.1], sway: -0.1 },
];
const IDLE: Pose[] = [
  { ...STAND },
  { ...STAND, bob: -0.8, sy: 1.025, arms: [0.17, -0.13], sway: 0.2 },
];
const FLINCH: Pose = { ...STAND, bob: 2, sy: 0.92, lean: -0.13, legs: [0.25, -0.15], arms: [-2.75, -2.45], eyes: 'wide', mouth: 'o', brows: 1.6, sway: 1.4 };
const FALL: Pose = { ...STAND, legs: [0.35, -0.2], arms: [-1.3, 0.9], eyes: 'x', mouth: 'wobble', brows: 1, sway: -0.4, fallen: true };

/** main.ts shows the Talent at 0.66 × height; the fall pose goes square. */
export const TALENT_ASPECT = 0.66;

/** Continuous walk sampled at `n` phases: legs and arms swing on one sine, the trailing boot lifts while it passes. */
function walkCycle(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const a = Math.PI * 2 * i / n;
    const c = Math.cos(a), s = Math.sin(a);
    return talentTexture({ ...STAND, legs: [0.4 * c, -0.4 * c], arms: [-0.5 * c, 0.5 * c], lift: [0.22 * Math.max(0, s), 0.22 * Math.max(0, -s)], layer: 'body' }, 20 + i);
  });
}

/** Ponytail alone at `n` swings from -1.4 (in behind her) to 1.4 (thrown back), for the spring-driven tail layer. */
function tailSwings(n: number) {
  return Array.from({ length: n }, (_, i) => talentTexture({ ...STAND, sway: -1.4 + 2.8 * i / (n - 1), layer: 'tail' }, 40 + i));
}

function talentTexture(p: Pose, seed: number) {
  return cast(talentPuppet(p), {
    ink: 1,
    halo: 0.9,
    haloAlpha: 0.7,
    shadow: p.layer === 'tail' ? undefined : p.fallen ? [64, 120, 50, 5] : [65, 121.5, 22, 4.2],
  }, seed, p.fallen ? 1 : TALENT_ASPECT);
}

// ---------------------------------------------------------------------------
// Hazards.

/** One dressmaker pin pushed into the cushion: steel shaft, round glass head; bend tips it over as it dulls. */
function pin(ctx: Ctx, x: number, y: number, a: number, len: number, head: string, bend = 0, halo = true) {
  const bx = x + Math.cos(a) * len * 0.55;
  const by = y + Math.sin(a) * len * 0.55;
  const hx = x + Math.cos(a + bend) * len;
  const hy = y + Math.sin(a + bend) * len;
  const pts = bend ? [x, y, bx, by, hx, hy] : [x, y, hx, hy];
  if (halo) {
    line(ctx, pts, rgba(PALETTE.paper, 0.9), 4);
    ctx.fillStyle = rgba(PALETTE.paper, 0.9);
    ctx.beginPath(); ctx.arc(hx, hy, 4.4, 0, Math.PI * 2); ctx.fill();
  }
  line(ctx, pts, PALETTE.ink, 2.3);
  line(ctx, pts, tint(PALETTE.paper, -0.3), 1.1);
  line(ctx, [x + Math.cos(a) * len * 0.15, y + Math.sin(a) * len * 0.15 - 0.3, x + Math.cos(a) * len * 0.45, y + Math.sin(a) * len * 0.45 - 0.3], rgba('#ffffff', 0.85), 0.45);
  const g = ctx.createRadialGradient(hx - 1, hy - 1.1, 0.2, hx, hy, 3.2);
  g.addColorStop(0, tint(head, 0.6));
  g.addColorStop(0.45, head);
  g.addColorStop(1, tint(head, -0.45));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = PALETTE.ink; ctx.stroke();
  ctx.fillStyle = rgba('#ffffff', 0.9);
  ctx.beginPath(); ctx.arc(hx - 1, hy - 1.1, 0.75, 0, Math.PI * 2); ctx.fill();
}

const PIN_HEADS = [PALETTE.brass, PALETTE.carmine, PALETTE.paper, PALETTE.carmine, PALETTE.brass, PALETTE.violet];
const CUSHION_RX = [27, 28, 29, 30];
const CUSHION_RY = [21, 22, 23, 23.5];

/** Pins bristling from the dome, drawn under the outline pass so their silhouette stays spiky. */
function urchinPins(tier: number) {
  return (ctx: Ctx, r: Rand) => {
    ctx.translate(64, 70);
    const rx = CUSHION_RX[tier]!;
    const ry = CUSHION_RY[tier]!;
    const count = [15, 9, 6][tier]!;
    const reach = [27, 18, 17][tier]!;
    // Upper arc only: nothing pokes out through the band or reads as legs.
    const from = tier === 0 ? -Math.PI * 1.03 : -Math.PI * 0.94;
    const to = tier === 0 ? Math.PI * 0.03 : -Math.PI * 0.06;
    for (let i = 0; i < count; i++) {
      const a = from + ((i + 0.5) / count) * (to - from) + (r() - 0.5) * 0.12;
      const sx = Math.cos(a) * rx * 0.86;
      const sy = Math.sin(a) * ry * 0.86;
      const len = reach * (0.8 + r() * 0.35) + (tier === 0 && i % 2 ? 5 : 0);
      const bend = tier === 0 ? 0 : tier === 1 ? (i % 3 === 1 ? 0.5 : 0) : (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.5);
      pin(ctx, sx, sy, a, len, PIN_HEADS[(i + tier) % PIN_HEADS.length]!, bend);
    }
  };
}

/** Button-tufted felt pincushion: pins drop out and lie down as it dulls; the googly eyes get sleepy. */
function urchinTier(tier: number) {
  return cast((ctx, r) => {
    ctx.translate(64, 70);
    const rx = CUSHION_RX[tier]!;
    const ry = CUSHION_RY[tier]!;
    const fill = tier === 3 ? tint(PALETTE.burn, -0.1) : PALETTE.burn;
    const bandColor = tint(PALETTE.clay, -0.18);
    // Stitched felt band the dome sits in.
    const band = new Path2D();
    band.moveTo(-rx + 1, 8);
    band.lineTo(-rx + 3, 18);
    band.quadraticCurveTo(0, 23, rx - 3, 18);
    band.lineTo(rx - 1, 8);
    band.quadraticCurveTo(0, 14, -rx + 1, 8);
    band.closePath();
    part(ctx, band, bandColor, [-rx, 6, rx * 2, 17], r, { fibre: 0.6 });
    ctx.save();
    ctx.clip(band);
    const seamTop = new Path2D(); seamTop.moveTo(-rx, 11.4); seamTop.quadraticCurveTo(0, 17, rx, 11.4);
    const seamBot = new Path2D(); seamBot.moveTo(-rx, 16.6); seamBot.quadraticCurveTo(0, 21.6, rx, 16.6);
    stitch(ctx, seamTop, rgba(PALETTE.paper, 0.8), 0.7);
    stitch(ctx, seamBot, rgba(PALETTE.paper, 0.8), 0.7);
    for (let x = -rx + 4; x < rx - 3; x += 5) line(ctx, [x, 8, x + 0.3, 21], rgba(tint(bandColor, -0.5), 0.35), 0.6);
    ctx.restore();
    // Plump dome, slightly lumpy where the tufts pull it in.
    const dome = new Path2D();
    const lobes = 6;
    for (let i = 0; i <= 48; i++) {
      const t = Math.PI + (i / 48) * Math.PI;
      const pull = 1 - 0.035 * Math.pow(Math.cos(((t - Math.PI) / Math.PI) * lobes * Math.PI), 8);
      const x = Math.cos(t) * rx * pull;
      const y = 6 + Math.sin(t) * (ry + 6) * pull;
      if (i === 0) dome.moveTo(x, y); else dome.lineTo(x, y);
    }
    dome.quadraticCurveTo(rx * 0.6, 15, 0, 15);
    dome.quadraticCurveTo(-rx * 0.6, 15, -rx, 6);
    dome.closePath();
    part(ctx, dome, fill, [-rx, -ry, rx * 2, ry + 16], r, { fibre: 0.55, hx: 0.3, hy: 0.15 });
    ctx.save();
    ctx.clip(dome);
    // Tufting: a top button pulling puckered seams out to the rim, with side buttons.
    const top: [number, number] = [0, -ry * 0.62];
    const tufts: Array<[number, number]> = [[-rx * 0.62, -ry * 0.28], [rx * 0.62, -ry * 0.28]];
    const seamEnds = [-2.6, -2.1, -1.55, -1.0, -0.55];
    for (const a of seamEnds) {
      const ex = Math.cos(a - 0.0) * rx * 1.05;
      const ey = 6 + Math.sin(a) * (ry + 6) * 1.05;
      const p = new Path2D();
      p.moveTo(top[0], top[1]);
      p.quadraticCurveTo((top[0] + ex) / 2, (top[1] + ey) / 2 - 3, ex, ey);
      ctx.strokeStyle = rgba(tint(PALETTE.burn, -0.5), 0.7); ctx.lineWidth = 1.5; ctx.stroke(p);
      ctx.save(); ctx.translate(-0.8, -0.6); ctx.strokeStyle = rgba(tint(PALETTE.burn, 0.45), 0.5); ctx.lineWidth = 0.6; ctx.stroke(p); ctx.restore();
    }
    for (const [tx, ty] of tufts) {
      for (const a of [-2.3, -0.8, 0.9, 2.4]) {
        line(ctx, [tx, ty, tx + Math.cos(a) * 6, ty + Math.sin(a) * 4], rgba(tint(PALETTE.burn, -0.5), 0.55), 0.9);
      }
    }
    // Dimple shading round each button.
    for (const [tx, ty] of [top, ...tufts]) {
      const g = ctx.createRadialGradient(tx, ty, 0, tx, ty, 6);
      g.addColorStop(0, rgba(PALETTE.ink, 0.35));
      g.addColorStop(1, rgba(PALETTE.ink, 0));
      ctx.fillStyle = g;
      ctx.fillRect(tx - 6, ty - 6, 12, 12);
    }
    if (tier === 3) for (let i = 0; i < 9; i++) {
      // Empty pin holes.
      const a = Math.PI + r() * Math.PI; const d = 0.45 + r() * 0.45;
      ctx.fillStyle = rgba(PALETTE.ink, 0.55);
      ctx.beginPath(); ctx.arc(Math.cos(a) * rx * d, 6 + Math.sin(a) * ry * d, 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    for (const [tx, ty] of [top, ...tufts]) {
      part(ctx, oval(tx, ty, 2.6, 2.2), tint(PALETTE.clay, -0.3), [tx - 3, ty - 3, 6, 5], r, { fibre: 0, line: 0.9 });
      ctx.fillStyle = PALETTE.ink;
      for (const [dx, dy] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) ctx.fillRect(tx + dx! - 0.3, ty + dy! - 0.3, 0.6, 0.6);
    }
    // Face.
    const lid = [0, 0.18, 0.45, 0.62][tier]!;
    const look = [[0, 0.2], [0.55, 0.35], [0.1, 0.7], [0, 0.8]][tier]!;
    const lidColor = tint(fill, -0.15);
    const ey = 1;
    googlyEye(ctx, -8.5, ey, 6.4, look[0]!, look[1]!, lid, lidColor);
    googlyEye(ctx, 8.5, ey, 6.4, look[0]!, look[1]!, lid, lidColor);
    if (tier === 0) {
      line(ctx, [-15, -8, -9.5, -6.8, -3, -3.6], PALETTE.ink, 2.2);
      line(ctx, [15, -8, 9.5, -6.8, 3, -3.6], PALETTE.ink, 2.2);
      const m = new Path2D();
      m.moveTo(-6, 10); m.lineTo(-3.5, 12.5); m.lineTo(-1.2, 10.2); m.lineTo(1.2, 12.5); m.lineTo(3.5, 10.2); m.lineTo(6, 12);
      ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 1.4; ctx.stroke(m);
    } else if (tier === 1) line(ctx, [-4, 11, 0, 10.2, 4, 11], PALETTE.ink, 1.3);
    else if (tier === 2) line(ctx, [-4, 11, -1.5, 12, 1, 11, 3.5, 12], PALETTE.ink, 1.1);
    else {
      // Pins laid flat across the top, done for the day.
      pin(ctx, -20, -10, -0.18, 17, PALETTE.brass, 0, false);
      pin(ctx, 18, -12, Math.PI + 0.25, 15, PALETTE.carmine, 0, false);
      pin(ctx, -4, -19, 0.08, 13, PALETTE.paper, 0, false);
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath(); ctx.ellipse(1, 11, 1.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
      ctx.font = 'bold 9px serif';
      ctx.fillStyle = PALETTE.paper;
      ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 2;
      for (const [zx, zy, zs] of [[24, -26, 1], [32, -36, 0.75]] as const) {
        ctx.save(); ctx.translate(zx, zy); ctx.scale(zs, zs);
        ctx.strokeText('z', 0, 0); ctx.fillText('z', 0, 0);
        ctx.restore();
      }
    }
  }, { shadow: [66, 91, CUSHION_RX[tier]! * 0.95, 3.6], under: tier < 3 ? urchinPins(tier) : undefined }, 11 + tier);
}

const STONE = '#7b6c5c';

function boulderSprite() {
  return cast((ctx, r) => {
    ctx.translate(64, 72);
    // Papier-mache over a balloon.
    // A standing stone: taller than wide, leaning, lumpy, flat where it sits.
    const rock = new Path2D();
    const pts: Array<[number, number]> = [
      [-30, 34], [-36, 8], [-30, -24], [-18, -48], [2, -56], [18, -46],
      [24, -26], [36, -6], [38, 18], [34, 34],
    ].map(([x, y]) => [x * 0.75, y] as [number, number]);
    const mid = (i: number) => {
      const p = pts[i % pts.length]!; const q = pts[(i + 1) % pts.length]!;
      return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2] as const;
    };
    rock.moveTo(...mid(0));
    for (let i = 1; i <= pts.length; i++) {
      const [cx, cy] = pts[i % pts.length]!;
      rock.quadraticCurveTo(cx, cy, ...mid(i));
    }
    rock.closePath();
    const box: Box = [-29, -58, 59, 94];
    ctx.fillStyle = tint(STONE, -0.1);
    ctx.fill(rock);
    ctx.save();
    ctx.clip(rock);
    // Torn newspaper strips laid round the form, each painted grey-brown with print ghosting through.
    for (let i = 0; i < 70; i++) {
      const cx = -52 + r() * 104;
      const cy = -42 + r() * 80;
      const ang = Math.atan2(cy / 38, cx / 52) + Math.PI / 2 + (r() - 0.5) * 0.6;
      const w = 22 + r() * 16;
      const h = 7 + r() * 4;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(ang);
      const s = new Path2D();
      s.moveTo(-w / 2, -h / 2);
      for (let x = -w / 2; x < w / 2; x += 2.2) s.lineTo(x, -h / 2 + (r() - 0.5) * 1.4);
      s.lineTo(w / 2 + (r() - 0.5) * 2, 0);
      for (let x = w / 2; x > -w / 2; x -= 2.2) s.lineTo(x, h / 2 + (r() - 0.5) * 1.4);
      s.closePath();
      ctx.fillStyle = tint(STONE, (r() - 0.5) * 0.18);
      ctx.fill(s);
      ctx.save();
      ctx.clip(s);
      ctx.strokeStyle = rgba(PALETTE.ink, 0.13);
      ctx.lineWidth = 0.5;
      for (let y = -h / 2 + 1.4; y < h / 2; y += 1.5) {
        ctx.beginPath(); ctx.moveTo(-w / 2 + 1, y); ctx.lineTo(-w / 2 + 1 + (w - 2) * (0.6 + r() * 0.4), y); ctx.stroke();
      }
      ctx.restore();
      // Lifted torn edge: dark under, light lip.
      ctx.lineWidth = 0.8; ctx.strokeStyle = rgba(PALETTE.ink, 0.38); ctx.stroke(s);
      ctx.save(); ctx.translate(-0.5, -0.5); ctx.lineWidth = 0.5; ctx.strokeStyle = rgba(PALETTE.paper, 0.25); ctx.stroke(s); ctx.restore();
      ctx.restore();
    }
    light(ctx, box, 1.2, 0.3, 0.22);
    // Dry-brushed highlights on the key side.
    for (let i = 0; i < 60; i++) {
      const a = Math.PI * (1.05 + r() * 0.55);
      const d = 0.35 + r() * 0.55;
      const x = Math.cos(a) * 32 * d; const y = Math.sin(a) * 52 * d;
      line(ctx, [x, y, x + 3 + r() * 7, y + (r() - 0.6) * 2.5], rgba(tint(PALETTE.paper, 0.2), 0.25 + r() * 0.35), 0.5 + r() * 0.9);
    }
    // Chipped spot: paint flaked off, raw newsprint underneath.
    ctx.translate(-10, -8);
    const chip = new Path2D();
    chip.moveTo(18, 12); chip.lineTo(25, 8); chip.lineTo(33, 10); chip.lineTo(37, 15); chip.lineTo(34, 22); chip.lineTo(27, 24); chip.lineTo(21, 21); chip.lineTo(17, 17);
    chip.closePath();
    ctx.fillStyle = tint(PALETTE.paper, -0.04);
    ctx.fill(chip);
    ctx.save();
    ctx.clip(chip);
    ctx.fillStyle = rgba(PALETTE.ink, 0.6);
    ctx.font = 'bold 5px serif';
    ctx.fillText('DAILY', 18.5, 14.5);
    ctx.strokeStyle = rgba(PALETTE.ink, 0.35);
    ctx.lineWidth = 0.5;
    for (let y = 16.5; y < 24; y += 1.4) { ctx.beginPath(); ctx.moveTo(17, y); ctx.lineTo(36, y); ctx.stroke(); }
    ctx.restore();
    ctx.lineWidth = 0.9; ctx.strokeStyle = rgba(PALETTE.ink, 0.75); ctx.stroke(chip);
    ctx.save(); ctx.translate(0.8, 0.8); ctx.lineWidth = 0.7; ctx.strokeStyle = rgba(tint(STONE, -0.5), 0.6); ctx.stroke(chip); ctx.restore();
    ctx.restore();
    ctx.lineWidth = 1.6; ctx.strokeStyle = PALETTE.ink; ctx.stroke(rock);
  }, { shadow: [66, 107, 38, 5] }, 23, 2.55 / 1.9);
}

function stagehandSprite() {
  return cast((ctx, r) => {
    ctx.translate(34, 120);
    const black = tint(PALETTE.ink, 0.1);
    const blackL = tint(PALETTE.ink, 0.2);
    drawStagehandLeg(ctx, r, -4, -30, 0.25, blackL);
    // Back arm reaching up to the plank.
    ctx.save(); ctx.translate(-8, -66); ctx.rotate(2.6);
    part(ctx, rr(-4, -2, 8, 22, 3), tint(PALETTE.ink, 0.05), [-4, -2, 8, 22], r, { fibre: 0.6 });
    ctx.restore();
    drawStagehandLeg(ctx, r, 4, -30, -0.25, black);
    const body = new Path2D();
    body.moveTo(-12, -74); body.quadraticCurveTo(-17, -72, -17, -62); body.lineTo(-18, -27);
    body.quadraticCurveTo(0, -24, 18, -27); body.lineTo(16, -62); body.quadraticCurveTo(15, -73, 10, -74); body.closePath();
    part(ctx, body, black, [-18, -75, 36, 50], r, { fibre: 0.9, light: 1.4 });
    ctx.save(); ctx.clip(body);
    fold(ctx, [-10, -28, -9, -36, -6, -42], blackL);
    fold(ctx, [8, -27, 7, -34, 9, -40], blackL);
    // Tool belt with gaffer roll.
    part(ctx, rr(-20, -44, 40, 5, 1), tint(PALETTE.earth, -0.3), [-20, -44, 40, 5], r, { fibre: 0.2, line: 0.9 });
    ctx.restore();
    part(ctx, oval(-12, -36, 4.5, 4.5), tint(PALETTE.paper, -0.25), [-17, -41, 9, 9], r, { fibre: 0, line: 1 });
    ctx.fillStyle = black; ctx.beginPath(); ctx.arc(-12, -36, 1.8, 0, Math.PI * 2); ctx.fill();
    // Plank on the shoulder.
    ctx.save();
    ctx.translate(-14, -78);
    ctx.rotate(-0.12);
    const plank = rr(0, -5, 104, 10, 1.5);
    part(ctx, plank, PALETTE.plywood, [0, -5, 104, 10], r, { fibre: 0, line: 1.4, hx: 0.2, hy: 0.1 });
    ctx.save(); ctx.clip(plank); grain(ctx, [0, -5, 104, 10], r, PALETTE.plywood); ctx.restore();
    ctx.fillStyle = tint(PALETTE.earth, -0.1); ctx.fillRect(101.5, -4.3, 1.8, 8.6);
    tape(ctx, 70, 0, 6, 11, 0, tint(PALETTE.paper, -0.1), r);
    ctx.fillStyle = PALETTE.ink;
    for (const x of [8, 96]) { ctx.beginPath(); ctx.arc(x, -1, 0.8, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // Head: beanie, headset, a tired puppet face.
    const hy = -88;
    part(ctx, oval(1, hy, 12.5, 12), tint(PALETTE.clay, 0.25), [-12, hy - 12, 26, 24], r, { fibre: 0.18, light: 0.8, hx: 0.55 });
    const beanie = new Path2D();
    beanie.moveTo(-13, hy - 2); beanie.quadraticCurveTo(-13, hy - 18, 1, hy - 18); beanie.quadraticCurveTo(15, hy - 18, 14, hy - 2); beanie.closePath();
    part(ctx, beanie, black, [-13, hy - 19, 28, 18], r, { fibre: 0.8, light: 1.4 });
    part(ctx, rr(-13.5, hy - 6.5, 28, 5, 2), blackL, [-14, hy - 7, 28, 5], r, { fibre: 0.6, line: 1, light: 1.3 });
    ctx.save(); ctx.clip(beanie);
    for (let x = -12; x < 14; x += 2.2) line(ctx, [x, hy - 7, x + 0.5, hy - 17], rgba(PALETTE.paper, 0.12), 0.6);
    ctx.restore();
    // Headset band, ear cup and mic.
    ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.arc(-1, hy - 2, 12.5, Math.PI * 1.05, Math.PI * 1.75); ctx.stroke();
    ctx.strokeStyle = tint(PALETTE.ink, 0.45); ctx.lineWidth = 0.8; ctx.stroke();
    line(ctx, [-7, hy + 3, 0, hy + 9, 9, hy + 7], PALETTE.ink, 1.6);
    part(ctx, oval(9.6, hy + 7, 1.8, 1.6), tint(PALETTE.ink, 0.3), [8, hy + 5, 4, 4], r, { fibre: 0, line: 0.8 });
    part(ctx, oval(-8, hy + 1, 4.6, 5.2), PALETTE.brass, [-13, hy - 4, 10, 11], r, { fibre: 0, line: 1.1 });
    part(ctx, oval(-8, hy + 1, 2.2, 2.6), tint(PALETTE.brass, -0.35), [-10, hy - 2, 5, 6], r, { fibre: 0, line: 0 });
    // Heavy-lidded eyes.
    for (const ex of [4, 10.5]) {
      ctx.fillStyle = PALETTE.ink; ctx.beginPath(); ctx.arc(ex, hy + 1, 1.5, 0, Math.PI * 2); ctx.fill();
      line(ctx, [ex - 2.2, hy - 0.6, ex + 2.2, hy - 0.8], PALETTE.ink, 1.1);
    }
    line(ctx, [5.5, hy + 5.6, 9, hy + 5.4], PALETTE.ink, 0.9);
    // Front arm up, gripping the plank.
    ctx.save(); ctx.translate(10, -67); ctx.rotate(-2.75);
    part(ctx, rr(-4.2, -2, 8.4, 20, 3), black, [-4.2, -2, 8.4, 20], r, { fibre: 0.6, light: 1.3 });
    part(ctx, oval(0, 20, 4, 4.3), tint(PALETTE.ink, 0.28), [-4, 16, 8, 9], r, { fibre: 0.3, line: 1 });
    ctx.restore();
  }, { shadow: [36, 121, 22, 4] }, 31, 3.1 / 2.55);
}

function drawStagehandLeg(ctx: Ctx, r: Rand, hx: number, hy: number, angle: number, color: string) {
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(angle);
  part(ctx, rr(-5, -2, 10, 25, 2), color, [-5, -2, 10, 25], r, { fibre: 0.7, light: 1.3 });
  const shoe = new Path2D();
  shoe.moveTo(-5.6, 21); shoe.lineTo(5, 21); shoe.quadraticCurveTo(12, 22, 12, 28); shoe.lineTo(-6, 28); shoe.closePath();
  part(ctx, shoe, tint(PALETTE.ink, 0.15), [-6, 21, 18, 7], r, { fibre: 0.2 });
  ctx.fillStyle = PALETTE.paper; ctx.fillRect(-6, 26.4, 18, 1.6);
  line(ctx, [-6, 28.2, 12, 28.2], PALETTE.ink, 0.8);
  ctx.restore();
}

interface Costume { body: string; legs: string | null; draw: (ctx: Ctx, r: Rand) => void }

/** Felt extras: one stitched body, four costume trunks. */
function extra(c: Costume, seed: number) {
  return cast((ctx, r) => {
    ctx.translate(64, 121);
    ctx.scale(0.9, 0.9);
    if (c.legs) {
      for (const [x, a] of [[-6, 0.04], [6, -0.04]] as const) {
        ctx.save(); ctx.translate(x, -30); ctx.rotate(a);
        part(ctx, rr(-5, -2, 10, 25, 2), c.legs, [-5, -2, 10, 25], r, { fibre: 0.6 });
        part(ctx, oval(0, 25.5, 7, 4), tint(PALETTE.earth, -0.5), [-7, 21, 14, 9], r, { fibre: 0.1, line: 1.1 });
        ctx.restore();
      }
    }
    for (const side of [-1, 1]) {
      ctx.save(); ctx.translate(side * 15, -68); ctx.rotate(-side * 0.16);
      part(ctx, rr(-4.4, -2, 8.8, 22, 3), tint(c.body, -0.15), [-4.4, -2, 8.8, 22], r, { fibre: 0.6 });
      part(ctx, oval(0, 22.5, 4.2, 4.5), PALETTE.clay, [-4, 18, 8, 9], r, { fibre: 0.15, line: 1 });
      ctx.restore();
    }
    c.draw(ctx, r);
  }, { shadow: [66, 121.5, 21, 4] }, seed, 0.56);
}

function extraBody(ctx: Ctx, r: Rand, color: string, hem = -27, flare = 21) {
  const body = new Path2D();
  body.moveTo(-12, -75); body.quadraticCurveTo(-17, -74, -17, -64); body.lineTo(-flare, hem);
  body.quadraticCurveTo(0, hem + 4, flare, hem); body.lineTo(17, -64); body.quadraticCurveTo(17, -74, 12, -75); body.closePath();
  part(ctx, body, color, [-flare, -76, flare * 2, hem + 80], r, { fibre: 0.6 });
  return body;
}

function extraHead(ctx: Ctx, r: Rand) {
  const hy = -90;
  part(ctx, oval(0, hy, 14, 13.6), PALETTE.clay, [-14, hy - 14, 28, 28], r, { fibre: 0.2, light: 0.8 });
  // Button eyes sewn on with paper thread.
  for (const ex of [-5, 5]) {
    part(ctx, oval(ex, hy, 2.8, 2.8), PALETTE.ink, [ex - 3, hy - 3, 6, 6], r, { fibre: 0, line: 0.6, light: 1.5 });
    line(ctx, [ex - 1, hy - 1, ex + 1, hy + 1], rgba(PALETTE.paper, 0.85), 0.6);
    line(ctx, [ex + 1, hy - 1, ex - 1, hy + 1], rgba(PALETTE.paper, 0.85), 0.6);
  }
  const m = new Path2D(); m.moveTo(-3.5, hy + 6.5); m.quadraticCurveTo(0, hy + 8.3, 3.5, hy + 6.5);
  ctx.save(); ctx.setLineDash([1.2, 0.9]); ctx.lineWidth = 1; ctx.strokeStyle = PALETTE.ink; ctx.stroke(m); ctx.restore();
  ctx.fillStyle = rgba(PALETTE.carmine, 0.22);
  for (const cx of [-8.5, 8.5]) { ctx.beginPath(); ctx.arc(cx, hy + 4.5, 2.4, 0, Math.PI * 2); ctx.fill(); }
}

const COSTUMES: Costume[] = [
  // Magician: burn tailcoat, paper shirt front, bow tie, top hat.
  { body: PALETTE.burn, legs: tint(PALETTE.ink, 0.15), draw: (ctx, r) => {
    for (const s of [-1, 1]) {
      const tail = new Path2D(); tail.moveTo(s * 6, -30); tail.lineTo(s * 20, -30); tail.lineTo(s * 15, -10); tail.closePath();
      part(ctx, tail, tint(PALETTE.burn, -0.2), [s < 0 ? -20 : 6, -30, 14, 20], r, { fibre: 0.5 });
    }
    const body = extraBody(ctx, r, PALETTE.burn, -30, 19);
    ctx.save(); ctx.clip(body);
    const shirt = new Path2D(); shirt.moveTo(-7, -75); shirt.lineTo(7, -75); shirt.lineTo(0, -46); shirt.closePath();
    part(ctx, shirt, PALETTE.paper, [-7, -75, 14, 29], r, { fibre: 0.2, line: 1 });
    for (const y of [-40, -34]) part(ctx, oval(4, y, 1.7, 1.7), PALETTE.brass, [2, y - 2, 4, 4], r, { fibre: 0, line: 0.7 });
    line(ctx, [-15, -40, -10, -36], rgba(tint(PALETTE.burn, -0.5), 0.8), 1);
    ctx.restore();
    const bow = new Path2D(); bow.moveTo(0, -73); bow.lineTo(-6, -76.5); bow.lineTo(-6, -69.5); bow.closePath(); bow.moveTo(0, -73); bow.lineTo(6, -76.5); bow.lineTo(6, -69.5); bow.closePath();
    part(ctx, bow, PALETTE.ink, [-6, -77, 12, 8], r, { fibre: 0, line: 0.8, light: 1.5 });
    extraHead(ctx, r);
    part(ctx, oval(0, -101, 16, 3.4), tint(PALETTE.ink, 0.12), [-16, -105, 32, 7], r, { fibre: 0.3, light: 1.5 });
    const crown = new Path2D(); crown.moveTo(-10, -102); crown.lineTo(-11, -124); crown.quadraticCurveTo(0, -126.5, 11, -124); crown.lineTo(10, -102); crown.closePath();
    part(ctx, crown, tint(PALETTE.ink, 0.15), [-11, -126, 22, 24], r, { fibre: 0.4, light: 1.6 });
    part(ctx, rr(-10.4, -108, 20.8, 4, 0.5), PALETTE.brass, [-11, -108, 22, 4], r, { fibre: 0, line: 0.9 });
  } },
  // Detective: belted earth trench and a check deerstalker.
  { body: PALETTE.earth, legs: tint(PALETTE.earth, -0.5), draw: (ctx, r) => {
    const body = extraBody(ctx, r, PALETTE.earth, -24, 22);
    ctx.save(); ctx.clip(body);
    for (const s of [-1, 1]) {
      const lap = new Path2D(); lap.moveTo(s * 2, -75); lap.lineTo(s * 13, -74); lap.lineTo(s * 4, -56); lap.closePath();
      part(ctx, lap, tint(PALETTE.earth, -0.2), [-13, -75, 26, 20], r, { fibre: 0.3, line: 1 });
    }
    part(ctx, rr(-24, -50, 48, 5, 1), tint(PALETTE.earth, -0.38), [-24, -50, 48, 5], r, { fibre: 0.3, line: 1 });
    for (const [x, y] of [[-5, -42], [5, -42], [-5, -33], [5, -33]] as const) part(ctx, oval(x, y, 1.6, 1.6), tint(PALETTE.earth, -0.5), [x - 2, y - 2, 4, 4], r, { fibre: 0, line: 0.6 });
    line(ctx, [0, -56, 0, -25], rgba(PALETTE.ink, 0.6), 0.9);
    fold(ctx, [-14, -25, -12, -31, -13, -38], PALETTE.earth);
    fold(ctx, [15, -25, 13, -31, 14, -38], PALETTE.earth);
    ctx.restore();
    part(ctx, rr(-3.5, -51, 7, 7, 1), PALETTE.brass, [-3.5, -51, 7, 7], r, { fibre: 0, line: 0.9 });
    extraHead(ctx, r);
    const cap = new Path2D(); cap.moveTo(-14, -94); cap.quadraticCurveTo(-14, -113, 0, -113); cap.quadraticCurveTo(14, -113, 14, -94); cap.closePath();
    const plaid = tint(PALETTE.plywood, 0.15);
    for (const s of [-1, 1]) {
      const peak = new Path2D(); peak.moveTo(s * 10, -96); peak.quadraticCurveTo(s * 22, -96, s * 21, -92); peak.lineTo(s * 9, -93); peak.closePath();
      part(ctx, peak, tint(plaid, -0.15), [s < 0 ? -22 : 9, -97, 13, 6], r, { fibre: 0.2, line: 1 });
    }
    part(ctx, cap, plaid, [-14, -113, 28, 19], r, { fibre: 0.4 });
    ctx.save(); ctx.clip(cap);
    for (let x = -14; x < 14; x += 4) line(ctx, [x, -113, x + 1, -94], rgba(tint(PALETTE.earth, -0.2), 0.55), 0.8);
    for (let y = -111; y < -94; y += 4) line(ctx, [-14, y, 14, y], rgba(tint(PALETTE.earth, -0.2), 0.55), 0.8);
    ctx.restore();
    part(ctx, oval(0, -113.5, 3.5, 2), plaid, [-4, -116, 8, 4], r, { fibre: 0, line: 0.9 });
  } },
  // Archer: felt tunic with a zigzag hem, brass belt, feathered cap.
  { body: PALETTE.felt, legs: tint(PALETTE.felt, -0.45), draw: (ctx, r) => {
    const tunic = new Path2D();
    tunic.moveTo(-12, -75); tunic.quadraticCurveTo(-17, -74, -17, -64); tunic.lineTo(-20, -30);
    for (let i = 0; i <= 8; i++) tunic.lineTo(-20 + i * 5, i % 2 ? -22 : -29);
    tunic.lineTo(17, -64); tunic.quadraticCurveTo(17, -74, 12, -75); tunic.closePath();
    part(ctx, tunic, PALETTE.felt, [-20, -76, 40, 54], r, { fibre: 0.6 });
    ctx.save(); ctx.clip(tunic);
    const hemSt = new Path2D(); hemSt.moveTo(-20, -32); for (let i = 0; i <= 8; i++) hemSt.lineTo(-20 + i * 5, (i % 2 ? -25 : -32));
    stitch(ctx, hemSt, rgba(PALETTE.paper, 0.6));
    part(ctx, rr(-22, -49, 44, 4.5, 1), tint(PALETTE.earth, -0.3), [-22, -49, 44, 5], r, { fibre: 0.2, line: 1 });
    line(ctx, [-3, -75, 0, -62, 3, -75], PALETTE.ink, 1);
    for (let y = -72; y < -63; y += 3) line(ctx, [-2.5, y, 2.5, y + 2], PALETTE.paper, 0.7);
    ctx.restore();
    part(ctx, rr(-3, -50, 6, 6.4, 1), PALETTE.brass, [-3, -50, 6, 6.4], r, { fibre: 0, line: 0.9 });
    extraHead(ctx, r);
    const feather = new Path2D(); feather.moveTo(-8, -102); feather.quadraticCurveTo(-20, -116, -14, -126); feather.quadraticCurveTo(-8, -112, -4, -103); feather.closePath();
    part(ctx, feather, PALETTE.brass, [-20, -126, 16, 24], r, { fibre: 0.3, line: 1 });
    line(ctx, [-6, -103, -13, -114, -14, -124], tint(PALETTE.brass, -0.4), 0.7);
    const cap = new Path2D();
    cap.moveTo(-15, -97); cap.quadraticCurveTo(-12, -112, 2, -110); cap.quadraticCurveTo(14, -110, 24, -118); cap.quadraticCurveTo(20, -104, 15, -97); cap.closePath();
    part(ctx, cap, tint(PALETTE.felt, -0.1), [-15, -118, 39, 21], r, { fibre: 0.5 });
    const brim = new Path2D(); brim.moveTo(-16, -97); brim.quadraticCurveTo(0, -101, 16, -97); brim.lineTo(15, -94); brim.quadraticCurveTo(0, -97, -15, -94); brim.closePath();
    part(ctx, brim, tint(PALETTE.felt, -0.25), [-16, -101, 32, 7], r, { fibre: 0.3, line: 1 });
  } },
  // Queen: violet gown to the floor, paper ruff, brass crown.
  { body: PALETTE.violet, legs: null, draw: (ctx, r) => {
    const gown = new Path2D();
    gown.moveTo(-11, -75); gown.quadraticCurveTo(-16, -74, -15, -62); gown.quadraticCurveTo(-18, -40, -29, -3);
    for (let i = 0; i <= 6; i++) gown.quadraticCurveTo(-29 + i * 9.6 + 4.8, 2, -29 + (i + 1) * 9.6 - (i === 6 ? 9.6 : 0), -3);
    gown.lineTo(29, -3); gown.quadraticCurveTo(18, -40, 15, -62); gown.quadraticCurveTo(16, -74, 11, -75); gown.closePath();
    part(ctx, gown, PALETTE.violet, [-30, -76, 60, 77], r, { fibre: 0.5 });
    ctx.save(); ctx.clip(gown);
    for (const x of [-16, -6, 6, 17]) fold(ctx, [x * 0.5, -48, x * 0.85, -26, x, -2], PALETTE.violet);
    part(ctx, rr(-16, -54, 32, 5, 1.5), PALETTE.brass, [-16, -54, 32, 5], r, { fibre: 0, line: 1 });
    const hemSt = new Path2D(); hemSt.moveTo(-28, -6); hemSt.quadraticCurveTo(0, -4, 28, -6);
    stitch(ctx, hemSt, PALETTE.brass, 0.9);
    ctx.restore();
    const ruff = new Path2D();
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI + (i / 16) * Math.PI;
      const rad = i % 2 ? 17 : 13;
      const x = Math.cos(a) * rad; const y = -76 - Math.sin(a) * rad * -0.35;
      if (i === 0) ruff.moveTo(x, y); else ruff.lineTo(x, y);
    }
    ruff.quadraticCurveTo(0, -66, -13, -76); ruff.closePath();
    part(ctx, ruff, PALETTE.paper, [-17, -82, 34, 16], r, { fibre: 0.15, line: 1 });
    extraHead(ctx, r);
    const crown = new Path2D();
    crown.moveTo(-10, -100); crown.lineTo(-11, -113); crown.lineTo(-6, -106); crown.lineTo(-3, -116); crown.lineTo(0, -107); crown.lineTo(3, -116); crown.lineTo(6, -106); crown.lineTo(11, -113); crown.lineTo(10, -100); crown.closePath();
    part(ctx, crown, PALETTE.brass, [-11, -116, 22, 16], r, { fibre: 0, line: 1.1, light: 1.3 });
    for (const [x, c] of [[-5, PALETTE.felt], [0, PALETTE.carmine], [5, PALETTE.felt]] as const) part(ctx, oval(x, -103, 1.5, 1.5), c, [x - 2, -105, 4, 4], r, { fibre: 0, line: 0.6 });
  } },
];

function rumourSprite() {
  return cast((ctx, r) => {
    // Violet whisper wisps behind the paper.
    for (const [x, y, rx, ry] of [[52, 64, 26, 20], [74, 46, 22, 16], [40, 86, 16, 12], [78, 78, 16, 12]] as const) {
      part(ctx, oval(x, y, rx, ry), tint(PALETTE.violet, 0.12), [x - rx, y - ry, rx * 2, ry * 2], r, { fibre: 0.5, line: 0, light: 0.8 });
    }
    const bubble = (cx: number, cy: number, rx: number, ry: number, tx: number, ty: number, rot: number, glyph: string) => {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot);
      const p = new Path2D();
      p.ellipse(0, 0, rx, ry, 0, Math.PI * 0.62, Math.PI * 0.38 + Math.PI * 2);
      p.lineTo(tx, ty);
      p.closePath();
      part(ctx, p, PALETTE.paper, [-rx, -ry, rx * 2, ry * 2 + 8], r, { fibre: 0.15, line: 1.4, light: 0.7 });
      ctx.save(); ctx.clip(p);
      // Crumpled paper facets.
      for (let i = 0; i < 4; i++) {
        const x0 = -rx + r() * rx * 2; const y0 = -ry; const x1 = x0 + (r() - 0.5) * rx; const y1 = ry;
        line(ctx, [x0, y0, x1, y1], rgba(PALETTE.ink, 0.12), 0.7);
        line(ctx, [x0 + 0.8, y0, x1 + 0.8, y1], rgba('#ffffff', 0.5), 0.5);
      }
      ctx.restore();
      ctx.fillStyle = PALETTE.violet;
      ctx.font = `italic bold ${Math.round(ry * 0.9)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(glyph, 0, 0.5);
      ctx.restore();
    };
    bubble(40, 34, 15, 11, -10, 17, -0.15, '…');
    bubble(82, 54, 27, 18, -16, 26, 0.12, 'psst');
    bubble(42, 92, 17, 12, 13, 19, 0.1, '?!');
  }, { shadow: [62, 120, 30, 3.5] }, 41, 2.4 / 2.15);
}

function mothSprite() {
  return cast((ctx, r) => {
    ctx.translate(64, 74);
    const wing = (s: number) => {
      const fore = new Path2D();
      fore.moveTo(s * 2, -6);
      fore.quadraticCurveTo(s * 20, -50, s * 58, -64);
      fore.quadraticCurveTo(s * 62, -42, s * 52, -26);
      for (let i = 0; i < 4; i++) fore.quadraticCurveTo(s * (48 - i * 11), -16 + i * 2, s * (44 - i * 11), -20 + i * 3);
      fore.lineTo(s * 3, 2);
      fore.closePath();
      part(ctx, fore, PALETTE.violet, [s < 0 ? -62 : 0, -66, 62, 68], r, { fibre: 0.55 });
      ctx.save(); ctx.clip(fore);
      for (const k of [0.25, 0.5, 0.75]) line(ctx, [s * 3, -4, s * 30 * k + s * 10, -40 * k - 8, s * 56 * k + s * 6, -58 * k - 4], rgba(tint(PALETTE.violet, -0.5), 0.6), 0.8);
      line(ctx, [s * 40, -54, s * 50, -40, s * 46, -28], rgba(PALETTE.paper, 0.6), 2);
      ctx.restore();
      // Eyespot.
      part(ctx, oval(s * 32, -32, 9, 8), PALETTE.brass, [s * 32 - 9, -40, 18, 16], r, { fibre: 0.3, line: 1.1 });
      part(ctx, oval(s * 32, -32, 4.5, 4), PALETTE.ink, [s * 32 - 5, -36, 10, 8], r, { fibre: 0, line: 0, light: 1.4 });
      ctx.fillStyle = PALETTE.paper; ctx.beginPath(); ctx.arc(s * 32 - 1.5, -33.5, 1.3, 0, Math.PI * 2); ctx.fill();
      const hind = new Path2D();
      hind.moveTo(s * 3, 0);
      hind.quadraticCurveTo(s * 34, -14, s * 38, 6);
      hind.quadraticCurveTo(s * 34, 24, s * 18, 24);
      hind.quadraticCurveTo(s * 8, 22, s * 3, 8);
      hind.closePath();
      part(ctx, hind, tint(PALETTE.violet, -0.18), [s < 0 ? -38 : 0, -10, 38, 34], r, { fibre: 0.55 });
      ctx.save(); ctx.clip(hind);
      ctx.fillStyle = rgba(PALETTE.paper, 0.6);
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.arc(s * (14 + i * 4.5), 16 - Math.abs(i - 2) * 2.5, 1.3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    };
    wing(-1); wing(1);
    // Fuzzy body.
    const body = oval(0, 0, 6.5, 20);
    part(ctx, body, tint(PALETTE.brass, -0.25), [-7, -20, 14, 40], r, { fibre: 1.2 });
    ctx.save(); ctx.clip(body);
    for (const y of [-6, 2, 10]) line(ctx, [-7, y, 0, y + 2, 7, y], rgba(tint(PALETTE.earth, -0.4), 0.8), 1.4);
    ctx.restore();
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2;
      const x = Math.cos(a) * 6.5; const y = Math.sin(a) * 20;
      line(ctx, [x, y, x + Math.cos(a) * (1 + r() * 1.6), y + Math.sin(a) * 1.2], rgba(tint(PALETTE.brass, r() < 0.5 ? 0.3 : -0.4), 0.9), 0.6);
    }
    const head = oval(0, -21, 6, 5.2);
    part(ctx, head, tint(PALETTE.brass, -0.35), [-6, -26, 12, 10], r, { fibre: 1 });
    googlyEye(ctx, -3, -22, 3.2, 0.2, 0.3);
    googlyEye(ctx, 3.2, -22, 3.2, 0.2, 0.3);
    // Feathery antennae.
    for (const s of [-1, 1]) {
      line(ctx, [s * 2, -26, s * 6, -40, s * 14, -46], PALETTE.ink, 1.1);
      for (let i = 1; i < 7; i++) {
        const t = i / 7; const x = s * (2 + 12 * t); const y = -26 - 20 * t + 4 * t * t;
        line(ctx, [x, y, x - s * 1.8, y - 2], PALETTE.ink, 0.5);
        line(ctx, [x, y, x + s * 1.8, y + 1], PALETTE.ink, 0.5);
      }
    }
  }, { shadow: [66, 118, 20, 3] }, 53);
}

function monitorSprite(hostile: boolean) {
  return cast((ctx, r) => {
    ctx.translate(hostile ? 70 : 64, 120);
    if (hostile) ctx.rotate(-0.06);
    // Wooden tripod stand.
    const wood = tint(PALETTE.earth, 0.12);
    for (const [x0, x1] of [[-3, -20], [3, 20], [0, 2]] as const) {
      const leg = new Path2D(); leg.moveTo(x0 - 2, -42); leg.lineTo(x0 + 2, -42); leg.lineTo(x1 + 2, 0); leg.lineTo(x1 - 2, 0); leg.closePath();
      part(ctx, leg, x0 === 0 ? wood : tint(wood, -0.15), [Math.min(x0, x1) - 2, -42, Math.abs(x1 - x0) + 4, 42], r, { fibre: 0, line: 1.2 });
    }
    part(ctx, rr(-7, -48, 14, 7, 2), tint(PALETTE.ink, 0.25), [-7, -48, 14, 7], r, { fibre: 0, line: 1, light: 1.3 });
    // Cabinet.
    const cab = rr(-36, -98, 72, 54, 7);
    part(ctx, cab, PALETTE.earth, [-36, -98, 72, 54], r, { fibre: 0, line: 1.5, hx: 0.2, hy: 0.15 });
    ctx.save(); ctx.clip(cab); grain(ctx, [-36, -98, 72, 54], r, PALETTE.earth); ctx.restore();
    // Bulging CRT glass.
    const screenColor = hostile ? PALETTE.carmine : tint(PALETTE.felt, 0.12);
    const bezel = rr(-30, -92, 48, 42, 8);
    part(ctx, bezel, tint(PALETTE.ink, 0.12), [-30, -92, 48, 42], r, { fibre: 0, line: 1.2 });
    const screen = rr(-27, -89, 42, 36, 9);
    ctx.fillStyle = screenColor; ctx.fill(screen);
    ctx.save(); ctx.clip(screen);
    const g = ctx.createRadialGradient(-6, -71, 2, -6, -71, 30);
    g.addColorStop(0, rgba(tint(screenColor, 0.45), 1)); g.addColorStop(0.6, rgba(screenColor, 1)); g.addColorStop(1, rgba(tint(screenColor, -0.55), 1));
    ctx.fillStyle = g; ctx.fillRect(-27, -89, 42, 36);
    for (let y = -88; y < -53; y += 1.8) line(ctx, [-27, y, 15, y], rgba(PALETTE.ink, 0.13), 0.6);
    if (hostile) {
      const eye = new Path2D(); eye.moveTo(-20, -71); eye.quadraticCurveTo(-6, -83, 8, -71); eye.quadraticCurveTo(-6, -61, -20, -71); eye.closePath();
      part(ctx, eye, PALETTE.paper, [-20, -83, 28, 22], r, { fibre: 0, line: 1.3, light: 0.6 });
      ctx.save(); ctx.clip(eye);
      part(ctx, oval(-3, -71, 5.5, 5.5), PALETTE.ink, [-9, -77, 12, 12], r, { fibre: 0, line: 0, light: 1.5 });
      ctx.fillStyle = PALETTE.carmine; ctx.beginPath(); ctx.arc(-3, -71, 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(-5, -73, 1.1, 0, Math.PI * 2); ctx.fill();
      line(ctx, [-22, -82, -6, -76, 10, -80], PALETTE.ink, 2.6);
    } else {
      for (const ex of [-14, 2]) line(ctx, [ex - 3.5, -72, ex, -77, ex + 3.5, -72], PALETTE.paper, 2.2);
      ctx.strokeStyle = PALETTE.paper; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(-6, -68, 6, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    }
    // Glass shine.
    line(ctx, [-22, -66, -22, -82, -10, -85], rgba('#ffffff', 0.55), 2.2);
    ctx.restore();
    ctx.lineWidth = 1.1; ctx.strokeStyle = PALETTE.ink; ctx.stroke(screen);
    // Knobs and speaker grille.
    for (const y of [-86, -76]) {
      part(ctx, oval(26, y, 3.6, 3.6), PALETTE.brass, [22, y - 4, 8, 8], r, { fibre: 0, line: 1 });
      line(ctx, [26, y, 26 + 2.2, y - 2.2], PALETTE.ink, 0.8);
    }
    ctx.fillStyle = rgba(PALETTE.ink, 0.6);
    for (let y = -67; y < -52; y += 3) for (let x = 23; x < 31; x += 3) { ctx.beginPath(); ctx.arc(x, y, 0.8, 0, Math.PI * 2); ctx.fill(); }
    if (hostile) {
      // Rabbit-ear antennae.
      for (const [x, tx, ty] of [[-6, -24, -118], [6, 22, -116]] as const) {
        line(ctx, [x, -98, tx, ty], PALETTE.ink, 1.4);
        part(ctx, oval(tx, ty, 2.6, 2.6), PALETTE.brass, [tx - 3, ty - 3, 6, 6], r, { fibre: 0, line: 0.9 });
      }
      part(ctx, oval(0, -99, 6, 3), tint(PALETTE.ink, 0.2), [-6, -102, 12, 6], r, { fibre: 0, line: 1 });
      // Record dot.
      part(ctx, oval(-30, -94, 2.2, 2.2), PALETTE.carmine, [-32, -96, 4, 4], r, { fibre: 0, line: 0.8 });
    } else tape(ctx, -24, -97, 14, 4.5, -0.12, tint(PALETTE.paper, -0.08), r);
  }, { shadow: [hostile ? 70 : 64, 121, 24, 3.5] }, hostile ? 61 : 67, 1.85 / 2.7);
}

function glassSprite() {
  return cast((ctx, r) => {
    ctx.translate(64, 66);
    ctx.rotate(-0.05);
    const pane = rr(-52, -30, 104, 60, 2.5);
    ctx.lineWidth = 6.5; ctx.strokeStyle = rgba(PALETTE.paper, 0.9); ctx.stroke(pane);
    ctx.fillStyle = rgba(tint(PALETTE.felt, 0.93), 0.85); ctx.fill(pane);
    ctx.save(); ctx.clip(pane);
    const g = ctx.createLinearGradient(-52, -30, 52, 30);
    g.addColorStop(0, rgba('#ffffff', 0.45)); g.addColorStop(0.5, rgba('#ffffff', 0)); g.addColorStop(1, rgba(PALETTE.ink, 0.18));
    ctx.fillStyle = g; ctx.fillRect(-52, -30, 104, 60);
    line(ctx, [-30, 34, 2, -34], rgba('#ffffff', 0.85), 6);
    line(ctx, [-16, 34, 12, -34], rgba('#ffffff', 0.7), 2);
    line(ctx, [28, 34, 48, -34], rgba('#ffffff', 0.5), 3);
    // Hairline crack from the corner.
    const cx = 36; const cy = 16;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + r() * 0.5; const len = 6 + r() * 12;
      line(ctx, [cx, cy, cx + Math.cos(a) * len * 0.5 + 1, cy + Math.sin(a) * len * 0.5, cx + Math.cos(a) * len, cy + Math.sin(a) * len], rgba(PALETTE.ink, 0.55), 0.6);
    }
    ctx.restore();
    ctx.lineWidth = 1.2; ctx.strokeStyle = rgba('#ffffff', 0.9); ctx.stroke(rr(-50, -28, 100, 56, 2));
    ctx.lineWidth = 2.6; ctx.strokeStyle = PALETTE.ink; ctx.stroke(pane);
    // Gaffer tape on the corners and a breakaway label.
    tape(ctx, -48, -26, 16, 5, -0.75, PALETTE.burn, r);
    tape(ctx, 48, 26, 16, 5, -0.75, PALETTE.burn, r);
    tape(ctx, -24, 20, 30, 7, 0.04, tint(PALETTE.paper, -0.06), r);
    ctx.fillStyle = PALETTE.ink; ctx.font = 'bold 5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('BREAKAWAY', -24, 20.3);
  }, null, 71, 3.4 / 3.05);
}

function reelSprite() {
  return cast((ctx, r) => {
    ctx.translate(64, 64);
    const disc = new Path2D();
    disc.arc(0, 0, 40, 0, Math.PI * 2);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      disc.moveTo(Math.cos(a) * 26 + 9, Math.sin(a) * 26);
      disc.arc(Math.cos(a) * 26, Math.sin(a) * 26, 9, 0, Math.PI * 2, true);
    }
    // Wound film visible through the holes.
    part(ctx, oval(0, 0, 34, 34), tint(PALETTE.earth, -0.45), [-34, -34, 68, 68], r, { fibre: 0, line: 0 });
    for (let rad = 14; rad < 34; rad += 2) { ctx.strokeStyle = rgba(PALETTE.paper, 0.12); ctx.lineWidth = 0.5; ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = PALETTE.brass; ctx.fill(disc, 'evenodd');
    ctx.save(); ctx.clip(disc, 'evenodd'); light(ctx, [-40, -40, 80, 80], 1.1); ctx.restore();
    ctx.lineWidth = 1.5; ctx.strokeStyle = PALETTE.ink; ctx.stroke(disc);
    ctx.strokeStyle = rgba(PALETTE.paper, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, 36, Math.PI * 1.05, Math.PI * 1.45); ctx.stroke();
    part(ctx, oval(0, 0, 9, 9), PALETTE.ink, [-9, -9, 18, 18], r, { fibre: 0, line: 0, light: 1.3 });
    part(ctx, oval(0, 0, 3.4, 3.4), PALETTE.brass, [-4, -4, 8, 8], r, { fibre: 0, line: 0.9 });
  }, { shadow: [67, 106, 30, 3.5] }, 79);
}

// ---------------------------------------------------------------------------
// Continuity props: clapper, cone, ladder, crate.

function clapperSprite() {
  return cast((ctx, r) => {
    ctx.translate(64, 96);
    const slate = tint(PALETTE.ink, 0.14);
    const board = rr(-42, -40, 84, 46, 3);
    part(ctx, board, slate, [-42, -40, 84, 46], r, { fibre: 0.15, light: 1.5 });
    ctx.save(); ctx.clip(board);
    ctx.strokeStyle = rgba(PALETTE.paper, 0.75); ctx.lineWidth = 0.8;
    for (const y of [-26, -12]) { ctx.beginPath(); ctx.moveTo(-40, y); ctx.lineTo(40, y); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(-6, -26); ctx.lineTo(-6, -12); ctx.moveTo(14, -26); ctx.lineTo(14, -12); ctx.stroke();
    ctx.fillStyle = rgba(PALETTE.paper, 0.88); ctx.font = 'bold 7px sans-serif'; ctx.textBaseline = 'middle';
    ctx.fillText('CULL', -38, -33);
    ctx.font = '5px sans-serif';
    ctx.fillText('SCENE', -38, -22); ctx.fillText('TAKE', -4, -22); ctx.fillText('ROLL', 16, -22);
    ctx.font = 'bold 8px sans-serif';
    ctx.fillText('01', -34, -16); ctx.fillText('3', 2, -16); ctx.fillText('A7', 22, -16);
    ctx.font = '5px sans-serif'; ctx.fillText('DIR. — CAM 01', -38, -4);
    for (let i = 0; i < 20; i++) line(ctx, [-40 + r() * 80, -38 + r() * 42, -40 + r() * 80, -38 + r() * 42], rgba(PALETTE.paper, 0.06), 2);
    ctx.restore();
    const stripes = (path: Path2D, box: Box) => {
      ctx.fillStyle = PALETTE.paper; ctx.fill(path);
      ctx.save(); ctx.clip(path);
      ctx.fillStyle = PALETTE.ink;
      for (let x = box[0] - 10; x < box[0] + box[2] + 10; x += 12) {
        ctx.beginPath(); ctx.moveTo(x, box[1] + box[3]); ctx.lineTo(x + 6, box[1] + box[3]); ctx.lineTo(x + 12, box[1]); ctx.lineTo(x + 6, box[1]); ctx.closePath(); ctx.fill();
      }
      light(ctx, box, 0.8);
      ctx.restore();
      ctx.lineWidth = 1.3; ctx.strokeStyle = PALETTE.ink; ctx.stroke(path);
    };
    stripes(rr(-42, -48, 84, 8, 1.5), [-42, -48, 84, 8]);
    ctx.save(); ctx.translate(-42, -48); ctx.rotate(-0.38);
    stripes(rr(0, -9, 86, 8, 1.5), [0, -9, 86, 8]);
    ctx.restore();
    part(ctx, oval(-40, -48, 3.2, 3.2), PALETTE.brass, [-43, -51, 6, 6], r, { fibre: 0, line: 1 });
  }, { shadow: [67, 102, 42, 4] }, 83, 1.9 / 2.35);
}

function coneSprite() {
  return cast((ctx, r) => {
    ctx.translate(64, 112);
    part(ctx, rr(-38, -8, 76, 11, 2.5), tint(PALETTE.earth, -0.3), [-38, -8, 76, 11], r, { fibre: 0.3 });
    const cone = new Path2D();
    cone.moveTo(-5, -96); cone.quadraticCurveTo(0, -99, 5, -96); cone.lineTo(29, -6); cone.quadraticCurveTo(0, 0, -29, -6); cone.closePath();
    part(ctx, cone, PALETTE.burn, [-29, -99, 58, 99], r, { fibre: 0.35, hx: 0.25 });
    ctx.save(); ctx.clip(cone);
    for (const [y, h] of [[-66, 9], [-38, 10]] as const) {
      const band = new Path2D(); band.moveTo(-40, y); band.quadraticCurveTo(0, y + 4, 40, y); band.lineTo(40, y + h); band.quadraticCurveTo(0, y + h + 4, -40, y + h); band.closePath();
      ctx.fillStyle = tint(PALETTE.paper, -0.04); ctx.fill(band);
      ctx.save(); ctx.clip(band); light(ctx, [-29, -99, 58, 99], 0.9, 0.25); ctx.restore();
      ctx.lineWidth = 0.9; ctx.strokeStyle = rgba(PALETTE.ink, 0.6); ctx.stroke(band);
    }
    line(ctx, [-10, -88, -16, -50, -21, -10], rgba(PALETTE.paper, 0.5), 2.4);
    ctx.restore();
    ctx.lineWidth = 1.4; ctx.strokeStyle = PALETTE.ink; ctx.stroke(cone);
    tape(ctx, 16, -14, 14, 5, -0.5, tint(PALETTE.paper, -0.08), r);
  }, { shadow: [68, 114, 40, 4.5] }, 89, (1.9 * 1.25) / 2.35);
}

function ladderSprite() {
  return cast((ctx, r) => {
    ctx.translate(64, 120);
    const wood = PALETTE.plywood;
    for (let i = 0; i < 4; i++) {
      const y = -18 - i * 24;
      const rung = rr(-34 + i * 1.5, y - 3.5, 68 - i * 3, 7, 1.5);
      part(ctx, rung, tint(wood, -0.08), [-34, y - 3.5, 68, 7], r, { fibre: 0, line: 1.2, hy: 0.1 });
      ctx.save(); ctx.clip(rung); grain(ctx, [-34, y - 3.5, 68, 7], r, wood); ctx.restore();
    }
    for (const s of [-1, 1]) {
      const rail = new Path2D();
      rail.moveTo(s * 40, 0); rail.lineTo(s * 30, 0); rail.lineTo(s * 26, -108); rail.lineTo(s * 34, -108); rail.closePath();
      part(ctx, rail, wood, [s < 0 ? -40 : 26, -108, 14, 108], r, { fibre: 0, line: 1.4, hx: 0.2, hy: 0.1 });
      ctx.save(); ctx.clip(rail); grain(ctx, [s < 0 ? -40 : 26, -108, 14, 108], r, wood, true); ctx.restore();
      for (let i = 0; i < 4; i++) {
        const y = -18 - i * 24; const x = s * (35 - i * 1.5 - (y / -108) * 0) ;
        ctx.fillStyle = PALETTE.ink; ctx.beginPath(); ctx.arc(x - s * 1, y, 0.9, 0, Math.PI * 2); ctx.fill();
      }
    }
    tape(ctx, 33.5, -60, 12, 7, 0.06, PALETTE.burn, r);
    tape(ctx, -30, -100, 12, 6, -0.04, tint(PALETTE.paper, -0.08), r);
    // Paint drips.
    for (const [x, y, l] of [[-36, -40, 6], [-35, -36, 3.5], [30, -88, 5]] as const) line(ctx, [x, y, x, y + l], rgba(PALETTE.paper, 0.75), 1.2);
  }, { shadow: [68, 121, 44, 4] }, 97, 1.9 / 2.35);
}

function crateSprite() {
  return cast((ctx, r) => {
    ctx.translate(64, 104);
    const face = rr(-38, -76, 76, 80, 2);
    part(ctx, face, PALETTE.plywood, [-38, -76, 76, 80], r, { fibre: 0, line: 0, hx: 0.2, hy: 0.15 });
    ctx.save(); ctx.clip(face);
    for (let y = -76; y < 4; y += 16) {
      grain(ctx, [-38, y, 76, 16], r, PALETTE.plywood);
      line(ctx, [-38, y, 38, y], rgba(tint(PALETTE.earth, -0.4), 0.7), 1);
    }
    // Diagonal brace.
    ctx.save(); ctx.rotate(-0.86);
    const brace = rr(-56, -46, 112, 9, 1);
    part(ctx, brace, tint(PALETTE.earth, 0.18), [-56, -46, 112, 9], r, { fibre: 0, line: 1.1 });
    ctx.save(); ctx.clip(brace); grain(ctx, [-56, -46, 112, 9], r, tint(PALETTE.earth, 0.18)); ctx.restore();
    ctx.restore();
    ctx.fillStyle = rgba(PALETTE.ink, 0.42); ctx.font = 'bold 13px serif'; ctx.textAlign = 'center';
    ctx.fillText('PROPS', 4, -14);
    light(ctx, [-38, -76, 76, 80], 0.8, 0.2, 0.15);
    ctx.restore();
    // Frame boards with nails.
    const frame = new Path2D();
    rr(-40, -78, 80, 84, 2.5, frame);
    rr(-31, -69, 62, 66, 1, frame);
    ctx.fillStyle = tint(PALETTE.earth, 0.05); ctx.fill(frame, 'evenodd');
    ctx.save(); ctx.clip(frame, 'evenodd'); grain(ctx, [-40, -78, 80, 9], r, PALETTE.earth); grain(ctx, [-40, -3, 80, 9], r, PALETTE.earth); grain(ctx, [-40, -78, 9, 84], r, PALETTE.earth, true); grain(ctx, [31, -78, 9, 84], r, PALETTE.earth, true); light(ctx, [-40, -78, 80, 84], 1, 0.2, 0.15); ctx.restore();
    ctx.lineWidth = 1.4; ctx.strokeStyle = PALETTE.ink; ctx.stroke(frame);
    ctx.fillStyle = PALETTE.ink;
    for (const [x, y] of [[-35.5, -73.5], [35.5, -73.5], [-35.5, 1.5], [35.5, 1.5], [0, -73.5], [0, 1.5]] as const) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }
    tape(ctx, 30, -70, 22, 7, 0.78, tint(PALETTE.paper, -0.08), r);
  }, { shadow: [68, 110, 44, 4.5] }, 101, (1.9 * 1.25) / 2.35);
}

/** Plank-and-rope bridge laid flat: u runs along the 14-unit span, v across its 1.8-unit width. */
function bridgeTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 132;
  const ctx = ctx2d(canvas);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const r = rng(131);
  const W = canvas.width;
  const H = canvas.height;
  const wood = tint(PALETTE.earth, 0.28);
  // Planks, each a little uneven, gapped, with grain and nails.
  let x = 4;
  while (x < W - 30) {
    const w = 30 + r() * 8;
    const top = 20 + r() * 4;
    const bot = H - 20 - r() * 4;
    const skew = (r() - 0.5) * 4;
    const plank = new Path2D();
    plank.moveTo(x + skew, top); plank.lineTo(x + w + skew, top + (r() - 0.5) * 2);
    plank.lineTo(x + w - skew, bot); plank.lineTo(x - skew, bot + (r() - 0.5) * 2);
    plank.closePath();
    ctx.fillStyle = tint(wood, (r() - 0.5) * 0.22);
    ctx.fill(plank);
    ctx.save();
    ctx.clip(plank);
    ctx.scale(2, 2);
    grain(ctx, [x / 2 - 2, top / 2, w / 2 + 4, (bot - top) / 2], r, wood, true);
    ctx.restore();
    ctx.save(); ctx.clip(plank); light(ctx, [x, top, w, bot - top], 0.8, 0.3, 0.2); ctx.restore();
    ctx.lineWidth = 2.4; ctx.strokeStyle = PALETTE.ink; ctx.stroke(plank);
    ctx.fillStyle = tint(PALETTE.ink, 0.2);
    for (const ny of [top + 14, bot - 14]) for (const nx of [x + 7, x + w - 7]) { ctx.beginPath(); ctx.arc(nx, ny, 1.8, 0, Math.PI * 2); ctx.fill(); }
    x += w + 5 + r() * 3;
  }
  // Rope rails: twisted strands, knotted round every few planks.
  const rope = tint(PALETTE.brass, -0.2);
  for (const ry of [17, H - 17]) {
    ctx.lineWidth = 10; ctx.strokeStyle = PALETTE.ink;
    ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(W, ry); ctx.stroke();
    ctx.lineWidth = 7; ctx.strokeStyle = rope;
    ctx.beginPath(); ctx.moveTo(0, ry); ctx.lineTo(W, ry); ctx.stroke();
    ctx.lineWidth = 1.2;
    for (let t = 0; t < W; t += 6) {
      ctx.strokeStyle = rgba(tint(rope, -0.5), 0.75);
      ctx.beginPath(); ctx.moveTo(t, ry - 3.5); ctx.lineTo(t + 4, ry + 3.5); ctx.stroke();
      ctx.strokeStyle = rgba(PALETTE.paper, 0.45);
      ctx.beginPath(); ctx.moveTo(t + 2, ry - 3.2); ctx.lineTo(t + 4.5, ry + 0.5); ctx.stroke();
    }
    for (let k = 60; k < W - 20; k += 150 + Math.round(r() * 30)) {
      const knot = oval(k, ry, 9, 8);
      ctx.fillStyle = tint(rope, -0.08); ctx.fill(knot);
      ctx.save(); ctx.clip(knot); light(ctx, [k - 9, ry - 8, 18, 16], 1, 0.3, 0.25);
      for (const d of [-4, 0, 4]) { ctx.strokeStyle = rgba(tint(rope, -0.55), 0.8); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(k + d - 3, ry - 8); ctx.quadraticCurveTo(k + d + 2, ry, k + d - 3, ry + 8); ctx.stroke(); }
      ctx.restore();
      ctx.lineWidth = 2; ctx.strokeStyle = PALETTE.ink; ctx.stroke(knot);
      // Lashing running down to the plank.
      ctx.lineWidth = 2.6; ctx.strokeStyle = PALETTE.ink;
      const dir = ry < H / 2 ? 1 : -1;
      ctx.beginPath(); ctx.moveTo(k - 2, ry + dir * 7); ctx.lineTo(k - 5, ry + dir * 17); ctx.stroke();
      ctx.lineWidth = 1.3; ctx.strokeStyle = rope;
      ctx.beginPath(); ctx.moveTo(k - 2, ry + dir * 7); ctx.lineTo(k - 5, ry + dir * 17); ctx.stroke();
    }
  }
  return toTexture(canvas);
}

export function createDailiesCast(): DailiesCast {
  const walk: DailiesCast['walk'] = [talentTexture(WALK[0]!, 1), talentTexture(WALK[1]!, 2), talentTexture(WALK[2]!, 3), talentTexture(WALK[3]!, 4)];
  const idle: DailiesCast['idle'] = [talentTexture(IDLE[0]!, 5), talentTexture(IDLE[1]!, 6)];
  return {
    walk,
    walkCycle: walkCycle(16),
    standBody: talentTexture({ ...STAND, layer: 'body' }, 19),
    tails: tailSwings(9),
    idle,
    flinch: talentTexture(FLINCH, 7),
    fall: talentTexture(FALL, 8),
    talent: idle[0],
    plywood: texture((ctx, s) => {
      ctx.fillStyle = '#d7b98a';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#b48955';
      ctx.lineWidth = 2;
      for (let y = 8; y < s; y += 9) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y + ((y / 9) % 2) * 2); ctx.stroke();
      }
      ctx.strokeStyle = '#8a623c';
      ctx.strokeRect(2, 2, s - 4, s - 4);
    }, 64),
    stagehand: stagehandSprite(),
    boulder: boulderSprite(),
    reel: reelSprite(),
    rumour: rumourSprite(),
    swarmMoth: mothSprite(),
    monitorTeal: monitorSprite(false),
    monitorRed: monitorSprite(true),
    glass: glassSprite(),
    bridge: bridgeTexture(),
    continuity: [clapperSprite(), coneSprite(), ladderSprite(), crateSprite()],
    urchinTiers: [urchinTier(0), urchinTier(1), urchinTier(2), urchinTier(3)],
    extras: [extra(COSTUMES[0]!, 111), extra(COSTUMES[1]!, 113), extra(COSTUMES[2]!, 117), extra(COSTUMES[3]!, 119)],
  };
}
