import { Angle, Vector } from "es-vector-math";
import { describe, expect, it } from "vitest";
import {
    buildMeshTopology,
    createModelPlacement,
    DEFAULT_PERSPECTIVE_CAMERA,
    FirstPersonCamera,
    fitToSphere,
    MeshScene,
    readGltf,
    readObj,
    weldMesh,
    WireframeModel,
    WireframeProjector,
    type MeshSceneItem,
    type PerspectiveCamera,
    type TriangleMesh,
} from "./index.js";

// A cube from -1 to 1, its faces wound anticlockwise seen from outside (in this library's
// space), as the readers leave a model.
function cube(): TriangleMesh {
    const positions = Float32Array.from([
        -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
        -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
    ]);
    // Each face as two triangles; for each, the corners turn anticlockwise seen from outside.
    const quads = [
        [0, 3, 2, 1], // z = -1, seen from -z
        [4, 5, 6, 7], // z = +1
        [0, 1, 5, 4], // y = -1
        [3, 7, 6, 2], // y = +1
        [0, 4, 7, 3], // x = -1
        [1, 2, 6, 5], // x = +1
    ];
    const indices = quads.flatMap(([a, b, c, d]) => [a, b, c, a, c, d]);
    return { positions, indices: Uint32Array.from(indices) };
}

const SCREEN = { screenWidth: 1024, screenHeight: 768 };

function segmentsOf(geometry: { segmentCoordinates: Float32Array; segmentCount: number }): number[][] {
    return Array.from({ length: geometry.segmentCount }, (_, index) => Array.from(geometry.segmentCoordinates.subarray(index * 4, index * 4 + 4)));
}

describe("the mesh scene's projection", () => {
    it("draws what WireframeProjector draws, for the same camera and placement", () => {
        // A tetrahedron: every fold is sharp, so with hidden lines off every edge is drawn.
        const positions = Float32Array.from([0, 1.2, 0, -1, -0.6, -0.7, 1, -0.6, -0.7, 0, -0.6, 1.1]);
        const indices = Uint32Array.from([0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2]);
        const topology = buildMeshTopology({ positions, indices });
        const camera: PerspectiveCamera = {
            ...DEFAULT_PERSPECTIVE_CAMERA,
            position: new Vector(0.5, -0.3, -2),
            yaw: Angle.fromRadians(0.3),
            pitch: Angle.fromRadians(-0.2),
            viewDistance: 300,
        };
        const placement = createModelPlacement({
            position: new Vector(0.2, 0.1, 6),
            rotationX: Angle.fromRadians(0.4),
            rotationY: Angle.fromRadians(-0.7),
            rotationZ: Angle.fromRadians(0.25),
            scale: 1.5,
        });
        const scene = new MeshScene({ ...SCREEN, hiddenLines: false });
        const [lines] = scene.render(camera, [{ topology, placement, drawAllEdges: true }]);
        const fromMesh = [...segmentsOf(lines.silhouettes), ...segmentsOf(lines.creases), ...segmentsOf(lines.otherEdges)];

        const vertices = Array.from({ length: 4 }, (_, vertex) => new Vector(positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]));
        const polylines = Array.from({ length: topology.edgeCount }, (_, edge) => ({
            vertexIndices: [topology.edgeVertices[edge * 2], topology.edgeVertices[edge * 2 + 1]],
            isClosed: false,
        }));
        const wireframe = WireframeModel.fromDefinition({ vertices, polylines });
        const fromWireframe = segmentsOf(new WireframeProjector(camera).project(wireframe, placement));

        const key = (segment: number[]): string => {
            const [a, b] = [segment.slice(0, 2), segment.slice(2)].map((point) => point.map((value) => value.toFixed(2)).join(","));
            return [a, b].sort().join(" ");
        };
        expect(fromMesh.map(key).sort()).toEqual(fromWireframe.map(key).sort());
        expect(fromMesh).toHaveLength(6);
    });
});

describe("reading models", () => {
    it("reads OBJ positions and faces, any corner syntax, negative indices and polygons", () => {
        const mesh = readObj(
            ["# a quad and a triangle", "o thing", "v 0 0 0", "v 1 0 0", "v 1 1 0", "v 0 1 0", "vt 0 0", "vn 0 0 1", "f 1/1/1 2/1/1 3//1 4", "f -4 -3 -1", ""].join("\r\n"),
            { fromRightHanded: false },
        );
        expect(Array.from(mesh.indices)).toEqual([0, 1, 2, 0, 2, 3, 0, 1, 3]);
        expect(mesh.positions).toHaveLength(12);
        expect(() => readObj("v 0 0 0\nf 1 2 3")).toThrow(/has not defined/);
    });

    it("converts from the files' right-handed space: z negated, winding reversed", () => {
        const mesh = readObj("v 0 0 1\nv 1 0 1\nv 0 1 1\nf 1 2 3");
        expect(Array.from(mesh.positions)).toEqual([0, 0, -1, 1, 0, -1, 0, 1, -1]);
        expect(Array.from(mesh.indices)).toEqual([0, 2, 1]);
        // A triangle that faced the file's viewer (+z, anticlockwise from there) now faces this
        // library's camera, at -z: its normal points toward -z.
        const [, , nz] = buildMeshTopology(mesh).faceNormals;
        expect(nz).toBeLessThan(0);
    });

    it("reads glTF: embedded buffers, node transforms, indices, and .glb containers", () => {
        // One triangle at (0,0,0), (1,0,0), (0,1,0), with 16-bit indices, in a node moved by (10, 0, 0)
        // under a parent scaled by 2.
        const floats = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
        const shorts = new Uint16Array([0, 1, 2, 0]); // padded to 4-byte alignment
        const bytes = new Uint8Array(floats.byteLength + shorts.byteLength);
        bytes.set(new Uint8Array(floats.buffer), 0);
        bytes.set(new Uint8Array(shorts.buffer), floats.byteLength);
        const base64 = btoa(String.fromCharCode(...bytes));
        const document = (uri?: string) => ({
            asset: { version: "2.0" },
            scene: 0,
            scenes: [{ nodes: [0] }],
            nodes: [{ scale: [2, 2, 2], children: [1] }, { mesh: 0, translation: [10, 0, 0] }],
            meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
            accessors: [
                { bufferView: 0, componentType: 5126, count: 3, type: "VEC3" },
                { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
            ],
            bufferViews: [
                { buffer: 0, byteOffset: 0, byteLength: floats.byteLength },
                { buffer: 0, byteOffset: floats.byteLength, byteLength: 6 },
            ],
            buffers: [{ byteLength: bytes.byteLength, ...(uri === undefined ? {} : { uri }) }],
        });
        const expected = [20, 0, 0, 22, 0, 0, 20, 2, 0];
        const fromJson = readGltf(JSON.stringify(document(`data:application/octet-stream;base64,${base64}`)), { fromRightHanded: false });
        expect(Array.from(fromJson.positions)).toEqual(expected);
        expect(Array.from(fromJson.indices)).toEqual([0, 1, 2]);

        // The same as a .glb: a 12-byte header, a JSON chunk and a binary chunk, each padded to 4 bytes.
        const json = new TextEncoder().encode(JSON.stringify(document()));
        const jsonLength = Math.ceil(json.byteLength / 4) * 4;
        const glb = new Uint8Array(12 + 8 + jsonLength + 8 + bytes.byteLength);
        const view = new DataView(glb.buffer);
        view.setUint32(0, 0x46546c67, true);
        view.setUint32(4, 2, true);
        view.setUint32(8, glb.byteLength, true);
        view.setUint32(12, jsonLength, true);
        view.setUint32(16, 0x4e4f534a, true);
        glb.fill(0x20, 20, 20 + jsonLength);
        glb.set(json, 20);
        view.setUint32(20 + jsonLength, bytes.byteLength, true);
        view.setUint32(24 + jsonLength, 0x004e4942, true);
        glb.set(bytes, 28 + jsonLength);
        expect(Array.from(readGltf(glb.buffer, { fromRightHanded: false }).positions)).toEqual(expected);

        expect(() => readGltf(JSON.stringify(document("model.bin")))).toThrow(/resolveUri/);
        expect(() => readGltf(JSON.stringify({ ...document(), extensionsRequired: ["KHR_draco_mesh_compression"] }))).toThrow(/compression/);
    });
});

describe("preparing meshes", () => {
    it("welds repeated vertices so triangles become neighbors, and fits a mesh to a sphere", () => {
        // Two triangles sharing an edge, but each with its own copies of the vertices.
        const separate = { positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0]), indices: Uint32Array.from([0, 1, 2, 3, 4, 5]) };
        expect(buildMeshTopology(separate).edgeCount).toBe(6);
        const welded = weldMesh(separate);
        expect(welded.positions).toHaveLength(12);
        expect(buildMeshTopology(welded).edgeCount).toBe(5);

        const fitted = fitToSphere({ positions: Float32Array.from([10, 10, 10, 14, 10, 10, 10, 13, 10]), indices: Uint32Array.from([0, 1, 2]) }, 2);
        const farthest = Math.max(...Array.from({ length: 3 }, (_, vertex) => Math.hypot(fitted.positions[vertex * 3], fitted.positions[vertex * 3 + 1], fitted.positions[vertex * 3 + 2])));
        expect(farthest).toBeCloseTo(2, 6);
    });

    it("finds a cube's edges, folds and closedness", () => {
        const topology = buildMeshTopology(cube());
        // 12 cube edges and 6 face diagonals.
        expect(topology.edgeCount).toBe(18);
        expect(topology.isClosed).toBe(true);
        const folds = Array.from(topology.edgeCosine).filter((cosine) => Math.abs(cosine) < 1e-6).length;
        expect(folds).toBe(12);
        expect(topology.boundingRadius).toBeCloseTo(Math.sqrt(3), 6);
        const open = buildMeshTopology({ positions: Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: Uint32Array.from([0, 1, 2]) });
        expect(open.isClosed).toBe(false);
    });
});

describe("the mesh scene", () => {
    const topology = buildMeshTopology(cube());
    const camera = DEFAULT_PERSPECTIVE_CAMERA;

    it("draws a cube seen corner-on as its nine visible edges, and head-on as a square", () => {
        const scene = new MeshScene(SCREEN);
        const cornerOn = createModelPlacement({ position: new Vector(0, 0, 8), rotationX: Angle.fromDegrees(35), rotationY: Angle.fromDegrees(45), scale: 1 });
        const [corner] = scene.render(camera, [{ topology, placement: cornerOn }]);
        expect(corner.silhouettes.segmentCount).toBe(6);
        expect(corner.creases.segmentCount).toBe(3);

        const headOn = createModelPlacement({ position: new Vector(0, 0, 8) });
        const [square] = scene.render(camera, [{ topology, placement: headOn }]);
        expect(square.silhouettes.segmentCount + square.creases.segmentCount).toBe(4);
        expect(scene.lastStatistics.segments).toBe(4);
    });

    it("hides a model behind another, unless the front one is see-through", () => {
        const scene = new MeshScene(SCREEN);
        const front: MeshSceneItem = { topology, placement: createModelPlacement({ position: new Vector(0, 0, 8), scale: 2 }) };
        const behind: MeshSceneItem = { topology, placement: createModelPlacement({ position: new Vector(0, 0, 20), rotationY: Angle.fromDegrees(30), scale: 0.5 }) };
        const [, hidden] = scene.render(camera, [front, behind]);
        expect(hidden.silhouettes.segmentCount + hidden.creases.segmentCount).toBe(0);
        const [, shown] = scene.render(camera, [{ ...front, hidesOthers: false }, behind]);
        expect(shown.silhouettes.segmentCount + shown.creases.segmentCount).toBeGreaterThan(0);
    });

    it("culls models behind the camera or off the screen", () => {
        const scene = new MeshScene(SCREEN);
        const lines = scene.render(camera, [
            { topology, placement: createModelPlacement({ position: new Vector(0, 0, -900) }) },
            { topology, placement: createModelPlacement({ position: new Vector(10000, 0, 8) }) },
            { topology, placement: createModelPlacement({ position: new Vector(0, 0, 8) }) },
        ]);
        expect(lines.map((item) => item.isCulled)).toEqual([true, true, false]);
        expect(scene.lastStatistics.culled).toBe(2);
    });

    it("clips at the near plane: a model the camera stands inside draws only what is in front", () => {
        const scene = new MeshScene(SCREEN);
        const nearCamera: PerspectiveCamera = { ...camera, viewDistance: 400, nearDistance: 50 };
        // A big box around the eye: the eye is at z = -400 in camera space, the box spans ±500.
        const [inside] = scene.render(nearCamera, [{ topology, placement: createModelPlacement({ position: new Vector(0, 0, -400), scale: 500 }) }]);
        const segments = [...segmentsOf(inside.silhouettes), ...segmentsOf(inside.creases)];
        expect(segments.length).toBeGreaterThan(0);
        for (const value of segments.flat()) expect(Number.isFinite(value)).toBe(true);
    });
});

describe("FirstPersonCamera", () => {
    it("walks the way it faces, and stops tilting short of straight up", () => {
        const viewer = new FirstPersonCamera(new Vector(0, 1.6, 0));
        viewer.walk(2);
        expect(viewer.position.z).toBeCloseTo(2);
        viewer.turn(Math.PI / 2);
        viewer.walk(1, 0.5);
        expect(viewer.position.x).toBeCloseTo(1);
        expect(viewer.position.z).toBeCloseTo(1.5);
        viewer.turn(0, 10);
        expect(viewer.pitch).toBeLessThan(Math.PI / 2);
        const projected = viewer.perspectiveCamera();
        expect(projected.yaw.radians).toBeCloseTo(Math.PI / 2);
        expect(projected.position.y).toBeCloseTo(1.6);
    });
});
