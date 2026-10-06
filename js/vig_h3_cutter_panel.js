import * as model from "./vig_h3_cutter_model.js";
import {
  attachMentionMenu,
  attachTextDrop,
  startPointerTagDrag,
} from "./vig_h3_text_drop.js";
import { applyFrame } from "./vig_h3_reframe.js";
import { ICONS, svg } from "./vig_h3_icons.js";
import { UI_FONT } from "./vig_h3_type.js";
import { SCHEMES, SCHEME_CLASS, applyScheme, ensureSchemeStyles, readScheme } from "./vig_h3_scheme.js";
import { openTakesGallery, ensureTakesStyles } from "./vig_h3_cutter_takes.js";
import { openFilmsGallery } from "./vig_h3_cutter_films.js";
import { openReferenceEditor, refEditKey } from "./vig_h3_cutter_refedit.js";
const STYLE_ID = "vig-h3-cutter-styles";
const SUPPORT_URL = "https://ko-fi.com/vigpay";
const CSS = `
.vig-cutter {
  --cut-ctl: 28px;
  box-sizing: border-box;
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  height: 100%;
  overflow: auto;
  background: transparent;
  color: var(--cut-text);
  font-family: ${UI_FONT};
  font-size: 12px;
}
.vig-cutter-cardbox {
  border: 1px solid var(--cut-frame);
  border-radius: 10px;
  overflow: hidden;
  background: var(--cut-bg);
  box-shadow: 0 18px 36px rgba(0, 0, 0, 0.42);
  flex: 0 0 auto;
}
.vig-cutter-cardbox.cutter { box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5); }
.vig-cutter * { box-sizing: border-box; }
.vig-cutter, .vig-cutter * { user-select: text; -webkit-user-select: text; }
.vig-cutter button,
.vig-cutter-label,
.vig-cutter-corner,
.vig-cutter-vsplit,
.vig-cutter-handle,
.vig-cutter-vhandle,
.vig-cutter-ahandle,
.vig-cutter-block,
.vig-cutter-block *,
.vig-cutter-vblock,
.vig-cutter-vblock *,
.vig-cutter-aclip,
.vig-cutter-aclip *,
.vig-cutter-ablock,
.vig-cutter-ablock *,
.vig-writer-tile,
.vig-writer-tile * {
  user-select: none;
  -webkit-user-select: none;
}
.vig-cutter button { font-family: inherit; }
.vig-cutter ::selection { background: rgba(var(--cut-accent-rgb), 0.35); }
@keyframes vig-cutter-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }

.lg-node-widgets:has(.vig-cutter) > .lg-node-widget:not(:has(.vig-cutter)) {
  display: none !important;
}

.vig-cutter-head {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  height: 46px;
  gap: 14px;
  padding: 0 14px;
  background: linear-gradient(180deg, var(--cut-head-a), var(--cut-head-b));
  border-bottom: 1px solid rgba(var(--cut-accent-rgb), 0.35);
}
.vig-cutter-title {
  font-weight: 600;
  font-size: 20.4px;
  color: var(--cut-bright);
  white-space: nowrap;
}
.vig-cutter-pill {
  font-size: 11px;
  color: var(--cut-accent-lit);
  border: 1px solid rgba(var(--cut-accent-lit-rgb), 0.5);
  border-radius: 20px;
  padding: 2px 10px;
  white-space: nowrap;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.vig-cutter-pillbtn {
  font-family: inherit;
  background: none;
  cursor: pointer;
}
.vig-cutter-pillbtn:hover:not(:disabled) {
  border-color: var(--cut-accent-hi);
  color: var(--cut-accent-hi);
  background: rgba(var(--cut-accent-rgb), 0.1);
}
.vig-cutter-pillbtn:disabled { cursor: default; opacity: 1; }
.vig-cutter-canvaspick {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 4px;
}
.vig-cutter-canvaspick:has(.vig-cutter-shapebtn) {
  grid-template-columns: repeat(5, 64px);
  justify-content: center;
  gap: 10px 6px;
  padding: 4px 0 2px;
}
.vig-cutter-canvaspick > button.on {
  border-color: var(--cut-accent);
  color: var(--cut-accent-hi);
}
.vig-cutter-shapebtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--cut-dim);
}
.vig-cutter-shapebox {
  width: 60px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.vig-cutter-shapeframe {
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  border: 1px solid var(--cut-border);
  border-radius: 3px;
  background: var(--cut-raised);
  color: var(--cut-text);
  font-size: 12px;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.vig-cutter-shapebtn:hover .vig-cutter-shapeframe { border-color: var(--cut-accent-lit); }
.vig-cutter-shapebtn:hover { color: var(--cut-soft); }
.vig-cutter-canvaspick > .vig-cutter-shapebtn.on { border-color: transparent; }
.vig-cutter-shapebtn.on .vig-cutter-shapeframe {
  border-color: var(--cut-accent);
  background: rgba(var(--cut-accent-rgb), 0.18);
  color: var(--cut-accent-hi);
}
.vig-cutter-ghost.vig-cutter-setshape {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  flex: 0 0 auto;
  font-size: 12px;
  transition: width 0.12s, height 0.12s;
}
.vig-cutter-shapecap {
  width: 64px;
  min-height: 22px;
  font-size: 9px;
  line-height: 1.2;
  text-align: center;
}
.vig-cutter-mpbtn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  line-height: 1.15;
  padding: 3px 4px;
}
.vig-cutter-mpvalue { font-size: 12px; }
.vig-cutter-mpcost {
  font-size: 9px;
  opacity: 0.66;
  white-space: nowrap;
}
.vig-cutter-body { padding: 20px; display: flex; flex-direction: column; gap: 14px; background: var(--cut-bg); }
.vig-cutter-contents { display: contents; }
.vig-cutter[data-collapsed="true"] .vig-cutter-body { display: none; }

.vig-cutter-rule { height: 1px; background: var(--cut-rule); }
.vig-cutter-label {
  font-size: 11px;
  color: var(--cut-dim);
  display: block;
}
.vig-cutter-row { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.vig-cutter-field { display: flex; flex-direction: column; gap: 5px; flex: 0 0 auto; }
.vig-cutter-inline { display: flex; align-items: center; gap: 6px; }
.vig-cutter-spring { flex: 1 1 auto; min-width: 0; }
.vig-cutter-syntax {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  color: var(--cut-text);
  font: inherit;
  line-height: 1.5;
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 5px;
}
.vig-cutter textarea.vig-cutter-lit {
  position: relative;
  background: transparent;
  color: transparent;
  caret-color: var(--cut-bright);
}
.vig-cutter-syntax b {
  font-weight: inherit;
  text-shadow: 0 0 0.45px currentColor;
  color: var(--cut-syn-field);
}
.vig-cutter-syntax .shot {
  color: var(--cut-syn-shot);
  font-weight: inherit;
  text-shadow: 0 0 0.45px currentColor;
}
.vig-cutter-syntax .say { color: var(--cut-syn-dialogue); }
.vig-cutter-syntax .ref {
  color: var(--cut-syn-ref);
  font-weight: inherit;
  text-shadow: 0 0 0.45px currentColor;
}
.vig-cutter input[type="number"], .vig-cutter input[type="text"] {
  background: var(--cut-input);
  border: 1px solid var(--cut-border);
  border-radius: 5px;
  color: var(--cut-text);
  font: inherit;
  font-variant-numeric: tabular-nums;
  padding: 5px 6px;
}
.vig-cutter input[type="range"] { width: 96px; accent-color: var(--cut-accent); }
.vig-cutter-clearable { position: relative; display: inline-flex; align-items: center; }
.vig-cutter-clearable > input[type="number"] { padding-right: 19px; }
.vig-cutter-seedmodes { display: inline-flex; align-items: center; gap: 1px; }
.vig-cutter-modebtn {
  background: none;
  border: none;
  border-radius: 3px;
  padding: 1px;
  margin: 0;
  display: inline-flex;
  align-items: center;
  color: var(--cut-dim);
  opacity: 0.5;
  cursor: pointer;
}
.vig-cutter-modebtn:hover { opacity: 1; color: var(--cut-bright); }
.vig-cutter-modebtn.on { color: var(--cut-accent-hi); opacity: 1; }
.vig-cutter-clearable > input[type="number"]::-webkit-inner-spin-button,
.vig-cutter-clearable > input[type="number"]::-webkit-outer-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.vig-cutter-clear {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  padding: 0;
  border: 0;
  background: none;
  color: #c0665a;
  cursor: pointer;
}
.vig-cutter-clear:hover { color: #ff7361; }
.vig-cutter-clear:disabled { color: var(--cut-border); cursor: default; }
.vig-cutter-runwrap { position: relative; margin-top: 8px; }
.vig-cutter-runwrap > .vig-cutter-strip { margin-top: 0; }
.vig-cutter-runbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
  margin-bottom: 1px;
  height: 12px;
  border-radius: 3px;
  background: var(--cut-input);
  overflow: hidden;
}
.vig-cutter-runbar > .fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0;
  opacity: 0.35;
  transition: width 0.2s linear;
}
.vig-cutter-runbar.busy > .fill { width: 100%; animation: vig-cutter-pulse 1.4s ease-in-out infinite; }
.vig-cutter-runbar > .text {
  position: relative;
  display: block;
  padding: 0 7px;
  font-size: 10px;
  line-height: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vig-cutter-select {
  background: var(--cut-input);
  border: 1px solid var(--cut-border);
  border-radius: 5px;
  color: var(--cut-text);
  font: inherit;
  padding: 5px 6px;
  max-width: 150px;
}
.vig-cutter textarea {
  width: 100%;
  resize: vertical;
  background: var(--cut-input);
  border: 1px solid var(--cut-border);
  border-radius: 5px;
  color: var(--cut-text);
  font: inherit;
  padding: 8px 10px;
  line-height: 1.5;
}
.vig-cutter-icon {
  background: none;
  border: 1px solid var(--cut-border);
  border-radius: 5px;
  color: var(--cut-soft);
  cursor: pointer;
  padding: 5px;
  display: flex;
}
.vig-cutter-icon:hover { border-color: var(--cut-accent); color: var(--cut-accent); }
.vig-cutter-icon.busy { animation: vig-cutter-pulse 1s infinite; border-color: var(--cut-accent); }
.vig-cutter-icon:disabled {
  opacity: 0.4;
  cursor: default;
  border-color: var(--cut-border);
  color: var(--cut-soft);
}
.vig-cutter-fillable { position: relative; overflow: hidden; }
.vig-cutter-fillable > * { position: relative; z-index: 1; }
.vig-cutter-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 0;
  z-index: 0;
  background: rgba(255, 246, 224, 0.5);
  box-shadow: 1px 0 0 rgba(255, 252, 244, 0.85);
  pointer-events: none;
}
.vig-cutter-fillable.filling > .vig-cutter-fill { transition: width 0.9s linear; }
.vig-cutter-split {
  display: inline-flex;
  align-items: stretch;
  border-radius: 6px;
  overflow: hidden;
  flex: 0 0 auto;
}
.vig-cutter-split > .vig-cutter-primary {
  border-radius: 0;
  border-right: none;
}
.vig-cutter-takes {
  border: 1px solid var(--cut-accent);
  border-left: 1px solid rgba(28, 23, 16, 0.45);
  border-radius: 0;
  background: var(--cut-accent-lit);
  color: var(--cut-on-accent);
  font: inherit;
  font-size: 11px;
  font-weight: 700;
  padding: 0 2px 0 4px;
  cursor: pointer;
}
.vig-cutter-takes:disabled { opacity: 0.45; cursor: default; }
.vig-cutter-workline {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 14px;
  font-size: 10px;
  min-width: 0;
}
.vig-cutter-seedbox {
  flex: 0 0 auto;
}
.vig-cutter-nospin { appearance: textfield; -moz-appearance: textfield; }
.vig-cutter-stepper { position: relative; display: inline-flex; flex: 0 0 auto; }
.vig-cutter-stepper > input { padding-right: 18px; box-sizing: border-box; }
.vig-cutter-steparrows {
  position: absolute;
  top: 3px;
  bottom: 3px;
  right: 3px;
  width: 13px;
  display: flex;
  flex-direction: column;
}
.vig-cutter .vig-cutter-steparrows > button {
  flex: 1 1 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: none;
  color: var(--cut-dim);
  cursor: pointer;
}
.vig-cutter .vig-cutter-steparrows > button:hover:not(:disabled) {
  color: var(--cut-accent);
  background: rgba(var(--cut-accent-rgb), 0.12);
}
.vig-cutter .vig-cutter-steparrows > button:disabled { opacity: 0.3; cursor: default; }
.vig-cutter-steparrows > button.up svg { transform: rotate(180deg); }
.vig-cutter-nospin::-webkit-outer-spin-button,
.vig-cutter-nospin::-webkit-inner-spin-button { appearance: none; margin: 0; }
.vig-cutter-skillrow {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  padding: 4px 5px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 11px;
  color: var(--cut-text);
}
.vig-cutter-skillrow:hover { background: var(--cut-hover); }
.vig-cutter-skillrow input { margin: 2px 0 0 0; flex: 0 0 auto; cursor: pointer; }
.vig-cutter-skillrow b { font-weight: 600; }
.vig-cutter-skillrow .where { font-style: normal; color: var(--cut-accent); font-size: 10px; }
.vig-cutter-skillrow .what {
  color: var(--cut-dim);
  font-size: 10px;
  line-height: 1.35;
  margin-top: 1px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
}
.vig-cutter-pip {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 14px;
  height: 14px;
  padding: 0 3px;
  box-sizing: border-box;
  border-radius: 7px;
  background: var(--cut-accent-lit);
  color: var(--cut-on-accent);
  font-size: 9px;
  font-weight: 700;
  line-height: 14px;
  text-align: center;
  pointer-events: none;
}
.vig-cutter-group {
  border: 1px solid var(--cut-border);
  border-radius: 8px;
  background: var(--cut-groove);
  padding: 8px 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  flex: 1 1 260px;
  min-width: 0;
}
.vig-cutter-group-label {
  font-size: 10px;
  color: var(--cut-dim);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}
.vig-cutter-ghost {
  background: none;
  border: 1px solid var(--cut-edge);
  border-radius: 5px;
  color: var(--cut-text);
  font-size: 12px;
  line-height: 16px;
  padding: 7px 13px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.vig-cutter-ghost:hover { border-color: var(--cut-accent); color: var(--cut-accent); }
.vig-cutter-primary {
  background: var(--cut-accent-soft);
  border: 1px solid var(--cut-accent);
  border-radius: 5px;
  color: var(--cut-accent);
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  padding: 7px 15px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.vig-cutter-primary:disabled, .vig-cutter-ghost:disabled {
  opacity: 0.45;
  cursor: default;
}
.vig-cutter-readonly {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--cut-input);
  border: 1px solid var(--cut-border);
  border-radius: 5px;
  padding: 5px 10px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.vig-cutter-gallery { display: flex; gap: 6px; flex-wrap: wrap; align-items: flex-start; }
.vig-cutter-ref { position: relative; width: 56px; }
.vig-cutter-ref-thumb {
  position: relative;
  width: 56px;
  border: 1px solid var(--cut-border);
  border-radius: 5px;
  background: var(--cut-screen) center/cover no-repeat;
  cursor: grab;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cut-faint);
  font-size: 9px;
  overflow: hidden;
}
.vig-cutter-ref-chip {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  margin-top: 3px;
  font-size: 9px;
  color: var(--cut-dim);
  font-variant-numeric: tabular-nums;
  border: 1px solid var(--cut-border);
  border-radius: 3px;
  padding: 1px 4px;
  background: var(--cut-input);
  cursor: grab;
  user-select: none;
  white-space: nowrap;
}
.vig-cutter-dot {
  position: absolute;
  top: -4px;
  width: 16px;
  height: 16px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.12s;
  z-index: 4;
}
.vig-cutter-ref:hover .vig-cutter-dot,
.vig-cutter-aclip:hover .vig-cutter-dot { opacity: 1; pointer-events: auto; }
.vig-cutter-dot > button {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.25);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.vig-cutter-add {
  background: none;
  border: 1px dashed var(--cut-dashed);
  border-radius: 5px;
  color: var(--cut-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 56px;
}
.vig-cutter-add:hover { border-color: var(--cut-accent); color: var(--cut-accent); }

.vig-cutter-track {
  position: relative;
  display: flex;
  height: 116px;
  background: var(--cut-groove);
  border: 1px solid var(--cut-border);
  border-radius: 6px;
}
.vig-cutter-lane {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
  height: 100%;
}
.vig-cutter-block {
  position: relative;
  height: 100%;
  flex: 0 0 auto;
  border-right: 1px solid var(--cut-groove);
}
.vig-cutter-block-inner {
  position: absolute;
  inset: 2px;
  border-radius: 4px;
  border: 1px solid var(--cut-border);
  cursor: pointer;
  overflow: hidden;
  background: var(--cut-screen) center/cover no-repeat;
}
.vig-cutter-scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(20, 17, 13, 0.1) 0%,
    rgba(20, 17, 13, 0.35) 55%,
    rgba(20, 17, 13, 0.75) 100%
  );
}
.vig-cutter-block-face {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 5px 7px;
  gap: 1px;
  overflow: hidden;
}
.vig-cutter-block-top { display: flex; justify-content: space-between; align-items: center; }
.vig-cutter-flat {
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  color: var(--cut-dim);
}
.vig-cutter-flat:hover { color: var(--cut-bright); }
.vig-cutter-headbtn {
  height: 32px;
  width: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  flex: 0 0 auto;
}
.vig-cutter-headbtn:hover { background: var(--cut-accent-soft); }
.vig-cutter-checkline {
  display: flex; align-items: center; gap: 8px; cursor: pointer;
  font-size: 12px; color: var(--cut-text);
}
.vig-cutter-checkline > input { margin: 0; accent-color: var(--cut-accent); }
.vig-cutter-heart { color: #e5484d; }
.vig-cutter-heart svg { fill: currentColor; }
.vig-cutter-schemerow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border: 0;
  border-radius: 5px;
  background: none;
  color: var(--cut-text);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
}
.vig-cutter-schemerow:hover { background: var(--cut-hover); }
.vig-cutter-schemerow.on { color: var(--cut-accent-hi); }
.vig-cutter-schemechip {
  width: 26px;
  height: 16px;
  border-radius: 3px;
  border: 1px solid;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  padding: 0 2px;
  flex: 0 0 auto;
}
.vig-cutter-schemechip > i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: block;
}
.vig-cutter-status {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.vig-cutter-mono {
  font-size: 10px;
  color: var(--cut-dim);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.vig-cutter-wave { display: flex; align-items: flex-end; gap: 1.5px; height: 18px; }
.vig-cutter-wave > i { width: 2.5px; display: block; }
.vig-cutter-handle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 3;
}
.vig-cutter-handle::after {
  content: "";
  position: absolute;
  inset: 8px 3px;
  border-radius: 1px;
  background: transparent;
}
.vig-cutter-handle:hover::after, .vig-cutter-handle[data-dragging="true"]::after {
  background: var(--cut-accent);
}
.vig-cutter-tail { width: 34px; margin: 2px; flex: 0 0 34px; }

.vig-cutter-atrack {
  position: relative;
  display: flex;
  height: 30px;
  border: 1px solid var(--cut-border);
  border-radius: 6px;
  background: var(--cut-groove);
  overflow: visible;
}
.vig-cutter-endmark {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 0;
  border-left: 1px dashed var(--cut-accent-lit);
  pointer-events: auto;
  z-index: 1;
}
.vig-cutter-aclip {
  position: relative;
  height: 100%;
  flex: 0 0 auto;
  border-right: 1px solid var(--cut-groove);
}
.vig-cutter-aclip-inner {
  position: absolute;
  inset: 2px;
  border-radius: 3px;
  border: 1px solid #6ea8d8;
  background: rgba(110, 168, 216, 0.12);
  cursor: pointer;
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  padding: 3px 5px;
  overflow: hidden;
}
.vig-cutter-aclip-inner > i { width: 2px; background: #6ea8d8; opacity: 0.8; display: block; }
.vig-cutter-aclip-label {
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 9px;
  color: #cfe2f2;
  pointer-events: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 12px);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.vig-cutter-detail { display: flex; gap: 20px; align-items: flex-start; }
.vig-cutter-screen {
  position: relative;
  width: 100%;
  background: var(--cut-screen);
  border: 1px solid var(--cut-border);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vig-cutter-screen > video { width: 100%; height: 100%; object-fit: contain; display: block; }
.vig-cutter-modes { display: flex; gap: 5px; flex-wrap: wrap; }
.vig-cutter-mode {
  background: none;
  border: 1px solid var(--cut-border);
  border-radius: 5px;
  font-size: 11px;
  font-weight: 600;
  height: var(--cut-ctl);
  display: inline-flex;
  align-items: center;
  padding: 0 10px;
  cursor: pointer;
  white-space: nowrap;
}
.vig-cutter-slot {
  border: 1px dashed var(--cut-dashed);
  border-radius: 5px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--cut-dim);
  cursor: pointer;
  overflow: hidden;
  padding: 2px;
  background: center/cover no-repeat;
  position: relative;
  width: 56px;
}
.vig-cutter-slot:hover { border-color: var(--cut-accent); color: var(--cut-accent); }
.vig-cutter-slot > span {
  font-size: 7px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.vig-cutter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  background: none;
  border: none;
  color: var(--cut-soft);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.vig-cutter-switch {
  width: 26px;
  height: 15px;
  border-radius: 8px;
  position: relative;
  transition: background 0.15s;
  flex-shrink: 0;
}
.vig-cutter-switch > i {
  position: absolute;
  top: 1.5px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--cut-bright);
  transition: left 0.15s;
}
.vig-cutter-tilevideo, .vig-cutter-popvideo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  border-radius: 4px;
  background: #000;
}
.vig-cutter-lightbox {
  position: absolute;
  inset: 0;
  z-index: 70;
  background: rgba(6, 5, 4, 0.86);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.vig-cutter-lightframe {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-width: 100%;
  max-height: 100%;
}
.vig-cutter-lightframe video {
  max-width: min(900px, 80vw);
  max-height: min(560px, 62vh);
  background: #000;
  border-radius: 6px;
  display: block;
}
.vig-cutter.vig-cutter-popsettings {
  width: auto;
  height: auto;
  overflow: visible;
  padding: 4px 2px 2px;
}
.vig-cutter-popsettings .vig-cutter-group { flex: 0 0 auto; }
.vig-cutter-lightbar {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--cut-dim);
}
.vig-cutter-warn {
  font-size: 10px;
  color: var(--cut-accent-lit);
  line-height: 1.5;
}
.vig-cutter-projectpath {
  font-size: 12px;
  color: var(--cut-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  flex: 0 1 auto;
}
.vig-cutter-projectname.press { cursor: pointer; }
.vig-cutter-projectname.press:hover { color: var(--cut-bright); }
.vig-cutter-dialogpress{margin-left:8px;padding:1px 7px;font-size:10px;border-radius:4px;border:1px solid var(--cut-edge);background:none;color:var(--cut-bright);cursor:pointer}
.vig-cutter-dialogpress:hover{border-color:var(--cut-accent);color:var(--cut-accent)}
.vig-cutter-projectsize { color: var(--cut-dim); margin-left: 5px; cursor: default; }
.vig-cutter-ghost svg {
  vertical-align: -1px;
  margin-right: 5px;
}
.vig-cutter-foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.vig-cutter-bar {
  width: 220px;
  height: 4px;
  background: var(--cut-border);
  border-radius: 2px;
  position: relative;
  flex-shrink: 0;
}
.vig-cutter-bar > i {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 2px;
  background: #6fae7f;
}
.vig-cutter-frame-slot {
  position: relative;
  width: 132px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 5px;
  box-sizing: border-box;
}
.vig-cutter-frame-slot.empty {
  background: none;
  border: 1px dashed var(--cut-dashed);
  color: var(--cut-dim);
  cursor: pointer;
  font-size: 10px;
}
.vig-cutter-frame-slot.filled {
  border: 1px solid var(--cut-edge);
  background-color: var(--cut-screen);
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}
.vig-cutter-frame-slot .slot-label { font-size: 10px; white-space: nowrap; }
.vig-cutter-frame-slot .slot-caption {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  font-size: 9px;
  color: var(--cut-warm);
  background: linear-gradient(0deg, rgba(0, 0, 0, 0.72), transparent);
  padding: 7px 6px 3px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vig-cutter-frame-slot.reframing { cursor: move; outline: 1px solid #4a9b6e; }
.vig-cutter-media-slot {
  position: relative;
  width: 132px;
  border: 1px dashed var(--cut-dashed);
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  color: var(--cut-dim);
  cursor: pointer;
  padding: 2px;
  box-sizing: border-box;
}
.vig-cutter-media-slot .slot-file {
  font-size: 8px;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}

.vig-cutter-badge {
  font-size: 11px;
  color: var(--cut-text);
  background: var(--cut-input);
  border: 1px solid var(--cut-border);
  border-radius: 3px;
  padding: 1px 7px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.vig-cutter-badge.red {
  color: #e08a7d;
  background: rgba(192, 102, 90, 0.18);
  border-color: rgba(192, 102, 90, 0.55);
}

.vig-mention {
  position: absolute;
  z-index: 30;
  background: var(--cut-input);
  border: 1px solid var(--cut-edge);
  border-radius: 6px;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.55);
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 150px;
}
.vig-mention .vig-mention-title {
  font-size: 9px;
  color: var(--cut-dim);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 2px 6px;
}
.vig-mention button {
  display: flex;
  align-items: center;
  gap: 7px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--cut-text);
  font-size: 11px;
  padding: 4px 6px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.vig-mention button.active { background: rgba(var(--cut-accent-rgb), 0.18); color: var(--cut-bright); }
.vig-mention .thumb {
  width: 64px;
  border: 1px solid var(--cut-border);
  border-radius: 3px;
  background: var(--cut-screen) center/cover no-repeat;
  flex-shrink: 0;
  display: block;
}
.vig-mention .thumb.empty { border-style: dashed; }

.vig-cutter-popover {
  position: fixed;
  z-index: 60;
  background: var(--cut-menu);
  border: 1px solid var(--cut-edge);
  border-radius: 6px;
  box-shadow: 0 12px 26px rgba(0, 0, 0, 0.75);
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 210px;
  max-height: 60vh;
  overflow-y: auto;
  font-family: ${UI_FONT};
  font-size: 12px;
}
.vig-cutter-popover .pop-title {
  font-size: 9px;
  color: var(--cut-dim);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 0 4px;
  white-space: normal;
  overflow-wrap: anywhere;
}
.vig-cutter-popover button:not(.vig-cutter button) {
  display: flex;
  align-items: center;
  gap: 8px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--cut-text);
  font-size: 11px;
  padding: 3px 4px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
}
.vig-cutter-popover button:not(.vig-cutter button):hover { background: rgba(var(--cut-accent-rgb), 0.16); }
.vig-cutter-popover .pop-thumb {
  width: 96px;
  border: 1px solid var(--cut-border);
  border-radius: 3px;
  background-color: var(--cut-screen);
  background-position: center;
  background-repeat: no-repeat;
  background-size: contain;
  flex-shrink: 0;
  display: block;
}
.vig-cutter-popover .pop-thumb-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  border-style: dashed;
  color: var(--cut-accent-lit);
}
.vig-cutter-popover .pop-empty { font-size: 10px; color: var(--cut-faint); padding: 2px 4px; }
.vig-cutter-popover .pop-rule { height: 1px; background: rgba(var(--cut-accent-rgb), 0.22); margin: 2px 0; }
.vig-cutter-popover .pop-disk { color: var(--cut-accent-lit); }
.vig-cutter-popover .pop-del {
  margin-left: auto;
  width: 18px;
  height: 18px;
  flex: 0 0 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--cut-dim);
  border: 1px solid var(--cut-border);
  opacity: 0.35;
  transition: opacity 0.12s, background 0.12s, color 0.12s;
}
.vig-cutter-popover button:hover .pop-del { opacity: 1; }
.vig-cutter-popover .pop-del:hover { background: #c0665a; border-color: #c0665a; color: #fff; }
.vig-cutter-popover button.on:not(.vig-cutter button) { color: var(--cut-accent-hi); }
.vig-cutter-popover .pop-note {
  font-size: 10px;
  line-height: 1.35;
  color: var(--cut-dim);
  padding: 2px 4px;
  max-width: 190px;
  white-space: normal;
}

.vig-cutter-scroll {
  overflow-x: scroll;
  overflow-y: hidden;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  border: 1px solid var(--cut-seam);
  border-radius: 8px;
  background: var(--cut-sunk);
  padding: 10px 10px 8px;
  scrollbar-width: auto;
  scrollbar-color: var(--cut-edge) var(--cut-bar);
}
.vig-cutter-scrollw {
  min-width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.vig-cutter-vtrack {
  position: relative;
  height: 92px;
  width: 100%;
  background: var(--cut-raised);
  background-image: repeating-linear-gradient(45deg, rgba(var(--cut-ink-rgb),.035) 0 6px, transparent 6px 12px);
  border: 1px solid var(--cut-border);
  border-radius: 6px;
  box-sizing: border-box;
  display: flex;
}
.vig-cutter-vblock {
  position: relative;
  flex-shrink: 0;
  height: 100%;
  box-sizing: border-box;
  border-right: 1px solid var(--cut-groove);
  cursor: grab;
}
.vig-cutter-vinner {
  position: absolute;
  inset: 2px;
  border-radius: 4px;
  border: 1px solid;
  overflow: hidden;
  cursor: pointer;
  background-size: cover;
  background-position: center;
}
.vig-cutter-vposter {
  position: absolute;
  inset: 0;
  z-index: 0;
  background-size: cover;
  background-position: center;
}
.vig-cutter-vtrack.veiled .vig-cutter-vposter,
.vig-cutter-vblock.veiled .vig-cutter-vposter {
  filter: blur(10px) saturate(.55);
  transform: scale(1.12);
}
.vig-cutter-vscrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(20,17,13,.5) 0%, rgba(20,17,13,.28) 38%, rgba(20,17,13,.45) 65%, rgba(20,17,13,.8) 100%);
  z-index: 1;
  pointer-events: none;
}
.vig-cutter-vface {
  position: relative;
  z-index: 2;
  pointer-events: none;
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 4px 8px;
  box-sizing: border-box;
  overflow: hidden;
}
.vig-cutter-nbadge {
  display: flex;
  align-items: center;
  gap: 5px;
  background: var(--cut-well);
  border: 1px solid var(--cut-hair);
  border-radius: 4px;
  padding: 1px 5px;
  min-width: 0;
  overflow: hidden;
}
.vig-cutter-nbadge .idx {
  font-size: 14px;
  font-weight: 600;
  line-height: 1.2;
  color: var(--cut-warmest);
  flex-shrink: 0;
}
.vig-cutter-nbadge .nm {
  font-size: 11px;
  color: var(--cut-warm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.vig-cutter-nbadge button {
  background: none;
  border: none;
  padding: 0;
  display: flex;
  cursor: pointer;
}
.vig-cutter-modechip {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.05em;
  background: var(--cut-well);
  border: 1px solid;
  border-radius: 3px;
  padding: 0 7px;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vig-cutter-timechip {
  font-size: 12px;
  color: var(--cut-warm);
  font-variant-numeric: tabular-nums;
  background: var(--cut-well);
  border: 1px solid var(--cut-hair);
  border-radius: 3px;
  padding: 0 6px;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}
.vig-cutter-vfacts {
  position: relative;
  z-index: 1;
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 4px;
  overflow: hidden;
  font-size: 0;
  line-height: 0;
}
.vig-cutter-vfacts > .vig-cutter-factchip,
.vig-cutter-vfacts > .vig-cutter-timechip {
  display: inline-block;
  vertical-align: top;
  margin: 0 3px 3px 0;
}
.vig-cutter-vfacts > .vig-cutter-timechip { font-size: 11px; line-height: 16px; }
.vig-cutter-vfacts-post { float: right; width: 0; height: calc(100% - 22px); pointer-events: none !important; }
.vig-cutter-vfacts-corner { float: right; clear: right; width: 50px; height: 22px; pointer-events: none !important; }
.vig-cutter-factchip {
  font-size: 11px;
  line-height: 16px;
  color: var(--cut-text);
  background: var(--cut-well);
  border: 1px solid var(--cut-hair);
  border-radius: 3px;
  padding: 0 4px;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  flex: 0 0 auto;
}
.vig-cutter-factchip.latent { color: var(--cut-accent-lit); border-color: rgba(var(--cut-accent-rgb), 0.5); padding: 0 2px; }
.vig-cutter-factchip.takes > svg { vertical-align: -1px; margin-right: 3px; }
.vig-cutter-factchip.latent > svg { vertical-align: -1px; margin: 0 1px; }
.vig-cutter-factchip.latent > svg.flip { transform: scaleX(-1); }
.vig-cutter-factchip.none { color: var(--cut-dim); }
.vig-cutter-strike {
  position: absolute;
  left: 12%;
  right: 12%;
  top: 50%;
  height: 1.5px;
  margin-top: -0.75px;
  background: currentColor;
  transform: rotate(-45deg);
  border-radius: 1px;
}
.vig-cutter-durchip {
  flex: 0 0 auto;
  margin-left: auto;
  font-size: 15px;
  color: var(--cut-warmest);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 1.3;
  background: var(--cut-well);
  border: 1px solid var(--cut-hair);
  border-radius: 3px;
  padding: 0 6px;
  white-space: nowrap;
}
.vig-cutter-vfoot {
  position: absolute;
  left: 8px;
  right: 7px;
  bottom: 5px;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  gap: 5px;
}
.vig-cutter-vface > *,
.vig-cutter-vfacts > * { pointer-events: auto; }
.vig-cutter-vface > .vig-cutter-vfacts { pointer-events: none; }
.vig-cutter-vwave {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  height: 14px;
  overflow: hidden;
  pointer-events: none;
}
.vig-cutter-vwave > i { flex: 1 1 0; min-width: 1px; opacity: 0.4; display: block; }
.vig-cutter-vwave > i.accent { opacity: 1; }
.vig-cutter-seam {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 6;
  width: 17px;
  height: 17px;
  border-radius: 50%;
  background: var(--cut-accent-lit);
  border: 1px solid var(--cut-accent-edge);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.55);
  color: var(--cut-on-accent);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
}
.vig-cutter-seam.blue {
  width: 16px;
  height: 16px;
  background: #6ea8d8;
  border-color: #cfe6fb;
  color: #0f1c26;
}
.vig-cutter-vhandle {
  position: absolute;
  right: -4px;
  width: 8px;
  height: 24px;
  cursor: col-resize;
  z-index: 7;
}
.vig-cutter-vhandle.top { top: 0; }
.vig-cutter-vhandle.bottom { bottom: 0; }
.vig-cutter-dropmark {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 3px;
  border-radius: 2px;
  background: var(--cut-accent);
  box-shadow: 0 0 8px rgba(var(--cut-accent-rgb), 0.7);
  z-index: 8;
  pointer-events: none;
}
.vig-cutter-alabelrow {
  display: flex;
  align-items: center;
  gap: 10px;
  position: sticky;
  left: 0;
  width: max-content;
  max-width: 100%;
  margin-top: 2px;
}
.vig-cutter-atrack2 {
  position: relative;
  display: flex;
  height: 30px;
  width: 100%;
  border: 1px solid var(--cut-border);
  border-radius: 6px;
  overflow: visible;
  background: var(--cut-raised);
  background-image: repeating-linear-gradient(45deg, rgba(var(--cut-ink-rgb),.035) 0 6px, transparent 6px 12px);
}
.vig-cutter-ablock { position: relative; flex-shrink: 0; height: 100%; box-sizing: border-box; }
.vig-cutter-ainner {
  position: absolute;
  inset: 2px;
  border-radius: 3px;
  border: 1px solid #6ea8d8;
  background: rgba(110, 168, 216, 0.12);
  cursor: pointer;
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  padding: 3px 6px;
  box-sizing: border-box;
  overflow: hidden;
}
.vig-cutter-ainner > i { width: 2px; background: #6ea8d8; opacity: 0.8; display: block; }
.vig-cutter-acap {
  position: absolute;
  top: 50%;
  left: 14px;
  transform: translateY(-50%);
  font-size: 10px;
  color: #dcebf7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: calc(100% - 28px);
  background: #101922;
  border: 1px solid rgba(110, 168, 216, 0.45);
  border-radius: 3px;
  padding: 1px 6px;
  pointer-events: none;
}
.vig-cutter-abadge {
  position: absolute;
  top: 3px;
  right: 14px;
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--cut-well);
  border: 1px solid var(--cut-hair);
  border-radius: 4px;
  padding: 2px 6px;
  z-index: 3;
}
.vig-cutter-abadge button {
  background: none;
  border: none;
  padding: 0;
  display: flex;
  cursor: pointer;
  color: var(--cut-dim);
}
.vig-cutter-abadge button:hover { color: var(--cut-bright); }
.vig-cutter-ahandle {
  position: absolute;
  top: 0;
  right: -4px;
  width: 8px;
  height: 100%;
  cursor: col-resize;
  z-index: 5;
}
.vig-cutter-aempty {
  position: absolute;
  inset: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: none;
  border: 1px dashed var(--cut-dashed);
  border-radius: 4px;
  color: var(--cut-dim);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
}
.vig-cutter-aempty:hover { border-color: #6ea8d8; color: #8fc0e6; }

.vig-cutter-phantom {
  position: absolute;
  border-radius: 2px;
  background: rgba(var(--cut-accent-rgb), 0.45);
  outline: 1px solid rgba(var(--cut-accent-rgb), 0.8);
  pointer-events: none;
  z-index: 5;
}
.vig-cutter-section {
  border: 1px solid var(--cut-seam);
  border-radius: 8px;
  background: var(--cut-menu);
  padding: 10px 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.vig-cutter-section-head { display: flex; align-items: center; gap: 10px; }
.vig-cutter-section-title {
  font-size: 13px;
  color: var(--cut-accent-lit);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
}
.vig-cutter-section-totals {
  font-size: 13px;
  color: var(--cut-dim);
  letter-spacing: 0.1em;
  margin-left: 4px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}
.vig-cutter-section-rule { flex: 1; height: 1px; background: var(--cut-rule); }
.vig-cutter-section-body { display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.vig-cutter-players { display: flex; gap: 14px; min-width: 0; }
.vig-cutter-player { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.vig-cutter-filmstale {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 8px;
  font-size: 11px;
  color: var(--cut-accent);
  background: var(--cut-menu);
  border-bottom: 1px solid rgba(var(--cut-accent-rgb), 0.45);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  padding: 6px 10px 6px 36px;
  transform: translateY(-105%);
  visibility: hidden;
  transition: transform 0.28s ease, visibility 0s linear 0.28s;
}
.vig-cutter-filmstale.open {
  transform: translateY(0);
  visibility: visible;
  transition: transform 0.28s ease;
}
.vig-cutter-flash {
  position: absolute;
  left: 50%;
  top: 10px;
  transform: translateX(-50%);
  z-index: 6;
  max-width: calc(100% - 24px);
  padding: 6px 12px;
  border-radius: 6px;
  background: var(--cut-menu);
  border: 1px solid rgba(var(--cut-accent-rgb), 0.55);
  color: var(--cut-text);
  font-size: 12px;
  line-height: 1.35;
  text-align: center;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
  pointer-events: none;
  transition: opacity 0.45s;
}
.vig-cutter-flash.bad { border-color: #c0665a; }
.vig-cutter-flash.gone { opacity: 0; }
.vig-cutter-mat {
  position: relative;
  width: 100%;
  height: 320px;
  background: var(--cut-raised);
  background-image: repeating-linear-gradient(45deg, rgba(var(--cut-ink-rgb),.035) 0 6px, transparent 6px 12px);
  border: 1px solid var(--cut-dashed);
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vig-cutter-frame {
  position: relative;
  height: 100%;
  max-width: 100%;
  background: var(--cut-screen);
  border: 1px solid var(--cut-edge);
  box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 6px 18px rgba(0,0,0,.45);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.vig-cutter-player.veiled .vig-cutter-frame {
  filter: blur(18px) saturate(.55);
  transform: scale(1.06);
}
.vig-cutter-player.veiled .vig-cutter-strip > * { filter: blur(9px) saturate(.55); }
.vig-cutter-veilnote {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 2;
  font-size: 10px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: rgba(236,240,248,.82);
  background: rgba(8,10,14,.42);
  text-shadow: 0 1px 3px rgba(0,0,0,.9);
}
.vig-cutter-peek {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 3;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 4px;
  padding: 0;
  background: rgba(12,14,17,.72);
  color: var(--cut-cool);
  cursor: pointer;
  opacity: 0;
  transition: opacity .12s, background .12s, color .12s;
}
.vig-cutter-mat:hover .vig-cutter-peek { opacity: 1; }
.vig-cutter-peek:focus-visible { opacity: 1; }
.vig-cutter-player.veiled .vig-cutter-peek { opacity: 1; background: rgba(12,14,17,.86); }
.vig-cutter-peek:hover { background: #2f4560; color: #fff; }
.vig-cutter-frame img, .vig-cutter-frame video {
  max-width: 100%;
  max-height: 100%;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.vig-writer-tile { position: relative; width: 132px; }
.vig-writer-thumb {
  position: relative; width: 132px; border: 1px solid var(--cut-border);
  border-radius: 6px; overflow: hidden;
  background-color: var(--cut-screen);
  background-repeat: no-repeat; background-position: center; background-size: contain;
  cursor: grab;
  display: flex; align-items: center; justify-content: center; color: var(--cut-faint);
}
.vig-writer-thumb.reframing { cursor: move; outline: 1px solid #4a9b6e; }
.vig-writer-tag {
  display: flex; align-items: center; justify-content: center; gap: 3px; margin-top: 3px;
  font-size: 9px; color: var(--cut-dim); border: 1px solid var(--cut-border);
  border-radius: 3px; padding: 2px 4px; background: var(--cut-input); cursor: grab;
  user-select: none;
}
.vig-tile-dots {
  position: absolute; top: -5px; left: -5px; z-index: 4;
  display: flex; gap: 6px; pointer-events: none;
}
.vig-tile-dot {
  flex: 0 0 auto; width: 16px; height: 16px; border-radius: 50%;
  border: 1px solid rgba(255,255,255,.25); color: #fff; line-height: 0;
  cursor: pointer; display: block; position: relative; padding: 0;
  pointer-events: auto;
}
.vig-tile-dot > svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.vig-tile-dot.hover { opacity: 0; pointer-events: none; transition: opacity .12s; }
.vig-writer-tile:hover .vig-tile-dot.hover { opacity: 1; pointer-events: auto; }
.vig-cutter-chevron {
  background: none; border: none; color: var(--cut-soft); cursor: pointer; padding: 2px;
  display: flex; transition: transform .12s;
}
.vig-cutter-chevron.closed { transform: rotate(-90deg); }
.vig-cutter-corner {
  position: absolute;
  right: 0;
  bottom: 0;
  z-index: 4;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: flex-end;
  justify-content: flex-end;
  padding: 2px;
  cursor: ns-resize;
  color: var(--cut-dim);
  opacity: 0.55;
  touch-action: none;
}
.vig-cutter-mat:hover .vig-cutter-corner { opacity: 1; }
.vig-cutter-corner:hover { color: var(--cut-accent-hi); }
.vig-cutter-vsplit {
  flex: 0 0 14px;
  cursor: ew-resize;
  display: flex;
  align-items: center;
  justify-content: center;
}
.vig-cutter-vsplit > i { width: 3px; height: 64px; border-radius: 2px; background: var(--cut-dashed); }
.vig-cutter-jobbar { display: none; flex-direction: column; gap: 4px; }
.vig-cutter-jobtrack {
  height: 3px;
  border-radius: 2px;
  background: var(--cut-seam);
  overflow: hidden;
  position: relative;
}
.vig-cutter-jobtrack > i {
  position: absolute;
  left: 0;
  top: 0;
  height: 100%;
  border-radius: 2px;
  background: var(--cut-accent-lit);
  width: 0;
  transition: width 0.9s linear;
}
.vig-cutter-jobtrack.busy > i { width: 34%; animation: vig-cutter-jobslide 1.3s linear infinite; }
@keyframes vig-cutter-jobslide { from { left: -34%; } to { left: 100%; } }
.vig-cutter-jobline { display: flex; align-items: center; gap: 8px; min-width: 0; }
.vig-cutter-working {
  position: absolute; left: 50%; top: 50%; width: 46px; height: 46px;
  margin: -23px 0 0 -23px; z-index: 7;
  display: flex; align-items: center; justify-content: center;
}
.vig-cutter-working .ring {
  position: absolute; inset: 0; border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.18); border-top-color: var(--cut-accent-lit);
  animation: vig-cutter-turn 0.8s linear infinite;
}
@keyframes vig-cutter-turn { to { transform: rotate(360deg); } }
.vig-cutter-working .stop {
  position: relative; width: 26px; height: 26px; padding: 0; border: none;
  border-radius: 50%; cursor: pointer; font: inherit; font-size: 13px;
  line-height: 1; background: rgba(18, 16, 12, 0.88); color: var(--cut-bright);
  display: flex; align-items: center; justify-content: center;
}
.vig-cutter-working .stop:hover { background: #7a3b34; }
.vig-cutter-strip {
  position: relative;
  height: 86px;
  margin-top: 8px;
  border-radius: 3px;
  background: var(--cut-mat);
  cursor: ew-resize;
  overflow: hidden;
  width: 100%;
  user-select: none;
}
.vig-cutter-strip::before,
.vig-cutter-strip::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  height: 13px;
  background-color: var(--cut-mat);
  background-image: repeating-linear-gradient(
    90deg,
    transparent 0 7px,
    var(--cut-perf) 7px 17px,
    transparent 17px 24px
  );
  background-clip: content-box;
  padding: 4.75px 0;
  box-sizing: border-box;
  z-index: 3;
  pointer-events: none;
}
.vig-cutter-strip::before { top: 0; }
.vig-cutter-strip::after { bottom: 0; }
.vig-cutter-strip > .cell {
  position: absolute;
  top: 15px;
  bottom: 15px;
  background-size: cover;
  background-position: center;
  background-color: var(--cut-track);
  box-shadow: inset 0 0 0 1px var(--cut-mat), inset 0 0 0 2px rgba(207, 201, 189, 0.12);
  overflow: hidden;
}
.vig-cutter-strip > .cell > b {
  position: absolute;
  left: 4px;
  bottom: 3px;
  font-size: 8px;
  font-weight: 600;
  line-height: 1;
  color: rgba(239, 233, 221, 0.8);
  text-shadow: 0 1px 2px #000;
}
.vig-cutter-strip > .carried {
  position: absolute;
  top: 13px;
  bottom: 13px;
  border: 2px solid var(--cut-accent);
  border-left-style: dashed;
  border-radius: 2px;
  background: rgba(var(--cut-accent-rgb), 0.16);
  box-shadow: 0 0 14px rgba(var(--cut-accent-rgb), 0.35);
  z-index: 4;
  pointer-events: none;
}
.vig-cutter-strip > .carried.lead {
  border-left-style: solid;
  border-right-style: dashed;
}
.vig-cutter-strip > .bandtag.lead {
  text-align: left;
}
.vig-cutter-strip > .carried.idle {
  border-color: rgba(var(--cut-accent-rgb), 0.42);
  background: rgba(var(--cut-accent-rgb), 0.05);
  box-shadow: none;
}
.vig-cutter-strip > .bandtag.idle,
.vig-cutter-strip > .handovertag.idle {
  background: rgba(24, 20, 14, 0.82);
  box-shadow: inset 0 0 0 1px rgba(var(--cut-accent-rgb), 0.55);
  color: rgba(226, 183, 92, 0.92);
}
.vig-cutter-strip > .bandtag.idle > button.pick {
  background: rgba(226, 183, 92, 0.16);
}
.vig-cutter-strip > .bandtag.idle > button.pick:hover {
  background: rgba(226, 183, 92, 0.3);
}
.vig-cutter-strip > .handover.idle { opacity: 0.4; }
.vig-cutter-strip > .bandplay.idle { opacity: 0.5; }
.vig-cutter-strip > .bandplay.idle:hover { opacity: 0.85; }
.vig-cutter-strip > .handover > i {
  position: absolute;
  left: 4.5px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--cut-accent);
}
.vig-cutter-strip > .handover::before {
  content: "";
  position: absolute;
  left: 0;
  top: 13px;
  width: 11px;
  height: 8px;
  background: var(--cut-accent);
  clip-path: polygon(0 0, 100% 0, 50% 100%);
}
.vig-cutter-strip > .bandtag {
  position: absolute;
  top: 0;
  height: 13px;
  padding: 0 6px;
  border-radius: 2px;
  background: var(--cut-accent);
  color: var(--cut-on-accent);
  font-size: 8px;
  font-weight: 700;
  line-height: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: right;
  white-space: nowrap;
  z-index: 6;
  pointer-events: none;
}
.vig-cutter-strip > .bandtag > button.pick {
  pointer-events: auto;
  font: inherit;
  color: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  background: rgba(28, 23, 16, 0.2);
  border: 0;
  border-radius: 2px;
  padding: 0 3px;
  margin: 0 1px;
  line-height: 13px;
  cursor: pointer;
}
.vig-cutter-strip > .bandtag > button.pick:hover {
  background: rgba(28, 23, 16, 0.42);
}
.vig-cutter-strip > .handover {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 11px;
  background: none;
  pointer-events: auto;
  cursor: ew-resize;
  z-index: 8;
}
.vig-cutter-strip > .handovertag {
  position: absolute;
  bottom: 0;
  height: 13px;
  border-radius: 2px;
  background: var(--cut-accent);
  color: var(--cut-on-accent);
  font-size: 8px;
  font-weight: 700;
  line-height: 13px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  text-align: center;
  white-space: nowrap;
  z-index: 6;
  pointer-events: none;
}
.vig-cutter-strip > button.handovertag {
  pointer-events: auto;
  cursor: pointer;
  border: 0;
  padding: 0;
  font-size: 8px;
  font-weight: 700;
  line-height: 13px;
}
.vig-cutter-strip > button.handovertag:hover:not(:disabled) {
  filter: brightness(1.12);
}
.vig-cutter-strip > button.handovertag.idle:hover:not(:disabled) {
  filter: none;
  background: rgba(24, 20, 14, 0.97);
  box-shadow: inset 0 0 0 1px rgba(226, 183, 92, 0.95);
  color: var(--cut-accent-pale);
}
.vig-cutter-strip > button.handovertag:disabled {
  opacity: 0.35;
  cursor: default;
  filter: none;
}
.vig-cutter-strip > .handovertag.haslink { box-sizing: border-box; }
.vig-cutter-strip > .cutlink {
  position: absolute;
  bottom: 0;
  height: 13px;
  width: 14px;
  padding: 0;
  border: 0;
  border-radius: 2px;
  background: rgba(28, 23, 16, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 7;
  color: var(--cut-on-accent);
}
.vig-cutter-strip > .cutlink:hover { background: rgba(28, 23, 16, 0.42); }
.vig-cutter-strip > .cutlink.idle { color: rgba(226, 183, 92, 0.92); background: rgba(226, 183, 92, 0.16); }
.vig-cutter-strip > .cutlink.idle:hover { background: rgba(226, 183, 92, 0.3); }
.vig-cutter-settled textarea { cursor: default; }
.vig-cutter-waiting { flex-basis: 100%; color: var(--cut-dim); font-size: 11px; }
.vig-cutter-strip > .bandplay {
  position: absolute;
  top: 50%;
  width: 40px;
  height: 40px;
  margin: -20px 0 0 -20px;
  padding: 0;
  border: 0;
  background: none;
  color: var(--cut-accent);
  cursor: pointer;
  z-index: 7;
  pointer-events: auto;
  opacity: 0.92;
  filter: drop-shadow(0 0 5px rgba(0, 0, 0, 0.8));
  transition: opacity 0.12s linear, transform 0.12s ease-out;
}
.vig-cutter-strip > .bandplay:hover { opacity: 1; transform: scale(1.08); }
.vig-cutter-strip > .bandplay:disabled { opacity: 0.3; cursor: default; }
.vig-cutter-strip > .carried.settled {
  border-color: #8a8a8a;
  background: rgba(140, 140, 140, 0.12);
  box-shadow: none;
}
.vig-cutter-strip > .bandtag.settled,
.vig-cutter-strip > .handovertag.settled {
  background: #7d7d7d;
  color: #1c1c1c;
  box-shadow: none;
}
.vig-cutter-strip > button.handovertag.settled:disabled { opacity: 1; cursor: not-allowed; }
.vig-cutter-strip > .bandtag.settled > button.pick {
  background: rgba(0, 0, 0, 0.18);
  color: inherit;
  opacity: 1;
  cursor: not-allowed;
}
.vig-cutter-strip > .cutlink.settled { color: #1c1c1c; background: rgba(0, 0, 0, 0.18); }
.vig-cutter-strip > .handover.settled { cursor: not-allowed; }
.vig-cutter-strip > .handover.settled > i,
.vig-cutter-strip > .handover.settled::before { background: #8a8a8a; }
.vig-cutter-strip > .bandplay.settled { color: #9a9a9a; }
.vig-cutter-strip > .playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  margin-left: -0.5px;
  background: var(--cut-bright);
  box-shadow: 0 0 6px rgba(239, 233, 221, 0.8);
  z-index: 7;
  pointer-events: none;
}
.vig-cutter-strip > .playhead::before {
  content: "";
  position: absolute;
  top: -1px;
  left: -6px;
  width: 12px;
  height: 9px;
  border-radius: 2px 2px 5px 5px;
  background: var(--cut-bright);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
}
.vig-cutter-strip > .playhead::after {
  content: "";
  position: absolute;
  bottom: -1px;
  left: -6px;
  width: 12px;
  height: 9px;
  border-radius: 5px 5px 2px 2px;
  background: var(--cut-bright);
  box-shadow: 0 -1px 3px rgba(0, 0, 0, 0.6);
}

.vig-cutter-strip > .notch {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  margin-left: -1px;
  background: repeating-linear-gradient(
    180deg,
    rgba(240, 200, 110, 0.85) 0 5px,
    transparent 5px 9px
  );
  box-shadow: 0 0 3px rgba(0, 0, 0, 0.8);
  z-index: 5;
  pointer-events: none;
}
.vig-cutter-strip > .notch.near {
  width: 3px;
  margin-left: -1.5px;
  background: repeating-linear-gradient(
    180deg,
    rgba(255, 226, 150, 1) 0 5px,
    transparent 5px 9px
  );
}
.vig-cutter-strip > .beyond {
  position: absolute;
  top: 0;
  bottom: 0;
  right: 0;
  background: rgba(10, 10, 10, 0.55);
  z-index: 4;
  pointer-events: none;
}
.vig-cutter-carry {
  display: flex;
  align-items: center;
  gap: 4px;
}
.vig-cutter-carry > button {
  background: none;
  border: 1px solid var(--cut-border);
  border-radius: 4px;
  color: var(--cut-dim);
  font-size: 10px;
  padding: 2px 7px;
  cursor: pointer;
}
.vig-cutter-carry > button.on {
  border-color: var(--cut-accent);
  background: rgba(var(--cut-accent-rgb), 0.16);
  color: var(--cut-bright);
}
.vig-cutter-ghost.active {
  border-color: var(--cut-accent);
  color: var(--cut-accent-lit);
  background: rgba(var(--cut-accent-rgb), 0.13);
}
`;
export function ensureStyles() {
  if (typeof document === "undefined") return;
  ensureSchemeStyles();
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}
function dot(left, colour, glyph, title, onClick) {
  const holder = el("div", "vig-cutter-dot");
  holder.style.left = `${left}px`;
  const button = el("button");
  button.style.background = colour;
  button.title = title;
  if (typeof glyph === "string") button.textContent = glyph;
  else button.appendChild(glyph);
  button.addEventListener("click", (event) => {
    event.stopPropagation();
    event.preventDefault();
    onClick();
  });
  holder.appendChild(button);
  return holder;
}
function seedModeIcons(current, spentBy, onPick, roll) {
  const group = el("span", "vig-cutter-seedmodes");
  const buttons = [];
  for (const [mode, icon, caption, why] of [
    ["random", ICONS.dice, "randomize",
      `A new seed every time ${spentBy} — and this press rolls one now.`],
    ["increment", ICONS.plusone, "increment",
      `One more every time ${spentBy} — a sweep that reads back in the order `
      + "it was made: 100, 101, 102."],
    ["fixed", ICONS.locked, "fixed",
      `The seed stays where it is when ${spentBy}. The way to see what a CHANGE `
      + "did on its own: move one thing, press again, and the seed is not what "
      + "moved. For a new number to keep, roll the dice first and press this after."],
  ]) {
    const button = el("button", "vig-cutter-modebtn");
    button.appendChild(svg(icon, 12));
    button.title = why;
    button.dataset.log = `seed mode ${caption}`;
    if (mode === current) button.classList.add("on");
    button.addEventListener("click", () => {
      for (const other of buttons) other.classList.toggle("on", other === button);
      onPick(mode);
      if (mode === "random" && roll) roll();
    });
    buttons.push(button);
    group.appendChild(button);
  }
  return group;
}
function seedLabel(text, modes) {
  const label = el("label", "vig-cutter-label");
  label.style.cssText = "display:flex;align-items:center;gap:4px";
  label.appendChild(el("span", "", text));
  label.appendChild(modes);
  return label;
}
function seedModeOf(board) {
  const said = (board || {}).seed_mode;
  return (model.SEED_MODES || []).includes(said) ? said : (model.DEFAULT_SEED_MODE || "random");
}
function randomSeed() {
  return Math.floor(Math.random() * 1000000);
}
const DRAG_PHASE = true;
function pxScale(element) {
  const layout = element && element.offsetWidth;
  if (!layout) return 1;
  const shown = element.getBoundingClientRect().width;
  return shown > 0 ? shown / layout : 1;
}
function tryCapture(element, pointerId) {
  try {
    element.setPointerCapture?.(pointerId);
  } catch {
  }
}
const STRIP_ROUTE = "/vig/h3/cutter/strip";
const TAKE_ADOPT_ROUTE = "/vig/h3/cutter/take_adopt";
const REVEAL_ROUTE = "/vig/h3/cutter/reveal";
const VALIDATE_ROUTE = "/vig/h3/cutter/validate";
const PROJECT_SIZE_ROUTE = "/vig/h3/cutter/project_size";
const ENVELOPES_ROUTE = "/vig/h3/cutter/envelopes";
export function buildCutterPanel(options = {}) {
  ensureStyles();
  const VEIL_PREF = "vig.h3.console.veil";
  const readVeil = () => {
    try {
      const said = JSON.parse(window.localStorage.getItem(VEIL_PREF) || "{}");
      return { clip: !!said.clip, film: !!said.film };
    } catch (err) {
      return { clip: false, film: false };
    }
  };
  const veilPainters = [];
  const paintVeils = () => {
    for (const paint of veilPainters) paint();
  };
  const rememberVeil = () => {
    try {
      window.localStorage.setItem(VEIL_PREF, JSON.stringify(state.veil));
    } catch (err) {
    }
  };
  const COST_PREF = "vig.h3.console.cost";
  const readCostPoints = () => {
    try {
      const said = JSON.parse(window.localStorage.getItem(COST_PREF) || "[]");
      return Array.isArray(said) ? said : [];
    } catch (err) {
      return [];
    }
  };
  const rememberRenderCost = (cost) => {
    const points = model.rememberCost(state.cost, cost);
    if (points === state.cost) return;
    state.cost = points;
    try {
      window.localStorage.setItem(COST_PREF, JSON.stringify(points));
    } catch (err) {
    }
  };
  const state = {
    board: model.emptyBoard(),
    veil: readVeil(),
    cost: readCostPoints(),
    runTokens: 0,
    scheme: readScheme(),
    collapsed: false,
    running: new Set(),
    drag: null,
    dragRef: null,
    phantom: null,
    previewH: 320,
    livePreview: null,
    bandLoop: null,
    followRun: true,
    scriptW: 360,
    paneH: 170,
    langBusy: null,
    rebuildBusy: null,
    procBusy: null,
    enrichBusy: null,
    scriptDraft: {},
    runBase: null,
    runFresh: {},
    renderPress: "",
    takeCounts: {},
    takeCountsFor: "",
    clipSizes: {},
    filmCount: undefined,
    filmCountFor: "",
    filmCountAsking: "",
    projectSize: undefined,
    projectSizeFor: "",
    projectMissing: "",
    projectSizeAsking: "",
    envelopes: {},
    envelopesAsked: new Set(),
    promptOpen: false,
    frameBusy: false,
    filmBusy: false,
    filmNote: null,
    filmNameEdit: false,
    nameEdit: null,
    playerNameEdit: null,
    agentNote: {},
    agent: {
      models: [], styles: [], forDir: null, loading: false,
      source: "folder", trouble: "", keySource: "", tokenSource: "", offered: 0, connected: 0,
      skills: null, alwaysSkills: [], skillsFolder: "", skillsBusy: false,
    },
    agentHealth: null,
    agentJob: null,
    agentTimer: null,
    cutAt: {},
    scrubHold: null,
    batchAt: null,
    gallery: null,
    headParked: false,
    cutDrag: null,
    cutSnap: true,
    leadSnap: true,
    carryFrames: {},
    leadFrames: {},
    leadAt: {},
    leadDrag: null,
    stripThumbs: {},
    filmDurations: {},
    stripTries: {},
    stripBusy: new Set(),
    filmJoining: false,
    filmThumbsShown: null,
    runReport: "",
    runActivity: null,
    dirBusy: false,
    agentDirError: "",
    projectBusy: false,
    projectWaiting: "",
    projectGiveUp: null,
    projectDirError: "",
    imageRatio: null,
  };
  const root = el("div", `vig-cutter ${SCHEME_CLASS}`);
  const parts = {};
  function scrollTaker(element, deltaX, deltaY) {
    const style = getComputedStyle(element);
    const scrollsDown =
      /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
    const scrollsSide =
      /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      if (scrollsDown) return "native";
      if (scrollsSide) return "sideways";
      return "";
    }
    return scrollsSide || scrollsDown ? "native" : "";
  }
  const wheelGuard = (event) => {
    const target = event.target;
    if (!target || !(target instanceof Node) || !root.contains(target)) return;
    let element = target.nodeType === 1 ? target : target.parentElement;
    while (element && element !== root.parentElement) {
      const takes = scrollTaker(element, event.deltaX, event.deltaY);
      if (takes) {
        event.stopPropagation();
        if (takes === "sideways") element.scrollLeft += event.deltaY;
        return;
      }
      element = element.parentElement;
    }
  };
  document.addEventListener("wheel", wheelGuard, { capture: true, passive: true });
  const head = el("div", "vig-cutter-head");
  const heading = el("div", "vig-cutter-inline");
  heading.style.alignItems = "baseline";
  heading.style.gap = "9px";
  heading.appendChild(el("span", "vig-cutter-title", "H3 Cutter"));
  const headProject = el("div", "vig-cutter-inline");
  headProject.style.cssText = "gap:8px;min-width:0";
  const headRight = el("div", "vig-cutter-inline");
  headRight.style.gap = "4px";
  const HEAD_ICON = 19;
  const headButton = (icon, title, log) => {
    const button = el("button", "vig-cutter-flat vig-cutter-headbtn");
    button.appendChild(svg(icon, HEAD_ICON));
    button.title = title;
    button.dataset.log = log;
    return button;
  };
  const refresh = headButton(
    ICONS.refresh,
    "Refresh — re-read the node's wires (latent_image canvas), the agent's model " +
    "list and clip 1's image proportions, then repaint the console.",
    "refresh",
  );
  refresh.addEventListener("click", () => {
    state.agent.forDir = null;
    state.imageRatio = null;
    renderAll();
  });
  const schemeButton = headButton(ICONS.palette, "Colour scheme", "colour scheme");
  const paintScheme = () => {
    state.scheme = document.documentElement.dataset.vigScheme || state.scheme;
    const now = applyScheme(state.scheme, { remember: false });
    schemeButton.title = `Colour scheme — ${now.name}`;
  };
  schemeButton.addEventListener("click", () => {
    paintScheme();
    openPopover(schemeButton, "colour scheme", (close) => {
      const rows = [];
      for (const one of SCHEMES) {
        const row = el("button", "vig-cutter-schemerow");
        const chip = el("span", "vig-cutter-schemechip");
        chip.style.background = one.bg;
        chip.style.borderColor = one.edge;
        chip.appendChild(el("i", "", "")).style.background = one.accent;
        row.append(chip, el("span", "", one.name));
        if (one.id === state.scheme) row.classList.add("on");
        row.addEventListener("click", () => {
          state.scheme = applyScheme(one.id).id;
          paintScheme();
          close();
        });
        rows.push(row);
      }
      return rows;
    }, "Every window — the node, the takes gallery, the reference editor and their menus.");
  });
  const settingsButton = headButton(
    ICONS.gear,
    "Machine settings — the writing model, and the live preview",
    "machine settings",
  );
  settingsButton.addEventListener("click", () => openSettings());
  const collapse = headButton(ICONS.chevron, "Collapse", "collapse console");
  collapse.addEventListener("click", () => {
    state.collapsed = !state.collapsed;
    body.style.display = state.collapsed ? "none" : "";
    collapse.style.transform = state.collapsed ? "rotate(-90deg)" : "none";
  });
  const support = headButton(ICONS.heart, "Support development — Ko-fi (opens in a new tab)", "support");
  support.classList.add("vig-cutter-heart");
  support.addEventListener("click", () => window.open(SUPPORT_URL, "_blank", "noopener"));
  headRight.append(support, schemeButton, settingsButton, refresh, collapse);
  paintScheme();
  head.append(heading, headProject, el("div", "vig-cutter-spring"), headRight);
  const cutterBox = el("div", "vig-cutter-cardbox cutter");
  cutterBox.appendChild(head);
  root.appendChild(cutterBox);
  const body = el("div", "vig-cutter-body");
  cutterBox.appendChild(body);
  function section(title, { startClosed = false } = {}) {
    const wrap = el("div", "vig-cutter-section");
    const headRow = el("div", "vig-cutter-section-head");
    headRow.style.cursor = "pointer";
    headRow.title = "click to open or close this block";
    const titleSpan = el("span", "vig-cutter-section-title", title);
    headRow.appendChild(titleSpan);
    headRow.appendChild(el("span", "vig-cutter-section-rule"));
    const sectionBody = el("div", "vig-cutter-section-body");
    const chevron = el("button", "vig-cutter-chevron");
    headRow.dataset.log = title;
    chevron.dataset.log = title;
    chevron.appendChild(svg(ICONS.chevron, 13));
    chevron.tabIndex = -1;
    headRow.appendChild(chevron);
    const apply = (closed) => {
      sectionBody.style.display = closed ? "none" : "";
      chevron.classList.toggle("closed", closed);
      headRow.title = closed ? "click to open this block" : "click to close this block";
    };
    headRow.addEventListener("click", () => apply(sectionBody.style.display !== "none"));
    apply(!!startClosed);
    wrap.append(headRow, sectionBody);
    body.appendChild(wrap);
    sectionBody.retitle = (text) => {
      titleSpan.textContent = text;
    };
    sectionBody.afterTitle = (node) => titleSpan.after(node);
    return sectionBody;
  }
  const timelineSection = section("1 · Video & timeline");
  parts.projectTotals = el("span", "vig-cutter-section-totals");
  timelineSection.afterTitle(parts.projectTotals);
  const segmentSection = section("2 · Segment workshop");
  function paramGroup(labelText) {
    const wrap = el("div", "vig-cutter-group");
    wrap.appendChild(el("span", "vig-cutter-group-label", labelText));
    const fields = el("div", "vig-cutter-row");
    wrap.appendChild(fields);
    return { wrap, fields };
  }
  const settingsBox = el("div", "vig-cutter-row");
  settingsBox.style.cssText = "flex-direction:column;align-items:stretch;flex-wrap:nowrap;gap:10px";
  const agentGroup = paramGroup("agent · writing");
  parts.agentRow = agentGroup.fields;
  const previewGroup = paramGroup("preview · live sampling");
  parts.previewRow = previewGroup.fields;
  const takesGroup = paramGroup("takes · timeline");
  const newTakeBox = document.createElement("input");
  newTakeBox.type = "checkbox";
  newTakeBox.dataset.log = "new take to timeline";
  const newTakeLabel = el("label", "vig-cutter-checkline");
  newTakeLabel.append(newTakeBox, el("span", "", "A new render replaces the clip on the timeline"));
  newTakeLabel.title =
    "On: every clip that actually renders goes on the timeline, and the take it " +
    "played stays in the gallery. Off: only a clip's first render goes on the " +
    "timeline; later ones wait in the gallery for you to choose. A locked clip, " +
    "and a press that rendered nothing, never change the timeline.";
  newTakeBox.addEventListener("change", () => {
    state.board.new_take_to_timeline = newTakeBox.checked;
    commit();
  });
  takesGroup.fields.appendChild(newTakeLabel);
  parts.paintNewTake = () => { newTakeBox.checked = !!state.board.new_take_to_timeline; };
  settingsBox.append(agentGroup.wrap, previewGroup.wrap, takesGroup.wrap);
  function openSettings() {
    if (state.settingsOpen) {
      state.settingsOpen();
      return;
    }
    state.settingsOpen = openPopover(
      settingsButton,
      "Machine settings",
      () => {
        const holder = el("div", "vig-cutter vig-cutter-popsettings");
        holder.appendChild(settingsBox);
        return [holder];
      },
      "",
      "width:min(460px,92vw);max-height:min(720px,84vh)",
      {
        sticky: true,
        onClose: () => {
          settingsBox.remove();
          state.settingsOpen = null;
          settingsButton.classList.remove("on");
        },
      },
    );
    settingsButton.classList.add("on");
    renderAgentRow();
    renderPreviewRow();
    parts.paintNewTake();
  }
  function renderProjectTotals() {
    const node = parts.projectTotals;
    if (!node) return;
    const segments = state.board.segments || [];
    const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
    const bits = [plural(segments.length, "segment")];
    const root = (state.board.project_dir || "").trim();
    if (root) {
      const counts = segments.map((seg) => takeCountsOf()[seg.id]);
      bits.push(counts.some((n) => n === undefined)
        ? "… takes"
        : plural(counts.reduce((sum, n) => sum + n, 0), "take"));
      if (state.filmCountFor !== root) askFilmCount(root);
      bits.push(state.filmCountFor === root && state.filmCount !== undefined
        ? plural(state.filmCount, "film") : "… films");
    }
    node.textContent = bits.join(" · ");
    node.title = root
      ? "Segments on the timeline · takes kept in all their galleries · films in the project's " +
        "film gallery (a film of one clip is not kept there)."
      : "Segments on the timeline. Choose a project folder to count takes and films.";
  }
  function askFilmCount(root) {
    if (state.filmCountAsking === root || typeof options.callRoute !== "function") return;
    state.filmCountAsking = root;
    options
      .callRoute("/vig/h3/cutter/films", { path: root })
      .then((data) => (Array.isArray(data && data.films) ? data.films.length : 0), () => 0)
      .then((count) => {
        if (state.filmCountAsking !== root) return;
        state.filmCountAsking = "";
        state.filmCountFor = root;
        state.filmCount = count;
        renderProjectTotals();
      });
  }
  function forgetFilmCount() {
    state.filmCountFor = "";
    state.filmCount = undefined;
    state.filmCountAsking = "";
    forgetProjectSize();
  }
  function forgetProjectSize() {
    state.projectSizeFor = "";
    state.projectSize = undefined;
    state.projectSizeAsking = "";
  }
  function formatBytes(bytes) {
    const units = [["GB", 1024 ** 3], ["MB", 1024 ** 2], ["KB", 1024]];
    for (const [unit, size] of units) {
      if (bytes >= size) {
        const value = bytes / size;
        return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${unit}`;
      }
    }
    return `${bytes} B`;
  }
  function paintProjectPath() {
    const node = parts.projectPath;
    const root = (state.board.project_dir || "").trim();
    const missing = !!root && state.projectMissing === root;
    const live = !state.projectBusy && !state.projectDirError && !!root && !missing;
    node.textContent = "";
    const name = el("span", `vig-cutter-projectname${live ? " press" : ""}`,
      state.projectBusy
        ? state.projectWaiting === "reading"
          ? "reading the folder…"
          : "choose the folder in the Explorer window…"
        : state.projectDirError
          ? state.projectDirError
          : root
            ? `…${root.slice(-28)}${missing ? " — folder missing" : ""}`
            : "no project folder");
    name.dataset.log = "project folder";
    node.appendChild(name);
    if (state.projectBusy && state.projectWaiting === "dialog") {
      for (const [word, action, tip] of [
        ["show it", "raise", "Bring the folder dialog to the front"],
        ["cancel", "cancel", "Close the folder dialog without choosing"],
      ]) {
        const press = el("button", "vig-cutter-dialogpress", word);
        press.title = tip;
        press.dataset.log = `folder dialog ${word}`;
        press.addEventListener("click", (event) => {
          event.stopPropagation();
          folderDialogPress(action);
        });
        node.appendChild(press);
      }
    }
    node.style.color = state.projectDirError || missing ? "#e08a7d" : "";
    let sized = "";
    if (!state.projectBusy && !state.projectDirError && root) {
      if (state.projectSizeFor !== root) askProjectSize(root);
      else if (live && state.projectSize && !state.projectSize.missing) {
        const { bytes, files } = state.projectSize;
        node.appendChild(el("span", "vig-cutter-projectsize", `(${formatBytes(bytes)})`));
        sized = ` — ${formatBytes(bytes)} in ${files} file${files === 1 ? "" : "s"}`;
      }
    }
    node.title = state.projectDirError
      || (missing ? missingFolderSentence(root) : "")
      || (root ? `${root}${sized}\nClick the name to open the folder.` : "")
      || "No project folder chosen — run artefacts stay in ComfyUI's output cache.";
  }
  function askProjectSize(root) {
    if (state.projectSizeAsking === root || typeof options.callRoute !== "function") return;
    state.projectSizeAsking = root;
    options
      .callRoute(PROJECT_SIZE_ROUTE, { path: root })
      .then((data) => (data && data.missing
        ? { missing: true }
        : data && Number.isFinite(Number(data.bytes))
          ? { bytes: Number(data.bytes), files: Number(data.files) || 0 } : null), () => null)
      .then((size) => {
        if (state.projectSizeAsking !== root) return;
        state.projectSizeAsking = "";
        state.projectSizeFor = root;
        state.projectSize = size;
        const wasMissing = state.projectMissing === root;
        state.projectMissing = size && size.missing ? root : "";
        if (wasMissing && !state.projectMissing) {
          state.takeCountsFor = "";
          forgetFilmCount();
          renderAll();
          return;
        }
        paintProjectPath();
      });
  }
  function projectChanged() {
    state.projectMissing = "";
    state.takeCountsFor = "";
    forgetFilmCount();
  }
  function missingFolderSentence(root) {
    return `The project folder ${root} does not exist any more — deleted, renamed, or on a ` +
      "drive that is not mounted. Nothing is written or rendered until it is back: open the " +
      "project again, or start a new one.";
  }
  async function fileReference(seg, ref) {
    if (!state.board.project_dir || !ref || !ref.source) return;
    const index = (state.board.segments || []).findIndex((s) => s.id === seg.id);
    await callProject("/vig/h3/cutter/project_ref", {
      project_dir: state.board.project_dir,
      index: index < 0 ? 0 : index,
      clip_name: seg.name || "",
      source: ref.source,
      label: ref.tag || ref.uid || ref.label || "ref",
    });
  }
  function askInPanel(title, body, okLabel = "Yes", cancelLabel = "Cancel", initial) {
    return new Promise((resolve) => {
      const veil = el("div");
      veil.style.cssText =
        "position:absolute;inset:0;z-index:60;display:flex;align-items:flex-start;" +
        "justify-content:center;background:var(--cut-scrim);backdrop-filter:blur(2px)";
      const box = el("div", "vig-cutter-setbox");
      box.style.cssText =
        "max-width:460px;background:var(--cut-raised);border:1px solid var(--cut-accent);" +
        "border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:10px";
      const head = el("div", "vig-cutter-label", title);
      head.style.letterSpacing = ".08em";
      const text = el("div");
      text.style.cssText = "font-size:12px;line-height:1.5;white-space:pre-wrap;color:var(--cut-text)";
      text.textContent = body;
      const row = el("div", "vig-cutter-inline");
      row.style.cssText = "gap:8px;justify-content:flex-end";
      const no = cancelLabel ? el("button", "vig-cutter-ghost", cancelLabel) : null;
      const yes = el("button", "vig-cutter-primary", okLabel);
      row.append(...(no ? [no, yes] : [yes]));
      const field = initial === undefined ? null : document.createElement("input");
      if (field) {
        field.type = "text";
        field.value = String(initial);
        field.style.cssText =
          "width:100%;box-sizing:border-box;background:var(--cut-input);color:var(--cut-text);" +
          "border:1px solid var(--cut-accent);border-radius:5px;padding:5px 7px;font-size:12px";
        field.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            yes.click();
          }
        });
      }
      box.append(head, text, ...(field ? [field] : []), row);
      veil.appendChild(box);
      let frame = 0;
      const place = () => {
        const rect = veil.getBoundingClientRect();
        const laid = veil.offsetHeight;
        if (laid > 0) {
          const zoom = rect.height / laid || 1;
          const top = Math.max(0, -rect.top);
          const band = Math.min(rect.height, window.innerHeight - rect.top) - top;
          if (band > 0) {
            box.style.marginTop =
              `${Math.max(0, (top + (band - box.offsetHeight * zoom) / 2) / zoom)}px`;
          }
        }
        frame = requestAnimationFrame(place);
      };
      const done = (answer) => {
        cancelAnimationFrame(frame);
        veil.remove();
        resolve(field ? (answer ? field.value : null) : answer);
      };
      if (no) no.addEventListener("click", () => done(false));
      yes.addEventListener("click", () => done(true));
      veil.addEventListener("click", (event) => {
        if (event.target === veil) done(false);
      });
      root.appendChild(veil);
      place();
      (field || yes).focus();
      if (field) field.select();
    });
  }
  function tellInPanel(title, body) {
    return askInPanel(title, body, "OK", "");
  }
  async function callProject(route, body) {
    const callRoute = options.callRoute;
    if (typeof callRoute !== "function") return null;
    try {
      return await callRoute(route, body);
    } catch (error) {
      state.projectDirError = `${route}: ${error && error.message ? error.message : error}`;
      return null;
    }
  }
  async function readProject(path) {
    const callRoute = options.callRoute;
    if (typeof callRoute !== "function") return null;
    try {
      return await callRoute("/vig/h3/cutter/project", { path });
    } catch (error) {
      state.projectDirError = `could not read the project folder: ${
        error && error.message ? error.message : error
      }`;
      return null;
    }
  }
  function folderName(path) {
    const sep = String.fromCharCode(92);
    const bits = String(path || "").split("/").join(sep).split(sep).filter(Boolean);
    return bits.length ? bits[bits.length - 1] : "";
  }
  const REF_KIND_BY_EXT = {
    mp4: "video", webm: "video", mov: "video", mkv: "video",
    wav: "audio", mp3: "audio", flac: "audio", ogg: "audio", m4a: "audio",
  };
  function refKind(name) {
    const ext = String(name || "").split(".").pop().toLowerCase();
    return REF_KIND_BY_EXT[ext] || "image";
  }
  function boardFromFolder(found, path) {
    if (!found || found.ok === false) return null;
    const clips = Array.isArray(found.clips) ? found.clips : [];
    const ours =
      ((found.manifest || {}).kind === "vig-h3-cutter-project")
      || clips.length
      || (Array.isArray(found.films) && found.films.length);
    if (!ours) return null;
    const segments = clips.map((clip, index) => {
      const made = (clip && clip.latest_prompt) || {};
      const files = (clip && clip.reference_files) || [];
      return {
        id: index + 1,
        name: String((clip && clip.folder) || "").replace(/^\d+_/, "").replace(/_/g, " "),
        seconds: made.seconds,
        mode: made.mode,
        prompt: made.prompt,
        written_by: made.writer,
        script: made.script,
        style: made.style,
        camera: made.camera,
        seed: made.seed,
        context_frames: made.context_frames,
        context_audio: made.context_audio,
        refs: files.map((file, n) => ({
          uid: `d${index + 1}r${n + 1}`,
          kind: refKind(file && file.name),
          label: (file && file.name) || "",
          source: (file && file.path) || "",
        })),
      };
    });
    return {
      version: 1,
      segments,
      project_dir: path,
      film_name: folderName(path),
      selected_id: segments.length ? segments[0].id : 1,
      writer: { ...state.board.writer },
    };
  }
  function folderDialogPress(action) {
    if (typeof options.folderDialog === "function") options.folderDialog(action);
    if (action !== "cancel") return;
    const giveUp = state.projectGiveUp;
    setTimeout(() => { if (giveUp) giveUp({ ok: true, cancelled: true }); }, 2500);
  }
  async function chooseFolder() {
    if (typeof options.pickFolder !== "function" || state.projectBusy) return null;
    state.projectBusy = true;
    state.projectWaiting = "dialog";
    state.projectDirError = "";
    renderControls();
    try {
      const given = new Promise((resolve) => { state.projectGiveUp = resolve; });
      const result = await Promise.race([
        options.pickFolder(state.board.project_dir || "", "project"),
        given,
      ]);
      if (result && result.ok === false) {
        state.projectDirError = result.message || "The folder dialog did not open.";
        return null;
      }
      if (!result || result.cancelled || typeof result.path !== "string" || !result.path) {
        return null;
      }
      return result.path;
    } catch (error) {
      state.projectDirError = `folder pick failed: ${error && error.message ? error.message : error}`;
      return null;
    } finally {
      state.projectBusy = false;
      state.projectWaiting = "";
      state.projectGiveUp = null;
      renderControls();
    }
  }
  async function readProjectSaying(path) {
    state.projectBusy = true;
    state.projectWaiting = "reading";
    renderControls();
    try {
      return await readProject(path);
    } finally {
      state.projectBusy = false;
      state.projectWaiting = "";
      renderControls();
    }
  }
  parts.projectNewBtn = el("button", "vig-cutter-ghost");
  parts.projectNewBtn.append(svg(ICONS.frameadd, 12), el("span", "", "New project"));
  parts.projectNewBtn.title =
    "Choose a folder and lay the project structure down in it: film/, clips/, " +
    "references/, frames/, prompts/. The cut on screen stays as it is, and the " +
    "first run fills the folder. Nothing existing is ever deleted.";
  parts.projectNewBtn.addEventListener("click", async () => {
    const path = await chooseFolder();
    if (!path) return;
    const clips = (state.board.segments || []).length;
    if (clips && !(await askInPanel(
      "Start a new project?",
      `The board on screen — ${clips} clip(s), with their prompts and scripts — ` +
      `will be cleared.

Files already in that folder are never deleted.`,
      "Start new project",
    ))) {
      renderAll();
      return;
    }
    const blank = model.readBoard("");
    blank.writer = { ...state.board.writer };
    blank.project_dir = path;
    blank.film_name = folderName(path);
    const made = await callProject("/vig/h3/cutter/project_new", {
      path,
      first_clip: "",
      board: JSON.parse(model.writeBoard(blank)),
    });
    if (!made || made.ok === false) {
      if (made && made.error) state.projectDirError = made.error;
      else if (!state.projectDirError) {
        state.projectDirError = "Could not create the project folder.";
      }
    } else {
      if (made.already_had_work) {
        const t = made.totals || {};
        await tellInPanel(
          "That folder already holds a cut",
          `${t.takes || 0} take(s) and ${t.films || 0} film(s) are already there.

` +
          `Nothing was deleted — this project's artefacts will join them. ` +
          `Use "Open project" instead if you meant to load that cut.`,
        );
      }
      state.board = blank;
      projectChanged();
      state.projectFound = await readProject(path);
      commit();
    }
    renderAll();
  });
  async function keepInProject() {
    const path = await chooseFolder();
    if (!path) return false;
    const board = JSON.parse(model.writeBoard(state.board));
    board.project_dir = path;
    if (!String(board.film_name || "").trim()) board.film_name = folderName(path);
    const made = await callProject("/vig/h3/cutter/project_new", { path, first_clip: "", board });
    if (!made || made.ok === false) {
      if (made && made.error) state.projectDirError = made.error;
      else if (!state.projectDirError) state.projectDirError = "Could not create the project folder.";
      renderAll();
      return false;
    }
    state.board.project_dir = path;
    state.board.film_name = board.film_name;
    projectChanged();
    state.projectFound = await readProject(path);
    commit();
    renderAll();
    return true;
  }
  async function offerProject(why) {
    if ((state.board.project_dir || "").trim()) return true;
    const yes = await askInPanel(
      "No project folder",
      `${why}

Keep this cut in a project folder now? Nothing on screen is cleared.`,
      "Choose a folder…",
      "Not now",
    );
    return yes ? keepInProject() : false;
  }
  parts.projectOpenBtn = el("button", "vig-cutter-ghost");
  parts.projectOpenBtn.append(svg(ICONS.folder, 12), el("span", "", "Open project"));
  parts.projectOpenBtn.title =
    "Choose a project folder and load the cut it holds. The board on screen is " +
    "replaced, so you are asked first.";
  parts.projectOpenBtn.addEventListener("click", async () => {
    const path = await chooseFolder();
    if (!path) return;
    const found = await readProjectSaying(path);
    if (!found || found.ok === false) {
      state.projectDirError = (found && found.error) || "Could not read that folder.";
      renderAll();
      return;
    }
    state.projectFound = found;
    const rebuilt = found.has_board && found.board ? null : boardFromFolder(found, path);
    const raw = rebuilt || found.board;
    if (!raw) {
      state.projectDirError =
        "That folder is not a project — no board.json, no clips and no film in it. " +
        'Use "New project" to start one there.';
      renderAll();
      return;
    }
    const t = found.totals || {};
    const summary =
      `${(raw.segments || []).length} clip(s), ${t.takes || 0} take(s), ` +
      `${t.films || 0} film(s), ${t.prompt_variants || 0} prompt variant(s)`;
    if (!(await askInPanel(
      "Open this project?",
      `${summary}
${rebuilt ? `
This folder has no board.json — nothing has been rendered into it yet — so the \
cut is read from the folder itself: a clip per folder under clips/, with the \
words and references each one holds.
` : ""}
The board on screen will be replaced.`,
      "Open project",
    ))) {
      renderAll();
      return;
    }
    state.board = model.readBoard(JSON.stringify(raw));
    state.board.project_dir = path;
    projectChanged();
    if (!state.board.film_name) state.board.film_name = folderName(path);
    if (!(state.board.segments || []).some((s) => s.id === state.board.selected_id)) {
      state.board.selected_id = (state.board.segments[0] || {}).id || 0;
    }
    const brought = await bringBackFromProject(found, path);
    state.lockBypass = true;
    try {
      commit();
    } finally {
      state.lockBypass = false;
    }
    renderAll();
    for (const [seg, clip] of brought.posters) posterFromClip(seg, clip);
    const here = selected();
    if (brought.said && here && !brought.rejoin) {
      noteAgent(here, brought.lost ? "error" : "ok", brought.said);
      renderDetail();
    }
    await followProjectCanvas();
    if (brought.rejoin && here) rebuildFilm(here, brought.said);
  });
  async function bringBackFromProject(found, path) {
    const out = { said: "", lost: false, rejoin: false, posters: [] };
    const missing = found && found.missing;
    if (!missing || typeof options.callRoute !== "function") return out;
    const back = [];
    const lost = [];
    const segments = state.board.segments || [];
    for (const item of missing.segments || []) {
      const seg = segments.find((s) => s.id === item.id);
      if (!seg) continue;
      const number = segments.indexOf(seg) + 1;
      for (const [field, gone, take, takePath] of [
        ["clip", item.clip_gone, item.clip_take, item.clip_take_path],
        ["source_clip", item.source_gone, item.source_take, item.source_take_path],
      ]) {
        if (!gone) continue;
        let adopted = String(takePath || "");
        if (!adopted && take) {
          try {
            adopted = String((await options.callRoute(TAKE_ADOPT_ROUTE, {
              path, folder: item.folder, file: take,
            })).clip || "");
          } catch (error) {
            console.error("[VIG H3 Cutter] could not bring a take back:", error);
          }
        }
        seg[field] = adopted;
        if (adopted) {
          back.push(`clip ${number} from ${take}`);
        } else {
          lost.push(number);
          if (!seg.clip && !seg.source_clip) seg.status = "queued";
        }
      }
      if (item.poster_gone || !(seg.clip || seg.source_clip)) {
        seg.poster = "";
        const playable = seg.clip || seg.source_clip;
        if (playable) out.posters.push([seg, playable]);
      }
    }
    const everyClip = segments.length > 0 && segments.every((s) => s.clip || s.source_clip);
    if (missing.film_gone) {
      state.board.film = "";
      state.board.film_of = "";
      out.rejoin = everyClip;
    } else if (!state.board.film && everyClip && back.length) {
      out.rejoin = true;
    }
    const parts = [];
    if (back.length) parts.push(`Brought back from the project folder: ${back.join(", ")}.`);
    if (lost.length) {
      parts.push(`Clip ${lost.join(", ")} ${lost.length > 1 ? "have" : "has"} no take in the ` +
        "project folder under the key the board names, so there is nothing to play until it renders.");
    }
    if (missing.film_gone) {
      const why = missing.film_why === "shared"
        ? "The film it named sits in the shared cache and cannot be told from another project's"
        : "The film it named is gone from the cache";
      parts.push(out.rejoin
        ? `${why}, so it is re-joined from the clips.`
        : `${why}, and not every clip is here to re-join it, so there is no film until one is.`);
    }
    out.said = parts.join(" ");
    out.lost = lost.length > 0;
    return out;
  }
  parts.projectPath = el("span", "vig-cutter-projectpath");
  parts.projectPath.dataset.log = "project folder";
  parts.projectPath.addEventListener("click", async (event) => {
    if (!event.target.closest(".vig-cutter-projectname.press")) return;
    const root = (state.board.project_dir || "").trim();
    if (!root || state.projectBusy || typeof options.callRoute !== "function") return;
    try {
      await options.callRoute(REVEAL_ROUTE, { path: root, what: "project" });
    } catch (error) {
      flashOverClip(`The folder could not be shown: ${error.message}`, "error");
    }
  });
  headProject.append(parts.projectNewBtn, parts.projectOpenBtn, parts.projectPath);
  const players = el("div", "vig-cutter-players");
  parts.clipPlayer = playerBox("current clip", "clip", "CLIP");
  parts.filmPlayer = playerBox("whole film", "film", "FILM");
  players.append(parts.clipPlayer.box, parts.filmPlayer.box);
  timelineSection.appendChild(players);
  function iconButton(icon, title, onClick) {
    const button = el("button", "vig-cutter-icon");
    button.appendChild(svg(icon, 13));
    button.title = title;
    button.addEventListener("click", onClick);
    return button;
  }
  parts.loadClip = iconButton(
    ICONS.filmstrip,
    "Load a video file into the selected clip; it renders nothing and plays as is",
    async () => {
      const seg = selected();
      if (!seg) return;
      if (seg.locked) {
        flashOverClip("This clip is locked — unlock it to load a video into it.", "error");
        return;
      }
      const asset = await pick("video");
      if (!asset) return;
      seg.source_clip = asset.source;
      seg.clip_name = asset.label;
      seg.status = "ready";
      seg.error = "";
      commit();
      renderAll();
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.onloadedmetadata = () => {
        if (Number.isFinite(probe.duration) && probe.duration > 0) {
          seg.seconds = model.snapSeconds(probe.duration, model.MAX_LOADED_SECONDS);
          commit();
          renderAll();
        }
        followLoadedShape(seg, asset, probe.videoWidth, probe.videoHeight);
      };
      probe.src = viewUrl(asset.source);
    },
  );
  function runPickButton(shown, options) {
    const button = el("button", "pick", `${shown} ▾`);
    button.title = options.title;
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openRunPopover(button, options);
    });
    return button;
  }
  function cutOf(seg, frames) {
    const remembered = state.cutAt[seg.id];
    if (remembered) return Math.max(1, Math.min(frames, remembered));
    const mark = model.cutMark(state.board.segments, state.board.segments.indexOf(seg));
    return mark ? Math.max(1, Math.min(frames, mark)) : frames;
  }
  function renderRuler() {
    const strip = parts.ruler;
    if (!strip) return;
    const seg = selected();
    const frames = seg ? model.segmentFrames(seg) : 0;
    const source = seg && (seg.source_clip || seg.clip);
    strip.textContent = "";
    strip.style.opacity = source ? "1" : "0.45";
    if (!seg || !frames) {
      parts.rulerNote.textContent = "";
      return;
    }
    const points = model.cutPoints(frames);
    const settled = cutOf(seg, frames);
    const at =
      state.cutDrag && state.cutDrag.segId === seg.id ? state.cutDrag.frame : settled;
    const thumbs = (source && state.stripThumbs[source]) || {};
    let from = 0;
    for (const point of points) {
      const cell = el("div", "cell");
      cell.style.left = `${(from / frames) * 100}%`;
      cell.style.width = `${((point - from) / frames) * 100}%`;
      if (thumbs[point]) cell.style.backgroundImage = `url("${thumbs[point]}")`;
      if ((point - from) / frames > 0.06) {
        cell.appendChild(el("b", "", (point / model.FPS).toFixed(1) + "s"));
      }
      strip.appendChild(cell);
      from = point;
    }
    const index = state.board.segments.indexOf(seg);
    const after = state.board.segments[index + 1];
    const before = state.board.segments[index - 1];
    const carryLive = model.handsOver(state.board.segments, index);
    const leadLive = model.arrivedAt(state.board.segments, index);
    const carry =
      state.carryFrames[seg.id] ||
      (carryLive && after.context_frames) ||
      model.DEFAULT_CONTEXT_RUN;
    const band = Math.min(carry, at);
    const atPercent = (at / frames) * 100;
    const lead = Math.min(
      state.leadFrames[seg.id] ||
        (leadLive && before.tail_frames) ||
        model.DEFAULT_CONTEXT_RUN,
      Math.max(1, frames),
    );
    const ceiling = Math.max(0, frames - lead);
    const parked =
      state.leadAt[seg.id] !== undefined
        ? state.leadAt[seg.id]
        : (leadLive && Number(before.tail_at)) || 0;
    const arrive =
      state.leadDrag && state.leadDrag.segId === seg.id
        ? Math.max(0, Math.min(ceiling, state.leadDrag.frame))
        : Math.max(0, Math.min(ceiling, parked));
    const stripWidth = strip.offsetWidth || strip.clientWidth || 600;
    const dragging = !!(state.leadDrag && state.leadDrag.segId === seg.id);
    const drawBand = ({
      back, own, from, run, live, tagNodes, plate, title, pick, markTitle,
      plateAction, plateTitle, plateDisabled, plateLink, settled,
    }) => {
      const ownPercent = (own / frames) * 100;
      const lit = live ? " live" : " idle";
      const side = back ? " lead" : "";
      const grey = settled ? " settled" : "";
      const bandEl = el("div", `carried${side}${lit}${grey}`);
      bandEl.style.left = `${(from / frames) * 100}%`;
      bandEl.style.width = `${(run / frames) * 100}%`;
      strip.appendChild(bandEl);
      const tagEl = el("div", `bandtag${side}${lit}${grey}`);
      tagEl.append(...tagNodes);
      strip.appendChild(tagEl);
      if (settled) {
        for (const button of tagEl.querySelectorAll("button")) {
          button.disabled = true;
          button.title = settled;
        }
      }
      const room = back
        ? stripWidth - (ownPercent / 100) * stripWidth
        : (ownPercent / 100) * stripWidth;
      const tight = room < 128;
      const place = (node) => {
        if (back) {
          if (tight) node.style.right = "2px";
          else node.style.left = `${ownPercent}%`;
        } else if (tight) {
          node.style.left = "2px";
        } else {
          node.style.right = `${100 - ownPercent}%`;
        }
      };
      place(tagEl);
      const plateEl = plateAction
        ? el("button", `handovertag${side}${lit}${grey} act`, plate)
        : el("div", `handovertag${side}${lit}${grey}`, plate);
      if (plateAction) {
        plateEl.title = plateTitle || "";
        plateEl.disabled = !!plateDisabled || !!settled;
        if (settled) plateEl.title = settled;
        plateEl.addEventListener("pointerdown", (event) => event.stopPropagation());
        plateEl.addEventListener("click", (event) => {
          event.stopPropagation();
          plateAction(plateEl);
        });
      }
      const width = tagEl.offsetWidth || 0;
      plateEl.style.width = `${width}px`;
      place(plateEl);
      strip.appendChild(plateEl);
      if (plateLink) {
        plateEl.classList.add("haslink");
        const pick = tagEl.querySelector("button.pick");
        const tagBox = tagEl.getBoundingClientRect();
        const zoom = tagBox.width && tagEl.offsetWidth ? tagBox.width / tagEl.offsetWidth : 1;
        const pickBox = pick ? pick.getBoundingClientRect() : null;
        const pickLeft = pickBox ? (pickBox.left - tagBox.left) / zoom : 0;
        const pickWide = pickBox ? pickBox.width / zoom : 14;
        const pickEnd = pickLeft + pickWide;
        if (pickLeft < width / 2) plateEl.style.paddingLeft = `${pickEnd}px`;
        else plateEl.style.paddingRight = `${Math.max(0, width - pickLeft)}px`;
        const shift = pickLeft;
        const key = plateLink === "lead" ? "leadSnap" : "cutSnap";
        const snapped = !!state[key];
        const what = plateLink === "lead" ? "arrival" : "cut";
        const link = el("button", `cutlink${lit}${grey}${snapped ? " on" : ""}`);
        link.dataset.log = plateLink === "lead" ? "arrival snap" : "cut snap";
        link.style.width = `${pickWide}px`;
        link.appendChild(svg(snapped ? ICONS.link : ICONS.unlink, 10, 2.2));
        link.title = snapped
          ? `Linked to the grid: while you drag the ${what}, its notches show, and ` +
            `dropped within 4 frames of one it lands on it — sliced straight out of ` +
            `the latent, free and exact. Click to place it on any frame instead.`
          : `Unlinked: no notches, and the ${what} lands exactly where it is dropped. ` +
            "Off a notch the run is encoded from pixels, which costs a VAE round trip. " +
            "Click to link it to the grid.";
        if (!back && tight) link.style.left = `${2 + shift}px`;
        else if (!back) link.style.left = `calc(${ownPercent}% - ${width - shift}px)`;
        else if (tight) link.style.left = `calc(100% - 2px - ${width - shift}px)`;
        else link.style.left = `calc(${ownPercent}% + ${shift}px)`;
        link.addEventListener("pointerdown", (event) => event.stopPropagation());
        link.addEventListener("click", (event) => {
          event.stopPropagation();
          state[key] = !state[key];
          renderRuler();
        });
        strip.appendChild(link);
      }
      const mark = el("div", `handover${side}${lit}`);
      const px = (ownPercent / 100) * stripWidth;
      const boxLeft = Math.max(0, Math.min(Math.max(0, stripWidth - 11), px - 5.5));
      mark.style.left = `${boxLeft}px`;
      const line = el("i");
      line.style.left = `${Math.max(0, Math.min(9, px - boxLeft - 1))}px`;
      mark.appendChild(line);
      mark.title = settled || markTitle;
      if (settled) mark.classList.add("settled");
      mark.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (settled) return;
        state.headParked = true;
        if (parts.clipHead) parts.clipHead.style.display = "none";
        let lastX = event.clientX;
        const move = (moveEvent) => {
          lastX = moveEvent.clientX;
          pick(lastX);
        };
        const up = () => {
          window.removeEventListener("pointermove", move, DRAG_PHASE);
          window.removeEventListener("pointerup", up, DRAG_PHASE);
          pick(lastX, true);
        };
        window.addEventListener("pointermove", move, DRAG_PHASE);
        window.addEventListener("pointerup", up, DRAG_PHASE);
        tryCapture(parts.ruler, event.pointerId);
      });
      strip.appendChild(mark);
      const which = back ? "lead" : "carry";
      const looping = !!(
        state.bandLoop &&
        state.bandLoop.segId === seg.id &&
        state.bandLoop.band === which
      );
      const play = el("button", `bandplay${side}${lit}${grey}${looping ? " on" : ""}`);
      play.appendChild(svg(looping ? ICONS.stop : ICONS.play, 40, 1.5));
      const centre = (ownPercent / 100) * stripWidth;
      play.style.left = back
        ? `${tight ? stripWidth - 2 - width / 2 : centre + width / 2}px`
        : `${tight ? 2 + width / 2 : centre - width / 2}px`;
      play.title = looping ? "Stop" : title;
      play.disabled = !source;
      play.addEventListener("pointerdown", (event) => event.stopPropagation());
      play.addEventListener("click", (event) => {
        event.stopPropagation();
        playBand(seg, from, from + run, which);
      });
      strip.appendChild(play);
    };
    if (at < frames) {
      const beyond = el("div", "beyond");
      beyond.style.left = `${atPercent}%`;
      strip.appendChild(beyond);
    }
    if (arrive > 0) {
      const behind = el("div", "beyond head");
      behind.style.left = "0";
      behind.style.right = `${100 - (arrive / frames) * 100}%`;
      strip.appendChild(behind);
    }
    const cutDragging = !!(state.cutDrag && state.cutDrag.segId === seg.id);
    const gridPoints =
      dragging && state.leadSnap ? model.arrivalPoints(frames)
        : cutDragging && state.cutSnap ? points
          : [];
    const gridMark = dragging ? arrive : at;
    for (const point of gridPoints) {
      if (point >= frames) continue;
      const notch = el("div", "notch");
      notch.style.left = `${(point / frames) * 100}%`;
      if (Math.abs(point - gridMark) <= SNAP_FRAMES) notch.classList.add("near");
      strip.appendChild(notch);
    }
    drawBand({
      back: false,
      own: at,
      from: at - band,
      run: band,
      live: carryLive,
      plate: "continues here",
      plateLink: "cut",
      settled: seg.locked
        ? "This clip is locked — unlock it to move where it hands over."
        : after && after.locked
          ? `Clip ${state.board.segments.indexOf(after) + 1} is locked — it takes this cut, so it cannot move.`
          : "",
      plateAction: continueFromCut,
      plateDisabled: !source,
      plateTitle:
        "From this place → next clip: a new clip is added that picks the film up at " +
        "the marked frame, with the lit band of this clip's frames — its motion and " +
        "the sound under them — pinned at its head. In the film this clip ENDS at the " +
        "mark: the dimmed tail past it is left on the floor and the new clip carries " +
        "on from exactly that frame. The take on disk keeps all of it.",
      pick: pickCut,
      markTitle:
        "Drag: where this clip HANDS OVER to the next one. The film cuts here; the " +
        "frames past it are left on the floor, and the run in front of it is what the " +
        "next clip opens on.",
      title:
        `Play just these ${band} frames (${(band / model.FPS).toFixed(2)} s) — the run this ` +
        "clip hands to the next one, on a loop. Click again to stop.",
      tagNodes: [
        runPickButton(band, {
          title:
            "How much of this clip is handed to the next one. Click to choose 5, 22, 39 " +
            "or 56 frames — longer carries more movement and costs more of the next " +
            "clip's render — or 1 frame, which hands over the still at the mark and " +
            "nothing else: no motion and no sound cross the cut.",
          heading: "hand to the next clip",
          runs: [1, ...model.CONTEXT_RUNS],
          current: carry,
          hint:
            band < carry
              ? `the cut sits at frame ${at}, so only ${band} of the ${carry} are in the clip`
              : "",
          onPick: (run) => {
            state.carryFrames[seg.id] = run;
            const takesStill =
              after &&
              !after.source_clip &&
              model.MODE_FIRST_FRAME.has(after.mode) &&
              !model.carriedRun(after);
            if (run <= 1 && (carryLive || takesStill)) {
              after.context_frames = 1;
              after.context_audio = 0;
              if (!model.MODE_FIRST_FRAME.has(after.mode)
                  && !(after.refs || []).some((r) => r.source)) {
                after.mode = "i2va";
              }
              markStale(after);
              commit();
              renderAll();
              putCutFrame(seg, after, at);
              return;
            }
            if (carryLive && after.context_frames !== run) {
              after.context_frames = run;
              markStale(after);
              commit();
              renderAll();
              return;
            }
            renderRuler();
          },
        }),
        el(
          "span",
          "",
          carryLive
            ? band === 1
              ? " frame → next clip"
              : " frames → next clip"
            : after
              ? " frames — press to hand them over"
              : " frames → a new clip",
        ),
      ],
    });
    drawBand({
      back: true,
      own: arrive,
      from: arrive,
      run: lead,
      live: leadLive,
      plate: "arrives here",
      plateLink: "lead",
      settled: seg.locked
        ? "This clip is locked — unlock it to move where the clip before arrives."
        : before && before.locked
          ? `Clip ${state.board.segments.indexOf(before) + 1} is locked — it is built to arrive here, so this cannot move.`
          : "",
      plateAction: buildPrequel,
      plateTitle:
        "← Previous clip arrives here: the clip before this one is built so that it " +
        "ENDS on this clip's opening frames. The run is pinned at that clip's end and " +
        "trimmed off again, so the two meet without a repeated frame. That clip must be " +
        "rendered AFTER this one — this one is the anchor, and its latent is what the " +
        "run is sliced from.",
      pick: pickArrival,
      markTitle:
        "Drag: where the clip before this one is built to ARRIVE. This clip starts " +
        "there in the film; the frames before it are left on the floor, exactly as " +
        "the frames past the cut are.",
      title:
        `Play just these ${lead} frames (${(lead / model.FPS).toFixed(2)} s) — the frames ` +
        "the clip before this one is built to end on, on a loop. Click again to stop.",
      tagNodes: [
        el("span", "", "prev clip ← frames "),
        runPickButton(lead, {
          title:
            "How many of this clip's frames the clip BEFORE it is built to arrive on. " +
            "Click to choose 5, 22, 39 or 56 — they are pinned at that clip's end, so it " +
            "lands exactly here instead of near here.",
          heading: "prev clip arrives on",
          current: lead,
          hint:
            ceiling < 1
              ? "this clip is shorter than the run, so the whole of it is the arrival"
              : "",
          onPick: (run) => {
            state.leadFrames[seg.id] = run;
            if (leadLive && before.tail_frames !== run) {
              before.tail_frames = run;
              markStale(before);
              commit();
              renderAll();
              return;
            }
            renderRuler();
          },
        }),
      ],
    });
    parts.clipHead = el("div", "playhead");
    parts.clipHead.style.display = "none";
    strip.appendChild(parts.clipHead);
    paintPlayhead(parts.clipHead, parts.clipVideo, frames / model.FPS);
    let fitNote = "";
    if (after && after.context_frames) {
      const fits = model.carriedRun(after);
      if (!fits) {
        fitNote =
          ` — but clip ${state.board.segments.indexOf(seg) + 2} is ` +
          `${(model.segmentFrames(after) / model.FPS).toFixed(2)} s and H3 samples at most ` +
          `${(model.MAX_SEGMENT_FRAMES / model.FPS).toFixed(2)} s, so no run fits: shorten it ` +
          "or it opens on a still";
      } else if (fits < band) {
        fitNote =
          ` — clip ${state.board.segments.indexOf(seg) + 2} has room for ${fits} of them ` +
          `(${(fits / model.FPS).toFixed(2)} s); shorten it to carry the rest`;
      }
    }
    const cutWaits = !!(after && model.madeContextAt(after) !== (Number(after.context_at) || 0));
    const ends = after && after.context_at && at < frames
      ? cutWaits
        ? ` — will end here once clip ${index + 2} is re-rendered for it`
        : ` — in the film this clip ends here, ${((frames - at) / model.FPS).toFixed(2)} s dropped`
      : "";
    const arriveWaits = !!(before && model.madeTailAt(before) !== (Number(before.tail_at) || 0));
    const opens = leadLive && arrive > 0
      ? arriveWaits
        ? ` — will start at ${(arrive / model.FPS).toFixed(2)} s once clip ${index} is re-rendered for it`
        : ` — and starts at ${(arrive / model.FPS).toFixed(2)} s, ` +
          `${(arrive / model.FPS).toFixed(2)} s dropped in front of it`
      : "";
    const carried =
      band <= 1
        ? "one still handed over, no motion or sound"
        : `${(band / model.FPS).toFixed(2)} s of motion and sound carried`;
    parts.rulerNote.textContent = source
      ? `picks up at ${(at / model.FPS).toFixed(2)} s (frame ${at}) of ` +
        `${(frames / model.FPS).toFixed(2)} s — ${carried}${ends}${opens}${fitNote}`
      : "render this clip before continuing from it";
    parts.rulerNote.style.color = fitNote ? "#e08a7d" : "var(--cut-dim)";
    if (source) loadStripThumbs(seg, source, points);
  }
  function filmSeconds() {
    const known = state.filmDurations[filmVersion()];
    if (Number.isFinite(known) && known > 0) return known;
    return model.framesToSeconds(model.joinedFrames(state.board));
  }
  function renderFilmStrip() {
    const strip = parts.filmStrip;
    if (!strip) return;
    const film = state.board.film;
    const seconds = filmSeconds();
    strip.textContent = "";
    strip.style.opacity = film ? "1" : "0.45";
    if (!film || !seconds) {
      parts.filmNote.textContent = film ? "" : "no film yet — run a joining pass";
      return;
    }
    const frames = Math.max(1, Math.round(seconds * model.FPS));
    const points = [];
    for (let i = 1; i <= 12; i += 1) points.push(Math.round((frames * i) / 12));
    const version = `${filmVersion()}@${points.join(",")}`;
    if (!state.filmJoining) loadStripThumbs(null, film, points, version);
    const read = state.stripThumbs[version];
    if (read) state.filmThumbsShown = read;
    const waiting = state.filmJoining || state.stripBusy.has(version);
    const thumbs = read || (waiting && state.filmThumbsShown) || {};
    let from = 0;
    for (const point of points) {
      const cell = el("div", "cell");
      cell.style.left = `${(from / frames) * 100}%`;
      cell.style.width = `${((point - from) / frames) * 100}%`;
      if (thumbs[point]) cell.style.backgroundImage = `url("${thumbs[point]}")`;
      cell.appendChild(el("b", "", `${(point / model.FPS).toFixed(1)}s`));
      strip.appendChild(cell);
      from = point;
    }
    parts.filmHead = el("div", "playhead");
    parts.filmHead.style.display = "none";
    strip.appendChild(parts.filmHead);
    paintPlayhead(parts.filmHead, parts.filmVideo, seconds);
    const inFilm = model.joinedClips(state.board.segments);
    const onBoard = state.board.segments.length;
    parts.filmNote.textContent =
      `${model.formatClock(seconds)} · ${frames} frames · ` +
      (inFilm < onBoard ? `${inFilm} of ${onBoard} clips` : `${onBoard} clips`);
  }
  function paintPlayhead(head, video, seconds, atSeconds) {
    if (!head || !video) return;
    if (state.headParked && head === parts.clipHead) return;
    const total =
      Number.isFinite(seconds) && seconds > 0
        ? seconds
        : Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : 0;
    if (!total) return;
    const at = Number.isFinite(atSeconds) ? atSeconds : video.currentTime;
    head.style.display = "";
    head.style.left = `${Math.max(0, Math.min(100, (at / total) * 100))}%`;
  }
  function followPlayhead(video, getHead, getSeconds, who) {
    let frame = 0;
    let clockTime = -1;
    let clockAt = 0;
    const now = () => (window.performance ? window.performance.now() : Date.now());
    const paint = (at) => paintPlayhead(getHead(), video, getSeconds(), at);
    const settle = () => {
      clockTime = video.currentTime;
      clockAt = now();
      const hold = state.scrubHold;
      if (hold && hold.who === who) {
        if (Math.abs(video.currentTime - hold.at) > 0.5 / model.FPS) return;
        state.scrubHold = null;
      }
      paint();
    };
    const step = () => {
      frame = 0;
      if (!video.isConnected || video.paused || video.ended) return;
      if (video.currentTime !== clockTime) {
        clockTime = video.currentTime;
        clockAt = now();
      }
      const ahead = Math.min(
        ((now() - clockAt) / 1000) * (video.playbackRate || 1),
        1 / model.FPS,
      );
      paint(clockTime + ahead);
      frame = requestAnimationFrame(step);
    };
    const start = () => {
      if (state.scrubHold && state.scrubHold.who === who) state.scrubHold = null;
      if (who === "clip") state.headParked = false;
      if (!frame) frame = requestAnimationFrame(step);
    };
    video.addEventListener("play", start);
    video.addEventListener("playing", start);
    video.addEventListener("pause", settle);
    video.addEventListener("ended", settle);
    video.addEventListener("seeked", settle);
    video.addEventListener("timeupdate", settle);
    return settle;
  }
  function loadStripThumbs(seg, source, points, key) {
    key = key || source;
    if (state.stripThumbs[key] || state.stripBusy.has(key)) return;
    if ((state.stripTries[key] || 0) >= 2) return;
    state.stripBusy.add(key);
    const call = options.callRoute;
    if (typeof call !== "function") {
      readStripInBrowser(key, source, points);
      return;
    }
    call(STRIP_ROUTE, { clip: source, points }).then(
      (data) => {
        if (data && data.gone) {
          state.stripTries[key] = 2;
          state.stripBusy.delete(key);
          return;
        }
        const frames = (data && data.frames) || {};
        const shots = {};
        for (const point of points) {
          if (frames[String(point)]) shots[point] = frames[String(point)];
        }
        if (!Object.keys(shots).length) {
          readStripInBrowser(key, source, points);
          return;
        }
        state.stripThumbs[key] = shots;
        state.stripBusy.delete(key);
        renderRuler();
        renderFilmStrip();
      },
      () => readStripInBrowser(key, source, points),
    );
  }
  function readStripInBrowser(key, source, points) {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.crossOrigin = "anonymous";
    video.src = viewUrl(source);
    const shots = {};
    const canvas = document.createElement("canvas");
    let index = 0;
    let finished = false;
    const done = (failed = false) => {
      if (finished) return;
      finished = true;
      clearTimeout(stall);
      state.stripBusy.delete(key);
      if (Object.keys(shots).length) {
        state.stripThumbs[key] = shots;
      } else {
        if (failed || (Number.isFinite(video.duration) && video.duration > 0)) {
          state.stripTries[key] = (state.stripTries[key] || 0) + 1;
        }
      }
      video.removeAttribute("src");
      renderRuler();
      renderFilmStrip();
    };
    const stall = setTimeout(done, 8000);
    const step = () => {
      if (index >= points.length) return done();
      const point = points[index];
      video.currentTime = Math.max(0, Math.min(video.duration || 0, point / model.FPS - 0.02));
    };
    video.addEventListener("loadeddata", () => {
      canvas.height = 180;
      canvas.width = Math.max(
        24,
        Math.round((180 * (video.videoWidth || 16)) / (video.videoHeight || 9)),
      );
      step();
    });
    video.addEventListener("seeked", () => {
      try {
        const context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        shots[points[index]] = canvas.toDataURL("image/jpeg", 0.82);
      } catch (err) {
        console.error("[VIG H3 Cutter] could not read a strip frame:", err);
      }
      index += 1;
      step();
    });
    video.addEventListener("error", () => done(true));
  }
  function seekTo(video, seconds) {
    const want = Math.max(0, Math.min(video.duration || 0, seconds));
    if (video.seeking) {
      video.__vigPending = want;
      if (!video.__vigSeekBound) {
        video.__vigSeekBound = true;
        video.addEventListener("seeked", () => {
          const next = video.__vigPending;
          video.__vigPending = null;
          if (next !== null && next !== undefined && Math.abs(next - video.currentTime) > 1e-4) {
            video.currentTime = next;
          }
        });
      }
      return;
    }
    video.__vigPending = null;
    video.currentTime = want;
  }
  const SNAP_FRAMES = 4;
  function pickCut(clientX, settle = false) {
    const seg = selected();
    if (!seg) return;
    stopBandLoop();
    const frames = model.segmentFrames(seg);
    const box = parts.ruler.getBoundingClientRect();
    const scale = pxScale(parts.ruler) || 1;
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / scale / (box.width / scale)));
    const wanted = ratio * frames;
    let best = Math.max(1, Math.min(frames, Math.round(wanted)));
    if (state.cutSnap && !seg.source_clip) {
      for (const point of model.cutPoints(frames)) {
        if (Math.abs(point - best) <= SNAP_FRAMES) { best = point; break; }
      }
    }
    state.cutAt[seg.id] = best;
    const live = Math.max(1, Math.min(frames, Math.round(wanted)));
    state.cutDrag = settle ? null : { segId: seg.id, frame: live };
    if (parts.clipVideo && Number.isFinite(parts.clipVideo.duration)) {
      const frame = settle ? best : Math.round(wanted);
      if (!settle && !parts.clipVideo.paused) parts.clipVideo.pause();
      seekTo(parts.clipVideo, frame / model.FPS);
    }
    renderRuler();
  }
  function pickArrival(clientX, settle = false) {
    const seg = selected();
    if (!seg) return;
    stopBandLoop();
    const frames = model.segmentFrames(seg);
    const index = state.board.segments.indexOf(seg);
    const before = state.board.segments[index - 1];
    const live = model.arrivedAt(state.board.segments, index);
    const lead = Math.min(
      state.leadFrames[seg.id] || (live && before.tail_frames) || model.DEFAULT_CONTEXT_RUN,
      Math.max(1, frames),
    );
    const ceiling = Math.max(0, frames - lead);
    const box = parts.ruler.getBoundingClientRect();
    const scale = pxScale(parts.ruler) || 1;
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / scale / (box.width / scale)));
    const live_frame = Math.max(0, Math.min(ceiling, Math.round(ratio * frames)));
    let best = live_frame;
    if (state.leadSnap && !seg.source_clip) {
      for (const point of model.arrivalPoints(frames)) {
        if (point <= ceiling && Math.abs(point - best) <= SNAP_FRAMES) { best = point; break; }
      }
    }
    state.leadAt[seg.id] = best;
    state.leadDrag = settle ? null : { segId: seg.id, frame: live_frame };
    if (parts.clipVideo && Number.isFinite(parts.clipVideo.duration)) {
      const frame = settle ? best : live_frame;
      if (!settle && !parts.clipVideo.paused) parts.clipVideo.pause();
      seekTo(parts.clipVideo, frame / model.FPS);
    }
    if (settle && live && (Number(before.tail_at) || 0) !== best) {
      if (model.madeAt(before.made_tail_at) === null && (before.clip || before.source_clip)) {
        before.made_tail_at = Math.max(0, Number(before.tail_at) || 0);
      }
      before.tail_at = best;
      markStale(before);
      commit();
      renderAll();
      return;
    }
    renderRuler();
  }
  function playBand(seg, from, to, which = "carry") {
    const video = parts.clipVideo;
    if (!video || !Number.isFinite(video.duration)) return;
    if (state.bandLoop && state.bandLoop.segId === seg.id && state.bandLoop.band === which) {
      stopBandLoop();
      renderRuler();
      return;
    }
    stopBandLoop();
    const run = (to - from) / model.FPS;
    let start = Math.max(0, from / model.FPS);
    let end = Math.min(video.duration, to / model.FPS);
    if (end - start < run - 1 / model.FPS) {
      end = Math.min(video.duration, end);
      start = Math.max(0, end - run);
    }
    if (end - start < 1 / model.FPS) return;
    const step = () => {
      const loop = state.bandLoop;
      if (!loop) return;
      if (video.currentTime >= end || video.currentTime < start - 0.02) {
        video.currentTime = start;
      }
      loop.frame = requestAnimationFrame(step);
    };
    const fence = () => {
      if (state.bandLoop && video.currentTime >= end) video.currentTime = start;
    };
    video.addEventListener("timeupdate", fence);
    state.bandLoop = { segId: seg.id, band: which, video, frame: 0, fence };
    video.currentTime = start;
    const started = video.play();
    if (started && typeof started.catch === "function") started.catch(() => {});
    state.bandLoop.frame = requestAnimationFrame(step);
    renderRuler();
  }
  function stopBandLoop() {
    const loop = state.bandLoop;
    state.bandLoop = null;
    if (!loop) return;
    cancelAnimationFrame(loop.frame);
    if (loop.video) {
      if (loop.fence) loop.video.removeEventListener("timeupdate", loop.fence);
      if (!loop.video.paused) loop.video.pause();
    }
  }
  function scrubPlayer(video, strip, head, clientX, total, who) {
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;
    const box = strip.getBoundingClientRect();
    const scale = pxScale(strip) || 1;
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / scale / (box.width / scale)));
    if (!video.paused) video.pause();
    const frame = Math.round((ratio * video.duration) * model.FPS);
    const at = Math.max(0, Math.min(video.duration, frame / model.FPS));
    if (who) state.scrubHold = { who, at };
    video.currentTime = at;
    paintPlayhead(head, video, total, at);
  }
  function scrubClip(clientX) {
    const seg = selected();
    const video = parts.clipVideo;
    if (!seg || !video || !Number.isFinite(video.duration)) return;
    const frames = model.segmentFrames(seg);
    if (!frames) return;
    state.headParked = false;
    if (state.bandLoop) {
      stopBandLoop();
      renderRuler();
    }
    const box = parts.ruler.getBoundingClientRect();
    const scale = pxScale(parts.ruler) || 1;
    const ratio = Math.max(0, Math.min(1, (clientX - box.left) / scale / (box.width / scale)));
    const frame = Math.max(0, Math.min(frames, Math.round(ratio * frames)));
    if (!video.paused) video.pause();
    const at = frame / model.FPS;
    state.scrubHold = { who: "clip", at };
    seekTo(video, at);
    paintPlayhead(parts.clipHead, video, frames / model.FPS, at);
  }
  async function adoptLoggedPrompt(seg, position) {
    const root = (state.board.project_dir || "").trim();
    if (!root || !seg || String(seg.prompt || "").trim()) return;
    const data = await readProject(root);
    if (!data || !data.ok || !Array.isArray(data.clips)) return;
    const prefix = `${String(position).padStart(2, "0")}_`;
    const entry = data.clips.find((clip) => String(clip.folder || "").startsWith(prefix));
    const logged = entry && entry.latest_prompt;
    if (!logged || !String(logged.prompt || "").trim()) return;
    if (logged.mode && logged.mode !== seg.mode) return;
    seg.prompt = logged.prompt;
    if (!String(seg.script || "").trim() && String(logged.script || "").trim()) {
      seg.script = logged.script;
    }
    if (seg.status === "ready") seg.status = "stale";
    noteAgent(
      seg,
      "ok",
      `prompt brought back from the project folder (${logged.file || "last take"}) — ` +
        "the last one this clip rendered with. Edit or Rebuild it as usual.",
    );
    commit();
    renderAll();
  }
  function buildPrequel(anchor) {
    const seg = selected();
    if (!seg) return;
    const list = state.board.segments;
    const before = list[list.indexOf(seg) - 1];
    if (!anchor) return applyPrequel(seg, undefined);
    openModePopover(anchor, {
      heading: before ? "the clip before is" : "add a clip that is",
      modes: model.MODE_KEYS,
      current: before ? before.mode : undefined,
      carried: !!(before && model.carriedTail(before)),
      onPick: (mode) => applyPrequel(seg, mode),
    });
  }
  async function applyPrequel(seg, mode) {
    if (!seg) return;
    const segments = state.board.segments;
    const index = segments.indexOf(seg);
    if (index < 0) return;
    if (seg.source_clip) {
      noteAgent(seg, "error",
        "This clip is loaded footage — it has frames but no latent of its own to slice a " +
        "run from. Its prequel can still be built from the file, but the anchor has to be " +
        "the clip the run comes from, and that is this one.");
      renderDetail();
      return;
    }
    if (index === 0) {
      state.board.segments = model.addSegmentBefore(segments, 0, seg.seconds);
      syncClipFolders();
    }
    const list = state.board.segments;
    const at = list.indexOf(seg);
    const before = list[at - 1];
    if (!before) return;
    if (before.source_clip) {
      noteAgent(seg, "error",
        "The clip before this one is loaded footage — a file is what it is, and nothing " +
        "is generated for it.");
      renderDetail();
      return;
    }
    if (mode) before.mode = mode;
    const run = state.leadFrames[seg.id] || model.DEFAULT_CONTEXT_RUN;
    before.tail_frames = run;
    before.tail_audio = model.DEFAULT_CONTEXT_AUDIO;
    const frames = model.segmentFrames(seg);
    before.tail_at = Math.max(
      0,
      Math.min(Math.max(0, frames - run), state.leadAt[seg.id] || 0),
    );
    if (!before.style) before.style = seg.style;
    before.camera = seg.camera;
    before.camera_amplitude = seg.camera_amplitude;
    before.camera_speed = seg.camera_speed;
    before.audio = seg.audio;
    before.music = seg.music;
    before.prompt_lang = seg.prompt_lang || "EN";
    markStale(before);
    const said = [
      `clip ${at} is built to arrive at this one with ${run} frames of motion` +
        (before.tail_at
          ? ` — at ${(before.tail_at / model.FPS).toFixed(2)} s, so this clip STARTS there ` +
            `in the film and the ${(before.tail_at / model.FPS).toFixed(2)} s in front of it ` +
            "are left on the floor"
          : ""),
    ];
    const owns = (seg.refs || []).some(
      (r) => r.kind === "image" && r.source && String(r.uid || "").startsWith("first"),
    );
    if (model.MODE_FIRST_FRAME.has(seg.mode) && !owns) {
      const was = seg.mode;
      seg.mode = model.MODE_WITHOUT_OPENING[was] || "t2va";
      markStale(seg);
      said.push(
        `this clip went ${was} → ${seg.mode}: it cannot open on the clip it is the ` +
        "anchor for, or the two would each be waiting for the other",
      );
    }
    said.push(
      `render THIS clip first — clip ${at} slices its run out of this one's latent`,
    );
    state.board.selected_id = before.id;
    commit();
    renderAll();
    noteAgent(before, "ok", said.join("; ") + ".");
    renderDetail();
  }
  function continueFromCut(anchor) {
    const seg = selected();
    if (!seg) return;
    const list = state.board.segments;
    const next = list[list.indexOf(seg) + 1];
    const still = (state.carryFrames[seg.id] || model.DEFAULT_CONTEXT_RUN) <= 1;
    const modes = still ? ["i2va", "fl2va"] : model.MODE_KEYS;
    if (!anchor) return applyContinue(seg, undefined);
    openModePopover(anchor, {
      heading: next ? "the next clip is" : "add a clip that is",
      modes,
      current: next ? next.mode : undefined,
      carried: !!(next && model.carriedRun(next)),
      onPick: (mode) => applyContinue(seg, mode),
    });
  }
  async function applyContinue(seg, mode) {
    if (!seg) return;
    const frames = model.segmentFrames(seg);
    const at = cutOf(seg, frames);
    const index = state.board.segments.indexOf(seg);
    if (index === state.board.segments.length - 1) {
      state.board.segments = model.addSegment(state.board.segments);
    }
    const next = state.board.segments[index + 1];
    if (!next) return;
    if (mode) next.mode = mode;
    const still = (state.carryFrames[seg.id] || model.DEFAULT_CONTEXT_RUN) <= 1;
    if (still && !model.MODE_FIRST_FRAME.has(next.mode)
        && !(next.refs || []).some((r) => r.source)) {
      next.mode = "i2va";
    }
    const run = state.carryFrames[seg.id] || model.DEFAULT_CONTEXT_RUN;
    next.context_frames = still ? 1 : Math.min(run, at);
    next.context_audio = still ? 0 : model.DEFAULT_CONTEXT_AUDIO;
    if (!next.style) next.style = seg.style;
    next.camera = seg.camera;
    next.camera_amplitude = seg.camera_amplitude;
    next.camera_speed = seg.camera_speed;
    next.audio = seg.audio;
    next.music = seg.music;
    next.prompt_lang = seg.prompt_lang || "EN";
    if (model.madeAt(next.made_context_at) === null && (next.clip || next.source_clip)) {
      next.made_context_at = model.takesFromFront(next) ? Math.max(0, Number(next.context_at) || 0) : 0;
    }
    next.context_at = at >= frames ? 0 : at;
    if (next.status === "ready") next.status = "stale";
    state.board.selected_id = next.id;
    commit();
    renderAll();
    await adoptLoggedPrompt(next, index + 2);
    if (still) await putCutFrame(seg, next, at);
  }
  async function putCutFrame(seg, next, at) {
    const playable = seg.source_clip || seg.clip;
    if (!playable || typeof options.callRoute !== "function") return;
    state.frameBusy = true;
    renderPlayers();
    try {
      const data = await options.callRoute("/vig/h3/cutter/frame", {
        clip: playable,
        time: at / model.FPS,
      });
      if (data && data.source) {
        next.refs = next.refs.filter((r) => !(r.uid || "").startsWith("first"));
        next.refs.unshift({
          uid: `first-${Date.now().toString(36)}`,
          kind: "image",
          label: `${seg.name || "clip"} · ${(at / model.FPS).toFixed(2)}s`,
          source: data.source,
          tag: "",
          frame: "",
        });
        commit();
      }
    } catch (err) {
      console.error("[VIG H3 Cutter] could not take the cut frame:", err);
    } finally {
      state.frameBusy = false;
      renderAll();
    }
  }
  async function takeFrameToLibrary(fromFilm = false) {
    const seg = selected();
    const playable = fromFilm
      ? String(state.board.film || "")
      : seg && (seg.source_clip || seg.clip);
    if (!playable || state.frameBusy || typeof options.callRoute !== "function") return;
    const video = fromFilm ? parts.filmVideo : parts.clipVideo;
    const player = fromFilm ? parts.filmPlayer : parts.clipPlayer;
    const time = video && Number.isFinite(video.currentTime) ? video.currentTime : 0;
    state.frameBusy = true;
    renderPlayers();
    try {
      const data = await options.callRoute("/vig/h3/cutter/frame", {
        clip: playable,
        time,
      });
      if (!data.source) return;
      const from = fromFilm ? state.board.film_name || "film" : seg.name || "clip";
      const entry = adoptIntoPool(
        { source: data.source, label: `${from} · ${data.label || "frame"}` },
        "library",
      );
      commit();
      renderAll();
      flashOver(player, entry
        ? `Frame at ${time.toFixed(2)} s sent to the reference gallery as @${entry.tag}.`
        : `The reference gallery is full (${model.MAX_LIBRARY_REFS}) — remove one to take this frame.`,
        entry ? "ok" : "error");
    } catch (error) {
      console.error("[VIG H3 Cutter] frame extraction failed:", error);
      flashOver(player, `The frame could not be taken: ${error.message}`, "error");
    } finally {
      state.frameBusy = false;
      renderPlayers();
    }
  }
  function sayRepeatedPresses(report) {
    const repeated = /WARNING: clip (\d+): this press would repeat take (\S+) exactly/g;
    const segments = state.board.segments || [];
    let match;
    let said = false;
    while ((match = repeated.exec(String(report || "")))) {
      const seg = segments[Number(match[1]) - 1];
      if (!seg) continue;
      const sentence =
        `Nothing was rendered: the video seed is fixed (the padlock beside it) and ` +
        `nothing else changed, so this press could only repeat take ${match[2]} frame ` +
        "for frame. Switch the seed to the dice or +1, or change the steps, the prompt " +
        "or the style, and press again.";
      noteAgent(seg, "error", sentence);
      if (seg === selected()) {
        flashOverClip("Nothing rendered — the seed is fixed and nothing changed", "error");
        said = true;
      }
    }
    if (said) renderDetail();
  }
  function flashOverClip(text, tone = "ok") {
    flashOver(parts.clipPlayer, text, tone);
  }
  function flashOver(player, text, tone = "ok") {
    const mat = player && player.mat;
    if (!mat) return;
    for (const old of mat.querySelectorAll(".vig-cutter-flash")) old.remove();
    const flash = el("div", `vig-cutter-flash ${tone === "error" ? "bad" : ""}`, text);
    mat.appendChild(flash);
    setTimeout(() => flash.classList.add("gone"), 2600);
    setTimeout(() => flash.remove(), 3100);
  }
  parts.frameLib = iconButton(
    ICONS.photo,
    "Take this frame into the reference gallery: pause the player on the frame " +
      "you want; it joins the project references with an @tag.",
    () => takeFrameToLibrary(),
  );
  parts.frameLib.dataset.log = "frame to references";
  parts.clipTakes = iconButton(ICONS.photos, "", () => {
    const seg = selected();
    if (seg) openTakes(seg, state.board.segments.indexOf(seg));
  });
  parts.clipTakes.dataset.log = "clip takes gallery";
  parts.clipFolder = iconButton(ICONS.folder, "", async () => {
    const seg = selected();
    const root = (state.board.project_dir || "").trim();
    if (!seg || !root || typeof options.callRoute !== "function") return;
    try {
      const answer = await options.callRoute(REVEAL_ROUTE, {
        path: root,
        index: state.board.segments.indexOf(seg),
        id: seg.id,
        name: seg.name || "",
      });
      if (!answer.clip_folder) {
        flashOverClip("This clip has no takes folder yet — opened the project folder instead.");
      }
    } catch (error) {
      flashOverClip(`The folder could not be opened: ${error.message}`, "error");
    }
  });
  parts.clipFolder.dataset.log = "clip takes folder";
  parts.generateClip = iconButton(ICONS.play, "", () => {
    const seg = selected();
    if (!seg) return;
    renderThisClip(seg, state.board.segments.indexOf(seg), "render");
  });
  parts.generateClip.dataset.log = "generate this clip";
  parts.clipPlayer.buttons.append(
    parts.generateClip,
    parts.clipTakes,
    parts.clipFolder,
    parts.loadClip,
    parts.frameLib,
  );
  parts.filmGallery = iconButton(ICONS.photos, "", () => openFilms());
  parts.filmGallery.dataset.log = "film gallery";
  parts.filmFolder = iconButton(ICONS.folder, "", async () => {
    const root = (state.board.project_dir || "").trim();
    if (!root || typeof options.callRoute !== "function") return;
    try {
      const answer = await options.callRoute(REVEAL_ROUTE, { path: root, what: "film" });
      if (!answer.clip_folder) {
        flashOver(parts.filmPlayer, "This project has no films yet — opened the project folder instead.");
      }
    } catch (error) {
      flashOver(parts.filmPlayer, `The folder could not be opened: ${error.message}`, "error");
    }
  });
  parts.filmFolder.dataset.log = "film folder";
  parts.filmFrame = iconButton(
    ICONS.photo,
    "Take this frame of the film into the reference gallery: pause the film on " +
      "the frame you want; it joins the project references with an @tag.",
    () => takeFrameToLibrary(true),
  );
  parts.filmFrame.dataset.log = "film frame to references";
  parts.generateFilm = iconButton(ICONS.playall, "", () => renderTheRest());
  parts.generateFilm.dataset.log = "render the rest of the film";
  parts.filmPlayer.buttons.append(
    parts.generateFilm, parts.filmGallery, parts.filmFolder, parts.filmFrame,
  );
  async function openFilms() {
    if (!(state.board.project_dir || "").trim()
        && !(await offerProject("Films are kept in a project folder, and this cut has none."))) {
      return;
    }
    const root = (state.board.project_dir || "").trim();
    if (!root) return;
    const film = String(state.board.film || "");
    const stem = film.split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
    const segments = state.board.segments || [];
    const spans = model.filmSpans(segments);
    const clips = segments.map((s, i) => {
      const frames = Math.max(0, spans[i].end - spans[i].start);
      return { index: i + 1, name: s.name || "", frames,
        seconds: Math.round((frames / model.FPS) * 1000) / 1000, prompt: s.prompt || "" };
    });
    const frames = clips.reduce((sum, clip) => sum + clip.frames, 0);
    openFilmsGallery({
      root,
      title: `Film: ${state.board.film_name || "Untitled film"} —`,
      current: stem ? {
        stem,
        record: film && filmIsCurrent()
          ? { count: clips.length, frames, seconds: Math.round((frames / model.FPS) * 1000) / 1000, clips }
          : null,
      } : null,
      onClosed: () => {
        forgetFilmCount();
        renderProjectTotals();
      },
    });
  }
  parts.ruler = el("div", "vig-cutter-strip");
  parts.ruler.style.cursor = "ew-resize";
  parts.rulerNote = el("span", "vig-cutter-mono");
  parts.rulerNote.style.cssText =
    "font-size:10px;color:var(--cut-dim);flex:1 1 0;min-width:0;overflow:hidden;" +
    "text-overflow:ellipsis;white-space:nowrap";
  const readingRow = el("div", "vig-cutter-inline");
  readingRow.style.cssText = "gap:10px;align-items:center;margin-top:5px";
  readingRow.append(parts.rulerNote);
  parts.filmStrip = el("div", "vig-cutter-strip");
  parts.filmStrip.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const total = filmSeconds();
    const move = (moveEvent) =>
      scrubPlayer(parts.filmVideo, parts.filmStrip, parts.filmHead, moveEvent.clientX, total, "film");
    const up = () => {
      window.removeEventListener("pointermove", move, DRAG_PHASE);
      window.removeEventListener("pointerup", up, DRAG_PHASE);
    };
    window.addEventListener("pointermove", move, DRAG_PHASE);
    window.addEventListener("pointerup", up, DRAG_PHASE);
    tryCapture(parts.filmStrip, event.pointerId);
    scrubPlayer(parts.filmVideo, parts.filmStrip, parts.filmHead, event.clientX, total, "film");
  });
  parts.filmStale = el("div", "vig-cutter-filmstale");
  parts.filmPlayer.mat.appendChild(parts.filmStale);
  parts.filmNote = el("span", "vig-cutter-mono");
  parts.filmNote.style.cssText =
    "font-size:10px;color:var(--cut-dim);display:block;margin-top:5px;overflow:hidden;" +
    "text-overflow:ellipsis;white-space:nowrap";
  parts.filmPlayer.box.append(parts.filmStrip, parts.filmNote);
  parts.runBar = el("div", "vig-cutter-runbar");
  parts.runBarFill = el("div", "fill");
  parts.runBarText = el("span", "text");
  parts.runBar.append(parts.runBarFill, parts.runBarText);
  parts.runBar.style.display = "none";
  const rulerWrap = el("div", "vig-cutter-runwrap");
  rulerWrap.append(parts.runBar, parts.ruler);
  parts.clipPlayer.box.append(rulerWrap, readingRow);
  parts.ruler.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const move = (moveEvent) => scrubClip(moveEvent.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move, DRAG_PHASE);
      window.removeEventListener("pointerup", up, DRAG_PHASE);
    };
    window.addEventListener("pointermove", move, DRAG_PHASE);
    window.addEventListener("pointerup", up, DRAG_PHASE);
    tryCapture(parts.ruler, event.pointerId);
    scrubClip(event.clientX);
  });
  const grab = el("div", "vig-cutter-corner");
  grab.title = "Drag to make both players taller or shorter";
  grab.dataset.log = "resize players";
  const grip = svg('<path d="M21 13L13 21M21 18L18 21"></path>', 12, 2);
  grab.appendChild(grip);
  grab.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const startH = state.previewH;
    const scale = pxScale(parts.clipPlayer.mat);
    const move = (moveEvent) => {
      const cap = maxPreviewHeight();
      state.previewH = Math.min(
        cap,
        Math.max(Math.min(120, cap), Math.round(startH + (moveEvent.clientY - startY) / scale)),
      );
      applyPreviewHeight();
    };
    const up = () => {
      window.removeEventListener("pointermove", move, DRAG_PHASE);
      window.removeEventListener("pointerup", up, DRAG_PHASE);
    };
    window.addEventListener("pointermove", move, DRAG_PHASE);
    window.addEventListener("pointerup", up, DRAG_PHASE);
  });
  parts.clipPlayer.mat.appendChild(grab);
  if (typeof ResizeObserver === "function") {
    new ResizeObserver(() => applyPreviewHeight()).observe(players);
  }
  const timelineHead = el("div", "vig-cutter-foot");
  const timelineLeft = el("div", "vig-cutter-inline");
  timelineLeft.style.gap = "14px";
  const timelineTitle = el("span", null, "Timeline");
  timelineTitle.style.cssText =
    "font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;" +
    "color:var(--cut-bright);white-space:nowrap";
  parts.undo = el("button", "vig-cutter-ghost", "↶ undo");
  parts.undo.style.cssText = "font-size:10px;padding:3px 9px;white-space:nowrap";
  parts.undo.addEventListener("click", () => undoLast());
  timelineLeft.append(timelineTitle, parts.undo);
  parts.pullFilm = el("button", "vig-cutter-ghost", "⚑ Pull storyboard");
  parts.pullFilm.dataset.log = "pull storyboard";
  parts.pullFilm.style.cssText = "font-size:10px;padding:3px 9px;white-space:nowrap";
  parts.pullFilm.title =
    "Plan the whole film held by the wired Film Director and lay it out here, " +
    "now instead of at render time. Applied once: pulling the same film again " +
    "leaves the timeline alone, exactly as a second Run would.";
  parts.pullFilm.style.display = "none";
  parts.pullFilm.addEventListener("click", () => pullStoryboard());
  parts.pullNote = el("span", "vig-cutter-mono");
  parts.pullNote.style.cssText =
    "font-size:10px;color:var(--cut-faint);min-width:0;text-align:right;flex:1";
  const timelineRight = el("div", "vig-cutter-inline");
  timelineRight.style.cssText = "gap:10px;min-width:0;flex:1;justify-content:flex-end";
  timelineRight.append(parts.pullNote, parts.pullFilm);
  timelineHead.append(timelineLeft, timelineRight);
  timelineSection.appendChild(timelineHead);
  parts.filmJob = jobBar();
  parts.filmJob.box.style.display = "none";
  timelineSection.appendChild(parts.filmJob.box);
  parts.scroll = el("div", "vig-cutter-scroll");
  parts.scrollw = el("div", "vig-cutter-scrollw");
  parts.scroll.appendChild(parts.scrollw);
  parts.track = el("div", "vig-cutter-vtrack");
  veilPainters.push(() => {
    parts.track.classList.toggle("veiled", !!state.veil.film);
    const mine = state.veil.clip ? String(state.board.selected_id) : null;
    for (const block of parts.track.querySelectorAll(".vig-cutter-vblock")) {
      block.classList.toggle("veiled", mine !== null && block.dataset.segId === mine);
    }
  });
  parts.scrollw.appendChild(parts.track);
  const audioLabelRow = el("div", "vig-cutter-alabelrow");
  parts.atrackLabel = el("span");
  parts.atrackLabel.style.cssText = "font-size:10px;color:var(--cut-accent-lit);white-space:nowrap";
  parts.removeTrack = el("button", "vig-cutter-ghost");
  parts.removeTrack.style.cssText = "font-size:10px;padding:2px 7px;display:flex;align-items:center;gap:5px";
  parts.removeTrack.append(svg(ICONS.trash, 11, 2.2), el("span", "", "remove track"));
  parts.removeTrack.title = "Remove the whole audio track";
  parts.removeTrack.addEventListener("click", () => {
    state.board.audio_clips = [];
    commit();
    renderAudioTrack();
  });
  audioLabelRow.append(parts.atrackLabel, parts.removeTrack);
  parts.audioRow = audioLabelRow;
  parts.scrollw.appendChild(audioLabelRow);
  parts.atrack = el("div", "vig-cutter-atrack2");
  parts.scrollw.appendChild(parts.atrack);
  timelineSection.appendChild(parts.scroll);
  function jobBar() {
    const box = el("div", "vig-cutter-jobbar");
    const track = el("div", "vig-cutter-jobtrack");
    const fill = el("i");
    track.appendChild(fill);
    const line = el("div", "vig-cutter-jobline");
    const text = el("span", "vig-cutter-mono");
    text.style.cssText = "font-size:10px;min-width:0;flex:1";
    const cancel = el("button", "vig-cutter-flat", "✕ stop waiting");
    cancel.style.cssText = "font-size:10px;color:var(--cut-dim);white-space:nowrap";
    cancel.title =
      "Stop this job. The writer is told to stop and its model is put down; the " +
      "call is discarded and the prompt on the clip is left exactly as it is.";
    cancel.addEventListener("click", stopAgentJob);
    line.append(text, cancel);
    const sub = el("div", "vig-cutter-mono");
    sub.style.cssText = "font-size:9px;color:var(--cut-faint);min-width:0;white-space:normal";
    box.append(track, line, sub);
    return { box, track, fill, text, cancel, sub };
  }
  parts.detail = el("div", "vig-cutter-detail");
  segmentSection.appendChild(parts.detail);
  body.appendChild(el("div", "vig-cutter-rule"));
  const foot = el("div", "vig-cutter-foot");
  parts.counts = el("span", "vig-cutter-mono");
  parts.bar = el("div", "vig-cutter-bar");
  parts.barFill = el("i");
  parts.bar.appendChild(parts.barFill);
  foot.append(parts.counts, parts.bar);
  body.appendChild(foot);
  parts.runReportBox = el("div");
  parts.runReportBox.style.cssText =
    "display:none;flex-direction:column;gap:5px;border:1px solid var(--cut-seam);" +
    "border-radius:8px;background:var(--cut-menu);padding:8px 12px";
  parts.runReportHead = el("button", "vig-cutter-flat");
  parts.runReportHead.style.cssText =
    "display:flex;align-items:center;gap:8px;font-size:10px;letter-spacing:.08em;" +
    "text-transform:uppercase;color:var(--cut-accent-lit)";
  parts.runReportBody = el("div", "vig-cutter-mono");
  parts.runReportBody.style.cssText =
    "display:none;white-space:pre-wrap;font-size:10px;line-height:1.5;" +
    "max-height:180px;overflow-y:auto;color:var(--cut-text)";
  parts.runReportHead.addEventListener("click", () => {
    const open = parts.runReportBody.style.display !== "none";
    parts.runReportBody.style.display = open ? "none" : "";
  });
  parts.runReportBox.append(parts.runReportHead, parts.runReportBody);
  body.appendChild(parts.runReportBox);
  function renderRunReport() {
    const text = (state.runReport || "").trim();
    if (!text) {
      parts.runReportBox.style.display = "none";
      return;
    }
    const warnings = text.split("\n").filter((l) => l.trim().startsWith("WARNING")).length;
    const notes = text.split("\n").filter((l) => l.trim().startsWith("NOTE")).length;
    parts.runReportBox.style.display = "flex";
    parts.runReportHead.textContent = "";
    parts.runReportHead.append(
      el(
        "span",
        "",
        `last run report · ${warnings ? `${warnings} warning(s)` : "clean"}` +
          (notes ? ` · ${notes} note(s)` : ""),
      ),
      svg(ICONS.chevron, 11),
    );
    parts.runReportHead.style.color = warnings ? "#e08a7d" : "var(--cut-accent-lit)";
    parts.runReportBody.textContent = text;
    if (warnings) parts.runReportBody.style.display = "";
  }
  let commitTimer = 0;
  const UNDO_DEPTH = 40;
  const undoStack = [];
  let boardWas = "";
  const boardNowText = () => {
    try {
      return JSON.stringify(state.board);
    } catch (err) {
      return "";
    }
  };
  function forgetHistory() {
    undoStack.length = 0;
    boardWas = boardNowText();
    paintUndo();
  }
  function undoNote() {
    const back = undoStack[undoStack.length - 1];
    if (!back) {
      return "Nothing to take back yet. Every change to the timeline becomes a " +
        "step here — a deleted clip, a moved cut, a retyped length.";
    }
    let then = -1;
    try {
      then = (JSON.parse(back).segments || []).length;
    } catch (err) {   }
    const now = (state.board.segments || []).length;
    const what = then > now
      ? "the clip that was deleted"
      : then < now
        ? "the clip that was added"
        : "the last change to the timeline";
    return `Take back ${what}. ${undoStack.length} step` +
      `${undoStack.length === 1 ? "" : "s"} to go back through.`;
  }
  function paintUndo() {
    if (!parts.undo) return;
    parts.undo.disabled = !undoStack.length;
    parts.undo.style.opacity = undoStack.length ? "" : "0.4";
    parts.undo.title = undoNote();
  }
  function undoLast() {
    flushCommit();
    const back = undoStack.pop();
    if (back === undefined) return;
    let was = null;
    try {
      was = JSON.parse(back);
    } catch (err) {
      paintUndo();
      return;
    }
    for (const key of Object.keys(state.board)) delete state.board[key];
    Object.assign(state.board, was);
    boardWas = back;
    if (typeof options.onChange === "function") options.onChange(state.board);
    renderAll();
  }
  const LOCK_FREE = new Set(["locked", "name", "status", "poster"]);
  function holdLockedClips() {
    if (state.lockBypass || !boardWas) return [];
    let was;
    try {
      was = JSON.parse(boardWas);
    } catch (err) {
      return [];
    }
    for (const old of (was && was.segments) || []) model.settleCarriedMode(old);
    const before = new Map(((was && was.segments) || []).map((s) => [s.id, s]));
    const held = [];
    (state.board.segments || []).forEach((seg, index) => {
      const old = before.get(seg.id);
      if (!seg.locked || !old || !old.locked) return;
      let moved = false;
      for (const key of new Set([...Object.keys(seg), ...Object.keys(old)])) {
        if (LOCK_FREE.has(key)) continue;
        if (JSON.stringify(seg[key]) === JSON.stringify(old[key])) continue;
        moved = true;
        if (key in old) seg[key] = JSON.parse(JSON.stringify(old[key]));
        else delete seg[key];
      }
      if (moved) held.push(index + 1);
    });
    return held;
  }
  function commit() {
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = 0;
    }
    model.normalise(state.board);
    const held = holdLockedClips();
    if (held.length) {
      flashOverClip(
        `Clip ${held.join(", ")} is locked — nothing in it was changed. Unlock it first.`,
        "error",
      );
      setTimeout(() => renderAll(), 0);
    }
    const now = boardNowText();
    if (now && now !== boardWas) {
      undoStack.push(boardWas);
      if (undoStack.length > UNDO_DEPTH) undoStack.shift();
      boardWas = now;
      paintUndo();
    }
    if (typeof options.onChange === "function") options.onChange(state.board);
    if (typeof parts.syncProcessCaption === "function") parts.syncProcessCaption();
  }
  function commitSoon() {
    if (commitTimer) clearTimeout(commitTimer);
    commitTimer = setTimeout(commit, 250);
  }
  function flushCommit() {
    if (commitTimer) commit();
  }
  function request(extra) {
    if (typeof options.onRun !== "function") return;
    const root = (state.board.project_dir || "").trim();
    if (root && state.projectMissing === root) {
      const here = selected();
      if (here) {
        noteAgent(here, "error", missingFolderSentence(root));
        renderDetail();
      }
      return;
    }
    flushCommit();
    options.onRun(extra || {});
  }
  function canvasForRatio(ratio, budgetWidth, budgetHeight) {
    const snap = (v) => Math.max(32, Math.round(v / 32) * 32);
    const budget = Math.max(1, budgetWidth * budgetHeight);
    const height = Math.sqrt(budget / ratio);
    return { width: snap(height * ratio), height: snap(height) };
  }
  function canvas() {
    const wired = typeof options.getCanvas === "function" ? options.getCanvas() : null;
    const width = Number(wired && wired.width) || 832;
    const height = Number(wired && wired.height) || 480;
    if (state.board.aspect_from_image) {
      const measured = measuredImageRatio();
      if (measured) {
        const budgetW = Number(options.getWidget?.("width")) || width;
        const budgetH = Number(options.getWidget?.("height")) || height;
        const derived = canvasForRatio(measured, budgetW, budgetH);
        return {
          width: derived.width,
          height: derived.height,
          ratio: derived.width / derived.height,
          source: "image",
        };
      }
    }
    return {
      width,
      height,
      ratio: width / height,
      source: (wired && wired.source) || "widgets",
    };
  }
  function selected() {
    return (
      state.board.segments.find((s) => s.id === state.board.selected_id) || state.board.segments[0]
    );
  }
  function promptDriftSentence(seg) {
    const drift = model.promptDrift(seg, state.board);
    if (!drift.length) return "";
    const names = drift.map((n) => model.PROMPT_INPUT_NAMES[n] || n).join(", ");
    return `The prompt was written before ${names} changed and is rendered as it stands — ` +
      "Process with agent rewrites it. ";
  }
  const FILM_REBUILD_ROUTE = "/vig/h3/cutter/film_rebuild";
  const SEGMENT_ROUTE = "/vig/h3/cutter/segment";
  const SEGMENT_CROP_ROUTE = "/vig/h3/cutter/segment_crop";
  const SEGMENT_AUTO_ROUTE = "/vig/h3/cutter/segment_auto";
  const SEGMENT_METHODS_ROUTE = "/vig/h3/cutter/segment_methods";
  const SEGMENT_WARM_ROUTE = "/vig/h3/cutter/segment_warm";
  const REFERENCE_WRITE_ROUTE = "/vig/h3/cutter/reference_write";
  const REFERENCE_CROP_ROUTE = "/vig/h3/cutter/reference_crop";
  const TRANSLATE_ROUTE = "/vig/h3/cutter/translate";
  function filmIsCurrent() {
    if (!String(state.board.film || "").trim()) return null;
    const told = String(state.board.film_of || "");
    if (!told) return null;
    return told === model.filmSignature(state.board.segments);
  }
  async function rebuildFilm(changed, lead = "") {
    const said = (text) => (lead ? `${lead} ${text}` : text);
    const segments = state.board.segments || [];
    const spans = model.filmSpans(segments);
    const present = segments.map((s) => Boolean(s.source_clip || s.clip));
    const clips = segments.map((s, i) => ({
      path: s.source_clip || s.clip || "",
      keep: spans[i].end,
      drop_head: spans[i].start,
      drop_first: model.opensOnChain(state.board, i),
      continues:
        i > 0 &&
        present[i - 1] &&
        !s.source_clip &&
        (model.takesFromFront(s) || model.carriedTail(segments[i - 1]) > 0),
      mute: s.audio === false,
      seed: Number(s.seed) || 0,
      cache_key: s.cache_key || "",
      name: s.name || "",
      prompt: s.prompt || "",
    })).filter((c) => c.path);
    const absent = present.flatMap((has, i) => (has ? [] : [i + 1]));
    const missing = absent.length
      ? ` Clip${absent.length > 1 ? "s" : ""} ${model.clipRanges(absent)} ${absent.length > 1 ? "are" : "is"} not rendered yet and not in it.`
      : "";
    if (!clips.length) {
      noteAgent(changed, "ok", said("The film was not re-joined: no clip has been rendered yet."));
      renderDetail();
      return;
    }
    noteAgent(changed, "ok", said(`Re-joining the film from ${clips.length} clip${clips.length > 1 ? "s" : ""}…`));
    state.filmJoining = true;
    renderDetail();
    try {
      const call = options.callRoute;
      if (typeof call !== "function") throw new Error("this console cannot reach the server");
      const frame = canvas();
      const data = await call(FILM_REBUILD_ROUTE, {
        path: (state.board.project_dir || "").trim(),
        clips,
        width: frame.width,
        height: frame.height,
      });
      if (!data || data.ok === false) {
        throw new Error((data && data.error) || "the join failed");
      }
      state.filmJoining = false;
      forgetFilmCount();
      state.board.film = data.film;
      state.board.film_of = model.filmSignature(state.board.segments);
      commit();
      renderPlayers();
      noteAgent(changed, "ok", said(
        `Film re-joined from ${data.clips} clip${data.clips > 1 ? "s" : ""}` +
          (data.kept ? " and kept in the project folder." : ".") + missing));
    } catch (error) {
      noteAgent(changed, "error", said(
        `The film was not re-joined: ${error.message}. ` +
          "The whole-film player is still the old cut."));
    }
    state.filmJoining = false;
    renderFilmStrip();
    renderDetail();
  }
  function refJobFor(key) {
    return state.refJob && state.refJob.key === key ? state.refJob : null;
  }
  function tellRefEditor(job) {
    if (state.refEditor && state.refEditorKey === (job ? job.key : state.refEditorKey)
        && typeof state.refEditor.resume === "function") {
      state.refEditor.resume(job, { replay: false });
    }
  }
  function openRefEditor(ref, slot = null) {
    if (!ref || !ref.source) return;
    const entry = {
      tag: ref.tag || "",
      label: (slot && slot.label) || ref.label || "",
      source: ref.source,
      key: (slot && slot.key) || "",
    };
    const key = refEditKey(entry);
    const waiting = refJobFor(key);
    const handle = openReferenceEditor({
      entry,
      job: waiting,
      onJob: (change) => {
        if (change.phase === "write") {
          state.refJob = { key, phase: "write", token: change.token || "",
                           startedAt: Date.now(), events: [], ended: false, report: "" };
          tellRefEditor(state.refJob);
        } else if (change.phase === "idle" && refJobFor(key) && state.refJob.phase === "write") {
          state.refJob = null;
          if (state.refEditorKey === key) tellRefEditor(null);
        }
      },
      ratio: canvas().ratio,
      viewUrl,
      mount: document.body,
      pickAsset: (kind) => pick(kind),
      segment: typeof options.callRoute === "function"
        ? (body) => options.callRoute(SEGMENT_ROUTE, { ...body, writer: { ...state.board.writer } })
        : null,
      segmentMethods: typeof options.callRoute === "function"
        ? (body) => options.callRoute(SEGMENT_METHODS_ROUTE, body)
        : null,
      segmentWarm: typeof options.callRoute === "function"
        ? (body) => options.callRoute(SEGMENT_WARM_ROUTE, body)
        : null,
      segmentAuto: typeof options.callRoute === "function"
        ? (body, init) =>
            options.callRoute(SEGMENT_AUTO_ROUTE, { ...body, writer: { ...state.board.writer } }, init)
        : null,
      referenceWrite: typeof options.callRoute === "function"
        ? (body, init) =>
            options.callRoute(REFERENCE_WRITE_ROUTE, { ...body, writer: { ...state.board.writer } }, init)
        : null,
      translatePrompt: typeof options.callRoute === "function"
        ? (body, init) =>
            options.callRoute(TRANSLATE_ROUTE, { ...body, writer: { ...state.board.writer } }, init)
        : null,
      stopWriter: typeof options.callRoute === "function"
        ? (body) => options.callRoute("/vig/h3/cutter/agent_stop", body)
        : null,
      interrupt: typeof options.callRoute === "function"
        ? () => options.callRoute("/interrupt", {})
        : null,
      segmentCrop: typeof options.callRoute === "function"
        ? (body) => options.callRoute(SEGMENT_CROP_ROUTE, body)
        : null,
      referenceCrop: typeof options.callRoute === "function"
        ? (body) => options.callRoute(REFERENCE_CROP_ROUTE, body)
        : null,
      run: (referenceTake, meta = {}) => {
        const was = refJobFor(key);
        state.refJob = {
          key, phase: "render", token: "",
          startedAt: was ? was.startedAt : Date.now(),
          wrote: !!(was && was.phase === "write"),
          batch: meta.batch || 0, count: meta.count || 1, prompt: meta.prompt || "",
          events: [], ended: false, report: "",
        };
        tellRefEditor(state.refJob);
        return request({ reference_take: referenceTake });
      },
      onPicked: (source) => {
        const tag = ref.tag || "";
        for (const seg of state.board.segments) {
          for (const held of seg.refs) {
            if (held === ref || (tag && held.tag === tag)) {
              held.source = source;
              held.frame = "";
              markStale(seg);
            }
          }
        }
        const entry = tag && state.board.library.find((item) => item.tag === tag);
        if (entry) entry.source = source;
        commit();
        renderTimeline();
        renderDetail();
      },
      onClosed: () => {
        if (state.refEditor === handle) {
          state.refEditor = null;
          state.refEditorKey = "";
        }
      },
    });
    state.refEditor = handle;
    state.refEditorKey = key;
    if (waiting && waiting.ended) state.refJob = null;
  }
  async function openTakes(seg, index) {
    if (!(state.board.project_dir || "").trim()
        && !(await offerProject("Takes are kept in a project folder, and this cut has none — "
          + "so there is no gallery to open. Takes rendered before a folder is chosen "
          + "stay in the render cache, where no gallery shows them."))) {
      return;
    }
    const root = (state.board.project_dir || "").trim();
    ensureTakesStyles();
    state.gallery = { id: seg.id, handle: null };
    state.gallery.handle = openTakesGallery({
      root,
      index,
      id: seg.id,
      name: seg.name || "",
      board: () => model.writeBoard(state.board),
      title: `Clip: ${seg.name || "Untitled scene"} —`,
      onClosed: () => {
        if (state.gallery && state.gallery.id === seg.id) state.gallery = null;
        delete takeCountsOf()[seg.id];
        forgetProjectSize();
        renderDetail();
      },
      onMessage: (text, kind) => {
        noteAgent(seg, kind === "info" ? "ok" : kind, text);
        renderDetail();
      },
      onChoose: (take) => {
        const made = take.made || {};
        const changes = [];
        if (take.clip) {
          seg.clip = take.clip;
          seg.source_clip = "";
          seg.poster = "";
          posterFromClip(seg, take.clip);
          changes.push("footage");
        }
        if (made.seed !== undefined && Number(made.seed) !== Number(seg.seed)) {
          seg.seed = Number(made.seed);
          changes.push(`seed ${seg.seed}`);
        }
        if (made.prompt && made.prompt !== seg.prompt) {
          seg.prompt = made.prompt;
          seg.written_by = made.writer && typeof made.writer === "object" ? { ...made.writer } : {};
          changes.push("prompt");
        }
        const restore = (field, value, label) => {
          if (value === undefined || value === null || value === "") return;
          if (String(seg[field] ?? "") === String(value)) return;
          seg[field] = value;
          changes.push(label);
        };
        restore("script", made.script, "script");
        if (made.mode && model.MODES[made.mode]) {
          restore("mode", made.mode, `mode ${made.mode}`);
        }
        restore("style", made.style, "style");
        restore("camera", made.camera, "camera");
        const held = Number(made.seconds);
        if (Number.isFinite(held) && held > 0 && held !== Number(seg.seconds)) {
          seg.seconds = model.snapSeconds(held, model.MAX_SEGMENT_SECONDS);
          changes.push(`length ${seg.seconds} s`);
        }
        if (made.cache_key && made.cache_key !== seg.cache_key) {
          seg.cache_key = String(made.cache_key);
        }
        seg.made_tail_at = model.madeAt(made.tail_at);
        seg.made_context_at = model.madeAt(made.context_at);
        seg.made_frames = model.madeAt(made.delivered_frames);
        const settings = made.settings || {};
        const mismatched = [];
        const tookRun = Math.max(0, Number(made.context_frames) || 0);
        const hasRun = Math.max(0, Number(seg.context_frames) || 0);
        if (tookRun !== hasRun) {
          mismatched.push(
            `a carried run of ${tookRun || "none"} (this clip is set to ${hasRun || "none"})`,
          );
        }
        const widget = (name) =>
          typeof options.getWidget === "function" ? options.getWidget(name) : undefined;
        const boardSteps = Number(widget("steps"));
        if (made.steps && Number.isFinite(boardSteps) && Number(made.steps) !== boardSteps) {
          mismatched.push(`steps ${made.steps} (board is ${boardSteps})`);
        }
        for (const [key, label] of [["sampler_name", "sampler"], ["scheduler", "scheduler"]]) {
          const was = settings[key];
          const now = widget(key);
          if (was && now && was !== now) mismatched.push(`${label} ${was} (board is ${now})`);
        }
        commit();
        renderTimeline();
        if (take.clip) rebuildFilm(seg);
        renderPlayers();
        renderDetail();
        if (mismatched.length) {
          noteAgent(
            seg,
            "error",
            `Took ${changes.join(" and ") || "that take"}, but it was rendered at ` +
              `${mismatched.join(", ")}. Match those on the board or this clip re-renders.`,
          );
        } else {
          noteAgent(
            seg,
            "ok",
            changes.length
              ? `Put that take on the timeline (${changes.join(", ")}).`
              : "That take is already what this clip shows.",
          );
        }
        renderDetail();
      },
    });
  }
  const POSTER_KEY = /([0-9a-f]{12,32})[\\/][^\\/]*poster/i;
  const askedPoster = new Set();
  function posterOf(seg) {
    const path = String(seg.poster || "");
    if (!path) return "";
    const keyed = POSTER_KEY.exec(path);
    if (!keyed || !seg.cache_key || keyed[1] === String(seg.cache_key)) return path;
    if (seg.clip && !askedPoster.has(seg.id)) {
      askedPoster.add(seg.id);
      posterFromClip(seg, seg.clip);
    }
    return "";
  }
  async function syncClipFolders() {
    const root = (state.board.project_dir || "").trim();
    if (!root || typeof options.callRoute !== "function") return;
    const running = (state.board.segments || []).some((s) => s.status === "generating");
    if (running || (state.runActivity && state.runActivity.phase === "running")) return;
    try {
      await options.callRoute("/vig/h3/cutter/clips_reconcile", {
        path: root,
        segments: (state.board.segments || []).map((seg) => ({
          id: seg.id,
          name: seg.name || "",
        })),
      });
    } catch (err) {
      console.error("[VIG H3 Cutter] could not renumber the clip folders:", err);
    }
  }
  async function posterFromClip(seg, clip) {
    if (!clip || typeof options.callRoute !== "function") return;
    try {
      const shot = await options.callRoute("/vig/h3/cutter/frame", { clip, time: 0 });
      if (!shot || !shot.source || (seg.clip !== clip && seg.source_clip !== clip)) return;
      seg.poster = shot.source;
      commit();
      renderTimeline();
    } catch (err) {
      console.error("[VIG H3 Cutter] could not read a poster for the adopted take:", err);
    }
  }
  function filmVersion() {
    const film = String(state.board.film || "");
    if (!film) return "";
    const parts = (state.board.segments || []).map((s) => String(s.clip || ""));
    return `${film}#${parts.join("|")}#${state.board.film_of || ""}`;
  }
  function viewUrl(path) {
    if (!path) return "";
    return typeof options.viewUrl === "function"
      ? options.viewUrl(path, (state.board.project_dir || "").trim())
      : "";
  }
  const stillUrls = new Map();
  function stillUrl(path) {
    const key = String(path || "");
    if (!key) return "";
    if (!stillUrls.has(key)) stillUrls.set(key, viewUrl(key));
    return stillUrls.get(key);
  }
  async function pick(kind) {
    if (typeof options.pickAsset !== "function") return null;
    return options.pickAsset(kind);
  }
  function playerBox(kindText, key, prefixText) {
    const box = el("div", "vig-cutter-player");
    const titleRow = el("div", "vig-cutter-inline");
    titleRow.style.cssText = "gap:6px;align-items:center;min-width:0;min-height:var(--cut-ctl)";
    const prefix = el("span", null, `${prefixText}:`);
    prefix.style.cssText =
      "font-size:17px;font-weight:600;letter-spacing:.04em;color:var(--cut-dim);flex:0 0 auto";
    const name = el("div", "vig-cutter-inline");
    name.style.cssText = "gap:6px;align-items:center;min-width:0;flex:0 1 auto";
    const facts = el("div", "vig-cutter-inline");
    facts.style.cssText = "gap:6px;align-items:center;flex:0 0 auto";
    const buttons = el("div", "vig-cutter-inline");
    buttons.style.flex = "0 0 auto";
    titleRow.append(prefix, name, el("div", "vig-cutter-spring"), facts, buttons);
    const mat = el("div", "vig-cutter-mat");
    const frame = el("div", "vig-cutter-frame");
    mat.appendChild(frame);
    const veilNote = el("div", "vig-cutter-veilnote", "covered");
    const eye = el("button", "vig-cutter-peek");
    const paintVeil = () => {
      const hidden = !!state.veil[key];
      box.classList.toggle("veiled", hidden);
      veilNote.style.display = hidden ? "" : "none";
      eye.textContent = "";
      eye.appendChild(svg(hidden ? ICONS.eyeoff : ICONS.eye, 13, 2));
      const also = key === "film" ? " and the timeline" : " and its card below";
      eye.title = hidden
        ? `Show the ${kindText}${also} again`
        : `Cover the ${kindText}${also} — the picture keeps playing underneath`;
    };
    eye.addEventListener("click", (event) => {
      event.stopPropagation();
      state.veil[key] = !state.veil[key];
      rememberVeil();
      paintVeils();
    });
    mat.append(veilNote, eye);
    veilPainters.push(paintVeil);
    paintVeil();
    box.append(titleRow, mat);
    return { box, titleRow, prefix, name, facts, buttons, mat, frame, paintVeil };
  }
  function measuredImageRatio() {
    const first = state.board.segments[0];
    if (!first) return null;
    const ref = first.refs.find(
      (r) => r.kind === "image" && r.source && r.uid.startsWith("first"),
    );
    const src = (ref && ref.source) || first.poster || "";
    if (!src) return null;
    if (state.imageRatio && state.imageRatio.src === src) return state.imageRatio.ratio;
    if (state.imageRatio && state.imageRatio.loading === src) return null;
    state.imageRatio = { loading: src };
    const probe = new Image();
    probe.onload = () => {
      state.imageRatio = {
        src,
        ratio:
          probe.naturalWidth > 0 && probe.naturalHeight > 0
            ? probe.naturalWidth / probe.naturalHeight
            : null,
      };
      renderAll();
    };
    probe.onerror = () => {
      state.imageRatio = { src, ratio: null };
      renderAll();
    };
    probe.src = viewUrl(src);
    return null;
  }
  function effectiveRatio() {
    return canvas().ratio;
  }
  function maxPreviewHeight() {
    const width = parts.clipPlayer.mat.clientWidth || 400;
    const ratio = effectiveRatio() || canvas().ratio;
    return Math.max(40, Math.min(560, Math.floor(width / ratio)));
  }
  function applyPreviewHeight() {
    const height = `${Math.min(state.previewH, maxPreviewHeight())}px`;
    for (const player of [parts.clipPlayer, parts.filmPlayer]) {
      player.mat.style.height = height;
      fitFrame(player);
    }
  }
  function fitFrame(player) {
    const ratio = effectiveRatio() || canvas().ratio;
    const room = { width: player.mat.clientWidth, height: player.mat.clientHeight };
    if (!room.width || !room.height || !(ratio > 0)) return;
    const width = Math.min(room.width, room.height * ratio);
    player.frame.style.width = `${Math.floor(width)}px`;
    player.frame.style.height = `${Math.floor(width / ratio)}px`;
  }
  function rearmControls(video) {
    if (!video.controls) return;
    video.controls = false;
    void video.offsetWidth;
    clearTimeout(video.__rearm);
    video.__rearm = setTimeout(() => { video.controls = true; }, 60);
  }
  function watchControls(video) {
    video.addEventListener("loadedmetadata", () => rearmControls(video), { once: true });
    if (typeof ResizeObserver !== "function") return;
    let last = "";
    const watch = new ResizeObserver(() => {
      const box = video.getBoundingClientRect();
      const size = `${Math.round(box.width)}x${Math.round(box.height)}`;
      if (last && last !== size) rearmControls(video);
      last = size;
    });
    watch.observe(video);
    video.__controlsWatch = watch;
  }
  function clipNote(seg) {
    const take = seg.source_clip ? "file" : String(seg.cache_key || "").slice(0, 8);
    const waiting = seg.take_key && seg.take_key !== seg.cache_key;
    const changed = seg.status === "stale"
      ? (waiting ? " · changed — a new take is in the gallery" : " · changed since render")
      : (waiting ? " · a new take is in the gallery" : "");
    return `clip ${state.board.segments.indexOf(seg) + 1} · ${seg.seconds} s${
      take ? ` · take ${take}` : ""
    }${changed}`;
  }
  function playerTitle(text, placeholder) {
    const span = el("span");
    span.textContent = text || placeholder;
    span.title = text || placeholder;
    span.style.cssText =
      "font-weight:600;font-size:17px;" +
      "white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0;" +
      `color:${text ? "var(--cut-bright)" : "var(--cut-faint)"}`;
    return span;
  }
  function nameField({ value, placeholder, open, title, text, input: inputStyle, onInput, onOpen, onClose }) {
    const box = el("div", "vig-cutter-inline");
    box.style.cssText = "gap:6px;align-items:center;min-width:0";
    const opened = value;
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = placeholder;
    input.value = value;
    input.style.cssText = inputStyle;
    input.addEventListener("input", () => onInput(input.value));
    const finish = (revert) => {
      if (revert) onInput(opened);
      onClose();
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        finish(false);
      } else if (event.key === "Escape") {
        event.preventDefault();
        finish(true);
      }
    });
    input.addEventListener("blur", () => finish(false));
    const label = text(value, placeholder);
    label.style.cursor = "text";
    label.title = title;
    label.addEventListener("click", onOpen);
    const pencil = el("button", "vig-cutter-icon");
    pencil.appendChild(svg(ICONS.pencil, 12));
    pencil.title = title;
    pencil.addEventListener("click", onOpen);
    box.append(open ? input : label, pencil);
    return { box, input, pencil };
  }
  function waitText(seconds) {
    const total = Math.max(0, Math.round(Number(seconds) || 0));
    const pad = (value) => String(value).padStart(2, "0");
    const hours = Math.floor(total / 3600);
    return hours
      ? `${hours}:${pad(Math.floor(total / 60) % 60)}:${pad(total % 60)}`
      : `${Math.floor(total / 60)}:${pad(total % 60)}`;
  }
  function tokenText(tokens) {
    return Math.trunc(Number(tokens) || 0).toLocaleString("en-US");
  }
  function canvasCost(width, height, seg = selected()) {
    const frames = seg ? model.sampleFrames(seg) : 0;
    const tokens = model.sequenceTokens(width, height, frames);
    const steps = askedSteps();
    const cost = model.stepCost(state.cost, tokens);
    const mark = costMark(cost);
    const wait = cost && steps ? `${mark}${waitText(cost.seconds * steps)}` : "";
    return { tokens, steps, cost, wait, mark };
  }
  function askedSteps() {
    const asked = Number(
      typeof options.getWidget === "function" ? options.getWidget("steps") : 0,
    );
    return Number.isFinite(asked) && asked > 0 ? Math.trunc(asked) : 0;
  }
  function costMark(cost) {
    if (!cost) return "";
    if (cost.how === "measured") return "";
    if (cost.how === "fitted") return "≈";
    return cost.at === "least" ? "≥" : "≤";
  }
  function costWhy(cost) {
    if (!cost) {
      return "Nothing has been rendered on this box yet, so there is no measured "
        + "rate to put a time to it — the token count is the whole of what is known.";
    }
    if (cost.how === "measured") return "Measured here, at this very size.";
    if (cost.how === "fitted") {
      return `Estimated from ${cost.from} renders measured here, whose times go as `
        + `the tokens to the power of ${cost.power.toFixed(2)}.`;
    }
    return "One render measured here, at another size, so the exponent is unknown — "
      + "and it is not a constant on this box (2.2 to 3.2 in this project's own "
      + `measurements). The true cost is at ${cost.at} this, because attention is `
      + "quadratic and because a bigger frame leaves less room on the card for the "
      + "weights.";
  }
  function costFootnote(shape) {
    const seg = selected();
    const cost = canvasCost(shape.width, shape.height, seg);
    if (!cost.tokens) {
      return "The cost of every render goes with this number; the film's shape "
        + "does not move.";
    }
    const which = seg
      ? `clip ${state.board.segments.indexOf(seg) + 1}`
      : "this clip";
    return `Now ${shape.width}×${shape.height}: ${tokenText(cost.tokens)} tokens a `
      + `sampling step for ${which}`
      + (cost.wait ? `, about ${cost.wait} at ${cost.steps} steps` : "")
      + `. ${costWhy(cost.cost)}`;
  }
  function canvasPills() {
    const shape = canvas();
    const ratio = model.ratioLabel(shape.width, shape.height);
    const started = filmStarted();
    const ratioChip = el(
      "button",
      "vig-cutter-pill vig-cutter-pillbtn",
      ratio.label || `${shape.width}×${shape.height}`,
    );
    ratioChip.dataset.log = "canvas shape";
    ratioChip.disabled = started;
    const cost = canvasCost(shape.width, shape.height);
    ratioChip.title =
      `The frame: ${shape.width}×${shape.height}` +
      (ratio.off > 0
        ? ` — ${ratio.label.replace("≈", "")} to within ${(ratio.off * 100).toFixed(1)}%`
        : "") +
      (started
        ? ". Fixed: the film has clips rendered at this shape, and a new shape " +
          "would not continue them. The megapixels beside it still move."
        : ". Press to choose the film's shape and size — only until the first clip renders.");
    ratioChip.addEventListener("click", () => {
      if (!filmStarted()) openCanvasShape(ratioChip);
    });
    const pixelChip = el(
      "button",
      "vig-cutter-pill vig-cutter-pillbtn",
      `${((shape.width * shape.height) / 1e6).toFixed(2)} MP`,
    );
    pixelChip.dataset.log = "canvas megapixels";
    pixelChip.title =
      `Pixels per frame — ${tokenText(cost.tokens)} tokens a sampling step`
      + (cost.wait
        ? ` for this clip, about ${cost.wait} at ${cost.steps} steps.`
        : ` for this clip.`)
      + ` ${costWhy(cost.cost)}`
      + " The cost goes with this number far faster than in proportion to it:"
      + " attention is quadratic, and past a point the frame leaves no room on"
      + " the card for the weights. Press to change it — the shape stays as it is.";
    pixelChip.addEventListener("click", () => openCanvasMegapixels(pixelChip));
    return [ratioChip, pixelChip];
  }
  function renderPlayers() {
    renderRunBar();
    stopBandLoop();
    const seg = selected();
    const frameSize = canvas();
    const { ratio } = frameSize;
    const clip = parts.clipPlayer;
    clip.name.textContent = "";
    parts.clipTitle = null;
    if (seg) {
      if (state.playerNameEdit !== null && state.playerNameEdit !== seg.id) {
        state.playerNameEdit = null;
      }
      const clipName = nameField({
        value: seg.name || "",
        placeholder: "Untitled scene",
        open: state.playerNameEdit === seg.id,
        title: "Rename this clip",
        text: (value, placeholder) => {
          parts.clipTitle = playerTitle(value, placeholder);
          return parts.clipTitle;
        },
        input: "flex:1;min-width:0;font-size:17px;font-weight:600",
        onInput: (text) => {
          seg.name = text;
          updateSegmentBadge(seg);
          commitSoon();
        },
        onOpen: () => {
          if (state.playerNameEdit === seg.id) return;
          state.playerNameEdit = seg.id;
          renderPlayers();
        },
        onClose: () => {
          if (state.playerNameEdit !== seg.id) return;
          state.playerNameEdit = null;
          flushCommit();
          renderPlayers();
          renderDetail();
        },
      });
      clip.name.appendChild(clipName.box);
      if (state.playerNameEdit === seg.id) {
        clipName.input.focus();
        clipName.input.select();
      }
    } else {
      clip.name.appendChild(playerTitle("", "no clip selected"));
    }
    clip.facts.textContent = "";
    clip.facts.append(...canvasPills());
    clip.prefix.title = seg
      ? state.frameBusy
        ? `${clipNote(seg)} · extracting frame…`
        : clipNote(seg)
      : "";
    const clipPath = seg ? String(seg.source_clip || seg.clip || "") : "";
    const keptClip = clipPath && parts.clipVideo
      && parts.clipVideo.dataset.vigSrc === clipPath
      ? parts.clipVideo
      : null;
    clip.frame.textContent = "";
    clip.frame.style.aspectRatio = String(effectiveRatio() || ratio);
    const live = state.livePreview;
    parts.clipVideo = null;
    parts.clipFollowFor = seg;
    parts.liveFrame = null;
    if (live && seg && live.segment_id === seg.id) {
      const image = document.createElement("img");
      image.src = `data:${live.mime};base64,${live.image}`;
      image.alt = "";
      clip.frame.appendChild(image);
      const step = el("span", "vig-cutter-mono", `step ${live.step}/${live.total}`);
      step.style.cssText = "position:absolute;left:8px;bottom:6px";
      clip.frame.appendChild(step);
      parts.liveFrame = { image, step, segment_id: seg.id };
    } else if (seg && (seg.source_clip || seg.clip)) {
      const video = keptClip || document.createElement("video");
      clip.frame.appendChild(video);
      parts.clipVideo = video;
      if (!keptClip) {
        video.src = viewUrl(clipPath);
        video.dataset.vigSrc = clipPath;
        video.controls = true;
        video.loop = true;
        watchControls(video);
        video.preload = "metadata";
        const follow = followPlayhead(
          video,
          () => parts.clipHead,
          () => model.segmentFrames(parts.clipFollowFor || seg) / model.FPS,
          "clip",
        );
        video.addEventListener("loadedmetadata", () => {
          follow();
          renderRuler();
        });
      }
    } else {
      clip.frame.appendChild(el("span", "vig-cutter-mono", "not rendered yet"));
    }
    const film = parts.filmPlayer;
    film.name.textContent = "";
    const filmName = nameField({
      value: state.board.film_name || "",
      placeholder: "Untitled film",
      open: state.filmNameEdit,
      title: "Name this film",
      text: (value, placeholder) => playerTitle(value, placeholder),
      input: "flex:1;min-width:0;font-size:17px;font-weight:600",
      onInput: (text) => {
        state.board.film_name = text;
        commitSoon();
      },
      onOpen: () => {
        if (state.filmNameEdit) return;
        state.filmNameEdit = true;
        renderPlayers();
      },
      onClose: () => {
        if (!state.filmNameEdit) return;
        state.filmNameEdit = false;
        flushCommit();
        renderPlayers();
      },
    });
    film.name.appendChild(filmName.box);
    if (state.filmNameEdit) {
      filmName.input.focus();
      filmName.input.select();
    }
    parts.filmStale.textContent = "";
    const current = filmIsCurrent();
    if (current !== true && String(state.board.film || "").trim()) {
      parts.filmStale.appendChild(el("span", null,
        current === false
          ? "this film is not the cut on the timeline — re-join it"
          : "this film carries no record of the cut it was joined from — "
            + "re-join it once and it will"));
      const fix = el("button", "vig-cutter-ghost", "↻ re-join");
      fix.style.cssText = "font-size:10px;padding:2px 8px";
      fix.title =
        "Join the film again from the clips the timeline holds now. Seconds, " +
        "no GPU — and it is what makes the film the cut again.";
      fix.addEventListener("click", () => rebuildFilm(selected()));
      parts.filmStale.appendChild(fix);
    }
    for (const wait of model.pendingTrims(state.board.segments)) {
      const line = el("div", "vig-cutter-waiting",
        wait.kind === "length"
          ? `clip ${wait.clip} becomes ${model.formatDuration(model.framesToSeconds(wait.at))} ` +
            `after it is re-rendered — until then the film keeps its take's ` +
            model.formatDuration(model.framesToSeconds(wait.made))
          : wait.kind === "arrive"
          ? `clip ${wait.clip} arrives at frame ${wait.at} of clip ${wait.anchor} after it is ` +
            `re-rendered — until then the film keeps clip ${wait.anchor} from frame ${wait.made}`
          : `clip ${wait.clip} continues from frame ${wait.at} of clip ${wait.anchor} after it is ` +
            `re-rendered — until then the film keeps clip ${wait.anchor} ` +
            (wait.made ? `to frame ${wait.made}` : "to its end"));
      line.title =
        "The plate says where the clip WILL go. The take on the timeline was rendered for " +
        "the old place, so cutting the film to the new one now would put a jump at the seam. " +
        "Render the clip, put the new take on the timeline, and the film follows.";
      parts.filmStale.appendChild(line);
    }
    parts.filmStale.classList.toggle("open", !!parts.filmStale.textContent);
    film.prefix.title = `${filmSeconds().toFixed(2)} s · ` +
      `${model.joinedClips(state.board.segments)} of ${state.board.segments.length} clips`;
    const filmPath = String(state.board.film || "");
    const filmKey = filmVersion();
    const keptFilm = filmPath && parts.filmVideo
      && parts.filmVideo.dataset.vigSrc === filmKey
      ? parts.filmVideo
      : null;
    film.frame.textContent = "";
    film.frame.style.aspectRatio = String(effectiveRatio() || ratio);
    parts.filmVideo = null;
    if (state.board.film) {
      const video = keptFilm || document.createElement("video");
      film.frame.appendChild(video);
      parts.filmVideo = video;
      if (!keptFilm) {
        video.src = viewUrl(filmPath);
        video.dataset.vigSrc = filmKey;
        video.controls = true;
        watchControls(video);
        video.preload = "metadata";
        const followFilm = followPlayhead(
          video,
          () => parts.filmHead,
          () => filmSeconds(),
          "film",
        );
        video.addEventListener("loadedmetadata", () => {
          const was = filmSeconds();
          if (Number.isFinite(video.duration) && video.duration > 0) {
            state.filmDurations[filmKey] = video.duration;
          }
          if (Math.abs(filmSeconds() - was) > 0.5 / model.FPS) renderFilmStrip();
          followFilm();
        });
      }
    } else {
      film.frame.appendChild(el("span", "vig-cutter-mono", "no film yet — run a joining pass"));
    }
    const hasClip = !!(seg && (seg.source_clip || seg.clip));
    const busy = !seg || seg.status === "generating" || state.procBusy === (seg || {}).id;
    parts.generateClip.disabled = !seg || busy;
    parts.generateClip.title = !seg
      ? "No clip selected."
      : seg.locked
        ? "This clip is locked — unlock it in the workshop's header to render it."
        : busy
          ? "This clip is rendering."
          : "Render this clip and nothing else — another take of it, into the gallery.";
    parts.loadClip.disabled = !seg;
    parts.frameLib.disabled = !hasClip || state.frameBusy;
    const kept = !!(state.board.project_dir || "").trim();
    parts.clipTakes.disabled = !seg;
    parts.clipTakes.title = kept
      ? "Takes of this clip — compare, rate, choose"
      : "Takes of this clip — this cut has no project folder yet; press to choose one";
    parts.clipFolder.disabled = !seg || !kept;
    parts.clipFolder.title = kept
      ? "Open this clip's takes folder in Explorer"
      : "Set a project folder — the takes are filed there";
    const keptFilms = !!(state.board.project_dir || "").trim();
    parts.filmGallery.disabled = false;
    parts.filmGallery.title = keptFilms
      ? "The films this project has joined — which clips, how long, their prompts"
      : "The films this project has joined — this cut has no project folder yet; press to choose one";
    parts.filmFolder.disabled = !keptFilms;
    parts.filmFolder.title = keptFilms
      ? "Open the project's film folder in Explorer"
      : "Set a project folder — films are kept there";
    parts.filmFrame.disabled = !state.board.film || state.frameBusy;
    const rest = theRest();
    parts.generateFilm.disabled = !rest.clips.length;
    parts.generateFilm.title = rest.clips.length
      ? `Render the rest of the film: clip${rest.clips.length > 1 ? "s" : ""} ` +
        `${model.clipRanges(rest.numbers)} — every clip without a take, in order, ` +
        "each continuing the one before; each goes on the timeline." +
        (rest.stop ? ` Stops before clip ${rest.stop.number}: ${rest.stop.why}.` : "")
      : rest.stop
        ? `Nothing to render from here: clip ${rest.stop.number} ${rest.stop.why}.`
        : "Every clip is on the timeline — nothing left to render.";
    renderRuler();
    renderFilmStrip();
    applyPreviewHeight();
  }
  function renderAll() {
    paintUndo();
    renderControls();
    renderPlayers();
    renderTimeline();
    renderAudioTrack();
    renderDetail();
  }
  function renderControls() {
    const board = state.board;
    parts.projectNewBtn.disabled = !!state.projectBusy;
    parts.projectOpenBtn.disabled = !!state.projectBusy;
    paintProjectPath();
    renderAgentRow();
    renderPreviewRow();
  }
  function ensureAgentLists() {
    const writer = state.board.writer;
    const url = writer.use_provider ? writer.provider_url || "" : "";
    const key = `${url}|${writer.models_dir || ""}`;
    if (state.agent.forDir === key || state.agent.loading) return;
    if (typeof options.callRoute !== "function") return;
    state.agent.loading = true;
    options
      .callRoute("/vig/h3/cutter/llm_models", {
        models_dir: writer.models_dir || "",
        provider_url: url,
      })
      .then((data) => {
        state.agent.models = Array.isArray(data.models) ? data.models : [];
        state.agent.styles = Array.isArray(data.styles) ? data.styles : [];
        state.agent.source = data.source || "folder";
        state.agent.trouble = data.trouble || "";
        state.agent.keySource = data.key_source || "";
        state.agent.tokenSource = data.token_source || "";
        state.agent.offered = Number(data.offered) || 0;
        state.agent.connected = Number(data.connected) || 0;
        state.agent.forDir = key;
      })
      .catch((error) => {
        console.error("[VIG H3 Cutter] could not list agent models:", error);
        state.agent.forDir = key;
      })
      .finally(() => {
        state.agent.loading = false;
        renderAgentRow();
        renderDetail();
      });
  }
  function agentReady() {
    if (state.agentHealth === "ok") return true;
    if (state.agentHealth === "offline") return false;
    return state.agent.models.length > 0;
  }
  function renderAgentRow() {
    const row = parts.agentRow;
    if (!row) return;
    row.textContent = "";
    const writer = state.board.writer;
    ensureAgentLists();
    const modelField = el("div", "vig-cutter-field");
    const modelLabel = el("div", "vig-cutter-inline");
    modelLabel.style.gap = "6px";
    const lamp = el("span");
    const ready = agentReady();
    lamp.style.cssText =
      "width:9px;height:9px;border-radius:50%;flex:0 0 auto;display:inline-block;" +
      `background:${ready ? "#6fae7f" : "#c0665a"};` +
      `box-shadow:0 0 6px ${ready ? "rgba(111,174,127,.8)" : "rgba(192,102,90,.8)"}`;
    const viaProvider = !!(writer.use_provider && writer.provider_url);
    const modelField_of = viaProvider ? "provider_model" : "llm_model";
    const chosenModel = writer[modelField_of] || "";
    lamp.title = ready
      ? state.agentHealth === "ok"
        ? "Agent active: the last call was written by the model."
        : viaProvider
          ? `Agent ready: the provider offers ${state.agent.models.length} model(s). ` +
            "It is somebody else's server, so nothing is loaded or released around a call."
          : `Agent ready: ${state.agent.models.length} model(s) in the folder. It loads per ` +
            "call and is released before renders."
      : state.agentHealth === "offline"
        ? "Agent inactive: the last call fell back to the offline floor — see the note " +
          "under the script buttons."
        : viaProvider
          ? `Agent inactive: ${state.agent.trouble || "the provider offered no models."}`
          : "Agent inactive: no writing models found. Pick the folder holding your .gguf files.";
    modelLabel.append(lamp, el("label", "vig-cutter-label", "agent · writing model"));
    modelField.appendChild(modelLabel);
    const modelSelect = document.createElement("select");
    modelSelect.className = "vig-cutter-select";
    modelSelect.style.maxWidth = "230px";
    const autoOption = el("option", "", "auto (first model found)");
    autoOption.value = "";
    modelSelect.appendChild(autoOption);
    const names = state.agent.models.slice();
    if (chosenModel && !names.includes(chosenModel)) names.unshift(chosenModel);
    for (const name of names) {
      const option = el("option", "", name);
      option.value = name;
      if (name === chosenModel) option.selected = true;
      modelSelect.appendChild(option);
    }
    modelSelect.title = viaProvider
      ? "One of the provider's own models, by the id it reports. Left on auto, the " +
        "request names no model and the server answers with whatever it has up."
      : "The GGUF every agent button writes with. The model is started for the call " +
        "and released before a render wants the card.";
    modelSelect.addEventListener("change", () => {
      writer[modelField_of] = modelSelect.value;
      state.agentHealth = null;
      commit();
      renderAgentRow();
    });
    const pickLine = el("div", "vig-cutter-inline");
    pickLine.style.gap = "6px";
    pickLine.appendChild(modelSelect);
    modelField.appendChild(pickLine);
    if (viaProvider && state.agent.offered > state.agent.models.length) {
      const connected = state.agent.connected || 0;
      const hidden = el(
        "span",
        "vig-cutter-mono",
        connected
          ? `${state.agent.models.length} of ${state.agent.offered} · tool calls, ` +
            `${connected} connected provider${connected === 1 ? "" : "s"}`
          : `${state.agent.models.length} of ${state.agent.offered} can call tools`,
      );
      hidden.style.cssText = "font-size:10px;opacity:.7";
      hidden.title = connected
        ? "Two narrowings, both on what the router itself declares. First, only models " +
          "that can make tool calls — that is what the writing agent runs on. Second, " +
          "only models owned by a provider this router is actually connected to: a " +
          "router advertises everything it knows how to reach, and the rest simply do " +
          "not answer. Remove the management token to see the wider list."
        : "The provider offered every model it routes to, including image, audio and " +
          "embedding ones. Only those it declares can make tool calls are listed, because " +
          "that is what the writing agent runs on. Add a management token to also hide " +
          "the providers this router has no connection to.";
      modelField.appendChild(hidden);
    }
    row.appendChild(modelField);
    const provField = el("div", "vig-cutter-field");
    provField.appendChild(el("label", "vig-cutter-label", "writes through"));
    const whereLine = el("div", "vig-cutter-inline");
    whereLine.style.gap = "4px";
    const localBtn = el("button", "vig-cutter-ghost", "local");
    localBtn.title =
      "A .gguf from the models folder (the folder icon beside the model), in a server this extension starts for " +
      "the call and kills before a render wants the card.";
    const remoteBtn = el("button", "vig-cutter-ghost", "provider");
    remoteBtn.title =
      "An OpenAI-compatible server somebody else runs and keeps running. Nothing is " +
      "loaded or released around a call, and the card stays free.";
    localBtn.classList.toggle("active", !viaProvider);
    remoteBtn.classList.toggle("active", viaProvider);
    remoteBtn.disabled = !writer.provider_url;
    const setWriter = (useProvider) => {
      if (!!writer.use_provider === useProvider) return;
      writer.use_provider = useProvider;
      state.agentHealth = null;
      state.agent.forDir = null;
      commit();
      renderAgentRow();
    };
    localBtn.addEventListener("click", () => setWriter(false));
    remoteBtn.addEventListener("click", () => setWriter(true));
    whereLine.append(localBtn, remoteBtn);
    provField.appendChild(whereLine);
    const provInput = document.createElement("input");
    provInput.type = "text";
    provInput.value = writer.provider_url || "";
    provInput.placeholder = "http://localhost:1234/v1";
    provInput.style.width = "196px";
    if (!viaProvider) provInput.style.opacity = "0.55";
    provInput.title =
      "The provider's address: http://localhost:20128/v1, or just localhost:20128 — " +
      "the /v1 is added for you. It stays here while the local writer is in use, so " +
      "switching back and forth costs nothing.";
    provInput.addEventListener("change", () => {
      const next = provInput.value.trim();
      if (next === (writer.provider_url || "")) return;
      const wasEmpty = !(writer.provider_url || "");
      writer.provider_url = next;
      if (next && wasEmpty) writer.use_provider = true;
      if (!next) writer.use_provider = false;
      state.agentHealth = null;
      state.agent.forDir = null;
      commit();
      renderAgentRow();
    });
    provField.appendChild(provInput);
    if (viaProvider) {
      const credentials = [
        {
          field: "api_key",
          stateKey: "keySource",
          empty: "api key",
          set: "replace key",
          none: "no key — most local servers need none",
          have: "key saved on this machine",
          from: (where) => `key from ${where}`,
          title:
            "Only if the provider asks for one. Stored on this machine, filed under " +
            "the address above — never written into the workflow, and never sent back " +
            "to the browser. Save an empty field to forget it.",
        },
        {
          field: "management_token",
          stateKey: "tokenSource",
          empty: "management token",
          set: "replace token",
          none: "no management token — the model list is not checked for life",
          have: "token saved on this machine",
          from: (where) => `token from ${where}`,
          title:
            "Optional, and a DIFFERENT credential from the key: a router's management " +
            "routes are what know which models actually answer. In OmniRoute this is a " +
            "Scoped Access Token from Settings → Access Tokens; read scope is enough. " +
            "Without it the list is everything the router advertises, alive or not.",
        },
      ];
      for (const spec of credentials) {
        const line = el("div", "vig-cutter-inline");
        line.style.gap = "6px";
        const input = document.createElement("input");
        input.type = "password";
        input.autocomplete = "off";
        input.style.width = "128px";
        input.placeholder = state.agent[spec.stateKey] ? spec.set : spec.empty;
        input.title = spec.title;
        const save = el("button", "vig-cutter-ghost", "save");
        save.disabled = !!state.agent.keyBusy;
        save.addEventListener("click", async () => {
          if (typeof options.callRoute !== "function" || state.agent.keyBusy) return;
          state.agent.keyBusy = true;
          const sent = input.value;
          input.value = "";
          try {
            const body = { provider_url: writer.provider_url };
            body[spec.field] = sent;
            const data = await options.callRoute("/vig/h3/cutter/provider_key", body);
            state.agent.keySource = (data && data.key_source) || "";
            state.agent.tokenSource = (data && data.token_source) || "";
            state.agent.trouble = "";
            state.agent.forDir = null;
            state.agentHealth = null;
          } catch (error) {
            state.agent.trouble = `could not save: ${
              error && error.message ? error.message : error
            }`;
          } finally {
            state.agent.keyBusy = false;
            renderAgentRow();
          }
        });
        line.append(input, save);
        provField.appendChild(line);
        const where = state.agent[spec.stateKey];
        const note = el(
          "span",
          "vig-cutter-mono",
          where === "saved" ? spec.have : where ? spec.from(where) : spec.none,
        );
        note.style.cssText = "font-size:10px;opacity:.7";
        provField.appendChild(note);
      }
    }
    if (viaProvider && state.agent.trouble) {
      const err = el("span", "vig-cutter-mono", state.agent.trouble);
      err.style.cssText = "color:#e08a7d;font-size:10px;max-width:240px;white-space:normal";
      provField.appendChild(err);
    }
    row.appendChild(provField);
    const usingProvider = viaProvider;
    const dirButton = el("button", "vig-cutter-icon");
    dirButton.appendChild(svg(ICONS.folder, 14));
    dirButton.title = usingProvider
      ? "Not used while a provider is set — the models come from that server."
      : state.dirBusy
        ? "Choose in the Explorer window…"
        : `Models folder: ${writer.models_dir || "none chosen"}. Press to choose the folder ` +
          "holding your .gguf writing models (opens Explorer).";
    if (usingProvider) dirButton.style.opacity = "0.45";
    dirButton.disabled = !!state.dirBusy || usingProvider;
    dirButton.addEventListener("click", async () => {
      if (typeof options.pickFolder !== "function" || state.dirBusy) return;
      state.dirBusy = true;
      state.agentDirError = "";
      renderAgentRow();
      try {
        const result = await options.pickFolder(writer.models_dir || "");
        if (result && result.ok === false) {
          state.agentDirError = result.message || "The folder dialog did not open.";
        } else if (result && !result.cancelled && typeof result.path === "string" && result.path) {
          writer.models_dir = result.path;
          state.agentHealth = null;
          state.agent.forDir = null;
          commit();
        }
      } catch (error) {
        state.agentDirError = `folder pick failed: ${error && error.message ? error.message : error}`;
        console.error("[VIG H3 Cutter] folder pick failed:", error);
      } finally {
        state.dirBusy = false;
        renderAgentRow();
      }
    });
    pickLine.appendChild(dirButton);
    if (state.agentDirError) {
      const err = el("span", "vig-cutter-mono", state.agentDirError);
      err.style.cssText = "color:#e08a7d;font-size:10px;max-width:240px;white-space:normal";
      modelField.appendChild(err);
    }
  }
  function loadTinyVaes(then) {
    if (state.tinyVaes || state.tinyVaesBusy) return;
    if (typeof options.callRoute !== "function") return;
    state.tinyVaesBusy = true;
    options
      .callRoute("/vig/h3/cutter/tiny_vae", {})
      .then((data) => {
        state.tinyVaes = Array.isArray(data && data.decoders) ? data.decoders : [];
        state.tinyVaeLoader = !!(data && data.loader);
      })
      .catch(() => {
        state.tinyVaes = [];
      })
      .finally(() => {
        state.tinyVaesBusy = false;
        if (typeof then === "function") then();
      });
  }
  function renderPreviewRow() {
    const row = parts.previewRow;
    if (!row) return;
    row.textContent = "";
    const resField = el("div", "vig-cutter-field");
    resField.appendChild(el("label", "vig-cutter-label", "preview max"));
    const resSelect = document.createElement("select");
    resSelect.className = "vig-cutter-select";
    resSelect.title =
      "The longest side of the preview PICTURE, in pixels -- never the render. " +
      "0 is the sampler's own resolution, which is what the same number means " +
      "on the node this follows.";
    for (const value of model.PREVIEW_MAX_RES) {
      const option = el("option", "", value === 0 ? "full - sampler res" : `${value} px`);
      option.value = String(value);
      if ((state.board.preview_max_res ?? 1024) === value) option.selected = true;
      resSelect.appendChild(option);
    }
    resSelect.addEventListener("change", () => {
      state.board.preview_max_res = Number(resSelect.value) || 0;
      commit();
    });
    resField.appendChild(resSelect);
    row.appendChild(resField);
    const qualityField = el("div", "vig-cutter-field");
    qualityField.appendChild(el("label", "vig-cutter-label", "quality"));
    const qualitySelect = document.createElement("select");
    qualitySelect.className = "vig-cutter-select";
    qualitySelect.title =
      "Quality of the picture the preview is SENT as -- a JPEG for a single " +
      "frame, a WebP when it animates. It costs bytes on the wire, not render " +
      "time.";
    for (const value of model.PREVIEW_QUALITY) {
      const option = el("option", "", String(value));
      option.value = String(value);
      if ((state.board.preview_quality || 80) === value) option.selected = true;
      qualitySelect.appendChild(option);
    }
    qualitySelect.addEventListener("change", () => {
      state.board.preview_quality = Number(qualitySelect.value) || 80;
      commit();
    });
    qualityField.appendChild(qualitySelect);
    row.appendChild(qualityField);
    const framesField = el("div", "vig-cutter-field");
    framesField.appendChild(el("label", "vig-cutter-label", "preview frames"));
    const framesSelect = document.createElement("select");
    framesSelect.className = "vig-cutter-select";
    framesSelect.title =
      "How many frames each preview carries. Auto draws the whole clip while " +
      "the preview is latent2rgb (free) and one still while a tiny VAE is " +
      "decoding it (a decode per frame, inside the sampler).";
    for (const [value, label] of [
      [0, "auto"],
      [1, "1 - a still"],
      [4, "4 frames"],
      [8, "8 frames"],
      [16, "16 frames"],
    ]) {
      const option = el("option", "", label);
      option.value = String(value);
      if ((state.board.preview_frames ?? 0) === value) option.selected = true;
      framesSelect.appendChild(option);
    }
    framesSelect.addEventListener("change", () => {
      const chosen = Number(framesSelect.value);
      state.board.preview_frames = Number.isFinite(chosen) ? chosen : 0;
      commit();
    });
    framesField.appendChild(framesSelect);
    row.appendChild(framesField);
    const fpsField = el("div", "vig-cutter-field");
    fpsField.appendChild(el("label", "vig-cutter-label", "preview fps"));
    const fpsSelect = document.createElement("select");
    fpsSelect.className = "vig-cutter-select";
    for (const value of model.PREVIEW_FPS) {
      const option = el("option", "", value === 24 ? "24 fps - full" : `${value} fps`);
      option.value = String(value);
      if (state.board.preview_fps === value) option.selected = true;
      fpsSelect.appendChild(option);
    }
    fpsSelect.addEventListener("change", () => {
      state.board.preview_fps = Number(fpsSelect.value) || 12;
      commit();
    });
    fpsField.appendChild(fpsSelect);
    row.appendChild(fpsField);
    const everyField = el("div", "vig-cutter-field");
    everyField.appendChild(el("label", "vig-cutter-label", "preview every"));
    const everySelect = document.createElement("select");
    everySelect.className = "vig-cutter-select";
    everySelect.title =
      "How often the live preview is drawn, in sampler steps. Fewer draws give " +
      "the card back to the render; 'off' spends nothing and shows nothing " +
      "until the clip is finished.";
    for (const [value, label] of [
      [1, "every step"],
      [2, "every 2nd step"],
      [4, "every 4th step"],
      [0, "off - no live preview"],
    ]) {
      const option = el("option", "", label);
      option.value = String(value);
      if ((state.board.preview_every ?? 1) === value) option.selected = true;
      everySelect.appendChild(option);
    }
    everySelect.addEventListener("change", () => {
      const chosen = Number(everySelect.value);
      state.board.preview_every = Number.isFinite(chosen) ? chosen : 1;
      commit();
    });
    everyField.appendChild(everySelect);
    row.appendChild(everyField);
    const vaeField = el("div", "vig-cutter-field");
    vaeField.appendChild(el("label", "vig-cutter-label", "tiny_vae"));
    const vaeSelect = document.createElement("select");
    vaeSelect.className = "vig-cutter-select";
    vaeSelect.title =
      "Which tiny decoder draws the live preview. Off is latent2rgb -- one " +
      "linear map per latent cell, free, and 1/16 the size. Auto takes the " +
      "first decoder whose latents match this model's.";
    const chosen = typeof state.board.tiny_vae === "string"
      ? state.board.tiny_vae
      : (state.board.tiny_vae === false ? "" : model.TINY_VAE_AUTO);
    const offered = [
      ["", "off - latent2rgb"],
      [model.TINY_VAE_AUTO, "auto - the one that fits"],
    ];
    for (const one of state.tinyVaes || []) {
      const fits = Number(one.channels) === 24;
      offered.push([
        one.name,
        `${one.name}${one.channels ? ` - ${one.channels}ch` : ""}${fits ? "" : " - not H3"}`,
      ]);
    }
    if (chosen && !offered.some(([value]) => value === chosen)) {
      offered.push([chosen, `${chosen} - not in models/vae_approx`]);
    }
    for (const [value, label] of offered) {
      const option = el("option", "", label);
      option.value = value;
      if (value === chosen) option.selected = true;
      vaeSelect.appendChild(option);
    }
    vaeSelect.addEventListener("change", () => {
      state.board.tiny_vae = vaeSelect.value;
      commit();
    });
    vaeField.appendChild(vaeSelect);
    row.appendChild(vaeField);
    loadTinyVaes(renderPreviewRow);
  }
  function stepper(input, step, what) {
    input.classList.add("vig-cutter-nospin");
    const box = el("span", "vig-cutter-stepper");
    const arrows = el("span", "vig-cutter-steparrows");
    const press = (direction) => {
      const next = step(direction, Number.parseFloat(input.value));
      if (next === null || next === undefined || !Number.isFinite(next)) return;
      input.value = String(next);
      input.dispatchEvent(new Event("change"));
      paint();
    };
    const up = el("button", "up");
    const down = el("button", "down");
    for (const [button, direction, word] of [[up, 1, "up"], [down, -1, "down"]]) {
      button.type = "button";
      button.appendChild(svg(ICONS.chevron, 9, 2.4));
      button.title = `${what} ${word}`;
      button.dataset.log = `${what} ${word}`;
      button.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        press(direction);
      });
    }
    const paint = () => {
      const now = Number.parseFloat(input.value);
      up.disabled = input.disabled || step(1, now) === null;
      down.disabled = input.disabled || step(-1, now) === null;
    };
    input.addEventListener("input", paint);
    arrows.append(up, down);
    box.append(input, arrows);
    paint();
    return box;
  }
  const STEPS_LADDER = [4, 6, 8, 10, 20];
  const ladderStep = (ladder) => (direction, value) => {
    const now = Number.isFinite(value) ? value : ladder[0];
    const next = direction > 0
      ? ladder.find((rung) => rung > now)
      : [...ladder].reverse().find((rung) => rung < now);
    return next === undefined ? null : next;
  };
  const linearStep = (by, low, high, places = 0) => (direction, value) => {
    const now = Number.isFinite(value) ? value : low;
    const next = Number((now + direction * by).toFixed(places));
    return next < low || next > high ? null : next;
  };
  function numberWidget(name, width, min) {
    const input = document.createElement("input");
    input.type = "number";
    input.style.width = `${width}px`;
    input.min = String(min);
    input.value = String(options.getWidget ? options.getWidget(name) : "");
    input.addEventListener("change", () => {
      options.setWidget?.(name, Number(input.value) || min);
      renderControls();
      renderPlayers();
      renderDetail();
    });
    return input;
  }
  function comboWidget(name) {
    const select = document.createElement("select");
    select.className = "vig-cutter-select";
    const current = options.getWidget ? options.getWidget(name) : "";
    for (const value of (options.widgetOptions?.(name) || [current]).filter(Boolean)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      if (value === current) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", () => options.setWidget?.(name, select.value));
    return select;
  }
  const PPS = 30;
  const AUDIO_TRACK_PARKED = true;
  function updateContentWidth() {
    const cut = model.requestedSeconds(state.board.segments);
    const track = state.board.audio_clips.reduce((sum, c) => sum + c.seconds, 0);
    parts.scrollw.style.width = `${Math.max(cut, track) * PPS + 44}px`;
  }
  function askInsertSegmentAt(at, anchor) {
    if (!anchor) return insertSegmentAt(at);
    openModePopover(anchor, {
      heading: "insert a clip that is",
      modes: model.MODE_KEYS,
      current: at === 0 ? "t2va" : "i2va",
      onPick: (mode) => insertSegmentAt(at, mode),
    });
  }
  function insertSegmentAt(at, mode) {
    const segments = state.board.segments;
    if (segments.length >= model.MAX_SEGMENTS) return;
    const nextId = segments.length ? Math.max(...segments.map((s) => s.id)) + 1 : 1;
    const blank = model.blankSegment(nextId, 5, mode || (at === 0 ? "t2va" : "i2va"));
    segments.splice(at, 0, blank);
    syncClipFolders();
    state.board.selected_id = blank.id;
    model.normalise(state.board);
    commit();
    renderAll();
  }
  function renderTimeline() {
    renderFilmPull();
    parts.track.textContent = "";
    const segments = state.board.segments;
    const codes = model.timecodes(segments);
    state.videoBlocks = [];
    parts.dropMark = el("span", "vig-cutter-dropmark");
    parts.dropMark.style.display = "none";
    parts.track.appendChild(parts.dropMark);
    const spans = model.filmSpans(segments);
    const wantWaves = [];
    segments.forEach((seg, index) => {
      const meta = model.badgeFor(seg);
      const status = model.STATUSES[seg.status] || model.STATUSES.queued;
      const widthPx = seg.seconds * PPS;
      const block = el("div", "vig-cutter-vblock");
      block.style.width = `${widthPx}px`;
      block.dataset.segId = String(seg.id);
      const inner = el("div", "vig-cutter-vinner");
      inner.style.borderColor = meta.color;
      if (seg.source_clip) inner.style.borderStyle = "dashed";
      inner.style.backgroundColor = `${meta.color}22`;
      if (seg.id === state.board.selected_id) inner.style.boxShadow = "0 0 0 2px var(--cut-accent)";
      const poster = stillUrl(posterOf(seg));
      const still = el("div", "vig-cutter-vposter");
      if (poster) still.style.backgroundImage = `url("${poster}")`;
      inner.appendChild(still);
      inner.addEventListener("click", () => select(seg.id));
      inner.appendChild(el("div", "vig-cutter-vscrim"));
      const face = el("div", "vig-cutter-vface");
      const top = el("div");
      top.style.cssText = "display:flex;justify-content:space-between;align-items:center;gap:4px;min-width:0";
      const nameBadge = el("div", "vig-cutter-nbadge");
      nameBadge.appendChild(el("span", "idx", String(index + 1)));
      let nameLabel = null;
      if (widthPx >= 200) {
        nameLabel = el("span", "nm", seg.name || "Untitled scene");
        nameLabel.title = seg.name || "Untitled scene";
        nameBadge.appendChild(nameLabel);
      }
      const light = el("span");
      light.style.cssText =
        `width:7px;height:7px;border-radius:50%;background:${status.color};flex:0 0 auto;display:inline-block`;
      if (seg.status === "generating") light.style.animation = "vig-cutter-pulse 1s infinite";
      light.title = status.label;
      nameBadge.appendChild(light);
      if (seg.take_key && seg.take_key !== seg.cache_key) {
        const waiting = el("span");
        waiting.style.cssText =
          "width:7px;height:7px;border-radius:50%;flex:0 0 auto;display:inline-block;" +
          "border:2px solid var(--cut-accent-lit);box-sizing:border-box";
        waiting.title =
          "A newer take of this clip is in the gallery — the timeline still plays the " +
          "one it had. Open the gallery on this clip to watch them side by side.";
        nameBadge.appendChild(waiting);
      }
      const tools = el("div", "vig-cutter-nbadge");
      tools.style.padding = "2px 5px";
      const lock = el("button");
      lock.appendChild(svg(seg.locked ? ICONS.locked : ICONS.unlocked, 11, 2.5));
      lock.style.color = seg.locked ? "var(--cut-accent-lit)" : "var(--cut-dim)";
      lock.title = seg.locked
        ? "Locked: this clip stays out of a Run — pressing Generate segment on " +
          "it still renders, and the take goes to its gallery. " +
          "Change the steps, the canvas or the model and it is still this take — " +
          "the clip after it opens on this one, carried motion and all."
        : "Unlocked: re-rendered whenever the clip or the settings change";
      lock.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleLock(seg);
      });
      tools.append(lock);
      const modeChip = el("span", "vig-cutter-modechip", meta.label);
      modeChip.style.color = meta.color;
      modeChip.style.borderColor = meta.color;
      top.append(nameBadge, modeChip, tools);
      face.appendChild(top);
      const timeLabel = el(
        "span",
        "vig-cutter-timechip",
        `${model.formatClock(codes[index].start)}–${model.formatClock(codes[index].end)}`,
      );
      if (widthPx < 190) timeLabel.style.display = "none";
      face.appendChild(clipFacts(seg, index, segments, timeLabel));
      const footage = String(seg.source_clip || seg.clip || "");
      let wave = null;
      if (seg.audio && footage) {
        wave = el("div", "vig-cutter-vwave");
        const span = spans[index];
        const bars = Math.max(8, Math.min(120, Math.round(widthPx / 5)));
        const key = `${footage}|${span.start}|${span.end}|${bars}`;
        if (state.envelopes[key] !== undefined) {
          paintWave(wave, state.envelopes[key], meta.color);
        } else {
          wantWaves.push({ key, wave, color: meta.color, item: {
            clip: footage, bars, start: span.start / model.FPS, end: span.end / model.FPS,
          } });
        }
      }
      inner.appendChild(face);
      const foot = el("div", "vig-cutter-vfoot");
      if (wave) foot.appendChild(wave);
      const durChip = el("span", "vig-cutter-durchip", `${seg.seconds} s`);
      durChip.title =
        `${seg.seconds} s renders ${model.segmentFrames(seg)} frames = ` +
        `${model.framesToSeconds(model.segmentFrames(seg)).toFixed(2)} s`;
      foot.appendChild(durChip);
      inner.appendChild(foot);
      block.appendChild(inner);
      if (index === 0) {
        const seamLeft = el("button", "vig-cutter-seam");
        seamLeft.appendChild(svg(ICONS.plus, 9, 3));
        seamLeft.style.left = "-8px";
        seamLeft.title = "Insert clip before";
        seamLeft.addEventListener("click", (event) => {
          event.stopPropagation();
          askInsertSegmentAt(0, seamLeft);
        });
        seamLeft.addEventListener("pointerdown", (event) => event.stopPropagation());
        block.appendChild(seamLeft);
      }
      const seamRight = el("button", "vig-cutter-seam");
      seamRight.appendChild(svg(ICONS.plus, 9, 3));
      seamRight.style.right = "-8px";
      seamRight.title = "Insert clip after";
      seamRight.addEventListener("click", (event) => {
        event.stopPropagation();
        askInsertSegmentAt(index + 1, seamRight);
      });
      seamRight.addEventListener("pointerdown", (event) => event.stopPropagation());
      block.appendChild(seamRight);
      if (!seg.locked) {
        for (const where of ["top", "bottom"]) {
          const handle = el("div", `vig-cutter-vhandle ${where}`);
          handle.title = "Drag to change this clip's length; the clips after it shift";
          handle.addEventListener("pointerdown", (event) => beginSeamDrag(event, index, handle));
          block.appendChild(handle);
        }
      }
      block.addEventListener("pointerdown", (event) => beginMoveDrag(event, index));
      parts.track.appendChild(block);
      state.videoBlocks.push({ block, timeLabel, durChip, nameLabel, light });
    });
    loadWaves(wantWaves);
    updateContentWidth();
    renderCounts();
    renderProjectTotals();
    paintVeils();
  }
  function clipFacts(seg, index, segments, lead) {
    const row = el("div", "vig-cutter-vfacts");
    row.append(el("span", "vig-cutter-vfacts-post"), el("span", "vig-cutter-vfacts-corner"));
    if (lead) row.appendChild(lead);
    const fact = (text, title, tone = "") => {
      const chip = el("span", `vig-cutter-factchip ${tone}`.trim(), text);
      chip.title = title;
      row.appendChild(chip);
      return chip;
    };
    const number = (i) => i + 1;
    const latent = (frames, icon, leftward, iconFirst, title) => {
      const chip = fact("", title, "latent");
      const mark = svg(icon, 10, 2.2);
      if (leftward) mark.classList.add("flip");
      const count = el("span", "", String(frames));
      if (iconFirst) chip.append(mark, count);
      else chip.append(count, mark);
    };
    const fromFront = model.carriedRun(seg);
    const fromBehind = model.carriedTail(seg);
    if (fromFront) {
      latent(fromFront, ICONS.latentin, false, true, `Receives a ${fromFront}-frame latent run ` +
        `from the end of clip ${number(index - 1)} — it continues that recording.`);
    }
    if (fromBehind) {
      latent(fromBehind, ICONS.latentin, true, false, `Receives a ${fromBehind}-frame latent run ` +
        `from the head of clip ${number(index + 1)} — it is generated to arrive there.`);
    }
    const after = segments[index + 1];
    const before = segments[index - 1];
    const toNext = after ? model.carriedRun(after) : 0;
    const toPrev = before ? model.carriedTail(before) : 0;
    if (toPrev) {
      latent(toPrev, ICONS.latentout, true, true, `Hands a ${toPrev}-frame latent run from its ` +
        `head back to clip ${number(index - 1)}, which is generated to arrive at it.`);
    }
    if (toNext) {
      latent(toNext, ICONS.latentout, false, false, `Hands a ${toNext}-frame latent run from its ` +
        `end to clip ${number(index + 1)}, which continues it.`);
    }
    if ((state.board.project_dir || "").trim()) {
      const known = takeCountsOf()[seg.id];
      const takes = fact("", "Takes of this clip in its gallery — renders kept in the project folder.",
        "takes");
      takes.appendChild(svg(ICONS.clapper, 11, 2));
      const count = el("span", "", known === undefined ? "…" : String(known));
      takes.appendChild(count);
      if (known === 0) takes.classList.add("none");
      if (known === undefined) {
        countTakes(seg, index, {
          get isConnected() { return takes.isConnected; },
          set textContent(value) {
            const n = Number(value) || 0;
            count.textContent = String(n);
            takes.classList.toggle("none", n === 0);
          },
          style: {},
        });
      }
    }
    const refs = (seg.refs || []).filter((r) => !/^(first|last)-/.test(String(r.uid || "")));
    if (refs.length) {
      fact(`${refs.length} ref${refs.length === 1 ? "" : "s"}`,
        refs.map((r) => (r.tag ? `@${r.tag}` : r.kind) + (r.label ? ` — ${r.label}` : "")).join("\n"));
    }
    const footage = String(seg.source_clip || seg.clip || "");
    const size = footage && state.clipSizes[footage];
    const megapixels = (w, h) => `${((w * h) / 1e6).toFixed(1)} MP`;
    const says = (w, h) => `${w}×${h} — the footage this clip plays.`;
    if (size) {
      fact(megapixels(size.width, size.height), says(size.width, size.height));
    } else if (footage) {
      const chip = fact("… MP", "Reading the footage's size.");
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;
      probe.onloadedmetadata = () => {
        const width = probe.videoWidth;
        const height = probe.videoHeight;
        probe.removeAttribute("src");
        if (!(width > 0 && height > 0)) return;
        state.clipSizes[footage] = { width, height };
        if (!chip.isConnected) return;
        chip.textContent = megapixels(width, height);
        chip.title = says(width, height);
      };
      probe.src = stillUrl(footage);
    } else {
      const now = canvas();
      fact(megapixels(now.width, now.height),
        `Not rendered yet — ${now.width}×${now.height} is the canvas it will render at.`, "none");
    }
    return row;
  }
  function paintWave(wave, envelope, color) {
    wave.textContent = "";
    if (!envelope || !Array.isArray(envelope.bars)) {
      wave.title = "This clip's sound could not be read.";
      return;
    }
    const accents = Array.isArray(envelope.accents) ? envelope.accents : [];
    envelope.bars.forEach((value, i) => {
      const bar = el("i", accents[i] ? "accent" : "");
      bar.style.background = color;
      bar.style.height = `${Math.max(6, Math.round(value * 100))}%`;
      wave.appendChild(bar);
    });
    wave.title = envelope.peak_db <= -100
      ? "This clip is silent."
      : `The clip's sound: ${envelope.rms_db} dBFS on average, peaking at ${envelope.peak_db} dBFS. ` +
        `The bars run from ${envelope.floor_db} to ${envelope.ceil_db} dBFS, squared so the loud ` +
        `stands out — the same for every clip — and the bright ones stand ${envelope.accent_db} dB ` +
        "or more above this clip's own level.";
  }
  function loadWaves(wanted) {
    const fresh = wanted.filter((want) => !state.envelopesAsked.has(want.key));
    if (!fresh.length || typeof options.callRoute !== "function") return;
    for (const want of fresh) state.envelopesAsked.add(want.key);
    options.callRoute(ENVELOPES_ROUTE, { items: fresh.map((want) => want.item) })
      .then((data) => {
        const answers = (data && data.envelopes) || [];
        fresh.forEach((want, i) => {
          state.envelopes[want.key] = answers[i] || null;
          if (want.wave.isConnected) paintWave(want.wave, answers[i] || null, want.color);
        });
      })
      .catch(() => {
        for (const want of fresh) state.envelopesAsked.delete(want.key);
      });
  }
  function renderCounts() {
    const segments = state.board.segments;
    const tally = { ready: 0, generating: 0, queued: 0, stale: 0, error: 0 };
    for (const seg of segments) tally[seg.status] = (tally[seg.status] || 0) + 1;
    const rest = [
      tally.generating && `${tally.generating} rendering`,
      tally.stale && `${tally.stale} changed`,
      tally.error && `${tally.error} failed`,
      tally.queued && `${tally.queued} queued`,
    ].filter(Boolean);
    parts.counts.textContent = [`${tally.ready} ready`, ...rest].join(" · ");
    parts.counts.title =
      `${tally.ready} ready, ${tally.generating} generating, ${tally.stale} changed ` +
      `since render, ${tally.error} failed, ${tally.queued} queued`;
    parts.barFill.style.width = `${segments.length ? (tally.ready / segments.length) * 100 : 0}%`;
  }
  function updateTrackGeometry() {
    const segments = state.board.segments;
    const codes = model.timecodes(segments);
    (state.videoBlocks || []).forEach((drawn, index) => {
      const seg = segments[index];
      if (!seg || !drawn) return;
      drawn.block.style.width = `${seg.seconds * PPS}px`;
      if (drawn.durChip) drawn.durChip.textContent = `${seg.seconds} s`;
      if (drawn.timeLabel) {
        drawn.timeLabel.textContent =
          `${model.formatClock(codes[index].start)}–${model.formatClock(codes[index].end)}`;
        drawn.timeLabel.style.display = seg.seconds * PPS < 190 ? "none" : "";
      }
    });
    updateContentWidth();
  }
  function updateSegmentBadge(seg) {
    const drawn = (state.videoBlocks || [])[state.board.segments.indexOf(seg)];
    if (!drawn) return;
    if (drawn.nameLabel) {
      drawn.nameLabel.textContent = seg.name || "Untitled scene";
      drawn.nameLabel.title = seg.name || "Untitled scene";
    }
    const status = model.STATUSES[seg.status] || model.STATUSES.queued;
    if (drawn.light) {
      drawn.light.style.background = status.color;
      drawn.light.style.animation =
        seg.status === "generating" ? "vig-cutter-pulse 1s infinite" : "";
      drawn.light.title = status.label;
    }
    renderCounts();
  }
  function beginSeamDrag(event, index, handle) {
    event.preventDefault();
    event.stopPropagation();
    const seg = state.board.segments[index];
    if (!seg || seg.locked) return;
    if (model.madeAt(seg.made_frames) === null && seg.clip && !seg.source_clip) {
      seg.made_frames = model.deliveredFrames(seg);
    }
    const startX = event.clientX;
    const startSeconds = seg.seconds;
    let moved = false;
    handle.dataset.dragging = "true";
    const scale = pxScale(parts.track);
    const move = (moveEvent) => {
      const travelled = moveEvent.clientX - startX;
      if (Math.abs(travelled) > 2) moved = true;
      const next = model.snapSeconds(
        startSeconds + travelled / scale / PPS,
        model.maxSecondsFor(seg),
      );
      if (next !== seg.seconds) {
        seg.seconds = next;
        updateTrackGeometry();
        renderDetailTimes();
      }
    };
    const up = (upEvent) => {
      handle.removeAttribute("data-dragging");
      handle.releasePointerCapture?.(upEvent?.pointerId);
      window.removeEventListener("pointermove", move, DRAG_PHASE);
      window.removeEventListener("pointerup", up, DRAG_PHASE);
      window.removeEventListener("pointercancel", up, DRAG_PHASE);
      if (!moved) return;
      const swallow = (clickEvent) => {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      if (seg.seconds !== startSeconds && seg.status === "ready") seg.status = "stale";
      commit();
      renderTimeline();
      renderDetail();
      renderPlayers();
    };
    window.addEventListener("pointermove", move, DRAG_PHASE);
    window.addEventListener("pointerup", up, DRAG_PHASE);
    window.addEventListener("pointercancel", up, DRAG_PHASE);
    tryCapture(handle, event.pointerId);
  }
  function beginMoveDrag(event, index) {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target && event.target.closest && event.target.closest("button")) return;
    if (event.target && getComputedStyle(event.target).cursor === "col-resize") return;
    const startX = event.clientX;
    let active = false;
    const drawn = (state.videoBlocks || [])[index];
    const scale = pxScale(parts.track);
    const targetAt = (clientX) => {
      const rect = parts.track.getBoundingClientRect();
      const x = (clientX - rect.left) / scale;
      const segments = state.board.segments;
      let acc = 0;
      for (let i = 0; i < segments.length; i += 1) {
        const width = segments[i].seconds * PPS;
        if (x < acc + width / 2) return { target: i, px: acc };
        acc += width;
      }
      return { target: segments.length, px: acc };
    };
    const move = (moveEvent) => {
      if (!active && Math.abs(moveEvent.clientX - startX) < 6) return;
      if (!active) {
        active = true;
        if (drawn) drawn.block.style.opacity = "0.45";
      }
      moveEvent.preventDefault();
      const found = targetAt(moveEvent.clientX);
      parts.dropMark.style.display = "";
      parts.dropMark.style.left = `${found.px - 1}px`;
    };
    const up = (upEvent) => {
      window.removeEventListener("pointermove", move, DRAG_PHASE);
      window.removeEventListener("pointerup", up, DRAG_PHASE);
      window.removeEventListener("pointercancel", up, DRAG_PHASE);
      parts.dropMark.style.display = "none";
      if (drawn) drawn.block.style.opacity = "";
      if (!active) return;
      const swallow = (clickEvent) => {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      const found = targetAt(upEvent.clientX);
      let to = found.target;
      if (to > index) to -= 1;
      if (to === index) return;
      const segments = state.board.segments;
      const [movedSeg] = segments.splice(index, 1);
      segments.splice(to, 0, movedSeg);
      syncClipFolders();
      state.board.selected_id = movedSeg.id;
      model.normalise(state.board);
      commit();
      renderAll();
    };
    window.addEventListener("pointermove", move, DRAG_PHASE);
    window.addEventListener("pointerup", up, DRAG_PHASE);
    window.addEventListener("pointercancel", up, DRAG_PHASE);
  }
  function select(id) {
    state.board.selected_id = id;
    state.followRun = false;
    commit();
    renderTimeline();
    renderDetail();
    renderPlayers();
  }
  function insertAudioAt(at) {
    const clips = state.board.audio_clips;
    if (clips.length >= model.MAX_AUDIO_CLIPS) return;
    const id = clips.length ? Math.max(...clips.map((c) => c.id)) + 1 : 1;
    clips.splice(at, 0, { id, seconds: 5, muted: false, locked: false, label: "", source: "", gain: 0.5 });
    commit();
    renderAudioTrack();
  }
  function renderAudioTrack() {
    parts.atrack.textContent = "";
    const clips = state.board.audio_clips;
    const parked = AUDIO_TRACK_PARKED && !clips.length;
    parts.audioRow.style.display = parked ? "none" : "";
    parts.atrack.style.display = parked ? "none" : "";
    if (parked) {
      state.audioBlocks = [];
      updateContentWidth();
      return;
    }
    const film = model.totalSeconds(state.board.segments);
    const track = clips.reduce((sum, c) => sum + c.seconds, 0);
    state.audioBlocks = [];
    parts.atrackLabel.textContent =
      "audio track — laid over the clips' own sound, on the film's clock" +
      (track > 0 ? `: ${track.toFixed(1)} s of ${film.toFixed(1)} s` : "");
    parts.removeTrack.style.display = clips.length ? "" : "none";
    let cursor = 0;
    clips.forEach((clip, index) => {
      const start = cursor;
      cursor += clip.seconds;
      const past = start >= film;
      const straddles = !past && cursor > film;
      const block = el("div", "vig-cutter-ablock");
      block.style.width = `${clip.seconds * PPS}px`;
      const inner = el("div", "vig-cutter-ainner");
      inner.style.opacity = clip.muted ? "0.3" : "1";
      if (past || straddles) inner.style.borderStyle = "dashed";
      inner.title = `click to ${clip.muted ? "unmute" : "mute"}`;
      inner.addEventListener("click", () => {
        clip.muted = !clip.muted;
        commit();
        renderAudioTrack();
      });
      for (const value of model.placeholderWave(clip.id * 17)) {
        const bar = el("i");
        bar.style.height = `${Math.round(value * 100)}%`;
        inner.appendChild(bar);
      }
      block.appendChild(inner);
      const caption = el(
        "div",
        "vig-cutter-acap",
        `${clip.label || "audio"} · gain ${clip.gain.toFixed(2)}` +
          (past || straddles ? " — tail past the film, not mixed" : ""),
      );
      block.appendChild(caption);
      const badge = el("div", "vig-cutter-abadge");
      const upload = el("button");
      upload.appendChild(svg(ICONS.upload, 11, 2.2));
      upload.title = "Upload audio";
      upload.addEventListener("click", async (event) => {
        event.stopPropagation();
        const asset = await pick("audio");
        if (!asset) return;
        clip.source = asset.source;
        clip.label = asset.label;
        commit();
        renderAudioTrack();
      });
      const gainButton = el("button", "", "♪");
      gainButton.style.fontSize = "11px";
      gainButton.title = `Gain (${clip.gain.toFixed(2)})`;
      gainButton.addEventListener("click", async (event) => {
        event.stopPropagation();
        const value = await askInPanel(
          "Gain for this clip",
          "1 lays it in as recorded; 0.3 is a bed under dialogue.",
          "Set", "Cancel", String(clip.gain),
        );
        if (value === null) return;
        const gain = Number.parseFloat(value);
        if (!Number.isFinite(gain)) return;
        clip.gain = Math.max(0, Math.min(4, gain));
        commit();
        renderAudioTrack();
      });
      const lock = el("button");
      lock.appendChild(svg(clip.locked ? ICONS.locked : ICONS.unlocked, 11, 2.2));
      lock.style.color = clip.locked ? "var(--cut-accent-lit)" : "";
      lock.title = clip.locked ? "Unlock" : "Lock length and file";
      lock.addEventListener("click", (event) => {
        event.stopPropagation();
        clip.locked = !clip.locked;
        commit();
        renderAudioTrack();
      });
      const trash = el("button");
      trash.appendChild(svg(ICONS.trash, 11, 2.2));
      trash.title = "Delete clip";
      trash.addEventListener("click", (event) => {
        event.stopPropagation();
        state.board.audio_clips = clips.filter((c) => c.id !== clip.id);
        commit();
        renderAudioTrack();
      });
      badge.append(upload, gainButton, lock, trash);
      block.appendChild(badge);
      if (index === 0) {
        const seamLeft = el("button", "vig-cutter-seam blue");
        seamLeft.appendChild(svg(ICONS.plus, 9, 3));
        seamLeft.style.left = "-8px";
        seamLeft.title = "Insert clip before";
        seamLeft.addEventListener("click", (event) => {
          event.stopPropagation();
          insertAudioAt(0);
        });
        block.appendChild(seamLeft);
      }
      const seamRight = el("button", "vig-cutter-seam blue");
      seamRight.appendChild(svg(ICONS.plus, 9, 3));
      seamRight.style.right = "-8px";
      seamRight.title = "Insert clip after";
      seamRight.addEventListener("click", (event) => {
        event.stopPropagation();
        insertAudioAt(index + 1);
      });
      block.appendChild(seamRight);
      if (!clip.locked) {
        const handle = el("div", "vig-cutter-ahandle");
        handle.addEventListener("pointerdown", (event) => beginAudioDrag(event, index, handle));
        block.appendChild(handle);
      }
      parts.atrack.appendChild(block);
      state.audioBlocks.push(block);
    });
    if (!clips.length) {
      const add = el("button", "vig-cutter-aempty");
      add.appendChild(svg(ICONS.plus, 13, 2.4));
      add.appendChild(el("span", "", "add audio clip"));
      add.title = "Add the first audio clip";
      add.addEventListener("click", () => {
        const seconds = Math.max(1, Math.min(60, Math.round(film))) || 5;
        state.board.audio_clips = [
          { id: 1, seconds, muted: false, locked: false, label: "", source: "", gain: 0.5 },
        ];
        commit();
        renderAudioTrack();
      });
      parts.atrack.appendChild(add);
    }
    if (track > film + 0.5 && film > 0) {
      const mark = el("div", "vig-cutter-endmark");
      mark.style.left = `${film * PPS}px`;
      mark.title = `The film ends at ${model.formatClock(film)}. Nothing past this is mixed.`;
      parts.atrack.appendChild(mark);
    }
    updateContentWidth();
  }
  function updateAudioGeometry() {
    const clips = state.board.audio_clips;
    (state.audioBlocks || []).forEach((block, index) => {
      const clip = clips[index];
      if (block && clip) block.style.width = `${clip.seconds * PPS}px`;
    });
    updateContentWidth();
  }
  function beginAudioDrag(event, index, handle) {
    event.preventDefault();
    event.stopPropagation();
    const clip = state.board.audio_clips[index];
    if (!clip || clip.locked) return;
    const startX = event.clientX;
    const startSeconds = clip.seconds;
    let moved = false;
    handle.dataset.dragging = "true";
    const scale = pxScale(parts.track);
    const move = (moveEvent) => {
      const delta = (moveEvent.clientX - startX) / scale / PPS;
      const next = Math.round(Math.max(0.5, Math.min(60, startSeconds + delta)) * 2) / 2;
      if (Math.abs(moveEvent.clientX - startX) > 2) moved = true;
      if (next !== clip.seconds) {
        clip.seconds = next;
        updateAudioGeometry();
      }
    };
    const up = (upEvent) => {
      handle.removeAttribute("data-dragging");
      handle.releasePointerCapture?.(upEvent?.pointerId);
      window.removeEventListener("pointermove", move, DRAG_PHASE);
      window.removeEventListener("pointerup", up, DRAG_PHASE);
      window.removeEventListener("pointercancel", up, DRAG_PHASE);
      if (!moved) return;
      const swallow = (clickEvent) => {
        clickEvent.stopPropagation();
        clickEvent.preventDefault();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
      commit();
      renderAudioTrack();
    };
    window.addEventListener("pointermove", move, DRAG_PHASE);
    window.addEventListener("pointerup", up, DRAG_PHASE);
    window.addEventListener("pointercancel", up, DRAG_PHASE);
    tryCapture(handle, event.pointerId);
  }
  function renderDetail() {
    closePopovers();
    if (parts.promptWatch) {
      parts.promptWatch.disconnect();
      parts.promptWatch = null;
    }
    parts.detail.textContent = "";
    const seg = selected();
    if (!seg) return;
    const index = state.board.segments.indexOf(seg);
    const { ratio } = canvas();
    const headRow = el("div", "vig-cutter-inline");
    headRow.style.cssText = "gap:12px;align-items:center;flex-wrap:wrap";
    if (state.nameEdit !== null && state.nameEdit !== seg.id) state.nameEdit = null;
    const editingName = state.nameEdit === seg.id;
    const clipName = nameField({
      value: seg.name || "",
      placeholder: "Untitled scene",
      open: editingName,
      title: "Rename this clip",
      text: (value, placeholder) => {
        const span = el("span");
        span.textContent = value || placeholder;
        span.style.cssText =
          "font-size:20px;font-weight:600;white-space:nowrap;overflow:hidden;" +
          `text-overflow:ellipsis;min-width:0;color:${value ? "var(--cut-bright)" : "var(--cut-faint)"}`;
        return span;
      },
      input: "width:320px;max-width:100%;font-size:20px;font-weight:600",
      onInput: (text) => {
        seg.name = text;
        updateSegmentBadge(seg);
        if (seg === selected() && parts.clipTitle && parts.clipTitle.isConnected) {
          parts.clipTitle.textContent = text || "Untitled scene";
          parts.clipTitle.style.color = text ? "var(--cut-bright)" : "var(--cut-faint)";
        }
        commitSoon();
      },
      onOpen: () => {
        if (state.nameEdit === seg.id) return;
        state.nameEdit = seg.id;
        renderDetail();
      },
      onClose: () => {
        if (state.nameEdit !== seg.id) return;
        state.nameEdit = null;
        flushCommit();
        renderDetail();
      },
    });
    const headTools = el("div", "vig-cutter-inline");
    headTools.style.cssText = "gap:6px;align-items:center;flex:0 0 auto";
    headTools.appendChild(clipName.pencil);
    clipName.pencil.dataset.lockfree = "1";
    if (clipName.input) clipName.input.dataset.lockfree = "1";
    const headBin = el("button", "vig-cutter-icon");
    headBin.appendChild(svg(ICONS.trash, 14, 2.2));
    headBin.style.color = "var(--cut-dim)";
    headBin.disabled = !!seg.locked;
    headBin.title = seg.locked
      ? "This clip is locked — unlock it first"
      : "Delete this clip";
    headBin.dataset.log = "delete clip";
    headBin.addEventListener("click", () => deleteSegment(seg, index));
    headTools.appendChild(headBin);
    const headLock = el("button", "vig-cutter-icon");
    headLock.appendChild(svg(seg.locked ? ICONS.locked : ICONS.unlocked, 14, 2.2));
    headLock.style.color = seg.locked ? "var(--cut-accent-lit)" : "var(--cut-dim)";
    headLock.title = seg.locked
      ? "Locked: nothing touches this clip — it stays out of a Run, and every tool " +
        "that would change it is inactive: its script, prompt, settings, references, " +
        "the frames on its film strip, render and the bin. Press to unlock."
      : "Unlocked. Locking settles this clip: nothing can change it until it is unlocked.";
    headLock.dataset.log = "lock clip";
    headLock.dataset.lockfree = "1";
    headLock.addEventListener("click", () => {
      toggleLock(seg);
    });
    headTools.appendChild(headLock);
    const galleryButton = el("button", "vig-cutter-icon");
    galleryButton.style.cssText = "position:relative;color:var(--cut-accent-lit)";
    galleryButton.appendChild(svg(ICONS.photos, 15, 1.9));
    const count = takeCountsOf()[seg.id];
    const countPip = el("span", "vig-cutter-pip", count === undefined ? "" : String(count));
    if (count === undefined || count === 0) countPip.style.display = "none";
    galleryButton.appendChild(countPip);
    galleryButton.title = "Open this clip's takes gallery";
    galleryButton.dataset.log = "takes gallery";
    galleryButton.dataset.lockfree = "1";
    galleryButton.addEventListener("click", () => openTakes(seg, index));
    headTools.appendChild(galleryButton);
    countTakes(seg, index, countPip);
    const headSpring = el("span");
    headSpring.style.cssText = "flex:1 1 auto;min-width:8px";
    const headMode = el("span", "vig-cutter-modechip", model.badgeFor(seg).label);
    headMode.style.color = model.badgeFor(seg).color;
    headMode.style.borderColor = model.badgeFor(seg).color;
    headMode.style.marginLeft = "10px";
    headMode.title = (model.MODES[seg.mode] || {}).title || "This clip's mode";
    parts.detailTime = el("span", "vig-cutter-pill");
    parts.detailTime.title = "Where this clip falls in the film, and how long it runs";
    const frames = model.deliveredFrames(seg);
    const rendered = model.framesToSeconds(frames);
    const run = model.carriedRun(seg);
    const frameChip = el("span", "vig-cutter-pill", `${frames} frames`);
    frameChip.title =
      `Cut to ${seg.seconds} s; H3 renders ${rendered.toFixed(2)} s, ${frames} frames. The ` +
      "model generates on a 17k+5 frame grid and a length is snapped up to the next " +
      "position on it — of the ten lengths the console offers, only 8 s lands exactly." +
      (run ? `\nThis clip carries ${run} frames from the one before it.` : "");
    const headFacts = el("div", "vig-cutter-inline");
    headFacts.style.cssText = "gap:6px;align-items:center;margin-left:10px;flex:0 0 auto";
    headFacts.append(parts.detailTime, frameChip);
    headRow.append(clipName.box, headTools, headSpring, headMode, headFacts);
    const knobs = el("div");
    knobs.style.cssText = "display:flex;flex-direction:column;gap:8px;min-width:0";
    const knobsSample = el("div", "vig-cutter-row");
    knobsSample.style.cssText = "align-items:flex-end;gap:10px";
    const knobsWriter = el("div", "vig-cutter-row");
    knobsWriter.style.cssText = "align-items:flex-end;gap:10px";
    const knobsLook = el("div", "vig-cutter-row");
    knobsLook.style.cssText = "align-items:flex-end;gap:10px";
    knobs.append(knobsSample, knobsWriter, knobsLook);
    function knobField(labelText, controls, { badge = null, row = null } = {}) {
      const field = el("div", "vig-cutter-field");
      const label = el("label", "vig-cutter-label");
      label.style.cssText = "display:flex;align-items:center;gap:4px";
      label.appendChild(el("span", "", labelText));
      if (badge) label.appendChild(badge);
      field.appendChild(label);
      const line = el("div", "vig-cutter-inline");
      line.append(...(Array.isArray(controls) ? controls : [controls]));
      field.appendChild(line);
      (row || knobs).appendChild(field);
      return field;
    }
    const segSeed = document.createElement("input");
    segSeed.type = "number";
    segSeed.value = String(seg.seed);
    segSeed.className = "vig-cutter-nospin vig-cutter-seedbox";
    segSeed.style.width = "124px";
    segSeed.addEventListener("change", (event) => {
      seg.seed = Math.max(0, Number.parseInt(event.target.value, 10) || 0);
      if (seg.status === "ready") seg.status = "stale";
      commit();
      renderTimeline();
      seedClear.disabled = !seg.seed;
    });
    const seedBox = el("span", "vig-cutter-clearable");
    const seedClear = el("button", "vig-cutter-clear");
    seedClear.appendChild(svg(ICONS.cross, 9, 2.4));
    seedClear.title = "Clear the seed back to 0 (0 is itself a seed: the clip renders from it)";
    seedClear.disabled = !seg.seed;
    seedClear.addEventListener("click", () => {
      if (!seg.seed) return;
      seg.seed = 0;
      if (seg.status === "ready") seg.status = "stale";
      commit();
      renderTimeline();
      renderDetail();
    });
    seedBox.append(segSeed, seedClear);
    const seedModes = seedModeIcons(
      seedModeOf(state.board),
      "a clip renders",
      (mode) => {
        state.board.seed_mode = mode;
        commit();
        renderDetail();
      },
      () => {
        seg.seed = randomSeed();
        if (seg.status === "ready") seg.status = "stale";
        commit();
        renderTimeline();
        renderDetail();
      },
    );
    knobField("video seed", seedBox, { badge: seedModes, row: knobsSample });
    const writerSeed = document.createElement("input");
    writerSeed.type = "number";
    writerSeed.className = "vig-cutter-nospin vig-cutter-seedbox";
    writerSeed.style.width = "124px";
    writerSeed.min = "0";
    writerSeed.value = String(state.board.writer.seed ?? 0);
    writerSeed.title =
      "The seed the WRITING model runs on. Board-wide — the same writer serves " +
      "every clip — so changing it here changes it in section 1 too. Roll it for " +
      "a differently worded prompt from the same script. 0 is NO seed: none is " +
      "sent, and the model's server picks its own every pass.";
    writerSeed.addEventListener("change", () => {
      state.board.writer.seed = Math.max(0, Number(writerSeed.value) || 0);
      commit();
      renderAgentRow();
      writerClear.disabled = !state.board.writer.seed;
    });
    const writerBox = el("span", "vig-cutter-clearable");
    const writerClear = el("button", "vig-cutter-clear");
    writerClear.appendChild(svg(ICONS.cross, 9, 2.4));
    writerClear.title =
      "Clear the writer's seed back to 0 — no seed: the model's server picks its own every pass";
    writerClear.dataset.log = "clear writer seed";
    writerClear.disabled = !state.board.writer.seed;
    writerClear.addEventListener("click", () => {
      if (!state.board.writer.seed) return;
      state.board.writer.seed = 0;
      writerSeed.value = "0";
      writerClear.disabled = true;
      commit();
      renderAgentRow();
    });
    writerBox.append(writerSeed, writerClear);
    const writerModes = seedModeIcons(
      seedModeOf({ seed_mode: state.board.writer_seed_mode }),
      "the agent writes a prompt",
      (mode) => {
        state.board.writer_seed_mode = mode;
        commit();
        renderDetail();
      },
      () => {
        state.board.writer.seed = randomSeed();
        writerSeed.value = String(state.board.writer.seed);
        writerClear.disabled = false;
        commit();
        renderAgentRow();
      },
    );
    knobField("writer seed", writerBox, { badge: writerModes, row: knobsWriter });
    const styleSelect = document.createElement("select");
    styleSelect.className = "vig-cutter-select";
    styleSelect.style.width = "124px";
    styleSelect.style.maxWidth = "124px";
    const neutralOption = el("option", "", "neutral");
    neutralOption.value = "";
    neutralOption.selected = !seg.style || seg.style === "neutral";
    styleSelect.appendChild(neutralOption);
    const styleIds = state.agent.styles.filter((id) => id !== "neutral");
    if (seg.style && seg.style !== "neutral" && !styleIds.includes(seg.style)) {
      styleIds.unshift(seg.style);
    }
    for (const id of styleIds) {
      const option = el("option", "", id);
      option.value = id;
      if (id === seg.style) option.selected = true;
      styleSelect.appendChild(option);
    }
    styleSelect.title =
      "The way this clip is shot: lens, light, palette, editing rhythm. The agent " +
      "writes the prompt in this style; neutral imposes nothing.";
    styleSelect.addEventListener("change", () => {
      seg.style = styleSelect.value;
      commit();
    });
    const cameraSelect = document.createElement("select");
    cameraSelect.className = "vig-cutter-select";
    cameraSelect.style.maxWidth = "134px";
    const freeCamera = el("option", "", "style decides");
    freeCamera.value = "";
    cameraSelect.appendChild(freeCamera);
    for (const motion of model.CAMERA_MOTIONS) {
      const option = el("option", "", motion);
      option.value = motion;
      if (motion === seg.camera) option.selected = true;
      cameraSelect.appendChild(option);
    }
    cameraSelect.title =
      "Pin this clip's camera move (the guide's own vocabulary). It outranks the " +
      "style's habit when the agent writes the prompt.";
    const modifierFor = (values, current, labels) => {
      const select = document.createElement("select");
      select.className = "vig-cutter-select";
      select.style.maxWidth = "72px";
      for (const value of values) {
        const option = el("option", "", value === "" ? labels : value);
        option.value = value;
        if (value === current) option.selected = true;
        select.appendChild(option);
      }
      return select;
    };
    const ampSelect = modifierFor(model.CAMERA_AMPLITUDES, seg.camera_amplitude, "auto");
    const speedSelect = modifierFor(model.CAMERA_SPEEDS, seg.camera_speed, "auto");
    const noModifiers = model.MOTIONS_WITHOUT_MODIFIERS.has(seg.camera) || !seg.camera;
    ampSelect.disabled = noModifiers;
    speedSelect.disabled = noModifiers;
    const offWhy = !seg.camera
      ? " Pin a camera move first."
      : noModifiers ? ` "${seg.camera}" takes no size or speed.` : "";
    ampSelect.title =
      "How far the framing travels during the move: small or large. Auto lets the " +
      "writer and the style decide." + offWhy;
    speedSelect.title =
      "How fast the camera moves: slow or fast. Auto lets the writer and the style " +
      "decide." + offWhy;
    cameraSelect.addEventListener("change", () => {
      seg.camera = cameraSelect.value;
      if (model.MOTIONS_WITHOUT_MODIFIERS.has(seg.camera) || !seg.camera) {
        seg.camera_amplitude = "";
        seg.camera_speed = "";
      }
      commit();
      renderDetail();
    });
    ampSelect.addEventListener("change", () => {
      seg.camera_amplitude = ampSelect.value;
      commit();
    });
    speedSelect.addEventListener("change", () => {
      seg.camera_speed = speedSelect.value;
      commit();
    });
    knobField("style", styleSelect, { row: knobsLook });
    knobField("camera", cameraSelect, { row: knobsLook });
    knobField("move size", ampSelect, { row: knobsLook });
    knobField("move speed", speedSelect, { row: knobsLook });
    const chosenSkills = () =>
      (Array.isArray(seg.skills) ? seg.skills : []).filter(Boolean);
    const skillButton = el("button", "vig-cutter-select");
    skillButton.style.cssText = "max-width:170px;text-align:left;cursor:pointer";
    skillButton.dataset.log = "skills";
    const saySkills = () => {
      const picked = chosenSkills();
      skillButton.textContent = picked.length
        ? `${picked.length} chosen ▾`
        : "the agent decides ▾";
      skillButton.title = picked.length
        ? "This clip's writer may read only these:\n" + picked.join("\n") +
          "\n\nThe direction skill and MiniMax's own prompt-writing skill are " +
          "always read on top of them — the agent's first instruction names both."
        : "The writer is handed the whole catalogue and picks for itself. " +
          "Tick some to narrow it to a clip that needs one particular brief.";
    };
    saySkills();
    const paintSkillRows = (holder) => {
      holder.textContent = "";
      const known = state.agent.skills;
      if (!known) {
        holder.appendChild(el("div", "vig-cutter-mono", "reading the catalogue…"));
        return;
      }
      if (!known.length) {
        holder.appendChild(
          el("div", "vig-cutter-mono", "no skills found — is the extension folder complete?"),
        );
        return;
      }
      const picked = new Set(chosenSkills());
      for (const skill of known) {
        const row = el("label", "vig-cutter-skillrow");
        const tick = document.createElement("input");
        tick.type = "checkbox";
        tick.checked = picked.has(skill.id);
        const always = (state.agent.alwaysSkills || []).includes(skill.id);
        if (always) {
          tick.checked = true;
          tick.disabled = true;
        }
        tick.addEventListener("change", () => {
          if (always) return;
          const now = new Set(chosenSkills());
          if (tick.checked) now.add(skill.id);
          else now.delete(skill.id);
          seg.skills = [...now];
          markStale(seg);
          saySkills();
          commit();
        });
        const words = el("span");
        words.appendChild(el("b", "", skill.name || skill.id));
        if (skill.where && skill.where !== "MiniMax") {
          words.appendChild(el("i", "where", ` · ${skill.where}`));
        }
        words.appendChild(el("div", "what", skill.description || ""));
        row.append(tick, words);
        row.title = [
          always ? "Always read — the agent's own instruction names this one." : "",
          skill.description || "",
          skill.name && skill.name !== skill.id ? `In the folder ${skill.id}.` : "",
        ].filter(Boolean).join("\n\n") || skill.id;
        holder.appendChild(row);
      }
    };
    const addSkillButton = () => {
      const add = el("button", "vig-cutter-ghost", "＋ Add a skill folder…");
      add.style.cssText = "margin-top:6px;justify-content:center";
      add.title =
        "Pick a folder holding a SKILL.md. The dialog opens on the skills folder " +
        "itself, which is where a picked one is COPIED to — so a skill on a memory " +
        "stick or in a downloads directory cannot go missing between runs." +
        (state.agent.skillsFolder ? `\n${state.agent.skillsFolder}` : "");
      add.dataset.log = "add skill";
      add.addEventListener("click", async (event) => {
        event.preventDefault();
        add.disabled = true;
        add.textContent = "opening the folder dialog…";
        const picked = typeof options.pickFolder === "function"
          ? await options.pickFolder(state.agent.skillsFolder || "", "skills")
          : null;
        add.disabled = false;
        add.textContent = "＋ Add a skill folder…";
        if (!picked || !picked.ok || !picked.path) {
          if (picked && picked.message) {
            noteAgent(seg, "error", picked.message);
            renderDetail();
          }
          return;
        }
        const answer = await options.callRoute("/vig/h3/cutter/skill_add", {
          path: picked.path,
        });
        closePopovers();
        if (!answer || !answer.ok) {
          noteAgent(seg, "error", (answer && answer.error) || "the skill could not be added.");
          renderDetail();
          return;
        }
        state.agent.skills = null;
        loadSkillCatalogue();
        noteAgent(
          seg,
          "ok",
          `${answer.name || answer.id} is installed and can be ticked in the skills ` +
            `list. It lives in ${answer.folder}.`,
        );
        renderDetail();
      });
      return add;
    };
    skillButton.addEventListener("click", (event) => {
      event.preventDefault();
      const holder = el("div");
      holder.style.cssText = "display:flex;flex-direction:column;gap:2px;min-width:0";
      paintSkillRows(holder);
      loadSkillCatalogue(() => paintSkillRows(holder));
      openPopover(
        skillButton,
        "skills this clip's writer may read",
        () => [holder, addSkillButton()],
        "Nothing ticked means the whole catalogue — the agent picks for itself.",
        "width:320px;max-width:min(320px, 92vw)",
      );
    });
    knobField("skills", skillButton, { row: knobsWriter });
    const tempInput = document.createElement("input");
    tempInput.type = "number";
    tempInput.min = "0";
    tempInput.max = "2";
    tempInput.step = "0.05";
    tempInput.style.width = "58px";
    tempInput.value = String(state.board.writer.temperature ?? 1);
    tempInput.title =
      "Scales every writing stage's own tuned temperature; 1.0 is the tuned set. " +
      "Board-wide — the same writer serves every clip.";
    tempInput.addEventListener("change", () => {
      state.board.writer.temperature =
        Math.max(0, Math.min(2, Number.parseFloat(tempInput.value) || 1));
      tempInput.value = String(state.board.writer.temperature);
      commit();
    });
    knobField("temperature", stepper(tempInput, linearStep(0.05, 0, 2, 2), "temperature"),
      { row: knobsWriter });
    const shotsInput = document.createElement("input");
    shotsInput.type = "number";
    shotsInput.min = "0";
    shotsInput.max = "8";
    shotsInput.step = "1";
    shotsInput.value = String(seg.max_shots || 0);
    shotsInput.style.width = "46px";
    shotsInput.title =
      "How many [Shot] blocks the agent writes for this clip — how many angles the " +
      "segment is cut into. This is the number it writes, not a ceiling it may " +
      "ignore, and it outranks the style's editing rhythm. 0 lets the style decide. " +
      "A clip too short to hold them all gets as many as fit (0.8 s each).";
    shotsInput.addEventListener("change", () => {
      seg.max_shots = Math.max(0, Math.min(8, Number.parseInt(shotsInput.value, 10) || 0));
      shotsInput.value = String(seg.max_shots);
      commit();
    });
    knobField("shots", stepper(shotsInput, linearStep(1, 0, 8), "shots"), { row: knobsLook });
    if (typeof options.getWidget === "function") {
      const shared = " Board-wide — the same sampler runs every clip.";
      const stepsInput = numberWidget("steps", 58, 1);
      stepsInput.title = "How hard each clip is sampled." + shared;
      knobField("steps", stepper(stepsInput, ladderStep(STEPS_LADDER), "steps"),
        { row: knobsSample });
      for (const [name, label, what] of [
        ["sampler_name", "sampler", "Which sampler H3 runs."],
        ["scheduler", "scheduler", "The noise schedule it runs on."],
      ]) {
        const picker = comboWidget(name);
        picker.style.maxWidth = "128px";
        picker.title = what + shared;
        knobField(label, picker, { row: knobsSample });
      }
    }
    const warnings = model.warningsFor(seg, state.board);
    if (
      index === 0 &&
      model.MODE_FIRST_FRAME.has(seg.mode) &&
      !seg.source_clip &&
      !hasOwnFirst(seg)
    ) {
      warnings.unshift(
        "This is the opening clip — there is no previous clip to continue from. " +
          "Drop your own first frame into the slot below, or the opening stays " +
          "unpinned and renders like text-to-video.",
      );
    }
    const wired = options.modelWired;
    let socketMissing = false;
    if (typeof wired === "function" && !seg.source_clip) {
      const socket = seg.mode === "ref2va" ? "ref_model" : "model";
      socketMissing = !wired(socket);
      if (socketMissing) {
        warnings.unshift(
          `${seg.mode} renders from the ${socket} socket, and nothing is wired into it. ` +
            "This clip will fail the run, and so will any clip that opens on it. Wire the " +
            `H3 ${seg.mode === "ref2va" ? "ref2va" : "base"} checkpoint, or change the mode.`,
        );
      }
    }
    if (seg.error && !(socketMissing && /no \S+ model is connected/.test(seg.error))) {
      warnings.unshift(seg.error);
    }
    let warnBox = null;
    if (warnings.length) {
      warnBox = el("div", "vig-cutter-warn");
      for (const textLine of warnings) warnBox.appendChild(el("div", null, `! ${textLine}`));
    }
    const right = el("div");
    right.style.cssText = "display:flex;flex-direction:column;gap:8px;min-width:0;width:100%";
    const paneRow = el("div");
    paneRow.style.cssText =
      "display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;" +
      "align-items:stretch;min-width:0;width:100%";
    const scriptPane = el("div");
    scriptPane.style.cssText =
      "display:flex;flex-direction:column;gap:8px;min-width:0";
    const dialPane = el("div");
    dialPane.style.cssText =
      "display:flex;flex-direction:column;gap:8px;min-width:0";
    paneRow.append(scriptPane, dialPane);
    const scriptHead = el("div", "vig-cutter-inline");
    scriptHead.style.cssText = "gap:8px;flex-wrap:wrap;align-items:center";
    const clearScript = el("button", "vig-cutter-icon");
    clearScript.appendChild(svg(ICONS.eraser, 13, 2));
    clearScript.title = "Clear — empty the SCRIPT field";
    clearScript.dataset.log = "clear script";
    clearScript.disabled = !(seg.script || "").trim();
    clearScript.addEventListener("click", () => {
      seg.script = "";
      if (parts.scriptField) parts.scriptField.value = "";
      flushCommit();
      renderDetail();
    });
    const enrichButton = el("button", "vig-cutter-icon");
    enrichButton.appendChild(svg(ICONS.sparkle, 13, 2));
    enrichButton.title =
      "Enrich script — ask the agent to add texture (light, sound, physical detail) " +
      "and stretch the arc to carry this clip's length. The story stays yours.";
    enrichButton.dataset.log = "enrich script";
    enrichButton.disabled = state.enrichBusy === seg.id || !(seg.script || "").trim();
    if (state.enrichBusy === seg.id) enrichButton.classList.add("busy");
    enrichButton.addEventListener("click", () => enrichScript(seg));
    const processButton = el("button", "vig-cutter-primary", "⚙ Process with agent");
    processButton.title =
      "Turn this script into a full, format-valid H3 prompt — in this clip's " +
      "style, camera and mode. Any language in; the model's language out.\n" +
      "A prompt already written from this exact script and these settings is not " +
      "written again without asking: the pass costs minutes and answers the same " +
      "question in different words.";
    processButton.disabled = state.procBusy === seg.id || !(seg.script || "").trim();
    processButton.addEventListener("click", () => processSegment(seg));
    const willWrite = pressWrites(seg);
    const processRun = el(
      "button",
      "vig-cutter-primary",
      willWrite ? "⚙▶ Process and generate" : "▶ Generate segment",
    );
    processRun.dataset.log = "process and generate";
    processRun.addEventListener("click", async () => {
      if (seg.locked) {
        noteAgent(seg, "error",
          "This clip is locked, so nothing renders it — unlock it in the header above.");
        renderDetail();
        return;
      }
      const ready = pressWrites(seg)
        ? await processSegment(seg, { askWhenCurrent: false, press: "writeRun" })
        : true;
      if (ready) {
        await renderThisClip(seg, index, "writeRun");
      }
    });
    const processRunSplit = pressWithTakes(processRun);
    processRun.title = processTitle(seg);
    processRun.disabled =
      state.procBusy === seg.id ||
      seg.status === "generating" ||
      (willWrite && !(seg.script || "").trim());
    const scriptHeadModes = el("span", "vig-cutter-inline");
    scriptHeadModes.style.cssText = "gap:4px;flex-wrap:wrap";
    const scriptHeadAudio = el("span", "vig-cutter-inline");
    scriptHeadAudio.style.cssText = "gap:4px;margin-left:10px";
    const scriptHeadTools = el("span", "vig-cutter-inline");
    scriptHeadTools.style.cssText = "gap:4px;margin-left:10px";
    scriptHeadTools.append(enrichButton, clearScript);
    scriptHead.append(scriptHeadModes, scriptHeadAudio, scriptHeadTools);
    const scriptFromRun = refreshFromRun(seg, "script", "script");
    if (scriptFromRun) scriptHeadTools.insertBefore(scriptFromRun, enrichButton);
    scriptPane.appendChild(scriptHead);
    const scriptWrap = el("div");
    scriptWrap.style.cssText =
      "position:relative;flex:1 1 auto;display:flex;flex-direction:column;min-height:84px";
    const scriptArea = document.createElement("textarea");
    parts.scriptField = scriptArea;
    scriptArea.rows = 4;
    scriptArea.style.cssText = "resize:none;flex:1 1 auto;height:auto;min-height:84px";
    scriptArea.placeholder =
      "SCRIPT — this clip, in your own words, in any language. Cite the library " +
      "with @R tags; the agent writes the H3 prompt from this.";
    scriptArea.value = seg.script || "";
    scriptArea.spellcheck = false;
    const syncProcessCaption = () => {
      const writes = pressWrites(seg);
      processRun.textContent = writes ? "⚙▶ Process and generate" : "▶ Generate segment";
      processRun.title = processTitle(seg);
    };
    parts.syncProcessCaption = syncProcessCaption;
    const syncScriptButtons = () => {
      const usable = scriptArea.value.trim().length > 0;
      clearScript.disabled = !usable;
      enrichButton.disabled = state.enrichBusy === seg.id || !usable;
      processButton.disabled = state.procBusy === seg.id || !usable;
      processRun.disabled =
        state.procBusy === seg.id || seg.status === "generating" || !usable;
      syncProcessCaption();
    };
    scriptArea.addEventListener("input", () => {
      seg.script = scriptArea.value;
      state.scriptDraft[seg.id] = scriptArea.value;
      syncScriptButtons();
      commitSoon();
    });
    scriptArea.addEventListener("change", flushCommit);
    attachTextDrop(scriptArea, scriptWrap, {
      activeTag: () => (state.dragRef ? state.dragRef.tag : null),
      apply: (text) => {
        scriptArea.value = text;
        seg.script = text;
        state.dragRef = null;
        syncScriptButtons();
        commit();
      },
    });
    attachMentionMenu(scriptArea, scriptWrap, {
      items: poolItems,
      apply: (nextText) => {
        scriptArea.value = nextText;
        seg.script = nextText;
        syncScriptButtons();
        commit();
      },
      menuClass: "vig-mention",
      ratio: () => canvas().ratio,
    });
    scriptWrap.appendChild(scriptArea);
    scriptPane.appendChild(scriptWrap);
    parts.status = el("div", "vig-cutter-workline");
    const statusText = el("span", "vig-cutter-mono");
    statusText.style.cssText = "flex:1 1 0;min-width:0;white-space:normal";
    const statusStop = el("button", "vig-cutter-flat", "✕ stop");
    statusStop.style.cssText = "font-size:10px;color:var(--cut-dim);white-space:nowrap";
    statusStop.title =
      "Stop this job. The writer is told to stop and its model is put down; the " +
      "call is discarded and the text on the clip is left exactly as it is.";
    statusStop.addEventListener("click", stopAgentJob);
    parts.status.append(statusText, statusStop);
    parts.statusText = statusText;
    parts.statusStop = statusStop;
    scriptPane.appendChild(parts.status);
    const draft = state.scriptDraft[seg.id];
    if (draft !== undefined && draft !== (seg.script || "")) {
      const back = el("button", "vig-cutter-ghost", "\u21a9 my draft");
      back.style.cssText = "padding:1px 7px;font-size:10px";
      back.title =
        "Put back the script you were typing. A finished render replaces this " +
        "field with the script the take was made from; that one stays with the " +
        "take in the project folder, so nothing is lost either way.";
      back.addEventListener("click", () => {
        seg.script = draft;
        scriptArea.value = draft;
        syncScriptButtons();
        commit();
        renderDetail();
      });
      scriptHeadTools.insertBefore(back, enrichButton);
    }
    parts.pressFills = {
      write: pressFill(processButton),
      writeRun: pressFill(processRun),
    };
    dialPane.append(knobs, processButton, processRunSplit.holder);
    processButton.style.width = "100%";
    processRunSplit.holder.style.width = "100%";
    processRun.style.flex = "1 1 auto";
    right.appendChild(paneRow);
    const promptPane = el("div");
    promptPane.style.cssText = "display:flex;flex-direction:column;gap:8px;min-width:0";
    const promptFold = el("div");
    promptFold.style.cssText = "display:flex;flex-direction:column;gap:8px;min-width:0";
    const promptFoldHead = el("button", "vig-cutter-flat");
    promptFoldHead.style.cssText =
      "display:flex;align-items:center;gap:6px;padding:0;align-self:flex-start;color:var(--cut-dim)";
    const promptChevron = el("span", "vig-cutter-label", state.promptOpen ? "▾" : "▸");
    const promptFoldLabel = el("span", "vig-cutter-label", "CLIP PROMPT");
    promptFoldLabel.style.letterSpacing = ".08em";
    promptFoldHead.append(promptChevron, promptFoldLabel);
    promptFoldHead.title = "The prompt the writer produced — the text H3 actually renders";
    promptFoldHead.dataset.log = "prompt fold";
    promptFoldHead.dataset.lockfree = "1";
    const paintPromptFold = () => {
      promptChevron.textContent = state.promptOpen ? "▾" : "▸";
      promptPane.style.display = state.promptOpen ? "flex" : "none";
    };
    promptFoldHead.addEventListener("click", () => {
      state.promptOpen = !state.promptOpen;
      paintPromptFold();
    });
    promptFold.append(promptFoldHead, promptPane);
    const promptHead = el("div", "vig-cutter-inline");
    promptHead.style.cssText = "gap:8px;flex-wrap:wrap;align-items:center";
    const langWrap = el("div");
    langWrap.style.cssText =
      "display:flex;align-items:stretch;gap:1px;background:var(--cut-edge);border:1px solid var(--cut-edge);" +
      "border-radius:5px;overflow:hidden;flex-shrink:0;height:var(--cut-ctl)";
    const langButtons = [];
    for (const [code, label, title] of [
      ["EN", "EN", "English — the language the model reads"],
      ["ZH", "中文", "Chinese — the language the model reads"],
      ["RU", "RU", "Russian — read and edit in your own language"],
    ]) {
      const active = (seg.prompt_lang || "EN") === code;
      const button = el("button", "", label);
      langButtons.push([button, code, title]);
      button.title = title;
      button.style.cssText =
        `background:${active ? "rgba(var(--cut-accent-rgb),.28)" : "var(--cut-menu)"};border:none;` +
        `color:${active ? "var(--cut-bright)" : "var(--cut-dim)"};font-size:11px;padding:0 11px;` +
        "display:flex;align-items:center;cursor:pointer;white-space:nowrap";
      button.addEventListener("click", () => switchLanguage(seg, code));
      langWrap.appendChild(button);
    }
    const syncLangTitles = () => {
      for (const [button, code, title] of langButtons) {
        const home = (seg.prompt_lang || "EN") === "RU" && code !== "RU";
        button.title = !home
          ? title
          : seg.prompt_edited
            ? `${title} — your edits are rebuilt into it, not thrown away.`
            : seg.lang_pre === code && seg.prompt_pre
              ? `${title} — restored exactly as it was, with no second translation to drift.`
              : title;
      }
    };
    syncLangTitles();
    const langRow = el("div", "vig-cutter-inline");
    langRow.style.cssText = "gap:6px;flex-wrap:nowrap;flex-shrink:0";
    langRow.appendChild(langWrap);
    promptHead.appendChild(langRow);
    parts.langNote = el("span", "vig-cutter-mono");
    parts.langNote.style.color = "#6fae7f";
    if (state.langBusy === seg.id) {
      parts.langNote.textContent = "Translating…";
      parts.langNote.style.color = "var(--cut-accent-lit)";
    } else if (seg.rebuilt) {
      parts.langNote.textContent = "agent pass · prompt rebuilt from your edits ";
      const undo = el("button", "vig-cutter-flat", "undo");
      undo.style.cssText = "text-decoration:underline;color:var(--cut-accent-lit);font-size:10px";
      undo.addEventListener("click", () => {
        if (!seg.prompt_pre) return;
        seg.prompt = seg.prompt_pre;
        seg.prompt_lang = seg.lang_pre || "EN";
        seg.prompt_pre = "";
        seg.lang_pre = "";
        seg.rebuilt = false;
        if (seg.status === "ready") seg.status = "stale";
        commit();
        renderDetail();
        renderTimeline();
      });
      parts.langNote.appendChild(undo);
    }
    promptHead.appendChild(parts.langNote);
    const promptSpring = el("div");
    promptSpring.style.flex = "1";
    promptHead.appendChild(promptSpring);
    const iconSquare = (paths, on, palette, title) => {
      const button = el("button");
      button.title = title;
      button.style.cssText =
        "position:relative;display:flex;align-items:center;justify-content:center;" +
        "width:var(--cut-ctl);height:var(--cut-ctl);border-radius:5px;cursor:pointer;padding:0;" +
        `background:${on ? palette.bg : "none"};` +
        `border:1px solid ${on ? palette.border : "var(--cut-border)"};` +
        `color:${on ? palette.ink : "var(--cut-dim)"};opacity:${on ? 1 : 0.55}`;
      button.appendChild(svg(paths, 14, 1.9));
      if (!on) button.appendChild(el("span", "vig-cutter-strike"));
      return button;
    };
    const soundToggle = iconSquare(
      ICONS.speaker,
      !!seg.audio,
      { bg: "rgba(var(--cut-accent-rgb),.9)", border: "var(--cut-accent)", ink: "var(--cut-on-accent)" },
      seg.audio
        ? "Clip sound: ON. The clip's own sound plays in the film."
        : "Clip sound: OFF. This clip is silent in the film — it still renders with "
          + "sound, and the sound is dropped when the film is joined. The clip itself "
          + "does not change, so nothing re-renders; the film needs re-joining.",
    );
    soundToggle.dataset.log = "clip sound";
    soundToggle.addEventListener("click", () => {
      seg.audio = !seg.audio;
      commit();
      renderTimeline();
      renderDetail();
    });
    const musicToggle = iconSquare(
      ICONS.notes,
      seg.music !== false,
      { bg: "rgba(110,168,216,.9)", border: "#6ea8d8", ink: "#0f1c26" },
      seg.music !== false
        ? "Music: ON. The writer may score this clip (non_diegetic_music)."
        : "Music: OFF. non_diegetic_music is N/A — the writer is told so, and the "
          + "field is set to N/A afterwards whatever it writes. Turning this changes "
          + "the prompt, so the clip is marked changed.",
    );
    musicToggle.dataset.log = "clip music";
    musicToggle.addEventListener("click", () => {
      if (seg.music !== false) {
        const { text, stash } = model.stripMusic(seg.prompt);
        seg.music = false;
        if (stash) {
          seg.prompt = text;
          seg.music_stash = stash;
        }
      } else {
        seg.music = true;
        seg.prompt = model.restoreMusic(seg.prompt, seg.music_stash);
        seg.music_stash = "";
      }
      if (seg.status === "ready") seg.status = "stale";
      commit();
      renderTimeline();
      renderDetail();
    });
    scriptHeadAudio.append(soundToggle, musicToggle);
    const modeGroup = el("div", "vig-cutter-inline");
    modeGroup.style.cssText = "gap:8px;flex-wrap:nowrap;flex-shrink:0";
    if (seg.source_clip) {
      const chip = el("button", "vig-cutter-mode", model.LOADED_BADGE.label);
      chip.title = model.LOADED_BADGE.title;
      chip.disabled = true;
      chip.style.borderColor = model.LOADED_BADGE.color;
      chip.style.background = model.LOADED_BADGE.color;
      chip.style.color = "#1c1710";
      chip.style.fontWeight = "600";
      chip.style.cursor = "default";
      chip.style.opacity = "1";
      modeGroup.appendChild(chip);
    }
    for (const key of seg.source_clip ? [] : model.MODE_KEYS) {
      const info = model.MODES[key];
      const button = el("button", "vig-cutter-mode", info.label);
      button.title = info.title;
      const active = seg.mode === key;
      button.style.borderColor = active ? info.color : `${info.color}66`;
      button.style.color = active ? "#1c1710" : info.color;
      button.style.background = active ? info.color : `${info.color}1f`;
      button.style.fontWeight = "600";
      if (index === 0 && model.MODE_FIRST_FRAME.has(key)) {
        button.title = `${info.title}\nThe opening clip continues nothing — drop your own first frame into the slot below.`;
      }
      const ruledOut = model.carriedRun(seg)
        ? model.MODE_FIRST_FRAME.has(key)
          ? `${model.carriedRun(seg)} frames carried from clip ${index} open this clip, ` +
            "so no picture can. Hand over one frame instead of a run, or none, to open on a picture."
          : ""
        : model.carriedTail(seg) && model.MODE_LAST_FRAME.has(key)
          ? `${model.carriedTail(seg)} frames carried into clip ${index + 2} close this clip, ` +
            "so no picture can. Take the arrival off to land on a picture."
          : "";
      if (ruledOut) {
        button.disabled = true;
        button.title = `${info.title}\n${ruledOut}`;
      }
      button.addEventListener("click", () => {
        seg.mode = key;
        if (seg.status === "ready") seg.status = "stale";
        commit();
        renderTimeline();
        renderDetail();
      });
      modeGroup.appendChild(button);
    }
    scriptHeadModes.appendChild(modeGroup);
    promptPane.appendChild(promptHead);
    const promptWrap = el("div");
    promptWrap.style.position = "relative";
    parts.promptSyntax = el("div", "vig-cutter-syntax");
    promptWrap.appendChild(parts.promptSyntax);
    const prompt = document.createElement("textarea");
    parts.promptField = prompt;
    prompt.classList.add("vig-cutter-lit");
    prompt.rows = 7;
    prompt.style.cssText = `resize:none;height:${state.paneH}px;min-height:84px`;
    prompt.value = seg.prompt;
    prompt.spellcheck = false;
    prompt.addEventListener("scroll", () => {
      parts.promptSyntax.scrollTop = prompt.scrollTop;
      parts.promptSyntax.scrollLeft = prompt.scrollLeft;
    });
    prompt.addEventListener("focus", () => paintPromptHighlight());
    prompt.addEventListener("pointerenter", () => paintPromptHighlight());
    prompt.addEventListener("input", () => {
      seg.prompt = prompt.value;
      seg.prompt_edited = true;
      syncLangTitles();
      paintPromptHighlight();
      markStale(seg);
      updateSegmentBadge(seg);
      commitSoon();
    });
    prompt.addEventListener("change", () => {
      const laid = model.formatPrompt(prompt.value);
      if (laid !== prompt.value) {
        prompt.value = laid;
        seg.prompt = laid;
        paintPromptHighlight();
      }
      flushCommit();
    });
    attachPromptDrop(prompt, promptWrap, seg);
    attachMentionMenu(prompt, promptWrap, {
      items: poolItems,
      apply: (nextText, caret) => {
        prompt.value = nextText;
        seg.prompt = nextText;
        seg.prompt_edited = true;
        paintPromptHighlight();
        markStale(seg);
        commit();
        renderTimeline();
      },
      menuClass: "vig-mention",
      ratio: () => canvas().ratio,
    });
    promptWrap.appendChild(prompt);
    const working = el("div", "vig-cutter-working");
    working.appendChild(el("div", "ring"));
    const workingStop = el("button", "stop", "✕");
    workingStop.title =
      "Stop the translation. The writer is told to stop and its model is put " +
      "down; the prompt is left exactly as it is.";
    workingStop.addEventListener("click", stopAgentJob);
    working.appendChild(workingStop);
    working.style.display = state.langBusy === seg.id ? "" : "none";
    prompt.readOnly = state.langBusy === seg.id;
    parts.promptWorking = working;
    promptWrap.appendChild(working);
    paintPromptHighlight();
    if (typeof ResizeObserver === "function") {
      const watch = new ResizeObserver(() => paintPromptHighlight());
      watch.observe(prompt);
      parts.promptWatch = watch;
    }
    promptPane.appendChild(promptWrap);
    parts.promptJob = null;
    const promptFoot = el("div", "vig-cutter-inline");
    promptFoot.style.cssText = "gap:10px;flex-wrap:nowrap;align-items:center";
    const framePinned =
      model.MODE_FIRST_FRAME.has(seg.mode) && (hasOwnFirst(seg) || index > 0);
    const hint = el(
      "span",
      "vig-cutter-mono",
      seg.mode === "t2va"
        ? "text only — the model gets nothing but this prompt"
        : seg.mode === "ref2va"
          ? "drag a reference chip in, or cite the pool with @R tags"
          : framePinned
            ? "frame 0 is fixed (the image below / the previous clip's last frame) — " +
              "[Shot 1] must CONTINUE it; prose that opens elsewhere cuts away after " +
              "one frame"
            : "describe the motion between the frames below",
    );
    hint.style.cssText =
      "flex:1 1 0;min-width:0;white-space:normal;overflow:hidden;" +
      "display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2";
    hint.title = hint.textContent;
    const clearPrompt = el("button", "vig-cutter-ghost", "✕ Clear");
    clearPrompt.title = "Empty the CLIP PROMPT field";
    clearPrompt.dataset.log = "clear prompt";
    clearPrompt.disabled = !(seg.prompt || "").trim();
    clearPrompt.addEventListener("click", () => {
      seg.prompt = "";
      if (parts.promptField) parts.promptField.value = "";
      if (seg.status === "ready") seg.status = "stale";
      flushCommit();
      renderDetail();
      renderTimeline();
    });
    const rebuildButton = el("button", "vig-cutter-ghost", "↻ Rebuild prompt");
    rebuildButton.dataset.log = "rebuild prompt";
    rebuildButton.title =
      "Rewrite what is in this field into a full, format-valid H3 prompt through the Director";
    rebuildButton.disabled = state.rebuildBusy === seg.id;
    if (state.rebuildBusy === seg.id) rebuildButton.textContent = "Rebuilding…";
    rebuildButton.addEventListener("click", () => rebuildPrompt(seg));
    const generateSeg = el("button", "vig-cutter-primary", "▶ Generate segment");
    generateSeg.dataset.log = "generate segment";
    generateSeg.title =
      "Render this clip and nothing else. A clip that opens on it keeps the take it " +
      "has and is marked changed, for you to render when you want it to match. Roll " +
      "the seed first for a different take of this one.";
    generateSeg.textContent =
      seg.status === "generating" ? "Generating…" : "▶ Generate segment";
    generateSeg.addEventListener("click", () => renderThisClip(seg, index));
    const generateSplit = pressWithTakes(generateSeg);
    parts.pressFills.render = pressFill(generateSeg);
    promptHead.append(clearPrompt, rebuildButton);
    const promptFromRun = refreshFromRun(seg, "prompt", "prompt");
    if (promptFromRun) promptHead.appendChild(promptFromRun);
    promptFoot.append(hint, generateSplit.holder);
    promptPane.appendChild(promptFoot);
    paintPromptFold();
    const PICTURES_CLEAR = "14px";
    const wantsFirst = model.MODE_FIRST_FRAME.has(seg.mode);
    const wantsLast = model.MODE_LAST_FRAME.has(seg.mode);
    if (wantsFirst || wantsLast) {
      const slots = el("div", "vig-cutter-inline");
      slots.style.alignItems = "flex-start";
      slots.style.gap = "10px";
      slots.style.marginTop = PICTURES_CLEAR;
      if (wantsFirst) {
        slots.appendChild(
          keyframeSlot(
            seg,
            "first",
            index > 0 && !hasOwnFirst(seg) ? `first frame — clip ${index}'s last` : "first frame",
            ratio,
          ),
        );
      }
      if (wantsLast) slots.appendChild(keyframeSlot(seg, "last", "last frame", ratio));
      right.appendChild(slots);
    }
    if (seg.mode === "ref2va") {
      const groups = el("div", "vig-cutter-inline");
      groups.style.cssText = "gap:10px;flex-wrap:wrap;align-items:flex-start";
      groups.style.marginTop = PICTURES_CLEAR;
      groups.append(
        refGallery(seg, "image", ratio),
        refGallery(seg, "video", ratio),
        refGallery(seg, "audio", ratio),
      );
      right.appendChild(groups);
    }
    right.appendChild(promptFold);
    parts.detail.style.cssText =
      "display:flex;flex-direction:column;align-items:stretch;gap:12px;min-width:0";
    if (typeof segmentSection.retitle === "function") {
      segmentSection.retitle(`2 · Segment workshop — Clip ${index + 1}`);
    }
    parts.detail.append(headRow, right);
    if (editingName) {
      clipName.input.focus();
      clipName.input.select();
    }
    if (warnBox) parts.detail.appendChild(warnBox);
    renderDetailTimes();
    updateJobBars();
    if (seg.locked) settleWorkshop(parts.detail);
  }
  function toggleLock(seg) {
    seg.locked = !seg.locked;
    commit();
    renderTimeline();
    renderDetail();
    renderRuler();
  }
  function settleWorkshop(root) {
    root.classList.add("vig-cutter-settled");
    for (const control of root.querySelectorAll("button, input, select, textarea")) {
      if (control.closest("[data-lockfree]")) continue;
      if (control.tagName === "TEXTAREA") {
        control.readOnly = true;
        continue;
      }
      control.disabled = true;
      if (!control.title) control.title = "This clip is locked — unlock it in the header above";
    }
  }
  async function switchLanguage(seg, target) {
    if (state.langBusy) return;
    const source = seg.prompt_lang || "EN";
    if (source === target || !(seg.prompt || "").trim()) return;
    const callRoute = options.callRoute;
    if (typeof callRoute !== "function") return;
    if (source === "RU" && !seg.prompt_edited && seg.lang_pre === target && seg.prompt_pre) {
      seg.prompt = seg.prompt_pre;
      seg.prompt_lang = target;
      seg.prompt_pre = "";
      seg.lang_pre = "";
      seg.rebuilt = false;
      commit();
      renderDetail();
      return;
    }
    state.langBusy = seg.id;
    state.promptOpen = true;
    renderDetail();
    const { job, signal } = beginAgentJob(seg, "translate");
    try {
      {
        const data = await callRoute(
          "/vig/h3/cutter/translate",
          {
            prompt: seg.prompt,
            source,
            target,
            writer: { ...state.board.writer },
            job,
          },
          { signal },
        );
        seg.prompt_pre = seg.prompt;
        seg.lang_pre = source;
        seg.prompt = data.prompt || seg.prompt;
        seg.rebuilt = false;
        const lost = String(data.report || "")
          .split("\n")
          .filter((line) => line.startsWith("WARNING"));
        if (lost.length) noteAgent(seg, "error", lost.join(" "));
      }
      seg.prompt_lang = target;
      seg.prompt_edited = false;
      if (seg.status === "ready" && target !== "RU") seg.status = "stale";
      commit();
    } catch (error) {
      if (isAbort(error)) {
        seg.error = "language switch abandoned — the prompt is unchanged.";
      } else {
        console.error("[VIG H3 Cutter] language switch failed:", error);
        seg.error = `translation failed: ${error && error.message ? error.message : error}`;
      }
    } finally {
      endAgentJob();
      state.langBusy = null;
      renderDetail();
      renderTimeline();
    }
  }
  function openingDescriptor(seg) {
    if (model.carriedRun(seg) > 0) {
      const index = state.board.segments.indexOf(seg);
      const before = index > 0 ? state.board.segments[index - 1] : null;
      return {
        origin: "run",
        previous: before ? (before.script || before.name || "").trim() : "",
      };
    }
    if (!model.MODE_FIRST_FRAME.has(seg.mode)) return { origin: "none" };
    const slot = seg.refs.find(
      (r) => r.kind === "image" && r.source && (r.uid || "").startsWith("first"),
    );
    if (slot) return { origin: "slot", label: slot.label || "" };
    const byTag = new Map(
      state.board.library.filter((r) => r.tag && r.source).map((r) => [r.tag, r]),
    );
    for (const tag of model.citedTagNames(seg.prompt || seg.script || "")) {
      const ref = byTag.get(tag);
      if (ref && ref.kind === "image") {
        return { origin: "cited", label: ref.label ? `@${tag} — ${ref.label}` : `@${tag}` };
      }
    }
    const index = state.board.segments.indexOf(seg);
    if (index > 0) {
      const previous = state.board.segments[index - 1];
      return { origin: "chain", previous: (previous.script || previous.name || "").trim() };
    }
    return { origin: "none" };
  }
  function segmentPayload(seg) {
    return {
      opening: openingDescriptor(seg),
      name: seg.name,
      seconds: seg.seconds,
      mode: seg.mode,
      carried_run: model.carriedRun(seg),
      music: seg.music !== false,
      style: seg.style || "",
      camera: seg.camera || "",
      camera_amplitude: seg.camera_amplitude || "",
      camera_speed: seg.camera_speed || "",
      max_shots: seg.max_shots || 0,
      skills: (Array.isArray(seg.skills) ? seg.skills : []).filter(Boolean),
      script: seg.script || "",
      prompt: seg.prompt || "",
      refs: seg.refs
        .filter((r) => r.source)
        .map((r) => ({
          uid: r.uid || "",
          kind: r.kind,
          label: r.label,
          tag: r.tag || "",
          source: r.source || "",
        })),
    };
  }
  function acceptPrompt(seg, prompt, written) {
    state.promptOpen = true;
    seg.prompt_pre = seg.prompt;
    seg.lang_pre = seg.prompt_lang || "EN";
    seg.prompt = model.formatPrompt(prompt);
    seg.prompt_lang = "EN";
    seg.prompt_edited = false;
    seg.rebuilt = true;
    if (seg.status === "ready") seg.status = "stale";
    const job = state.agentJob && state.agentJob.segId === seg.id ? state.agentJob : null;
    seg.written_by = written && typeof written === "object" && Object.keys(written).length
      ? {
          ...written,
          seed_mode: seedModeOf({ seed_mode: state.board.writer_seed_mode }),
          skills_read: job && Array.isArray(job.skills) ? job.skills.slice() : [],
        }
      : {};
    const mode = seedModeOf({ seed_mode: state.board.writer_seed_mode });
    if (mode !== "fixed") {
      state.board.writer.seed = model.nextSeed(
        Number(state.board.writer.seed) || 0, mode, randomSeed,
      );
    }
    commit();
  }
  function paintPromptHighlight() {
    const layer = parts.promptSyntax;
    const field = parts.promptField;
    if (!layer || !field) return;
    const escaped = field.value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const fields = model.PROMPT_FIELDS.join("|");
    const marked = escaped
      .replace(new RegExp("(^|\n)(" + fields + "):", "g"), "$1<b>$2:</b>")
      .replace(/\[Shot\s+\d+\]/g, (m) => '<span class="shot">' + m + "</span>")
      .replace(/&lt;d&gt;[\s\S]*?&lt;\/d&gt;/g, (m) => '<span class="say">' + m + "</span>")
      .replace(
        /&lt;(Subject|Picture|Video|Audio)\s+\d+&gt;/g,
        (m) => '<span class="ref">' + m + "</span>",
      );
    layer.innerHTML = marked + "<br>";
    const cs = getComputedStyle(field);
    const px = (v) => parseFloat(v) || 0;
    const gutter =
      field.offsetWidth - field.clientWidth - px(cs.borderLeftWidth) - px(cs.borderRightWidth);
    layer.style.width = "";
    layer.style.right = `${gutter}px`;
    layer.scrollTop = field.scrollTop;
    layer.scrollLeft = field.scrollLeft;
  }
  function noteAgent(seg, tone, text) {
    state.agentNote[seg.id] = { tone, text, prompt: String(seg.prompt || "") };
  }
  function beginAgentJob(seg, kind, press = "") {
    delete state.agentNote[seg.id];
    const aborter = typeof AbortController === "function" ? new AbortController() : null;
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const writer = state.board.writer;
    const viaProvider = !!(writer.use_provider && writer.provider_url);
    state.agentJob = {
      segId: seg.id,
      kind,
      press,
      via: viaProvider ? "provider" : "local",
      model: (viaProvider ? writer.provider_model : writer.llm_model) || "auto",
      skills: [],
      tool: "",
      startedAt: Date.now(),
      lastBeat: Date.now(),
      token,
      stage: "sending the request…",
      state: "start",
      phaseAt: Date.now(),
      fill: 0,
      step: null,
      total: null,
      aborter,
    };
    if (!state.agentTimer) state.agentTimer = setInterval(updateJobBars, 1000);
    updateJobBars();
    return {
      job: {
        node: typeof options.nodeId === "function" ? options.nodeId() : "",
        segment: seg.id,
        kind,
        token,
      },
      signal: aborter ? aborter.signal : undefined,
    };
  }
  function stopAgentJob() {
    const job = state.agentJob;
    if (!job) return;
    if (job.token && typeof options.callRoute === "function") {
      options
        .callRoute("/vig/h3/cutter/agent_stop", { token: job.token })
        .catch((err) => console.error("[VIG H3 Cutter] could not stop the writer:", err));
    }
    if (job.aborter) job.aborter.abort();
  }
  function endAgentJob() {
    state.agentJob = null;
    if (state.agentTimer) {
      clearInterval(state.agentTimer);
      state.agentTimer = null;
    }
    updateJobBars();
  }
  function isAbort(error) {
    return !!error && (error.name === "AbortError" || error.code === 20);
  }
  const AGENT_FLOOR = { start: 0.04, model: 0.12, stage: 0.22, done: 1 };
  const TURN_BAND = { from: 0.22, to: 0.85, decay: 0.85 };
  function turnFloor(turn) {
    const span = TURN_BAND.to - TURN_BAND.from;
    return TURN_BAND.from + span * (1 - Math.pow(TURN_BAND.decay, Math.max(0, turn)));
  }
  function agentFill(job) {
    const state = job.state || "start";
    if (state === "done") return 1;
    let floor;
    let ceiling;
    if (state === "turn") {
      const turn = Math.max(1, Number(job.step) || 1);
      floor = turnFloor(turn);
      ceiling = turnFloor(turn + 1);
    } else {
      floor = AGENT_FLOOR[state] === undefined ? AGENT_FLOOR.start : AGENT_FLOOR[state];
      ceiling =
        state === "start" ? AGENT_FLOOR.model : state === "model" ? AGENT_FLOOR.stage : turnFloor(1);
    }
    const inPhase = (Date.now() - (job.phaseAt || job.startedAt)) / 1000;
    const eased = floor + (ceiling - floor) * (1 - Math.exp(-inPhase / 18));
    job.fill = Math.max(job.fill || 0, Math.min(0.97, eased));
    return job.fill;
  }
  function paintAgentBar(bar, job) {
    bar.sub.textContent = "";
    const elapsed = Math.round((Date.now() - job.startedAt) / 1000);
    const silent = Math.round((Date.now() - job.lastBeat) / 1000);
    const parts = [job.kind, job.stage, job.via, job.model];
    if (job.skills.length) parts.push(`skills: ${job.skills.join(", ")}`);
    else if (job.tool) parts.push(job.tool);
    let text = `${parts.join(" · ")} · ${elapsed}s`;
    let tone = "var(--cut-accent-lit)";
    if (silent > 12) {
      text += ` — no signal for ${silent}s: the server stopped answering`;
      tone = "#e08a7d";
    }
    bar.text.textContent = text;
    bar.text.style.color = tone;
    bar.text.title = job.skills.length
      ? `Writing through the ${job.via} writer on ${job.model}. The agent has read ` +
        `these of the bundled skills: ${job.skills.join(", ")} — they are disclosed a ` +
        "section at a time, on its own request, rather than flattened into one system " +
        "prompt."
      : `Writing through the ${job.via} writer on ${job.model}.`;
    bar.fill.style.background = tone;
    bar.track.classList.remove("busy");
    bar.fill.style.width = `${Math.round(agentFill(job) * 100)}%`;
    bar.track.title = job.total
      ? `agent turn ${job.step} of at most ${job.total} — an estimate of how far along ` +
        "the job is, not a countdown: it ends when the agent is done"
      : "an estimate of how far along the job is: the stages are known, the end is not";
    bar.cancel.style.display = "";
    bar.box.style.display = "flex";
  }
  function renderRunBar() {
    const bar = parts.runBar;
    if (!bar) return;
    const run = state.runActivity;
    const list = state.board.segments || [];
    const busy = list.find((s) => s.status === "generating");
    if (!busy && !run) {
      bar.style.display = "none";
      return;
    }
    const live = state.livePreview;
    const counted =
      busy && live && Number(live.total) > 0 && Number(live.segment_id) === busy.id;
    let tone = "var(--cut-accent-lit)";
    let width = "";
    let text = (run && run.headline) || "waiting for the graph…";
    const batch =
      state.batchAt && state.batchAt.id === busy?.id
        ? ` · take ${state.batchAt.take}/${state.batchAt.takes}`
        : "";
    if (counted) {
      const pct = Math.round((Number(live.step) / Number(live.total)) * 100);
      width = `${pct}%`;
      text =
        `clip ${list.indexOf(busy) + 1}${batch} · rendering · ` +
        `step ${live.step}/${live.total} · ${pct}%`;
    } else if (busy) {
      text = `clip ${list.indexOf(busy) + 1}${batch} · rendering — waiting for the sampler…`;
    } else if (run.phase === "done" || run.phase === "failed") {
      width = "100%";
      tone = run.phase === "done" ? "#6fae7f" : "#c0665a";
    }
    const indeterminate = !width;
    bar.classList.toggle("busy", indeterminate);
    parts.runBarFill.style.width = indeterminate ? "" : width;
    parts.runBarFill.style.background = tone;
    parts.runBarText.textContent = !busy && run && run.line ? `${text} · ${run.line}` : text;
    parts.runBarText.style.color = tone;
    bar.style.display = "block";
  }
  function updateJobBars() {
    renderRunBar();
    const job = state.agentJob;
    if (parts.filmJob) {
      const planning = !!(job && job.kind === "plan");
      if (planning) paintAgentBar(parts.filmJob, job);
      parts.filmJob.box.style.display = planning ? "flex" : "none";
    }
    const fills = parts.pressFills;
    const seg = selected();
    if (!fills || !seg) return;
    const mine = job && job.kind !== "plan" && job.segId === seg.id ? job : null;
    const writing = mine && mine.kind !== "enrich" ? agentFill(mine) : null;
    let rendering = null;
    if (seg.status === "generating") {
      const live =
        state.livePreview && Number(state.livePreview.segment_id) === seg.id
          ? state.livePreview
          : null;
      rendering = live && Number(live.total) > 0
        ? Number(live.step) / Number(live.total)
        : 0.04;
    }
    const pressed = (mine && mine.press) || (rendering !== null ? state.renderPress : null);
    fills.write(pressed === "write" ? (writing !== null ? writing : rendering) : null);
    fills.writeRun(pressed === "writeRun" ? (writing !== null ? writing : rendering) : null);
    if (fills.render) fills.render(pressed === "render" ? rendering : null);
    if (!parts.status) return;
    let said = "";
    let tone = "var(--cut-accent-lit)";
    let stoppable = false;
    if (mine) {
      const elapsed = Math.round((Date.now() - mine.startedAt) / 1000);
      const silent = Math.round((Date.now() - mine.lastBeat) / 1000);
      const bits = [mine.kind, mine.stage, mine.via, mine.model];
      if (mine.skills.length) bits.push(`skills: ${mine.skills.join(", ")}`);
      else if (mine.tool) bits.push(mine.tool);
      said = `${bits.join(" · ")} · ${elapsed}s`;
      stoppable = true;
      if (silent > 12) {
        said += ` — no signal for ${silent}s: the server stopped answering`;
        tone = "#e08a7d";
      }
    } else if (rendering !== null) {
      const live =
        state.livePreview && Number(state.livePreview.segment_id) === seg.id
          ? state.livePreview
          : null;
      const batch =
        state.batchAt && state.batchAt.id === seg.id
          ? ` · take ${state.batchAt.take}/${state.batchAt.takes}`
          : "";
      const run = state.runTokens
        ? model.stepCost(state.cost, state.runTokens)
        : null;
      const asked = live && Number(live.total) > 0 ? Number(live.total) : askedSteps();
      const weight = state.runTokens
        ? ` · ${tokenText(state.runTokens)} tokens/step`
          + (run && asked ? ` ${costMark(run) || "≈"}${waitText(run.seconds * asked)}` : "")
        : "";
      said = live && Number(live.total) > 0
        ? `rendering${batch} · step ${live.step}/${live.total} · ` +
          `${Math.round((Number(live.step) / Number(live.total)) * 100)}%${weight}`
        : `rendering${batch} — waiting for the sampler…${weight}`;
    } else {
      const note = state.agentNote[seg.id];
      if (note && note.text && note.prompt === String(seg.prompt || "")) {
        said = note.text;
        tone = note.tone === "ok" ? "#6fae7f"
          : note.tone === "offline" ? "#c0665a" : "#e08a7d";
      } else {
        const run = state.runActivity;
        if (run && run.headline) said = run.headline;
      }
    }
    parts.statusText.textContent = said;
    parts.statusText.style.color = tone;
    parts.statusText.title = said;
    parts.statusStop.style.display = stoppable ? "" : "none";
    parts.status.style.display = said || stoppable ? "" : "none";
  }
  function previousSound(seg) {
    if (!seg || !seg.context_frames) return null;
    const list = state.board.segments || [];
    const i = list.findIndex((s) => s.id === seg.id);
    const before = i > 0 ? list[i - 1] : null;
    if (!before) return null;
    const room = model.promptField(before.prompt, "overall_soundscape");
    const music = model.promptField(before.prompt, "non_diegetic_music");
    const speakers = model.speakerLines(before.prompt);
    return room || music || speakers.length
      ? { room: room || "", music: music || "", speakers }
      : null;
  }
  function pressWrites(seg) {
    return !String(seg.prompt || "").trim();
  }
  function processTitle(seg) {
    if (pressWrites(seg)) {
      return "This clip has no prompt yet, so this writes one with the agent and then " +
        "renders on it without stopping. Nothing renders if the agent fails or you stop it.";
    }
    const drift = model.promptDrift(seg, state.board);
    return "Renders the clip on its prompt as it stands — the writer is not called. " +
      (drift.length
        ? `The prompt predates changes to ${drift.map((n) => n.replace(/_/g, " ")).join(", ")}; press Process with agent ` +
          "if you want it rewritten for them."
        : "Press Process with agent for another wording.");
  }
  async function processSegment(seg, { askWhenCurrent = true, press = "write" } = {}) {
    if (state.procBusy) return false;
    if (model.promptIsCurrent(seg, state.board)) {
      if (!askWhenCurrent) {
        noteAgent(
          seg,
          "ok",
          "the prompt already answers this script and these settings, so nothing was " +
            "written — straight to the render. Press Process with agent for another wording.",
        );
        renderDetail();
        return "current";
      }
      const again = await askInPanel(
        "This prompt is already current",
        "It was written from exactly this script, style, camera, mode, length, " +
          "language, shots and skills, by this writing model on this seed and " +
          "temperature, and none of them has changed since.\n\nWriting it again costs " +
          "a pass of the writing model and gives you a differently worded prompt for " +
          "the same story. Nothing else about the clip changes.",
        "Write it again",
        "Leave it",
      );
      if (!again) return false;
    }
    const callRoute = options.callRoute;
    if (typeof callRoute !== "function") return false;
    state.procBusy = seg.id;
    let wrote = false;
    renderDetail();
    const { job, signal } = beginAgentJob(seg, "write", press);
    const askedWriter = model.writerInputs(state.board);
    try {
      const { width, height } = canvas();
      const data = await callRoute(
        "/vig/h3/cutter/write",
        {
          script: seg.script || "",
          segment: segmentPayload(seg),
          previous: previousSound(seg),
          writer: { ...state.board.writer },
          width,
          height,
          job,
        },
        { signal },
      );
      if (data.prompt) acceptPrompt(seg, data.prompt, data.written_by);
      state.agentHealth = data.used_llm === false ? "offline" : "ok";
      const warnings = Array.isArray(data.warnings) ? data.warnings : [];
      if (data.used_llm === false) {
        const why = String(data.report || "")
          .split("\n")
          .find((line) => line.startsWith("WARNING"));
        noteAgent(
          seg,
          "offline",
          `written OFFLINE (mechanical floor) — ${
            why ? why.replace(/^WARNING:?\s*/, "") : "the agent found no model. Set the models folder behind the gear in the console's header."
          }`,
        );
      } else {
        const unfixed = Number(data.errors) || 0;
        noteAgent(
          seg,
          unfixed || warnings.length ? "error" : "ok",
          unfixed
            ? `the prompt breaks the format in ${unfixed} place(s) — the agent could not fix ` +
              "them, and it is delivered as it stands. A different writing model is the usual cure."
            : warnings.length
              ? `agent pass done · ${warnings.length} warning(s): ${warnings[0]}`
              : "agent pass done — the prompt below is what will render.",
        );
      }
      seg.prompt_from = { ...model.promptInputs(seg, state.board), ...askedWriter };
      wrote = true;
    } catch (error) {
      if (isAbort(error)) {
        noteAgent(
          seg,
          "error",
          "stopped — the writer puts its model down and the call is discarded. " +
            "Press Process again whenever you are ready.",
        );
      } else {
        console.error("[VIG H3 Cutter] process failed:", error);
        noteAgent(seg, "error", `process failed: ${error && error.message ? error.message : error}`);
      }
    } finally {
      endAgentJob();
      state.procBusy = null;
      renderDetail();
      renderTimeline();
      renderAgentRow();
    }
    return wrote;
  }
  async function pullStoryboard() {
    if (state.filmBusy || state.procBusy) return;
    const callRoute = options.callRoute;
    const wired = typeof options.filmSettings === "function" ? options.filmSettings() : null;
    if (typeof callRoute !== "function" || !wired) return;
    const written = (state.board.segments || []).filter((s) =>
      String(s.prompt || "").trim() || String(s.script || "").trim(),
    ).length;
    const shot = (state.board.segments || []).filter(
      (s) => s.clip || s.source_clip || s.locked,
    ).length;
    const fresh = (state.board.segments || []).length - shot;
    if (
      written &&
      !(await askInPanel(
        `Plan “${wired.film.title || "the film"}” over this timeline?`,
        shot
          ? `${shot} clip(s) are shot (a take on the timeline, or locked): they keep their ` +
            `takes, prompts and settings. The other ${fresh} clip(s) take the storyboard's ` +
            "beats, replacing what is in them. If the storyboard has a different number of " +
            "clips, nothing is laid and the console says why."
          : `${written} clip(s) here have a script or a prompt. The storyboard decides ` +
            "the timeline, so those are replaced by the film's own beats. The project " +
            "folder, the film's name and the writing dials stay.",
        "Lay it over",
        "Cancel",
      ))
    ) {
      return;
    }
    state.filmBusy = true;
    const { job, signal } = beginFilmJob();
    renderTimeline();
    try {
      const data = await callRoute(
        "/vig/h3/cutter/plan",
        {
          film: wired.film,
          writer: wired.writer,
          board: model.writeBoard(state.board),
          job,
        },
        { signal },
      );
      if (data.board) {
        state.board = model.readBoard(data.board);
        renderAll();
        commit();
      }
      const beats = Number(data.beats) || 0;
      const written = Number(data.written) || 0;
      state.runReport = String(data.report || "");
      renderRunReport();
      const refused = state.runReport
        .split("\n")
        .find((line) => line.startsWith("WARNING: storyboard"));
      state.filmNote = refused
        ? { tone: "error", text: refused.replace(/^WARNING:\s*/, "") }
        : data.applied
        ? {
            tone: written === beats ? "ok" : "warn",
            text:
              `${wired.node}: ${beats} beat(s) laid out, ${written} with a prompt` +
              (written < beats
                ? ` — the other ${beats - written} carry their scripts. Process with agent finishes them.`
                : "."),
          }
        : {
            tone: "ok",
            text:
              "this timeline was already laid out from that film — nothing changed. " +
              "Edit the Director's script to plan a new one.",
          };
    } catch (error) {
      state.filmNote = {
        tone: "error",
        text: isAbort(error)
          ? "stopped waiting — the server finishes the plan in the background, and its result is discarded."
          : `plan failed: ${error && error.message ? error.message : error}`,
      };
      if (!isAbort(error)) console.error("[VIG H3 Cutter] plan failed:", error);
    } finally {
      endAgentJob();
      state.filmBusy = false;
      renderTimeline();
      renderDetail();
    }
  }
  function renderFilmPull() {
    if (!parts.pullFilm) return;
    const wired = typeof options.filmWired === "function" ? options.filmWired() : false;
    parts.pullFilm.style.display = wired ? "" : "none";
    parts.pullNote.style.display = wired ? "" : "none";
    if (!wired) return;
    parts.pullFilm.disabled = !!state.filmBusy || !!state.procBusy;
    parts.pullFilm.textContent = state.filmBusy ? "Planning…" : "⚑ Pull storyboard";
    const note = state.filmNote;
    parts.pullNote.textContent = note ? note.text : "";
    parts.pullNote.style.color = note
      ? note.tone === "error"
        ? "#c0665a"
        : note.tone === "warn"
          ? "var(--cut-accent-lit)"
          : "#6fae7f"
      : "var(--cut-faint)";
  }
  function beginFilmJob() {
    delete state.filmNote;
    const aborter = typeof AbortController === "function" ? new AbortController() : null;
    const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const writer = state.board.writer;
    const viaProvider = !!(writer.use_provider && writer.provider_url);
    state.agentJob = {
      segId: 0,
      kind: "plan",
      via: viaProvider ? "provider" : "local",
      model: (viaProvider ? writer.provider_model : writer.llm_model) || "auto",
      skills: [],
      tool: "",
      startedAt: Date.now(),
      lastBeat: Date.now(),
      token,
      stage: "sending the request…",
      state: "start",
      phaseAt: Date.now(),
      fill: 0,
      step: null,
      total: null,
      aborter,
    };
    if (!state.agentTimer) state.agentTimer = setInterval(updateJobBars, 1000);
    updateJobBars();
    return {
      job: {
        node: typeof options.nodeId === "function" ? options.nodeId() : "",
        segment: 0,
        kind: "plan",
        token,
      },
      signal: aborter ? aborter.signal : undefined,
    };
  }
  async function enrichScript(seg) {
    if (state.enrichBusy) return;
    const callRoute = options.callRoute;
    if (typeof callRoute !== "function") return;
    state.enrichBusy = seg.id;
    renderDetail();
    const { job, signal } = beginAgentJob(seg, "enrich");
    try {
      const data = await callRoute(
        "/vig/h3/cutter/enrich",
        {
          script: seg.script || "",
          segment: segmentPayload(seg),
          writer: { ...state.board.writer },
          job,
        },
        { signal },
      );
      state.agentHealth = data.used_llm === false ? "offline" : "ok";
      if (data.used_llm === false) {
        noteAgent(
          seg,
          "offline",
          "the script is unchanged — no writing model answered. Set the models " +
            "folder in section 1.",
        );
      } else if (typeof data.script === "string" && data.script.trim()) {
        seg.script = data.script;
        noteAgent(seg, "ok", "script enriched — read it, then Process with agent.");
        commit();
      }
    } catch (error) {
      if (isAbort(error)) {
        noteAgent(seg, "error", "stopped waiting — the enrich finishes in the background, discarded.");
      } else {
        console.error("[VIG H3 Cutter] enrich failed:", error);
        noteAgent(seg, "error", `enrich failed: ${error && error.message ? error.message : error}`);
      }
    } finally {
      endAgentJob();
      state.enrichBusy = null;
      renderDetail();
      renderAgentRow();
    }
  }
  async function rebuildPrompt(seg) {
    if (state.rebuildBusy) return;
    const callRoute = options.callRoute;
    if (typeof callRoute !== "function") return;
    state.rebuildBusy = seg.id;
    renderDetail();
    const { job, signal } = beginAgentJob(seg, "rebuild");
    try {
      const { width, height } = canvas();
      const data = await callRoute(
        "/vig/h3/cutter/rebuild",
        {
          segment: segmentPayload(seg),
          previous: previousSound(seg),
          writer: { ...state.board.writer },
          width,
          height,
          job,
        },
        { signal },
      );
      if (data.prompt) acceptPrompt(seg, data.prompt, data.written_by);
      state.agentHealth = data.used_llm === false ? "offline" : "ok";
      if (data.used_llm === false) {
        noteAgent(seg, "offline", "rebuilt OFFLINE (mechanical floor) — the agent found no model.");
      }
    } catch (error) {
      if (isAbort(error)) {
        noteAgent(seg, "error", "stopped waiting — the rebuild finishes in the background, discarded.");
      } else {
        console.error("[VIG H3 Cutter] rebuild failed:", error);
        seg.error = `rebuild failed: ${error && error.message ? error.message : error}`;
      }
    } finally {
      endAgentJob();
      state.rebuildBusy = null;
      renderDetail();
      renderTimeline();
      renderAgentRow();
    }
  }
  function renderDetailTimes() {
    const seg = selected();
    if (!seg || !parts.detailTime) return;
    const index = state.board.segments.indexOf(seg);
    const codes = model.timecodes(state.board.segments)[index];
    if (!codes) return;
    parts.detailTime.textContent =
      `${model.formatClock(codes.start)}–${model.formatClock(codes.end)} · ${seg.seconds} s`;
  }
  function hasOwnFirst(seg) {
    return seg.refs.some((r) => r.kind === "image" && r.source && r.uid.startsWith("first"));
  }
  function toggle(label, on, title, onClick) {
    const button = el("button", "vig-cutter-toggle");
    button.title = title;
    const track = el("span", "vig-cutter-switch");
    track.style.background = on ? "var(--cut-accent)" : "var(--cut-border)";
    const knob = el("i");
    knob.style.left = on ? "12.5px" : "1.5px";
    track.appendChild(knob);
    button.append(track, el("span", null, label));
    button.addEventListener("click", onClick);
    return button;
  }
  function poolItems(query) {
    const q = (query || "").toLowerCase();
    return state.board.library
      .filter((ref) => ref.tag && (!q || ref.tag.toLowerCase().startsWith(q)))
      .map((ref) => ({
        tag: ref.tag,
        src: ref.source ? viewUrl(ref.source) : "",
        source: ref.source,
        label: ref.label,
        uid: ref.uid,
        kind: ref.kind || "image",
      }));
  }
  function refPopover(anchor, { onPick, onDisk }) {
    let popover = null;
    let timer = 0;
    const close = () => {
      clearTimeout(timer);
      timer = 0;
      if (popover) popover.remove();
      popover = null;
      openPopovers.delete(close);
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("wheel", onGraphMoved, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const onGraphMoved = () => close();
    const onOutside = (event) => {
      const target = event.target;
      if (popover && target instanceof Node && (popover.contains(target) || anchor.contains(target))) {
        return;
      }
      close();
    };
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    const open = () => {
      close();
      popover = el("div", `vig-cutter-popover ${SCHEME_CLASS}`);
      popover.appendChild(el("span", "pop-title", "project references"));
      const items = poolItems("");
      for (const item of items) {
        const row = el("button");
        const thumb = el("span", "pop-thumb");
        thumb.style.aspectRatio = String(canvas().ratio);
        if (item.kind === "video" && item.src) {
          const poster = document.createElement("video");
          poster.className = "vig-cutter-popvideo";
          poster.src = item.src;
          poster.muted = true;
          poster.preload = "metadata";
          thumb.appendChild(poster);
        } else if (item.src) {
          thumb.style.backgroundImage = `url("${item.src}")`;
        }
        const tag = el("span", "", item.tag);
        tag.style.fontWeight = "600";
        const name = el("span", "", item.label || "");
        name.style.cssText =
          "color:var(--cut-dim);max-width:110px;overflow:hidden;text-overflow:ellipsis";
        const drop = el("span", "pop-del");
        drop.appendChild(svg(ICONS.cross, 10, 2.4));
        drop.title = `Remove @${item.tag} from the project references`;
        drop.dataset.log = "remove reference";
        drop.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          close();
          removeFromLibrary(item.tag);
        });
        const placeholder = !item.source && item.kind === "image";
        if (placeholder) {
          thumb.appendChild(svg(ICONS.plus, 14, 1.8));
          thumb.classList.add("pop-thumb-empty");
          row.title = `@${item.tag} has no picture yet — press to choose it from disk; ` +
            "every clip citing it takes it";
        }
        row.append(thumb, tag, name, drop);
        row.addEventListener("click", async () => {
          close();
          if (placeholder) {
            const filled = await fillPlaceholderFromDisk(item.tag);
            if (!filled) return;
            onPick({ ...item, source: filled.source, label: filled.label,
                     src: viewUrl(filled.source) });
            return;
          }
          onPick(item);
        });
        popover.appendChild(row);
      }
      if (!items.length) popover.appendChild(el("span", "pop-empty", "no references yet"));
      popover.appendChild(el("span", "pop-rule"));
      const disk = el("button", "pop-disk");
      disk.appendChild(svg(ICONS.plus, 12));
      disk.appendChild(el("span", "", "add from disk…"));
      disk.addEventListener("click", () => {
        close();
        onDisk();
      });
      popover.appendChild(disk);
      popover.addEventListener("mouseenter", () => clearTimeout(timer));
      popover.addEventListener("mouseleave", () => {
        timer = setTimeout(close, 160);
      });
      document.body.appendChild(popover);
      openPopovers.add(close);
      document.addEventListener("pointerdown", onOutside, true);
      document.addEventListener("wheel", onGraphMoved, true);
      document.addEventListener("keydown", onKey, true);
      const box = anchor.getBoundingClientRect();
      popover.style.left = `${Math.round(
        Math.max(8, Math.min(box.left, window.innerWidth - popover.offsetWidth - 8)),
      )}px`;
      const above = box.top - popover.offsetHeight - 6;
      popover.style.top = `${Math.round(above > 8 ? above : box.bottom + 6)}px`;
    };
    anchor.addEventListener("mouseenter", () => {
      clearTimeout(timer);
      open();
    });
    anchor.addEventListener("mouseleave", () => {
      timer = setTimeout(close, 160);
    });
  }
  function openPopover(anchor, heading, build, hint, width, { sticky = false, onClose, below = false } = {}) {
    closePopovers(true);
    const popover = el("div", `vig-cutter-popover ${SCHEME_CLASS}`);
    const registry = sticky ? stickyPopovers : openPopovers;
    if (width) popover.style.cssText += width;
    popover.appendChild(el("span", "pop-title", heading));
    const close = () => {
      popover.remove();
      registry.delete(close);
      if (typeof onClose === "function") onClose();
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("wheel", onWheel, true);
      document.removeEventListener("pointermove", follow, true);
      document.removeEventListener("keydown", onKey, true);
    };
    const inside = (event) => {
      const target = event.target;
      return target instanceof Node && (popover.contains(target) || anchor.contains(target));
    };
    const onOutside = (event) => {
      if (event.button !== 0 || inside(event)) return;
      close();
    };
    const onWheel = (event) => {
      if (inside(event)) return;
      close();
    };
    const onKey = (event) => {
      if (event.key === "Escape") close();
    };
    for (const row of build(close)) popover.appendChild(row);
    if (hint) popover.appendChild(el("span", "pop-note", hint));
    const place = () => {
      const box = anchor.getBoundingClientRect();
      popover.style.left = `${Math.round(
        Math.max(8, Math.min(box.left - 6, window.innerWidth - popover.offsetWidth - 8)),
      )}px`;
      const above = box.top - popover.offsetHeight - 6;
      const fitsBelow = box.bottom + 6 + popover.offsetHeight <= window.innerHeight - 8;
      popover.style.top = `${Math.round(
        below && fitsBelow ? box.bottom + 6 : above > 8 ? above : box.bottom + 6,
      )}px`;
    };
    const follow = (event) => {
      if (event.buttons) place();
    };
    document.body.appendChild(popover);
    registry.add(close);
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("wheel", onWheel, true);
    document.addEventListener("pointermove", follow, true);
    document.addEventListener("keydown", onKey, true);
    place();
    return close;
  }
  function openModePopover(anchor, { heading, modes, current, carried, hint, onPick }) {
    openPopover(
      anchor,
      heading,
      (close) => {
        const column = el("div");
        column.style.cssText = "display:flex;flex-direction:column;gap:3px;padding:2px 0";
        for (const key of modes) {
          const meta = model.MODES[key];
          const mine = key === current;
          const lit = mine && carried;
          const chip = el("button", mine ? "on" : "", meta.label);
          chip.title = lit
            ? `${meta.title} — and it already carries the run out of this cut`
            : meta.title;
          chip.style.cssText =
            "padding:3px 8px;border-radius:4px;font-weight:700;font-size:10px;" +
            "letter-spacing:0.04em;text-align:left;justify-content:flex-start;" +
            `color:${meta.color};border:1px solid ${meta.color}${mine ? "" : "55"};` +
            `background:${meta.color}${lit ? "44" : mine ? "22" : "12"};` +
            (lit ? `box-shadow:0 0 0 1px ${meta.color}, 0 0 7px ${meta.color}66;` : "");
          chip.addEventListener("click", () => {
            close();
            onPick(key);
          });
          column.appendChild(chip);
        }
        return [column];
      },
      hint,
      "min-width:0;width:max-content;",
    );
  }
  function openRunPopover(anchor, { heading, current, hint, onPick, runs }) {
    openPopover(anchor, heading, (close) => (runs || model.CONTEXT_RUNS).map((run) => {
      const row = el("button", run === current ? "on" : "");
      const mark = el("span", "", run === current ? "●" : "");
      mark.style.cssText = "width:9px;font-size:10px;color:var(--cut-accent-lit);flex-shrink:0";
      const count = el("span", "", run === 1 ? "1 frame" : `${run} frames`);
      count.style.fontWeight = "600";
      const secs = el("span", "", run === 1 ? "still" : `${(run / model.FPS).toFixed(2)} s`);
      secs.style.cssText = "color:var(--cut-dim);margin-left:auto";
      row.append(mark, count, secs);
      row.addEventListener("click", () => {
        close();
        onPick(run);
      });
      return row;
    }), hint, "min-width:156px;");
  }
  function adoptIntoPool(asset, origin, kind = "image") {
    let entry = state.board.library.find((r) => r.source === asset.source);
    if (!entry && state.board.library.length < model.MAX_LIBRARY_REFS) {
      entry = {
        uid: `g${Date.now().toString(36)}`,
        kind,
        label: asset.label,
        source: asset.source,
        tag: "",
        frame: "",
        origin: origin === "library" ? "library" : "segment",
      };
      state.board.library.push(entry);
      model.normalise(state.board);
    } else if (entry && origin === "library") {
      entry.origin = "library";
    }
    return entry;
  }
  const VIDEO_TAKES_SIZE =
    "Give the video this picture's size — the film takes its shape, at no more "
    + "pixels than the picture has or the canvas already renders";
  const VIDEO_TAKES_SHAPE =
    "Give the video this picture's shape — the canvas keeps its megapixels";
  async function videoTakesSize(ref, { keepArea = false } = {}) {
    const here = selected();
    if (!ref || !ref.source) return;
    if (filmStarted()) {
      if (here) noteAgent(here, "error",
        "the film's shape is fixed once a clip has rendered at it — only its megapixels "
        + "can move now (the MP in the clip's header).");
      renderDetail();
      return;
    }
    if (typeof options.setCanvas !== "function") {
      if (here) noteAgent(here, "error", "this console cannot set the canvas.");
      renderDetail();
      return;
    }
    const size = await new Promise((done) => {
      const probe = new Image();
      probe.onload = () => done([probe.naturalWidth, probe.naturalHeight]);
      probe.onerror = () => done(null);
      probe.src = viewUrl(ref.source);
    });
    if (!size || !size[0] || !size[1]) {
      if (here) noteAgent(here, "error", `${ref.label || "that picture"} could not be read.`);
      renderDetail();
      return;
    }
    const [w, h] = size;
    const now = canvas();
    const budget = keepArea ? now.width * now.height : Math.min(w * h, now.width * now.height);
    const snap = (v) => Math.max(64, Math.round(v / 32) * 32);
    const fit = canvasForRatio(w / h, Math.sqrt(budget), Math.sqrt(budget));
    let width = snap(fit.width);
    let height = snap(fit.height);
    while (width * height > budget && width > 64 && height > 64) {
      if (width / height > w / h) width -= 32;
      else height -= 32;
    }
    applyCanvas(width, height, w / h, `from ${ref.label || "this picture"} (${w}×${h})`);
  }
  function followProjectCanvas() {
    const rendered = (state.board.segments || []).find((seg) => seg.clip && !seg.source_clip);
    const source = (rendered && rendered.clip) || String(state.board.film || "");
    if (!source) return Promise.resolve();
    return new Promise((settle) => {
      const probe = document.createElement("video");
      probe.preload = "metadata";
      probe.muted = true;
      const stall = setTimeout(settle, 5000);
      probe.onerror = () => {
        clearTimeout(stall);
        settle();
      };
      probe.onloadedmetadata = () => {
        clearTimeout(stall);
        const width = probe.videoWidth;
        const height = probe.videoHeight;
        probe.removeAttribute("src");
        const now = canvas();
        if (width > 0 && height > 0 && !(now.width === width && now.height === height)) {
          applyCanvas(width, height, width / height, "the canvas this project was rendered at");
        }
        settle();
      };
      probe.src = viewUrl(source);
    });
  }
  function followLoadedShape(seg, asset, width, height) {
    if (!(width > 0 && height > 0)) return;
    const ratio = width / height;
    const now = canvas();
    if (Math.abs(Math.log((now.width / now.height) / ratio)) < 0.01) return;
    const others = (state.board.segments || [])
      .some((other) => other !== seg && (other.clip || other.source_clip));
    if (others) {
      noteAgent(seg, "ok",
        `${asset.label || "this video"} is ${width}×${height}; the film is ${now.width}×${now.height} `
        + "and already has clips at that shape, so the video is fitted into the film's frame.");
      renderDetail();
      return;
    }
    const size = sizeFor(ratio, (now.width * now.height) / 1e6);
    applyCanvas(size.width, size.height, ratio,
      `the shape of ${asset.label || "the loaded video"} (${width}×${height})`);
  }
  function filmStarted() {
    return !!String(state.board.film || "").trim()
      || (state.board.segments || []).some((seg) => seg.clip || seg.source_clip);
  }
  function sizeFor(ratio, megapixels) {
    const target = megapixels * 1e6;
    let best = null;
    for (let height = 64; height <= 8192; height += 32) {
      const exact = height * ratio;
      for (const width of [Math.floor(exact / 32) * 32, Math.ceil(exact / 32) * 32]) {
        if (width < 64 || width > 8192) continue;
        const shapeOff = Math.abs(Math.log(width / height / ratio));
        const areaOff = Math.abs(Math.log((width * height) / target));
        const score = shapeOff * 10 + areaOff;
        if (!best || score < best.score) best = { width, height, score };
      }
    }
    return { width: best.width, height: best.height };
  }
  function applyCanvas(width, height, aim, why) {
    const here = selected();
    if (typeof options.setCanvas !== "function") {
      if (here) noteAgent(here, "error", "this console cannot set the canvas.");
      renderDetail();
      return;
    }
    const now = canvas();
    if (width === now.width && height === now.height) {
      if (here) noteAgent(here, "ok", `the video is already ${width}×${height}.`);
      renderDetail();
      return;
    }
    const done = options.setCanvas(width, height, aim);
    if (!done || !done.ok) {
      if (here) noteAgent(here, "error",
        `the canvas could not be set: ${(done && done.message) || "no width and height to write"}.`);
      renderDetail();
      return;
    }
    if (here) noteAgent(here, "ok",
      `the video is now ${done.width}×${done.height} (was ${now.width}×${now.height})`
      + (why ? `, ${why}` : "") + ` — set on ${done.where}`
      + (done.approx ? `; ${done.approx}` : "")
      + ". The canvas is the whole film's, so every clip renders at it from now on.");
    renderAll();
  }
  function canvasHolder(...children) {
    const holder = el("div", "vig-cutter vig-cutter-popsettings");
    holder.style.gap = "8px";
    holder.append(...children);
    return holder;
  }
  const CANVAS_SHAPES = [
    { w: 21, h: 9, caption: "Cinema" },
    { w: 16, h: 9, caption: "YouTube", platforms: "YouTube video, delivered at 1920×1080" },
    { w: 191, h: 100, label: "1.91:1", caption: "IG landscape",
      platforms: "Instagram landscape post, delivered at 1080×566" },
    { w: 3, h: 2, caption: "Photo" },
    { w: 4, h: 3, caption: "Classic" },
    { w: 1, h: 1, caption: "IG square", platforms: "Instagram square post, delivered at 1080×1080" },
    { w: 4, h: 5, caption: "IG feed", platforms: "Instagram feed portrait, delivered at 1080×1350" },
    { w: 3, h: 4, caption: "Portrait" },
    { w: 2, h: 3, caption: "Photo" },
    { w: 9, h: 16, caption: "Reels · TikTok · Shorts",
      platforms: "Instagram Reels and Stories, TikTok and YouTube Shorts, delivered at 1080×1920" },
  ];
  const SHAPE_AREA = 2000;
  const SHAPE_BOX = { width: 60, height: 60 };
  const SHAPES_PER_ROW = 5;
  function shapeFrame(ratio, area = SHAPE_AREA, box = SHAPE_BOX) {
    let width = Math.sqrt(area * ratio);
    let height = Math.sqrt(area / ratio);
    const fit = Math.min(1, box.width / width, box.height / height);
    width *= fit;
    height *= fit;
    return { width: Math.round(width), height: Math.round(height) };
  }
  function openCanvasShape(anchor) {
    const now = canvas();
    const mp = (now.width * now.height) / 1e6;
    openPopover(anchor, "the film's shape", (close) => {
      const grid = el("div", "vig-cutter-canvaspick");
      const rowHeight = (index) => {
        const start = index - (index % SHAPES_PER_ROW);
        return Math.max(...CANVAS_SHAPES.slice(start, start + SHAPES_PER_ROW)
          .map((one) => shapeFrame(one.w / one.h).height));
      };
      for (const [index, shape] of CANVAS_SHAPES.entries()) {
        const ratio = shape.w / shape.h;
        const name = shape.label || `${shape.w}:${shape.h}`;
        const size = sizeFor(ratio, mp);
        const chip = el("button", "vig-cutter-shapebtn");
        chip.dataset.log = `shape ${name}`;
        const holder = el("span", "vig-cutter-shapebox");
        const frame = el("span", "vig-cutter-shapeframe", name);
        const drawn = shapeFrame(ratio);
        frame.style.width = `${drawn.width}px`;
        frame.style.height = `${drawn.height}px`;
        holder.style.height = `${rowHeight(index)}px`;
        holder.appendChild(frame);
        chip.append(holder, el("span", "vig-cutter-shapecap", shape.caption));
        const cost = canvasCost(size.width, size.height);
        chip.title =
          `${name}: ${size.width}×${size.height} — ${mp.toFixed(2)} MP, as now; `
          + `${tokenText(cost.tokens)} tokens a step`
          + (cost.wait ? `, about ${cost.wait} for this clip` : "") + "." +
          (shape.platforms
            ? ` ${shape.platforms}; bring it up to that size with an upscale pass ` +
              "after the film is made."
            : "");
        if (Math.abs(Math.log((now.width / now.height) / ratio)) < 0.02) chip.classList.add("on");
        chip.addEventListener("click", () => {
          close();
          applyCanvas(size.width, size.height, ratio,
            shape.platforms ? `${name} — ${shape.platforms}` : name);
        });
        grid.appendChild(chip);
      }
      const typed = el("div", "vig-cutter-inline");
      typed.style.gap = "6px";
      const field = (value, title) => {
        const input = document.createElement("input");
        input.type = "number";
        input.min = "64";
        input.max = "8192";
        input.step = "32";
        input.value = String(value);
        input.title = title;
        input.style.width = "76px";
        return input;
      };
      const w = field(now.width, "Width in pixels — snapped to 32, the grid the node renders on");
      const h = field(now.height, "Height in pixels — snapped to 32, the grid the node renders on");
      const set = el("button", "vig-cutter-ghost vig-cutter-setshape", "Set");
      const snap = (v) => Math.max(64, Math.min(8192, Math.round((Number(v) || 0) / 32) * 32));
      const typedOk = () => Number(w.value) > 0 && Number(h.value) > 0;
      const paintSet = () => {
        set.disabled = !typedOk();
        const ratio = typedOk() ? Number(w.value) / Number(h.value) : 1;
        const drawn = shapeFrame(ratio, 1600, { width: 72, height: 44 });
        set.style.width = `${Math.max(30, drawn.width)}px`;
        set.style.height = `${Math.max(18, drawn.height)}px`;
        set.title = typedOk()
          ? `Set the film to ${snap(w.value)}×${snap(h.value)}`
          : "Type a width and a height";
      };
      const apply = () => {
        if (!typedOk()) return;
        const width = snap(w.value);
        const height = snap(h.value);
        close();
        applyCanvas(width, height, width / height, "typed in");
      };
      set.addEventListener("click", apply);
      for (const input of [w, h]) {
        input.addEventListener("input", paintSet);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") apply();
        });
      }
      paintSet();
      typed.append(w, el("span", "vig-cutter-label", "×"), h, set);
      return [canvasHolder(grid, typed)];
    }, "Only until the first clip renders: after that the shape is the film's, and "
    + `only its megapixels move. ${costFootnote(now)}`,
    "width:372px", { below: true });
  }
  const CANVAS_MEGAPIXELS = [0.25, 0.4, 0.5, 0.6, 0.8, 1.0, 1.3, 1.6];
  function openCanvasMegapixels(anchor) {
    const now = canvas();
    const ratio = now.width / now.height;
    const mp = (now.width * now.height) / 1e6;
    openPopover(anchor, "megapixels per frame", (close) => {
      const grid = el("div", "vig-cutter-canvaspick");
      for (const value of CANVAS_MEGAPIXELS) {
        const size = sizeFor(ratio, value);
        const chip = el("button", "vig-cutter-ghost vig-cutter-mpbtn");
        const cost = canvasCost(size.width, size.height);
        const said = cost.wait || `${Math.round(cost.tokens / 1000)}k`;
        chip.appendChild(el("span", "vig-cutter-mpvalue", value.toFixed(2)));
        chip.appendChild(el("span", "vig-cutter-mpcost", said));
        chip.title =
          `${size.width}×${size.height} — ${tokenText(cost.tokens)} tokens a step`
          + (cost.wait ? `, about ${cost.wait} for this clip at ${cost.steps} steps` : "")
          + `. ${costWhy(cost.cost)}`;
        if (size.width === now.width && size.height === now.height) {
          chip.classList.add("on");
        }
        chip.addEventListener("click", () => {
          close();
          applyCanvas(size.width, size.height, ratio, `${value.toFixed(2)} MP at the same shape`);
        });
        grid.appendChild(chip);
      }
      const typed = el("div", "vig-cutter-inline");
      typed.style.gap = "6px";
      const input = document.createElement("input");
      input.type = "number";
      input.min = "0.1";
      input.max = "8";
      input.step = "0.05";
      input.value = mp.toFixed(2);
      input.style.width = "76px";
      input.title = "Megapixels per frame — the shape stays as it is";
      const set = el("button", "vig-cutter-ghost", "Set");
      const apply = () => {
        const value = Math.max(0.1, Math.min(8, Number(input.value) || mp));
        const size = sizeFor(ratio, value);
        close();
        applyCanvas(size.width, size.height, ratio, `${value.toFixed(2)} MP at the same shape`);
      };
      set.addEventListener("click", apply);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") apply();
      });
      typed.append(input, el("span", "vig-cutter-label", "MP"), set);
      return [canvasHolder(grid, typed)];
    }, costFootnote(now), "width:260px", { below: true });
  }
  function watchMedia(ref) {
    if (!ref || !ref.source) return;
    const layer = el("div", "vig-cutter-lightbox");
    const frame = el("div", "vig-cutter-lightframe");
    const video = document.createElement("video");
    video.src = viewUrl(ref.source);
    video.controls = true;
    video.autoplay = true;
    video.loop = true;
    const bar = el("div", "vig-cutter-lightbar");
    const name = el("span", "vig-cutter-mono", ref.label || ref.source);
    const shut = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
      layer.remove();
      document.removeEventListener("keydown", onKey, true);
    };
    function onKey(event) {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      shut();
    }
    const close = el("button", "vig-cutter-ghost", "✕ Close");
    close.addEventListener("click", shut);
    bar.append(name, el("div", "vig-cutter-spring"), close);
    frame.append(video, bar);
    layer.appendChild(frame);
    layer.addEventListener("mousedown", (event) => {
      if (event.target === layer) shut();
    });
    document.addEventListener("keydown", onKey, true);
    root.appendChild(layer);
  }
  function tileDots(...buttons) {
    const row = el("div", "vig-tile-dots");
    row.append(...buttons);
    return row;
  }
  const TILE_HULL = 64;
  const TILE_STROKE = 1.0;
  const hullAreas = new Map();
  function hullArea(icon) {
    if (hullAreas.has(icon)) return hullAreas.get(icon);
    let area = 0;
    let centre = [12, 12];
    try {
      const probe = svg(icon, 24, 2);
      probe.style.cssText = "position:absolute;left:-9999px;top:-9999px;visibility:hidden";
      document.body.appendChild(probe);
      const points = [];
      for (const part of probe.querySelectorAll("*")) {
        if (typeof part.getTotalLength !== "function") continue;
        const length = part.getTotalLength();
        for (let i = 0; i <= 48; i += 1) {
          const at = part.getPointAtLength((length * i) / 48);
          points.push([at.x, at.y]);
        }
      }
      probe.remove();
      points.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const turn = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
      const lower = [];
      const upper = [];
      for (const point of points) {
        while (lower.length > 1 && turn(lower[lower.length - 2], lower[lower.length - 1], point) <= 0) lower.pop();
        lower.push(point);
      }
      for (const point of points.slice().reverse()) {
        while (upper.length > 1 && turn(upper[upper.length - 2], upper[upper.length - 1], point) <= 0) upper.pop();
        upper.push(point);
      }
      const hull = lower.slice(0, -1).concat(upper.slice(0, -1));
      const xs = points.map((point) => point[0]);
      const ys = points.map((point) => point[1]);
      centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
      let twice = 0;
      let perimeter = 0;
      for (let i = 0; i < hull.length; i += 1) {
        const [x0, y0] = hull[i];
        const [x1, y1] = hull[(i + 1) % hull.length];
        twice += x0 * y1 - x1 * y0;
        perimeter += Math.hypot(x1 - x0, y1 - y0);
      }
      area = Math.abs(twice) / 2 + perimeter + Math.PI;
    } catch {
      area = 0;
    }
    if (!(area > 0 && area <= 24 * 24)) {
      area = 300;
      centre = [12, 12];
    }
    const measured = { area, centre };
    hullAreas.set(icon, measured);
    return measured;
  }
  const TILE_BOX = 14;
  function tileDot(background, icon, title, onClick, hover) {
    const dotEl = el("button", `vig-tile-dot${hover ? " hover" : ""}`);
    const { area, centre } = hullArea(icon);
    const perUnit = Math.sqrt(TILE_HULL / area);
    const span = TILE_BOX / perUnit;
    const mark = svg(icon, 24, TILE_STROKE / perUnit);
    mark.setAttribute("width", "100%");
    mark.setAttribute("height", "100%");
    mark.setAttribute("viewBox",
      `${centre[0] - span / 2} ${centre[1] - span / 2} ${span} ${span}`);
    dotEl.appendChild(mark);
    dotEl.style.background = background;
    dotEl.title = title;
    dotEl.addEventListener("click", (event) => {
      event.stopPropagation();
      onClick(event);
    });
    dotEl.addEventListener("pointerdown", (event) => event.stopPropagation());
    return dotEl;
  }
  function loadSkillCatalogue(then) {
    if (state.agent.skills || state.agent.skillsBusy) return;
    if (typeof options.callRoute !== "function") return;
    state.agent.skillsBusy = true;
    options
      .callRoute("/vig/h3/cutter/skills", {})
      .then((data) => {
        state.agent.skills = Array.isArray(data && data.skills) ? data.skills : [];
        state.agent.alwaysSkills = Array.isArray(data && data.always) ? data.always : [];
        state.agent.skillsFolder = String((data && data.folder) || "");
      })
      .catch(() => {
        state.agent.skills = [];
      })
      .finally(() => {
        state.agent.skillsBusy = false;
        if (typeof then === "function") then();
      });
  }
  function markStale(seg) {
    if (seg.status === "ready") seg.status = "stale";
  }
  function fillPlaceholder(tag, asset) {
    const entry = tag ? state.board.library.find((r) => r.tag === tag) : null;
    if (!entry || entry.source || !asset?.source) return null;
    entry.source = asset.source;
    entry.label = asset.label || entry.label;
    for (const seg of state.board.segments) {
      let touched = model.citedTags(state.board, seg).includes(tag);
      for (const ref of seg.refs) {
        if (ref.tag !== tag) continue;
        ref.source = asset.source;
        ref.label = entry.label;
        ref.frame = "";
        touched = true;
      }
      if (touched) markStale(seg);
    }
    return entry;
  }
  async function fillPlaceholderFromDisk(tag) {
    const asset = await pick("image");
    if (!asset) return null;
    const entry = fillPlaceholder(tag, asset);
    if (entry) {
      commit();
      renderAll();
    }
    return entry;
  }
  function pressFill(press) {
    press.classList.add("vig-cutter-fillable");
    const fill = el("span", "vig-cutter-fill");
    press.insertBefore(fill, press.firstChild);
    return (fraction) => {
      const on = fraction !== null && fraction !== undefined;
      press.classList.toggle("filling", on);
      fill.style.width = on ? `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%` : "0%";
    };
  }
  function pressWithTakes(press) {
    const holder = el("div", "vig-cutter-split");
    const takes = document.createElement("select");
    takes.className = "vig-cutter-takes";
    takes.title =
      "How many takes this press makes. Each one is a whole render on its own " +
      "seed; they land in the gallery as they finish, and the timeline keeps " +
      "what it plays.";
    takes.dataset.log = "takes per press";
    for (const n of [1, 2, 3, 4, 6, 8]) {
      const option = el("option", "", `×${n}`);
      option.value = String(n);
      if (n === Math.max(1, Number(state.board.batch_takes) || 1)) option.selected = true;
      takes.appendChild(option);
    }
    takes.addEventListener("click", (event) => event.stopPropagation());
    takes.addEventListener("change", () => {
      state.board.batch_takes = Math.max(1, Number(takes.value) || 1);
      commit();
      renderDetail();
    });
    holder.append(press, takes);
    return { holder, press, takes };
  }
  function takeCountsOf() {
    const root = (state.board.project_dir || "").trim();
    if (state.takeCountsFor !== root) {
      state.takeCounts = {};
      state.takeCountsFor = root;
    }
    return state.takeCounts;
  }
  function countTakes(seg, index, pip) {
    const root = (state.board.project_dir || "").trim();
    if (!root || typeof options.callRoute !== "function") return;
    const known = takeCountsOf()[seg.id];
    if (known !== undefined) return;
    const stillHere = () => (state.board.project_dir || "").trim() === root;
    options
      .callRoute("/vig/h3/cutter/takes", {
        path: root,
        index,
        id: seg.id,
        name: seg.name || "",
      })
      .then((data) => {
        if (!stillHere()) return;
        const takes = Array.isArray(data && data.takes) ? data.takes.length : 0;
        takeCountsOf()[seg.id] = takes;
        renderProjectTotals();
        if (!pip.isConnected) return;
        pip.textContent = String(takes);
        pip.style.display = takes ? "" : "none";
      })
      .catch(() => {
        if (!stillHere()) return;
        takeCountsOf()[seg.id] = 0;
        renderProjectTotals();
      });
  }
  function theRest() {
    const all = state.board.segments || [];
    const { clips, stop } = model.clipsStillToRender(all);
    return {
      clips,
      numbers: clips.map((s) => all.indexOf(s) + 1),
      stop: stop ? { number: stop.index + 1, why: stop.why } : null,
    };
  }
  async function renderTheRest() {
    const rest = theRest();
    if (!rest.clips.length) {
      flashOver(parts.filmPlayer, parts.generateFilm.title);
      return;
    }
    const takes = Math.max(1, Number(state.board.batch_takes) || 1);
    const n = rest.clips.length;
    const yes = await askInPanel(
      "Render the rest of the film",
      `Clip${n > 1 ? "s" : ""} ${model.clipRanges(rest.numbers)} ${n > 1 ? "have" : "has"} no ` +
        `take yet. ${n > 1 ? "They render" : "It renders"} in order in one run, each ` +
        "continuing the one before it, and each goes on the timeline as it lands." +
        (takes > 1 ? ` ${takes} takes per clip: the first goes on the timeline, the rest to its gallery.` : "") +
        (rest.stop ? `\n\nThe run stops before clip ${rest.stop.number}, which ${rest.stop.why}.` : "") +
        "\n\nStop the queue from the console at any time; whatever was rendered stays.",
      `Render ${n} clip${n > 1 ? "s" : ""}`,
      "Cancel",
    );
    if (!yes) return;
    const broken = await formatErrors(rest.clips);
    if (broken) {
      flashOver(parts.filmPlayer, broken, "error");
      return;
    }
    const mode = seedModeOf(state.board);
    for (const seg of rest.clips) seg.seed = model.nextSeed(seg.seed, mode, randomSeed);
    state.renderPress = "renderRest";
    commit();
    renderTimeline();
    renderDetail();
    request({ only: rest.clips.map((s) => s.id) });
  }
  async function renderThisClip(seg, index, press = "render") {
    state.renderPress = press;
      if (seg.locked) {
        noteAgent(
          seg,
          "error",
          "This clip is locked, so nothing renders it — unlock it in the header above " +
            "to make another take.",
        );
        renderDetail();
        return;
      }
      const batch = Math.max(1, Number(state.board.batch_takes) || 1);
      if (batch > 1 && !(state.board.project_dir || "").trim()) {
        await offerProject(`${batch} takes are about to be rendered, but this cut has no project `
          + "folder: only the one that goes on the timeline is kept where you can see it, and "
          + "the others stay in the render cache, where no gallery shows them.");
      }
      const driftSaid = promptDriftSentence(seg);
      const was = seg.seed;
      const mode = seedModeOf(state.board);
      seg.seed = model.nextSeed(was, mode, randomSeed);
      const takes = Math.max(1, Number(state.board.batch_takes) || 1);
      const stillCurrent = mode === "fixed" && seg.status === "ready" && !!seg.take_key;
      noteAgent(
        seg,
        stillCurrent ? "warn" : "ok",
        driftSaid + (seg.seed === was
          ? `Rendering on the same seed ${seg.seed}`
          : `Rendering on a new seed: ${was} → ${seg.seed}`) +
          `${takes > 1 ? `, ${takes} takes` : ""}. ` +
          (stillCurrent
            ? "Nothing about this clip has changed since its last render, so it is "
              + "already in the cache and no new take will be filed. Change what you "
              + "are testing — the steps, the prompt, the sampler — and press again."
            : state.board.new_take_to_timeline && !seg.locked
              ? "The take goes on the timeline; the one it plays now stays in the gallery."
              : "The take goes to this clip's gallery; "
                + "the timeline keeps what it plays until you choose there "
                + "(or switch new renders onto the timeline under the gear)."),
      );
      commit();
      renderDetail();
      renderTimeline();
      const ids = [seg.id];
      const all = state.board.segments || [];
      const missing = model.needsRenderedFirst(all, index);
      if (missing.length) {
        const nums = missing.map((s) => all.indexOf(s) + 1);
        const nearest = nums[nums.length - 1];
        const list =
          nums.length === 1
            ? `clip ${nums[0]}`
            : `clips ${nums.slice(0, -1).join(", ")} and ${nearest}`;
        const takes = model.carriedRun(seg) > 0 ? "carries motion out of" : "opens on";
        const yes = await askInPanel(
          "Nothing to open on",
          `Clip ${index + 1} ${takes} clip ${nearest}, and ${list} ` +
            `${nums.length === 1 ? "has" : "have"} never been rendered \u2014 nothing ` +
            `on the timeline to continue from, so there is no frame for clip ` +
            `${index + 1} to start from, and this press would sample nothing.` +
            `\n\nRender ${list} first, in the same run?`,
          `Render ${list} and ${index + 1}`,
          "Cancel",
        );
        if (!yes) return;
        ids.unshift(...missing.map((s) => s.id));
      }
      const broken = await formatErrors(ids.map((id) => all.find((s) => s.id === id)).filter(Boolean));
      if (broken) {
        noteAgent(seg, "error", broken);
        renderDetail();
        return;
      }
      request({ only: ids, force: [seg.id] });
  }
  async function formatErrors(segs) {
    if (typeof options.callRoute !== "function" || !segs.length) return "";
    let data;
    try {
      data = await options.callRoute(VALIDATE_ROUTE, {
        clips: segs.map((s) => ({ id: s.id, prompt: s.prompt || "", mode: s.mode, seconds: s.seconds })),
      });
    } catch {
      return "";
    }
    const bad = ((data && data.clips) || []).filter((c) => Array.isArray(c.errors) && c.errors.length);
    if (!bad.length) return "";
    const all = state.board.segments || [];
    const lines = bad.map((c) => {
      const n = all.findIndex((s) => s.id === c.id) + 1;
      const said = c.errors.slice(0, 2).map((e) => `[${e.code}] ${e.message}`).join("; ");
      const more = c.errors.length > 2 ? ` (+${c.errors.length - 2} more)` : "";
      return `clip ${n}'s prompt breaks the format: ${said}${more}`;
    });
    return `${lines.join(" · ")} — nothing was queued. Fix the prompt, or write it again.`;
  }
  async function deleteSegment(seg, index) {
    if (seg.locked) {
      noteAgent(seg, "error", "This clip is locked — unlock it before deleting it.");
      renderDetail();
      return;
    }
    const what = `${index + 1}. ${seg.name || "Untitled scene"} · ${seg.seconds} s`;
    if (!(await askInPanel(
      "Delete this clip",
      `${what}\n\nIts place in the film goes, with its prompt and its ` +
        "settings. Takes already rendered stay in the project folder.\n\n" +
        "↶ undo, over the timeline, brings it back.",
      "Delete", "Cancel",
    ))) return;
    state.board.segments = model.removeSegment(state.board.segments, seg.id);
    syncClipFolders();
    commit();
    renderAll();
  }
  function refreshFromRun(seg, field, label) {
    const fresh = state.runFresh[seg.id];
    const entry = fresh && fresh[field];
    if (!entry) return null;
    const button = el("button", "vig-cutter-ghost", "↻ from the render");
    button.style.cssText = "padding:1px 7px;font-size:10px;color:var(--cut-accent-lit)";
    button.dataset.log = `refresh ${field}`;
    button.title =
      `Replace this ${label} with the one the last render used. Yours is what is ` +
      `standing here because you edited it while the clip was sampling; this is ` +
      `the other version, kept since the run finished. Nothing is lost either ` +
      `way -- the render's ${label} stays with its take in the project folder.`;
    button.addEventListener("click", () => {
      seg[field] = entry.ran;
      delete fresh[field];
      if (!Object.keys(fresh).length) delete state.runFresh[seg.id];
      commit();
      renderDetail();
      renderTimeline();
    });
    return button;
  }
  function keyframeSlot(seg, slot, label, ratio) {
    const holder = el("div");
    holder.style.cssText = "display:flex;flex-direction:column;gap:4px";
    const wrap = el("div");
    wrap.style.position = "relative";
    holder.appendChild(wrap);
    const existing = seg.refs.find((r) => r.kind === "image" && r.uid.startsWith(slot));
    const fromDisk = async () => {
      const asset = await pick("image");
      if (!asset) return;
      setSlot({ source: asset.source, label: asset.label, tag: "" });
    };
    const setSlot = ({ source, label: refLabel, tag }) => {
      seg.refs = seg.refs.filter((r) => !(r.kind === "image" && r.uid.startsWith(slot)));
      const pinned = {
        uid: `${slot}-${Date.now().toString(36)}`,
        kind: "image",
        label: refLabel || "",
        source,
        tag: tag || "",
        frame: "",
      };
      seg.refs.push(pinned);
      fileReference(seg, pinned);
      markStale(seg);
      commit();
      renderTimeline();
      renderDetail();
      renderPlayers();
    };
    if (existing) {
      const tile = el("div", "vig-cutter-frame-slot filled");
      tile.style.aspectRatio = String(ratio);
      const url = viewUrl(existing.source);
      if (url) tile.style.backgroundImage = `url("${url}")`;
      applyFrame(tile, existing);
      const caption = el("span", "slot-caption", label);
      tile.appendChild(caption);
      wrap.appendChild(tile);
      wrap.append(tileDots(
        tileDot("#c0665a", ICONS.cross, "Remove", () => {
          seg.refs = seg.refs.filter((r) => r !== existing);
          markStale(seg);
          commit();
          renderDetail();
        }),
        tileDot("#4a7fb3", ICONS.refresh, "Replace image", fromDisk),
        tileDot(
          "#b3894a",
          ICONS.star,
          "Edit appearance — crop it, carry details onto it, render new versions",
          () => openRefEditor(existing, {
            key: `${seg.id}:${slot}`,
            label: `${label} · ${seg.name || "clip"}`,
          }),
        ),
        tileDot("#6b7fb3", ICONS.frame, VIDEO_TAKES_SIZE, () => videoTakesSize(existing)),
      ));
    } else {
      const tile = el("button", "vig-cutter-frame-slot empty");
      tile.style.aspectRatio = String(ratio);
      tile.appendChild(svg(ICONS.plus, 18, 1.8));
      tile.appendChild(el("span", "slot-label", label));
      tile.addEventListener("click", fromDisk);
      wrap.appendChild(tile);
    }
    refPopover(wrap, {
      onPick: (item) => setSlot({ source: item.source, label: item.label, tag: item.tag }),
      onDisk: fromDisk,
    });
    return holder;
  }
  function refGallery(seg, kind, ratio) {
    const cap = model.SEGMENT_REF_CAPS[kind] || model.MAX_SEGMENT_REFS;
    const gallery = el("div", "vig-cutter-gallery");
    gallery.style.alignItems = "flex-start";
    const items = seg.refs.filter(
      (r) => r.kind === kind && !r.uid.startsWith("first") && !r.uid.startsWith("last"),
    );
    for (const ref of items) {
      if (kind === "image") {
        const tile = el("div", "vig-writer-tile");
        const thumb = el("div", "vig-writer-thumb");
        thumb.style.aspectRatio = String(ratio);
        const src = ref.source ? viewUrl(ref.source) : "";
        if (src) thumb.style.backgroundImage = `url("${src}")`;
        applyFrame(thumb, ref);
        thumb.title = `${ref.label || "reference"} — drag into the clip prompt as @${ref.tag}`;
        thumb.addEventListener("pointerdown", (event) => {
          if (thumb.dataset.reframing) return;
          if (ref.tag) startPointerTagDrag(ref.tag, event, src);
        });
        const chip = el("div", "vig-writer-tag");
        chip.append(el("span", "", "⠿"), el("span", "", ` ${ref.tag || "R?"}`));
        chip.title = "drag into the clip prompt";
        chip.addEventListener("pointerdown", (event) => {
          if (ref.tag) startPointerTagDrag(ref.tag, event, src);
        });
        tile.append(
          thumb,
          chip,
          tileDots(
          tileDot("#c0665a", ICONS.cross, "Remove", () => {
            seg.refs = seg.refs.filter((r) => r !== ref);
            dropUnusedPoolEntry(ref.tag);
            markStale(seg);
            commit();
            renderDetail();
          }),
          tileDot(
            "#4a7fb3",
            ICONS.refresh,
            "Replace image",
            async () => {
              const asset = await pick("image");
              if (!asset) return;
              if (fillPlaceholder(ref.tag, asset)) {
                commit();
                renderAll();
                return;
              }
              const entry = adoptIntoPool(asset);
              ref.source = asset.source;
              ref.label = asset.label;
              ref.tag = entry ? entry.tag : "";
              ref.frame = "";
              markStale(seg);
              commit();
              renderDetail();
            },
            true,
          ),
          tileDot(
            "#b3894a",
            ICONS.star,
            "Edit appearance — crop it, carry details onto it, render new versions",
            () => openRefEditor(ref),
            true,
          ),
          tileDot("#6b7fb3", ICONS.frame, VIDEO_TAKES_SHAPE,
            () => videoTakesSize(ref, { keepArea: true }), true),
          ),
        );
        gallery.appendChild(tile);
      } else if (kind === "video" && ref.source) {
        const tile = el("div", "vig-writer-tile");
        const thumb = el("div", "vig-writer-thumb");
        thumb.style.aspectRatio = String(ratio);
        const poster = document.createElement("video");
        poster.className = "vig-cutter-tilevideo";
        poster.src = viewUrl(ref.source);
        poster.muted = true;
        poster.loop = true;
        poster.preload = "metadata";
        thumb.addEventListener("mouseenter", () => poster.play().catch(() => {}));
        thumb.addEventListener("mouseleave", () => poster.pause());
        thumb.appendChild(poster);
        thumb.title = `${ref.label || "video reference"} — drag into the clip prompt as @${ref.tag}`;
        thumb.addEventListener("pointerdown", (event) => {
          if (ref.tag) startPointerTagDrag(ref.tag, event, "");
        });
        tile.appendChild(thumb);
        const chip = el("div", "vig-writer-tag");
        chip.append(el("span", "", "⠿"), el("span", "", ` ${ref.tag || "R?"}`));
        chip.title = "drag into the clip prompt";
        chip.addEventListener("pointerdown", (event) => {
          if (ref.tag) startPointerTagDrag(ref.tag, event, "");
        });
        tile.appendChild(chip);
        tile.append(tileDots(
          tileDot("#c0665a", ICONS.cross, "Remove", () => {
            seg.refs = seg.refs.filter((r) => r !== ref);
            markStale(seg);
            commit();
            renderDetail();
          }),
          tileDot("#4a7fb3", ICONS.refresh, "Replace video", async () => {
            const asset = await pick(kind);
            if (!asset) return;
            ref.source = asset.source;
            ref.label = asset.label;
            const entry = adoptIntoPool(asset, "segment", "video");
            ref.tag = entry ? entry.tag : ref.tag;
            markStale(seg);
            commit();
            renderDetail();
          }, true),
          tileDot("#4a9b6e", ICONS.play, "Watch this reference", () => watchMedia(ref), true),
        ));
        gallery.appendChild(tile);
      } else {
        const tile = el("div", "vig-cutter-media-slot");
        tile.style.aspectRatio = String(ratio);
        tile.title = ref.label || ref.source || "empty";
        tile.appendChild(svg(kind === "audio" ? ICONS.audiobars : ICONS.filmstrip, 20, 1.5));
        tile.appendChild(el("span", "slot-file", ref.label || "empty"));
        tile.addEventListener("click", async () => {
          const asset = await pick(kind);
          if (!asset) return;
          ref.source = asset.source;
          ref.label = asset.label;
          markStale(seg);
          commit();
          renderDetail();
        });
        tile.append(tileDots(
          tileDot("#c0665a", ICONS.cross, "Remove", () => {
            seg.refs = seg.refs.filter((r) => r !== ref);
            markStale(seg);
            commit();
            renderDetail();
          }),
          tileDot(
            "#4a7fb3",
            ICONS.refresh,
            `Replace ${kind}`,
            async () => {
              const asset = await pick(kind);
              if (!asset) return;
              ref.source = asset.source;
              ref.label = asset.label;
              markStale(seg);
              commit();
              renderDetail();
            },
            true,
          ),
        ));
        tile.classList.add("vig-writer-tile");
        gallery.appendChild(tile);
      }
    }
    if (items.length < cap) {
      const noun = kind === "image" ? "reference" : kind;
      const add = el("button", "vig-cutter-frame-slot empty");
      add.style.aspectRatio = String(ratio);
      add.style.width = "132px";
      add.appendChild(svg(ICONS.plus, 18, 1.8));
      add.appendChild(
        el("span", "slot-label", `${noun} ${Math.min(cap, items.length + 1)}/${cap}`),
      );
      const fromDisk = async () => {
        const asset = await pick(kind);
        if (!asset) return;
        const ref = {
          uid: `${kind}-${Date.now().toString(36)}`,
          kind,
          label: asset.label,
          source: asset.source,
          tag: "",
          frame: "",
        };
        if (kind === "image" || kind === "video") {
          const entry = adoptIntoPool(asset, "segment", kind);
          ref.tag = entry ? entry.tag : "";
        }
        seg.refs.push(ref);
        markStale(seg);
        commit();
        renderDetail();
        fileReference(seg, ref);
      };
      add.addEventListener("click", fromDisk);
      if (kind === "image" || kind === "video") {
        refPopover(add, {
          onPick: (item) => {
            const picked = {
              uid: `${kind}-${Date.now().toString(36)}`,
              kind,
              label: item.label,
              source: item.source,
              tag: item.tag,
              frame: "",
            };
            seg.refs.push(picked);
            markStale(seg);
            commit();
            renderDetail();
            fileReference(seg, picked);
          },
          onDisk: fromDisk,
        });
      }
      gallery.appendChild(add);
    }
    return gallery;
  }
  function attachPromptDrop(textarea, wrap, seg) {
    attachTextDrop(textarea, wrap, {
      activeTag: () => (state.dragRef ? state.dragRef.tag : null),
      apply: (text) => {
        textarea.value = text;
        seg.prompt = text;
        paintPromptHighlight();
        if (seg.status === "ready") seg.status = "stale";
        state.dragRef = null;
        commit();
        renderTimeline();
      },
    });
  }
  const openPopovers = new Set();
  const stickyPopovers = new Set();
  function closePopovers(everything = false) {
    for (const close of [...openPopovers]) close();
    if (everything) for (const close of [...stickyPopovers]) close();
  }
  function clearPhantom() {
    for (const ghost of root.querySelectorAll(".vig-cutter-phantom")) ghost.remove();
  }
  async function removeFromLibrary(tag) {
    const entry = state.board.library.find((r) => r.tag === tag);
    if (!entry) return;
    const numbered = (list) => list.map((s) => state.board.segments.indexOf(s) + 1).join(", ");
    const holding = state.board.segments.filter((s) => s.refs.some((r) => r.tag === tag));
    const citing = state.board.segments.filter(
      (s) => (s.prompt || "").includes(`@${tag}`) || (s.script || "").includes(`@${tag}`),
    );
    if (holding.length || citing.length) {
      const lines = [];
      if (holding.length) {
        lines.push(`It is attached to clip ${numbered(holding)} and will be taken off ` +
          `${holding.length > 1 ? "them" : "it"} — ${holding.length > 1 ? "those clips" : "that clip"} ` +
          "will read as changed.");
      }
      if (citing.length) {
        lines.push(`@${tag} is written in the text of clip ${numbered(citing)}; the words stay ` +
          "as they are and will cite nothing.");
      }
      if (!(await askInPanel(`Remove @${tag} from the references?`, lines.join("\n\n"), "Remove"))) {
        return;
      }
    }
    state.board.library = state.board.library.filter((r) => r !== entry);
    for (const seg of holding) {
      seg.refs = seg.refs.filter((r) => r.tag !== tag);
      markStale(seg);
    }
    commit();
    renderAll();
  }
  function dropUnusedPoolEntry(tag) {
    if (!tag) return;
    const held = state.board.segments.some((s) => s.refs.some((r) => r.tag === tag));
    const cited = state.board.segments.some(
      (s) => (s.prompt || "").includes(`@${tag}`) || (s.script || "").includes(`@${tag}`),
    );
    const entry = state.board.library.find((r) => r.tag === tag);
    if (!entry || entry.origin === "library" || held || cited) return;
    state.board.library = state.board.library.filter((r) => r !== entry);
  }
  forgetHistory();
  renderAll();
  return {
    root,
    setRunStarted(detail = {}) {
      const base = {};
      for (const seg of state.board.segments) {
        base[seg.id] = { prompt: seg.prompt || "", script: seg.script || "" };
      }
      state.runBase = base;
      state.runTokens = Math.trunc(Number(detail.tokens_per_step) || 0);
    },
    setBoard(value) {
      const base = state.runBase;
      const mine = base
        ? new Map(state.board.segments.map((seg) => [seg.id, seg]))
        : null;
      state.board = model.readBoard(value);
      state.board.aspect_from_image = false;
      state.takeCounts = {};
      forgetFilmCount();
      state.runBase = null;
      model.keepMyWords(state.board.segments, mine || new Map(), base, state.runFresh);
      forgetHistory();
      renderAll();
    },
    joinFilmIfMoved() {
      if (state.filmJoining) return;
      const segments = state.board.segments || [];
      if (!segments.some((s) => s.source_clip || s.clip)) return;
      if (filmIsCurrent() === true) return;
      rebuildFilm(selected());
    },
    renderFilmPull() {
      renderFilmPull();
    },
    selectedId() {
      return state.board ? state.board.selected_id : undefined;
    },
    getBoard() {
      return state.board;
    },
    setReferenceTake(detail) {
      const job = state.refJob && state.refJob.phase === "render" ? state.refJob : null;
      if (job && detail) {
        const last = job.events[job.events.length - 1];
        if (detail.status === "step" && last && last.status === "step") job.events.pop();
        job.events.push(detail);
      }
      const mine = !job || state.refEditorKey === job.key;
      if (mine && state.refEditor && typeof state.refEditor.onTake === "function") {
        state.refEditor.onTake(detail);
      }
    },
    setRunReport(text) {
      const job = state.refJob && state.refJob.phase === "render" && !state.refJob.ended
        ? state.refJob : null;
      if (job) {
        job.ended = true;
        job.report = typeof text === "string" ? text : "";
      }
      const mine = !job || state.refEditorKey === job.key;
      if (mine && state.refEditor && typeof state.refEditor.onRunEnded === "function") {
        state.refEditor.onRunEnded(typeof text === "string" ? text : "");
        if (job) state.refJob = null;
      }
      state.runReport = typeof text === "string" ? text : "";
      renderRunReport();
      sayRepeatedPresses(state.runReport);
    },
    setAgentProgress(detail) {
      const job = state.agentJob;
      if (!job || !detail) return;
      if (Number(detail.segment_id) !== job.segId || detail.kind !== job.kind) return;
      job.lastBeat = Date.now();
      if (detail.state === "tool") {
        const said = String(detail.detail || "").trim();
        job.tool = said;
        const skill = said.startsWith("read_skill ") ? said.slice(11).split(" § ")[0] : "";
        if (skill && !job.skills.includes(skill)) job.skills.push(skill);
        updateJobBars();
        return;
      }
      if (detail.state && detail.state !== "alive") {
        job.stage = detail.detail || detail.state;
        if (detail.state !== job.state || detail.step !== job.step) {
          job.phaseAt = Date.now();
        }
        job.state = detail.state;
        const total = Number(detail.total) || 0;
        job.total = total > 0 ? total : null;
        job.step = total > 0 ? Number(detail.step) || 0 : null;
      }
      updateJobBars();
    },
    setSegmentStatus(id, status, extra = {}) {
      const seg = state.board.segments.find((s) => s.id === Number(id));
      if (!seg) return;
      if (Number(extra.takes) > 1 && status === "generating") {
        state.batchAt = { id: seg.id, take: Number(extra.take) || 1, takes: Number(extra.takes) };
      } else if (state.batchAt && state.batchAt.id === seg.id && status !== "generating") {
        state.batchAt = null;
      }
      seg.status = model.STATUSES[status] ? status : seg.status;
      if ("poster" in extra) seg.poster = extra.poster || "";
      if ("clip" in extra) seg.clip = extra.clip || "";
      if (extra.cost) rememberRenderCost(extra.cost);
      if (extra.detail && status === "error") seg.error = extra.detail;
      if (status === "ready") seg.error = "";
      if (state.livePreview && state.livePreview.segment_id === seg.id && status !== "generating") {
        state.livePreview = null;
      }
      renderTimeline();
      renderPlayers();
      if (seg.id === state.board.selected_id) renderDetail();
      if (state.gallery && state.gallery.id === seg.id && state.gallery.handle) {
        state.gallery.handle.reload({ quiet: true });
      }
    },
    setRunActivity(next) {
      const wasRunning = !!(state.runActivity && state.runActivity.phase === "running");
      if (!next) {
        state.runActivity = null;
        state.renderPress = "";
        state.runTokens = 0;
      } else {
        const previous = state.runActivity || {};
        state.runActivity = {
          phase: next.phase || previous.phase || "running",
          headline: next.headline === undefined ? previous.headline : next.headline,
          line: next.line === undefined ? previous.line : next.line,
        };
      }
      if (!wasRunning && state.runActivity && state.runActivity.phase === "running") {
        state.followRun = true;
      }
      updateJobBars();
    },
    endRun(note = "", { stopped = false } = {}) {
      let touched = false;
      const rolled = [];
      for (const seg of state.board.segments) {
        if (seg.status !== "generating" && seg.status !== "queued") continue;
        if (stopped && seg.status === "generating" && !seg.locked) {
          const before = seg.seed;
          seg.seed = model.nextSeed(before, seedModeOf(state.board), randomSeed);
          rolled.push(
            seg.seed === before
              ? `clip ${state.board.segments.indexOf(seg) + 1} keeps seed ${seg.seed}`
              : `clip ${state.board.segments.indexOf(seg) + 1} on seed ${seg.seed}`,
          );
        }
        seg.status = seg.clip || seg.source_clip ? "stale" : "queued";
        touched = true;
      }
      if (rolled.length) {
        note =
          `${note ? note + " " : ""}The take you stopped is not sampled again: ` +
          `${rolled.join(", ")}. Press Run for a different one.`;
        commit();
      }
      if (state.livePreview) {
        state.livePreview = null;
        touched = true;
      }
      if (!touched && !note) return;
      if (note) state.runReport = note;
      renderTimeline();
      renderPlayers();
      renderDetail();
      renderRunReport();
    },
    setPreview(detail) {
      if (!detail || !detail.image) return;
      state.livePreview = detail;
      const id = Number(detail.segment_id);
      const moved =
        state.followRun &&
        state.board.selected_id !== id &&
        state.board.segments.some((s) => s.id === id);
      if (moved) {
        state.board.selected_id = id;
        renderTimeline();
        renderDetail();
      }
      const held = parts.liveFrame;
      if (!moved && held && held.segment_id === id && held.image.isConnected) {
        held.image.src = `data:${detail.mime};base64,${detail.image}`;
        held.step.textContent = `step ${detail.step}/${detail.total}`;
        updateJobBars();
        return;
      }
      if (!moved && Number(state.board.selected_id) !== id) {
        updateJobBars();
        return;
      }
      renderPlayers();
      updateJobBars();
    },
    refresh() {
      renderControls();
      renderPlayers();
      renderDetail();
    },
    destroy() {
      flushCommit();
      closePopovers(true);
      clearPhantom();
      document.removeEventListener("wheel", wheelGuard, { capture: true });
      root.remove();
    },
  };
}
