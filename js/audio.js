/* DREAM audio: a generative ambient score for one night of sleep. Pure Web Audio synthesis.
   One "mood" layer per scene (gain follows that scene's fade, parameters follow its progress), all in D,
   sharing a master bus -> saturation -> procedural convolution reverb -> compressor -> soft clip -> analyser.
   Public API: DREAM.audio = { start, setMuted, muted, started, update, ping, level }. */
(function () {
  'use strict';
  var D = (window.DREAM = window.DREAM || {});
  var AC = window.AudioContext || window.webkitAudioContext;
  var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  var PI = Math.PI, TAU = PI * 2, EMPTY = {};
  var LOOK = 0.35; // scheduler horizon (s)

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function ss(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function xlerp(a, b, t) { return a * Math.pow(b / a, t); }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  function drift(t, s) { return 0.5 + 0.3 * Math.sin(t * 0.131 + s) + 0.2 * Math.sin(t * 0.0717 + s * 2.7 + 1.3); }
  function chain() { for (var i = 0; i < arguments.length - 1; i++) arguments[i].connect(arguments[i + 1]); return arguments[arguments.length - 1]; }

  /* ---- harmony (MIDI notes; D2 = 38) ---- */
  var CH_W = [ // dreamscape, D lydian: {bass, six pad notes, possible next chords}
    { b: 38, n: [50, 57, 64, 66, 69, 73], nx: [1, 1, 5] },   // Dmaj9
    { b: 38, n: [50, 59, 64, 68, 71, 76], nx: [0, 5, 2] },   // E/D
    { b: 35, n: [54, 57, 62, 64, 69, 73], nx: [3, 4] },      // Bm11
    { b: 42, n: [54, 57, 61, 64, 71, 76], nx: [4, 1] },      // F#m11
    { b: 33, n: [52, 57, 61, 66, 71, 76], nx: [0, 5] },      // A6/9
    { b: 38, n: [50, 57, 66, 68, 73, 76], nx: [2, 0, 1] },   // Dmaj7#11
  ];
  var CH_N = [ // nightmare: minor seconds and tritones
    { b: 38, n: [50, 56, 57, 63, 64, 70], nx: [1, 2] },
    { b: 37, n: [49, 56, 58, 63, 65, 71], nx: [0, 2] },
    { b: 39, n: [51, 56, 57, 62, 66, 70], nx: [0, 1] },
  ];
  var CH_D = [ // dawn, D major over a D pedal
    { b: 38, n: [50, 57, 62, 66, 69, 74], nx: [1, 2, 3, 4] }, // D
    { b: 38, n: [50, 57, 64, 66, 69, 76], nx: [0, 2] },       // Dadd9
    { b: 38, n: [50, 59, 62, 67, 71, 74], nx: [0, 0, 1] },    // G/D
    { b: 38, n: [50, 57, 61, 64, 69, 73], nx: [0, 4] },       // A/D
    { b: 38, n: [50, 57, 62, 66, 71, 74], nx: [0, 2] },       // D6
  ];
  var SC_LYD = [62, 64, 66, 69, 71, 73, 74, 76, 78, 80, 81, 83, 85, 86, 88, 90];
  var SC_NIGHT = [62, 63, 65, 68, 69, 70, 74, 75];
  var SC_DOR = [62, 64, 65, 67, 69, 72, 74, 76, 77, 79, 81, 84, 86, 88, 89, 91];
  var SC_RIP = [86, 89, 91, 93, 96, 98, 101, 103];          // D minor pentatonic, high
  var SC_OCT = [86, 88, 91, 93, 96, 98, 100, 103];
  var SC_EVAP = [86, 88, 90, 92, 93, 95, 97];
  var SC_DAWN = [69, 74, 76, 78, 81, 83, 86];
  var SC_SEED = [74, 76, 78, 81, 83, 86, 88, 90];
  var TH_NOTES = [50, 57, 64, 66, 73, 80, 83];               // D A E F# C# G# B: the lydian stack of fifths
  var TH_PAN = [0, 0.3, -0.35, 0.2, -0.25, 0.5, -0.5];
  var TH_LV = [0.2, 0.17, 0.15, 0.14, 0.12, 0.085, 0.075];
  var WHALE = [[57, 62], [62, 60], [53, 57], [64, 62], [60, 57], [57, 64]];

  /* ================================================================== engine (works on any BaseAudioContext) */
  function createEngine(ctx) {
    var sr = ctx.sampleRate;
    var T = 0, snap = false, lastT = -1, stamp = 0, lvl = 0, seedIdx = 3, lastSeed = -1;
    var stats = { src: 0, nodes: 0, shots: 0, peakSrc: 0, dropped: 0 };
    var errors = [];
    var hasPan = typeof ctx.createStereoPanner === 'function';

    /* ---- buffers ---- */
    function makeNoise(seconds, pink) {
      var n = Math.floor(seconds * sr), xf = Math.floor(0.25 * sr), buf = ctx.createBuffer(2, n, sr);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch), tmp = new Float32Array(n + xf);
        var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, i, w;
        for (i = 0; i < n + xf; i++) {
          w = Math.random() * 2 - 1;
          if (pink) {
            b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
            b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
            tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
          } else tmp[i] = w;
        }
        for (i = 0; i < n; i++) d[i] = tmp[i];
        for (i = 0; i < xf; i++) { var k = i / xf; d[i] = tmp[i] * Math.sqrt(k) + tmp[n + i] * Math.sqrt(1 - k); } // seamless loop
      }
      return buf;
    }
    function makeIR(seconds) {
      var n = Math.floor(seconds * sr), buf = ctx.createBuffer(2, n, sr), pre = Math.floor(0.018 * sr), t60 = seconds * 0.82;
      var hpA = 1 - Math.exp(-TAU * 110 / sr);
      for (var ch = 0; ch < 2; ch++) {
        var d = buf.getChannelData(ch), lp = 0, hp = 0, a = 1, norm = 1, env = 1;
        for (var i = pre; i < n; i++) {
          if (((i - pre) & 63) === 0) {
            var t = (i - pre) / sr, fc = 10000 * Math.pow(0.07, t / seconds);
            a = 1 - Math.exp(-TAU * fc / sr); norm = 1 / Math.sqrt(a / (2 - a));
            env = Math.exp(-t * 6.908 / t60) * (1 - Math.exp(-t / 0.02));
          }
          lp += a * ((Math.random() * 2 - 1) - lp);
          var v = lp * norm; hp += hpA * (v - hp);
          d[i] = (v - hp) * env;
        }
      }
      return buf;
    }
    function makeWave(pow, nh) {
      var re = new Float32Array(nh + 1), im = new Float32Array(nh + 1);
      for (var i = 1; i <= nh; i++) im[i] = 1 / Math.pow(i, pow);
      return ctx.createPeriodicWave(re, im);
    }
    function makeCurve(fn, n) { var c = new Float32Array(n); for (var i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; }

    var whiteBuf = makeNoise(4, false), pinkBuf = makeNoise(6, true);
    var warm = makeWave(1.6, 20), soft = makeWave(2.3, 10);
    var HANN = new Float32Array(65);
    for (var hi = 0; hi < 65; hi++) { var hs = Math.sin(PI * hi / 64); HANN[hi] = hs * hs; }

    /* ---- master graph ---- */
    var mix = ctx.createGain(), revIn = ctx.createGain(), sum = ctx.createGain();
    var sat = ctx.createWaveShaper(); sat.curve = makeCurve(function (x) { return Math.tanh(1.4 * x) / 1.4; }, 2049);
    try { sat.oversample = '2x'; } catch (e) {}
    var conv = ctx.createConvolver(); conv.buffer = makeIR(6.2);
    var revHP = ctx.createBiquadFilter(); revHP.type = 'highpass'; revHP.frequency.value = 150; revHP.Q.value = 0.5;
    var revLP = ctx.createBiquadFilter(); revLP.type = 'lowpass'; revLP.frequency.value = 6500; revLP.Q.value = 0.5;
    var revOut = ctx.createGain(); revOut.gain.value = 1.0;
    var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 24; hp.Q.value = 0.6;
    var shelf = ctx.createBiquadFilter(); shelf.type = 'highshelf'; shelf.frequency.value = 7500; shelf.gain.value = -3;
    var comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20; comp.knee.value = 14; comp.ratio.value = 2.5; comp.attack.value = 0.05; comp.release.value = 0.6;
    var trim = ctx.createGain(); trim.gain.value = 0.5;   // master trim, before the soft clipper (which expects x/2)
    var clip = ctx.createWaveShaper(); // identity below 0.6, smooth ceiling at ~0.95
    clip.curve = makeCurve(function (x) { var v = Math.abs(x) * 2; if (v > 0.6) v = 0.6 + 0.35 * Math.tanh((v - 0.6) / 0.35); return x < 0 ? -v : v; }, 4097);
    var master = ctx.createGain(); master.gain.value = 0;
    var vis = ctx.createGain(); vis.gain.value = 1;
    var analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.6;
    var adata = new Float32Array(1024), bdata = null;
    chain(mix, sat, sum);
    chain(revIn, conv, revHP, revLP, revOut, sum);
    chain(sum, hp, shelf, comp, trim, clip, master, vis, analyser, ctx.destination);
    var ui = ctx.createGain(), uiSend = ctx.createGain(); uiSend.gain.value = 0.6;
    ui.connect(mix); chain(ui, uiSend, revIn);

    /* ---- bookkeeping helpers ---- */
    function Ctl(param, v) { this.p = param; this.v = v; param.value = v; }
    Ctl.prototype.set = function (v, tau) {
      if (!(v === v) || v === Infinity || v === -Infinity) return;
      if (!snap) { var d = v - this.v; if (d < 0) d = -d; if (d <= 1e-6 + 2e-4 * (v < 0 ? -v : v)) return; }
      this.v = v;
      if (snap) this.p.setValueAtTime(v, T); else this.p.setTargetAtTime(v, T, tau || 0.15);
    };

    function Group() { this.n = []; this.s = []; }
    Group.prototype = {
      add: function (node) { this.n.push(node); stats.nodes++; return node; },
      src: function (node) { this.s.push(node); stats.src++; if (stats.src > stats.peakSrc) stats.peakSrc = stats.src; return this.add(node); },
      osc: function (type, f, det) {
        var o = ctx.createOscillator();
        if (typeof type === 'string') o.type = type; else o.setPeriodicWave(type);
        o.frequency.value = f; if (det) o.detune.value = det; o.start();
        return this.src(o);
      },
      noise: function (buf, rate) {
        var s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate || 1;
        s.start(0, Math.random() * (buf.duration - 0.1));
        return this.src(s);
      },
      gain: function (v) { var g = ctx.createGain(); g.gain.value = v; return this.add(g); },
      filter: function (type, f, q) { var b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q == null ? 0.7 : q; return this.add(b); },
      pan: function (v) { if (!hasPan) return this.gain(1); var p = ctx.createStereoPanner(); p.pan.value = v; return this.add(p); },
      delay: function (max, t) { var d = ctx.createDelay(max); d.delayTime.value = t; return this.add(d); },
      free: function () {
        var i;
        for (i = 0; i < this.s.length; i++) { try { this.s[i].stop(); } catch (e) {} }
        for (i = 0; i < this.n.length; i++) { try { this.n[i].disconnect(); } catch (e) {} }
        stats.src -= this.s.length; stats.nodes -= this.n.length; this.n = []; this.s = [];
      },
    };

    /* a sub-graph that only exists while it is wanted */
    function Lazy(fn) { this.fn = fn; this.g = null; this.x = null; this.idle = 0; }
    Lazy.prototype.want = function (on, dt) { // 0 = absent, 1 = alive, 2 = just built
      if (on) { this.idle = 0; if (!this.g) { this.g = new Group(); this.x = {}; this.fn(this.g, this.x); return 2; } return 1; }
      if (!this.g) return 0;
      this.idle += dt; if (this.idle > 2.5) { this.free(); return 0; }
      return 1;
    };
    Lazy.prototype.free = function () { if (this.g) { this.g.free(); this.g = null; this.x = null; } };

    /* endless Shepard-Risset glissando: n octave-spaced sines under a fixed spectral window */
    function Shepard(dst, n, fLo, octs, lv) { this.dst = dst; this.n = n; this.fLo = fLo; this.octs = octs; this.lv = lv || 1; this.ph = Math.random(); this.g = null; this.idle = 0; }
    Shepard.prototype.run = function (gain, rate, dt) {
      var i, fresh = false;
      if (gain > 0.0015) {
        this.idle = 0;
        if (!this.g) {
          var g = this.g = new Group(); this.o = []; this.a = []; this.prev = [];
          var out = g.gain(0); out.connect(this.dst); this.out = new Ctl(out.gain, 0);
          for (i = 0; i < this.n; i++) { var a = g.gain(0); chain(g.osc('sine', 100), a, out); this.o.push(a ? g.s[g.s.length - 1] : null); this.a.push(a); this.prev.push(0); }
          fresh = true;
        }
      } else {
        if (!this.g) return;
        this.idle += dt; if (this.idle > 2.5) { this.free(); return; }
      }
      this.ph += rate * dt / this.octs; this.ph -= Math.floor(this.ph);
      this.out.set(gain * this.lv, 0.25);
      for (i = 0; i < this.n; i++) {
        var ph = this.ph + i / this.n; ph -= Math.floor(ph);
        var f = this.fLo * Math.pow(2, this.octs * ph), w = Math.sin(PI * ph); w *= w;
        var fp = this.o[i].frequency;
        if (fresh || Math.abs(ph - this.prev[i]) > 0.5) { fp.cancelScheduledValues(T); fp.setValueAtTime(f, T); }
        else fp.setTargetAtTime(f, T, 0.07);
        this.a[i].gain.setTargetAtTime(w * 2 / this.n, T, fresh ? 0.01 : 0.07);
        this.prev[i] = ph;
      }
    };
    Shepard.prototype.free = function () { if (this.g) { this.g.free(); this.g = null; } };

    /* sustained chord of detuned pairs split left/right; chord changes dip, retune and return voice by voice */
    function Pad(g, dst, notes, o) {
      var w = o.width == null ? 0.8 : o.width, bl = g.gain(1), br = g.gain(1), mer = g.add(ctx.createChannelMerger(2));
      chain(bl, g.gain(0.5 + 0.5 * w), mer); bl.connect(mer, 0, 0);
      var a = g.gain(0.5 + 0.5 * w), b = g.gain(0.5 - 0.5 * w), c = g.gain(0.5 - 0.5 * w), d = g.gain(0.5 + 0.5 * w);
      bl.disconnect(); bl.connect(a); bl.connect(c); br.connect(b); br.connect(d);
      a.connect(mer, 0, 0); b.connect(mer, 0, 0); c.connect(mer, 0, 1); d.connect(mer, 0, 1);
      mer.connect(dst);
      this.v = []; this.det = o.det || 6;
      for (var i = 0; i < notes.length; i++) {
        var f = mtof(notes[i]), lv = o.lv[i], s = i % 2 ? -1 : 1;
        var oA = g.osc(o.wave || warm, f, -this.det * s), oB = g.osc(o.wave || warm, f, this.det * s);
        var gA = g.gain(lv), gB = g.gain(lv);
        chain(oA, gA, bl); chain(oB, gB, br);
        this.v.push({ n: notes[i], lv: lv, oA: oA, oB: oB, gA: gA, gB: gB, s: s, r1: rnd(-1, 1), r2: rnd(-1, 1),
          dA: new Ctl(oA.detune, -this.det * s), dB: new Ctl(oB.detune, this.det * s) });
      }
    }
    Pad.prototype.setChord = function (notes, t, stagger) {
      for (var i = 0; i < this.v.length; i++) {
        var v = this.v[i]; if (v.n === notes[i]) continue;
        v.n = notes[i];
        var f = mtof(v.n), t0 = t + (stagger ? rnd(0, stagger) : 0);
        v.gA.gain.cancelScheduledValues(t0); v.gB.gain.cancelScheduledValues(t0);
        v.oA.frequency.cancelScheduledValues(t0); v.oB.frequency.cancelScheduledValues(t0);
        v.gA.gain.setTargetAtTime(0, t0, 0.4); v.gB.gain.setTargetAtTime(0, t0, 0.4);
        v.oA.frequency.setTargetAtTime(f, t0 + 1.6, 0.03); v.oB.frequency.setTargetAtTime(f, t0 + 1.6, 0.03);
        v.gA.gain.setTargetAtTime(v.lv, t0 + 1.75, 1.0); v.gB.gain.setTargetAtTime(v.lv, t0 + 1.75, 1.0);
      }
    };
    Pad.prototype.setNow = function (notes) {
      for (var i = 0; i < this.v.length; i++) {
        var v = this.v[i]; v.n = notes[i];
        v.oA.frequency.setValueAtTime(mtof(v.n), T); v.oB.frequency.setValueAtTime(mtof(v.n), T);
      }
    };
    Pad.prototype.detune = function (sour) { // sour: extra cents of drift per oscillator (0 = in tune)
      for (var i = 0; i < this.v.length; i++) {
        var v = this.v[i];
        v.dA.set(-this.det * v.s + sour * v.r1, 0.8); v.dB.set(this.det * v.s + sour * v.r2, 0.8);
      }
    };

    /* ---- one-shot voices (every node is released in onended) ---- */
    function track(nodes, nsrc, key, fn) {
      stats.src += nsrc; stats.nodes += nodes.length; stats.shots++;
      if (stats.src > stats.peakSrc) stats.peakSrc = stats.src;
      key.onended = function () {
        stats.src -= nsrc; stats.nodes -= nodes.length;
        for (var i = 0; i < nodes.length; i++) { try { nodes[i].disconnect(); } catch (e) {} }
        if (fn) { try { fn(); } catch (e) {} }
      };
    }
    function room() { if (stats.src > 96) { stats.dropped++; return false; } return true; }
    function out(node, dst, pan, nodes) {
      if (hasPan && pan) { var p = ctx.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); node.connect(p); nodes.push(p); node = p; }
      node.connect(dst);
    }

    /* FM bell / kalimba: o = { decay, attack, ratio, index, pan, bend (cents over the tail) } */
    function bell(dst, t, f, vel, o) {
      if (!room()) return;
      o = o || EMPTY;
      var dec = o.decay || 4, atk = o.attack || 0.006, ratio = o.ratio || 2, idx = o.index == null ? 1 : o.index;
      vel *= Math.min(1, Math.sqrt(700 / f));
      var c = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), a = ctx.createGain(), nodes = [c, m, mg, a];
      c.frequency.value = f; m.frequency.value = f * ratio;
      mg.gain.value = idx * f; mg.gain.setValueAtTime(idx * f, t); mg.gain.setTargetAtTime(idx * f * 0.06, t, dec * 0.1);
      chain(m, mg, c.frequency);
      a.gain.value = 0; a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel, t + atk); a.gain.setTargetAtTime(0, t + atk, dec / 5);
      c.connect(a);
      if (o.bend) { c.detune.setValueAtTime(0, t + 0.05); c.detune.linearRampToValueAtTime(o.bend, t + dec); m.detune.setValueAtTime(0, t + 0.05); m.detune.linearRampToValueAtTime(o.bend, t + dec); }
      out(a, dst, o.pan, nodes);
      var end = t + atk + dec * 1.45;
      c.start(t); m.start(t); c.stop(end); m.stop(end);
      track(nodes, 2, c);
    }
    /* glassy beating pair with an inharmonic FM glint; wob = shared LFO (cents) wired to detune */
    function glass(dst, t, f, vel, o) {
      if (!room()) return;
      var dec = o.decay || 3.2, atk = o.attack || 0.05;
      vel *= Math.min(1, Math.sqrt(700 / f));
      var c1 = ctx.createOscillator(), c2 = ctx.createOscillator(), m = ctx.createOscillator(), mg = ctx.createGain(), a = ctx.createGain(), nodes = [c1, c2, m, mg, a];
      c1.frequency.value = f; c2.frequency.value = f * (1 + rnd(0.002, 0.006)); m.frequency.value = f * 2.76;
      mg.gain.value = f * 0.7; mg.gain.setValueAtTime(f * 0.7, t); mg.gain.setTargetAtTime(0, t, dec * 0.12);
      chain(m, mg, c1.frequency);
      a.gain.value = 0; a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel * 0.5, t + atk); a.gain.setTargetAtTime(0, t + atk, dec / 5);
      c1.connect(a); c2.connect(a);
      var wob = o.wob; if (wob) { wob.connect(c1.detune); wob.connect(c2.detune); }
      out(a, dst, o.pan, nodes);
      var end = t + atk + dec * 1.45;
      c1.start(t); c2.start(t); m.start(t); c1.stop(end); c2.stop(end); m.stop(end);
      track(nodes, 3, c1, wob ? function () { wob.disconnect(c1.detune); wob.disconnect(c2.detune); } : null);
    }
    /* plain enveloped tone: o = { wave, atk, hold, rel (tau), f2, glideT, pan } */
    function tone(dst, t, f, vel, o) {
      if (!room()) return;
      var atk = o.atk || 0.05, hold = o.hold || 0, rel = o.rel || 0.5;
      var c = ctx.createOscillator(), a = ctx.createGain(), nodes = [c, a];
      if (o.wave) c.setPeriodicWave(o.wave);
      c.frequency.value = f; c.frequency.setValueAtTime(f, t);
      if (o.f2) c.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glideT || atk + hold + rel * 3));
      a.gain.value = 0; a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel, t + atk);
      a.gain.setTargetAtTime(0, t + atk + hold, rel);
      c.connect(a); out(a, dst, o.pan, nodes);
      c.start(t); c.stop(t + atk + hold + rel * 7);
      track(nodes, 1, c);
    }
    /* tiny pitched tick; f2 gives a sweep (bubbles) */
    function blip(dst, t, f, vel, dec, pan, f2) {
      if (!room()) return;
      var c = ctx.createOscillator(), a = ctx.createGain(), nodes = [c, a];
      c.frequency.value = f;
      if (f2) { c.frequency.setValueAtTime(f, t); c.frequency.exponentialRampToValueAtTime(f2, t + dec); }
      a.gain.value = 0; a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel, t + 0.004); a.gain.setTargetAtTime(0, t + 0.004, dec / 4);
      c.connect(a); out(a, dst, pan, nodes);
      c.start(t); c.stop(t + dec * 2 + 0.03);
      track(nodes, 1, c);
    }
    function thump(dst, t, f0, f1, vel, dec, pan) {
      if (!room()) return;
      var c = ctx.createOscillator(), a = ctx.createGain(), nodes = [c, a];
      c.type = 'triangle'; c.frequency.value = f0; c.frequency.setValueAtTime(f0, t); c.frequency.exponentialRampToValueAtTime(f1, t + 0.09);
      a.gain.value = 0; a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel, t + 0.007); a.gain.setTargetAtTime(0, t + 0.007, dec);
      c.connect(a); out(a, dst, pan, nodes);
      c.start(t); c.stop(t + dec * 7 + 0.03);
      track(nodes, 1, c);
    }
    function heart(dst, t, vel, gap) { thump(dst, t, 72, 44, vel, 0.05, 0); thump(dst, t + gap, 84, 50, vel * 0.65, 0.04, 0); }
    /* sleep spindle: a tone amplitude-modulated at sigma rate, waxing and waning */
    function spindle(dst, t, f, vel, dur, rate, pan) {
      if (!room()) return;
      var c = ctx.createOscillator(), l = ctx.createOscillator(), lg = ctx.createGain(), tr = ctx.createGain(), env = ctx.createGain(), vg = ctx.createGain();
      var nodes = [c, l, lg, tr, env, vg];
      c.setPeriodicWave(soft); c.frequency.value = f; l.frequency.value = rate;
      lg.gain.value = 0.5; tr.gain.value = 0.5; chain(l, lg, tr.gain);
      env.gain.value = 0; env.gain.setValueCurveAtTime(HANN, t, dur);
      vg.gain.value = vel; chain(c, tr, env, vg); out(vg, dst, pan, nodes);
      c.start(t); l.start(t); c.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
      track(nodes, 2, c);
    }
    function whale(dst, t, m1, m2, vel, dur, pan) {
      if (!room()) return;
      var c = ctx.createOscillator(), h = ctx.createOscillator(), hg = ctx.createGain(), a = ctx.createGain(), nodes = [c, h, hg, a];
      var f1 = mtof(m1), f2 = mtof(m2);
      c.frequency.value = f1; h.frequency.value = f1 * 2; hg.gain.value = 0.22;
      c.frequency.setValueAtTime(f1, t + dur * 0.2); c.frequency.exponentialRampToValueAtTime(f2, t + dur * 0.75);
      h.frequency.setValueAtTime(f1 * 2, t + dur * 0.2); h.frequency.exponentialRampToValueAtTime(f2 * 2, t + dur * 0.75);
      a.gain.value = 0; a.gain.setValueAtTime(0, t); a.gain.linearRampToValueAtTime(vel, t + dur * 0.35); a.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.16);
      c.connect(a); chain(h, hg, a); out(a, dst, pan, nodes);
      var end = t + dur * 1.8; c.start(t); h.start(t); c.stop(end); h.stop(end);
      track(nodes, 2, c);
    }
    /* far-away birdsong: one sine, syllables written as frequency / gain automation */
    function bird(dst, t, vel, pan) {
      if (!room()) return;
      var c = ctx.createOscillator(), a = ctx.createGain(), nodes = [c, a];
      var kind = Math.random(), f0 = rnd(2500, 4600), tt = t, n, d, k, f;
      a.gain.value = 0; c.frequency.value = f0;
      function syl(ts, dd, fa, fb, av) {
        c.frequency.setValueAtTime(fa, ts); c.frequency.exponentialRampToValueAtTime(fb, ts + dd);
        a.gain.setValueAtTime(0, ts); a.gain.linearRampToValueAtTime(av, ts + Math.min(0.012, dd * 0.35)); a.gain.linearRampToValueAtTime(0, ts + dd);
      }
      if (kind < 0.4) { n = 2 + ((Math.random() * 4) | 0); d = rnd(0.05, 0.09); var gap = rnd(0.07, 0.13), up = rnd(1.15, 1.45);
        for (k = 0; k < n; k++) { syl(tt, d, f0 * (1 + 0.03 * k), f0 * up, vel * (0.6 + 0.4 * k / n)); tt += d + gap; }
      } else if (kind < 0.75) { n = 2 + ((Math.random() * 2) | 0); d = rnd(0.12, 0.2);
        for (k = 0; k < n; k++) { f = f0 * Math.pow(0.84, k); syl(tt, d, f * 1.04, f * 0.97, vel); tt += d + rnd(0.04, 0.09); }
      } else { n = 6 + ((Math.random() * 8) | 0); d = rnd(0.028, 0.04);
        for (k = 0; k < n; k++) { f = f0 * (k % 2 ? 1.14 : 1); syl(tt, d, f, f * 1.03, vel * Math.sin(PI * (k + 0.5) / n)); tt += d + 0.018; }
      }
      c.connect(a); out(a, dst, pan, nodes);
      c.start(t); c.stop(tt + 0.05);
      track(nodes, 1, c);
    }

    /* ================================================================== moods */
    var defs = {};

    /* --- neutral: quiet drone for unknown scene ids --- */
    defs._neutral = {
      trim: 0.8, send: 0.5,
      build: function (L, g, x) {
        var dG = g.gain(0.5), lp = g.filter('lowpass', 420, 0.5);
        chain(g.osc('sine', mtof(38)), g.gain(0.4), dG); chain(g.osc('sine', mtof(45), 3), g.gain(0.16), dG);
        chain(g.osc(warm, mtof(50), -5), lp); chain(g.osc(warm, mtof(57), 5), g.gain(0.5), lp); chain(lp, g.gain(0.3), dG);
        dG.connect(L.near); x.d = new Ctl(dG.gain, 0.5);
      },
      update: function (L, x, st, p, t) { x.d.set(0.4 + 0.25 * drift(t, 3), 0.8); },
      tick: function () {},
    };

    /* --- threshold: room tone, low D, breath, distant heart; the lids close --- */
    defs.threshold = {
      trim: 1.5, send: 0.35,
      build: function (L, g, x, st) {
        var lids = g.filter('lowpass', 9000, 0.6); lids.connect(L.near); x.lids = new Ctl(lids.frequency, 9000);
        var rG = g.gain(0.05); chain(g.noise(pinkBuf, 1), rG, lids); x.room = new Ctl(rG.gain, 0.05);
        x.brF = g.filter('bandpass', 700, 0.9); x.brG = g.gain(0);
        chain(g.noise(whiteBuf, 0.9), x.brF, x.brG, lids);
        var dG = g.gain(0.5), dlp = g.filter('lowpass', 300, 0.5);
        chain(g.osc('sine', mtof(38)), g.gain(0.5), dG);
        chain(g.osc(warm, mtof(38), 5), dlp); chain(g.osc(warm, mtof(50), -6), g.gain(0.55), dlp); chain(dlp, g.gain(0.4), dG);
        chain(g.osc('sine', mtof(57), 3), g.gain(0.07), dG);
        dG.connect(L.near); x.drone = new Ctl(dG.gain, 0.5);
        x.heart = g.filter('lowpass', 170, 0.7); chain(x.heart, g.gain(1), L.near);
        st.nb = T + 0.5; st.nh = T + 1.2;
      },
      update: function (L, x, st, p, t) {
        var lids = 1 - ss(0.1, 0.95, p);
        x.lids.set(xlerp(260, 9000, lids), 0.3);
        x.room.set(0.02 + 0.05 * lids, 0.4);
        x.drone.set((0.42 + 0.16 * drift(t, 1)) * (0.85 + 0.25 * p), 0.6);
      },
      tick: function (L, x, st, p, now, hz) {
        if (st.nb < now) st.nb = now + 0.02;
        while (st.nb < hz) { // one breath: a higher, softer inhale and a lower, longer exhale
          var t0 = st.nb, B = lerp(5, 7.6, p) * rnd(0.94, 1.06), A = 0.2 + 0.06 * p, k = B / 5, g = x.brG.gain, f = x.brF.frequency;
          g.setTargetAtTime(0.65 * A, t0, 0.38 * k); f.setTargetAtTime(1250, t0, 0.45 * k);
          g.setTargetAtTime(0.1 * A, t0 + 0.32 * B, 0.13 * k);
          g.setTargetAtTime(A, t0 + 0.41 * B, 0.26 * k); f.setTargetAtTime(520, t0 + 0.41 * B, 0.5 * k);
          g.setTargetAtTime(0.015 * A, t0 + 0.58 * B, 0.5 * k);
          st.nb += B;
        }
        if (st.nh < now) st.nh = now + 0.02;
        while (st.nh < hz) { heart(x.heart, st.nh, 0.3 + 0.1 * p, 0.3); st.nh += 60 / lerp(62, 54, p) * rnd(0.97, 1.03); }
      },
    };

    /* --- hypnagogia: alpha -> theta, a glass cloud, then the hypnic fall --- */
    defs.hypnagogia = {
      trim: 1.3, send: 0.55,
      build: function (L, g, x, st) {
        var dG = g.gain(0.4), dlp = g.filter('lowpass', 250, 0.5);
        chain(g.osc('sine', mtof(38)), g.gain(0.5), dG); chain(g.osc(warm, mtof(38), -4), dlp, g.gain(0.4), dG);
        chain(g.osc('sine', mtof(45), 3), g.gain(0.18), dG);
        dG.connect(L.near); x.drone = new Ctl(dG.gain, 0.4);
        var plp = g.filter('lowpass', 900, 0.6), trem = g.gain(0.85), pG = g.gain(0);
        var notes = [50, 57, 65, 76], pans = [-0.2, 0.3, -0.5, 0.5], lv = [0.2, 0.16, 0.12, 0.07];
        for (var i = 0; i < 4; i++) chain(g.osc(warm, mtof(notes[i]), rnd(-7, 7)), g.gain(lv[i]), g.pan(pans[i]), plp);
        chain(plp, trem, pG, L.near);
        var lfo = g.osc('sine', 10), lG = g.gain(0.15); chain(lfo, lG, trem.gain);
        x.lfoF = new Ctl(lfo.frequency, 10); x.lfoD = new Ctl(lG.gain, 0.15); x.tremB = new Ctl(trem.gain, 0.85);
        x.padF = new Ctl(plp.frequency, 900); x.padG = new Ctl(pG.gain, 0);
        x.w1 = g.gain(12); chain(g.osc('sine', 0.23), x.w1); x.w2 = g.gain(20); chain(g.osc('sine', 0.37), x.w2);
        var sw = g.gain(0), slp = g.filter('lowpass', 220, 0.6);
        chain(g.osc('sine', mtof(26)), g.gain(0.45), sw); chain(g.osc(warm, mtof(38), 6), slp); chain(g.osc(warm, mtof(26), -5), slp);
        chain(slp, g.gain(0.5), sw); sw.connect(L.near); x.swell = new Ctl(sw.gain, 0);
        var wf = g.filter('bandpass', 1500, 0.8), wG = g.gain(0); chain(g.noise(whiteBuf, 1), wf, wG, L.near);
        x.windF = new Ctl(wf.frequency, 1500); x.wind = new Ctl(wG.gain, 0);
        x.shep = new Shepard(L.near, 6, 30, 6, 0.5); L.subs.push(x.shep);
        st.nc = T + 0.4;
      },
      update: function (L, x, st, p, t, dt) {
        var fall = ss(0.8, 0.9, p), deep = ss(0.9, 1, p), d = lerp(0.12, 0.22, ss(0.1, 0.6, p)) * (1 - 0.6 * fall);
        x.lfoF.set(lerp(10, 5, ss(0, 0.6, p)) - deep, 0.5); x.lfoD.set(d, 0.4); x.tremB.set(1 - d, 0.4);
        x.padG.set((0.35 + 0.65 * ss(0, 0.2, p)) * (1 - 0.8 * fall), 0.4);
        x.padF.set(lerp(700, 1700, ss(0, 0.5, p)) * (1 - 0.7 * fall) * (0.85 + 0.3 * drift(t, 2)), 0.5);
        x.drone.set(0.4 + 0.35 * deep, 0.5);
        x.swell.set(0.9 * ss(0.82, 1, p), 0.5);
        x.wind.set(0.12 * fall * (1 - deep), 0.3); x.windF.set(xlerp(1900, 300, ss(0.82, 1, p)), 0.3);
        x.shep.run(ss(0.8, 0.88, p) * (1 - 0.85 * ss(0.95, 1, p)), -(0.05 + 0.11 * fall), dt);
      },
      tick: function (L, x, st, p, now, hz) {
        if (st.nc < now) st.nc = now + 0.02;
        while (st.nc < hz) {
          var base = lerp(1.7, 0.6, ss(0.05, 0.55, p)) * (1 + 3 * ss(0.74, 0.9, p));
          if (p < 0.93) {
            var hiN = 6 + ((ss(0, 0.5, p) * 10) | 0), n = SC_DOR[(Math.random() * hiN) | 0] + (Math.random() < 0.25 ? 12 : 0);
            glass(Math.random() < 0.5 ? L.near : L.far, st.nc, mtof(n), rnd(0.07, 0.12) * (1 - 0.6 * ss(0.8, 0.93, p)),
              { decay: rnd(2.6, 3.6), attack: rnd(0.02, 0.14), pan: rnd(-0.9, 0.9), wob: Math.random() < 0.5 ? x.w1 : x.w2 });
          }
          st.nc += Math.max(0.12, base * rnd(0.45, 1.6));
        }
      },
    };

    /* --- replay: slow oscillation, D-A fifth, ripples at each crest, spindles --- */
    defs.replay = {
      trim: 1.3, send: 0.4,
      build: function (L, g, x, st) {
        var sw = g.gain(0.6), sub = g.gain(0.8); x.sw = sw.gain;
        var slp = g.filter('lowpass', 200, 0.7); x.slp = slp.frequency;
        chain(g.osc('sine', mtof(26)), g.gain(0.45), sw); chain(g.osc('sine', mtof(38)), g.gain(0.5), sw);
        chain(g.osc(warm, mtof(38), 4), slp); chain(g.osc(warm, mtof(26), -3), g.gain(0.7), slp); chain(slp, g.gain(0.55), sw);
        chain(sw, sub, L.near); x.sub = new Ctl(sub.gain, 0.8);
        var plp = g.filter('lowpass', 450, 0.6), pG = g.gain(0.5), sw2 = g.gain(0.8); x.sw2 = sw2.gain;
        x.pad = new Pad(g, plp, [50, 57], { det: 6, lv: [0.2, 0.16], width: 0.9 });
        chain(g.osc('sine', mtof(45), 2), g.gain(0.12), plp); chain(g.osc('sine', mtof(62), -3), g.gain(0.05), plp);
        chain(plp, sw2, pG, L.near); x.padF = new Ctl(plp.frequency, 450); x.padG = new Ctl(pG.gain, 0.5);
        var olp = g.filter('lowpass', 380, 0.5), oG = g.gain(0.3); chain(g.noise(pinkBuf, 0.8), olp, sw2);
        chain(olp, oG, L.near); x.ocean = new Ctl(oG.gain, 0.3);
        st.nt = T + 0.3; st.ns = T + rnd(3, 6);
      },
      update: function (L, x, st, p, t) {
        x.padF.set(lerp(380, 620, drift(t, 4)), 0.8); x.padG.set(0.5 + 0.2 * drift(t, 5), 0.8);
        x.ocean.set(0.25 + 0.15 * drift(t, 6), 0.8); x.sub.set(0.75 + 0.2 * ss(0, 0.3, p), 0.5);
      },
      tick: function (L, x, st, p, now, hz) {
        if (st.nt < now) st.nt = now + 0.02;
        while (st.nt < hz) { // one slow-oscillation cycle, scheduled from its trough
          var tt = st.nt, P = rnd(1.17, 1.36), dp = lerp(0.5, 0.72, ss(0, 0.3, p)), tc = tt + 0.5 * P, k, n;
          x.sw.setTargetAtTime(1, tt, 0.17); x.sw.setTargetAtTime(1 - dp, tc + 0.06, 0.22);
          x.slp.setTargetAtTime(330, tt, 0.2); x.slp.setTargetAtTime(150, tc + 0.06, 0.25);
          x.sw2.setTargetAtTime(1, tt, 0.2); x.sw2.setTargetAtTime(1 - dp * 0.45, tc + 0.06, 0.25);
          if (p > 0.2 && Math.random() < lerp(0.45, 0.9, ss(0.2, 0.6, p))) { // hippocampal ripple: the day at 20x
            var tr = tc + rnd(-0.06, 0.1), c0 = rnd(-0.3, 0.3), idx = (Math.random() * SC_RIP.length) | 0, vel = rnd(0.05, 0.085);
            n = 6 + ((Math.random() * 6) | 0);
            for (k = 0; k < n; k++) {
              idx = clamp(idx + ((Math.random() * 5) | 0) - 2, 0, SC_RIP.length - 1);
              blip(k % 3 ? L.near : L.far, tr, mtof(SC_RIP[idx]), vel * (1 - 0.5 * k / n), rnd(0.03, 0.05), c0 + (k % 2 ? 1 : -1) * 0.9 * (k + 1) / n);
              tr += rnd(0.009, 0.017);
            }
            if (p > 0.6 && Math.random() < lerp(0.3, 0.65, ss(0.6, 1, p))) { // tagged memory: a golden overtone
              bell(L.far, tr, mtof(pick([69, 74, 78])), 0.085, { decay: 2.8, ratio: 2, index: 0.7, pan: c0 });
              bell(L.far, tr + 0.03, mtof(pick([78, 81, 86])), 0.06, { decay: 3.2, ratio: 2, index: 0.5, pan: -c0 });
            }
          }
          st.nt += P;
        }
        if (st.ns < now) st.ns = now + 0.02;
        while (st.ns < hz) {
          spindle(L.far, st.ns, mtof(pick([69, 74, 76])), rnd(0.07, 0.1), rnd(1.0, 1.5), rnd(12, 14.5), rnd(-0.6, 0.6));
          st.ns += rnd(5, 11);
        }
      },
    };

    /* --- rem: ignition, PGO bursts, theta tremolo, the logic layer drops out, noradrenaline thins, the dive --- */
    defs.rem = {
      trim: 1.2, send: 0.5,
      build: function (L, g, x, st) {
        var i, lG = g.gain(0.45), llp = g.filter('lowpass', 200, 0.6);
        chain(g.osc('sine', mtof(38)), g.gain(0.5), lG); chain(g.osc(warm, mtof(38), 3), llp); chain(g.osc(warm, mtof(45), -4), g.gain(0.4), llp);
        chain(llp, g.gain(0.45), lG); lG.connect(L.near); x.low = new Ctl(lG.gain, 0.45); x.lowF = new Ctl(llp.frequency, 200);
        var blp = g.filter('lowpass', 1300, 0.5), bG = g.gain(0), bn = [57, 62, 64], bp = [-0.25, 0, 0.25]; // the "logic" layer
        for (i = 0; i < 3; i++) chain(g.osc('triangle', mtof(bn[i]), rnd(-3, 3)), g.gain(0.13), g.pan(bp[i]), blp);
        chain(blp, bG, L.near); x.b = new Ctl(bG.gain, 0);
        var clp = g.filter('lowpass', 500, 0.7), trem = g.gain(0.95), cG = g.gain(0);
        x.cpad = new Pad(g, clp, [65, 72, 76], { det: 7, lv: [0.15, 0.12, 0.09], width: 0.9 });
        chain(clp, trem, cG, L.near);
        var lfo = g.osc('sine', 6), ld = g.gain(0.05); chain(lfo, ld, trem.gain);
        x.c = new Ctl(cG.gain, 0); x.cF = new Ctl(clp.frequency, 500); x.lfoF = new Ctl(lfo.frequency, 6); x.lfoD = new Ctl(ld.gain, 0.05); x.tremB = new Ctl(trem.gain, 0.95);
        var sG = g.gain(0), sn = [86, 93, 96, 100], sp = [-0.6, 0.5, -0.3, 0.7]; x.sh = [];
        for (i = 0; i < 4; i++) { var sg = g.gain(0.02); chain(g.osc('sine', mtof(sn[i]), rnd(-8, 8)), sg, g.pan(sp[i]), sG); x.sh.push(new Ctl(sg.gain, 0.02)); }
        sG.connect(L.far); x.shim = new Ctl(sG.gain, 0);
        var hG = g.gain(0), hbp = g.filter('bandpass', 3800, 5), hhp = g.filter('highpass', 1800, 0.7); // noradrenaline: thin and harsh
        chain(g.noise(whiteBuf, 1), hbp, g.gain(0.5), hG);
        chain(g.osc('sawtooth', mtof(97), 0), hhp); chain(g.osc('sawtooth', mtof(98), 20), hhp); chain(hhp, g.gain(0.035), hG);
        hG.connect(L.near); x.harsh = new Ctl(hG.gain, 0);
        var ibp = g.filter('bandpass', 400, 0.9), iG = g.gain(0); chain(g.noise(whiteBuf, 1.1), ibp, iG, L.near);
        x.inh = new Ctl(iG.gain, 0); x.inhF = new Ctl(ibp.frequency, 400);
        x.pgo = g.filter('lowpass', 380, 0.7); x.pgo.connect(L.near);
        x.shep = new Shepard(L.near, 6, 55, 6, 0.5); L.subs.push(x.shep);
        st.np = T + 1; st.maj = false;
      },
      update: function (L, x, st, p, t, dt) {
        var ig = ss(0.06, 0.5, p), r = ss(0.82, 0.965, p), land = ss(0.965, 1, p), i;
        var maj = st.maj ? p > 0.885 : p > 0.905; // Dm9 lifts to Dmaj9 during the inhale
        if (snap) { st.maj = maj; x.cpad.setNow(maj ? [66, 73, 76] : [65, 72, 76]); }
        else if (maj !== st.maj) { st.maj = maj; x.cpad.setChord(maj ? [66, 73, 76] : [65, 72, 76], T, 0.5); }
        x.low.set((0.42 + 0.4 * ig) * (1 - 0.2 * land), 0.4); x.lowF.set(lerp(180, 420, ig) + 500 * r * (1 - land), 0.4);
        x.b.set(0.55 * ss(0.12, 0.3, p) * (1 - ss(0.4, 0.55, p)), 0.35);
        x.c.set((0.3 * ss(0.15, 0.45, p) + 0.4 * ss(0.45, 0.8, p) + 0.3 * r) * (1 - 0.4 * land), 0.4);
        x.cF.set(xlerp(450, 1900, ss(0.15, 0.8, p)) * (1 + 2.2 * r * (1 - 0.6 * land)), 0.4);
        var d = lerp(0.04, 0.28, ss(0.2, 0.6, p)) * (1 - 0.75 * land);
        x.lfoD.set(d, 0.4); x.tremB.set(1 - d, 0.4); x.lfoF.set(6 + 0.5 * Math.sin(t * 0.2), 0.5);
        x.shim.set(0.7 * ss(0.2, 0.75, p) * (1 - 0.6 * land), 0.5);
        for (i = 0; i < 4; i++) x.sh[i].set(0.035 * (0.5 + 0.5 * Math.sin(t * (0.21 + 0.07 * i) + i * 1.9)), 0.4);
        x.harsh.set(0.1 * (0.35 + 0.65 * ss(0, 0.35, p)) * (1 - ss(0.55, 0.68, p)), 0.35);
        x.inh.set(0.16 * r * r * (1 - land), 0.3); x.inhF.set(xlerp(350, 4200, r), 0.3);
        x.shep.run(r * (1 - land), 0.08 + 0.1 * r, dt);
      },
      tick: function (L, x, st, p, now, hz) {
        if (st.np < now) st.np = now + 0.02;
        while (st.np < hz) { // PGO waves: irregular clusters of low pulses from the brainstem, quickening
          var lv = ss(0.08, 0.3, p) * (1 - ss(0.9, 1, p)), q = ss(0.08, 0.85, p);
          if (lv > 0.01) {
            var n = 1 + ((Math.random() * (1.5 + 3.5 * q)) | 0), tp = st.np;
            for (var k = 0; k < n; k++) { thump(x.pgo, tp, rnd(82, 96), rnd(46, 56), lv * rnd(0.28, 0.45), 0.06, rnd(-0.35, 0.35)); tp += rnd(0.075, 0.17); }
          }
          st.np += lerp(4.2, 1.1, q) * rnd(0.6, 1.5);
        }
      },
    };

    /* --- dreamscape: wonder (0..0.55), nightmare (0.55..0.94), deep water (0.94..1) --- */
    defs.dreamscape = {
      trim: 1.15, send: 0.5,
      build: function (L, g, x, st) {
        var sumN = g.gain(1), sumF = g.gain(1), uw = g.filter('lowpass', 18000, 0.5), uwF = g.filter('lowpass', 18000, 0.5);
        chain(sumN, uw, L.near); chain(sumF, uwF, L.far);
        x.uw = new Ctl(uw.frequency, 18000); x.uwF = new Ctl(uwF.frequency, 18000);
        var plp = g.filter('lowpass', 600, 0.7), pG = g.gain(0);
        x.pad = new Pad(g, plp, CH_W[0].n, { det: 7, lv: [0.2, 0.17, 0.14, 0.13, 0.11, 0.085], width: 0.85 });
        chain(plp, pG, sumN); x.padF = new Ctl(plp.frequency, 600); x.padQ = new Ctl(plp.Q, 0.7); x.padG = new Ctl(pG.gain, 0);
        var aG = g.gain(0); chain(g.osc('sine', mtof(88), 4), g.pan(-0.5), aG); chain(g.osc('sine', mtof(93), -5), g.gain(0.7), g.pan(0.5), aG);
        aG.connect(sumF); x.air = new Ctl(aG.gain, 0);
        var bG = g.gain(0), blp = g.filter('lowpass', 320, 0.6), b1 = g.osc('sine', mtof(38)), b2 = g.osc(warm, mtof(38), 4);
        chain(b1, g.gain(0.55), bG); chain(b2, blp, g.gain(0.5), bG); bG.connect(sumN);
        x.b1 = new Ctl(b1.frequency, mtof(38)); x.b2 = new Ctl(b2.frequency, mtof(38)); x.bass = new Ctl(bG.gain, 0);
        var bl = g.gain(1), dl = g.delay(1.5, 0.63), dlp = g.filter('lowpass', 2200, 0.5), fb = g.gain(0.4);
        bl.connect(sumN); chain(bl, g.gain(0.5), sumF); chain(bl, dl, dlp, fb, dl); chain(dlp, g.gain(0.5), sumF); x.bell = bl;
        x.heart = g.filter('lowpass', 190, 0.8); x.heart.connect(sumN);
        x.night = new Lazy(function (g2, y) {
          var gG = g2.gain(0), glp = g2.filter('lowpass', 140, 2.5), am = g2.gain(0.7), al = g2.gain(0.3);
          chain(g2.osc('sawtooth', mtof(26), 0), glp); chain(g2.osc('sawtooth', mtof(26), 38), glp); chain(g2.osc('sine', 27), al, am.gain);
          chain(glp, am, gG, sumN); y.growl = new Ctl(gG.gain, 0); y.growlF = new Ctl(glp.frequency, 140);
          var cG = g2.gain(0), clp = g2.filter('lowpass', 1500, 0.6), cn = [68, 69, 70], cp = [-0.6, 0, 0.6]; y.cl = [];
          for (var i = 0; i < 3; i++) { var o = g2.osc(warm, mtof(cn[i]), 0); chain(o, g2.gain(0.1), g2.pan(cp[i]), clp); y.cl.push(new Ctl(o.detune, 0)); }
          chain(clp, cG, sumN); y.clG = new Ctl(cG.gain, 0);
          var wf = g2.filter('bandpass', 800, 0.8), wG = g2.gain(0); chain(g2.noise(whiteBuf, 1), wf, wG, sumN);
          y.wind = new Ctl(wG.gain, 0); y.windF = new Ctl(wf.frequency, 800);
        });
        x.deep = new Lazy(function (g2, y) { // after the fall: muffled water and one low warm tone (bypasses the underwater filter)
          var dG = g2.gain(0), tlp = g2.filter('lowpass', 300, 0.5), nlp = g2.filter('lowpass', 220, 0.5);
          chain(g2.osc('sine', mtof(38)), g2.gain(0.55), dG); chain(g2.osc(warm, mtof(38), 4), tlp); chain(g2.osc(warm, mtof(50), -4), g2.gain(0.5), tlp);
          chain(tlp, g2.gain(0.4), dG); chain(g2.noise(pinkBuf, 0.7), nlp, g2.gain(0.9), dG);
          dG.connect(L.near); y.g = new Ctl(dG.gain, 0);
        });
        L.subs.push(x.night, x.deep);
        x.shep = new Shepard(sumN, 6, 28, 6, 0.55); L.subs.push(x.shep);
        st.ci = 0; st.reg = 0; st.nch = T + rnd(9, 14); st.lastCh = T; st.nbell = T + 1.5; st.bi = 7; st.nh = T + 0.5;
      },
      update: function (L, x, st, p, t, dt) {
        var open = ss(0, 0.5, p), w = ss(0.02, 0.5, p) * (1 - ss(0.55, 0.68, p)), s = ss(0.55, 0.7, p);
        var tn = ss(0.7, 0.84, p) * (1 - ss(0.84, 0.87, p)), fl = ss(0.84, 0.87, p) * (1 - ss(0.925, 0.945, p)), u = ss(0.93, 0.95, p);
        if (snap) { // enter with a chord that fits where we are
          st.reg = p > 0.615 ? 1 : 0; st.ci = 0;
          var c0 = st.reg ? CH_N[0] : CH_W[0]; x.pad.setNow(c0.n);
        }
        x.padF.set((450 + 2700 * Math.pow(open, 1.5) * (0.7 + 0.3 * drift(t, 7))) * (1 - 0.5 * s) * (1 - 0.6 * fl), 0.6);
        x.padQ.set(0.7 + 2.2 * s * (1 - fl), 0.6);
        x.padG.set((0.45 + 0.55 * ss(0.03, 0.3, p)) * (1 - 0.3 * s * (1 - tn)) * (1 - 0.8 * fl) * (1 - u), 0.35);
        x.pad.detune(48 * s + 22 * tn);
        x.air.set(0.045 * w * w, 0.6);
        x.bass.set(0.85 * ss(0.06, 0.22, p) * (1 - 0.3 * s) * (1 - fl) * (1 - u), 0.5);
        x.uw.set(xlerp(18000, 320, u), 0.12); x.uwF.set(xlerp(18000, 320, u), 0.12);
        var r = x.night.want(s > 0.002 && u < 0.999, dt);
        if (r) {
          var y = x.night.x, s0 = snap; if (r === 2) snap = true;
          y.growl.set(0.55 * s * (0.6 + 0.4 * tn) * (1 - 0.7 * fl) * (1 - u), 0.4); y.growlF.set(130 + 190 * tn, 0.4);
          y.clG.set(0.55 * tn * (1 - u), 0.4);
          var up = 300 * ss(0.72, 0.84, p);
          for (var i = 0; i < 3; i++) y.cl[i].set(up + 25 * Math.sin(t * (0.17 + 0.05 * i) + i), 0.5);
          y.wind.set((0.05 * s + 0.07 * tn + 0.22 * fl) * (1 - u), 0.3);
          y.windF.set(fl > 0.01 ? xlerp(2600, 380, ss(0.84, 0.94, p)) : lerp(650, 1500, tn), 0.3);
          snap = s0;
        }
        r = x.deep.want(u > 0.002, dt);
        if (r) { var s1 = snap; if (r === 2) snap = true; x.deep.x.g.set(0.9 * u, 0.25); snap = s1; }
        x.shep.run(Math.max(0.4 * tn, fl) * (1 - u), tn > fl ? 0.04 : -0.2, dt);
      },
      tick: function (L, x, st, p, now, hz) {
        var reg = p > 0.615 ? 1 : 0, set = reg ? CH_N : CH_W, ch, k;
        if (reg !== st.reg && now > st.lastCh + 3) { st.reg = reg; st.ci = -1; st.nch = now; }
        if (now >= st.nch && p < 0.94) {
          st.ci = st.ci < 0 ? 0 : (p < 0.04 && !reg ? 0 : pick(set[st.ci].nx));
          ch = set[st.ci]; x.pad.setChord(ch.n, now + 0.05, reg ? 0.6 : 1.6);
          var bf = mtof(ch.b); x.b1.p.setTargetAtTime(bf, now + 0.8, 0.35); x.b2.p.setTargetAtTime(bf, now + 0.8, 0.35);
          st.lastCh = now; st.nch = now + (reg ? rnd(7, 11) : rnd(13, 20));
        }
        if (st.nbell < now) st.nbell = now + 0.02;
        while (st.nbell < hz) {
          var w = ss(0.02, 0.5, p), tb = st.nbell, n, m;
          if (p < 0.58) { // glass melody: a random walk through D lydian
            n = Math.random() < 0.25 ? 2 + ((Math.random() * 2) | 0) : 1;
            for (k = 0; k < n; k++) {
              st.bi = clamp(st.bi + ((Math.random() * 7) | 0) - 3, 0, SC_LYD.length - 1 - ((1 - w) * 4 | 0));
              m = SC_LYD[st.bi];
              bell(x.bell, tb, mtof(m), rnd(0.11, 0.16) * (0.6 + 0.4 * w), { decay: rnd(4, 6), ratio: Math.random() < 0.3 ? 3 : 2, index: rnd(0.7, 1.2), pan: rnd(-0.6, 0.6) });
              tb += rnd(0.27, 0.46);
            }
            st.nbell += lerp(4.2, 1.6, w) * rnd(0.6, 1.5) + (n - 1) * 0.35;
          } else if (p < 0.84) { // the same bells, souring and bending flat
            bell(x.bell, tb, mtof(pick(SC_NIGHT)), rnd(0.07, 0.1), { decay: rnd(3, 4.5), ratio: 1.41, index: rnd(1.4, 2.2), pan: rnd(-0.7, 0.7), bend: -rnd(60, 190) });
            st.nbell += rnd(2.4, 5);
          } else st.nbell += 1;
        }
        if (st.nh < now) st.nh = now + 0.02;
        while (st.nh < hz) {
          var hl = ss(0.57, 0.68, p) * (1 - ss(0.838, 0.85, p)), iv = 60 / lerp(66, 122, ss(0.58, 0.84, p));
          if (hl > 0.01) heart(x.heart, st.nh, hl * (0.4 + 0.2 * ss(0.7, 0.84, p)), 0.3 * Math.pow(iv, 0.6));
          st.nh += iv * rnd(0.97, 1.03);
        }
      },
    };

    /* --- octopus: submerged surf, bubbles, far whales, chromatophore ripples --- */
    defs.octopus = {
      trim: 1.6, send: 0.5,
      build: function (L, g, x, st) {
        var slp = g.filter('lowpass', 300, 0.6), sG = g.gain(0.3); chain(g.noise(pinkBuf, 0.85), slp, sG, L.near);
        x.sF = new Ctl(slp.frequency, 300); x.sG = new Ctl(sG.gain, 0.3);
        var dG = g.gain(0.5), dlp = g.filter('lowpass', 280, 0.5);
        chain(g.osc('sine', mtof(38)), g.gain(0.42), dG); chain(g.osc('sine', mtof(45), 3), g.gain(0.16), dG);
        chain(g.osc(warm, mtof(50), -5), dlp); chain(g.osc(warm, mtof(38), 4), g.gain(0.8), dlp); chain(dlp, g.gain(0.3), dG);
        dG.connect(L.near); x.drone = new Ctl(dG.gain, 0.5);
        x.wl = g.filter('lowpass', 900, 0.5); x.wl.connect(L.far);
        st.nb = T + 1.5; st.nw = T + rnd(2.5, 6); st.nr = T + 1;
      },
      update: function (L, x, st, p, t) {
        var sw = 0.5 + 0.35 * Math.sin(t * TAU / 9.5) + 0.15 * Math.sin(t * TAU / 23 + 1);
        x.sG.set(0.22 + 0.4 * sw * sw, 0.5); x.sF.set(230 + 300 * sw, 0.5);
        x.drone.set(0.42 + 0.2 * drift(t, 8), 0.8);
      },
      tick: function (L, x, st, p, now, hz) {
        var k, n, act = ss(0.3, 0.4, p) * (1 - ss(0.7, 0.82, p));
        if (st.nb < now) st.nb = now + 0.02;
        while (st.nb < hz) {
          n = 1 + ((Math.random() * 3) | 0); var tb = st.nb, pn = rnd(-0.8, 0.8);
          for (k = 0; k < n; k++) { var f = rnd(420, 900); blip(k ? L.far : L.near, tb, f, rnd(0.05, 0.09), rnd(0.05, 0.09), pn + rnd(-0.15, 0.15), f * rnd(1.6, 2.4)); tb += rnd(0.07, 0.22); }
          st.nb += rnd(1.8, 6);
        }
        if (st.nw < now) st.nw = now + 0.02;
        while (st.nw < hz) { var w = pick(WHALE); whale(x.wl, st.nw, w[0], w[1], rnd(0.1, 0.15), rnd(3, 5), rnd(-0.7, 0.7)); st.nw += rnd(10, 20); }
        if (st.nr < now) st.nr = now + 0.02;
        while (st.nr < hz) {
          if (act > 0.05) { // a wave of colour crossing the skin
            n = 10 + ((act * 14 * rnd(0.7, 1.1)) | 0);
            var dur = rnd(0.8, 1.6), dir = Math.random() < 0.5 ? -1 : 1, c = rnd(1.5, 5), wd = rnd(1.5, 3.5), ph = rnd(0, PI);
            for (k = 0; k < n; k++) {
              var u = k / (n - 1), idx = Math.round(clamp(c + wd * Math.sin(ph + u * PI * 1.5), 0, SC_OCT.length - 1));
              blip(k % 2 ? L.near : L.far, st.nr + u * dur + rnd(0, 0.02), mtof(SC_OCT[idx]), 0.055 * act * (0.25 + 0.75 * Math.sin(PI * u)), rnd(0.05, 0.08), dir * lerp(-0.9, 0.9, u));
            }
            st.nr += lerp(5, 2.2, act) * rnd(0.7, 1.3);
          } else st.nr += 0.5;
        }
      },
    };

    /* --- theories: an open drone; seven voices enter one by one and are finally heard together --- */
    defs.theories = {
      trim: 1.45, send: 0.6,
      build: function (L, g, x, st) {
        var dG = g.gain(0.5), dlp = g.filter('lowpass', 300, 0.5);
        chain(g.osc('sine', mtof(38)), g.gain(0.45), dG); chain(g.osc('sine', mtof(26)), g.gain(0.2), dG); chain(g.osc('sine', mtof(45), 3), g.gain(0.13), dG);
        chain(g.osc(warm, mtof(38), -4), dlp, g.gain(0.32), dG); dG.connect(L.near); x.drone = new Ctl(dG.gain, 0.5);
        chain(g.noise(pinkBuf, 1), g.filter('highpass', 4000, 0.5), g.gain(0.012), L.far);
        var lp = g.filter('lowpass', 1400, 0.5), cG = g.gain(1); chain(lp, cG, L.near);
        x.lpF = new Ctl(lp.frequency, 1400); x.chord = new Ctl(cG.gain, 1); x.v = [];
        for (var i = 0; i < 7; i++) {
          var f = mtof(TH_NOTES[i]), vG = g.gain(0);
          chain(g.osc(warm, f, rnd(-5, 5)), vG); chain(g.osc('sine', f * 2, rnd(-6, 6)), g.gain(0.22), vG);
          chain(vG, g.pan(TH_PAN[i]), lp); x.v.push(new Ctl(vG.gain, 0));
        }
        st.pp = NaN; st.bt = 0; st.nb = T + rnd(6, 10);
      },
      update: function (L, x, st, p, t) {
        var fin = ss(0.93, 0.97, p), fi = p >= 0.94 ? -1 : Math.floor((p - 0.1) / 0.12), n = 0, i, thr;
        var fwd = st.pp === st.pp && L.fade > 0.2;
        for (i = 0; i < 7; i++) {
          thr = 0.1 + 0.12 * i;
          var a = ss(thr - 0.006, thr + 0.03, p);
          x.v[i].set(a * lerp(i === fi ? 1 : 0.7, 1.05, fin) * TH_LV[i], 0.5); n += a;
          if (fwd && st.pp < thr && p >= thr) { // this theory's star lights: a bell on its note
            st.bt = Math.max(T + 0.03, st.bt + 0.15);
            bell(L.near, st.bt, mtof(TH_NOTES[i]), 0.16, { decay: 5.5, ratio: 2, index: 0.9, pan: TH_PAN[i] });
            bell(L.far, st.bt + 0.02, mtof(TH_NOTES[i] + 12), 0.06, { decay: 6, ratio: 2, index: 0.5, pan: -TH_PAN[i] });
          }
        }
        if (fwd && st.pp < 0.94 && p >= 0.94) { // all seven, together
          for (i = 0; i < 7; i++) { st.bt = Math.max(T + 0.05, st.bt + 0.17); bell(L.far, st.bt, mtof(TH_NOTES[i] + 12), 0.09, { decay: 6, ratio: 2, index: 0.6, pan: TH_PAN[i] }); }
        }
        st.pp = p;
        x.lpF.set(lerp(1300, 3200, fin) * (0.9 + 0.2 * drift(t, 9)), 0.6);
        x.chord.set((1 + 0.3 * fin) / (1 + 0.1 * n), 0.6);
        x.drone.set(0.45 + 0.2 * drift(t, 10), 0.8);
      },
      tick: function (L, x, st, p, now, hz) {
        if (st.nb < now) st.nb = now + 0.02;
        while (st.nb < hz) { // sparse re-strikes of notes already in the chord
          var n = Math.floor(clamp((p - 0.1) / 0.12 + 1, 0, 7));
          if (n > 0) { var i = (Math.random() * n) | 0; bell(L.far, st.nb, mtof(TH_NOTES[i] + (Math.random() < 0.5 ? 12 : 0)), rnd(0.05, 0.08), { decay: 5, ratio: 2, index: 0.6, pan: TH_PAN[i] }); }
          st.nb += p >= 0.94 ? rnd(2.5, 5) : rnd(7, 14);
        }
      },
    };

    /* --- dawn: evaporating highs, light through the lids, the eyes open, D major and birds --- */
    defs.dawn = {
      trim: 1.2, send: 0.5,
      build: function (L, g, x, st) {
        var eye = g.filter('lowpass', 300, 0.6), pG = g.gain(0);
        x.pad = new Pad(g, eye, CH_D[0].n, { det: 6, lv: [0.2, 0.17, 0.14, 0.13, 0.1, 0.075], width: 0.85 });
        chain(eye, pG, L.near); x.eye = new Ctl(eye.frequency, 300); x.padG = new Ctl(pG.gain, 0);
        var bG = g.gain(0), blp = g.filter('lowpass', 380, 0.6);
        chain(g.osc('sine', mtof(38)), g.gain(0.5), bG); chain(g.osc('sine', mtof(26)), g.gain(0.2), bG);
        chain(g.osc(warm, mtof(38), 4), blp, g.gain(0.55), bG); bG.connect(L.near); x.bass = new Ctl(bG.gain, 0);
        var aG = g.gain(0); chain(g.noise(pinkBuf, 1), g.filter('highpass', 2500, 0.5), aG, L.near); x.air = new Ctl(aG.gain, 0);
        x.birds = g.filter('lowpass', 6000, 0.5); x.birds.connect(L.far); chain(x.birds, g.gain(0.25), L.near);
        st.ci = 0; st.nch = T + rnd(10, 16); st.ne = T + 0.3; st.nbird = T + 1; st.nbell = T + 2;
      },
      update: function (L, x, st, p, t) {
        var light = ss(0.22, 0.5, p), open = ss(0.5, 0.7, p), res = ss(0.68, 0.85, p);
        if (snap) { st.ci = 0; x.pad.setNow(CH_D[0].n); }
        x.padG.set(lerp(0.1, 0.72, light) + 0.28 * res, 0.5);
        x.eye.set(lerp(280, 640, light) * Math.pow(11, open) * (0.9 + 0.2 * drift(t, 11)), 0.4);
        x.bass.set(0.4 * ss(0.3, 0.5, p) + 0.5 * res, 0.5);
        x.air.set(0.07 * open, 0.4);
      },
      tick: function (L, x, st, p, now, hz) {
        if (now >= st.nch) {
          if (p > 0.45) { st.ci = pick(CH_D[st.ci].nx); x.pad.setChord(CH_D[st.ci].n, now + 0.05, 1.8); }
          st.nch = now + (p > 0.68 ? rnd(9, 15) : rnd(14, 20));
        }
        if (st.ne < now) st.ne = now + 0.02;
        while (st.ne < hz) { // the last dream evaporating upward
          if (p < 0.32) {
            var f = mtof(pick(SC_EVAP)), d = rnd(2.5, 4);
            tone(L.far, st.ne, f, rnd(0.05, 0.08) * (1 - ss(0.18, 0.32, p)), { atk: rnd(0.15, 0.4), hold: 0.2, rel: rnd(0.7, 1.1), f2: f * Math.pow(2, rnd(3, 9) / 12), glideT: d, pan: rnd(-0.8, 0.8) });
          }
          st.ne += lerp(0.9, 3, ss(0, 0.28, p)) * rnd(0.6, 1.4);
        }
        if (st.nbird < now) st.nbird = now + 0.02;
        while (st.nbird < hz) {
          var bl = ss(0.6, 0.8, p);
          if (bl > 0.02) bird(x.birds, st.nbird, rnd(0.035, 0.06) * bl, rnd(-0.9, 0.9));
          st.nbird += lerp(7, 2.8, ss(0.6, 0.9, p)) * rnd(0.5, 1.6);
        }
        if (st.nbell < now) st.nbell = now + 0.02;
        while (st.nbell < hz) {
          if (p > 0.72) bell(L.far, st.nbell, mtof(pick(SC_DAWN)), rnd(0.06, 0.09), { decay: rnd(4, 5.5), ratio: 2, index: 0.7, pan: rnd(-0.5, 0.5) });
          st.nbell += rnd(5, 11);
        }
      },
    };

    /* ---- layers ---- */
    var layers = {}, list = [];
    function mkLayer(id) { var L = { id: id, def: defs[id], built: false, broken: false, fade: 0, p: 0, off: 0, stamp: -1, tf: 0, tp: 0, subs: [] }; layers[id] = L; list.push(L); return L; }
    for (var id in defs) mkLayer(id);

    function buildLayer(L) {
      var g = L.g = new Group();
      L.fd = g.gain(0); L.fw = g.gain(0); L.near = g.gain(1); L.far = g.gain(1);
      var sn = g.gain(L.def.send), sf = g.gain(0.3);
      L.near.connect(L.fd); chain(L.near, sn, L.fw); L.far.connect(L.fw); chain(L.far, sf, L.fd);
      L.fd.connect(mix); L.fw.connect(revIn);
      L.cf = new Ctl(L.fd.gain, 0); L.cw = new Ctl(L.fw.gain, 0);
      L.x = {}; L.st = {}; L.subs = []; L.fresh = true; L.built = true; L.off = 0;
      L.def.build(L, g, L.x, L.st);
    }
    function freeLayer(L) {
      if (!L.built) return;
      for (var i = 0; i < L.subs.length; i++) { try { L.subs[i].free(); } catch (e) {} }
      try { L.g.free(); } catch (e) {}
      L.built = false; L.x = null; L.st = null; L.subs = [];
    }
    function fail(L, where, e) {
      L.broken = true; errors.push(L.id + '.' + where + ': ' + (e && e.stack || e));
      try { console.warn('[DREAM audio] ' + L.id + '.' + where + ' failed', e); } catch (e2) {}
      freeLayer(L);
    }

    /* scroll air */
    var wh = new Group(), whF = wh.filter('bandpass', 500, 0.8), whG = wh.gain(0);
    chain(wh.noise(whiteBuf, 1), whF, whG, mix); chain(whG, wh.gain(0.5), revIn);
    var whCF = new Ctl(whF.frequency, 500), whCG = new Ctl(whG.gain, 0);

    /* ---- per-frame control (call at ~20-30 Hz) ---- */
    function frame(act, scrollVel) {
      T = ctx.currentTime;
      var dt = lastT < 0 ? 0.04 : clamp(T - lastT, 0, 0.25); lastT = T;
      var id, L, a, i;
      stamp++;
      if (act) for (id in act) {
        a = act[id]; if (!a) continue;
        L = layers[id] || layers._neutral;
        if (L.stamp !== stamp) { L.stamp = stamp; L.tf = 0; L.tp = 0; }
        var f = +a.fade, pr = +a.progress; if (!(f > 0)) continue; if (!(pr >= 0)) pr = 0;
        L.tf += f; L.tp += pr * f;
      }
      for (i = 0; i < list.length; i++) {
        L = list[i]; if (L.broken) continue;
        var fade = L.stamp === stamp ? Math.min(1, L.tf) : 0;
        if (fade > 0) L.p = clamp(L.tp / L.tf, 0, 1);
        L.fade = fade;
        try {
          if (fade > 0 && !L.built) buildLayer(L);
          if (!L.built) continue;
          var gn = Math.sin(fade * PI / 2) * L.def.trim;
          L.cf.set(gn, 0.12); L.cw.set(gn, 0.12);
          if (fade > 0) { L.off = 0; snap = L.fresh; L.def.update(L, L.x, L.st, L.p, T, dt); snap = false; L.fresh = false; }
          else { L.off += dt; if (L.off > 5) freeLayer(L); }
        } catch (e) { snap = false; fail(L, 'update', e); }
      }
      var v = Math.abs(+scrollVel || 0) / 3; if (v > 1) v = 1;
      whCG.set(0.035 * Math.pow(v, 1.4), 0.25); whCF.set(450 + 1500 * v, 0.3);
      // output level for the visuals
      var s = 0, n = adata.length;
      if (analyser.getFloatTimeDomainData) { analyser.getFloatTimeDomainData(adata); for (i = 0; i < n; i++) s += adata[i] * adata[i]; }
      else { if (!bdata) bdata = new Uint8Array(n); analyser.getByteTimeDomainData(bdata); for (i = 0; i < n; i++) { var q = (bdata[i] - 128) / 128; s += q * q; } }
      var target = clamp(Math.sqrt(s / n) * 4.5, 0, 1);
      if (target === target) lvl += (target - lvl) * 0.25;
    }
    function tick() {
      T = ctx.currentTime;
      for (var i = 0; i < list.length; i++) {
        var L = list[i];
        if (!L.built || L.broken || L.fade < 0.003 || L.fresh) continue;
        try { L.def.tick(L, L.x, L.st, L.p, T, T + LOOK); } catch (e) { fail(L, 'tick', e); }
      }
    }

    function ping(name) {
      var t = ctx.currentTime + 0.02, i, n;
      if (name === 'begin') {
        bell(ui, t, mtof(62), 0.2, { decay: 5, ratio: 2, index: 0.8 });
        bell(ui, t + 0.24, mtof(69), 0.17, { decay: 5.5, pan: -0.3, index: 0.7 });
        bell(ui, t + 0.5, mtof(76), 0.15, { decay: 6, pan: 0.3, index: 0.6 });
        tone(ui, t, mtof(38), 0.16, { wave: soft, atk: 1.2, hold: 0.8, rel: 1.2 });
      } else if (name === 'seed') {
        if (t - lastSeed < 0.07) return; lastSeed = t;
        seedIdx = clamp(seedIdx + ((Math.random() * 5) | 0) - 2, 0, SC_SEED.length - 1);
        bell(ui, t, mtof(SC_SEED[seedIdx]), 0.14, { decay: 1.8, ratio: 3, index: 0.8, pan: rnd(-0.4, 0.4) });
      } else if (name === 'forecast') {
        n = [78, 81, 88];
        for (i = 0; i < 3; i++) bell(ui, t + i * 0.12, mtof(n[i]), 0.14, { decay: 3.2, ratio: 2, index: 0.7, pan: (i - 1) * 0.35 });
      } else if (name === 'reveal') {
        n = [50, 57, 64, 66, 73, 78, 81];
        for (i = 0; i < n.length; i++) bell(ui, t + i * 0.11, mtof(n[i]), 0.17, { decay: 6, ratio: 2, index: 0.8, pan: (i % 2 ? 1 : -1) * 0.1 * i });
        tone(ui, t, mtof(50), 0.1, { wave: warm, atk: 1.5, hold: 1.5, rel: 1.5, pan: -0.2 });
        tone(ui, t, mtof(57), 0.08, { wave: warm, atk: 1.8, hold: 1.2, rel: 1.5, pan: 0.2 });
      }
    }

    return {
      ctx: ctx, frame: frame, tick: tick, ping: ping, stats: stats, errors: errors, layers: layers, defs: defs,
      tap: vis, master: master, analyser: analyser, trim: trim, revOut: revOut,
      level: function () { return lvl; },
      setMaster: function (v, tau) { master.gain.setTargetAtTime(v, ctx.currentTime, tau); },
      setVis: function (v, tau) { vis.gain.setTargetAtTime(v, ctx.currentTime, tau); },
      live: function () { var b = 0; for (var i = 0; i < list.length; i++) if (list[i].built) b++; return { src: stats.src, nodes: stats.nodes, shots: stats.shots, peakSrc: stats.peakSrc, dropped: stats.dropped, layers: b }; },
    };
  }

  /* ================================================================== public API */
  var eng = null, ctx = null, muted = false, started = false, timer = 0, lastUp = 0, hideTimer = 0, dead = false;

  function resume() {
    if (!ctx || ctx.state === 'running' || ctx.state === 'closed') return Promise.resolve(true);
    try { var p = ctx.resume(); return p && p.then ? p.then(function () { return true; }, function () { return false; }) : Promise.resolve(true); }
    catch (e) { return Promise.resolve(false); }
  }
  function onVis() {
    if (!eng) return;
    try {
      clearTimeout(hideTimer);
      if (document.hidden) {
        eng.setVis(0, 0.08);
        hideTimer = setTimeout(function () { try { if (document.hidden && ctx.state === 'running') ctx.suspend(); } catch (e) {} }, 450);
      } else resume().then(function () { try { eng.setVis(1, 0.25); } catch (e) {} });
    } catch (e) {}
  }
  function onGesture() { if (started && ctx && ctx.state !== 'running' && !document.hidden) resume(); }

  var api = {
    start: function () {
      try {
        if (!AC || dead) return Promise.resolve(false);
        if (!eng) {
          try { ctx = new AC({ latencyHint: 'balanced' }); } catch (e) { ctx = new AC(); }
          eng = createEngine(ctx);
          eng.setMaster(muted ? 0 : 1, 0.9); // ~3 s fade-in
          timer = setInterval(function () { try { if (ctx.state === 'running') eng.tick(); } catch (e) {} }, 100);
          document.addEventListener('visibilitychange', onVis);
          window.addEventListener('pointerdown', onGesture, { passive: true });
          window.addEventListener('keydown', onGesture, { passive: true });
        }
        started = true;
        return resume();
      } catch (e) {
        dead = !eng; try { console.warn('[DREAM audio] unavailable', e); } catch (e2) {}
        return Promise.resolve(false);
      }
    },
    setMuted: function (m) {
      muted = !!m;
      try { if (eng) eng.setMaster(muted ? 0 : 1, 0.1); } catch (e) {}
    },
    get muted() { return muted; },
    get started() { return started; },
    update: function (S, act) {
      if (!eng || !started) return;
      var now = performance.now();
      if (now - lastUp < 38) return;
      lastUp = now;
      try { if (ctx.state === 'running') eng.frame(act, S ? S.scrollVel : 0); } catch (e) {}
    },
    ping: function (name) { if (!eng || !started) return; try { eng.ping(name); } catch (e) {} },
    level: function () { return eng && started && !muted ? eng.level() : 0; },
    _debug: {
      get engine() { return eng; },
      get ctx() { return ctx; },
      stats: function () { return eng ? eng.live() : null; },
      errors: function () { return eng ? eng.errors.slice() : []; },
      /* Offline render for tests. opts: { duration, sampleRate, step, script(t) -> { act, scrollVel, ping } }.
         Resolves to { buffer, stats, errors }. */
      renderOffline: function (opts) {
        var sr = opts.sampleRate || 44100, dur = opts.duration, step = opts.step || 0.05;
        var o = new OAC(2, Math.ceil(dur * sr), sr), e = createEngine(o);
        e.master.gain.value = 1;
        function at(t) {
          o.suspend(t).then(function () {
            try { var s = opts.script(t) || {}; if (s.ping) e.ping(s.ping); e.frame(s.act, s.scrollVel || 0); e.tick(); } catch (err) { e.errors.push('script: ' + err); }
            o.resume();
          });
        }
        var s0 = opts.script(0) || {}; e.frame(s0.act, 0); e.tick();
        for (var t = step; t < dur - 0.01; t += step) at(t);
        return o.startRendering().then(function (buffer) { return { buffer: buffer, stats: e.live(), errors: e.errors.slice() }; });
      },
    },
  };
  D.audio = api;
})();
