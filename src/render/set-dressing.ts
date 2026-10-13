import * as THREE from 'three';

/** Visual only. 0.15 u is ~3 px at zoom 30, so the ribbon is drawn taller than the guess. */
export const PATH_RISE = 0.72;

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

function contains(loop: Pt[], point: Pt) {
  let inside = false;
  for (let index = 0, previous = loop.length - 1; index < loop.length; previous = index++) {
    const current = loop[index]!;
    const prior = loop[previous]!;
    const crosses = (current.z > point.z) !== (prior.z > point.z)
      && point.x < ((prior.x - current.x) * (point.z - current.z)) / (prior.z - current.z + 0.00001) + current.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

type Pt = { x: number; z: number };

function pointKey(point: Pt) {
  return `${Math.round(point.x * 2)},${Math.round(point.z * 2)}`;
}

/** Grid union as closed loops. Winding is CCW once mapped into a shape with y = -z. */
function boundaryLoops(tiles: Array<{ x: number; z: number }>): Pt[][] {
  const occupied = new Set(tiles.map((tile) => cellKey(tile.x, tile.z)));
  const outgoing = new Map<string, Pt[]>();
  const push = (from: Pt, to: Pt) => {
    const list = outgoing.get(pointKey(from)) ?? [];
    list.push(to);
    outgoing.set(pointKey(from), list);
  };
  for (const tile of tiles) {
    const x0 = tile.x - 0.5;
    const x1 = tile.x + 0.5;
    const z0 = tile.z - 0.5;
    const z1 = tile.z + 0.5;
    const a = { x: x0, z: z0 };
    const b = { x: x1, z: z0 };
    const c = { x: x1, z: z1 };
    const d = { x: x0, z: z1 };
    if (!occupied.has(cellKey(tile.x - 1, tile.z))) push(a, d);
    if (!occupied.has(cellKey(tile.x, tile.z + 1))) push(d, c);
    if (!occupied.has(cellKey(tile.x + 1, tile.z))) push(c, b);
    if (!occupied.has(cellKey(tile.x, tile.z - 1))) push(b, a);
  }
  const used = new Set<string>();
  const loops: Pt[][] = [];
  for (const [startKey, ends] of outgoing) {
    for (const end of ends) {
      const start = startKey.split(',').map((part) => Number(part) / 2);
      let cursor: Pt = { x: start[0] ?? 0, z: start[1] ?? 0 };
      const firstId = `${pointKey(cursor)}>${pointKey(end)}`;
      if (used.has(firstId)) continue;
      const loop: Pt[] = [];
      for (let guard = 0; guard < tiles.length * 8; guard++) {
        const options = outgoing.get(pointKey(cursor)) ?? [];
        const next = options.find((option) => !used.has(`${pointKey(cursor)}>${pointKey(option)}`));
        if (!next) break;
        used.add(`${pointKey(cursor)}>${pointKey(next)}`);
        loop.push(cursor);
        if (loop.length > 1 && pointKey(next) === pointKey(loop[0]!)) break;
        cursor = next;
      }
      if (loop.length >= 3) loops.push(loop);
    }
  }
  return loops;
}

/** Quarter-circle fillets so a stair of cells reads as one hand-cut edge. */
function roundLoop(loop: Pt[]): Pt[] {
  const rounded: Pt[] = [];
  const count = loop.length;
  for (let index = 0; index < count; index++) {
    const prev = loop[(index + count - 1) % count]!;
    const curr = loop[index]!;
    const next = loop[(index + 1) % count]!;
    const inX = curr.x - prev.x;
    const inZ = curr.z - prev.z;
    const outX = next.x - curr.x;
    const outZ = next.z - curr.z;
    const inLen = Math.hypot(inX, inZ) || 1;
    const outLen = Math.hypot(outX, outZ) || 1;
    const ix = inX / inLen;
    const iz = inZ / inLen;
    const ox = outX / outLen;
    const oz = outZ / outLen;
    const cross = ix * oz - iz * ox;
    if (Math.abs(cross) < 0.2) continue;
    const radius = Math.min(cross < 0 ? 0.46 : 0.28, inLen * 0.46, outLen * 0.46);
    if (radius < 0.05) {
      rounded.push(curr);
      continue;
    }
    const start = { x: curr.x - ix * radius, z: curr.z - iz * radius };
    const end = { x: curr.x + ox * radius, z: curr.z + oz * radius };
    const px = iz;
    const pz = -ix;
    const centers = [
      { x: start.x + px * radius, z: start.z + pz * radius },
      { x: start.x - px * radius, z: start.z - pz * radius },
    ];
    const center = centers.sort((left, right) => Math.abs(Math.hypot(left.x - end.x, left.z - end.z) - radius) - Math.abs(Math.hypot(right.x - end.x, right.z - end.z) - radius))[0]!;
    let from = Math.atan2(start.z - center.z, start.x - center.x);
    let delta = Math.atan2(end.z - center.z, end.x - center.x) - from;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    for (let step = 0; step <= 4; step++) {
      const angle = from + delta * (step / 4);
      rounded.push({ x: center.x + Math.cos(angle) * radius, z: center.z + Math.sin(angle) * radius });
    }
  }
  return rounded;
}

function shapeOf(loop: Pt[]) {
  const shape = new THREE.Shape();
  loop.forEach((point, index) => {
    if (index === 0) shape.moveTo(point.x, -point.z);
    else shape.lineTo(point.x, -point.z);
  });
  return shape;
}

function loopArea(loop: Pt[]) {
  let area = 0;
  for (let index = 0; index < loop.length; index++) {
    const current = loop[index]!;
    const next = loop[(index + 1) % loop.length]!;
    area += current.x * -next.z - next.x * -current.z;
  }
  return area / 2;
}

/** One raised felt ribbon: rounded outline, key-side lip, stitches and a frayed hem. */
export function raisedPathGeometry(tiles: Array<{ x: number; z: number }>): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const push = (x: number, y: number, z: number, shade: number) => {
    positions.push(x, y, z);
    colors.push(shade, shade * 0.98, shade * 0.9);
    uvs.push(x / 4, z / 4);
  };
  const tri = (points: Array<[number, number, number]>, shade: number) => {
    for (const point of points) push(point[0], point[1], point[2], shade);
  };
  const loops = boundaryLoops(tiles).map(roundLoop).filter((loop) => loop.length >= 6);
  const outers = loops.filter((loop) => loopArea(loop) > 0);
  const holes = loops.filter((loop) => loopArea(loop) < 0);
  for (const outer of outers) {
    const shape = shapeOf(outer);
    for (const hole of holes) {
      const probe = hole[0]!;
      if (contains(outer, probe)) shape.holes.push(shapeOf(hole));
    }
    const top = new THREE.ShapeGeometry(shape);
    top.rotateX(-Math.PI / 2);
    top.translate(0, PATH_RISE, 0);
    const position = top.getAttribute('position');
    for (let index = 0; index < position.count; index++) push(position.getX(index), position.getY(index), position.getZ(index), 1);
    top.dispose();
  }
  const key = { x: -0.92, z: 0.38 };
  for (const loop of loops) {
    for (let index = 0; index < loop.length; index++) {
      const current = loop[index]!;
      const next = loop[(index + 1) % loop.length]!;
      const dx = next.x - current.x;
      const dz = next.z - current.z;
      const length = Math.hypot(dx, dz) || 1;
      const outwardX = -dz / length;
      const outwardZ = dx / length;
      const facing = outwardX * key.x + outwardZ * key.z;
      const shade = 0.42 + Math.max(0, facing) * 0.9;
      const flare = 0.1;
      tri([
        [current.x, PATH_RISE, current.z], [next.x, 0, next.z + outwardZ * flare], [next.x, PATH_RISE, next.z],
      ], shade);
      tri([
        [current.x, PATH_RISE, current.z], [current.x, 0, current.z + outwardZ * flare], [next.x, 0, next.z + outwardZ * flare],
      ], shade * 0.92);
      if (facing > 0.2) {
        const lip = 0.07;
        tri([
          [current.x - outwardX * lip, PATH_RISE + 0.012, current.z - outwardZ * lip],
          [next.x, PATH_RISE + 0.012, next.z],
          [next.x - outwardX * lip, PATH_RISE + 0.012, next.z - outwardZ * lip],
        ], 1.25);
        tri([
          [current.x - outwardX * lip, PATH_RISE + 0.012, current.z - outwardZ * lip],
          [current.x, PATH_RISE + 0.012, current.z],
          [next.x, PATH_RISE + 0.012, next.z],
        ], 1.25);
      }
      if (index % 2 === 0) {
        const inset = 0.16;
        const along = 0.18 / length;
        const x0 = current.x + dx * 0.35 - outwardX * inset;
        const z0 = current.z + dz * 0.35 - outwardZ * inset;
        tri([
          [x0, PATH_RISE + 0.02, z0],
          [x0 + dx * along, PATH_RISE + 0.02, z0 + dz * along],
          [x0 + dx * along + outwardX * 0.035, PATH_RISE + 0.02, z0 + dz * along + outwardZ * 0.035],
        ], 0.22);
      }
      if (index % 5 === 0) {
        const reach = 0.08 + (index % 3) * 0.05;
        tri([
          [current.x, PATH_RISE * 0.82, current.z],
          [current.x + outwardX * reach, PATH_RISE * 0.55, current.z + outwardZ * reach],
          [current.x + outwardX * 0.02, PATH_RISE * 0.7, current.z + outwardZ * 0.02],
        ], 0.78);
      }
    }
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

function grain(index: number) {
  let value = Math.imul(index ^ 0x9e3779b9, 0x85ebca6b);
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

export function createTableTextures() {
  const felt = canvasTexture((ctx, size) => {
    ctx.fillStyle = '#d7d0c2';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1400; i++) {
      const x = grain(i * 3) * size;
      const y = grain(i * 3 + 1) * size;
      ctx.strokeStyle = i % 4 === 0 ? '#8f887c' : '#efe8da';
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (grain(i * 3 + 2) - 0.5) * 3, y + 2 + grain(i) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, 256, true);
  const cork = canvasTexture((ctx, size) => {
    ctx.fillStyle = '#e7d3b0';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = i % 3 === 0 ? '#c4a574' : '#f6ead4';
      ctx.globalAlpha = 0.45;
      ctx.beginPath();
      ctx.ellipse(grain(i * 5) * size, grain(i * 5 + 1) * size, 1.2 + grain(i * 5 + 2) * 3.5, 0.8 + grain(i * 5 + 3) * 1.6, grain(i * 5 + 4) * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }, 256, true);
  const paper = canvasTexture((ctx, size) => {
    ctx.fillStyle = '#f4ead7';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 1100; i++) {
      const x = grain(i * 4) * size;
      const y = grain(i * 4 + 1) * size;
      ctx.strokeStyle = i % 5 === 0 ? '#cbb892' : '#fff8ec';
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 3 + grain(i * 4 + 2) * 8, y + (grain(i * 4 + 3) - 0.5) * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }, 256, true);
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
    fade.addColorStop(0, 'rgba(30,26,23,0.72)');
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
  paper.repeat.set(1, 1);
  cork.repeat.set(70, 6);
  return { felt, cork, paper, cardboard, shadow, pool };
}

export interface TableTextures {
  felt: THREE.CanvasTexture;
  cork: THREE.CanvasTexture;
  paper: THREE.CanvasTexture;
  cardboard: THREE.CanvasTexture;
  shadow: THREE.CanvasTexture;
  pool: THREE.CanvasTexture;
}

function dressHash(x: number, z: number) {
  return grain(Math.round(x) * 17 + Math.round(z) * 131);
}

function place(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0, flat = false) {
  const object = new THREE.Object3D();
  object.position.set(x, y, z);
  object.rotation.order = 'YXZ';
  object.rotation.y = yaw;
  if (flat) object.rotation.x = -Math.PI / 2;
  object.scale.set(sx, sy, sz);
  object.updateMatrix();
  mesh.setMatrixAt(index, object.matrix);
}

function cstandGeometry() {
  const post = new THREE.BoxGeometry(0.08, 2.05, 0.08);
  post.translate(0, 1.02, 0);
  const arm = new THREE.BoxGeometry(0.72, 0.06, 0.06);
  arm.translate(0.28, 1.92, 0);
  const foot = new THREE.BoxGeometry(0.46, 0.06, 0.46);
  foot.translate(0, 0.03, 0);
  return mergeParts(post, arm, foot);
}

function mergeParts(...parts: THREE.BufferGeometry[]) {
  let count = 0;
  for (const part of parts) count += part.getAttribute('position').count;
  const positions = new Float32Array(count * 3);
  let offset = 0;
  for (const part of parts) {
    const attribute = part.getAttribute('position');
    for (let index = 0; index < attribute.count; index++) {
      positions.set([attribute.getX(index), attribute.getY(index), attribute.getZ(index)], (offset + index) * 3);
    }
    offset += attribute.count;
    part.dispose();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Scene dressing sits beside the path. It is quieter than the cast and does not write depth over them. */
export function createSetDressing(lookIndex: number, pathTiles: Array<{ x: number; z: number }>, setTiles: Array<{ x: number; z: number }>, textures: TableTextures) {
  const group = new THREE.Group();
  group.name = 'set-dressing';
  const quiet = (color: string, map?: THREE.Texture) => {
    const material = new THREE.MeshLambertMaterial({ color, map, depthWrite: false });
    return material;
  };
  const addInstances = (geometry: THREE.BufferGeometry, material: THREE.Material, spots: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw?: number; flat?: boolean }>) => {
    if (!spots.length) {
      geometry.dispose();
      material.dispose();
      return;
    }
    const mesh = new THREE.InstancedMesh(geometry, material, spots.length);
    spots.forEach((spot, index) => place(mesh, index, spot.x, spot.y, spot.z, spot.sx, spot.sy, spot.sz, spot.yaw ?? 0, spot.flat ?? false));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.renderOrder = 1;
    group.add(mesh);
  };
  if (lookIndex === 1) {
    const blocks = setTiles.map((tile) => {
      const roll = dressHash(tile.x, tile.z);
      return { x: tile.x, y: 0, z: tile.z, sx: 1.25 + roll * 0.85, sy: 4.4 + roll * 3.8, sz: 1.1 + (1 - roll) * 0.75, yaw: (roll - 0.5) * 0.2 };
    });
    addInstances(bevelledBlockGeometry(1, 1, 1), quiet('#f4ead4', textures.paper), blocks);
    addInstances(new THREE.BoxGeometry(1.14, 0.32, 1.14), quiet('#c4513a'), blocks.map((block) => ({
      x: block.x, y: block.sy, z: block.z, sx: block.sx, sy: 1, sz: block.sz, yaw: block.yaw,
    })));
    const kerb = pathTiles.filter((tile) => dressHash(tile.x + 3, tile.z) > 0.72).map((tile) => ({
      x: tile.x, y: 0.06, z: tile.z + 0.62, sx: 0.92, sy: 1, sz: 1, yaw: 0,
    }));
    addInstances(new THREE.BoxGeometry(1, 0.1, 0.16), quiet('#d5ebe4'), kerb);
    const lamps = pathTiles.filter((tile, index, all) => all.findIndex((other) => Math.abs(other.x - tile.x) < 12) === index);
    addInstances(new THREE.BoxGeometry(0.1, 2.3, 0.1), quiet('#6d6256'), lamps.map((tile) => ({ x: tile.x, y: 1.15, z: tile.z - 1.55, sx: 1, sy: 1, sz: 1 })));
    addInstances(new THREE.BoxGeometry(0.46, 0.16, 0.46), new THREE.MeshBasicMaterial({ color: '#e7dcc4', depthWrite: false }), lamps.map((tile) => ({ x: tile.x, y: 2.35, z: tile.z - 1.55, sx: 1, sy: 1, sz: 1 })));
  } else if (lookIndex === 2) {
    const lamps = pathTiles.filter((tile, index, all) => all.findIndex((other) => Math.abs(other.x - tile.x) < 9) === index);
    addInstances(new THREE.BoxGeometry(0.16, 2.2, 0.16), quiet('#241c16'), lamps.map((tile) => ({ x: tile.x, y: 1.1, z: tile.z + 1.7, sx: 1, sy: 1, sz: 1 })));
    addInstances(new THREE.BoxGeometry(0.72, 0.2, 0.72), new THREE.MeshBasicMaterial({ color: '#ffb347', depthWrite: false }), lamps.map((tile) => ({ x: tile.x, y: 2.24, z: tile.z + 1.7, sx: 1, sy: 1, sz: 1 })));
    const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: textures.pool, color: '#ffb347', transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, blending: THREE.AdditiveBlending,
    }), Math.max(1, lamps.length));
    const sheen = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: textures.pool, color: '#d5e4f4', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55,
    }), Math.max(1, lamps.length));
    const object = new THREE.Object3D();
    lamps.forEach((tile, index) => {
      object.position.set(tile.x, PATH_RISE + 0.08, tile.z);
      object.rotation.set(-Math.PI / 2, 0, 0);
      object.scale.set(12, 12, 1);
      object.updateMatrix();
      pools.setMatrixAt(index, object.matrix);
      object.scale.set(3.2, 9, 1);
      object.updateMatrix();
      sheen.setMatrixAt(index, object.matrix);
    });
    pools.count = lamps.length;
    sheen.count = lamps.length;
    pools.instanceMatrix.needsUpdate = true;
    sheen.instanceMatrix.needsUpdate = true;
    pools.renderOrder = 2;
    sheen.renderOrder = 2;
    if (lamps.length) group.add(pools, sheen);
    else { pools.geometry.dispose(); sheen.geometry.dispose(); }
  } else {
    const crates: Array<{ x: number; y: number; z: number; sx: number; sy: number; sz: number; yaw?: number }> = [];
    const bags: typeof crates = [];
    const stands: typeof crates = [];
    for (const tile of setTiles) {
      const roll = dressHash(tile.x, tile.z);
      const spot = { x: tile.x, y: 0, z: tile.z, sx: 0.65 + roll * 0.7, sy: 0.45 + roll * 0.85, sz: 0.55 + (1 - roll) * 0.5, yaw: roll * 1.2 };
      if (roll < 0.34) {
        const sy = 0.55 + roll;
        bags.push({ ...spot, y: 0.42 * sy, sx: 1.2, sy, sz: 0.85 });
      }
      else if (roll < 0.62) stands.push({ x: tile.x, y: 0, z: tile.z, sx: 0.85 + roll * 0.4, sy: 0.9 + roll * 0.35, sz: 1, yaw: roll });
      else crates.push(spot);
    }
    addInstances(bevelledBlockGeometry(), quiet('#c49662', textures.cardboard), crates);
    addInstances(new THREE.SphereGeometry(0.42, 8, 6), quiet('#cbb892'), bags);
    addInstances(cstandGeometry(), quiet('#5c5148'), stands);
    const tapeSpots = pathTiles.filter((tile) => dressHash(tile.x, tile.z + 9) > 0.82).map((tile) => ({
      x: tile.x, y: PATH_RISE + 0.03, z: tile.z, sx: 0.7, sy: 0.28, sz: 1, yaw: dressHash(tile.z, tile.x) * 1.5, flat: true,
    }));
    addInstances(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#e6d3b0', transparent: true, opacity: 0.72, depthWrite: false }), tapeSpots);
    const cable: number[] = [];
    pathTiles.filter((_, index) => index % 7 === 0).forEach((tile) => {
      const roll = dressHash(tile.x, tile.z + 2);
      for (let step = 0; step < 4; step++) {
        const x = tile.x + step * 0.55;
        const z = tile.z + 0.85 + Math.sin(roll * 6 + step) * 0.18;
        cable.push(x, 0.05, z);
      }
    });
    if (cable.length >= 12) {
      const positions: number[] = [];
      for (let index = 0; index < cable.length - 5; index += 3) {
        const x = cable[index] ?? 0;
        const y = cable[index + 1] ?? 0;
        const z = cable[index + 2] ?? 0;
        const nx = cable[index + 3] ?? x;
        const nz = cable[index + 5] ?? z;
        positions.push(x, y, z, nx, y, nz, x, y, z + 0.08);
      }
      const ribbon = new THREE.BufferGeometry();
      ribbon.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      ribbon.computeVertexNormals();
      const mesh = new THREE.Mesh(ribbon, quiet('#3a322c'));
      mesh.renderOrder = 1;
      group.add(mesh);
    }
  }
  return group;
}
