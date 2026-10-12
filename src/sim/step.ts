import { inFrame } from './frame';
import { lodTier, type LodTier } from './lod';
import { TUNING } from './tuning';
import type { CastEntity, FailReason, InputFrame, SimState } from './types';

export const NEUTRAL_INPUT: InputFrame = { panX: 0, panZ: 0, zoom: 0, rotate: 0, hold: false, steady: false };
const dt = 1 / TUNING.tickRate;
const distance = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

function entityInFrame(state: SimState, entity: CastEntity) {
  return inFrame(entity.x, entity.z, entity.kind === 'boulder' ? TUNING.boulderRadius : entity.kind === 'urchin' ? TUNING.urchinRadius : 0.55,
    state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, entity.kind === 'boulder' ? 1 : 0.8);
}

function fail(state: SimState, reason: FailReason) {
  if (!state.failed) state.failed = reason;
}

export function step(previous: SimState, input: InputFrame = NEUTRAL_INPUT): SimState {
  if (previous.failed) return previous;
  const state: SimState = {
    ...previous,
    camera: { ...previous.camera },
    talent: { ...previous.talent },
    path: previous.path,
    forks: previous.forks,
    routeChoices: { ...previous.routeChoices },
    entities: previous.entities.map((entity) => ({ ...entity })),
    consumed: [...previous.consumed],
    cuts: [...previous.cuts],
  };
  const cam = state.camera;
  const maxVelocity = cam.zoom * TUNING.panSpeed;
  const steady = input.steady ? TUNING.steadyFactor : 1;
  const targetVX = Math.max(-1, Math.min(1, input.panX / 127)) * maxVelocity * steady;
  const targetVZ = Math.max(-1, Math.min(1, input.panZ / 127)) * maxVelocity * steady;
  const dv = TUNING.panAcceleration * cam.zoom * dt;
  cam.vx += Math.max(-dv, Math.min(dv, targetVX - cam.vx));
  cam.vz += Math.max(-dv, Math.min(dv, targetVZ - cam.vz));
  cam.x += cam.vx * dt;
  cam.z += cam.vz * dt;
  cam.moving = Math.hypot(cam.vx, cam.vz) / cam.zoom > TUNING.motionThreshold;
  if (input.zoom) cam.zoom = Math.max(TUNING.minZoom, Math.min(TUNING.maxZoom, cam.zoom * Math.exp(-(input.zoom / 127) * Math.log(TUNING.zoomRate) * dt)));
  if (input.rotate && cam.rotationTicksRemaining === 0) {
    cam.yawTarget = (cam.yawTarget + input.rotate + 8) % 8;
    cam.rotationTicksRemaining = Math.round(TUNING.rotationSeconds * TUNING.tickRate);
  }
  if (cam.rotationTicksRemaining > 0) {
    let turn = cam.yawTarget - cam.yaw;
    if (turn > 4) turn -= 8;
    if (turn < -4) turn += 8;
    cam.yaw += turn / cam.rotationTicksRemaining;
    cam.rotationTicksRemaining--;
    if (cam.rotationTicksRemaining === 0) cam.yaw = cam.yawTarget;
  }

  const talent = state.talent;
  const fork = state.forks.find((entry) => entry.at === talent.pathIndex);
  let next = state.path[talent.pathIndex + 1];
  if (fork) {
    let choice = state.routeChoices[fork.at];
    if (choice === undefined) {
      const gateX = cam.x - talent.x;
      const gateZ = cam.z - talent.z;
      let best = -Infinity;
      fork.options.forEach((option, index) => {
        const score = (option.x - talent.x) * gateX + (option.z - talent.z) * gateZ;
        if (score > best) { best = score; choice = index; }
      });
      choice ??= 0;
      state.routeChoices[fork.at] = choice;
    }
    next = fork.options[choice]!;
  }
  let headingX = next ? next.x - talent.x : 0;
  let headingZ = next ? next.z - talent.z : 0;
  const gateHeadingX = cam.x - talent.x;
  const gateHeadingZ = cam.z - talent.z;
  // At a fork, frame centre selects the path heading. A forward-only path has one available branch.
  if (next && Math.hypot(gateHeadingX, gateHeadingZ) > 0.01 && Math.hypot(headingX, headingZ) > 0.01) {
    const direction = Math.sign(headingX * gateHeadingX + headingZ * gateHeadingZ);
    if (direction < 0) { headingX = Math.abs(headingX); headingZ = Math.abs(headingZ); }
  }
  const headingLength = Math.hypot(headingX, headingZ) || 1;
  const talentTier = lodTier(1000 / cam.zoom, talent.lodTier);
  talent.lodTier = Math.min(talentTier, 3) as 0 | 1 | 2 | 3;
  const talentSpeed = TUNING.talentSpeeds[Math.min(talentTier, 3)];
  const stopped = input.hold || !next || distance(talent.x, talent.z, next.x, next.z) < 0.02;
  state.waiting = !next;
  if (!stopped) {
    talent.x += (headingX / headingLength) * talentSpeed * dt;
    talent.z += (headingZ / headingLength) * talentSpeed * dt;
    if (distance(talent.x, talent.z, next.x, next.z) < talentSpeed * dt) talent.pathIndex++;
  }
  if (inFrame(talent.x, talent.z, TUNING.talentRadii[Math.min(talentTier, 3)], cam.x, cam.z, cam.zoom, cam.yaw, 1.4)) talent.offscreenTicks = 0;
  else talent.offscreenTicks++;
  if (talent.offscreenTicks >= TUNING.offscreenGrace * TUNING.tickRate) fail(state, 'lost-talent');

  for (const entity of state.entities) {
    if (entity.cut) continue;
    if (!entity.spawned) {
      const nearTalent = distance(entity.x, entity.z, talent.x, talent.z) < TUNING.popInExclusion;
      if (entityInFrame(state, entity) && !nearTalent) {
        entity.spawned = true;
        entity.age = 0;
        state.consumed.push(entity.id);
      }
    }
    if (!entity.spawned) continue;
    entity.age++;
    entity.x += entity.vx * dt;
    entity.z += entity.vz * dt;
    const visible = entityInFrame(state, entity);
    if (!visible) {
      entity.cut = true;
      state.cuts.push(entity.id);
      continue;
    }
    const radius = entity.kind === 'boulder' ? TUNING.boulderRadius : entity.kind === 'urchin' ? TUNING.urchinRadius : 0.55;
    const tier = lodTier(radius * 1000 / cam.zoom, entity.lodTier as LodTier | undefined);
    entity.lodTier = tier;
    const close = distance(entity.x, entity.z, talent.x, talent.z) <= radius + TUNING.talentRadii[Math.min(talentTier, 3)];
    if (entity.kind === 'glass' && entity.cut && talent.x >= entity.x - 0.5 && talent.x <= entity.x + 0.5) fail(state, 'fell');
    if (close && ((entity.kind === 'boulder') || (entity.kind === 'urchin' && tier <= 1))) fail(state, 'hit');
    if (close && entity.kind === 'urchin' && tier === 2) {
      const push = (talent.x - entity.x) >= 0 ? 1 : -1;
      talent.x += push * dt;
    }
    if (close && entity.kind === 'reel' && talentTier <= 1) {
      entity.cut = true;
      state.cuts.push(entity.id);
      state.film += TUNING.reelFilm;
      state.score += 100;
    }
  }

  const glass = state.entities.find((e) => e.kind === 'glass');
  if (glass?.cut && talent.x >= glass.x - 0.5 && talent.x <= glass.x + 0.5) fail(state, 'fell');
  state.film -= dt * (input.hold || state.waiting ? 2 : 1);
  if (state.film <= 0) { state.film = 0; fail(state, 'out-of-film'); }
  const pathEnd = state.path[state.path.length - 1];
  if (pathEnd && talent.x >= pathEnd.x) fail(state, 'wrapped');
  state.tick++;
  return state;
}

export function runTicks(initial: SimState, frames: InputFrame[]): SimState {
  return frames.reduce((state, frame) => step(state, frame), initial);
}
