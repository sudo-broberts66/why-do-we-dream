/* Scene `octopus` — 04:45, "we are not the only ones".
   A macro view of a sleeping octopus at night. Two passes:
     1. a small "pattern field" texture: per-pigment chromatophore expansion (yellow, red-brown,
        dark brown) + papillae height, a pure function of (progress, time) over skin coordinates;
     2. the picture: a short sphere-trace of head + mantle + closed eye + curled arm, skinned with
        thousands of individual chromatophore sacs that each read the pattern field at their own
        centre (so every sac expands or contracts as a unit), over leucophore / iridophore skin.
   Progress: 0-.3 quiet sleep, .3-.8 active sleep (six display patterns flowing into one another),
   .8-1 settles, recedes into dark water, a few motes remain. */
(function () {
  'use strict';
  const D = window.DREAM;
  const PW = 640, PH = 400;          // pattern-field resolution
  const QX = 2.4, QY = 1.5;          // half-extent of the pattern field in skin units
  let gl, patProg, mainProg, patFbo = null, patTex = null;

  const PATTERN_FS = `
uniform float uAct;   // overall active-sleep amount (0 quiet .. 1)
const vec2 Q = vec2(${QX.toFixed(2)}, ${QY.toFixed(2)});
float win(float x, float a, float b, float s){ return smoothstep(a - s, a + s, x) * (1. - smoothstep(b - s, b + s, x)); }
void main(){
  vec2 q = (gl_FragCoord.xy / uRes - .5) * 2. * Q;   // skin coordinates, the eye is at (0,0)
  float t = uTime;
  // the "dream phase" at this patch of skin: progress, made ragged and wandering so that the
  // border between two displays is a front that sweeps and breathes across the body
  float wob = snoise(vec3(q * .65, t * .06)) * .03 + snoise(vec3(q * 2.1 + 5., t * .1)) * .012;
  float ph = uProgress + wob + q.x * .012 - q.y * .006;
  float act = smoothstep(.275, .335, ph) * (1. - smoothstep(.79, .87, ph));
  float gust = .74 + .26 * snoise(vec3(q * .45 + 9., t * .2));

  // quiet sleep: everything contracted to dots, with the faintest slow tide
  vec3 quiet = vec3(.07, .035, .02) + .04 * snoise(vec3(q * 1.3, t * .05));
  vec3 E = vec3(0.); float pap = 0.; float W = 0.;

  // 1. passing clouds: dark fronts travelling across pale skin
  float w1 = win(ph, .28, .405, .02);
  if (w1 > .001) {
    float s = dot(q, vec2(.8, .6)) * 2.3 - t * .5 + 1.5 * snoise(vec3(q * .8, t * .04));
    float band = pow(.5 + .5 * sin(s), 3.);
    float ramp = smoothstep(.28, .36, ph);
    band *= .35 + .65 * ramp;
    E += w1 * vec3(.22 + .6 * band, band * .95, band * band * .75); pap += w1 * band * .5; W += w1;
  }
  // 2. mottle: sudden dark blotches, papillae up
  float w2 = win(ph, .405, .49, .02);
  if (w2 > .001) {
    float m = snoise(vec3(q * 4.2, t * .1)) + .6 * snoise(vec3(q * 9. + 3., t * .17));
    E += w2 * vec3(.75, smoothstep(-.35, .45, m) * .9, smoothstep(.05, .65, m)); pap += w2 * (.45 + .5 * smoothstep(-.2, .6, m)); W += w2;
  }
  // 3. flush: the whole animal goes deep red-brown, pulsing
  float w3 = win(ph, .49, .57, .02);
  if (w3 > .001) {
    float f = .82 + .18 * snoise(vec3(q * 1.1, t * .28));
    float dk = smoothstep(-.1, .6, snoise(vec3(q * 2.6 + 11., t * .08)));
    E += w3 * vec3(1., f, .42 * f + .3 * dk); pap += w3 * .22; W += w3;
  }
  // 4. disruptive camouflage: big hard-edged pale and dark blocks
  float w4 = win(ph, .57, .655, .02);
  if (w4 > .001) {
    float n = snoise(vec3(q * 1.45 + vec2(3.1, -1.7), t * .025)) + .22 * snoise(q * 5.5 + 2.);
    float dark = smoothstep(-.05, .06, n);
    float spots = smoothstep(.62, .7, snoise(q * 7.5 + 20.)) * dark;   // white spots inside the dark blocks
    dark *= 1. - spots;
    E += w4 * mix(vec3(.08, .02, .01), vec3(.92, .86, .93), dark); pap += w4 * (.15 + .8 * dark); W += w4;
  }
  // 5. pale, with a dark bar through the eye
  float w5 = win(ph, .655, .725, .016);
  if (w5 > .001) {
    vec2 e = q; float al = dot(e, normalize(vec2(1., .32))); float ac = dot(e, normalize(vec2(-.32, 1.)));
    ac += .05 * snoise(vec3(q * 3., t * .2));
    float bar = smoothstep(.17, .05, abs(ac)) * smoothstep(1.7, .5, abs(al));
    bar = max(bar, smoothstep(.36, .27, length(e)) * .8);
    E += w5 * vec3(.1 + .7 * bar, bar * .92, bar * .96); pap += w5 * (.1 + .3 * bar); W += w5;
  }
  // 6. flickering bands
  float w6 = win(ph, .725, .81, .02);
  if (w6 > .001) {
    float s = q.y * 8.5 + q.x * 2.6 + 1.6 * snoise(q * 1.2 + 4.);
    float id = floor(s), f = fract(s);
    float band = smoothstep(.0, .14, f) * (1. - smoothstep(.46, .6, f));
    float fl = smoothstep(.3, .62, vnoise(vec2(id * 7.31, t * 2.6)));
    float trav = .5 + .5 * sin(q.x * 3.2 - t * 3.6 + id * 1.7);
    float v = band * fl * (.45 + .55 * trav);
    v *= 1. - smoothstep(.77, .82, ph) * .6;
    E += w6 * vec3(.28 + .5 * v, v, v * .85); pap += w6 * .3 * v; W += w6;
  }
  E = mix(quiet, E / max(W, 1e-3) * gust, clamp(W, 0., 1.) * act);
  pap = .06 + pap / max(W, 1e-3) * clamp(W, 0., 1.) * act;
  // dream flicker: brief local startles of pigment on top of whatever display is running
  float flash = smoothstep(.5, .9, snoise(vec3(q * 1.0 + 30., t * .8))) * act * uAct;
  E.yz += flash * vec2(.5, .35);
  fragColor = vec4(clamp(E, 0., 1.), clamp(pap, 0., 1.));
}`;

  const MAIN_FS = `
uniform sampler2D uPat;
uniform vec3 uRo, uCu, uCv, uCw;
uniform float uFocal;
uniform float uBreath;   // -1..1 mantle swell
uniform vec4 uEye;       // xy: eyeball offset under the lid, z: lid opening, w: active-sleep amount
uniform vec4 uPtr;       // xy: pointer in skin coordinates, z: strength
uniform vec3 uPtrPos;    // pointer light, world
uniform vec4 uEnv;       // x: fog density, y: light level, z: end motes, w: snow amount
uniform vec3 uArm;       // x: curl tightness B, y: arm centre x, z: papilla raise
const vec2 Q = vec2(${QX.toFixed(2)}, ${QY.toFixed(2)});

const vec3 HEADC = vec3(.2, -1.45, -1.3), HEADR = vec3(2.1, 1.75, 1.6);
const vec3 MANTC = vec3(-2.35, -.55, -3.2), MANTR = vec3(2.4, 2.05, 2.2);
const vec3 EYEC = vec3(.0, .05, -.36);
const vec3 UVC = vec3(0., -1.6, -3.4);
const float UVR = 3.45;
const float ARM_K = .27, ARM_RS = .25;
vec3 gUVU, gUVV, gUVW, gEX, gEY, gEZ, gAX, gAY, gAZ, gArmC;

vec4 hash24(vec2 p){ vec4 p4 = fract(vec4(p.xyxy) * vec4(.1031, .1030, .0973, .1099)); p4 += dot(p4, p4.wzxy + 33.33); return fract((p4.xxyz + p4.yzzw) * p4.zywx); }
float smin(float a, float b, float k){ float h = max(k - abs(a - b), 0.) / k; return min(a, b) - h * h * k * .25; }
float sdEll(vec3 p, vec3 r){ float k0 = length(p / r); float k1 = length(p / (r * r)); return k0 * (k0 - 1.) / k1; }

void setup(){
  gUVW = normalize(EYEC - UVC); gUVU = normalize(cross(vec3(0., 1., 0.), gUVW)); gUVV = cross(gUVW, gUVU);
  gEZ = normalize(vec3(-.04, .42, .9)); gEX = normalize(cross(vec3(0., 1., 0.), gEZ)); gEY = cross(gEZ, gEX);
  gAZ = normalize(vec3(.1, .32, .94)); gAX = normalize(cross(vec3(0., 1., 0.), gAZ)); gAY = cross(gAZ, gAX);
  gArmC = vec3(uArm.y, -.47, .17);
}
vec2 skinUV(vec3 p){ vec3 n = normalize(p - UVC); return UVR * 2. * vec2(dot(n, gUVU), dot(n, gUVV)) / (1. + dot(n, gUVW)); }

// eye-local coordinates and the lid crease profile
vec3 eyeLocal(vec3 p){ vec3 e = p - EYEC; return vec3(dot(e, gEX), dot(e, gEY), dot(e, gEZ)); }
float lidLine(vec3 le){ return le.y + .012 + .32 * le.x * le.x; }
float lidMask(vec3 le){ return smoothstep(.25, .13, abs(le.x)) * smoothstep(.12, .2, le.z); }

float mapBody(vec3 p){
  float head = sdEll(p - HEADC, HEADR);
  float mant = sdEll(p - MANTC, MANTR * (1. + .028 * uBreath));
  float d = smin(head, mant, .55);
  vec3 le = eyeLocal(p);
  float bound = length(le) - .62;
  if (bound < .25) {
    float mound = length(le * vec3(1., 1.1, 1.)) - .29;
    d = smin(d, mound, .2);
    float ball = length(le - vec3(uEye.x, uEye.y - .01, .15)) - .17;
    d = smin(d, ball, .1);
    // supra-ocular papilla: the little horn above the eye, rising in active sleep
    float horn = length((le - vec3(.07, .245, .1)) * vec3(1., .75, 1.)) - (.028 + .03 * uArm.z);
    d = smin(d, horn, .05);
    // closed lid: a horizontal crease, the upper fold very slightly proud
    float ly = lidLine(le); float lm = lidMask(le);
    float wdt = .011 + .012 * uEye.z;
    d += lm * (.016 * exp(-ly * ly / (wdt * wdt)) - .006 * exp(-(ly - .03) * (ly - .03) / .0006));
    // concentric folds of skin around the eye
    float rr = length(le.xy * vec2(1., 1.25));
    d += .0028 * sin(rr * 85.) * smoothstep(.2, .27, rr) * smoothstep(.5, .36, rr);
  }
  return d;
}

// curled arm: a self-similar (log-spiral) tube with a straight stem, a row of suckers on the outside
vec4 gA;      // x: theta, y: outward offset, z: toward viewer, w: local spiral radius
vec4 gS;      // sucker-local xyz, w: sucker - tube distance
float mapArm(vec3 p){
  vec3 q = p - gArmC;
  float bound = length(q) - .62;
  if (bound > .3) { gS.w = 1.; return bound; }
  vec2 s = vec2(dot(q, gAX), dot(q, gAY)); float z = dot(q, gAZ);
  float B = uArm.x; float C = inversesqrt(1. + B * B);
  float rho = max(length(s), 1e-3); float phi = atan(s.y, s.x);
  float n = min(floor((log(rho / ARM_RS) / B + 3.14159 - phi) / 6.28318 + .5), 0.);
  float th = phi + 6.28318 * n;
  float rc = ARM_RS * exp(B * (th - 3.14159));
  float a = (rho - rc) * C;
  float dSp = length(vec2(a, z)) - ARM_K * rc;
  // straight stem leaving the coil at theta = pi
  vec2 P = vec2(-ARM_RS, 0.); vec2 T = vec2(-B, -1.) * C;
  vec2 sp = s - P; float al = max(dot(sp, T), 0.); float ac = dot(sp, vec2(-T.y, T.x));
  float dSt = length(vec3(sp - T * al, z)) - ARM_K * ARM_RS;
  float d;
  if (dSt < dSp) { d = dSt; th = 3.14159 + al / (ARM_RS / C); rc = ARM_RS; a = -ac; }
  else d = dSp;
  gA = vec4(th, a, z, rc);
  // suckers
  const float PT = .3;
  float thc = (floor(th / PT) + .5) * PT;
  float rcc = min(ARM_RS, ARM_RS * exp(B * (thc - 3.14159)));
  float w = ARM_K * rcc; float rs = .43 * w;
  vec3 l = vec3((th - thc) * rcc / C, a * (rcc / rc) - w * .78, z * (rcc / rc) - w * .62);
  float ds = length(l * vec3(1., 1., 1.25)) - rs;
  float pit = length(l - vec3(0., .55, .62) * rs) - rs * .55;
  ds = max(ds, -pit);
  gS = vec4(l / rs, ds - d);
  return smin(d, ds, .012) ;
}
float map(vec3 p){ return smin(mapBody(p), mapArm(p), .06); }

vec3 calcNormal(vec3 p, float e){
  const vec2 k = vec2(1., -1.);
  return normalize(k.xyy * map(p + k.xyy * e) + k.yyx * map(p + k.yyx * e) + k.yxy * map(p + k.yxy * e) + k.xxx * map(p + k.xxx * e));
}

// One pigment layer of chromatophores on a jittered hex lattice. Each sac samples the pattern field
// at its own centre. p: position in cell units; cw: size of a cell in pattern (skin) units.
// Returns x: coverage, y: expansion of the covering sac.
vec2 chroma(vec2 p, float seed, int ch, float aa, vec2 patUV, float cw, vec2 rr){
  p.y *= 1.1547;
  float r0 = floor(p.y), fy = p.y - r0;
  vec2 res = vec2(0.);
  for (int j = 0; j < 2; j++) {
    float row = r0 + (j == 0 ? 0. : (fy < .5 ? -1. : 1.));
    float px = p.x + .5 * mod(row, 2.);
    float c0 = floor(px), fx = px - c0;
    for (int i = 0; i < 2; i++) {
      float col = c0 + (i == 0 ? 0. : (fx < .5 ? -1. : 1.));
      vec4 h = hash24(vec2(col, row) + seed);
      vec2 dv = vec2(px - (col + .5 + (h.x - .5) * .5), (p.y - (row + .5 + (h.y - .5) * .5)) * .866);
      vec2 cuv = patUV - dv * cw;
      float E = texture(uPat, cuv / (2. * Q) + .5)[ch];
      // startle: sacs near the pointer contract a little
      vec2 pd = cuv - uPtr.xy; E *= 1. - uPtr.z * .55 * exp(-dot(pd, pd) * 9.);
      float th = mix(.25, .7, h.w);
      float e = smoothstep(th - .25, th + .25, E * 1.12);
      float rad = mix(rr.x, rr.y, e) * (.78 + .34 * h.z) * (1. + .05 * sin(uTime * (1.3 + 3. * h.z) + h.x * 50.));
      rad = min(rad, .64);
      float c = smoothstep(rad + aa, rad - aa, length(dv)) * mix(1., .8, e);
      if (c > res.x) res = vec2(c, e);
    }
  }
  return res;
}

// papillae: soft cones on a coarser lattice; returns height and gradient (in cell units)
vec3 papillae(vec2 p, vec2 patUV, float cw){
  p.y *= 1.1547;
  float r0 = floor(p.y), fy = p.y - r0;
  vec3 res = vec3(0.);
  for (int j = 0; j < 2; j++) {
    float row = r0 + (j == 0 ? 0. : (fy < .5 ? -1. : 1.));
    float px = p.x + .5 * mod(row, 2.);
    float c0 = floor(px), fx = px - c0;
    for (int i = 0; i < 2; i++) {
      float col = c0 + (i == 0 ? 0. : (fx < .5 ? -1. : 1.));
      vec4 h = hash24(vec2(col, row) + 91.7);
      vec2 dv = vec2(px - (col + .5 + (h.x - .5) * .5), (p.y - (row + .5 + (h.y - .5) * .5)) * .866);
      float E = texture(uPat, (patUV - dv * cw) / (2. * Q) + .5).a;
      float r = .3 + .25 * h.z; float k = max(1. - dot(dv, dv) / (r * r), 0.);
      float amp = E * (.5 + .5 * h.w);
      res += vec3(amp * k * k, amp * 2. * k * (-2. * dv / (r * r)));
    }
  }
  return res;
}

float caustic(vec2 p, float t){
  p = mod(p * 6.28318, 6.28318) - 250.;
  vec2 i = p; float c = 1.; const float inten = .005;
  for (int n = 0; n < 4; n++) {
    float tt = t * (1. - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1. / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 4.; c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.), 0., 1.);
}

float shafts(vec2 uv){
  vec2 lp = uv - vec2(-.3, 1.15);
  float a = atan(lp.x, -lp.y);
  float sh = vnoise(vec2(a * 8., uTime * .1)) * vnoise(vec2(a * 21. + 4., uTime * .17 + 3.));
  return pow(sh, 1.4) * smoothstep(2.1, .35, length(lp));
}

float snow(vec2 uv, float scale, float seed, float rad, float speed, float par, float sparse){
  vec2 p = uv * scale + vec2(seed * 17.3, seed * 9.1) + uPointer * par * scale;
  p.y += uTime * speed; p.x += sin(uTime * .11 + seed * 3.) * .15;
  vec2 id = floor(p), f = fract(p);
  vec4 h = hash24(id + seed * 31.);
  rad = max(rad * (.6 + .8 * h.w), 1.3 * scale / uRes.y);
  vec2 c = .5 + (h.xy - .5) * (1. - 2.2 * rad);
  c += .05 * vec2(sin(uTime * (.3 + h.z) + h.w * 6.3), cos(uTime * (.23 + h.w) + h.z * 6.3)) * (1. - 2.2 * rad);
  float d = length(f - c);
  return smoothstep(rad, rad * .3, d) * pow(h.z, sparse);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  setup();
  vec3 ro = uRo;
  vec3 rd = normalize(uCu * uv.x + uCv * uv.y + uCw * uFocal);

  float t = .7, d = 1.; bool hit = false;
  for (int i = 0; i < 46; i++) {
    d = map(ro + rd * t);
    if (d < .0012 * t) { hit = true; break; }
    t += d * .9;
    if (t > 10.) break;
  }
  if (!hit && t < 10. && d < .03) hit = true;

  // water
  float up = rd.y * .5 + .5;
  vec3 water = mix(vec3(.003, .011, .018), vec3(.011, .047, .063), smoothstep(.25, 1., up + uv.y * .25)) * (.45 + .55 * uEnv.y);
  float sh = shafts(uv);
  vec3 col = water + vec3(.025, .1, .12) * sh * uEnv.y;
  float tHit = 20.;

  if (hit) {
    tHit = t;
    vec3 p = ro + rd * t;
    float pw = t / (uFocal * uRes.y);               // world size of a pixel here
    vec3 N = calcNormal(p, max(.0015, pw * 1.2));
    vec3 V = -rd;
    float dB = mapBody(p); float dA = mapArm(p);
    vec4 A = gA; vec4 S = gS;
    float armW = smoothstep(.02, -.02, dA - dB);
    float suck = armW * smoothstep(.004, -.004, S.w);
    vec2 patUV = skinUV(p);
    // skin coordinates for the chromatophore lattice: stereographic on the body, (theta, around) on the arm
    vec2 suv = patUV; float unit = 1.;
    if (armW > .5) { suv = vec2(A.x, ARM_K * atan(A.z, A.y)) * .3; unit = A.w / .3; }
    float nv = max(dot(N, V), 0.);
    float blur = abs(t - 2.35) * .012 + .0006;      // depth of field, in world units
    float foot = (pw / max(nv, .3) * .8 + blur) / unit;

    // --- pigment
    const float CS0 = .0215, CS1 = .034, CS2 = .056;
    vec2 cy = chroma(suv / CS0, 3.1, 0, foot / CS0, patUV, CS0 * unit, vec2(.13, .56));
    vec2 cr = chroma(suv / CS1 + 7.7, 17.9, 1, foot / CS1, patUV, CS1 * unit, vec2(.11, .6));
    vec2 cb = chroma(suv / CS2 + 3.3, 41.3, 2, foot / CS2, patUV, CS2 * unit, vec2(.10, .62));
    vec4 pf = texture(uPat, patUV / (2. * Q) + .5);
    float cover = 1. - (1. - cy.x * .5) * (1. - cr.x) * (1. - cb.x);

    // --- relief: papillae + fine grain, as a perturbation of the normal
    vec3 Tn = normalize(gUVU - N * dot(N, gUVU)); vec3 Bn = cross(N, Tn);
    const float PS = .082;
    vec3 pp = papillae(suv / PS, patUV, PS * unit);
    vec2 grain = vec2(snoise(suv * 55.), snoise(suv * 55. + 31.7)) * .07 * (1. - smoothstep(.0, .012, blur));
    vec2 g = pp.yz * .55 + grain;
    vec3 Np = normalize(N - (Tn * g.x + Bn * g.y) * (1. - suck));

    // --- leucophore base + pigments (subtractive)
    vec3 alb = mix(vec3(.80, .76, .71), vec3(.88, .80, .78), suck);
    alb *= .9 + .1 * snoise(suv * 9.);
    alb *= mix(vec3(1.), vec3(.97, .74, .30), cy.x * (1. - suck));
    alb *= mix(vec3(1.), vec3(.66, .20, .10), cr.x * (1. - suck));
    alb *= mix(vec3(1.), vec3(.17, .075, .05), cb.x * (1. - suck));
    alb += vec3(.07, .06, .05) * pp.x * (1. - cover);            // pale papilla tips
    // lid crease, sucker cups
    vec3 le = eyeLocal(p);
    float ly = lidLine(le); float lw = .009 + .011 * uEye.z;
    float slit = lidMask(le) * exp(-ly * ly / (lw * lw)) * (1. - armW);
    alb *= 1. - .85 * slit;
    float sr = length(S.xy - vec2(0., .1));
    float cup = suck * smoothstep(.62, .3, sr);
    alb *= 1. - .5 * cup; alb = mix(alb, alb * vec3(1., .82, .8), suck * smoothstep(.5, .9, sr) * .5);

    // --- light
    vec3 L = normalize(vec3(-.42, .8, .43));
    float cau = caustic(p.xz * .55 + vec2(p.y * .2, 0.), uTime * .3);
    vec2 sc = p.xy - vec2(.05, .0);
    float spot = mix(.16, 1., exp(-dot(sc, sc) * vec2(.9, 1.5).x)) * uEnv.y;
    float key = (.5 + 1.0 * cau) * spot;
    float ndl = dot(Np, L);
    float dif = clamp((ndl + .35) / 1.35, 0., 1.); dif *= dif * 1.15;
    // cheap ambient occlusion: creases round the eye, where the arm rests on the skin
    float ao = clamp(.5 + map(p + N * .05) / .05 * .5, 0., 1.) * clamp(.5 + map(p + N * .16) / .16 * .5, 0., 1.);
    ao = mix(1., ao, .85);
    vec3 lcol = vec3(.66, .84, .86);
    vec3 amb = vec3(.035, .085, .1) * (.55 + .45 * Np.y) * (.4 + .6 * spot);
    vec3 c = alb * (lcol * dif * key * .78 + amb) * ao;
    // pointer: a soft warm light held near the skin
    vec3 lp = uPtrPos - p; float pd2 = dot(lp, lp);
    c += alb * vec3(1., .88, .7) * uPtr.z * clamp(dot(Np, normalize(lp)) * .6 + .4, 0., 1.) * .3 / (1. + pd2 * 9.) * ao * uEnv.y;
    // wet sheen
    vec3 H = normalize(L + V);
    float spc = pow(max(dot(Np, H), 0.), 70.) * .5 + pow(max(dot(Np, H), 0.), 12.) * .05;
    c += lcol * spc * key * ao * (.6 + 1.4 * slit + suck * .5);
    // iridophores: tiny structural-colour platelets under the pigment, glinting blue-green
    vec2 ic = suv / .013; vec4 ih = hash24(floor(ic) + 71.3);
    vec2 jf = fract(ic) - .5 - (ih.xy - .5) * .5;
    float flake = smoothstep(.34, .12, length(jf));
    vec3 fn = normalize(Np + (Tn * (ih.z - .5) + Bn * (ih.w - .5)) * .9);
    float glint = pow(max(dot(fn, normalize(H + .12 * sin(uTime * (.4 + ih.w) + ih.z * 40.))), 0.), 40.);
    vec3 icol = pal(ih.z * .35 + nv * .6, vec3(.25, .62, .6), vec3(.25, .38, .4), vec3(1., .8, .7), vec3(.55, .22, .3));
    c += icol * glint * flake * (1. - cover) * (1. - suck) * key * 1.3 * smoothstep(.03, .004, blur + .004);
    float fr = pow(1. - nv, 3.);
    c += pal(nv * 1.3 + suv.x * .15, vec3(.2, .5, .5), vec3(.2, .3, .35), vec3(1.), vec3(.5, .2, .3)) * fr * .1 * (1. - cover * .7) * spot;
    // rim scattering from the water behind
    c += vec3(.04, .17, .21) * fr * (.3 + .5 * spot) * uEnv.y;

    float fog = 1. - exp(-uEnv.x * max(t - .9, 0.));
    col = mix(c, col, fog);
    col += vec3(.025, .1, .12) * sh * uEnv.y * .3 * (1. - fog);
  }

  // marine snow, near to far (the nearest is soft bokeh), and the last motes of light
  float lit = (.35 + .65 * sh * 2.) * uEnv.y;
  vec3 sn = vec3(0.);
  sn += vec3(.5, .8, .85) * snow(uv, 2.6, 1., .2, .035, .05, 2.) * .05;
  sn += vec3(.6, .85, .9) * snow(uv, 6., 2., .075, .05, .03, 2.5) * .11;
  if (tHit > 3.2) sn += vec3(.6, .85, .9) * snow(uv, 13., 3., .035, .06, .015, 3.) * .2;
  if (tHit > 4.5) sn += vec3(.7, .9, .95) * snow(uv, 27., 4., .03, .05, .008, 4.) * .3;
  col += sn * (.4 + .6 * lit) * uEnv.w;
  float mote = snow(uv, 7., 9., .016, .012, .006, 9.);
  float tw = .7 + .3 * sin(uTime * 1.7 + uv.x * 40. + uv.y * 23.);
  col += vec3(.75, .92, 1.) * mote * tw * 2.4 * uEnv.z;

  fragColor = vec4(col * uFade, 1.);
}`;

  /* ---- small deterministic helpers (everything is a pure function of progress and time) ---- */
  const fract = (x) => x - Math.floor(x);
  const h1 = (n) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453);
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }

  /* REM under the lid: saccade-like jumps between held positions, in bursts. */
  function saccade(t) {
    const seg = 0.62, k = Math.floor(t / seg), f = fract(t / seg);
    const tgt = (i) => [(h1(i * 1.37) - 0.5) * 2, (h1(i * 2.91 + 7.0) - 0.5) * 2];
    const a = tgt(k - 1), b = tgt(k), e = ss(0, 0.16, f);
    return [mix(a[0], b[0], e), mix(a[1], b[1], e), Math.exp(-f * 5) * Math.hypot(b[0] - a[0], b[1] - a[1]) * 0.5];
  }

  D.registerScene({
    id: 'octopus',
    init(ctx) {
      gl = ctx.gl;
      patProg = ctx.util.fullscreen(ctx.glsl.head + ctx.glsl.noise + PATTERN_FS, 'octopus.pattern');
      mainProg = ctx.util.fullscreen(ctx.glsl.head + ctx.glsl.noise + MAIN_FS, 'octopus');
      patTex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, patTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, PW, PH, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      patFbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, patFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, patTex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
    render(s) {
      if (!patProg.ok || !mainProg.ok) return;
      const p = s.progress, t = s.time;
      const act = ss(0.29, 0.36, p) * (1 - ss(0.77, 0.85, p));

      /* pass 1: the pattern field */
      gl.bindFramebuffer(gl.FRAMEBUFFER, patFbo);
      gl.viewport(0, 0, PW, PH);
      gl.disable(gl.BLEND);
      patProg.use().f1('uTime', t).f2('uRes', PW, PH).f1('uProgress', p).f1('uFade', 1)
        .f2('uPointer', s.pointer.x, s.pointer.y).f1('uScroll', s.scroll).f1('uAct', act);
      D.util.drawQuad();
      D.util.bindMain(); D.util.resetState();

      /* camera: slow approach, hover, then away and down */
      const end = ss(0.8, 1.0, p), endE = end * end * (3 - 2 * end);
      const portrait = 1 - ss(0.7, 1.3, s.aspect);
      const dist = mix(2.75, 2.2, ss(0.0, 0.32, p)) + portrait * 0.5 + endE * 3.6;
      const sway = [Math.sin(t * 0.13) * 0.035, Math.sin(t * 0.17 + 1.3) * 0.025];
      const tgt = [0.02 + s.pointer.x * 0.03, -0.1 + s.pointer.y * 0.02 - endE * 1.5, -0.1];
      const ro = [tgt[0] + sway[0] + s.pointer.x * 0.16, 0.2 + sway[1] + s.pointer.y * 0.1 - endE * 2.4, tgt[2] + dist];
      const cw = norm([tgt[0] - ro[0], tgt[1] - ro[1], tgt[2] - ro[2]]);
      const cu = norm(cross(cw, [0, 1, 0])), cv = cross(cu, cw);
      const focal = 1.5;

      /* pointer ray -> point on the skin sphere, for the light and the startle */
      const a = s.aspect, px = s.pointer.x * 0.5 * a, py = s.pointer.y * 0.5;
      const rd = norm([cu[0] * px + cv[0] * py + cw[0] * focal, cu[1] * px + cv[1] * py + cw[1] * focal, cu[2] * px + cv[2] * py + cw[2] * focal]);
      const UVC = [0, -1.6, -3.4], UVR = 3.45, EYEC = [0, 0.05, -0.36];
      const oc = [ro[0] - UVC[0], ro[1] - UVC[1], ro[2] - UVC[2]];
      const b = dot(oc, rd), c = dot(oc, oc) - UVR * UVR, h = b * b - c;
      let hitT = h > 0 ? -b - Math.sqrt(h) : dist;
      if (!(hitT > 0)) hitT = dist;
      const hp = [ro[0] + rd[0] * hitT, ro[1] + rd[1] * hitT, ro[2] + rd[2] * hitT];
      const uw = norm([EYEC[0] - UVC[0], EYEC[1] - UVC[1], EYEC[2] - UVC[2]]);
      const uu = norm(cross([0, 1, 0], uw)), uvv = cross(uw, uu);
      const n = norm([hp[0] - UVC[0], hp[1] - UVC[1], hp[2] - UVC[2]]);
      const kq = UVR * 2 / (1 + dot(n, uw));
      const moved = Math.min(1, Math.hypot(s.pointer.x, s.pointer.y) * 4);
      const lightPos = [hp[0] - rd[0] * 0.45, hp[1] - rd[1] * 0.45, hp[2] - rd[2] * 0.45];

      /* body rhythms */
      const om = t * Math.PI * 2 * 0.25;                      // ~0.25 Hz breathing
      const breath = Math.sin(om + 0.45 * Math.sin(om)) * (1 + 0.35 * act);
      const burst = ss(0.0, 0.7, Math.sin(t * 0.55) + Math.sin(t * 0.31 + 1.0) + 0.6);
      const sc = saccade(t);
      const rem = act * (0.35 + 0.65 * burst);
      const curl = 0.14 + 0.006 * Math.sin(om * 0.5 + 1.0) + act * 0.012 * (Math.sin(t * 1.9) * Math.sin(t * 0.7 + 2.0) + 0.6 * sc[2]);

      const fogIn = 1 - ss(0.0, 0.1, p);
      const fog = 0.07 + fogIn * 0.55 + endE * 1.25;
      const light = mix(0.5, 1.0, ss(0.0, 0.12, p)) * (1 + 0.12 * act) * (1 - 0.75 * ss(0.84, 1.0, p));

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, patTex);
      mainProg.use().common(s).i1('uPat', 0)
        .f3('uRo', ro[0], ro[1], ro[2]).f3('uCu', cu[0], cu[1], cu[2]).f3('uCv', cv[0], cv[1], cv[2]).f3('uCw', cw[0], cw[1], cw[2])
        .f1('uFocal', focal).f1('uBreath', breath)
        .f4('uEye', sc[0] * 0.06 * rem, sc[1] * 0.03 * rem, Math.min(1, sc[2] * rem * 1.2), act)
        .f4('uPtr', kq * dot(n, uu), kq * dot(n, uvv), moved, 0)
        .f3('uPtrPos', lightPos[0], lightPos[1], lightPos[2])
        .f4('uEnv', fog, light, ss(0.86, 1.0, p), 1 - 0.8 * ss(0.9, 1.0, p))
        .f3('uArm', curl, mix(0.25, 0.74, 1 - portrait), act * (0.6 + 0.4 * burst));
      D.util.drawQuad();
      gl.bindTexture(gl.TEXTURE_2D, null);
    },
  });
})();
