/* dreamscape — the dream itself, then the nightmare.
   One raymarched world whose parameters morph with progress:
     0.00-0.08  materialise out of rose-gold haze
     0.08-0.25  drift over a mirror sea; the world assembles itself out of shards of light
     0.25-0.42  climb a staircase that leads nowhere; association threads, objects morph
     0.42-0.55  the sea curls up and over into a cylinder (the wonder peak, p~0.5)
     0.55-0.72  crimson turn; spires; a tall figure, nearer at 0.62 and 0.68 (behind a blink)
     0.72-0.84  flight down a rib corridor that stretches; eclipse-eye; its shadow on the path
     0.84-0.94  the surface gives way: fall through the shattered world
     0.94-1.00  deep, quiet blue-green water                                              */
(function () {
  'use strict';
  const D = window.DREAM;
  let prog;
  const st = { rush: 0, fallY: 0, lastT: null };

  const FRAG = `
uniform vec3 uCam;
uniform vec4 uView;    // yaw, pitch, roll, focal
uniform vec4 uBend;    // curvature k (1/R), bend 0..1, sea on, fall mode
uniform vec4 uAsm;     // assembly front, assembly cap, morph, threads
uniform vec4 uNight;   // night, rib height, flight, shadow length
uniform vec4 uFig;     // x, -, z, scale (0 = absent)
uniform vec3 uMoonDir;
uniform vec4 uMoon;    // radius, eclipse, eye, stars
uniform vec3 uZen;
uniform vec3 uHor;
uniform vec3 uGlow;
uniform vec4 uFog;     // density, dim, deep, haze
uniform vec3 uHazeCol;
uniform vec4 uMisc;    // fall 0..1, embers, wind, lane phase

#define CELL 44.
#define HMAX 46.
#define BND 16.
#define MARGIN 3.
#define YP 72.
#define FAR 560.

float gMet, gMat, gEm, gHue, gShard, gLaneMat;

float sdBox(vec3 p, vec3 b){ vec3 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, max(q.y, q.z)), 0.); }
float sdBox2(vec2 p, vec2 b){ vec2 q = abs(p) - b; return length(max(q, 0.)) + min(max(q.x, q.y), 0.); }
float sdCaps(vec3 p, vec3 a, vec3 b, float r){ vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0., 1.); return length(pa - ba * h) - r; }

/* world <-> flat: the sea plane y=0 rolls up into a cylinder of radius R whose axis runs along z */
vec3 toFlat(vec3 p){
  gMet = 1.;
  float k = uBend.x;
  if (k < 1e-5) return p;
  float R = 1. / k;
  float r = length(vec2(p.x, R - p.y));
  gMet = clamp(r * k, .3, 1.) * .92;
  return vec3(R * atan(p.x, R - p.y), (2. * R * p.y - p.y * p.y - p.x * p.x) / (R + r), p.z);
}
vec3 toWorld(vec3 f){
  float k = uBend.x;
  if (k < 1e-5) return f;
  float R = 1. / k, th = f.x * k, r = R - min(f.y, R * .9);
  return vec3(r * sin(th), R - r * cos(th), f.z);
}
float seaHit(vec3 ro, vec3 rd){
  float k = uBend.x;
  if (k < 1e-5) return rd.y < -1e-5 ? -ro.y / rd.y : 1e9;
  float R = 1. / k;
  float a = dot(rd.xy, rd.xy);
  if (a < 1e-7) return 1e9;
  float b = ro.x * rd.x + (ro.y - R) * rd.y;
  float c = ro.x * ro.x + ro.y * ro.y - 2. * R * ro.y;
  float s = sqrt(max(b * b - a * c, 0.));
  return b > 0. ? -c / (b + s) : (s - b) / a;
}

/* ---------------------------------------------------------------- objects (local units) */
float oStairs(vec3 q){
  float u = (q.z + 10.) / 1.25, v = q.y / .8;
  float i = clamp(floor((u + v) * .5 + .5), 0., 15.);
  vec2 l = vec2((u - i) * 1.25, (v - i) * .8);
  vec2 w = vec2(sdBox2(l, vec2(1.25, .4)), abs(q.x) - 2.4);
  gMat = 2.;
  gEm = exp(-abs(l.x + 1.25) * 4.5) * smoothstep(.05, .38, l.y) * smoothstep(2.5, 2.2, abs(q.x));
  return (min(max(w.x, w.y), 0.) + length(max(w, 0.))) * .85;
}
float oDoor(vec3 q){
  float fr = max(sdBox(q - vec3(0., 4.6, 0.), vec3(2.6, 4.6, .42)), -sdBox2(q.xy - vec2(0., 4.1), vec2(2., 4.3)));
  float pane = sdBox(q - vec3(0., 4.2, 0.), vec3(2., 4.2, .05));
  vec3 ql = q - vec3(-2., 4.2, -.3);
  ql.xz = rot(1.05) * ql.xz;
  float leaf = sdBox(ql - vec3(1., 0., 0.), vec3(1., 4.2, .1));
  float d = min(fr, leaf);
  gMat = 0.; gEm = 0.;
  if (pane < d) { d = pane; gMat = 1.; gEm = 1.; }
  return d;
}
float oArch(vec3 q){
  float dOpen = min(sdBox2(q.xy - vec2(0., 5.), vec2(5.5, 5.)), length(q.xy - vec2(0., 10.)) - 5.5);
  gMat = 3.; gEm = exp(-abs(dOpen) * 1.4) * .7;
  return max(sdBox(q - vec3(0., 11., 0.), vec3(9., 11., 2.2)), -dOpen);
}
float oTable(vec3 q){
  gMat = 0.; gEm = 0.;
  float top = sdBox(q - vec3(0., 17., 0.), vec3(10., .7, 6.5));
  float leg = sdBox(vec3(abs(q.x) - 8.6, q.y - 8.2, abs(q.z) - 5.2), vec3(.7, 8.2, .7));
  return min(top, leg);
}
float oWindow(vec3 q, float hh){
  q.y -= 10.5 + sin(uTime * .3 + hh * 40.) * .6;
  q.xz = rot(uTime * .07 + hh * 20.) * q.xz;
  float fr = max(sdBox(q, vec3(3.6, 4.6, .32)), -sdBox2(q.xy, vec2(3.1, 4.1)));
  float mul = min(sdBox(q, vec3(.14, 4.1, .2)), sdBox(q, vec3(3.1, .14, .2)));
  float pane = sdBox(q, vec3(3.1, 4.1, .04));
  float d = min(fr, mul);
  gMat = 0.; gEm = 0.;
  if (pane < d) { d = pane; gMat = 1.; gEm = .8; }
  return d;
}
float oIsland(vec3 q, float hh){
  float h0 = 15. + 11. * hh;
  vec3 p = q - vec3(0., h0, 0.);
  p.xz = rot(uTime * .05 + hh * 6.) * p.xz;
  float e = length(p * vec3(1., .6, 1.)) - 6.5;
  e += sin(p.x * 1.3) * sin(p.y * 1.1 + 1.) * sin(p.z * 1.2) * .45;
  float rock = max(e * .75, p.y);
  float fall = max(length(p.xz - vec2(5.4, 0.)) - .11, p.y);
  gMat = 4.;
  gEm = smoothstep(5.6, 4.2, length(p.xz)) * smoothstep(-.25, 0., p.y) * .55;
  if (fall < rock) { gEm = 1.6; return fall; }
  return rock;
}
float oSpine(vec3 q){
  float da = 3.14159 / 13.;
  float ang = atan(q.y, q.x);
  float i = clamp(floor(ang / da), -1., 13.) + .5;
  vec3 l = vec3(length(q.xy) - 10., (ang - i * da) * 10., q.z);
  float body = sdBox(l, vec3(.7, .78, 1.2)) - .3;
  float spike = sdBox(l - vec3(1.9, 0., 0.), vec3(1.1, .16, .22));
  float wing = sdBox(l, vec3(.25, .3, 2.3));
  gMat = 5.; gEm = 0.;
  return min(body, min(spike, wing)) * .78;
}
float oSpire(vec3 q, float hh){
  float h1 = 28. + 12. * hh;
  float w = mix(1.5, .04, clamp(q.y / h1, 0., 1.));
  float d = max((abs(q.x) + abs(q.z)) * .707 - w, q.y - h1);
  vec3 s = q; s.x = abs(s.x) - 3.4 - s.y * .13;
  float h2 = h1 * .62;
  float w2 = mix(1.1, .03, clamp(s.y / h2, 0., 1.));
  d = min(d, max((abs(s.x) + abs(s.z)) * .707 - w2, s.y - h2));
  gMat = 6.; gEm = 0.;
  return d * .82;
}
float objD(float type, vec3 q, float sc, float ang, vec2 h){
  q.xz = rot(ang) * q.xz;
  q /= sc;
  q.y /= 1. + .55 * uNight.x;
  float d;
  if (type < 1.5) d = oStairs(q);
  else if (type < 2.5) d = oDoor(q);
  else if (type < 3.5) d = oArch(q);
  else if (type < 4.5) d = oTable(q);
  else if (type < 5.5) d = oWindow(q, h.x);
  else if (type < 6.5) d = oIsland(q, h.y);
  else d = oSpine(q);
  return d * sc;
}
float partner(float t){
  return t == 1. ? 7. : t == 7. ? 1. : t == 2. ? 5. : t == 5. ? 2. : t == 3. ? 4. : t == 4. ? 3. : t;
}

/* per-cell content: h = hashes, ci = (type, scale, jitter.xz), ang = y rotation */
void cellInfo(vec2 id, out vec2 h, out vec4 ci, out float ang){
  if (id.x == -4.) id.x = 4.;                 // cylinder seam: both half-cells share one identity
  h = hash22(id * 1.713 + vec2(7.31, 3.17));
  float type = 0., sc = mix(.75, 1.25, h.y);
  vec2 jit = (vec2(fract(h.x * 57.31), fract(h.y * 91.17)) - .5) * 6.;
  ang = (fract(h.y * 33.7) - .5) * 1.3;
  if (id.x == 0.) {                           // the lane the camera travels: authored
    jit = vec2(0.); ang = 0.; sc = 1.;
    if (id.y == 1.) { type = 2.; jit = vec2(6.5, 2.); sc = 1.15; ang = -.3; }
    else if (id.y == 2.) { type = 1.; sc = 1.6; }
  } else {
    float r = h.x;
    type = r < .24 ? 0. : r < .38 ? 1. : r < .53 ? 2. : r < .65 ? 3. : r < .72 ? 4. : r < .80 ? 5. : r < .92 ? 6. : 7.;
    if (type == 1.) ang = fract(h.y * 33.7) * 6.283;
    if (type == 2.) sc *= 1. + .6 * step(.7, fract(h.y * 13.1));
    if (type == 4. || type == 7. || type == 3.) sc = min(sc, 1.2);
  }
  ci = vec4(type, sc, jit);
}

float cellObj(vec2 id, vec4 ci, float ang, vec2 h, vec3 q){
  float type = ci.x, m = 0., t2 = 0.;
  if (uNight.x > 0.) { t2 = 8.; m = smoothstep(0., 1., uNight.x * 1.7 - h.y * .7); }
  else if (uAsm.z > 0. && id.x != 0.) {
    t2 = partner(type);
    if (t2 != type) m = uAsm.z * smoothstep(-.25, .25, sin(uTime * .16 + h.y * 31.));
  }
  float d1 = 1e5, d2 = 1e5, mat1 = 0., em1 = 0.;
  if (m < 1.) { d1 = objD(type, q, ci.y, ang, h); mat1 = gMat; em1 = gEm; }
  if (m > 0.) d2 = t2 > 7.5 ? oSpire(q, h.x) : objD(t2, q, ci.y, ang, h);
  if (m < .5) { gMat = mat1; gEm = em1; }
  if (m <= 0.) return d1;
  if (m >= 1.) return d2;
  return mix(d1, d2, m) * .8;
}

/* nightmare lane: rib corridor, causeway, the figure */
float laneD(vec3 p){
  float d = 1e5;
  gLaneMat = 7.;
  if (uNight.y > 0.) {
    float zr = mod(p.z + uMisc.w + 5.5, 11.) - 5.5;
    vec2 e = vec2(abs(p.x) + 3.5, p.y / (2.9 * uNight.y));
    float rib = max(abs(length(e) - 9.5) - .3, abs(zr) - .3);
    float zs = mod(p.z + uMisc.w, 5.5) - 2.75;
    float deck = sdBox(vec3(p.x, p.y + .75 - 1. * uNight.y, zs), vec3(2.3, .5, 2.58));
    d = min(rib, deck);
  }
  if (uFig.w > 0.) {
    vec3 f = p - vec3(uFig.x, 0., uFig.z);
    float s = uFig.w;
    float bd = length(f.xz) - 2.6 * s;
    if (bd < 1.5) {
      vec3 q = f / s; q.x = abs(q.x);
      float hy = clamp(q.y, .2, 8.6);
      float body = length(q - vec3(0., hy, 0.)) - mix(.3, .78, (hy - .2) / 8.4);
      float head = length((q - vec3(0., 10.2, 0.)) * vec3(1., .78, 1.)) - .6;
      float sh = sdCaps(q, vec3(0., 8.55, 0.), vec3(1.3, 8.3, 0.), .42);
      float arm = sdCaps(q, vec3(1.35, 8.3, 0.), vec3(1.6, 3.2, .1), .19);
      float fd = min(min(body, head), min(sh, arm)) * s * .9;
      if (fd < d) { d = fd; gLaneMat = 8.; }
    } else d = min(d, bd);
  }
  return d;
}

/* break a solid into floating bricks: s = 0 nothing, 1 whole */
float erode(float d, vec3 p, float a){
  const float B = 2.4;
  vec3 r = p;
  r.xy = rot(.5) * r.xy; r.yz = rot(.7) * r.yz;
  vec3 bi = floor(r / B), l = r - (bi + .5) * B;
  vec3 hb = hash33(bi + 3.7);
  float s = clamp(a * 2.4 - p.y / 30. * 1.1 - hb.x * .9, 0., 1.);
  s = max(s, step(.62, hb.y) * .2);
  float border = B * .5 - max(abs(l.x), max(abs(l.y), abs(l.z)));
  float db = border + .06;
  if (s > 0.) {
    float hs = B * .5 * s;
    vec3 off = (hb.zxy - .5) * 2. * (B * .5 - hs) * .8;
    off += sin(uTime * .5 + hb * 40.) * (B * .5 - hs) * .2;
    db = min(db, sdBox(l - off, vec3(hs)));
  }
  gShard = 1. - s;
  return max(d, db);
}

float map(vec3 pw){
  vec3 p = toFlat(pw);
  float met = gMet;
  gMat = 0.; gEm = 0.; gShard = 0.; gHue = 0.;
  float dTop = p.y - HMAX;
  if (uBend.w > .5) {
    p.y = mod(p.y + 12., YP) - 12.;
    dTop = p.y - HMAX;
    if (dTop > 3.) return min(dTop, YP - 12. - p.y + .5);
  } else if (dTop > 3.) return dTop;
  vec2 id = floor(p.xz / CELL + .5);
  vec2 lc = p.xz - id * CELL;
  float d = CELL * .5 - max(abs(lc.x), abs(lc.y)) + MARGIN;
  if (uBend.w > .5) d = min(d, p.y + 26.);
  vec2 h; vec4 ci; float ang;
  cellInfo(id, h, ci, ang);
  gHue = h.x * 7.3;
  if (ci.x > .5) {
    vec3 q = vec3(lc.x - ci.z, p.y, lc.y - ci.w);
    float bb = max(abs(q.x), abs(q.z)) - BND;
    if (bb > 1.) d = min(d, bb);
    else d = min(d, cellObj(id, ci, ang, h, q));
  }
  if (uNight.x > 0.) {
    float lx = abs(p.x) - 8.;
    if (lx > 1.) d = min(d, lx);
    else { float dl = laneD(p); if (dl < d) { d = dl; gMat = gLaneMat; gEm = 0.; } }
  }
  float a = min((uAsm.x - (id.y * CELL - uCam.z)) / 50. + (h.y - .5) * .5, uAsm.y);
  if (a < .92 && d < 1.5 && gMat < 7.5) d = erode(d, p, a);
  return d * met;
}

vec3 calcNormal(vec3 p, float t){
  vec2 e = vec2(1., -1.) * (.0012 * t + .004);
  return normalize(e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) + e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}
float shadow(vec3 p, vec3 l){
  float t = .3, s = 1.;
  for (int i = 0; i < 10; i++) {
    float d = map(p + l * t);
    if (d < 1.5) s = min(s, 7. * d / t);
    t += clamp(d, .25, 7.);
    if (s < .03 || t > 60.) break;
  }
  return clamp(s, 0., 1.);
}

/* ---------------------------------------------------------------- sky */
vec3 skyBase(vec3 rd){
  float y = mix(abs(rd.y), length(rd.xy) * .8, uBend.y);
  float mu = dot(rd, uMoonDir);
  vec3 c = mix(uZen, uHor, exp(-y * 5.));
  c += uGlow * (.05 * exp(-y * 9.) + .13 * exp(-y * 45.)) * (.25 + .75 * pow(max(mu, 0.), 3.));
  float a = max(acos(clamp(mu, -1., 1.)) - uMoon.x, 0.);
  c += uGlow * (.30 * exp(-a * 12.) + .11 * exp(-a * 3.2));
  return c;
}
float cloudN(vec2 p){
  float s = 0., a = .5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = rot(.6) * p * 2.1 + 9.7; a *= .5; }
  return s / .875;
}
float starLayer(vec3 rd, float sc, float pix){
  vec3 p = rd * sc, id = floor(p);
  vec3 h = hash33(id);
  float d = length(p - id - .15 - .7 * h);
  float r = max(.07, sc * pix * 1.3);
  float tw = .65 + .35 * sin(uTime * (1. + 2. * h.y) + h.z * 60.);
  return smoothstep(r, 0., d) * h.x * h.x * tw * min(1., .07 / r) * 1.6;
}
vec3 sky(vec3 rd, float pix){
  vec3 c = skyBase(rd);
  float mu = dot(rd, uMoonDir);
  float ecl = uMoon.y;
  // thin streaked clouds
  float ay = abs(rd.y);
  vec2 cp = vec2(rd.x * .42, rd.z * 1.1) / (ay + .1);
  cp.y -= uTime * (.012 + .5 * uMisc.z);
  float dens = smoothstep(.5, .82, cloudN(cp + 3.)) * smoothstep(0., .07, ay) * (1. - smoothstep(.3, .75, ay)) * (.75 - .5 * uBend.y);
  // stars
  if (uMoon.w > 0.) {
    float sv = starLayer(rd, 60., pix) + starLayer(rd.zxy, 110., pix) * .7;
    c += vec3(.85, .86, 1.) * sv * uMoon.w * (1. - dens);
  }
  // moon / eclipse / eye
  float rM = uMoon.x;
  vec3 mx = normalize(cross(vec3(0., 1., 0.), uMoonDir)), my = cross(uMoonDir, mx);
  vec2 mp = vec2(dot(rd, mx), dot(rd, my)) / rM;
  float rr = length(mp);
  if (mu > 0. && rr < 1.6) {
    float disc = smoothstep(1., .965, rr);
    if (disc > 0.) {
      float z = sqrt(max(1. - rr * rr, 0.));
      float n = fbm(mp * 2.1 + 3.7), n2 = vnoise(mp * 9. + 1.3);
      float alb = mix(.5, 1.05, smoothstep(.36, .62, n)) * (.88 + .24 * n2);
      vec3 lit = mix(vec3(1., .78, .74), vec3(.90, .89, 1.), smoothstep(-.7, .6, mp.y)) * alb * (.5 + .62 * sqrt(z)) * 1.2;
      // the eye that opens inside the eclipse
      float th = atan(mp.y, mp.x);
      float fib = .5 + .5 * sin(th * 44. + sin(th * 7.) * 3. + rr * 7.);
      vec3 iris = uGlow * (.18 + .55 * fib * fib) * smoothstep(1., .7, rr) * smoothstep(.2, .5, rr);
      vec2 pc = mp - uPointer * vec2(.14, .1);
      float pupil = smoothstep(.19, .26, length(vec2(pc.x, pc.y * .36)));
      vec3 dark = iris * pupil * uMoon.z;
      c = mix(c, mix(lit * (1. - .55 * dens), dark, ecl), disc);
    }
    if (ecl > 0.) {
      float a = abs(rr - 1.) * rM;
      float th = atan(mp.y, mp.x);
      float ray = .6 + .4 * sin(th * 9. + uTime * .2) * sin(th * 23. - uTime * .13);
      c += uGlow * ecl * (2.4 * exp(-a * 150.) + .5 * ray * exp(-max(rr - 1., 0.) * rM * 16.) * step(1., rr));
    }
    // faint iridescent ring far around the moon
    c += pal(rr * 1.7 + .1, vec3(.6, .5, .7), vec3(.4, .3, .3), vec3(1.), vec3(0., .25, .5)) * exp(-pow((rr - 1.38) / .05, 2.)) * .05 * (1. - ecl);
  }
  // clouds, lit from behind by the moon
  vec3 cc = uHor * .45 + uGlow * (.03 + .5 * pow(max(mu, 0.), 6.));
  c = mix(c, cc, dens * .7 * (1. - .5 * step(rr, 1.)));
  return c;
}

/* ---------------------------------------------------------------- shading */
vec3 emisCol(float hue){
  float x = fract(hue);
  vec3 c = mix(vec3(1., .49, .71), vec3(1., .76, .48), smoothstep(0., .45, x));
  c = mix(c, vec3(.78, .74, 1.), smoothstep(.55, .85, x));
  return mix(c, vec3(.95, .13, .16), uNight.x);
}
float figShadow(vec3 pf){
  float L = uNight.w;
  if (L <= 0.) return 0.;
  float zr = pf.z - uCam.z, x = abs(pf.x), s = zr / L;
  float w = mix(.7, 2.5, smoothstep(0., .76, s));
  float d = s < .78 ? x - w : (s < .84 ? x - .7 : 1e3);
  d = min(d, length(vec2(x, (zr - .91 * L) * .5)) - 1.45);
  d = min(d, max(abs(x - w - 1.2 - s * 2.5) - .28, abs(s - .45) - .33));   // long arms
  return smoothstep(.4, -.25, d) * step(-8., zr) * uNight.z;
}
vec3 shadeObj(vec3 p, vec3 rd, float t, float mat, float em, float hue, float sh, bool full){
  float night = uNight.x;
  vec3 ec = emisCol(hue);
  vec3 alb = mix(vec3(.11, .105, .16), vec3(.035, .022, .028), night);
  if (mat == 5.) alb = mix(vec3(.30, .27, .31), vec3(.10, .055, .06), night);
  if (mat == 7.) alb = vec3(.13, .085, .09);
  if (mat == 8.) alb = vec3(0.);
  vec3 amb = uHor * .9 + uZen * 2.;
  vec3 col;
  if (full) {
    vec3 n = calcNormal(p, t);
    float ndl = max(dot(n, uMoonDir), 0.);
    float sha = ndl > 0. ? shadow(p + n * .06, uMoonDir) : 0.;
    float ao = clamp(map(p + n * .8) / .8, 0., 1.);
    float fr = pow(1. - max(dot(n, -rd), 0.), 3.);
    vec3 irid = pal(fr * .8 + hue * .13 + n.y * .15, vec3(.72, .55, .72), vec3(.28, .25, .28), vec3(1.), vec3(0., .18, .5));
    irid = mix(irid, vec3(1., .2, .22), night);
    col = alb * (amb * (.6 + .4 * n.y) * (.35 + .65 * ao) * 3. + uGlow * ndl * sha * 1.5 * (1. - .7 * uMoon.y));
    col += fr * irid * uGlow * (.08 + .34 * pow(max(dot(rd, uMoonDir), 0.), 2.)) * (.3 + .7 * ao) * (mat == 8. ? .25 : 1.);
    if (uNight.z > 0. && mat == 7.) {      // something bright and red is behind you
      vec3 pf = toFlat(p);
      float bl = max(dot(n, normalize(vec3(0., .5, -.86))), 0.);
      col += vec3(.75, .07, .09) * bl * uNight.z * (1. - .93 * figShadow(pf)) * (.3 + .7 * ao);
    }
  } else col = alb * amb * 1.6;
  float eK = 1. - .8 * night;
  if (mat == 1.) col = ec * (1.1 + .6 * em) * eK;
  else if (mat == 2.) col += mix(vec3(1., .86, .66), ec, .25) * em * 1.5 * eK;
  else if (mat == 3.) col += ec * em * .8 * eK;
  else if (mat == 4.) col += mix(vec3(.82, .8, 1.), ec, .3) * em * eK;
  if (sh > 0.) {
    vec3 sc = mix(mix(vec3(1., .8, .55), ec, .5), vec3(1., .22, .08), max(night, uMisc.x));
    col = mix(col, sc * (1.5 - .6 * night), sh * sh);
  }
  return col;
}

vec2 ripple(vec2 x, float foot){
  vec2 g = vec2(0.), q = x * .9;
  float a = 1., lam = 7.;
  for (int i = 0; i < 3; i++) {
    float w = a * smoothstep(1., 4., lam / foot);
    vec2 ph = q + uTime * vec2(.31, .23) * (1. + .5 * float(i)) + g * .7;
    g += w * vec2(cos(ph.x) * sin(ph.y * .83 + 1.3), sin(ph.x * 1.21) * cos(ph.y));
    q = mat2(.8, .6, -.6, .8) * q * 1.93 + vec2(3.1, 7.7);
    a *= .62; lam /= 1.93;
  }
  return g;
}
vec3 shadeSea(vec3 ro, vec3 rd, float ts, float pix){
  vec3 P = ro + rd * ts;
  vec3 pf = toFlat(P);
  vec3 N = vec3(0., 1., 0.);
  if (uBend.x > 1e-5) N = normalize(vec3(-P.x, 1. / uBend.x - P.y, 0.));
  vec3 T = vec3(N.y, -N.x, 0.);
  float foot = ts * pix / max(dot(-rd, N), .015);
  float dS = max(map(P), 0.);
  vec2 g = ripple(pf.xz, foot) * (.022 + .03 * uNight.x);
  g += vec2(.0, .05) * sin(dS * 5. - uTime * 1.3) * exp(-dS * .7);     // rings where things stand in the water
  vec3 n = normalize(N + T * g.x + vec3(0., 0., 1.) * g.y);
  vec3 R = reflect(rd, n);
  float rn = dot(R, N);
  if (rn < .012) R = normalize(R + N * (.012 - rn));
  float F = mix(.3, 1., pow(1. - max(dot(-rd, n), 0.), 3.));
  float rt = .25; bool rh = false;
  for (int i = 0; i < 24; i++) {
    float d = map(P + R * rt);
    if (d < .003 * (rt + ts) + .004) { rh = true; break; }
    rt += d;
    if (rt > 150.) break;
  }
  vec3 rc;
  if (rh) {
    rc = shadeObj(P + R * rt, R, rt, gMat, gEm, gHue, gShard, false);
    rc = mix(skyBase(R), rc, exp(-rt * uFog.x));
  } else rc = sky(R, pix * 2.);
  vec3 col = mix(uZen * .5, rc, F);
  col += uGlow * exp(-dS * .9) * (.035 + .045 * sin(dS * 5. - uTime * 1.3)) * (1. - .7 * uNight.x);
  col *= 1. - .8 * figShadow(pf);
  return col;
}

/* association threads: luminous arcs between far-apart things */
vec3 nodeOf(vec2 id){
  vec2 h; vec4 ci; float ang;
  cellInfo(id, h, ci, ang);
  return vec3(id.x * CELL + ci.z, 5. + 17. * h.y, id.y * CELL + ci.w);
}
vec3 threads(vec3 ro, vec3 rd, float tHit, float pix){
  vec3 acc = vec3(0.);
  float nb = floor(uCam.z / (3. * CELL));
  for (int b = 0; b < 2; b++) {
    float bz = (nb + float(b)) * 3.;
    float sgn = mod(nb + float(b), 2.) < .5 ? 1. : -1.;
    for (int j = 0; j < 3; j++) {
      vec2 ia = vec2(-2., 0.), ib = vec2(1., 2.);
      vec3 tc = vec3(1., .55, .75);
      if (j == 1) { ia = vec2(2., 0.); ib = vec2(-1., 1.); tc = vec3(1., .8, .5); }
      else if (j == 2) { ia = vec2(-1., 2.); ib = vec2(3., 1.); tc = vec3(.75, .72, 1.); }
      ia.x *= sgn; ib.x *= sgn; ia.y += bz; ib.y += bz;
      vec3 A = nodeOf(ia), B = nodeOf(ib);
      float mz = .5 * (A.z + B.z) - uCam.z;
      float fade = smoothstep(-66., -20., mz) * (1. - smoothstep(110., 150., mz));
      if (fade <= 0.) continue;
      vec3 M = .5 * (A + B); M.y += length(B - A) * .32;
      vec3 prev = toWorld(A);
      for (int k = 1; k <= 6; k++) {
        float s = float(k) / 6.;
        vec3 q = toWorld(mix(mix(A, M, s), mix(M, B, s), s));
        vec3 u = q - prev, w = prev - ro;
        float a = dot(u, u), bb = dot(u, rd), c = dot(w, u), dd = dot(w, rd);
        float sN = clamp((bb * dd - c) / max(a - bb * bb, 1e-4), 0., 1.);
        float tt = dd + sN * bb;
        if (tt > 0. && tt < tHit) {
          float dist = length(w + u * sN - rd * tt);
          float wd = .03 + tt * pix * 1.3;
          float gl = wd * wd / (dist * dist + wd * wd) + .22 * exp(-dist / (wd * 12.));
          float par = (float(k - 1) + sN) / 6.;
          float pulse = .3 + .9 * pow(.5 + .5 * sin(par * 13. - uTime * 1.5 + float(j) * 2.1), 6.);
          float ends = exp(-min(par, 1. - par) * 30.) * 2.;
          acc += tc * gl * (pulse + ends) * fade * exp(-tt * uFog.x);
        }
        prev = q;
      }
    }
  }
  return acc * uAsm.w;
}

float moteLayer(vec2 uv, float sc, vec2 flow, float seed, vec2 stretch){
  vec2 g = uv * sc + flow;
  vec2 id = floor(g), f = fract(g) - .5;
  vec2 h = hash22(id + seed);
  if (h.x < .5) return 0.;
  vec2 o = (vec2(h.y, fract(h.x * 37.3)) - .5) * .6;
  float tw = .55 + .45 * sin(uTime * (.6 + h.y * 1.7) + h.x * 50.);
  return smoothstep(.11, 0., length((f - o) * stretch)) * tw;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  vec2 suv = uv;
  uv = rot(uView.z) * uv;
  float cy = cos(uView.x), sy = sin(uView.x), cp = cos(uView.y), sp = sin(uView.y);
  vec3 fw = vec3(sy * cp, sp, cy * cp), rt = vec3(cy, 0., -sy), up = cross(fw, rt);
  vec3 ro = uCam, rd = normalize(uv.x * rt + uv.y * up + uView.w * fw);
  float pix = 1.2 / (uRes.y * uView.w);
  vec3 col = vec3(0.);
  float deep = uFog.z;

  if (deep < .995) {
    float tSea = uBend.z > .5 ? seaHit(ro, rd) : 1e9;
    float tMax = min(tSea, FAR);
    float t = .1, glow = 0.;
    bool hit = false;
    for (int i = 0; i < 66; i++) {
      float d = map(ro + rd * t);
      glow += gShard * .05 / (1. + d * d * 6.);
      if (d < .0012 * t + .0015) { hit = true; break; }
      t += d;
      if (t > tMax) break;
    }
    vec3 fogc = skyBase(rd);
    if (hit && t < tMax) {
      col = shadeObj(ro + rd * t, rd, t, gMat, gEm, gHue, gShard, true);
      col = mix(fogc, col, exp(-t * uFog.x));
    } else if (tSea < FAR) {
      t = tSea;
      col = shadeSea(ro, rd, tSea, pix);
      vec3 bg = uBend.y > .01 ? sky(rd, pix) : fogc;
      col = mix(bg, col, exp(-t * uFog.x));
    } else {
      t = FAR;
      col = sky(rd, pix);
    }
    vec3 gc = mix(mix(vec3(1., .72, .5), vec3(1., .5, .7), .5 + .5 * sin(rd.x * 9. + rd.y * 7.)), vec3(1., .2, .06), max(uNight.x, uMisc.x));
    col += gc * min(glow, 1.5) * .5;
    if (uAsm.w > 0.) col += threads(ro, rd, t, pix);
  }

  // drifting motes of light / wind streaks / embers
  float night = uNight.x, fall = uMisc.x;
  vec2 flowZ = vec2(uCam.x, uCam.z);
  float m1 = moteLayer(suv, 7., vec2(uTime * .02 + uView.x * 6., uTime * .013 - uView.y * 6.) + flowZ.yy * .015, 3., vec2(1.));
  float m2 = moteLayer(suv, 13., vec2(-uTime * .015 + uView.x * 11., uTime * .02 - uView.y * 11.) + 7.3, 9., vec2(1.));
  vec3 mc = mix(vec3(1., .74, .6), vec3(.75, .7, 1.), .5 + .5 * sin(suv.x * 5. + uTime * .1));
  col += mc * (m1 * .5 + m2 * .28) * (1. - night) * (1. - deep) * (.4 + .6 * uFog.w + uAsm.w * .3);
  if (uMisc.z > 0.) {     // wind
    float w1 = moteLayer(suv, 5., vec2(uTime * 2.6, uTime * .15), 21., vec2(.07, 1.6));
    float w2 = moteLayer(suv + .37, 9., vec2(uTime * 3.7, -uTime * .1), 27., vec2(.06, 1.8));
    col += vec3(.6, .07, .09) * (w1 * .5 + w2 * .3) * uMisc.z;
  }
  if (uMisc.y > 0.) {     // embers streaking upward past the fall
    float e1 = moteLayer(suv, 6., vec2(0., -uTime * 3.1), 31., vec2(1.5, .09));
    float e2 = moteLayer(suv + .21, 11., vec2(uTime * .1, -uTime * 4.6), 37., vec2(1.6, .08));
    float e3 = moteLayer(suv - .4, 17., vec2(0., -uTime * 2.1), 41., vec2(1.4, .12));
    col += (vec3(1., .32, .1) * e1 * .9 + vec3(1., .16, .1) * e2 * .6 + vec3(1., .6, .35) * e3 * .4) * uMisc.y;
  }

  col *= 1. - uFog.y;

  // opening haze: the moon and the horizon line condense out of it first
  if (uFog.w > 0.) {
    float ang = acos(clamp(dot(rd, uMoonDir), -1., 1.));
    float w = clamp(exp(-ang * 2.2) + .6 * exp(-abs(rd.y) * 9.), 0., 1.);
    float hz = smoothstep(0., 1., uFog.w * 1.6 - .6 * w);
    vec3 hc = uHazeCol * (.75 + .5 * fbm(suv * 1.3 + vec2(uTime * .02, 0.)) + .25 * exp(-ang * 1.5));
    col = mix(col, hc, hz);
  }
  // deep water
  if (deep > 0.) {
    float u = suv.y + .5;
    vec3 dc = mix(vec3(.003, .018, .024), vec3(.014, .068, .07), smoothstep(-.1, 1.1, u + .25 * rd.y));
    float shaft = vnoise(vec2(suv.x * 5. - suv.y * 1.5 + uTime * .03, uTime * .02)) * vnoise(vec2(suv.x * 11. - suv.y * 3., 4. - uTime * .015));
    dc += vec3(.03, .10, .09) * shaft * smoothstep(-.3, .6, suv.y) * .55;
    float p1 = moteLayer(suv, 6., vec2(uTime * .012, -uTime * .02 - fall * 0.), 51., vec2(1.));
    float p2 = moteLayer(suv, 12., vec2(-uTime * .008, -uTime * .012), 57., vec2(1.));
    float p3 = moteLayer(suv, 22., vec2(uTime * .005, -uTime * .008), 63., vec2(1.));
    dc += vec3(.35, .75, .68) * (p1 * .16 + p2 * .11 + p3 * .07);
    col = mix(col, dc, deep);
  }
  fragColor = vec4(max(col, 0.) * uFade, 1.);
}`;

  /* ---------------------------------------------------------------- timeline (pure function of progress) */
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const ss = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  /* monotone cubic through keys [[p, v], ...] — smooth, never overshoots */
  function key(keys, p) {
    const n = keys.length;
    if (p <= keys[0][0]) return keys[0][1];
    if (p >= keys[n - 1][0]) return keys[n - 1][1];
    let i = 0;
    while (p > keys[i + 1][0]) i++;
    const sl = (j) => (keys[j + 1][1] - keys[j][1]) / (keys[j + 1][0] - keys[j][0]);
    const tan = (j) => {
      if (j === 0) return sl(0);
      if (j === n - 1) return sl(n - 2);
      const a = sl(j - 1), b = sl(j);
      return a * b <= 0 ? 0 : (2 * a * b) / (a + b);
    };
    const h = keys[i + 1][0] - keys[i][0], t = (p - keys[i][0]) / h;
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * keys[i][1] + (t3 - 2 * t2 + t) * h * tan(i) +
      (-2 * t3 + 3 * t2) * keys[i + 1][1] + (t3 - t2) * h * tan(i + 1);
  }
  const bump = (p, c, w) => 1 - ss(0, w, Math.abs(p - c));

  const KZ = [[0, 0], [.08, 7], [.25, 62], [.32, 78], [.42, 108], [.5, 126], [.55, 136], [.62, 150], [.72, 172], [.84, 180], [1, 180]];
  const KY = [[0, 1.7], [.08, 1.8], [.25, 2.4], [.32, 9.5], [.42, 27], [.5, 29], [.55, 24], [.62, 7], [.67, 2.6], [.84, 2.4], [1, 2.4]];
  const KPITCH = [[0, .10], [.08, .10], [.25, .12], [.32, .24], [.42, .10], [.5, .12], [.55, .07], [.62, .05], [.72, .04], [.84, .04], [.885, -1.0], [.94, -.85], [1, -.2]];
  const KFOC = [[0, .85], [.42, .85], [.5, .70], [.56, .8], [.72, .85], [.84, .40], [.89, .62], [1, .8]];
  const KFOG = [[0, .0032], [.5, .0028], [.6, .0042], [.72, .0052], [.84, .0062], [.88, .0045], [1, .0045]];
  const KASM = [[0, 20], [.06, 28], [.12, 52], [.2, 112], [.3, 430], [1, 430]];
  const KELEV = [[0, .215], [.4, .215], [.5, .15], [.56, .2], [.72, .21], [.84, .30], [1, .30]];
  const KRAD = [[0, .165], [.68, .165], [.84, .36], [1, .36]];
  const R_TUBE = 8 * 44 / (2 * Math.PI);

  D.registerScene({
    id: 'dreamscape',
    init(ctx) {
      prog = ctx.util.fullscreen(ctx.glsl.head + ctx.glsl.noise + FRAG, 'dreamscape');
    },
    render(s) {
      const p = s.progress, t = s.time;
      const mat = ss(0, .085, p);
      const bend = ss(.40, .50, p) * (1 - ss(.545, .62, p));
      const night = ss(.535, .66, p);
      const rib = ss(.655, .735, p);
      const flight = ss(.72, .765, p);
      const inFlight = p > .72 && p < .84;
      const fallMode = p >= .84;
      const fall = ss(.842, .875, p);
      const fallSpeed = fall * (1 - ss(.94, .99, p));
      const deep = ss(.925, .985, p);

      // phases that run on time (rush down the corridor, the fall). Integrated so scrolling never makes them jump.
      if (st.lastT === null) { st.rush = t * 24 * flight; st.fallY = t * 34 * fallSpeed; }
      else {
        const dtt = clamp(t - st.lastT, 0, .1);
        st.rush = p <= .72 ? 0 : st.rush + dtt * 24 * flight * (inFlight ? 1 : 0);
        st.fallY = (st.fallY + dtt * 34 * fallSpeed) % 72;
      }
      st.lastT = t;

      // camera
      const bob = 1 - fall;
      let cz = key(KZ, p) + s.scroll * .6 + (inFlight ? st.rush : 0);
      let cyy = key(KY, p) + Math.sin(t * .45) * .12 * bob;
      let lanePhase = 0;
      if (fallMode) cyy = 2.4 - ((170 * ss(.84, .95, p) + st.fallY) % 72);
      const cx = Math.sin(t * .21) * .25 * bob;
      const yaw = s.pointer.x * .075 + Math.sin(t * .17) * .012;
      const pitch = key(KPITCH, p) + s.pointer.y * .05 + Math.sin(t * .23) * .008 - s.scroll * .006;
      const roll = Math.sin(t * .11) * .012 + bend * .05 * Math.sin(t * .07 + 1) + fall * (1 - deep) * .25 * Math.sin(t * .3);
      const asp = s.width / s.height;
      const focal = key(KFOC, p) * lerp(.62, 1, clamp((asp - .5) / .8, 0, 1));

      // sky
      const elev = key(KELEV, p);
      const dreamZen = [.012, .014, .050], dreamHor = [.080, .066, .185], dreamGlow = [1.0, .66, .60];
      const nZen = [.006, .001, .004], nHor = [.13, .012, .02], nGlow = [.9, .10, .13];
      const dk = (1 - .75 * fall);
      const zen = lerp3(dreamZen, nZen, night).map((v) => v * dk);
      const hor = lerp3(dreamHor, nHor, night).map((v) => v * dk * (.35 + .65 * mat));
      const glow = lerp3(dreamGlow, nGlow, night).map((v) => v * (.25 + .75 * mat) * (1 - .6 * fall));

      // the figure: it never walks. It is simply nearer.
      let figZ = 352, figS = 1.75 * ss(.545, .58, p);
      if (p >= .62) figZ = 262;
      if (p >= .68) figZ = 222;
      if (p >= .72) figS = 0;
      const dim = .95 * Math.max(bump(p, .62, .011), bump(p, .68, .011), bump(p, .72, .011), bump(p, .84, .012));

      prog.use().common(s);
      prog.f3('uCam', cx, cyy, cz)
        .f4('uView', yaw, pitch, roll, focal)
        .f4('uBend', bend > 0 ? 1 / (R_TUBE / Math.max(bend, 1e-3)) : 0, bend, fallMode ? 0 : 1, fallMode ? 1 : 0)
        .f4('uAsm', key(KASM, p), lerp(2, .3, ss(.832, .875, p)), ss(.24, .30, p) * (1 - ss(.52, .56, p)), ss(.22, .30, p) * (1 - ss(.535, .585, p)))
        .f4('uNight', night, rib, inFlight ? flight : 0, inFlight ? lerp(16, 46, ss(.73, .84, p)) + Math.sin(t * .9) * 1.5 : 0)
        .f4('uFig', 0, 0, figZ, figS)
        .f3('uMoonDir', 0, Math.sin(elev), Math.cos(elev))
        .f4('uMoon', key(KRAD, p), ss(.55, .63, p), ss(.69, .80, p), (1 - night) * mat)
        .f3('uZen', zen[0], zen[1], zen[2])
        .f3('uHor', hor[0], hor[1], hor[2])
        .f3('uGlow', glow[0], glow[1], glow[2])
        .f4('uFog', key(KFOG, p), dim, deep, 1 - mat)
        .f3('uHazeCol', .20, .115, .11)
        .f4('uMisc', fall, ss(.80, .86, p) * (1 - ss(.93, .97, p)), ss(.57, .68, p) * (1 - ss(.84, .86, p)), lanePhase);
      D.util.drawQuad();
    },
  });
})();
