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
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.5;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // screen space, right-handed: x right, y down, z INTO the screen (toward the viewer is -z).
  // The camera sits in front of the screen looking along +z with up = -y, so nothing is mirrored.
  const camera = new THREE.OrthographicCamera(0, W, 0, -H, -4000, 4000);
  camera.position.set(0, 0, -2000); camera.up.set(0, -1, 0); camera.lookAt(0, 0, 0);

  const hemi = new THREE.HemisphereLight(0xdfe8ff, 0x304a70, 1.9); hemi.position.set(0, 0, -1); scene.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1dc, 3.2); key.position.set(-300, -500, -900); scene.add(key); scene.add(key.target);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.radius = 6; key.shadow.bias = -0.0005;
  Object.assign(key.shadow.camera, { left: -420, right: 420, top: 420, bottom: -420, near: 1, far: 4000 }); key.shadow.camera.updateProjectionMatrix();
  // the desktop "glass": invisible except where it receives shadow
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W * 3, H * 3), new THREE.ShadowMaterial({ opacity: 0.42, transparent: true }));
  ground.position.set(W / 2, H / 2, 1); ground.rotation.y = Math.PI; ground.receiveShadow = true; scene.add(ground);
  const rim = new THREE.DirectionalLight(0x5ab8ff, 3.4); rim.position.set(420, 260, -520); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8fd0ff, 1.2); fill.position.set(-200, 500, -300); scene.add(fill);

  const s = await (await fetch(`${assets}/scene.json`)).json();
  const [lo, hi] = s.bbox;
  const len = hi[0] - lo[0];
  const unit = bodyLength / len;                          // model units -> px
  const centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];

  // root (position on screen, heading, roll) -> tilt (a little perspective) -> model (MuJoCo x fwd, y left, z up)
  const root = new THREE.Group();
  const tilt = new THREE.Group(); tilt.rotation.x = 0.22; root.add(tilt);
  const model = new THREE.Group();
  // MuJoCo -> screen: x -> x, y(left) -> -y (screen up), z(up) -> -z (toward viewer): a rotation, not a mirror
  model.scale.set(unit, -unit, -unit);
  model.position.set(-centre[0] * unit, centre[1] * unit, centre[2] * unit);
  tilt.add(model);
  scene.add(root);

  // blue bottle fly: metallic cobalt/teal cuticle, joints a shade darker, no black stripes
  const cuticle = (color, extra = {}) => new THREE.MeshPhysicalMaterial({ color, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.18,
    sheen: 1, sheenColor: 0x8fe8ff, sheenRoughness: 0.35, emissive: 0x0a3cff, emissiveIntensity: 0.55, side: THREE.FrontSide, ...extra });
  const mats = {
    eye: new THREE.MeshStandardMaterial({ color: 0xff2e1c, emissive: 0xb01e10, emissiveIntensity: 0.9, roughness: 0.35, side: THREE.DoubleSide, depthTest: false }),
    wing: new THREE.MeshPhysicalMaterial({ color: 0xdfeeff, emissive: 0x2a6cff, emissiveIntensity: 0.25, roughness: 0.08, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false, clearcoat: 0.8 }),
    body: cuticle(0x1f62c8),
    thorax: cuticle(0x1a55b8),
    head: cuticle(0x1c4fa8),
    abdBand: cuticle(0x163f92),
    black: cuticle(0x123a86, { side: THREE.DoubleSide }),
    brown: new THREE.MeshStandardMaterial({ color: 0x1a2233, roughness: 0.7, side: THREE.FrontSide }),
    lower: cuticle(0x2c7ad8, { metalness: 0.4 }),
    leg: new THREE.MeshPhysicalMaterial({ color: 0x27334d, roughness: 0.5, metalness: 0.2, clearcoat: 0.5, side: THREE.FrontSide }),
    ocelli: new THREE.MeshPhysicalMaterial({ color: 0x8a2a1a, roughness: 0.2, clearcoat: 1, side: THREE.FrontSide }),
  };
  const matFor = (g) => {
    const n = g.mesh.toLowerCase();
    if (n.includes('red')) return mats.eye;
    if (n.includes('ocelli')) return mats.ocelli;
    if (n.includes('wing')) return mats.wing;
    if (n.includes('black')) return mats.black;
    if (n.includes('bristle')) return mats.brown;
    if (n.includes('brown')) return mats.leg;
    // abdomen: tan tergites with the posterior segments black (male Drosophila), pale ventral sternites
    const ab = n.match(/^abdomen_(\d)/);
    if (ab) { const i = +ab[1]; if (n.includes('lower')) return mats.lower; return (i >= 5 || i === 2) ? mats.abdBand : mats.body; }
    if (n.includes('lower')) return mats.lower;
    if (n.startsWith('thorax')) return mats.thorax;
    if (n.startsWith('head')) return mats.head;
    if (/coxa|femur|tibia|tarsus/.test(n)) return mats.leg;
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
    mesh.traverse(o => { if (o.isMesh) { o.material = matFor(g); o.frustumCulled = false; o.castShadow = o.material !== mats.wing; if (o.material === mats.eye) o.renderOrder = 10; } });
    const m = new THREE.Matrix4().set(
      g.mat[0], g.mat[1], g.mat[2], g.pos[0],
      g.mat[3], g.mat[4], g.mat[5], g.pos[1],
      g.mat[6], g.mat[7], g.mat[8], g.pos[2],
      0, 0, 0, 1);
    // MuJoCo recentres every mesh at its centre of mass and rotates it to principal axes before the
    // geom frame applies: centered = R^T (scale * raw - mesh_pos). Undo that for the raw OBJ vertices.
    const ms = g.scale || [1, 1, 1], mp = g.mesh_pos || [0, 0, 0], mq = g.mesh_quat || [1, 0, 0, 0];
    const R = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion(mq[1], mq[2], mq[3], mq[0]));
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
  model.scale.set(u, -u, -u);
  model.position.set(-c.x * u, c.y * u, c.z * u);
  console.log('fly3d body size (model units)', size.toArray().map(v => +v.toFixed(3)), 'centre', c.toArray().map(v => +v.toFixed(3)));
  const restQuat = { wingL: parts.wingL.quaternion.clone(), wingR: parts.wingR.quaternion.clone() };
  // rest pose: each wing lies flat along the back. Find the wing tip (farthest point from the hinge, in
  // hinge-local coordinates) and rotate that direction onto "backward, slightly inward, slightly down".
  const foldQuat = {}, wingTip = {};
  for (const key of ['wingL', 'wingR']) {
    const g = parts[key]; const side = key === 'wingL' ? 1 : -1;
    let tip = new THREE.Vector3(), best = 0;
    g.updateMatrixWorld(true);
    g.traverse(o => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; const v = new THREE.Vector3();
      for (let i = 0; i < pos.count; i += 7) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); g.worldToLocal(v); const d = v.lengthSq(); if (d > best) { best = d; tip.copy(v); } } });
    wingTip[key] = tip.clone();
    const target = new THREE.Vector3(-1, side * 0.035, side > 0 ? -0.10 : -0.15).normalize();   // both lie along the back, one stacked on the other
    foldQuat[key] = new THREE.Quaternion().setFromUnitVectors(tip.clone().normalize(), target);
  }

  // verify each fold by measuring where the wing tip ends up in the fly's frame; a bad one gets the
  // other wing's fold mirrored across the body plane (y -> -y: quaternion (x,y,z,w) -> (-x,y,-z,w))
  const foldDir = (key) => {
    const g = parts[key]; g.quaternion.copy(foldQuat[key]); model.updateMatrixWorld(true);
    let best = 0; const tip = new THREE.Vector3(), v = new THREE.Vector3(), hinge = g.getWorldPosition(new THREE.Vector3());
    g.traverse(o => { if (!o.isMesh) return; const pos = o.geometry.attributes.position;
      for (let i = 0; i < pos.count; i += 5) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); const d = v.distanceToSquared(hinge); if (d > best) { best = d; tip.copy(v); } } });
    model.worldToLocal(tip); model.worldToLocal(hinge); return tip.sub(hinge).normalize();
  };
  const ok = { wingL: foldDir('wingL').x < -0.85, wingR: foldDir('wingR').x < -0.85 };
  for (const [bad, good] of [['wingL', 'wingR'], ['wingR', 'wingL']]) {
    if (!ok[bad] && ok[good]) { const q = foldQuat[good]; foldQuat[bad] = new THREE.Quaternion(-q.x, q.y, -q.z, q.w); }
  }
  console.log('wing folds ok', ok);
  // wing wash: a few motes of disturbed air shed from the outer half of each wing while flying.
  // Soft translucent sprites with a true alpha fade (additive blending would write alpha=1 and show
  // as black over the desktop). Sparse: roughly one mote every few frames, more when fast.
  const N_P = 240;
  const pPos = new Float32Array(N_P * 3), pAlpha = new Float32Array(N_P), pSize = new Float32Array(N_P);
  const pVel = new Float32Array(N_P * 3), pLife = new Float32Array(N_P), pMax = new Float32Array(N_P), pBright = new Float32Array(N_P);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aAlpha', new THREE.BufferAttribute(pAlpha, 1));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  const pMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, blending: THREE.NormalBlending,
    uniforms: { uDpr: { value: Math.min(2, devicePixelRatio || 1) } },
    vertexShader: `attribute float aAlpha; attribute float aSize; varying float vA; uniform float uDpr;
      void main() { vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSize * uDpr; }`,
    fragmentShader: `varying float vA; uniform float uDpr;
      void main() { vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; if (r > 1.0) discard;
        float soft = smoothstep(1.0, 0.15, r); gl_FragColor = vec4(0.78, 0.88, 1.0, vA * soft); }`,
  });
  const points = new THREE.Points(pGeo, pMat); points.frustumCulled = false; scene.add(points);
  let pNext = 0;
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3();
  function emit(f, dt) {
    const speed = f.speed || 150;
    const chance = f.flying ? (0.10 + speed / 1500) : 0;          // ~1 mote every 5-8 frames, more when fast
    if (Math.random() < chance) {
      const i = pNext++ % N_P, key = Math.random() < 0.5 ? 'wingL' : 'wingR', g = parts[key];
      g.getWorldPosition(_a); g.localToWorld(_b.copy(wingTip[key]));
      _p.lerpVectors(_a, _b, 0.45 + Math.random() * 0.55);         // somewhere on the outer half of the wing
      const back = f.heading + Math.PI + (Math.random() - 0.5) * 1.1, v = 25 + speed * 0.25 + Math.random() * 30;
      pPos[i * 3] = _p.x; pPos[i * 3 + 1] = _p.y; pPos[i * 3 + 2] = _p.z - 4;
      pVel[i * 3] = Math.cos(back) * v; pVel[i * 3 + 1] = Math.sin(back) * v; pVel[i * 3 + 2] = -(4 + Math.random() * 10);
      pMax[i] = pLife[i] = 0.5 + Math.random() * 1.2; pBright[i] = 0.35 + Math.random() * 0.5; pSize[i] = 4 + Math.random() * 6;
    }
    for (let i = 0; i < N_P; i++) {
      if (pLife[i] <= 0) { pAlpha[i] = 0; continue; }
      pLife[i] -= dt;
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      pVel[i * 3] *= 0.97; pVel[i * 3 + 1] *= 0.97; pVel[i * 3 + 1] += 5 * dt;
      pVel[i * 3] += (Math.random() - 0.5) * 30 * dt; pVel[i * 3 + 1] += (Math.random() - 0.5) * 30 * dt;   // a little turbulence
      const t = Math.max(0, Math.min(1, pLife[i] / pMax[i]));
      const rise = Math.min(1, (pMax[i] - pLife[i]) / 0.12);                                   // quick fade-in
      pAlpha[i] = t * t * (3 - 2 * t) * rise * pBright[i];
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aAlpha.needsUpdate = true; pGeo.attributes.aSize.needsUpdate = true;
  }
  const REST_FOLD = +(new URLSearchParams(location.search).get('fold') || -1.25);
  // state: {x, y, heading, roll, alt, flying, wingPhase, proboscis, scale}
  function render(f, dt = 1 / 60) {
    const sc = (f.scale || 1) / 2.6;
    const lift = f.mode === 'landing' || f.mode === 'feed' || f.mode === 'rest' || f.mode === 'emerging' || f.mode === 'homing'
      ? (f.z || 0) + 40 * (f.alt || 0)
      : 78 + 50 * (f.alt || 0);                                   // in flight: always above a cube (61 px)
    root.position.set(f.x, f.y, -lift);                          // toward the viewer is -z; the shadow drifts with height
    key.position.set(f.x - 260, f.y - 420, -760); key.target.position.set(f.x, f.y, 0);
    root.rotation.set(0, 0, f.heading);
    root.scale.setScalar(sc * (1 + 0.22 * (f.alt || 0)));
    tilt.rotation.y = -0.35 * (f.roll || 0);
    for (const key of ['wingL', 'wingR']) {
      const w = parts[key], ax = w.userData.axis; if (!ax) continue;
      const side = key === 'wingL' ? 1 : -1;
      // rest: folded back over the abdomen; flight: stroke of ~140 degrees about the hinge
      if (f.flying) {
        const angle = -0.9 + 1.1 * (0.5 + 0.5 * Math.sin(f.wingPhase + (side > 0 ? 0 : 0.4)));   // stroke about the real yaw hinge
        w.quaternion.copy(restQuat[key]).multiply(new THREE.Quaternion().setFromAxisAngle(ax, angle));
      } else {
        w.quaternion.copy(foldQuat[key]);
      }
    }
    parts.proboscis.position.set(0, 0, -0.35 * (f.proboscis || 0) * len * 0.12);
    emit(f, dt);
    renderer.render(scene, camera);
  }
  // ---- sugar cubes: grainy white boxes standing on the screen, same slight tilt as the fly
  const grain = document.createElement('canvas'); grain.width = grain.height = 128;
  { const g = grain.getContext('2d'); g.fillStyle = '#f7f2e8'; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2600; i++) { const v = 228 + Math.random() * 27; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 2, 1 + Math.random() * 2); }
    for (let i = 0; i < 160; i++) { g.fillStyle = 'rgba(255,255,255,0.95)'; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); } }
  const grainTex = new THREE.CanvasTexture(grain); grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping;
  const sugarMat = new THREE.MeshPhysicalMaterial({ map: grainTex, bumpMap: grainTex, bumpScale: 0.35, color: 0xffffff, emissive: 0x2a2622, roughness: 0.55, clearcoat: 0.5, clearcoatRoughness: 0.45, sheen: 0.9, sheenColor: 0xfff4e0 });
  new THREE.TextureLoader().load('assets/sugar.png', tex => { tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; sugarMat.map = tex; sugarMat.bumpMap = tex; sugarMat.bumpScale = 0.6; sugarMat.needsUpdate = true; }, undefined, () => {});
  const cubeMeshes = new Map();
  function setCubes(list, size = 24) {
    const seen = new Set();
    for (const c of list) {
      seen.add(c);
      let m = cubeMeshes.get(c);
      if (!m) {
        m = new THREE.Group(); const t = new THREE.Group(); t.rotation.x = 0.22; m.add(t);
        const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), sugarMat); box.position.z = 0.5; box.castShadow = box.receiveShadow = true; t.add(box); m.userData.box = box;
        scene.add(m); cubeMeshes.set(c, m);
      }
      const side = size * (0.5 + 0.5 * Math.max(0, c.amount));
      m.position.set(c.x, c.y + size / 2, 0);
      m.userData.box.scale.set(side, side, side * 0.95); m.userData.box.position.z = -side * 0.475;
      m.visible = c.amount > 0.01;
    }
    for (const [c, m] of cubeMeshes) if (!seen.has(c)) { scene.remove(m); cubeMeshes.delete(c); }
  }
  return { render, setCubes, parts, scene, renderer };
}
