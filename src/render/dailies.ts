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

function rim(ctx: CanvasRenderingContext2D) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = PALETTE.paper;
  ctx.lineWidth = 12;
  ctx.stroke();
  ctx.strokeStyle = PALETTE.ink;
  ctx.lineWidth = 5;
  ctx.stroke();
}

function urchinTier(tier: number) {
  return texture((ctx, s) => {
    ctx.translate(s / 2, s / 2);
    ctx.fillStyle = PALETTE.burn;
    ctx.beginPath();
    ctx.arc(0, 0, tier >= 2 ? 34 : 28, 0, Math.PI * 2);
    ctx.fill();
    rim(ctx);
    if (tier >= 2) {
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.arc(0, 0, tier === 3 ? 8 : 12, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const spikes = tier === 0 ? 10 : 6;
    ctx.fillStyle = PALETTE.ink;
    for (let i = 0; i < spikes; i++) {
      ctx.save();
      ctx.rotate((i / spikes) * Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(-7, -22);
      ctx.lineTo(0, -58);
      ctx.lineTo(7, -22);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = PALETTE.paper;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  });
}

function figure(color: string) {
  return texture((ctx, s) => {
    ctx.translate(s / 2, s * 0.9);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-18, -18, 12, 28);
    ctx.fillRect(6, -18, 12, 28);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.rect(-26, -78, 52, 62);
    ctx.fill();
    rim(ctx);
    ctx.fillStyle = PALETTE.clay;
    ctx.beginPath();
    ctx.arc(0, -96, 16, 0, Math.PI * 2);
    ctx.fill();
    rim(ctx);
    blot(ctx, '#000', 0.06);
  });
}

function stagehandSprite() {
  return texture((ctx, s) => {
    ctx.translate(20, s * 0.9);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-8, -16, 10, 26);
    ctx.fillRect(8, -16, 10, 26);
    ctx.fillStyle = PALETTE.paper;
    ctx.beginPath();
    ctx.moveTo(-22, -74);
    ctx.lineTo(24, -74);
    ctx.lineTo(28, -16);
    ctx.lineTo(-18, -16);
    ctx.closePath();
    ctx.fill();
    rim(ctx);
    ctx.fillStyle = PALETTE.clay;
    ctx.beginPath();
    ctx.arc(2, -92, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.fillStyle = PALETTE.earth;
    ctx.beginPath();
    ctx.moveTo(18, -62);
    ctx.lineTo(s - 28, -78);
    ctx.lineTo(s - 28, -64);
    ctx.lineTo(18, -48);
    ctx.closePath();
    ctx.fill();
    rim(ctx);
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
    stagehand: stagehandSprite(),
    boulder: texture((ctx, s) => {
      ctx.translate(s / 2, s * 0.62);
      ctx.fillStyle = PALETTE.earth;
      ctx.beginPath();
      ctx.moveTo(-58, 18);
      ctx.quadraticCurveTo(-48, -36, -8, -28);
      ctx.quadraticCurveTo(20, -48, 54, -6);
      ctx.quadraticCurveTo(62, 24, 20, 34);
      ctx.quadraticCurveTo(-20, 42, -58, 18);
      ctx.closePath();
      ctx.fill();
      rim(ctx);
      ctx.fillStyle = PALETTE.paper;
      ctx.beginPath();
      ctx.ellipse(-16, -8, 14, 8, -0.6, 0, Math.PI * 2);
      ctx.fill();
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
      ctx.beginPath();
      ctx.ellipse(size * 0.42, size * 0.78, 16, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      rim(ctx);
      ctx.beginPath();
      ctx.ellipse(size * 0.7, size * 0.5, 26, 16, 0.4, 0, Math.PI * 2);
      ctx.fill();
      rim(ctx);
      ctx.beginPath();
      ctx.ellipse(size * 0.38, size * 0.24, 14, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      rim(ctx);
    }),
    swarmMoth: texture((ctx, size) => {
      ctx.translate(size / 2, size * 0.72);
      ctx.fillStyle = PALETTE.violet;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.quadraticCurveTo(-46, -10, -58, -70);
      ctx.quadraticCurveTo(-18, -24, 0, -8);
      ctx.quadraticCurveTo(18, -24, 58, -70);
      ctx.quadraticCurveTo(46, -10, 0, 8);
      ctx.closePath();
      ctx.fill();
      rim(ctx);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(-4, -16, 8, 28);
    }),
    monitorTeal: texture((ctx, s) => {
      ctx.translate(s / 2, s * 0.86);
      ctx.fillStyle = PALETTE.felt;
      ctx.fillRect(-7, -48, 14, 52);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 5;
      ctx.strokeRect(-7, -48, 14, 52);
      ctx.fillStyle = PALETTE.paper;
      ctx.beginPath();
      ctx.rect(-36, -92, 72, 46);
      ctx.fill();
      rim(ctx);
      ctx.fillStyle = PALETTE.felt;
      ctx.beginPath();
      ctx.arc(0, -70, 10, 0, Math.PI * 2);
      ctx.fill();
    }),
    monitorRed: texture((ctx, s) => {
      ctx.translate(s * 0.62, s * 0.86);
      ctx.fillStyle = PALETTE.felt;
      ctx.fillRect(-7, -44, 14, 48);
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 5;
      ctx.strokeRect(-7, -44, 14, 48);
      ctx.fillStyle = PALETTE.paper;
      ctx.beginPath();
      ctx.rect(-34, -86, 62, 40);
      ctx.fill();
      rim(ctx);
      ctx.fillStyle = PALETTE.carmine;
      ctx.beginPath();
      ctx.arc(-4, -66, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.paper;
      ctx.beginPath();
      ctx.moveTo(-20, -86);
      ctx.lineTo(-58, -118);
      ctx.lineTo(-46, -78);
      ctx.closePath();
      ctx.fill();
      rim(ctx);
    }),
    glass: texture((ctx, s) => {
      ctx.fillStyle = PALETTE.paper;
      ctx.beginPath();
      ctx.rect(6, 40, s - 12, 52);
      ctx.rect(22, 52, s - 44, 28);
      ctx.fill('evenodd');
      rim(ctx);
      ctx.strokeStyle = PALETTE.burn;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(30, 48);
      ctx.lineTo(64, 92);
      ctx.lineTo(100, 46);
      ctx.stroke();
    }),
    bridge: texture((ctx, s) => {
      ctx.fillStyle = '#c9a46b';
      for (let x = 6; x < s; x += 16) ctx.fillRect(x, 28, 12, s - 56);
      ctx.strokeStyle = '#5a3a28'; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(s, 24); ctx.moveTo(0, s - 24); ctx.lineTo(s, s - 24); ctx.stroke();
    }, 256),
    continuity: [
      texture((ctx, s) => {
        ctx.translate(s / 2, s * 0.78);
        ctx.fillStyle = PALETTE.earth;
        ctx.beginPath();
        ctx.moveTo(-46, -10);
        ctx.lineTo(46, -36);
        ctx.lineTo(46, -18);
        ctx.lineTo(-46, 8);
        ctx.closePath();
        ctx.fill();
        rim(ctx);
        ctx.beginPath();
        ctx.moveTo(-46, 8);
        ctx.lineTo(46, -8);
        ctx.lineTo(46, 16);
        ctx.lineTo(-46, 28);
        ctx.closePath();
        ctx.fill();
        rim(ctx);
      }),
      texture((ctx, s) => {
        ctx.translate(s / 2, s * 0.84);
        ctx.fillStyle = PALETTE.earth;
        ctx.beginPath();
        ctx.moveTo(0, -96);
        ctx.lineTo(36, 8);
        ctx.lineTo(-36, 8);
        ctx.closePath();
        ctx.fill();
        rim(ctx);
      }),
      texture((ctx, s) => {
        ctx.translate(s / 2, s * 0.86);
        ctx.fillStyle = PALETTE.earth;
        ctx.beginPath();
        ctx.rect(-40, -78, 10, 86);
        ctx.rect(30, -78, 10, 86);
        ctx.rect(-30, -70, 60, 8);
        ctx.rect(-30, -36, 60, 8);
        ctx.fill();
        rim(ctx);
      }),
      texture((ctx, s) => {
        ctx.translate(s / 2, s * 0.8);
        ctx.fillStyle = PALETTE.earth;
        ctx.beginPath();
        ctx.rect(-34, -70, 68, 78);
        ctx.fill();
        rim(ctx);
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(-34, -70);
        ctx.lineTo(34, 8);
        ctx.moveTo(34, -70);
        ctx.lineTo(-34, 8);
        ctx.stroke();
      }),
    ],
    urchinTiers: [urchinTier(0), urchinTier(1), urchinTier(2), urchinTier(3)],
    extras: [figure(PALETTE.burn), figure(PALETTE.earth), figure(PALETTE.felt), figure(PALETTE.violet)],
  };
}
