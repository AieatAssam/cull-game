import type * as THREE from 'three';
import { SCENE_LOOKS } from './dailies';
import { SPRITE_SIZE } from './set-dressing';
import { TUNING } from '../sim/tuning';

const GATE_PX = 504;
const ZOOM = 30;
const SIZE = 72;

export interface SilhouetteReport {
  ok: boolean;
  failures: string[];
  heights: Record<string, number>;
  contrasts: Record<string, number>;
  pairs: Array<{ a: string; b: string; iou: number }>;
  sheet: string;
}

function imageOf(texture: THREE.Texture) {
  const canvas = texture.image as HTMLCanvasElement;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function deltaE(a: string, b: string) {
  const lin = (channel: number) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const lab = (hex: string) => {
    const n = Number.parseInt(hex.slice(1), 16);
    const r = lin((n >> 16) & 255);
    const g = lin((n >> 8) & 255);
    const bl = lin(n & 255);
    let x = r * 0.4124564 + g * 0.3575761 + bl * 0.1804375;
    let y = r * 0.2126729 + g * 0.7151522 + bl * 0.072175;
    let z = r * 0.0193339 + g * 0.119192 + bl * 0.9503041;
    x /= 0.95047;
    z /= 1.08883;
    const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const fx = f(x);
    const fy = f(y);
    const fz = f(z);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)] as const;
  };
  const left = lab(a);
  const right = lab(b);
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function hex(r: number, g: number, b: number) {
  const byte = (value: number) => value.toString(16).padStart(2, '0');
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function dominant(data: ImageData) {
  const bins = new Map<string, number>();
  for (let i = 0; i < data.data.length; i += 4) {
    if ((data.data[i + 3] ?? 0) < 40) continue;
    const key = hex(data.data[i]! & 0xf0, data.data[i + 1]! & 0xf0, data.data[i + 2]! & 0xf0);
    bins.set(key, (bins.get(key) ?? 0) + 1);
  }
  let best = '#000000';
  let count = 0;
  for (const [key, value] of bins) if (value > count) { best = key; count = value; }
  return best;
}

function maskOf(data: ImageData) {
  const { width, height } = data;
  const solid = new Uint8Array(width * height);
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;
  let any = false;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((data.data[(y * width + x) * 4 + 3] ?? 0) < 40) continue;
      solid[y * width + x] = 1;
      any = true;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  const out = new Uint8Array(SIZE * SIZE);
  if (!any) return { mask: out, pixelHeight: 0, pixelWidth: 0 };
  const boundsW = maxX - minX + 1;
  const boundsH = maxY - minY + 1;
  const scale = (SIZE - 4) / Math.max(boundsW, boundsH);
  const originX = (SIZE - boundsW * scale) / 2;
  const originY = (SIZE - boundsH * scale) / 2;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const sx = minX + Math.floor((x - originX) / scale);
      const sy = minY + Math.floor((y - originY) / scale);
      if (sx >= 0 && sy >= 0 && sx < width && sy < height && solid[sy * width + sx]) out[y * SIZE + x] = 1;
    }
  }
  return { mask: out, pixelHeight: boundsH, pixelWidth: boundsW };
}

function iou(a: Uint8Array, b: Uint8Array) {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    const left = a[i] ? 1 : 0;
    const right = b[i] ? 1 : 0;
    inter += left & right;
    union += left | right;
  }
  return union === 0 ? 0 : inter / union;
}

function screenPx(pixelHeight: number, textureHeight: number, worldHeight: number, foreshorten = 1) {
  return (pixelHeight / textureHeight) * worldHeight * foreshorten * (GATE_PX / ZOOM);
}

export function measureSilhouettes(textures: Record<string, THREE.Texture>): SilhouetteReport {
  const kinds: Array<{ name: string; texture: THREE.Texture; world: number; foreshorten?: number }> = [
    { name: 'urchin', texture: textures.urchin!, world: SPRITE_SIZE.urchin },
    { name: 'boulder', texture: textures.boulder!, world: SPRITE_SIZE.boulder[1] },
    { name: 'glass', texture: textures.glass!, world: SPRITE_SIZE.glass[1], foreshorten: TUNING.projectionPitchScale },
    { name: 'extras', texture: textures.extras!, world: SPRITE_SIZE.extrasClose[1] },
    { name: 'swarm', texture: textures.swarm!, world: SPRITE_SIZE.swarm },
    { name: 'rumour', texture: textures.rumour!, world: SPRITE_SIZE.rumour[1] },
    { name: 'stagehand', texture: textures.stagehand!, world: SPRITE_SIZE.stagehand[1] },
    { name: 'monitor', texture: textures.monitor!, world: SPRITE_SIZE.monitor[1] },
    { name: 'red-monitor', texture: textures.redMonitor!, world: SPRITE_SIZE.monitor[1] },
    { name: 'continuity', texture: textures.continuity!, world: SPRITE_SIZE.continuity[1] },
    { name: 'talent', texture: textures.talent!, world: 3.5 },
  ];
  const failures: string[] = [];
  const heights: Record<string, number> = {};
  const contrasts: Record<string, number> = {};
  const masks = new Map<string, Uint8Array>();
  const fills = new Map<string, string>();
  const sheet = document.createElement('canvas');
  sheet.width = kinds.length * 80;
  sheet.height = 96;
  const draw = sheet.getContext('2d');
  if (!draw) throw new Error('Canvas unavailable');
  draw.fillStyle = '#f3ead7';
  draw.fillRect(0, 0, sheet.width, sheet.height);
  kinds.forEach((kind, index) => {
    const data = imageOf(kind.texture);
    const { mask, pixelHeight } = maskOf(data);
    const height = screenPx(pixelHeight, data.height, kind.world, kind.foreshorten ?? 1);
    heights[kind.name] = Math.round(height * 10) / 10;
    masks.set(kind.name, mask);
    const fill = dominant(data);
    fills.set(kind.name, fill);
    if (kind.name !== 'talent' && height < 20) failures.push(`${kind.name} is ${height.toFixed(1)} px tall at zoom 30`);
    draw.fillStyle = '#1e1a17';
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) if (mask[y * SIZE + x]) draw.fillRect(index * 80 + 4 + x, 4 + y, 1, 1);
    }
  });
  const grounds = [SCENE_LOOKS[0]!.ground, SCENE_LOOKS[1]!.ground, SCENE_LOOKS[2]!.ground];
  for (const [name, fill] of fills) {
    if (name === 'talent') {
      for (const [other, color] of fills) {
        if (other === 'talent') continue;
        const distance = deltaE(fill, color);
        contrasts[`talent/${other}`] = Math.round(distance);
        if (distance < 30) failures.push(`talent vs ${other} ΔE ${distance.toFixed(0)}`);
      }
      for (const ground of grounds) {
        const distance = deltaE(fill, ground);
        if (distance < 30) failures.push(`talent vs ${ground} ΔE ${distance.toFixed(0)}`);
      }
      continue;
    }
    let worst = Number.POSITIVE_INFINITY;
    for (const ground of grounds) worst = Math.min(worst, deltaE(fill, ground));
    contrasts[name] = Math.round(worst);
    if (worst < 25) failures.push(`${name} fill ${fill} vs ground ΔE ${worst.toFixed(0)}`);
  }
  const pairs: Array<{ a: string; b: string; iou: number }> = [];
  const names = [...masks.keys()].filter((name) => name !== 'talent');
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = names[i]!;
      const b = names[j]!;
      const score = iou(masks.get(a)!, masks.get(b)!);
      pairs.push({ a, b, iou: Math.round(score * 100) / 100 });
      if (score > 0.7) failures.push(`${a} overlaps ${b} at IoU ${score.toFixed(2)}`);
    }
  }
  return { ok: failures.length === 0, failures, heights, contrasts, pairs, sheet: sheet.toDataURL('image/png') };
}
