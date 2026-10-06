import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { buildCutterPanel, ensureStyles } from "./vig_h3_cutter_panel.js";
import { writeBoard } from "./vig_h3_cutter_model.js";
import { migrateCutterSockets } from "./vig_h3_cutter_migrate.js";
import { installPanelSlotTrim } from "./vig_h3_panel_slot.js";
import { folderDialog, pickFolder } from "./vig_h3_model_picker.js";
import { USAGE_ROUTE, installUsageLog } from "./vig_h3_usage.js";
const NODE_CLASS = "VigH3Cutter";
const EXTENSION_NAME = "VIG.MiniMaxH3.Cutter";
const WIDGET_NAME = "vig_h3_cutter_panel";
const BOARD_WIDGET = "board";
const ADOPTED_WIDGETS = ["board", "width", "height", "steps", "sampler_name", "scheduler", "join"];
const PROGRESS_EVENT = "vig.h3.cutter.progress";
const UPLOAD_ROUTE = "/upload/image";
const MIN_PANEL_HEIGHT = 620;
const MIN_NODE_WIDTH = 900;
const PANEL_CHROME = 199;
function safe(label, fn, fallback) {
  try {
    return fn();
  } catch (err) {
    console.error(`[VIG H3 Cutter] ${label}:`, err);
    return fallback;
  }
}
function chain(prototype, name, after) {
  const original = prototype[name];
  prototype[name] = function (...args) {
    const result = original ? original.apply(this, args) : undefined;
    safe(name, () => after.apply(this, args));
    return result;
  };
}
function widgetOf(node, name) {
  return node?.widgets?.find?.((w) => w && w.name === name) || null;
}
function numberOf(node, name, fallback) {
  const widget = widgetOf(node, name);
  const value = Number(widget?.value);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}
function originNode(node, socket) {
  const found = originLink(node, socket);
  return found ? found.node : null;
}
function originLink(node, socket) {
  const graph = node?.graph || app.graph;
  const linkInfo = (id) => {
    const table = graph?.links;
    if (!table || id == null) return null;
    return typeof table.get === "function" ? table.get(id) : table[id];
  };
  let slot = node?.inputs?.find?.((input) => input && input.name === socket);
  for (let hop = 0; hop < 16; hop += 1) {
    const info = slot ? linkInfo(slot.link) : null;
    const origin = info ? graph?.getNodeById?.(info.origin_id) : null;
    if (!origin) return null;
    const type = String(origin.type || "");
    if (type !== "Reroute" && type !== "RerouteNode" && type !== "ReroutePrimitive|pysssss") {
      return { node: origin, slot: Number(info.origin_slot) || 0 };
    }
    slot = origin.inputs?.[0];
  }
  return null;
}
const CANVAS_WATCH_MS = 700;
const RESOLUTION_RATIOS = {
  "1:1 (Square)": [1, 1],
  "2:3 (Portrait Photo)": [2, 3],
  "3:2 (Photo)": [3, 2],
  "3:4 (Portrait Standard)": [3, 4],
  "4:3 (Standard)": [4, 3],
  "9:16 (Portrait Widescreen)": [9, 16],
  "16:9 (Widescreen)": [16, 9],
  "21:9 (Ultrawide)": [21, 9],
};
function resolutionSelectorSize(selector) {
  const ratio = RESOLUTION_RATIOS[String(widgetOf(selector, "aspect_ratio")?.value)];
  const megapixels = Number(widgetOf(selector, "megapixels")?.value);
  const multiple = Number(widgetOf(selector, "multiple")?.value) || 8;
  if (!ratio || !(megapixels > 0)) return null;
  const scale = Math.sqrt((megapixels * 1024 * 1024) / (ratio[0] * ratio[1]));
  return {
    width: Math.round((ratio[0] * scale) / multiple) * multiple,
    height: Math.round((ratio[1] * scale) / multiple) * multiple,
  };
}
function numberHolder(node) {
  if ((node?.outputs || []).length > 1) return null;
  const widget = widgetOf(node, "value") || (node?.widgets || []).find((w) => w && w.type === "number");
  return widget && Number.isFinite(Number(widget.value)) ? widget : null;
}
function stateHolder(node) {
  const places = [];
  for (const [key, value] of Object.entries(node?.properties || {})) {
    places.push({ where: "property", key, value });
  }
  for (const widget of node?.widgets || []) {
    if (widget) places.push({ where: "widget", key: widget.name, value: widget.value, widget });
  }
  for (const place of places) {
    let state = place.value;
    let text = false;
    if (typeof state === "string" && state.trim().startsWith("{")) {
      try {
        state = JSON.parse(state);
        text = true;
      } catch (error) {
        continue;
      }
    }
    if (!state || typeof state !== "object" || Array.isArray(state)) continue;
    const keys = "w" in state && "h" in state
      ? ["w", "h"]
      : "width" in state && "height" in state ? ["width", "height"] : null;
    if (keys && Number(state[keys[0]]) > 0 && Number(state[keys[1]]) > 0) {
      return { ...place, state, text, keys };
    }
  }
  return null;
}
function sizeSource(node, name) {
  const input = node?.inputs?.find?.((i) => i && i.name === name);
  if (!input || input.link == null) {
    const widget = widgetOf(node, name);
    return widget ? { kind: "widget", node, widget } : null;
  }
  const from = originLink(node, name);
  if (!from) return null;
  if (String(from.node.type) === "ResolutionSelector") {
    return { kind: "selector", node: from.node, slot: from.slot };
  }
  const output = String(from.node.outputs?.[from.slot]?.name || "").toLowerCase();
  const index = output === "height" || (!output && from.slot === 1) ? 1 : 0;
  const same = widgetOf(from.node, index ? "height" : "width");
  if (same && Number.isFinite(Number(same.value))) {
    return { kind: "widget", node: from.node, widget: same };
  }
  const holder = numberHolder(from.node);
  if (holder) return { kind: "widget", node: from.node, widget: holder };
  const state = stateHolder(from.node);
  if (state) return { kind: "state", node: from.node, holder: state, index };
  return { kind: "unknown", node: from.node };
}
function sizeValue(source) {
  if (!source) return NaN;
  if (source.kind === "widget") return Number(source.widget.value);
  if (source.kind === "state") return Number(source.holder.state[source.holder.keys[source.index]]);
  if (source.kind === "selector") {
    const size = resolutionSelectorSize(source.node);
    return size ? (source.slot === 1 ? size.height : size.width) : NaN;
  }
  return NaN;
}
function writeStateSize(node, holder, width, height) {
  const next = { ...holder.state, [holder.keys[0]]: width, [holder.keys[1]]: height };
  if ("custom_w" in next && "custom_h" in next) {
    next.custom_w = width;
    next.custom_h = height;
    if ("mode" in next) next.mode = "custom";
  }
  const value = holder.text ? JSON.stringify(next) : next;
  if (holder.where === "property") {
    node.properties[holder.key] = value;
  } else {
    holder.widget.value = value;
    safe(`canvas ${holder.widget.name}`, () => holder.widget.callback?.(value, app.canvas, node));
  }
  safe("canvas redraw", () => node.onConfigure?.(node.serialize()));
  node.setDirtyCanvas?.(true, true);
}
function nameOfNode(node) {
  return String(node?.title || node?.type || "a node");
}
function snapCanvas(value) {
  const steps = value / 32;
  const floor = Math.floor(steps);
  const half = steps - floor === 0.5;
  const rounded = half ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(steps);
  return Math.max(32, rounded * 32);
}
function canvasOf(node) {
  const widgets = {
    width: numberOf(node, "width", 832),
    height: numberOf(node, "height", 480),
  };
  const slot = node?.inputs?.find?.((input) => input && input.name === "latent_image");
  if (!slot || slot.link == null) return { ...widgets, source: "widgets" };
  const origin = originNode(node, "latent_image");
  const width = sizeValue(sizeSource(origin, "width"));
  const height = sizeValue(sizeSource(origin, "height"));
  if (Number.isFinite(width) && width > 0 && Number.isFinite(height) && height > 0) {
    return { width: snapCanvas(width), height: snapCanvas(height), source: "latent" };
  }
  return { ...widgets, source: "latent-unknown" };
}
function setCanvasOf(node, width, height, aim = 0) {
  const slot = node?.inputs?.find?.((input) => input && input.name === "latent_image");
  const wired = !!(slot && slot.link != null);
  const target = wired ? originNode(node, "latent_image") : node;
  const put = (widget, owner, value) => {
    widget.value = value;
    safe(`canvas ${widget.name}`, () => widget.callback?.(value, app.canvas, owner));
    owner.setDirtyCanvas?.(true, true);
  };
  const w = sizeSource(target, "width");
  const h = sizeSource(target, "height");
  if (!target || !w || !h) {
    return {
      ok: false,
      message: `${nameOfNode(target)} has no width and height to set`,
    };
  }
  const where = [];
  let approx = "";
  if (w.kind === "selector" && h.kind === "selector" && w.node === h.node) {
    const selector = w.node;
    const want = aim > 0 ? aim : width / height;
    let best = null;
    for (const [label, [a, b]] of Object.entries(RESOLUTION_RATIOS)) {
      const miss = Math.abs(Math.log(a / b) - Math.log(want));
      if (!best || miss < best.miss) best = { label, miss };
    }
    const megapixels = Math.max(0.1, Math.min(16, Math.round(((width * height) / (1024 * 1024)) * 10) / 10));
    const ratioWidget = widgetOf(selector, "aspect_ratio");
    const mpWidget = widgetOf(selector, "megapixels");
    if (!ratioWidget || !mpWidget) {
      return { ok: false, message: `${nameOfNode(selector)} has no aspect_ratio and megapixels to set` };
    }
    put(ratioWidget, selector, best.label);
    put(mpWidget, selector, megapixels);
    where.push(nameOfNode(selector));
    if (best.miss > 0.01) {
      approx = `${nameOfNode(selector)} offers eight ratios, and ${best.label} is the nearest`;
    }
  } else if (w.kind === "state" && h.kind === "state" && w.node === h.node) {
    writeStateSize(w.node, w.holder, width, height);
    where.push(nameOfNode(w.node));
  } else {
    for (const source of [w, h]) {
      if (source.kind !== "widget") {
        return {
          ok: false,
          message: `the ${source === w ? "width" : "height"} comes from ${nameOfNode(source.node)}, ` +
            "which this console cannot set",
        };
      }
    }
    put(w.widget, w.node, width);
    put(h.widget, h.node, height);
    for (const owner of new Set([w.node, h.node])) where.push(nameOfNode(owner));
  }
  node.graph?.setDirtyCanvas?.(true, true);
  const landed = canvasOf(node);
  return {
    ok: true,
    wired,
    where: where.join(" and "),
    width: landed.width,
    height: landed.height,
    approx,
  };
}
function conceal(widget) {
  if (!widget) return;
  widget.type = "hidden";
  widget.computeSize = () => [0, -4];
  if (widget.inputEl) widget.inputEl.style.display = "none";
  const element = widget.element || widget.inputEl;
  if (element && element.parentElement) element.parentElement.style.display = "none";
}
function dropWidgetSockets(node) {
  if (!node || !Array.isArray(node.inputs)) return;
  node.inputs = node.inputs.filter(
    (input) => !(input && input.widget && ADOPTED_WIDGETS.includes(input.name)),
  );
}
async function uploadFile(file, kind) {
  const body = new FormData();
  body.append("image", file, file.name);
  body.append("type", "input");
  body.append("subfolder", "vig_h3_cutter");
  const response = await api.fetchApi(UPLOAD_ROUTE, { method: "POST", body });
  if (response.status !== 200) {
    throw new Error(`upload failed: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const source = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  return { source, label: file.name, kind };
}
const ACCEPT = { image: "image/*", video: "video/*", audio: "audio/*" };
function pickAsset(kind) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ACCEPT[kind] || "*/*";
    input.style.display = "none";
    document.body.appendChild(input);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(value);
    };
    input.addEventListener("change", async () => {
      const file = input.files && input.files[0];
      if (!file) return finish(null);
      try {
        finish(await uploadFile(file, kind));
      } catch (err) {
        console.error("[VIG H3 Cutter] could not upload the reference:", err);
        finish(null);
      }
    });
    input.addEventListener("cancel", () => finish(null));
    input.click();
  });
}
const PROJECT_FILE_ROUTE = "/vig/h3/cutter/project_file";
function insideFolder(path, root) {
  const norm = (value) => String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const folder = norm(root);
  return !!folder && norm(path).startsWith(`${folder}/`);
}
function viewUrl(path, projectRoot = "") {
  if (!path) return "";
  if (projectRoot && insideFolder(path, projectRoot)) {
    return api.apiURL(
      `${PROJECT_FILE_ROUTE}?root=${encodeURIComponent(projectRoot)}` +
        `&path=${encodeURIComponent(String(path))}&rand=${Math.random()}`,
    );
  }
  const clean = String(path).replace(/\\/g, "/");
  const marker = "/vig_h3_cutter/";
  const at = clean.indexOf(marker);
  if (at >= 0) {
    const tail = clean.slice(at + 1);
    const cut = tail.lastIndexOf("/");
    const subfolder = cut > 0 ? tail.slice(0, cut) : "";
    const name = cut > 0 ? tail.slice(cut + 1) : tail;
    const type = clean.includes("/input/") ? "input" : "output";
    return api.apiURL(
      `/view?filename=${encodeURIComponent(name)}&subfolder=${encodeURIComponent(
        subfolder,
      )}&type=${type}&rand=${Math.random()}`,
    );
  }
  const cut = clean.lastIndexOf("/");
  const subfolder = cut > 0 ? clean.slice(0, cut) : "";
  const name = cut > 0 ? clean.slice(cut + 1) : clean;
  return api.apiURL(
    `/view?filename=${encodeURIComponent(name)}&subfolder=${encodeURIComponent(
      subfolder,
    )}&type=input`,
  );
}
function attachPanel(node) {
  if (!node || node[WIDGET_NAME]) return null;
  if (typeof node.addDOMWidget !== "function") {
    console.warn("[VIG H3 Cutter] this frontend has no addDOMWidget; the console is disabled.");
    return null;
  }
  ensureStyles();
  const boardWidget = widgetOf(node, BOARD_WIDGET);
  for (const name of ADOPTED_WIDGETS) conceal(widgetOf(node, name));
  const readWidget = (name) => widgetOf(node, name)?.value;
  const writeWidget = (name, value) => {
    const widget = widgetOf(node, name);
    if (!widget) return;
    widget.value = value;
    safe(`widget ${name}`, () => widget.callback?.(value, app.canvas, node));
    node.graph?.setDirtyCanvas?.(true, false);
  };
  const panel = buildCutterPanel({
    onChange(board) {
      if (!boardWidget) return;
      const text = writeBoard(board);
      if (boardWidget.value !== text) {
        boardWidget.value = text;
        node.graph?.setDirtyCanvas?.(true, false);
      }
    },
    onRun(request) {
      queue(node, boardWidget, request);
    },
    uploadAsset: (file) => uploadFile(file, "image"),
    callRoute,
    pickFolder,
    folderDialog,
    pickAsset,
    viewUrl,
    getCanvas: () => canvasOf(node),
    setCanvas: (width, height, aim) => setCanvasOf(node, width, height, aim),
    getWidget: readWidget,
    setWidget: writeWidget,
    widgetOptions: (name) => {
      const widget = widgetOf(node, name);
      const values = widget?.options?.values;
      return Array.isArray(values) ? values : typeof values === "function" ? values(widget, node) : [];
    },
    modelWired: (socket) => {
      const input = (node.inputs || []).find((i) => i && i.name === socket);
      return !!(input && input.link != null);
    },
    filmWired: () => {
      const input = (node.inputs || []).find((i) => i && i.name === "storyboard");
      return !!(input && input.link != null);
    },
    filmSettings: () => {
      const source = originNode(node, "storyboard");
      const value = (name) => source?.widgets?.find?.((w) => w && w.name === name)?.value;
      if (source && source.type === "VigH3StoryboardJSON") {
        return {
          node: String(source.title || source.type),
          film: { json_source: String(value("source") ?? ""), title: "" },
          writer: {},
        };
      }
      if (!source || value("script") === undefined) return null;
      return {
        node: String(source.title || source.type || "Film Director"),
        film: {
          script: String(value("script") ?? ""),
          beat_seconds: value("beat_seconds"),
          total_seconds: value("total_seconds"),
          style: String(value("style") ?? "neutral"),
          carry_frames: value("carry_frames"),
          allow_music: !!value("allow_music"),
          title: String(value("title") ?? ""),
          references: String(value("references") ?? ""),
          video: String(value("video") ?? ""),
          video_frames: value("video_frames"),
          vision_model: String(value("vision_model") ?? ""),
        },
        writer: {
          use_provider: !!value("use_provider"),
          provider_url: String(value("provider_url") ?? ""),
          provider_model: String(value("provider_model") ?? ""),
          llm_model: String(value("llm_model") ?? ""),
          models_dir: String(value("models_dir") ?? ""),
          seed: Number(value("writer_seed")) || 0,
          temperature: Number(value("temperature")) || 1.0,
        },
      };
    },
    nodeId: () => String(node.id),
  });
  if (boardWidget && boardWidget.value) panel.setBoard(boardWidget.value);
  const widget = node.addDOMWidget(WIDGET_NAME, "div", panel.root, {
    serialize: false,
    hideOnZoom: false,
    getMinHeight: () => MIN_PANEL_HEIGHT,
  });
  let seenCanvas = "";
  const watchCanvas = () => {
    const now = canvasOf(node);
    const said = `${now.width}x${now.height}|${now.source}`;
    if (said === seenCanvas) return;
    const first = !seenCanvas;
    seenCanvas = said;
    if (!first) safe("canvas watch", () => panel.refresh());
  };
  watchCanvas();
  const canvasWatch = setInterval(watchCanvas, CANVAS_WATCH_MS);
  if (widget) {
    const previousRemove = widget.onRemove;
    widget.onRemove = function (...args) {
      if (previousRemove) safe("widget.onRemove", () => previousRemove.apply(this, args));
      safe("panel.destroy", () => panel.destroy());
      safe("fit.disconnect", () => node[WIDGET_NAME]?.fit?.disconnect());
      clearInterval(canvasWatch);
      node[WIDGET_NAME] = null;
    };
  }
  node[WIDGET_NAME] = { panel, fit: null };
  installPanelSlotTrim(node, WIDGET_NAME, (err) =>
    console.error("[VIG H3 Cutter] onSerialize:", err),
  );
  dropWidgetSockets(node);
  node[WIDGET_NAME].fit = fitToPanel(node, panel.root);
  return panel;
}
function fitToPanel(node, root) {
  const consoleHeight = () => {
    let bottom = 0;
    for (const child of root.children) {
      if (getComputedStyle(child).position === "absolute") continue;
      bottom = Math.max(bottom, child.offsetTop + child.offsetHeight);
    }
    return bottom;
  };
  let floorWidth = true;
  let queued = false;
  const fit = () => {
    queued = false;
    safe("fitToPanel", () => {
      if (typeof node.setSize !== "function" || node.flags?.collapsed) return;
      const needed = consoleHeight();
      if (!needed) return;
      const target = needed + PANEL_CHROME;
      const slack = root.clientHeight - needed;
      const width = Number(node.size?.[0]) || MIN_NODE_WIDTH;
      const narrow = floorWidth && width < MIN_NODE_WIDTH;
      floorWidth = false;
      if (!narrow && slack <= 1 && Number(node.size?.[1]) >= target) return;
      node.setSize([narrow ? MIN_NODE_WIDTH : width, target]);
      node.graph?.setDirtyCanvas?.(true, true);
    });
  };
  const soon = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(fit);
  };
  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(soon) : null;
  if (observer) observer.observe(root);
  soon();
  return observer;
}
let queueSerial = 0;
async function queue(node, boardWidget, request) {
  if (!boardWidget) return;
  cancelRestore(node);
  const base = safe("read board", () => JSON.parse(boardWidget.value || "{}"), {}) || {};
  delete base.only;
  delete base.force;
  delete base.run_id;
  delete base.reference_take;
  const withRequest = { ...base };
  if (request.only && request.only.length) withRequest.only = request.only;
  if (request.force && request.force.length) withRequest.force = request.force;
  if (request.reference_take) withRequest.reference_take = request.reference_take;
  withRequest.run_id = `${Date.now().toString(36)}-${(queueSerial += 1)}`;
  boardWidget.value = JSON.stringify(withRequest);
  const restore = () => stripRunRequest(boardWidget);
  try {
    const queued = await app.queuePrompt(0, 1);
    if (queued === false) armRestore(node, restore);
    else restore();
  } catch (err) {
    console.error("[VIG H3 Cutter] could not queue the run:", err);
    restore();
  }
}
function armRestore(node, restore) {
  if (!node) return;
  cancelRestore(node);
  const timer = setTimeout(() => fireRestore(node), 60000);
  node.__vigCutterRestore = { restore, timer };
}
function fireRestore(node) {
  const pending = node && node.__vigCutterRestore;
  if (!pending) return;
  node.__vigCutterRestore = null;
  clearTimeout(pending.timer);
  safe("restore board", pending.restore);
}
function cancelRestore(node) {
  const pending = node && node.__vigCutterRestore;
  if (!pending) return;
  node.__vigCutterRestore = null;
  clearTimeout(pending.timer);
}
function persistBoard(node) {
  if (!node) return;
  const holder = node[WIDGET_NAME];
  const widget = widgetOf(node, BOARD_WIDGET);
  if (!holder || !widget) return;
  cancelRestore(node);
  const text = writeBoard(holder.panel.getBoard());
  if (widget.value !== text) {
    widget.value = text;
    node.graph?.setDirtyCanvas?.(true, false);
  }
}
function stripRunRequest(widget) {
  if (!widget) return;
  const raw = safe("read board", () => JSON.parse(widget.value || "{}"), null);
  if (!raw || typeof raw !== "object") return;
  if (
    !("only" in raw) && !("force" in raw) && !("run_id" in raw)
    && !("reference_take" in raw)
  ) {
    return;
  }
  delete raw.only;
  delete raw.force;
  delete raw.run_id;
  delete raw.reference_take;
  widget.value = JSON.stringify(raw);
}
async function callRoute(route, payload, init) {
  const response = await api.fetchApi(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload || {}),
    ...(init || {}),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
  }
  if (response.status !== 200 || (data && data.ok === false)) {
    throw new Error(
      (data && data.error) || `${route} failed: ${response.status} ${response.statusText}`,
    );
  }
  return data || {};
}
let usageLog = null;
function journalRun(what, extra = {}) {
  safe("usage journal", () => usageLog?.event?.(`run/${what}`, extra));
}
function usageContext(target) {
  const cutters = (app.graph?._nodes || []).filter(
    (node) => node.type === NODE_CLASS && node[WIDGET_NAME]?.panel,
  );
  let node = cutters.find((n) => n[WIDGET_NAME].panel.root?.contains?.(target));
  if (!node && cutters.length === 1) node = cutters[0];
  if (!node) return null;
  const clip = node[WIDGET_NAME].panel.selectedId?.();
  return { node: Number(node.id), clip: Number(clip) };
}
function findNode(id) {
  const graph = app.graph;
  if (!graph || typeof graph.getNodeById !== "function") return null;
  const direct = graph.getNodeById(id);
  if (direct) return direct;
  const numeric = Number(id);
  return Number.isFinite(numeric) ? graph.getNodeById(numeric) || null : null;
}
app.registerExtension({
  name: EXTENSION_NAME,
  beforeConfigureGraph(graphData) {
    safe("migrate cutter sockets", () => {
      if (migrateCutterSockets(graphData)) {
        console.log(
          "[VIG H3 Cutter] migrated a saved workflow: sockets reordered to " +
            "model/ref_model-first (links renumbered); any dead scenario/plan " +
            "wires folded into the board.",
        );
      }
    });
  },
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== NODE_CLASS) return;
    chain(nodeType.prototype, "onNodeCreated", function () {
      attachPanel(this);
    });
    chain(nodeType.prototype, "onConnectionsChange", function (_type, index) {
      const holder = this[WIDGET_NAME];
      if (!holder) return;
      if (this.inputs?.[index]?.name !== "storyboard") return;
      safe("storyboard wire", () => holder.panel.renderFilmPull?.());
    });
    chain(nodeType.prototype, "onExecuted", function (message) {
      const holder = this[WIDGET_NAME];
      if (!holder) return;
      const payload = Array.isArray(message?.vig_h3_cutter)
        ? message.vig_h3_cutter[0]
        : message?.vig_h3_cutter;
      if (payload && payload.board) {
        holder.panel.setBoard(payload.board);
        holder.panel.setRunReport(payload.report || "");
        persistBoard(this);
      }
    });
    chain(nodeType.prototype, "onConfigure", function () {
      const holder = this[WIDGET_NAME];
      if (!holder) return;
      for (const name of ADOPTED_WIDGETS) conceal(widgetOf(this, name));
      dropWidgetSockets(this);
      const widget = widgetOf(this, BOARD_WIDGET);
      if (widget) {
        holder.panel.setBoard(widget.value);
        stripRunRequest(widget);
      }
      holder.panel.refresh();
    });
  },
  setup() {
    usageLog = safe("usage log", () =>
      installUsageLog({
        post: (body, init) => callRoute(USAGE_ROUTE, body, init),
        context: usageContext,
      }),
    );
    api.addEventListener(PROGRESS_EVENT, (event) => {
      safe("progress", () => {
        const detail = event?.detail;
        if (!detail) return;
        const node = findNode(detail.node_id);
        const panel = node && node[WIDGET_NAME] ? node[WIDGET_NAME].panel : null;
        if (!panel) return;
        if (detail.phase === "segment") {
          journalRun("clip", { node: Number(node.id), clip: Number(detail.segment_id),
                               status: String(detail.status || "") });
        } else if (detail.phase === "start") {
          journalRun("start", { node: Number(node.id),
                                clips: (detail.to_render || []).map(Number) });
        } else if (detail.phase === "done") {
          journalRun("done", { node: Number(node.id) });
        } else if (detail.phase === "reference" && detail.status !== "step") {
          journalRun("reference take", { node: Number(node.id) });
        }
        if (detail.phase === "segment") {
          panel.setSegmentStatus(detail.segment_id, detail.status, detail);
        } else if (detail.phase === "reference") {
          panel.setReferenceTake?.(detail);
        } else if (detail.phase === "agent") {
          panel.setAgentProgress(detail);
        } else if (detail.phase === "preview") {
          panel.setPreview(detail);
        } else if (detail.phase === "start") {
          fireRestore(node);
          panel.setRunStarted?.(detail);
          for (const id of detail.to_render || []) panel.setSegmentStatus(id, "queued");
        } else if (detail.phase === "done" && detail.board) {
          panel.setBoard(detail.board);
          panel.setRunReport(detail.report || "");
          persistBoard(node);
          if (detail.film_by_console) panel.joinFilmIfMoved?.();
        }
      });
    });
    const eachPanel = (fn) => {
      for (const node of app.graph?._nodes || []) {
        if (node.type !== NODE_CLASS) continue;
        const holder = node[WIDGET_NAME];
        if (holder) fn(holder.panel, node);
      }
    };
    const titleOf = (id) => {
      const node = findNode(id);
      if (!node) return `node ${id}`;
      return node.title || node.type || `node ${id}`;
    };
    api.addEventListener("execution_start", () => {
      safe("execution_start", () => {
        eachPanel((panel) =>
          panel.setRunActivity({
            phase: "running",
            headline: "the workflow is running…",
            line: "queued",
          }),
        );
      });
    });
    api.addEventListener("execution_cached", (event) => {
      safe("execution_cached", () => {
        const nodes = event?.detail?.nodes;
        if (!Array.isArray(nodes) || !nodes.length) return;
        eachPanel((panel) =>
          panel.setRunActivity({
            line: `${nodes.length} node(s) reused from ComfyUI's cache`,
          }),
        );
      });
    });
    api.addEventListener("executing", (event) => {
      safe("executing", () => {
        const id = event?.detail?.node ?? event?.detail;
        if (id === null || id === undefined) return;
        eachPanel((panel, node) => {
          const mine = String(node.id) === String(id);
          panel.setRunActivity({
            phase: "running",
            headline: mine ? "this console's node is running…" : "the workflow is running…",
            line: mine ? "reading the board and loading what the clips need" : `${titleOf(id)}…`,
          });
        });
      });
    });
    api.addEventListener("executed", (event) => {
      safe("executed", () => {
        const id = event?.detail?.node;
        if (id === undefined || id === null) return;
        eachPanel((panel) => panel.setRunActivity({ line: `${titleOf(id)} — done` }));
      });
    });
    api.addEventListener("execution_success", () => {
      journalRun("workflow finished");
      safe("execution_success", () => {
        eachPanel((panel) =>
          panel.setRunActivity({
            phase: "done",
            headline: "the workflow finished",
            line: "",
          }),
        );
      });
    });
    for (const [event, note, headline] of [
      [
        "execution_interrupted",
        "Run stopped from ComfyUI's queue.",
        "the workflow was stopped",
      ],
      [
        "execution_error",
        "The run failed; ComfyUI's own error dialog has the detail.",
        "the workflow failed",
      ],
    ]) {
      api.addEventListener(event, (payload) => {
        journalRun(event === "execution_error" ? "workflow failed" : "workflow stopped", {
          status: String(payload?.detail?.node_type || ""),
        });
        safe(event, () => {
          const detail = payload?.detail || {};
          const where = detail.node_type || (detail.node_id ? titleOf(detail.node_id) : "");
          const said = detail.exception_message
            ? `The run failed: ${String(detail.exception_message).split("\n")[0].slice(0, 400)}`
            : note;
          eachPanel((panel, node) => {
            fireRestore(node);
            panel.endRun(said, { stopped: event === "execution_interrupted" });
            panel.setRunActivity({
              phase: "failed",
              headline,
              line: where ? `stopped at ${where}` : "",
            });
          });
        });
      });
    }
  },
  onNodeOutputsUpdated(outputs) {
    if (!outputs || typeof outputs !== "object") return;
    for (const [id, output] of Object.entries(outputs)) {
      safe("onNodeOutputsUpdated", () => {
        const node = findNode(id);
        const panel = node && node[WIDGET_NAME] ? node[WIDGET_NAME].panel : null;
        if (!panel) return;
        const payload = Array.isArray(output?.vig_h3_cutter)
          ? output.vig_h3_cutter[0]
          : output?.vig_h3_cutter;
        if (payload && payload.board) {
          panel.setBoard(payload.board);
          panel.setRunReport(payload.report || "");
          persistBoard(node);
        }
      });
    }
  },
});
export { NODE_CLASS, PROGRESS_EVENT, viewUrl };
