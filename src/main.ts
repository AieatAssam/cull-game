import * as THREE from 'three';
import './style.css';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing app root');
app.innerHTML = `
  <section class="stage">
    <header class="topbar"><div class="brand"><span class="rec-dot"></span><strong>CULL</strong><span class="tagline">CAMERA DEPARTMENT</span></div><div class="readout"><span>TAKE 01</span><b>01:30</b></div></header>
    <div class="composition"><aside class="margin margin-left"><div class="slate">SCENE 01<br><strong>BACKLOT</strong></div></aside><div class="gate-wrap"><div class="gate-label">VIEWFINDER · GATE 1:1</div><div class="gate"><div class="thirds"></div><div class="gate-corners"></div><div class="mount" id="mount"></div></div><div class="gate-foot"><span>55° · ORTHOGRAPHIC</span><span>STANDBY</span></div></div><aside class="margin margin-right"><div class="camera-mark">⌑<small>CAM 01</small></div></aside></div>
    <footer class="controlbar"><span class="controls">GREYBOX CAMERA TEST</span></footer>
  </section>`;
const mount = app.querySelector<HTMLElement>('#mount')!;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#e8e4da');
const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
camera.position.set(0, 24, 17);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
mount.append(renderer.domElement);
scene.add(new THREE.HemisphereLight('#fff9ec', '#716a60', 2));
function resize() {
  const bounds = mount.getBoundingClientRect();
  const size = Math.max(1, Math.floor(Math.min(bounds.width, bounds.height)));
  renderer.setSize(size, size, true);
  renderer.render(scene, camera);
}
new ResizeObserver(resize).observe(mount);
resize();
