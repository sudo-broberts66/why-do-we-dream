/* Scene `hypnagogia` — 23:27, sleep onset (N1).
   Eigengrau -> phosphenes -> Klüver form constants -> "Tetris effect" blocks -> hypnic fall.

   The form constants are built the way Ermentrout–Cowan / Bressloff explain them: every pixel of
   the visual field is mapped to V1 with the complex logarithm, z = (log r, theta). On that cortical
   sheet the activity is a sum of a few plane waves
        u(z) = sum_i a_i * cos(k_i . z)
   with integer angular wavenumbers. Three waves at 60 degrees make the honeycomb / lattice, two make
   the cobweb, one radial wave makes the tunnel and one oblique wave makes the spiral. Progress never
   switches patterns: it only changes the amplitudes a_i (as fronts that sweep across the cortex) and
   the radial wavenumbers, so every morph is continuous. The luminous filaments are iso-activity
   contours of u, with their width corrected by the analytic gradient of u. */
(function () {
  'use strict';
  const D = window.DREAM;
  let prog;

  const FS = /* glsl */`
#define PI  3.14159265
#define TAU 6.28318531

float lin(float a, float b, float x){ return clamp((x - a) / (b - a), 0., 1.); }
float ss(float a, float b, float x){ return smoothstep(a, b, x); }

float fbm3(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 3; i++){ s += a * vnoise(p); p = mat2(.8776, -.4794, .4794, .8776) * p * 2.03 + 17.3; a *= .5; }
  return s / .875;
}
float fbm4(vec2 p){
  float a = .5, s = 0.;
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = mat2(.8776, -.4794, .4794, .8776) * p * 2.03 + 17.3; a *= .5; }
  return s / .9375;
}

/* ---------------------------------------------------------------- phosphenes */
vec3 phosphenes(vec2 uv, float t, float swirl, out float blob){
  float r = length(uv);
  vec2 q = rot(.3 * sin(t * .05) - .55 * log(r + .3) + swirl) * uv * 1.55;
  vec2 w = vec2(fbm3(q + vec2(0., t * .032)), fbm3(q * 1.13 + vec2(4.7, -t * .027)));
  float f = fbm4(q * .85 + 2.4 * (w - .5) + vec2(t * .011, 3.1));
  blob = ss(.42, .70, f);
  float rf = (f - .455) / .022;
  float rim = exp(-rf * rf);          // organic, slightly brighter edge
  float core = ss(.62, .86, f);
  float haze = ss(.25, .8, w.y);
  vec3 c = vec3(.050, .030, .190) * blob;
  c += vec3(.300, .240, .640) * blob * blob * .42;
  c += vec3(.560, .480, 1.00) * (rim * .13 + core * .24);
  c += vec3(.020, .030, .110) * haze * haze;               // a second, larger and bluer cloud
  c += vec3(.170, .050, .200) * ss(.6, .95, w.x) * blob * .5; // warm magenta pockets
  return c * (.5 + .5 * ss(.02, .45, r));
}

/* tiny entoptic sparks */
float sparks(vec2 uv, float t, float sc, float density){
  vec2 g = uv * sc, id = floor(g), f = fract(g) - .5;
  vec2 h = hash22(id);
  vec2 o = (hash22(id + 3.17) - .5) * .7;
  float tw = pow(.5 + .5 * sin(t * (.7 + 2.3 * h.y) + h.x * 41.), 7.);
  return step(1. - density, h.x) * tw * ss(.085, 0., length(f - o));
}

/* ---------------------------------------------------------------- form constants */
/* a transition front sweeping across the cortex: tau 0..1, x 0..1 position on the cortical sheet */
float front(float tau, float x){ const float fw = .75; return ss(0., 1., (tau * (1. + fw) - x) / fw); }

vec3 formPalette(float h){
  // violet -> lavender, with hints of cyan and rose
  return pal(h, vec3(.66, .60, .96), vec3(.30, .24, .06), vec3(1.), vec3(.0, .5, .2));
}

/* pp: position relative to the pattern's centre; li: layer index; n: angular wavenumber;
   p: (layer-lagged) progress; tw: log-spiral twist; wMul: line softness; */
vec3 formLayer(vec2 pp, float li, float n, float p, float t, float tw, float wMul, float px){
  float r = length(pp) + 1e-5;
  float rho = log(r);
  float th = atan(pp.y, pp.x);
  float xn = clamp((rho + 3.4) / 3.6, 0., 1.);

  // family timeline: hex -(t1)-> cobweb -(t2)-> tunnel -(t3)-> spiral -(t4)-> tunnel
  float t1 = lin(.29, .37, p), t2 = lin(.41, .48, p), t3 = lin(.51, .58, p), t4 = lin(.74, .83, p);
  float s1 = front(t1, xn), s2 = front(t2, 1. - xn), s3 = front(t3, xn), s4 = front(t4, 1. - xn);

  float qc = .8 * n * (1. + .03 * sin(t * .21 + li * 1.3));
  float qh = 1.1547005 * n;                                  // 2n / sqrt(3): hexagonal resonance
  float qd = -mix(.5773503 * n, qc, ss(0., 1., t1));
  float qr = t1 >= 1. ? qc : qh;
  float ns = li < 1.5 ? 2. : 1.;                             // spiral arms

  // translating the cortical sheet = zooming and rotating the visual field
  float sgn = li < .5 ? 1. : (li < 1.5 ? -1. : 1.);
  float zr = rho + 1.25 - .022 * t - .07 * sin(t * .13 + li * 2.1) + li * .19;
  float zt = th + tw * (rho + 1.25) + sgn * (.017 * t + .05 * sin(t * .09 + li)) + li * PI / n;

  float aR = (1. - s1) + s2 * (1. - s3) + s4;
  float aD = 1. - s2;
  float aS = s3 * (1. - s4);
  float lvl = -(1. - s1);

  float pR = qr * zr;
  float pP = qd * zr + n * zt;
  float pM = qd * zr - n * zt;
  float pS = qc * zr + ns * zt - sgn * t * .11;
  float cR = cos(pR), cP = cos(pP), cM = cos(pM), cS = cos(pS);
  float sR = sin(pR), sP = sin(pP), sM = sin(pM), sS = sin(pS);

  float u  = aR * cR + aD * (cP + cM) + aS * cS;
  float gt = aD * n * (sP - sM) + aS * ns * sS;
  float gr = aR * qr * sR + aD * qd * (sP + sM) + aS * qc * sS + tw * gt;
  float g  = sqrt(gr * gr + gt * gt + .9 * n * n * .02);     // regularised cortical gradient

  // iso-activity contours, one per unit of u, the one at 'lvl' is the main filament
  float v = u - lvl;
  float inv = r / g;                                          // cortex -> screen distance scale
  vec3 vc = v - vec3(-1., 0., 1.) * (.030 - .009 * li);        // per-channel level offset: thin-film fringes
  vec3 d = abs(fract(vc + .5) - .5) * inv;
  float w = max((.0011 + .0042 * r) * wMul, .85 * px);
  vec3 line = exp(-(d * d) / (w * w));
  float hd = d.g / (4.5 * w);
  float halo = .10 / (1. + hd * hd);
  float mainW = mix(.17, 1., exp(-v * v * 7.));

  // depth cues: fog down the centre, aliasing guard, slow activity pulses travelling outward
  float dens = 1.2 * n / r * px;
  float fade = ss(.012, .15, r) * (1. - ss(.10, .30, dens));
  float pulse = .72 + .28 * sin(2.6 * zr + t * .37 + li * 2.);

  float h = .27 + .15 * sin(1.15 * rho + .5 * v + li * 1.9 + t * .07) + .05 * sin(3. * th + t * .05);
  vec3 tint = formPalette(h);
  vec3 c = tint * (line * mainW + halo * mainW);
  c += tint * .035 * ss(.6, 2.6, v) * (1. - .5 * li);        // faint glow of the active cells themselves
  return c * fade * pulse;
}

/* ---------------------------------------------------------------- the day's blocks */
float sdBox(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.)) + min(max(d.x, d.y), 0.); }

float blockShape(vec2 q, float kind, float s){
  // 1, 2 or 3 square cells; seams stay visible because each cell keeps its own edge
  float d;
  if (kind < .42) d = sdBox(q, vec2(s * 1.25));
  else if (kind < .74) d = min(sdBox(q - vec2(0., s), vec2(s)), sdBox(q + vec2(0., s), vec2(s)));
  else {
    q += vec2(s * .5, -s * .5);
    d = min(sdBox(q - vec2(0., s), vec2(s)), sdBox(q + vec2(0., s), vec2(s)));
    d = min(d, sdBox(q - vec2(2. * s, -s), vec2(s)));
  }
  return d;
}

vec3 blockLayer(vec2 uv, float fl, float t, float fallP, float amount, float stretch){
  float sc = 4.6 + 3.3 * fl;                       // cells per screen height (far layers smaller)
  vec2 q = uv * sc + vec2(fl * 17.3 + 3.7, 0.);
  float cx = floor(q.x);
  float hc = hash11(cx * 1.37 + fl * 71.3);
  float speed = (.55 + .65 * hc) * (1.15 - .22 * fl);
  float y = q.y + (t * .21 + fallP) * speed + hc * 37.;
  const float H = 2.3;
  float row = floor(y / H);
  float edge = ss(.5, .40, abs(q.x - cx - .5));
  float soft = 1. + fl * .9;
  vec3 acc = vec3(0.);
  for (int k = 0; k < 2; k++){
    float rw = row - float(k);
    vec2 id = vec2(cx, rw) + fl * 13.1;
    vec2 h1 = hash22(id), h2 = hash22(id + 7.7);
    float born = ss(h1.x * .8, h1.x * .8 + .25, amount * 1.05) * step(h1.y, .52);
    if (born <= 0.) continue;
    float kind = h2.x;
    float s = kind < .74 ? .10 + .05 * h2.y : .085 + .03 * h2.y;
    vec2 bc = vec2(cx + .5 + (h1.y - .3) * .12, (rw + .32 + .36 * h2.y) * H);
    vec2 l = vec2(q.x, y) - bc;
    float ang = (h2.x - .5) * .28 + .10 * sin(t * (.25 + .5 * h1.x) + h1.y * 40.)
              + (h1.x > .90 ? t * .22 * sign(h2.y - .5) : 0.);
    if (fract(h2.y * 7.) > .5) ang += PI * .5;
    mat2 R = rot(ang);
    float dd = blockShape(R * l, kind, s);
    float aa = .012 * soft;
    float outline = exp(-(dd * dd) / (aa * aa));
    float fill = ss(aa, -aa, dd);
    float inner = fill * (.10 + .30 * exp(dd / (s * .45)));     // brighter toward the rim
    float glow = exp(-max(dd, 0.) / (.05 * soft)) * .16;
    // afterimages: a smeared streak above the block and two fading ghosts of its outline
    float ly = l.y / stretch;
    float hw = s * (kind < .42 ? 1.25 : (kind < .74 ? 1.1 : 1.7));
    float streak = ss(hw, hw * .35, abs(l.x)) * exp(-max(ly, 0.) / .55) * step(0., l.y) * .11;
    float e1 = blockShape(R * (l - vec2(0., .26 * stretch)), kind, s) / (aa * 1.5);
    float e2 = blockShape(R * (l - vec2(0., .56 * stretch)), kind, s) / (aa * 2.2);
    float g1 = exp(-e1 * e1) * .30;
    float g2 = exp(-e2 * e2) * .13;
    float hue = fract(h1.x * 3.7 + h2.y);
    vec3 tint = hue < .55 ? vec3(.60, .52, 1.00) : (hue < .8 ? vec3(.45, .80, 1.00) : vec3(1.00, .55, .80));
    vec3 hot = mix(tint, vec3(.93, .90, 1.), .55);
    acc += born * (hot * outline * 1.05 + tint * (inner + glow + streak + g1 + g2));
  }
  return acc * edge * (1. - .27 * fl);
}

/* ---------------------------------------------------------------- the fall */
vec3 fallTunnel(vec2 pp, float t, float fallX, float cool, float tw, float px){
  float r = length(pp) + 1e-5;
  float rho = log(r);
  float th = atan(pp.y, pp.x);
  float flow = t * .30 + 3.4 * fallX * fallX;
  float q = 9.6;
  float zr = rho - flow;
  float ph = q * zr;
  float u = cos(ph);
  float g = sqrt(q * q * sin(ph) * sin(ph) + 2.2);
  float inv = r / g;
  vec3 vc = u - vec3(-1., 0., 1.) * .028;
  vec3 d = abs(fract(vc + .5) - .5) * inv;
  float w = max(.0012 + .0060 * r, .85 * px);
  vec3 line = exp(-(d * d) / (w * w));
  float mainW = mix(.22, 1., exp(-u * u * 7.));
  // every ring is a slightly different brightness, and broken into arcs, so the speed reads
  float ringId = floor(ph / PI - .5);
  float rh = hash11(ringId * 1.31 + 5.);
  float arcs = .45 + .55 * ss(.25, .75, vnoise(vec3(cos(th + tw * rho + rh * 6.) * 2.2, sin(th + tw * rho + rh * 6.) * 2.2, ringId * .37)));
  // streaks on the tunnel wall, stretched along the direction of travel
  float st = vnoise(vec3(cos(th) * 7., sin(th) * 7., zr * 1.1));
  st = pow(st, 5.) * 1.6;
  float dens = q / r * px;
  float fade = ss(.02, .22, r) * (1. - ss(.10, .30, dens));
  vec3 tint = mix(vec3(.56, .50, 1.00), vec3(.16, .62, .78), cool);
  tint = mix(tint, vec3(.80, .86, 1.), .25 * rh);
  vec3 c = tint * line * mainW * arcs * (.55 + .6 * rh);
  c += tint * st * (.10 + .25 * r);
  c += tint * .05 * ss(.0, .9, r) * (.5 + .5 * u);
  return c * fade;
}

void main(){
  vec2 uv = (gl_FragCoord.xy - .5 * uRes) / uRes.y;
  float p = uProgress, t = uTime;
  float px = 1. / uRes.y;
  vec2 ptr = uPointer * vec2(min(uRes.x / uRes.y, 1.8), 1.) * .5;
  float scr = clamp(uScroll, -3., 3.);
  vec3 col = vec3(0.);

  // the hypnic jerk: the whole field tips forward and drops
  float fallX = lin(.80, 1., p);
  float tip = ss(.79, .87, p) * (1. - ss(.90, 1., p));
  float jerk = exp(-(p - .838) * (p - .838) / .0004);
  vec2 fuv = rot(.32 * tip) * uv;
  vec2 drop = vec2(.03, -.11) * tip;

  /* 1. Eigengrau: where the previous scene left off */
  float eig = 1. - ss(.03, .22, p);
  if (eig > 0.){
    // same recipe as the end of 'threshold', so the hand-over is seamless
    float n1 = fbm(uv * 2.1 + vec2(t * .030, -t * .021));
    float n2 = snoise(vec3(uv * 13., t * .22));
    float n3 = snoise(vec3(uv * 47., t * .55));
    float gE = .041 + .026 * (n1 - .5) + .0055 * n2 + .0040 * n3;
    col += vec3(gE * .94, gE * .95, gE * 1.24) * eig;
  }

  /* 2. phosphenes */
  float blob = 0.;
  float phA = ss(.0, .13, p) * mix(1., .30, ss(.19, .33, p)) * (1. - ss(.60, .76, p));
  if (phA > 0.){
    vec3 ph = phosphenes(uv - ptr * .035, t, scr * .08, blob);
    col += ph * phA;
    float sp = sparks(uv, t, 23., .16) + .6 * sparks(uv + 7.3, t * 1.3, 41., .10);
    col += vec3(.75, .70, 1.) * sp * .55 * ss(.03, .12, p) * (1. - ss(.3, .5, p));
  }

  /* 3. form constants: three cortical layers with parallax */
  float geoA = ss(.13, .25, p) * (1. - ss(.815, .88, p));
  if (geoA > 0.){
    float emerge = ss(.13, .255, p);
    float mask = ss(0., .55, emerge * 1.6 - (1. - blob));     // crystallise inside the phosphenes first
    float recede = ss(.60, .72, p) * (1. - ss(.78, .83, p));
    float tw = scr * .05;
    vec3 geo = vec3(0.);
    geo += formLayer(fuv - drop - ptr * .10, 0., 12., p, t, tw, 1. + 1.6 * recede, px);
    geo += formLayer(fuv - drop - ptr * .045, 1., 12., p - .012, t, tw, 1.8 + 2.2 * recede, px) * .40;
    geo += formLayer(fuv - drop + ptr * .03, 2., 6., p - .024, t, tw, 2.2 + 3. * recede, px) * .24;
    col += geo * geoA * mask * mix(1., .34, recede) * (1. + .8 * jerk);
  }

  /* 4. the Tetris effect: the day's most repeated imagery drifts down through the field */
  float blA = ss(.60, .70, p) * (1. - ss(.80, .875, p));
  if (blA > 0.){
    float fx = max(p - .80, 0.) / .1;
    float fallP = 9. * ss(.58, .84, p) + 60. * fx * fx;
    float stretch = 1. + 5. * ss(.80, .87, p);
    float dim = 1. - ss(.80, .875, p);
    vec3 bl = vec3(0.);
    bl += blockLayer(fuv - ptr * .020, 2., t, fallP, blA, stretch) * .55;
    bl += blockLayer(fuv - ptr * .050, 1., t, fallP, blA, stretch) * .80;
    bl += blockLayer(fuv - ptr * .090, 0., t, fallP, blA, stretch);
    col += bl * dim;
  }

  /* 5. the fall, and the deep water it ends in */
  float fa = ss(.80, .865, p);
  if (fa > 0.){
    float cool = ss(.82, .95, p);
    float out_ = 1. - ss(.90, .995, p);
    vec2 pp = fuv - drop - ptr * .08 * (1. - .6 * ss(.9, 1., p));
    col += fallTunnel(pp, t, fallX, cool, scr * .05, px) * fa * out_ * (1. + .7 * jerk);
    float r = length(uv - ptr * .03);
    float deep = ss(.86, 1., p);
    float murk = fbm3(uv * 1.6 + vec2(0., t * .02));
    col += vec3(.0025, .012, .017) * deep * (.7 + .6 * murk);
    col += vec3(.010, .070, .088) * exp(-r * r * 7.5) * ss(.90, 1., p);
    col += vec3(.45, .85, .9) * sparks(uv + vec2(0., -t * .012), t * .6, 19., .09) * .22 * ss(.93, 1., p);
  }

  fragColor = vec4(max(col, 0.) * uFade, 1.);
}`;

  D.registerScene({
    id: 'hypnagogia',
    init(ctx) {
      prog = ctx.util.fullscreen(ctx.glsl.head + ctx.glsl.noise + FS, 'hypnagogia');
    },
    render(s) {
      prog.use().common(s);
      D.util.drawQuad();
    },
  });
})();
