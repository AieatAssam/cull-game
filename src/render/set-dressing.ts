import * as THREE from 'three';

/** Visual only. 0.15 u is ~3 px at zoom 30, so the ribbon is drawn taller than the guess. */
export const PATH_RISE = 0.72;
const BEVEL = 0.38;

export const SPRITE_SIZE = {
  boulder: [2.55, 1.9],
  stagehand: [3.1, 2.55],
  rumour: [2.4, 2.15],
  monitor: [1.85, 2.7],
  continuity: [1.9, 2.35],
  reel: [1.4, 1.4],
  urchin: 2.5,
  glass: [3.4, 3.05],
  extrasClose: [1.15, 2.15],
  extrasWide: [0.9, 1.5],
  swarm: 2,
} as const;

function cellKey(x: number, z: number) {
  return `${Math.round(x)},${Math.round(z)}`;
}

function geometryFrom(positions: number[], colors: number[], uvs: number[]) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Continuous raised ribbon. Open edges bevel down; shared edges stay flush so the path is not a grid of boxes. */
export function raisedPathGeometry(tiles: Array<{ x: number; z: number }>): THREE.BufferGeometry {
  const occupied = new Set(tiles.map((tile) => cellKey(tile.x, tile.z)));
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const push = (x: number, y: number, z: number, shade: number) => {
    positions.push(x, y, z);
    colors.push(shade, shade * 0.97, shade * 0.9);
    uvs.push(x / 4, z / 4);
  };
  const quad = (
    a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], shade: number,
  ) => {
    for (const point of [a, c, b, a, d, c]) push(point[0], point[1], point[2], shade);
  };
  for (const tile of tiles) {
    const { x, z } = tile;
    const openLeft = !occupied.has(cellKey(x - 1, z));
    const openRight = !occupied.has(cellKey(x + 1, z));
    const openUp = !occupied.has(cellKey(x, z - 1));
    const openDown = !occupied.has(cellKey(x, z + 1));
    const x0 = x - 0.5;
    const x1 = x + 0.5;
    const z0 = z - 0.5;
    const z1 = z + 0.5;
    const ix0 = openLeft ? x0 + BEVEL : x0;
    const ix1 = openRight ? x1 - BEVEL : x1;
    const iz0 = openUp ? z0 + BEVEL : z0;
    const iz1 = openDown ? z1 - BEVEL : z1;
    quad([ix0, PATH_RISE, iz1], [ix1, PATH_RISE, iz1], [ix1, PATH_RISE, iz0], [ix0, PATH_RISE, iz0], 1);
    if (openLeft) quad([x0, 0, z0], [x0, 0, z1], [ix0, PATH_RISE, iz1], [ix0, PATH_RISE, iz0], 0.38);
    if (openRight) quad([x1, 0, z1], [x1, 0, z0], [ix1, PATH_RISE, iz0], [ix1, PATH_RISE, iz1], 0.38);
    if (openUp) quad([x0, 0, z0], [x1, 0, z0], [ix1, PATH_RISE, iz0], [ix0, PATH_RISE, iz0], 0.48);
    if (openDown) quad([x1, 0, z1], [x0, 0, z1], [ix0, PATH_RISE, iz1], [ix1, PATH_RISE, iz1], 0.48);
  }
  return geometryFrom(positions, colors, uvs);
}

/** Cardboard flat standing on y = 0, with a lighter top. */
export function bevelledBlockGeometry(width = 0.82, height = 1.7, depth = 0.82): THREE.BufferGeometry {
  const inset = 0.1;
  const x0 = -width / 2;
  const x1 = width / 2;
  const z0 = -depth / 2;
  const z1 = depth / 2;
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const push = (x: number, y: number, z: number, shade: number) => {
    positions.push(x, y, z);
    colors.push(shade, shade * 0.96, shade * 0.88);
    uvs.push((x - x0) / width, (z - z0) / depth);
  };
  const quad = (
    a: [number, number, number], b: [number, number, number], c: [number, number, number], d: [number, number, number], shade: number,
  ) => {
    for (const point of [a, c, b, a, d, c]) push(point[0], point[1], point[2], shade);
  };
  const ix0 = x0 + inset;
  const ix1 = x1 - inset;
  const iz0 = z0 + inset;
  const iz1 = z1 - inset;
  quad([ix0, height, iz1], [ix1, height, iz1], [ix1, height, iz0], [ix0, height, iz0], 1);
  quad([x0, 0, z0], [x0, 0, z1], [ix0, height, iz1], [ix0, height, iz0], 0.46);
  quad([x1, 0, z1], [x1, 0, z0], [ix1, height, iz0], [ix1, height, iz1], 0.46);
  quad([x0, 0, z0], [x1, 0, z0], [ix1, height, iz0], [ix0, height, iz0], 0.58);
  quad([x1, 0, z1], [x0, 0, z1], [ix0, height, iz1], [ix1, height, iz1], 0.34);
  return geometryFrom(positions, colors, uvs);
}

function canvasTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size: number, repeat: boolean) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  draw(ctx, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  if (repeat) {
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
  }
  map.needsUpdate = true;
  return map;
}

export function createTableTextures() {
  const felt = canvasTexture((ctx, size) => {
    ctx.fillStyle = '#c9c2b4';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 700; i++) {
      ctx.strokeStyle = i % 3 === 0 ? '#8d887c' : '#e4ddd0';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      const x = (i * 17) % size;
      const y = (i * 29) % size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 6, y + 1);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, 128, true);
  const cork = canvasTexture((ctx, size) => {
    ctx.fillStyle = '#e6d3b0';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 180; i++) {
      ctx.fillStyle = i % 2 ? '#c4a574' : '#f3e6cf';
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.ellipse((i * 23) % size, (i * 41) % size, 2 + (i % 4), 1.4, i, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, 128, true);
  const cardboard = canvasTexture((ctx, size) => {
    ctx.fillStyle = '#d7b48a';
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#b48955';
    ctx.globalAlpha = 0.55;
    for (let y = 4; y < size; y += 5) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(size, y + (y % 2));
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#6b4a2e';
    ctx.fillRect(0, 0, size, 8);
    ctx.fillRect(0, size - 8, size, 8);
    ctx.fillRect(0, 0, 8, size);
    ctx.fillRect(size - 8, 0, 8, size);
    ctx.globalAlpha = 1;
  }, 128, true);
  const shadow = canvasTexture((ctx, size) => {
    const fade = ctx.createRadialGradient(size / 2, size / 2, size * 0.08, size / 2, size / 2, size * 0.48);
    fade.addColorStop(0, 'rgba(30,26,23,0.55)');
    fade.addColorStop(1, 'rgba(30,26,23,0)');
    ctx.fillStyle = fade;
    ctx.fillRect(0, 0, size, size);
  }, 64, false);
  const pool = canvasTexture((ctx, size) => {
    const glow = ctx.createRadialGradient(size / 2, size / 2, size * 0.02, size / 2, size / 2, size * 0.5);
    glow.addColorStop(0, 'rgba(255, 244, 214, 1)');
    glow.addColorStop(0.16, 'rgba(255, 179, 71, 0.95)');
    glow.addColorStop(0.5, 'rgba(255, 140, 40, 0.5)');
    glow.addColorStop(1, 'rgba(255, 120, 24, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, size, size);
  }, 128, false);
  felt.repeat.set(1, 1);
  cork.repeat.set(48, 8);
  return { felt, cork, cardboard, shadow, pool };
}
