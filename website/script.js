/* ============================================================
   ToolTwin — front-end prototype
   - Babylon.js parametric tool builder (the 3D "twin")
   - Foundry stepper: Describe -> Tune -> Export
   - Training Studio: Robot -> Task -> Train (simulated sim2real run)
   This is a UI/UX prototype. The CadQuery backend, real LLM, and
   real Isaac Sim training are stubbed with believable simulations.
   ============================================================ */
'use strict';

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });

/* ============================================================
   PARAMETRIC TOOL DEFINITIONS
   Each archetype exposes named parameters (mm) and a builder
   that returns an array of Babylon meshes parented to meshHolder.
   ============================================================ */
const ARCHETYPES = {
  gripper: {
    name: 'Parallel gripper jaw',
    cqClass: 'GripperJaw',
    params: [
      { key: 'jawLength',  label: 'Jaw length',     min: 30, max: 120, step: 1, value: 64,  unit: 'mm' },
      { key: 'jawWidth',   label: 'Jaw width',      min: 12, max: 60,  step: 1, value: 28,  unit: 'mm' },
      { key: 'opening',    label: 'Opening (gap)',  min: 8,  max: 90,  step: 1, value: 44,  unit: 'mm' },
      { key: 'fingerThk',  label: 'Finger thickness', min: 4, max: 16, step: 0.5, value: 9, unit: 'mm' },
      { key: 'gripTeeth',  label: 'Grip ridges',    min: 0,  max: 8,   step: 1, value: 4,   unit: '' },
    ],
  },
  hook: {
    name: 'Pull hook',
    cqClass: 'PullHook',
    params: [
      { key: 'shank',     label: 'Shank length',  min: 40, max: 160, step: 1, value: 90, unit: 'mm' },
      { key: 'hookR',     label: 'Hook radius',   min: 12, max: 55,  step: 1, value: 26, unit: 'mm' },
      { key: 'barThk',    label: 'Bar diameter',  min: 5,  max: 20,  step: 0.5, value: 11, unit: 'mm' },
      { key: 'tipLen',    label: 'Tip length',    min: 6,  max: 40,  step: 1, value: 16, unit: 'mm' },
    ],
  },
  scraper: {
    name: 'Flat scraper blade',
    cqClass: 'Scraper',
    params: [
      { key: 'bladeLen',  label: 'Blade length',  min: 30, max: 120, step: 1, value: 72, unit: 'mm' },
      { key: 'bladeWid',  label: 'Blade width',   min: 24, max: 90,  step: 1, value: 54, unit: 'mm' },
      { key: 'bladeThk',  label: 'Blade thickness', min: 1, max: 8,  step: 0.5, value: 3, unit: 'mm' },
      { key: 'handleLen', label: 'Handle length', min: 30, max: 110, step: 1, value: 60, unit: 'mm' },
    ],
  },
  probe: {
    name: 'Inspection probe',
    cqClass: 'Probe',
    params: [
      { key: 'length',    label: 'Probe length',  min: 50, max: 200, step: 1, value: 120, unit: 'mm' },
      { key: 'shaftDia',  label: 'Shaft diameter', min: 4, max: 18,  step: 0.5, value: 10, unit: 'mm' },
      { key: 'tipDia',    label: 'Tip diameter',  min: 1,  max: 6,   step: 0.25, value: 2.5, unit: 'mm' },
      { key: 'collarDia', label: 'Collar diameter', min: 12, max: 40, step: 1, value: 22, unit: 'mm' },
    ],
  },
};

const MATERIALS = {
  petg:  { name: 'PETG',      density: 1.27, color: [0.78, 0.80, 0.83] },
  pla:   { name: 'PLA',       density: 1.24, color: [0.82, 0.84, 0.86] },
  abs:   { name: 'ABS',       density: 1.04, color: [0.74, 0.76, 0.80] },
  nylon: { name: 'Nylon (PA)',density: 1.14, color: [0.86, 0.86, 0.84] },
  tpu:   { name: 'TPU',       density: 1.21, color: [0.70, 0.74, 0.78] },
  alu:   { name: 'Aluminium', density: 2.70, color: [0.86, 0.88, 0.90] },
};

const SIZE_SCALE = { s: 0.75, m: 1.0, l: 1.35 };

/* ============================================================
   STATE
   ============================================================ */
const state = {
  archetype: 'gripper',
  params: {},            // live param values
  mount: 'handheld',
  material: 'petg',
  size: 'm',
  arm: 'g1',
  toolName: '',
  stats: null,
  hasTool: false,
};

function loadDefaults(arch) {
  state.params = {};
  ARCHETYPES[arch].params.forEach(p => { state.params[p.key] = p.value; });
}

/* ============================================================
   BABYLON SCENE
   ============================================================ */
let engine, scene, camera, toolRoot, meshHolder, bodyMat, accentMat;
let baseRadius = 300;
const DEFAULT_ALPHA = -Math.PI / 2.6, DEFAULT_BETA = Math.PI / 2.8;

function initBabylon() {
  const canvas = $('#renderCanvas');
  engine = new BABYLON.Engine(canvas, true, { alpha: true, antialias: true, preserveDrawingBuffer: true });
  BABYLON.SceneLoader.ShowLoadingScreen = false;

  scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color4(0, 0, 0, 0);

  camera = new BABYLON.ArcRotateCamera('cam', DEFAULT_ALPHA, DEFAULT_BETA, baseRadius, new BABYLON.Vector3(0, 0, 0), scene);
  camera.fov = 0.55;
  camera.minZ = 1;
  camera.maxZ = 6000;
  // Fusion-360-style orbit: the world Y axis stays locked upright, so the part
  // never tips past vertical and the horizon never rolls.
  camera.lowerBetaLimit = 0.12;
  camera.upperBetaLimit = Math.PI - 0.12;
  camera.pinchDeltaPercentage = 0.02;
  camera.panningSensibility = 0;     // pure orbit — no accidental panning
  camera.angularSensibilityX = 900;  // a touch slower / steadier drag
  camera.angularSensibilityY = 900;
  camera.attachControl(canvas, true);

  // Petwheels-style wheel: zoom only when the cursor is over the model's
  // bounding box; otherwise let the wheel scroll the page normally.
  camera.inputs.removeByType('ArcRotateCameraMouseWheelInput');
  canvas.addEventListener('wheel', e => {
    if (!state.hasTool || !overModelBBox(e.clientX, e.clientY)) return; // -> page scrolls
    e.preventDefault();
    camera.radius = clamp(camera.radius * (1 + Math.sign(e.deltaY) * 0.12), camera.lowerRadiusLimit, camera.upperRadiusLimit);
  }, { passive: false });

  const hemi = new BABYLON.HemisphericLight('hemi', new BABYLON.Vector3(0.2, 1, 0.1), scene);
  hemi.intensity = 0.65;
  hemi.groundColor = new BABYLON.Color3(0.18, 0.22, 0.26);
  const dir = new BABYLON.DirectionalLight('dir', new BABYLON.Vector3(-0.5, -0.9, -0.4), scene);
  dir.intensity = 1.4;
  const dir2 = new BABYLON.DirectionalLight('dir2', new BABYLON.Vector3(0.6, -0.3, 0.7), scene);
  dir2.intensity = 0.5;
  dir2.diffuse = new BABYLON.Color3(0.6, 0.85, 0.4);

  // image-based lighting for nice metal reflections (Babylon-hosted .env)
  try {
    const env = BABYLON.CubeTexture.CreateFromPrefilteredData('https://assets.babylonjs.com/environments/environmentSpecular.env', scene);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.9;
  } catch (e) { /* lights still light the scene */ }

  toolRoot = new BABYLON.TransformNode('toolRoot', scene);
  meshHolder = new BABYLON.TransformNode('meshHolder', scene);
  meshHolder.parent = toolRoot;

  bodyMat = new BABYLON.PBRMetallicRoughnessMaterial('body', scene);
  bodyMat.metallic = 0.85; bodyMat.roughness = 0.34;
  bodyMat.baseColor = new BABYLON.Color3(0.80, 0.82, 0.85);

  accentMat = new BABYLON.PBRMetallicRoughnessMaterial('accent', scene);
  accentMat.metallic = 0.25; accentMat.roughness = 0.45;
  accentMat.baseColor = new BABYLON.Color3(0.44, 0.75, 0.18);

  engine.runRenderLoop(() => scene.render());
  measureAndResize(canvas);
}

/* crisp canvas sizing (mirrors the Petwheels measureAndResize pattern) */
function measureAndResize(canvas) {
  let lastW = 0, lastH = 0;
  const tick = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (r.width && (Math.abs(r.width - lastW) > 1 || Math.abs(r.height - lastH) > 1)) {
      lastW = r.width; lastH = r.height;
      engine.setHardwareScalingLevel(1 / dpr);
      engine.setSize(r.width * dpr, r.height * dpr);
    }
    requestAnimationFrame(tick);
  };
  tick();
}

/* simple tween helper */
function tween(get, set, to, ms = 400) {
  const from = get(), t0 = performance.now();
  const step = now => {
    const k = clamp((now - t0) / ms, 0, 1);
    const e = 1 - Math.pow(1 - k, 3);
    set(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ============================================================
   GEOMETRY BUILDERS
   ============================================================ */
function box(name, w, h, d) { return BABYLON.MeshBuilder.CreateBox(name, { width: w, height: h, depth: d }, scene); }
function cyl(name, h, dia, diaTop) {
  return BABYLON.MeshBuilder.CreateCylinder(name, { height: h, diameter: dia, diameterTop: diaTop ?? dia, tessellation: 40 }, scene);
}

function buildMount(mount, scale) {
  const meshes = [];
  if (mount === 'handheld') {
    const grip = cyl('mount_grip', 78 * scale, 26 * scale);
    grip.material = accentMat; grip.position.y = -55 * scale; meshes.push(grip);
    const cap = cyl('mount_cap', 10 * scale, 30 * scale);
    cap.material = accentMat; cap.position.y = -94 * scale; meshes.push(cap);
  } else if (mount === 'wrist') {
    const ring = BABYLON.MeshBuilder.CreateTorus('mount_ring', { diameter: 60 * scale, thickness: 12 * scale, tessellation: 48 }, scene);
    ring.material = accentMat; ring.rotation.x = Math.PI / 2; ring.position.y = -52 * scale; meshes.push(ring);
    const flange = cyl('mount_flange', 8 * scale, 46 * scale);
    flange.material = accentMat; flange.position.y = -34 * scale; meshes.push(flange);
  } else { // bench
    const plate = box('mount_plate', 70 * scale, 8 * scale, 70 * scale);
    plate.material = accentMat; plate.position.y = -50 * scale; meshes.push(plate);
    const post = box('mount_post', 18 * scale, 40 * scale, 18 * scale);
    post.material = accentMat; post.position.y = -28 * scale; meshes.push(post);
  }
  return meshes;
}

function buildArchetype(arch, p, scale) {
  const m = [];
  if (arch === 'gripper') {
    const base = box('g_base', p.jawWidth, 16, p.opening + p.fingerThk * 2 + 8);
    base.position.y = 0; m.push(base);
    [-1, 1].forEach(side => {
      const x = side * (p.opening / 2 + p.fingerThk / 2);
      const finger = box('g_finger', p.jawWidth, p.jawLength, p.fingerThk);
      finger.position.set(0, p.jawLength / 2 + 8, x);
      m.push(finger);
      // grip ridges
      for (let i = 0; i < p.gripTeeth; i++) {
        const ridge = box('g_ridge', p.jawWidth * 0.86, 2.5, 2.5);
        const yy = 14 + (i + 0.5) * (p.jawLength - 14) / Math.max(p.gripTeeth, 1);
        ridge.position.set(0, yy, x - side * (p.fingerThk / 2 + 1));
        ridge.material = accentMat;
        m.push(ridge);
      }
    });
  } else if (arch === 'hook') {
    const shank = cyl('h_shank', p.shank, p.barThk);
    shank.position.y = p.shank / 2; m.push(shank);
    // hook arc as a tube along a half-circle path
    const path = [];
    const steps = 26;
    for (let i = 0; i <= steps; i++) {
      const a = Math.PI * (i / steps); // 0..PI
      path.push(new BABYLON.Vector3(p.hookR - Math.cos(a) * p.hookR, p.shank + Math.sin(a) * p.hookR, 0));
    }
    const arc = BABYLON.MeshBuilder.CreateTube('h_arc', { path, radius: p.barThk / 2, tessellation: 20 }, scene);
    m.push(arc);
    const tip = cyl('h_tip', p.tipLen, p.barThk, p.barThk * 0.4);
    tip.position.set(p.hookR * 2, p.shank - p.tipLen / 2, 0);
    m.push(tip);
  } else if (arch === 'scraper') {
    const blade = box('s_blade', p.bladeWid, p.bladeThk, p.bladeLen);
    blade.position.y = p.handleLen + p.bladeLen / 2;
    blade.rotation.x = Math.PI / 2;
    m.push(blade);
    // bevel hint at the working edge
    const edge = box('s_edge', p.bladeWid, p.bladeThk * 0.6, 6);
    edge.position.set(0, p.handleLen + p.bladeLen, 0);
    edge.material = accentMat;
    m.push(edge);
    const handle = box('s_handle', p.bladeWid * 0.42, 14, p.handleLen);
    handle.position.y = p.handleLen / 2; handle.rotation.x = Math.PI / 2;
    m.push(handle);
  } else if (arch === 'probe') {
    const collar = cyl('p_collar', 12, p.collarDia);
    collar.material = accentMat; collar.position.y = 6; m.push(collar);
    const shaft = cyl('p_shaft', p.length, p.shaftDia, p.tipDia);
    shaft.position.y = 12 + p.length / 2; m.push(shaft);
  }
  return m;
}

function rebuildTool() {
  if (!scene) return;
  // dispose previous meshes
  meshHolder.getChildMeshes().forEach(x => x.dispose());

  const scale = SIZE_SCALE[state.size];
  const p = {};
  ARCHETYPES[state.archetype].params.forEach(d => { p[d.key] = state.params[d.key] * scale; });

  const meshes = [...buildArchetype(state.archetype, p, scale), ...buildMount(state.mount, scale)];
  meshes.forEach(mesh => {
    if (!mesh.material) mesh.material = bodyMat;
    mesh.parent = meshHolder;
    mesh.material.wireframe = renderWire;
  });

  // recenter holder vertically so the tool sits in the middle
  frameCamera();
  computeStats();
}

let renderWire = false;
function setWireframe(on) {
  renderWire = on;
  [bodyMat, accentMat].forEach(mat => { if (mat) mat.wireframe = on; });
}

/* is the pointer over the model's screen-space bounding box? (drives wheel zoom) */
function overModelBBox(clientX, clientY) {
  if (!meshHolder || !meshHolder.getChildMeshes().length) return false;
  const canvas = $('#renderCanvas');
  const rect = canvas.getBoundingClientRect();
  const b = meshHolder.getHierarchyBoundingVectors(true);
  const mn = b.min, mx = b.max;
  const corners = [
    [mn.x, mn.y, mn.z], [mx.x, mn.y, mn.z], [mn.x, mx.y, mn.z], [mn.x, mn.y, mx.z],
    [mx.x, mx.y, mn.z], [mx.x, mn.y, mx.z], [mn.x, mx.y, mx.z], [mx.x, mx.y, mx.z],
  ];
  const vp = new BABYLON.Viewport(0, 0, rect.width, rect.height);
  const transform = scene.getTransformMatrix();
  const id = BABYLON.Matrix.Identity();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const c of corners) {
    const p = BABYLON.Vector3.Project(new BABYLON.Vector3(c[0], c[1], c[2]), id, transform, vp);
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  const x = clientX - rect.left, y = clientY - rect.top, pad = 16; // small forgiving margin
  return x >= minX - pad && x <= maxX + pad && y >= minY - pad && y <= maxY + pad;
}

function frameCamera() {
  // toolRoot is never rotated now — the camera orbits instead, so framing is stable.
  meshHolder.position.set(0, 0, 0);
  meshHolder.computeWorldMatrix(true);
  meshHolder.getChildMeshes().forEach(x => x.computeWorldMatrix(true));

  const b = meshHolder.getHierarchyBoundingVectors(true);
  const size = b.max.subtract(b.min);
  // re-center the model on the origin so it orbits about its own middle
  meshHolder.position.set(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, -(b.min.z + b.max.z) / 2);

  const diag = Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z) || 100;
  baseRadius = diag * 1.5;
  camera.target = new BABYLON.Vector3(0, 0, 0);
  camera.radius = baseRadius;
  camera.lowerRadiusLimit = baseRadius * 0.4;
  camera.upperRadiusLimit = baseRadius * 2.6;
}

/* ============================================================
   STATS (bounding box, volume, print estimate)
   ============================================================ */
function computeStats() {
  meshHolder.getChildMeshes().forEach(x => x.computeWorldMatrix(true));
  const b = meshHolder.getHierarchyBoundingVectors(true);
  const sx = b.max.x - b.min.x, sy = b.max.y - b.min.y, sz = b.max.z - b.min.z; // mm
  const bboxVolCm3 = (sx * sy * sz) / 1000;
  const fill = 0.36;
  const volCm3 = bboxVolCm3 * fill;
  const mat = MATERIALS[state.material];
  const mass = volCm3 * mat.density * 0.95;          // grams (already fill-reduced)
  const hours = mass / 9.5;                            // ~9.5 g/h FDM throughput
  const h = Math.floor(hours), mn = Math.round((hours - h) * 60);

  state.stats = {
    bbox: `${fmt(sx)}×${fmt(sy)}×${fmt(sz)} mm`,
    volume: `${fmt(volCm3, 1)} cm³`,
    mass: `${fmt(mass)} g`,
    print: `~${h}h ${mn}m · ${fmt(mass)} g`,
  };

  $('#statBBox').textContent = state.stats.bbox;
  $('#statVolume').textContent = state.stats.volume;
  $('#statPrint').textContent = `~${h}h ${mn}m`;
}

/* ============================================================
   CADQUERY-FLAVORED SOURCE (for the readout + .py download)
   ============================================================ */
function cqSource(full = false) {
  const a = ARCHETYPES[state.archetype];
  const p = state.params;
  const head = `import cadquery as cq\n\n# ${a.name} — generated by ToolTwin\n# material: ${MATERIALS[state.material].name} · mount: ${state.mount} · arm: ${state.arm.toUpperCase()}\n`;
  const paramLines = a.params.map(d => `${d.key} = ${p[d.key]}  # mm`).join('\n');
  let body = '';
  if (state.archetype === 'gripper') {
    body = `\nbase = cq.Workplane("XY").box(jawWidth, opening + 2*fingerThk + 8, 16)\nfinger = (cq.Workplane("XY").box(jawWidth, fingerThk, jawLength)\n         .translate((0, opening/2 + fingerThk/2, jawLength/2 + 8)))\njaw = base.union(finger).union(finger.mirror("XZ"))\n`;
  } else if (state.archetype === 'hook') {
    body = `\nshank = cq.Workplane("XY").circle(barThk/2).extrude(shank)\nhook = (cq.Workplane("XZ").center(hookR, shank).radiusArc((2*hookR, shank), hookR))\ntool = shank.union(hook.sweep(...))\n`;
  } else if (state.archetype === 'scraper') {
    body = `\nblade = cq.Workplane("XY").box(bladeWid, bladeLen, bladeThk).edges(">Y").chamfer(bladeThk*0.6)\nhandle = cq.Workplane("XY").box(bladeWid*0.42, handleLen, 14)\ntool = blade.union(handle)\n`;
  } else {
    body = `\nshaft = (cq.Workplane("XY").circle(shaftDia/2)\n        .workplane(offset=length).circle(tipDia/2).loft())\ncollar = cq.Workplane("XY").circle(collarDia/2).extrude(12)\ntool = collar.union(shaft)\n`;
  }
  const mountLine = `\n# mount: ${state.mount}\ntool = add_${state.mount}_mount(tool, arm="${state.arm}")\n`;
  const exp = `\nshow_object(tool)\ncq.exporters.export(tool, "${a.cqClass.toLowerCase()}.stl")\n`;
  return full ? head + '\n' + paramLines + '\n' + body + mountLine + exp
              : `${a.cqClass.toLowerCase()} = ${a.cqClass}(${a.params.map(d => `${d.key}=${p[d.key]}`).join(', ')})`;
}

function updateReadout() {
  const el = $('#paramCode');
  if (el) el.textContent = cqSource(false);
}

/* ============================================================
   FOUNDRY — screens, steps, generation
   ============================================================ */
const panel = $('#panel');

function showScreen(name) {
  $$('.panel-screen', panel).forEach(s => s.classList.toggle('is-active', s.dataset.screen === name));
}
function showStep(name) {
  const order = ['describe', 'tune', 'export'];
  $$('.step-body', panel).forEach(b => b.classList.toggle('is-active', b.dataset.body === name));
  $$('.stepper:not(.stepper-studio) .step').forEach(s => {
    const idx = order.indexOf(s.dataset.step), cur = order.indexOf(name);
    s.classList.toggle('is-active', s.dataset.step === name);
    s.classList.toggle('is-done', idx > -1 && idx < cur);
  });
}

function goTo(target) {
  if (target === 'welcome') { showScreen('welcome'); return; }
  showScreen('steps');
  showStep(target);
  if (target === 'export') fillReview();
  if (target === 'tune') { updateReadout(); }
}

// data-go buttons + stepper clicks
$$('[data-go]').forEach(b => b.addEventListener('click', () => goTo(b.dataset.go)));
$$('.stepper:not(.stepper-studio) .step').forEach(s => s.addEventListener('click', () => {
  if (state.hasTool || s.dataset.step === 'describe') goTo(s.dataset.step);
}));

// example chips
$$('.ex-chip').forEach(c => c.addEventListener('click', () => {
  const arch = c.dataset.arch;
  $('#toolPrompt').value = {
    gripper: 'A two-finger parallel gripper jaw to pick up a 40 mm jar lid.',
    hook:    'A pull hook to grab and open cabinet door handles.',
    scraper: 'A flat scraper blade to clear residue off a tray.',
    probe:   'A slim inspection probe to reach behind panels.',
  }[arch];
  $('#optArchetype').value = arch;
}));

// param inputs
$('#optMaterial').addEventListener('change', e => { state.material = e.target.value; if (state.hasTool) computeStats(); });
$('#optArchetype').addEventListener('change', () => {});
$('#optSize').addEventListener('change', e => { state.size = e.target.value; if (state.hasTool) rebuildTool(); });
$('#optArm').addEventListener('change', e => { state.arm = e.target.value; });

// mounting segmented
$('#optMount').addEventListener('click', e => {
  const b = e.target.closest('.seg'); if (!b) return;
  $$('#optMount .seg').forEach(s => { s.classList.remove('is-active'); s.setAttribute('aria-checked', 'false'); });
  b.classList.add('is-active'); b.setAttribute('aria-checked', 'true');
  state.mount = b.dataset.mount;
  if (state.hasTool) rebuildTool();
});

function detectArchetype(prompt) {
  const t = (prompt || '').toLowerCase();
  if (/(grip|jaw|clamp|pinch|finger|pick)/.test(t)) return 'gripper';
  if (/(hook|pull|latch|handle|loop)/.test(t)) return 'hook';
  if (/(scrap|spatu|blade|flat|wipe|squeeg|clear)/.test(t)) return 'scraper';
  if (/(prob|point|poke|reach|inspect|stylus|needle)/.test(t)) return 'probe';
  return 'gripper';
}

/* ---- generation (simulated LLM + CadQuery build) ---- */
const generateBtn = $('#generateBtn');
generateBtn.addEventListener('click', runGeneration);

function runGeneration() {
  const prompt = $('#toolPrompt').value.trim();
  const sel = $('#optArchetype').value;
  state.archetype = sel === 'auto' ? detectArchetype(prompt) : sel;
  state.material = $('#optMaterial').value;
  state.size = $('#optSize').value;
  state.arm = $('#optArm').value;
  loadDefaults(state.archetype);
  state.toolName = ARCHETYPES[state.archetype].name;

  $('#vpEmpty').hidden = true;
  $('#specChips').hidden = true;
  const build = $('#vpBuild'); build.hidden = false;
  const stageEl = $('#vpBuildStage'); const logEl = $('#vpBuildLog'); logEl.textContent = '';
  $('#vpArchetype').textContent = state.archetype;
  $('#vpModelName').textContent = state.toolName;

  const steps = [
    ['Interpreting your prompt…', `> parsing intent: "${(prompt || 'gripper tool').slice(0, 48)}…"`],
    ['Selecting tool family…',    `> archetype = ${state.archetype}\n> mount = ${state.mount}, arm = ${state.arm.toUpperCase()}`],
    ['Writing CadQuery script…',  `> emit ${ARCHETYPES[state.archetype].cqClass}(...)\n> ${ARCHETYPES[state.archetype].params.length} parameters exposed`],
    ['Running the kernel…',       `> building B-rep solid\n> tessellating mesh`],
    ['Building your twin…',       `> watertight ✓  manifold ✓\n> done.`],
  ];

  let i = 0;
  const run = () => {
    if (i >= steps.length) {
      build.hidden = true;
      $('#specChips').hidden = false;
      state.hasTool = true;
      buildTuneSliders();
      rebuildTool();
      updateReadout();
      syncToolToTraining();
      goTo('tune');
      return;
    }
    stageEl.textContent = steps[i][0];
    logEl.textContent += (logEl.textContent ? '\n' : '') + steps[i][1];
    logEl.scrollTop = logEl.scrollHeight;
    i++;
    setTimeout(run, 560);
  };
  run();
}

/* ---- tune sliders ---- */
function buildTuneSliders() {
  const grid = $('#tuneGrid');
  grid.innerHTML = '';
  ARCHETYPES[state.archetype].params.forEach(d => {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    wrap.innerHTML = `
      <span class="field-label">${d.label}
        <span class="field-out"><span data-out="${d.key}">${fmt(state.params[d.key], d.step < 1 ? 2 : 0)}</span> ${d.unit}</span>
      </span>
      <input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${state.params[d.key]}" data-param="${d.key}" />`;
    grid.appendChild(wrap);
  });
  $$('#tuneGrid input[type=range]').forEach(setupRange);
}

function setupRange(input) {
  const key = input.dataset.param;
  const d = ARCHETYPES[state.archetype].params.find(x => x.key === key);
  const paint = () => { input.style.setProperty('--p', ((input.value - input.min) / (input.max - input.min) * 100) + '%'); };
  paint();
  input.addEventListener('input', () => {
    state.params[key] = parseFloat(input.value);
    const out = $(`[data-out="${key}"]`);
    if (out) out.textContent = fmt(state.params[key], d.step < 1 ? 2 : 0);
    paint();
    rebuildTool();
    updateReadout();
  });
}

$('#regenBtn').addEventListener('click', () => goTo('describe'));

/* ---- review ---- */
function fillReview() {
  $('#revName').textContent = state.toolName;
  $('#revMaterial').textContent = MATERIALS[state.material].name;
  $('#revMount').textContent = { handheld: 'Hand-held', wrist: 'Wrist-mount', bench: 'Bench' }[state.mount];
  if (state.stats) {
    $('#revBBox').textContent = state.stats.bbox;
    $('#revVolume').textContent = state.stats.volume;
    $('#revPrint').textContent = state.stats.print;
  }
}

/* ---- render mode tabs ---- */
$$('.viewport-tabs .vp-tab').forEach(t => t.addEventListener('click', () => {
  $$('.viewport-tabs .vp-tab').forEach(x => x.classList.remove('is-active'));
  t.classList.add('is-active');
  setWireframe(t.dataset.render === 'wire');
}));

/* ---- viewport controls ---- */
$('#rotateL').addEventListener('click', () => tween(() => camera.alpha, v => camera.alpha = v, camera.alpha - Math.PI / 4));
$('#rotateR').addEventListener('click', () => tween(() => camera.alpha, v => camera.alpha = v, camera.alpha + Math.PI / 4));
$('#zoomIn').addEventListener('click', () => tween(() => camera.radius, v => camera.radius = v, clamp(camera.radius * 0.8, camera.lowerRadiusLimit, camera.upperRadiusLimit)));
$('#zoomOut').addEventListener('click', () => tween(() => camera.radius, v => camera.radius = v, clamp(camera.radius * 1.25, camera.lowerRadiusLimit, camera.upperRadiusLimit)));
$('#resetView').addEventListener('click', () => {
  tween(() => camera.alpha, v => camera.alpha = v, DEFAULT_ALPHA);
  tween(() => camera.beta, v => camera.beta = v, DEFAULT_BETA);
  tween(() => camera.radius, v => camera.radius = v, baseRadius);
});
$('#fullscreen').addEventListener('click', () => {
  const vp = $('#viewport');
  if (!document.fullscreenElement) vp.requestFullscreen?.();
  else document.exitFullscreen?.();
});
document.addEventListener('fullscreenchange', () => {
  $('#viewport').classList.toggle('is-fullscreen', !!document.fullscreenElement);
});

/* ============================================================
   DOWNLOADS — real files from the live mesh
   ============================================================ */
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportASCIISTL() {
  const meshes = meshHolder.getChildMeshes();
  let out = 'solid tooltwin\n';
  const v = new BABYLON.Vector3();
  meshes.forEach(mesh => {
    const pos = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const idx = mesh.getIndices();
    if (!pos || !idx) return;
    const world = mesh.computeWorldMatrix(true);
    const tri = [new BABYLON.Vector3(), new BABYLON.Vector3(), new BABYLON.Vector3()];
    for (let i = 0; i < idx.length; i += 3) {
      for (let j = 0; j < 3; j++) {
        const k = idx[i + j] * 3;
        v.set(pos[k], pos[k + 1], pos[k + 2]);
        BABYLON.Vector3.TransformCoordinatesToRef(v, world, tri[j]);
      }
      const n = BABYLON.Vector3.Cross(tri[1].subtract(tri[0]), tri[2].subtract(tri[0])).normalize();
      out += `facet normal ${n.x} ${n.y} ${n.z}\n outer loop\n`;
      tri.forEach(t => { out += `  vertex ${t.x} ${t.y} ${t.z}\n`; });
      out += ' endloop\nendfacet\n';
    }
  });
  out += 'endsolid tooltwin\n';
  return out;
}

$$('.dl-card').forEach(card => card.addEventListener('click', async () => {
  const kind = card.dataset.dl;
  const base = ARCHETYPES[state.archetype].cqClass.toLowerCase();
  if (kind === 'stl') {
    downloadBlob(`${base}.stl`, new Blob([exportASCIISTL()], { type: 'model/stl' }));
  } else if (kind === 'py') {
    downloadBlob(`${base}.py`, new Blob([cqSource(true)], { type: 'text/x-python' }));
  } else if (kind === 'glb') {
    if (window.BABYLON && BABYLON.GLTF2Export) {
      const glb = await BABYLON.GLTF2Export.GLBAsync(scene, base);
      glb.downloadFiles();
    } else {
      downloadBlob(`${base}.glb.txt`, new Blob(['GLB export requires the serializers module.'], { type: 'text/plain' }));
    }
  }
}));

/* ============================================================
   TRAINING STUDIO
   ============================================================ */
const tstate = {
  robot: 'AgiBot G1',
  tool: 'mine',
  task: '',
  env: 'Workbench',
  episodes: 5000,
  randos: ['Lighting', 'Object pose', 'Textures'],
  policy: 'act',
  data: 'scripted',
};

function showTStep(name) {
  $$('.tstep-body').forEach(b => b.classList.toggle('is-active', b.dataset.tbody === name));
  if (['robot', 'task', 'config'].includes(name)) {
    const order = ['robot', 'task', 'config'], cur = order.indexOf(name);
    $$('.stepper-studio .step').forEach(s => {
      const idx = order.indexOf(s.dataset.tstep);
      s.classList.toggle('is-active', s.dataset.tstep === name);
      s.classList.toggle('is-done', idx < cur);
    });
  }
}
$$('[data-tgo]').forEach(b => b.addEventListener('click', () => showTStep(b.dataset.tgo)));
$$('.stepper-studio .step').forEach(s => s.addEventListener('click', () => showTStep(s.dataset.tstep)));

// robot pick
$('#robotPick').addEventListener('click', e => {
  const b = e.target.closest('.pick'); if (!b) return;
  $$('#robotPick .pick').forEach(x => x.classList.remove('is-active'));
  b.classList.add('is-active');
  tstate.robot = b.dataset.robot;
  $('#sceneRobotName').textContent = tstate.robot;
});
// tool pick
$('#toolPick').addEventListener('click', e => {
  const b = e.target.closest('.pick'); if (!b) return;
  $$('#toolPick .pick').forEach(x => x.classList.remove('is-active'));
  b.classList.add('is-active');
  tstate.tool = b.dataset.tool;
  updateSceneTool();
});
// env pick
$('#envGrid').addEventListener('click', e => {
  const b = e.target.closest('.env'); if (!b) return;
  $$('#envGrid .env').forEach(x => x.classList.remove('is-active'));
  b.classList.add('is-active');
  tstate.env = b.dataset.env;
  $('#sceneEnvName').textContent = tstate.env;
});
// task prompt
$('#taskPrompt').addEventListener('input', e => {
  tstate.task = e.target.value;
  $('#sceneTaskTag').textContent = tstate.task.trim() ? tstate.task.trim() : 'Describe a task →';
});
// episodes
$('#rangeEpisodes').addEventListener('input', e => {
  tstate.episodes = parseInt(e.target.value, 10);
  $('#epOut').textContent = fmt(tstate.episodes);
  e.target.style.setProperty('--p', ((e.target.value - e.target.min) / (e.target.max - e.target.min) * 100) + '%');
});
$('#rangeEpisodes').style.setProperty('--p', '23%');
// randomization
$('#randoList').addEventListener('change', () => {
  tstate.randos = $$('#randoList input:checked').map(i => i.dataset.rando);
  renderRandos();
});
function renderRandos() {
  $('#studioRandos').innerHTML = tstate.randos.map(r => `<span class="rando-badge">${r}</span>`).join('');
}
$('#optPolicy').addEventListener('change', e => tstate.policy = e.target.value);
$('#optData').addEventListener('click', e => {
  const b = e.target.closest('.seg'); if (!b) return;
  $$('#optData .seg').forEach(s => s.classList.remove('is-active'));
  b.classList.add('is-active'); tstate.data = b.dataset.data;
});

function updateSceneTool() {
  const tag = $('#sceneToolTag');
  const sceneTool = $('#sceneTool');
  if (tstate.tool === 'mine' && state.hasTool) {
    tag.textContent = state.toolName;
    sceneTool.style.display = '';
  } else {
    tag.textContent = 'No tool';
    sceneTool.style.display = tstate.tool === 'none' ? 'none' : '';
  }
}

// bridge: reflect the foundry tool into the studio
function syncToolToTraining() {
  $('#myToolPill').textContent = state.hasTool ? state.toolName : 'none yet';
  updateSceneTool();
}
$('#toTrainingBtn').addEventListener('click', () => {
  syncToolToTraining();
  // ensure "my tool" is selected
  $$('#toolPick .pick').forEach(x => x.classList.toggle('is-active', x.dataset.tool === 'mine'));
  tstate.tool = 'mine';
  updateSceneTool();
});

/* ---- launch + simulated run ---- */
let runTimer = null;
$('#launchBtn').addEventListener('click', launchTraining);
$('#newRunBtn').addEventListener('click', resetRun);

function launchTraining() {
  if (runTimer) clearInterval(runTimer);
  const dash = $('#jobDash'); dash.hidden = false;
  $('#jobId').textContent = 'job ' + Math.random().toString(36).slice(2, 8);
  const taskTitle = tstate.task.trim() ? tstate.task.trim().slice(0, 40) : `${tstate.robot} · ${tstate.env}`;
  $('#jobTitle').textContent = taskTitle;
  $('#jobDownload').hidden = true;

  // run summary
  $('#runSummary').innerHTML = [
    ['Robot', tstate.robot],
    ['Tool', tstate.tool === 'mine' && state.hasTool ? state.toolName : (tstate.tool === 'none' ? 'None (robot only)' : '—')],
    ['Environment', tstate.env],
    ['Episodes', fmt(tstate.episodes)],
    ['Policy', $('#optPolicy').selectedOptions[0].text.split(' — ')[0]],
    ['Data', tstate.data === 'teleop' ? 'Teleop demos' : 'Scripted rollouts'],
    ['Randomization', tstate.randos.join(', ') || 'none'],
  ].map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');

  showTStep('running');
  dash.scrollIntoView({ behavior: 'smooth', block: 'center' });

  const stages = ['scene', 'data', 'train', 'eval', 'export'];
  const lis = $$('#jobPipeline li');
  let pct = 0;
  $('#jobStatus').textContent = 'Running';
  $('#jobStatus').classList.remove('is-done');

  const targetEp = tstate.episodes;
  runTimer = setInterval(() => {
    pct = Math.min(100, pct + (1.4 + Math.random() * 2.4));
    $('#jobProgressBar').style.width = pct + '%';

    const stageIdx = Math.min(stages.length - 1, Math.floor(pct / 20));
    lis.forEach((li, i) => {
      li.classList.toggle('is-done', i < stageIdx);
      li.classList.toggle('is-active', i === stageIdx);
    });

    // metrics ramp
    const k = pct / 100;
    $('#jmEpisodes').textContent = fmt(Math.round(targetEp * Math.min(1, k * 1.25)));
    $('#jmHours').textContent = fmt(targetEp * 0.0024 * Math.min(1, k * 1.25), 1);
    if (pct > 42) $('#jmSuccess').textContent = fmt(40 + (k - 0.42) / 0.58 * 53) + '%';
    if (pct > 60) $('#jmGap').textContent = fmt(14 - (k - 0.6) / 0.4 * 9, 1) + '%';

    if (pct >= 100) {
      clearInterval(runTimer); runTimer = null;
      lis.forEach(li => { li.classList.remove('is-active'); li.classList.add('is-done'); });
      $('#jobStatus').textContent = 'Ready';
      $('#jobStatus').classList.add('is-done');
      $('#jmSuccess').textContent = fmt(93 + Math.random() * 4) + '%';
      $('#jmGap').textContent = fmt(3 + Math.random() * 2, 1) + '%';
      $('#jobDownload').hidden = false;
    }
  }, 220);
}

function resetRun() {
  if (runTimer) { clearInterval(runTimer); runTimer = null; }
  $('#jobDash').hidden = true;
  $('#jobProgressBar').style.width = '0%';
  ['#jmEpisodes', '#jmHours', '#jmSuccess', '#jmGap'].forEach((id, i) => $(id).textContent = i < 2 ? '0' : '—');
  showTStep('robot');
}

$('#jobDownload').addEventListener('click', () => {
  const manifest = {
    job: $('#jobId').textContent,
    robot: tstate.robot,
    tool: tstate.tool === 'mine' && state.hasTool ? state.toolName : null,
    environment: tstate.env,
    task: tstate.task,
    episodes: tstate.episodes,
    policy: tstate.policy,
    randomization: tstate.randos,
    success_rate: $('#jmSuccess').textContent,
    sim2real_gap: $('#jmGap').textContent,
    artifacts: ['policy.ckpt', 'dataset.zarr', 'eval_report.html', 'deploy_config.yaml'],
  };
  downloadBlob('tooltwin_policy_manifest.json', new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }));
});

/* ============================================================
   BOOT
   ============================================================ */
window.addEventListener('DOMContentLoaded', () => {
  loadDefaults(state.archetype);
  renderRandos();
  try { initBabylon(); } catch (e) { console.error('Babylon init failed', e); }
});
