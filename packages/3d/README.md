# @vector-display/3d

3D wireframe models and perspective projection for [**vector-display**](https://www.npmjs.com/package/@vector-display/core), for *Battlezone*-, *Tempest*- and *Star Wars*-style graphics. The math is built on [es-vector-math](https://www.npmjs.com/package/es-vector-math).

> **Status:** early (0.x). The API may change between minor versions.

## Install

```sh
npm install @vector-display/core @vector-display/3d es-vector-math
```

ES modules only, with TypeScript declarations.

## Usage

```ts
import { DisplayList, SCREEN_SPACE_PLACEMENT } from "@vector-display/core";
import {
  DEFAULT_PERSPECTIVE_CAMERA,
  WireframeProjector,
  createBoxModel,
  createModelPlacement,
} from "@vector-display/3d";
import { Angle, Vector } from "es-vector-math";

const cube = createBoxModel({ width: 100, height: 100, depth: 100 });
const projector = new WireframeProjector({
  ...DEFAULT_PERSPECTIVE_CAMERA,
  position: new Vector(0, 50, -300),
  screenCenterX: 512,
  screenCenterY: 384,
});

function addCube(displayList: DisplayList, seconds: number) {
  const placement = createModelPlacement({
    position: new Vector(0, 0, 400),
    rotationY: Angle.fromRadians(seconds),
  });
  // The projector reuses its buffers: add each result before projecting the next model.
  displayList.addShape(projector.project(cube, placement), SCREEN_SPACE_PLACEMENT);
}
```

## Concepts

- **Space:** x right, **y up**, z forward (away from the viewer). Projected output uses the display's y-down screen coordinates.
- **Models:** `WireframeModel.fromDefinition({ vertices, polylines })`, where vertices are es-vector-math `Vector`s and each polyline lists vertex indices plus whether it closes. `createBoxModel` and `createPyramidModel` are included.
- **Placement:** `createModelPlacement({ position, rotationX, rotationY, rotationZ, scale })`, applied as scale, then rotation (x, y, z), then position.
- **Camera:** uses es-vector-math's perspective model. The eye sits `viewDistance` behind a projection plane at `position`, so objects on that plane keep their size. Positive `yaw` turns toward +x; positive `pitch` tilts down.
- **Clipping:** lines closer than `nearDistance` to the eye are cut off, so objects can fly past the camera without lines stretching across the screen.

## License

MIT © Rick Segrest
