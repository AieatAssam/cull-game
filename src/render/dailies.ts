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
  { sky: '#10141c', ground: '#1b2433', path: '#c9a46b', block: '#2c3a52', key: '#ffb347', fill: '#1a2744', hemi: '#2a3344' },
  { sky: '#1a120e', ground: '#4a3024', path: '#c8322a', block: '#2a1c16', key: '#ffd9a0', fill: '#3a2418', hemi: '#3a2a22' },
];

export interface DailiesCast extends SpriteAssets {
  walk: [THREE.Texture, THREE.Texture, THREE.Texture, THREE.Texture];
  plywood: THREE.Texture;
}

function texture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 128): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.clearRect(0, 0, size, size);
  draw(ctx, size);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}

function blot(ctx: CanvasRenderingContext2D, color: string, alpha = 0.18) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  for (let i = 0; i < 18; i++) ctx.fillRect((i * 37) % 120, (i * 19) % 120, 8, 3);
  ctx.restore();
}

function talentFrame(step: number) {
  return texture((ctx, s) => {
    const swing = [0, -10, 0, 10][step] ?? 0;
    ctx.translate(s / 2, s * 0.92);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.lineJoin = 'round';
    const leg = (side: number) => {
      ctx.save();
      ctx.rotate((swing * side * Math.PI) / 180);
      ctx.fillStyle = '#3a2a24';
      ctx.fillRect(-7, -6, 12, 28);
      ctx.strokeRect(-7, -6, 12, 28);
      ctx.restore();
    };
    ctx.save(); ctx.translate(-12, -8); leg(1); ctx.restore();
    ctx.save(); ctx.translate(8, -8); leg(-1); ctx.restore();
    ctx.fillStyle = PALETTE.carmine;
    ctx.beginPath();
    ctx.moveTo(-28, -78); ctx.lineTo(28, -78); ctx.lineTo(34, -18); ctx.lineTo(-34, -18); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#f2c1a2';
    ctx.beginPath(); ctx.arc(0, -96, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-16, -108, 32, 10);
    ctx.fillStyle = '#2a1814';
    ctx.fillRect(-6, -98, 3, 3); ctx.fillRect(4, -98, 3, 3);
    blot(ctx, '#000', 0.05);
  });
}

function urchinTier(tier: number) {
  return texture((ctx, s) => {
    ctx.translate(s / 2, s / 2);
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    if (tier >= 3) {
      ctx.fillStyle = '#d7c4a4';
      ctx.fillRect(-28, -28, 56, 56); ctx.strokeRect(-28, -28, 56, 56);
      return;
    }
    if (tier === 2) {
      ctx.fillStyle = '#e2b04a';
      ctx.beginPath();
      ctx.moveTo(0, -40); ctx.lineTo(34, 0); ctx.lineTo(0, 40); ctx.lineTo(-34, 0); ctx.closePath();
      ctx.fill(); ctx.stroke();
      return;
    }
    ctx.fillStyle = tier === 0 ? '#c8322a' : '#d4654c';
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    const spikes = tier === 0 ? 10 : 6;
    ctx.fillStyle = PALETTE.ink;
    for (let i = 0; i < spikes; i++) {
      const angle = (i / spikes) * Math.PI * 2;
      ctx.save();
      ctx.rotate(angle);
      ctx.beginPath(); ctx.moveTo(-6, -24); ctx.lineTo(0, -52); ctx.lineTo(6, -24); ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  });
}

function figure(color: string, accent: string) {
  return texture((ctx, s) => {
    ctx.translate(s / 2, s * 0.9);
    ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 5;
    ctx.fillStyle = '#2c241e';
    ctx.fillRect(-22, -16, 14, 26); ctx.fillRect(8, -16, 14, 26);
    ctx.fillStyle = color;
    ctx.fillRect(-30, -78, 60, 64); ctx.strokeRect(-30, -78, 60, 64);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(0, -96, 18, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    blot(ctx, '#000', 0.06);
  });
}

export function createDailiesCast(): DailiesCast {
  const walk: DailiesCast['walk'] = [talentFrame(0), talentFrame(1), talentFrame(2), talentFrame(3)];
  return {
    walk,
    talent: walk[0],
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
    stagehand: figure('#1e1a17', '#3a342c'),
    boulder: texture((ctx, s) => {
      ctx.translate(s / 2, s / 2);
      ctx.fillStyle = '#8a5a3a'; ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.ellipse(0, 6, 46, 36, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#c4845c';
      ctx.beginPath(); ctx.ellipse(-8, -6, 16, 10, -0.4, 0, Math.PI * 2); ctx.fill();
    }),
    reel: texture((ctx, s) => {
      ctx.translate(s / 2, s / 2);
      ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 5;
      ctx.fillStyle = PALETTE.brass;
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#1e1a17';
      ctx.beginPath(); ctx.arc(0, 0, 28, 0.4, 2.2); ctx.stroke();
    }),
    rumour: texture((ctx, size) => {
      ctx.fillStyle = PALETTE.violet;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.ellipse(size / 2, size * 0.55, 48, 36, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(size * 0.32, size * 0.45, 22, 18, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(size * 0.67, size * 0.42, 20, 16, 0, 0, Math.PI * 2); ctx.fill();
    }),
    swarmMoth: texture((ctx, size) => {
      ctx.translate(size / 2, size / 2);
      ctx.fillStyle = '#f3ead7'; ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(-16, 0, 22, 12, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(16, 0, 22, 12, 0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = PALETTE.ink; ctx.fillRect(-3, -8, 6, 18);
    }),
    monitorTeal: texture((ctx, s) => {
      ctx.translate(s / 2, s * 0.75);
      ctx.fillStyle = '#5d7c99'; ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 5;
      ctx.fillRect(-6, -40, 12, 48); ctx.strokeRect(-6, -40, 12, 48);
      ctx.fillStyle = '#dfe7ea';
      ctx.fillRect(-32, -78, 64, 42); ctx.strokeRect(-32, -78, 64, 42);
      ctx.fillStyle = '#3f6b4f'; ctx.beginPath(); ctx.arc(0, -57, 10, 0, Math.PI * 2); ctx.fill();
    }),
    monitorRed: texture((ctx, s) => {
      ctx.translate(s / 2, s * 0.75);
      ctx.fillStyle = '#5d7c99'; ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 5;
      ctx.fillRect(-6, -40, 12, 48); ctx.strokeRect(-6, -40, 12, 48);
      ctx.fillStyle = '#2a1814';
      ctx.fillRect(-32, -78, 64, 42); ctx.strokeRect(-32, -78, 64, 42);
      ctx.fillStyle = PALETTE.carmine; ctx.beginPath(); ctx.arc(0, -57, 10, 0, Math.PI * 2); ctx.fill();
    }),
    glass: texture((ctx, s) => {
      ctx.fillStyle = 'rgba(214, 232, 236, 0.55)';
      ctx.fillRect(8, 8, s - 16, s - 16);
      ctx.strokeStyle = '#5d7c99'; ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, s - 16, s - 16);
      ctx.beginPath(); ctx.moveTo(18, 30); ctx.lineTo(70, 90); ctx.lineTo(100, 40); ctx.stroke();
    }),
    bridge: texture((ctx, s) => {
      ctx.fillStyle = '#c9a46b';
      for (let x = 6; x < s; x += 16) ctx.fillRect(x, 28, 12, s - 56);
      ctx.strokeStyle = '#5a3a28'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(s, 24); ctx.moveTo(0, s - 24); ctx.lineTo(s, s - 24); ctx.stroke();
    }, 256),
    continuity: [
      texture((ctx) => { ctx.fillStyle = '#c9a46b'; ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 5; ctx.fillRect(28, 48, 72, 48); ctx.strokeRect(28, 48, 72, 48); }),
      texture((ctx) => { ctx.fillStyle = '#8a5a3a'; ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(20, 90); ctx.lineTo(108, 90); ctx.lineTo(64, 36); ctx.closePath(); ctx.fill(); ctx.stroke(); }),
      texture((ctx) => { ctx.fillStyle = PALETTE.ink; for (let i = 0; i < 4; i++) ctx.fillRect(30 + i * 18, 40, 8, 48); }),
      texture((ctx) => { ctx.fillStyle = '#e2b04a'; ctx.strokeStyle = PALETTE.ink; ctx.lineWidth = 5; ctx.fillRect(16, 54, 96, 18); ctx.strokeRect(16, 54, 96, 18); }),
    ],
    urchinTiers: [urchinTier(0), urchinTier(1), urchinTier(2), urchinTier(3)],
    extras: [figure('#c8322a', '#f2c1a2'), figure('#e2b04a', '#f2c1a2'), figure('#3f6b4f', '#f2c1a2'), figure('#5d7c99', '#f2c1a2')],
  };
}
