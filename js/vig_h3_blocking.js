import { UI_FONT } from "./vig_h3_type.js";
import { SCHEME_CLASS, ensureSchemeStyles } from "./vig_h3_scheme.js";
const THREE_BASE = new URL("./vendor/three/", import.meta.url);
let threeLoading = null;
function loadThree() {
  if (!threeLoading) {
    threeLoading = Promise.all([
      import(new URL("three.module.min.mjs", THREE_BASE).href),
      import(new URL("OrbitControls.mjs", THREE_BASE).href),
      import(new URL("TransformControls.mjs", THREE_BASE).href),
    ]).then(([THREE, orbit, transform]) => ({
      THREE,
      OrbitControls: orbit.OrbitControls,
      TransformControls: transform.TransformControls,
    }));
    threeLoading.catch(() => { threeLoading = null; });
  }
  return threeLoading;
}
export const SCENE_VERSION = 1;
export const KINDS = {
  wall: { label: "Wall", color: "#8a8f99", size: { w: 4, h: 2.8, d: 0.15 } },
  box: { label: "Box", color: "#d9a441", size: { w: 1, h: 1, d: 1 } },
  person: { label: "Person", color: "#c0392b", size: { h: 1.75, r: 0.25 } },
  cylinder: { label: "Cylinder", color: "#3c8dbc", size: { h: 1, r: 0.4 } },
  sphere: { label: "Sphere", color: "#27ae60", size: { r: 0.5 } },
  light: { label: "Light", color: "#fff1d6", size: {}, light: { type: "point", intensity: 30 } },
  floor: { label: "Floor", color: "#9a9a9a", size: { w: 20, d: 20 } },
  line: { label: "Line", color: "#f2f2f2", size: { w: 0.3, h: 0.15 } },
  path: { label: "Path", color: "#4fa3d9", size: {} },
};
export const SIZE_FIELDS = {
  wall: [["w", "width"], ["h", "height"], ["d", "thickness"]],
  box: [["w", "width"], ["h", "height"], ["d", "depth"]],
  person: [["h", "height"], ["r", "radius"]],
  cylinder: [["h", "height"], ["r", "radius"]],
  sphere: [["r", "radius"]],
  light: [],
  floor: [["w", "width"], ["d", "depth"]],
  line: [["w", "width"], ["h", "height"]],
  path: [],
};
function clampFrame(frame, frames) {
  return Math.max(0, Math.min(frames - 1, Math.round(Number(frame) || 0)));
}
function uid(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
export function newScene({ frames, fps = 24, width, height }) {
  return {
    version: SCENE_VERSION,
    frames,
    fps,
    width,
    height,
    grid: true,
    objects: [makeObject("floor", { name: "Floor" })],
    camera: { keys: [{ f: 0, p: [0, 1.6, 7], t: [0, 1, 0], lens: 35 }] },
  };
}
export function makeObject(kind, { name = "", at = [0, 0, 0], frame = 0 } = {}) {
  const spec = KINDS[kind];
  if (!spec) throw new Error(`unknown kind ${kind}`);
  const object = {
    id: uid(kind[0]),
    kind,
    name: name || spec.label,
    color: spec.color,
    size: { ...spec.size },
    keys: [{ f: frame, p: [...at], r: [0, 0, 0] }],
  };
  if (kind === "light") {
    object.light = { ...spec.light };
    object.keys[0].p = [at[0], at[1] || 3, at[2]];
  }
  if (kind === "line" || kind === "path") {
    object.points = [];
    object.smooth = true;
  }
  return object;
}
export function readScene(value, { frames, fps = 24, width, height }) {
  let scene = value;
  if (typeof scene === "string") {
    try { scene = JSON.parse(scene); } catch { scene = null; }
  }
  if (!scene || typeof scene !== "object" || !Array.isArray(scene.objects)) {
    return newScene({ frames, fps, width, height });
  }
  const out = {
    version: SCENE_VERSION,
    frames,
    fps,
    width,
    height,
    grid: scene.grid !== false,
    objects: [],
    camera: { keys: [] },
  };
  for (const o of scene.objects) {
    if (!o || !KINDS[o.kind]) continue;
    const base = makeObject(o.kind);
    const object = {
      ...base,
      id: String(o.id || base.id),
      name: String(o.name || base.name),
      color: /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : base.color,
      size: { ...base.size, ...cleanNumbers(o.size) },
      keys: cleanKeys(o.keys, frames, ["p", "r"]),
    };
    if (!object.keys.length) object.keys = base.keys;
    if (o.kind === "light") {
      object.light = {
        type: o.light && o.light.type === "directional" ? "directional" : "point",
        intensity: Number(o.light && o.light.intensity) > 0 ? Number(o.light.intensity) : base.light.intensity,
      };
    }
    if (o.kind === "line") {
      object.points = cleanPoints(o.points);
      object.smooth = o.smooth !== false;
      if (object.points.length < 2) continue;
    }
    if (o.kind === "path") {
      object.points = cleanPoints3(o.points);
      object.smooth = o.smooth !== false;
      if (object.points.length < 2) continue;
    }
    const follow = cleanFollow(o.follow, frames);
    if (follow && o.kind !== "path" && o.kind !== "floor") {
      object.follow = { ...follow, face: o.follow.face !== false };
    }
    for (const key of object.keys) {
      const u = Number(key.u);
      if ("u" in key && Number.isFinite(u)) key.u = Math.max(0, Math.min(1, u));
      else delete key.u;
    }
    out.objects.push(object);
  }
  const pathIds = new Set(out.objects.filter((o) => o.kind === "path").map((o) => o.id));
  for (const object of out.objects) if (object.follow && !pathIds.has(object.follow.path)) delete object.follow;
  const camFollow = scene.camera ? cleanFollow(scene.camera.follow, frames) : null;
  if (camFollow && pathIds.has(camFollow.path)) {
    const lift = Number(scene.camera.follow.lift);
    out.camera.follow = { ...camFollow, lift: Number.isFinite(lift) ? lift : 1.6 };
  }
  const look = scene.camera && typeof scene.camera.look === "string" ? scene.camera.look : "";
  out.camera.look = look === "path" || out.objects.some((o) => o.id === look) ? look : "";
  out.camera.keys = cleanKeys(scene.camera && scene.camera.keys, frames, ["p", "t"]).map((k) => ({
    ...k,
    lens: Number(k.lens) > 0 ? Number(k.lens) : 35,
  }));
  for (const key of out.camera.keys) {
    const u = Number(key.u);
    if ("u" in key && Number.isFinite(u)) key.u = Math.max(0, Math.min(1, u));
    else delete key.u;
    const roll = Number(key.roll);
    if ("roll" in key && Number.isFinite(roll)) key.roll = roll;
    else delete key.roll;
  }
  if (!out.camera.keys.length) out.camera.keys = newScene({ frames, fps, width, height }).camera.keys;
  return out;
}
function cleanNumbers(value) {
  const out = {};
  for (const [k, v] of Object.entries(value || {})) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}
function cleanKeys(keys, frames, vectors) {
  const seen = new Map();
  for (const key of Array.isArray(keys) ? keys : []) {
    if (!key) continue;
    const f = clampFrame(key.f, frames);
    const clean = { f };
    let ok = true;
    for (const name of vectors) {
      const v = Array.isArray(key[name]) ? key[name].map(Number) : null;
      if (!v || v.length !== 3 || v.some((n) => !Number.isFinite(n))) ok = false;
      else clean[name] = v;
    }
    if (ok) seen.set(f, { ...key, ...clean });
  }
  return [...seen.values()].sort((a, b) => a.f - b.f);
}
function catmull(a, b, c, d, u) {
  const u2 = u * u;
  const u3 = u2 * u;
  return b.map((_, i) =>
    0.5 * (2 * b[i] + (-a[i] + c[i]) * u + (2 * a[i] - 5 * b[i] + 4 * c[i] - d[i]) * u2
      + (-a[i] + 3 * b[i] - 3 * c[i] + d[i]) * u3));
}
function cleanPoints(points) {
  const out = [];
  for (const point of Array.isArray(points) ? points : []) {
    if (!Array.isArray(point) || point.length !== 2) continue;
    const [x, z] = point.map(Number);
    if (Number.isFinite(x) && Number.isFinite(z)) out.push([Math.round(x * 1000) / 1000, Math.round(z * 1000) / 1000]);
  }
  return out;
}
export const LINE_STEPS = 12;
export function lineSamples(points, smooth = true) {
  const pts = cleanPoints(points);
  if (pts.length < 3 || !smooth) return pts;
  const out = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    const c = pts[i + 1];
    const d = pts[Math.min(pts.length - 1, i + 2)];
    for (let step = 0; step < LINE_STEPS; step += 1) out.push(catmull(a, b, c, d, step / LINE_STEPS));
  }
  out.push(pts[pts.length - 1]);
  return out;
}
export function ribbon(samples, width, height) {
  const positions = [];
  const indices = [];
  if (!samples || samples.length < 2) return { positions, indices };
  const half = Math.max(0.005, Number(width) || 0.3) / 2;
  const top = Math.max(0.005, Number(height) || 0.15);
  const edges = samples.map((point, i) => {
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    let dx = next[0] - prev[0];
    let dz = next[1] - prev[1];
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    return { l: [point[0] - dz * half, point[1] + dx * half], r: [point[0] + dz * half, point[1] - dx * half] };
  });
  const strips = [
    (e) => [[e.l[0], top, e.l[1]], [e.r[0], top, e.r[1]]],
    (e) => [[e.l[0], 0, e.l[1]], [e.l[0], top, e.l[1]]],
    (e) => [[e.r[0], top, e.r[1]], [e.r[0], 0, e.r[1]]],
  ];
  for (const strip of strips) {
    const base = positions.length / 3;
    for (const e of edges) for (const v of strip(e)) positions.push(...v);
    for (let i = 0; i < edges.length - 1; i += 1) {
      const a = base + i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  }
  return { positions, indices };
}
function cleanPoints3(points) {
  const out = [];
  for (const point of Array.isArray(points) ? points : []) {
    if (!Array.isArray(point) || point.length !== 3) continue;
    const v = point.map(Number);
    if (v.every(Number.isFinite)) out.push(v.map((n) => Math.round(n * 1000) / 1000));
  }
  return out;
}
function cleanFollow(follow, frames) {
  if (!follow || typeof follow.path !== "string" || !follow.path) return null;
  const from = clampFrame(follow.from, frames);
  let to = clampFrame(follow.to ?? frames - 1, frames);
  if (to <= from) to = Math.min(frames - 1, from + 1);
  return { path: follow.path, from, to };
}
export function pathSamples(points, smooth = true) {
  const pts = cleanPoints3(points);
  if (pts.length < 3 || !smooth) return pts;
  const out = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[i];
    const c = pts[i + 1];
    const d = pts[Math.min(pts.length - 1, i + 2)];
    for (let step = 0; step < LINE_STEPS; step += 1) out.push(catmull(a, b, c, d, step / LINE_STEPS));
  }
  out.push(pts[pts.length - 1]);
  return out;
}
function distance(a, b) {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}
export function pathLength(samples) {
  let total = 0;
  for (let i = 0; i < (samples || []).length - 1; i += 1) total += distance(samples[i], samples[i + 1]);
  return total;
}
export function alongPath(samples, u) {
  if (!samples || samples.length < 2) return null;
  let want = Math.max(0, Math.min(1, u)) * pathLength(samples);
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const seg = distance(a, b);
    if (want <= seg || i === samples.length - 2) {
      const t = seg > 0 ? Math.min(1, want / seg) : 0;
      const dir = seg > 0 ? [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg, (b[2] - a[2]) / seg] : [0, 0, 1];
      return { p: a.map((v, k) => v + (b[k] - v) * t), dir };
    }
    want -= seg;
  }
  return null;
}
export function nearestAlong(samples, point) {
  if (!samples || samples.length < 2) return 0;
  const total = pathLength(samples) || 1;
  let best = 0;
  let bestDist = Infinity;
  let walked = 0;
  for (let i = 0; i < samples.length - 1; i += 1) {
    const a = samples[i];
    const b = samples[i + 1];
    const seg = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len2 = seg[0] * seg[0] + seg[1] * seg[1] + seg[2] * seg[2];
    const t = len2 > 0
      ? Math.max(0, Math.min(1, ((point[0] - a[0]) * seg[0] + (point[1] - a[1]) * seg[1] + (point[2] - a[2]) * seg[2]) / len2))
      : 0;
    const q = [a[0] + seg[0] * t, a[1] + seg[1] * t, a[2] + seg[2] * t];
    const d = Math.hypot(point[0] - q[0], point[1] - q[1], point[2] - q[2]);
    const len = Math.sqrt(len2);
    if (d < bestDist) {
      bestDist = d;
      best = (walked + len * t) / total;
    }
    walked += len;
  }
  return Math.max(0, Math.min(1, best));
}
export function placeAlong(follow, keys, frame) {
  const placed = (Array.isArray(keys) ? keys : []).filter((k) => Number.isFinite(k.u));
  if (!placed.length) {
    const span = follow.to - follow.from;
    const u = span > 0 ? (frame - follow.from) / span : frame >= follow.from ? 1 : 0;
    return Math.max(0, Math.min(1, u));
  }
  if (placed.length === 1 || frame <= placed[0].f) return placed[0].u;
  const last = placed[placed.length - 1];
  if (frame >= last.f) return last.u;
  const n = placed.length;
  const d = [];
  for (let k = 0; k < n - 1; k += 1) d.push((placed[k + 1].u - placed[k].u) / (placed[k + 1].f - placed[k].f));
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k += 1) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (d[k - 1] + d[k]) / 2;
  for (let k = 0; k < n - 1; k += 1) {
    if (d[k] === 0) {
      m[k] = 0;
      m[k + 1] = 0;
      continue;
    }
    const a = m[k] / d[k];
    const b = m[k + 1] / d[k];
    const r = a * a + b * b;
    if (r > 9) {
      const t = 3 / Math.sqrt(r);
      m[k] = t * a * d[k];
      m[k + 1] = t * b * d[k];
    }
  }
  let i = 0;
  while (i < n - 2 && placed[i + 1].f <= frame) i += 1;
  const h = placed[i + 1].f - placed[i].f;
  const t = (frame - placed[i].f) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  const u = (2 * t3 - 3 * t2 + 1) * placed[i].u + (t3 - 2 * t2 + t) * h * m[i]
    + (-2 * t3 + 3 * t2) * placed[i + 1].u + (t3 - t2) * h * m[i + 1];
  return Math.max(0, Math.min(1, u));
}
export function followAt(follow, path, frame, keys = null) {
  if (!follow || !path || !Array.isArray(path.points)) return null;
  const samples = pathSamples(path.points, path.smooth !== false);
  if (samples.length < 2) return null;
  const at = alongPath(samples, placeAlong(follow, keys, frame));
  return { p: at.p, dir: at.dir, yaw: (Math.atan2(at.dir[0], at.dir[2]) * 180) / Math.PI };
}
function pathOf(scene, id) {
  return (scene.objects || []).find((o) => o.id === id && o.kind === "path") || null;
}
export function poseOf(object, frame, scene) {
  const base = sampleTrack(object.keys, frame);
  const on = object.follow ? followAt(object.follow, pathOf(scene, object.follow.path), frame, object.keys) : null;
  if (!on) return base;
  const r = object.follow.face !== false ? [base.r[0], base.r[1] + on.yaw, base.r[2]] : base.r;
  return { ...base, p: on.p, r };
}
function middleOf(object) {
  const s = object.size || {};
  if (object.kind === "sphere") return s.r || 0.5;
  if (object.kind === "light") return 0;
  return (s.h || 1) / 2;
}
export function cameraPoseOf(scene, frame) {
  const base = sampleTrack(scene.camera.keys, frame);
  const follow = scene.camera.follow;
  const on = follow ? followAt(follow, pathOf(scene, follow.path), frame, scene.camera.keys) : null;
  const lift = on ? Number(follow.lift ?? 1.6) || 0 : 0;
  const p = on ? [on.p[0], on.p[1] + lift, on.p[2]] : base.p;
  let t = base.t;
  const look = scene.camera.look || "";
  if (look === "path" && on) {
    t = [p[0] + on.dir[0] * 5, p[1] + on.dir[1] * 5, p[2] + on.dir[2] * 5];
  } else if (look && look !== "path") {
    const target = (scene.objects || []).find((o) => o.id === look);
    if (target) {
      const at = poseOf(target, frame, scene).p;
      t = [at[0], at[1] + middleOf(target), at[2]];
    }
  }
  return { ...base, p, t };
}
export function sampleTrack(keys, frame, curved = ["p", "t"]) {
  if (!keys || !keys.length) return null;
  if (frame <= keys[0].f) return { ...keys[0] };
  const last = keys[keys.length - 1];
  if (frame >= last.f) return { ...last };
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].f <= frame) i += 1;
  const b = keys[i];
  const c = keys[i + 1];
  const a = keys[i - 1] || b;
  const d = keys[i + 2] || c;
  const u = (frame - b.f) / (c.f - b.f);
  const out = { f: frame };
  for (const name of Object.keys(b)) {
    if (name === "f") continue;
    const vb = b[name];
    const vc = c[name];
    if (Array.isArray(vb) && Array.isArray(vc)) {
      out[name] = curved.includes(name) && Array.isArray(a[name]) && Array.isArray(d[name])
        ? catmull(a[name], vb, vc, d[name], u)
        : vb.map((v, k) => v + (vc[k] - v) * u);
    } else if (typeof vb === "number" && typeof vc === "number") {
      out[name] = vb + (vc - vb) * u;
    } else {
      out[name] = vb;
    }
  }
  return out;
}
export function writeKey(keys, frame, values) {
  const here = keys.find((k) => k.f === frame);
  if (here) {
    Object.assign(here, values);
    return here;
  }
  if (keys.length === 1) {
    Object.assign(keys[0], values);
    return keys[0];
  }
  const key = { ...sampleTrack(keys, frame), ...values, f: frame };
  keys.push(key);
  keys.sort((a, b) => a.f - b.f);
  return key;
}
export function addKey(keys, frame) {
  if (keys.some((k) => k.f === frame)) return null;
  const key = { ...sampleTrack(keys, frame), f: frame };
  keys.push(key);
  keys.sort((a, b) => a.f - b.f);
  return key;
}
export function removeKey(keys, frame) {
  if (keys.length <= 1) return false;
  const at = keys.findIndex((k) => k.f === frame);
  if (at < 0) return false;
  keys.splice(at, 1);
  return true;
}
export function verticalFov(lens, aspect) {
  const half = 18 / Math.max(1, Number(lens) || 35);
  const vertical = aspect >= 1 ? Math.atan(half / aspect) : Math.atan(half);
  return (2 * vertical * 180) / Math.PI;
}
const STYLE_ID = "vig-blocking-styles";
function ensureStyles() {
  ensureSchemeStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.vig-block-veil { position: fixed; inset: 0; z-index: 10000; background: var(--cut-scrim, rgba(0,0,0,.6));
  display: flex; align-items: center; justify-content: center; font-family: ${UI_FONT}; }
.vig-block { width: min(1500px, 96vw); height: min(940px, 94vh); background: var(--cut-bg); color: var(--cut-bright);
  border: 1px solid var(--cut-edge); border-radius: 10px; display: grid; overflow: hidden;
  grid-template-columns: 210px minmax(0, 1fr) 270px; grid-template-rows: 44px minmax(0, 1fr) 92px; font-size: 12px; }
.vig-block button, .vig-block input, .vig-block select { font-family: inherit; font-size: 12px; }
.vig-block-head { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding: 0 12px;
  border-bottom: 1px solid var(--cut-edge); }
.vig-block-title { font-size: 15px; font-weight: 600; letter-spacing: .02em; }
.vig-block-head .vig-block-btn { padding: 7px 13px; line-height: 16px; }
.vig-block-spring { flex: 1; }
.vig-block-btn { background: var(--cut-menu); color: var(--cut-bright); border: 1px solid var(--cut-edge);
  border-radius: 5px; padding: 5px 10px; cursor: pointer; white-space: nowrap; position: relative; overflow: hidden; }
.vig-block-btn:hover { border-color: var(--cut-accent); }
.vig-block-btn:disabled { opacity: .45; cursor: default; }
.vig-block-btn.on { background: rgba(var(--cut-accent-rgb), .28); border-color: var(--cut-accent); }
.vig-block-btn.primary { background: var(--cut-accent); color: var(--cut-bg); border-color: var(--cut-accent); font-weight: 600; }
.vig-block-fill { position: absolute; left: 0; top: 0; bottom: 0; width: 0; background: rgba(255,255,255,.35); pointer-events: none; }
.vig-block-side { padding: 10px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; }
.vig-block-left { border-right: 1px solid var(--cut-edge); }
.vig-block-right { border-left: 1px solid var(--cut-edge); }
.vig-block-label { font-size: 10px; letter-spacing: .08em; text-transform: uppercase; color: var(--cut-dim); }
.vig-block-adds { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.vig-block-list { display: flex; flex-direction: column; gap: 2px; }
.vig-block-item { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 4px; cursor: pointer;
  border: 1px solid transparent; }
.vig-block-item:hover { background: var(--cut-menu); }
.vig-block-item.on { border-color: var(--cut-accent); background: rgba(var(--cut-accent-rgb), .18); }
.vig-block-swatch { width: 12px; height: 12px; border-radius: 3px; flex: 0 0 auto; border: 1px solid rgba(0,0,0,.35); }
.vig-block-item-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vig-block-item-keys { color: var(--cut-dim); font-size: 10px; }
.vig-block-view { position: relative; overflow: hidden; background: #15161a; }
.vig-block-view canvas { display: block; width: 100%; height: 100%; }
.vig-block-viewbar { position: absolute; left: 8px; top: 8px; display: flex; gap: 4px; z-index: 2; }
.vig-block-hint { position: absolute; left: 10px; bottom: 8px; color: rgba(255,255,255,.55); font-size: 11px; z-index: 2;
  pointer-events: none; }
.vig-block-frame { position: absolute; border: 2px solid rgba(var(--cut-accent-rgb), .9); pointer-events: none; z-index: 1;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.45); }
.vig-block-row { display: flex; align-items: center; gap: 6px; }
.vig-block-row > span { color: var(--cut-dim); min-width: 62px; }
.vig-block-field { width: 60px; background: var(--cut-menu); color: var(--cut-bright); border: 1px solid var(--cut-edge);
  border-radius: 4px; padding: 3px 5px; }
.vig-block-wide { flex: 1; min-width: 0; width: auto; }
.vig-block-xyz { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; flex: 1; }
.vig-block-xyz .vig-block-field { width: 100%; box-sizing: border-box; }
.vig-block-keys { display: flex; flex-wrap: wrap; gap: 4px; }
.vig-block-key { padding: 2px 6px; border-radius: 10px; border: 1px solid var(--cut-edge); cursor: pointer; font-size: 11px; }
.vig-block-key.here { border-color: var(--cut-accent); color: var(--cut-accent); }
.vig-block-note { color: var(--cut-dim); line-height: 1.4; }
.vig-block-time { grid-column: 1 / -1; border-top: 1px solid var(--cut-edge); padding: 8px 12px; display: flex;
  flex-direction: column; gap: 6px; }
.vig-block-track { position: relative; height: 26px; }
.vig-block-track input[type=range] { position: absolute; inset: 0; width: 100%; margin: 0; }
.vig-block-tick { position: absolute; top: 0; width: 11px; height: 12px; margin-left: -5px; cursor: ew-resize;
  z-index: 2; touch-action: none; }
.vig-block-tick::before { content: ""; position: absolute; left: 4px; top: 0; width: 3px; height: 10px;
  background: var(--cut-accent); border-radius: 1px; }
.vig-block-tick:hover::before, .vig-block-tick.dragging::before { left: 3px; width: 5px; }
.vig-block-tick.camera { top: auto; bottom: 0; }
.vig-block-tick.camera::before { background: #4fa3d9; top: auto; bottom: 0; }
.vig-block-status { color: var(--cut-dim); min-height: 16px; }
.vig-block-status.error { color: #e07a6a; }
`;
  document.head.appendChild(style);
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(label, title, onClick, extra = "") {
  const b = el("button", `vig-block-btn${extra ? ` ${extra}` : ""}`, label);
  if (title) b.title = title;
  b.addEventListener("click", onClick);
  return b;
}
const ROUND = (n) => Math.round(n * 1000) / 1000;
const DRAFTS = "vig.h3.blocking.";
const BATCH = 12;
export async function openBlockingEditor(options) {
  ensureStyles();
  const { frames, width, height } = options;
  const fps = options.fps || 24;
  const draftKey = options.draftKey ? DRAFTS + options.draftKey : "";
  let draft = null;
  if (!options.scene && draftKey) {
    try { draft = localStorage.getItem(draftKey); } catch { draft = null; }
  }
  const scene = readScene(options.scene || draft, { frames, fps, width, height });
  const veil = el("div", `vig-block-veil ${SCHEME_CLASS}`);
  const box = el("div", "vig-block");
  veil.appendChild(box);
  (options.mount || document.body).appendChild(veil);
  const head = el("div", "vig-block-head");
  head.append(el("span", "vig-block-title", options.title || "Blocking"));
  const facts = el("span", "vig-block-note",
    `${width}×${height} · ${frames} frames · ${(frames / fps).toFixed(2)} s — the clip's own length and shape`);
  head.append(facts, el("div", "vig-block-spring"));
  const renderBtn = button("Render to reference", "", () => render(), "primary");
  renderBtn.title = "Render every frame through the scene camera at the clip's size, and attach the video to "
    + "this clip as a reference (<Video N>). The scene is kept beside it, so it can be opened and changed again.";
  const renderFill = el("span", "vig-block-fill");
  renderBtn.appendChild(renderFill);
  const closeBtn = el("button", "vig-cutter-ghost", "✕ Close");
  closeBtn.title = "Close the editor (Esc). An unrendered scene is kept and comes back next time.";
  closeBtn.addEventListener("click", () => close());
  const undoBtn = button("↶ Undo", "Take back the last change to the scene (Ctrl+Z)", () => undo());
  undoBtn.disabled = true;
  const redoBtn = button("↷ Redo", "Put back the change Undo took (Ctrl+Y or Ctrl+Shift+Z)", () => redo());
  redoBtn.disabled = true;
  const resetBtn = button("Reset scene", "Start the scene again: a floor and the camera. Undo brings it back.",
    () => resetScene());
  head.append(undoBtn, redoBtn, resetBtn, renderBtn, closeBtn);
  box.appendChild(head);
  const left = el("div", "vig-block-side vig-block-left");
  left.append(el("div", "vig-block-label", "Add"));
  const adds = el("div", "vig-block-adds");
  for (const kind of ["person", "box", "wall", "cylinder", "sphere", "light", "floor", "line", "path"]) {
    const tip = kind === "line"
      ? "Draw a line on the floor -- a kerb, a road edge, a lane marking: click point after point, Enter to finish"
      : kind === "path"
        ? "Draw a trajectory on any surface -- the floor, a box's top, a wall -- and put objects or the camera on it "
          + "(Trajectory, in their properties). It is never rendered."
        : `Add a ${KINDS[kind].label.toLowerCase()} in front of the camera`;
    adds.appendChild(button(KINDS[kind].label, tip, () => addObject(kind)));
  }
  left.append(adds, el("div", "vig-block-label", "Scene"));
  const list = el("div", "vig-block-list");
  left.appendChild(list);
  const gridRow = el("label", "vig-block-row");
  const gridBox = document.createElement("input");
  gridBox.type = "checkbox";
  gridBox.checked = scene.grid;
  gridBox.addEventListener("change", () => { scene.grid = gridBox.checked; changed(); });
  gridRow.append(gridBox, el("span", "", "grid on the floor"));
  gridRow.title = "Lines on the floor in the render too -- they make the camera's own movement readable to H3.";
  left.appendChild(gridRow);
  box.appendChild(left);
  const view = el("div", "vig-block-view");
  const viewbar = el("div", "vig-block-viewbar");
  const freeBtn = button("Free view", "Orbit with the left button, pan with the right, zoom with the wheel", () => setViewMode("free"));
  const camBtn = button("Camera view", "Look through the scene camera, in the clip's frame", () => setViewMode("camera"));
  const moveBtn = button("Move (W)", "Drag the arrows to move the selected object", () => setGizmo("translate"));
  const turnBtn = button("Rotate (E)", "Drag the rings to turn the selected object", () => setGizmo("rotate"));
  const fromViewBtn = button("Camera = this view", "Put the scene camera where the free view is now, as a key at this frame", () => cameraFromView());
  viewbar.append(freeBtn, camBtn, moveBtn, turnBtn, fromViewBtn);
  const hint = el("div", "vig-block-hint",
    "Click an object to select it · one key: it moves whole · ◆ Key here, then move at another frame: a path · Del removes it");
  const frameBox = el("div", "vig-block-frame");
  view.append(viewbar, hint, frameBox);
  box.appendChild(view);
  const right = el("div", "vig-block-side vig-block-right");
  box.appendChild(right);
  const time = el("div", "vig-block-time");
  const timeRow = el("div", "vig-block-row");
  const playBtn = button("▶ Play", "Play the scene at the clip's rate", () => togglePlay());
  const frameLabel = el("span", "");
  frameLabel.style.minWidth = "160px";
  const keyBtn = button("◆ Key here", "Add a key to the selected object (or the camera) at this frame, holding its pose", () => keyHere());
  const unkeyBtn = button("Remove key", "Remove the selected object's key at this frame", () => unkeyHere());
  const status = el("span", "vig-block-status");
  timeRow.append(playBtn, frameLabel, keyBtn, unkeyBtn, status);
  const track = el("div", "vig-block-track");
  const slider = document.createElement("input");
  slider.type = "range";
  slider.min = "0";
  slider.max = String(frames - 1);
  slider.step = "1";
  slider.value = "0";
  track.appendChild(slider);
  time.append(timeRow, track);
  box.appendChild(time);
  const say = (text, error = false) => {
    status.textContent = text || "";
    status.classList.toggle("error", !!error);
  };
  let lib;
  try {
    lib = await loadThree();
  } catch (error) {
    say(`three.js could not be loaded: ${error && error.message ? error.message : error}`, true);
    return { close };
  }
  const { THREE, OrbitControls, TransformControls } = lib;
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.shadowMap.enabled = true;
  view.insertBefore(renderer.domElement, viewbar);
  const world = new THREE.Scene();
  world.background = new THREE.Color("#2b2d33");
  world.add(new THREE.HemisphereLight(0xffffff, 0x444444, 1.1));
  const freeCam = new THREE.PerspectiveCamera(45, 1, 0.05, 500);
  freeCam.position.set(7, 6, 10);
  const orbit = new OrbitControls(freeCam, renderer.domElement);
  orbit.target.set(0, 1, 0);
  orbit.update();
  const shotCam = new THREE.PerspectiveCamera(40, width / height, 0.05, 500);
  world.add(shotCam);
  const shotHelper = new THREE.CameraHelper(shotCam);
  world.add(shotHelper);
  const gizmo = new TransformControls(freeCam, renderer.domElement);
  world.add(gizmo.getHelper());
  gizmo.addEventListener("dragging-changed", (event) => {
    orbit.enabled = !event.value;
    if (!event.value) recordStep();
  });
  gizmo.addEventListener("objectChange", () => poseFromGizmo());
  const editorOnly = new Set([shotHelper, gizmo.getHelper()]);
  let floorGrid = null;
  const meshes = new Map();
  const paths = new Map();
  let current = 0;
  let selected = null;
  let selectedCamera = false;
  let viewMode = "free";
  let playing = false;
  let busy = false;
  let drawing = null;
  let draggingPoint = null;
  function material(color) {
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0 });
  }
  function build(object) {
    const s = object.size;
    let node;
    if (object.kind === "floor") {
      node = new THREE.Mesh(new THREE.PlaneGeometry(s.w, s.d), material(object.color));
      node.rotation.x = -Math.PI / 2;
      node.receiveShadow = true;
      const holder = new THREE.Group();
      holder.add(node);
      node = holder;
    } else if (object.kind === "wall" || object.kind === "box") {
      node = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.h, s.d), material(object.color));
      node.geometry.translate(0, s.h / 2, 0);
    } else if (object.kind === "person") {
      const radius = Math.min(s.r, s.h / 2);
      node = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(0.01, s.h - 2 * radius), 6, 16), material(object.color));
      node.geometry.translate(0, s.h / 2, 0);
      const nose = new THREE.Mesh(new THREE.BoxGeometry(radius * 0.5, radius * 0.4, radius * 0.6), material("#f5e6d0"));
      nose.position.set(0, s.h - radius * 1.1, radius * 0.95);
      node.add(nose);
    } else if (object.kind === "cylinder") {
      node = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, s.h, 24), material(object.color));
      node.geometry.translate(0, s.h / 2, 0);
    } else if (object.kind === "sphere") {
      node = new THREE.Mesh(new THREE.SphereGeometry(s.r, 24, 16), material(object.color));
      node.geometry.translate(0, s.r, 0);
    } else if (object.kind === "line") {
      node = new THREE.Group();
      const strip = ribbon(lineSamples(object.points, object.smooth), s.w, s.h);
      if (strip.indices.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(strip.positions, 3));
        geometry.setIndex(strip.indices);
        geometry.computeVertexNormals();
        const mat = material(object.color);
        mat.side = THREE.DoubleSide;
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.position.y = 0.004;
        mesh.receiveShadow = true;
        node.add(mesh);
      }
      for (const [x, z] of object.points) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), new THREE.MeshBasicMaterial({ color: "#4fa3d9" }));
        dot.position.set(x, 0.05, z);
        dot.userData.editorOnly = true;
        dot.visible = editorShown;
        node.add(dot);
      }
    } else if (object.kind === "path") {
      node = new THREE.Group();
      const samples = pathSamples(object.points, object.smooth);
      if (samples.length >= 2) {
        const rail = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(samples.map(([x, y, z]) => new THREE.Vector3(x, y + 0.05, z))),
          new THREE.LineBasicMaterial({ color: object.color }),
        );
        rail.userData.editorOnly = true;
        rail.visible = editorShown;
        node.add(rail);
      }
      for (const [x, y, z] of object.points) {
        const dot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: object.color }));
        dot.position.set(x, y + 0.05, z);
        dot.userData.editorOnly = true;
        dot.visible = editorShown;
        node.add(dot);
      }
    } else if (object.kind === "light") {
      node = new THREE.Group();
      const intensity = Number(object.light.intensity) || 30;
      const lamp = object.light.type === "directional"
        ? new THREE.DirectionalLight(object.color, intensity / 10)
        : new THREE.PointLight(object.color, intensity, 0, 2);
      lamp.castShadow = true;
      if (lamp.isDirectionalLight) {
        lamp.target.position.set(0, -1, 0.0001);
        node.add(lamp.target);
      }
      node.add(lamp);
      const marker = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8),
        new THREE.MeshBasicMaterial({ color: object.color }));
      marker.userData.editorOnly = true;
      node.add(marker);
    }
    node.traverse((child) => {
      if (child.isMesh && !child.userData.editorOnly) child.castShadow = true;
      child.userData.objectId = object.id;
    });
    node.userData.objectId = object.id;
    return node;
  }
  function rebuild(object) {
    const old = meshes.get(object.id);
    if (old) {
      if (gizmo.object === old) gizmo.detach();
      world.remove(old);
    }
    const node = build(object);
    meshes.set(object.id, node);
    world.add(node);
    if (selected === object && object.kind !== "floor" && object.kind !== "path") gizmo.attach(node);
    syncGizmo();
  }
  function rebuildGrid() {
    if (floorGrid) world.remove(floorGrid);
    floorGrid = null;
    const floor = scene.objects.find((o) => o.kind === "floor");
    if (!floor || !scene.grid) return;
    const size = Math.max(floor.size.w, floor.size.d);
    floorGrid = new THREE.GridHelper(size, Math.round(size), 0x55575c, 0x6c6e74);
    floorGrid.position.y = 0.002;
    world.add(floorGrid);
  }
  function rebuildPaths() {
    for (const line of paths.values()) world.remove(line);
    paths.clear();
    for (const object of scene.objects) {
      if (object.keys.length < 2 || object.follow || object.kind === "path") continue;
      const points = [];
      for (let f = 0; f < frames; f += 1) {
        const pose = sampleTrack(object.keys, f);
        points.push(new THREE.Vector3(pose.p[0], pose.p[1] + 0.03, pose.p[2]));
      }
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({
        color: object === selected ? 0xffd27a : 0x9aa0aa, transparent: true, opacity: object === selected ? 1 : 0.6,
      }));
      paths.set(object.id, line);
      world.add(line);
    }
    if (scene.camera.keys.length >= 2 || scene.camera.follow) {
      const points = [];
      for (let f = 0; f < frames; f += 1) points.push(new THREE.Vector3(...cameraPoseOf(scene, f).p));
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: 0x4fa3d9 }));
      paths.set("camera", line);
      world.add(line);
    }
  }
  function pose(f) {
    for (const object of scene.objects) {
      const node = meshes.get(object.id);
      if (!node) continue;
      const at = object.kind === "path" ? { p: [0, 0, 0], r: [0, 0, 0] } : poseOf(object, f, scene);
      node.position.set(...at.p);
      node.rotation.set(...at.r.map((deg) => (deg * Math.PI) / 180), "YXZ");
    }
    const cam = cameraPoseOf(scene, f);
    shotCam.position.set(...cam.p);
    shotCam.lookAt(...cam.t);
    if (Number(cam.roll)) shotCam.rotateZ((Number(cam.roll) * Math.PI) / 180);
    shotCam.fov = verticalFov(cam.lens, width / height);
    shotCam.aspect = width / height;
    shotCam.updateProjectionMatrix();
    shotHelper.update();
  }
  function setEditorOnlyVisible(visible) {
    editorShown = visible;
    for (const node of editorOnly) node.visible = visible;
    for (const line of paths.values()) line.visible = visible;
    world.traverse((child) => { if (child.userData.editorOnly) child.visible = visible; });
    syncGizmo();
  }
  let editorShown = true;
  function syncGizmo() {
    gizmo.getHelper().visible = editorShown && viewMode === "free" && gizmo.object !== undefined && !drawing
      && !draggingPoint && !(selectedCamera && gizmo.mode === "rotate" && scene.camera.look);
  }
  function resize() {
    const rect = view.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    freeCam.aspect = w / h;
    freeCam.updateProjectionMatrix();
    const aspect = width / height;
    let fw = w;
    let fh = w / aspect;
    if (fh > h) { fh = h; fw = h * aspect; }
    frameBox.style.left = `${(w - fw) / 2}px`;
    frameBox.style.top = `${(h - fh) / 2}px`;
    frameBox.style.width = `${fw}px`;
    frameBox.style.height = `${fh}px`;
    frameBox.style.display = viewMode === "camera" ? "block" : "none";
  }
  const observer = new ResizeObserver(resize);
  observer.observe(view);
  function draw() {
    if (viewMode === "camera") {
      const rect = view.getBoundingClientRect();
      const w = rect.width;
      const h = rect.height;
      const aspect = width / height;
      let fw = w;
      let fh = w / aspect;
      if (fh > h) { fh = h; fw = h * aspect; }
      shotHelper.visible = false;
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      renderer.setClearColor(0x15161a);
      renderer.clear();
      const x = (w - fw) / 2;
      const y = (h - fh) / 2;
      renderer.setScissor(x, y, fw, fh);
      renderer.setScissorTest(true);
      renderer.setViewport(x, y, fw, fh);
      renderer.render(world, shotCam);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, w, h);
      shotHelper.visible = true;
    } else {
      renderer.render(world, freeCam);
    }
  }
  let raf = 0;
  let lastTick = 0;
  function loop(now) {
    raf = requestAnimationFrame(loop);
    if (playing) {
      if (!lastTick) lastTick = now;
      const step = Math.floor(((now - lastTick) / 1000) * fps);
      if (step > 0) {
        lastTick += (step / fps) * 1000;
        setFrame((current + step) % frames);
      }
    }
    orbit.update();
    draw();
  }
  function setFrame(f) {
    current = clampFrame(f, frames);
    slider.value = String(current);
    pose(current);
    paintTime();
    paintProps();
  }
  function keyTick(key, keys, camera) {
    const at = (f) => `${frames > 1 ? (f / (frames - 1)) * 100 : 0}%`;
    const tick = el("div", `vig-block-tick${camera ? " camera" : ""}`);
    tick.style.left = at(key.f);
    tick.title = `Key at frame ${key.f} -- drag to move it to another frame, click to go to it`;
    tick.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || playing || busy) return;
      event.preventDefault();
      event.stopPropagation();
      tick.setPointerCapture(event.pointerId);
      const rect = track.getBoundingClientRect();
      const i = keys.indexOf(key);
      const lo = i > 0 ? keys[i - 1].f + 1 : 0;
      const hi = i < keys.length - 1 ? keys[i + 1].f - 1 : frames - 1;
      const startX = event.clientX;
      let moved = false;
      const move = (e) => {
        if (!moved && Math.abs(e.clientX - startX) < 3) return;
        moved = true;
        tick.classList.add("dragging");
        const u = Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width)));
        const f = Math.max(lo, Math.min(hi, Math.round(u * (frames - 1))));
        if (f === key.f) return;
        key.f = f;
        tick.style.left = at(f);
        current = f;
        slider.value = String(f);
        pose(f);
        frameLabel.textContent = `key → frame ${f} / ${frames - 1} · ${(f / fps).toFixed(2)} s`;
      };
      const up = () => {
        tick.removeEventListener("pointermove", move);
        tick.removeEventListener("pointerup", up);
        tick.removeEventListener("pointercancel", up);
        tick.classList.remove("dragging");
        if (!moved) {
          setFrame(key.f);
          return;
        }
        changed();
        paintList();
        setFrame(key.f);
        say(`Key moved to frame ${key.f}.`);
      };
      tick.addEventListener("pointermove", move);
      tick.addEventListener("pointerup", up);
      tick.addEventListener("pointercancel", up);
    });
    return tick;
  }
  function paintTime() {
    frameLabel.textContent = `frame ${current} / ${frames - 1} · ${(current / fps).toFixed(2)} s`;
    for (const tick of track.querySelectorAll(".vig-block-tick")) tick.remove();
    const keysOf = selectedCamera ? scene.camera.keys : selected ? selected.keys : [];
    for (const key of keysOf) track.appendChild(keyTick(key, keysOf, selectedCamera));
    const keys = selectedCamera ? scene.camera.keys : selected ? selected.keys : null;
    keyBtn.disabled = !keys || keys.some((k) => k.f === current);
    unkeyBtn.disabled = !keys || keys.length <= 1 || !keys.some((k) => k.f === current);
  }
  function paintList() {
    list.textContent = "";
    const camItem = el("div", `vig-block-item${selectedCamera ? " on" : ""}`);
    const camSwatch = el("span", "vig-block-swatch");
    camSwatch.style.background = "#4fa3d9";
    camItem.append(camSwatch, el("span", "vig-block-item-name", "Camera"),
      el("span", "vig-block-item-keys", `${scene.camera.keys.length}◆`));
    camItem.addEventListener("click", () => select(null, true));
    list.appendChild(camItem);
    for (const object of scene.objects) {
      const item = el("div", `vig-block-item${object === selected ? " on" : ""}`);
      const swatch = el("span", "vig-block-swatch");
      swatch.style.background = object.color;
      item.append(swatch, el("span", "vig-block-item-name", object.name),
        el("span", "vig-block-item-keys", `${object.keys.length}◆`));
      item.addEventListener("click", () => select(object));
      list.appendChild(item);
    }
  }
  function numberField(value, step, onChange, min = null) {
    const input = el("input", "vig-block-field");
    input.type = "number";
    input.step = String(step);
    if (min !== null) input.min = String(min);
    input.value = String(ROUND(value));
    input.addEventListener("change", () => {
      const n = Number(input.value);
      if (!Number.isFinite(n) || (min !== null && n < min)) {
        input.value = String(ROUND(value));
        return;
      }
      onChange(n);
    });
    return input;
  }
  function xyzRow(label, values, step, onChange) {
    const row = el("div", "vig-block-row");
    row.appendChild(el("span", "", label));
    const grid = el("div", "vig-block-xyz");
    values.forEach((v, i) => {
      grid.appendChild(numberField(v, step, (n) => {
        const next = [...values];
        next[i] = n;
        onChange(next);
      }));
    });
    row.appendChild(grid);
    return row;
  }
  function keysRow(keys) {
    const wrap = el("div", "vig-block-keys");
    for (const key of keys) {
      const chip = el("span", `vig-block-key${key.f === current ? " here" : ""}`, `◆ ${key.f}`);
      chip.title = `Go to frame ${key.f} (${(key.f / fps).toFixed(2)} s)`;
      chip.addEventListener("click", () => setFrame(key.f));
      wrap.appendChild(chip);
    }
    return wrap;
  }
  function option(value, label) {
    const o = el("option", "", label);
    o.value = value;
    return o;
  }
  function trajectoryRows(follow, set, camera, placed = false) {
    const paths = scene.objects.filter((o) => o.kind === "path");
    right.append(el("div", "vig-block-label", "Trajectory"));
    const row = el("div", "vig-block-row");
    const pick = el("select", "vig-block-field vig-block-wide");
    pick.appendChild(option("", camera ? "none — keys only" : "none — its keys"));
    for (const p of paths) pick.appendChild(option(p.id, p.name));
    pick.value = follow ? follow.path : "";
    pick.addEventListener("change", () => {
      set(pick.value ? { path: pick.value, from: follow ? follow.from : 0, to: follow ? follow.to : frames - 1 } : null);
      pose(current);
      syncGizmo();
      changed();
      paintProps();
    });
    row.append(el("span", "", "follows"), pick);
    right.appendChild(row);
    if (!paths.length) {
      right.appendChild(el("div", "vig-block-note", "Draw one first: Path, in the Add list."));
      return;
    }
    if (!follow) return;
    const span = el("div", "vig-block-row");
    const fix = (from, to) => {
      const a = clampFrame(from, frames);
      let b = clampFrame(to, frames);
      if (b <= a) b = Math.min(frames - 1, a + 1);
      set({ from: a, to: b });
      pose(current);
      changed();
      paintProps();
    };
    if (placed) {
      right.appendChild(el("div", "vig-block-note", camera
        ? "Drag the camera along its trajectory with the arrows -- it stays on the path, at its height "
          + "above it -- or press Camera = this view. Each key keeps its place; the frames between two "
          + "keys set how fast it covers that stretch. ◆ Key here, then move it at another frame, adds a key."
        : "Drag it along its trajectory with the arrows -- it stays on the path -- and turn it with "
          + "Rotate. Each key keeps its place and its turn; the frames between two keys set how fast it "
          + "covers that stretch. ◆ Key here, then move it at another frame, adds a key."));
    } else {
      span.append(el("span", "", "frames"),
        numberField(follow.from, 1, (n) => fix(n, follow.to), 0),
        numberField(follow.to, 1, (n) => fix(follow.from, n), 0));
      span.title = "From this frame to that one the rider goes from the path's first point to its last, at one speed; "
        + "before, it waits at the start, after, at the end.";
      right.appendChild(span);
    }
    if (camera) {
      const liftRow = el("div", "vig-block-row");
      liftRow.append(el("span", "", "height, m"), numberField(follow.lift ?? 1.6, 0.1, (n) => {
        set({ lift: n });
        pose(current);
        changed();
      }));
      liftRow.title = "How far above the trajectory the camera rides";
      right.appendChild(liftRow);
    } else {
      const faceRow = el("label", "vig-block-row");
      const face = document.createElement("input");
      face.type = "checkbox";
      face.checked = follow.face !== false;
      face.addEventListener("change", () => { set({ face: face.checked }); pose(current); changed(); paintProps(); });
      faceRow.append(face, el("span", "", "faces along the trajectory"));
      right.appendChild(faceRow);
    }
  }
  function paintProps() {
    right.textContent = "";
    if (selectedCamera) {
      const cam = sampleTrack(scene.camera.keys, current);
      right.append(el("div", "vig-block-label", "Camera"));
      right.appendChild(xyzRow("position", cam.p, 0.1, (p) => cameraKey({ p })));
      if (!scene.camera.look) right.appendChild(xyzRow("looks at", cam.t, 0.1, (t) => cameraKey({ t })));
      const lensRow = el("div", "vig-block-row");
      lensRow.append(el("span", "", "lens, mm"), numberField(cam.lens, 1, (lens) => cameraKey({ lens }), 8));
      right.appendChild(lensRow);
      const rollRow = el("div", "vig-block-row");
      rollRow.append(el("span", "", "roll°"), numberField(cam.roll || 0, 1, (roll) => cameraKey({ roll })));
      rollRow.title = "A turn about the lens axis, on top of where it aims -- a Dutch angle, or a roll as it moves";
      right.appendChild(rollRow);
      right.appendChild(el("div", "vig-block-note", scene.camera.look
        ? "It aims by its look below, so Rotate's rings are off -- choose “where its keys say” to turn it by hand."
        : "Rotate (E) turns it by hand: pan, tilt, and the roll about the lens. Each turn is a key."));
      right.append(el("div", "vig-block-label", "Keys"), keysRow(scene.camera.keys));
      right.appendChild(el("div", "vig-block-note",
        "Frame the shot in Free view, then press “Camera = this view” — at frame 0 for the start, "
        + "at a later frame for where the move ends. Two keys are a camera move."));
      trajectoryRows(scene.camera.follow, (next) => {
        if (next) {
          const fresh = !scene.camera.follow || scene.camera.follow.path !== next.path;
          scene.camera.follow = { lift: 1.6, ...scene.camera.follow, ...next };
          if (fresh) {
            const now = sampleTrack(scene.camera.keys, current);
            scene.camera.keys = [
              { f: 0, p: [...now.p], t: [...now.t], lens: now.lens, u: 0 },
              { f: frames - 1, p: [...now.p], t: [...now.t], lens: now.lens, u: 1 },
            ];
          }
        } else {
          delete scene.camera.follow;
          for (const key of scene.camera.keys) delete key.u;
          if (scene.camera.look === "path") scene.camera.look = "";
        }
      }, true, scene.camera.keys.some((k) => Number.isFinite(k.u)));
      const lookRow = el("div", "vig-block-row");
      const look = el("select", "vig-block-field vig-block-wide");
      look.appendChild(option("", "where its keys say"));
      if (scene.camera.follow) look.appendChild(option("path", "ahead, along its trajectory"));
      for (const o of scene.objects) {
        if (["floor", "path", "line", "light"].includes(o.kind)) continue;
        look.appendChild(option(o.id, `at ${o.name}`));
      }
      look.value = scene.camera.look || "";
      look.addEventListener("change", () => { scene.camera.look = look.value; pose(current); changed(); paintProps(); });
      lookRow.append(el("span", "", "looks"), look);
      lookRow.title = "At an object, the camera keeps it in the middle of the frame wherever it goes -- a chase";
      right.appendChild(lookRow);
      return;
    }
    if (!selected) {
      right.append(el("div", "vig-block-label", "Nothing selected"),
        el("div", "vig-block-note",
          "Add stand-ins on the left: a Person for each character (their height is what H3 reads), "
          + "boxes and walls for the set, a light or two. An object with one key stands still, and moving it moves it "
          + "whole at any frame. For a path, press ◆ Key here where the move starts, go to a later frame and "
          + "move it — every move after that writes a key at its frame. The camera is in the list too."));
      return;
    }
    const object = selected;
    right.append(el("div", "vig-block-label", KINDS[object.kind].label));
    const nameRow = el("div", "vig-block-row");
    const name = el("input", "vig-block-field vig-block-wide");
    name.value = object.name;
    name.addEventListener("change", () => { object.name = name.value.trim() || KINDS[object.kind].label; changed(); paintList(); });
    nameRow.append(el("span", "", "name"), name);
    right.appendChild(nameRow);
    const colorRow = el("div", "vig-block-row");
    const color = el("input", "");
    color.type = "color";
    color.value = object.color;
    color.addEventListener("input", () => { object.color = color.value; rebuild(object); pose(current); changed(); paintList(); });
    colorRow.append(el("span", "", "colour"), color);
    right.appendChild(colorRow);
    for (const [field, label] of SIZE_FIELDS[object.kind]) {
      const row = el("div", "vig-block-row");
      row.append(el("span", "", `${label}, m`), numberField(object.size[field], 0.05, (n) => {
        object.size[field] = n;
        rebuild(object);
        pose(current);
        changed();
      }, 0.01));
      right.appendChild(row);
    }
    if (object.kind === "line" || object.kind === "path") {
      const smoothRow = el("label", "vig-block-row");
      const smooth = document.createElement("input");
      smooth.type = "checkbox";
      smooth.checked = object.smooth !== false;
      smooth.addEventListener("change", () => { object.smooth = smooth.checked; rebuild(object); pose(current); changed(); });
      smoothRow.append(smooth, el("span", "", "smooth curve through the points"));
      right.appendChild(smoothRow);
      const length = object.kind === "path"
        ? ` · ${pathLength(pathSamples(object.points, object.smooth)).toFixed(1)} m` : "";
      right.appendChild(el("div", "vig-block-note", drawing === object
        ? `${object.points.length} point${object.points.length === 1 ? "" : "s"}${length} -- click on `
          + `${object.kind === "path" ? "any surface" : "the floor"} for the next one.`
        : `${object.points.length} points${length} -- drag a point in the view to move it.`));
      if (object.kind === "path") {
        const riders = scene.objects.filter((o) => o.follow && o.follow.path === object.id).map((o) => o.name);
        if (scene.camera.follow && scene.camera.follow.path === object.id) riders.push("Camera");
        right.appendChild(el("div", "vig-block-note", riders.length
          ? `On this trajectory: ${riders.join(", ")}.`
          : "Nothing rides it yet: select an object (or the camera) and choose this path under Trajectory."));
      }
      const tools = el("div", "vig-block-row");
      if (drawing === object) {
        tools.append(
          button("Finish line", "Stop adding points (Enter)", () => finishDrawing()),
          button("Undo point", "Take the last point back (Backspace)", () => undoLinePoint()),
        );
      } else {
        tools.append(
          button("Continue drawing", "Add more points to the end of this line", () => startDrawing(object)),
          button("Clear points", "Start this line again from nothing", () => {
            object.points = [];
            rebuild(object);
            startDrawing(object);
            changed();
          }),
        );
      }
      right.appendChild(tools);
    }
    if (object.kind === "light") {
      const typeRow = el("div", "vig-block-row");
      const type = el("select", "vig-block-field vig-block-wide");
      for (const [value, label] of [["point", "point"], ["directional", "sun (directional)"]]) {
        const option = el("option", "", label);
        option.value = value;
        type.appendChild(option);
      }
      type.value = object.light.type;
      type.addEventListener("change", () => { object.light.type = type.value; rebuild(object); pose(current); changed(); });
      typeRow.append(el("span", "", "type"), type);
      right.appendChild(typeRow);
      const powerRow = el("div", "vig-block-row");
      powerRow.append(el("span", "", "intensity"), numberField(object.light.intensity, 1, (n) => {
        object.light.intensity = n;
        rebuild(object);
        pose(current);
        changed();
      }, 0));
      right.appendChild(powerRow);
    }
    if (object.kind !== "floor" && object.kind !== "path") {
      const at = sampleTrack(object.keys, current);
      right.append(el("div", "vig-block-label", `Pose at frame ${current}`));
      if (object.follow) {
        right.appendChild(el("div", "vig-block-note", "Position comes from the trajectory below."));
      } else {
        right.appendChild(xyzRow("position", at.p, 0.1, (p) => objectKey(object, { p })));
      }
      right.appendChild(xyzRow(object.follow && object.follow.face !== false ? "turn, extra°" : "rotation°",
        at.r, 5, (r) => objectKey(object, { r })));
      right.append(el("div", "vig-block-label", "Keys"), keysRow(object.keys));
      trajectoryRows(object.follow, (next) => {
        if (next) {
          const fresh = !object.follow || object.follow.path !== next.path;
          object.follow = { face: true, ...object.follow, ...next };
          if (fresh) {
            const now = sampleTrack(object.keys, current);
            object.keys = [
              { f: 0, p: [...now.p], r: [...now.r], u: 0 },
              { f: frames - 1, p: [...now.p], r: [...now.r], u: 1 },
            ];
          }
        } else {
          delete object.follow;
          for (const key of object.keys) delete key.u;
        }
      }, false, object.keys.some((k) => Number.isFinite(k.u)));
    }
    const remove = button("Delete object", "Remove this object from the scene", () => deleteSelected());
    right.appendChild(remove);
  }
  function changed() {
    rebuildGrid();
    rebuildPaths();
    paintTime();
    if (draftKey) {
      try { localStorage.setItem(draftKey, JSON.stringify(scene)); } catch {   }
    }
    recordStep();
  }
  const undoStack = [];
  const redoStack = [];
  const UNDO_KEEP = 100;
  let lastStep = null;
  function paintUndo() {
    undoBtn.disabled = !undoStack.length;
    redoBtn.disabled = !redoStack.length;
  }
  function recordStep() {
    if (gizmo.dragging || draggingPoint) return;
    const now = JSON.stringify(scene);
    if (lastStep === null) {
      lastStep = now;
      return;
    }
    if (now === lastStep) return;
    undoStack.push(lastStep);
    if (undoStack.length > UNDO_KEEP) undoStack.shift();
    redoStack.length = 0;
    lastStep = now;
    paintUndo();
  }
  function restoreScene(text) {
    const data = JSON.parse(text);
    const keepId = selected ? selected.id : null;
    const keepCamera = selectedCamera;
    if (drawing) {
      drawing = null;
      paintHint();
    }
    gizmo.detach();
    for (const node of meshes.values()) world.remove(node);
    meshes.clear();
    scene.objects = data.objects;
    scene.camera = data.camera;
    scene.grid = data.grid !== false;
    gridBox.checked = scene.grid;
    for (const object of scene.objects) rebuild(object);
    lastStep = text;
    selected = null;
    select(scene.objects.find((o) => o.id === keepId) || null, keepCamera && !keepId);
    pose(current);
    rebuildGrid();
    rebuildPaths();
    paintTime();
    paintUndo();
    if (draftKey) {
      try { localStorage.setItem(draftKey, text); } catch {   }
    }
  }
  function undo() {
    if (busy || !undoStack.length) return;
    redoStack.push(JSON.stringify(scene));
    restoreScene(undoStack.pop());
    say(undoStack.length ? `Undone -- ${undoStack.length} more step(s) back.` : "Undone -- nothing further back.");
  }
  function redo() {
    if (busy || !redoStack.length) return;
    undoStack.push(JSON.stringify(scene));
    if (undoStack.length > UNDO_KEEP) undoStack.shift();
    restoreScene(redoStack.pop());
    say(redoStack.length ? `Redone -- ${redoStack.length} more step(s) forward.` : "Redone -- nothing further forward.");
  }
  function resetScene() {
    if (busy) return;
    undoStack.push(JSON.stringify(scene));
    if (undoStack.length > UNDO_KEEP) undoStack.shift();
    redoStack.length = 0;
    restoreScene(JSON.stringify(newScene({ frames, fps, width, height })));
    say("Scene reset -- Undo brings it back.");
  }
  function select(object, camera = false) {
    if (drawing && object !== drawing) finishDrawing();
    selected = object || null;
    selectedCamera = !!camera;
    gizmo.detach();
    if (selected && selected.kind !== "floor" && selected.kind !== "path") gizmo.attach(meshes.get(selected.id));
    else if (selectedCamera) gizmo.attach(shotCam);
    gizmo.setSpace(selectedCamera ? "local" : "world");
    syncGizmo();
    paintList();
    paintProps();
    paintTime();
    rebuildPaths();
  }
  function addObject(kind) {
    if (kind === "floor" && scene.objects.some((o) => o.kind === "floor")) {
      say("There is a floor already.");
      return;
    }
    const cam = sampleTrack(scene.camera.keys, current);
    const at = kind === "line" || kind === "path" ? [0, 0, 0] : [ROUND(cam.t[0]), 0, ROUND(cam.t[2])];
    const object = makeObject(kind, { at, frame: current });
    if (kind === "light") object.keys[0].p = [ROUND(cam.t[0]) + 1.5, 3, ROUND(cam.t[2]) + 1.5];
    scene.objects.push(object);
    rebuild(object);
    pose(current);
    select(object);
    changed();
    if (kind === "line" || kind === "path") startDrawing(object);
  }
  function paintHint() {
    hint.textContent = drawing
      ? `Drawing a ${drawing.kind === "path" ? "trajectory: click on any surface" : "line: click on the floor"} to add a point`
        + " · drag still turns the view · Backspace removes the last point · Enter or Esc finishes"
      : "Click an object to select it · one key: it moves whole · ◆ Key here, then move at another frame: a path · Del removes it";
  }
  function startDrawing(object) {
    if (viewMode !== "free") setViewMode("free");
    drawing = object;
    syncGizmo();
    paintHint();
    paintProps();
  }
  function finishDrawing() {
    const line = drawing;
    drawing = null;
    syncGizmo();
    paintHint();
    if (line && line.points.length < 2) {
      const node = meshes.get(line.id);
      if (node) world.remove(node);
      meshes.delete(line.id);
      scene.objects = scene.objects.filter((o) => o !== line);
      if (selected === line) selected = null;
      say(`A ${line.kind === "path" ? "trajectory" : "line"} needs two points at least -- it was not kept.`);
      paintList();
    }
    paintProps();
    changed();
  }
  function pointUnder(object, event) {
    const node = meshes.get(object.id);
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, freeCam);
    if (object.kind === "path") {
      const surfaces = scene.objects
        .filter((o) => o.kind !== "path" && meshes.has(o.id) && !(o.follow && o.follow.path === object.id))
        .map((o) => meshes.get(o.id));
      const surface = ray.intersectObjects(surfaces, true).find((h) => h.object.isMesh && !h.object.userData.editorOnly);
      const at = surface ? surface.point : new THREE.Vector3();
      if (!surface && !ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), at)) return null;
      return [ROUND(at.x), ROUND(at.y), ROUND(at.z)];
    }
    const floorY = node ? node.position.y : 0;
    const hit = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -floorY), hit)) return null;
    const local = node ? node.worldToLocal(hit.clone()) : hit;
    return [ROUND(local.x), ROUND(local.z)];
  }
  function addLinePoint(event) {
    const point = pointUnder(drawing, event);
    if (!point) return;
    drawing.points.push(point);
    rebuild(drawing);
    pose(current);
    paintProps();
    changed();
  }
  function pointAt(event) {
    if (!selected || drawing || viewMode !== "free" || !(selected.kind === "line" || selected.kind === "path")) return -1;
    const node = meshes.get(selected.id);
    if (!node) return -1;
    const rect = renderer.domElement.getBoundingClientRect();
    let best = -1;
    let reach = 14;
    selected.points.forEach((point, i) => {
      const v = selected.kind === "path"
        ? new THREE.Vector3(point[0], point[1] + 0.05, point[2])
        : node.localToWorld(new THREE.Vector3(point[0], 0.05, point[1]));
      v.project(freeCam);
      if (v.z > 1) return;
      const x = ((v.x + 1) / 2) * rect.width + rect.left;
      const y = ((1 - v.y) / 2) * rect.height + rect.top;
      const d = Math.hypot(event.clientX - x, event.clientY - y);
      if (d < reach) {
        reach = d;
        best = i;
      }
    });
    return best;
  }
  function undoLinePoint() {
    if (!drawing || !drawing.points.length) return;
    drawing.points.pop();
    rebuild(drawing);
    pose(current);
    paintProps();
    changed();
  }
  function deleteSelected() {
    if (!selected) return;
    const node = meshes.get(selected.id);
    if (node) world.remove(node);
    meshes.delete(selected.id);
    scene.objects = scene.objects.filter((o) => o !== selected);
    if (selected.kind === "path") {
      for (const o of scene.objects) if (o.follow && o.follow.path === selected.id) delete o.follow;
      if (scene.camera.follow && scene.camera.follow.path === selected.id) delete scene.camera.follow;
      if (scene.camera.look === "path" && !scene.camera.follow) scene.camera.look = "";
    }
    if (scene.camera.look === selected.id) scene.camera.look = "";
    gizmo.detach();
    syncGizmo();
    selected = null;
    pose(current);
    paintList();
    paintProps();
    changed();
  }
  function objectKey(object, values) {
    writeKey(object.keys, current, values);
    pose(current);
    changed();
    paintList();
    paintProps();
  }
  function cameraKey(values) {
    writeKey(scene.camera.keys, current, values);
    pose(current);
    changed();
    paintList();
    paintProps();
  }
  function poseFromGizmo() {
    if (selectedCamera) {
      if (gizmo.mode === "rotate") {
        if (scene.camera.look) return;
        const now = cameraPoseOf(scene, current);
        const reach = Math.max(1, Math.hypot(now.t[0] - now.p[0], now.t[1] - now.p[1], now.t[2] - now.p[2]));
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(shotCam.quaternion);
        const aim = shotCam.position.clone().addScaledVector(forward, reach);
        const plain = new THREE.PerspectiveCamera();
        plain.position.copy(shotCam.position);
        plain.lookAt(aim);
        let roll = Number(now.roll) || 0;
        if (gizmo.axis === "Z") {
          const turn = plain.quaternion.clone().invert().multiply(shotCam.quaternion);
          roll = (new THREE.Euler().setFromQuaternion(turn, "ZYX").z * 180) / Math.PI;
        }
        writeKey(scene.camera.keys, current, { t: [aim.x, aim.y, aim.z].map(ROUND), roll: ROUND(roll) });
        pose(current);
        changed();
        paintList();
        paintProps();
        return;
      }
      const at = [shotCam.position.x, shotCam.position.y, shotCam.position.z];
      const follow = scene.camera.follow;
      const path = follow && scene.objects.find((o) => o.id === follow.path && o.kind === "path");
      if (path) {
        const lift = Number(follow.lift ?? 1.6) || 0;
        const u = ROUND(nearestAlong(pathSamples(path.points, path.smooth !== false), [at[0], at[1] - lift, at[2]]));
        writeKey(scene.camera.keys, current, { u });
      } else {
        writeKey(scene.camera.keys, current, { p: at.map(ROUND) });
      }
      pose(current);
      changed();
      paintList();
      paintProps();
      return;
    }
    if (!selected || selected.kind === "floor" || selected.kind === "path") return;
    const node = meshes.get(selected.id);
    if (!node) return;
    if (selected.follow) {
      const path = scene.objects.find((o) => o.id === selected.follow.path && o.kind === "path");
      if (!path) return;
      const samples = pathSamples(path.points, path.smooth !== false);
      if (gizmo.mode === "rotate") {
        const e = new THREE.Euler().setFromQuaternion(node.quaternion, "YXZ");
        const r = [e.x, e.y, e.z].map((rad) => (rad * 180) / Math.PI);
        if (selected.follow.face !== false) {
          const at = alongPath(samples, placeAlong(selected.follow, selected.keys, current));
          r[1] -= (Math.atan2(at.dir[0], at.dir[2]) * 180) / Math.PI;
        }
        writeKey(selected.keys, current, { r: r.map((deg) => ROUND(((deg + 540) % 360) - 180)) });
      } else {
        const u = ROUND(nearestAlong(samples, [node.position.x, node.position.y, node.position.z]));
        writeKey(selected.keys, current, { u });
      }
      pose(current);
      changed();
      paintList();
      paintProps();
      return;
    }
    const p = [node.position.x, node.position.y, node.position.z].map(ROUND);
    const e = new THREE.Euler().setFromQuaternion(node.quaternion, "YXZ");
    const r = [e.x, e.y, e.z].map((rad) => ROUND((rad * 180) / Math.PI));
    writeKey(selected.keys, current, { p, r });
    changed();
    paintList();
    paintProps();
  }
  function cameraFromView() {
    const t = [orbit.target.x, orbit.target.y, orbit.target.z].map(ROUND);
    const follow = scene.camera.follow;
    const path = follow && scene.objects.find((o) => o.id === follow.path && o.kind === "path");
    if (path) {
      const lift = Number(follow.lift ?? 1.6) || 0;
      const u = ROUND(nearestAlong(pathSamples(path.points, path.smooth !== false),
        [freeCam.position.x, freeCam.position.y - lift, freeCam.position.z]));
      cameraKey({ u, t, roll: 0 });
    } else {
      cameraKey({ p: [freeCam.position.x, freeCam.position.y, freeCam.position.z].map(ROUND), t, roll: 0 });
    }
    select(null, true);
    say(`Camera key at frame ${current}.`);
  }
  function keyHere() {
    const keys = selectedCamera ? scene.camera.keys : selected ? selected.keys : null;
    if (!keys) return;
    addKey(keys, current);
    changed();
    paintList();
    paintProps();
  }
  function unkeyHere() {
    const keys = selectedCamera ? scene.camera.keys : selected ? selected.keys : null;
    if (!keys) return;
    removeKey(keys, current);
    pose(current);
    changed();
    paintList();
    paintProps();
  }
  function setViewMode(mode) {
    viewMode = mode;
    freeBtn.classList.toggle("on", mode === "free");
    camBtn.classList.toggle("on", mode === "camera");
    orbit.enabled = mode === "free";
    gizmo.enabled = mode === "free";
    syncGizmo();
    resize();
  }
  function setGizmo(mode) {
    gizmo.setMode(mode);
    moveBtn.classList.toggle("on", mode === "translate");
    turnBtn.classList.toggle("on", mode === "rotate");
    syncGizmo();
  }
  function togglePlay() {
    playing = !playing;
    lastTick = 0;
    playBtn.textContent = playing ? "❚❚ Pause" : "▶ Play";
  }
  renderer.domElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const index = pointAt(event);
    if (index < 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    draggingPoint = { object: selected, index };
    renderer.domElement.setPointerCapture(event.pointerId);
    renderer.domElement.style.cursor = "grabbing";
    syncGizmo();
  }, { capture: true });
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!draggingPoint) {
      if (!event.buttons) renderer.domElement.style.cursor = pointAt(event) >= 0 ? "grab" : "";
      return;
    }
    event.stopImmediatePropagation();
    const point = pointUnder(draggingPoint.object, event);
    if (!point) return;
    draggingPoint.object.points[draggingPoint.index] = point;
    rebuild(draggingPoint.object);
    pose(current);
  }, { capture: true });
  const endPointDrag = (event) => {
    if (!draggingPoint) return;
    event.stopImmediatePropagation();
    draggingPoint = null;
    renderer.domElement.style.cursor = "";
    syncGizmo();
    paintProps();
    changed();
  };
  renderer.domElement.addEventListener("pointerup", endPointDrag, { capture: true });
  renderer.domElement.addEventListener("pointercancel", endPointDrag, { capture: true });
  const pointer = { x: 0, y: 0, down: false };
  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.down = true;
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!pointer.down) return;
    pointer.down = false;
    if (viewMode !== "free" || gizmo.dragging) return;
    if (Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 4) return;
    if (drawing) {
      if (event.button === 0) addLinePoint(event);
      return;
    }
    const rect = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.params.Line = { threshold: 0.15 };
    ray.setFromCamera(ndc, freeCam);
    const hits = ray.intersectObjects([...meshes.values()], true)
      .filter((hit) => hit.object.userData.objectId);
    const hit = hits.find((h) => {
      const object = scene.objects.find((o) => o.id === h.object.userData.objectId);
      return object && object.kind !== "floor";
    }) || hits[0];
    const object = hit ? scene.objects.find((o) => o.id === hit.object.userData.objectId) : null;
    select(object || null);
  });
  function onKey(event) {
    if (event.target && /input|select|textarea/i.test(event.target.tagName)) return;
    if ((event.ctrlKey || event.metaKey) && (event.key === "z" || event.key === "Z" || event.key === "y" || event.key === "Y")) {
      if (event.key === "y" || event.key === "Y" || event.shiftKey) redo();
      else undo();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (drawing && (event.key === "Enter" || event.key === "Escape" || event.key === "Backspace")) {
      if (event.key === "Backspace") undoLinePoint();
      else finishDrawing();
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (event.key === "Escape") { close(); return; }
    if (event.key === "w" || event.key === "W") setGizmo("translate");
    else if (event.key === "e" || event.key === "E") setGizmo("rotate");
    else if (event.key === "Delete") deleteSelected();
    else if (event.key === " ") { event.preventDefault(); togglePlay(); }
    else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }
  window.addEventListener("keydown", onKey, true);
  slider.addEventListener("input", () => setFrame(Number(slider.value)));
  async function render() {
    if (busy) return;
    if (typeof options.callRoute !== "function") return;
    busy = true;
    renderBtn.disabled = true;
    playing = false;
    playBtn.textContent = "▶ Play";
    const was = current;
    const out = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    out.setPixelRatio(1);
    out.setSize(width, height, false);
    out.shadowMap.enabled = true;
    try {
      say("Rendering…");
      const begun = await options.callRoute("/vig/h3/cutter/blocking/begin", { width, height, fps, frames });
      const token = begun.token;
      setEditorOnlyVisible(false);
      let batch = [];
      let start = 0;
      for (let f = 0; f < frames; f += 1) {
        pose(f);
        out.render(world, shotCam);
        batch.push(out.domElement.toDataURL("image/jpeg", 0.92));
        if (batch.length === BATCH || f === frames - 1) {
          setEditorOnlyVisible(true);
          await options.callRoute("/vig/h3/cutter/blocking/frames", { token, start, frames: batch });
          setEditorOnlyVisible(false);
          start = f + 1;
          batch = [];
          renderFill.style.width = `${((f + 1) / frames) * 90}%`;
          say(`Rendering… ${f + 1} / ${frames}`);
        }
      }
      setEditorOnlyVisible(true);
      say("Encoding the video…");
      const done = await options.callRoute("/vig/h3/cutter/blocking/finish", {
        token,
        name: options.name || "blocking",
        scene,
      });
      renderFill.style.width = "100%";
      if (draftKey) {
        try { localStorage.removeItem(draftKey); } catch {   }
      }
      say(`Attached as a reference: ${done.label}`);
      if (typeof options.onRendered === "function") {
        options.onRendered({ source: done.source, label: done.label, scene: JSON.parse(JSON.stringify(scene)) });
      }
    } catch (error) {
      setEditorOnlyVisible(true);
      say(`The render failed: ${error && error.message ? error.message : error}`, true);
    } finally {
      out.dispose();
      setFrame(was);
      busy = false;
      renderBtn.disabled = false;
      setTimeout(() => { renderFill.style.width = "0"; }, 1200);
    }
  }
  function close() {
    cancelAnimationFrame(raf);
    observer.disconnect();
    window.removeEventListener("keydown", onKey, true);
    gizmo.detach();
    gizmo.dispose();
    orbit.dispose();
    renderer.dispose();
    veil.remove();
    if (typeof options.onClosed === "function") options.onClosed();
  }
  for (const object of scene.objects) rebuild(object);
  rebuildGrid();
  rebuildPaths();
  setViewMode("free");
  setGizmo("translate");
  paintList();
  setFrame(0);
  resize();
  lastStep = JSON.stringify(scene);
  raf = requestAnimationFrame(loop);
  return { close, scene };
}
