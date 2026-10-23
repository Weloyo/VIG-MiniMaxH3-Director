three.js r170 (MIT, see LICENSE), from cdn.jsdelivr.net/npm/three@0.170.0:
  build/three.module.min.js            -> three.module.min.mjs (unchanged)
  examples/jsm/controls/OrbitControls.js     -> OrbitControls.mjs
  examples/jsm/controls/TransformControls.js -> TransformControls.mjs
The two controls are unchanged except their one import, "from 'three'" -> "from './three.module.min.mjs'".
.mjs, not .js: ComfyUI loads every *.js under the web directory as an extension on every page;
these are only imported by js/vig_h3_blocking.js when the blocking editor opens.
