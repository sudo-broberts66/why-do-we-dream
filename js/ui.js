/* Page layer: narration timing, clock + hypnogram, seeds, drift mode, chemistry meters, anatomy labels, dream forecast. */
(function () {
  'use strict';
  const D = window.DREAM;
  const root = document.documentElement;
  root.classList.add('js');
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const audio = () => D.audio || null;

  /* ───────────────────────── seeds: three things from the viewer's day ───────────────────────── */
  const DEFAULTS = { person: 'an old friend', place: 'the house you grew up in', undone: 'a message you never answered' };
  const seeds = Object.assign({}, DEFAULTS);
  let seedsAreMine = false;

  function secondPerson(raw) {
    let s = String(raw || '').replace(/\s+/g, ' ').trim().replace(/[.!?,;:]+$/, '');
    if (!s) return '';
    s = s.replace(/\bmyself\b/gi, 'yourself').replace(/\bmine\b/gi, 'yours').replace(/\bmy\b/gi, 'your')
      .replace(/\bI['’]m\b/g, 'you are').replace(/\bI['’]ve\b/g, 'you have').replace(/\bI\b/g, 'you').replace(/\bme\b/gi, 'you');
    // lower-case a leading article/determiner so it sits inside a sentence; leave proper nouns alone
    s = s.replace(/^(The|A|An|Your|That|This|Some|Our|You|Those|These)\b/, (m) => m.toLowerCase());
    return s;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  function applySeeds() {
    $$('[data-seed]').forEach((el) => {
      const v = seeds[el.dataset.seed] || '';
      el.textContent = el.hasAttribute('data-cap') ? cap(v) : v;
    });
    D.state.seeds = [seeds.person, seeds.place, seeds.undone];
    const note = $('#forecast-note');
    if (note) note.textContent = seedsAreMine
      ? 'Assembled from the three things you left at the start, the way your brain will assemble it: recent, felt, unfinished.'
      : 'Assembled from three stand-ins, because you left nothing at the start. Your own will be better. They always are.';
    makeForecast(true);
  }

  function readSeeds() {
    let any = false;
    ['person', 'place', 'undone'].forEach((k) => {
      const input = $('#seed-' + k);
      const v = secondPerson(input && input.value);
      if (v) { seeds[k] = v; any = true; } else seeds[k] = DEFAULTS[k];
    });
    seedsAreMine = any;
    try { localStorage.setItem('dream-seeds', JSON.stringify(any ? { person: $('#seed-person').value, place: $('#seed-place').value, undone: $('#seed-undone').value } : {})); } catch (e) { /* private mode */ }
    applySeeds();
  }

  function restoreSeeds() {
    try {
      const saved = JSON.parse(localStorage.getItem('dream-seeds') || '{}');
      ['person', 'place', 'undone'].forEach((k) => { if (saved[k] && $('#seed-' + k) && !$('#seed-' + k).value) $('#seed-' + k).value = String(saved[k]).slice(0, 48); });
    } catch (e) { /* ignore */ }
  }

  /* ───────────────────────── tonight's forecast ───────────────────────── */
  const F = {
    open: [
      (s) => `It starts in ${s.place}, except the ceiling is much too high and one wall is water.`,
      (s) => `You are back in ${s.place}. Every door opens onto the same room.`,
      (s) => `The place is ${s.place}, but someone has moved all the stairs.`,
      (s) => `${cap(s.place)} again, only larger, and lit from underneath.`,
      (s) => `You know it is ${s.place}, although nothing about it looks right.`,
      (s) => `It is ${s.place} and it is also a train, and both are leaving.`,
    ],
    who: [
      (s) => `${cap(s.person)} is there, younger than they should be, and finds none of this unusual.`,
      (s) => `${cap(s.person)} is with you, then is someone else, then is ${s.person} again.`,
      (s) => `${cap(s.person)} keeps trying to hand you something, and your hands are always full.`,
      (s) => `${cap(s.person)} is driving. There is no car.`,
      (s) => `Across the room ${s.person} is speaking a language you understood as a child.`,
      (s) => `You are looking for ${s.person}, who is standing next to you the whole time.`,
    ],
    weight: [
      (s) => `Then you remember ${s.undone}. It is due now, here, and you never learned how.`,
      (s) => `Somewhere behind you is ${s.undone}. It has grown since this afternoon.`,
      (s) => `Everyone is waiting for you to deal with ${s.undone}, and you cannot find your shoes.`,
      (s) => `${cap(s.undone)} is on the table between you, the size of a house and the size of a coin.`,
      (s) => `You try to explain about ${s.undone}, and your teeth feel loose.`,
      (s) => `${cap(s.undone)} turns out to be a door. You have had the key all along.`,
    ],
    close: [
      () => 'Then you are flying, a metre off the ground, and it is the most natural thing you have ever done.',
      () => 'None of it frightens you. You will wake with the feeling and without the story.',
      () => 'Just before the end you understand exactly what it all means. You will not bring that back.',
      () => 'Then the floor tilts, and you step off.',
      () => 'You will keep about a minute of it.',
      () => 'When the alarm goes, it has been part of the dream for some time.',
    ],
  };
  let lastPick = [-1, -1, -1, -1];
  function makeForecast(instant) {
    const out = $('#forecast-text');
    if (!out) return;
    const keys = ['open', 'who', 'weight', 'close'];
    const pick = keys.map((k, i) => { let n; do { n = Math.floor(Math.random() * F[k].length); } while (n === lastPick[i]); return n; });
    lastPick = pick;
    const text = keys.map((k, i) => F[k][pick[i]](seeds)).join(' ');
    const mins = 372 + 60 + Math.floor(Math.random() * 34); // 06:12 – 06:46
    const set = () => {
      out.textContent = text;
      const t = $('#forecast-time'); if (t) t.textContent = fmtClock(mins);
    };
    if (instant) { set(); return; }
    out.classList.add('swap');
    setTimeout(() => { set(); out.classList.remove('swap'); }, 620);
    if (audio()) audio().ping('forecast');
  }

  /* ───────────────────────── the night: hypnogram + clock ───────────────────────── */
  // minutes after 23:00 → stage. A textbook night: deep sleep early, REM periods lengthening toward morning.
  const NIGHT = [
    [14, 'W'], [25, 'N1'], [33, 'N2'], [50, 'N3'], [100, 'N2'], [112, 'REM'], [124, 'N2'], [150, 'N3'], [185, 'N2'],
    [205, 'REM'], [228, 'N2'], [262, 'N3'], [280, 'N2'], [297, 'REM'], [330, 'N2'], [372, 'REM'], [415, 'N2'], [432, 'REM'], [472, 'W'],
  ];
  const NIGHT_END = 478, NIGHT_START = 14;
  const ROW = { W: 7, REM: 19, N1: 31, N2: 44, N3: 57 };
  const STAGE_NAME = { W: 'Awake', N1: 'Stage N1 · drifting', N2: 'Stage N2 · light sleep', N3: 'Stage N3 · deep sleep', REM: 'REM · dreaming' };
  const STAGE_ACCENT = { W: '#cfc8ff', N1: '#9d8bff', N2: '#7fa2ff', N3: '#43c6d6', REM: '#ff7eb6' };
  function fmtClock(m) {
    const t = (23 * 60 + Math.round(m)) % 1440;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }
  function stageAt(m) { let s = 'W'; for (const [t, st] of NIGHT) { if (m >= t) s = st; else break; } return s; }

  let hypDot = null, hypClip = null;
  function buildHypnogram() {
    const svg = $('#hypnogram');
    if (!svg) return;
    const W = NIGHT_END - NIGHT_START;
    svg.setAttribute('viewBox', `0 0 ${W} 64`);
    let d = '', rem = '';
    NIGHT.forEach(([t, st], i) => {
      const x = t - NIGHT_START, y = ROW[st];
      const x2 = (i + 1 < NIGHT.length ? NIGHT[i + 1][0] : NIGHT_END) - NIGHT_START;
      d += (i === 0 ? `M${x} ${y}` : `L${x} ${y}`) + `L${x2} ${y}`;
      if (st === 'REM') rem += `M${x} ${y}L${x2} ${y}`;
    });
    let ticks = '';
    for (let h = 60; h < W + NIGHT_START; h += 60) ticks += `M${h - NIGHT_START} 61L${h - NIGHT_START} 64`;
    svg.innerHTML =
      `<defs><clipPath id="hyp-clip"><rect x="0" y="-4" width="0" height="72"></rect></clipPath></defs>` +
      `<path class="hyp-tick" d="${ticks}"></path>` +
      `<path class="hyp-base" d="${d}"></path><path class="hyp-rem" d="${rem}"></path>` +
      `<g clip-path="url(#hyp-clip)"><path class="hyp-lit" d="${d}"></path><path class="hyp-rem-lit" d="${rem}"></path></g>`;
    hypClip = svg.querySelector('#hyp-clip rect');
    hypDot = document.createElement('span');
    hypDot.className = 'hyp-dot';
    svg.parentNode.appendChild(hypDot);
  }

  const clockEl = $('#clock'), stageEl = $('#stage');
  let shownClock = '', shownStage = '', shownAccent = '';
  function updateNight(shots) {
    let m = 0, w = 0, top = null;
    for (const sh of shots) {
      if (!(sh.f > 0.0005)) continue;
      m += sh.f * (sh.c0 + (sh.c1 - sh.c0) * sh.lp); w += sh.f;
      if (!top || sh.f > top.f) top = sh;
    }
    if (!w) return;
    m /= w;
    const st = stageAt(m);
    const c = fmtClock(m);
    if (c !== shownClock) { shownClock = c; clockEl.textContent = c; }
    if (st !== shownStage) { shownStage = st; stageEl.textContent = STAGE_NAME[st]; }
    const accent = (top && top.accent) || STAGE_ACCENT[st];
    if (accent !== shownAccent) { shownAccent = accent; root.style.setProperty('--accent', accent); }
    if (hypClip) {
      const x = clamp(m - NIGHT_START, 0, NIGHT_END - NIGHT_START);
      hypClip.setAttribute('width', x.toFixed(1));
      hypDot.style.left = (x / (NIGHT_END - NIGHT_START) * 100).toFixed(2) + '%';
      hypDot.style.top = (ROW[st] / 64 * 100).toFixed(1) + '%';
    }
  }

  /* ───────────────────────── narration cards ───────────────────────── */
  let shots = [];
  function bindShots() {
    shots = D.chapters || [];
    shots.forEach((sh, i) => {
      if (sh._bound) return;
      sh._bound = true;
      sh.wrap = sh.el.querySelector('.card-wrap');
      sh.card = sh.wrap && sh.wrap.querySelector('.card');
      sh.flow = sh.el.classList.contains('flow');
      sh.first = i === 0; sh.last = i === shots.length - 1;
      sh.steps = $$('.step', sh.el).map((el) => ({ el, at: parseFloat(el.dataset.at) || 0, on: false }));
      const c = (sh.el.dataset.clock || '0,0').split(',').map(Number);
      sh.c0 = c[0]; sh.c1 = c[1];
      sh.accent = sh.el.dataset.accent || '';
      sh.v = -1;
    });
  }
  function updateCards(vh) {
    for (const sh of shots) {
      if (!sh.wrap) continue;
      const x = sh.x, H = sh.height;
      let v;
      if (sh.first) v = 1 - sstep(H * 0.78, H * 1.08, x);
      else if (sh.last) v = sstep(-0.1 * vh, 0.3 * vh, x);
      else v = sstep(0.05 * vh, 0.27 * vh, x) * (1 - sstep(H - 0.27 * vh, H - 0.05 * vh, x));
      if (Math.abs(v - sh.v) > 0.004 || (v === 0) !== (sh.v === 0)) {
        sh.v = v;
        sh.wrap.style.opacity = v.toFixed(3);
        sh.wrap.style.visibility = v > 0.004 ? 'visible' : 'hidden';
        sh.wrap.classList.toggle('is-live', v > 0.5);
      }
      if (v > 0 && !sh.flow) {
        const drift = (0.5 - clamp(x / H, 0, 1)) * 26;
        sh.wrap.style.transform = `translate3d(0,${drift.toFixed(1)}px,0)`;
      }
      if (sh.steps.length) {
        const lp = x / H;
        for (const st of sh.steps) { const on = lp >= st.at; if (on !== st.on) { st.on = on; st.el.classList.toggle('on', on); if (on && st.at > 0.5 && audio()) audio().ping('reveal'); } }
      }
    }
  }

  /* ───────────────────────── REM chemistry meters ───────────────────────── */
  const meterEls = {};
  $$('.meter').forEach((el) => { meterEls[el.dataset.chem] = { bar: $('.m-bar i', el), val: $('.m-val', el), shown: -1 }; });
  function setMeter(k, v) {
    const m = meterEls[k]; if (!m) return;
    const pct = Math.round(v * 100);
    if (pct === m.shown) return;
    m.shown = pct; m.bar.style.width = clamp(pct, 0, 100) + '%'; m.val.textContent = pct + '%';
  }
  function updateMeters(act) {
    const a = act.rem; if (!a) return;
    const p = a.progress;
    setMeter('ach', 0.2 + 0.85 * sstep(0.02, 0.36, p));
    setMeter('ser', 0.42 * (1 - sstep(0.3, 0.62, p)) + 0.03);
    setMeter('na', 0.38 * (1 - sstep(0.52, 0.675, p)));
  }

  /* ───────────────────────── anatomy labels over the brain ───────────────────────── */
  const LABELS = [
    { scene: 'replay', name: 'hippocampus', text: 'Hippocampus', a: 0.22, b: 0.9 },
    { scene: 'replay', name: 'thalamus', text: 'Thalamus', a: 0.26, b: 0.6 },
    { scene: 'rem', name: 'pons', text: 'Pons', a: 0.03, b: 0.3 },
    { scene: 'rem', name: 'thalamus', text: 'Thalamus', a: 0.07, b: 0.2 },
    { scene: 'rem', name: 'visual', text: 'Visual cortex', a: 0.12, b: 0.56 },
    { scene: 'rem', name: 'amygdala', text: 'Amygdala', a: 0.2, b: 0.56 },
    { scene: 'rem', name: 'hippocampus', text: 'Hippocampus', a: 0.26, b: 0.4 },
    { scene: 'rem', name: 'prefrontal', text: 'Prefrontal cortex · offline', a: 0.4, b: 0.68, dark: true },
    { scene: 'rem', name: 'motor', text: 'Motor cortex', a: 0.69, b: 0.83 },
    { scene: 'rem', name: 'cord', text: 'Spinal cord · blocked', a: 0.72, b: 0.83, dark: true },
  ];
  const labLayer = $('#labels');
  LABELS.forEach((l) => {
    l.el = document.createElement('div');
    l.el.className = 'lab' + (l.dark ? ' dark' : '');
    l.el.innerHTML = '<span></span>'; l.el.firstChild.textContent = l.text;
    l.shown = 0;
    labLayer.appendChild(l.el);
  });
  function updateLabels(act) {
    const brain = D.brain;
    const wide = window.innerWidth > 760;
    let rects = null; // rectangles of the narration cards currently on screen, measured only if a label needs them
    const cardRects = () => {
      if (rects) return rects;
      rects = [];
      for (const sh of shots) if (sh.v > 0.05 && sh.card) rects.push(sh.card.getBoundingClientRect());
      return rects;
    };
    for (const l of LABELS) {
      const a = act[l.scene];
      let o = 0, pos = null, flip = false, px = 0, py = 0;
      if (wide && brain && brain.project && a && a.fade > 0.85 && a.progress >= l.a && a.progress <= l.b) {
        try { pos = brain.project(l.name); } catch (e) { pos = null; }
        if (pos && pos.visible !== false && pos.x > 0.04 && pos.x < 0.96 && pos.y > 0.12 && pos.y < 0.94) {
          o = 1;
          px = pos.x * window.innerWidth; py = pos.y * window.innerHeight;
          const w = 52 + l.text.length * 8.2; // dot + leader + text, roughly
          // lead away from the narration card; hide if there is no clear side
          const clear = (x0, x1) => cardRects().every((r) => x1 < r.left - 14 || x0 > r.right + 14 || py + 12 < r.top - 10 || py - 12 > r.bottom + 10);
          const right = clear(px, px + w) && px + w < window.innerWidth - 12;
          const left = clear(px - w, px) && px - w > 12;
          if (right && left) flip = pos.x < 0.5; else if (left) flip = true; else if (right) flip = false; else o = 0;
        }
      }
      if (o) {
        l.el.classList.toggle('flip', flip);
        l.el.style.transform = flip
          ? `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(-100%,-50%)`
          : `translate3d(${px.toFixed(1)}px,${py.toFixed(1)}px,0) translate(0,-50%)`;
      }
      if (o !== l.shown) { l.shown = o; l.el.style.opacity = o; }
    }
  }

  /* ───────────────────────── drift (hands-free scrolling) ───────────────────────── */
  const drift = { on: false, y: 0, speed: 8.2 /* viewport-heights per 100 s → set below */, last: 0, wake: null };
  drift.speed = 0.085; // viewport heights per second
  const btnDrift = $('#btn-drift');
  function setDrift(on) {
    drift.on = on; drift.y = window.scrollY; drift.last = performance.now();
    btnDrift.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (on && navigator.wakeLock && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then((w) => { drift.wake = w; }).catch(() => {});
    } else if (!on && drift.wake) { try { drift.wake.release(); } catch (e) { /* ignore */ } drift.wake = null; }
  }
  function stepDrift(vh) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - drift.last) / 1000); drift.last = now;
    if (!drift.on) return;
    if (Math.abs(window.scrollY - drift.y) > 3) drift.y = window.scrollY; // something else moved the page
    const max = document.documentElement.scrollHeight - vh;
    drift.y = Math.min(max, drift.y + drift.speed * vh * dt);
    window.scrollTo(0, drift.y);
    if (drift.y >= max - 1) setDrift(false);
  }
  btnDrift.addEventListener('click', () => setDrift(!drift.on));
  const userScroll = () => { if (drift.on) setDrift(false); };
  window.addEventListener('wheel', userScroll, { passive: true });
  window.addEventListener('touchmove', userScroll, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End', ' '].indexOf(e.key) >= 0) userScroll();
  });

  /* ───────────────────────── sound ───────────────────────── */
  const btnSound = $('#btn-sound');
  function syncSound() { const a = audio(); btnSound.setAttribute('aria-pressed', a && a.started && !a.muted ? 'true' : 'false'); }
  function soundOn() {
    const a = audio(); if (!a) return;
    try { const p = a.start(); a.setMuted(false); if (p && p.then) p.then(syncSound, syncSound); } catch (e) { D.report('audio start: ' + e); }
    syncSound();
  }
  btnSound.addEventListener('click', () => {
    const a = audio(); if (!a) return;
    if (!a.started) soundOn(); else { a.setMuted(!a.muted); syncSound(); }
  });

  /* ───────────────────────── beginning + ending ───────────────────────── */
  function begin(withSound) {
    readSeeds();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (withSound) { soundOn(); const a = audio(); if (a) a.ping('begin'); }
    setDrift(true);
  }
  const form = $('#seeds');
  form.addEventListener('submit', (e) => { e.preventDefault(); begin(true); });
  $('#btn-silent').addEventListener('click', () => begin(false));
  $$('.seed-row input').forEach((el) => el.addEventListener('change', () => { const a = audio(); if (a && a.started && el.value.trim()) a.ping('seed'); }));
  $('#btn-redream').addEventListener('click', () => makeForecast(false));
  $('#btn-restart').addEventListener('click', () => { setDrift(false); window.scrollTo({ top: 0, behavior: 'smooth' }); });

  /* ───────────────────────── boot ───────────────────────── */
  buildHypnogram();
  restoreSeeds();
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const ok = D.boot({ mode: 'page' });
  applySeeds();

  if (ok) {
    D.look.veil = 1;
    const t0 = performance.now();
    let opened = 0;
    D.ready.then(() => { opened = performance.now(); });
    D.onFrame((S, act) => {
      if (opened && D.look.veil > 0) D.look.veil = 1 - sstep(0, 2600, performance.now() - opened);
      else if (!opened && performance.now() - t0 > 6000) opened = performance.now(); // never stay dark
      if (D.chapters !== shots || (shots[0] && !shots[0]._bound)) bindShots();
      updateCards(S.vh);
      updateNight(shots);
      updateMeters(act);
      updateLabels(act);
      stepDrift(S.vh);
    });
  } else {
    // No WebGL2: the text still tells the whole story, laid out as a plain scrolling page.
    root.classList.remove('js');
    root.classList.add('no-gl');
    $$('.step').forEach((el) => el.classList.add('on'));
  }

  // test hook: ?y=0.42 jumps to that fraction of the night
  const jump = new URLSearchParams(location.search).get('y');
  if (jump !== null) requestAnimationFrame(() => requestAnimationFrame(() => {
    window.scrollTo(0, (document.documentElement.scrollHeight - window.innerHeight) * clamp(parseFloat(jump) || 0, 0, 1));
  }));
})();
