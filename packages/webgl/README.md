# @rsegrest/vector-display-webgl

WebGL2 renderer for [**vector-display**](https://www.npmjs.com/package/@rsegrest/vector-display). It draws an entire display list in a single draw call, with anti-aliased beams, a soft glow, and optional bright endpoints like a real vector monitor.

> **Status:** early (0.x). The API may change between minor versions.

## Install

```sh
npm install @rsegrest/vector-display @rsegrest/vector-display-webgl
```

ES modules only, with TypeScript declarations. Requires a browser with WebGL2.

## Usage

```ts
import { DisplayList, Shape } from "@rsegrest/vector-display";
import { WebGLVectorRenderer } from "@rsegrest/vector-display-webgl";

const renderer = WebGLVectorRenderer.fromCanvas(canvas, { width: 1024, height: 768 });
renderer.setLineStyle({ beamWidth: 1.5 * devicePixelRatio, glowRadius: 2 * devicePixelRatio });

const displayList = new DisplayList();
const square = Shape.fromPolyline({
  points: [{ x: -10, y: -10 }, { x: 10, y: -10 }, { x: 10, y: 10 }, { x: -10, y: 10 }],
  isClosed: true,
});

function drawFrame() {
  displayList.clear();
  displayList.setColor({ red: 0, green: 1, blue: 0 });
  displayList.addShape(square, { x: 512, y: 384, rotation: 0, scale: 4, intensity: 1 });
  renderer.clear();
  renderer.drawDisplayList(displayList);
  requestAnimationFrame(drawFrame);
}
requestAnimationFrame(drawFrame);
```

The canvas's pixel size is up to you (for example CSS size × `devicePixelRatio`); the renderer maps the world size you pass onto it.

## Line style

`renderer.setLineStyle({...})` accepts any of these (sizes in framebuffer pixels):

| Field | Default | Effect |
| --- | --- | --- |
| `beamWidth` | 1.5 | Core line width |
| `glowRadius` / `glowStrength` | 4 / 0.25 | Soft halo around each line |
| `endpointBrightness` | 0.6 | Brightness added at segment endpoints (0 removes it) |
| `jointOverlap` | 1 | Brightness added where connected segments meet (0 gives seamless joints) |

## Using it with other libraries

- `new WebGLVectorRenderer(gl, worldSize)` accepts an existing `WebGL2RenderingContext`.
- `drawDisplayList()` draws additively into whatever framebuffer is bound and doesn't clear it, so you can render into your own texture.
- `createShaderProgram(gl, { vertexSource, fragmentSource })` is exported for effect code.

## License

MIT © Rick Segrest
