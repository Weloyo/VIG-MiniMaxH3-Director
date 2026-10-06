import { insertTag } from "./vig_h3_cutter_model.js";
import { UI_FONT } from "./vig_h3_type.js";
import { SCHEME_CLASS } from "./vig_h3_scheme.js";
export function mirror(textarea) {
  const rect = textarea.getBoundingClientRect();
  const style = getComputedStyle(textarea);
  const div = document.createElement("div");
  for (const property of [
    "boxSizing",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "borderTopWidth",
    "borderLeftWidth",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "lineHeight",
    "letterSpacing",
    "wordSpacing",
  ]) {
    div.style[property] = style[property];
  }
  div.style.position = "fixed";
  div.style.left = `${rect.left}px`;
  div.style.top = `${rect.top - textarea.scrollTop}px`;
  div.style.width = `${rect.width}px`;
  div.style.whiteSpace = "pre-wrap";
  div.style.wordWrap = "break-word";
  div.style.visibility = "hidden";
  div.style.pointerEvents = "none";
  const spans = [];
  const text = textarea.value || "";
  for (const character of text) {
    if (character === "\n") {
      div.appendChild(document.createElement("br"));
      spans.push(null);
      continue;
    }
    const span = document.createElement("span");
    span.textContent = character === " " ? " " : character;
    div.appendChild(span);
    spans.push(span);
  }
  document.body.appendChild(div);
  return { div, spans, rect };
}
const _measureCache = new WeakMap();
function measuredPoints(textarea) {
  const text = textarea.value || "";
  const cached = _measureCache.get(textarea);
  if (cached && cached.text === text && cached.scrollTop === textarea.scrollTop) {
    return cached;
  }
  const { div, spans } = mirror(textarea);
  const points = spans.map((span) => {
    if (!span) return null;
    const box = span.getBoundingClientRect();
    return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
  });
  div.remove();
  const entry = { text, scrollTop: textarea.scrollTop, points };
  _measureCache.set(textarea, entry);
  return entry;
}
export function dropCacheRelease(textarea) {
  _measureCache.delete(textarea);
}
export function dropIndex(textarea, clientX, clientY) {
  const { text, points } = measuredPoints(textarea);
  let best = text.length;
  let bestScore = Infinity;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (!point) continue;
    const score = Math.abs(point.y - clientY) * 10000 + Math.abs(point.x - clientX);
    if (score < bestScore) {
      bestScore = score;
      best = clientX < point.x ? index : index + 1;
    }
  }
  return Math.max(0, Math.min(text.length, best));
}
export function phantomAt(textarea, wrap, index, tag, className) {
  const { div, spans, rect } = mirror(textarea);
  const probe = document.createElement("span");
  probe.textContent = `@${tag}`;
  if (index >= spans.length || !spans[index]) div.appendChild(probe);
  else div.insertBefore(probe, spans[index]);
  const box = probe.getBoundingClientRect();
  div.remove();
  const ghost = document.createElement("div");
  ghost.className = className || "vig-cutter-phantom";
  ghost.style.left = `${box.left - rect.left}px`;
  ghost.style.top = `${box.top - rect.top}px`;
  ghost.style.width = `${Math.max(4, box.width)}px`;
  ghost.style.height = `${Math.max(4, box.height)}px`;
  wrap.appendChild(ghost);
  return ghost;
}
export function caretRect(textarea, index) {
  const { div, spans, rect } = mirror(textarea);
  const probe = document.createElement("span");
  probe.textContent = "​";
  const at = Math.max(0, Math.min(spans.length, index));
  if (at >= spans.length || !spans[at]) div.appendChild(probe);
  else div.insertBefore(probe, spans[at]);
  const box = probe.getBoundingClientRect();
  div.remove();
  return {
    left: box.left - rect.left,
    top: box.top - rect.top,
    height: box.height || 16,
  };
}
const DRAG_PHASE = true;
const _dropTargets = new Map();
let _pointerDrag = null;
function _registerTarget(textarea, wrap, apply) {
  _dropTargets.set(textarea, { textarea, wrap, apply });
}
function _liveTargets() {
  for (const [key, target] of _dropTargets) {
    if (!target.textarea.isConnected) _dropTargets.delete(key);
  }
  return [..._dropTargets.values()];
}
function _targetAt(x, y) {
  for (const target of _liveTargets()) {
    const rect = target.textarea.getBoundingClientRect();
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
      return target;
    }
  }
  return null;
}
export function startPointerTagDrag(tag, event, ghostSrc) {
  if (event.button !== undefined && event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const ghost = document.createElement("div");
  if (ghostSrc) {
    ghost.style.cssText =
      "position:fixed;z-index:9999;pointer-events:none;opacity:.55;border-radius:5px;" +
      "overflow:hidden;width:56px";
    const image = document.createElement("img");
    image.src = ghostSrc;
    image.style.cssText = "width:56px;display:block";
    ghost.appendChild(image);
  } else {
    ghost.className = SCHEME_CLASS;
    ghost.style.cssText =
      "position:fixed;z-index:9999;pointer-events:none;font-size:11px;" +
      `font-family:${UI_FONT};color:var(--cut-on-accent);` +
      "background:rgba(var(--cut-accent-rgb),.85);border-radius:3px;padding:2px 6px";
    ghost.textContent = `@${tag}`;
  }
  document.body.appendChild(ghost);
  _pointerDrag = { tag, ghost, target: null, index: 0, phantom: null, frame: 0 };
  _moveGhost(event.clientX, event.clientY);
  window.addEventListener("pointermove", _onDragMove, DRAG_PHASE);
  window.addEventListener("pointerup", _onDragUp, DRAG_PHASE);
  window.addEventListener("pointercancel", _onDragUp, DRAG_PHASE);
}
function _moveGhost(x, y) {
  const drag = _pointerDrag;
  if (drag && drag.ghost) {
    drag.ghost.style.left = `${x + 10}px`;
    drag.ghost.style.top = `${y + 10}px`;
  }
}
function _clearDragPhantom(drag = _pointerDrag) {
  if (drag && drag.phantom) drag.phantom.remove();
  if (drag) drag.phantom = null;
}
function _onDragMove(event) {
  const drag = _pointerDrag;
  if (!drag) return;
  event.preventDefault();
  _moveGhost(event.clientX, event.clientY);
  if (drag.frame) return;
  const { clientX, clientY } = event;
  drag.frame = requestAnimationFrame(() => {
    drag.frame = 0;
    const target = _targetAt(clientX, clientY);
    if (!target) {
      drag.target = null;
      _clearDragPhantom();
      return;
    }
    const index = dropIndex(target.textarea, clientX, clientY);
    if (drag.target === target && drag.index === index && drag.phantom) return;
    _clearDragPhantom();
    drag.target = target;
    drag.index = index;
    drag.phantom = phantomAt(target.textarea, target.wrap, index, drag.tag);
  });
}
function _onDragUp(event) {
  const drag = _pointerDrag;
  window.removeEventListener("pointermove", _onDragMove, DRAG_PHASE);
  window.removeEventListener("pointerup", _onDragUp, DRAG_PHASE);
  window.removeEventListener("pointercancel", _onDragUp, DRAG_PHASE);
  _pointerDrag = null;
  if (!drag) return;
  if (drag.frame) cancelAnimationFrame(drag.frame);
  _clearDragPhantom(drag);
  if (drag.ghost) drag.ghost.remove();
  const target = drag.target || _targetAt(event.clientX, event.clientY);
  if (!target || target.textarea.readOnly || target.textarea.disabled) return;
  const index = dropIndex(target.textarea, event.clientX, event.clientY);
  dropCacheRelease(target.textarea);
  const { text, caret } = insertTag(target.textarea.value, index, drag.tag);
  target.apply(text, caret);
  target.textarea.focus();
  target.textarea.setSelectionRange(caret, caret);
}
export function attachMentionMenu(textarea, wrap, { items, apply, menuClass, ratio }) {
  let menu = null;
  let index = 0;
  const close = () => {
    if (menu) menu.remove();
    menu = null;
  };
  const query = () => {
    const at = textarea.selectionStart ?? textarea.value.length;
    const before = textarea.value.slice(0, at);
    const match = before.match(/@([A-Za-z0-9_]*)$/);
    return match ? { text: match[1], start: at - match[0].length, end: at } : null;
  };
  const open = () => {
    const found = query();
    if (!found) return close();
    const list = items(found.text);
    if (!list.length) return close();
    close();
    menu = document.createElement("div");
    menu.className = menuClass || "vig-mention";
    const rect = caretRect(textarea, found.start);
    menu.style.left = `${Math.max(0, rect.left)}px`;
    menu.style.top = `${rect.top + rect.height + 4}px`;
    const title = document.createElement("span");
    title.className = "vig-mention-title";
    title.textContent = "references";
    menu.appendChild(title);
    index = Math.min(index, list.length - 1);
    list.forEach((item, i) => {
      const row = document.createElement("button");
      row.className = i === index ? "active" : "";
      const thumb = document.createElement("span");
      thumb.className = "thumb";
      if (typeof ratio === "function") thumb.style.aspectRatio = String(ratio() || 16 / 9);
      if (item.src) thumb.style.backgroundImage = `url("${item.src}")`;
      else thumb.classList.add("empty");
      const label = document.createElement("span");
      label.textContent = `@${item.tag}`;
      row.append(thumb, label);
      row.addEventListener("mousedown", (event) => {
        event.preventDefault();
        pick(item);
      });
      row.addEventListener("mouseenter", () => {
        index = i;
        open();
      });
      menu.appendChild(row);
    });
    wrap.appendChild(menu);
  };
  const pick = (item) => {
    const found = query();
    if (!found) return close();
    const value = textarea.value;
    const after = value.slice(found.end);
    const insert = `@${item.tag}${/^\s/.test(after) ? "" : " "}`;
    const text = value.slice(0, found.start) + insert + after;
    const caret = found.start + insert.length;
    apply(text, caret);
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
    close();
  };
  textarea.addEventListener("keydown", (event) => {
    if (!menu) return;
    const found = query();
    const list = items(found ? found.text : "");
    if (!list.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      index = (index + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      open();
    } else if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      pick(list[Math.min(index, list.length - 1)]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  });
  textarea.addEventListener("keyup", (event) => {
    if (["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) return;
    if (event.key === "@" || menu) open();
  });
  textarea.addEventListener("blur", () => setTimeout(close, 120));
  return { close };
}
export function attachTextDrop(textarea, wrap, { activeTag, apply }) {
  _registerTarget(textarea, wrap, apply);
  let ghost = null;
  let ghostIndex = -1;
  let frame = 0;
  const clear = () => {
    if (ghost) ghost.remove();
    ghost = null;
    ghostIndex = -1;
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    dropCacheRelease(textarea);
  };
  const over = (event) => {
    const tag = activeTag();
    if (!tag) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    if (frame) return;
    const { clientX, clientY } = event;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const index = dropIndex(textarea, clientX, clientY);
      if (index === ghostIndex && ghost) return;
      if (ghost) ghost.remove();
      ghost = phantomAt(textarea, wrap, index, tag);
      ghostIndex = index;
    });
  };
  textarea.addEventListener("dragenter", over);
  textarea.addEventListener("dragover", over);
  textarea.addEventListener("dragleave", clear);
  textarea.addEventListener("drop", (event) => {
    const tag = activeTag();
    const index = tag ? dropIndex(textarea, event.clientX, event.clientY) : -1;
    clear();
    if (!tag || textarea.readOnly || textarea.disabled) return;
    event.preventDefault();
    const { text, caret } = insertTag(textarea.value, index, tag);
    apply(text, caret);
    textarea.focus();
    textarea.setSelectionRange(caret, caret);
  });
  return { clear };
}
