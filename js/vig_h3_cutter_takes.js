import { api } from "../../scripts/api.js";
import { UI_FONT } from "./vig_h3_type.js";
import { SCHEME_CLASS, ensureSchemeStyles } from "./vig_h3_scheme.js";
import { ICONS, svg } from "./vig_h3_icons.js";
const TAKES_ROUTE = "/vig/h3/cutter/takes";
const JUDGE_ROUTE = "/vig/h3/cutter/take_judge";
const PRUNE_ROUTE = "/vig/h3/cutter/takes_prune";
const MAX_RATING = 5;
const DELETE_ROUTE = "/vig/h3/cutter/take_delete";
const ADOPT_ROUTE = "/vig/h3/cutter/take_adopt";
const FILE_ROUTE = "/vig/h3/cutter/take_file";
const USAGE_ROUTE = "/vig/h3/usage/read";
const FPS = 24;
function trashIcon() {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("width", "13");
  node.setAttribute("height", "13");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", "2");
  node.innerHTML =
    '<path d="M3 6h18"></path>' +
    '<path d="M8 6V4.5A1.5 1.5 0 019.5 3h5A1.5 1.5 0 0116 4.5V6"></path>' +
    '<path d="M5.5 6l1 13a2 2 0 002 2h7a2 2 0 002-2l1-13"></path>' +
    '<path d="M10 10.5v7M14 10.5v7"></path>';
  return node;
}
export function broomIcon() {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("width", "17");
  node.setAttribute("height", "17");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("fill", "currentColor");
  node.innerHTML =
    '<g transform="rotate(24 12 12)">' +
    '<path d="M10.9 1.3c0-.5.4-.9 1.1-.9s1.1.4 1.1.9l-.3 7.9h-1.6z"></path>' +
    '<path d="M8.6 13c0-2.6 1.5-4.4 3.4-4.4s3.4 1.8 3.4 4.4z"></path>' +
    '<path d="M8.6 13h6.8c.6 2.2 1.6 4.0 3.0 5.5l-2.2 1.5' +
    'c-.6-.7-1.1-1.5-1.6-2.4-.1 1.3-.4 2.5-.9 3.7l-2.7.3' +
    'c-.5-1.2-.8-2.4-.9-3.7-.7 1.2-1.6 2.3-2.7 3.2l-3.0-1.5' +
    'c2.5-2.0 4.2-4.4 5.2-7.1z"></path>' +
    '</g>' +
    '<circle cx="2.6" cy="4.7" r="1.25"></circle>' +
    '<circle cx="6.0" cy="5.9" r="0.75"></circle>' +
    '<circle cx="3.7" cy="9.8" r="1.75"></circle>';
  return node;
}
export function eyeIcon(open) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("width", "13");
  node.setAttribute("height", "13");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", "2");
  node.setAttribute("stroke-linecap", "round");
  node.innerHTML =
    '<path d="M1.6 12S5.2 5.4 12 5.4 22.4 12 22.4 12 18.8 18.6 12 18.6 1.6 12 1.6 12z"></path>' +
    '<circle cx="12" cy="12" r="3.1"></circle>' +
    (open ? "" : '<path d="M3.5 3.5l17 17"></path>');
  return node;
}
export function paintCount(holder, icon, text) {
  holder.textContent = "";
  if (icon && text) holder.appendChild(svg(icon, 15, 2));
  if (text) {
    const number = document.createElement("span");
    number.textContent = text;
    holder.appendChild(number);
  }
}
function funnelIcon() {
  const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  node.setAttribute("width", "11");
  node.setAttribute("height", "11");
  node.setAttribute("viewBox", "0 0 24 24");
  node.setAttribute("fill", "none");
  node.setAttribute("stroke", "currentColor");
  node.setAttribute("stroke-width", "2.2");
  node.setAttribute("stroke-linejoin", "round");
  node.innerHTML = '<path d="M3 4.5h18l-7 8.4v7.2l-4-2.2v-5z"></path>';
  return node;
}
function keyLabel(text) {
  const key = document.createElement("span");
  key.className = "vig-takes-key";
  const parts = String(text ?? "").split(/(?<=[_.])/);
  parts.forEach((part, at) => {
    if (at) key.appendChild(document.createElement("wbr"));
    key.appendChild(document.createTextNode(part));
  });
  return key;
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function takeUrl(root, folder, file) {
  return api.apiURL(
    `${FILE_ROUTE}?path=${encodeURIComponent(root)}&folder=${encodeURIComponent(
      folder,
    )}&file=${encodeURIComponent(file)}`,
  );
}
async function post(route, payload) {
  const response = await api.fetchApi(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.ok === false) {
    throw new Error((data && data.error) || `${route} failed (${response.status})`);
  }
  return data;
}
function stackNodes(stack) {
  const text = String(stack || "");
  if (!text.startsWith("stack:")) return [];
  const parts = text.slice(6).split("|").filter(Boolean);
  return parts.map((part, at) => {
    const cut = part.indexOf("(");
    const cls = (cut < 0 ? part : part.slice(0, cut)).trim();
    const inside = cut < 0 ? "" : part.slice(cut + 1).replace(/\)\s*$/, "");
    const settings = [];
    for (const piece of inside ? inside.split(",") : []) {
      const eq = piece.indexOf("=");
      if (eq < 0) {
        if (settings.length) settings[settings.length - 1][1] += `,${piece}`;
        continue;
      }
      settings.push([piece.slice(0, eq), piece.slice(eq + 1)]);
    }
    return { cls, settings, loader: at === parts.length - 1 };
  });
}
const NO_PIXELS = new Set(["ModelPreviewOverrideKJ", "PixaromaFreeVram"]);
function prettyNode(cls) {
  const bare = String(cls || "?")
    .replace(/MiniMaxH3/g, "")
    .replace(/(Apply|Patch|Loader)$/, "");
  return bare.replace(/([a-z0-9])([A-Z])/g, "$1 $2").trim() || String(cls || "?");
}
function facts(made) {
  const s = (made && made.settings) || {};
  const out = [];
  const add = (group, heading, key, label, value, extra) => {
    if (value === undefined || value === null || value === "") return;
    out.push({ group, heading, key, label, value: String(value), ...(extra || {}) });
  };
  const delivered = made.delivered_frames || made.frames || 0;
  add("take", "take", "seed", "seed", made.seed, { number: Number(made.seed) });
  add("take", "take", "steps", "steps", made.steps ?? s.steps,
    { number: Number(made.steps ?? s.steps) });
  add("take", "take", "batch", "batch", made.batch_variant ? "yes" : "");
  const spent = (made && made.spent) || {};
  add("take", "take", "sampled", "sampled", spent.sampled
    ? `${Number(spent.sampled).toFixed(1)} s` : "",
    { number: Number(spent.sampled), measure: true });
  add("take", "take", "made_in", "made in", spent.sampled
    ? `${(Number(spent.sampled) + Number(spent.decoded || 0)).toFixed(1)} s` : "",
    { number: Number(spent.sampled) + Number(spent.decoded || 0),
      measure: true,
      title: "the sampler plus the decode; the conditioning is the clip's cost, "
           + "paid once and reused by every take of a batch" });
  add("take", "take", "created", "created", made.created,
      { number: Number(made.created_at) || 0,
        title: "when this take was written into the project folder" });
  add("take", "take", "id", "id", made.take_id,
      { title: "project / clip folder / file: names this take on disk and its "
             + "paperwork beside it. Copy it to name the take in a report." });
  add("sampler", "sampler", "sampler_name", "sampler", s.sampler_name);
  add("sampler", "sampler", "scheduler", "scheduler", s.scheduler);
  add("sampler", "sampler", "denoise", "denoise", s.denoise);
  add("sampler", "sampler", "canvas", "canvas", s.width && s.height ? `${s.width}x${s.height}` : "");
  add("sampler", "sampler", "shift_video", "shift · video", s.shift_video);
  add("sampler", "sampler", "shift_audio", "shift · audio", s.shift_audio);
  add("clip", "clip", "mode", "mode", made.mode);
  add("clip", "clip", "length", "length", delivered
    ? `${(delivered / FPS).toFixed(2)} s` : "",
    { number: delivered || undefined,
      title: `${delivered} frames`
        + (made.seconds && Math.abs(delivered / FPS - made.seconds) > 0.01
            ? `; ${made.seconds} s was asked, and the sampler's grid rounds up`
            : "") });
  add("clip", "clip", "carried_run", "carried run", made.carried_run
    ? `${made.carried_run} frames`
    : (made.context_frames ? `none (${made.context_frames} asked for)` : "none"));
  add("clip", "clip", "context_at", "hands over at",
    made.context_at ? `frame ${made.context_at}` : "");
  add("clip", "clip", "style", "style", made.style);
  add("clip", "clip", "camera", "camera", made.camera);
  add("model", "model", "checkpoint", "checkpoint", made.checkpoint);
  for (const node of stackNodes(made.stack)) {
    const name = prettyNode(node.cls);
    const group = node.loader ? "model" : `accel:${node.cls}`;
    const heading = node.loader ? "model" : name;
    const blind = NO_PIXELS.has(node.cls);
    if (!node.settings.length) {
      add("model", "model", node.cls, name, "applied",
          { title: node.cls, cosmetic: blind });
      continue;
    }
    for (const [key, value] of node.settings) {
      if (node.loader && String(value) === String(made.checkpoint || "")) continue;
      add(group, heading, `${node.cls}.${key}`, key, value,
          { title: `${node.cls}.${key}`, cosmetic: blind });
    }
  }
  const w = made && made.writer && typeof made.writer === "object" ? made.writer : null;
  if (w) {
    add("writer", "writer", "writer.model", "model", w.via === "offline" ? "offline" : w.model,
      { title: w.via === "offline"
          ? "no model wrote this prompt: the offline floor assembled it"
          : w.via === "provider"
            ? `a provider's model${w.provider ? ` at ${w.provider}` : ""}`
            : "the GGUF file the local server loaded" });
    const seeded = w.seed !== null && w.seed !== undefined && w.seed !== "";
    if (seeded) {
      add("writer", "writer", "writer.seed", "seed", w.seed,
        { number: Number(w.seed), title: "the seed the writing model ran on" });
      add("writer", "writer", "writer.seed_mode", "seed mode", w.seed_mode);
    }
    add("writer", "writer", "writer.temperature", "temperature", w.temperature,
      { number: Number(w.temperature),
        title: "scales every writing stage's own tuned temperature; 1 is neutral" });
    add("writer", "writer", "writer.skills", "skills",
      Array.isArray(w.skills) ? (w.skills.length ? w.skills.join(", ") : "all") : "",
      { title: "the skills the writer was allowed to read; all = the whole catalogue" });
    add("writer", "writer", "writer.read", "read",
      Array.isArray(w.skills_read) ? (w.skills_read.join(", ") || "none") : "",
      { title: "the skills it actually opened while writing" });
    add("writer", "writer", "writer.shots", "shots",
      w.max_shots ? w.max_shots : (w.max_shots === 0 ? "style decides" : ""),
      { number: Number(w.max_shots) || 0, title: "the most [Shot] blocks the writer was allowed" });
    add("writer", "writer", "writer.camera_amplitude", "move size",
      "camera_amplitude" in w ? (w.camera_amplitude || "auto") : "");
    add("writer", "writer", "writer.camera_speed", "move speed",
      "camera_speed" in w ? (w.camera_speed || "auto") : "");
    add("writer", "writer", "writer.music", "music",
      typeof w.music === "boolean" ? (w.music ? "yes" : "no") : "",
      { title: "whether the writer was told to score the clip" });
  }
  add("words", "script & prompt", "script", "script", made.script, { long: true });
  add("words", "script & prompt", "prompt", "prompt", made.prompt, { long: true });
  return out;
}
function stampOf(ms) {
  const at = new Date(ms);
  if (!Number.isFinite(at.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} `
    + `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}
function takeIdOf(root, folder, file) {
  const project = String(root || "").replace(/[\\/]+$/, "").split(/[\\/]/).pop() || "";
  const stem = String(file || "").replace(/\.[^.]+$/, "");
  return [project, folder, stem].filter(Boolean).join("/");
}
function withCreated(take) {
  const made = { ...((take && take.made) || {}) };
  const stamp = String(made.saved || "");
  const told = stamp ? Date.parse(stamp.replace(" ", "T")) : NaN;
  const ms = Number.isFinite(told) ? told : Number(take.modified) * 1000;
  made.created = stamp || stampOf(ms);
  made.created_at = Number.isFinite(ms) ? ms : 0;
  return made;
}
function hasRecord(made) {
  return Object.keys(made || {}).some((key) => key !== "created" && key !== "created_at");
}
function shapeOf(made) {
  const s = (made && made.settings) || {};
  const w = Number(s.width);
  const h = Number(s.height);
  return w > 0 && h > 0 ? `${w} / ${h}` : "";
}
function followShape(video) {
  video.addEventListener("loadedmetadata", () => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      video.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
    }
  }, { once: true });
}
function factMap(made) {
  return new Map(facts(made || {}).filter((f) => !f.ignore).map((f) => [f.key, f]));
}
function differingKeys(list) {
  const values = new Map();
  const carried = new Map();
  for (const take of list) {
    for (const [key, fact] of factMap((take || {}).made)) {
      if (!values.has(key)) values.set(key, new Set());
      values.get(key).add(fact.value);
      carried.set(key, (carried.get(key) || 0) + 1);
    }
  }
  const out = new Set();
  for (const [key, set] of values) {
    if (set.size > 1 || carried.get(key) !== list.length) out.add(key);
  }
  return out;
}
function captionFor(made, other) {
  const plain = `seed ${made.seed ?? "?"}${made.steps ? ` · ${made.steps} steps` : ""}`;
  if (!other || !hasRecord(other) || !hasRecord(made)) return plain;
  const mine = factMap(made);
  const theirs = factMap(other);
  const keys = [...new Set([...mine.keys(), ...theirs.keys()])].filter(
    (key) => (mine.get(key) || {}).value !== (theirs.get(key) || {}).value,
  );
  if (!keys.length) return `${plain} · same settings as the other window`;
  return keys
    .map((key) => {
      const fact = mine.get(key) || theirs.get(key);
      const value = mine.has(key) ? mine.get(key).value : "—";
      return value.length > 24 ? `${fact.label} differs` : `${fact.label} ${value}`;
    })
    .join(" · ");
}
function chainState(take, index) {
  const said = [take.follows, take.precedes];
  if (said.some((v) => v === false)) {
    return {
      className: "stray",
      title:
        "Not part of the cut as it stands: this take was rendered against a " +
        "different neighbour, hand-over point, opening image or settings.",
    };
  }
  const words = [];
  if (take.follows === true) words.push(`continues clip ${index}`);
  if (take.precedes === true) words.push(`prehistory of clip ${index + 2}`);
  if (!words.length) return { className: "", title: "", tags: [] };
  return {
    className: "follows",
    tags: words,
    title: `${words.join(" and ")} — joins the cut as it stands.`,
  };
}
export function openTakesGallery({
  root, index, id, name, title, board, onChoose, onMessage, onClosed,
}) {
  let putJustNow = null;
  const boardNow = () => (typeof board === "function" ? board() : board);
  const segOnBoard = () => {
    let read = boardNow();
    if (typeof read === "string") {
      try {
        read = JSON.parse(read);
      } catch (err) {
        read = null;
      }
    }
    const segs = (read && read.segments) || [];
    return segs.find((seg) => seg.id === id) || segs[index] || null;
  };
  const heldTake = () => {
    if (putJustNow) return takes.find((take) => take.file === putJustNow) || null;
    const onBoard = segOnBoard();
    if (!onBoard) return null;
    const heldName = String(onBoard.clip || "").split(/[\\/]/).pop();
    const byName = heldName && takes.find((take) => take.file === heldName);
    if (byName) return byName;
    const key = String(onBoard.cache_key || "");
    if (!key) return null;
    const same = takes.filter((take) => String((take.made || {}).cache_key || "") === key);
    if (!same.length) return null;
    const when = (take) => withCreated(take).created_at;
    return same.reduce((best, take) => (when(take) > when(best) ? take : best));
  };
  const heldByBoard = (take) => {
    const held = heldTake();
    return !!held && !!take && take.file === held.file;
  };
  const onTimelineFile = () => (takes.find(heldByBoard) || {}).file || "";
  const filedAfterTheTimeline = (take) => {
    if (!take || heldByBoard(take)) return false;
    const held = takes.find(heldByBoard);
    const mark = String(((held || {}).made || {}).saved || "");
    const mine = String(((take || {}).made || {}).saved || "");
    return !!mark && !!mine && mine > mark;
  };
  let heard = null;
  let lastSaid = null;
  const paintSaid = () => {
    if (!heard || !lastSaid) return;
    heard.textContent = lastSaid.text;
    heard.className = `vig-takes-said${lastSaid.kind === "error" ? " bad" : ""}`;
  };
  const say = (text, kind) => {
    if (typeof onMessage === "function") onMessage(text, kind || "info");
    lastSaid = { text, kind };
    paintSaid();
  };
  const sayHere = (text) => {
    lastSaid = { text, kind: "info" };
    paintSaid();
  };
  function askInGallery(title, body, okLabel = "Yes", cancelLabel = "Cancel") {
    return new Promise((resolve) => {
      const layer = el("div", "vig-takes-ask");
      const box = el("div", "vig-takes-askbox");
      const text = el("div", "vig-takes-asktext", body);
      const row = el("div", "vig-takes-askrow");
      const no = el("button", "vig-cutter-ghost", cancelLabel);
      const yes = el("button", "vig-cutter-primary", okLabel);
      const done = (answer) => { layer.remove(); document.removeEventListener("keydown", onKey, true); resolve(answer); };
      function onKey(event) {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        done(false);
      }
      document.addEventListener("keydown", onKey, true);
      no.addEventListener("click", () => done(false));
      yes.addEventListener("click", () => done(true));
      layer.addEventListener("mousedown", (event) => { if (event.target === layer) done(false); });
      row.append(no, yes);
      box.append(el("div", "vig-takes-subhead", title), text, row);
      layer.appendChild(box);
      overlay.appendChild(layer);
      yes.focus();
    });
  }
  function releaseFile(file) {
    for (const video of overlay.querySelectorAll("video")) {
      if (!decodeURIComponent(video.src || "").includes(file)) continue;
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
  }
  if (!root) {
    say("This board has no project folder, so nothing has been kept. Set one in section 1.", "error");
    return null;
  }
  let takes = [];
  let focused = null;
  let slotA = null;
  let slotB = null;
  let tableOn = false;
  let rowKey = null;
  let colKey = null;
  const ALL_IN_ONE = "@all";
  let sideOpen = false;
  let showSide = () => {};
  let axesByHand = false;
  const SIZE_PREF = "vig.h3.takes.matrix.size";
  const TAKE_SIZES = [
    { px: 96, label: "S" },
    { px: 132, label: "M" },
    { px: 190, label: "L" },
    { px: 280, label: "XL" },
  ];
  let takeSize = (() => {
    try {
      const had = Number(window.localStorage.getItem(SIZE_PREF));
      return TAKE_SIZES.some((one) => one.px === had) ? had : 132;
    } catch (err) {
      return 132;
    }
  })();
  let cellKey = null;
  let tableBuilt = null;
  let sortKey = "created";
  let sortDown = false;
  let filters = [];
  let filterMode = "all";
  const expanded = {};
  const openGroups = {};
  let justOpened = null;
  let pendingNudge = null;
  const BLUR_PREF = "vig.h3.takes.blur";
  const ORDER_PREF = "vig.h3.takes.order";
  const remembered = (() => {
    try {
      return window.localStorage.getItem(BLUR_PREF) === "1";
    } catch (err) {
      return false;
    }
  })();
  let blurAll = remembered;
  const peeked = new Set();
  const veiled = new Set();
  const isVeiled = (file) => (blurAll ? !peeked.has(file) : veiled.has(file));
  const flipVeil = (file) => {
    const set = blurAll ? peeked : veiled;
    if (set.has(file)) set.delete(file);
    else set.add(file);
  };
  let ahead = {};
  let behind = {};
  let cardVeils = [];
  let playerVeil = null;
  let playerJudge = null;
  const cardPaints = new Map();
  let gridKeys = null;
  const paintCards = () => {
    for (const paint of cardPaints.values()) paint();
  };
  const paintMode = () => {
    body.style.display = comparing() || tableOn ? "none" : "";
    if (tableOn) drawTable();
    paintCount(count, ICONS.clapper, countNow());
    drawMenu();
    drawCompare();
  };
  const paintVeils = () => {
    for (const paint of cardVeils) paint();
    for (const paint of windowVeils) paint();
    if (playerVeil) playerVeil();
  };
  function matches(take) {
    if (!filters.length) return true;
    const mine = factMap((take || {}).made);
    const hit = (f) => (mine.get(f.key) || {}).value === f.value;
    return filterMode === "all" ? filters.every(hit) : filters.some(hit);
  }
  const shown = () => ordered(takes.filter(matches));
  function toggleFilter(fact) {
    const at = filters.findIndex((f) => f.key === fact.key && f.value === fact.value);
    if (at >= 0) filters.splice(at, 1);
    else {
      if (filterMode === "all") filters = filters.filter((f) => f.key !== fact.key);
      filters.push({ key: fact.key, label: fact.label, value: fact.value });
    }
    draw();
  }
  const SORT_ORDERS = [
    { key: "created", label: "created" },
    { key: "length", label: "length" },
    { key: "made_in", label: "render time" },
    { key: "@rating", label: "rating" },
  ];
  try {
    const kept = JSON.parse(window.localStorage.getItem(ORDER_PREF) || "null");
    if (kept && SORT_ORDERS.some((one) => one.key === kept.key)) {
      sortKey = kept.key;
      sortDown = !!kept.down;
    }
  } catch (err) {
  }
  function rememberOrder() {
    try {
      window.localStorage.setItem(ORDER_PREF, JSON.stringify({ key: sortKey, down: sortDown }));
    } catch (err) {
    }
  }
  function sortValue(take, key) {
    if (key === "@rating") return { value: "", order: take.rating || 0, missing: false };
    return axisValue(take, key);
  }
  function ordered(list) {
    if (!sortKey) return sortDown ? [...list].reverse() : list;
    const dir = sortDown ? -1 : 1;
    return list
      .map((take, at) => ({ take, at, v: sortValue(take, sortKey) }))
      .sort((a, b) => {
        if (a.v.missing !== b.v.missing) return a.v.missing ? 1 : -1;
        const numeric = Number.isFinite(a.v.order) && Number.isFinite(b.v.order);
        const out = numeric
          ? a.v.order - b.v.order
          : String(a.v.value).localeCompare(String(b.v.value), undefined, { numeric: true });
        return out * dir || a.at - b.at;
      })
      .map((one) => one.take);
  }
  const overlay = el("div", "vig-takes-overlay");
  overlay.classList.add(SCHEME_CLASS);
  const sheet = el("div", "vig-takes-sheet");
  overlay.appendChild(sheet);
  const head = el("div", "vig-takes-head");
  const heading = el("div", "vig-takes-title", title || `Clip ${index + 1}`);
  const count = el("span", "vig-takes-count", "");
  heading.appendChild(count);
  const menu = el("div", "vig-takes-menu");
  const order = el("div", "vig-takes-order");
  const veilHold = el("div", "vig-takes-veilhold");
  const body = el("div", "vig-takes-body");
  const grid = el("div", "vig-takes-grid");
  const side = el("div", "vig-takes-side");
  body.append(grid, side);
  head.append(heading, order, veilHold, el("div", "vig-takes-spring"), menu);
  const bar = el("div", "vig-takes-bar");
  const compare = el("div", "vig-takes-compare");
  const table = el("div", "vig-takes-table");
  const foot = el("div", "vig-takes-foot");
  sheet.append(head, bar, compare, table, body, foot);
  function shut() {
    for (const video of overlay.querySelectorAll("video")) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    overlay.remove();
    document.removeEventListener("keydown", onKey);
    if (typeof onClosed === "function") onClosed();
  }
  function onKey(event) {
    if (event.key === "Escape") shut();
  }
  document.addEventListener("keydown", onKey);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) shut();
  });
  async function judge(file, patch) {
    try {
      await post(JUDGE_ROUTE, { path: root, index, id, name, file, ...patch });
      await load();
    } catch (error) {
      say(`could not save that: ${error.message}`, "error");
    }
  }
  function slotButton(take, label, extra = "") {
    const get = () => (label === "A" ? slotA : slotB);
    const button = el("button", `vig-takes-slot${extra ? ` ${extra}` : ""}`, label);
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const now = get() === take.file ? null : take.file;
      if (label === "A") slotA = now;
      else slotB = now;
      paintCards();
      paintSlots();
      paintMode();
    });
    button.paint = () => {
      const on = get() === take.file;
      const twin = (label === "A" ? slotB : slotA) === take.file;
      button.className = `vig-takes-slot${extra ? ` ${extra}` : ""}`
        + `${on ? " on" : ""}${twin ? " twin" : ""}`;
      button.disabled = twin;
      button.title = twin
        ? `This take is already ${label === "A" ? "B" : "A"} — a take cannot be ` +
          "compared with itself. Pick another one, or press the lit button to " +
          "let this one go."
        : on
          ? `${label} is this take. Press again to unpick it.`
          : (slotA || slotB)
            ? `Compare this take as ${label} against the one already picked.`
            : `Pick this take as ${label}, then pick another to compare it with.`;
    };
    button.paint();
    return button;
  }
  const paintSlots = () => {
    for (const button of table.querySelectorAll(".vig-takes-slot")) {
      if (typeof button.paint === "function") button.paint();
    }
  };
  function starRow(file, row) {
    row.textContent = "";
    const rating = ((takes.find((t) => t.file === file) || {}).rating) || 0;
    for (let n = 1; n <= MAX_RATING; n += 1) {
      const star = el("button", "vig-takes-star", n <= rating ? "★" : "☆");
      star.title =
        n === rating
          ? "Click again to clear this rating (0 is never swept)"
          : `Rate ${n} of ${MAX_RATING}`;
      if (n <= rating) star.classList.add("on");
      star.addEventListener("click", (event) => {
        event.stopPropagation();
        judge(file, { rating: n === rating ? 0 : n });
      });
      row.appendChild(star);
    }
    return row;
  }
  function openPlayer(take) {
    const layer = el("div", "vig-takes-player");
    const frame = el("div", "vig-takes-playframe");
    const stage = el("div", "vig-takes-stage");
    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    video.muted = false;
    const bar = el("div", "vig-takes-playbar");
    const caption = el("span", "");
    bar.appendChild(caption);
    let list = shown();
    let at = Math.max(0, list.findIndex((t) => t.file === take.file));
    const show = (i) => {
      list = shown();
      if (i < 0 || i >= list.length) return;
      at = i;
      const playing = list[at];
      const made = playing.made || {};
      video.src = takeUrl(root, playing.folder, playing.file);
      video.play().catch(() => {});
      caption.textContent =
        `${playing.file}  ·  seed ${made.seed ?? "?"}` +
        `${made.steps ? ` · ${made.steps} steps` : ""}` +
        (list.length > 1 ? `  ·  ${at + 1} of ${list.length}` : "");
      prev.disabled = at === 0;
      next.disabled = at === list.length - 1;
      paintPlayerVeil();
      buildJudgement();
      focused = playing.file;
      paintFocus();
    };
    const verdict = el("div", "vig-takes-playjudge");
    let badge = null;
    function buildJudgement() {
      const playing = list[at];
      if (!playing) return;
      verdict.textContent = "";
      badge = putButton(playing);
      verdict.append(starRow(playing.file, el("div", "vig-takes-stars")), badge);
    }
    function paintJudgement() {
      const playing = list[at];
      if (!playing) return;
      const stars = verdict.querySelector(".vig-takes-stars");
      if (stars) starRow(playing.file, stars);
      if (badge) badge.paint();
    }
    function paintPlayerVeil() {
      const playing = list[at];
      if (!playing) return;
      const hidden = isVeiled(playing.file);
      video.classList.toggle("veiled", hidden);
      eye.textContent = "";
      eye.appendChild(eyeIcon(!hidden));
      eye.title = hidden ? "Show this take" : "Cover this take";
    }
    const step = (delta, glyph, title) => {
      const button = el("button", "vig-takes-step", glyph);
      button.title = title;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        show(at + delta);
      });
      return button;
    };
    const prev = step(-1, "‹", "Previous take (the one to the left in the grid)");
    const next = step(1, "›", "Next take (the one to the right in the grid)");
    const shutPlayer = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      playerVeil = null;
      playerJudge = null;
      layer.remove();
      document.removeEventListener("keydown", onPlayerKey, true);
    };
    function onPlayerKey(event) {
      if (event.key === "Escape") {
        event.stopPropagation();
        shutPlayer();
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      if (event.target === video) return;
      event.stopPropagation();
      event.preventDefault();
      show(at + (event.key === "ArrowRight" ? 1 : -1));
    }
    document.addEventListener("keydown", onPlayerKey, true);
    const closeBtn = el("button", "vig-cutter-ghost", "✕ Close");
    closeBtn.addEventListener("click", shutPlayer);
    const eye = el("button", "vig-takes-menubtn veil");
    eye.addEventListener("click", (event) => {
      event.stopPropagation();
      flipVeil(list[at].file);
      paintVeils();
    });
    bar.append(el("div", "vig-takes-spring"), verdict, eye, closeBtn);
    layer.addEventListener("mousedown", (event) => {
      if (event.target === layer) shutPlayer();
    });
    const hold = el("div", "vig-takes-playhold");
    hold.appendChild(video);
    stage.append(prev, hold, next);
    frame.append(stage, bar);
    layer.appendChild(frame);
    overlay.appendChild(layer);
    playerVeil = paintPlayerVeil;
    playerJudge = paintJudgement;
    show(at);
  }
  function putButton(take) {
    const choose = el("button", "vig-takes-put");
    choose.dataset.log = "put on timeline";
    choose.paint = () => {
      const fresh = takes.find((t) => t.file === take.file) || take;
      const onTimeline = heldByBoard(fresh);
      choose.className = `vig-takes-put${onTimeline ? " on" : ""}`;
      choose.textContent = onTimeline ? "on timeline" : "put on timeline";
      choose.title = onTimeline
        ? "This take is the clip the timeline plays. It cannot be deleted or " +
          "swept while it is -- put another take on the timeline first."
        : "Make this take the clip on the timeline: its video becomes the one " +
          "the console plays, and its seed and prompt go back on the board. " +
          "A take on the timeline is never swept, whatever its rating.";
      choose.disabled = !!onTimeline;
    };
    choose.paint();
    choose.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (heldByBoard(take)) return;
      choose.disabled = true;
      choose.textContent = "putting…";
      try {
        const adopted = await post(ADOPT_ROUTE, { path: root, index, id, name, file: take.file });
        putJustNow = take.file;
        await load();
        if (typeof onChoose === "function") onChoose({ ...take, clip: adopted.clip });
      } catch (error) {
        say(`could not put that on the timeline: ${error.message}`, "error");
        draw();
      }
    });
    return choose;
  }
  function card(take) {
    const mineNow = () => takes.find((t) => t.file === take.file) || take;
    const box = el("div", "vig-takes-card");
    box.dataset.file = take.file;
    if (take.file === focused) box.classList.add("focused");
    const chain = chainState(take, index);
    if (chain.className) {
      box.classList.add(chain.className);
      box.title = chain.title;
    }
    const frame = el("div", "vig-takes-frame");
    const video = document.createElement("video");
    video.className = "vig-takes-video";
    const shape = shapeOf(take.made);
    if (shape) video.style.aspectRatio = shape;
    followShape(video);
    video.src = takeUrl(root, take.folder, take.file);
    video.muted = true;
    video.loop = true;
    video.preload = "metadata";
    video.addEventListener("mouseenter", () => video.play().catch(() => {}));
    video.addEventListener("mouseleave", () => video.pause());
    video.style.cursor = "pointer";
    video.title = (chain.title ? `${chain.title}\n\n` : "")
      + "Click to watch this take full size, with sound.";
    video.addEventListener("click", (event) => {
      event.stopPropagation();
      focused = take.file;
      paintFocus();
      openPlayer(take);
    });
    frame.appendChild(video);
    box.appendChild(frame);
    const eye = el("button", "vig-takes-corner peek");
    const paintVeil = () => {
      const hidden = isVeiled(take.file);
      video.classList.toggle("veiled", hidden);
      box.classList.toggle("veiled", hidden);
      const note = frame.querySelector(".vig-takes-veilnote");
      if (hidden && !note) frame.appendChild(el("div", "vig-takes-veilnote", "covered"));
      if (!hidden && note) note.remove();
      eye.textContent = "";
      eye.appendChild(eyeIcon(!hidden));
      eye.title = hidden ? "Show this take" : "Cover this take";
    };
    paintVeil();
    cardVeils.push(paintVeil);
    eye.addEventListener("click", (event) => {
      event.stopPropagation();
      flipVeil(take.file);
      paintVeils();
    });
    box.appendChild(eye);
    const onTimeline = heldByBoard(take);
    const killIcon = el("button", "vig-takes-corner kill");
    killIcon.disabled = onTimeline;
    killIcon.title = onTimeline
      ? "The clip the timeline plays — put another take on the timeline first"
      : "Delete this take from the disk";
    killIcon.appendChild(trashIcon());
    killIcon.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (onTimeline) return;
      if (!(await askInGallery(
        "Delete this take",
        `${take.file}\n\nThe video and its paperwork go. This cannot be undone.`,
        "Delete", "Cancel",
      ))) return;
      releaseFile(take.file);
      try {
        await post(DELETE_ROUTE, {
          path: root, index, id, name, file: take.file, confirm: true,
          keep: onTimelineFile(),
        });
        if (focused === take.file) focused = null;
        if (slotA === take.file) slotA = null;
        if (slotB === take.file) slotB = null;
        say(`deleted ${take.file}`, "info");
      } catch (error) {
        say(`could not delete that: ${error.message}`, "error");
      }
      await load();
    });
    box.appendChild(killIcon);
    const made = take.made || {};
    const line = el("div", "vig-takes-line");
    const ran = made.delivered_frames || made.frames || 0;
    if (made.steps) {
      line.appendChild(el("span", "vig-takes-tag steps", `${made.steps}st`));
    }
    if (ran) {
      const secs = (ran / FPS).toFixed(1).replace(/\.0$/, "");
      line.appendChild(el("span", "vig-takes-tag secs", `${secs}s`));
    }
    if (made.batch_variant) line.appendChild(el("span", "vig-takes-tag", "batch"));
    const fresh = el("span", "vig-takes-tag new", "new");
    if (!filedAfterTheTimeline(take)) fresh.style.display = "none";
    fresh.title =
      "Rendered since the take the timeline is playing, and not chosen yet — " +
      "press “put on timeline” to make it the one the film plays.";
    line.appendChild(fresh);
    const plus = el("button", "vig-takes-plus", "+");
    if (!(ahead.key || behind.file)) plus.style.display = "none";
    plus.addEventListener("click", (event) => {
      event.stopPropagation();
      openLinkMenu(plus, takes.find((t) => t.file === take.file) || take);
    });
    const chainHold = el("span", "vig-takes-chain");
    const paintChain = (state) => {
      chainHold.textContent = "";
      for (const word of state.tags || []) {
        const chip = el("span", "vig-takes-tag follows", word);
        chip.title = mineNow().by_hand
          ? "Set by hand: the director said so, whatever the keys say. "
            + "Press + to change it."
          : (state.title || "");
        chainHold.appendChild(chip);
      }
      chainHold.appendChild(plus);
    };
    paintChain(chain);
    line.appendChild(chainHold);
    box.appendChild(line);
    const stars = el("div", "vig-takes-stars");
    starRow(take.file, stars);
    box.appendChild(stars);
    const actions = el("div", "vig-takes-actions");
    const pickA = slotButton(take, "A");
    const pickB = slotButton(take, "B");
    const choose = putButton(take);
    actions.append(pickA, pickB, choose);
    const spentAll = made.spent && Number(made.spent.sampled)
      ? Number(made.spent.sampled) + Number(made.spent.decoded || 0) : 0;
    if (spentAll) {
      const cost = el("span", "vig-takes-tag time", `${Math.round(spentAll)} s`);
      cost.title = `render time ${spentAll.toFixed(1)} s: sampled `
        + `${Number(made.spent.sampled).toFixed(1)} s`
        + (made.spent.decoded ? ` + decoded ${Number(made.spent.decoded).toFixed(1)} s` : "");
      actions.appendChild(cost);
    }
    box.appendChild(actions);
    box.addEventListener("click", () => {
      if (focused === take.file) return;
      focused = take.file;
      paintFocus();
    });
    cardPaints.set(take.file, () => {
      const mine = takes.find((t) => t.file === take.file) || take;
      const chainNow = chainState(mine, index);
      box.className = `vig-takes-card${take.file === focused ? " focused" : ""}` +
        `${chainNow.className ? ` ${chainNow.className}` : ""}`;
      box.title = chainNow.title || "";
      paintVeil();
      starRow(take.file, stars);
      pickA.paint();
      pickB.paint();
      choose.paint();
      paintChain(chainNow);
      const canSay = !!ahead.key || !!behind.file;
      plus.style.display = canSay ? "" : "none";
      plus.title = canSay
        ? (mine.by_hand
            ? "You set where this take sits. Press to change it."
            : "Say where this take sits: what it continues, or what it is the "
              + "prehistory of")
        : "";
      fresh.style.display = filedAfterTheTimeline(mine) ? "" : "none";
      const held = heldByBoard(mine);
      killIcon.disabled = held;
      killIcon.title = held
        ? "The clip the timeline plays — put another take on the timeline first"
        : "Delete this take from the disk";
    });
    return box;
  }
  function valuesOf(key) {
    const seen = [];
    for (const take of takes) {
      const value = (factMap((take || {}).made).get(key) || {}).value;
      if (value !== undefined && !seen.includes(value)) seen.push(value);
    }
    return seen;
  }
  function drawGroups(host, columns, differs, list, redraw) {
    const made = columns[0].made || {};
    const pair = columns.length > 1;
    const byGroup = new Map();
    const named = new Map();
    const mine = new Set();
    for (const fact of facts(made)) {
      if (!byGroup.has(fact.group)) byGroup.set(fact.group, []);
      byGroup.get(fact.group).push(fact);
      named.set(fact.group, fact.heading);
      mine.add(fact.key);
    }
    for (const key of differs) {
      if (mine.has(key)) continue;
      let template = null;
      for (const take of list) {
        template = factMap((take || {}).made).get(key);
        if (template) break;
      }
      if (!template) continue;
      if (!byGroup.has(template.group)) byGroup.set(template.group, []);
      named.set(template.group, template.heading);
      byGroup.get(template.group).push({
        ...template, value: "—", absent: true,
        title: `Not recorded for this take. Others have ${template.label} = ${template.value}.`,
      });
    }
    const order = [...byGroup.keys()].map((gid, at) => {
      const rows = byGroup.get(gid);
      return { gid, at, hot: rows.filter((f) => differs.has(f.key)).length };
    });
    order.sort((one, two) => (two.hot > 0) - (one.hot > 0) || one.at - two.at);
    for (const { gid } of order) {
      const glabel = named.get(gid) || gid;
      const rows = byGroup.get(gid) || [];
      if (!rows.length) continue;
      const hot = rows.filter((f) => differs.has(f.key));
      const held = !pair && rows.some((f) => filters.some((x) => x.key === f.key));
      const open = gid in openGroups ? openGroups[gid] : (hot.length > 0 || held);
      const header = el("button", `vig-takes-group${open ? " open" : ""}`);
      header.append(
        el("span", "caret", open ? "▾" : "▸"),
        el("span", "name", glabel),
        el("span", `tally${hot.length ? " hot" : ""}`,
           hot.length
             ? `${hot.length} differ${hot.length === 1 ? "s" : ""}`
             : `${rows.length}`),
      );
      const across = pair ? "between these two takes" : "across the takes on screen";
      header.title = hot.length
        ? `${hot.length} of these ${rows.length} differ ${across}.`
        : held
          ? "A filter is set on one of these, so the group stays open — its " +
            "row is where the filter came off again."
          : `Nothing here differs ${across} — ${rows.length} ` +
            "setting(s), all the same. Press to read them anyway." +
            (gid === "accel" ? "\n\nListed in the order they patched the model." : "");
      header.addEventListener("click", (event) => {
        event.stopPropagation();
        openGroups[gid] = !open;
        justOpened = openGroups[gid] ? gid : null;
        redraw();
      });
      host.appendChild(header);
      if (!open) continue;
      const whole = expanded[gid] || !hot.length;
      const table = el("div", "vig-takes-params");
      for (const fact of whole ? rows : hot) {
        table.appendChild(pair ? compareRow(fact, columns, differs) : paramRow(fact, differs));
      }
      if (hot.length && hot.length < rows.length) {
        const rest = rows.length - hot.length;
        const more = el("button", "vig-takes-more",
                        whole ? "less" : `+${rest} more`);
        more.title = whole
          ? `Back to the ${hot.length} that differ.`
          : `Show the other ${rest} setting${rest === 1 ? "" : "s"} in this ` +
            "group — the ones that are the same.";
        more.addEventListener("click", (event) => {
          event.stopPropagation();
          expanded[gid] = !whole;
          justOpened = expanded[gid] ? gid : null;
          redraw();
        });
        table.appendChild(more);
      }
      host.appendChild(table);
      if (justOpened === gid) {
        justOpened = null;
        pendingNudge = table;
      }
    }
  }
  function settleNudge() {
    if (!pendingNudge) return;
    pendingNudge.scrollIntoView({ block: "nearest" });
    pendingNudge = null;
  }
  function scrollAsOne(one, two) {
    let driver = null;
    let release = null;
    const follow = (from, to) => () => {
      if (driver && driver !== from) return;
      driver = from;
      to.scrollTop = from.scrollTop;
      to.scrollLeft = from.scrollLeft;
      clearTimeout(release);
      release = setTimeout(() => { driver = null; }, 120);
    };
    one.addEventListener("scroll", follow(one, two));
    two.addEventListener("scroll", follow(two, one));
  }
  function compareRow(fact, columns, differs) {
    const row = el("div", `vig-takes-cmprow${differs.has(fact.key) ? " differs" : ""}`);
    const key = keyLabel(fact.label);
    if (fact.title) key.title = fact.title;
    row.appendChild(key);
    const words = [];
    for (const column of columns) {
      const found = factMap(column.made).get(fact.key);
      const value = found ? found.value : "—";
      const cell = fact.long && found
        ? el("pre", "vig-takes-cmptext", value)
        : el("span", `vig-takes-cmpval${found ? "" : " absent"}`, value);
      if (!found) cell.title = `Not recorded for take ${column.label}.`;
      if (fact.long && found) words.push(cell);
      row.appendChild(cell);
    }
    if (words.length === 2) scrollAsOne(words[0], words[1]);
    return row;
  }
  function paramRow(fact, differs) {
    const holder = el("div", "vig-takes-paramholder");
    const row = el(
      "div",
      `vig-takes-param${differs.has(fact.key) ? " differs" : ""}` +
        `${fact.absent ? " absent" : ""}`,
    );
    const key = keyLabel(fact.label);
    if (fact.title) key.title = fact.title;
    let funnelHost = row;
    if (fact.long) {
      row.classList.add("long");
      const head = el("div", "vig-takes-longhead");
      head.appendChild(key);
      row.append(head, el("pre", "vig-takes-text", fact.value));
      funnelHost = head;
    } else {
      row.append(key, el("span", "vig-takes-val", fact.value));
    }
    if (!fact.ignore && !fact.absent) {
      const on = filters.some((f) => f.key === fact.key && f.value === fact.value);
      const funnel = el("button", `vig-takes-filter${on ? " on" : ""}`);
      funnel.appendChild(funnelIcon());
      funnel.title = on
        ? `Stop keeping only the takes whose ${fact.label} is this`
        : `Keep only the takes whose ${fact.label} is ` +
          `${fact.long ? "this one" : fact.value}`;
      funnel.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFilter(fact);
      });
      funnelHost.appendChild(funnel);
    }
    holder.appendChild(row);
    if (!fact.ignore && filters.some((f) => f.key === fact.key)) {
      const others = valuesOf(fact.key).filter(
        (value) => !filters.some((f) => f.key === fact.key && f.value === value),
      );
      if (others.length) {
        const also = el("div", "vig-takes-also");
        also.appendChild(el("span", "lead", filterMode === "all" ? "instead:" : "also:"));
        for (const value of others) {
          const pill = el("button", "vig-takes-pill",
                          value.length > 22 ? `${value.slice(0, 21)}…` : value);
          pill.title = filterMode === "all"
            ? `Show the takes whose ${fact.label} is ${value} instead of these`
            : `Add the takes whose ${fact.label} is ${value} to these`;
          pill.addEventListener("click", (event) => {
            event.stopPropagation();
            toggleFilter({ key: fact.key, label: fact.label, value });
          });
          also.appendChild(pill);
        }
        holder.appendChild(also);
      }
    }
    return holder;
  }
  function paintFocus() {
    for (const box of grid.querySelectorAll(".vig-takes-card")) {
      box.classList.toggle("focused", box.dataset.file === focused);
    }
    drawSide();
  }
  function drawSide() {
    const wasAt = side.scrollTop;
    side.textContent = "";
    const list = shown();
    const take = list.find((t) => t.file === focused) || list[0] || takes[0];
    if (!take) return;
    side.appendChild(el("div", "vig-takes-subhead", "settings"));
    const made = take.made || {};
    if (!hasRecord(made)) {
      side.appendChild(
        el(
          "div",
          "vig-takes-empty",
          "No paperwork beside this take — it predates the record, or was copied " +
            "in by hand. The file plays; its settings are not known.",
        ),
      );
    }
    const differs = list.length > 1 ? differingKeys(list) : new Set();
    side.appendChild(el(
      "div", "vig-takes-hint",
      list.length < 2
        ? "one take — nothing to compare"
        : differs.size
          ? `${differs.size} differ${differs.size === 1 ? "s" : ""} across ${list.length} takes`
          : `all the same across ${list.length} takes`,
    ));
    drawGroups(side, [{ label: "", made }], differs, list, drawSide);
    side.appendChild(el("div", "vig-takes-subhead", "file"));
    side.appendChild(el("div", "vig-takes-file", take.file));
    side.scrollTop = wasAt;
    settleNudge();
  }
  const comparing = () => !!(slotA && slotB);
  let builtFrom = "";
  let linked = true;
  const windows = el("div", "vig-takes-cmpwindows");
  const players = () => [...windows.querySelectorAll("video")];
  let windowVeils = [];
  const leaveCompare = () => {
    for (const video of players()) video.pause();
    slotA = null;
    slotB = null;
    draw();
  };
  const transport = el("div", "vig-takes-transport");
  const cmpFacts = el("div", "vig-takes-cmpfacts");
  function compareColumns() {
    const held = (file) => takes.find((t) => t.file === file) || null;
    return [
      { label: "A", file: slotA, take: held(slotA) },
      { label: "B", file: slotB, take: held(slotB) },
    ].map((column) => ({ ...column, made: (column.take && column.take.made) || {} }));
  }
  function drawCompare() {
    if (!comparing()) {
      compare.style.display = "none";
      compare.textContent = "";
      builtFrom = "";
      return;
    }
    compare.style.display = "flex";
    const columns = compareColumns();
    if (columns.some((column) => !column.take)) {
      slotA = columns[0].take ? slotA : null;
      slotB = columns[1].take ? slotB : null;
      compare.style.display = "none";
      compare.textContent = "";
      builtFrom = "";
      return;
    }
    if (`${slotA}|${slotB}` !== builtFrom) {
      drawCompareWindows(columns);
      builtFrom = `${slotA}|${slotB}`;
      compare.textContent = "";
      compare.append(windows, transport, cmpFacts);
    }
    for (const badge of windows.querySelectorAll(".vig-takes-put")) badge.paint();
    for (const paintVeil of windowVeils) paintVeil();
    drawCompareFacts();
  }
  function linkPlayers(pair) {
    if (pair.length !== 2) return;
    let driver = null;
    let release = null;
    const hand = (from) => {
      if (!linked) return false;
      if (driver && driver !== from) return false;
      driver = from;
      clearTimeout(release);
      release = setTimeout(() => { driver = null; }, 160);
      return true;
    };
    const follow = (from, to) => {
      from.addEventListener("seeked", () => {
        if (!hand(from)) return;
        if (Math.abs(to.currentTime - from.currentTime) > 0.04) {
          to.currentTime = from.currentTime;
        }
      });
      from.addEventListener("play", () => { if (hand(from)) to.play().catch(() => {}); });
      from.addEventListener("pause", () => { if (hand(from)) to.pause(); });
    };
    follow(pair[0], pair[1]);
    follow(pair[1], pair[0]);
  }
  function drawCompareWindows(columns) {
    windows.textContent = "";
    windowVeils = [];
    for (const column of columns) {
      const pane = el("div", "vig-takes-pane");
      const capRow = el("div", "vig-takes-cap");
      const tag = el("button", "vig-takes-caplabel", column.label);
      tag.title = `Drop ${column.label} and go back to the grid — ` +
        `${column.label === "A" ? "B" : "A"} stays picked.`;
      tag.addEventListener("click", (event) => {
        event.stopPropagation();
        if (column.label === "A") slotA = null;
        else slotB = null;
        draw();
      });
      capRow.append(tag, el("span", "vig-takes-capfile", column.file));
      const hold = el("div", "vig-takes-cmphold");
      const video = document.createElement("video");
      video.className = `vig-takes-bigvideo${isVeiled(column.file) ? " veiled" : ""}`;
      video.src = takeUrl(root, column.take.folder, column.file);
      video.controls = true;
      video.loop = true;
      hold.appendChild(video);
      if (isVeiled(column.file)) hold.appendChild(el("div", "vig-takes-veilnote", "covered"));
      const eye = el("button", "vig-takes-corner peek");
      const paintVeil = () => {
        const hidden = isVeiled(column.file);
        video.classList.toggle("veiled", hidden);
        hold.classList.toggle("veiled", hidden);
        const note = hold.querySelector(".vig-takes-veilnote");
        if (hidden && !note) hold.appendChild(el("div", "vig-takes-veilnote", "covered"));
        if (!hidden && note) note.remove();
        eye.textContent = "";
        eye.appendChild(eyeIcon(!hidden));
        eye.title = hidden ? "Show this take" : "Cover this take";
      };
      eye.addEventListener("click", (event) => {
        event.stopPropagation();
        flipVeil(column.file);
        paintVeil();
      });
      hold.appendChild(eye);
      paintVeil();
      windowVeils.push(paintVeil);
      capRow.append(el("div", "vig-takes-spring"), putButton(column.take));
      pane.append(capRow, hold);
      windows.appendChild(pane);
    }
    linkPlayers(players());
    transport.textContent = "";
    const act = (glyph, label, title, run) => {
      const button = el("button", "vig-takes-tbtn");
      button.append(el("span", "g", glyph), el("span", "", label));
      button.title = title;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        run(players());
      });
      return button;
    };
    transport.append(
      act("▶", "play", "Play both windows from where they stand.",
          (vs) => { for (const v of vs) v.play().catch(() => {}); }),
      act("⏸", "stop", "Stop both, and leave them on the frame they are on.",
          (vs) => { for (const v of vs) v.pause(); }),
      act("↺", "restart",
          "Back to the first frame and play — the only honest way to compare motion.",
          (vs) => {
            for (const v of vs) v.currentTime = 0;
            for (const v of vs) v.play().catch(() => {});
          }),
    );
    const lock = el("button", "vig-takes-tbtn");
    const paintLock = () => {
      lock.className = `vig-takes-tbtn${linked ? " on" : ""}`;
      lock.textContent = "";
      lock.append(el("span", "g", "🔗"), el("span", "", linked ? "locked" : "free"));
      lock.title = linked
        ? "Locked: seeking one window seeks the other, and playing one plays "
          + "both. Press to let them run apart — two takes of one beat can "
          + "need reading at different instants."
        : "Free: each window scrubs on its own. Press to lock them to the "
          + "same instant, which is what a comparison is usually after.";
    };
    paintLock();
    lock.dataset.log = "lock windows";
    lock.addEventListener("click", (event) => {
      event.stopPropagation();
      linked = !linked;
      paintLock();
    });
    transport.appendChild(lock);
  }
  function drawCompareFacts() {
    const columns = compareColumns();
    if (columns.some((column) => !column.take)) return;
    const wasAt = compare.scrollTop;
    cmpFacts.textContent = "";
    const differs = differingKeys(columns.map((c) => ({ made: c.made })));
    cmpFacts.appendChild(el("div", "vig-takes-subhead", "differences"));
    cmpFacts.appendChild(el(
      "div", "vig-takes-hint",
      differs.size
        ? `${differs.size} setting${differs.size === 1 ? "" : "s"}; the rest are the same`
        : "none — identical settings, down to the seed",
    ));
    drawGroups(cmpFacts, columns, differs, takes, drawCompareFacts);
    compare.scrollTop = wasAt;
    settleNudge();
  }
  const rung = (n) => "\u2605".repeat(n) + "\u2606".repeat(MAX_RATING - n);
  const sweepSaid = (level) =>
    level === 0 ? "with no rating" : `rated ${rung(level).slice(0, level)} or worse`;
  async function runSweep(level) {
    try {
      const keep = onTimelineFile();
      const dry = await post(PRUNE_ROUTE, {
        path: root, index, id, name, at_or_below: level, keep,
      });
      const doomed = dry.would_remove || [];
      if (!doomed.length) {
        say(`No takes ${sweepSaid(level)}. Nothing to sweep.`, "info");
        return;
      }
      const ok = await askInGallery(
        `Sweep ${doomed.length} take(s) ${sweepSaid(level)}`,
        doomed.join("\n") +
          "\n\nThe files and their paperwork go. This cannot be undone.",
        "Delete them", "Cancel",
      );
      if (!ok) return;
      for (const file of doomed) releaseFile(file);
      const done = await post(PRUNE_ROUTE, {
        path: root, index, id, name, at_or_below: level, confirm: true, keep,
      });
      const refused = done.refused || [];
      say(
        `Swept ${(done.removed || []).length} take(s).` +
          (refused.length
            ? ` ${refused.length} would not go — still open somewhere: ${refused.join(", ")}`
            : ""),
        refused.length ? "error" : "ok",
      );
      slotA = null;
      slotB = null;
      await load();
    } catch (error) {
      say(`sweep failed: ${error.message}`, "error");
    }
  }
  function openLinkMenu(anchor, take) {
    const menu = el("div", "vig-takes-badgemenu");
    menu.classList.add(SCHEME_CLASS);
    const shut = () => {
      menu.remove();
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onOutside = (event) => {
      const target = event.target;
      if (target instanceof Node && (menu.contains(target) || anchor.contains(target))) return;
      shut();
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      shut();
    };
    const told = String(((take.made || {}).continues) || "");
    const myKey = String(((take.made || {}).cache_key) || "");
    const badge = (label, on, run) => {
      const chip = el("button", `vig-takes-tag follows badge${on ? " on" : ""}`, label);
      chip.title = on ? "Press to take this off" : "Press to say this";
      chip.addEventListener("click", () => {
        shut();
        run();
      });
      menu.appendChild(chip);
    };
    if (ahead.key) {
      const on = told === ahead.key || take.follows === true;
      badge(`continues clip ${index}`, on,
            () => judge(take.file, { continues: on ? "" : ahead.key }));
    }
    if (behind.file && myKey) {
      const on = take.precedes === true;
      badge(`prehistory of clip ${index + 2}`, on, async () => {
        try {
          await post(JUDGE_ROUTE, {
            path: root, index: behind.index, id: behind.id,
            name: behind.name, file: behind.file,
            continues: on ? "" : myKey,
          });
        } catch (error) {
          say(`could not save that: ${error.message}`, "error");
        }
        await load();
      });
    }
    document.body.appendChild(menu);
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    const at = anchor.getBoundingClientRect();
    const box = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(at.left, window.innerWidth - box.width - 8))}px`;
    menu.style.top = at.bottom + box.height + 8 < window.innerHeight
      ? `${at.bottom + 4}px`
      : `${Math.max(8, at.top - box.height - 4)}px`;
  }
  function openSweepMenu(anchor) {
    const menu = el("div", "vig-takes-sweepmenu");
    menu.classList.add(SCHEME_CLASS);
    const shut = () => {
      menu.remove();
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onOutside = (event) => {
      const target = event.target;
      if (target instanceof Node && (menu.contains(target) || anchor.contains(target))) return;
      shut();
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      shut();
    };
    menu.appendChild(el("span", "vig-takes-sweephead", "sweep this and worse"));
    for (let level = MAX_RATING; level >= 0; level -= 1) {
      const row = el("button", "vig-takes-rung");
      const line = el("span", "stars", level ? rung(level) : rung(0));
      const note = el("span", "note", level ? "" : "unrated");
      row.append(line, note);
      row.title = level
        ? `Delete every take rated ${level} star${level === 1 ? "" : "s"} or fewer, ` +
          "including the unrated ones. The take on the timeline is never swept."
        : "Delete the takes nobody has rated. The take on the timeline is " +
          "never swept.";
      row.addEventListener("click", () => {
        shut();
        runSweep(level);
      });
      menu.appendChild(row);
    }
    document.body.appendChild(menu);
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onKey, true);
    const box = anchor.getBoundingClientRect();
    const under = box.bottom + 6;
    const room = under + menu.offsetHeight <= window.innerHeight - 8;
    menu.style.top = `${Math.round(room ? under : Math.max(8, box.top - menu.offsetHeight - 6))}px`;
    menu.style.left = `${Math.round(
      Math.max(8, Math.min(box.left, window.innerWidth - menu.offsetWidth - 8)),
    )}px`;
  }
  function drawMenu() {
    menu.textContent = "";
    veilHold.textContent = "";
    veilHold.appendChild(veilButton());
    if (comparing()) {
      const leave = el("button", "vig-takes-tbtn leave");
      leave.append(el("span", "g", "✕"), el("span", "", "exit A/B"));
      leave.title = "Put both windows away and go back to the grid.";
      leave.addEventListener("click", (event) => {
        event.stopPropagation();
        leaveCompare();
      });
      menu.append(leave);
      return;
    }
    const broom = el("button", "vig-takes-tool broom");
    broom.append(broomIcon(), el("span", "", "Sweep"));
    broom.dataset.log = "sweep";
    broom.title =
      "Sweep takes by rating — pick a rung and everything at or below it goes. " +
      "The take on the timeline is never swept, and you are shown what would " +
      "go before anything is deleted.";
    broom.addEventListener("click", (event) => {
      event.stopPropagation();
      openSweepMenu(broom);
    });
    const view = (label, icon, table, title, log) => {
      const button = el("button", `vig-takes-tool${tableOn === table ? " on" : ""}`);
      button.append(icon, el("span", "", label));
      button.dataset.log = log;
      button.title = title;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        if (tableOn === table) return;
        tableOn = table;
        draw();
      });
      return button;
    };
    const grid = view("Grid", gridIcon(), false,
      "The takes as a contact sheet, one card each.", "grid view");
    const cross = view("Matrix", matrixIcon(), true,
      "Lay the takes out as a matrix — one setting down the rows, another "
        + "across the columns. Narrow the shelf with the filters first, then "
        + "pick the two you want to compare.", "cross-table");
    const close = el("button", "vig-cutter-ghost", "✕ Close");
    close.addEventListener("click", () => shut());
    menu.append(broom, grid, cross, close);
  }
  function gridIcon() {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    node.setAttribute("width", "15");
    node.setAttribute("height", "15");
    node.setAttribute("viewBox", "0 0 24 24");
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", "currentColor");
    node.setAttribute("stroke-width", "2");
    node.innerHTML =
      '<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"></rect>' +
      '<rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"></rect>' +
      '<rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"></rect>' +
      '<rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"></rect>';
    return node;
  }
  function matrixIcon() {
    const node = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    node.setAttribute("width", "15");
    node.setAttribute("height", "15");
    node.setAttribute("viewBox", "0 0 24 24");
    node.setAttribute("fill", "none");
    node.setAttribute("stroke", "currentColor");
    node.setAttribute("stroke-width", "2");
    node.setAttribute("stroke-linecap", "round");
    node.innerHTML =
      '<rect x="3" y="3" width="18" height="18" rx="2.5"></rect>' +
      '<path d="M3 9h18M3 15h18M9 3v18M15 3v18"></path>';
    return node;
  }
  function veilButton() {
    const veil = el("button", `vig-takes-menubtn veil${blurAll ? " on" : ""}`);
    veil.appendChild(eyeIcon(!blurAll));
    veil.title = blurAll
      ? comparing()
        ? "Both takes are covered. Press to uncover them."
        : "Every take is covered. Press to uncover the gallery."
      : comparing()
        ? "Cover both takes — the eye on a window still uncovers that one. " +
          "Remembered for next time."
        : "Cover every take in this gallery — the eye on a card still uncovers " +
          "that one. Remembered for next time.";
    veil.addEventListener("click", (event) => {
      event.stopPropagation();
      blurAll = !blurAll;
      peeked.clear();
      veiled.clear();
      try {
        window.localStorage.setItem(BLUR_PREF, blurAll ? "1" : "0");
      } catch (err) {
      }
      paintVeils();
      drawMenu();
    });
    return veil;
  }
  let usageSeen = new Map();
  let usageAsked = false;
  async function askUsage() {
    if (usageAsked) return;
    usageAsked = true;
    try {
      const data = await post(USAGE_ROUTE, {});
      for (const [name, row] of Object.entries((data && data.elements) || {})) {
        if (!row || !row.last || name.startsWith("takes/")) continue;
        const label = name.slice(name.lastIndexOf("/") + 1).toLowerCase();
        for (const word of label.split(/[^a-z_]+/)) {
          if (word.length < 4) continue;
          if ((usageSeen.get(word) || "") < row.last) usageSeen.set(word, row.last);
        }
      }
    } catch (error) {
      usageSeen = new Map();
    }
    if (!axesByHand) {
      rowKey = null;
      colKey = null;
      cellKey = null;
    }
    if (tableOn) drawTable();
  }
  function changedRecently(list) {
    const byTime = [...list].sort((a, b) => (Number(b.modified) || 0) - (Number(a.modified) || 0));
    const moving = new Map();
    for (let i = 0; i + 1 < byTime.length; i += 1) {
      const now = factMap(byTime[i].made);
      const before = factMap(byTime[i + 1].made);
      for (const key of new Set([...now.keys(), ...before.keys()])) {
        const here = (now.get(key) || {}).value;
        const there = (before.get(key) || {}).value;
        if (here === there) continue;
        const had = moving.get(key);
        if (had) had.times += 1;
        else moving.set(key, { times: 1, last: i });
      }
    }
    return moving;
  }
  function axisCandidates(list) {
    const seen = new Map();
    for (const take of list) {
      for (const fact of facts(take.made || {})) {
        if (fact.ignore || fact.long) continue;
        if (!seen.has(fact.key)) seen.set(fact.key, { fact, values: new Set() });
      }
    }
    for (const take of list) {
      const mine = factMap(take.made);
      for (const [key, entry] of seen) {
        entry.values.add((mine.get(key) || {}).value ?? "—");
      }
    }
    const moved = changedRecently(list);
    const out = [];
    const sharedLabels = new Set();
    {
      const count = new Map();
      for (const [, entry] of seen) {
        if (entry.values.size < 2) continue;
        const name = String(entry.fact.label);
        count.set(name, (count.get(name) || 0) + 1);
      }
      for (const [name, n] of count) if (n > 1) sharedLabels.add(name);
    }
    for (const [key, entry] of seen) {
      if (entry.values.size < 2) continue;
      const words = String(entry.fact.label).toLowerCase().split(/[^a-z_]+/);
      let touched = "";
      for (const word of words) {
        if (word.length < 4) continue;
        const at = usageSeen.get(word) || "";
        if (at > touched) touched = at;
      }
      const blind = !!entry.fact.cosmetic;
      out.push({
        key,
        label: (sharedLabels.has(String(entry.fact.label))
          ? `${entry.fact.heading} · ${entry.fact.label}` : entry.fact.label)
          + (blind ? " (no effect)" : ""),
        cosmetic: blind ? 1 : 0,
        values: entry.values.size,
        lonely: entry.values.size >= list.length ? 1 : 0,
        measure: entry.fact.measure ? 1 : 0,
        times: (moved.get(key) || { times: 0 }).times,
        moved: (moved.get(key) || { last: Number.POSITIVE_INFINITY }).last,
        touched,
      });
    }
    out.sort((a, b) => a.cosmetic - b.cosmetic
      || a.measure - b.measure
      || a.lonely - b.lonely
      || String(b.touched).localeCompare(String(a.touched))
      || b.times - a.times
      || a.moved - b.moved
      || b.values - a.values
      || a.label.localeCompare(b.label));
    return out;
  }
  function axisValue(take, key) {
    if (key === ALL_IN_ONE) return { value: "all takes", order: 0, missing: false };
    const fact = factMap(take.made).get(key);
    if (!fact) return { value: "—", order: Number.POSITIVE_INFINITY, missing: true };
    const number = Number(fact.number);
    return {
      value: fact.value,
      order: Number.isFinite(number) ? number : Number.NaN,
      missing: false,
    };
  }
  function axisValues(list, key) {
    const seen = new Map();
    for (const take of list) {
      const at = axisValue(take, key);
      if (!seen.has(at.value)) seen.set(at.value, at);
    }
    const out = [...seen.values()];
    out.sort((a, b) => {
      if (Number.isFinite(a.order) && Number.isFinite(b.order)) return a.order - b.order;
      if (a.missing !== b.missing) return a.missing ? 1 : -1;
      return String(a.value).localeCompare(String(b.value), undefined, { numeric: true });
    });
    return out.map((one) => one.value);
  }
  function axisPicker(which, current, choices, onPick) {
    const wrap = el("label", "vig-takes-axis");
    wrap.append(el("span", "k", which));
    const pick = document.createElement("select");
    pick.className = "vig-takes-axisel";
    for (const choice of choices) {
      const option = el("option", "", choice.label);
      option.value = choice.key;
      if (choice.key === current) option.selected = true;
      pick.appendChild(option);
    }
    pick.addEventListener("change", () => onPick(pick.value));
    wrap.appendChild(pick);
    return wrap;
  }
  function tableTake(take, measure) {
    const cell = el("div", `vig-takes-tt${take.file === focused ? " on" : ""}`
      + `${heldByBoard(take) ? " held" : ""}`);
    const video = document.createElement("video");
    video.className = "vig-takes-ttvideo";
    const shape = shapeOf(take.made);
    if (shape) video.style.aspectRatio = shape;
    followShape(video);
    video.src = takeUrl(root, take.folder, take.file);
    video.muted = true;
    video.loop = true;
    video.preload = "metadata";
    video.addEventListener("mouseenter", () => video.play().catch(() => {}));
    video.addEventListener("mouseleave", () => video.pause());
    cell.appendChild(video);
    if (isVeiled(take.file)) cell.classList.add("veiled");
    const said = measure ? (factMap(take.made).get(measure) || {}).value : "";
    const name = el("div", "vig-takes-ttname", said || "not recorded");
    if (!said) name.classList.add("none");
    name.title = take.file;
    cell.appendChild(name);
    const acts = el("div", "vig-takes-ttbar");
    const open = el("button", "vig-takes-slot tiny", "▶");
    open.title = "Watch this take full size (a double-press on the picture does "
      + "the same).";
    open.dataset.log = "watch from the matrix";
    open.addEventListener("click", (event) => {
      event.stopPropagation();
      openPlayer(take);
    });
    acts.append(slotButton(take, "A", "tiny"), slotButton(take, "B", "tiny"), open);
    cell.appendChild(acts);
    cell.addEventListener("click", () => {
      focused = take.file;
      paintTable();
      if (sideOpen) drawSide();
    });
    cell.addEventListener("dblclick", () => openPlayer(take));
    return cell;
  }
  function paintTable() {
    const held = heldTake();
    for (const cell of table.querySelectorAll(".vig-takes-tt")) {
      cell.classList.toggle("on", false);
      cell.classList.toggle("held", !!held && cell.dataset.file === held.file);
    }
    const lit = table.querySelector(`.vig-takes-tt[data-file="${CSS.escape(focused || "")}"]`);
    if (lit) lit.classList.add("on");
  }
  function drawTable() {
    if (!tableOn || comparing()) {
      table.style.display = "none";
      table.textContent = "";
      tableBuilt = null;
      if (side.parentElement !== body) body.appendChild(side);
      return;
    }
    table.style.display = "flex";
    askUsage();
    const list = shown();
    const candidates = axisCandidates(list);
    if (!candidates.length) {
      tableBuilt = null;
      table.textContent = "";
      table.appendChild(el("div", "vig-takes-empty",
        takes.length < 2
          ? "Nothing to lay out yet — render this clip a few times, changing "
            + "something between the renders."
          : `Every setting is the same across the ${list.length} takes on `
            + "screen, so there is nothing to lay them out against. Drop a "
            + "condition above, or render another take with something changed."));
      return;
    }
    const has = (key) => key === ALL_IN_ONE || candidates.some((one) => one.key === key);
    const bestBut = (taken) =>
      (candidates.find((one) => one.key !== taken) || { key: ALL_IN_ONE }).key;
    if (rowKey === null || !has(rowKey)) rowKey = bestBut(colKey);
    if (colKey === null || !has(colKey)) colKey = bestBut(rowKey);
    if (cellKey === null || !candidates.some((one) => one.key === cellKey)) {
      const spare = candidates.filter((one) => one.key !== rowKey && one.key !== colKey);
      const cost = spare.find((one) => one.key === "made_in")
        || spare.find((one) => one.key === "sampled");
      cellKey = (cost || spare[0] || { key: "" }).key;
    }
    const built = [rowKey, colKey, cellKey, takeSize,
                   list.map((t) => t.file).join(",")].join("|");
    if (built === tableBuilt && table.querySelector(".vig-takes-tgrid")) {
      paintTable();
      return;
    }
    tableBuilt = built;
    table.textContent = "";
    const laid = [...candidates, { key: ALL_IN_ONE, label: "all" }];
    const said = [{ key: "", label: "none" }, ...candidates];
    const bar2 = el("div", "vig-takes-axes");
    bar2.append(
      axisPicker("rows", rowKey, laid,
                 (key) => { rowKey = key; axesByHand = true; drawTable(); }),
      axisPicker("columns", colKey, laid,
                 (key) => { colKey = key; axesByHand = true; drawTable(); }),
      axisPicker("label", cellKey, said,
                 (key) => { cellKey = key; axesByHand = true; drawTable(); }),
    );
    const sizes = el("div", "vig-takes-sizes");
    sizes.append(el("span", "k", "size"));
    for (const one of TAKE_SIZES) {
      const button = el("button", `vig-takes-ghost${one.px === takeSize ? " on" : ""}`,
                        one.label);
      button.dataset.log = `take size ${one.label}`;
      button.title = `Draw each take ${one.px}px wide in the matrix.`;
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        takeSize = one.px;
        try {
          window.localStorage.setItem(SIZE_PREF, String(takeSize));
        } catch (err) {   }
        drawTable();
      });
      sizes.appendChild(button);
    }
    const swap = el("button", "vig-takes-ghost", "⇄ swap");
    swap.title = "Put the rows in the columns and the columns in the rows.";
    swap.addEventListener("click", () => {
      const was = rowKey;
      rowKey = colKey;
      colKey = was;
      axesByHand = true;
      drawTable();
    });
    const fold = el("button", "vig-takes-ghost");
    const paintFold = () => {
      fold.className = `vig-takes-ghost${sideOpen ? " on" : ""}`;
      fold.textContent = "⚙ settings";
      fold.title = sideOpen
        ? "Shut the settings column and give the matrix the whole sheet."
        : "Everything this take was rendered with, beside the matrix — the "
          + "rows and the columns already say what it is laid out BY.";
    };
    fold.dataset.log = "matrix settings fold";
    fold.addEventListener("click", (event) => {
      event.stopPropagation();
      sideOpen = !sideOpen;
      showSide();
      paintFold();
    });
    paintFold();
    bar2.append(swap, sizes, el("div", "vig-takes-spring"), fold);
    table.appendChild(bar2);
    const rows = axisValues(list, rowKey);
    const columns = axisValues(list, colKey);
    const cells = new Map();
    for (const take of list) {
      const key = JSON.stringify([axisValue(take, rowKey).value,
                                  axisValue(take, colKey).value]);
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(take);
    }
    const scroll = el("div", "vig-takes-tscroll");
    const grid2 = el("div", "vig-takes-tgrid");
    const PAD = 10;
    const NAME = 17;
    const shapes = new Set(list.map((take) => shapeOf(take.made)).filter(Boolean));
    const only = shapes.size === 1 ? [...shapes][0].split("/").map(Number) : null;
    const tall = only && only[0] > 0 ? Math.round((takeSize * only[1]) / only[0]) : 0;
    grid2.style.setProperty("--tt", `${takeSize}px`);
    grid2.style.gridTemplateColumns =
      `max-content repeat(${columns.length}, ${takeSize + PAD}px)`;
    grid2.style.gridAutoRows = tall ? `minmax(${tall + NAME + PAD}px, auto)` : "auto";
    const axisName = (key) => {
      const choice = laid.find((one) => one.key === key);
      return choice ? choice.label : key;
    };
    grid2.appendChild(el("div", "vig-takes-tcorner",
                         `${axisName(rowKey)} ╲ ${axisName(colKey)}`));
    const plainLabel = (key) => {
      for (const take of list) {
        const fact = factMap(take.made).get(key);
        if (fact) return fact.label;
      }
      return key;
    };
    const header = (cls, key, value) => {
      const box = el("div", cls);
      box.appendChild(el("span", "t", value));
      const gap = list.some((take) => {
        const at = axisValue(take, key);
        return at.value === value && at.missing;
      });
      if (key === ALL_IN_ONE || gap) return box;
      const label = plainLabel(key);
      const on = filters.some((f) => f.key === key && f.value === value);
      const funnel = el("button", `vig-takes-filter${on ? " on" : ""}`);
      funnel.appendChild(funnelIcon());
      funnel.dataset.log = "filter from the matrix";
      funnel.title = on
        ? `Stop keeping only the takes whose ${label} is this`
        : `Keep only the takes whose ${label} is ${value} — and lay the rest `
          + "out against whatever else is still varying.";
      funnel.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFilter({ key, label, value });
      });
      box.appendChild(funnel);
      return box;
    };
    for (const column of columns) {
      grid2.appendChild(header("vig-takes-thead", colKey, column));
    }
    for (const row of rows) {
      grid2.appendChild(header("vig-takes-trow", rowKey, row));
      for (const column of columns) {
        const box = el("div", "vig-takes-tcell");
        const here = cells.get(JSON.stringify([row, column])) || [];
        if (!here.length) box.classList.add("empty");
        for (const take of here) {
          const one = tableTake(take, cellKey);
          one.dataset.file = take.file;
          box.appendChild(one);
        }
        grid2.appendChild(box);
      }
    }
    scroll.appendChild(grid2);
    const twrap = el("div", "vig-takes-twrap");
    twrap.appendChild(scroll);
    table.appendChild(twrap);
    showSide = () => {
      if (sideOpen) {
        twrap.appendChild(side);
        drawSide();
      } else if (side.parentElement !== body) {
        body.appendChild(side);
      }
    };
    showSide();
    table.appendChild(el("div", "vig-takes-tfoot",
      `${list.length} take${list.length === 1 ? "" : "s"} · `
      + `${rows.length}×${columns.length}`
      + (filters.length ? ` — narrowed by ${filters.length} condition(s) above` : "")));
  }
  function drawOrder() {
    order.textContent = "";
    if (takes.length < 2) {
      order.style.display = "none";
      return;
    }
    order.style.display = "";
    const choices = SORT_ORDERS;
    if (!choices.some((one) => one.key === sortKey)) sortKey = "created";
    const pick = document.createElement("select");
    pick.className = "vig-takes-axisel";
    pick.dataset.log = "order";
    pick.title = "The order the takes are laid out in — the grid, the "
      + "cross-table's cells and the arrows in the full-size player all walk "
      + "this one order.";
    for (const choice of choices) {
      const option = el("option", "", choice.label);
      option.value = choice.key;
      if (choice.key === sortKey) option.selected = true;
      pick.appendChild(option);
    }
    pick.addEventListener("change", () => {
      sortKey = pick.value;
      rememberOrder();
      draw();
    });
    const filed = sortKey === "created";
    const way = el("button", "vig-takes-ghost", sortDown ? "↓" : "↑");
    way.dataset.log = "order direction";
    way.title = sortDown
      ? (filed ? "Newest first. Press for the order they were filed in."
               : "Biggest first. Press for smallest first.")
      : (filed ? "Oldest first — the order they were filed in. Press for newest first."
               : "Smallest first. Press for biggest first.");
    way.addEventListener("click", (event) => {
      event.stopPropagation();
      sortDown = !sortDown;
      rememberOrder();
      draw();
    });
    order.append(el("span", "k", "order"), pick, way);
  }
  function drawFilters() {
    bar.textContent = "";
    if (!filters.length) {
      bar.style.display = "none";
      return;
    }
    bar.style.display = "";
    bar.appendChild(el("span", "vig-takes-barlab", "filter"));
    const mode = el("button", "vig-takes-mode", filterMode === "all" ? "ALL" : "ANY");
    mode.title = filterMode === "all"
      ? "Every condition has to hold. Press for ANY — a take is shown if it " +
        "answers even one of them, and the values a filter is hiding are " +
        "offered under its own row as “also”."
      : "One condition is enough. Press for ALL — a take is shown only if it " +
        "answers every one of them.";
    mode.addEventListener("click", (event) => {
      event.stopPropagation();
      filterMode = filterMode === "all" ? "any" : "all";
      if (filterMode === "all") {
        const kept = new Map();
        for (const f of filters) kept.set(f.key, f);
        filters = [...kept.values()];
      }
      draw();
    });
    bar.appendChild(mode);
    for (const fact of filters) {
      const chip = el("button", "vig-takes-chip");
      chip.append(
        el("span", "k", fact.label),
        el("span", "v", fact.value.length > 28 ? `${fact.value.slice(0, 27)}…` : fact.value),
        el("span", "x", "✕"),
      );
      chip.title = `Drop this condition\n\n${fact.label} = ${fact.value}`;
      chip.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFilter(fact);
      });
      bar.appendChild(chip);
    }
    const clear = el("button", "vig-takes-clear", "clear");
    clear.title = "Drop every condition and show the whole shelf again.";
    clear.addEventListener("click", (event) => {
      event.stopPropagation();
      filters = [];
      draw();
    });
    bar.append(el("div", "vig-takes-spring"), clear);
  }
  function drawFoot() {
    foot.textContent = "";
    heard = el("div", "vig-takes-said");
    foot.append(el("div", "vig-takes-spring"), heard);
    paintSaid();
  }
  function draw() {
    const wasAt = grid.scrollTop;
    const list = shown();
    if (focused && !list.some((t) => t.file === focused)) {
      focused = (list[0] || {}).file || null;
    }
    body.style.display = comparing() || tableOn ? "none" : "";
    const keys = list.map((t) => t.file).join("|");
    if (list.length && keys === gridKeys
        && grid.querySelectorAll(".vig-takes-card").length === list.length) {
      paintCards();
    } else {
      grid.textContent = "";
      cardVeils = [];
      cardPaints.clear();
      for (const take of list) grid.appendChild(card(take));
      gridKeys = list.length ? keys : null;
    }
    if (!list.length) {
      grid.appendChild(
        el(
          "div",
          "vig-takes-empty",
          takes.length
            ? "No take answers the filter. Drop a condition above, or switch it " +
              "to ANY."
            : "No takes yet for this clip. Render it once — every render is kept " +
              "here, and a batch keeps the whole batch.",
        ),
      );
    }
    paintCount(count, ICONS.clapper, countNow());
    drawMenu();
    drawOrder();
    drawFilters();
    drawTable();
    drawCompare();
    drawSide();
    drawFoot();
    if (playerJudge) playerJudge();
    grid.scrollTop = wasAt;
  }
  const countText = () => {
    if (!takes.length) return "";
    const shownNow = shown().length;
    return shownNow === takes.length ? `${takes.length}` : `${shownNow} of ${takes.length}`;
  };
  const countNow = () => (comparing() ? `${countText()} · A/B` : countText());
  const signature = (list) =>
    list.map((t) => `${t.file}:${t.rating}`).join("|");
  async function load({ quiet = false } = {}) {
    try {
      const data = await post(
        TAKES_ROUTE, { path: root, index, id, name, board: boardNow() },
      );
      ahead = (data.ahead && typeof data.ahead === "object") ? data.ahead : {};
      behind = (data.behind && typeof data.behind === "object") ? data.behind : {};
      const next = (data.takes || []).map(
        (t) => ({ ...t, folder: data.folder,
                  made: { ...withCreated(t), take_id: takeIdOf(root, data.folder, t.file) } }),
      );
      const before = signature(takes);
      const arrived = next.filter((fresh) => !takes.some((had) => had.file === fresh.file));
      takes = next;
      if (quiet && signature(takes) === before) return;
      if (!takes.some((t) => t.file === focused)) {
        const first = takes.find(heldByBoard);
        focused = (first || takes[0] || {}).file || null;
      }
      draw();
      askUsage();
      if (quiet && arrived.length) {
        sayHere(
          arrived.length === 1
            ? `${arrived[0].file} — just rendered, and it is in the grid.`
            : `${arrived.length} takes arrived: ${arrived.map((t) => t.file).join(", ")}`,
        );
      }
    } catch (error) {
      if (quiet) return;
      grid.textContent = "";
      grid.appendChild(el("div", "vig-takes-empty", `Could not read the takes: ${error.message}`));
    }
  }
  document.body.appendChild(overlay);
  load();
  return { close: shut, reload: load };
}
export function ensureTakesStyles() {
  ensureSchemeStyles();
  if (document.getElementById("vig-takes-styles")) return;
  const style = el("style");
  style.id = "vig-takes-styles";
  style.textContent = `
.vig-takes-overlay{position:fixed;inset:0;z-index:1400;background:var(--cut-scrim);
  display:flex;align-items:center;justify-content:center;padding:24px;
  font-family:${UI_FONT};}
.vig-takes-sheet{background:var(--cut-bg);border:1px solid var(--cut-border);border-radius:10px;
  width:min(1500px,96vw);height:min(920px,94vh);display:flex;flex-direction:column;
  box-shadow:0 24px 70px rgba(0,0,0,.6);overflow:hidden;}
.vig-takes-overlay button,.vig-takes-overlay input,.vig-takes-overlay select,
.vig-takes-overlay textarea,.vig-takes-badgemenu button,
.vig-takes-sweepmenu button{font-family:inherit;}
.vig-takes-head{display:flex;align-items:center;gap:12px;padding:12px 16px;
  border-bottom:1px solid var(--cut-seam);}
.vig-takes-title{font-size:15px;font-weight:600;color:var(--cut-bright);white-space:nowrap;}
.vig-takes-count{white-space:nowrap;margin-left:6px;}
.vig-takes-count > svg{color:var(--cut-dim);vertical-align:-2px;margin-right:5px;}
.vig-takes-order{display:flex;align-items:center;gap:6px;font-size:11px;
  color:var(--cut-dim);flex:0 1 auto;min-width:0;}
.vig-takes-order .k{text-transform:uppercase;letter-spacing:.05em;}
.vig-takes-order .vig-takes-axisel{max-width:200px;min-width:70px;flex:0 1 auto;}
.vig-takes-spring{flex:1;}
.vig-takes-menu{display:flex;align-items:center;gap:4px;}
.vig-takes-menubtn{display:flex;align-items:center;justify-content:center;
  width:26px;height:24px;padding:0;border:none;background:none;border-radius:5px;
  cursor:pointer;color:var(--cut-dim);}
.vig-takes-menubtn:hover{background:var(--cut-hover);color:var(--cut-bright);}
.vig-takes-tool{display:flex;align-items:center;gap:6px;height:32px;padding:0 10px;box-sizing:border-box;
  border:1px solid var(--cut-border);border-radius:5px;background:var(--cut-well);
  color:var(--cut-text);font-family:inherit;font-size:12px;cursor:pointer;white-space:nowrap;}
.vig-takes-tool:hover{background:var(--cut-hover);color:var(--cut-bright);border-color:var(--cut-dashed);}
.vig-takes-tool svg{flex:0 0 auto;}
.vig-takes-tool.broom{color:var(--cut-accent-lit);border-color:rgba(var(--cut-accent-rgb),0.45);}
.vig-takes-tool.broom:hover{color:var(--cut-accent-hi);}
.vig-takes-tool.on{color:var(--cut-accent-hi);border-color:var(--cut-accent);
  background:rgba(var(--cut-accent-rgb),0.14);}
.vig-takes-veilhold{display:flex;align-items:center;}
.vig-takes-menubtn.veil.on{color:#7aa2d8;background:rgba(122,162,216,0.14);}
.vig-takes-bar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;
  padding:8px 16px;border-bottom:1px solid var(--cut-seam);background:var(--cut-bar);}
.vig-takes-barlab{font-size:10px;text-transform:uppercase;letter-spacing:.08em;
  color:var(--cut-dim);}
.vig-takes-mode{border:0;border-radius:3px;padding:2px 7px;cursor:pointer;
  font-size:10px;font-weight:600;letter-spacing:.06em;
  background:#33415a;color:#bcd4f5;}
.vig-takes-mode:hover{background:#3e4f6e;color:#e6f0ff;}
.vig-takes-chip{display:flex;align-items:center;gap:5px;border:0;border-radius:3px;
  padding:2px 6px;cursor:pointer;font-size:11px;background:var(--cut-raised);color:var(--cut-soft);}
.vig-takes-chip:hover{background:var(--cut-frame);}
.vig-takes-chip .k{color:var(--cut-dim);}
.vig-takes-chip .v{max-width:180px;overflow:hidden;text-overflow:ellipsis;
  white-space:nowrap;}
.vig-takes-chip .x{color:var(--cut-dim);font-size:10px;}
.vig-takes-chip:hover .x{color:#e08c8c;}
.vig-takes-clear{border:0;background:none;color:var(--cut-dim);font-size:11px;
  cursor:pointer;padding:2px 4px;}
.vig-takes-clear:hover{color:var(--cut-bright);text-decoration:underline;}
.vig-takes-compare{display:none;flex-direction:column;gap:10px;padding:12px 16px;
  flex:1;min-height:0;overflow-y:auto;}
.vig-takes-cmpwindows{display:flex;gap:12px;align-items:flex-start;}
.vig-takes-pane{flex:1;min-width:0;}
.vig-takes-cap{display:flex;gap:8px;align-items:center;font-size:13px;color:var(--cut-dim);
  margin-bottom:4px;}
.vig-takes-caplabel{background:var(--cut-raised);color:var(--cut-bright);border:0;border-radius:3px;
  padding:2px 8px;font-size:13px;font-weight:600;cursor:pointer;}
.vig-takes-caplabel:hover{background:#7a2b2b;color:#fff;}
.vig-takes-cmphold{position:relative;overflow:hidden;border-radius:6px;background:var(--cut-mat);
  display:flex;}
.vig-takes-bigvideo{width:100%;max-height:44vh;background:var(--cut-mat);display:block;}
.vig-takes-capfile{font-size:12px;color:var(--cut-dim);
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0;flex:0 1 auto;}
.vig-takes-transport{display:flex;align-items:center;gap:6px;}
.vig-takes-tbtn{display:flex;align-items:center;gap:5px;border:0;border-radius:4px;
  padding:4px 10px;cursor:pointer;font-size:11px;background:var(--cut-raised);color:var(--cut-soft);}
.vig-takes-tbtn:hover{background:var(--cut-frame);color:var(--cut-bright);}
.vig-takes-tbtn .g{font-size:12px;line-height:1;color:var(--cut-dim);}
.vig-takes-tbtn:hover .g{color:var(--cut-bright);}
.vig-takes-tbtn.on{background:#2f3f5c;color:#d5e3ff;}
.vig-takes-tbtn.on .g{color:#9dc2ff;}
.vig-takes-tbtn.leave{background:none;box-shadow:inset 0 0 0 1px var(--cut-edge);color:var(--cut-accent-lit);}
.vig-takes-tbtn.leave:hover{background:rgba(var(--cut-accent-rgb),0.16);color:var(--cut-accent-hi);}
.vig-takes-tbtn.leave .g{color:inherit;}
.vig-takes-cmpfacts{border-top:1px solid var(--cut-seam);padding-top:6px;}
.vig-takes-cmprow{display:flex;gap:8px;font-size:12px;padding:1px 0;}
.vig-takes-cmprow .vig-takes-key{width:180px;flex:none;color:var(--cut-dim);}
.vig-takes-cmpval{flex:1;min-width:0;color:var(--cut-text);word-break:break-word;}
.vig-takes-cmpval.absent{color:var(--cut-faint);}
.vig-takes-cmprow.differs .vig-takes-cmpval{color:var(--cut-accent-hi);}
.vig-takes-cmptext{flex:1;min-width:0;white-space:pre-wrap;margin:0;
  font-family:inherit;font-size:11px;line-height:1.45;color:var(--cut-soft);background:var(--cut-sunk);
  border-radius:5px;padding:7px 8px;max-height:260px;overflow:auto;}
.vig-takes-body{flex:1;display:flex;min-height:0;}
.vig-takes-grid{flex:1;overflow-y:auto;padding:14px 16px;display:grid;
  grid-template-columns:repeat(auto-fill,minmax(232px,1fr));gap:14px;align-content:start;}
.vig-takes-side{width:380px;flex:none;border-left:1px solid var(--cut-seam);overflow-y:auto;
  padding:14px 16px;}
.vig-takes-card{background:var(--cut-raised);border:1px solid var(--cut-border);border-radius:8px;padding:8px;
  cursor:pointer;position:relative;}
.vig-takes-card.focused{border-color:#6ea8fe;}
.vig-takes-card.follows{background:linear-gradient(rgba(63,154,99,0.14),rgba(63,154,99,0.14)),
  var(--cut-raised);box-shadow:inset 3px 0 0 #3f9a63;}
.vig-takes-card.stray{background:linear-gradient(rgba(138,116,52,0.14),rgba(138,116,52,0.14)),
  var(--cut-raised);box-shadow:inset 3px 0 0 #8a7434;}
.vig-takes-card.onplayer{background:linear-gradient(rgba(63,154,99,0.2),rgba(63,154,99,0.2)),
  var(--cut-raised);box-shadow:0 0 0 1px #3f9a63;}
.vig-takes-tag.onplayer{background:#2a5c3c;color:#c8f0d6;border-color:#2a5c3c;}
.vig-takes-table{display:none;flex:1;min-height:0;flex-direction:column;gap:8px;
  padding:0 12px 10px;}
.vig-takes-axes{display:flex;align-items:center;gap:10px;flex-wrap:wrap;
  padding:8px 0 0;}
.vig-takes-axis{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--cut-dim);}
.vig-takes-sizes{display:flex;align-items:center;gap:3px;font-size:11px;color:var(--cut-dim);}
.vig-takes-sizes .k{text-transform:uppercase;letter-spacing:.05em;margin-right:3px;}
.vig-takes-sizes .vig-takes-ghost{padding:3px 7px;min-width:28px;text-align:center;}
.vig-takes-axis .k{text-transform:uppercase;letter-spacing:.05em;}
.vig-takes-axisel{background:var(--cut-input);color:var(--cut-text);border:1px solid var(--cut-border);
  border-radius:5px;font:inherit;font-size:11px;padding:3px 6px;max-width:280px;}
.vig-takes-ghost{background:var(--cut-raised);color:var(--cut-soft);border:1px solid var(--cut-border);
  border-radius:5px;font:inherit;font-size:11px;padding:3px 8px;cursor:pointer;}
.vig-takes-ghost:hover{background:var(--cut-frame);color:var(--cut-bright);}
.vig-takes-ghost.on{background:#2f3f5c;color:#d5e3ff;border-color:#40567d;}
.vig-takes-twrap{display:flex;flex:1;min-height:0;}
@media (max-width:1100px){
  .vig-takes-twrap{flex-direction:column;}
  .vig-takes-twrap .vig-takes-side{width:auto;flex:0 0 34%;border-left:0;
    border-top:1px solid var(--cut-seam);}
}
.vig-takes-tscroll{flex:1;min-height:0;overflow:auto;border:1px solid var(--cut-border);
  border-radius:8px;background:var(--cut-well);}
.vig-takes-tgrid{display:grid;gap:1px;background:var(--cut-seam);min-width:min-content;}
.vig-takes-tcorner{position:sticky;top:0;left:0;z-index:3;background:var(--cut-head-a);
  color:var(--cut-dim);font-size:10px;padding:6px 8px;white-space:nowrap;}
.vig-takes-thead{position:sticky;top:0;z-index:2;background:var(--cut-head-a);color:var(--cut-text);
  font-size:11px;font-weight:600;padding:6px 8px;white-space:nowrap;
  display:flex;align-items:center;justify-content:center;gap:4px;}
.vig-takes-thead .vig-takes-filter{margin-left:0;}
.vig-takes-thead:hover .vig-takes-filter,
.vig-takes-trow:hover .vig-takes-filter{color:var(--cut-dim);}
.vig-takes-trow{position:sticky;left:0;z-index:2;background:var(--cut-head-a);color:var(--cut-text);
  font-size:11px;font-weight:600;padding:6px 8px;white-space:nowrap;
  display:flex;align-items:center;}
.vig-takes-tcell{background:var(--cut-sunk);padding:5px;display:flex;flex-wrap:wrap;gap:5px;
  align-content:flex-start;min-height:44px;}
.vig-takes-tcell.empty{background:var(--cut-well);}
.vig-takes-tt{position:relative;width:var(--tt,132px);border-radius:5px;overflow:hidden;
  border:1px solid transparent;cursor:pointer;background:var(--cut-mat);}
.vig-takes-tt.on{border-color:#6ea8fe;}
.vig-takes-tt.veiled .vig-takes-ttvideo{filter:blur(14px);}
.vig-takes-ttvideo{width:100%;aspect-ratio:16/9;object-fit:contain;display:block;
  background:var(--cut-mat);}
.vig-takes-ttname{font-size:10px;color:var(--cut-text);padding:2px 5px;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;background:var(--cut-raised);text-align:center;}
.vig-takes-ttname.none{color:var(--cut-faint);font-style:italic;}
.vig-takes-tt.held .vig-takes-ttname{background:#2a5c3c;color:#c8f0d6;}
.vig-takes-ttbar{position:absolute;top:3px;left:3px;z-index:2;display:flex;gap:3px;
  opacity:0;transition:opacity .12s;}
.vig-takes-tt:hover .vig-takes-ttbar{opacity:1;}
.vig-takes-ttbar:has(.on){opacity:1;}
.vig-takes-slot.tiny{padding:1px 6px;font-size:10px;font-weight:600;
  background:rgba(18,20,25,.82);color:#e6e9ef;box-shadow:none;}
.vig-takes-tfoot{font-size:11px;color:var(--cut-dim);}
.vig-takes-video{width:100%;aspect-ratio:16/9;object-fit:contain;background:var(--cut-mat);
  border-radius:5px;display:block;}
.vig-takes-line{display:flex;gap:4px 3px;align-items:center;margin:6px 0 4px;
  font-size:11px;color:var(--cut-soft);flex-wrap:wrap;}
.vig-takes-dot{color:var(--cut-faint);}
.vig-takes-corner{position:absolute;top:6px;width:22px;height:22px;display:flex;
  align-items:center;justify-content:center;border:0;border-radius:4px;padding:0;
  background:rgba(12,14,17,0.72);color:#c6ccd6;cursor:pointer;opacity:0;
  transition:opacity 0.12s,background 0.12s,color 0.12s;}
.vig-takes-card:hover .vig-takes-corner{opacity:1;}
.vig-takes-corner:focus-visible{opacity:1;}
.vig-takes-corner.kill{right:6px;}
.vig-takes-corner.kill:hover{background:#7a2b2b;color:#fff;}
.vig-takes-corner:disabled{cursor:default;}
.vig-takes-card:hover .vig-takes-corner:disabled{opacity:0.3;}
.vig-takes-corner.kill:disabled:hover{background:rgba(12,14,17,0.72);color:#c6ccd6;}
.vig-takes-player{position:absolute;inset:0;z-index:5;background:rgba(6,7,9,0.86);
  display:flex;align-items:center;justify-content:center;padding:26px;}
.vig-takes-playframe{display:flex;flex-direction:column;gap:8px;max-width:100%;max-height:100%;}
.vig-takes-stage{display:flex;align-items:center;gap:10px;min-height:0;
  max-height:calc(100% - 34px);}
.vig-takes-step{flex:0 0 auto;width:34px;height:64px;display:flex;
  align-items:center;justify-content:center;
  border:1px solid rgba(255,255,255,0.16);border-radius:5px;cursor:pointer;
  background:rgba(255,255,255,0.04);color:#e6e9ef;font-size:24px;line-height:1;
  padding:0;transition:background 0.12s,opacity 0.12s;}
.vig-takes-step:hover:not(:disabled){background:rgba(255,255,255,0.12);}
.vig-takes-step:disabled{opacity:0.18;cursor:default;}
.vig-takes-playhold{display:flex;align-items:center;justify-content:center;
  width:min(1040px,74vw);height:min(600px,62vh);
  overflow:hidden;border-radius:5px;background:var(--cut-mat);
  box-shadow:0 10px 40px rgba(0,0,0,0.55);}
.vig-takes-playframe video{width:100%;height:100%;object-fit:contain;
  background:var(--cut-mat);border-radius:5px;display:block;}
.vig-takes-playbar{display:flex;align-items:center;gap:10px;color:#8b93a1;
  font-size:11px;}
.vig-takes-playjudge{display:flex;align-items:center;gap:10px;}
.vig-takes-playjudge .vig-takes-stars{margin-bottom:0;}
.vig-takes-tag{background:var(--cut-frame);color:var(--cut-quiet);border-radius:3px;padding:1px 5px;
  font-size:10px;}
.vig-takes-tag.steps{background:#2f4568;color:#c6dcfb;}
.vig-takes-tag.secs{background:#e8c05a;color:#15171c;font-weight:600;}
.vig-takes-tag.follows{background:#24704a;color:#c9f7dc;}
.vig-takes-tag.new{background:rgba(var(--cut-accent-rgb),0.26);color:var(--cut-accent-hi);
  box-shadow:inset 0 0 0 1px rgba(var(--cut-accent-rgb),0.45);font-weight:600;}
.vig-takes-plus{border:0;border-radius:3px;padding:0 5px;line-height:15px;
  font-size:12px;font-weight:600;background:var(--cut-frame);color:var(--cut-dim);cursor:pointer;}
.vig-takes-plus:hover{background:var(--cut-dashed);color:var(--cut-bright);}
.vig-takes-badgemenu{position:fixed;z-index:2000;display:flex;
  font-family:${UI_FONT};
  flex-direction:column;align-items:stretch;gap:6px;padding:8px;max-width:280px;
  background:var(--cut-menu);border:1px solid var(--cut-border);border-radius:8px;
  box-shadow:0 12px 32px rgba(0,0,0,0.6);}
.vig-takes-badgemenu .vig-takes-tag.badge{text-align:left;}
.vig-takes-chain{display:contents;}
.vig-takes-tag.badge{cursor:pointer;border:0;font:inherit;font-size:10px;
  background:var(--cut-frame);color:var(--cut-soft);}
.vig-takes-tag.badge:hover{background:var(--cut-dashed);color:var(--cut-bright);}
.vig-takes-tag.badge.on{background:#24704a;color:#c9f7dc;}
.vig-takes-tag.badge.on:hover{background:#2b8557;color:#e0fdec;}
.vig-takes-stars{display:flex;gap:2px;margin-bottom:6px;}
.vig-takes-star{background:none;border:none;cursor:pointer;font-size:15px;color:var(--cut-faint);
  padding:0 1px;line-height:1;}
.vig-takes-star.on{color:#e8c05a;}
.vig-takes-put{border:0;border-radius:3px;padding:3px 8px;font-size:11px;font-weight:600;
  white-space:nowrap;
  cursor:pointer;background:var(--cut-frame);color:var(--cut-soft);box-shadow:inset 0 0 0 1px var(--cut-dashed);}
.vig-takes-put:hover{background:var(--cut-dashed);color:var(--cut-bright);}
.vig-takes-put.on,.vig-takes-put.on:hover{background:#2a5c3c;color:#c8f0d6;
  box-shadow:none;cursor:default;}
.vig-takes-slot{border:0;border-radius:3px;padding:3px 9px;cursor:pointer;
  font-size:11px;font-weight:600;background:var(--cut-frame);color:var(--cut-soft);
  box-shadow:inset 0 0 0 1px var(--cut-dashed);}
.vig-takes-slot:hover{background:var(--cut-dashed);color:var(--cut-bright);}
.vig-takes-slot.on{background:#33415a;color:#dce8fa;box-shadow:inset 0 0 0 1px #5b7db3;}
.vig-takes-slot.twin,.vig-takes-slot.twin:hover{background:var(--cut-sunk);color:var(--cut-faint);
  box-shadow:inset 0 0 0 1px var(--cut-seam);cursor:default;}
.vig-takes-actions{display:flex;gap:5px;flex-wrap:wrap;align-items:center;}
.vig-takes-tag.time{margin-left:auto;color:var(--cut-bright);font-variant-numeric:tabular-nums;}
.vig-takes-actions button{font-size:11px;padding:3px 8px;}
.vig-takes-subhead{font-size:10px;text-transform:uppercase;letter-spacing:.08em;
  color:var(--cut-dim);margin:12px 0 6px;}
.vig-takes-params{display:flex;flex-direction:column;gap:3px;}
.vig-takes-param{display:flex;gap:8px;font-size:12px;}
.vig-takes-param.long{flex-direction:column;gap:4px;}
.vig-takes-longhead{display:flex;align-items:center;gap:8px;}
.vig-takes-param.long .vig-takes-key{width:auto;flex:1;}
.vig-takes-key{width:132px;flex:none;color:var(--cut-dim);overflow-wrap:anywhere;}
.vig-takes-val{color:var(--cut-text);word-break:break-word;flex:1;min-width:0;}
.vig-takes-stack{display:flex;flex-direction:column;gap:3px;}
.vig-takes-stackrow{font-size:11px;color:var(--cut-soft);
  background:var(--cut-sunk);border-radius:4px;padding:4px 6px;word-break:break-all;}
.vig-takes-text{white-space:pre-wrap;font-family:inherit;font-size:11px;color:var(--cut-soft);background:var(--cut-sunk);
  border-radius:5px;padding:8px;max-height:220px;overflow:auto;margin:0;}
.vig-takes-file{font-size:10px;color:var(--cut-faint);
  word-break:break-all;}
.vig-takes-empty{color:var(--cut-dim);font-size:12px;grid-column:1/-1;line-height:1.5;}
.vig-takes-frame{position:relative;overflow:hidden;border-radius:5px;
  background:var(--cut-mat);}
.vig-takes-video.veiled,.vig-takes-bigvideo.veiled{filter:blur(18px) saturate(.55);
  transform:scale(1.08);}
.vig-takes-playframe video.veiled{filter:blur(46px) saturate(.5);transform:scale(1.06);}
.vig-takes-veilnote{position:absolute;inset:0;display:flex;align-items:center;
  justify-content:center;pointer-events:none;font-size:10px;
  letter-spacing:.16em;text-transform:uppercase;color:rgba(236,240,248,0.82);
  background:rgba(8,10,14,0.42);text-shadow:0 1px 3px rgba(0,0,0,0.9);}
.vig-takes-corner.peek{left:6px;}
.vig-takes-cmphold .vig-takes-corner{z-index:2;}
.vig-takes-cmphold:hover .vig-takes-corner{opacity:1;}
.vig-takes-cmphold.veiled .vig-takes-corner.peek{opacity:1;
  background:rgba(12,14,17,0.82);}
.vig-takes-card.veiled .vig-takes-corner.peek{opacity:1;
  background:rgba(12,14,17,0.82);}
.vig-takes-corner.peek:hover{background:#2f4560;color:#fff;}
.vig-takes-more{display:block;width:100%;text-align:left;border:0;background:none;
  cursor:pointer;font-size:11px;color:var(--cut-faint);padding:3px 0 2px;}
.vig-takes-more:hover{color:var(--cut-bright);}
.vig-takes-hint{font-size:11px;color:var(--cut-faint);line-height:1.45;margin:2px 0 8px;}
.vig-takes-group{display:flex;align-items:center;gap:7px;width:100%;
  background:none;border:0;border-top:1px solid var(--cut-seam);padding:7px 2px;
  cursor:pointer;color:var(--cut-soft);font-size:12px;text-align:left;}
.vig-takes-group:hover{color:var(--cut-bright);}
.vig-takes-group .caret{color:var(--cut-dim);font-size:11px;width:10px;line-height:1;}
.vig-takes-group .name{flex:1;}
.vig-takes-group .tally{font-size:10px;color:var(--cut-faint);}
.vig-takes-group .tally.hot{color:var(--cut-accent-hi);}
.vig-takes-group.open .caret{color:var(--cut-soft);}
.vig-takes-param.differs .vig-takes-val{color:var(--cut-accent-hi);}
.vig-takes-param.absent .vig-takes-val{color:var(--cut-faint);}
.vig-takes-filter{margin-left:auto;flex:none;width:18px;height:16px;padding:0;
  border:0;border-radius:3px;background:none;color:var(--cut-faint);cursor:pointer;
  display:flex;align-items:center;justify-content:center;}
.vig-takes-param:hover .vig-takes-filter{color:var(--cut-dim);}
.vig-takes-filter:hover{background:rgba(var(--cut-ink-rgb),0.08);color:var(--cut-bright);}
.vig-takes-filter.on{color:#7aa2d8;background:rgba(122,162,216,0.16);}
.vig-takes-paramholder{display:flex;flex-direction:column;gap:3px;}
.vig-takes-also{display:flex;align-items:center;gap:4px;flex-wrap:wrap;
  padding-left:104px;margin-bottom:2px;}
.vig-takes-also .lead{font-size:10px;color:var(--cut-faint);}
.vig-takes-pill{border:0;border-radius:3px;padding:1px 6px;cursor:pointer;
  font-size:11px;background:var(--cut-raised);color:var(--cut-soft);}
.vig-takes-pill:hover{background:#33415a;color:#dce8fa;}
.vig-takes-foot{display:flex;gap:8px;align-items:center;padding:10px 16px;
  border-top:1px solid var(--cut-seam);}
.vig-takes-said{font-size:11px;color:var(--cut-dim);text-align:right;max-width:68%;}
.vig-takes-said:empty{display:none;}
.vig-takes-sweepmenu{position:fixed;z-index:1500;background:var(--cut-menu);
  border:1px solid var(--cut-edge);border-radius:6px;padding:5px;display:flex;
  flex-direction:column;gap:2px;box-shadow:0 12px 26px rgba(0,0,0,0.75);
  font-family:${UI_FONT};}
.vig-takes-sweephead{font-size:9px;color:var(--cut-dim);letter-spacing:0.08em;
  text-transform:uppercase;padding:1px 5px 3px;}
.vig-takes-rung{display:flex;align-items:center;gap:8px;background:none;
  border:none;border-radius:4px;padding:3px 6px;cursor:pointer;
  color:var(--cut-faint);font-size:15px;line-height:1;white-space:nowrap;}
.vig-takes-rung .stars{color:#e8c05a;letter-spacing:1px;}
.vig-takes-rung .note{font-size:10px;color:var(--cut-dim);
}
.vig-takes-rung:hover{background:rgba(var(--cut-accent-rgb),0.18);}
.vig-takes-said.bad{color:#e08c8c;}
.vig-takes-ask{position:absolute;inset:0;z-index:8;display:flex;align-items:center;
  justify-content:center;background:var(--cut-scrim);padding:26px;}
.vig-takes-askbox{background:var(--cut-menu);border:1px solid var(--cut-frame);border-radius:9px;
  padding:16px 18px;max-width:520px;display:flex;flex-direction:column;gap:10px;
  box-shadow:0 18px 50px rgba(0,0,0,.55);}
.vig-takes-asktext{font-size:12px;line-height:1.5;color:var(--cut-soft);white-space:pre-wrap;
  max-height:40vh;overflow:auto;word-break:break-all;}
.vig-takes-askrow{display:flex;gap:8px;justify-content:flex-end;}
`;
  document.head.appendChild(style);
}
