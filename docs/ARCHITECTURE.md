# vector-display architecture

**Status:** prototype (2026-09-13). Three packages and a benchmark app work end to end; APIs are expected to change before a first publish.

## 1. Goals

1. Draw graphics that look like vector arcade monitors (*Asteroids*, *Tempest*, *Star Wars*, *Battlezone*): glowing lines, bright vertices and dots, phosphor trails.
2. Be fast: thousands of objects per frame, with little per-frame allocation.
3. Stay general: separate from any one game, usable from p5.js, Three.js, PixiJS, or plain TypeScript.
4. Keep the look optional: the basic renderer works without the beam effects, and the effects are a separate package.

## 2. Packages

One repository (npm workspaces) that publishes several small packages. The packages depend on each other through small interfaces, not class inheritance.

```
@rsegrest/vector-display            core: shapes + per-frame display list (no rendering, runs in Node)
        ▲
@rsegrest/vector-display-webgl      WebGL2 renderer: draws a display list in one draw call
        ▲
@rsegrest/vector-display-beam-fx    phosphor persistence, bloom, flicker (wraps the renderer)

examples/asteroids-benchmark        demo + benchmark (uses es-vector-math, motion-and-tween, p5)
```

| Package | Status | Responsibility | Depends on |
| --- | --- | --- | --- |
| `@rsegrest/vector-display` | Prototype | `Shape` (static line geometry) and `DisplayList` (transformed beam segments for one frame) | nothing |
| `@rsegrest/vector-display-webgl` | Prototype | `WebGLVectorRenderer`: uploads a display list and draws it with additive blending | core |
| `@rsegrest/vector-display-beam-fx` | Prototype | `PhosphorPipeline`: fade the previous frame, draw beams, bloom, composite | core, webgl |
| `@rsegrest/vector-display-svg` | Planned (phase 3) | Convert SVG paths into `Shape`s, porting `SVGLoader`/`SVGFactory` from asteroids-p5-ts | core |
| `@rsegrest/vector-display-p5` | Planned (phase 3) | Use the renderer from p5 sketches | webgl |

**Why one repository:** early on the packages change together. With separate repos, every interface change means repeating the publish → bump → reinstall → republish cycle across repos. Workspaces link the packages locally, and each package can still be versioned and published on its own.

**Why separate packages:** apps that only need the data model (such as a server or tests) don't pull in WebGL, and a game that wants a clean look doesn't ship the effect shaders.

## 3. Core data model (`@rsegrest/vector-display`)

### Coordinates
- **World units**, origin at the top left, **y down** (the same as Canvas 2D and p5).
- Positive rotation turns **clockwise** on screen, matching p5's `rotate()`.
- The renderer maps the world size (for example 1024×768) onto whatever canvas size it's given.

### `Shape`
Immutable line geometry in local coordinates, stored as a `Float32Array` of `x0, y0, x1, y1` per segment.
- `Shape.fromPolyline({ points, isClosed })` / `Shape.fromPolylines([...])`
- `Shape.fromSegmentCoordinates([...])`
- `Shape.createDot()`: a zero-length segment, which renders as a round dot (bullets, stars).

`points` only need `x` and `y`, so es-vector-math `Vector` and `Point` instances can be passed directly without the core depending on es-vector-math.

### `DisplayList`
The beam's drawing program for one frame, in draw order. It's reused every frame (`clear()`, then `addShape()` calls), so steady-state frames allocate nothing.

| Method | Purpose |
| --- | --- |
| `setColor({ red, green, blue })` | Current beam color, like a vector monitor's color register |
| `addShape(shape, { x, y, rotation, scale, intensity })` | Transforms the shape's segments into world space and appends them |
| `getSegmentData()` | Packed `Float32Array` view: **8 floats per segment**: `x0, y0, x1, y1, red, green, blue, intensity` |
| `clear()` / `segmentCount` | Frame management |

Keeping draw order matters for later beam effects, where the order the beam visits segments affects brightness and trails.

## 4. WebGL renderer (`@rsegrest/vector-display-webgl`)

### One draw call per frame
1. Upload the display list's packed segment data into a single dynamic buffer (it grows by doubling and is never shrunk).
2. `drawArraysInstanced(TRIANGLE_STRIP, 0, 4, segmentCount)`: **each segment is one instance**, a 4-vertex quad generated from `gl_VertexID`. No per-vertex buffer is needed.
3. Additive blending (`ONE, ONE`), so overlapping beams get brighter like real phosphor.

### Beam shader
- **Vertex shader:** converts both endpoints to framebuffer pixels and expands a quad around the segment, far enough to contain the glow.
- **Fragment shader:** computes the pixel's distance to the segment, then adds:
  - a **core** line (anti-aliased with `smoothstep`, `beamWidth` wide)
  - a Gaussian **glow** (`glowRadius`, `glowStrength`)
  - an **endpoint dwell** highlight (`endpointBrightness`). The beam slows at vertices, so real vector monitors drew corners and dots brighter.

All `LineStyle` sizes are in framebuffer pixels; callers multiply by `devicePixelRatio`.

### Working with other libraries
- `new WebGLVectorRenderer(gl, worldSize)` accepts an existing `WebGL2RenderingContext`. `WebGLVectorRenderer.fromCanvas(canvas, worldSize)` is a shortcut that creates one.
- `drawDisplayList` draws into **whatever framebuffer is bound** and doesn't clear it, so a host library can bind its own render target (for example, to use the result as a Three.js/PixiJS texture).
- `createShaderProgram` is exported for effect packages to reuse.

### Decision: CPU transforms plus one batched upload (not GPU per-object transforms)
Before prototyping I suggested uploading each shape's geometry to the GPU once and sending only per-object transforms each frame. The prototype transforms segments on the CPU into the display list instead, because:
- It keeps a single draw call **and** exact draw order across different shapes, which the beam effects need. GPU instancing groups by shape.
- It's simple and allocation-free, and the measurements below show it's cheap: about **3 ms for ~12k segments** and **3.8 ms for ~58k segments** of CPU per frame.

If profiling a real game shows CPU transform or upload time dominating, the next step is storing shape geometry in a texture and sending per-object transforms, which shaders can read with `texelFetch`. The `DisplayList` API would stay the same.

## 5. Beam effects (`@rsegrest/vector-display-beam-fx`)

`PhosphorPipeline.renderFrame(displayList, elapsedMilliseconds)` runs these passes each frame:

```
previous phosphor ──fade (0.5^(elapsed/halfLife))──▶ next phosphor ◀── beams drawn additively
                                                        │
                                   half-res blur (horizontal, vertical) × N ──▶ bloom
                                                        │
                  canvas ◀── composite: (phosphor + bloom × strength) × flicker, tone-mapped 1 − e^(−x·exposure)
```

| Setting | Default | Effect |
| --- | --- | --- |
| `persistenceHalfLifeMilliseconds` | 40 | How long trails linger. The fade depends on elapsed time, so it looks the same at 60 Hz and 120 Hz |
| `bloomStrength` / `bloomBlurIterations` | 1.2 / 2 | Wide glow around bright lines |
| `exposure` | 1.6 | Highlight rolloff; overlapping beams saturate smoothly instead of clipping |
| `flickerAmount` | 0.04 | Small random brightness variation per frame |

- **Storage:** half-float (`RGBA16F`) targets when `EXT_color_buffer_float` is available. Otherwise 8-bit, with a small subtraction each frame so faint trails still fade out completely.
- **Frame gaps:** elapsed time is clamped to 100 ms, so switching tabs doesn't wipe or freeze the trails.
- **Resizing:** targets are recreated automatically when the drawing buffer size changes.

## 6. Other design decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Graphics API | **WebGL2** | Available in all current browsers; the work is fill- and shader-heavy, which suits the GPU |
| WebAssembly | **Not used** | The CPU work is simple array math where JS is already fast, and calls between JS and WebAssembly add cost. Revisit only for CPU-heavy features (physics, large SVG tessellation) |
| WebGPU | **Later, optional** | Could become a second backend behind the same `DisplayList` interface |
| Module format | ES modules only, TypeScript declarations | Same as es-vector-math and motion-and-tween |
| Local development | `"@rsegrest/source"` export condition pointing at `src/index.ts` | The demo (Vite) and type checks use package sources directly, with no rebuild step. Published consumers use `dist` |
| Tooling | TypeScript 7 project references (`tsc -b`), Vitest, Vite | Vitest and Vite handle ES modules and TypeScript natively, avoiding the Jest ES-module workarounds needed in motion-and-tween |

## 7. Prototype measurements

Measured 2026-09-13 in Chrome on an Apple M2 (ANGLE/Metal), canvas 2388×1790 device pixels (1194×895 CSS × 2).

**Caveat:** the automated browser tab was hidden, so Chrome throttled `requestAnimationFrame` and FPS couldn't be measured. The benchmark instead renders frames back to back and times the CPU side of rendering. GPU time couldn't be measured reliably: timings synced by reading back a pixel varied from 6 to 26 ms at the same load, and timer queries never resolve in a hidden tab. **Check real FPS in a visible tab** (section 7.3).

### 7.1 CPU time to render one frame (fresh page load, no pixel readback)

| Asteroids | Segments | p5.js (Canvas 2D) | WebGL2 | p5 ÷ WebGL |
| ---: | ---: | ---: | ---: | ---: |
| 40 | 482 | 1.48 ms | 0.05 ms | ~30× |
| 250 | 2,903 | 101.28 ms | 0.35 ms | ~290× |
| 1,000 | 11,635 | 618.50 ms | 2.98 ms | ~200× |

- The p5 baseline draws the way `asteroids-p5-ts` does today: per-object `push`/`translate`/`rotate`/`scale`, `stroke()` with a CSS color string, and `beginShape`/`vertex`/`endShape`. A tuned p5 version would be faster, but the gap is structural: one draw call versus thousands of Canvas 2D path operations.
- p5 numbers varied between runs (one run with pixel readback measured 304 ms at 1,000 asteroids), but were always two to three orders of magnitude above WebGL.
- Phosphor mode adds almost no CPU time (about 1.0 ms at 1,000 asteroids); its extra cost is on the GPU.

### 7.2 WebGL scaling and a finding about the simulation

| Asteroids | Segments | Simulation update (es-vector-math) | Render CPU (display list + upload + draw call) |
| ---: | ---: | ---: | ---: |
| 5,000 | 57,971 | 11.61 ms | 3.76 ms |
| 20,000 | 231,859 | 66.36 ms | 62.63 ms |

**Finding:** at large object counts, **the demo's simulation costs more than rendering**. It creates new es-vector-math `Vector` objects for every position update, about 4 per object per frame. That's fine at arcade scale (40–500 objects), but hot loops at scale should use plain numbers or reuse objects. A future es-vector-math option could be methods that write into an existing vector.

### 7.3 How to check FPS in a visible tab

```sh
npm install
npm run dev   # http://localhost:5173 (or the port Vite prints)
```

Switch **Renderer** and **Asteroids** in the header and read the live FPS. For scripted runs, open the browser console:

```js
vectorDisplayBenchmark.measureFrameCost({ mode: "webgl", asteroidCount: 1000, frameCount: 60, waitsForGpu: false })
```

## 8. Roadmap

**Phase 1: prototype (done)**
- Core `Shape`/`DisplayList` with 9 unit tests
- WebGL2 batched beam renderer with glow and endpoint dwell
- Phosphor persistence, bloom and flicker pipeline
- Benchmark app comparing it with the p5 approach

**Phase 2: make it usable for a real game**
- Per-segment intensity controls, including an option where shorter segments draw brighter (the beam spends more time on them).
- A **vector font** (a Hershey-style stroke font like the arcade games used) for scores and text.
- **3D wireframes** for *Tempest*, *Star Wars* and *Battlezone*: project 3D shapes with es-vector-math's `rotateXYZ` / `perspectiveProjection` before adding them to the display list. es-vector-math becomes a real dependency at this point.
- Dev overlay with GPU timer queries (when available) and live FPS.
- Browser-based tests for the WebGL packages (Vitest browser mode or Playwright), plus screenshot checks of shader output.
- Tune the per-line glow radius when bloom is on (bloom already supplies the wide glow, so smaller quads reduce GPU fill cost). Needs measuring in a visible tab.

**Phase 3: integrations**
- `@rsegrest/vector-display-svg`: port `SVGLoader`/`SVGFactory` and flatten curves and arcs into segments.
- `@rsegrest/vector-display-p5` adapter, plus examples using an existing Three.js / PixiJS WebGL context.
- Package READMEs, Changesets for versioning, CI, then publish 0.x.

**Phase 4: optional**
- Screen curvature, vignette, color phosphor tints, and a visible beam-travel mode.
- WebGPU backend if WebGL2 limits are reached.

## 9. Open questions

1. Package names: publish under the `@rsegrest` scope as above, or unscoped names?
2. Priority order for phase 2: vector font, 3D wireframes, or porting a real game (Asteroids) onto the library?
3. Should es-vector-math and motion-and-tween move into this repository, or stay in their own repos?
