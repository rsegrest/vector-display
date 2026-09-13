# vector-display

Fast, general-purpose rendering of vector-arcade-style graphics (think *Asteroids*, *Tempest*, *Star Wars*) for the browser, with optional phosphor, bloom and flicker effects.

> **Status:** prototype. APIs will change before the first publish. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the design, measurements and roadmap.

## Packages

| Package | What it does |
| --- | --- |
| [`@rsegrest/vector-display`](packages/core) | Shapes and per-frame display lists of beam segments. No rendering; runs anywhere |
| [`@rsegrest/vector-display-webgl`](packages/webgl) | WebGL2 renderer: the whole display list in one draw call, with glow and bright endpoints |
| [`@rsegrest/vector-display-beam-fx`](packages/beam-fx) | Phosphor persistence, bloom and flicker on top of the WebGL renderer |
| [`examples/asteroids-benchmark`](examples/asteroids-benchmark) | Demo and benchmark comparing p5.js Canvas 2D, WebGL2, and WebGL2 with phosphor |

## Usage

```ts
import { DisplayList, Shape } from "@rsegrest/vector-display";
import { WebGLVectorRenderer } from "@rsegrest/vector-display-webgl";
import { PhosphorPipeline } from "@rsegrest/vector-display-beam-fx";

const ship = Shape.fromPolyline({
  points: [{ x: 0, y: -10 }, { x: -7.5, y: 10 }, { x: -5, y: 5 }, { x: 5, y: 5 }, { x: 7.5, y: 10 }],
  isClosed: true,
});

const renderer = WebGLVectorRenderer.fromCanvas(canvas, { width: 1024, height: 768 });
const phosphor = new PhosphorPipeline(renderer, { persistenceHalfLifeMilliseconds: 40 });
const displayList = new DisplayList();

function drawFrame(elapsedMilliseconds: number) {
  displayList.clear();
  displayList.setColor({ red: 0.85, green: 0.95, blue: 1 });
  displayList.addShape(ship, { x: 512, y: 384, rotation: 0, scale: 2, intensity: 1 });
  phosphor.renderFrame(displayList, elapsedMilliseconds);
  // Without effects: renderer.clear(); renderer.drawDisplayList(displayList);
}
```

World coordinates use a top-left origin with y pointing down, like Canvas 2D and p5. Points only need `x` and `y`, so es-vector-math `Vector` and `Point` instances work directly.

## Development

Requires Node 24+.

```sh
npm install
npm run dev        # benchmark demo (Vite)
npm test           # unit tests (Vitest)
npm run build      # build all packages (tsc -b)
npm run typecheck  # packages + demo
```

## License

[MIT](LICENSE) © Rick Segrest
