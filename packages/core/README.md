# @vector-display/core

Renderer-independent core of **vector-display**, a set of libraries for drawing graphics that look like vector arcade monitors (*Asteroids*, *Tempest*, *Battlezone*).

This package holds shapes and the per-frame **display list**: the transformed line segments a renderer draws. It has no rendering code, so it also runs in Node and tests. Pair it with [`@vector-display/webgl`](https://www.npmjs.com/package/@vector-display/webgl) to draw.

> **Status:** early (0.x). The API may change between minor versions.

## Install

```sh
npm install @vector-display/core
```

ES modules only, with TypeScript declarations.

## Usage

```ts
import { DisplayList, Shape } from "@vector-display/core";

// Build shapes once. Points only need x and y, so es-vector-math Vector/Point objects work too.
const ship = Shape.fromPolyline({
  points: [{ x: 0, y: -10 }, { x: -7.5, y: 10 }, { x: -5, y: 5 }, { x: 5, y: 5 }, { x: 7.5, y: 10 }],
  isClosed: true,
});
const bullet = Shape.createDot();

// Rebuild the display list every frame; it reuses its memory.
const displayList = new DisplayList();
displayList.clear();
displayList.setColor({ red: 0.85, green: 0.95, blue: 1 });
displayList.addShape(ship, { x: 512, y: 384, rotation: 0, scale: 2, intensity: 1 });
displayList.addShape(bullet, { x: 540, y: 360, rotation: 0, scale: 1, intensity: 1.4 });
```

## API

| Export | Purpose |
| --- | --- |
| `Shape.fromPolyline(polyline)` / `Shape.fromPolylines(polylines)` | Line geometry from points; closed polylines connect back to their first point |
| `Shape.fromSegmentCoordinates([x0, y0, x1, y1, ...])` | Geometry from raw segments; touching segments are connected |
| `Shape.createDot()` | A zero-length segment, drawn as a round dot |
| `DisplayList` | `clear()`, `setColor(color)`, `addShape(shape, placement)`, `getSegmentData()`, `segmentCount` |
| `ShapeGeometry` | Interface for any shape-like geometry, including geometry rebuilt every frame |
| `SCREEN_SPACE_PLACEMENT` | Placement for geometry already in world coordinates |

**Coordinates:** world units with a top-left origin and y pointing down (like Canvas 2D and p5). Positive rotation turns clockwise on screen.

## Related packages

- [`@vector-display/webgl`](https://www.npmjs.com/package/@vector-display/webgl): WebGL2 renderer
- [`@vector-display/beam-fx`](https://www.npmjs.com/package/@vector-display/beam-fx): phosphor trails, bloom and flicker
- [`@vector-display/font`](https://www.npmjs.com/package/@vector-display/font): Atari-style stroke font
- [`@vector-display/3d`](https://www.npmjs.com/package/@vector-display/3d): 3D wireframes

## License

MIT © Rick Segrest
