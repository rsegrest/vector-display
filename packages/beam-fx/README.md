# @rsegrest/vector-display-beam-fx

Vector-monitor effects for [**vector-display**](https://www.npmjs.com/package/@rsegrest/vector-display): phosphor trails that fade over time, bloom, and flicker, layered on top of [`@rsegrest/vector-display-webgl`](https://www.npmjs.com/package/@rsegrest/vector-display-webgl).

> **Status:** early (0.x). The API may change between minor versions.

## Install

```sh
npm install @rsegrest/vector-display @rsegrest/vector-display-webgl @rsegrest/vector-display-beam-fx
```

ES modules only, with TypeScript declarations. Requires a browser with WebGL2.

## Usage

```ts
import { WebGLVectorRenderer } from "@rsegrest/vector-display-webgl";
import { PhosphorPipeline } from "@rsegrest/vector-display-beam-fx";

const renderer = WebGLVectorRenderer.fromCanvas(canvas, { width: 1024, height: 768 });
const phosphor = new PhosphorPipeline(renderer, { persistenceHalfLifeMilliseconds: 30, bloomStrength: 0.25 });

let previousTime = performance.now();
function drawFrame(time: number) {
  // ...fill displayList for this frame...
  phosphor.renderFrame(displayList, time - previousTime);
  previousTime = time;
  requestAnimationFrame(drawFrame);
}
requestAnimationFrame(drawFrame);
```

`renderFrame` replaces `renderer.clear()` + `renderer.drawDisplayList()`: it draws the beams, fades the previous frame, adds bloom, and writes the result to the canvas.

## Settings

Pass to the constructor or to `phosphor.setSettings({...})` at any time:

| Setting | Default | Effect |
| --- | --- | --- |
| `persistenceHalfLifeMilliseconds` | 40 | How long trails take to fade to half brightness |
| `bloomStrength` / `bloomBlurIterations` | 1.2 / 2 | Wide glow around bright lines (lower values look crisper) |
| `exposure` | 1.6 | Highlight rolloff |
| `flickerAmount` / `flickerFrequencyHz` | 0.08 / 15 | Smooth random brightness dips: depth (0–1) and how often the level changes |

Effects are time-based, so they look the same at 60 Hz and 120 Hz. Content that doesn't move keeps its true brightness; only movement leaves trails.

**Photosensitivity:** strong full-screen flicker around 3–30 Hz can trigger photosensitive seizures. Keep `flickerAmount` modest, or let users turn flicker off.

## License

MIT © Rick Segrest
