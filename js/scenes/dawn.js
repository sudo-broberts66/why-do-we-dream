/* Scene `dawn` — 06:15 → 06:52, the last dream evaporating, waking.
   p 0 → .25   darkness; the last dream's shards and motes drift upward and sublimate (forgetting)
   p .25 → .5  sunlight through closed eyelids: a growing red-orange glow with soft vessel shadows
   p .5 → .72  the eyes flutter open (same lids as threshold.js, reversed); bright blur resolves into sky
   p .72 → 1   dawn over the same ridge as the opening: last stars, pale sinking moon, clouds lit from
               below, and the sun's first edge breaking the ridge at the very end

   The SKY / LIDS chunks are shared by copy with threshold.js (same place, other end of the night). */
(function () {
  'use strict';
  const D = window.DREAM;

  /* ---------------------------------------------------------------- shared sky (copy of threshold.js) */
  const SKY = `
const vec2  POLE    = vec2(.45, -1.5);   // centre of the sky's rotation, far below the horizon (we face south)
const float BAND_R  = 1.9;               // the Milky Way is an arc about POLE, so rotation never moves it off-frame
const float HORIZON = -.405;
const float MOON_R  = .037;
const float SUN_R   = .026;
float gAsp;                              // aspect ratio, set in main()

float lum(vec3 c){ return dot(c, vec3(.3, .6, .1)); }

// night: 0 = 23:14 … 1 = sunrise. The moon sinks toward the ridge on its way down.
vec2 moonPos(float night){ return vec2((.335 + .022 * night) * gAsp, -.232 - .088 * night); }

float ridgeFar(float x){
  return HORIZON + .034 * (vnoise(vec2(x * 1.7 + 3.3, 1.5)) - .35) + .011 * vnoise(vec2(x * 6.1, 7.7));
}
float ridgeNear(float x){
  return HORIZON - .052 + .052 * vnoise(vec2(x * 1.15 + 11., 4.2)) + .012 * vnoise(vec2(x * 8.3, 2.))
       + .0035 * vnoise(vec2(x * 70., 9.));
}

float cfbm(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = rot(.5) * p * 2.03 + 17.3; a *= .5; }
  return s / .9375;
}
// Cloud deck in perspective: a plane overhead receding to the horizon.
vec2 cloudUV(vec2 uv, float px){
  float z = .6 / (max(uv.y - HORIZON, 0.) + .045);
  return vec2((uv.x + px) * z + uTime * .006, z + uTime * .0015) * vec2(1.15, 1.25);
}

vec3 starTint(float h){
  vec3 c = mix(vec3(.60, .73, 1.), vec3(1., .97, .93), smoothstep(0., .55, h));
  return mix(c, vec3(1., .72, .48), smoothstep(.74, 1., h));
}

// One star per cell, kept clear of the cell border so a single lookup is enough.
vec3 starField(vec2 q, float scale, float seed, float r0, float dens, float blur, float tw){
  vec2 g = q * scale; vec2 id = floor(g); vec2 f = g - id;
  vec2 k = hash22(id * 1.31 + seed + 19.7);
  if (k.x > dens) return vec3(0.);
  vec2 h = hash22(id + seed);
  vec2 c = .5 + (h - .5) * .72;
  float d = length(f - c) / scale;
  float mag = pow(k.y, 6.);
  float ru = r0 * (.75 + .9 * mag);
  float r = max(ru, .8 / uRes.y) + blur;
  float I = (.085 + 2.0 * mag) * min(1., ru * ru / (r * r));
  I *= 1. - tw * (.5 + .5 * sin(uTime * (1.1 + 3.6 * h.x) + h.y * 60.));
  return starTint(fract(k.y * 37.3 + h.x)) * I * exp(-d * d / (r * r));
}

// The few dozen brightest stars: soft glow, faint diffraction cross; swell into bokeh discs when defocused.
vec3 brightStars(vec2 q, float blur, float ghost){
  const float S = 5.5;
  vec2 g = q * S; vec2 id = floor(g); vec2 f = g - id;
  vec3 acc = vec3(0.);
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 o = vec2(float(i), float(j));
    vec2 cid = id + o;
    vec2 k = hash22(cid * 1.7 + 3.9);
    if (k.x > .62) continue;
    vec2 h = hash22(cid + 71.3);
    vec2 dv = (o + h - f) / S;
    float d = length(dv);
    float m3 = k.y * k.y * k.y;
    float mag = .32 + 2.0 * m3;
    float r = .0024 * (.8 + .6 * k.y);
    r = max(r, 1.1 / uRes.y);
    vec3 tint = starTint(fract(k.y * 91.7 + h.x));
    if (ghost > 0.) {                       // afterimage: only the brightest, blurred, complementary colour
      float R = .012 + .012 * k.y;
      acc += (vec3(1.05) - tint) * m3 * exp(-d * d / (R * R));
      continue;
    }
    float tw = .80 + .20 * sin(uTime * (.8 + 2.1 * h.x) + h.y * 50.);
    float core = exp(-d * d / (r * r));
    float halo = r * r / (d * d + r * r);
    vec2 sd = rot(.42) * dv;
    float sp = exp(-abs(sd.x) / (r * .32)) * exp(-abs(sd.y) / (r * 7.))
             + exp(-abs(sd.y) / (r * .32)) * exp(-abs(sd.x) / (r * 7.));
    float sharp = mag * tw * (core * 1.5 + halo * .20 + sp * .45 * m3 + exp(-d / (r * 9.)) * .05 * m3);
    float R = r + blur * (.020 + .022 * k.y);
    float disc = smoothstep(R, R * .80, d) * (.72 + .40 * smoothstep(.5 * R, .95 * R, d));
    float soft = mag * disc * min(1., r * r / (R * R) * 16.);
    acc += tint * mix(sharp, soft, smoothstep(0., .22, blur));
  }
  return acc;
}

// Milky Way: an arc of unresolved stars, split by dust lanes. dens feeds the faint star layers.
vec3 milkyWay(vec2 q, vec2 rel, float blur, out float dens){
  float v = length(q) - BAND_R;
  float aS = atan(rel.x, rel.y);
  float aB = (-.27 * gAsp - POLE.x) / BAND_R;
  float bulge = exp(-(aS - aB) * (aS - aB) / .030);
  float w = .092 + .075 * bulge;
  float env = exp(-v * v / (w * w));
  dens = 0.;
  if (env < .004) return vec3(0.);
  vec2 bp = vec2(atan(q.x, q.y) * BAND_R, v);
  float n = fbm(bp * vec2(2.7, 5.2) + 4.);
  float l = fbm(bp * vec2(4.1, 7.6) + vec2(n * 1.3, 0.) + 23.);
  float rift = smoothstep(.40, .62, l) * exp(-pow((v + .010 - .05 * (n - .5)) / (w * .62), 2.));
  dens = env * (.22 + 1.75 * n * n) * (1. - .92 * rift) * (.75 + .6 * bulge);
  dens = mix(dens, env * .55, blur);
  vec3 c = mix(vec3(.11, .12, .34), vec3(.60, .57, .95), smoothstep(0., 1.1, dens));
  c += vec3(.50, .30, .22) * bulge * smoothstep(.2, 1.2, dens);
  float spots = smoothstep(.70, .92, vnoise(bp * vec2(8., 13.) + 50.)) * (1. - blur);
  c += vec3(.75, .22, .42) * spots * .35;
  return c * dens * .36;
}

// The whole sky. dawn: 0 = deep night … 1 = sun on the ridge. moonT: see moonPos. blur: 0 sharp … 1 defocused.
vec3 sky(vec2 uv, float dawn, float moonT, float blur){
  vec2 pp = uPointer * vec2(1., .6);
  float e = uv.y - HORIZON;
  vec2 mp = moonPos(moonT) - pp * .004;
  float sx = -.17 * gAsp;
  float rise = smoothstep(.86, 1., dawn);
  float hs = ridgeFar(sx + pp.x * .006);
  vec2 sunC = vec2(sx, hs - SUN_R * 1.3 + SUN_R * 1.12 * rise);

  // ---- air: night gradient growing into the layered colours of dawn
  float dv = smoothstep(0., .45, dawn), dr = smoothstep(.2, .7, dawn);
  float dp = smoothstep(.4, .9, dawn),  dg = smoothstep(.62, 1., dawn);
  float off = abs(uv.x - sx) / max(gAsp, .8);
  float ee = max(e, 0.) * (1. + .75 * smoothstep(0., 1.1, off) * dv);
  vec3 Z = mix(vec3(.009, .011, .030), vec3(.026, .034, .100), dawn);
  vec3 H = mix(vec3(.040, .049, .104), vec3(.150, .112, .300), dv);
  vec3 col = mix(Z, H, exp(-ee / mix(.20, .40, dv)));
  col += vec3(.010, .026, .030) * exp(-ee / .07) * (1. - dv);                 // airglow
  col = mix(col, vec3(.70, .27, .37), dr * .92 * exp(-ee / .215));              // rose
  col = mix(col, vec3(1.02, .60, .40), dp * exp(-ee / .120));                   // peach
  col = mix(col, vec3(1.10, .87, .57), dg * exp(-ee / .056));                   // pale gold
  float dm = length(uv - mp);
  col += vec3(.81, .78, 1.) * (.060 * exp(-dm / .30) + .110 * exp(-dm / .080)) * (1. - .85 * dv); // moon haze
  col += vec3(1., .52, .24) * smoothstep(.45, 1., dawn) * .30
       * exp(-length((uv - vec2(sx, HORIZON)) * vec2(.5, 1.25)) / .15);

  // ---- stars + Milky Way, in the slowly turning frame of the sky
  float sv = 1. - smoothstep(0., .42, dawn);
  float bv = 1. - .88 * smoothstep(.15, 1., dawn);
  float ext = smoothstep(-.01, .24, e);
  mat2 R = rot(-uTime * .0022 - .30);
  vec3 st = vec3(0.);
  float mw = 0.;
  if (sv > .001) {
    vec2 rel = uv - POLE;
    col += milkyWay(R * (rel + pp * .003), rel, blur, mw) * sv * ext;
    float md = min(mw * 1.1, 1.);
    st += starField(R * (rel + pp * .003), 88., 0., .0011, .26 + .74 * md, blur * .014, .22) * sv;
    st += starField(R * (rel + pp * .006), 41., 31., .0015, .42 + .45 * md, blur * .016, .28) * sv;
  }
  st += starField(R * (uv - POLE + pp * .010), 17., 67., .0021, .55, blur * .018, .34) * mix(sv, bv, .6);
  st += brightStars(R * (uv - POLE + pp * .015), blur, 0.) * bv;
  st *= ext * clamp(1. - 2.6 * lum(col) * dv, 0., 1.);
  st *= 1. - .38 * exp(-dot(uv / vec2(.36 * gAsp + .12, .17), uv / vec2(.36 * gAsp + .12, .17)));  // calm centre

  // ---- crescent moon (lit limb toward the sun, below the horizon to the lower left), earthshine
  vec2 md2 = rot(-.95) * (uv - mp) / MOON_R;
  float mr = length(md2);
  float mb = .035 + blur * 1.1;
  float mdisc = smoothstep(1. + mb, 1. - mb, mr);
  float lit = smoothstep(mb * 1.3, -mb * 1.3, md2.x + .66 * sqrt(max(0., 1. - md2.y * md2.y))) * mdisc;
  float mtex = .80 + .28 * vnoise(md2 * 2.6 + 7.) - .12 * vnoise(md2 * 6.3);
  float limb = .70 + .30 * sqrt(max(0., 1. - mr * mr));
  vec3 moonLit = mix(vec3(1.50, 1.44, 1.82), vec3(.80, .72, .74), dv) * mtex * limb;
  vec3 moonC = moonLit * lit + vec3(.030, .034, .052) * mdisc * (1. - dv);
  float blob = exp(-mr * mr / (1.2 + 5. * blur));
  moonC = mix(moonC, mix(vec3(.26, .25, .36), vec3(.30, .24, .26), dv) * blob, smoothstep(0., .8, blur));
  st *= 1. - mdisc;
  col += st;
  col = mix(col, col + moonC, 1. - .35 * dv * (1. - lit));

  // ---- high cloud on a receding plane: moonlit wisps by night, lit from below at dawn
  float cenv = smoothstep(.012, .07, e) * (1. - smoothstep(.20, .50, e));
  if (cenv > .002) {
    vec2 cq = cloudUV(uv, pp.x * .010);
    float cn = cfbm(cq);
    float bank = vnoise(cq * .23 + 5.);                       // banks and clear lanes
    vec2 L = mix(mp, sunC, dv);
    float cn2 = cfbm(cloudUV(uv + normalize(L - uv + 1e-4) * .012, pp.x * .010));
    float cover = mix(.60, .50, dv) - .24 * (bank - .5);
    float craw = smoothstep(cover, cover + .22, cn);
    float cd = mix(craw * cenv, cenv * .25, blur);
    float edge = smoothstep(0., .16, cn - cn2) * (1. - blur * .7);
    float under = 1. - .6 * craw;
    // night: lavender where the moon is behind them
    vec3 nightC = vec3(.81, .78, 1.) * (.035 + .46 * exp(-dm * 3.8)) * (.30 + under * .35 + edge * .75);
    // dawn: we look at their undersides; the far ones already catch the sun
    float z = cq.y / 1.25;
    float far = smoothstep(1.2, 6., z);
    float az = exp(-off * off * 2.2);
    vec3 body = mix(vec3(.095, .075, .160), vec3(.34, .17, .25), far * dp);
    vec3 glowC = mix(vec3(1.0, .36, .40), vec3(1.15, .74, .42), smoothstep(.2, 1., far * az) * dg);
    float litAmt = smoothstep(.25, .95, dawn) * (.12 + .88 * far) * (.45 + .55 * az);
    vec3 dawnCol = mix(col, body, cd * .8) + glowC * litAmt * cd * (under * .42 + edge * .50);
    vec3 nightCol = col * (1. - .55 * cd) + nightC * cd;
    col = mix(nightCol, dawnCol, dv);
  }

  // ---- the sun's first edge
  float sd = length(uv - sunC);
  float sb = .0015 + blur * .03;
  col += vec3(7., 4.1, 1.7) * smoothstep(SUN_R + sb, SUN_R - sb, sd) * step(.001, rise);
  col += vec3(1.25, .62, .24) * rise * exp(-sd / .034) * .9;

  // ---- ridges: far one in haze, near one black; mist pooled between them
  float rw = .0016 + blur * .03;
  float hf = ridgeFar(uv.x + pp.x * .006);
  float mf = smoothstep(hf + rw, hf - rw, uv.y);
  if (mf > 0.) {
    vec3 hazeN = vec3(.022, .028, .058), hazeD = mix(vec3(.30, .16, .24), vec3(.95, .50, .30), dp * exp(-off * off * 3.));
    vec3 fc = mix(vec3(.011, .014, .031), vec3(.085, .052, .120), dv);
    float mist = smoothstep(hf + .004, hf - .075, uv.y);
    fc = mix(fc, mix(hazeN, hazeD, dv), mist * mix(.55, .70, dv));
    fc += vec3(1.1, .50, .20) * rise * .45 * exp(-sd / .05);
    col = mix(col, fc, mf);
    float hn = ridgeNear(uv.x + pp.x * .016);
    float mn = smoothstep(hn + rw, hn - rw, uv.y);
    col = mix(col, mix(vec3(.0035, .0045, .011), vec3(.020, .013, .030), dv), mn);
  }
  return col;
}
`;

  /* ---------------------------------------------------------------- shared eyelids (copy of threshold.js) */
  const LIDS = `
const float LID_MEET = -.17;   // where the lids meet: below centre, because the upper lid does most of the travelling
// Eyelids seen from behind them. open: 1 = wide (margins out of frame) … 0 = shut.
// Returns how much of the world gets through; rim = closeness to a lid margin, for shading the lid itself.
float lids(vec2 uv, float open, out float rim){
  float xn = uv.x / (.5 * gAsp);
  float x2 = xn * xn;
  float T  = mix(LID_MEET - .10, 1.22, pow(open, 1.6));
  float B  = mix(LID_MEET, -.95, pow(open, 1.3));
  float kT = mix(.085, -.43, smoothstep(0., .75, open));
  float kB = mix(.085, .21, open);
  float dT = T + kT * x2 - uv.y;          // > 0 below the upper margin
  float dB = uv.y - (B + kB * x2);        // > 0 above the lower margin
  // the margins are millimetres from the lens: hopelessly out of focus
  float a = smoothstep(-.050, .085, dT) * smoothstep(-.032, .055, dB);
  // lashes: blurred streaks fanning out from each margin, upper ones long, lower ones short
  float sT = xn * (1. - .45 * clamp(dT, 0., .5)) + .013 * sin(uv.y * 9.);
  float lT = .62 * vnoise(vec2(sT * 47., 1.7)) + .38 * vnoise(vec2(sT * 121., 5.1));
  float reachT = 1. - smoothstep(0., .11 + .09 * vnoise(vec2(sT * 23., 8.)), dT);
  a *= 1. - .78 * smoothstep(.30, .72, lT) * reachT * reachT;
  float sB = xn * (1. - .35 * clamp(dB, 0., .5));
  float lB = .6 * vnoise(vec2(sB * 39., 3.3)) + .4 * vnoise(vec2(sB * 97., 6.4));
  float reachB = 1. - smoothstep(0., .045 + .04 * vnoise(vec2(sB * 19., 2.)), dB);
  a *= 1. - .60 * smoothstep(.36, .76, lB) * reachB * reachB;
  rim = exp(min(dT, 0.) / .075) * exp(min(dB, 0.) / .055);
  return a;
}
`;

  const FRAG = `
uniform float uOpen;     // eyelid openness 0 → 1
uniform float uDefocus;  // 1 bokeh → 0 sharp
uniform float uDawn;     // 0 night … 1 sun on the ridge
uniform float uGlow;     // sunlight through the closed lids
uniform float uMotes;    // how much of the dream is left (motes)
uniform float uShards;   // how much of the dream is left (larger fragments)
uniform float uAdapt;    // 0 dazzled → 1 adapted to the light
` + SKY + LIDS + `
vec3 dreamCol(float h, float t){
  vec3 rose = vec3(1., .494, .714), gold = vec3(1., .76, .48);
  vec3 irid = pal(h * 2.3 + t, vec3(.74, .66, .80), vec3(.26, .26, .20), vec3(1.), vec3(0., .33, .62));
  return mix(mix(rose, gold, smoothstep(.25, .75, fract(h * 7.13))), irid, .42 * step(.62, fract(h * 3.71)));
}

// Motes of the dream rising and evaporating. Near layers are big soft bokeh, far ones sharp sparks.
vec3 embers(vec2 uv, float amt){
  vec3 acc = vec3(0.);
  vec2 pp = uPointer * vec2(1., .6);
  for (int i = 0; i < 5; i++) {
    float fi = float(i), dep = fi / 4.;
    float sc = mix(5., 27., dep * .6 + dep * dep * .4);
    float sp = mix(.050, .011, dep);
    vec2 g = (uv + pp * mix(.035, .004, dep)) * sc + fi * 3.7;
    g.y -= (uTime * sp + uProgress * mix(2.2, .5, dep)) * sc;
    g.x += .35 * sin(g.y * .55 + fi * 2.1);
    vec2 id = floor(g); vec2 f = g - id;
    vec2 k = hash22(id.yx * 1.37 + fi * 5.7 + 2.3);
    // fewer survive as the dream is forgotten, and fewer the higher they have risen
    float plume = smoothstep(.22, .72, vnoise(vec2(uv.x * 2.4 + fi * 1.9, uv.y * 1.1 - uTime * .018 - uProgress * 1.3 + fi)));
    float keep = .80 * amt * (.25 + .75 * plume) * (1. - .72 * smoothstep(-.5, .55, uv.y + (k.y - .5) * .5));
    if (k.x > keep) continue;
    float life = smoothstep(keep, keep - .14, k.x);
    vec2 h = hash22(id + fi * 17.31);
    vec2 c = .5 + (h - .5) * .55;
    float d = length(f - c) / sc;
    float r = mix(.015, .0015, pow(dep, .6)) * (.40 + 1.2 * h.x * h.x) * (.45 + .55 * life);
    r = max(r, .9 / uRes.y);
    float flick = .62 + .38 * sin(uTime * (.7 + 2. * h.y) + k.y * 40.);
    float I;
    if (dep < .45) I = smoothstep(r, r * .68, d) * (.55 + .6 * smoothstep(.45 * r, r, d)) * mix(.085, .20, dep / .45);
    else I = exp(-d * d / (r * r)) * mix(.7, 1.7, k.y) + .05 * r * r / (d * d + r * r);
    acc += dreamCol(k.y + fi * .37, uTime * .05 + h.x) * I * life * flick;
  }
  return acc;
}

// Larger fragments of the dream: thin iridescent flakes that tumble upward and sublimate like frost.
vec3 shards(vec2 uv, float amt){
  vec3 acc = vec3(0.);
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float sc = mix(3.1, 5.3, fi);
    vec2 g = (uv + uPointer * vec2(1., .6) * mix(.030, .014, fi)) * sc + fi * 7.7;
    g.y -= (uTime * mix(.020, .013, fi) + uProgress * mix(1.5, .9, fi)) * sc;
    vec2 id = floor(g); vec2 f = g - id;
    vec2 k = hash22(id * 1.9 + 4.4 + fi);
    if (k.x > .40) continue;
    vec2 h = hash22(id + 91.7 + fi * 13.);
    vec2 p = (f - (.5 + (h - .5) * .36)) / sc;
    p = rot(h.x * 6.283 + uTime * (k.y - .5) * .22) * p;
    p.x *= 1.5 + .9 * h.y;                                   // seen edge-on to varying degrees
    float s = (.020 + .022 * k.y) * mix(1., .72, fi);
    float sd = -1.;
    for (int j = 0; j < 3; j++) {
      float a = float(j) * 2.094 + (hash11(k.x * 91. + float(j) * 7.3) - .5) * 1.1;
      sd = max(sd, dot(p, vec2(cos(a), sin(a))) - s * (.55 + .7 * hash11(k.y * 53. + float(j))));
    }
    float diss = clamp(1.05 - amt * 1.25 + (k.y - .5) * .5 + .35 * smoothstep(-.4, .5, uv.y), 0., 1.2);
    float er = vnoise(p * 70. + id * 7.) * .62 + vnoise(p * 190. + id * 3.) * .38;
    float alive = smoothstep(diss - .08, diss + .10, er) * smoothstep(1.15, .9, diss);
    float inside = smoothstep(.003, -.004, sd);
    float film = dot(p, vec2(cos(h.y * 6.), sin(h.y * 6.))) * 26. + k.y * 5. + uTime * .07;
    vec3 c = dreamCol(k.x * 3. + film * .08, film * .12);
    float glint = .5 + .5 * sin(film * 2.3 + uTime * .5);
    float I = inside * (.10 + .16 * glint) * (1. + 2.5 * smoothstep(-.012, 0., sd)) + .10 * exp(-abs(sd) / .004);
    // crumbling rim: bright dust where the flake is being eaten away
    I += inside * .45 * smoothstep(.10, 0., abs(er - diss)) * step(.02, diss);
    acc += c * I * alive * mix(1., .6, fi);
  }
  return acc;
}

// Sunlight through a closed eyelid: blood-red to orange, brighter toward the light, with soft vessel shadows.
vec3 lidGlow(vec2 uv, float g, float rim){
  vec2 p = uv + .018 * vec2(sin(uTime * .11), cos(uTime * .09));        // the eye drifting under the lid
  vec2 src = vec2(-.17 * gAsp, -.44);
  float d = length((p - src) * vec2(.72 / max(gAsp, .8) * 1.3, 1.));
  float fall = exp(-d * d * 2.1);
  float org = fbm(p * 1.35 + vec2(uTime * .013, -uTime * .010));
  float I = g * (.20 + .86 * fall) * (.66 + .68 * org) * (1. + .45 * rim);
  vec2 w = p + .14 * vec2(snoise(p * 1.1 + 3.1), snoise(p * 1.1 + 9.7)) + .04 * org;
  float v1 = 1. - abs(snoise(w * 1.7 + 1.3));
  float v2 = 1. - abs(snoise(w * 4.4 - 4.1));
  float ves = pow(smoothstep(.60, 1., v1), 1.6) * .80 + smoothstep(.68, 1., v2) * .30 * smoothstep(.3, .7, vnoise(w * 1.6 + 2.));
  I *= 1. - .24 * ves;
  I = max(I, 0.);
  vec3 c = vec3(.92 * (1. - exp(-2.0 * I)), .30 * I * I, .07 * I * I * I);
  c.gb *= 1. - .30 * ves;
  return c;
}

void main(){
  gAsp = uRes.x / uRes.y;
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  uv.y += .0014 * sin(uTime * 1.25);                // breathing

  float rim = 0., ap = 0.;
  if (uOpen > .001) ap = uOpen > .999 ? 1. : lids(uv, uOpen, rim);

  vec3 col = vec3(0.);
  if (ap > .001) {
    col = sky(uv, uDawn, mix(.78, 1., uDawn), uDefocus);
    // dazzle: the first light is too much, then the eye adapts
    float dz = 1. - uAdapt;
    col = col * (1. + 1.5 * dz) + vec3(.95, .62, .46) * .30 * dz * (.6 + .4 * smoothstep(.5, -.5, uv.y));
  }
  if (ap < .999) {
    vec3 lid = vec3(.006, .005, .011);
    if (uGlow > .001) lid += lidGlow(uv, uGlow, rim);
    if (uMotes > .001) {
      vec3 dream = embers(uv, uMotes);
      if (uShards > .001) dream += shards(uv, uShards);
      // what is left of the dream itself: a low veil the motes lift off from
      float veil = fbm(uv * vec2(1.3, 2.2) + vec2(uTime * .012, -uTime * .03 - uProgress * 1.2));
      veil = smoothstep(.30, .72, veil) * exp(-(uv.y + .5) * 2.4) * uShards;
      dream += dreamCol(veil * .6 + uv.x * .3, uTime * .02) * veil * .42;
      lid += dream * (1. - .7 * uGlow);
    }
    col = mix(lid, col, ap);
  }
  fragColor = vec4(max(col, 0.) * uFade, 1.);
}
`;

  let prog;
  D.registerScene({
    id: 'dawn',
    init(ctx) {
      prog = ctx.util.fullscreen(ctx.glsl.head + ctx.glsl.noise + FRAG, 'dawn');
    },
    render(s) {
      const ss = D.util.smoothstep, cl = D.util.clamp;
      const p = s.progress, t = s.time;
      const motes = 1 - ss(0.03, 0.46, p);
      const shards = 1 - ss(0.0, 0.27, p);
      const glow = 0.58 * ss(0.19, 0.50, p) * (1 + 0.035 * Math.sin(t * 0.8));
      // flutter: a slit, shut again, half open, a half-blink, then open
      let open = 0.24 * ss(0.50, 0.545, p) - 0.19 * ss(0.545, 0.585, p) + 0.50 * ss(0.585, 0.635, p)
               - 0.20 * ss(0.635, 0.665, p) + 0.65 * ss(0.665, 0.73, p);
      open += 0.05 * Math.sin(t * 1.3) * Math.sin(t * 0.37 + 1) * open * (1 - open);
      open = cl(open, 0, 1);
      const dawn = 0.40 + 0.60 * cl((p - 0.5) / 0.5, 0, 1);
      const defocus = 1 - ss(0.53, 0.76, p);
      const adapt = ss(0.52, 0.76, p);
      prog.use().common(s);
      prog.f1('uOpen', open).f1('uDefocus', defocus).f1('uDawn', dawn).f1('uGlow', glow)
        .f1('uMotes', motes).f1('uShards', shards).f1('uAdapt', adapt);
      D.util.drawQuad();
    },
  });
})();
