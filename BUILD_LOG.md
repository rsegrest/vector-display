# Build Log — vector-display

> New here? Read the newest entry first. Entries are append-only and each one
> records what was *verified*, not what was intended. Created 2026-10-04 (the
> repo predates this log; earlier history lives in `git log`).

Repo: `github.com/rsegrest/vector-display` — monorepo, 5 published packages +
`examples/demo`. MIT.

---

## 2026-10-04 — clone, verify, first motion assets

**Context.** The packages were published 2026-09-14 but the repo was not yet
cloned on the development machine, so nothing could be iterated or demonstrated
locally, and promotion was blocked on demo assets. This entry covers the first
local bring-up and the first real motion capture.

### Verified working

| Step | Command | Result |
|---|---|---|
| Install | `npm install` | 67 packages, 0 vulnerabilities |
| Package tests | `npm test` | **39 passed / 4 files** |
| Package build | `npm run build` (`tsc -b`) | clean |
| Demo build | `npm run build -w examples/demo` | clean; benchmark chunk 1.2 MB |

### Headless WebGL2 — the flag that matters

Existing per-port smoke harnesses reported "WebGL2 unavailable" or died with
`Cannot read properties of undefined (reading 'state')`. Root cause was **not** the
renderer: Chrome was being launched with `--disable-gpu` and/or a
`LIBGL_ALWAYS_SOFTWARE=1` environment. With `--headless=new` neither exposes
WebGL2; the renderer then throws on the missing context, so the page dies before
assigning its debug hook.

Measured with a bare `webgl2` probe under `--headless=new`:

| ANGLE backend | WebGL2 |
|---|---|
| none / `--disable-gpu` | ❌ |
| `--use-angle=swiftshader` | ❌ |
| `--use-angle=gl` | ❌ |
| **`--use-angle=gl-egl`** | ✅ ANGLE, OpenGL ES 3.2 |

**Rule: headless WebGL2 capture requires `--use-angle=gl-egl` and must not set
`LIBGL_ALWAYS_SOFTWARE`.**

### Motion assets (first pass)

Captured from the running demo app over CDP, driving the page's own
`#renderer-mode` control, then assembled with ImageMagick + ffmpeg.

| Asset | Source | Size |
|---|---|---|
| phosphor GIF | `WebGL2 + phosphor` mode, 48 frames @ ~24 fps, 720×450 | 1.67 MB |
| p5 GIF | `p5.js (Canvas 2D)` mode, 36 frames, 720×450 | 0.59 MB |
| phosphor MP4 | the 48-frame phosphor run, 960 wide, h264 crf 20 | 0.51 MB |

Full-resolution frames were kept only in scratch. Frame content was sanity-checked
numerically — mean luminance ≈ 0.075 with ~11k distinct colours in phosphor mode
versus ≈ 0.018 / ~2.4k in p5 mode — rather than by eye, since the stills are
near-black.

### Open items

- `docs/` has no demo media for the benchmark yet; the Life captures are committed.
- No `.github/workflows/` — the demo has never been deployed anywhere. **This is
  now the critical path for promotion.**
- The separate per-port recreation repos (Asteroids, Tempest, Star Wars,
  Battlezone, Lunar Lander, built on `0.1.0`) each had their smoke harness
  repaired on 2026-10-04 per the flag table above; all five now assert real
  painted pixels instead of skipping the check.

---

## 2026-10-04 — Life on the Beam: an original demo animation

**Why.** The packages are published but unpromoted, and the blocker is not code —
it is demonstration. Screenshots cannot show what makes this renderer different,
because persistence, bloom and flicker are motion. Needed: something original that
a still cannot represent, and that shows the renderer is not only 1980 Atari.

**What.** Conway's Game of Life, drawn as beam geometry. The reasoning: a CRT has no
frame buffer, so the beam must *draw* every lit cell and dwell on it, and the
phosphor keeps glowing after the beam moves on. That makes the automaton physically
legible — a newborn cell is drawn hot white and a cell that has survived twenty
generations is drawn as a dim ember, so a travelling glider is literally a trail of
where the beam has been. A canvas implementation cannot express this; it can only
swap images.

**Architecture.** Logic kept DOM-free and separate from the adapter:

| File | Role | Tested |
|---|---|---|
| `examples/demo/src/life/lifeRules.ts` | The automaton: rules, neighbour counting, torus wrapping, seeding | ✅ 24 tests |
| `examples/demo/src/life/lifeBeamGeometry.ts` | Cells → beam geometry: age buckets, colour ramp, cell outlines | ✅ 19 tests |
| `examples/demo/src/life/life.ts` | Canvas, renderer, frame loop, input, debug hook | ❌ browser-only by design |
| `examples/demo/life.html` | The page | ❌ |

**The grid is a torus.** Verified: a six-glider field holds exactly 30 live cells
and 120 beam segments for 24 generations while crossing edges. On a bounded grid a
glider eventually dies against a wall and the display goes still.

**Verified in a real browser** (headless, `--use-angle=gl-egl`), not just in unit
tests — the debug hook is on the real start path:

| Check | Result |
|---|---|
| WebGL2 context | `WebGL 2.0 (OpenGL ES 3.0 Chromium)` |
| Six gliders, 12 generations | population 30, segments 120 (**4 sides per cell**) |
| Dense field | population 897, segments 3,588, 434,291 lit pixels |
| Page errors | none |

**Two real bugs found while doing this, both in the browser layer:**

1. **`life.html` collapsed to content height.** `body { min-height: 100% }` does not
   resolve against an `html` that only has `min-height`, so the flex chain sized to
   content and the canvas came out 225×150 instead of 862×574. Fix: a definite
   `height: 100%` on both `html` and `body`, plus `flex: 0 0 auto` on the fixed bars.
2. **`fitCanvasToStage()` ran before layout**, measuring zero. Fix: fit again on the
   next animation frame and track the stage with a `ResizeObserver`.

**Also fixed in `lifeRules`:** on a grid one cell across, every neighbour offset
wraps back onto the cell itself and the cell counted itself as its own neighbour up
to eight times. A cell is never its own neighbour.

**Deliverables committed:** `examples/demo/docs/life-on-the-beam.gif` (dense field,
760px), `life-on-the-beam.mp4`, `life-gliders.gif`. README now leads with the demo.

**Deployment:** added `.github/workflows/deploy-demo.yml` (test → build → Pages) and
set `base: "./"` in the demo's Vite config so one build serves both a GitHub Pages
project page and a subfolder on the personal site. **Requires a human to set the
repo's Pages source to "GitHub Actions".**

---

## 2026-10-04 — Boids on the Beam: second original demo

**Why.** Life on the Beam proved the automaton case. The obvious next question is
whether the renderer handles continuous motion, and flocking is the classic
answer: hundreds of independent agents whose combined motion looks like one
organism.

**What.** Reynolds' flocking, drawn as beam geometry. Each boid is an arrowhead the
beam traces in three strokes, rotated to its heading and brighter the faster it
moves — so acceleration reads as a flash and direction is legible at a glance.
Drawn on the same torus the Life demo uses, so a flock never piles up against an
edge.

**Architecture**, mirroring the Life split:

| File | Role | Tested |
|---|---|---|
| `examples/demo/src/boids/boidsRules.ts` | Motion: the three forces, torus distances, speed band, seeded RNG | ✅ 27 tests |
| `examples/demo/src/boids/boidsBeamGeometry.ts` | Boids → beam geometry: arrowheads, headings, brightness, trails | ✅ 20 tests |
| `examples/demo/src/boids/boids.ts` | Canvas, renderer, fixed-step loop, input, debug hook | ❌ browser-only by design |
| `examples/demo/boids.html` | The page | ❌ |

**Emergence is measured, with a control.** The headline claim is not "it looks like
a flock" but a number: **polarization** (0 = every boid heading its own way, 1 = one
shared heading) rises from **0.02 to 0.33** over 600 steps from a standing start.
The test suite pins the control too — with alignment and cohesion switched off the
same seeded run stays unaligned, and the test asserts the flocked run beats the
unflocked one by at least 0.2. Without that control the number could have been an
artifact of the initial distribution.

Two more tests guard the failure modes that make flocking demos look broken:
separation actually holds a spacing (compared against the same run with separation
removed, which collapses), and polarization stays above 0.5 through a long second
run rather than drifting apart again.

**Verified in a real browser**, same bar as the Life demo:

| Check | Result |
|---|---|
| WebGL2 context | `WebGL 2.0 (OpenGL ES 3.0 Chromium)` |
| Polarization, standing start → 600 steps | 0.0240 → **0.3318** |
| Flock | 220 boids → 880 segments (660 arrowhead sides + 220 trails) |
| Speed band | min 40.00, max 110.00 — clamped exactly as configured |
| Lit pixels | 124,997 |
| Page errors | none |

**Bug found: the nav links were root-absolute and had been broken in production.**
`index.html` and `font-and-3d.html` linked to `/font-and-3d.html` and `/`. On the
GitHub Pages **project** page those resolve against the domain root
(`rsegrest.github.io/...`), not the project subpath, so the existing Font & 3D
cross-link 404'd. Vite's `base: "./"` does **not** rewrite `<a href>` — only bundled
asset URLs. All nav links are now relative, which works on both hosts, and both pages
gained links to the two demo pages.

**Deliverables:** `examples/demo/docs/boids-on-the-beam.gif` + `.mp4`. README now has a
**Demos** section covering both pieces with a live-links table.
