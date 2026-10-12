import { inFrame } from './frame';
import { lodTier, type LodTier } from './lod';
import { TUNING } from './tuning';
import { advanceRumourRadius, advanceWrap, isDeletedByWrap, isWrapActive, monitorConeContains, redMonitorOverlapsTarget, type MonitorCone } from './m6';
import type { CastEntity, FailReason, InputFrame, SimState } from './types';

export const NEUTRAL_INPUT: InputFrame = { panX: 0, panZ: 0, zoom: 0, rotate: 0, hold: false, steady: false };
const dt = 1 / TUNING.tickRate;
const distance = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

function entityInFrame(state: SimState, entity: CastEntity) {
  if (entity.kind === 'monitor') return true;
  const inMonitor = state.entities.some((monitor) => monitor.kind === 'monitor' && monitor.spawned && !monitor.cut
    && monitorConeContains(monitorCone(monitor), { x: entity.x, z: entity.z }));
  if (inMonitor) return true;
  if (entity.kind === 'extras' && entity.members) {
    return entity.members.some((member) => !member.cut && inFrame(entity.x + member.dx, entity.z + member.dz, TUNING.extrasMemberRadius,
      state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, 0.5));
  }
  const radius = entity.kind === 'boulder' ? TUNING.boulderRadius : entity.kind === 'urchin' ? TUNING.urchinRadius : entity.kind === 'swarm' ? TUNING.swarmRadius : entity.kind === 'bridge' ? TUNING.bridgeLength / 2 : entity.kind === 'rumour' ? entity.radius ?? 0.5 : 0.55;
  return inFrame(entity.x, entity.z, radius,
    state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, entity.kind === 'boulder' ? 1 : 0.8);
}

function monitorCone(entity: CastEntity): MonitorCone {
  return { origin: { x: entity.x, z: entity.z }, heading: entity.heading ?? 0, range: entity.range ?? 0, halfAngle: entity.halfAngle ?? 0 };
}

function fail(state: SimState, reason: FailReason) {
  if (!state.failed) state.failed = reason;
}

export function step(previous: SimState, input: InputFrame = NEUTRAL_INPUT): SimState {
  if (previous.failed) return previous;
  const state: SimState = {
    ...previous,
    camera: { ...previous.camera },
    ...(previous.shoot ? { shoot: { ...previous.shoot } } : {}),
    talent: { ...previous.talent },
    path: previous.path,
    forks: previous.forks,
    routeChoices: { ...previous.routeChoices },
    entities: previous.entities.map((entity) => ({ ...entity, members: entity.members?.map((member) => ({ ...member })) })),
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
  const talentBeforeMove = { x: talent.x, z: talent.z };
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
  const headingLength = Math.hypot(headingX, headingZ) || 1;
  const talentTier = lodTier(1000 / cam.zoom, talent.lodTier);
  talent.lodTier = Math.min(talentTier, 3) as 0 | 1 | 2 | 3;
  const talentSpeed = TUNING.talentSpeeds[Math.min(talentTier, 3)];
  const snappedToNode = Boolean(next && !input.hold && distance(talent.x, talent.z, next.x, next.z) < 0.02);
  if (snappedToNode && next) {
    talent.x = next.x;
    talent.z = next.z;
    talent.pathIndex++;
  }
  const stopped = input.hold || !next || snappedToNode;
  state.waiting = !next;
  if (!stopped) {
    talent.x += (headingX / headingLength) * talentSpeed * dt;
    talent.z += (headingZ / headingLength) * talentSpeed * dt;
    if (distance(talent.x, talent.z, next.x, next.z) < talentSpeed * dt) {
      talent.x = next.x;
      talent.z = next.z;
      talent.pathIndex++;
    }
  }
  state.travelDistance += distance(talentBeforeMove.x, talentBeforeMove.z, talent.x, talent.z);
  const talentInMonitor = state.entities.some((monitor) => monitor.kind === 'monitor' && monitor.spawned && !monitor.cut
    && monitorConeContains(monitorCone(monitor), { x: talent.x, z: talent.z }));
  if (talentInMonitor || inFrame(talent.x, talent.z, TUNING.talentRadii[Math.min(talentTier, 3)], cam.x, cam.z, cam.zoom, cam.yaw, 1.4)) talent.offscreenTicks = 0;
  else talent.offscreenTicks++;
  if (talent.offscreenTicks >= TUNING.offscreenGrace * TUNING.tickRate) fail(state, 'lost-talent');

  for (const entity of state.entities) {
    if (entity.cut) continue;
    if (entity.kind === 'monitor' || entity.kind === 'red-monitor') { entity.spawned = true; continue; }
    if (entity.kind === 'continuity' && entity.spawned && !entityInFrame(state, entity)) {
      entity.spawned = false;
      entity.propIndex = ((entity.propIndex ?? 0) + 1) % (entity.propSequence?.length ?? 4);
      continue;
    }
    if (entity.kind === 'rumour') {
      const visible = entityInFrame(state, entity);
      entity.radius = advanceRumourRadius(entity.radius ?? 0.5, visible, dt);
      if (visible) entity.spawned = true;
      if (!entity.spawned) continue;
    }
    if (!entity.spawned) {
      const nearTalent = entity.kind === 'extras' && entity.members
        ? entity.members.some((member) => !member.cut && distance(entity.x + member.dx, entity.z + member.dz, talent.x, talent.z) < TUNING.popInExclusion)
        : distance(entity.x, entity.z, talent.x, talent.z) < TUNING.popInExclusion;
      const spawnTier = lodTier((entity.kind === 'bridge' || entity.kind === 'extras' ? 1 : entity.kind === 'swarm' ? TUNING.swarmRadius : entity.kind === 'urchin' ? TUNING.urchinRadius : 0.55) * 1000 / cam.zoom, entity.lodTier as LodTier | undefined);
      if (entityInFrame(state, entity) && !nearTalent && !(entity.kind === 'swarm' && spawnTier === 4)) {
        entity.spawned = true;
        entity.age = 0;
        if (entity.kind !== 'continuity') state.consumed.push(entity.id);
      }
    }
    if (!entity.spawned) continue;
    const radius = entity.kind === 'boulder' ? TUNING.boulderRadius : entity.kind === 'urchin' ? TUNING.urchinRadius : entity.kind === 'swarm' ? TUNING.swarmRadius : entity.kind === 'extras' ? TUNING.extrasRadius : entity.kind === 'rumour' ? entity.radius ?? 0.5 : 0.55;
    const lodSize = entity.kind === 'bridge' || entity.kind === 'extras' ? 1000 / cam.zoom : radius * 1000 / cam.zoom;
    const tier = lodTier(lodSize, entity.lodTier as LodTier | undefined);
    entity.lodTier = tier;
    if (entity.kind === 'swarm' && tier === 4) continue;
    if (entity.kind === 'stagehand' && cam.moving) {
      const reel = state.entities.filter((candidate) => candidate.kind === 'reel' && candidate.spawned && !candidate.cut).sort((a, b) => distance(a.x, a.z, entity.x, entity.z) - distance(b.x, b.z, entity.x, entity.z))[0];
      const target = reel ?? state.path[Math.min(talent.pathIndex + 1, state.path.length - 1)];
      if (target) {
        const dx = target.x - entity.x;
        const dz = target.z - entity.z;
        const length = Math.hypot(dx, dz) || 1;
        entity.x += dx / length * TUNING.stagehandSpeed * dt;
        entity.z += dz / length * TUNING.stagehandSpeed * dt;
        if (reel && distance(entity.x, entity.z, reel.x, reel.z) < 0.45) {
          reel.cut = true;
          state.cuts.push(reel.id);
        }
      }
    }
    entity.age++;
    entity.x += entity.vx * dt;
    entity.z += entity.vz * dt;
    const visible = entityInFrame(state, entity);
    if (!visible && entity.kind !== 'swarm' && entity.kind !== 'rumour') {
      entity.cut = true;
      state.cuts.push(entity.id);
      continue;
    }
    if (!visible) continue;
    if (entity.kind === 'extras' && entity.members) {
      for (const member of entity.members) {
        if (member.cut) continue;
        member.dx += member.vx * dt;
        member.dz += member.vz * dt;
        if (member.dx < -1.8 || member.dx > 1.8) member.vx *= -1;
        if (member.dz < -0.8 || member.dz > 0.8) member.vz *= -1;
        member.dx = Math.max(-1.8, Math.min(1.8, member.dx));
        member.dz = Math.max(-0.8, Math.min(0.8, member.dz));
        if (!inFrame(entity.x + member.dx, entity.z + member.dz, TUNING.extrasMemberRadius, cam.x, cam.z, cam.zoom, cam.yaw, 0.5)) member.cut = true;
      }
      if (entity.members.every((member) => member.cut)) {
        entity.cut = true;
        state.cuts.push(entity.id);
        continue;
      }
    }
    const close = distance(entity.x, entity.z, talent.x, talent.z) <= radius + TUNING.talentRadii[Math.min(talentTier, 3)];
    if (entity.kind === 'glass' && entity.cut && Math.abs(talent.x - entity.x) <= 0.5 && Math.abs(talent.z - entity.z) <= 0.5) fail(state, 'fell');
    if (close && ((entity.kind === 'boulder') || (entity.kind === 'urchin' && tier <= 1))) fail(state, 'hit');
    if (close && entity.kind === 'urchin' && tier === 2) {
      const push = (talent.x - entity.x) >= 0 ? 1 : -1;
      talent.x += push * dt;
    }
    if (close && entity.kind === 'swarm') fail(state, 'hit');
    if (close && entity.kind === 'extras' && tier >= 2) fail(state, 'hit');
    if (entity.kind === 'bridge' && tier >= 2 && talent.x >= entity.x - TUNING.bridgeLength / 2 && talent.x <= entity.x + TUNING.bridgeLength / 2
      && Math.abs(talent.z - entity.z) <= 0.6 + TUNING.talentRadii[Math.min(talentTier, 3)]) fail(state, 'fell');
    if (close && entity.kind === 'reel' && talentTier <= 1) {
      entity.cut = true;
      state.cuts.push(entity.id);
      state.film += TUNING.reelFilm;
      state.score += 100;
    }
  }

  for (const hostile of state.entities.filter((entity) => entity.kind === 'red-monitor' && entity.spawned && !entity.cut
    && inFrame(entity.x, entity.z, 0.8, cam.x, cam.z, cam.zoom, cam.yaw, 1))) {
    if (redMonitorOverlapsTarget(monitorCone(hostile), { x: talent.x, z: talent.z }, TUNING.talentRadii[Math.min(talentTier, 3)])) fail(state, 'hit');
    for (const target of state.entities) {
      if (target === hostile || target.cut || target.kind === 'monitor' || target.kind === 'red-monitor' || target.kind === 'continuity' || target.kind === 'rumour') continue;
      const radius = target.kind === 'urchin' ? TUNING.urchinRadius : target.kind === 'boulder' ? TUNING.boulderRadius : 0.55;
      if (redMonitorOverlapsTarget(monitorCone(hostile), { x: target.x, z: target.z }, radius)) {
        target.cut = true;
        state.cuts.push(target.id);
      }
    }
  }

  if (state.entities.some((glass) => glass.kind === 'glass' && glass.cut
    && Math.abs(talent.x - glass.x) <= 0.5 && Math.abs(talent.z - glass.z) <= 0.5)) fail(state, 'fell');
  state.film -= dt * (input.hold || state.waiting ? 2 : 1);
  if (state.film <= 0) { state.film = 0; fail(state, 'out-of-film'); }
  if (state.shoot) {
    const startX = state.path[0]?.x ?? 0;
    const pathLength = state.path.slice(1).reduce((sum, point, index) => sum + distance(point.x, point.z, state.path[index]!.x, state.path[index]!.z), 0);
    const active = state.shoot.sceneIndex === 3 || isWrapActive(state.travelDistance, pathLength);
    if (active) {
      const speed = TUNING.wrapSpeeds[Math.min(state.shoot.sceneIndex, 2)]!;
      const talentDistance = state.travelDistance;
      const strike = state.shoot.wrapDistance ?? talentDistance - 12;
      const advanced = advanceWrap(strike, dt, speed, talentDistance);
      state.shoot.wrapDistance = advanced.strikeDistance;
      state.shoot.wrapCaught = advanced.wrapped;
      const worldPathSpan = (state.path.at(-1)?.x ?? startX) - startX || 1;
      const pathCoordinate = (x: number) => ((x - startX) / worldPathSpan) * pathLength;
      state.tiles = state.tiles.filter((tile) => !isDeletedByWrap(pathCoordinate(tile.x), advanced.strikeDistance));
      for (const entity of state.entities) {
        if (!entity.cut && pathCoordinate(entity.x) <= advanced.strikeDistance) {
          entity.cut = true;
          state.cuts.push(entity.id);
        }
      }
      if (advanced.wrapped) fail(state, 'wrapped');
    }
  }
  const pathEnd = state.path[state.path.length - 1];
  if (pathEnd && (talent.pathIndex >= state.path.length - 1 || talent.x >= pathEnd.x)) fail(state, 'wrapped');
  state.tick++;
  return state;
}

export function runTicks(initial: SimState, frames: InputFrame[]): SimState {
  return frames.reduce((state, frame) => step(state, frame), initial);
}
