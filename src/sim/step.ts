import { inFrame, projectPoint, projectedAabb } from './frame';
import { gateOpen, markShots, shotBlocksTalent } from './framing';
import { lodTier, type LodTier } from './lod';
import { lensAspect, lensLodFactor } from './lenses';
import { TUNING } from './tuning';
import { pathZAt } from '../gen/generate';
import { advanceRumourRadius, advanceWrap, isDeletedByWrap, isWrapActive, monitorConeContains, redMonitorOverlapsTarget, type MonitorCone } from './m6';
import type { CastEntity, FailReason, InputFrame, SimState } from './types';

export const NEUTRAL_INPUT: InputFrame = { panX: 0, panZ: 0, zoom: 0, rotate: 0, hold: false, steady: false };
const dt = 1 / TUNING.tickRate;
const distance = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

function framed(state: SimState, x: number, z: number, radius: number, height: number) {
  return inFrame(x, z, radius, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw, height,
    lensAspect(state.lens), state.lens === 'tilt-shift' ? state.camera.focusOffset : null, state.lens === 'fisheye');
}
function detailFactor(state: SimState, x: number, z: number) {
  const projected = projectPoint(x, z, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw);
  return lensLodFactor(state.lens, projected.x, projected.y);
}

function entityInFrame(state: SimState, entity: CastEntity) {
  if (entity.kind === 'monitor') return true;
  const inMonitor = state.entities.some((monitor) => monitor.kind === 'monitor' && monitor.spawned && !monitor.cut
    && monitorConeContains(monitorCone(monitor), { x: entity.x, z: entity.z }));
  if (inMonitor) return true;
  if (entity.kind === 'extras' && entity.members) {
    return entity.members.some((member) => !member.cut && framed(state, entity.x + member.dx, entity.z + member.dz, TUNING.extrasMemberRadius, 0.5));
  }
  const radius = entity.kind === 'boulder' ? TUNING.boulderRadius : entity.kind === 'urchin' ? TUNING.urchinRadius : entity.kind === 'swarm' ? TUNING.swarmRadius : entity.kind === 'bridge' ? TUNING.bridgeLength / 2 : entity.kind === 'rumour' ? entity.radius ?? 0.5 : 0.55;
  return framed(state, entity.x, entity.z, radius, entity.kind === 'boulder' ? 1 : 0.8);
}

function monitorCone(entity: CastEntity): MonitorCone {
  return { origin: { x: entity.x, z: entity.z }, heading: entity.heading ?? 0, range: entity.range ?? 0, halfAngle: entity.halfAngle ?? 0 };
}

/**
 * Framed out but not cut: far Glass is unloaded intact (it only shatters within reach of the Talent, where it was
 * just on screen), and a stand-in on a gate mark only leaves when its shot has been called.
 */
function unloadsIntact(state: SimState, entity: CastEntity) {
  if (entity.kind === 'glass') return distance(entity.x, entity.z, state.talent.x, state.talent.z) > TUNING.glassShatterRadius;
  return entity.gate !== undefined && !gateOpen(state, entity.gate);
}

/** A Wide crowd tramples the Talent when a visible member touches it. */
function crowdContact(entity: CastEntity, talent: SimState['talent'], talentRadius: number) {
  return entity.members?.some((member) => !member.cut
    && distance(entity.x + member.dx, entity.z + member.dz, talent.x, talent.z) <= TUNING.extrasContactRadius + talentRadius) ?? false;
}

/** Length along the set path (x is strictly increasing) up to world x, via a cumulative table and binary search. */
function pathArcLength(path: SimState['path']): (x: number) => number {
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1]! + distance(path[i - 1]!.x, path[i - 1]!.z, path[i]!.x, path[i]!.z));
  return (x) => {
    if (path.length < 2 || x <= path[0]!.x) return 0;
    if (x >= path.at(-1)!.x) return cumulative.at(-1)! + x - path.at(-1)!.x;
    let low = 1;
    let high = path.length - 1;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (path[mid]!.x < x) low = mid + 1; else high = mid;
    }
    const a = path[low - 1]!;
    const b = path[low]!;
    return cumulative[low - 1]! + (cumulative[low]! - cumulative[low - 1]!) * ((x - a.x) / (b.x - a.x));
  };
}

function fail(state: SimState, reason: FailReason) {
  if (!state.failed) state.failed = reason;
}

function outsideFrame(state: SimState, x: number, z: number, radius: number, height: number) {
  const aspect = lensAspect(state.lens);
  const bounds = projectedAabb(x, z, radius, height, state.camera.x, state.camera.z, state.camera.zoom, state.camera.yaw);
  const halfBand = state.lens === 'tilt-shift' ? 0.2 : 0.5;
  const center = state.lens === 'tilt-shift' ? state.camera.focusOffset : 0;
  const dx = Math.max(-aspect / 2 - bounds.right, bounds.left - aspect / 2);
  const dy = Math.max(center - halfBand - bounds.top, bounds.bottom - (center + halfBand));
  return Math.max(dx, dy);
}

function noteFrameCut(state: SimState, entity: CastEntity) {
  state.cuts.push(entity.id);
  if (entity.kind === 'reel' || entity.kind === 'monitor' || entity.kind === 'red-monitor' || entity.kind === 'continuity') return;
  if (distance(entity.x, entity.z, state.talent.x, state.talent.z) > TUNING.closeCallRadius) return;
  state.closeCalls += 1;
  state.score += TUNING.closeCallScore;
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
  if (state.lens === 'long-lens') cam.zoom = TUNING.minZoom;
  if (state.lens === 'tilt-shift') cam.focusOffset = Math.max(-0.3, Math.min(0.3, cam.focusOffset - input.panZ / 127 * 0.012));
  const panZ = state.lens === 'tilt-shift' ? 0 : input.panZ;
  const panMultiplier = state.lens === 'long-lens' ? 2 : 1;
  const maxVelocity = cam.zoom * TUNING.panSpeed * panMultiplier;
  const steady = input.steady ? TUNING.steadyFactor : 1;
  const targetVX = Math.max(-1, Math.min(1, input.panX / 127)) * maxVelocity * steady;
  const targetVZ = Math.max(-1, Math.min(1, panZ / 127)) * maxVelocity * steady;
  const dv = TUNING.panAcceleration * cam.zoom * dt * panMultiplier;
  cam.vx += Math.max(-dv, Math.min(dv, targetVX - cam.vx));
  cam.vz += Math.max(-dv, Math.min(dv, targetVZ - cam.vz));
  cam.x += cam.vx * dt;
  cam.z += cam.vz * dt;
  cam.moving = Math.hypot(cam.vx, cam.vz) / cam.zoom > TUNING.motionThreshold;
  if (input.zoom && state.lens !== 'long-lens') cam.zoom = Math.max(TUNING.minZoom, Math.min(TUNING.maxZoom, cam.zoom * Math.exp(-(input.zoom / 127) * Math.log(TUNING.zoomRate) * dt)));
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

  markShots(state);
  const blocked = shotBlocksTalent(state);
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
  const talentTier = lodTier(1000 / cam.zoom * detailFactor(state, talent.x, talent.z), talent.lodTier);
  talent.lodTier = Math.min(talentTier, 3) as 0 | 1 | 2 | 3;
  const talentSpeed = TUNING.talentSpeeds[Math.min(talentTier, 3)];
  const snappedToNode = Boolean(next && !input.hold && !blocked && distance(talent.x, talent.z, next.x, next.z) < 0.02);
  if (snappedToNode && next) {
    talent.x = next.x;
    talent.z = next.z;
    talent.pathIndex++;
  }
  const stopped = input.hold || !next || snappedToNode || blocked;
  state.waiting = !next || blocked;
  if (!stopped) {
    talent.x += (headingX / headingLength) * talentSpeed * dt;
    talent.z += (headingZ / headingLength) * talentSpeed * dt;
    if (distance(talent.x, talent.z, next.x, next.z) < talentSpeed * dt) {
      talent.x = next.x;
      talent.z = next.z;
      talent.pathIndex++;
    }
  }
  const talentTravel = distance(talentBeforeMove.x, talentBeforeMove.z, talent.x, talent.z);
  state.travelDistance += talentTravel;
  state.totalDistance += talentTravel;
  const talentInMonitor = state.entities.some((monitor) => monitor.kind === 'monitor' && monitor.spawned && !monitor.cut
    && monitorConeContains(monitorCone(monitor), { x: talent.x, z: talent.z }));
  if (talentInMonitor || framed(state, talent.x, talent.z, TUNING.talentRadii[Math.min(talentTier, 3)], 1.4)) talent.offscreenTicks = 0;
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
      const nearTalent = entity.gate !== undefined ? false : entity.kind === 'extras' && entity.members
        ? entity.members.some((member) => !member.cut && distance(entity.x + member.dx, entity.z + member.dz, talent.x, talent.z) < TUNING.popInExclusion)
        : distance(entity.x, entity.z, talent.x, talent.z) < TUNING.popInExclusion;
      const spawnTier = lodTier((entity.kind === 'bridge' || entity.kind === 'extras' ? 1 : entity.kind === 'swarm' ? TUNING.swarmRadius : entity.kind === 'urchin' ? TUNING.urchinRadius : 0.55) * 1000 / cam.zoom * detailFactor(state, entity.x, entity.z), entity.lodTier as LodTier | undefined);
      if (entityInFrame(state, entity) && !nearTalent && !(entity.kind === 'swarm' && spawnTier === 4)) {
        entity.spawned = true;
        entity.age = 0;
        if (entity.kind !== 'continuity' && !state.consumed.includes(entity.id)) state.consumed.push(entity.id);
      }
    }
    if (!entity.spawned) continue;
    const radius = entity.kind === 'boulder' ? TUNING.boulderRadius : entity.kind === 'urchin' ? TUNING.urchinRadius : entity.kind === 'swarm' ? TUNING.swarmRadius : entity.kind === 'extras' ? TUNING.extrasRadius : entity.kind === 'rumour' ? entity.radius ?? 0.5 : 0.55;
    const lodSize = entity.kind === 'bridge' || entity.kind === 'extras' ? 1000 / cam.zoom : radius * 1000 / cam.zoom;
    const tier = lodTier(lodSize * detailFactor(state, entity.x, entity.z), entity.lodTier as LodTier | undefined);
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
    entity.z = entity.pathBound ? pathZAt(state.path, entity.x) : entity.z + entity.vz * dt;
    const visible = entityInFrame(state, entity);
    const fragileHold = (entity.kind === 'glass' || entity.kind === 'bridge')
      && outsideFrame(state, entity.x, entity.z, radius, 0.8) < TUNING.fragileKeepMargin;
    if (!visible && !fragileHold && entity.kind !== 'swarm' && entity.kind !== 'rumour') {
      if (unloadsIntact(state, entity)) { entity.spawned = false; continue; }
      entity.cut = true;
      noteFrameCut(state, entity);
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
        if (!framed(state, entity.x + member.dx, entity.z + member.dz, TUNING.extrasMemberRadius, 0.5)) member.cut = true;
      }
      if (entity.members.every((member) => member.cut)) {
        entity.cut = true;
        state.cuts.push(entity.id);
        continue;
      }
    }
    const close = distance(entity.x, entity.z, talent.x, talent.z) <= radius + TUNING.talentRadii[Math.min(talentTier, 3)];
    if (entity.kind === 'glass' && entity.cut && Math.abs(talent.x - entity.x) <= 0.5 && Math.abs(talent.z - entity.z) <= 0.5) fail(state, 'fell');
    if (close && entity.kind === 'boulder' && tier <= 0) fail(state, 'hit');
    if (close && entity.kind === 'urchin' && tier <= 1) fail(state, 'hit');
    if (close && entity.kind === 'urchin' && tier === 2) {
      const push = (talent.x - entity.x) >= 0 ? 1 : -1;
      talent.x += push * dt;
    }
    if (close && entity.kind === 'swarm') fail(state, 'hit');
    if (entity.kind === 'extras' && tier >= 2 && crowdContact(entity, talent, TUNING.talentRadii[Math.min(talentTier, 3)])) fail(state, 'hit');
    if (entity.kind === 'bridge' && tier >= 2 && talent.x >= entity.x - TUNING.bridgeLength / 2 && talent.x <= entity.x + TUNING.bridgeLength / 2
      && Math.abs(talent.z - entity.z) <= 0.6 + TUNING.talentRadii[Math.min(talentTier, 3)]) fail(state, 'fell');
    if (close && entity.kind === 'reel' && talentTier <= 1) {
      entity.cut = true;
      state.cuts.push(entity.id);
      state.film += TUNING.reelFilm;
      state.score += 100;
    }
  }

  // The hostile camera is live only while it is on screen. Its tally runs while it holds the Talent in its cone,
  // and the take fails only once the tally has run for `hostileLockSeconds` (framing it out or leaving the cone resets it).
  for (const hostile of state.entities.filter((entity) => entity.kind === 'red-monitor' && entity.spawned && !entity.cut)) {
    const live = entityInFrame(state, hostile);
    const sees = live && redMonitorOverlapsTarget(monitorCone(hostile), { x: talent.x, z: talent.z }, TUNING.talentRadii[Math.min(talentTier, 3)]);
    hostile.lockTicks = sees ? (hostile.lockTicks ?? 0) + 1 : 0;
    if (hostile.lockTicks >= TUNING.hostileLockSeconds * TUNING.tickRate) fail(state, 'hit');
    if (!live) continue;
    for (const target of state.entities) {
      // It cuts only cast the player can see, and never the floor (Glass, bridges).
      if (target === hostile || target.cut || !target.spawned || target.kind === 'monitor' || target.kind === 'red-monitor' || target.kind === 'continuity'
        || target.kind === 'rumour' || target.kind === 'glass' || target.kind === 'bridge' || !entityInFrame(state, target)) continue;
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
    const pathLength = state.path.slice(1).reduce((sum, point, index) => sum + distance(point.x, point.z, state.path[index]!.x, state.path[index]!.z), 0);
    const active = state.shoot.sceneIndex === 3 || isWrapActive(state.travelDistance, pathLength);
    if (active) {
      const speed = TUNING.wrapSpeeds[Math.min(state.shoot.sceneIndex, 2)]!;
      const talentDistance = state.travelDistance;
      const strike = state.shoot.wrapDistance ?? talentDistance - 12;
      const advanced = advanceWrap(strike, dt, speed, talentDistance);
      state.shoot.wrapDistance = advanced.strikeDistance;
      state.shoot.wrapCaught = advanced.wrapped;
      // The strike line sits (travel − strike) path units behind the Talent, measured along the set path. (A straight
      // x-to-length scale put it ahead of the Talent on winding paths, deleting floor it was standing on.)
      const arcLength = pathArcLength(state.path);
      const strikeLine = arcLength(talent.x) - (talentDistance - advanced.strikeDistance);
      state.tiles = state.tiles.filter((tile) => !isDeletedByWrap(arcLength(tile.x), strikeLine));
      for (const entity of state.entities) {
        if (!entity.cut && arcLength(entity.x) <= strikeLine) {
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
