/* Scene `threshold` — 23:14, awake, lying in the dark, eyes closing.
   p 0 → .45  night sky (stars in parallax layers, Milky Way arch, crescent moon, moonlit cirrus, ridge)
   p .45 → .88 the eyelids close (one slow blink that reopens, then shut for good); sky defocuses + dims
   p .88 → 1  closed eyes: Eigengrau with fading complementary afterimages of the moon and bright stars

   The SKY / LIDS chunks are shared by copy with dawn.js (same place, other end of the night). */
(function () {
  'use strict';
  const D = window.DREAM;

  /* ---------------------------------------------------------------- shared sky (copy in dawn.js) */
  const SKY = `
const vec2  POLE    = vec2(.45, -1.5);   // centre of the sky's rotation, far below the horizon (we face south)
const float BAND_R  = 1.9;               // the Milky Way is an arc about POLE, so rotation never moves it off-frame
const float HORIZON = -.405;
const float MOON_R  = .037;
const float SUN_R   = .021;
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
  vec3 H = mix(vec3(.040, .049, .104), vec3(.170, .110, .285), dv);
  vec3 col = mix(Z, H, exp(-ee / mix(.20, .40, dv)));
  col += vec3(.010, .026, .030) * exp(-ee / .07) * (1. - dv);                 // airglow
  col = mix(col, vec3(.70, .27, .37), dr * .92 * exp(-ee / .185));              // rose
  col = mix(col, vec3(1.02, .60, .40), dp * exp(-ee / .092));                   // peach
  col = mix(col, vec3(1.10, .87, .57), dg * exp(-ee / .040));                   // pale gold
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
  float z = .2 / (max(e, 0.) + .04);
  vec2 cq = vec2((uv.x + pp.x * .010) * z + uTime * .0035, z) * vec2(.5, 2.0);
  float cenv = smoothstep(0., .05, e) * (1. - smoothstep(.24, .58, e));
  if (cenv > .002) {
    float cn = fbm(cq + vec2(0., 3.));
    vec2 L = mix(mp, sunC, dv);
    vec2 uv2 = uv + normalize(L - uv + 1e-4) * .022;
    float z2 = .2 / (max(uv2.y - HORIZON, 0.) + .04);
    float cn2 = fbm(vec2((uv2.x + pp.x * .010) * z2 + uTime * .0035, z2) * vec2(.5, 2.0) + vec2(0., 3.));
    float cover = mix(.52, .46, dv);
    float cd = smoothstep(cover, cover + .27, cn) * cenv;
    cd = mix(cd, cenv * .22, blur);
    float edge = smoothstep(0., .22, cn - cn2) * (1. - blur * .7);
    float thin = cd * (1. - cd) * 4.;
    // night
    vec3 nightC = vec3(.81, .78, 1.) * (.040 + .50 * exp(-dm * 3.6)) * (.35 + edge * .9 + thin * .25);
    // dawn
    float far = smoothstep(.45, 2.6, z);
    float az = exp(-off * off * 2.2);
    vec3 body = mix(vec3(.105, .078, .165), vec3(.30, .15, .23), far * dp);
    vec3 glowC = mix(vec3(1.05, .34, .40), vec3(1.30, .80, .40), far * az * dg + .25 * far);
    float litAmt = smoothstep(.25, .95, dawn) * (.22 + .78 * far) * (.40 + .60 * az);
    vec3 dawnCol = mix(col, body, cd * .85) + glowC * litAmt * cd * (edge * 1.15 + thin * .30 + .10);
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

  /* ---------------------------------------------------------------- shared eyelids (copy in dawn.js) */
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
uniform float uOpen;     // eyelid openness 1 → 0
uniform float uDefocus;  // 0 sharp → 1 bokeh
uniform float uDim;      // exposure of the sky as the lids come down
uniform float uGrey;     // Eigengrau emerging once no light gets in
uniform vec2  uAfter;    // afterimage strength: x positive (same colour), y negative (complementary)
` + SKY + LIDS + `
// Eigengrau: the visual system's own dark light. Slow blotches plus fine crawling retinal noise.
vec3 eigengrau(vec2 uv, float t){
  float n1 = fbm(uv * 2.1 + vec2(t * .030, -t * .021));
  float n2 = snoise(vec3(uv * 13., t * .22));
  float n3 = snoise(vec3(uv * 47., t * .55));
  float g = .041 + .026 * (n1 - .5) + .0055 * n2 + .0040 * n3;
  return vec3(g * .94, g * .95, g * 1.24);
}

void main(){
  gAsp = uRes.x / uRes.y;
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  uv.y += .0014 * sin(uTime * 1.25);                // breathing

  float rim = 0., ap = 1.;
  if (uOpen < .999) ap = lids(uv, uOpen, rim);

  vec3 col = vec3(0.);
  if (ap > .001) col = sky(uv, 0., 0., uDefocus) * uDim;

  if (ap < .999) {
    vec3 grey = eigengrau(uv, uTime);
    // the inside of the lid: near-black while light still gets in, the brain's own grey once it does not
    vec3 lid = grey * mix(.16, 1., uGrey);
    lid += vec3(.60, .56, .80) * .030 * rim * uDim * smoothstep(0., .25, uOpen);   // moonlight caught on the wet margin
    if (uAfter.x + uAfter.y > .001) {
      // afterimages drift and sink a little, as they do when the eye relaxes
      vec2 dr = vec2(.014 * sin(uTime * .17), -.020 * uGrey + .010 * cos(uTime * .13));
      vec2 auv = uv - dr;
      vec2 md = (auv - moonPos(0.)) / MOON_R;
      md = rot(-.95) * md;
      float cres = exp(-(pow(md.x + .55, 2.) * .55 + md.y * md.y * .22));
      float ghostM = cres + .25 * exp(-dot(md, md) * .03);
      vec3 ghostS = brightStars(rot(-uTime * .0022 - .30) * (auv - POLE), 0., 1.);
      float breathe = .8 + .2 * sin(uTime * .6);
      lid += vec3(.60, .58, .82) * ghostM * .16 * uAfter.x;
      lid += (vec3(.34, .30, .02) * ghostM * .15 + ghostS * .055) * uAfter.y * breathe;
    }
    col = mix(lid, col, ap);
  }
  fragColor = vec4(max(col, 0.) * uFade, 1.);
}
`;

  let prog;
  D.registerScene({
    id: 'threshold',
    init(ctx) {
      prog = ctx.util.fullscreen(ctx.glsl.head + ctx.glsl.noise + FRAG, 'threshold');
    },
    render(s) {
      const ss = D.util.smoothstep, cl = D.util.clamp;
      const p = s.progress, t = s.time;
      // one slow blink that reopens a little, then closed for good
      let open = 1 - 0.82 * ss(0.42, 0.60, p) + 0.34 * ss(0.60, 0.70, p) - 0.52 * ss(0.70, 0.88, p);
      open += 0.05 * Math.sin(t * 1.3) * Math.sin(t * 0.37 + 1) * open * (1 - open);   // heavy lids tremble
      open = cl(open, 0, 1);
      const defocus = cl(0.80 * ss(0.44, 0.61, p) - 0.38 * ss(0.61, 0.70, p) + 0.58 * ss(0.70, 0.86, p), 0, 1);
      const dim = 1 - 0.55 * ss(0.45, 0.88, p);
      const grey = ss(0.82, 0.95, p);
      const pos = ss(0.80, 0.88, p) * (1 - ss(0.88, 0.94, p));
      const neg = ss(0.87, 0.93, p) * (1 - ss(0.94, 1.0, p));
      prog.use().common(s);
      prog.f1('uOpen', open).f1('uDefocus', defocus).f1('uDim', dim).f1('uGrey', grey).f2('uAfter', pos, neg);
      D.util.drawQuad();
    },
  });
})();
