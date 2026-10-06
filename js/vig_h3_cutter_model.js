export const FPS = 24;
export const GRID_STEP = 17;
export const MIN_SEGMENT_SECONDS = 1;
export const MAX_SEGMENT_SECONDS = 15;
export const MAX_LOADED_SECONDS = 60;
export const DEFAULT_SEGMENT_SECONDS = 8;
export const TRAINED_MIN_FRAMES = 107;
export const MAX_SEGMENTS = 60;
export const MAX_AUDIO_CLIPS = 12;
export const MAX_LIBRARY_REFS = 24;
export const MAX_SEGMENT_REFS = 3;
export const SEGMENT_REF_CAPS = { image: 9, video: 3, audio: 3 };
export const PROMPT_LANGS = ["EN", "ZH", "RU"];
export const REF_ORIGINS = ["library", "segment"];
export const PREVIEW_RES = ["draft", "half", "full"];
export const PREVIEW_RES_PIXELS = { draft: 512, half: 1024, full: 0 };
export const PREVIEW_MAX_RES = [0, 512, 768, 1024, 1536, 2048];
export const PREVIEW_QUALITY = [50, 65, 80, 90, 100];
export const TINY_VAE_AUTO = "auto";
export const PREVIEW_FPS = [8, 12, 24];
export const PREVIEW_EVERY = [0, 1, 2, 4];
export const PROMPT_INPUTS = [
  "script", "style", "camera", "camera_amplitude", "camera_speed",
  "mode", "seconds", "prompt_lang",
  "max_shots", "skills", "writer_model", "writer_seed", "writer_temperature",
];
export const WRITER_INPUTS = ["writer_model", "writer_seed", "writer_temperature"];
export const PROMPT_INPUT_NAMES = {
  prompt_lang: "language", camera_amplitude: "camera amplitude",
  camera_speed: "camera speed", seconds: "length", max_shots: "shot count",
  skills: "skills", writer_model: "writing model", writer_seed: "writer seed",
  writer_temperature: "writer temperature",
};
export function writerInputs(board) {
  const w = (board && board.writer) || {};
  const provider = !!(w.use_provider && w.provider_url);
  return {
    writer_model: provider
      ? `provider:${w.provider_url}|${w.provider_model || ""}`
      : `local:${w.llm_model || ""}`,
    writer_seed: String(Math.max(0, Math.trunc(Number(w.seed) || 0))),
    writer_temperature: String(Math.round(Number(w.temperature ?? 1) * 1000) / 1000),
  };
}
export function seedMovesByItself(board) {
  return !!board && (board.writer_seed_mode || "fixed") !== "fixed";
}
export function promptInputs(seg, board) {
  const out = {};
  const writer = board ? writerInputs(board) : {};
  for (const name of PROMPT_INPUTS) {
    if (WRITER_INPUTS.includes(name)) {
      if (board) out[name] = writer[name];
    } else if (name === "skills") {
      out[name] = (Array.isArray(seg.skills) ? seg.skills : [])
        .filter(Boolean).map(String).sort().join(",");
    } else {
      out[name] = seg[name] ?? "";
    }
  }
  return out;
}
export function promptDrift(seg, board) {
  if (!String(seg.prompt || "").trim()) return [];
  const from = seg.prompt_from;
  if (!from || typeof from !== "object" || !Object.keys(from).length) return [];
  const now = promptInputs(seg, board);
  const loose = seedMovesByItself(board);
  return PROMPT_INPUTS.filter((name) => {
    if (!(name in from)) return false;
    if (WRITER_INPUTS.includes(name) && !board) return false;
    if (name === "writer_seed" && loose) return false;
    return String(now[name] ?? "") !== String(from[name] ?? "");
  });
}
export const CAMERA_MOTIONS = [
  "Zoom In",
  "Zoom Out",
  "Push In",
  "Pull Out",
  "Pan Left",
  "Pan Right",
  "Truck Left",
  "Truck Right",
  "Tilt Up",
  "Tilt Down",
  "Pedestal Up",
  "Pedestal Down",
  "Arc Shot",
  "Tracking Shot",
  "Static Shot",
  "Shake Slightly",
  "Shake Strongly",
  "POV",
  "Roll Clockwise",
  "Roll Counterclockwise",
];
export const CAMERA_AMPLITUDES = ["", "small", "large"];
export const CAMERA_SPEEDS = ["", "slow", "fast"];
export const MOTIONS_WITHOUT_MODIFIERS = new Set(["Static Shot", "POV"]);
export const MODES = {
  t2va: { label: "T2VA", color: "#c9a26b", title: "Text to video. Prompt only." },
  i2va: {
    label: "I2VA",
    color: "#6ea8d8",
    title: "Opens on a first frame — by default the previous clip's last frame.",
  },
  fl2va: {
    label: "FL2VA",
    color: "#6fbf9e",
    title: "Opens on a first frame and lands on a last frame you supply.",
  },
  l2va: {
    label: "L2VA",
    color: "#c98fae",
    title: "Lands on a last frame you supply. Nothing fixed at the start.",
  },
  ref2va: {
    label: "REF2VA",
    color: "#9b8fd6",
    title: "Omni-reference: subjects, style and sound carried from the library.",
  },
};
export const LOADED_BADGE = {
  label: "VIDEO",
  color: "#93a1ad",
  title:
    "Loaded from disk. Nothing generates this clip — it is cut to length and played, " +
    "and the clip after it can continue it with carried motion.",
};
export const badgeFor = (seg) => (seg && seg.source_clip ? LOADED_BADGE : MODES[seg.mode]);
export const MODE_KEYS = ["t2va", "i2va", "fl2va", "l2va", "ref2va"];
export const MODE_FIRST_FRAME = new Set(["i2va", "fl2va"]);
export const MODE_LAST_FRAME = new Set(["fl2va", "l2va"]);
export const STATUSES = {
  queued: { label: "Queued", color: "#8a847a" },
  generating: { label: "Generating", color: "#b68235" },
  ready: { label: "Ready", color: "#6fae7f" },
  stale: { label: "Changed since render", color: "#8f7fd1" },
  error: { label: "Error", color: "#c0665a" },
};
export const REF_KINDS = ["image", "video", "audio"];
function asInt(value, fallback = 0) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}
function asFloat(value, fallback = 0) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n : fallback;
}
function asString(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function asBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["1", "true", "yes", "on"].includes(value.toLowerCase());
  return fallback;
}
function oneOf(value, options, fallback) {
  const text = asString(value).trim().toLowerCase();
  return options.includes(text) ? text : fallback;
}
export function snapSeconds(seconds, ceiling = MAX_SEGMENT_SECONDS) {
  const value = Math.round(asFloat(seconds, DEFAULT_SEGMENT_SECONDS));
  if (!Number.isFinite(value)) return DEFAULT_SEGMENT_SECONDS;
  return Math.max(MIN_SEGMENT_SECONDS, Math.min(ceiling, value));
}
export const maxSecondsFor = (seg) => {
  if (seg && seg.source_clip) return MAX_LOADED_SECONDS;
  const asked = Math.max(0, Number(seg && seg.context_frames) || 0);
  const run = asked ? snapToRunGrid(asked) : 0;
  if (run <= 0) return MAX_SEGMENT_SECONDS;
  const room = MAX_SEGMENT_FRAMES - run;
  for (let whole = MAX_SEGMENT_SECONDS; whole > MIN_SEGMENT_SECONDS; whole -= 1) {
    if (alignFrames(whole * FPS) <= room) return whole;
  }
  return MIN_SEGMENT_SECONDS;
};
export const segmentFrames = (seg) => framesFor(seg.seconds, maxSecondsFor(seg));
export function cutPoints(frames) {
  const points = [];
  for (let end = 5; end <= frames; end += GRID_STEP) points.push(end);
  return points;
}
export function arrivalPoints(frames) {
  const points = [];
  for (let start = 0; start + 5 <= frames; start += GRID_STEP) points.push(start);
  return points;
}
export const CONTEXT_RUNS = [5, 22, 39, 56];
export const DEFAULT_CONTEXT_RUN = 22;
export const DEFAULT_CONTEXT_AUDIO = 24;
export function alignFrames(frames) {
  let n = Math.max(5, Math.round(frames));
  while (n % GRID_STEP !== 5) n += 1;
  return n;
}
export function framesFor(seconds, ceiling = MAX_SEGMENT_SECONDS) {
  return alignFrames(snapSeconds(seconds, ceiling) * FPS);
}
export function overshoot(seconds) {
  const whole = snapSeconds(seconds);
  return framesToSeconds(framesFor(whole)) - whole;
}
export const framesToSeconds = (frames) => frames / FPS;
export const secondsToFrames = (seconds) => framesFor(seconds);
export const MIN_SEGMENT_FRAMES = framesFor(MIN_SEGMENT_SECONDS);
export const MAX_SEGMENT_FRAMES = framesFor(MAX_SEGMENT_SECONDS);
export const MAX_LOADED_FRAMES = framesFor(MAX_LOADED_SECONDS, MAX_LOADED_SECONDS);
export const RUN_GRID = [124, 107, 90, 73, 56, 39, 22, 5, 1];
export function snapToRunGrid(n) {
  for (const point of RUN_GRID) if (point <= n) return point;
  return 1;
}
export function carriedRun(seg) {
  const asked = Math.max(0, Number(seg.context_frames) || 0);
  if (asked <= 1 || seg.source_clip) return 0;
  const headroom = MAX_SEGMENT_FRAMES - segmentFrames(seg);
  if (headroom < RUN_GRID[RUN_GRID.length - 1]) return 0;
  return Math.min(snapToRunGrid(asked), snapToRunGrid(headroom));
}
export function carriedTail(seg) {
  const asked = Math.max(0, Number(seg.tail_frames) || 0);
  if (!asked || seg.source_clip || carriedRun(seg)) return 0;
  const headroom = MAX_SEGMENT_FRAMES - segmentFrames(seg);
  if (headroom < RUN_GRID[RUN_GRID.length - 1]) return 0;
  return Math.min(snapToRunGrid(asked), snapToRunGrid(headroom));
}
export function pinnedRun(seg) {
  return carriedRun(seg) || carriedTail(seg);
}
export const MODE_WITHOUT_OPENING = { i2va: "t2va", fl2va: "l2va" };
export const MODE_WITHOUT_CLOSING = { l2va: "t2va", fl2va: "i2va" };
export function effectiveMode(seg) {
  const mode = seg.mode || "t2va";
  if (carriedRun(seg) > 0) return MODE_WITHOUT_OPENING[mode] || mode;
  if (carriedTail(seg) > 0) return MODE_WITHOUT_CLOSING[mode] || mode;
  return mode;
}
export function relabelFilmOf(stamp, changes) {
  const parts = String(stamp || "").split("|");
  for (const [index, from, to] of changes) {
    const entry = parts[index + 1];
    if (entry === undefined) continue;
    const fields = entry.split(":");
    if (fields.length >= 5 && fields[fields.length - 2] === from) {
      fields[fields.length - 2] = to;
      parts[index + 1] = fields.join(":");
    }
  }
  return parts.join("|");
}
export function settleCarriedMode(seg) {
  if (!seg || seg.source_clip) return "";
  const from = seg.mode || "t2va";
  let to = from;
  let slot = "";
  if (carriedRun(seg) && MODE_WITHOUT_OPENING[from]) {
    to = MODE_WITHOUT_OPENING[from];
    slot = "first";
  } else if (carriedTail(seg) && MODE_WITHOUT_CLOSING[from]) {
    to = MODE_WITHOUT_CLOSING[from];
    slot = "last";
  }
  if (to === from) return "";
  seg.mode = to;
  seg.refs = (seg.refs || []).filter(
    (r) => !(r.kind === "image" && String(r.uid || "").startsWith(slot)),
  );
  if (seg.prompt_from && typeof seg.prompt_from === "object" && seg.prompt_from.mode === from) {
    seg.prompt_from.mode = to;
  }
  return from;
}
export function sampleFrames(seg) {
  const run = pinnedRun(seg);
  const own = segmentFrames(seg);
  if (!run) return own;
  return Math.min(MAX_SEGMENT_FRAMES, Math.max(own + run, alignFrames(own + run)));
}
export function deliveredFrames(seg) {
  const run = pinnedRun(seg);
  return run ? sampleFrames(seg) - run : segmentFrames(seg);
}
export const DEFAULT_SEGMENT_FRAMES = framesFor(DEFAULT_SEGMENT_SECONDS);
export function formatClock(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}
export function formatDuration(seconds) {
  return `${seconds.toFixed(2)} s`;
}
function readRef(raw, fallbackKind) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    uid: asString(data.uid),
    kind: oneOf(data.kind, REF_KINDS, fallbackKind),
    label: asString(data.label),
    source: asString(data.source),
    tag: asString(data.tag),
    frame: asString(data.frame),
  };
}
function readLibraryRef(raw) {
  const origin = asString(raw && raw.origin).trim().toLowerCase();
  return {
    ...readRef(raw, "image"),
    origin: origin === "writer" || origin === "library" ? "library" : "segment",
  };
}
function langOf(value) {
  const text = asString(value).trim().toUpperCase();
  return PROMPT_LANGS.includes(text) ? text : "EN";
}
function previewResOf(data) {
  if (data.preview_max_res !== undefined && data.preview_max_res !== null) {
    return Math.max(0, Math.min(8192, asInt(data.preview_max_res, 1024)));
  }
  const old = String(data.preview_res || "").trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(PREVIEW_RES_PIXELS, old)) {
    return PREVIEW_RES_PIXELS[old];
  }
  return 1024;
}
function tinyVaeOf(value) {
  if (typeof value === "boolean") return value ? TINY_VAE_AUTO : "";
  if (value === undefined || value === null) return TINY_VAE_AUTO;
  return String(value).trim();
}
function everyOf(value) {
  const n = Math.max(0, asInt(value, 1));
  return PREVIEW_EVERY.reduce((best, option) =>
    Math.abs(option - n) < Math.abs(best - n) ? option : best,
  );
}
function fpsOf(value) {
  const n = asInt(value, 12);
  return PREVIEW_FPS.reduce((best, option) =>
    Math.abs(option - n) < Math.abs(best - n) ? option : best,
  );
}
function readRefs(raw) {
  const taken = { image: 0, video: 0, audio: 0 };
  const out = [];
  for (const item of Array.isArray(raw) ? raw : []) {
    const ref = readRef(item, "video");
    if (taken[ref.kind] >= SEGMENT_REF_CAPS[ref.kind]) continue;
    taken[ref.kind] += 1;
    out.push(ref);
  }
  return out;
}
function readSegment(raw, index) {
  const data = raw && typeof raw === "object" ? raw : {};
  let seconds = data.seconds;
  if (seconds === undefined) {
    seconds =
      data.frames !== undefined
        ? framesToSeconds(asInt(data.frames, DEFAULT_SEGMENT_FRAMES))
        : data.duration;
  }
  const camera = asString(data.camera).trim();
  return {
    id: asInt(data.id, index + 1),
    name: asString(data.name),
    seconds: snapSeconds(seconds),
    mode: oneOf(data.mode, MODE_KEYS, "t2va"),
    script: asString(data.script),
    style: asString(data.style).trim(),
    camera: CAMERA_MOTIONS.includes(camera) ? camera : "",
    camera_amplitude: oneOf(data.camera_amplitude, CAMERA_AMPLITUDES, ""),
    camera_speed: oneOf(data.camera_speed, CAMERA_SPEEDS, ""),
    prompt: formatPrompt(asString(data.prompt)),
    seed: Math.max(0, asInt(data.seed, 0)),
    locked: asBool(data.locked),
    audio: asBool(data.audio, true),
    music: asBool(data.music, true),
    music_stash: asString(data.music_stash),
    prompt_lang: langOf(data.prompt_lang),
    prompt_from:
      data.prompt_from && typeof data.prompt_from === "object" ? { ...data.prompt_from } : {},
    written_by:
      data.written_by && typeof data.written_by === "object" && !Array.isArray(data.written_by)
        ? { ...data.written_by } : {},
    prompt_pre: asString(data.prompt_pre),
    lang_pre: asString(data.lang_pre),
    prompt_edited: asBool(data.prompt_edited),
    rebuilt: asBool(data.rebuilt),
    max_shots: Math.max(0, Math.min(8, asInt(data.max_shots, 0))),
    skills: Array.isArray(data.skills)
      ? data.skills.map((id) => String(id)).filter(Boolean)
      : [],
    context_frames: Math.max(0, Math.min(56, asInt(data.context_frames, 0))),
    context_audio: Math.max(0, Math.min(240, asInt(data.context_audio, 0))),
    tail_frames: Math.max(0, Math.min(56, asInt(data.tail_frames, 0))),
    tail_audio: Math.max(0, Math.min(240, asInt(data.tail_audio, 0))),
    tail_at: Math.max(0, asInt(data.tail_at, 0)),
    context_at: Math.max(0, asInt(data.context_at, 0)),
    made_tail_at: madeAt(data.made_tail_at),
    made_context_at: madeAt(data.made_context_at),
    made_frames: madeAt(data.made_frames),
    status: liveStatusAtRest(
      oneOf(data.status, Object.keys(STATUSES), "queued"),
      asString(data.clip),
    ),
    refs: readRefs(data.refs),
    source_clip: asString(data.source_clip),
    clip_name: asString(data.clip_name),
    cache_key: asString(data.cache_key),
    take_key: asString(data.take_key),
    error: asString(data.error),
    poster: asString(data.poster),
    clip: asString(data.clip),
  };
}
function readAudioClip(raw, index) {
  const data = raw && typeof raw === "object" ? raw : {};
  const seconds = data.seconds !== undefined ? data.seconds : data.duration;
  return {
    id: asInt(data.id, index + 1),
    seconds: Math.max(0.25, Math.min(600, asFloat(seconds, 5))),
    muted: asBool(data.muted),
    locked: asBool(data.locked),
    label: asString(data.label),
    source: asString(data.source),
    gain: Math.max(0, Math.min(4, asFloat(data.gain, 1))),
  };
}
function readWriter(raw) {
  const data = raw && typeof raw === "object" ? raw : {};
  return {
    models_dir: asString(data.models_dir),
    seed: Math.max(0, asInt(data.seed, 0)),
    temperature: Math.max(0, Math.min(2, asFloat(data.temperature, 1))),
    ...readWriterModels(data),
  };
}
function readWriterModels(data) {
  const url = asString(data.provider_url).trim();
  const legacy = !!url && !("use_provider" in data);
  let local = asString(data.llm_model);
  let remote = asString(data.provider_model);
  if (legacy && !remote) {
    remote = local;
    local = "";
  }
  return {
    llm_model: local,
    use_provider: legacy ? true : asBool(data.use_provider),
    provider_url: url,
    provider_model: remote,
  };
}
function liveStatusAtRest(status, clip) {
  if (status !== "generating") return status;
  return clip ? "stale" : "queued";
}
export const PROMPT_FIELDS = [
  "subject_definitions",
  "summary",
  "retention_analysis",
  "detailed_description",
  "integrated_multimodal_description",
  "overall_soundscape",
  "non_diegetic_music",
];
const FIELD_HEAD_RE = new RegExp(
  "(^|[^\n])[ \t]*(" + PROMPT_FIELDS.join("|") + "):",
  "g",
);
const SHOT_MARKER_RE = /\[Shot\s+\d+\]/g;
function breakShotHeadings(line) {
  SHOT_MARKER_RE.lastIndex = 0;
  let out = "";
  let cursor = 0;
  let match;
  while ((match = SHOT_MARKER_RE.exec(line)) !== null) {
    const ahead = line.slice(0, match.index);
    let depth = 0;
    for (const ch of ahead) {
      if (ch === "(") depth += 1;
      else if (ch === ")" && depth > 0) depth -= 1;
    }
    const before = line.slice(cursor, match.index);
    const inSentence = depth > 0;
    const hasContent = (out + before).trim() !== "";
    out += inSentence || !hasContent ? before : before.replace(/[ \t]+$/, "") + "\n";
    out += match[0];
    cursor = match.index + match[0].length;
  }
  return out + line.slice(cursor);
}
const TRAILING_SPACE_RE = /[ \t]+\n/g;
const EXTRA_BLANKS_RE = /\n{3,}/g;
const NEWLINES_RE = /\r\n?/g;
export function formatPrompt(text) {
  if (typeof text !== "string") return "";
  if (!text.trim()) return text;
  let out = text.replace(NEWLINES_RE, "\n");
  out = out.replace(FIELD_HEAD_RE, (match, before, field) =>
    before === "" ? field + ":" : before + "\n\n" + field + ":",
  );
  out = out.split("\n").map(breakShotHeadings).join("\n");
  out = out.replace(TRAILING_SPACE_RE, "\n").replace(EXTRA_BLANKS_RE, "\n\n");
  return out.trim();
}
export function readBoard(value) {
  let data = value;
  if (typeof data === "string") {
    const text = data.trim();
    if (!text) return emptyBoard();
    try {
      data = JSON.parse(text);
    } catch {
      return emptyBoard();
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return emptyBoard();
  const segments = (Array.isArray(data.segments) ? data.segments : [])
    .map(readSegment)
    .slice(0, MAX_SEGMENTS);
  const board = {
    version: Math.max(1, asInt(data.version, 1)),
    segments: segments.length ? segments : [readSegment({ id: 1 }, 0)],
    audio_clips: (Array.isArray(data.audio_clips) ? data.audio_clips : [])
      .map(readAudioClip)
      .slice(0, MAX_AUDIO_CLIPS),
    library: (Array.isArray(data.library) ? data.library : [])
      .map(readLibraryRef)
      .slice(0, MAX_LIBRARY_REFS),
    writer: readWriter(data.writer),
    aspect_from_image: asBool(data.aspect_from_image),
    project_dir: asString(data.project_dir),
    film_name: asString(data.film_name),
    storyboard_id: asString(data.storyboard_id),
    selected_id: asInt(data.selected_id, 0),
    preview_max_res: previewResOf(data),
    preview_quality: Math.max(30, Math.min(100, asInt(data.preview_quality, 80))),
    preview_frames: Math.max(0, Math.min(1024, asInt(data.preview_frames, 0))),
    preview_fps: fpsOf(data.preview_fps),
    preview_every: everyOf(data.preview_every),
    batch_takes: Math.max(1, Math.min(4, asInt(data.batch_takes, 1))),
    new_take_to_timeline: !!data.new_take_to_timeline,
    seed_mode: SEED_MODES.includes(data.seed_mode) ? data.seed_mode : DEFAULT_SEED_MODE,
    writer_seed_mode: SEED_MODES.includes(data.writer_seed_mode)
      ? data.writer_seed_mode : "fixed",
    tiny_vae: tinyVaeOf(data.tiny_vae),
    cache_root: asString(data.cache_root),
    film: asString(data.film),
    film_of: asString(data.film_of),
  };
  adoptLegacy(board, data);
  return normalise(board);
}
function adoptLegacy(board, data) {
  const scenario = asString(data.scenario).trim();
  if (scenario && board.segments.length && !board.segments[0].script.trim()) {
    board.segments[0].script = scenario;
  }
  const rawWriter = data.writer && typeof data.writer === "object" ? data.writer : {};
  const style = asString(rawWriter.style).trim();
  if (style) {
    for (const seg of board.segments) {
      if (!seg.style) seg.style = style;
    }
  }
  const shots = Math.max(0, Math.min(8, asInt(data.max_shots, 0)));
  if (shots) {
    for (const seg of board.segments) {
      if (!seg.max_shots) seg.max_shots = shots;
    }
  }
}
export function emptyBoard() {
  return normalise({
    version: 1,
    segments: [readSegment({ id: 1 }, 0)],
    audio_clips: [],
    library: [],
    writer: readWriter(null),
    seed: 0,
    aspect_from_image: false,
    project_dir: "",
    film_name: "",
    storyboard_id: "",
    selected_id: 1,
    preview_max_res: 1024,
    preview_quality: 80,
    preview_frames: 0,
    preview_fps: 12,
    preview_every: 1,
    batch_takes: 1,
    new_take_to_timeline: false,
    seed_mode: DEFAULT_SEED_MODE,
    writer_seed_mode: "fixed",
    tiny_vae: TINY_VAE_AUTO,
    cache_root: "",
    film: "",
    film_of: "",
  });
}
export function normalise(board) {
  const seen = new Set();
  let next = 1;
  const relabelled = [];
  board.segments.forEach((seg, index) => {
    if (seg.id <= 0 || seen.has(seg.id)) {
      while (seen.has(next)) next += 1;
      seg.id = next;
    }
    seen.add(seg.id);
    next = Math.max(next, seg.id + 1);
    seg.seconds = snapSeconds(seg.seconds, maxSecondsFor(seg));
    const was = settleCarriedMode(seg);
    if (was) relabelled.push([index, was, seg.mode]);
  });
  if (relabelled.length && board.film_of) {
    board.film_of = relabelFilmOf(board.film_of, relabelled);
  }
  const seenAudio = new Set();
  let nextAudio = 1;
  for (const clip of board.audio_clips) {
    if (clip.id <= 0 || seenAudio.has(clip.id)) {
      while (seenAudio.has(nextAudio)) nextAudio += 1;
      clip.id = nextAudio;
    }
    seenAudio.add(clip.id);
    nextAudio = Math.max(nextAudio, clip.id + 1);
  }
  const tags = new Set();
  board.library.forEach((ref, index) => {
    if (!ref.uid) ref.uid = `lib${index + 1}`;
    if (!ref.tag || tags.has(ref.tag)) {
      let candidate = index + 1;
      while (tags.has(`R${candidate}`)) candidate += 1;
      ref.tag = `R${candidate}`;
    }
    tags.add(ref.tag);
  });
  const ids = new Set(board.segments.map((s) => s.id));
  if (!ids.has(board.selected_id)) {
    board.selected_id = board.segments.length ? board.segments[0].id : 0;
  }
  return board;
}
export function writeBoard(board) {
  return JSON.stringify({
    version: board.version || 1,
    segments: board.segments.map((seg) => ({
      id: seg.id,
      name: seg.name || "",
      seconds: seg.seconds,
      frames: segmentFrames(seg),
      duration: Number(framesToSeconds(segmentFrames(seg)).toFixed(3)),
      mode: seg.mode,
      script: seg.script || "",
      style: seg.style || "",
      camera: seg.camera || "",
      camera_amplitude: seg.camera_amplitude || "",
      camera_speed: seg.camera_speed || "",
      prompt: seg.prompt,
      seed: seg.seed,
      locked: seg.locked,
      audio: seg.audio,
      music: seg.music !== false,
      music_stash: seg.music_stash || "",
      prompt_lang: seg.prompt_lang || "EN",
      prompt_from: seg.prompt_from || {},
      written_by: seg.written_by || {},
      prompt_pre: seg.prompt_pre || "",
      lang_pre: seg.lang_pre || "",
      prompt_edited: !!seg.prompt_edited,
      rebuilt: !!seg.rebuilt,
      max_shots: seg.max_shots || 0,
      skills: Array.isArray(seg.skills) ? seg.skills.slice() : [],
      context_frames: seg.context_frames || 0,
      context_audio: seg.context_audio || 0,
      tail_frames: seg.tail_frames || 0,
      tail_audio: seg.tail_audio || 0,
      tail_at: seg.tail_at || 0,
      context_at: seg.context_at || 0,
      made_tail_at: madeAt(seg.made_tail_at),
      made_context_at: madeAt(seg.made_context_at),
      made_frames: madeAt(seg.made_frames),
      status: seg.status,
      refs: seg.refs.map((r) => ({
        uid: r.uid,
        kind: r.kind,
        label: r.label,
        source: r.source,
        tag: r.tag || "",
        frame: r.frame || "",
      })),
      source_clip: seg.source_clip || "",
      clip_name: seg.clip_name || "",
      cache_key: seg.cache_key || "",
      take_key: seg.take_key || "",
      error: seg.error || "",
      poster: seg.poster || "",
      clip: seg.clip || "",
    })),
    audio_clips: board.audio_clips.map((clip) => ({
      id: clip.id,
      seconds: Number(clip.seconds.toFixed(3)),
      muted: clip.muted,
      locked: !!clip.locked,
      label: clip.label,
      source: clip.source,
      gain: Number(clip.gain.toFixed(3)),
    })),
    library: board.library.map((r) => ({
      uid: r.uid,
      kind: r.kind,
      label: r.label,
      source: r.source,
      tag: r.tag,
      frame: r.frame || "",
      origin: r.origin || "segment",
    })),
    writer: {
      llm_model: board.writer.llm_model || "",
      models_dir: board.writer.models_dir || "",
      seed: board.writer.seed || 0,
      temperature: Number((board.writer.temperature ?? 1).toFixed(3)),
      use_provider: !!board.writer.use_provider,
      provider_url: board.writer.provider_url || "",
      provider_model: board.writer.provider_model || "",
    },
    aspect_from_image: !!board.aspect_from_image,
    project_dir: board.project_dir || "",
    film_name: board.film_name || "",
    storyboard_id: board.storyboard_id || "",
    selected_id: board.selected_id,
    preview_max_res: board.preview_max_res ?? 1024,
    preview_quality: board.preview_quality || 80,
    preview_frames: board.preview_frames ?? 0,
    preview_fps: board.preview_fps || 12,
    preview_every: board.preview_every ?? 1,
    batch_takes: board.batch_takes || 1,
    new_take_to_timeline: !!board.new_take_to_timeline,
    seed_mode: SEED_MODES.includes(board.seed_mode) ? board.seed_mode : DEFAULT_SEED_MODE,
    writer_seed_mode: SEED_MODES.includes(board.writer_seed_mode)
      ? board.writer_seed_mode : "fixed",
    tiny_vae: typeof board.tiny_vae === "string" ? board.tiny_vae : tinyVaeOf(board.tiny_vae),
    cache_root: board.cache_root || "",
    film: board.film || "",
    film_of: board.film_of || "",
    total_frames: totalFrames(board.segments),
    total_seconds: Number(framesToSeconds(totalFrames(board.segments)).toFixed(3)),
    requested_seconds: requestedSeconds(board.segments),
    ...(board.only && board.only.length ? { only: board.only } : {}),
    ...(board.force && board.force.length ? { force: board.force } : {}),
  });
}
export function filmFrames(segments) {
  return filmSpans(segments).map((span) => span.length);
}
export function cutMark(segments, index) {
  const after = segments[index + 1];
  if (!after || !after.context_at || after.source_clip) return 0;
  if (!takesFromFront(after)) return 0;
  return Math.max(0, Number(after.context_at) || 0);
}
export function filmSignature(segments) {
  const list = segments || [];
  const spans = filmSpans(list);
  return ["2"]
    .concat(
      list.map((seg, index) =>
        [
          String(seg.source_clip || seg.clip || "").replace(/\\/g, "/").split("/").pop(),
          spans[index].start,
          spans[index].end,
          String(seg.mode || ""),
          seg.audio === false ? 1 : 0,
        ].join(":"),
      ),
    )
    .join("|");
}
export function takesFromFront(seg) {
  if (!seg || seg.source_clip) return false;
  return MODE_FIRST_FRAME.has(seg.mode) || carriedRun(seg) > 0;
}
export function madeAt(value) {
  if (value === null || value === undefined || value === "") return null;
  return Math.max(0, asInt(value, 0));
}
export function madeTailAt(seg) {
  const made = madeAt(seg.made_tail_at);
  return made === null ? Math.max(0, Number(seg.tail_at) || 0) : made;
}
export function madeContextAt(seg) {
  const made = madeAt(seg.made_context_at);
  return made === null ? Math.max(0, Number(seg.context_at) || 0) : made;
}
export function clipRanges(numbers) {
  const sorted = [...new Set([...numbers].map((n) => Math.trunc(Number(n))))].sort((a, b) => a - b);
  const runs = [];
  for (const n of sorted) {
    if (runs.length && n === runs[runs.length - 1][1] + 1) runs[runs.length - 1][1] = n;
    else runs.push([n, n]);
  }
  return runs
    .map(([a, b]) => (a === b ? `${a}` : b > a + 1 ? `${a}–${b}` : `${a}, ${b}`))
    .join(", ");
}
export function clipsStillToRender(segments) {
  const clips = [];
  const all = segments || [];
  for (let index = 0; index < all.length; index++) {
    const seg = all[index];
    if (seg.clip || seg.source_clip) continue;
    if (seg.locked) return { clips, stop: { index, why: "is locked and has no take" } };
    if (!String(seg.prompt || "").trim()) {
      return { clips, stop: { index, why: "has no prompt — write it with Process with agent" } };
    }
    clips.push(seg);
  }
  return { clips, stop: null };
}
export function madeFrames(seg) {
  if (seg.source_clip) return deliveredFrames(seg);
  const made = madeAt(seg.made_frames);
  return made ? made : deliveredFrames(seg);
}
export function filmCutMark(segments, index) {
  const after = segments[index + 1];
  if (!after || after.source_clip || !takesFromFront(after)) return 0;
  return madeContextAt(after);
}
export function pendingTrims(segments) {
  const out = [];
  segments.forEach((seg, index) => {
    const madeLength = seg.source_clip ? null : madeAt(seg.made_frames);
    if (madeLength && madeLength !== deliveredFrames(seg)) {
      out.push({ kind: "length", clip: index + 1, anchor: index + 1,
        at: deliveredFrames(seg), made: madeLength });
    }
    if (carriedTail(seg) && segments[index + 1]) {
      const want = Math.max(0, Number(seg.tail_at) || 0);
      const made = madeTailAt(seg);
      if (want !== made) out.push({ kind: "arrive", clip: index + 1, anchor: index + 2, at: want, made });
    }
    const before = segments[index - 1];
    if (before && !seg.source_clip && takesFromFront(seg)) {
      const want = Math.max(0, Number(seg.context_at) || 0);
      const made = madeContextAt(seg);
      if (want !== made) out.push({ kind: "continue", clip: index + 1, anchor: index, at: want, made });
    }
  });
  return out;
}
export function filmSpans(segments) {
  return segments.map((seg, index) => {
    const before = segments[index - 1];
    const own = madeFrames(seg);
    const mark = filmCutMark(segments, index);
    const end = mark ? Math.max(1, Math.min(own, mark)) : own;
    let start = 0;
    if (before && carriedTail(before)) {
      start = Math.max(0, Math.min(end - 1, madeTailAt(before)));
    }
    return { start, end, length: Math.max(1, end - start) };
  });
}
export function handsOver(segments, index) {
  const after = segments[index + 1];
  return !!(
    after &&
    takesFromFront(after) &&
    (carriedRun(after) || Number(after.context_frames) === 1)
  );
}
export function arrivedAt(segments, index) {
  const before = segments[index - 1];
  return !!(before && carriedTail(before));
}
export function needsRenderedFirst(segments, index) {
  const out = [];
  for (let at = index; at > 0; at--) {
    const seg = segments && segments[at];
    if (!seg || !takesFromFront(seg)) break;
    const before = segments[at - 1];
    if (!before || before.source_clip) break;
    if (before.clip) break;
    if (before.status === "ready") break;
    out.unshift(before);
  }
  return out;
}
export function opensOnChain(board, index) {
  const segments = (board && board.segments) || [];
  const seg = segments[index];
  if (!seg || index <= 0) return false;
  if (seg.source_clip) return false;
  if (!MODE_FIRST_FRAME.has(seg.mode)) return false;
  if (carriedRun(seg) > 0) return false;
  if (seg.refs.some((r) => r.kind === "image" && r.source && r.uid.startsWith("first"))) {
    return false;
  }
  const cited = new Set(citedTags(board, seg));
  return !(board.library || []).some(
    (ref) => ref.tag && cited.has(ref.tag) && ref.kind === "image" && ref.source,
  );
}
export function joinedFrames(board) {
  const segments = (board && board.segments) || [];
  const spans = filmSpans(segments);
  let total = 0;
  segments.forEach((seg, index) => {
    if (!(seg.source_clip || seg.clip)) return;
    const drop = Math.max(opensOnChain(board, index) ? 1 : 0, spans[index].start);
    total += Math.max(0, spans[index].end - drop);
  });
  return total;
}
export const joinedClips = (segments) =>
  (segments || []).filter((seg) => seg.source_clip || seg.clip).length;
export const totalFrames = (segments) =>
  filmFrames(segments).reduce((sum, n) => sum + n, 0);
export const totalSeconds = (segments) => framesToSeconds(totalFrames(segments));
export const requestedSeconds = (segments) => segments.reduce((sum, s) => sum + s.seconds, 0);
export function dragSeam(segments, index, deltaSeconds) {
  const out = segments.slice();
  if (index < 0 || index + 1 >= out.length) return out;
  const left = out[index];
  const right = out[index + 1];
  const pair = left.seconds + right.seconds;
  const low = Math.max(MIN_SEGMENT_SECONDS, pair - MAX_SEGMENT_SECONDS);
  const high = Math.min(MAX_SEGMENT_SECONDS, pair - MIN_SEGMENT_SECONDS);
  if (low > high) return out;
  const newLeft = Math.max(low, Math.min(high, left.seconds + Math.round(deltaSeconds)));
  out[index] = { ...left, seconds: newLeft };
  out[index + 1] = { ...right, seconds: pair - newLeft };
  return out;
}
export function splitAt(segments, id) {
  const out = segments.slice();
  if (out.length >= MAX_SEGMENTS) return out;
  const index = out.findIndex((s) => s.id === id);
  if (index < 0) return out;
  const seg = out[index];
  if (seg.seconds < MIN_SEGMENT_SECONDS * 2) return out;
  if (seg.source_clip) return out;
  const leftSeconds = Math.floor(seg.seconds / 2);
  const rightSeconds = seg.seconds - leftSeconds;
  const newId = Math.max(...out.map((s) => s.id)) + 1;
  out.splice(
    index,
    1,
    { ...seg, seconds: leftSeconds, status: "queued", cache_key: "" },
    {
      ...seg,
      id: newId,
      seconds: rightSeconds,
      status: "queued",
      cache_key: "",
      poster: "",
      clip: "",
      seed: deriveSeed(seg.seed, newId),
      mode: seg.mode === "t2va" || seg.mode === "i2va" ? "i2va" : seg.mode,
      refs: seg.refs.map((r) => ({ ...r })),
    },
  );
  return out;
}
export function mergeAt(segments, id) {
  const out = segments.slice();
  const index = out.findIndex((s) => s.id === id);
  if (index < 0 || index + 1 >= out.length) return out;
  const left = out[index];
  const right = out[index + 1];
  if (left.source_clip || right.source_clip) return out;
  const seconds = Math.min(MAX_SEGMENT_SECONDS, left.seconds + right.seconds);
  let prompt = left.prompt;
  if (right.prompt.trim() && right.prompt.trim() !== left.prompt.trim()) {
    prompt = [left.prompt.trim(), right.prompt.trim()].filter(Boolean).join("\n\n");
  }
  out.splice(index, 2, {
    ...left,
    seconds,
    prompt,
    status: "queued",
    cache_key: "",
    audio: left.audio || right.audio,
    refs: left.refs.concat(right.refs.filter((r) => !left.refs.some((l) => l.uid === r.uid))),
  });
  return out;
}
export function addSegment(segments, seconds) {
  const out = segments.slice();
  if (out.length >= MAX_SEGMENTS) return out;
  const id = out.length ? Math.max(...out.map((s) => s.id)) + 1 : 1;
  out.push(blankSegment(id, seconds, out.length ? "i2va" : "t2va"));
  return out;
}
export function addSegmentBefore(segments, index, seconds) {
  const out = segments.slice();
  if (out.length >= MAX_SEGMENTS) return out;
  const id = out.length ? Math.max(...out.map((s) => s.id)) + 1 : 1;
  out.splice(Math.max(0, index), 0, blankSegment(id, seconds, "l2va"));
  return out;
}
export function blankSegment(id, seconds, mode) {
  return {
    id,
    name: "",
    seconds: snapSeconds(seconds === undefined ? DEFAULT_SEGMENT_SECONDS : seconds),
    mode: mode || "t2va",
    script: "",
    style: "",
    camera: "",
    camera_amplitude: "",
    camera_speed: "",
    prompt: "",
    seed: Math.floor(Math.random() * 1000000),
    locked: false,
    audio: true,
    music: true,
    music_stash: "",
    prompt_lang: "EN",
    prompt_from: {},
    written_by: {},
    prompt_pre: "",
    lang_pre: "",
    prompt_edited: false,
    rebuilt: false,
    max_shots: 1,
    skills: [],
    tail_frames: 0,
    tail_audio: 0,
    tail_at: 0,
    made_tail_at: null,
    made_context_at: null,
    made_frames: null,
    status: "queued",
    refs: [],
    source_clip: "",
    clip_name: "",
    cache_key: "",
    error: "",
    poster: "",
    clip: "",
  };
}
export function removeSegment(segments, id) {
  const out = segments.slice();
  if (out.length <= 1) return out;
  const index = out.findIndex((s) => s.id === id);
  if (index < 0) return out;
  out.splice(index, 1);
  return out;
}
export function distributeSeconds(targetSeconds, count) {
  const seconds = Math.max(0, Math.round(asFloat(targetSeconds)));
  if (seconds <= 0) return [];
  let n =
    count === undefined || count === null ? Math.ceil(seconds / MAX_SEGMENT_SECONDS) : count;
  n = Math.max(1, Math.min(MAX_SEGMENTS, Math.floor(n)));
  const base = Math.max(MIN_SEGMENT_SECONDS, Math.floor(seconds / n));
  const lengths = new Array(n).fill(Math.min(MAX_SEGMENT_SECONDS, base));
  let remainder = seconds - lengths.reduce((a, b) => a + b, 0);
  while (remainder > 0) {
    let placed = false;
    for (let i = 0; i < n && remainder > 0; i += 1) {
      if (lengths[i] < MAX_SEGMENT_SECONDS) {
        lengths[i] += 1;
        remainder -= 1;
        placed = true;
      }
    }
    if (!placed) break;
  }
  return lengths;
}
export function divideLong(seconds) {
  const whole = Math.max(MIN_SEGMENT_SECONDS, Math.round(asFloat(seconds)));
  return distributeSeconds(whole, Math.ceil(whole / MAX_SEGMENT_SECONDS));
}
export function fitToTarget(segments, targetSeconds) {
  if (!segments.length) return segments;
  const lengths = distributeSeconds(targetSeconds, segments.length);
  return segments.map((seg, i) => ({ ...seg, seconds: lengths[i] }));
}
export const SEED_MODES = ["random", "increment", "fixed"];
export const DEFAULT_SEED_MODE = "random";
export function nextSeed(seed, mode, roll) {
  const now = Math.max(0, asInt(seed, 0));
  if (mode === "fixed") return now;
  if (mode === "increment") {
    return (now + 1) % 4294967296;
  }
  return typeof roll === "function" ? roll() : now;
}
export function deriveSeed(seed, salt) {
  return (asInt(seed) * 1103515245 + asInt(salt) * 12345 + 7) % 4294967296;
}
export function timecodes(segments) {
  const lengths = filmFrames(segments);
  let cursor = 0;
  return segments.map((seg, index) => {
    const start = cursor;
    cursor += framesToSeconds(lengths[index]);
    return { start, end: cursor };
  });
}
export function warningsFor(segment, board = null) {
  if (segment.source_clip) return [];
  const out = [];
  if (framesFor(segment.seconds) < TRAINED_MIN_FRAMES) {
    out.push(
      `${segment.seconds} s renders ` +
        `${framesToSeconds(framesFor(segment.seconds)).toFixed(2)} s, under the ` +
        `${framesToSeconds(TRAINED_MIN_FRAMES).toFixed(2)} s the model was trained on; ` +
        "motion tends to stall.",
    );
  }
  const pooled =
    board && Array.isArray(board.library)
      ? board.library.filter((ref) => ref.tag && citedTags(board, segment).includes(ref.tag))
      : [];
  if (
    segment.mode === "ref2va" &&
    !segment.refs.some((r) => r.source) &&
    !pooled.some((r) => r.source)
  ) {
    out.push("ref2va with nothing attached falls back to plain text-to-video.");
  }
  const empty = pooled.filter((ref) => !ref.source).map((ref) => `@${ref.tag}`);
  if (segment.mode === "ref2va" && empty.length) {
    out.push(
      `${empty.join(", ")} ${empty.length === 1 ? "has" : "have"} no picture yet — ` +
        `fill ${empty.length === 1 ? "it" : "them"} in the references library before this ` +
        `clip renders, or it renders without ${empty.length === 1 ? "it" : "them"}.`,
    );
  }
  if (Number(segment.context_frames) === 1 && !MODE_FIRST_FRAME.has(segment.mode)) {
    out.push(
      `A single frame is handed over to this clip, but ${segment.mode} has no ` +
        "first-frame slot to pin it in, so nothing is carried across the cut. " +
        "Choose a run of 5 frames or more, which any mode can carry, or switch " +
        "the clip to I2VA.",
    );
  }
  const carried = carriedRun(segment);
  if (
    carried &&
    segment.refs.some(
      (r) => r.kind === "image" && r.source && String(r.uid || "").startsWith("first"),
    )
  ) {
    out.push(
      `This clip carries ${carried} frames from the one before it, and that run ` +
        "occupies frame 0: the attached opening image is dropped before sampling and " +
        `the prompt is written as ${effectiveMode(segment).toUpperCase()}. Turn the ` +
        "carry off to open on the picture instead.",
    );
  }
  if (!segment.prompt.trim()) out.push("No prompt: this clip has nothing to generate from.");
  if (segment.prompt_lang === "RU" && segment.prompt.trim()) {
    out.push(
      "The prompt is shown in RU, which H3 does not read. Switch back to EN or 中文 " +
        "so the agent rebuilds it before rendering.",
    );
  }
  const cited = citedTagNames(segment.prompt);
  if (segment.mode !== "ref2va" && cited.length) {
    const tags = cited.map((t) => `@${t}`).join(", ");
    if (carriedRun(segment) > 0) {
      out.push(
        `The prompt cites ${tags}, but this clip opens on the run carried from the ` +
          "one before it — that takes frame 0, so no image can open the clip and " +
          "the tags are stripped at render. Switch to REF2VA to attach them, or turn " +
          "the carry off.",
      );
    } else if (MODE_FIRST_FRAME.has(segment.mode)) {
      out.push(
        `The prompt cites ${tags}. In ${segment.mode} the FIRST cited image opens ` +
          "the clip as its first frame (when the slot below is empty); any other " +
          "tag is stripped at render. To attach several references, switch the " +
          "clip to REF2VA.",
      );
    } else {
      out.push(
        `The prompt cites ${tags}, but ${segment.mode} attaches no references — ` +
          "the tags are stripped at render and those files never reach the model. " +
          "Switch to I2VA to open on the image, or to REF2VA to attach them all.",
      );
    }
  }
  const spokenStripped = (segment.prompt || "").replace(
    /<d>[\s\S]*?<\/d>|"[^"]*"/g,
    " ",
  );
  if (segment.prompt_lang !== "RU" && /[А-Яа-яЁё]/.test(spokenStripped)) {
    out.push(
      "The prompt carries Russian text, which H3 does not read — that sentence will " +
        "be ignored. Switch to RU, edit there, and back to EN so the agent rebuilds " +
        "it in the model's language.",
    );
  }
  return out;
}
export function promptField(prompt, field) {
  const text = prompt || "";
  const marker = new RegExp("(^|\n)[ \t]*" + field + "[ \t]*:", "i");
  const match = marker.exec(text);
  if (!match) return "";
  const rest = text.slice(match.index + match[0].length);
  const next = new RegExp("\n[ \t]*(?:" + PROMPT_FIELDS.join("|") + ")[ \t]*:", "i").exec(rest);
  const body = (next ? rest.slice(0, next.index) : rest).trim();
  return body === MUSIC_NA ? "" : body;
}
export function speakerLines(prompt) {
  const body =
    promptField(prompt, "detailed_description") ||
    promptField(prompt, "integrated_multimodal_description") ||
    "";
  if (!body) return [];
  const out = [];
  const seen = new Set();
  const ids = /\(S\d+(?:\s*,\s*S\d+)*\)/g;
  let hit;
  while ((hit = ids.exec(body)) && out.length < 4) {
    const id = hit[0].replace(/\s+/g, "");
    if (seen.has(id)) continue;
    seen.add(id);
    const before = body.slice(0, hit.index);
    let cut = 0;
    for (const [mark, width] of [[". ", 2], ["] ", 2], ["</d>", 4], ["\n", 1]]) {
      const at = before.lastIndexOf(mark);
      if (at >= 0 && at + width > cut) cut = at + width;
    }
    const phrase = before
      .slice(cut)
      .replace(/<d>[\s\S]*?<\/d>/g, " ")
      .replace(/^at\s+\d{1,2}:\d{2}(?:[:.]\d+)*\s*,?\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    if (phrase && phrase.length <= 140) out.push({ id, as: phrase });
    else if (phrase) out.push({ id, as: "" });
  }
  return out;
}
export function citedTagNames(prompt) {
  const seen = [];
  for (const match of (prompt || "").matchAll(/@(R\d+)\b/g)) {
    if (!seen.includes(match[1])) seen.push(match[1]);
  }
  return seen;
}
const MUSIC_MARKER_RE = /^non_diegetic_music\s*:/m;
const MUSIC_NA = "N/A";
export function stripMusic(prompt) {
  const text = prompt || "";
  const match = MUSIC_MARKER_RE.exec(text);
  if (!match) return { text, stash: "" };
  const end = match.index + match[0].length;
  const body = text.slice(end).trim();
  if (!body || body === MUSIC_NA) return { text, stash: "" };
  return { text: `${text.slice(0, end)} ${MUSIC_NA}\n`, stash: body };
}
export function restoreMusic(prompt, stash) {
  const text = prompt || "";
  if (!(stash || "").trim()) return text;
  const match = MUSIC_MARKER_RE.exec(text);
  if (!match) return text;
  const end = match.index + match[0].length;
  return `${text.slice(0, end)} ${stash.trim()}\n`;
}
export function citedTags(board, segment) {
  const cited = new Set(citedTagNames(segment.prompt));
  return board.library.filter((ref) => ref.tag && cited.has(ref.tag)).map((ref) => ref.tag);
}
export const RATIO_NEAR = 0.04;
export const RATIO_EXACT = 0.01;
export const RATIO_MOST = 10;
const COMMON_RATIOS = [[16, 9], [9, 16], [1, 1], [4, 3], [3, 4], [3, 2], [2, 3],
  [21, 9], [9, 21], [5, 4], [4, 5], [2, 1], [1, 2], [191, 100, "1.91:1"]];
export function ratioLabel(width, height) {
  const wanted = Number(width) / Number(height);
  if (!(wanted > 0) || !Number.isFinite(wanted)) return { label: "", off: 0 };
  let best = null;
  for (const [n, d, name] of COMMON_RATIOS) {
    const off = Math.abs(n / d - wanted) / wanted;
    if (off <= RATIO_NEAR && (!best || off < best.off)) best = { label: name || `${n}:${d}`, off };
  }
  if (!best) {
    for (let d = 1; d <= RATIO_MOST; d += 1) {
      const n = Math.round(d * wanted);
      if (n < 1 || n > RATIO_MOST) continue;
      const off = Math.abs(n / d - wanted) / wanted;
      if (!best || off < best.off - 1e-12) best = { label: `${n}:${d}`, off };
    }
  }
  if (!best) {
    const n = Math.max(1, Math.round(wanted));
    best = wanted >= 1 ? { label: `${n}:1`, off: Math.abs(n - wanted) / wanted }
      : { label: `1:${Math.max(1, Math.round(1 / wanted))}`, off: 1 };
  }
  return { label: (best.off > RATIO_EXACT ? "≈" : "") + best.label, off: best.off };
}
export function placeholderWave(seed, bars = 20) {
  let s = (asInt(seed) % 233280) + 1;
  const out = [];
  for (let i = 0; i < bars; i += 1) {
    s = (s * 9301 + 49297) % 233280;
    out.push(0.2 + (s / 233280) * 0.8);
  }
  return out;
}
export function exportShot(board, segment) {
  const index = board.segments.indexOf(segment);
  const refs = segment.refs
    .filter((r) => r.tag)
    .map((r) => `@${r.tag}`)
    .join(" ");
  const lines = [
    `[Shot ${index + 1}] ${segment.name || "untitled"}`,
    `mode: ${(segment.mode || "t2va").toUpperCase()} · duration: ${segment.seconds} s · ` +
      `frames: ${framesFor(segment.seconds)} · seed: ${segment.seed}`,
    `sound: ${segment.audio ? "on" : "off"} · music: ${segment.music !== false ? "on" : "off"}` +
      ` · status: ${segment.status}`,
  ];
  if (segment.style || segment.camera) {
    const camera = segment.camera
      ? `${segment.camera}${segment.camera_amplitude ? ` · ${segment.camera_amplitude} amplitude` : ""}` +
        `${segment.camera_speed ? ` · ${segment.camera_speed} speed` : ""}`
      : "—";
    lines.push(`style: ${segment.style || "neutral"} · camera: ${camera}`);
  }
  if (segment.source_clip) lines.push(`footage: ${segment.clip_name || segment.source_clip}`);
  if (refs) lines.push(`references: ${refs}`);
  if ((segment.script || "").trim()) lines.push(`script: ${segment.script.trim()}`);
  const lang = segment.prompt_lang && segment.prompt_lang !== "EN" ? ` (${segment.prompt_lang})` : "";
  lines.push(`prompt${lang}: ${segment.prompt || ""}`);
  return lines.join("\n");
}
export function exportScript(board) {
  const lines = [
    `# shots (${board.segments.length} · ${requestedSeconds(board.segments)} s)`,
    "",
  ];
  for (const segment of board.segments) {
    lines.push(exportShot(board, segment), "");
  }
  return lines.join("\n");
}
export function insertTag(text, index, tag) {
  const at = Math.max(0, Math.min(text.length, index));
  const before = text.slice(0, at);
  const after = text.slice(at);
  const lead = before && !/\s$/.test(before) ? " " : "";
  const trail = after && !/^[\s.,;:!?)]/.test(after) ? " " : "";
  const inserted = `${lead}@${tag}${trail}`;
  return { text: before + inserted + after, caret: before.length + inserted.length };
}
export const KEPT_FIELDS = ["prompt", "script"];
export function keepMyWords(segments, held, base, kept) {
  if (base) {
    for (const seg of segments) {
      const was = base[seg.id];
      const mine = held.get ? held.get(seg.id) : held[seg.id];
      if (!was || !mine) continue;
      for (const field of KEPT_FIELDS) {
        const ours = mine[field] || "";
        const ran = seg[field] || "";
        if (ours === (was[field] || "") || ours === ran) continue;
        kept[seg.id] = { ...(kept[seg.id] || {}), [field]: { mine: ours, ran } };
      }
    }
  }
  for (const seg of segments) {
    const fresh = kept[seg.id];
    if (!fresh) continue;
    for (const field of KEPT_FIELDS) {
      const entry = fresh[field];
      if (!entry) continue;
      const now = seg[field] || "";
      if (now === entry.ran) {
        seg[field] = entry.mine;
        if (seg.status === "ready") seg.status = "stale";
      } else if (now !== entry.mine) {
        delete fresh[field];
      }
    }
    if (!Object.keys(fresh).length) delete kept[seg.id];
  }
  return kept;
}
export function promptIsCurrent(seg, board) {
  if (!String(seg.prompt || "").trim()) return false;
  const from = seg.prompt_from;
  if (!from || typeof from !== "object" || !Object.keys(from).length) return false;
  return promptDrift(seg, board).length === 0;
}
export function latentFrames(frames) {
  const n = Math.trunc(Number(frames) || 0);
  return n <= 5 ? 2 : Math.floor((n - 5) / 17) * 5 + 2;
}
export function sequenceTokens(width, height, frames) {
  const w = Math.trunc(Number(width) || 0);
  const h = Math.trunc(Number(height) || 0);
  const n = Math.trunc(Number(frames) || 0);
  if (w <= 0 || h <= 0 || n <= 0) return 0;
  return latentFrames(n) * Math.floor(w / 16) * Math.floor(h / 16);
}
export const COST_POINTS = 8;
const COST_SAME = 0.02;
export function rememberCost(points, point) {
  const tokens = Math.trunc(Number(point && point.tokens) || 0);
  const seconds = Number(point && point.seconds) || 0;
  const steps = Math.trunc(Number(point && point.steps) || 0);
  if (tokens <= 0 || seconds <= 0 || steps <= 0) return points || [];
  const fresh = { tokens, seconds: seconds / steps, at: Number(point.at) || Date.now() };
  const kept = (points || []).filter(
    (one) => Math.abs(Math.log((Number(one.tokens) || 1) / tokens)) >= COST_SAME,
  );
  kept.push(fresh);
  kept.sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0));
  return kept.slice(0, COST_POINTS);
}
export function stepCost(points, tokens) {
  const want = Math.trunc(Number(tokens) || 0);
  const clean = (points || [])
    .map((one) => ({
      tokens: Math.trunc(Number(one && one.tokens) || 0),
      seconds: Number(one && one.seconds) || 0,
    }))
    .filter((one) => one.tokens > 0 && one.seconds > 0);
  if (want <= 0 || !clean.length) return null;
  const same = clean.find((one) => Math.abs(Math.log(one.tokens / want)) < COST_SAME);
  if (same) return { seconds: same.seconds, how: "measured", from: clean.length };
  const sizes = new Set(clean.map((one) => one.tokens));
  if (sizes.size < 2) {
    const one = clean[0];
    return {
      seconds: (one.seconds * want) / one.tokens,
      how: "bound",
      at: want > one.tokens ? "least" : "most",
      from: 1,
    };
  }
  let sx = 0;
  let sy = 0;
  for (const one of clean) {
    sx += Math.log(one.tokens);
    sy += Math.log(one.seconds);
  }
  const mx = sx / clean.length;
  const my = sy / clean.length;
  let top = 0;
  let bottom = 0;
  for (const one of clean) {
    const dx = Math.log(one.tokens) - mx;
    top += dx * (Math.log(one.seconds) - my);
    bottom += dx * dx;
  }
  if (!(bottom > 0)) {
    const one = clean[0];
    return {
      seconds: (one.seconds * want) / one.tokens,
      how: "bound",
      at: want > one.tokens ? "least" : "most",
      from: 1,
    };
  }
  const power = top / bottom;
  return {
    seconds: Math.exp(my + power * (Math.log(want) - mx)),
    how: "fitted",
    power,
    from: clean.length,
  };
}
