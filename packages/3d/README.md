# @vector-display/3d

3D for [**vector-display**](https://www.npmjs.com/package/@vector-display/core): wireframe models and perspective projection for *Battlezone*-, *Tempest*- and *Star Wars*-style graphics, and triangle meshes from OBJ and glTF files (what Blender exports) drawn as line drawings with hidden lines removed. The math is built on [es-vector-math](https://www.npmjs.com/package/es-vector-math).

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

## Meshes from files

A mesh is drawn the way a draftsman would draw it: of all its edges, the outline (silhouette edges, where a surface facing you meets one facing away), sharp folds (creases) and open borders, with whatever any model in the scene hides cut away.

```ts
import { DisplayList, SCREEN_SPACE_PLACEMENT } from "@vector-display/core";
import {
  DEFAULT_PERSPECTIVE_CAMERA,
  FirstPersonCamera,
  MeshScene,
  buildMeshTopology,
  createModelPlacement,
  fitToSphere,
  readGltf,
  weldMesh,
} from "@vector-display/3d";
import { Vector } from "es-vector-math";

// Once: read, weld (files repeat vertices per triangle), size, and work out the edges.
const bytes = new Uint8Array(await (await fetch("cabinet.glb")).arrayBuffer());
const cabinet = buildMeshTopology(fitToSphere(weldMesh(readGltf(bytes)), 100));

const scene = new MeshScene({ screenWidth: 1024, screenHeight: 768 });
const viewer = new FirstPersonCamera(new Vector(0, 60, -300));

function addScene(displayList: DisplayList) {
  const camera = viewer.perspectiveCamera({ ...DEFAULT_PERSPECTIVE_CAMERA, screenCenterX: 512, screenCenterY: 384 });
  const items = [-150, 0, 150].map((x) => ({ topology: cabinet, placement: createModelPlacement({ position: new Vector(x, 0, 200) }) }));
  // One MeshLines per item; the geometry is reused by the next render, so add it now.
  for (const lines of scene.render(camera, items)) {
    displayList.addShape(lines.silhouettes, SCREEN_SPACE_PLACEMENT);
    displayList.addShape(lines.creases, { ...SCREEN_SPACE_PLACEMENT, intensity: 0.7 });
  }
}
```

- **Reading:** `readObj(text)` and `readGltf(input)` (a `.glb` as bytes, or a `.gltf` as text, bytes or JSON; buffers in separate files through `resolveUri`). Every mesh the glTF scene places is read with its node's transform, as one mesh. Only positions and triangles are kept. Compressed models (Draco, quantized) are refused with a message: export without compression.
- **Axes:** OBJ and glTF files, and Blender's exporters, use a right-handed space (y up, z toward the viewer). The readers convert it to this library's space (z away from the viewer) by negating z and reversing each triangle's winding, so models are not mirrored and their front, the file's +z side, faces the default camera. `{ fromRightHanded: false }` reads the coordinates as they are.
- **Preparing:** `weldMesh` merges repeated vertices (triangles only share edges once they share vertices); `fitToSphere(mesh, radius)` centers the mesh and scales it to a known size; `buildMeshTopology` works out the edges, how sharp each is, and a bounding sphere, once per model.
- **The scene:** `new MeshScene({ screenWidth, screenHeight })`, then `render(camera, items)` every frame. Each item is a topology and a placement, with `creaseAngleDegrees` (default 30), `drawAllEdges` (the mesh's triangles too) and `hidesOthers` (default true; off for a see-through model). Models wholly behind the camera or off the screen are skipped (`isCulled`); triangles and lines are clipped at the camera's `nearDistance`, so the viewer can stand inside a room.
- **Hidden lines:** by a depth buffer over the screen (`depthColumns`, default 512, sets its resolution). It is approximate, a cell at most, and works for any shape. `hiddenLines: false` turns it off.
- **Walking:** `FirstPersonCamera` turns, tilts and walks on the floor the way it faces, and gives the `PerspectiveCamera` to render with.

## License

MIT © Rick Segrest
