export function frameOf(ref) {
  const [x = 50, y = 50, z = 1] = String((ref && ref.frame) || "")
    .split(",")
    .map((value) => Number.parseFloat(value));
  return {
    x: Number.isFinite(x) ? x : 50,
    y: Number.isFinite(y) ? y : 50,
    z: Number.isFinite(z) && z > 0 ? z : 1,
  };
}
export function applyFrame(thumb, ref) {
  const frame = frameOf(ref);
  if (frame.z === 1) {
    thumb.style.backgroundSize = "contain";
    thumb.style.backgroundPosition = "center";
  } else {
    thumb.style.backgroundSize = `${frame.z * 100}%`;
    thumb.style.backgroundPosition = `${frame.x}% ${frame.y}%`;
  }
}
export function toggleReframe(thumb, ref, onSave) {
  if (thumb.dataset.reframing) return endReframe(thumb);
  thumb.dataset.reframing = "1";
  thumb.classList.add("reframing");
  const frame = frameOf(ref);
  const save = () => {
    ref.frame = `${frame.x.toFixed(1)},${frame.y.toFixed(1)},${frame.z.toFixed(2)}`;
    onSave();
  };
  const down = (event) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const from = { x: frame.x, y: frame.y };
    const rect = thumb.getBoundingClientRect();
    const move = (moveEvent) => {
      frame.x = Math.max(0, Math.min(100, from.x - ((moveEvent.clientX - startX) / rect.width) * 100));
      frame.y = Math.max(0, Math.min(100, from.y - ((moveEvent.clientY - startY) / rect.height) * 100));
      applyFrame(thumb, ref);
    };
    const up = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      save();
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  };
  const wheel = (event) => {
    event.preventDefault();
    frame.z = Math.max(1, Math.min(4, frame.z * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
    applyFrame(thumb, ref);
    save();
  };
  const key = (event) => {
    if (event.key === "Escape") endReframe(thumb);
  };
  thumb.__vigReframe = { down, wheel, key };
  thumb.addEventListener("pointerdown", down);
  thumb.addEventListener("wheel", wheel, { passive: false });
  window.addEventListener("keydown", key, true);
}
export function endReframe(thumb) {
  const bound = thumb.__vigReframe;
  if (!bound) return;
  thumb.removeEventListener("pointerdown", bound.down);
  thumb.removeEventListener("wheel", bound.wheel);
  window.removeEventListener("keydown", bound.key, true);
  delete thumb.__vigReframe;
  delete thumb.dataset.reframing;
  thumb.classList.remove("reframing");
}
