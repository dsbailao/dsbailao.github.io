// Cena 3D de fundo: uma nuvem de partículas que muda de forma a cada seção (Three.js).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

THREE.ColorManagement.enabled = false;

const root = document.documentElement;
const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const N = innerWidth < 720 ? 1800 : 4200;
const TAU = Math.PI * 2;

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (n) => (Math.random() * n) | 0;
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function build(fn) {
  const out = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const [x, y, z] = fn();
    out[i * 3] = x; out[i * 3 + 1] = y; out[i * 3 + 2] = z;
  }
  return out;
}

// ---------- formas (uma por seção) ----------
const shapes = {
  // cilindro de banco de dados com discos empilhados
  db() {
    const R = 1.55, H = 1.35, levels = [-H, -H / 3, H / 3, H];
    return build(() => {
      const r = Math.random();
      if (r < 0.42) {
        const a = (pick(40) / 40) * TAU;
        return [R * Math.cos(a), rnd(-H, H), R * Math.sin(a)];
      }
      const a = Math.random() * TAU;
      if (r < 0.85) {
        const rr = R * (1 + gauss() * 0.012);
        return [rr * Math.cos(a), levels[pick(4)] + gauss() * 0.015, rr * Math.sin(a)];
      }
      const rr = R * Math.sqrt(Math.random());
      return [rr * Math.cos(a), H, rr * Math.sin(a)];
    });
  },

  // três colunas crescentes: performance, automação e desenvolvimento
  pillars() {
    const xs = [-1.35, 0, 1.35], hs = [2.0, 2.8, 3.6], base = -1.8, R = 0.48;
    return build(() => {
      const k = pick(3), a = Math.random() * TAU;
      if (Math.random() < 0.78) {
        const y = base + Math.min(hs[k], Math.round((Math.random() * hs[k]) / 0.22) * 0.22);
        return [xs[k] + R * Math.cos(a), y, R * Math.sin(a)];
      }
      const rr = R * Math.sqrt(Math.random());
      return [xs[k] + rr * Math.cos(a), base + hs[k], rr * Math.sin(a)];
    });
  },

  // hélice dupla como linha do tempo da carreira
  helix() {
    const L = 4.4, R = 0.9, turns = 2.6, rungs = 26;
    const at = (t, s) => {
      const ang = ((t + 1) / 2) * turns * TAU + s * Math.PI;
      return [t * L, R * Math.cos(ang), R * Math.sin(ang)];
    };
    return build(() => {
      if (Math.random() < 0.7) {
        const p = at(rnd(-1, 1), pick(2));
        return [p[0], p[1] + gauss() * 0.04, p[2] + gauss() * 0.04];
      }
      const t = -1 + (2 * (pick(rungs) + 0.5)) / rungs, u = Math.random();
      const a = at(t, 0), b = at(t, 1);
      return [a[0], lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
    });
  },

  // gráfico de barras 3D com os itens criados por ano
  bars() {
    const vals = [271, 259, 294, 233, 167], w = 0.34, base = -1.7;
    const total = vals.reduce((s, v) => s + v, 0);
    return build(() => {
      if (Math.random() < 0.14) {
        const gx = rnd(-3.3, 3.3), gz = rnd(-1.3, 1.3);
        return Math.random() < 0.5 ? [Math.round(gx / 0.55) * 0.55, base, gz] : [gx, base, Math.round(gz / 0.55) * 0.55];
      }
      let r = Math.random() * total, k = 0;
      while (r > vals[k]) r -= vals[k++];
      const cx = (k - 2) * 1.25, h = (vals[k] / 294) * 3.4;
      const lo = [cx - w, base, -w], hi = [cx + w, base + h, w], p = [0, 0, 0];
      const axis = pick(3), edge = Math.random() < 0.6;
      for (let d = 0; d < 3; d++) {
        const free = edge ? d === axis : d !== axis;
        p[d] = free ? rnd(lo[d], hi[d]) : Math.random() < 0.5 ? lo[d] : hi[d];
      }
      return p;
    });
  },

  // rede de servidores conectados
  network() {
    const nodes = Array.from({ length: 26 }, () => {
      const u = rnd(-1, 1), a = Math.random() * TAU, s = Math.sqrt(1 - u * u), r = rnd(1.5, 2.4);
      return [r * s * Math.cos(a), r * u, r * s * Math.sin(a)];
    });
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const keys = new Set();
    nodes.forEach((n, i) => {
      nodes.map((m, j) => [j, dist(n, m)]).filter(([j]) => j !== i)
        .sort((x, y) => x[1] - y[1]).slice(0, 3)
        .forEach(([j]) => keys.add(`${Math.min(i, j)}-${Math.max(i, j)}`));
    });
    const edges = [...keys].map((k) => k.split('-').map(Number));
    return build(() => {
      if (Math.random() < 0.3) {
        const n = nodes[pick(nodes.length)];
        return [n[0] + gauss() * 0.09, n[1] + gauss() * 0.09, n[2] + gauss() * 0.09];
      }
      const [i, j] = edges[pick(edges.length)], a = nodes[i], b = nodes[j], u = Math.random();
      return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
    });
  },

  // globo com paralelos e meridianos
  globe() {
    const R = 2.1;
    return build(() => {
      if (Math.random() < 0.5) {
        const lat = (pick(7) - 3) * (Math.PI / 8), a = Math.random() * TAU;
        return [R * Math.cos(lat) * Math.cos(a), R * Math.sin(lat), R * Math.cos(lat) * Math.sin(a)];
      }
      const lon = (pick(12) / 12) * TAU, lat = rnd(-Math.PI / 2, Math.PI / 2);
      return [R * Math.cos(lat) * Math.cos(lon), R * Math.sin(lat), R * Math.cos(lat) * Math.sin(lon)];
    });
  },

  // malha ondulada, como um terreno
  wave() {
    return build(() => {
      let x = rnd(-4.6, 4.6), z = rnd(-2.6, 2.6);
      if (Math.random() < 0.5) x = Math.round(x / 0.32) * 0.32;
      else z = Math.round(z / 0.32) * 0.32;
      return [x, 0.42 * Math.sin(x * 1.1) + 0.28 * Math.cos(z * 1.7 + x * 0.6) - 0.4, z];
    });
  },

  // núcleo com órbitas: tudo converge para o COMMIT
  core() {
    const tilts = [[0.4, 0], [-0.5, 1.1], [1.2, 2.2]], radii = [1.25, 1.7, 2.15];
    return build(() => {
      if (Math.random() < 0.45) {
        const r = 0.42 * Math.cbrt(Math.random()), u = rnd(-1, 1), a = Math.random() * TAU, s = Math.sqrt(1 - u * u);
        return [r * s * Math.cos(a), r * u, r * s * Math.sin(a)];
      }
      const k = pick(3), a = Math.random() * TAU, R = radii[k] * (1 + gauss() * 0.01);
      let x = R * Math.cos(a), y = 0, z = R * Math.sin(a);
      const [tx, ty] = tilts[k];
      [y, z] = [y * Math.cos(tx) - z * Math.sin(tx), y * Math.sin(tx) + z * Math.cos(tx)];
      [x, z] = [x * Math.cos(ty) + z * Math.sin(ty), -x * Math.sin(ty) + z * Math.cos(ty)];
      return [x, y, z];
    });
  },
};

// posição, escala, opacidade e giro de cada forma
const looks = {
  db:      { x: 2.6, y: 0.55, scale: 1.15, opacity: 1,    rot: (t) => [0.38, t * 0.3, 0] },
  pillars: { x: 2.6, y: 0.1,  scale: 1,    opacity: 0.85, rot: (t) => [0.22, -0.4 + Math.sin(t * 0.3) * 0.5, 0] },
  helix:   { x: 0,   y: 0,    scale: 1,    opacity: 0.9,  rot: (t) => [t * 0.45, 0, 0] },
  bars:    { x: 0,   y: 0,    scale: 1,    opacity: 0.85, rot: (t) => [0.4, -0.45 + Math.sin(t * 0.25) * 0.35, 0] },
  network: { x: 0,   y: 0,    scale: 1,    opacity: 0.85, rot: (t) => [0.2, t * 0.12, 0] },
  globe:   { x: 0,   y: 0,    scale: 1,    opacity: 0.8,  rot: (t) => [0.35, t * 0.15, 0] },
  wave:    { x: 0,   y: -0.3, scale: 1,    opacity: 0.85, rot: (t) => [0.55, Math.sin(t * 0.2) * 0.3, 0] },
  core:    { x: 0,   y: 0,    scale: 1,    opacity: 0.95, rot: (t) => [0.3, t * 0.5, 0.1] },
};

// matriz de rotação Rx·Ry·Rz (aplica Z, depois Y, depois X)
function matrix([ax, ay, az]) {
  const cx = Math.cos(ax), sx = Math.sin(ax), cy = Math.cos(ay), sy = Math.sin(ay), cz = Math.cos(az), sz = Math.sin(az);
  const a = [cy * cz, -cy * sz, sy], b = [sz, cz, 0], c = [-sy * cz, sy * sz, cy];
  return [
    a[0], a[1], a[2],
    cx * b[0] - sx * c[0], cx * b[1] - sx * c[1], cx * b[2] - sx * c[2],
    sx * b[0] + cx * c[0], sx * b[1] + cx * c[1], sx * b[2] + cx * c[2],
  ];
}

// ---------- seções ----------
const sections = [...document.querySelectorAll('[data-scene]')].filter((el) => shapes[el.dataset.scene]);
if (sections.length) start();

function start() {
  let renderer, pending = false;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (e) {
    return; // sem WebGL: fica o fundo estático
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.domElement.className = 'scene';
  renderer.domElement.setAttribute('aria-hidden', 'true');
  document.body.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 50);
  camera.position.z = 8;

  const names = sections.map((el) => el.dataset.scene);
  const data = Object.fromEntries([...new Set(names)].map((n) => [n, shapes[n]()]));

  const pos = new Float32Array(data[names[0]]);
  const dir = new Float32Array(N * 3), rand = new Float32Array(N), mix = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const u = rnd(-1, 1), a = Math.random() * TAU, s = Math.sqrt(1 - u * u);
    dir[i * 3] = s * Math.cos(a); dir[i * 3 + 1] = u; dir[i * 3 + 2] = s * Math.sin(a);
    rand[i] = Math.random();
    mix[i] = Math.random() < 0.7 ? Math.random() * 0.2 : 0.8 + Math.random() * 0.2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rand, 1));
  geometry.setAttribute('aMix', new THREE.BufferAttribute(mix, 1));

  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: innerWidth < 720 ? 34 : 30 },
    uPR: { value: Math.min(devicePixelRatio, 2) },
    uOpacity: { value: 1 },
    uAlert: { value: 0 },
    uC1: { value: new THREE.Color('#8b8bff') },
    uC2: { value: new THREE.Color('#2dd4bf') },
    uAlertColor: { value: new THREE.Color('#ff3d52') },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    vertexShader: `
      attribute float aRand;
      attribute float aMix;
      uniform float uTime, uSize, uPR;
      varying float vMix, vRand, vDepth;
      void main() {
        vec3 p = position;
        p += 0.025 * vec3(sin(uTime * 0.9 + aRand * 50.0), cos(uTime * 0.8 + aRand * 40.0), sin(uTime * 0.7 + aRand * 30.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * uPR * (0.45 + aRand * 0.9) / -mv.z;
        vMix = aMix; vRand = aRand; vDepth = -mv.z;
      }`,
    fragmentShader: `
      uniform vec3 uC1, uC2, uAlertColor;
      uniform float uOpacity, uAlert, uTime;
      varying float vMix, vRand, vDepth;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        if (d > 0.5) discard;
        float a = smoothstep(0.5, 0.05, d);
        float twinkle = 0.75 + 0.25 * sin(uTime * 2.0 + vRand * 60.0);
        float fog = clamp((13.0 - vDepth) / 6.0, 0.4, 1.0);
        vec3 col = mix(mix(uC1, uC2, vMix), uAlertColor, uAlert);
        gl_FragColor = vec4(col, a * uOpacity * twinkle * fog);
      }`,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  const group = new THREE.Group();
  group.add(points);
  scene.add(group);

  // cores do tema atual
  let themeBoost = 1;
  function readTheme() {
    const cs = getComputedStyle(root);
    uniforms.uC1.value.set(cs.getPropertyValue('--accent').trim());
    uniforms.uC2.value.set(cs.getPropertyValue('--accent-2').trim());
    const bg = new THREE.Color(cs.getPropertyValue('--bg').trim());
    const dark = bg.r + bg.g + bg.b < 1.5;
    material.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
    material.needsUpdate = true;
    themeBoost = dark ? 1 : 0.85;
    if (reduce) requestFrame();
  }
  new MutationObserver(readTheme).observe(root, { attributes: true, attributeFilter: ['data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readTheme);
  readTheme();

  // pontos de rolagem em que cada forma fica completa
  let anchors = [];
  function measure() {
    const max = document.documentElement.scrollHeight - innerHeight;
    anchors = sections.map((el, i) => {
      if (i === 0) return -Infinity;
      return Math.min(max, el.getBoundingClientRect().top + scrollY - innerHeight * 0.45);
    });
    for (let i = 2; i < anchors.length; i++) anchors[i] = Math.max(anchors[i], anchors[i - 1] + 1);
  }
  function locate(y) {
    let i = 0;
    while (i < anchors.length - 1 && y >= anchors[i + 1]) i++;
    if (i === anchors.length - 1) return { i, j: i, e: 0 };
    const next = anchors[i + 1];
    const prev = Number.isFinite(anchors[i]) ? anchors[i] : -1e9;
    const w = Math.min(innerHeight * 0.45, (next - prev) * 0.6);
    return { i, j: i + 1, e: smooth(next - w, next, y) };
  }
  measure();
  addEventListener('load', measure);
  new ResizeObserver(measure).observe(document.body);

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    measure();
    if (reduce) requestFrame();
  });

  // inclinação com o mouse
  let mx = 0, my = 0, cmx = 0, cmy = 0;
  addEventListener('pointermove', (e) => {
    mx = (e.clientX / innerWidth) * 2 - 1;
    my = (e.clientY / innerHeight) * 2 - 1;
  }, { passive: true });

  // easter egg: DROP TABLE explode as partículas
  let boomStart = -1;
  addEventListener('drop-table', () => { if (!reduce) boomStart = performance.now() / 1000; });
  function boomAmount(t) {
    if (boomStart < 0) return 0;
    const d = t - boomStart;
    if (d < 0.35) return 1 - Math.pow(1 - d / 0.35, 3);
    if (d < 1.8) return 1;
    if (d < 3.4) return 1 - smooth(0, 1, (d - 1.8) / 1.6);
    boomStart = -1;
    return 0;
  }

  let smoothY = scrollY;
  function frame(now) {
    const t = reduce ? 0 : now / 1000;
    smoothY = reduce ? scrollY : smoothY + (scrollY - smoothY) * 0.1;
    if (Math.abs(scrollY - smoothY) < 0.5) smoothY = scrollY;

    const { i, j, e } = locate(smoothY);
    const la = looks[names[i]], lb = looks[names[j]];
    const ma = matrix(la.rot(t)), mb = matrix(lb.rot(t));
    const pa = data[names[i]], pb = data[names[j]];
    const swirl = reduce ? 0 : Math.sin(e * Math.PI) * 0.9;
    const boom = boomAmount(t);

    for (let k = 0; k < N; k++) {
      const o = k * 3;
      const ax = pa[o], ay = pa[o + 1], az = pa[o + 2];
      const bx = pb[o], by = pb[o + 1], bz = pb[o + 2];
      const x1 = ma[0] * ax + ma[1] * ay + ma[2] * az, y1 = ma[3] * ax + ma[4] * ay + ma[5] * az, z1 = ma[6] * ax + ma[7] * ay + ma[8] * az;
      const x2 = mb[0] * bx + mb[1] * by + mb[2] * bz, y2 = mb[3] * bx + mb[4] * by + mb[5] * bz, z2 = mb[6] * bx + mb[7] * by + mb[8] * bz;
      const s = swirl + boom * (2.5 + rand[k] * 3);
      pos[o] = x1 + (x2 - x1) * e + dir[o] * s;
      pos[o + 1] = y1 + (y2 - y1) * e + dir[o + 1] * s;
      pos[o + 2] = z1 + (z2 - z1) * e + dir[o + 2] * s;
    }
    geometry.attributes.position.needsUpdate = true;

    const wide = innerWidth >= 900;
    group.position.x = wide ? lerp(la.x, lb.x, e) : 0;
    group.position.y = wide ? lerp(la.y, lb.y, e) : 0;
    group.scale.setScalar(lerp(la.scale, lb.scale, e) * (wide ? 1 : 0.72));
    cmx += (mx - cmx) * 0.05;
    cmy += (my - cmy) * 0.05;
    group.rotation.y = cmx * 0.3;
    group.rotation.x = cmy * 0.18;

    uniforms.uTime.value = t;
    uniforms.uAlert.value = boom * 0.9;
    uniforms.uOpacity.value = lerp(la.opacity, lb.opacity, e) * (wide ? 1 : 0.6) * themeBoost;
    renderer.render(scene, camera);

    if (!reduce) requestAnimationFrame(frame);
  }

  // com "reduzir movimento", só redesenha quando a página rola
  function requestFrame() {
    if (pending) return;
    pending = true;
    requestAnimationFrame((now) => { pending = false; frame(now); });
  }
  if (reduce) addEventListener('scroll', requestFrame, { passive: true });
  requestAnimationFrame(frame);
}
