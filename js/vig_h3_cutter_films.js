import { api } from "../../scripts/api.js";
import { SCHEME_CLASS, ensureSchemeStyles } from "./vig_h3_scheme.js";
import { ensureTakesStyles, broomIcon, eyeIcon, paintCount } from "./vig_h3_cutter_takes.js";
import { ICONS } from "./vig_h3_icons.js";
const FILMS_ROUTE = "/vig/h3/cutter/films";
const FILM_FILE_ROUTE = "/vig/h3/cutter/film_file";
const FILM_JUDGE_ROUTE = "/vig/h3/cutter/film_judge";
const FILMS_PRUNE_ROUTE = "/vig/h3/cutter/films_prune";
const MAX_RATING = 5;
const BLUR_PREF = "vig.h3.films.veil";
const ORDER_PREF = "vig.h3.films.order";
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function post(route, body) {
  return api.fetchApi(route, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((response) => response.json());
}
function filmUrl(root, name) {
  return api.apiURL(
    `${FILM_FILE_ROUTE}?path=${encodeURIComponent(root)}&file=${encodeURIComponent(name)}`,
  );
}
function clock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  return s >= 60 ? `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}` : `${s.toFixed(2)} s`;
}
function when(modified) {
  const date = new Date((Number(modified) || 0) * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function openFilmsGallery({ root, title, current, onClosed }) {
  ensureSchemeStyles();
  ensureTakesStyles();
  let films = [];
  let hidden = 0;
  let focused = "";
  const durations = {};
  let blurAll = false;
  let sortKey = "created";
  let sortDown = true;
  try {
    blurAll = window.localStorage.getItem(BLUR_PREF) === "1";
    const kept = JSON.parse(window.localStorage.getItem(ORDER_PREF) || "null");
    if (kept && (kept.key === "created" || kept.key === "length")) {
      sortKey = kept.key;
      sortDown = !!kept.down;
    }
  } catch (err) {
  }
  const overlay = el("div", "vig-takes-overlay");
  overlay.classList.add(SCHEME_CLASS);
  const sheet = el("div", "vig-takes-sheet");
  overlay.appendChild(sheet);
  const head = el("div", "vig-takes-head");
  const heading = el("div", "vig-takes-title", title || "Films");
  const count = el("span", "vig-takes-count", "");
  heading.appendChild(count);
  const close = el("button", "vig-cutter-ghost", "✕ Close");
  const eye = el("button", "vig-takes-menubtn veil");
  const broom = el("button", "vig-takes-tool broom");
  broom.append(broomIcon(), el("span", "", "Sweep"));
  broom.dataset.log = "sweep films";
  broom.title = "Sweep films by rating — pick a rung and everything at or below it goes. " +
    "The film on the FILM player is never swept, and you are shown what would go first.";
  const menu = el("div", "vig-takes-menu");
  menu.append(broom, close);
  const order = el("div", "vig-takes-order");
  head.append(heading, order, eye, el("div", "vig-takes-spring"), menu);
  const said = el("div", "vig-takes-said");
  const foot = el("div", "vig-takes-foot");
  foot.append(el("div", "vig-takes-spring"), said);
  const body = el("div", "vig-takes-body");
  const grid = el("div", "vig-takes-grid");
  const side = el("div", "vig-takes-side");
  body.append(grid, side);
  sheet.append(head, body, foot);
  function say(text, tone = "") {
    said.textContent = text || "";
    said.classList.toggle("bad", tone === "error");
  }
  function paintVeil() {
    eye.textContent = "";
    eye.appendChild(eyeIcon(!blurAll));
    eye.classList.toggle("on", blurAll);
    eye.title = blurAll
      ? "Every film is covered. Press to uncover the gallery."
      : "Cover every film in this gallery. Remembered for next time.";
    for (const video of overlay.querySelectorAll("video")) video.classList.toggle("veiled", blurAll);
  }
  eye.addEventListener("click", (event) => {
    event.stopPropagation();
    blurAll = !blurAll;
    try {
      window.localStorage.setItem(BLUR_PREF, blurAll ? "1" : "0");
    } catch (err) {
    }
    paintVeil();
  });
  paintVeil();
  function shut() {
    for (const video of overlay.querySelectorAll("video")) {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    overlay.remove();
    document.removeEventListener("keydown", onKey, true);
    if (typeof onClosed === "function") onClosed();
  }
  function onKey(event) {
    if (event.key === "Escape" && !overlay.querySelector(".vig-takes-player")) shut();
  }
  close.addEventListener("click", shut);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) shut();
  });
  document.addEventListener("keydown", onKey, true);
  document.body.appendChild(overlay);
  const isCurrent = (film) => !!current && film.stem === current.stem;
  function applyOrder() {
    const value = (film) => (sortKey === "length" ? film.seconds : film.modified);
    films.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      if (x == null && y == null) return b.modified - a.modified;
      if (x == null) return 1;
      if (y == null) return -1;
      return (sortDown ? y - x : x - y) || b.modified - a.modified;
    });
  }
  function drawOrder() {
    order.textContent = "";
    const pick = document.createElement("select");
    pick.className = "vig-takes-axisel";
    pick.dataset.log = "film order";
    for (const [key, label] of [["created", "created"], ["length", "length"]]) {
      const option = el("option", "", label);
      option.value = key;
      if (key === sortKey) option.selected = true;
      pick.appendChild(option);
    }
    pick.title = "The order the films are laid out in — the arrows in the full-size player walk it too.";
    const way = el("button", "vig-takes-ghost", sortDown ? "↓" : "↑");
    way.dataset.log = "film order direction";
    way.title = sortKey === "length"
      ? (sortDown ? "Longest first. Press for shortest first." : "Shortest first. Press for longest first.")
      : (sortDown ? "Newest first. Press for oldest first." : "Oldest first. Press for newest first.");
    const change = () => {
      try {
        window.localStorage.setItem(ORDER_PREF, JSON.stringify({ key: sortKey, down: sortDown }));
      } catch (err) {
      }
      applyOrder();
      draw();
    };
    pick.addEventListener("change", () => {
      sortKey = pick.value;
      change();
    });
    way.addEventListener("click", (event) => {
      event.stopPropagation();
      sortDown = !sortDown;
      change();
    });
    order.append(el("span", "k", "order"), pick, way);
  }
  const recordOf = (film) => film.record || (isCurrent(film) ? current.record || null : null);
  const secondsOf = (film) => {
    const record = recordOf(film);
    if (record) return record.seconds;
    return film.seconds != null ? film.seconds : durations[film.name];
  };
  function card(film) {
    const box = el("div", "vig-takes-card");
    box.dataset.file = film.name;
    if (film.name === focused) box.classList.add("focused");
    if (isCurrent(film)) box.classList.add("onplayer");
    box.addEventListener("click", () => {
      focused = film.name;
      paintFocus();
    });
    const frame = el("div", "vig-takes-frame");
    const video = document.createElement("video");
    video.className = "vig-takes-video";
    video.src = filmUrl(root, film.name);
    video.muted = true;
    video.loop = true;
    video.preload = "metadata";
    video.addEventListener("loadedmetadata", () => {
      if (video.videoWidth && video.videoHeight) {
        video.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      }
      if (Number.isFinite(video.duration)) {
        const first = durations[film.name] === undefined;
        durations[film.name] = video.duration;
        if (first) paintLine();
        if (first && film.name === focused) drawSide();
      }
    });
    video.addEventListener("mouseenter", () => video.play().catch(() => {}));
    video.addEventListener("mouseleave", () => video.pause());
    video.style.cursor = "pointer";
    video.title = "Click to watch this film full size, with sound.";
    video.addEventListener("click", (event) => {
      event.stopPropagation();
      focused = film.name;
      paintFocus();
      openPlayer(film);
    });
    frame.appendChild(video);
    box.appendChild(frame);
    const line = el("div", "vig-takes-line");
    function paintLine() {
      line.textContent = "";
      const record = recordOf(film);
      const seconds = secondsOf(film);
      line.appendChild(el("span", "", when(film.modified)));
      if (seconds !== undefined) line.appendChild(el("span", "vig-takes-tag", clock(seconds)));
      if (record) {
        line.appendChild(el("span", "vig-takes-tag", `${record.count} clip${record.count === 1 ? "" : "s"}`));
      }
      if (isCurrent(film)) line.appendChild(el("span", "vig-takes-tag onplayer", "on FILM player"));
    }
    paintLine();
    box.appendChild(line);
    const stars = el("div", "vig-takes-stars");
    starRow(film, stars);
    box.appendChild(stars);
    if (blurAll) video.classList.add("veiled");
    return box;
  }
  function starRow(film, row) {
    row.textContent = "";
    const rating = film.rating || 0;
    for (let n = 1; n <= MAX_RATING; n += 1) {
      const star = el("button", "vig-takes-star", n <= rating ? "★" : "☆");
      if (n <= rating) star.classList.add("on");
      star.title = n === rating ? "Click again to clear this rating" : `Rate ${n} of ${MAX_RATING}`;
      star.addEventListener("click", (event) => {
        event.stopPropagation();
        const next = n === rating ? 0 : n;
        post(FILM_JUDGE_ROUTE, { path: root, file: film.name, rating: next })
          .then((answer) => {
            if (!answer || answer.ok === false) throw new Error((answer && answer.error) || "not saved");
            film.rating = next;
            starRow(film, row);
          })
          .catch((error) => say(`The rating was not saved: ${error.message}`, "error"));
      });
      row.appendChild(star);
    }
  }
  function openSweepMenu() {
    const list = el("div", "vig-takes-sweepmenu");
    list.classList.add(SCHEME_CLASS);
    const shutList = () => {
      list.remove();
      document.removeEventListener("pointerdown", onOutside, true);
      document.removeEventListener("keydown", onListKey, true);
    };
    const onOutside = (event) => {
      if (event.target instanceof Node && (list.contains(event.target) || broom.contains(event.target))) return;
      shutList();
    };
    const onListKey = (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      shutList();
    };
    list.appendChild(el("span", "vig-takes-sweephead", "sweep this and worse"));
    for (let level = MAX_RATING; level >= 0; level -= 1) {
      const row = el("button", "vig-takes-rung");
      row.append(el("span", "stars", level ? "★".repeat(level) + "☆".repeat(MAX_RATING - level) : "☆".repeat(MAX_RATING)),
        el("span", "note", level ? "" : "unrated"));
      row.addEventListener("click", () => {
        shutList();
        runSweep(level);
      });
      list.appendChild(row);
    }
    document.body.appendChild(list);
    document.addEventListener("pointerdown", onOutside, true);
    document.addEventListener("keydown", onListKey, true);
    const box = broom.getBoundingClientRect();
    list.style.top = `${Math.round(box.bottom + 6)}px`;
    list.style.left = `${Math.round(Math.max(8, Math.min(box.left, window.innerWidth - list.offsetWidth - 8)))}px`;
  }
  broom.addEventListener("click", (event) => {
    event.stopPropagation();
    openSweepMenu();
  });
  function ask(heading, text, okLabel) {
    return new Promise((resolve) => {
      const layer = el("div", "vig-takes-ask");
      const box = el("div", "vig-takes-askbox");
      const row = el("div", "vig-takes-askrow");
      const no = el("button", "vig-cutter-ghost", "Cancel");
      const yes = el("button", "vig-cutter-primary", okLabel);
      const done = (answer) => {
        layer.remove();
        document.removeEventListener("keydown", onAskKey, true);
        resolve(answer);
      };
      function onAskKey(event) {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        done(false);
      }
      document.addEventListener("keydown", onAskKey, true);
      no.addEventListener("click", () => done(false));
      yes.addEventListener("click", () => done(true));
      row.append(no, yes);
      box.append(el("div", "vig-takes-subhead", heading), el("div", "vig-takes-asktext", text), row);
      layer.appendChild(box);
      overlay.appendChild(layer);
      yes.focus();
    });
  }
  async function runSweep(level) {
    const keep = current ? `${current.stem}.mp4` : "";
    try {
      const dry = await post(FILMS_PRUNE_ROUTE, { path: root, at_or_below: level, keep });
      if (!dry || dry.ok === false) throw new Error((dry && dry.error) || "the sweep failed");
      const doomed = dry.would_remove || [];
      if (!doomed.length) {
        say(level ? `No film is rated ${level} star${level === 1 ? "" : "s"} or fewer.` : "No film is unrated.");
        return;
      }
      const what = level ? `rated ${level} star${level === 1 ? "" : "s"} or fewer, and the unrated` : "nobody has rated";
      if (!(await ask(`Delete ${doomed.length} film${doomed.length === 1 ? "" : "s"}?`,
        `Every film ${what}:\n\n${doomed.join("\n")}\n\n` +
          "Their files and records leave the project folder. The film on the FILM player stays.",
        "Delete"))) return;
      for (const video of overlay.querySelectorAll("video")) {
        if (doomed.some((name) => decodeURIComponent(video.src || "").includes(name))) {
          video.pause();
          video.removeAttribute("src");
          video.load();
        }
      }
      const done = await post(FILMS_PRUNE_ROUTE, { path: root, at_or_below: level, keep, confirm: true });
      if (!done || done.ok === false) throw new Error((done && done.error) || "the sweep failed");
      say(`Swept ${done.removed.length} film${done.removed.length === 1 ? "" : "s"}.` +
        (done.refused.length ? ` ${done.refused.length} would not go (still open somewhere): ${done.refused.join(", ")}.` : ""),
      done.refused.length ? "error" : "");
      load();
    } catch (error) {
      say(`The sweep failed: ${error.message}`, "error");
    }
  }
  function paintFocus() {
    for (const box of grid.querySelectorAll(".vig-takes-card")) {
      box.classList.toggle("focused", box.dataset.file === focused);
    }
    drawSide();
  }
  function drawSide() {
    side.textContent = "";
    const film = films.find((one) => one.name === focused);
    if (!film) return;
    const record = recordOf(film);
    const seconds = secondsOf(film);
    side.appendChild(el("div", "vig-takes-subhead", "clips"));
    if (!record) {
      const none = el("div", "vig-takes-empty",
        "no record" + (seconds !== undefined ? ` · ${clock(seconds)}` : ""));
      none.title = "This film was joined before films kept a record of their clips.";
      side.appendChild(none);
    } else {
      const sum = el("div", "vig-takes-hint",
        `${record.count} · ${clock(record.seconds)}` + (!film.record ? " · from the board" : ""));
      sum.title = `${record.frames} frames` + (!film.record
        ? "; this film carries no record of its own, so the board's account stands in"
        : "");
      side.appendChild(sum);
      for (const clip of record.clips || []) {
        const row = el("div", "");
        row.style.cssText = "margin:8px 0 2px;display:flex;gap:8px;align-items:baseline";
        const who = el("span", "vig-takes-key", `Clip ${clip.index}${clip.name ? ` · ${clip.name}` : ""}`);
        const long = el("span", "vig-takes-val", clock(clip.seconds));
        long.title = `${clip.frames} frames`;
        row.append(who, long);
        side.appendChild(row);
        side.appendChild(clip.prompt
          ? el("pre", "vig-takes-text", clip.prompt)
          : el("div", "vig-takes-empty", "no prompt"));
      }
    }
    side.appendChild(el("div", "vig-takes-subhead", "file"));
    side.appendChild(el("div", "vig-takes-file", film.name));
  }
  function openPlayer(film) {
    const layer = el("div", "vig-takes-player");
    const frame = el("div", "vig-takes-playframe");
    const stage = el("div", "vig-takes-stage");
    const video = document.createElement("video");
    video.controls = true;
    video.autoplay = true;
    video.muted = false;
    const bar = el("div", "vig-takes-playbar");
    const caption = el("span", "");
    let at = Math.max(0, films.findIndex((one) => one.name === film.name));
    const step = (delta, glyph, what) => {
      const button = el("button", "vig-takes-step", glyph);
      button.title = what;
      button.addEventListener("click", () => show(at + delta));
      return button;
    };
    const prev = step(-1, "‹", "Previous film (the one to the left in the grid)");
    const next = step(1, "›", "Next film (the one to the right in the grid)");
    function show(i) {
      if (i < 0 || i >= films.length) return;
      at = i;
      const playing = films[at];
      focused = playing.name;
      paintFocus();
      video.src = filmUrl(root, playing.name);
      video.classList.toggle("veiled", blurAll);
      video.play().catch(() => {});
      const record = recordOf(playing);
      caption.textContent = `${playing.name}` +
        (record ? `  ·  ${record.count} clip${record.count === 1 ? "" : "s"} · ${clock(record.seconds)}` : "") +
        (films.length > 1 ? `  ·  ${at + 1} of ${films.length}` : "");
      prev.disabled = at === 0;
      next.disabled = at === films.length - 1;
    }
    const shutPlayer = () => {
      video.pause();
      video.removeAttribute("src");
      video.load();
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
    bar.append(caption, el("div", "vig-takes-spring"), closeBtn);
    layer.addEventListener("mousedown", (event) => {
      if (event.target === layer) shutPlayer();
    });
    const hold = el("div", "vig-takes-playhold");
    hold.appendChild(video);
    stage.append(prev, hold, next);
    frame.append(stage, bar);
    layer.appendChild(frame);
    overlay.appendChild(layer);
    show(at);
  }
  function draw() {
    grid.textContent = "";
    paintCount(count, ICONS.filmstrip, String(films.length));
    drawOrder();
    count.title = hidden
      ? `${hidden} single-clip join${hidden === 1 ? "" : "s"} in the folder ${hidden === 1 ? "is" : "are"} ` +
        "not shown — a film is more than one clip."
      : "";
    if (!films.length) {
      grid.appendChild(el("div", "vig-takes-empty",
        "No films in this project yet — a run, or a take put on the timeline, joins one " +
          "(a film is more than one clip)."));
      side.textContent = "";
      return;
    }
    if (!films.some((one) => one.name === focused)) {
      focused = (films.find(isCurrent) || films[0]).name;
    }
    for (const film of films) grid.appendChild(card(film));
    drawSide();
  }
  function load() {
    post(FILMS_ROUTE, { path: root })
      .then((data) => {
        if (!data || data.ok === false) throw new Error((data && data.error) || "the folder could not be read");
        films = Array.isArray(data.films) ? data.films : [];
        hidden = Number(data.hidden) || 0;
        applyOrder();
        draw();
      })
      .catch((error) => {
        count.textContent = "";
        grid.textContent = "";
        grid.appendChild(el("div", "vig-takes-empty", `The films could not be listed: ${error.message}`));
      });
  }
  count.textContent = "reading…";
  load();
  return { close: shut };
}
