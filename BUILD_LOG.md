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

- `docs/` has no demo media yet: the GIFs are produced but not committed or embedded.
- No `.github/workflows/` — the demo has never been deployed anywhere. **This is
  now the critical path for promotion.**
- The separate per-port recreation repos (Asteroids, Tempest, Star Wars,
  Battlezone, Lunar Lander, built on `0.1.0`) each had their smoke harness
  repaired on 2026-10-04 per the flag table above; all five now assert real
  painted pixels instead of skipping the check.
