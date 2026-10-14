import * as THREE from 'three';
import { cameraBasis, projectPoint } from '../sim/frame';
import { TUNING } from '../sim/tuning';
import { frameView, type GateId, type LensId } from '../sim/lenses';

export interface RenderCameraState { x: number; z: number; zoom: number; yaw: number; lens?: LensId; gate?: GateId; }
export function updateRenderCamera(camera: THREE.OrthographicCamera, state: RenderCameraState) {
  const distance = 30;
  const basis = cameraBasis(state.yaw);
  const target = new THREE.Vector3(state.x, 0, state.z);
  camera.position.set(
    target.x + basis.sin * TUNING.projectionPitchCosine * distance,
    TUNING.projectionPitchScale * distance,
    target.z + basis.cos * TUNING.projectionPitchCosine * distance,
  );
  camera.up.set(0, 1, 0);
  camera.lookAt(target);
  const { zoom, aspect } = frameView(state.lens ?? '35mm', state.gate, state.zoom);
  camera.left = -zoom * aspect / 2;
  camera.right = zoom * aspect / 2;
  camera.top = zoom / 2;
  camera.bottom = -zoom / 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export function projectWithRenderer(camera: THREE.OrthographicCamera, x: number, z: number) {
  const point = new THREE.Vector3(x, 0, z).project(camera);
  return { x: point.x, y: point.y };
}

export function projectWithSimulation(x: number, z: number, state: RenderCameraState) {
  const frame = frameView(state.lens ?? '35mm', state.gate, state.zoom);
  const point = projectPoint(x, z, state.x, state.z, frame.zoom, state.yaw, frame.aspect);
  return { x: point.x * 2, y: point.y * 2 };
}
