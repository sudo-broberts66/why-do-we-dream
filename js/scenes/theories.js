/* Scene `theories` — 05:15, "so why? the leading ideas".
   A deep sky in which seven constellations (one per theory of dreaming) are drawn stroke by stroke,
   each featured in turn, then set back into one shared sky; in the finale all seven are seen together,
   softly joined. Everything is a pure function of (progress, time).
   Three draws: fullscreen sky (star layers, nebula, dust) -> constellation lines -> constellation stars. */
(function () {
  'use strict';
  const D = window.DREAM;
  const INTRO = 0.10, SLOT = 0.12, FIN0 = 0.94, DRAW = 0.04, N = 7;

  /* DOM sync for the director: which theory is on stage. index -1 intro, 0..6, 7 finale. */
  D.theories = {
    featured(progress) {
      const p = Math.min(1, Math.max(0, progress));
      if (p < INTRO) return { index: -1, t: p / INTRO };
      if (p >= FIN0) return { index: 7, t: (p - FIN0) / (1 - FIN0) };
      const i = Math.min(N - 1, Math.floor((p - INTRO) / SLOT));
      return { index: i, t: (p - INTRO - i * SLOT) / SLOT };
    },
    slots: { intro: INTRO, slot: SLOT, finale: FIN0, count: N },
  };

  /* ---------------------------------------------------------------- the seven figures
     Local coordinates: the figure spans about -0.5..0.5, y up.
     stars: [x, y, magnitude 0..1, igniteTime?]   strokes: { pts, w, t0?, t1? }
     pts entries are star indices or raw [x, y] points (curves pass through no star). */
  function rotPts(stars, a) { const c = Math.cos(a), s = Math.sin(a); return stars.map((q) => [q[0] * c - q[1] * s, q[0] * s + q[1] * c, q[2], q[3]]); }

  const figs = [];
  // 0. To keep — a key
  figs.push({
    hue: [0.25, 0.86, 0.95],
    stars: rotPts([
      [-0.09, 0, 0.6], [-0.18, 0.156, 0.45], [-0.36, 0.156, 0.5], [-0.45, 0, 1.0], [-0.36, -0.156, 0.45], [-0.18, -0.156, 0.5],
      [0.10, 0, 0.4], [0.29, 0, 0.6], [0.47, 0, 0.9], [0.29, -0.14, 0.5], [0.47, -0.18, 0.6],
    ], -0.66),
    strokes: [{ pts: [0, 1, 2, 3, 4, 5, 0] }, { pts: [0, 6, 7, 8] }, { pts: [7, 9] }, { pts: [8, 10] }],
  });
  // 1. To heal — a heart, cracked, and one line that mends it
  figs.push({
    hue: [1.0, 0.45, 0.68],
    stars: [
      [0, -0.46, 1.0], [0.27, -0.17, 0.45], [0.45, 0.1, 0.6], [0.38, 0.36, 0.5], [0.18, 0.42, 0.55], [0, 0.22, 0.7],
      [-0.18, 0.42, 0.5], [-0.38, 0.36, 0.6], [-0.45, 0.1, 0.45], [-0.27, -0.17, 0.5],
      [0.065, 0.085, 0.3], [-0.05, -0.04, 0.3], [0.035, -0.18, 0.3],
      [-0.15, -0.02, 0.85], [0.16, 0.045, 0.85],
    ],
    strokes: [
      { pts: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0], t0: 0.12, t1: 0.66 },
      { pts: [5, 10, 11, 12], w: 0.5, t0: 0.66, t1: 0.82 },
      { pts: [13, 14], w: 1.5, t0: 0.86, t1: 1.0 },
    ],
  });
  // 2. To rehearse — a figure running, and a pair of eyes in the dark behind it
  figs.push({
    hue: [1.0, 0.4, 0.2],
    stars: [
      [0.14, 0.43, 1.0], [0.085, 0.27, 0.5], [-0.06, -0.02, 0.6],
      [0.25, 0.19, 0.4], [0.37, 0.32, 0.55], [-0.1, 0.2, 0.4], [-0.25, 0.09, 0.5],
      [0.17, -0.13, 0.5], [0.12, -0.43, 0.7], [-0.21, -0.2, 0.45], [-0.43, -0.1, 0.65],
      [-0.5, 0.33, 0.75, 0.9], [-0.42, 0.345, 0.75, 0.94],
    ],
    strokes: [{ pts: [0, 1, 2] }, { pts: [1, 3, 4] }, { pts: [1, 5, 6] }, { pts: [2, 7, 8] }, { pts: [2, 9, 10] }],
  });
  // 3. To generalise — a scatter, an anxious zigzag through every point, then one smooth curve
  (function () {
    const f = (x) => 0.2 * Math.sin(3.0 * x + 0.2) + 0.3 * x;
    const res = [0.05, -0.045, 0.035, -0.06, 0.04, 0.0, -0.05, 0.06, -0.035, 0.045, -0.05];
    const stars = res.map((r, k) => { const x = -0.46 + 0.092 * k; return [x, f(x) + r, 0.4 + 0.5 * ((k * 7) % 5) / 5]; });
    stars.push([-0.2, 0.34, 0.5], [0.17, -0.31, 0.45], [0.4, -0.06, 0.4]);       // the outliers, left out
    const order = stars.map((s, i) => i).sort((a, b) => stars[a][0] - stars[b][0]);
    const curve = []; for (let k = 0; k <= 30; k++) { const x = -0.52 + 1.04 * k / 30; curve.push([x, f(x)]); }
    figs.push({
      hue: [1.0, 0.78, 0.38], stars,
      strokes: [{ pts: order, w: 0.28, t0: 0.1, t1: 0.5 }, { pts: curve, w: 1.35, t0: 0.52, t1: 1.0 }],
    });
  })();
  // 4. To explore — a branching tree of forking paths
  figs.push({
    hue: [0.35, 1.0, 0.72],
    stars: [
      [0.0, -0.48, 0.7], [0.0, -0.2, 0.6], [-0.2, 0.02, 0.5], [0.17, 0.05, 0.5],
      [-0.38, 0.2, 0.45], [-0.12, 0.25, 0.4], [0.1, 0.3, 0.45], [0.36, 0.2, 0.4],
      [-0.5, 0.37, 0.5], [-0.33, 0.43, 0.4], [-0.15, 0.46, 0.55], [0.03, 0.49, 0.4], [0.2, 0.47, 0.45], [0.32, 0.4, 0.4], [0.5, 0.36, 1.0],
    ],
    strokes: [
      { pts: [0, 1], t0: 0.1, t1: 0.3 },
      { pts: [1, 2], t0: 0.3, t1: 0.5 }, { pts: [1, 3], t0: 0.3, t1: 0.5 },
      { pts: [2, 4], t0: 0.5, t1: 0.72 }, { pts: [2, 5], t0: 0.5, t1: 0.72 }, { pts: [3, 6], t0: 0.5, t1: 0.72 }, { pts: [3, 7], t0: 0.5, t1: 0.72 },
      { pts: [4, 8], t0: 0.72, t1: 0.95 }, { pts: [4, 9], t0: 0.72, t1: 0.95 }, { pts: [5, 10], t0: 0.72, t1: 0.95 },
      { pts: [6, 11], t0: 0.72, t1: 0.95 }, { pts: [6, 12], t0: 0.72, t1: 0.95 }, { pts: [7, 13], t0: 0.72, t1: 0.95 }, { pts: [7, 14], t0: 0.72, t1: 1.0 },
    ],
  });
  // 5. To defend — an eye
  (function () {
    const stars = [
      [-0.5, 0.0, 0.7], [-0.28, 0.165, 0.45], [0.0, 0.245, 0.6], [0.28, 0.165, 0.45], [0.5, 0.0, 0.7],
      [0.28, -0.15, 0.4], [0.0, -0.21, 0.55], [-0.28, -0.15, 0.4],
    ];
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3 + 0.52; stars.push([0.135 * Math.cos(a), 0.015 + 0.135 * Math.sin(a), 0.35]); }
    stars.push([0.0, 0.015, 1.0, 0.97]);
    figs.push({
      hue: [0.66, 0.52, 1.0], stars,
      strokes: [{ pts: [0, 1, 2, 3, 4], t0: 0.12, t1: 0.42 }, { pts: [4, 5, 6, 7, 0], t0: 0.42, t1: 0.72 }, { pts: [8, 9, 10, 11, 12, 13, 8], w: 0.8, t0: 0.72, t1: 0.95 }],
    });
  })();
  // 6. Or for no reason — a scribble of noise that settles into a wave, then a line: a story
  (function () {
    const stars = [
      [-0.5, 0.03, 0.6], [-0.37, 0.27, 0.4], [-0.45, -0.2, 0.45], [-0.25, 0.13, 0.35], [-0.38, -0.03, 0.3],
      [-0.21, -0.27, 0.45], [-0.11, 0.23, 0.4], [-0.15, -0.08, 0.4],
    ];
    const wave = (u) => [-0.15 + 0.5 * u, -0.08 * (1 - u) * (1 - u) + 0.19 * Math.pow(1 - u, 1.4) * Math.sin(u * Math.PI * 2 * 2.5)];
    const pts = [0, 1, 2, 3, 4, 5, 6, 7];
    const crest = { 3: 0.5, 9: 0.45, 15: 0.4 };
    for (let k = 1; k <= 30; k++) {
      const q = wave(k / 30);
      if (crest[k]) { stars.push([q[0], q[1], crest[k]]); pts.push(stars.length - 1); } else pts.push(q);
    }
    stars.push([0.5, 0.0, 1.0]); pts.push(stars.length - 1);
    figs.push({ hue: [0.84, 0.89, 1.0], stars, strokes: [{ pts, t0: 0.1, t1: 1.0 }] });
  })();

  /* tableau homes of the seven, in units of one figure's diameter */
  const homeL = [], homeP = [];
  for (let i = 0; i < N; i++) {
    homeL.push([(i - 3) * 1.22, (i % 2 ? -0.62 : 0.62) + 0.1 * Math.sin(i * 2.3)]);
    homeP.push([(i % 2 ? 0.62 : -0.62), (i - 3) * 1.1]);
  }

  /* ---------------------------------------------------------------- geometry */
  const hsh = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  let nEdgeVerts = 0, nStarVerts = 0;
  function build() {
    const E = [], S = [];
    const corners = [[0, -1], [1, -1], [1, 1], [0, -1], [1, 1], [0, 1]];
    const quad = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    function edge(a, ca, b, cb, t0, t1, w, group) {
      for (const c of corners) E.push(a[0], a[1], a[2], ca, b[0], b[1], b[2], cb, t0, t1, w, group, c[0], c[1]);
    }
    figs.forEach((fig, ci) => {
      const z = fig.stars.map((s, k) => (hsh(ci * 31.7 + k * 7.3) - 0.5) * 0.3);
      const ignite = fig.stars.map((s) => (s[3] != null ? s[3] : -1));
      const GAP = 0.03;
      let auto = 0.12; const autoStrokes = fig.strokes.filter((s) => s.t0 == null);
      const P = (q) => (typeof q === 'number' ? [fig.stars[q][0], fig.stars[q][1], z[q]] : [q[0], q[1], 0]);
      const len = (st) => { let l = 0; for (let k = 1; k < st.pts.length; k++) { const a = P(st.pts[k - 1]), b = P(st.pts[k]); l += Math.hypot(b[0] - a[0], b[1] - a[1]); } return l; };
      const total = autoStrokes.reduce((s, st) => s + len(st), 0) || 1;
      for (const st of fig.strokes) {
        const L = len(st) || 1;
        let t0 = st.t0, t1 = st.t1;
        if (t0 == null) { t0 = auto; t1 = auto + 0.88 * L / total; auto = t1; }
        let acc = 0;
        for (let k = 1; k < st.pts.length; k++) {
          const ia = st.pts[k - 1], ib = st.pts[k];
          let a = P(ia), b = P(ib);
          const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1e-6;
          const ta = t0 + (t1 - t0) * acc / L, tb = t0 + (t1 - t0) * (acc + l) / L; acc += l;
          if (typeof ia === 'number' && (ignite[ia] < 0 || ta < ignite[ia])) ignite[ia] = ta;
          if (typeof ib === 'number' && (ignite[ib] < 0 || tb < ignite[ib])) ignite[ib] = tb;
          const ga = typeof ia === 'number' ? Math.min(GAP, l * 0.3) / l : 0, gb = typeof ib === 'number' ? Math.min(GAP, l * 0.3) / l : 0;
          const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
          const a2 = [a[0] + d[0] * ga, a[1] + d[1] * ga, a[2] + d[2] * ga], b2 = [b[0] - d[0] * gb, b[1] - d[1] * gb, b[2] - d[2] * gb];
          edge(a2, ci, b2, ci, ta, tb, st.w || 1, ci);
        }
      }
      fig.stars.forEach((s, k) => {
        const ig = ignite[k] < 0 ? 0.15 + 0.3 * hsh(k * 3.1 + ci) : ignite[k];
        for (const c of quad) S.push(s[0], s[1], z[k], ci, s[2], ig, hsh(ci * 13.1 + k * 5.7) * 6.283, 0, c[0], c[1]);
      });
      fig.z = z;
    });
    // finale: soft links from each constellation to the next (nearest pair of stars in the tableau)
    for (let i = 0; i < N - 1; i++) {
      const A = figs[i], B = figs[i + 1]; let best = 1e9, ba = 0, bb = 0;
      A.stars.forEach((sa, ka) => B.stars.forEach((sb, kb) => {
        const dd = Math.hypot(homeL[i][0] + sa[0] - homeL[i + 1][0] - sb[0], homeL[i][1] + sa[1] - homeL[i + 1][1] - sb[1]);
        if (dd < best) { best = dd; ba = ka; bb = kb; }
      }));
      const sa = A.stars[ba], sb = B.stars[bb];
      const dx = homeL[i + 1][0] + sb[0] - homeL[i][0] - sa[0], dy = homeL[i + 1][1] + sb[1] - homeL[i][1] - sa[1], l = Math.hypot(dx, dy) || 1;
      const g = 0.07;
      edge([sa[0] + dx / l * g, sa[1] + dy / l * g, A.z[ba]], i, [sb[0] - dx / l * g, sb[1] - dy / l * g, B.z[bb]], i + 1, i / 6 * 0.8, i / 6 * 0.8 + 0.3, 0.8, 7);
    }
    nEdgeVerts = E.length / 14; nStarVerts = S.length / 10;
    return { E: new Float32Array(E), S: new Float32Array(S) };
  }

  /* ---------------------------------------------------------------- shaders */
  const PROJ = `
uniform vec4 uPose[7];   // xy: centre (uv, y in -.5...5), z: scale, w: brightness
uniform vec4 uAux[8];    // x: draw-on 0..1, y: featuredness, z: line brightness
uniform vec3 uHue[8];
uniform vec2 uTilt;
uniform vec2 uRes;
vec2 proj(vec4 a){
  int i = int(a.w + .5);
  vec4 po = uPose[i]; float F = uAux[i].y;
  vec3 q = a.xyz; q.z *= .35 + .65 * F;
  float ay = uTilt.x * F, ax = uTilt.y * F;
  q.xz = vec2(q.x * cos(ay) + q.z * sin(ay), -q.x * sin(ay) + q.z * cos(ay));
  q.yz = vec2(q.y * cos(ax) - q.z * sin(ax), q.y * sin(ax) + q.z * cos(ax));
  return po.xy + q.xy * po.z / (1. - q.z * .4);
}
vec4 clipPos(vec2 p){ return vec4(p.x * 2. * uRes.y / uRes.x, p.y * 2., 0., 1.); }
`;
  const EDGE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aA;
layout(location=1) in vec4 aB;
layout(location=2) in vec4 aT;
layout(location=3) in vec2 aC;
` + PROJ + `
out vec4 vK;     // x: along (0..1, caps beyond), y: side -1..1, z: length / halfwidth, w: drawn fraction
out vec4 vCol;
void main(){
  vec2 pa = proj(aA), pb = proj(aB);
  int g = int(aT.w + .5);
  float F = uAux[g].y;
  vec2 dv = pb - pa; float len = max(length(dv), 1e-5); vec2 dir = dv / len; vec2 nr = vec2(-dir.y, dir.x);
  float hw = max(.0065 * mix(.6, 1., F), 3.2 / uRes.y);
  float al = aC.x;
  vec2 p = mix(pa, pb, al) + nr * aC.y * hw + dir * (al * 2. - 1.) * hw;
  vK = vec4(al + (al * 2. - 1.) * hw / len, aC.y, len / hw, clamp((uAux[g].x - aT.x) / max(aT.y - aT.x, 1e-4), 0., 1.));
  float bright = g < 7 ? uPose[g].w : 1.;
  vCol = vec4(uHue[g] * uAux[g].z * bright * aT.z, hw * uRes.y);
  gl_Position = clipPos(p);
}`;
  const EDGE_FS = `#version 300 es
precision highp float;
in vec4 vK; in vec4 vCol;
uniform float uFade;
out vec4 fragColor;
void main(){
  float u = vK.w;
  if (u <= 0.) discard;
  float s = abs(vK.y);
  float px = vCol.w;                                   // half width in pixels
  float core = max(1.1 / px, .16);
  float prof = exp(-s * s / (core * core)) + .16 * exp(-s * s * 5.) * (1. - s);
  float over = max(max(-vK.x, vK.x - 1.), 0.) * vK.z;  // end caps, in half-widths
  prof *= exp(-over * over * 6.);
  float soft = 1.5 / vK.z;
  float drawn = u >= 1. ? 1. : smoothstep(u + soft * .2, u - soft, vK.x);
  float head = u < 1. ? exp(-pow((vK.x - u) * vK.z, 2.) * .35) * exp(-s * s * 3.) * 1.6 : 0.;
  vec3 c = vCol.rgb * (prof * drawn * .62 + head * mix(vec3(1.), vec3(1.6), .5));
  fragColor = vec4(c * uFade, 1.);
}`;
  const STAR_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aP;
layout(location=1) in vec4 aS;   // x: magnitude, y: ignite time, z: phase
layout(location=2) in vec2 aC;
` + PROJ + `
uniform float uTime;
out vec2 vC; out vec4 vCol; out vec2 vM;
void main(){
  int i = int(aP.w + .5);
  vec4 po = uPose[i]; float g = uAux[i].x, F = uAux[i].y;
  vec2 c = proj(aP);
  float r = po.z * (.05 + .075 * aS.x);
  float rmin = 5.5 / uRes.y;
  float k = r < rmin ? r / rmin : 1.; r = max(r, rmin);
  float pre = smoothstep(0., .12, g) * .22;
  float lit = smoothstep(aS.y - .005, aS.y + .04, g);
  float flare = lit * exp(-max(g - aS.y, 0.) * 9.) * (1. - step(1., g)) * 1.6;
  float tw = .82 + .18 * sin(uTime * (1.1 + aS.z * .4) + aS.z * 3.);
  float b = (pre + lit * (.45 + .55 * aS.x) + flare) * po.w * tw * mix(.55, 1., k);
  vC = aC; vM = vec2(aS.x, F);
  vCol = vec4(uHue[i], b);
  gl_Position = clipPos(c + aC * r * (1. + .5 * flare));
}`;
  const STAR_FS = `#version 300 es
precision highp float;
in vec2 vC; in vec4 vCol; in vec2 vM;
uniform float uFade;
out vec4 fragColor;
void main(){
  float d = length(vC);
  if (d > 1. || vCol.a <= 0.) discard;
  float edge = 1. - smoothstep(.6, 1., d);
  float core = exp(-d * d * 110.) * 2.2;
  float halo = exp(-d * 6.5) * .42;
  vec2 a = abs(vC);
  float spike = (exp(-a.y * 46.) * exp(-a.x * 4.2) + exp(-a.x * 46.) * exp(-a.y * 4.2)) * (.25 + .6 * vM.x) * (.4 + .6 * vM.y);
  vec3 c = mix(vec3(1.), vCol.rgb, .25) * core + vCol.rgb * (halo + spike * .9) + vec3(1.) * spike * .35;
  fragColor = vec4(c * vCol.a * edge * uFade, 1.);
}`;

  const SKY_FS = `
uniform vec4 uCam;    // xy: sky pan, z: zoom, w: star fade-in
uniform vec4 uFeat;   // xy: featured centre, z: scale, w: intensity
uniform vec3 uTint;
uniform float uDim;
vec4 hash24(vec2 p){ vec4 p4 = fract(vec4(p.xyxy) * vec4(.1031, .1030, .0973, .1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
vec3 starLayer(vec2 p, float scale, float seed, float sharp, float gain){
  p *= scale; vec2 id = floor(p), f = fract(p) - .5;
  vec4 h = hash24(id + seed);
  float m = pow(h.z, sharp);
  float r = max(.022 + .06 * m, 1.15 * scale / uRes.y);
  float e = (.022 + .06 * m) / r;                         // keep energy when the disc is widened
  vec2 c = (h.xy - .5) * (1. - 2.5 * r);
  vec2 dv = f - c; float d2 = dot(dv, dv);
  float I = exp(-d2 / (r * r)) * e * e + m * m * .12 * exp(-sqrt(d2) * 14.);
  float tw = .78 + .22 * sin(uTime * (.8 + 2.6 * h.w) + h.x * 50.);
  vec3 tint = mix(vec3(1., .8, .62), vec3(.68, .8, 1.), smoothstep(.15, .85, h.w));
  float appear = smoothstep(1. - uCam.w * 1.05, 1.02 - uCam.w * .6, m + .02);
  return tint * I * (.05 + 1.2 * m) * tw * gain * appear;
}
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  float t = uTime;
  vec2 drift = vec2(t * .0022, t * .0007);
  vec2 par = uPointer * vec2(-1., -1.);
  // nebula + a diagonal river of faint light, far away
  vec2 np = uv / mix(1., uCam.z, .25) + uCam.xy * .16 + drift * .5 + par * .006;
  float n1 = fbm(np * 1.25 + 3.7);
  float n2 = fbm(np * 2.3 + n1 * 1.7 + vec2(7.1, t * .004));
  float band = exp(-pow((np.y - .35 * np.x - .1 * sin(np.x * .9) - .05) / .34, 2.));
  float dust = smoothstep(.42, .72, fbm(np * 3.1 + vec2(21., 5.) + n2 * .6));
  vec3 col = vec3(.0045, .006, .017) + vec3(.008, .012, .03) * n1;
  vec3 nebc = mix(vec3(.13, .09, .3), vec3(.05, .2, .3), smoothstep(.3, .7, n1));
  nebc = mix(nebc, uTint, .32);
  col += nebc * pow(n2, 2.6) * (.3 + .9 * band) * .55;
  col += vec3(.05, .055, .09) * band * (.35 + .65 * n2) * (1. - .75 * dust) * .5;
  col *= 1. - .5 * dust * band;
  col *= .35 + .65 * uCam.w;
  // the featured constellation's own faint glow
  vec2 fd = (uv - uFeat.xy) / max(uFeat.z, .05);
  col += uTint * exp(-dot(fd, fd) * 3.2) * uFeat.w * (.6 + .4 * n2);
  // stars in depth: each layer its own parallax
  float veil = 1. - .55 * dust * band;
  vec3 st = vec3(0.);
  vec2 p1 = uv / mix(1., uCam.z, .9) + uCam.xy * .62 + drift * 1.6 + par * .022;
  vec2 p2 = uv / mix(1., uCam.z, .6) + uCam.xy * .4 + drift + par * .013;
  vec2 p3 = uv / mix(1., uCam.z, .4) + uCam.xy * .26 + drift * .7 + par * .008;
  st += starLayer(p1, 7., 11.3, 5., 1.5);
  st += starLayer(p2, 16., 23.7, 7., 1.0) * veil;
  st += starLayer(p3 + 3.3, 34., 5.1, 8., .8) * veil;
  st += starLayer(p3 * rot(.6) + 9.1, 62., 47.9, 6., .5) * (.5 + 1.6 * band) * veil;
  col += st * uDim;
  fragColor = vec4(col * uFade, 1.);
}`;

  /* ---------------------------------------------------------------- scene */
  let gl, sky, edgeProg, starProg, edgeVAO, starVAO;
  const pose = new Float32Array(28), aux = new Float32Array(32), hue = new Float32Array(24);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  D.registerScene({
    id: 'theories',
    init(ctx) {
      gl = ctx.gl;
      sky = ctx.util.fullscreen(ctx.glsl.head + ctx.glsl.noise + SKY_FS, 'theories.sky');
      edgeProg = ctx.util.program(EDGE_VS, EDGE_FS, 'theories.edges');
      starProg = ctx.util.program(STAR_VS, STAR_FS, 'theories.stars');
      const geo = build();
      const mk = (data, layout) => {
        const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
        const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
        const stride = layout.reduce((a, b) => a + b, 0) * 4; let off = 0;
        layout.forEach((n, i) => { gl.enableVertexAttribArray(i); gl.vertexAttribPointer(i, n, gl.FLOAT, false, stride, off); off += n * 4; });
        gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null);
        return vao;
      };
      edgeVAO = mk(geo.E, [4, 4, 4, 2]);
      starVAO = mk(geo.S, [4, 4, 2]);
      figs.forEach((f, i) => hue.set(f.hue, i * 3));
      hue.set([0.8, 0.84, 1.0], 21);
    },
    render(s) {
      if (!sky.ok || !edgeProg.ok || !starProg.ok) return;
      const p = s.progress, t = s.time, a = s.aspect;
      const wide = ss(1.05, 1.35, a);
      const fin = ss(0.925, 0.968, p);
      const dim = 1 - 0.82 * ss(0.972, 1.0, p);
      const home = (i) => [mix(homeP[i][0], homeL[i][0], wide), mix(homeP[i][1], homeL[i][1], wide)];
      const Zfin = Math.min(0.9 * a / mix(2.35, 8.5, wide), 0.84 / mix(7.7, 2.4, wide));
      const Zs = Zfin * 1.5, Z = mix(Zs, Zfin, fin), sig = mix(0.62, 1, fin);
      const o = [mix(0, 0.235 * a, wide), mix(0.265, 0.0, wide)];
      const sf = mix(Math.min(0.38, 0.8 * a), Math.min(0.56, 0.44 * a), wide);
      // camera index glides from one vantage to the next around each slot boundary
      let ci = 0; const F = [];
      for (let i = 0; i < N; i++) {
        const st = INTRO + SLOT * i, en = st + SLOT;
        const leave = i < N - 1 ? ss(en - 0.036, en + 0.006, p) : fin;
        if (i < N - 1) ci += leave;
        F.push(p >= st ? 1 - leave : 0);
      }
      const i0 = Math.min(N - 1, Math.floor(ci)), i1 = Math.min(N - 1, i0 + 1), fr = ci - i0;
      const h0 = home(i0), h1 = home(i1);
      let T = [mix(h0[0], h1[0], fr) - o[0] / Zs, mix(h0[1], h1[1], fr) - o[1] / Zs];
      T = [mix(T[0], 0, fin), mix(T[1], 0, fin)];
      const sway = [Math.sin(t * 0.07) * 0.006, Math.sin(t * 0.09 + 1.0) * 0.005];
      const cur = D.theories.featured(p);
      let tint = [0.3, 0.32, 0.6], featGlow = 0;
      for (let i = 0; i < N; i++) {
        const st = INTRO + SLOT * i, h = home(i), Fi = F[i];
        const g = Math.min(1, Math.max(0, (p - st) / DRAW));
        const bc = [(h[0] - T[0]) * Z + sway[0] - s.pointer.x * 0.008, (h[1] - T[1]) * Z + sway[1] - s.pointer.y * 0.008];
        const fc = [o[0] + sway[0] * 1.5 - s.pointer.x * 0.016, o[1] + sway[1] * 1.5 - s.pointer.y * 0.016];
        const bright = (p >= st ? 1 : 0) * mix(mix(0.42, 0.85, fin), 1, Fi) * dim;
        pose.set([mix(bc[0], fc[0], Fi), mix(bc[1], fc[1], Fi), mix(Z * sig, sf, Fi), bright], i * 4);
        aux.set([g, Fi, mix(mix(0.5, 0.8, fin), 1, Fi), 0], i * 4);
        if (Fi > 0) { const w = Fi * ss(0, 0.5, g); tint = [mix(tint[0], figs[i].hue[0], w), mix(tint[1], figs[i].hue[1], w), mix(tint[2], figs[i].hue[2], w)]; featGlow = Math.max(featGlow, w); }
      }
      aux.set([ss(0.945, 0.99, p), 0, 0.42 * dim * fin, 0], 28);

      sky.use().common(s)
        .f4('uCam', T[0] * Zs, T[1] * Zs, Z / Zs, mix(0.3, 1, ss(0.0, 0.07, p)))
        .f4('uFeat', o[0], o[1], sf, 0.03 * featGlow * dim)
        .f3('uTint', tint[0], tint[1], tint[2])
        .f1('uDim', 1 - 0.3 * ss(0.975, 1, p));
      D.util.drawQuad();

      const tiltX = s.pointer.x * 0.32 + Math.sin(t * 0.21) * 0.07, tiltY = -s.pointer.y * 0.26 + Math.sin(t * 0.17 + 2.0) * 0.05;
      edgeProg.use().f2('uRes', s.width, s.height).f1('uFade', s.fade).f2('uTilt', tiltX, tiltY);
      gl.uniform4fv(edgeProg.u('uPose'), pose); gl.uniform4fv(edgeProg.u('uAux'), aux); gl.uniform3fv(edgeProg.u('uHue'), hue);
      gl.bindVertexArray(edgeVAO); gl.drawArrays(gl.TRIANGLES, 0, nEdgeVerts);
      starProg.use().f2('uRes', s.width, s.height).f1('uFade', s.fade).f2('uTilt', tiltX, tiltY).f1('uTime', t);
      gl.uniform4fv(starProg.u('uPose'), pose); gl.uniform4fv(starProg.u('uAux'), aux); gl.uniform3fv(starProg.u('uHue'), hue);
      gl.bindVertexArray(starVAO); gl.drawArrays(gl.TRIANGLES, 0, nStarVerts);
      gl.bindVertexArray(null);
      void cur;
    },
  });
})();
