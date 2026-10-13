import * as THREE from 'three';

/**
 * Hostile-camera lock telegraph. Presentation only: it reads `lockTicks` and the cone, never writes the sim.
 * The cone is drawn on the set as a carmine felt wedge with a stitched rim; the tally light and the
 * countdown ring live in a DOM overlay so they stay crisp at any gate size.
 */
const CARMINE = '#c8322a';

/** A flat wedge in the monitor's local frame (it faces local +z, as the monitor group is rotated). */
export function lockFan(range: number, halfAngle: number): THREE.Group {
  const group = new THREE.Group();
  group.name = 'lock-fan';
  const segments = 18;
  const fill: number[] = [];
  const rim: number[] = [];
  const at = (angle: number, radius: number) => [Math.sin(angle) * radius, 0, Math.cos(angle) * radius] as const;
  for (let i = 0; i < segments; i++) {
    const a0 = -halfAngle + (2 * halfAngle * i) / segments;
    const a1 = -halfAngle + (2 * halfAngle * (i + 1)) / segments;
    fill.push(0, 0, 0, ...at(a1, range), ...at(a0, range));
    // Outer rim band.
    const inner = range - 0.28;
    rim.push(...at(a0, inner), ...at(a1, range), ...at(a0, range), ...at(a0, inner), ...at(a1, inner), ...at(a1, range));
  }
  // Side rims as thin quads.
  for (const side of [-1, 1]) {
    const angle = side * halfAngle;
    const n = [Math.cos(angle) * 0.14 * side, 0, -Math.sin(angle) * 0.14 * side];
    const far = at(angle, range);
    rim.push(0, 0, 0, far[0], 0, far[2], far[0] - n[0]!, 0, far[2] - n[2]!, 0, 0, 0, far[0] - n[0]!, 0, far[2] - n[2]!, -n[0]!, 0, -n[2]!);
  }
  const build = (positions: number[], opacity: number, name: string) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: CARMINE, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
    mesh.name = name; mesh.renderOrder = -1;
    return mesh;
  };
  group.add(build(fill, 0.16, 'lock-fan-fill'), build(rim, 0.7, 'lock-fan-rim'));
  group.position.y = 0.04;
  return group;
}

/** Brightens the wedge as the lock builds; `on` is the tally blink phase. */
export function updateLockFan(fan: THREE.Object3D, progress: number, on: boolean) {
  const fill = fan.getObjectByName('lock-fan-fill') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
  const rim = fan.getObjectByName('lock-fan-rim') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
  if (fill) fill.material.opacity = progress > 0 ? 0.22 + 0.3 * progress + (on ? 0.08 : 0) : 0.14;
  if (rim) rim.material.opacity = progress > 0 ? (on ? 0.95 : 0.6) : 0.55;
}

export interface LockMark { x: number; y: number; progress: number; on: boolean; }

/** Tally dot plus countdown ring per on-screen hostile camera, and the gate-edge warning. */
export class LockOverlay {
  private readonly root: HTMLDivElement;
  private readonly marks: HTMLDivElement[] = [];
  constructor(private readonly gate: HTMLElement, mount: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'lock-overlay';
    mount.append(this.root);
  }

  update(marks: LockMark[]) {
    while (this.marks.length < marks.length) {
      const mark = document.createElement('div');
      mark.className = 'lock-mark';
      mark.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="lock-track" cx="24" cy="24" r="19"/><circle class="lock-fill" cx="24" cy="24" r="19" pathLength="100"/><circle class="lock-tally" cx="24" cy="24" r="8"/></svg>';
      this.root.append(mark);
      this.marks.push(mark);
    }
    this.marks.forEach((mark, index) => {
      const data = marks[index];
      mark.hidden = !data;
      if (!data) return;
      mark.style.transform = `translate(${data.x}px, ${data.y}px)`;
      mark.classList.toggle('locking', data.progress > 0);
      mark.classList.toggle('on', data.on);
      mark.style.setProperty('--lock', String(data.progress));
    });
    const worst = marks.reduce((max, mark) => Math.max(max, mark.progress), 0);
    const blink = marks.some((mark) => mark.progress > 0 && mark.on);
    this.gate.classList.toggle('hostile-lock', worst > 0);
    this.gate.classList.toggle('hostile-blink', blink);
    this.gate.style.setProperty('--lock', String(worst));
  }
}
