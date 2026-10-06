import { UI_FONT } from "./vig_h3_type.js";
import { SCHEME_CLASS, ensureSchemeStyles } from "./vig_h3_scheme.js";
const STYLE_ID = "vig-h3-refedit-styles";
export const VIEWS = [
  ["front", "front on"],
  ["profile", "in profile"],
  ["full", "full length"],
  ["waist", "waist up"],
  ["above", "from above"],
  ["below", "from below"],
];
export function ensureRefEditStyles() {
  ensureSchemeStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
.vig-refedit-veil {
  position: fixed; inset: 0; z-index: 9000;
  font-family: ${UI_FONT};
  background: var(--cut-scrim);
  display: flex; align-items: center; justify-content: center;
}
.vig-refedit {
  width: min(1040px, 96vw); max-height: 94vh; overflow: auto;
  background: var(--cut-bg); color: var(--cut-text);
  border: 1px solid var(--cut-border); border-radius: 10px;
  padding: 14px 16px; display: flex; flex-direction: column; gap: 10px;
  font-size: 12px;
}
.vig-refedit-veil button, .vig-refedit-veil input,
.vig-refedit-veil select, .vig-refedit-veil textarea { font-family: inherit; }
.vig-refedit-head { display: flex; align-items: center; gap: 8px; }
.vig-refedit-head b { font-size: 13px; }
.vig-refedit-head .spacer { flex: 1; }
.vig-refedit-close {
  background: none; border: 1px solid var(--cut-border); color: inherit;
  border-radius: 5px; width: 22px; height: 22px; cursor: pointer;
}
.vig-refedit-pair { display: flex; gap: 12px; align-items: stretch; }
.vig-refedit-pane { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
.vig-refedit-stage {
  position: relative; height: 340px; border-radius: 7px; overflow: hidden;
  border: 1px solid var(--cut-border); background: var(--cut-mat);
  display: flex; align-items: center; justify-content: center;
}
.vig-refedit-stage img { max-width: 100%; max-height: 100%; display: block; }
.vig-refedit-stage.donor img, .vig-refedit-stage.main img { cursor: crosshair; touch-action: none; }
.vig-refedit-stage .empty { color: var(--cut-perf); opacity: 0.7; font-size: 11px; padding: 12px; text-align: center; }
.vig-refedit-overlay { position: absolute; pointer-events: none; }
.vig-refedit-box {
  position: absolute; border: 1px solid rgba(255, 255, 255, 0.45); border-radius: 3px;
  pointer-events: auto; cursor: pointer; background: rgba(0, 0, 0, 0.06);
}
.vig-refedit-box:hover { border-color: #e4d9b8; background: rgba(228, 217, 184, 0.12); }
.vig-refedit-box.on { border: 2px solid #4a9b6e; background: rgba(74, 155, 110, 0.22); }
.vig-refedit-box b {
  position: absolute; left: 0; top: -15px; font-size: 9px; font-weight: 500;
  white-space: nowrap; background: rgba(16, 14, 11, 0.85); padding: 1px 4px;
  border-radius: 3px; color: #ded6c2;
}
.vig-refedit-box.on b { background: #3b5e46; color: #fff; }
.vig-refedit-box.lit {
  border: 2px solid #f0d68a; background: rgba(240, 214, 138, 0.16);
  box-shadow: 0 0 0 1px rgba(20, 17, 13, 0.9), 0 0 10px rgba(240, 214, 138, 0.45);
}
.vig-refedit-box.lit b { background: #6b5222; color: #fff; }
.vig-refedit-part.lit { border-color: var(--cut-accent-hi); }
.vig-refedit-edges {
  position: absolute; pointer-events: none; overflow: visible; z-index: 3;
}
.vig-refedit-edges .edge {
  fill: rgba(228, 217, 184, 0.10); stroke: #e4d9b8; stroke-width: 1.2;
  fill-rule: evenodd; stroke-dasharray: 4 3;
}
.vig-refedit-edges .edge.on {
  fill: rgba(224, 70, 70, 0.26); stroke: #ff5a5a; stroke-width: 2.2;
  stroke-dasharray: none;
}
.vig-refedit-edges .edge.over {
  stroke: #fff6df; stroke-width: 3; stroke-dasharray: none;
}
.vig-refedit-box.over { border-color: #fff6df; }
.vig-refedit-col { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 7px; }
.vig-refedit-col.work { flex: 2 1 0; }
.vig-refedit-col.dials { flex: 1 1 0; }
.vig-refedit-set {
  display: flex; align-items: center; gap: 6px; font-size: 11px; min-width: 0;
}
.vig-refedit-set .name { flex: 1 1 auto; min-width: 0; opacity: 0.85; }
.vig-refedit-set.dial { flex-wrap: wrap; }
.vig-refedit-set.dial .name { flex: 1 0 100%; }
.vig-refedit-set .slide { flex: 1 1 60px; min-width: 60px; accent-color: var(--cut-accent); }
.vig-refedit-set .num { flex: 0 0 62px; }
.vig-refedit-set .moved {
  flex: 0 0 auto; font-size: 9px; color: var(--cut-accent-hi); text-transform: uppercase;
  letter-spacing: 0.04em;
}
.vig-refedit-set input[type="number"], .vig-refedit-set select {
  background: var(--cut-input); color: inherit;
  border: 1px solid var(--cut-border); border-radius: 4px;
  padding: 2px 4px; font: inherit; min-width: 0;
}
.vig-refedit-info {
  flex: 0 0 auto; width: 17px; height: 17px; padding: 0; line-height: 1;
  border-radius: 50%; cursor: pointer; font-size: 11px;
  background: transparent; color: var(--cut-dim);
  border: 1px solid var(--cut-border);
}
.vig-refedit-info:hover { color: var(--cut-bright); border-color: var(--cut-edge); }
.vig-refedit-pop {
  font-size: 10.5px; line-height: 1.45; margin: -2px 0 2px;
  padding: 6px 8px; border-radius: 6px;
  background: var(--cut-menu); border: 1px solid var(--cut-dashed); color: var(--cut-text);
}
.vig-refedit-block {
  border: 1px solid var(--cut-seam); border-radius: 7px; padding: 7px 8px;
  display: flex; flex-direction: column; gap: 6px;
}
.vig-refedit-blockname {
  font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--cut-dim);
}
.vig-refedit-prompthead { display: flex; align-items: center; gap: 8px; }
.vig-refedit-prompthead .vig-refedit-fold { flex: 1 1 auto; text-align: left; }
.vig-refedit-langs {
  display: flex; align-items: stretch; gap: 1px; flex: 0 0 auto;
  background: var(--cut-edge); border: 1px solid var(--cut-edge);
  border-radius: 5px; overflow: hidden;
}
.vig-refedit-langs button {
  background: var(--cut-menu); border: none; color: var(--cut-dim); font: inherit;
  font-size: 11px; padding: 2px 9px; cursor: pointer; white-space: nowrap;
}
.vig-refedit-langs button.on { background: rgba(var(--cut-accent-rgb), 0.28); color: var(--cut-bright); }
.vig-refedit-langs button[disabled] { opacity: 0.5; cursor: default; }
.vig-refedit-fold {
  background: transparent; border: none; color: var(--cut-bright); cursor: pointer;
  font-size: 11px; text-align: left; padding: 0;
}
.vig-refedit-foldbody { display: flex; flex-direction: column; gap: 6px; }
.vig-refedit-stage.zoomed img { cursor: crosshair; }
.vig-refedit-stage.adding { outline: 1px dashed #7ddba7; outline-offset: -2px; }
.vig-refedit-stage.dropping { outline: 1px dashed #e08a8a; outline-offset: -2px; }
.vig-refedit-dial { display:flex; align-items:center; gap:6px; margin:3px 0; font-size:11px; }
.vig-refedit-dial > span { flex:1 1 auto; opacity:.85; }
.vig-refedit-dial input { flex:0 0 74px; }
.vig-refedit-spot.out { background: #e04646; box-shadow: 0 0 0 2px rgba(0,0,0,.55); }
.vig-refedit-spin {
  position: absolute; left: 50%; top: 50%; width: 26px; height: 26px;
  margin: -13px 0 0 -13px; border-radius: 50%; z-index: 6;
  border: 3px solid rgba(255, 255, 255, 0.18); border-top-color: #f0d68a;
  animation: vig-refedit-turn 0.8s linear infinite;
}
@keyframes vig-refedit-turn { to { transform: rotate(360deg); } }
.vig-refedit-textwrap { position: relative; display: flex; }
.vig-refedit-working {
  position: absolute; left: 50%; top: 50%; width: 46px; height: 46px;
  margin: -23px 0 0 -23px; z-index: 7;
  display: flex; align-items: center; justify-content: center;
}
.vig-refedit-working .ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 3px solid rgba(var(--cut-ink-rgb), 0.18); border-top-color: var(--cut-accent-hi);
  animation: vig-refedit-turn 0.8s linear infinite;
}
.vig-refedit-working .stop {
  position: relative; width: 26px; height: 26px; padding: 0; border: none;
  border-radius: 50%; cursor: pointer; font: inherit; font-size: 13px;
  line-height: 1; background: var(--cut-raised); color: var(--cut-bright);
  display: flex; align-items: center; justify-content: center;
}
.vig-refedit-working .stop:hover { background: #7a3b34; }
.vig-refedit-small.on { background: rgba(var(--cut-accent-rgb), 0.28); border-color: var(--cut-accent); color: var(--cut-accent-hi); }
.vig-refedit-part .how {
  border: none; background: rgba(var(--cut-ink-rgb), 0.07); color: var(--cut-soft);
  border-radius: 4px; cursor: pointer; font-size: 9px; line-height: 1.4;
  padding: 0 4px; margin-left: 2px;
}
.vig-refedit-part .how.box { background: var(--cut-accent); color: var(--cut-on-accent); }
.vig-refedit-band {
  position: absolute; border: 1px dashed #e0b64a; background: rgba(224, 182, 74, 0.12);
  pointer-events: none; border-radius: 2px;
}
.vig-refedit-spot {
  position: absolute; width: 9px; height: 9px; margin: -5px 0 0 -5px; border-radius: 50%;
  background: #e0b64a; border: 1px solid #10130f; pointer-events: none;
}
.vig-refedit-picrow { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.vig-refedit-caption {
  font-size: 10px; color: var(--cut-dim);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 0;
}
.vig-refedit-small {
  background: none; border: 1px solid var(--cut-border); color: inherit;
  border-radius: 5px; padding: 3px 7px; cursor: pointer; font-size: 11px;
}
.vig-refedit-small:hover { border-color: var(--cut-edge); }
.vig-refedit-small[disabled] { opacity: 0.45; cursor: default; }
.vig-refedit-desk {
  border: 1px solid var(--cut-border); border-radius: 8px; padding: 10px 12px;
  background: var(--cut-sunk);
  display: flex; flex-direction: row; align-items: flex-start; gap: 10px;
}
.vig-refedit-line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.vig-refedit-line label { display: flex; gap: 5px; align-items: center; color: var(--cut-dim); }
.vig-refedit-line select, .vig-refedit-line input {
  background: var(--cut-input); color: inherit;
  border: 1px solid var(--cut-border); border-radius: 5px; padding: 3px 6px;
}
.vig-refedit-line input[type="number"] { width: 88px; }
.vig-refedit-parts { display: flex; gap: 6px; flex-wrap: wrap; }
.vig-refedit-part {
  background: none; border: 1px solid var(--cut-border); color: inherit;
  border-radius: 12px; padding: 3px 10px; cursor: pointer; font-size: 11px;
  display: flex; gap: 6px; align-items: center;
}
.vig-refedit-part i { font-style: normal; color: var(--cut-dim); font-size: 10px; }
.vig-refedit-part.on { background: #6b2b2b; border-color: #ff5a5a; color: #fff; }
.vig-refedit-part.on i { color: #cfe8d8; }
.vig-refedit-part.fresh { border-style: dashed; }
.vig-refedit-part.renaming {
  background: var(--cut-input); border-color: var(--cut-accent); cursor: text;
}
.vig-refedit-part .word[contenteditable="true"] {
  outline: none; cursor: text; min-width: 12px; display: inline-block;
}
.vig-refedit-go {
  background: var(--cut-accent); border: none; color: var(--cut-on-accent); border-radius: 6px;
  padding: 6px 14px; cursor: pointer; font-weight: 600;
}
.vig-refedit-go[disabled] { opacity: 0.5; cursor: default; }
.vig-refedit-stop {
  background: #7a3b34; border: none; color: #fff; border-radius: 6px;
  padding: 6px 14px; cursor: pointer; font-weight: 600;
}
.vig-refedit-stop:hover { background: #8f463d; }
.vig-refedit-fillable { position: relative; overflow: hidden; }
.vig-refedit-fillable > .label { position: relative; z-index: 1; }
.vig-refedit-fill {
  position: absolute; left: 0; top: 0; bottom: 0; width: 0; z-index: 0;
  background: rgba(255, 246, 224, 0.32);
  box-shadow: 1px 0 0 rgba(255, 252, 244, 0.75);
  pointer-events: none;
}
.vig-refedit-fillable.filling > .vig-refedit-fill { transition: width 0.9s linear; }
.vig-refedit-status { color: var(--cut-dim); min-height: 15px; flex: 1; }
.vig-refedit-status.bad { color: #d98f86; }
.vig-refedit textarea {
  width: 100%; min-height: 128px; resize: vertical; box-sizing: border-box;
  background: var(--cut-input); color: inherit;
  border: 1px solid var(--cut-border); border-radius: 6px;
  font-size: 11px; line-height: 1.45; padding: 8px;
}
.vig-refedit-takes { display: flex; gap: 10px; flex-wrap: wrap; }
.vig-refedit-take { width: 168px; position: relative; }
.vig-refedit-take .pic {
  width: 100%; aspect-ratio: 16/9; border-radius: 6px; background: var(--cut-mat) center/contain no-repeat;
  border: 2px solid transparent; cursor: zoom-in; display: flex; align-items: center;
  justify-content: center; color: var(--cut-perf); font-size: 11px;
}
.vig-refedit-zoom {
  position: fixed; inset: 0; z-index: 9200; background: rgba(8, 7, 5, 0.88);
  display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px;
  cursor: zoom-out;
}
.vig-refedit-zoom img { max-width: 92vw; max-height: 84vh; border-radius: 8px; }
.vig-refedit-zoom .bar {
  display: flex; gap: 10px; align-items: center; color: var(--cut-text); font-size: 12px;
  background: var(--cut-menu); border: 1px solid var(--cut-border);
  border-radius: 6px; padding: 5px 10px;
}
.vig-refedit-zoom .said {
  max-width: 92vw; max-height: 22vh; overflow: auto; cursor: auto;
  font-size: 11px; line-height: 1.45; color: var(--cut-soft); white-space: pre-wrap;
  background: var(--cut-menu); border: 1px solid var(--cut-border);
  border-radius: 6px; padding: 8px 10px;
}
.vig-refedit-ways { display: flex; gap: 7px; flex-wrap: wrap; align-items: center; }
.vig-refedit-way {
  border: 1px solid transparent; border-radius: 12px; padding: 3px 11px;
  cursor: pointer; font-size: 11px; font-weight: 600; color: var(--cut-bright);
  background: var(--cut-hover); display: flex; gap: 6px; align-items: center;
  position: relative; overflow: hidden;
}
.vig-refedit-way i { font-style: normal; font-weight: 400; opacity: 0.75; font-size: 10px; }
.vig-refedit-way.sam { border-color: #4a7fb3; color: #9ec4e6; }
.vig-refedit-way.on.sam { color: #fff; }
.vig-refedit-way[disabled] { opacity: 0.4; cursor: default; }
.vig-refedit-way > span, .vig-refedit-way > i:not(.load) { position: relative; z-index: 1; }
.vig-refedit-way i.load {
  position: absolute; left: 0; top: 0; bottom: 0; width: 0; z-index: 0;
}
.vig-refedit-way.loading i.load { transition: width 140ms linear; }
.vig-refedit-way.sam i.load { background: #2d4d69; }
.vig-refedit-way.loading { cursor: progress; }
.vig-refedit-word {
  position: absolute; display: flex; gap: 4px; align-items: center; z-index: 4;
  background: var(--cut-menu); border: 1px solid rgba(var(--cut-accent-rgb), 0.6);
  border-radius: 6px; padding: 3px 4px;
}
.vig-refedit-word input {
  width: 132px; background: var(--cut-input); border: 1px solid var(--cut-border); color: var(--cut-bright);
  border-radius: 4px; padding: 2px 6px; font-size: 11px;
}
.vig-refedit-word button {
  background: var(--cut-accent); border: none; color: var(--cut-on-accent); border-radius: 4px;
  padding: 2px 7px; cursor: pointer; font-size: 11px; line-height: 1.5;
}
.vig-refedit-word button.drop { background: transparent; color: #b06a6a; padding: 2px 5px; }
.vig-refedit-part .off {
  border: none; background: transparent; color: #b06a6a; cursor: pointer;
  font-size: 11px; line-height: 1; padding: 0 0 0 2px; opacity: 0.75;
}
.vig-refedit-part .off:hover { opacity: 1; color: #e07a7a; }
.vig-refedit-wipe {
  background: transparent; border: 1px solid #6a3f3f; color: #c98a8a;
  border-radius: 5px; padding: 2px 9px; cursor: pointer; font-size: 11px;
}
.vig-refedit-wipe[disabled] { opacity: 0.35; cursor: default; }
.vig-refedit-take .drop {
  position: absolute; right: 5px; top: 5px; width: 20px; height: 20px;
  border-radius: 5px; border: 1px solid #6a3f3f; background: rgba(20, 17, 13, 0.85);
  color: #c98a8a; cursor: pointer; font-size: 11px; line-height: 1; padding: 0;
}
.vig-refedit-take .drop:hover { background: #5a2a2a; color: #fff; }
.vig-refedit-take .adopt {
  width: 100%; margin-top: 4px; background: var(--cut-accent); border: none; color: var(--cut-on-accent);
  border-radius: 5px; padding: 3px 6px; cursor: pointer; font-size: 11px;
}
.vig-refedit-take .adopt[disabled] { opacity: 0.4; cursor: default; }
.vig-refedit-cropbar { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.vig-refedit-crop {
  background: var(--cut-accent); border: none; color: var(--cut-on-accent); border-radius: 5px;
  padding: 3px 10px; cursor: pointer; font-size: 11px;
}
`;
  document.head.appendChild(style);
}
export function referencePromptScaffold(entry, donors) {
  const stripped = (entry.label || "").replace(/\.[a-z0-9]{2,4}$/i, "").trim();
  const filenameish = /\d{4,}/.test(stripped) || /^(screenshot|img|dsc|photo|image|frame)\b/i.test(stripped);
  const who = stripped && !filenameish ? stripped : "the person";
  const named = donors.map((d, i) => ({
    picture: i + 2,
    trait: (d.trait || d.label || `the detail in picture ${i + 2}`)
      .replace(/\.[a-z0-9]{2,4}$/i, ""),
  }));
  const sources = named.map((d) => ` and whose ${d.trait} comes from <Picture ${d.picture}>`).join("");
  const donorDefs = named
    .map((d) => `<Picture ${d.picture}> provides only the ${d.trait}; the person in it does not appear.`)
    .join("\n");
  const face = named.length
    ? ` His face is the face in <Picture 1> and no other; the face in ${
        named.length > 1 ? "the donor pictures" : `<Picture ${named[0].picture}>`
      } is never used.`
    : "";
  const retention = [
    "<Subject 1> (appears in [Shot 1]): " + (named.length
      ? "partially_preserved - the face and identity from <Picture 1> are kept; the traits listed above are replaced by their donor pictures."
      : "fully_preserved - the appearance established in <Picture 1> is carried unchanged."),
    "<Picture 1> (identity source): " + (named.length
      ? "partially_preserved - face and identity carried unchanged; the replaced traits are not used."
      : "fully_preserved - carried unchanged."),
    ...named.map((d) =>
      `<Picture ${d.picture}> (${d.trait} source): attribute_transfer - only the ${d.trait} is transferred onto <Subject 1>; nothing else of the picture appears.`),
  ].join("\n");
  const traits = named.length
    ? ` His ${named.map((d) => `${d.trait} comes from <Picture ${d.picture}>`).join(", and his ")} exactly.`
    : "";
  return [
    "subject_definitions:",
    `<Subject 1> is ${who}, the man in <Picture 1> and no other person, whose face and `
    + `identity come from <Picture 1>${sources}.${face}`
    + (donorDefs ? `\n${donorDefs}` : ""),
    "",
    "summary:",
    "[reference generation] A single still portrait of <Subject 1>, generated from the "
    + "reference pictures. The person in frame is the man from <Picture 1>. Exactly one "
    + "person is in frame.",
    "",
    "retention_analysis:",
    retention,
    "",
    "detailed_description:",
    "Photorealistic, live-action, soft even light, medium framing, at eye level. "
    + "[Shot 1] A single portrait: exactly one person on screen, <Subject 1> -- the man "
    + "from <Picture 1> -- facing the camera, upper body in frame, standing still "
    + "against a plain neutral background."
    + traits
    + " The camera holds a static shot.",
    "",
    "overall_soundscape:",
    "Quiet room tone.",
    "",
    "non_diegetic_music:",
    "none",
  ].join("\n");
}
export function refEditKey(entry) {
  const tag = (entry && entry.tag ? String(entry.tag) : "").trim();
  const key = (entry && entry.key ? String(entry.key) : "").trim();
  if (!tag && key) return `vig.h3.refedit.#${key}`;
  return `vig.h3.refedit.${tag ? `@${tag}` : (entry && entry.source) || "none"}`;
}
const REMEMBER_TAKES = 24;
const CUTTER_NAMES = { sam3: "SAM 3", sam2: "SAM 2" };
export const CROP_MINIMUM = 32;
function readSaved(entry) {
  try {
    const raw = window.localStorage.getItem(refEditKey(entry));
    const held = raw ? JSON.parse(raw) : null;
    return held && typeof held === "object" ? held : null;
  } catch {
    return null;
  }
}
function writeSaved(entry, state) {
  try {
    window.localStorage.setItem(refEditKey(entry), JSON.stringify({
      main: state.main,
      donor: state.donor,
      method: state.method,
      prompt: state.prompt,
      view: state.view,
      dials: state.dials,
      dialsOpen: !!state.dialsOpen,
      dirty: !!state.dirty,
      promptOpen: !!state.promptOpen,
      zoom: state.zoom,
      pan: state.pan,
      mainZoom: state.mainZoom,
      mainPan: state.mainPan,
      promptLang: state.promptLang,
      promptPre: state.promptPre,
      langPre: state.langPre,
      promptEdited: !!state.promptEdited,
      boxes: state.boxes !== false,
      takes: state.takes
        .filter((take) => take.source)
        .slice(-REMEMBER_TAKES)
        .map((take) => ({
          take: take.take, batch: take.batch, seed: take.seed,
          source: take.source, prompt: take.prompt || "",
        })),
      at: Date.now(),
    }));
  } catch {
  }
}
export function openReferenceEditor(options) {
  ensureRefEditStyles();
  const entry = options.entry || {};
  const saved = readSaved(entry) || {};
  const pending = !!(saved.dirty && saved.main && saved.main.source
    && saved.main.source !== entry.source);
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const url = (path) => (path && options.viewUrl ? options.viewUrl(path) : "");
  const state = {
    main: pending
      ? { ...saved.main }
      : { source: entry.source || "", label: entry.label || "" },
    dirty: pending,
    donor: saved.donor && saved.donor.source ? saved.donor : null,
    segments: [],
    offers: [],
    points: [],
    marks: [],
    dropping: false,
    dials: saved.dials && typeof saved.dials === "object" ? { ...saved.dials } : {},
    dialsOpen: !!saved.dialsOpen,
    dialRanges: {},
    promptLang: saved.promptLang || "EN",
    promptPre: saved.promptPre || "",
    langPre: saved.langPre || "",
    promptEdited: !!saved.promptEdited,
    donorSize: [0, 0],
    method: saved.method || "",
    methods: [],
    drag: null,
    crop: null,
    takes: Array.isArray(saved.takes) ? saved.takes.map((take) => ({ ...take })) : [],
    batch: (Array.isArray(saved.takes) ? saved.takes : [])
      .reduce((most, take) => Math.max(most, Number(take.batch) || 0), 0),
    rendering: false,
    refs: [],
    prompt: saved.prompt || "",
    lastWritten: "",
    busy: "",
    view: saved.view || "",
    analysed: new Set(),
    promptOpen: !!saved.promptOpen,
    zoom: Number(saved.zoom) > 0 ? Number(saved.zoom) : 1,
    pan: Array.isArray(saved.pan) && saved.pan.length === 2 ? saved.pan.slice() : [0.5, 0.5],
    mainZoom: Number(saved.mainZoom) > 0 ? Number(saved.mainZoom) : 1,
    mainPan: Array.isArray(saved.mainPan) && saved.mainPan.length === 2
      ? saved.mainPan.slice() : [0.5, 0.5],
    boxes: saved.boxes !== false,
    adding: false,
    over: null,
  };
  const remember = () => writeSaved(entry, state);
  const veil = make("div", "vig-refedit-veil");
  veil.classList.add(SCHEME_CLASS);
  const card = make("div", "vig-refedit");
  veil.appendChild(card);
  const close = () => {
    veil.remove();
    document.removeEventListener("keydown", onKey, true);
    if (typeof options.onClosed === "function") options.onClosed();
  };
  const onKey = (event) => {
    if (event.key !== "Escape") return;
    if (document.querySelector(".vig-refedit-zoom")) return;
    event.stopPropagation();
    close();
  };
  const head = make("div", "vig-refedit-head");
  head.appendChild(make("b", "", `Appearance editor — ${entry.tag ? `@${entry.tag}` : entry.label || "reference"}`));
  head.appendChild(make("span", "spacer"));
  const closeButton = make("button", "vig-refedit-close", "×");
  closeButton.title = "Close (Esc)";
  closeButton.addEventListener("click", close);
  head.appendChild(closeButton);
  card.appendChild(head);
  const pair = make("div", "vig-refedit-pair");
  card.appendChild(pair);
  const mainPane = make("div", "vig-refedit-pane");
  const mainStage = make("div", "vig-refedit-stage main");
  const mainShot = document.createElement("img");
  mainStage.appendChild(mainShot);
  mainPane.appendChild(mainStage);
  const mainRow = make("div", "vig-refedit-picrow");
  const mainCaption = make("div", "vig-refedit-caption", "");
  mainRow.appendChild(mainCaption);
  const cropBar = make("span", "vig-refedit-cropbar");
  const cropGo = make("button", "vig-refedit-crop", "Crop");
  cropGo.dataset.log = "crop";
  const cropOff = make("button", "vig-refedit-small", "×");
  cropOff.title = "Drop the rectangle";
  cropBar.append(cropGo, cropOff);
  mainRow.appendChild(cropBar);
  const revert = make("button", "vig-refedit-small", "↺ back to the original");
  revert.title = "Put the reference picture back. The cropped file stays on disk.";
  mainRow.appendChild(revert);
  const adoptMain = make("button", "vig-refedit-small", "Replace the reference");
  adoptMain.title = "Make the cropped picture this reference's main image";
  mainRow.appendChild(adoptMain);
  mainPane.appendChild(mainRow);
  pair.appendChild(mainPane);
  const donorPane = make("div", "vig-refedit-pane");
  const donorStage = make("div", "vig-refedit-stage donor");
  const donorShot = document.createElement("img");
  donorStage.appendChild(donorShot);
  const overlay = make("div", "vig-refedit-overlay");
  donorStage.appendChild(overlay);
  donorPane.appendChild(donorStage);
  const donorRow = make("div", "vig-refedit-picrow");
  const donorCaption = make("div", "vig-refedit-caption", "");
  donorRow.appendChild(donorCaption);
  const fromDisk = make("button", "vig-refedit-small", "Browse…");
  fromDisk.title = "Choose a donor file on disk";
  donorRow.appendChild(fromDisk);
  const wipe = make("button", "vig-refedit-wipe", "Clear tags");
  wipe.title = "Take every tag off the donor";
  wipe.addEventListener("click", () => {
    state.segments = [];
    state.offers = [];
    state.points = [];
    remember();
    paintParts();
    paintBoxes();
    say("the donor tags are cleared");
  });
  donorRow.appendChild(wipe);
  const reAnalyse = make("button", "vig-refedit-small", "↻ Break apart");
  reAnalyse.title = "Find every part of the donor with the chosen model";
  donorRow.appendChild(reAnalyse);
  const showBoxes = make("button", "vig-refedit-small", "▣ Boxes");
  showBoxes.title = "Show or hide the boxes and their names. The contours stay.";
  showBoxes.addEventListener("click", () => {
    state.boxes = !state.boxes;
    remember();
    paintDonorRow();
    paintBoxes();
  });
  donorRow.appendChild(showBoxes);
  const bundle = make("button", "vig-refedit-small", "+");
  bundle.title = "Add parts to the selection: press, then click each thing on "
    + "the donor. A suit is trousers and a jacket and a waistcoat.";
  bundle.addEventListener("click", () => {
    state.adding = !state.adding;
    paintDonorRow();
    say(state.adding
      ? "adding — click each part on the donor; press + again when done"
      : "");
  });
  donorRow.appendChild(bundle);
  const drop = make("button", "vig-refedit-small", "\u2212");
  drop.title = "Take something OUT of the part: press, then click the bit that "
    + "does not belong -- the wall between an arm and a body, a hand, a shadow.";
  drop.addEventListener("click", () => {
    state.dropping = !state.dropping;
    if (state.dropping) state.adding = false;
    paintDonorRow();
    say(state.dropping
      ? "excluding — click what should not be in the part"
      : "");
  });
  donorRow.appendChild(drop);
  const paintDonorRow = () => {
    showBoxes.classList.toggle("on", !!state.boxes);
    bundle.classList.toggle("on", !!state.adding);
    drop.classList.toggle("on", !!state.dropping);
    donorStage.classList.toggle("adding", !!state.adding);
    donorStage.classList.toggle("dropping", !!state.dropping);
  };
  paintDonorRow();
  donorPane.appendChild(donorRow);
  pair.appendChild(donorPane);
  const paintPictures = () => {
    mainShot.src = url(state.main.source);
    const size = state.main.size ? ` — ${state.main.size}` : "";
    mainCaption.textContent = `main — <Picture 1>${
      state.main.label ? ` — ${state.main.label}` : ""}${size}`;
    mainCaption.title = state.main.source;
    cropBar.style.display = state.crop ? "" : "none";
    if (state.crop) {
      const [x0, y0, x1, y1] = state.crop;
      cropGo.textContent = `Crop ${Math.round(Math.abs(x1 - x0))}×${
        Math.round(Math.abs(y1 - y0))}`;
    }
    revert.style.display = state.dirty ? "" : "none";
    adoptMain.style.display = state.dirty ? "" : "none";
    donorShot.src = state.donor ? url(state.donor.source) : "";
    donorShot.style.display = state.donor ? "" : "none";
    donorCaption.textContent = state.donor
      ? `donor — ${state.donor.label || state.donor.source}`
      : "no donor chosen";
    donorCaption.title = state.donor ? state.donor.source : "";
    reAnalyse.disabled = !state.donor || !!state.busy;
    fromDisk.disabled = !!state.busy;
  };
  const rectOf = (shot, stage) => {
    const natural = [shot.naturalWidth, shot.naturalHeight];
    if (!natural[0] || !natural[1]) return null;
    const box = shot.getBoundingClientRect();
    const frame = stage.getBoundingClientRect();
    return {
      left: box.left - frame.left,
      top: box.top - frame.top,
      scale: box.width / natural[0],
      width: box.width,
      height: box.height,
    };
  };
  const donorRect = () => rectOf(donorShot, donorStage);
  const mainRect = () => rectOf(mainShot, mainStage);
  const paintOutlines = (rect) => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "vig-refedit-edges");
    svg.setAttribute("viewBox", "0 0 1 1");
    svg.setAttribute("preserveAspectRatio", "none");
    svg.style.left = `${rect.left}px`;
    svg.style.top = `${rect.top}px`;
    svg.style.width = `${rect.width}px`;
    svg.style.height = `${rect.height}px`;
    let drawn = 0;
    for (const segment of [...state.segments, ...state.offers]) {
      for (const path of segment.outline || []) {
        if (!path || path.length < 3) continue;
        const node = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
        node.setAttribute("points", path.map(([x, y]) => `${x},${y}`).join(" "));
        node.setAttribute("class", "edge"
          + (segment.on ? " on" : "") + (state.focus === segment ? " lit" : ""));
        node.setAttribute("vector-effect", "non-scaling-stroke");
        if (segment.token) node.dataset.part = segment.token;
        if (state.over === segment) node.classList.add("over");
        svg.appendChild(node);
        drawn += 1;
      }
    }
    if (drawn) overlay.parentElement.appendChild(svg);
  };
  const hoverPart = (segment) => {
    state.over = segment;
    for (const node of donorStage.querySelectorAll(".vig-refedit-edges .edge")) {
      node.classList.toggle("over", segment ? node.dataset.part === segment.token : false);
    }
    for (const node of overlay.querySelectorAll(".vig-refedit-box")) {
      node.classList.toggle("over", segment ? node.dataset.part === segment.token : false);
    }
  };
  const paintBoxes = () => {
    overlay.textContent = "";
    for (const old of donorStage.querySelectorAll(".vig-refedit-edges")) old.remove();
    const rect = donorRect();
    if (!rect) return;
    overlay.style.left = `${rect.left}px`;
    overlay.style.top = `${rect.top}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    for (const segment of (state.boxes ? [...state.segments, ...state.offers] : [])) {
      const [x0, y0, x1, y1] = segment.box || [0, 0, 0, 0];
      const node = make("div", "vig-refedit-box");
      if (segment.on) node.classList.add("on");
      if (segment.token) node.dataset.part = segment.token;
      if (state.over === segment) node.classList.add("over");
      if (state.focus === segment) node.classList.add("lit");
      if (segment.fresh) node.classList.add("fresh");
      node.style.left = `${x0 * rect.scale}px`;
      node.style.top = `${y0 * rect.scale}px`;
      node.style.width = `${(x1 - x0) * rect.scale}px`;
      node.style.height = `${(y1 - y0) * rect.scale}px`;
      node.appendChild(make("b", "", segment.name || "part"));
      node.title = `${segment.name || "part"} — ${segment.area}% of frame`;
      node.addEventListener("click", (event) => {
        event.stopPropagation();
        tickPart(segment);
      });
      overlay.appendChild(node);
    }
    for (const [index, point] of state.points.entries()) {
      const spot = make("div", "vig-refedit-spot");
      if ((state.marks[index] || [])[2] === 0) spot.classList.add("out");
      spot.style.left = `${point[0] * rect.scale}px`;
      spot.style.top = `${point[1] * rect.scale}px`;
      overlay.appendChild(spot);
    }
    paintOutlines(rect);
  };
  const tickPart = (segment) => {
    if (segment.fresh) {
      segment.fresh = false;
      segment.on = true;
      state.offers = state.offers.filter((other) => other !== segment);
      state.segments.push(segment);
      state.points = [];
    } else {
      segment.on = !segment.on;
    }
    paintParts();
    paintBoxes();
  };
  const pointIn = (shot, event) => {
    const rect = shot.getBoundingClientRect();
    if (!shot.naturalWidth || !rect.width) return null;
    return [
      ((event.clientX - rect.left) / rect.width) * shot.naturalWidth,
      ((event.clientY - rect.top) / rect.height) * shot.naturalHeight,
    ];
  };
  const inPicture = (event) => pointIn(donorShot, event);
  const paintBand = (stage, rect, corners) => {
    const old = stage.querySelector(".vig-refedit-band");
    if (old) old.remove();
    if (!corners || !rect) return;
    const [[x0, y0], [x1, y1]] = corners;
    const band = make("div", "vig-refedit-band");
    band.style.left = `${rect.left + Math.min(x0, x1) * rect.scale}px`;
    band.style.top = `${rect.top + Math.min(y0, y1) * rect.scale}px`;
    band.style.width = `${Math.abs(x1 - x0) * rect.scale}px`;
    band.style.height = `${Math.abs(y1 - y0) * rect.scale}px`;
    stage.appendChild(band);
  };
  const paintDrag = () => paintBand(donorStage, donorRect(), state.drag);
  const paintCrop = () => paintBand(mainStage, mainRect(), state.crop
    ? [[state.crop[0], state.crop[1]], [state.crop[2], state.crop[3]]]
    : (state.mainDrag || null));
  const easer = (get, set, paint, settled) => {
    let aim = null;
    let frame = 0;
    const tick = () => {
      frame = 0;
      if (aim === null) return;
      const now = get();
      const next = now + (aim - now) * 0.3;
      if (Math.abs(aim - next) < 0.003) {
        set(aim);
        aim = null;
        paint();
        if (settled) settled();
        return;
      }
      set(next);
      paint();
      frame = requestAnimationFrame(tick);
    };
    const to = (zoom) => {
      aim = zoom;
      if (!frame) frame = requestAnimationFrame(tick);
    };
    to.target = () => (aim === null ? get() : aim);
    return to;
  };
  const wheelFactor = (event) => {
    const unit = event.deltaMode === 1 ? 33 : event.deltaMode === 2 ? 400 : 1;
    const notches = (event.deltaY * unit) / 100;
    return Math.exp(-notches * 0.14);
  };
  const anchorPan = (anchor, zoom) => {
    const { at, client, box } = anchor;
    if (!box || !box.w || !box.h || !zoom) return null;
    const x = (client[0] - box.l - box.w / 2) / (zoom * box.w) - (at[0] - 0.5);
    const y = (client[1] - box.t - box.h / 2) / (zoom * box.h) - (at[1] - 0.5);
    return [0.5 - x, 0.5 - y];
  };
  const layoutBox = (shot, zoom, pan) => {
    const rect = shot.getBoundingClientRect();
    if (!rect.width || !rect.height || !zoom) return null;
    const w = rect.width / zoom;
    const h = rect.height / zoom;
    const x = 0.5 - pan[0];
    const y = 0.5 - pan[1];
    return {
      w,
      h,
      l: rect.left - w / 2 - (x - 0.5) * rect.width,
      t: rect.top - h / 2 - (y - 0.5) * rect.height,
    };
  };
  const applyView = () => {
    const zoom = Math.max(1, Math.min(8, state.zoom || 1));
    state.zoom = zoom;
    const [px, py] = state.pan;
    const room = (zoom - 1) / (2 * zoom);
    const x = Math.max(-room, Math.min(room, 0.5 - px));
    const y = Math.max(-room, Math.min(room, 0.5 - py));
    state.pan = [0.5 - x, 0.5 - y];
    donorShot.style.transformOrigin = "center center";
    donorShot.style.transform = `scale(${zoom}) translate(${x * 100}%, ${y * 100}%)`;
    donorStage.classList.toggle("zoomed", zoom > 1);
  };
  let donorAnchor = null;
  const glideDonor = easer(
    () => state.zoom,
    (zoom) => {
      state.zoom = zoom;
      if (donorAnchor) {
        const held = anchorPan(donorAnchor, zoom);
        if (held) state.pan = held;
      }
      applyView();
    },
    () => paintBoxes(),
    () => remember(),
  );
  donorStage.addEventListener("wheel", (event) => {
    if (!state.donor) return;
    event.preventDefault();
    event.stopPropagation();
    const at = inPicture(event);
    const was = glideDonor.target();
    const next = Math.max(1, Math.min(8, was * wheelFactor(event)));
    if (at && donorShot.naturalWidth) {
      donorAnchor = {
        at: [at[0] / donorShot.naturalWidth, at[1] / donorShot.naturalHeight],
        client: [event.clientX, event.clientY],
        box: layoutBox(donorShot, state.zoom, state.pan),
      };
    }
    glideDonor(next);
  }, { passive: false });
  const partAt = (at) => {
    if (!at) return null;
    const here = [...state.segments, ...state.offers]
      .filter((segment) => {
        const [x0, y0, x1, y1] = segment.box || [0, 0, 0, 0];
        return at[0] >= x0 && at[0] <= x1 && at[1] >= y0 && at[1] <= y1;
      });
    here.sort((a, b) => {
      const area = (s) => ((s.box[2] - s.box[0]) * (s.box[3] - s.box[1]));
      return area(a) - area(b);
    });
    return here[0] || null;
  };
  let press = null;
  donorShot.addEventListener("pointerdown", (event) => {
    if (!state.donor || state.busy) return;
    if (event.button !== 0 && event.button !== 1) return;
    const at = inPicture(event);
    if (!at) return;
    press = { at, client: [event.clientX, event.clientY], button: event.button,
              moved: false, pan: state.pan.slice() };
    if (event.button === 0) state.drag = [at, at];
    donorShot.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  donorShot.addEventListener("auxclick", (event) => {
    if (event.button === 1) event.preventDefault();
  });
  donorShot.addEventListener("pointermove", (event) => {
    if (!press) {
      hoverPart(partAt(inPicture(event)));
      return;
    }
    const moved = Math.abs(event.clientX - press.client[0])
      + Math.abs(event.clientY - press.client[1]);
    if (moved > 4) press.moved = true;
    if (press.button === 0) {
      if (!press.moved) return;
      const at = inPicture(event);
      if (at) { state.drag = [press.at, at]; paintDrag(); }
      return;
    }
    if (!press.moved || !donorShot.naturalWidth) return;
    donorAnchor = null;
    const box = donorShot.getBoundingClientRect();
    state.pan = [
      press.pan[0] - (event.clientX - press.client[0]) / (box.width || 1),
      press.pan[1] - (event.clientY - press.client[1]) / (box.height || 1),
    ];
    applyView();
    paintBoxes();
  });
  donorShot.addEventListener("pointerleave", () => { if (!press) hoverPart(null); });
  donorShot.addEventListener("pointerup", async (event) => {
    const held = press;
    press = null;
    if (!held) return;
    try {
      donorShot.releasePointerCapture(event.pointerId);
    } catch {
    }
    if (held.button === 1) {
      if (held.moved) remember();
      return;
    }
    if (held.moved) {
      const corners = state.drag;
      state.drag = null;
      paintDrag();
      if (!corners) return;
      const [[x0, y0], [x1, y1]] = corners;
      const wide = Math.abs(x1 - x0);
      const tall = Math.abs(y1 - y0);
      if (wide <= 12 || tall <= 12) { showWord(null, held.at); return; }
      const drawn = [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)];
      state.phrase = "";
      showWord(drawn);
      await readRegion(drawn, null, "");
      return;
    }
    state.drag = null;
    paintDrag();
    const hit = partAt(held.at);
    if (hit) {
      if (!state.adding) for (const other of state.segments) other.on = false;
      state.focus = hit;
      if (hit.fresh) tickPart(hit); else hit.on = state.adding ? true : !hit.on;
      remember();
      paintParts();
      paintBoxes();
      return;
    }
    if (state.dropping && state.marks.length) {
      state.marks.push([held.at[0], held.at[1], 0]);
      await readRegion(null, null, state.phrase || "");
      return;
    }
    state.phrase = "";
    state.marks = [[held.at[0], held.at[1], 1]];
    showWord(null, held.at);
    await readRegion(null, held.at, "");
  });
  const spin = (on) => {
    const had = donorStage.querySelector(".vig-refedit-spin");
    if (!on) { if (had) had.remove(); return; }
    if (had) return;
    donorStage.appendChild(make("div", "vig-refedit-spin"));
  };
  const readRegion = async (box, point, phrase) => {
    const said = (phrase || "").trim();
    if (box) state.marks = [];
    else if (point) state.marks = [[point[0], point[1], 1]];
    state.points = state.marks.map((mark) => mark.slice(0, 2));
    paintBoxes();
    spin(true);
    try {
      await ask(box
      ? (said ? `looking for "${said}" in the box…` : "reading the box…")
      : (state.marks.filter((mark) => mark[2] === 0).length
        ? "reading it again without that bit…"
        : "reading where you clicked — the model names it, a few seconds…"),
    async () => {
      const answer = await options.segment({
        source: state.donor.source,
        method: state.method,
        dials: state.dials,
        points: box ? [] : state.marks.map((mark) => mark.slice()),
        box,
        prompt: said,
      });
      state.offers = (answer.candidates || []).map((candidate) => ({
        token: candidate.token,
        name: candidate.name || "part",
        said: candidate.said || "",
        area: candidate.area,
        box: candidate.box,
        cutter: candidate.cutter || "",
        match: candidate.match,
        outline: candidate.outline || [],
        matted: candidate.matted,
        matte: true,
        on: false,
        fresh: true,
      }));
      const notes = (answer.notes || []).join("; ");
      say(state.offers.length
        ? (state.offers.length > 1
          ? `${state.offers.length} readings — take the one you meant`
          : `found: ${state.offers[0].said || state.offers[0].name}`)
          + (notes ? ` — ${notes}` : "")
        : (notes || "nothing came back — try again"), !!notes);
      paintParts();
      paintBoxes();
      });
    } finally {
      spin(false);
    }
  };
  const dropWord = () => {
    const old = donorStage.querySelector(".vig-refedit-word");
    if (old) old.remove();
    state.drawn = null;
  };
  const showWord = (box, point) => {
    dropWord();
    const rect = donorRect();
    if (!rect || (!box && !point)) return;
    state.drawn = box;
    state.spot = point || null;
    const where = box || [point[0] - 1, point[1] - 1, point[0] + 1, point[1] + 1];
    const field = make("div", "vig-refedit-word");
    const input = make("input");
    input.type = "text";
    input.placeholder = "which thing? e.g. necktie";
    input.value = state.phrase || "";
    const go = make("button", "", "↵");
    go.title = "Look for this word inside the box";
    const off = make("button", "drop", "✕");
    off.title = "Drop the field";
    field.append(input, go, off);
    const left = rect.left + Math.min(where[0], where[2]) * rect.scale;
    const below = rect.top + Math.max(where[1], where[3]) * rect.scale + 4;
    const above = rect.top + Math.min(where[1], where[3]) * rect.scale - 30;
    field.style.left = `${Math.max(2, Math.min(left, rect.left + rect.width - 190))}px`;
    field.style.top = `${below + 30 < rect.top + rect.height ? below : Math.max(2, above)}px`;
    donorStage.appendChild(field);
    const run = async () => {
      state.phrase = input.value.trim();
      remember();
      for (let waited = 0; state.busy && waited < 100; waited += 1) {
        await new Promise((settle) => { setTimeout(settle, 60); });
      }
      readRegion(box, point || null, state.phrase);
    };
    go.addEventListener("click", () => { void run(); });
    off.addEventListener("click", () => { state.phrase = ""; dropWord(); });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); void run(); }
      if (event.key === "Escape") { event.preventDefault(); dropWord(); }
      event.stopPropagation();
    });
    input.focus();
  };
  donorShot.addEventListener("pointerup", async (event) => {
    if (!state.drag) return;
    const [[x0, y0], [x1, y1]] = state.drag;
    state.drag = null;
    paintDrag();
    try {
      donorShot.releasePointerCapture(event.pointerId);
    } catch {
    }
    const wide = Math.abs(x1 - x0);
    const tall = Math.abs(y1 - y0);
    const box = wide > 12 && tall > 12
      ? [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
      : null;
    if (box) showWord(box); else dropWord();
    await readRegion(box, box ? null : [x0, y0], box ? state.phrase : "");
  });
  for (const shot of [donorShot, mainShot]) {
    shot.draggable = false;
    shot.addEventListener("dragstart", (event) => event.preventDefault());
  }
  donorShot.addEventListener("load", () => {
    state.donorSize = [donorShot.naturalWidth, donorShot.naturalHeight];
    paintBoxes();
  });
  const applyMainView = () => {
    const zoom = Math.max(1, Math.min(8, state.mainZoom || 1));
    state.mainZoom = zoom;
    const [px, py] = state.mainPan;
    const room = (zoom - 1) / (2 * zoom);
    const x = Math.max(-room, Math.min(room, 0.5 - px));
    const y = Math.max(-room, Math.min(room, 0.5 - py));
    state.mainPan = [0.5 - x, 0.5 - y];
    mainShot.style.transformOrigin = "center center";
    mainShot.style.transform = `scale(${zoom}) translate(${x * 100}%, ${y * 100}%)`;
    mainStage.classList.toggle("zoomed", zoom > 1);
  };
  let mainAnchor = null;
  const glideMain = easer(
    () => state.mainZoom,
    (zoom) => {
      state.mainZoom = zoom;
      if (mainAnchor) {
        const held = anchorPan(mainAnchor, zoom);
        if (held) state.mainPan = held;
      }
      applyMainView();
    },
    () => paintCrop(),
    () => remember(),
  );
  mainStage.addEventListener("wheel", (event) => {
    if (!state.main.source) return;
    event.preventDefault();
    event.stopPropagation();
    const at = pointIn(mainShot, event);
    const was = glideMain.target();
    const next = Math.max(1, Math.min(8, was * wheelFactor(event)));
    if (at && mainShot.naturalWidth) {
      mainAnchor = {
        at: [at[0] / mainShot.naturalWidth, at[1] / mainShot.naturalHeight],
        client: [event.clientX, event.clientY],
        box: layoutBox(mainShot, state.mainZoom, state.mainPan),
      };
    }
    glideMain(next);
  }, { passive: false });
  let mainPress = null;
  mainShot.addEventListener("pointerdown", (event) => {
    if (state.busy || !state.main.source) return;
    if (event.button !== 0 && event.button !== 1) return;
    const at = pointIn(mainShot, event);
    if (!at) return;
    mainPress = { client: [event.clientX, event.clientY], button: event.button,
                  moved: false, pan: state.mainPan.slice() };
    if (event.button === 0) {
      state.crop = null;
      state.mainDrag = [at, at];
    }
    mainShot.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  mainShot.addEventListener("auxclick", (event) => {
    if (event.button === 1) event.preventDefault();
  });
  mainShot.addEventListener("pointermove", (event) => {
    if (!mainPress) return;
    const moved = Math.abs(event.clientX - mainPress.client[0])
      + Math.abs(event.clientY - mainPress.client[1]);
    if (moved > 4) mainPress.moved = true;
    if (mainPress.button === 0) {
      if (!state.mainDrag) return;
      const at = pointIn(mainShot, event);
      if (!at) return;
      state.mainDrag = [state.mainDrag[0], at];
      paintCrop();
      return;
    }
    if (!mainPress.moved || !mainShot.naturalWidth) return;
    mainAnchor = null;
    const box = mainShot.getBoundingClientRect();
    state.mainPan = [
      mainPress.pan[0] - (event.clientX - mainPress.client[0]) / (box.width || 1),
      mainPress.pan[1] - (event.clientY - mainPress.client[1]) / (box.height || 1),
    ];
    applyMainView();
    paintCrop();
  });
  mainShot.addEventListener("pointerup", (event) => {
    const held = mainPress;
    mainPress = null;
    try {
      mainShot.releasePointerCapture(event.pointerId);
    } catch {
    }
    if (held && held.button === 1) {
      if (held.moved) remember();
      return;
    }
    if (!state.mainDrag) return;
    const [[x0, y0], [x1, y1]] = state.mainDrag;
    state.mainDrag = null;
    state.crop = Math.abs(x1 - x0) >= CROP_MINIMUM && Math.abs(y1 - y0) >= CROP_MINIMUM
      ? [Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]
      : null;
    paintCrop();
    paintPictures();
  });
  cropOff.addEventListener("click", () => {
    state.crop = null;
    paintCrop();
    paintPictures();
  });
  revert.addEventListener("click", () => {
    state.main = { source: entry.source || "", label: entry.label || "" };
    state.crop = null;
    state.dirty = false;
    remember();
    paintCrop();
    paintPictures();
    paintTakes();
    say("the main picture is back to the reference");
  });
  cropGo.addEventListener("click", async () => {
    if (!state.crop || typeof options.referenceCrop !== "function") return;
    const box = state.crop;
    await ask("cropping…", async () => {
      const answer = await options.referenceCrop({ source: state.main.source, box });
      if (!answer || answer.ok === false) {
        throw new Error((answer && answer.error) || "the crop failed");
      }
      state.main = {
        source: answer.source,
        label: answer.label || state.main.label,
        size: `${answer.width}×${answer.height}`,
      };
      state.crop = null;
      state.dirty = true;
      remember();
      paintCrop();
      paintPictures();
      paintControls();
      say(`cropped to ${answer.width}×${answer.height} — press "Replace the reference" `
        + "under the picture to make it the reference");
    });
  });
  window.addEventListener("resize", () => {
    paintBoxes();
    paintCrop();
  });
  const info = (text) => {
    const button = make("button", "vig-refedit-info", "ⓘ");
    button.type = "button";
    button.title = "What this setting does";
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const row = button.closest(".vig-refedit-set");
      if (!row) return;
      const next = row.nextElementSibling;
      const mine = next && next.classList.contains("vig-refedit-pop");
      for (const note of card.querySelectorAll(".vig-refedit-pop")) note.remove();
      if (mine) return;
      row.after(make("div", "vig-refedit-pop", text));
    });
    return button;
  };
  const desk = make("div", "vig-refedit-desk");
  const deskLeft = make("div", "vig-refedit-col work");
  const deskRight = make("div", "vig-refedit-col dials");
  desk.append(deskLeft, deskRight);
  card.appendChild(desk);
  const block = (into, name) => {
    const box = make("div", "vig-refedit-block");
    if (name) box.appendChild(make("div", "vig-refedit-blockname", name));
    into.appendChild(box);
    return box;
  };
  const blockTags = block(deskLeft, "");
  const blockAngle = block(deskLeft, "angle");
  const blockPrompt = block(deskLeft, "");
  const blockDo = block(deskLeft, "");
  const blockOut = block(deskLeft, "takes");
  const blockSettings = block(deskRight, "settings");
  const ways = make("div", "vig-refedit-ways");
  blockTags.appendChild(ways);
  const partsLine = make("div", "vig-refedit-parts");
  blockTags.appendChild(partsLine);
  partsLine.addEventListener("pointerleave", () => hoverPart(null));
  let renaming = false;
  partsLine.addEventListener("dblclick", (event) => {
    const chip = event.target && event.target.closest
      ? event.target.closest(".vig-refedit-part") : null;
    if (!chip || renaming) return;
    event.preventDefault();
    event.stopPropagation();
    const token = chip.dataset.token || "";
    const segment = [...state.segments, ...state.offers]
      .find((one) => (one.token || "") === token);
    const word = chip.querySelector(".word");
    if (!segment || !word) return;
    renaming = true;
    const was = segment.name || "";
    word.contentEditable = "true";
    word.spellcheck = false;
    chip.classList.add("renaming");
    word.focus();
    const range = document.createRange();
    range.selectNodeContents(word);
    const picked = window.getSelection();
    picked.removeAllRanges();
    picked.addRange(range);
    const finish = (keep) => {
      if (!renaming) return;
      renaming = false;
      word.removeEventListener("keydown", onKeys, true);
      word.removeEventListener("blur", onBlur);
      word.contentEditable = "false";
      chip.classList.remove("renaming");
      const asked = (word.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (keep && asked && asked !== was) {
        segment.name = asked;
        say(`renamed to "${asked}" — it is what the prompt will say`);
      }
      paintParts();
    };
    const onKeys = (key) => {
      key.stopPropagation();
      if (key.key === "Enter") {
        key.preventDefault();
        finish(true);
      } else if (key.key === "Escape") {
        key.preventDefault();
        finish(false);
      }
    };
    const onBlur = () => finish(true);
    word.addEventListener("keydown", onKeys, true);
    word.addEventListener("blur", onBlur);
  });
  const hint = make("div", "vig-refedit-status",
    "Drag a box round a part and, if it helps, type what it is. "
    + "The whole donor at once is the Break apart button.");
  blockTags.appendChild(hint);
  const paintWays = () => {
    ways.textContent = "";
    for (const method of state.methods) {
      const badge = make("button", `vig-refedit-way ${method.id}`);
      if (method.id === state.method) badge.classList.add("on");
      badge.appendChild(make("span", "", method.label || method.id));
      badge.appendChild(make("i", "load"));
      badge.dataset.method = method.id;
      badge.disabled = !method.ready;
      badge.title = [method.label, method.namer ? `names: ${method.namer}` : "",
                     method.note].filter(Boolean).join("\n");
      badge.addEventListener("click", () => setMethod(method.id));
      ways.appendChild(badge);
    }
    paintLoad();
  };
  const paintLoad = () => {
    for (const badge of ways.querySelectorAll(".vig-refedit-way")) {
      const fill = badge.querySelector("i.load");
      if (!fill) continue;
      const mine = state.loading && state.loading.method === badge.dataset.method;
      badge.classList.toggle("loading", !!mine);
      if (mine) {
        const held = state.loading.done
          ? 1
          : Math.min(0.92, (Date.now() - state.loading.at) / (state.loading.span * 1000));
        fill.style.width = `${Math.round(held * 100)}%`;
        continue;
      }
      fill.style.width = badge.dataset.method === state.method ? "100%" : "0%";
    }
  };
  const warm = async (method) => {
    if (typeof options.segmentWarm !== "function") return;
    const chosen = state.methods.find((one) => one.id === method);
    const span = Math.max(0.4, Number(chosen && chosen.warm_seconds) || 2.5);
    state.loading = { method, at: Date.now(), span, done: false };
    paintLoad();
    const tick = setInterval(paintLoad, 80);
    try {
      await options.segmentWarm({ method });
    } catch {
    } finally {
      clearInterval(tick);
      if (state.loading && state.loading.method === method) {
        state.loading.done = true;
        paintLoad();
        setTimeout(() => {
          if (state.loading && state.loading.method === method) state.loading = null;
          paintLoad();
        }, 320);
      }
    }
  };
  const paintParts = () => {
    partsLine.textContent = "";
    for (const segment of [...state.segments, ...state.offers]) {
      const chip = make("button", "vig-refedit-part");
      if (segment.on) chip.classList.add("on");
      if (segment.fresh) chip.classList.add("fresh");
      chip.dataset.token = segment.token || "";
      const word = make("span", "word", segment.name || "part");
      word.title = "Double-click to rename";
      chip.appendChild(word);
      chip.appendChild(make("i", "", `${segment.area}%`));
      const off = make("span", "off", "✕");
      off.title = "Take this tag off";
      off.addEventListener("click", (event) => {
        event.stopPropagation();
        state.segments = state.segments.filter((item) => item !== segment);
        state.offers = state.offers.filter((item) => item !== segment);
        remember();
        paintParts();
        paintBoxes();
      });
      chip.appendChild(off);
      const cut = segment.cutter ? CUTTER_NAMES[segment.cutter] || segment.cutter : "";
      const matched = typeof segment.match === "number"
        ? `, ${Math.round(segment.match * 100)}% of the box you drew`
        : "";
      chip.title = (segment.said ? `${segment.said}\n` : "")
        + (cut ? `found by ${cut}${matched}\n` : "")
        + (segment.fresh
          ? "A fresh reading — press to keep it"
          : "Press to switch it on or off");
      if (state.focus === segment) chip.classList.add("lit");
      chip.addEventListener("pointerenter", () => hoverPart(segment));
      chip.addEventListener("pointerleave", () => hoverPart(null));
      chip.addEventListener("click", () => {
        if (renaming) return;
        state.focus = segment;
        tickPart(segment);
      });
      partsLine.appendChild(chip);
    }
    if (!state.segments.length && !state.offers.length) {
      partsLine.appendChild(make("span", "vig-refedit-status",
        state.donor ? "no parts yet" : "choose a donor"));
    }
    wipe.disabled = !state.segments.length && !state.offers.length;
    paintControls();
  };
  const line = make("div", "vig-refedit-line");
  const transfer = make("button", "vig-refedit-go", "Process");
  line.appendChild(transfer);
  const stop = make("button", "vig-refedit-stop vig-refedit-fillable");
  const stopFill = make("span", "vig-refedit-fill");
  stop.append(stopFill, make("span", "label", "✕ Cancel"));
  stop.title = "Stop this generation. A take already finished stays on the shelf.";
  line.appendChild(stop);
  const status = make("span", "vig-refedit-status", "");
  line.appendChild(status);
  blockDo.appendChild(line);
  const takesSet = make("div", "vig-refedit-set");
  takesSet.appendChild(make("span", "name", "takes"));
  const takesSelect = document.createElement("select");
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const option = make("option", "", `×${n}`);
    option.value = String(n);
    if (n === 3) option.selected = true;
    takesSelect.appendChild(option);
  }
  takesSet.appendChild(takesSelect);
  takesSet.appendChild(info("How many pictures one press of Process makes. "
    + "They differ only by seed, and every one of them lands on the shelf with "
    + "the prompt it was rendered from."));
  blockSettings.appendChild(takesSet);
  const seedRow = make("div", "vig-refedit-set");
  seedRow.appendChild(make("span", "name", "seed"));
  const seedInput = document.createElement("input");
  seedInput.type = "number";
  seedInput.value = String(Math.floor(Math.random() * 1e6));
  seedRow.appendChild(seedInput);
  const dice = make("button", "vig-refedit-small", "🎲");
  dice.title = "A fresh seed";
  dice.addEventListener("click", () => {
    seedInput.value = String(Math.floor(Math.random() * 1e6));
  });
  seedRow.appendChild(dice);
  seedRow.appendChild(info("The number the first take is rendered from; the rest "
    + "of a batch follow on from it. The same seed with the same prompt and the "
    + "same pictures gives the same take back."));
  blockSettings.appendChild(seedRow);
  const views = make("div", "vig-refedit-line");
  const viewButtons = [];
  const paintViews = () => {
    for (const button of viewButtons) {
      button.classList.toggle("on", button.dataset.view === state.view);
    }
  };
  for (const [id, label] of VIEWS) {
    const button = make("button", "vig-refedit-small", label);
    button.dataset.view = id;
    button.title = "Frame the take this way. Process renders it.";
    button.addEventListener("click", () => {
      state.view = state.view === id ? "" : id;
      remember();
      paintViews();
      say(state.view
        ? "angle set — press Process to render it"
        : "angle cleared");
    });
    views.appendChild(button);
    viewButtons.push(button);
  }
  blockAngle.appendChild(views);
  paintViews();
  const DIALS = [
    ["score", "how sure SAM has to be", "0.05 – 0.95. Higher offers fewer parts and surer ones."],
    ["speck", "smallest piece kept, % of frame",
     "0 – 5. Lower keeps more of a ragged mask; 0 keeps every speck."],
    ["holes", "a hole this close to the background stays open",
     "0 – 400, as colour distance. 0 fills every hole, which is what the wall "
     + "under an elbow used to come in through."],
    ["carry", "carrying more of the figure than this frames it full length",
     "0.1 – 0.95, as a share of the donor's height."],
  ];
  const dialsFold = make("button", "vig-refedit-fold", "▸ Segmentation");
  dialsFold.dataset.log = "segmentation fold";
  dialsFold.title = "The thresholds these models are held to. Untouched = the measured default.";
  blockSettings.appendChild(dialsFold);
  const dialsBody = make("div", "vig-refedit-foldbody");
  blockSettings.appendChild(dialsBody);
  const dialsNote = make("div", "vig-refedit-status bad", "");
  dialsBody.appendChild(dialsNote);
  const dialRows = new Map();
  for (const [name, label, hint] of DIALS) {
    const row = make("div", "vig-refedit-set dial");
    row.appendChild(make("span", "name", label));
    const slider = make("input", "slide");
    slider.type = "range";
    slider.disabled = true;
    const field = make("input", "num");
    field.type = "number";
    field.placeholder = "—";
    field.disabled = true;
    const mark = make("span", "moved", "");
    const put = (value, fromField) => {
      if (fromField && String(value).trim() === "") {
        delete state.dials[name];
        paintDials();
        remember();
        say(`${label} — back to the measured default`);
        return;
      }
      const range = state.dialRanges[name] || {};
      const low = Number(range.low), high = Number(range.high);
      let next = Number(value);
      if (!Number.isFinite(next)) return;
      if (Number.isFinite(low) && Number.isFinite(high)) {
        next = Math.min(Math.max(next, low), high);
      }
      state.dials[name] = next;
      paintDials();
      remember();
      say(`${label} — ${next}; press Break apart or draw again to use it`);
    };
    slider.addEventListener("input", () => put(slider.value, false));
    field.addEventListener("change", () => put(field.value, true));
    row.append(slider, field, mark, info(hint));
    dialsBody.appendChild(row);
    dialRows.set(name, { slider, field, mark });
  }
  const paintDials = () => {
    for (const [name, row] of dialRows) {
      const range = state.dialRanges[name];
      const set = state.dials[name];
      const ready = !!range;
      row.slider.disabled = !ready;
      row.field.disabled = !ready;
      if (ready) {
        for (const box of [row.slider, row.field]) {
          box.min = String(range.low);
          box.max = String(range.high);
          box.step = String(range.step);
        }
        const shown = set === undefined ? range.default : set;
        row.slider.value = String(shown);
        row.field.value = set === undefined ? "" : String(set);
        row.field.placeholder = String(range.default);
      }
      row.mark.textContent = set === undefined ? "" : "moved";
    }
    dialsNote.textContent = (state.methods.length && !Object.keys(state.dialRanges).length)
      ? "This ComfyUI has not reported the thresholds' ranges — restart it to move them."
      : "";
    dialsFold.textContent = (state.dialsOpen ? "▾" : "▸") + " Segmentation"
      + (Object.keys(state.dials).length ? ` (${Object.keys(state.dials).length} moved)` : "");
    dialsBody.style.display = state.dialsOpen ? "" : "none";
  };
  const dialsReset = make("button", "vig-refedit-ghost", "Back to the measured defaults");
  dialsReset.addEventListener("click", () => {
    state.dials = {};
    paintDials();
    remember();
    say("thresholds back to the measured defaults");
  });
  dialsBody.appendChild(dialsReset);
  dialsFold.addEventListener("click", () => {
    state.dialsOpen = !state.dialsOpen;
    remember();
    paintDials();
  });
  paintDials();
  const promptHead = make("div", "vig-refedit-prompthead");
  const promptFold = make("button", "vig-refedit-fold", "▸ Prompt");
  promptFold.dataset.log = "prompt fold";
  promptFold.title = "The prompt that will render. Press to open it.";
  promptHead.appendChild(promptFold);
  const langWrap = make("div", "vig-refedit-langs");
  promptHead.appendChild(langWrap);
  blockPrompt.appendChild(promptHead);
  const promptBody = make("div", "vig-refedit-foldbody");
  blockPrompt.appendChild(promptBody);
  const paintFold = () => {
    promptFold.textContent = `${state.promptOpen ? "▾" : "▸"} Prompt`;
    promptBody.style.display = state.promptOpen ? "" : "none";
  };
  promptFold.addEventListener("click", () => {
    state.promptOpen = !state.promptOpen;
    remember();
    paintFold();
  });
  paintFold();
  const textWrap = make("div", "vig-refedit-textwrap");
  promptBody.appendChild(textWrap);
  const prompt = document.createElement("textarea");
  prompt.spellcheck = false;
  prompt.placeholder = "The writer fills this in when you press Process, or an angle. "
    + "You can edit it and render again.";
  textWrap.appendChild(prompt);
  let translating = false;
  const promptWork = make("div", "vig-refedit-working");
  promptWork.appendChild(make("div", "ring"));
  const promptStop = make("button", "stop", "✕");
  promptStop.title = "Stop the translation. The prompt is left exactly as it is.";
  promptWork.appendChild(promptStop);
  textWrap.appendChild(promptWork);
  const paintPromptWork = () => {
    promptWork.style.display = translating ? "" : "none";
  };
  paintPromptWork();
  let typing = 0;
  prompt.addEventListener("input", () => {
    state.prompt = prompt.value;
    state.promptEdited = true;
    paintControls();
    window.clearTimeout(typing);
    typing = window.setTimeout(remember, 400);
  });
  const paintLangs = () => {
    langWrap.textContent = "";
    for (const [code, label, title] of [
      ["EN", "EN", "English — the language the model reads"],
      ["ZH", "中文", "Chinese — the language the model reads"],
      ["RU", "RU", "Russian — read and edit in your own language"],
    ]) {
      const button = make("button", "", label);
      button.title = title;
      if ((state.promptLang || "EN") === code) button.classList.add("on");
      button.disabled = !!state.busy || translating;
      button.addEventListener("click", () => switchPromptLanguage(code));
      langWrap.appendChild(button);
    }
  };
  const switchPromptLanguage = async (target) => {
    const source = state.promptLang || "EN";
    if (source === target || state.busy) return;
    if (!(prompt.value || "").trim()) {
      say("there is no prompt to translate yet");
      return;
    }
    if (source === "RU" && !state.promptEdited
        && state.langPre === target && state.promptPre) {
      prompt.value = state.promptPre;
      state.prompt = prompt.value;
      state.promptLang = target;
      state.promptPre = "";
      state.langPre = "";
      state.promptEdited = false;
      remember();
      paintLangs();
      paintControls();
      say(`back to ${target} — the prompt as it was written`);
      return;
    }
    const route = options.translatePrompt;
    if (typeof route !== "function") {
      say("this console cannot reach the translator", true);
      return;
    }
    if (!state.promptOpen) {
      state.promptOpen = true;
      paintFold();
    }
    translating = true;
    paintPromptWork();
    paintLangs();
    try {
      await ask(`translating to ${target}…`, async ({ job, init }) => {
        const answer = await route({ prompt: prompt.value, source, target, job }, init);
        state.promptPre = prompt.value;
        state.langPre = source;
        prompt.value = answer.prompt || prompt.value;
        state.prompt = prompt.value;
        state.promptLang = target;
        state.promptEdited = false;
        remember();
        paintLangs();
        paintControls();
        const lost = String(answer.report || "")
          .split(String.fromCharCode(10))
          .filter((line) => line.startsWith("WARNING"));
        say(lost.length ? lost.join(" ") : `translated to ${target}`, lost.length > 0);
      });
    } finally {
      translating = false;
      paintPromptWork();
      paintLangs();
    }
  };
  paintLangs();
  const promptLine = make("div", "vig-refedit-line");
  const again = make("button", "vig-refedit-small", "↻ Render this prompt");
  again.title = "Send H3 exactly what is in the field above";
  promptLine.appendChild(again);
  promptBody.appendChild(promptLine);
  const takesRow = make("div", "vig-refedit-takes");
  blockOut.appendChild(takesRow);
  const shelfLine = make("div", "vig-refedit-line");
  const clear = make("button", "vig-refedit-small", "× Clear the shelf");
  clear.title = "Take the takes out of the editor. The files stay on disk.";
  shelfLine.appendChild(clear);
  blockOut.appendChild(shelfLine);
  const zoom = (take) => {
    const over = make("div", "vig-refedit-zoom");
    over.classList.add(SCHEME_CLASS);
    const picture = document.createElement("img");
    picture.src = url(take.source);
    over.appendChild(picture);
    const bar = make("div", "bar");
    bar.appendChild(make("span", "",
      `take ${take.take}${take.batch ? ` · batch ${take.batch}` : ""} — seed ${take.seed}`));
    const adopt = make("button", "vig-refedit-small", "Replace the reference");
    adopt.addEventListener("click", (event) => {
      event.stopPropagation();
      adoptPicture(take.source);
      over.remove();
    });
    bar.appendChild(adopt);
    if (take.prompt) {
      const back = make("button", "vig-refedit-small", "↑ Bring this prompt back");
      back.title = "Put this take prompt in the field — edit it and render again";
      back.addEventListener("click", (event) => {
        event.stopPropagation();
        prompt.value = take.prompt;
        state.prompt = take.prompt;
        remember();
        paintControls();
        say(`take ${take.take} prompt is in the field — edit it and press Render`);
        over.remove();
      });
      bar.appendChild(back);
    }
    over.appendChild(bar);
    if (take.prompt) {
      const said = make("div", "said", take.prompt);
      said.addEventListener("click", (event) => event.stopPropagation());
      over.appendChild(said);
    }
    over.addEventListener("click", () => over.remove());
    (options.mount || document.body).appendChild(over);
  };
  const takeAdopts = [];
  const paintTakes = () => {
    takesRow.textContent = "";
    takeAdopts.length = 0;
    for (const take of state.takes) {
      const box = make("div", "vig-refedit-take");
      const picture = make("div", "pic", take.source ? "" : "rendering…");
      if (take.source) {
        picture.style.backgroundImage = `url("${url(take.source)}")`;
        picture.title = "Open it full size";
        picture.addEventListener("click", () => zoom(take));
      }
      box.appendChild(picture);
      const drop = make("button", "drop", "✕");
      drop.title = "Delete this take";
      drop.addEventListener("click", (event) => {
        event.stopPropagation();
        state.takes = state.takes.filter((item) => item !== take);
        remember();
        paintTakes();
        say("the take is gone");
      });
      box.appendChild(drop);
      const caption = make("div", "vig-refedit-caption",
        `take ${take.take}${take.batch ? `·${take.batch}` : ""}${
          take.seed !== undefined ? ` — seed ${take.seed}` : ""}`);
      if (take.prompt) caption.title = take.prompt;
      box.appendChild(caption);
      const adopt = make("button", "adopt", "Replace the reference");
      adopt.title = "Make this take the reference main picture";
      adopt.disabled = !take.source || !!state.busy || state.rendering;
      takeAdopts.push({ button: adopt, take });
      adopt.addEventListener("click", (event) => {
        event.stopPropagation();
        if (take.source) adoptPicture(take.source);
      });
      box.appendChild(adopt);
      takesRow.appendChild(box);
    }
    paintControls();
  };
  const WRITE_SHARE = 0.3;
  let progressTicker = 0;
  const fillFraction = () => {
    const job = state.progress;
    if (!job) return null;
    const share = job.wrote ? WRITE_SHARE : 0;
    if (state.rendering) {
      const takesDone = job.takes
        ? ((Math.max(1, job.take) - 1) + (job.total ? job.step / job.total : 0)) / job.takes
        : 0;
      return share + (1 - share) * Math.max(0.02, Math.min(1, takesDone));
    }
    if (state.busy) {
      const seconds = (Date.now() - job.startedAt) / 1000;
      return WRITE_SHARE * (1 - Math.exp(-seconds / 25));
    }
    return null;
  };
  const paintFill = () => {
    const fraction = fillFraction();
    const on = fraction !== null;
    stop.classList.toggle("filling", on);
    stopFill.style.width = on ? `${Math.round(fraction * 100)}%` : "0%";
  };
  const trackProgress = (held) => {
    if (held && !state.progress) {
      state.progress = { startedAt: Date.now(), wrote: false, take: 0, takes: 0, step: 0, total: 0 };
      progressTicker = setInterval(paintFill, 500);
    } else if (!held && state.progress) {
      state.progress = null;
      clearInterval(progressTicker);
    }
    if (state.progress && state.busy) state.progress.wrote = true;
    paintFill();
  };
  const paintControls = () => {
    const ticked = state.segments.filter((segment) => segment.on);
    const held = !!state.busy || state.rendering;
    trackProgress(held);
    transfer.style.display = held ? "none" : "";
    stop.style.display = held ? "" : "none";
    transfer.disabled = held || !ticked.length || !state.main.source;
    again.disabled = held || !prompt.value.trim();
    adoptMain.disabled = held;
    for (const { button, take } of takeAdopts) button.disabled = held || !take.source;
    clear.disabled = held || !state.takes.length;
    for (const button of viewButtons) button.disabled = held || !state.main.source;
  };
  const say = (text, bad) => {
    status.textContent = text;
    status.classList.toggle("bad", !!bad);
  };
  const ask = async (label, work) => {
    if (state.busy) return;
    const aborter = typeof AbortController === "function" ? new AbortController() : null;
    const job = { token: `refedit-${Date.now()}-${Math.random().toString(36).slice(2)}` };
    state.busy = label;
    state.job = { aborter, token: job.token };
    say(label);
    paintControls();
    paintPictures();
    try {
      await work({ job, init: aborter ? { signal: aborter.signal } : undefined });
    } catch (error) {
      const name = error && error.name;
      if (name === "AbortError" || state.cancelled) say("cancelled");
      else say(`${error && error.message ? error.message : error}`, true);
    } finally {
      state.busy = "";
      state.job = null;
      state.cancelled = false;
      paintControls();
      paintPictures();
    }
  };
  const analyse = async (force) => {
    if (!state.donor || typeof options.segmentAuto !== "function") return;
    const chosen = state.methods.find((method) => method.id === state.method);
    if (chosen && chosen.auto === false) {
      say("this method works off a box — drag one on the donor");
      return;
    }
    const source = `${state.method}|${state.donor.source}`;
    if (!force && state.analysed.has(source)) return;
    await ask("breaking the donor into parts — about half a minute…",
              async ({ job, init }) => {
      const answer = await options.segmentAuto({
        source: state.donor.source, method: state.method, dials: state.dials, job,
      }, init);
      state.analysed.add(source);
      state.segments = (answer.segments || []).map((segment) => ({
        token: segment.token,
        name: segment.name || "part",
        said: segment.said || "",
        area: segment.area,
        box: segment.box,
        outline: segment.outline || [],
        matted: segment.matted,
        matte: true,
        on: false,
        fresh: false,
      }));
      state.offers = [];
      state.points = [];
      const notes = (answer.notes || []).join("; ");
      say(`${state.segments.length} parts in ${answer.seconds}s`
        + (notes ? ` — ${notes}` : ""), !!notes);
      paintParts();
      paintBoxes();
    });
  };
  const render = async (job) => {
    if (typeof options.referenceWrite !== "function") return;
    const picked = state.segments.filter((segment) => segment.on);
    const segments = (job.segments !== undefined
      ? job.segments
      : picked.map((segment) => segment.token));
    const boxes = picked.filter((segment) => segment.matte === false)
      .map((segment) => segment.token);
    const view = job.view !== undefined ? job.view : (state.view || "");
    const reportJob = (change) => {
      if (typeof options.onJob === "function") options.onJob(change);
    };
    let queued = false;
    await ask(view ? "writing the prompt for that angle…" : "writing the transfer prompt…",
              async ({ job, init }) => {
      reportJob({ phase: "write", token: job.token });
      const answer = await options.referenceWrite({
        identity: { source: state.main.source, label: state.main.label },
        segments,
        boxes,
        view,
        dials: state.dials,
        names: Object.fromEntries(picked
          .filter((one) => one.token && one.name)
          .map((one) => [one.token, one.name])),
        job,
      }, init);
      prompt.value = answer.prompt || "";
      state.prompt = prompt.value;
      state.lastWritten = prompt.value;
      state.view = answer.view || view || "";
      paintViews();
      state.shape = answer.shape || null;
      state.refs = answer.refs || [];
      const notes = (answer.notes || []).join("; ");
      say(notes ? `prompt written — ${notes}` : "prompt written, sending to H3…", !!notes);
      queued = true;
      queue(answer.refs || []);
    });
    if (!queued) reportJob({ phase: "idle" });
  };
  const queue = (refs) => {
    const count = Number(takesSelect.value) || 1;
    state.batch += 1;
    const asked = prompt.value;
    state.takes = state.takes.filter((take) => take.source);
    for (let index = 0; index < count; index += 1) {
      state.takes.push({
        take: index + 1, takes: count, batch: state.batch,
        seed: undefined, source: "", prompt: asked, on: false,
      });
    }
    state.prompt = asked;
    remember();
    paintTakes();
    state.rendering = true;
    paintControls();
    const shape = state.shape
      ? { width: state.shape.width, height: state.shape.height }
      : (mainShot.naturalWidth && mainShot.naturalHeight
        ? { width: mainShot.naturalWidth, height: mainShot.naturalHeight }
        : {});
    options.run({
      tag: entry.tag || "",
      prompt: prompt.value,
      seed: Number(seedInput.value) || 0,
      takes: count,
      ...shape,
      refs: refs.length ? refs : [{ source: state.main.source, label: state.main.label || "identity" }],
    }, { batch: state.batch, count, prompt: asked });
    say(`rendering ${count} take(s)…`);
  };
  transfer.addEventListener("click", () => render({}));
  const cancelNow = async () => {
    if (!state.busy && !state.rendering) return;
    state.cancelled = true;
    const token = (state.job && state.job.token) || state.resumedToken || "";
    if (token && typeof options.stopWriter === "function") {
      Promise.resolve(options.stopWriter({ token }))
        .catch((err) => console.error("[VIG H3 Cutter] could not stop the writer:", err));
    }
    if (state.resumed) {
      state.resumed = false;
      state.resumedToken = "";
      state.busy = "";
    }
    if (state.job && state.job.aborter) state.job.aborter.abort();
    if (state.rendering) {
      state.rendering = false;
      state.takes = state.takes.filter((take) => take.source);
      remember();
      paintTakes();
      if (typeof options.interrupt === "function") {
        try {
          await options.interrupt();
        } catch {
          say("could not stop the render — use ComfyUI's own stop button", true);
          paintControls();
          return;
        }
      }
    }
    say("cancelled");
    paintControls();
  };
  stop.addEventListener("click", cancelNow);
  promptStop.addEventListener("click", cancelNow);
  again.title = "Send H3 exactly what is in the field above, with the same pictures. "
    + "If you changed the parts, press Process so the prompt is written again.";
  again.addEventListener("click", () => {
    if (!prompt.value.trim()) return;
    say("sending the edited prompt…");
    queue(state.refs);
  });
  const adoptPicture = (source) => {
    if (!source) return;
    state.main = { source, label: state.main.label };
    state.dirty = false;
    remember();
    paintPictures();
    paintTakes();
    say("the main picture is updated");
    if (typeof options.onPicked === "function") options.onPicked(source);
  };
  adoptMain.addEventListener("click", () => {
    if (state.dirty) adoptPicture(state.main.source);
  });
  clear.addEventListener("click", () => {
    state.takes = [];
    state.batch = 0;
    remember();
    paintTakes();
    say("the shelf is empty — the take files are still on disk");
  });
  const setDonor = (item) => {
    state.donor = item;
    state.segments = [];
    state.offers = [];
    state.points = [];
    remember();
    paintPictures();
    paintParts();
    paintBoxes();
  };
  fromDisk.addEventListener("click", async () => {
    if (typeof options.pickAsset !== "function") return;
    const asset = await options.pickAsset("image");
    if (asset && asset.source) setDonor({ source: asset.source, label: asset.label || "" });
  });
  reAnalyse.addEventListener("click", () => analyse(true));
  const setMethod = (id) => {
    if (!id) return;
    const chosen = state.methods.find((method) => method.id === id);
    if (!chosen || !chosen.ready || id === state.method) return;
    state.method = id;
    state.segments = [];
    state.offers = [];
    state.points = [];
    remember();
    paintWays();
    paintParts();
    paintBoxes();
    if (chosen.auto === false) {
      say("this method works off a box — drag one on the donor");
      return;
    }
    warm(id);
  };
  const readMethods = async () => {
    if (typeof options.segmentMethods !== "function") return;
    try {
      const answer = await options.segmentMethods({});
      state.methods = answer.methods || [];
      state.dialRanges = (answer.dials && typeof answer.dials === "object")
        ? answer.dials : {};
      paintDials();
      const ready = state.methods.find((method) => method.ready);
      const held = state.methods.find((m) => m.id === state.method && m.ready);
      state.method = (held
        || state.methods.find((m) => m.id === answer.default && m.ready)
        || ready || state.methods[0] || {}).id || "";
      paintWays();
      const missing = state.methods.filter((method) => !method.ready);
      if (!ready) {
        say(missing.map((method) => `${method.label}: ${method.note}`).join(" · "), true);
      }
    } catch (error) {
      say(`${error && error.message ? error.message : error}`, true);
    }
  };
  const onTake = (detail) => {
    if (!detail || !detail.take) return;
    if (detail.status === "step") {
      if (state.progress) {
        Object.assign(state.progress, {
          take: detail.take, takes: detail.takes, step: detail.step, total: detail.total,
        });
        paintFill();
      }
      return;
    }
    if (state.progress && detail.status === "generating") {
      Object.assign(state.progress, { take: detail.take, takes: detail.takes, step: 0, total: 0 });
    }
    let take = state.takes.find(
      (item) => item.batch === state.batch && item.take === detail.take);
    if (!take) {
      take = { take: detail.take, takes: detail.takes, batch: state.batch,
               seed: detail.seed, source: "", prompt: state.prompt, on: false };
      state.takes.push(take);
    }
    take.seed = detail.seed;
    if (detail.status === "generating") {
      say(`rendering take ${detail.take} of ${detail.takes}…`);
      paintTakes();
      return;
    }
    if (detail.status !== "ready" || !detail.source) return;
    take.source = detail.source;
    remember();
    paintTakes();
    if (detail.take >= (detail.takes || state.takes.length)) {
      state.rendering = false;
      say("done — pick a take and replace the reference");
      paintControls();
    }
  };
  const onRunEnded = (report) => {
    if (!state.rendering) return;
    state.rendering = false;
    const waiting = state.takes.filter((take) => !take.source);
    state.takes = state.takes.filter((take) => take.source);
    if (waiting.length) {
      say("the render finished with no takes — see the console report", true);
    }
    remember();
    paintTakes();
    paintControls();
  };
  prompt.value = state.prompt || "";
  applyView();
  applyMainView();
  paintPictures();
  paintParts();
  paintTakes();
  document.addEventListener("keydown", onKey, true);
  veil.addEventListener("pointerdown", (event) => {
    if (event.target === veil) close();
  });
  let pressedInside = false;
  card.addEventListener("pointerdown", () => { pressedInside = true; }, true);
  card.addEventListener("click", (event) => {
    const genuine = pressedInside || event.detail === 0;
    pressedInside = false;
    if (genuine) return;
    event.stopPropagation();
    event.preventDefault();
  }, true);
  (options.mount || document.body).appendChild(veil);
  readMethods().then(() => {
    paintCrop();
    if (!state.donor) return;
    const kept = state.takes.filter((take) => take.source).length;
    say(`donor and ${kept} take(s) restored — the parts are one ↻ Break apart away`);
  });
  const resume = (job, { replay = true } = {}) => {
    if (!job) {
      if (state.resumed) {
        state.resumed = false;
        state.resumedToken = "";
        state.busy = "";
        say("the write stopped");
        paintControls();
        paintPictures();
      }
      return;
    }
    if (job.phase === "write") {
      if (state.busy) return;
      state.resumed = true;
      state.resumedToken = job.token || "";
      state.busy = "writing the transfer prompt…";
      paintControls();
      if (state.progress) Object.assign(state.progress, { startedAt: job.startedAt, wrote: true });
      say("writing the transfer prompt…");
      paintPictures();
      return;
    }
    const fresh = !(state.rendering && state.batch === job.batch);
    if (state.resumed) {
      state.resumed = false;
      state.resumedToken = "";
      state.busy = "";
    }
    if (fresh && job.batch) {
      state.batch = job.batch;
      state.takes = state.takes.filter((take) => take.source || take.batch === job.batch);
      for (let index = 1; index <= (job.count || 1); index += 1) {
        if (!state.takes.some((take) => take.batch === job.batch && take.take === index)) {
          state.takes.push({ take: index, takes: job.count || 1, batch: job.batch,
                             seed: undefined, source: "", prompt: job.prompt || "", on: false });
        }
      }
      if (job.prompt) {
        prompt.value = job.prompt;
        state.prompt = job.prompt;
      }
      remember();
    }
    state.rendering = true;
    paintTakes();
    paintControls();
    if (fresh && state.progress) {
      Object.assign(state.progress, { startedAt: job.startedAt, wrote: !!job.wrote });
    }
    if (!replay) {
      say("rendering…");
      return;
    }
    say("rendering — picked up from before this window was opened");
    for (const event of job.events || []) onTake(event);
    if (job.ended) onRunEnded(job.report || "");
  };
  if (options.job) resume(options.job);
  return { close, onTake, onRunEnded, resume, picked: () => state.main.source };
}
