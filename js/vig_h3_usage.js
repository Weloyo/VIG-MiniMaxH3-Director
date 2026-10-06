export const USAGE_ROUTE = "/vig/h3/usage";
export const FLUSH_MS = 20000;
export const MAX_LABEL = 40;
export const OFF_KEY = "vig.h3.usage";
export const JOURNAL_MAX = 2000;
export const JOURNAL_VALUE = 80;
export function journalValue(control) {
  if (!control) return undefined;
  const tag = String(control.tagName || "").toLowerCase();
  if (tag === "select") return String(control.value ?? "").slice(0, JOURNAL_VALUE);
  if (tag !== "input") return undefined;
  const type = String(control.type || "text").toLowerCase();
  if (type === "checkbox" || type === "radio") return !!control.checked;
  if (type === "number" || type === "range") {
    return String(control.value ?? "").slice(0, JOURNAL_VALUE);
  }
  return undefined;
}
export function journalSkips(control, kind) {
  if (kind !== "click" || !control) return false;
  const tag = String(control.tagName || "").toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  const type = String(control.type || "text").toLowerCase();
  return !["checkbox", "radio", "button", "submit", "file"].includes(type);
}
export const NAMELESS = new Set([
  "refedit/part",
  "refedit/take",
  "takes/card",
  "cutter/block",
  "cutter/vblock",
  "cutter/aclip",
  "writer/tag",
]);
export const AREAS = new Set(["cutter", "refedit", "takes", "writer"]);
const VIG = /^vig-([a-z0-9]+)-([a-z0-9]+)/;
const CONTROLS = "button,input,select,textarea,a";
const FIELDS = ".vig-cutter-field, .vig-refedit-dial, .vig-refedit-line";
const FORM = "input,select,textarea";
const HEADS = ".vig-cutter-section-head, .vig-cutter-group, .vig-refedit-block";
const HAS_WORD = /[a-z]/i;
function vigClass(node) {
  const list = node && node.classList;
  if (!list) return null;
  for (const cls of list) {
    const hit = VIG.exec(cls);
    if (hit) return { area: hit[1], role: hit[2] };
  }
  return null;
}
export function tidy(text) {
  return String(text == null ? "" : text)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[/\\|]+/g, " ")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_LABEL)
    .trim()
    .replace(/[\s.,:;·—–-]+$/, "");
}
export function caption(text) {
  const words = String(text == null ? "" : text).replace(/\s+/g, " ").trim();
  return words.length <= MAX_LABEL ? words : "";
}
function fieldLabel(node) {
  const field = node.closest && node.closest(FIELDS);
  if (!field) return "";
  for (const selector of ["label", ".vig-cutter-label", "span"]) {
    const lab = field.querySelector(selector);
    const text = lab ? (lab.textContent || "").trim() : "";
    if (text) return text;
  }
  return "";
}
export function labelOf(node) {
  if (node.dataset && node.dataset.log) return node.dataset.log;
  const tag = (node.tagName || "").toLowerCase();
  const title = node.getAttribute("title") || node.getAttribute("aria-label") || "";
  if (tag === "input" || tag === "select" || tag === "textarea") {
    const field = node.closest && node.closest(FIELDS);
    if (field && field.querySelectorAll(FORM).length > 1) return title;
    return (
      fieldLabel(node) ||
      node.getAttribute("placeholder") ||
      node.getAttribute("name") ||
      title
    );
  }
  const text = node.textContent || "";
  if (HAS_WORD.test(text) && caption(text)) return caption(text);
  if (title) return title;
  const head = node.closest && node.closest(HEADS);
  return caption(head && head.textContent) || caption(text);
}
function roleOf(node, own) {
  if (own) return own.role;
  const tag = (node.tagName || "").toLowerCase();
  if (tag === "input") {
    return `input:${(node.getAttribute("type") || "text").toLowerCase()}`;
  }
  return tag || "node";
}
export function nameOf(target) {
  let control = null;
  let node = target;
  while (node && node.nodeType === 1) {
    if ((node.matches && node.matches(CONTROLS)) || vigClass(node)) {
      control = node;
      break;
    }
    node = node.parentElement;
  }
  if (!control) return "";
  const own = vigClass(control);
  let area = own && AREAS.has(own.area) ? own.area : "";
  for (let up = control.parentElement; !area && up && up.nodeType === 1; ) {
    const hit = vigClass(up);
    if (hit && AREAS.has(hit.area)) area = hit.area;
    up = up.parentElement;
  }
  if (!area) return "";
  const key = `${area}/${roleOf(control, own)}`;
  if (NAMELESS.has(key)) return key;
  const label = tidy(labelOf(control));
  return label ? `${key}/${label}` : key;
}
export function inventory(doc = document) {
  const names = new Set();
  for (const node of doc.querySelectorAll(CONTROLS)) {
    const name = nameOf(node);
    if (name) names.add(name);
  }
  return [...names];
}
export function installUsageLog({ post, doc = document, win = window, context } = {}) {
  if (!doc || doc.__vigUsageLog) return doc && doc.__vigUsageLog;
  if (typeof post !== "function") return null;
  const pending = new Map();
  const seen = new Set();
  let journal = [];
  const session = Math.random().toString(36).slice(2, 10);
  let sending = false;
  let timer = null;
  const where = (target) => {
    try {
      const got = typeof context === "function" ? context(target) : null;
      const out = {};
      if (got && Number.isInteger(got.node)) out.node = got.node;
      if (got && Number.isInteger(got.clip)) out.clip = got.clip;
      return out;
    } catch {
      return {};
    }
  };
  function mark(kind, name, extra = {}, target = null) {
    if (!name || off()) return;
    if (journal.length >= JOURNAL_MAX) journal.shift();
    journal.push({ at: new Date().toISOString(), kind, name, ...where(target), ...extra });
  }
  const off = () => {
    try {
      return win.localStorage.getItem(OFF_KEY) === "off";
    } catch {
      return false;
    }
  };
  function note(name) {
    if (!name) return;
    const entry = pending.get(name) || { count: 0, fresh: !seen.has(name) };
    entry.count += 1;
    pending.set(name, entry);
    seen.add(name);
  }
  async function flush(init) {
    if (sending) return;
    let present = [];
    try {
      present = off() ? [] : inventory(doc);
    } catch {
    }
    if (!pending.size && !present.length && !journal.length) return;
    const batch = [...pending.entries()].map(([name, e]) => ({
      name,
      count: e.count,
      fresh: e.fresh,
    }));
    pending.clear();
    const lines = journal;
    journal = [];
    sending = true;
    try {
      await post({ events: batch, present, journal: lines, session }, init);
    } catch {
      journal = lines.concat(journal).slice(-JOURNAL_MAX);
      for (const e of batch) {
        const back = pending.get(e.name) || { count: 0, fresh: e.fresh };
        back.count += e.count;
        back.fresh = back.fresh || e.fresh;
        pending.set(e.name, back);
      }
    } finally {
      sending = false;
    }
  }
  const onUse = (event) => {
    try {
      if (off()) return;
      const name = nameOf(event.target);
      note(name);
      if (!name) return;
      const control =
        typeof event.target?.closest === "function" ? event.target.closest(FORM) : null;
      if (journalSkips(control, event.type)) return;
      const value = event.type === "change" ? journalValue(control) : undefined;
      mark(event.type, name, value === undefined ? {} : { value }, event.target);
    } catch {
    }
  };
  doc.addEventListener("click", onUse, true);
  doc.addEventListener("change", onUse, true);
  const onLeave = () => flush({ keepalive: true });
  win.addEventListener("pagehide", onLeave);
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState === "hidden") onLeave();
  });
  timer = win.setInterval(() => flush(), FLUSH_MS);
  const handle = {
    flush,
    pending,
    event(name, extra = {}) {
      mark("run", name, extra);
    },
    session,
    stop() {
      doc.removeEventListener("click", onUse, true);
      doc.removeEventListener("change", onUse, true);
      win.removeEventListener("pagehide", onLeave);
      win.clearInterval(timer);
      doc.__vigUsageLog = null;
    },
  };
  doc.__vigUsageLog = handle;
  return handle;
}
