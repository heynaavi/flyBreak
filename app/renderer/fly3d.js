// fly3d.js — the flybody Drosophila (DeepMind + Janelia micro-CT model, Apache-2.0) in Three.js.
// A transparent WebGL canvas over the desktop; an orthographic camera in CSS pixels so the fly can
// be placed at (x, y) like the 2D one. Wings hinge at their real joints, the proboscis extends.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export async function createFly3D({ canvas, W, H, assets = 'assets/fly3d', bodyLength = 70 }) {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, premultipliedAlpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.7;

  const scene = new THREE.Scene();
  // screen space: x right, y down, z toward the viewer
  const camera = new THREE.OrthographicCamera(0, W, 0, H, -4000, 4000);
  camera.position.set(0, 0, 2000); camera.lookAt(0, 0, 0);   // top=0/bottom=H makes y grow downward

  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x5a4530, 1.6));
  const key = new THREE.DirectionalLight(0xfff1dc, 3.2); key.position.set(-300, -500, 900); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd8ff, 1.2); rim.position.set(400, 300, 600); scene.add(rim);
  const fill = new THREE.DirectionalLight(0xffd9b0, 0.5); fill.position.set(200, 600, 300); scene.add(fill);

  const s = await (await fetch(`${assets}/scene.json`)).json();
  const [lo, hi] = s.bbox;
  const len = hi[0] - lo[0];
  const unit = bodyLength / len;                          // model units -> px
  const centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];

  // root (position on screen, heading, roll) -> tilt (a little perspective) -> model (MuJoCo x fwd, y left, z up)
  const root = new THREE.Group();
  const tilt = new THREE.Group(); tilt.rotation.x = -0.55; root.add(tilt);
  const model = new THREE.Group();
  // MuJoCo -> screen: x -> x, y(left) -> -y (screen up), z(up) -> +z (toward viewer)
  model.scale.set(unit, -unit, unit);
  model.position.set(-centre[0] * unit, centre[1] * unit, -centre[2] * unit);
  tilt.add(model);
  scene.add(root);

  const mats = {
    eye: new THREE.MeshPhysicalMaterial({ color: 0xc2281f, roughness: 0.25, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.15, side: THREE.DoubleSide }),
    wing: new THREE.MeshPhysicalMaterial({ color: 0xdfe8f5, roughness: 0.15, metalness: 0.0, transparent: true, opacity: 0.32, transmission: 0.2, side: THREE.DoubleSide, depthWrite: false, iridescence: 0.6, iridescenceIOR: 1.3 }),
    body: new THREE.MeshStandardMaterial({ color: 0xa8895e, roughness: 0.5, metalness: 0.05, side: THREE.DoubleSide }),
    black: new THREE.MeshStandardMaterial({ color: 0x1c140c, roughness: 0.6, side: THREE.DoubleSide }),
    brown: new THREE.MeshStandardMaterial({ color: 0x4a3620, roughness: 0.7, side: THREE.DoubleSide }),
    lower: new THREE.MeshStandardMaterial({ color: 0xb59a6a, roughness: 0.6, side: THREE.DoubleSide }),
    ocelli: new THREE.MeshPhysicalMaterial({ color: 0x7a2a1a, roughness: 0.2, clearcoat: 1, side: THREE.DoubleSide }),
  };
  const matFor = (g) => {
    const n = g.mesh.toLowerCase();
    if (n.includes('red')) return mats.eye;
    if (n.includes('ocelli')) return mats.ocelli;
    if (n.includes('wing')) return mats.wing;
    if (n.includes('black')) return mats.black;
    if (n.includes('brown') || n.includes('bristle')) return mats.brown;
    if (n.includes('lower')) return mats.lower;
    return mats.body;
  };

  // articulated parts: each wing pivots about its hinge joint; the proboscis chain translates
  const parts = { wingL: new THREE.Group(), wingR: new THREE.Group(), proboscis: new THREE.Group(), rest: new THREE.Group() };
  for (const p of Object.values(parts)) model.add(p);
  const pivots = {};
  const j = s.joints;
  for (const [key, pat] of [['wingL', /wing.*left|left.*wing/], ['wingR', /wing.*right|right.*wing/]]) {
    const jn = Object.keys(j).find(n => pat.test(n) && /yaw|hinge|flap|_x|_z|_y/.test(n)) || Object.keys(j).find(n => pat.test(n));
    if (jn) pivots[key] = { anchor: j[jn].anchor, axis: j[jn].axis };
  }
  for (const key of ['wingL', 'wingR']) {
    const pv = pivots[key]; if (!pv) continue;
    parts[key].position.set(...pv.anchor);
    parts[key].userData.axis = new THREE.Vector3(...pv.axis).normalize();
  }
  const ROT_INV = (new URLSearchParams(location.search).get('rot') || '1') === '1';
  const probBodies = ['rostrum', 'haustellum', 'labrum'];
  const loader = new GLTFLoader();
  const loadOne = async g => {
    const glb = `${assets}/${g.file.replace(/\.obj$/i, '.glb').split('/').pop()}`;
    let gltf;
    for (let attempt = 0; attempt < 4 && !gltf; attempt++) {
      try { gltf = await loader.loadAsync(glb); } catch (e) { await new Promise(r => setTimeout(r, 150 + 300 * attempt)); }
    }
    if (!gltf) { console.warn('missing', glb); return; }
    const mesh = gltf.scene;
    mesh.traverse(o => { if (o.isMesh) { o.material = matFor(g); o.frustumCulled = false; } });
    const m = new THREE.Matrix4().set(
      g.mat[0], g.mat[1], g.mat[2], g.pos[0],
      g.mat[3], g.mat[4], g.mat[5], g.pos[1],
      g.mat[6], g.mat[7], g.mat[8], g.pos[2],
      0, 0, 0, 1);
    // MuJoCo recentres every mesh at its centre of mass and rotates it to principal axes before the
    // geom frame applies: centered = R^T (scale * raw - mesh_pos). Undo that for the raw OBJ vertices.
    const ms = g.scale || [1, 1, 1], mp = g.mesh_pos || [0, 0, 0], mq = g.mesh_quat || [1, 0, 0, 0];
    const R = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(mq[1], mq[2], mq[3], mq[0]));
    if (matFor(g) === mats.eye) m.multiply(new THREE.Matrix4().makeScale(1.16, 1.16, 1.16));  // decimation shrank the faceted eyes
    m.multiply(ROT_INV ? R.clone().transpose() : R)
     .multiply(new THREE.Matrix4().makeTranslation(-mp[0], -mp[1], -mp[2]))
     .multiply(new THREE.Matrix4().makeScale(ms[0], ms[1], ms[2]));
    mesh.matrixAutoUpdate = false;
    const b = g.body.toLowerCase();
    let parent = parts.rest;
    if (/wing/.test(b)) parent = /left/.test(b) ? parts.wingL : parts.wingR;
    else if (probBodies.some(k => b.includes(k))) parent = parts.proboscis;
    if (parent === parts.wingL || parent === parts.wingR) {
      // express the mesh relative to the hinge so rotating the group rotates about the joint
      const inv = new THREE.Matrix4().makeTranslation(-parent.position.x, -parent.position.y, -parent.position.z);
      m.premultiply(inv);
    }
    mesh.matrix.copy(m);
    parent.add(mesh);
  };
  const todo = s.geoms.filter(g => g.group !== 3);
  for (let i = 0; i < todo.length; i += 6) await Promise.all(todo.slice(i, i + 6).map(loadOne));
  // size and centre from the assembled body (wings excluded), measured in model units
  model.scale.set(1, 1, 1); model.position.set(0, 0, 0); model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(parts.rest);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  const u = bodyLength / size.x;
  model.scale.set(u, -u, u);
  model.position.set(-c.x * u, c.y * u, -c.z * u);
  console.log('fly3d body size (model units)', size.toArray().map(v => +v.toFixed(3)), 'centre', c.toArray().map(v => +v.toFixed(3)));
  const restQuat = { wingL: parts.wingL.quaternion.clone(), wingR: parts.wingR.quaternion.clone() };

  const REST_FOLD = +(new URLSearchParams(location.search).get('fold') || -1.25);
  // state: {x, y, heading, roll, alt, flying, wingPhase, proboscis, scale}
  function render(f) {
    const sc = (f.scale || 1) / 2.6;
    root.position.set(f.x, f.y, 0);
    root.rotation.set(0, 0, f.heading);
    root.scale.setScalar(sc * (1 + 0.22 * (f.alt || 0)));
    tilt.rotation.y = 0.6 * (f.roll || 0);
    for (const key of ['wingL', 'wingR']) {
      const w = parts[key], ax = w.userData.axis; if (!ax) continue;
      const side = key === 'wingL' ? 1 : -1;
      // rest: folded back over the abdomen; flight: stroke of ~140 degrees about the hinge
      const angle = f.flying ? (-0.9 + 1.1 * (0.5 + 0.5 * Math.sin(f.wingPhase + (side > 0 ? 0 : 0.4)))) : REST_FOLD;   // axes are already mirrored per side
      w.quaternion.copy(restQuat[key]).multiply(new THREE.Quaternion().setFromAxisAngle(ax, angle));
    }
    parts.proboscis.position.set(0, 0, -0.35 * (f.proboscis || 0) * len * 0.12);
    renderer.render(scene, camera);
  }
  return { render, parts, scene, renderer };
}
