const NODE_CLASS = "VigH3Cutter";
const DEAD_INPUTS = new Set(["scenario", "plan"]);
const SOCKET_ORDER = [
  "model", "ref_model", "clip", "vae", "audio_vae", "latent_image",
  "storyboard",
];
function textOf(node) {
  const values = Array.isArray(node?.widgets_values) ? node.widgets_values : [];
  const found = values.find((value) => typeof value === "string");
  return found === undefined ? "" : found;
}
function linkById(graph, id) {
  const links = Array.isArray(graph?.links) ? graph.links : [];
  return links.find((entry) => Array.isArray(entry) && entry[0] === id) || null;
}
function nodeById(graph, id) {
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return nodes.find((node) => node && node.id === id) || null;
}
function removeLink(graph, id) {
  const entry = linkById(graph, id);
  if (Array.isArray(graph.links)) {
    graph.links = graph.links.filter((row) => !Array.isArray(row) || row[0] !== id);
  }
  if (!entry) return;
  const origin = nodeById(graph, entry[1]);
  for (const output of Array.isArray(origin?.outputs) ? origin.outputs : []) {
    if (Array.isArray(output?.links)) {
      output.links = output.links.filter((linkId) => linkId !== id);
    }
  }
}
function adoptScenario(cutter, text) {
  if (!text || !Array.isArray(cutter.widgets_values)) return;
  const raw = cutter.widgets_values[0];
  let board = {};
  if (typeof raw === "string" && raw.trim()) {
    try {
      board = JSON.parse(raw);
    } catch {
      return;
    }
    if (!board || typeof board !== "object" || Array.isArray(board)) return;
  }
  if (typeof board.scenario === "string" && board.scenario.trim()) return;
  board.scenario = text;
  cutter.widgets_values[0] = JSON.stringify(board);
}
function reorderSockets(graph, node) {
  const inputs = node.inputs;
  const sockets = [];
  for (const name of SOCKET_ORDER) {
    const entry = inputs.find((input) => input && input.name === name);
    if (entry) sockets.push(entry);
  }
  const rest = inputs.filter((input) => !sockets.includes(input));
  const next = sockets.concat(rest);
  if (next.every((entry, index) => inputs[index] === entry)) return false;
  const rows = new Map();
  for (const entry of next) {
    if (entry && entry.link != null) {
      const row = linkById(graph, entry.link);
      if (!row) return false;
      rows.set(entry, row);
    }
  }
  node.inputs = next;
  next.forEach((entry, index) => {
    const row = rows.get(entry);
    if (row) row[4] = index;
  });
  return true;
}
export function migrateCutterSockets(graph) {
  let moved = false;
  for (const node of Array.isArray(graph?.nodes) ? graph.nodes : []) {
    if (!node || node.type !== NODE_CLASS || !Array.isArray(node.inputs)) continue;
    const dead = node.inputs.filter((input) => input && DEAD_INPUTS.has(input.name));
    for (const input of dead) {
      if (input.name === "scenario" && input.link != null) {
        const entry = linkById(graph, input.link);
        const source = entry ? nodeById(graph, entry[1]) : null;
        adoptScenario(node, textOf(source));
      }
      if (input.link != null) removeLink(graph, input.link);
    }
    if (dead.length) {
      node.inputs = node.inputs.filter((input) => !input || !DEAD_INPUTS.has(input.name));
      moved = true;
    }
    for (const [name, type] of [
      ["latent_image", "LATENT"],
      ["ref_model", "MODEL"],
      ["storyboard", "VIG_H3_STORYBOARD"],
    ]) {
      if (!node.inputs.some((input) => input && input.name === name)) {
        node.inputs.push({ name, type, shape: 7, link: null });
        moved = true;
      }
    }
    if (reorderSockets(graph, node)) moved = true;
    for (const input of node.inputs) {
      if (input && SOCKET_ORDER.includes(input.name) && input.name !== "model") {
        if (input.shape !== 7) {
          input.shape = 7;
          moved = true;
        }
      }
    }
  }
  return moved;
}
