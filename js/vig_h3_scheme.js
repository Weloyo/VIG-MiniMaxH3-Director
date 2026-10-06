export const SCHEME_CLASS = "vig-scheme";
export const SCHEMES = [
  { id: "director", name: "Director (default)",
    bg: "#242019", edge: "#6b5a3c", accent: "#b68235" },
  { id: "light", name: "Light",
    bg: "#f5f2eb", edge: "#b39461", accent: "#a86a1e" },
  { id: "dracula", name: "Dracula",
    bg: "#282a36", edge: "#6272a4", accent: "#bd93f9" },
  { id: "nord", name: "Nord",
    bg: "#2e3440", edge: "#4c566a", accent: "#88c0d0" },
  { id: "solarized", name: "Solarized Dark",
    bg: "#002b36", edge: "#586e75", accent: "#268bd2" },
  { id: "gruvbox", name: "Gruvbox Dark",
    bg: "#282828", edge: "#7c6f64", accent: "#fabd2f" },
];
export const SCHEME_PREF = "vig.h3.console.scheme";
export function readScheme() {
  try {
    const said = window.localStorage.getItem(SCHEME_PREF) || "";
    return SCHEMES.some((one) => one.id === said) ? said : "director";
  } catch (err) {
    return "director";
  }
}
export function applyScheme(id, { remember = true } = {}) {
  const known = SCHEMES.find((one) => one.id === id) || SCHEMES[0];
  if (typeof document !== "undefined") {
    document.documentElement.dataset.vigScheme = known.id;
  }
  if (remember) {
    try {
      window.localStorage.setItem(SCHEME_PREF, known.id);
    } catch (error) {
    }
  }
  return known;
}
const DEFAULT_BLOCK = `
  --cut-mat: #0a0a0a;
  --cut-screen: #100e0b;
  --cut-well: #14110d;
  --cut-bar: #16130f;
  --cut-track: #17150f;
  --cut-groove: #1b1813;
  --cut-input: #1c1914;
  --cut-sunk: #1f1c16;
  --cut-menu: #221e17;
  --cut-bg: #242019;
  --cut-head-b: #241f19;
  --cut-raised: #2b261e;
  --cut-head-a: #2f2820;
  --cut-seam: #38322a;
  --cut-border: #3d372c;
  --cut-frame: #423c33;
  --cut-dashed: #4a4438;
  --cut-edge: #6b5a3c;
  --cut-faint: #6b655c;
  --cut-dim: #8a8375;
  --cut-cool: #c6ccd6;
  --cut-quiet: #cfc9bd;
  --cut-soft: #c8c1b4;
  --cut-text: #d8d2c6;
  --cut-warm: #e2dbcd;
  --cut-bright: #efe9dd;
  --cut-warmest: #f6f1e7;
  --cut-accent: #b68235;
  --cut-accent-lit: #c9a26b;
  --cut-accent-hi: #e7b56a;
  --cut-accent-pale: #f2dcaa;
  --cut-accent-edge: #f1e3c8;
  --cut-on-accent: #1c1710;
  --cut-accent-rgb: 182, 130, 53;
  --cut-accent-lit-rgb: 201, 162, 107;
  --cut-syn-field: #d9a94e;
  --cut-ink-rgb: 255, 255, 255;
  --cut-scrim: rgba(8, 7, 5, 0.72);
  --cut-perf: #cfc9bd;
  color-scheme: dark;
`;
const SCHEME_CSS = `
.${SCHEME_CLASS} {${DEFAULT_BLOCK}
  --cut-accent-soft: rgba(var(--cut-accent-rgb), 0.1);
  --cut-rule: rgba(var(--cut-accent-rgb), 0.22);
  --cut-hair: rgba(var(--cut-ink-rgb), 0.1);
  --cut-hover: rgba(var(--cut-ink-rgb), 0.06);
  --cut-syn-shot: #6fbf9e;
  --cut-syn-dialogue: #6ea8d8;
  --cut-syn-ref: #ab9ce6;
}
:root[data-vig-scheme="light"] .${SCHEME_CLASS} {
  --cut-mat: #1c1a17; --cut-screen: #e2ddd2; --cut-well: #e9e4da;
  --cut-bar: #ece7dd; --cut-track: #e6e1d6; --cut-groove: #e8e3d8;
  --cut-input: #fffdf8; --cut-sunk: #eee9df; --cut-menu: #fbf8f2;
  --cut-bg: #f5f2eb; --cut-head-b: #f0ebe2; --cut-raised: #e7e1d5;
  --cut-head-a: #e8e1d4;
  --cut-seam: #dcd5c7; --cut-border: #cdc4b3; --cut-frame: #c3b9a6;
  --cut-dashed: #b1a791; --cut-edge: #b39461;
  --cut-faint: #9d9486; --cut-dim: #756c5e; --cut-cool: #3f4957;
  --cut-quiet: #4a4438; --cut-soft: #554d40; --cut-text: #2d2922;
  --cut-warm: #27231d; --cut-bright: #1b1814; --cut-warmest: #12100c;
  --cut-accent: #a86a1e; --cut-accent-lit: #8f5d1a; --cut-accent-hi: #7c500f;
  --cut-accent-pale: #f2dcaa; --cut-accent-edge: #f1e3c8;
  --cut-on-accent: #fffaf0;
  --cut-accent-rgb: 168, 106, 30; --cut-accent-lit-rgb: 143, 93, 26;
  --cut-syn-field: #9a6410;
  --cut-ink-rgb: 0, 0, 0; --cut-scrim: rgba(40, 36, 30, 0.38);
  --cut-perf: #cfc9bd;
  color-scheme: light;
}
:root[data-vig-scheme="dracula"] .${SCHEME_CLASS} {
  --cut-mat: #12131a; --cut-screen: #191a21; --cut-well: #1e1f29;
  --cut-bar: #191a21; --cut-track: #1e1f29; --cut-groove: #1e1f29;
  --cut-input: #21222c; --cut-sunk: #21222c; --cut-menu: #21222c;
  --cut-bg: #282a36; --cut-head-b: #282a36; --cut-raised: #343746;
  --cut-head-a: #343746;
  --cut-seam: #3c3f51; --cut-border: #44475a; --cut-frame: #44475a;
  --cut-dashed: #565973; --cut-edge: #6272a4;
  --cut-faint: #4d5273; --cut-dim: #6272a4; --cut-cool: #8be9fd;
  --cut-quiet: #c9c9c4; --cut-soft: #e4e4de; --cut-text: #f8f8f2;
  --cut-warm: #f8f8f2; --cut-bright: #ffffff; --cut-warmest: #ffffff;
  --cut-accent: #bd93f9; --cut-accent-lit: #caa9fa; --cut-accent-hi: #d9c2fc;
  --cut-accent-pale: #e6d8fd; --cut-accent-edge: #f0e8fe;
  --cut-on-accent: #1a1b23;
  --cut-accent-rgb: 189, 147, 249; --cut-accent-lit-rgb: 202, 169, 250;
  --cut-syn-field: #f1fa8c;
  --cut-ink-rgb: 255, 255, 255; --cut-scrim: rgba(8, 8, 12, 0.72);
  --cut-perf: #c9c9c4;
  color-scheme: dark;
}
:root[data-vig-scheme="nord"] .${SCHEME_CLASS} {
  --cut-mat: #14171d; --cut-screen: #1e222a; --cut-well: #272c36;
  --cut-bar: #232831; --cut-track: #272c36; --cut-groove: #232831;
  --cut-input: #272c36; --cut-sunk: #272c36; --cut-menu: #2e3440;
  --cut-bg: #2e3440; --cut-head-b: #2e3440; --cut-raised: #3b4252;
  --cut-head-a: #3b4252;
  --cut-seam: #3b4252; --cut-border: #434c5e; --cut-frame: #434c5e;
  --cut-dashed: #4c566a; --cut-edge: #4c566a;
  --cut-faint: #616e88; --cut-dim: #7b88a1; --cut-cool: #88c0d0;
  --cut-quiet: #d8dee9; --cut-soft: #e5e9f0; --cut-text: #d8dee9;
  --cut-warm: #e5e9f0; --cut-bright: #eceff4; --cut-warmest: #eceff4;
  --cut-accent: #88c0d0; --cut-accent-lit: #8fbcbb; --cut-accent-hi: #a3d3de;
  --cut-accent-pale: #c7e3ea; --cut-accent-edge: #e0f0f4;
  --cut-on-accent: #1c232d;
  --cut-accent-rgb: 136, 192, 208; --cut-accent-lit-rgb: 143, 188, 187;
  --cut-syn-field: #ebcb8b;
  --cut-ink-rgb: 255, 255, 255; --cut-scrim: rgba(12, 14, 18, 0.72);
  --cut-perf: #d8dee9;
  color-scheme: dark;
}
:root[data-vig-scheme="solarized"] .${SCHEME_CLASS} {
  --cut-mat: #001016; --cut-screen: #001a21; --cut-well: #00252e;
  --cut-bar: #001f27; --cut-track: #00252e; --cut-groove: #001f27;
  --cut-input: #00252e; --cut-sunk: #00252e; --cut-menu: #073642;
  --cut-bg: #002b36; --cut-head-b: #002b36; --cut-raised: #073642;
  --cut-head-a: #073642;
  --cut-seam: #073642; --cut-border: #0b4a5a; --cut-frame: #0b4a5a;
  --cut-dashed: #586e75; --cut-edge: #586e75;
  --cut-faint: #586e75; --cut-dim: #657b83; --cut-cool: #2aa198;
  --cut-quiet: #839496; --cut-soft: #839496; --cut-text: #93a1a1;
  --cut-warm: #93a1a1; --cut-bright: #eee8d5; --cut-warmest: #fdf6e3;
  --cut-accent: #268bd2; --cut-accent-lit: #4aa3e0; --cut-accent-hi: #74bdec;
  --cut-accent-pale: #a9d8f4; --cut-accent-edge: #d6ecfa;
  --cut-on-accent: #002b36;
  --cut-accent-rgb: 38, 139, 210; --cut-accent-lit-rgb: 74, 163, 224;
  --cut-syn-field: #b58900;
  --cut-ink-rgb: 255, 255, 255; --cut-scrim: rgba(0, 12, 16, 0.72);
  --cut-perf: #839496;
  color-scheme: dark;
}
:root[data-vig-scheme="gruvbox"] .${SCHEME_CLASS} {
  --cut-mat: #0d0d0d; --cut-screen: #141414; --cut-well: #1d2021;
  --cut-bar: #1b1b1b; --cut-track: #1d2021; --cut-groove: #1b1b1b;
  --cut-input: #1d2021; --cut-sunk: #1d2021; --cut-menu: #32302f;
  --cut-bg: #282828; --cut-head-b: #282828; --cut-raised: #3c3836;
  --cut-head-a: #3c3836;
  --cut-seam: #3c3836; --cut-border: #504945; --cut-frame: #504945;
  --cut-dashed: #665c54; --cut-edge: #7c6f64;
  --cut-faint: #7c6f64; --cut-dim: #928374; --cut-cool: #8ec07c;
  --cut-quiet: #bdae93; --cut-soft: #d5c4a1; --cut-text: #ebdbb2;
  --cut-warm: #ebdbb2; --cut-bright: #fbf1c7; --cut-warmest: #fbf1c7;
  --cut-accent: #fabd2f; --cut-accent-lit: #fbca55; --cut-accent-hi: #fcd77c;
  --cut-accent-pale: #fde5a8; --cut-accent-edge: #fef2d3;
  --cut-on-accent: #282828;
  --cut-accent-rgb: 250, 189, 47; --cut-accent-lit-rgb: 251, 202, 85;
  --cut-syn-field: #fe8019;
  --cut-ink-rgb: 255, 255, 255; --cut-scrim: rgba(10, 10, 10, 0.72);
  --cut-perf: #bdae93;
  color-scheme: dark;
}
`;
export function ensureSchemeStyles() {
  if (typeof document === "undefined") return;
  if (!document.getElementById("vig-scheme-styles")) {
    const style = document.createElement("style");
    style.id = "vig-scheme-styles";
    style.textContent = SCHEME_CSS;
    document.head.insertBefore(style, document.head.firstChild);
  }
  if (!document.documentElement.dataset.vigScheme) {
    applyScheme(readScheme(), { remember: false });
  }
}
