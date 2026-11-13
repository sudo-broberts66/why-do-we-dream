# Why do we dream what we dream?

One night of sleep, followed from the inside. An immersive, scroll-driven answer to the question,
made entirely from code: every image is computed by WebGL2 shaders and every sound is synthesised
with the Web Audio API as you watch. There are no images, videos, recordings or libraries.

## Run it

Open `index.html` in a recent browser (Chrome, Edge, Firefox, Safari 15+). No build step, no server.

- **Close your eyes** starts the sound and lets the night drift past by itself. Scroll at any time to take over.
- The three things you type at the start come back later in the night, and in the forecast at the end.
- The strip along the top is a hypnogram: the sleep stages of a textbook night, with the current time marked.

To bundle everything into a single self-contained file:

```bash
node tools/build.js   # writes dist/why-we-dream.html
```

## The night

| Time  | Stage | Scene | What it shows |
|-------|-------|-------|---------------|
| 23:14 | Awake | `threshold` | A night sky; the eyes close; *Eigengrau* |
| 23:25 | N1 | `hypnagogia` | Phosphenes, Klüver's form constants, the falling-block effect, the hypnic fall |
| 23:55 | N3 | `replay` | Slow oscillations; the hippocampus replaying the day to the cortex; emotional tagging |
| 00:52 | REM | `rem` | The pons ignites; visual and limbic areas blaze; prefrontal cortex goes dark; noradrenaline falls; paralysis |
| 02:25 | REM | `dreamscape` | Inside the dream: prediction without input, recombined memory, distant associations |
| 03:57 | REM | `dreamscape` | The nightmare: threat rehearsal, being chased, falling |
| 04:35 | N2 | `octopus` | A sleeping octopus whose skin replays its waking patterns |
| 05:12 | REM | `theories` | Seven theories of what dreaming is for, as seven constellations |
| 06:12 | REM → wake | `dawn` | Forgetting, light through the eyelids, the answer, tonight's forecast |

## How it is built

- `js/core.js` — the engine: WebGL2 context, scene registry, scroll timeline, adaptive resolution,
  HDR render target with bloom, grain and vignette.
- `js/glsl.js` — shared GLSL (noise, hashes, palettes).
- `js/scenes/*.js` — one file per scene. Each is a pure function of scroll progress and time, so the
  night can be scrubbed in either direction.
- `js/audio.js` — the generative score: one synthesised layer per scene, crossfaded with the picture.
- `js/ui.js`, `css/dream.css`, `index.html` — narration, clock and hypnogram, drift mode, dream forecast.
- `dev.html?scene=<id>&p=0.5` — a bench for looking at one scene in isolation.
- `tools/shot.js`, `tools/tour.js` — headless screenshots of a scene or of the whole page (need Playwright).

Sources for the science are listed at the end of the page.
