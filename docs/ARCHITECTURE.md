# vector-display architecture

**Status:** published (2026-09-14). Five packages and a two-page demo app work end to end; all five are on npm at `0.1.0`. The APIs are still settling at 0.x, so pin a version you have tested.

## 1. Goals

1. Draw graphics that look like vector arcade monitors (*Asteroids*, *Tempest*, *Star Wars*, *Battlezone*): glowing lines, bright vertices and dots, phosphor trails.
2. Be fast: thousands of objects per frame, with little per-frame allocation.
3. Stay general: separate from any one game, usable from p5.js, Three.js, PixiJS, or plain TypeScript.
4. Keep the look optional: the basic renderer works without the beam effects, and the effects are a separate package.

## 2. Packages

One repository (npm workspaces) that publishes several small packages. The packages depend on each other through small interfaces, not class inheritance.

```
                    @vector-display/core   core: shapes + per-frame display list (no rendering, runs in Node)
                     ▲          ▲          ▲
@vector-display/webgl  │  @vector-display/3d     wireframes + perspective (uses es-vector-math)
           ▲                    │
@vector-display/beam-fx   @vector-display/font   Atari-style stroke font + text layout

examples/demo                   renderer benchmark + font & 3D showcase (uses es-vector-math, motion-and-tween, p5)
```

| Package | Status | Responsibility | Depends on |
| --- | --- | --- | --- |
| `@vector-display/core` | Published `0.1.0` | `Shape` (static line geometry) and `DisplayList` (transformed beam segments for one frame) | nothing |
| `@vector-display/webgl` | Published `0.1.0` | `WebGLVectorRenderer`: uploads a display list and draws it with additive blending | core |
| `@vector-display/beam-fx` | Published `0.1.0` | `PhosphorPipeline`: fade the previous frame, draw beams, bloom, composite | core, webgl |
| `@vector-display/font` | Published `0.1.0` | `VectorFont`: Atari-style stroke glyphs and text layout into a display list | core |
| `@vector-display/3d` | Published `0.1.0` | `WireframeModel`, `WireframeProjector`: perspective projection with near-plane clipping, built on es-vector-math | core, es-vector-math |
| `@vector-display/core-svg` | Planned (phase 3) | Convert SVG paths into `Shape`s, porting `SVGLoader`/`SVGFactory` from asteroids-p5-ts | core |
| `@vector-display/core-p5` | Planned (phase 3) | Use the renderer from p5 sketches | webgl |

**Why one repository:** early on the packages change together. With separate repos, every interface change means repeating the publish → bump → reinstall → republish cycle across repos. Workspaces link the packages locally, and each package can still be versioned and published on its own.

**Why separate packages:** apps that only need the data model (such as a server or tests) don't pull in WebGL, and a game that wants a clean look doesn't ship the effect shaders.

## 3. Core data model (`@vector-display/core`)

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
| `addShape(shape, { x, y, rotation, scale, intensity })` | Transforms the shape's segments into world space and appends them. Accepts any `ShapeGeometry` (`segmentCoordinates`, `segmentNeighbors`, `segmentCount`), including geometry rebuilt every frame. Use `SCREEN_SPACE_PLACEMENT` for geometry already in world coordinates |
| `getSegmentData()` | Packed `Float32Array` view, **14 floats per segment**: `x0, y0, x1, y1`, previous neighbor's start `x, y`, next neighbor's end `x, y`, `red, green, blue, intensity`, `hasPrevious, hasNext` |
| `clear()` / `segmentCount` | Frame management |

Keeping draw order matters for later beam effects, where the order the beam visits segments affects brightness and trails.

### Segment neighbors
`Shape` records which segments connect (`segmentNeighbors`: previous and next segment index per segment, or `-1`):
- Consecutive segments in a polyline are connected; closed polylines also connect the last segment to the first.
- Separate polylines in one shape, and the outer ends of open polylines, are not connected.
- `fromSegmentCoordinates` connects consecutive segments whose end and start points are exactly equal.

The display list carries each segment's neighbor points so the renderer can control how joints look (section 4).

## 4. WebGL renderer (`@vector-display/webgl`)

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

| `LineStyle` field | Default | Effect |
| --- | --- | --- |
| `beamWidth` | 1.5 | Core line width |
| `glowRadius` / `glowStrength` | 4 / 0.25 | Soft halo around each line |
| `endpointBrightness` | 0.6 | Dwell highlight at segment endpoints; `0` removes it |
| `jointOverlap` | 1 | How much connected segments add up where they meet; `0` gives seamless joints |

All sizes are in framebuffer pixels; callers multiply by `devicePixelRatio`.

### Joints: why vertices look like dots, and how to remove them
Two separate things brighten vertices:
1. **Endpoint dwell:** a deliberate highlight, controlled by `endpointBrightness`.
2. **Overlap:** each segment draws a rounded end, so at a joint two segments' ends and glows cover the same pixels and additive blending doubles them. Bloom makes this more visible.

To control overlap, each fragment also measures its distance to the connected previous and next segments. **The closest segment owns the pixel**, and the others contribute only `jointOverlap` there (ties go to the previous segment, so exactly one segment owns every pixel). At `1` this matches plain additive drawing; at `0` no dots, gaps or seams were visible at the demo's joints. Measured on one demo frame, joint overlap 0 lit exactly the same pixels as 1, with about 13% less total brightness, which is consistent with removing only the doubled brightness at joints.

Segments that aren't connected (for example two different asteroids crossing) still add up, which is authentic for a vector monitor.

### Working with other libraries
- `new WebGLVectorRenderer(gl, worldSize)` accepts an existing `WebGL2RenderingContext`. `WebGLVectorRenderer.fromCanvas(canvas, worldSize)` is a shortcut that creates one.
- `drawDisplayList` draws into **whatever framebuffer is bound** and doesn't clear it, so a host library can bind its own render target (for example, to use the result as a Three.js/PixiJS texture).
- `createShaderProgram` is exported for effect packages to reuse.

### Decision: CPU transforms plus one batched upload (not GPU per-object transforms)
Before prototyping I suggested uploading each shape's geometry to the GPU once and sending only per-object transforms each frame. The prototype transforms segments on the CPU into the display list instead, because:
- It keeps a single draw call **and** exact draw order across different shapes, which the beam effects need. GPU instancing groups by shape.
- It's simple and allocation-free, and the measurements below show it's cheap: about **3 ms for ~12k segments** and **3.8 ms for ~58k segments** of CPU per frame.

If profiling a real game shows CPU transform or upload time dominating, the next step is storing shape geometry in a texture and sending per-object transforms, which shaders can read with `texelFetch`. The `DisplayList` API would stay the same.

## 5. Beam effects (`@vector-display/beam-fx`)

`PhosphorPipeline.renderFrame(displayList, elapsedMilliseconds)` runs these passes each frame:

```
beams (drawn additively into a cleared target) ──┐
                                                  ├─ keep the brighter per pixel ─▶ next phosphor
previous phosphor ── fade by 0.5^(elapsed/halfLife) ┘                                   │
                                   half-res blur (horizontal, vertical) × N ──▶ bloom
                                                        │
                  canvas ◀── composite: tone-map (phosphor + bloom × strength) as 1 − e^(−x·exposure), then × flicker
```

| Setting | Default | Effect |
| --- | --- | --- |
| `persistenceHalfLifeMilliseconds` | 40 | How long trails linger. The fade depends on elapsed time, so it looks the same at 60 Hz and 120 Hz |
| `bloomStrength` / `bloomBlurIterations` | 1.2 / 2 | Wide glow around bright lines |
| `exposure` | 1.6 | Highlight rolloff; overlapping beams saturate smoothly instead of clipping |
| `flickerAmount` / `flickerFrequencyHz` | 0.08 / 15 | Smooth random dips in brightness: depth as a fraction of the displayed image, and how often a new level is chosen |

- **Why "keep the brighter" instead of adding:** the first version added new beams on top of the faded previous frame. Anything that stayed still then built up to 1 ÷ (1 − fade) times its brightness: about 4× at 60 Hz and about 6× at 120 Hz with the default persistence, which blew out text under bloom. Keeping the brighter of the two shows static content at its true brightness at any refresh rate, while trails fade exactly as before. Measured on the demo, re-rendering one frame 1, 10 and 40 times gave 1.00×, 1.02× and 1.01× total brightness (the variation is flicker). This costs one extra full-resolution render target.
- **Storage:** half-float (`RGBA16F`) targets when `EXT_color_buffer_float` is available. Otherwise 8-bit, with a small subtraction each frame so faint trails still fade out completely.
- **Frame gaps:** elapsed time is clamped to 100 ms, so switching tabs doesn't wipe or freeze the trails.
- **Resizing:** targets are recreated automatically when the drawing buffer size changes.
- **Flicker:** smoothly interpolated random levels (`FlickerGenerator`), applied *after* tone mapping. The first version varied brightness randomly every frame before tone mapping and was barely visible: bright pixels sit in the compressed part of the tone curve, and per-frame changes at 60–120 Hz blur into a steady image. Measured on the demo, 50% depth at 5 Hz dims the displayed image to 0.67 of its peak within a second, with no frame-to-frame jump above 4.2%.
- **Photosensitivity:** strong full-screen brightness changes around 3–30 Hz can trigger photosensitive seizures. The default depth is subtle (8%), and the demo caps the slider at 50%. Apps exposing flicker to players should keep it subtle or let players turn it off.

## 5a. Vector font (`@vector-display/font`)

- **Stroke glyphs, not an outline font.** The asteroids-p5-ts game draws text with Hyperspace, a filled TrueType imitation of the Asteroids lettering. Here every character is a few beam segments, so text gets the same glow, vertex highlights, phosphor trails and flicker as everything else. The glyphs are original designs in the Atari style, not copied from Hyperspace or from Atari ROM data.
- **Grid:** 4 units wide by 6 tall (y down, baseline at 6), plus 2 units between letters and 4 between lines. Comma and semicolon descend 1 unit below the baseline.
- **Character set:** A–Z, 0–9, space, and `. , : ; ! ? ' " - + = * / _ < > ( ) # % ©`. Lowercase letters use the uppercase glyphs.
- **Readability choices:** zero has a slash; 5 has a chamfered corner, unlike S; and 0/O, 1/I, 2/Z, 5/S, 6/G and 8/B are checked by a test to stay distinct.
- **Layout:** `font.addText(displayList, { text, x, y, size, alignment, rotation, intensity })`, where `size` is the capital-letter height in world units. Characters are monospaced, `\n` starts a new line, and characters without a glyph keep their column so scores stay aligned. `measureText(text, size)` returns width and height.
- **Customizing:** `VectorFont.createArcadeFont(extraGlyphs)` replaces or adds glyphs; `VectorFont.fromDefinition({ glyphs, metrics })` builds an entirely different font.
- **Legibility:** with default glow and bloom, text 16 world units tall or larger reads clearly. At smaller sizes, lower `endpointBrightness` and bloom, or the vertex highlights crowd together. The demo uses `endpointBrightness: 0.25` and `jointOverlap: 0.35`.

## 5b. 3D wireframes (`@vector-display/3d`)

- **Space:** x right, **y up**, z forward, converted to the display's y-down screen coordinates at projection.
- **`WireframeModel.fromDefinition({ vertices, polylines })`:** vertices are es-vector-math `Vector`s; each polyline lists vertex indices and whether it closes. Edges within a polyline stay connected so joints render cleanly. `createBoxModel` and `createPyramidModel` build simple shapes.
- **Per-vertex math uses es-vector-math:** `scale` → `rotateXYZ` (x, then y, then z) → `add` the model position → `subtract` the camera position → `rotateY` / `rotateX` by the inverse camera yaw and pitch → `getPerspective`.
- **Camera (`PerspectiveCamera`):** uses es-vector-math's perspective model. The eye sits `viewDistance` behind a projection plane at `position`, so objects on that plane keep their size. Positive yaw turns toward +x; positive pitch tilts down.
- **Near-plane clipping:** edges entirely closer than `nearDistance` to the eye are dropped. Edges crossing that distance are cut at it, and their joints are disconnected where the cut happened. Objects can fly past or through the viewer without lines stretching across the screen.
- **Per-frame use:** `displayList.addShape(projector.project(model, placement), SCREEN_SPACE_PLACEMENT)`. The projector reuses its buffers, so add each result before projecting the next model.
- **Cost:** es-vector-math creates several new vectors per vertex. That's fine for wireframe-game scale (hundreds to a few thousand vertices per frame) but would be the first thing to optimize for much larger scenes.
- **es-vector-math pitfall found:** `VectorMath.expand2D()` returns z = 0 even when given a 3D vector, so the model only expands vertices that are actually 2D. A future es-vector-math release could make `expand2D` leave 3D vectors unchanged.

## 6. Other design decisions

| Decision | Choice | Reason |
| --- | --- | --- |
| Graphics API | **WebGL2** | Available in all current browsers; the work is fill- and shader-heavy, which suits the GPU |
| WebAssembly | **Not used** | The CPU work is simple array math where JS is already fast, and calls between JS and WebAssembly add cost. Revisit only for CPU-heavy features (physics, large SVG tessellation) |
| WebGPU | **Later, optional** | Could become a second backend behind the same `DisplayList` interface |
| Module format | ES modules only, TypeScript declarations | Same as es-vector-math and motion-and-tween |
| Local development | `"@vector-display/source"` export condition pointing at `src/index.ts` | The demo (Vite) and type checks use package sources directly, with no rebuild step. Published consumers use `dist` |
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
- These measurements were taken before segment neighbors were added (8 floats per segment instead of 14). Measured in Node, building the display list with neighbor data is about 1.8× slower but still cheap: 0.79 ms instead of 0.43 ms for 50,000 segments, and 3.1 ms instead of 1.7 ms for 200,000.

### 7.2 WebGL scaling and a finding about the simulation

| Asteroids | Segments | Simulation update (es-vector-math) | Render CPU (display list + upload + draw call) |
| ---: | ---: | ---: | ---: |
| 5,000 | 57,971 | 11.61 ms | 3.76 ms |
| 20,000 | 231,859 | 66.36 ms | 62.63 ms |

**Finding:** at large object counts, **the demo's simulation costs more than rendering**. It creates new es-vector-math `Vector` objects for every position update, about 4 per object per frame. That's fine at arcade scale (40–500 objects), but hot loops at scale should use plain numbers or reuse objects. A future es-vector-math option could be methods that write into an existing vector.

### 7.3 How to check FPS in a visible tab

```sh
npm install
npm run dev   # http://localhost:5173 (or the port Vite prints); the Font & 3D page is at /font-and-3d.html
```

Switch **Renderer** and **Asteroids** in the header and read the live FPS. The **Vertex dwell** and **Joint overlap** sliders (both WebGL modes) and the **Persistence**, **Bloom**, **Flicker** and **Flicker Hz** sliders (phosphor mode) adjust the look live.

For scripted runs, open the browser console:

```js
vectorDisplayBenchmark.measureFrameCost({ mode: "webgl", asteroidCount: 1000, frameCount: 60, waitsForGpu: false })
```

Use `waitsForGpu: true` for large object counts. Without it, frames can be queued faster than the GPU finishes them, and the CPU timings then include waiting on that queue.

## 8. Roadmap

**Phase 1: prototype (done and published)**
- Core `Shape`/`DisplayList` with 9 unit tests
- WebGL2 batched beam renderer with glow and endpoint dwell
- Phosphor persistence, bloom and flicker pipeline
- Benchmark app comparing it with the p5 approach

**Phase 2: make it usable for a real game**
- ~~Vector font~~ (prototype done, section 5a).
- ~~3D wireframes with es-vector-math projection~~ (prototype done, section 5b). Next: depth-based intensity (dimmer when farther away) and hidden-line options.
- Per-segment intensity controls, including an option where shorter segments draw brighter (the beam spends more time on them), and per-shape line styles so text and game objects can use different vertex highlights.
- Dev overlay with GPU timer queries (when available) and live FPS.
- Browser-based tests for the WebGL packages (Vitest browser mode or Playwright), plus screenshot checks of shader output.
- Tune the per-line glow radius when bloom is on (bloom already supplies the wide glow, so smaller quads reduce GPU fill cost). Needs measuring in a visible tab.

**Phase 3: integrations**
- `@vector-display/core-svg`: port `SVGLoader`/`SVGFactory` and flatten curves and arcs into segments.
- `@vector-display/core-p5` adapter, plus examples using an existing Three.js / PixiJS WebGL context.
- Package READMEs, Changesets for versioning, CI, then publish 0.x.

**Phase 4: optional**
- Screen curvature, vignette, color phosphor tints, and a visible beam-travel mode.
- WebGPU backend if WebGL2 limits are reached.

## 9. Open questions

1. Package names: publish under the `@rsegrest` scope as above, or unscoped names?
2. Priority order for phase 2: vector font, 3D wireframes, or porting a real game (Asteroids) onto the library?
3. Should es-vector-math and motion-and-tween move into this repository, or stay in their own repos?
