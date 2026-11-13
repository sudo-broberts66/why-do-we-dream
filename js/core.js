/* DREAM engine: WebGL2 context, scene registry, scroll timeline, post-processing, render loop. */
(function () {
  'use strict';
  const D = (window.DREAM = window.DREAM || {});
  D.scenes = {};
  D.errors = [];
  D.registerScene = function (def) { D.scenes[def.id] = def; };

  let gl = null;
  const reported = new Set();
  function report(msg) {
    if (reported.has(msg)) return;
    reported.add(msg);
    D.errors.push(msg);
    console.error('[DREAM] ' + msg);
  }
  D.report = report;

  /* ------------------------------------------------------------------ GL helpers */
  function compile(type, src, label) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      const numbered = src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n');
      report(label + ' ' + (type === gl.VERTEX_SHADER ? 'vertex' : 'fragment') + ' shader failed:\n' + log + '\n' + numbered);
      return null;
    }
    return s;
  }

  class Program {
    constructor(vs, fs, label) {
      this.label = label || 'program';
      this.loc = {};
      this.p = gl.createProgram();
      const v = compile(gl.VERTEX_SHADER, vs, this.label);
      const f = compile(gl.FRAGMENT_SHADER, fs, this.label);
      this.ok = !!(v && f);
      if (this.ok) {
        gl.attachShader(this.p, v); gl.attachShader(this.p, f); gl.linkProgram(this.p);
        if (!gl.getProgramParameter(this.p, gl.LINK_STATUS)) {
          report(this.label + ' link failed: ' + gl.getProgramInfoLog(this.p));
          this.ok = false;
        }
      }
    }
    use() { gl.useProgram(this.p); return this; }
    u(n) { if (!(n in this.loc)) this.loc[n] = gl.getUniformLocation(this.p, n); return this.loc[n]; }
    a(n) { return gl.getAttribLocation(this.p, n); }
    f1(n, a) { gl.uniform1f(this.u(n), a); return this; }
    f2(n, a, b) { gl.uniform2f(this.u(n), a, b); return this; }
    f3(n, a, b, c) { gl.uniform3f(this.u(n), a, b, c); return this; }
    f4(n, a, b, c, d) { gl.uniform4f(this.u(n), a, b, c, d); return this; }
    i1(n, a) { gl.uniform1i(this.u(n), a); return this; }
    m4(n, m) { gl.uniformMatrix4fv(this.u(n), false, m); return this; }
    /* Sets the standard uniforms declared in DREAM.glsl.head from a scene state. */
    common(s) {
      return this.f1('uTime', s.time).f2('uRes', s.width, s.height).f1('uProgress', s.progress)
        .f1('uFade', s.fade).f2('uPointer', s.pointer.x, s.pointer.y).f1('uScroll', s.scroll);
    }
  }

  let emptyVAO = null;
  const util = (D.util = {
    Program,
    /* program(vs, fs, label) -> Program */
    program(vs, fs, label) { return new Program(vs, fs, label); },
    /* fullscreen(fragmentSource, label) -> Program using the shared fullscreen-triangle vertex shader.
       fragmentSource must be a complete shader, e.g. DREAM.glsl.head + DREAM.glsl.noise + `void main(){...}` */
    fullscreen(fs, label) { return new Program(D.glsl.vsFull, fs, label); },
    /* Draws the fullscreen triangle with whatever program is in use. */
    drawQuad() { gl.bindVertexArray(emptyVAO); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null); },
    /* Re-binds the engine's main render target + viewport (call if a scene used its own framebuffer). */
    bindMain() { gl.bindFramebuffer(gl.FRAMEBUFFER, main.fbo); gl.viewport(0, 0, main.w, main.h); },
    /* Restores the blend/depth state the engine expects between scenes. */
    resetState() {
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    },
    clamp(x, a, b) { return Math.min(b, Math.max(a, x)); },
    smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); },
    lerp(a, b, t) { return a + (b - a) * t; },
  });

  /* ------------------------------------------------------------------ render targets */
  const main = { fbo: null, tex: null, depth: null, w: 0, h: 0 };
  const bloom = []; // [{fbo, tex, w, h}]
  let floatTargets = false;
  let post = null;

  function makeTarget(w, h) {
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (floatTargets) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fbo, tex, w, h };
  }
  function freeTarget(t) {
    if (!t || !t.fbo) return;
    gl.deleteFramebuffer(t.fbo); gl.deleteTexture(t.tex);
    if (t.depth) gl.deleteRenderbuffer(t.depth);
  }

  function allocTargets(w, h) {
    freeTarget(main); bloom.forEach(freeTarget); bloom.length = 0;
    Object.assign(main, makeTarget(w, h));
    main.depth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, main.depth);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, main.depth);
    let bw = w, bh = h;
    for (let i = 0; i < 5; i++) {
      bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1);
      bloom.push(makeTarget(bw, bh));
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  function buildPost() {
    const h = '#version 300 es\nprecision highp float;\nout vec4 fragColor;\nuniform sampler2D uTex;\nuniform vec2 uTexel;\n';
    post = {
      // bright-pass + first downsample
      pre: util.fullscreen(h + `
void main(){
  vec2 uv = gl_FragCoord.xy * uTexel;          // uTexel = destination texel (source is 2x larger)
  vec3 c = vec3(0.);
  c += texture(uTex, uv + uTexel * vec2(-.5, -.5)).rgb;
  c += texture(uTex, uv + uTexel * vec2( .5, -.5)).rgb;
  c += texture(uTex, uv + uTexel * vec2(-.5,  .5)).rgb;
  c += texture(uTex, uv + uTexel * vec2( .5,  .5)).rgb;
  c *= 0.25;
  c = min(c, vec3(12.));
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(0.45, 1.1, l);
  fragColor = vec4(c * (0.05 + 0.95 * k), 1.);
}`, 'post.pre'),
      down: util.fullscreen(h + `
void main(){
  vec2 uv = gl_FragCoord.xy * uTexel;          // uTexel = destination texel
  vec3 c = texture(uTex, uv).rgb * 4.;
  c += texture(uTex, uv + uTexel * vec2(-.5, -.5)).rgb;
  c += texture(uTex, uv + uTexel * vec2( .5, -.5)).rgb;
  c += texture(uTex, uv + uTexel * vec2(-.5,  .5)).rgb;
  c += texture(uTex, uv + uTexel * vec2( .5,  .5)).rgb;
  fragColor = vec4(c / 8., 1.);
}`, 'post.down'),
      up: util.fullscreen(h + `
uniform vec2 uDstTexel;
void main(){
  vec2 uv = gl_FragCoord.xy * uDstTexel;      // uTexel = source (smaller) texel
  vec3 c = vec3(0.);
  c += texture(uTex, uv + uTexel * vec2(-1., 0.)).rgb;
  c += texture(uTex, uv + uTexel * vec2( 1., 0.)).rgb;
  c += texture(uTex, uv + uTexel * vec2(0., -1.)).rgb;
  c += texture(uTex, uv + uTexel * vec2(0.,  1.)).rgb;
  c += texture(uTex, uv + uTexel * vec2(-.7, -.7)).rgb * 2. * .5;
  c += texture(uTex, uv + uTexel * vec2( .7, -.7)).rgb * 2. * .5;
  c += texture(uTex, uv + uTexel * vec2(-.7,  .7)).rgb * 2. * .5;
  c += texture(uTex, uv + uTexel * vec2( .7,  .7)).rgb * 2. * .5;
  fragColor = vec4(c / 8., 1.);
}`, 'post.up'),
      final: util.fullscreen(h + `
uniform sampler2D uBloom;
uniform vec2 uRes;
uniform float uTime, uBloomAmt, uGrain, uVig, uVeil;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 shoulder(vec3 c){ // identity below .75, soft roll-off above
  vec3 x = max(c - .75, 0.);
  return min(c, vec3(.75)) + .25 * (1. - exp(-x * 2.2));
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 d = uv - .5;
  float r2 = dot(d, d);
  // faint lens fringing toward the edges
  vec2 off = d * r2 * 0.012;
  vec3 c;
  c.r = texture(uTex, uv - off).r;
  c.g = texture(uTex, uv).g;
  c.b = texture(uTex, uv + off).b;
  c += texture(uBloom, uv).rgb * uBloomAmt;
  c = shoulder(c);
  c *= 1. - uVig * smoothstep(.12, .95, r2 * 1.9);
  float g = h21(gl_FragCoord.xy + fract(uTime * 7.31) * 913.);
  float lum = dot(c, vec3(.3, .6, .1));
  c += (g - .5) * uGrain * (0.6 + 0.4 * (1. - lum));
  c *= 1. - uVeil;
  c += (h21(gl_FragCoord.xy * 1.7 + 3.1) - .5) / 255.;
  fragColor = vec4(max(c, 0.), 1.);
}`, 'post.final'),
    };
  }

  function runPost(time) {
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    // prefilter: main -> bloom[0]
    let src = main, dst = bloom[0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    post.pre.use().i1('uTex', 0).f2('uTexel', 1 / dst.w, 1 / dst.h);
    util.drawQuad();
    // downsample chain
    for (let i = 1; i < bloom.length; i++) {
      src = bloom[i - 1]; dst = bloom[i];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      post.down.use().i1('uTex', 0).f2('uTexel', 1 / dst.w, 1 / dst.h);
      util.drawQuad();
    }
    // upsample chain, additive
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = bloom.length - 1; i > 0; i--) {
      src = bloom[i]; dst = bloom[i - 1];
      gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo); gl.viewport(0, 0, dst.w, dst.h);
      gl.bindTexture(gl.TEXTURE_2D, src.tex);
      post.up.use().i1('uTex', 0).f2('uTexel', 1 / src.w, 1 / src.h).f2('uDstTexel', 1 / dst.w, 1 / dst.h);
      util.drawQuad();
    }
    gl.disable(gl.BLEND);
    // composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, main.w, main.h);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bloom[0].tex);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, main.tex);
    post.final.use().i1('uTex', 0).i1('uBloom', 1).f2('uRes', main.w, main.h).f1('uTime', time)
      .f1('uBloomAmt', D.look.bloom).f1('uGrain', D.look.grain).f1('uVig', D.look.vignette).f1('uVeil', D.look.veil);
    util.drawQuad();
    gl.bindTexture(gl.TEXTURE_2D, null);
  }

  /* Global look, tweakable at runtime (ui.js animates veil for the opening). */
  D.look = { bloom: 0.3, grain: 0.05, vignette: 0.55, veil: 0 };

  /* ------------------------------------------------------------------ state */
  const pointer = { x: 0, y: 0, tx: 0, ty: 0, active: false };
  const S = (D.state = {
    time: 0, dt: 0.016, scrollY: 0, vh: 1, scrollVel: 0,
    chapter: 0, chapterProgress: 0, globalProgress: 0,
    active: [], quality: 1, fps: 60, seeds: ['a staircase', 'your childhood kitchen', 'an unanswered message'],
    reduced: false, frames: 0,
  });
  D.seeds = S.seeds;
  const frameCbs = [];
  D.onFrame = (fn) => frameCbs.push(fn);

  let canvas = null;
  let chapters = [];
  let mode = 'page';
  let dev = null;
  const sceneState = {}; // id -> state object handed to scene.render
  const quality = { fixed: 0, byKey: {}, key: '', acc: 0, n: 0, lastUp: -1e9 };

  function stateFor(id) {
    return sceneState[id] || (sceneState[id] = {
      time: 0, dt: 0.016, progress: 0, fade: 0, width: 1, height: 1, aspect: 1,
      pointer: { x: 0, y: 0 }, scroll: 0, seeds: S.seeds, reduced: false, quality: 1, gl: null,
    });
  }

  function initScene(id) {
    const sc = D.scenes[id];
    if (!sc || sc._init) return sc;
    sc._init = true;
    try { if (sc.init) sc.init({ gl, canvas, util, glsl: D.glsl }); sc._ok = true; }
    catch (e) { sc._ok = false; report('scene "' + id + '" init threw: ' + (e && e.stack || e)); }
    return sc;
  }

  /* Built-in fallback so a missing/broken scene never leaves a black hole. */
  function registerFallback() {
    let prog;
    D.registerScene({
      id: '_fallback',
      init() {
        prog = util.fullscreen(D.glsl.head + D.glsl.noise + `
void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  float n = fbm(uv * 1.5 + vec2(uTime * .02, uProgress * 2.));
  vec3 c = mix(vec3(.01, .012, .04), vec3(.10, .07, .22), n * n * 1.6);
  c += vec3(.25, .2, .5) * pow(fbm(uv * 3. - uTime * .015), 4.) * .8;
  fragColor = vec4(c * uFade, 1.);
}`, '_fallback');
      },
      render(s) { prog.use().common(s); util.drawQuad(); },
    });
  }

  /* ------------------------------------------------------------------ timeline */
  function measure() {
    S.vh = window.innerHeight;
    chapters = Array.prototype.map.call(document.querySelectorAll('[data-scene]'), (el) => {
      const r = (el.dataset.range || '0,1').split(',').map(Number);
      const rect = el.getBoundingClientRect();
      return { el, id: el.id, scene: el.dataset.scene, r0: r[0], r1: r[1], top: rect.top + window.scrollY, height: rect.height };
    });
    D.chapters = chapters;
  }

  function computeActive() {
    const act = {};
    if (mode === 'dev') {
      act[dev.scene] = { progress: dev.p, fade: dev.fade };
      return act;
    }
    const c = S.scrollY + S.vh * 0.5;
    const w = S.vh * 0.4;
    let best = 0, bestF = -1;
    for (let i = 0; i < chapters.length; i++) {
      const ch = chapters[i];
      const x = c - ch.top;
      let f = 1;
      if (i > 0) f *= util.smoothstep(-w, w, x);
      if (i < chapters.length - 1) f *= 1 - util.smoothstep(ch.height - w, ch.height + w, x);
      if (f > bestF) { bestF = f; best = i; }
      const lp = util.clamp(x / ch.height, 0, 1);
      ch.f = f; ch.lp = lp; ch.x = x;   // exposed for the UI layer
      if (f <= 0.0005) continue;
      const p = ch.r0 + (ch.r1 - ch.r0) * lp;
      const id = D.scenes[ch.scene] && D.scenes[ch.scene]._ok !== false ? ch.scene : '_fallback';
      const a = act[id] || (act[id] = { progress: 0, fade: 0, _w: 0 });
      a.progress += p * f; a._w += f; a.fade += f;
    }
    for (const id in act) { const a = act[id]; a.progress /= a._w; a.fade = Math.min(1, a.fade); }
    const ch = chapters[best];
    if (ch) {
      S.chapter = best;
      S.chapterProgress = util.clamp((c - ch.top) / ch.height, 0, 1);
    }
    const docH = Math.max(1, document.documentElement.scrollHeight - S.vh);
    S.globalProgress = util.clamp(S.scrollY / docH, 0, 1);
    return act;
  }

  /* ------------------------------------------------------------------ sizing + adaptive quality */
  function targetSize(q) {
    const cssW = window.innerWidth, cssH = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    const budget = 2.3e6; // max pixels at q = 1
    if (cssW * cssH * dpr * dpr > budget) dpr = Math.sqrt(budget / (cssW * cssH));
    return [Math.max(16, Math.round(cssW * dpr * q)), Math.max(16, Math.round(cssH * dpr * q))];
  }
  function applySize(q) {
    const [w, h] = targetSize(q);
    if (w === main.w && h === main.h) return;
    canvas.width = w; canvas.height = h;
    allocTargets(w, h);
    for (const id in D.scenes) { const sc = D.scenes[id]; if (sc._init && sc._ok && sc.resize) { try { sc.resize(w, h); } catch (e) { report('resize ' + id + ': ' + e); } } }
  }
  function qualityFor(key) {
    if (quality.fixed) return quality.fixed;
    return (quality.byKey[key] || (quality.byKey[key] = { q: 1, max: 1 })).q;
  }
  function adapt(key, dtMs, now) {
    if (quality.fixed) return;
    if (key !== quality.key) { quality.key = key; quality.acc = 0; quality.n = 0; return; }
    if (dtMs > 250) return; // tab switch / hitch, ignore
    quality.acc += dtMs; quality.n++;
    const e = quality.byKey[key];
    if (quality.n >= 24) {
      const avg = quality.acc / quality.n; quality.acc = 0; quality.n = 0;
      S.fps = 1000 / avg;
      if (avg > 25 && e.q > 0.34) {
        if (now - quality.lastUp < 4000) e.max = e.q * 0.9; // the last step up was a mistake; remember the ceiling
        e.q = Math.max(0.33, e.q * (avg > 40 ? 0.7 : 0.85));
      } else if (avg < 18.5 && e.q < e.max - 0.01) {
        quality.up = (quality.up || 0) + 1;
        if (quality.up >= 4) { quality.up = 0; e.q = Math.min(e.max, e.q * 1.12); quality.lastUp = now; }
      } else quality.up = 0;
    }
  }

  /* ------------------------------------------------------------------ frame */
  let last = 0, lastScroll = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const rawDt = Math.min(0.1, Math.max(0.001, (now - last) / 1000));
    const dtMs = now - last; last = now;
    const dt = rawDt * (S.reduced ? 0.35 : 1);
    if (mode === 'dev' && dev.t !== null) S.time = dev.t; else S.time += dt;
    S.dt = dt;

    S.scrollY = window.scrollY;
    const v = (S.scrollY - lastScroll) / Math.max(1, S.vh) / rawDt; lastScroll = S.scrollY;
    S.scrollVel += (util.clamp(v, -3, 3) - S.scrollVel) * (1 - Math.exp(-rawDt * 6));
    const k = 1 - Math.exp(-rawDt * 3.5);
    pointer.x += (pointer.tx - pointer.x) * k; pointer.y += (pointer.ty - pointer.y) * k;

    const act = computeActive();
    const ids = Object.keys(act).sort();
    const key = ids.join('+');
    let q = 1;
    for (const id of ids) q = Math.min(q, qualityFor(id));
    if (ids.length > 1) { for (const id of ids) quality.byKey[id] && (q = Math.min(q, quality.byKey[id].q)); }
    S.quality = q;
    applySize(q);

    gl.bindFramebuffer(gl.FRAMEBUFFER, main.fbo);
    gl.viewport(0, 0, main.w, main.h);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    S.active = ids;
    for (const id of ids) {
      const sc = initScene(id);
      if (!sc || !sc._ok) continue;
      const a = act[id];
      const st = stateFor(id);
      st.time = S.time; st.dt = dt; st.progress = a.progress; st.fade = a.fade;
      st.width = main.w; st.height = main.h; st.aspect = main.w / main.h;
      st.pointer.x = pointer.x; st.pointer.y = pointer.y; st.scroll = S.scrollVel;
      st.seeds = S.seeds; st.reduced = S.reduced; st.quality = q; st.gl = gl;
      util.bindMain(); util.resetState();
      try { sc.render(st); }
      catch (e) { sc._ok = false; report('scene "' + id + '" render threw: ' + (e && e.stack || e)); }
    }
    util.resetState();
    runPost(S.time);

    if (ids.length === 1) adapt(ids[0], dtMs, now);
    for (const fn of frameCbs) { try { fn(S, act); } catch (e) { report('onFrame: ' + (e && e.stack || e)); } }
    if (D.audio && D.audio.update) { try { D.audio.update(S, act); } catch (e) { report('audio.update: ' + (e && e.stack || e)); } }
    S.frames++;
    window.__frames = S.frames;
  }

  /* ------------------------------------------------------------------ boot */
  /* opts: { mode: 'page' | 'dev', scene, p, t, fade, q } */
  D.boot = function (opts) {
    opts = opts || {};
    mode = opts.mode || 'page';
    canvas = document.getElementById('dream-canvas');
    try {
      gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    } catch (e) { gl = null; }
    if (!gl) { document.documentElement.classList.add('no-gl'); return false; }
    D.gl = gl;
    floatTargets = !!gl.getExtension('EXT_color_buffer_float') || !!gl.getExtension('EXT_color_buffer_half_float');
    emptyVAO = gl.createVertexArray();
    buildPost();
    registerFallback();
    initScene('_fallback');

    const params = new URLSearchParams(location.search);
    if (params.get('q')) quality.fixed = util.clamp(parseFloat(params.get('q')) || 1, 0.1, 1);
    if (opts.q) quality.fixed = opts.q;
    S.reduced = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    if (mode === 'dev') {
      dev = { scene: opts.scene, p: opts.p || 0, fade: opts.fade == null ? 1 : opts.fade, t: opts.t == null ? null : opts.t };
      D.dev = dev;
      if (!D.scenes[dev.scene]) { report('unknown scene "' + dev.scene + '" — registered: ' + Object.keys(D.scenes).join(', ')); dev.scene = '_fallback'; }
    } else {
      measure();
      window.addEventListener('resize', measure);
      if (window.ResizeObserver) new ResizeObserver(measure).observe(document.body);
      if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    }

    const setPointer = (cx, cy) => {
      pointer.tx = (cx / window.innerWidth) * 2 - 1;
      pointer.ty = -((cy / window.innerHeight) * 2 - 1);
      pointer.active = true;
    };
    window.addEventListener('pointermove', (e) => setPointer(e.clientX, e.clientY), { passive: true });
    window.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) setPointer(t.clientX, t.clientY); }, { passive: true });

    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); report('WebGL context lost'); });

    // Warm every scene up front (one per tick) so shader compilation never hitches mid-scroll.
    const ids = Object.keys(D.scenes);
    let i = 0;
    D.ready = new Promise((resolve) => {
      (function warm() {
        if (i < ids.length) { initScene(ids[i++]); setTimeout(warm, 0); }
        else resolve();
      })();
    });
    last = performance.now();
    requestAnimationFrame(frame);
    return true;
  };
})();
