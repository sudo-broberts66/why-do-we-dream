/* brain.js — one brain made of light, two scenes.
   `replay` (N3: slow oscillations, hippocampal replay, tagging) and `rem` (pons ignition, PGO waves,
   limbic/visual blaze, prefrontal blackout, noradrenaline drain, REM atonia, dive into visual cortex).
   Both scenes are the same stateless function of one continuous "night" parameter n:
     replay: n = progress (0..1)      rem: n = 1 + progress (1..2)
   so replay p=1 and rem p=0 are the identical frame. All anatomy is generated once (seeded) into a
   static point buffer; every animation happens in the vertex shader from (uTime, n-derived uniforms). */
(function () {
  'use strict';
  const D = window.DREAM;
  const TAU = Math.PI * 2;

  /* ------------------------------------------------------------------ small maths */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function makeNoise(rand) { // classic improved Perlin noise, ~ -0.8..0.8
    const p = new Uint8Array(512), perm = new Uint8Array(256);
    for (let i = 0; i < 256; i++) perm[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
    for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
    const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
    const grad = (h, x, y, z) => { h &= 15; const u = h < 8 ? x : y, v = h < 4 ? y : (h === 12 || h === 14 ? x : z); return ((h & 1) ? -u : u) + ((h & 2) ? -v : v); };
    return function (x, y, z) {
      let X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
      x -= X; y -= Y; z -= Z; X &= 255; Y &= 255; Z &= 255;
      const u = fade(x), v = fade(y), w = fade(z);
      const A = p[X] + Y, AA = p[A] + Z, AB = p[A + 1] + Z, B = p[X + 1] + Y, BA = p[B] + Z, BB = p[B + 1] + Z;
      return lerp(
        lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u), lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
        lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u), lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v), w);
    };
  }
  /* tiny mat4 (column-major) */
  function perspective(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf;
  }
  function lookAt(o, e, c) { // up = +y
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = zz, xy = 0, xz = -zx; // up × z
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    o[0] = xx; o[1] = yx; o[2] = zx; o[3] = 0;
    o[4] = xy; o[5] = yy; o[6] = zy; o[7] = 0;
    o[8] = xz; o[9] = yz; o[10] = zz; o[11] = 0;
    o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
    o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
    o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
    o[15] = 1;
  }
  function mul4(o, a, b) { // o = a * b
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }

  /* ------------------------------------------------------------------ anatomy (brain space)
     x: posterior(-) → anterior(+), y: up, z: left(-) / right(+). Cerebrum spans x ≈ -0.87..0.86. */
  const ELL = {
    F: [0.42, 0.10, 0.275, 0.44, 0.38, 0.285],   // frontal
    P: [-0.06, 0.16, 0.33, 0.56, 0.42, 0.36],    // parietal / central
    O: [-0.55, 0.03, 0.27, 0.32, 0.31, 0.26],    // occipital
    T: [0.04, -0.215, 0.43, 0.43, 0.17, 0.21],   // temporal
  };
  const THAL = [-0.05, 0.0, 0.088], THAL_R = [0.15, 0.085, 0.07];
  const LGN = [-0.17, -0.04, 0.15];
  const AMY = [0.175, -0.215, 0.25], AMY_R = [0.062, 0.05, 0.045];
  const HIP = [[0.12, -0.225, 0.265], [0.02, -0.235, 0.285], [-0.10, -0.225, 0.295], [-0.21, -0.18, 0.28], [-0.285, -0.09, 0.235], [-0.30, 0.02, 0.17]];
  const FORNIX = [[-0.30, 0.02, 0.17], [-0.25, 0.11, 0.09], [-0.13, 0.16, 0.035], [0.0, 0.15, 0.025], [0.07, 0.07, 0.03], [0.085, -0.02, 0.035]];
  const STEM = [[-0.06, -0.09, 0], [-0.085, -0.21, 0], [-0.115, -0.34, 0], [-0.16, -0.49, 0], [-0.198, -0.615, 0]];
  const STEM_R = [0.082, 0.088, 0.128, 0.078, 0.052];
  const CORD = [[-0.198, -0.615, 0], [-0.215, -0.76, 0], [-0.238, -0.93, 0]];
  const BARRIER = [-0.198, -0.615, 0];
  const T_BARRIER = 0.8; // motor fibres: param at which the descending path meets the barrier

  /* centroids for DOM labels; z > 0 entries are mirrored to whichever side faces the camera */
  const CENTROIDS = {
    prefrontal: [0.63, 0.22, 0.30], motor: [0.07, 0.47, 0.30], visual: [-0.80, 0.03, 0.16],
    thalamus: [-0.05, 0.0, 0], hippocampus: [-0.10, -0.225, 0.295], amygdala: [0.175, -0.215, 0.25],
    pons: [-0.105, -0.34, 0], cord: [-0.215, -0.76, 0], cerebellum: [-0.52, -0.43, 0.24],
  };

  function ell(x, y, z, e) {
    const px = (x - e[0]) / e[3], py = (y - e[1]) / e[4], pz = (z - e[2]) / e[5];
    const k0 = Math.sqrt(px * px + py * py + pz * pz);
    const qx = px / e[3], qy = py / e[4], qz = pz / e[5];
    const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
    return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(e[3], e[4], e[5]);
  }
  function smin(a, b, k) { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; }
  let _dMain = 0, _dT = 0;
  function sdCerebrum(x, y, z) {
    z = Math.abs(z);
    const dm = smin(smin(ell(x, y, z, ELL.F), ell(x, y, z, ELL.P), 0.14), ell(x, y, z, ELL.O), 0.14);
    const dt = ell(x, y + 0.13 * (x - 0.04), z, ELL.T); // temporal lobe slopes down toward its pole
    _dMain = dm; _dT = dt;
    const d = smin(dm, dt, 0.03);
    return -smin(-d, z - 0.016, 0.035); // longitudinal fissure: each hemisphere stops short of the midplane
  }
  const CB = [[-0.50, -0.42, 0.225, 0.27, 0.17, 0.265], [-0.52, -0.42, 0.0, 0.24, 0.155, 0.13]];
  function sdCerebellum(x, y, z) {
    z = Math.abs(z);
    return smin(ell(x, y, z, CB[0]), ell(x, y, z, CB[1]), 0.05);
  }
  function cr(pts, u) { // Catmull-Rom through all pts, u 0..1
    const n = pts.length - 1; let f = clamp(u, 0, 1) * n; const i = Math.min(n - 1, Math.floor(f)); f -= i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    const f2 = f * f, f3 = f2 * f, o = [0, 0, 0];
    for (let k = 0; k < 3; k++) o[k] = 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * f + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * f2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * f3);
    return o;
  }
  function frameAt(pts, u) {
    const a = cr(pts, u - 0.01), b = cr(pts, u + 0.01);
    let tx = b[0] - a[0], ty = b[1] - a[1], tz = b[2] - a[2];
    const l = Math.hypot(tx, ty, tz) || 1; tx /= l; ty /= l; tz /= l;
    let e1x = ty, e1y = -tx; const l1 = Math.hypot(e1x, e1y) || 1; e1x /= l1; e1y /= l1;
    return { e1: [e1x, e1y, 0], e2: [-tz * e1y, tz * e1x, tx * e1y - ty * e1x] };
  }
  const bez2 = (a, b, c, t) => { const s = 1 - t; return [s * s * a[0] + 2 * s * t * b[0] + t * t * c[0], s * s * a[1] + 2 * s * t * b[1] + t * t * c[1], s * s * a[2] + 2 * s * t * b[2] + t * t * c[2]]; };
  const bez3 = (a, b, c, d, t) => { const s = 1 - t, k0 = s * s * s, k1 = 3 * s * s * t, k2 = 3 * s * t * t, k3 = t * t * t; return [k0 * a[0] + k1 * b[0] + k2 * c[0] + k3 * d[0], k0 * a[1] + k1 * b[1] + k2 * c[1] + k3 * d[1], k0 * a[2] + k1 * b[2] + k2 * c[2] + k3 * d[2]]; };

  /* Region ids (aA.x):
     0 cortex  1 cerebellum  2 brainstem  3 thalamus  4 hippocampus  5 amygdala  6 cord  7 fornix
     8 barrier (ring + sparks)  9 motes
     10 replay fibres (hippocampus → thalamus → cortex)   11 PGO fibres (pons → LGN → occipital)
     12 limbic ↔ visual-association fibres   13 motor (corticospinal) fibres
     14 tagged-memory threads   15 callosal fibres */
  const STRIDE = 18; // pos3 nrm3 A4 B4 C4
  function build() {
    const MAX = 150000;
    const buf = new Float32Array(MAX * STRIDE);
    let n = 0;
    function put(x, y, z, nx, ny, nz, reg, br, s1, s2, b0, b1, b2, b3, c0, c1, c2, c3) {
      if (n >= MAX) return -1;
      const o = n * STRIDE;
      buf[o] = x; buf[o + 1] = y; buf[o + 2] = z; buf[o + 3] = nx; buf[o + 4] = ny; buf[o + 5] = nz;
      buf[o + 6] = reg; buf[o + 7] = br; buf[o + 8] = s1; buf[o + 9] = s2;
      buf[o + 10] = b0; buf[o + 11] = b1; buf[o + 12] = b2; buf[o + 13] = b3;
      buf[o + 14] = c0; buf[o + 15] = c1; buf[o + 16] = c2; buf[o + 17] = c3;
      return n++;
    }
    const rnd = mulberry32(0x5EED0B5);
    const noise = makeNoise(mulberry32(0xC0FFEE));
    const star = () => (0.55 + 0.45 * rnd()) * (rnd() < 0.035 ? 2.3 : 1);

    /* ---- cerebral cortex: shell-sample the SDF, project to the surface, fold with ridged noise */
    const N_CORTEX = 60000;
    const EPS = 0.003;
    let guard = 0;
    const cortexStart = n;
    while (n - cortexStart < N_CORTEX && guard++ < 3000000) {
      let x = lerp(-0.95, 0.95, rnd()), y = lerp(-0.56, 0.68, rnd()), z = lerp(-0.78, 0.78, rnd());
      let d = sdCerebrum(x, y, z);
      if (Math.abs(d) > 0.035) continue;
      let gx = 0, gy = 0, gz = 0;
      for (let it = 0; it < 2; it++) {
        gx = sdCerebrum(x + EPS, y, z) - d; gy = sdCerebrum(x, y + EPS, z) - d; gz = sdCerebrum(x, y, z + EPS) - d;
        const g2 = (gx * gx + gy * gy + gz * gz) / (EPS * EPS) || 1;
        x -= d * (gx / EPS) / g2; y -= d * (gy / EPS) / g2; z -= d * (gz / EPS) / g2;
        d = sdCerebrum(x, y, z);
      }
      const dMain = _dMain, dT = _dT;
      gx = sdCerebrum(x + EPS, y, z) - d; gy = sdCerebrum(x, y + EPS, z) - d; gz = sdCerebrum(x, y, z + EPS) - d;
      const gl_ = Math.hypot(gx, gy, gz) || 1; gx /= gl_; gy /= gl_; gz /= gl_;
      const az = Math.abs(z);
      const temporal = dT < dMain ? 1 : 0;
      const medial = az < 0.04 && Math.abs(gz) > 0.6;
      // gyri / sulci: zero-crossings of warped noise make winding grooves
      const wx = noise(x * 3.1 + 11.3, y * 3.1, z * 3.1), wy = noise(x * 3.1, y * 3.1 + 7.7, z * 3.1 + 3.1);
      const f = 8.6;
      let nn = noise(x * f + wx * 1.7, y * f + wy * 1.7, z * f - wx * 1.7 + 5.2);
      nn += 0.3 * noise(x * f * 2.2 + 3.3, y * f * 2.2, z * f * 2.2 + 9.1);
      let g = ss(0.03, 0.17, Math.abs(nn));
      // named sulci: Sylvian fissure (where the temporal lobe meets the rest), central + precentral sulcus
      const syl = ss(0.0, 0.034, Math.abs(dMain - dT));
      const xcs = -0.05 + 0.16 * (1 - clamp(y / 0.55, 0, 1));
      const dorsal = (1 - temporal) * ss(-0.06, 0.05, y);
      let mo = Math.exp(-Math.pow((x - (xcs + 0.056)) / 0.04, 2)) * dorsal;
      g = lerp(g, 1, mo * 0.75);
      g *= lerp(1, ss(0.004, 0.024, Math.abs(x - xcs)), dorsal);
      g *= lerp(1, 0.35 + 0.65 * ss(0.004, 0.02, Math.abs(x - (xcs + 0.112))), dorsal);
      g *= syl;
      const under = gy < -0.55 && !temporal;
      const keep = (0.035 + 0.965 * Math.pow(g, 1.4)) * (medial ? 0.07 : 1) * (under ? 0.35 : 1);
      if (rnd() > keep) continue;
      const disp = 0.012 * g - 0.032 * (1 - g) * (1 - g);
      x += gx * disp; y += gy * disp; z += gz * disp;
      const br = (0.26 + 0.74 * g) * star() * (medial ? 0.55 : 1);
      const pf = ss(0.24, 0.5, x) * (1 - temporal);
      const vis = Math.max(ss(-0.4, -0.66, x), 0.45 * ss(-0.15, -0.5, x) * ss(0.25, -0.1, y));
      put(x, y, z, gx, gy, gz, 0, br, rnd(), rnd(), pf, mo, vis, temporal, 0, 0, 0, 0);
    }
    const cortexEnd = n;

    /* ---- cerebellum: tight folia fanning from the hilum */
    const cbStart = n; guard = 0;
    while (n - cbStart < 12500 && guard++ < 1500000) {
      let x = lerp(-0.82, -0.2, rnd()), y = lerp(-0.62, -0.22, rnd()), z = lerp(-0.52, 0.52, rnd());
      let d = sdCerebellum(x, y, z);
      if (Math.abs(d) > 0.03) continue;
      let gx = 0, gy = 0, gz = 0;
      for (let it = 0; it < 2; it++) {
        gx = sdCerebellum(x + EPS, y, z) - d; gy = sdCerebellum(x, y + EPS, z) - d; gz = sdCerebellum(x, y, z + EPS) - d;
        const g2 = (gx * gx + gy * gy + gz * gz) / (EPS * EPS) || 1;
        x -= d * (gx / EPS) / g2; y -= d * (gy / EPS) / g2; z -= d * (gz / EPS) / g2;
        d = sdCerebellum(x, y, z);
      }
      if (sdCerebrum(x, y, z) < 0.012) continue; // tucked under the occipital lobe
      const gl_ = Math.hypot(gx, gy, gz) || 1; gx /= gl_; gy /= gl_; gz /= gl_;
      const v = (y + 0.43) / (0.42 + (-0.2 - x)) + 0.012 * noise(x * 9, y * 9, z * 9);
      const st = 0.5 + 0.5 * Math.cos(TAU * v * 19);
      const verm = ss(0.07, 0.02, Math.abs(z)); // vermis groove
      if (rnd() > Math.pow(st, 2.2) * (1 - 0.6 * verm) + 0.03) continue;
      const dp = 0.006 * st - 0.012 * (1 - st);
      put(x + gx * dp, y + gy * dp, z + gz * dp, gx, gy, gz, 1, (0.3 + 0.7 * st) * star(), rnd(), rnd(), 0, 0, 0, 0, 0, 0, 0, 0);
    }

    /* ---- brainstem: midbrain → pons (bulging forward, transverse fibres) → medulla */
    const stemR = (s) => { const f = clamp(s, 0, 1) * (STEM_R.length - 1), i = Math.min(STEM_R.length - 2, Math.floor(f)); return lerp(STEM_R[i], STEM_R[i + 1], ss(0, 1, f - i)); };
    for (let i = 0; i < 5200; i++) {
      const s = rnd(), th = rnd() * TAU, vol = rnd() < 0.34;
      const rad = vol ? Math.sqrt(rnd()) * 0.92 : 1;
      const pw = Math.exp(-Math.pow((s - 0.5) / 0.17, 2));
      // texture: longitudinal tracts everywhere, transverse bands across the pons
      const tex = lerp(0.5 + 0.5 * Math.cos(th * 13), 0.5 + 0.5 * Math.cos(s * 150), pw);
      if (!vol && rnd() > 0.2 + 0.8 * tex) continue;
      const c = cr(STEM, s), fr = frameAt(STEM, s), r = stemR(s);
      const ca = Math.cos(th), sa = Math.sin(th);
      const ox = -fr.e1[0] * 0.034 * pw, oy = -fr.e1[1] * 0.034 * pw;
      const nx = fr.e1[0] * ca + fr.e2[0] * sa, ny = fr.e1[1] * ca + fr.e2[1] * sa, nz = fr.e1[2] * ca + fr.e2[2] * sa * 1.0;
      const x = c[0] + ox + (fr.e1[0] * ca + fr.e2[0] * sa * 1.18) * r * rad;
      const y = c[1] + oy + (fr.e1[1] * ca + fr.e2[1] * sa * 1.18) * r * rad;
      const z = c[2] + (fr.e1[2] * ca + fr.e2[2] * sa * 1.18) * r * rad;
      put(x, y, z, nx, ny, nz, 2, (vol ? 0.55 : 0.4 + 0.6 * tex) * star(), rnd(), rnd(), s, pw, rad, vol ? 1 : 0, 0, 0, 0, 0);
    }
    /* ---- spinal cord stub, fading out below */
    for (let i = 0; i < 1500; i++) {
      const s = Math.pow(rnd(), 1.25), th = rnd() * TAU;
      if (rnd() > 0.25 + 0.75 * (0.5 + 0.5 * Math.cos(th * 11))) continue;
      const c = cr(CORD, s), fr = frameAt(CORD, s), r = lerp(0.052, 0.042, s) * (rnd() < 0.2 ? Math.sqrt(rnd()) : 1);
      const ca = Math.cos(th), sa = Math.sin(th);
      const nx = fr.e1[0] * ca + fr.e2[0] * sa, ny = fr.e1[1] * ca + fr.e2[1] * sa, nz = fr.e1[2] * ca + fr.e2[2] * sa;
      put(c[0] + nx * r, c[1] + ny * r, c[2] + nz * r * 1.1, nx, ny, nz, 6, Math.pow(1 - s, 1.3) * star(), rnd(), rnd(), s, 0, 0, 0, 0, 0, 0, 0);
    }
    /* ---- thalamus (paired eggs), amygdala (almonds) */
    for (let sd = -1; sd <= 1; sd += 2) {
      for (let i = 0; i < 1700; i++) {
        let ux = rnd() * 2 - 1, uy = rnd() * 2 - 1, uz = rnd() * 2 - 1; const l = Math.hypot(ux, uy, uz); if (l > 1 || l < 0.05) { i--; continue; }
        ux /= l; uy /= l; uz /= l;
        const rad = rnd() < 0.45 ? Math.cbrt(rnd()) : 1;
        const egg = 1 - 0.18 * ux; // fatter at the back (pulvinar)
        put(THAL[0] + ux * THAL_R[0] * rad, THAL[1] + uy * THAL_R[1] * rad * egg + 0.02 * ux, sd * (THAL[2] + uz * THAL_R[2] * rad * egg), ux, uy, sd * uz,
          3, star() * (0.55 + 0.45 * rad), rnd(), rnd(), rad, 0, 0, 0, 0, 0, 0, 0);
      }
      for (let i = 0; i < 750; i++) {
        let ux = rnd() * 2 - 1, uy = rnd() * 2 - 1, uz = rnd() * 2 - 1; const l = Math.hypot(ux, uy, uz); if (l > 1 || l < 0.05) { i--; continue; }
        ux /= l; uy /= l; uz /= l;
        const rad = rnd() < 0.5 ? Math.cbrt(rnd()) : 1;
        const tip = 1 - 0.25 * Math.max(0, ux); // almond: pointed toward the front
        put(AMY[0] + ux * AMY_R[0] * rad, AMY[1] + uy * AMY_R[1] * rad * tip, sd * (AMY[2] + uz * AMY_R[2] * rad * tip), ux, uy, sd * uz,
          5, star() * (0.55 + 0.45 * rad), rnd(), rnd(), rad, 0, 0, 0, 0, 0, 0, 0);
      }
      /* ---- hippocampus: a curled, segmented seahorse arc; fornix continues it over the thalamus */
      for (let i = 0; i < 2500; i++) {
        const s = Math.pow(rnd(), 0.9), th = rnd() * TAU;
        const vol = rnd() < 0.25;
        if (!vol && Math.cos(th * 2 + s * 58) < -0.25) continue; // spiral lamellae
        const c = cr(HIP, s), fr = frameAt(HIP, s);
        const r = lerp(0.05, 0.02, Math.pow(s, 0.8)) * (1 + 0.2 * Math.sin(s * 44)) * (vol ? Math.sqrt(rnd()) : 1);
        const ca = Math.cos(th), sa = Math.sin(th) * 0.72;
        const nx = fr.e1[0] * ca + fr.e2[0] * sa, ny = fr.e1[1] * ca + fr.e2[1] * sa, nz = fr.e1[2] * ca + fr.e2[2] * sa;
        put(c[0] + nx * r, c[1] + ny * r, sd * (c[2] + nz * r), nx, ny, sd * nz, 4, star(), rnd(), rnd(), s, 0, 0, 0, 0, 0, 0, 0);
      }
      for (let i = 0; i < 420; i++) {
        const s = rnd(), th = rnd() * TAU, c = cr(FORNIX, s), fr = frameAt(FORNIX, s), r = 0.008 + 0.006 * rnd();
        const ca = Math.cos(th), sa = Math.sin(th);
        put(c[0] + (fr.e1[0] * ca + fr.e2[0] * sa) * r, c[1] + (fr.e1[1] * ca + fr.e2[1] * sa) * r, sd * (c[2] + (fr.e1[2] * ca + fr.e2[2] * sa) * r), 0, 0, 0,
          7, star(), rnd(), rnd(), s, 0, 0, 0, 0, 0, 0, 0);
      }
    }

    /* ---- cortical sites: where replay packets land; a few are emotionally "tagged" */
    function pick(filter, count, minDist, avoid, sd) {
      const out = [];
      let tries = 0;
      while (out.length < count && tries++ < 40000) {
        const i = cortexStart + Math.floor(rnd() * (cortexEnd - cortexStart)), o = i * STRIDE;
        const x = buf[o], y = buf[o + 1], z = buf[o + 2];
        if (z * sd <= 0 || !filter(x, y, Math.abs(z), o)) continue;
        let ok = true;
        for (const lst of [out, avoid || []]) for (const q of lst) { if (Math.hypot(q.p[0] - x, q.p[1] - y, q.p[2] - z) < minDist) { ok = false; break; } }
        if (ok) out.push({ p: [x, y, z], sd, pf: buf[o + 10], seed: 0, tagged: 0 });
      }
      return out;
    }
    const sites = [], occSites = [], motSites = [], assocSites = [], calSites = [];
    for (let sd = -1; sd <= 1; sd += 2) {
      const tg = pick((x, y, az, o) => az > 0.26 && y > -0.3 && buf[o + 7] > 0.5 && x > -0.72 && x < 0.72, 6, 0.4, null, sd);
      tg.forEach((s) => { s.tagged = 1; });
      const un = pick((x, y, az, o) => az > 0.1 && y > -0.34 && buf[o + 7] > 0.4, 38, 0.185, tg, sd);
      sites.push(...tg, ...un);
      occSites.push(...pick((x, y, az) => x < -0.56 && az > 0.06, 13, 0.07, null, sd));
      motSites.push(...pick((x, y, az, o) => buf[o + 11] > 0.6 && y > 0.12, 13, 0.045, null, sd));
      assocSites.push(...pick((x, y, az) => x < -0.36 && x > -0.82 && y < 0.12 && az > 0.2, 11, 0.07, null, sd));
      if (sd > 0) calSites.push(...pick((x, y, az) => y > 0.28 && az > 0.14 && az < 0.5 && Math.abs(x) < 0.7, 34, 0.05, null, sd));
    }
    sites.forEach((s, i) => { s.seed = (i + 0.37) / sites.length; });
    // per-point weights to the nearest landing site and to the nearest tagged site
    for (let i = cortexStart; i < cortexEnd; i++) {
      const o = i * STRIDE, x = buf[o], y = buf[o + 1], z = buf[o + 2];
      let best = null, bd = 1e9, td = 1e9;
      for (const s of sites) {
        if (s.sd * z <= 0) continue;
        const d = Math.hypot(s.p[0] - x, s.p[1] - y, s.p[2] - z);
        if (d < bd) { bd = d; best = s; }
        if (s.tagged && d < td) td = d;
      }
      if (best) {
        const R = best.tagged ? 0.13 : 0.1;
        const w = Math.max(0, 1 - bd / R);
        buf[o + 14] = best.seed; buf[o + 15] = w * w * (3 - 2 * w); buf[o + 17] = best.tagged;
      }
      const tw = Math.max(0, 1 - td / 0.16);
      buf[o + 16] = tw * tw;
    }

    /* ---- fibres: static point streams; packets are brightness pulses travelling along param t */
    function fibre(kind, fn, spacing, seed, tagged, aux, t0, t1, jit) {
      const M = 48, P = [], L = [0];
      for (let i = 0; i <= M; i++) { P.push(fn(i / M)); if (i) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2])); }
      const len = L[M], cnt = Math.max(8, Math.ceil(len / spacing));
      let j = 1;
      const br = 0.6 + 0.4 * rnd();
      for (let i = 0; i < cnt; i++) {
        const a = (i + rnd() * 0.8) / cnt, target = a * len;
        while (j < M && L[j] < target) j++;
        const f = (target - L[j - 1]) / Math.max(1e-6, L[j] - L[j - 1]);
        const q0 = P[j - 1], q1 = P[j];
        put(lerp(q0[0], q1[0], f) + (rnd() - 0.5) * jit, lerp(q0[1], q1[1], f) + (rnd() - 0.5) * jit, lerp(q0[2], q1[2], f) + (rnd() - 0.5) * jit, 0, 0, 0,
          10 + kind, br * (0.6 + 0.4 * rnd()), rnd(), rnd(), lerp(t0, t1, a), seed, tagged, aux, 0, 0, 0, 0);
      }
    }
    const jv = (s) => (rnd() - 0.5) * 2 * s;
    // replay: hippocampus → (fornix-like sweep) → thalamus → corona radiata → cortical site
    for (const s of sites) {
      const sd = s.sd, h = cr(HIP, 0.05 + 0.8 * rnd()); h[2] *= sd;
      const th = [THAL[0] + jv(0.09), THAL[1] + jv(0.04), sd * (THAL[2] + jv(0.035))];
      const c1 = [-0.3 + jv(0.05), -0.02 + jv(0.05), sd * (0.2 + jv(0.04))];
      const tip = [s.p[0] * 0.985, s.p[1] * 0.985, s.p[2] * 0.985];
      const c2 = [lerp(th[0], tip[0], 0.42), lerp(th[1], tip[1], 0.42) + 0.14, lerp(th[2], tip[2], 0.62)];
      fibre(0, (u) => (u < 0.36 ? bez2(h, c1, th, u / 0.36) : bez2(th, c2, tip, (u - 0.36) / 0.64)), 0.0095, s.seed, s.tagged, s.pf, 0, 1, 0.004);
    }
    // PGO: pons → midbrain → lateral geniculate → optic radiation → occipital cortex
    occSites.forEach((s, i) => {
      const sd = s.sd, a = [-0.10 + jv(0.02), -0.34 + jv(0.03), sd * (0.03 + jv(0.02))], c1 = [-0.05, -0.15, sd * 0.05];
      const lg = [LGN[0] + jv(0.02), LGN[1] + jv(0.02), sd * (LGN[2] + jv(0.02))];
      const c2 = [-0.44 + jv(0.05), 0.0 + jv(0.08), sd * (0.37 + jv(0.04))], tip = [s.p[0] * 0.985, s.p[1] * 0.985, s.p[2] * 0.985];
      fibre(1, (u) => (u < 0.42 ? bez2(a, c1, lg, u / 0.42) : bez2(lg, c2, tip, (u - 0.42) / 0.58)), 0.009, (i + 0.5) / occSites.length, 0, 0, 0, 1, 0.004);
    });
    // limbic ↔ visual association (inferior longitudinal bundle), plus amygdala ↔ hippocampus links
    assocSites.forEach((s, i) => {
      const sd = s.sd, fromAmy = i % 2 === 0;
      const a = fromAmy ? [AMY[0] + jv(0.03), AMY[1] + jv(0.02), sd * (AMY[2] + jv(0.02))] : (() => { const h = cr(HIP, 0.1 + 0.6 * rnd()); h[2] *= sd; return h; })();
      const c = [-0.28 + jv(0.06), -0.24 + jv(0.04), sd * (0.42 + jv(0.04))], tip = [s.p[0] * 0.98, s.p[1] * 0.98, s.p[2] * 0.98];
      fibre(2, (u) => bez2(a, c, tip, u), 0.009, (i + 0.5) / assocSites.length, 0, 0, 0, 1, 0.004);
    });
    for (let sd = -1; sd <= 1; sd += 2) for (let i = 0; i < 5; i++) {
      const a = [AMY[0] + jv(0.04), AMY[1] + jv(0.03), sd * (AMY[2] + jv(0.03))], h = cr(HIP, 0.05 + 0.5 * rnd()); h[2] *= sd;
      const c = [lerp(a[0], h[0], 0.5), -0.16 + jv(0.03), sd * (0.22 + jv(0.03))];
      fibre(2, (u) => bez2(a, c, h, u), 0.008, rnd(), 0, 1, 0, 1, 0.003);
    }
    // motor: precentral gyrus → internal capsule → peduncle → pons → medulla → | barrier | → cord
    motSites.forEach((s, i) => {
      const sd = s.sd, sp = s.p, jz = sd * (0.008 + 0.02 * rnd()), jx = jv(0.014);
      const ic = [-0.02 + jv(0.02), 0.0, sd * (0.165 + jv(0.015))];
      const top = [[sp[0] * 0.985, sp[1] * 0.985, sp[2] * 0.985], [lerp(sp[0], ic[0], 0.55), lerp(sp[1], ic[1], 0.5), lerp(sp[2], ic[2], 0.6)], ic,
        [-0.075, -0.17, sd * 0.06], [-0.115 + jx, -0.34, sd * 0.04], [-0.165 + jx, -0.5, jz * 1.4], [BARRIER[0] + jx, BARRIER[1], jz]];
      const low = [[BARRIER[0] + jx, BARRIER[1], jz], [-0.215 + jx, -0.76, jz], [-0.238 + jx, -0.93, jz]];
      const seed = (i + 0.5) / motSites.length;
      fibre(3, (u) => cr(top, u), 0.0085, seed, 0, 0, 0, T_BARRIER, 0.003);
      fibre(3, (u) => cr(low, u), 0.0085, seed, 0, 0, T_BARRIER, 1, 0.003);
      // sparks thrown off where this path's packets hit the barrier
      for (let k = 0; k < 9; k++) {
        const a = rnd() * TAU, up = 0.15 + 0.9 * rnd();
        put(BARRIER[0] + jx, BARRIER[1] + 0.004, jz, 0, 0, 0, 8, star(), rnd(), rnd(), 1, seed, 0, 0, Math.cos(a), up, Math.sin(a), 0.4 + 0.6 * rnd());
      }
    });
    // barrier ring at the top of the cord
    {
      const fr = frameAt(CORD, 0.02);
      for (let i = 0; i < 520; i++) {
        const a = rnd() * TAU, inner = rnd() < 0.3, r = inner ? 0.09 * Math.sqrt(rnd()) : 0.092 + 0.012 * (rnd() - 0.5);
        const ca = Math.cos(a) * r, sa = Math.sin(a) * r * 1.1;
        put(BARRIER[0] + fr.e1[0] * ca + fr.e2[0] * sa, BARRIER[1] + fr.e1[1] * ca + fr.e2[1] * sa + (rnd() - 0.5) * 0.004, BARRIER[2] + fr.e1[2] * ca + fr.e2[2] * sa, 0, 0, 0,
          8, star() * (inner ? 0.35 : 1), rnd(), rnd(), 0, rnd(), a / TAU, 0, 0, 0, 0, 0);
      }
    }
    // gold threads between tagged sites (same hemisphere: association arcs; a few across the callosum)
    const tagged = sites.filter((s) => s.tagged);
    const done = new Set();
    let tk = 0;
    tagged.forEach((a, ia) => {
      const near = tagged.map((b, ib) => ({ b, ib, d: b.sd === a.sd && ib !== ia ? Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1], a.p[2] - b.p[2]) : 1e9 })).sort((p, q) => p.d - q.d).slice(0, 2);
      for (const { b, ib, d } of near) {
        const key = Math.min(ia, ib) + '_' + Math.max(ia, ib);
        if (d > 1e8 || done.has(key)) continue; done.add(key);
        const m = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2, (a.p[2] + b.p[2]) / 2];
        const c = [lerp(m[0], m[0] * 0.5, 0.55), lerp(m[1], 0.06, 0.55), lerp(m[2], a.sd * 0.13, 0.55)];
        for (let st = 0; st < 2; st++) fibre(4, (u) => bez2(a.p, [c[0] + jv(0.03), c[1] + jv(0.03), c[2] + jv(0.03)], b.p, u), 0.009, (tk++ + 0.5) / 40, 1, 0, 0, 1, 0.003);
      }
    });
    for (let i = 0; i < 4; i++) {
      const a = tagged[i], b = tagged[6 + ((i * 2 + 1) % 6)];
      if (!a || !b) continue;
      const xm = (a.p[0] + b.p[0]) * 0.36;
      fibre(4, (u) => bez3(a.p, [xm, 0.17, a.sd * 0.15], [xm, 0.17, b.sd * 0.15], b.p, u), 0.009, (tk++ + 0.5) / 40, 1, 0, 0, 1, 0.003);
    }
    // corpus callosum: quiet arcs joining the hemispheres
    for (const s of calSites) {
      const p = s.p, a = [p[0], p[1], -p[2]], xm = p[0] * 0.72;
      fibre(5, (u) => bez3(a, [xm, 0.15, -0.15], [xm, 0.15, 0.15], p, u), 0.013, rnd(), 0, ss(0.24, 0.5, p[0]), 0, 1, 0.004);
    }

    /* ---- motes drifting in the void, for depth */
    for (let i = 0; i < 2600; i++) {
      const r = 1.15 + 3.6 * Math.pow(rnd(), 0.8);
      let ux = rnd() * 2 - 1, uy = rnd() * 2 - 1, uz = rnd() * 2 - 1; const l = Math.hypot(ux, uy, uz) || 1;
      put(ux / l * r, uy / l * r * 0.8, uz / l * r, 0, 0, 0, 9, star() * (rnd() < 0.1 ? 2 : 1), rnd(), rnd(), rnd(), rnd(), 0, 0, 0, 0, 0, 0);
    }
    return { data: buf.subarray(0, n * STRIDE), count: n };
  }

  /* ------------------------------------------------------------------ shaders */
  const VS = (noise) => `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNrm;
layout(location=2) in vec4 aA;   // region, brightness, seed, seed
layout(location=3) in vec4 aB;   // cortex: prefrontal, motor, visual, temporal | fibres: t, pathSeed, tagged, aux
layout(location=4) in vec4 aC;   // cortex: site seed, site weight, tag weight, site tagged | sparks: dir.xyz, speed
uniform mat4 uView, uProj;
uniform vec3 uEye;
uniform vec2 uRes;
uniform float uTime, uFade, uPx;
uniform vec4 uK0, uK1, uK2, uK3, uK4;
out vec3 vCol;
${noise}
const float SWT = 1.2;                         // slow-oscillation period, seconds
const vec3 COOL  = vec3(.085, .30, .52);
const vec3 TEAL  = vec3(.184, .718, .788);
const vec3 CREST = vec3(.60, .96, 1.0);
const vec3 GOLD  = vec3(1.0, .76, .48);
const vec3 ROSE  = vec3(1.0, .494, .714);
const vec3 WARM  = vec3(.62, .25, .27);
float n1(float x){ float i = floor(x), f = fract(x); f = f * f * (3. - 2. * f); return mix(hash11(i), hash11(i + 1.), f); }
float gRC, gRU, gTag;
// front → back travelling slow oscillation: 1 = up-state crest, 0 = silent trough
float slowUp(vec3 p){
  float ph = uTime / SWT - (0.85 - p.x) / 3.3 + .035 * sin(p.z * 5. + p.y * 3.) + .03 * sin(p.y * 7. - p.z * 4.);
  float w = .5 + .5 * cos(6.2831853 * ph);
  return w * sqrt(w);
}
// sharp-wave-ripple packets: each path fires (or not) once per slow-wave cycle, launched at the crest
bool rAct(float seed, float c, float tg){
  float pr = mix(.55, mix(.07, .95, tg), gTag);
  return hash21(vec2(seed * 313.7 + 1.3, c * .731 + 7.1)) < pr;
}
bool rRev(float seed, float c, float tg){   // tagged paths also run cortex → hippocampus
  return tg > .5 && gTag > .3 && hash21(vec2(seed * 71.3 + 4.1, c * 1.37 + 2.)) < .38;
}
float rDelay(float seed){ return hash11(seed * 57.31 + .7) * .14; }
float rDur(float seed){ return .32 + .12 * hash11(seed * 33.17 + .2); }
float comet(float t, float h){              // head at h travelling toward +t, exponential tail behind
  float d = h - t;
  float v = d > 0. ? exp(-d * 9.) : exp(-d * d * 2600.);
  return v * smoothstep(-.02, .03, h) * (1. - smoothstep(1., 1.12, h));
}
float landing(float seed, float tg){        // lingering bloom where packets arrive (or depart, if reversed)
  float b = 0., dl = rDelay(seed), du = rDur(seed);
  for(int k = 0; k < 3; k++){
    float c = gRC - float(k);
    if(rAct(seed, c, tg)){
      bool rv = rRev(seed, c, tg);
      float age = gRU + float(k) - (rv ? dl : dl + du);
      if(age > 0.) b += exp(-age * (rv ? 3.5 : 1.45)) * smoothstep(0., .05, age);
    }
  }
  return b;
}
void main(){
  float reg = aA.x, bright = aA.y, s1 = aA.z, s2 = aA.w;
  float emerge = uK0.x, slow = uK0.y, deep = uK0.z, replay = uK0.w;
  float tag = uK1.x, pons = uK1.y, pgo = uK1.z, ach = uK1.w;
  float limbic = uK2.x, pfc = uK2.y, warm = uK2.z, motor = uK2.w;
  float dive = uK3.x, dimAll = uK3.y, focus = uK3.z, ctxGain = uK3.w;
  float T = uTime;
  gTag = tag;
  vec3 pos = aPos, col = vec3(0.);
  float size = .0105, facingAmt = 0.;
  vec3 base = mix(COOL, WARM, warm);
  vec3 hotMix = mix(ROSE, GOLD, n1(T * .7 + s2 * 40. + aPos.y * 2.5));

  // clocks ------------------------------------------------------------
  float rc = T / SWT - .30; gRC = floor(rc); gRU = fract(rc);       // ripple cycle: crest reaches the hippocampus at phase 0
  float pc = T / .5; float pC = floor(pc), pU = fract(pc);          // PGO waves: clusters of three, then a pause
  float pAct = step(fract(pC / 5.), .5), pActPrev = step(fract((pC - 1.) / 5.), .5);
  float pgoPons = pAct * exp(-pU * 4.5) + pActPrev * exp(-(pU + 1.) * 4.5);
  float pgoThal = pAct * exp(-pow((pU - .30) / .14, 2.));
  float pgoOcc = pAct * smoothstep(.5, .64, pU) * exp(-max(pU - .62, 0.) * 3.4) + pActPrev * exp(-(pU + .38) * 3.4);
  float twk = .8 + .2 * sin(T * (.5 + s2) + s1 * 6.283);
  float fl = n1(T * 7. + s1 * 90.); fl *= fl;                        // fast irregular REM activity

  if(reg < .5){                                                      // ---------------- cerebral cortex
    float pf = aB.x, mo = aB.y, vis = aB.z;
    float up = slowUp(aPos);
    float I = bright * twk;
    col = base * I * 1.05 * mix(1., .28 + 1.75 * up, slow);
    col += CREST * I * up * up * slow * .55;
    col *= 1. - .5 * tag * (1. - aC.z) * (1. - warm * .6);            // the untagged majority dims
    float gd = aC.w * smoothstep(0., .35, tag);
    col += mix(vec3(.45, .95, 1.), GOLD * 1.25, gd) * landing(aC.x, aC.w) * aC.y * replay * 1.5 * (.5 + .5 * bright);
    col += GOLD * aC.z * tag * (.75 + .25 * sin(T * 1.3 + aC.x * 40.)) * (.35 + .65 * bright) * 1.15;
    col *= ctxGain;
    // REM: cholinergic shimmer everywhere, visual cortex ablaze, PGO volleys landing at the back
    col += base * I * ach * (.22 + .9 * fl * fl);
    col += hotMix * I * vis * limbic * (.35 + 1.5 * fl);
    col += vec3(1., .8, .86) * I * vis * pgo * pgoOcc * 1.5;
    col = mix(col, vec3(.010, .016, .034) * I, pf * pfc * .97);      // dorsolateral prefrontal goes dark
    float mf = n1(T * 9. + s2 * 70. + aPos.z * 5.); mf *= mf;
    col += mix(GOLD, vec3(1., .95, .88), .35) * I * mo * motor * (.5 + 2.6 * mf);
    size = .0105 * (.75 + .5 * s2);
    facingAmt = 1.;
  } else if(reg < 1.5){                                              // ---------------- cerebellum
    col = base * bright * twk * .8 * mix(1., .7 + .5 * slowUp(aPos), slow * .5);
    col += base * bright * ach * .12 * fl;
    size = .009; facingAmt = 1.;
  } else if(reg < 2.5){                                              // ---------------- brainstem
    float s = aB.x, pw = aB.y, core = 1. - aB.z;
    col = base * bright * twk * .7;
    // pons ignites: rose-white core, PGO volleys climbing toward the midbrain
    float climb = pAct * exp(-pow((s - (.5 - pU * 1.6)) / .09, 2.)) * step(s, .55);
    col += mix(ROSE, vec3(1., .9, .93), .25 + .6 * core) * bright * pons * (pw * (1.5 + 2.2 * pgoPons * pgo + .6 * fl) + climb * pgo * 1.6);
    // atonia: the lower medulla clamps down, glowing dull red just above the barrier
    col = mix(col, vec3(.55, .10, .16) * bright * (.5 + .3 * sin(T * 2.1 + s1 * 6.)), motor * smoothstep(.72, .98, s) * .9);
    size = .0095 * (.8 + .5 * core) * (1. + .5 * pons * pw); facingAmt = .7 * aB.z * (1. - pons * pw);
  } else if(reg < 3.5){                                              // ---------------- thalamus
    col = mix(base, TEAL, .35 * (1. - warm)) * bright * twk * (.34 + .28 * deep);
    // sleep spindles: 13 Hz flutter riding the up-state
    float spOn = step(hash11(gRC * 1.731 + 5.), .7);
    float env = smoothstep(.02, .2, gRU) * (1. - smoothstep(.5, .85, gRU)) * spOn;
    float flut = .5 + .5 * sin(6.2831853 * 13. * T + floor(s1 * 5.) * 1.3);
    col += vec3(.55, .95, 1.) * bright * env * flut * flut * replay * 1.3;
    col += mix(ROSE, vec3(1., .88, .9), .4) * bright * pgo * (.25 + 1.6 * pgoThal);
    col += hotMix * bright * limbic * .25 * fl;
    size = .0095;
  } else if(reg < 4.5){                                              // ---------------- hippocampus
    float s = aB.x;
    col = mix(base, TEAL, .4 * (1. - warm)) * bright * twk * .4;
    float burst = smoothstep(0., .04, gRU) * (1. - smoothstep(.1, .34, gRU));
    float rip = .5 + .5 * sin(s * 80. - T * 46. + s1 * 5.);
    vec3 hc = mix(vec3(.5, .97, 1.), GOLD * 1.1, tag * step(.55, s2));
    col += hc * bright * deep * (1. - .75 * limbic) * (.5 + 2.4 * burst * rip * rip * (.35 + .65 * replay));
    col += hotMix * bright * limbic * (.45 + 1.5 * fl);
    size = .0095;
  } else if(reg < 5.5){                                              // ---------------- amygdala
    col = base * bright * twk * .4;
    col += GOLD * bright * tag * (1. - limbic) * (.8 + .5 * sin(T * 1.7 + s1 * 6.));
    col += mix(ROSE, vec3(1., .62, .55), .4) * bright * limbic * (.55 + 1.7 * fl);
    size = .0095;
  } else if(reg < 6.5){                                              // ---------------- spinal cord
    col = base * bright * twk * .7 * (1. - .88 * motor);
    size = .009; facingAmt = .6;
  } else if(reg < 7.5){                                              // ---------------- fornix
    float burst = smoothstep(0., .04, gRU) * (1. - smoothstep(.1, .4, gRU));
    col = mix(base, TEAL, .4 * (1. - warm)) * bright * (.22 + .5 * deep * (1. - limbic) + .6 * replay * burst * exp(-pow((aB.x - gRU * 3.) / .2, 2.)));
    col += hotMix * bright * limbic * .5 * fl;
    size = .007;
  } else if(reg < 8.5){                                              // ---------------- barrier + sparks
    float seed = aB.y;
    float ph = T / .8 + hash11(seed * 91.7 + .3);
    float mU = fract(ph);
    bool on = hash21(vec2(seed * 517.3, floor(ph) * .37 + 1.7)) < .75;
    float age = (mU - .6) / .4;
    if(aB.x > .5){                                                   // sparks
      float a = clamp(age, 0., 1.);
      pos += aC.xyz * vec3(.11, .10, .11) * aC.w * (1. - exp(-a * 3.)) + vec3(0., -.05 * a * a, 0.);
      col = (on && age > 0.) ? mix(vec3(1., .93, .85), GOLD, a) * bright * exp(-a * 3.2) * 1.5 * motor : vec3(0.);
      size = .008;
    } else {                                                         // ring
      float ang = aB.z * 6.2831853;
      float shim = .5 + .5 * sin(ang * 3. - T * 2.4);
      float hit = pow(n1(T * 5. + aB.z * 9.), 3.);
      col = mix(ROSE, vec3(1., .9, .92), .45) * bright * motor * (.55 + .5 * shim + 1.6 * hit);
      size = .0085;
    }
  } else if(reg < 9.5){                                              // ---------------- motes
    pos.y = mod(pos.y + T * .012 * (.4 + aB.x) + 3., 6.) - 3.;
    pos.x += .12 * sin(T * .07 * (.5 + aB.y) + s1 * 6.283);
    pos.z += .12 * cos(T * .06 * (.5 + aB.x) + s2 * 6.283);
    col = mix(vec3(.16, .46, .56), vec3(.60, .32, .40), uK4.w) * bright * (.6 + .4 * sin(T * (.3 + s1) + s2 * 6.283)) * uK4.z;
    size = .011 * (.6 + .8 * s2);
  } else {                                                           // ---------------- fibres
    float t = aB.x, seed = aB.y, tg = aB.z, aux = aB.w;
    size = .0064;
    if(reg < 10.5){                                                  // replay: hippocampus → thalamus → cortex
      bool on = rAct(seed, gRC, tg);
      bool rv = on && rRev(seed, gRC, tg);
      float h = (gRU - rDelay(seed)) / rDur(seed);
      float p = on ? comet(rv ? 1. - t : t, h) : 0.;
      float gd = tg * smoothstep(0., .35, tag);
      vec3 pc3 = mix(vec3(.5, .96, 1.), GOLD * 1.15, gd);
      float keep = mix(1., mix(.35, 1.5, tg), tag);
      col = mix(base, TEAL, .3 * (1. - warm)) * bright * (.05 + .13 * deep) * keep;
      col += GOLD * bright * gd * tag * .16;
      col += pc3 * p * replay * 2.3;
      // spindle flutter where the radiations leave the thalamus
      float dT = length(aPos - vec3(-.05, 0., sign(aPos.z) * .088));
      float spOn = step(hash11(gRC * 1.731 + 5.), .7);
      float env = smoothstep(.02, .2, gRU) * (1. - smoothstep(.5, .85, gRU)) * spOn;
      float flut = .5 + .5 * sin(6.2831853 * 13. * T - dT * 30.);
      col += vec3(.5, .93, 1.) * bright * env * flut * flut * replay * .55 * smoothstep(.34, .1, dT);
      col += base * bright * ach * .3 * pow(n1(t * 5. - T * 1.6 + seed * 60.), 5.);
      col *= 1. - .92 * aux * pfc;
      size += .010 * p;
    } else if(reg < 11.5){                                           // PGO: pons → geniculate → occipital
      float h = (pU - hash11(seed * 77.1) * .1) / .66;
      float p = pAct * comet(t, h);
      col = mix(base, ROSE, .5 * pons) * bright * (.04 + .14 * pons);
      col += mix(ROSE, vec3(1., .9, .93), .5) * p * pgo * 2.6;
      size += .011 * p * pgo;
    } else if(reg < 12.5){                                           // limbic ↔ visual association
      float a = pow(n1(t * 4.5 - T * 2.6 + seed * 37.), 4.) + pow(n1(t * 4.5 + T * 2.1 + seed * 91.), 4.);
      col = base * bright * .05 + hotMix * bright * limbic * (.16 + 2.2 * a);
      size += .008 * a * limbic;
    } else if(reg < 13.5){                                           // motor: cortex → brainstem → | barrier
      float ph = T / .8 + hash11(seed * 91.7 + .3);
      float mU = fract(ph);
      bool on = hash21(vec2(seed * 517.3, floor(ph) * .37 + 1.7)) < .75;
      float tt = t / ${T_BARRIER.toFixed(2)};
      float h = mU / .6;
      float p = (on && tt <= 1.) ? comet(tt, min(h, 1.02)) * (1. - smoothstep(1., 1.5, h)) : 0.;
      float above = step(tt, 1.);
      col = base * bright * .05 * mix(1., above * 1.6, motor);
      col += GOLD * bright * motor * above * .10;
      col += mix(GOLD, vec3(1., .96, .9), .5) * p * motor * 2.5;
      size += .010 * p * motor;
    } else if(reg < 14.5){                                           // gold threads between tagged memories
      float a = pow(n1(t * 3. - T * 1.1 + seed * 53.), 3.) + pow(n1(t * 3. + T * .9 + seed * 17.), 3.);
      col = GOLD * bright * tag * (.20 + 1.1 * a) * (1. - .5 * limbic);
      size += .006 * a * tag;
    } else {                                                         // corpus callosum
      col = base * bright * (.07 + .07 * slow * slowUp(aPos) + .2 * ach * pow(n1(t * 4. - T * 1.3 + seed * 44.), 4.));
      col *= 1. - .9 * aux * pfc;
      size = .0058;
    }
  }

  // emergence: the constellation gathers itself out of the dark water ----------------
  if(reg < 8.5 || reg > 9.5){
    float e = clamp(emerge * 1.6 - s2 * .6, 0., 1.); e = e * e * (3. - 2. * e);
    vec3 dr = vec3(sin(s1 * 40. + T * .21), cos(s1 * 31. + T * .17) - .7, sin(s2 * 37. - T * .15));
    pos += (1. - e) * (1. - e) * (pos * .5 + dr * .32);
    col *= e;
  }
  vec4 vp = uView * vec4(pos, 1.);
  float depth = -vp.z;
  vec3 vd = normalize(uEye - pos);
  float ndv = dot(aNrm, vd);
  float fc = mix(.05, 1., smoothstep(-.25, .5, ndv)) * (1. + .3 * pow(1. - abs(ndv), 3.));
  col *= mix(1., fc, facingAmt);
  col *= clamp(1. - (depth - uK4.x) * .4, .3, 1.4);                  // nearer is brighter
  col *= smoothstep(.03, .25, depth);
  float px0 = size * uPx / max(depth, .03);
  float blur = uK4.y * abs(1. / max(depth, .06) - 1. / focus) * uRes.y;
  float px = clamp(px0 + blur, 1.7, uRes.y * .075);
  col *= min(1., (px0 * px0) / (px * px)) * dimAll * uFade;
  gl_Position = uProj * vp;
  gl_PointSize = px;
  if(max(col.r, max(col.g, col.b)) < .0012 || depth < .03) gl_Position = vec4(2., 2., 2., 1.);
  vCol = col;
}`;

  const FS = `#version 300 es
precision highp float;
in vec3 vCol;
out vec4 fragColor;
void main(){
  vec2 q = gl_PointCoord * 2. - 1.;
  float r2 = dot(q, q);
  float a = exp(-r2 * 3.4) - .0334;
  if(a <= 0.) discard;
  fragColor = vec4(vCol * a, 1.);
}`;

  const BG = `
uniform vec4 uBg;    // warmth, halo, water, glow
uniform vec4 uCen;   // brain centre (aspect-correct uv), radius, haze
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  float warmth = uBg.x;
  vec2 q = uv * 1.25 + uPointer * .025;
  float f = .5 + .32 * snoise(vec3(q * .8, uTime * .022)) + .16 * snoise(vec3(q * 1.9 + 4., uTime * .034 + 2.));
  float f2 = .5 + .34 * snoise(vec3(q * 1.5 + 7., uTime * .04 + 3.)) + .14 * snoise(vec3(q * 3.4 + 1., uTime * .05));
  float v = smoothstep(1.25, 0., length(uv * vec2(.75, 1.)));
  vec3 tint = mix(vec3(.010, .052, .066), vec3(.064, .020, .052), warmth);
  vec3 col = tint * (.16 + 1.5 * f * f) * (.35 + .65 * v);
  // soft scattering halo behind the brain
  vec2 d = uv - uCen.xy; float r = length(d) / max(uCen.z, .001);
  col += mix(vec3(.016, .085, .11), vec3(.13, .045, .085), warmth) * exp(-r * r * 1.1) * uBg.y * (.55 + .7 * f2);
  // dark water: faint slanting light from far above, at the very start
  float sh = .5 + .5 * snoise(vec2(uv.x * 2.2 + uv.y * .6 + 3., uTime * .05));
  col += vec3(.012, .075, .09) * pow(sh, 3.) * 2.2 * smoothstep(-.55, .6, uv.y) * uBg.z;
  // the dive: soft rose-gold light swallowing the frame, then settling to a haze
  float g = uBg.w;
  vec3 glow = mix(vec3(1., .46, .62), vec3(1., .74, .50), smoothstep(.9, 0., r * .6) * .7 + .3 * f2);
  float body = exp(-dot(uv, uv) * 1.1) * (.55 + .75 * f) + .28 * f2;
  col += glow * body * g * .34;
  col += mix(vec3(.10, .035, .06), vec3(.16, .085, .06), f) * uCen.w * (.4 + .9 * f2) * (.5 + .5 * v);
  fragColor = vec4(col * uFade, 1.);
}`;

  /* ------------------------------------------------------------------ night state + camera */
  function nightState(n) {
    return {
      emerge: ss(0.0, 0.15, n),
      slow: ss(0.03, 0.14, n) * (1 - 0.55 * ss(0.8, 0.97, n)) * (1 - ss(1.0, 1.06, n)),
      deep: ss(0.18, 0.32, n),
      replay: ss(0.24, 0.36, n) * (1 - 0.35 * ss(0.85, 0.97, n)) * (1 - ss(1.0, 1.07, n)),
      tag: ss(0.6, 0.74, n) * (1 - 0.62 * ss(1.04, 1.2, n)),
      pons: ss(1.075, 1.12, n) * (1 - 0.3 * ss(1.2, 1.4, n)),
      pgo: ss(1.095, 1.16, n) * (1 - 0.45 * ss(1.4, 1.6, n)),
      ach: ss(1.12, 1.25, n),
      limbic: ss(1.17, 1.3, n),
      pfc: ss(1.38, 1.5, n),
      warm: ss(1.55, 1.67, n),
      motor: ss(1.68, 1.735, n) * (1 - ss(1.84, 1.9, n)),
      dive: ss(1.82, 1.95, n),
      cortex: 1 - 0.5 * ss(0.2, 0.36, n) * (1 - ss(0.58, 0.72, n)),
      dim: (1 - 0.82 * ss(1.935, 2.0, n)) * (1 - 0.62 * ss(1.83, 1.92, n)),
      glow: ss(1.87, 1.93, n) * (1 - 0.86 * ss(1.94, 2.0, n)),
      haze: ss(1.9, 2.0, n),
      warmBg: ss(1.06, 1.3, n),
      water: 1 - ss(0.05, 0.3, n),
      motes: ss(0.0, 0.06, n) * (1 - 0.7 * ss(1.86, 1.95, n)),
    };
  }
  /* keys: n, yaw, elevation, distance, target xyz. yaw 0 = lateral view (front of the brain to the right),
     yaw > 0 swings toward the front, yaw = -PI/2 is directly behind. Segments are smoothstep-eased, so equal
     neighbouring keys give an exact plateau (0.90..1.08: the replay → rem hand-over). */
  const CAM = [
    [0.00, 0.62, 0.26, 3.45, 0.0, -0.06, 0.0],
    [0.20, 0.40, 0.20, 3.05, 0.0, -0.07, 0.0],
    [0.40, 0.12, 0.02, 2.30, -0.04, -0.10, 0.0],
    [0.60, 0.04, -0.03, 2.25, -0.04, -0.10, 0.0],
    [0.90, -0.12, 0.10, 2.95, -0.04, -0.13, 0.0],
    [1.08, -0.12, 0.10, 2.95, -0.04, -0.13, 0.0],
    [1.17, -0.20, 0.06, 2.85, -0.05, -0.14, 0.0],
    [1.36, -0.30, 0.10, 2.65, -0.08, -0.10, 0.0],
    [1.52, 0.40, 0.20, 2.85, 0.0, -0.06, 0.0],
    [1.68, 0.12, 0.10, 2.95, -0.02, -0.10, 0.0],
    [1.80, 0.06, 0.00, 3.05, -0.06, -0.20, 0.0],
    [1.86, -0.90, 0.08, 2.75, -0.20, -0.05, 0.05],
    [1.90, -1.42, 0.05, 1.60, -0.30, 0.0, 0.10],
    [1.935, -1.50, 0.03, 0.46, -0.30, 0.02, 0.12],
    [2.00, -1.52, 0.02, 0.12, -0.26, 0.03, 0.10],
  ];
  const FOV = 34 * Math.PI / 180;
  const cam = { view: new Float32Array(16), proj: new Float32Array(16), vp: new Float32Array(16), eye: [0, 0, 3], target: [0, 0, 0], dist: 3, px: 1 };
  function camera(n, s, k) {
    let i = 0;
    while (i < CAM.length - 2 && n > CAM[i + 1][0]) i++;
    const a = CAM[i], b = CAM[i + 1], t = ss(a[0], b[0], n);
    const v = (j) => lerp(a[j], b[j], t);
    const calm = 1 - k.dive;
    const sway = (0.10 + 0.22 * (1 - ss(0.1, 0.4, n))) * calm;
    const yaw = v(1) + sway * Math.sin(s.time * 0.11) + s.pointer.x * 0.30 * (0.25 + 0.75 * calm);
    const el = clamp(v(2) + 0.03 * Math.sin(s.time * 0.17 + 1) * calm + s.pointer.y * 0.16 * (0.25 + 0.75 * calm), -0.6, 0.9);
    // keep the whole brain in frame on narrow (portrait) screens
    const fit = Math.max(1, 0.98 / (Math.tan(FOV / 2) * s.aspect * 3.0));
    const dist = v(3) * lerp(1, fit, calm * calm);
    const tg = cam.target; tg[0] = v(4); tg[1] = v(5); tg[2] = v(6);
    const ce = Math.cos(el);
    cam.eye[0] = tg[0] + dist * Math.sin(yaw) * ce; cam.eye[1] = tg[1] + dist * Math.sin(el); cam.eye[2] = tg[2] + dist * Math.cos(yaw) * ce;
    cam.dist = dist;
    lookAt(cam.view, cam.eye, tg);
    perspective(cam.proj, FOV, s.aspect, 0.02, 30);
    mul4(cam.vp, cam.proj, cam.view);
    cam.px = s.height / (2 * Math.tan(FOV / 2));
  }
  function projectPoint(p) {
    const m = cam.vp, x = p[0], y = p[1], z = p[2];
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12], cy = m[1] * x + m[5] * y + m[9] * z + m[13], cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [cx / cw, cy / cw, cw];
  }

  /* ------------------------------------------------------------------ GL + scenes */
  let gl = null, ptProg = null, bgProg = null, vao = null, count = 0, built = false;
  const last = { n: -1, at: -1e9, k: null, aspect: 1 };

  function initShared(ctx) {
    if (built) return;
    gl = ctx.gl;
    bgProg = ctx.util.fullscreen(ctx.glsl.head + ctx.glsl.noise + BG, 'brain.bg');
    ptProg = ctx.util.program(VS(ctx.glsl.noise), FS, 'brain.points');
    const geo = build();
    count = geo.count;
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, geo.data, gl.STATIC_DRAW);
    const B = STRIDE * 4;
    [[0, 3, 0], [1, 3, 12], [2, 4, 24], [3, 4, 40], [4, 4, 56]].forEach(([loc, size, off]) => {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, B, off);
    });
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    built = true;
  }

  function draw(s, n) {
    if (!built || !ptProg.ok || !bgProg.ok) return;
    const k = nightState(n);
    camera(n, s, k);
    last.n = n; last.k = k; last.at = (typeof performance !== 'undefined' ? performance.now() : Date.now()); last.aspect = s.aspect;

    // background void
    const c = projectPoint([-0.03, -0.1, 0]);
    const rad = 0.78 * cam.px / Math.max(0.3, cam.dist) / s.height;
    bgProg.use().common(s)
      .f4('uBg', k.warmBg, k.emerge * (1 - 0.6 * k.dive), k.water, k.glow)
      .f4('uCen', c[0] * 0.5 * s.aspect, c[1] * 0.5, rad, k.haze);
    D.util.drawQuad();

    // the brain
    const focus = lerp(cam.dist, 0.55, k.dive);
    ptProg.use()
      .m4('uView', cam.view).m4('uProj', cam.proj)
      .f3('uEye', cam.eye[0], cam.eye[1], cam.eye[2])
      .f2('uRes', s.width, s.height).f1('uTime', s.time).f1('uFade', s.fade).f1('uPx', cam.px)
      .f4('uK0', k.emerge, k.slow, k.deep, k.replay)
      .f4('uK1', k.tag, k.pons, k.pgo, k.ach)
      .f4('uK2', k.limbic, k.pfc, k.warm, k.motor)
      .f4('uK3', k.dive, k.dim, focus, k.cortex)
      .f4('uK4', cam.dist, 0.011, k.motes, k.warmBg);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.POINTS, 0, count);
    gl.bindVertexArray(null);
  }

  D.registerScene({ id: 'replay', init: initShared, render(s) { draw(s, clamp(s.progress, 0, 1)); } });
  D.registerScene({ id: 'rem', init: initShared, render(s) { draw(s, 1 + clamp(s.progress, 0, 1)); } });

  /* Label helper for the director: screen position of a named structure for the most recently rendered
     brain frame. x right, y down, both 0..1 in CSS-normalised viewport coordinates. */
  D.brain = {
    names: Object.keys(CENTROIDS),
    project(name) {
      const c = CENTROIDS[name];
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      if (!c || !last.k || now - last.at > 600) return { x: 0.5, y: 0.5, visible: false };
      const p = [c[0], c[1], c[2] * (cam.eye[2] < 0 ? -1 : 1)]; // paired structures: the side facing the camera
      const q = projectPoint(p);
      const x = q[0] * 0.5 + 0.5, y = 0.5 - q[1] * 0.5;
      const visible = q[2] > 0.05 && x > 0.02 && x < 0.98 && y > 0.02 && y < 0.98 && last.k.emerge > 0.6 && last.k.dive < 0.25;
      return { x, y, visible, depth: q[2] };
    },
    night() { return last.n; },   // 0..1 replay, 1..2 rem; -1 before the first frame
    state() { return last.k; },
  };
})();
