import * as THREE from 'three';
import { cameraBasis, projectPoint } from '../sim/frame';
import { TUNING } from '../sim/tuning';

export interface RenderCameraState { x: number; z: number; zoom: number; yaw: number; }
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
  camera.left = -state.zoom / 2;
  camera.right = state.zoom / 2;
  camera.top = state.zoom / 2;
  camera.bottom = -state.zoom / 2;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export function projectWithRenderer(camera: THREE.OrthographicCamera, x: number, z: number) {
  const point = new THREE.Vector3(x, 0, z).project(camera);
  return { x: point.x, y: point.y };
}

export function projectWithSimulation(x: number, z: number, state: RenderCameraState) {
  const point = projectPoint(x, z, state.x, state.z, state.zoom, state.yaw);
  return { x: point.x * 2, y: point.y * 2 };
}
