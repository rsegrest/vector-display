import { DisplayList, SCREEN_SPACE_PLACEMENT } from "@vector-display/core";
import { Angle, Vector } from "es-vector-math";
import { describe, expect, it } from "vitest";
import {
    DEFAULT_PERSPECTIVE_CAMERA,
    WireframeModel,
    WireframeProjector,
    createBoxModel,
    createModelPlacement,
    createPyramidModel,
    type PerspectiveCamera,
} from "./index.js";

// Default camera: projection plane at the origin, eye 400 units behind it, screen center (512, 384).
const AT_ORIGIN = createModelPlacement({});

function createLine(start: Vector, end: Vector): WireframeModel {
    return WireframeModel.fromDefinition({ vertices: [start, end], polylines: [{ vertexIndices: [0, 1], isClosed: false }] });
}

function readSegments(geometry: { segmentCoordinates: Float32Array; segmentCount: number }): number[][] {
    return Array.from({ length: geometry.segmentCount }, (_, segment) =>
        Array.from(geometry.segmentCoordinates.slice(segment * 4, segment * 4 + 4)),
    );
}

function projectOnce(model: WireframeModel, camera: PerspectiveCamera = DEFAULT_PERSPECTIVE_CAMERA): number[][] {
    const projector = new WireframeProjector(camera);
    return readSegments(projector.project(model, AT_ORIGIN));
}

describe("WireframeProjector perspective", () => {
    it("keeps points on the projection plane at their size, with y pointing up", () => {
        const [[startX, startY, endX, endY]] = projectOnce(createLine(new Vector(0, 0, 0), new Vector(100, 50, 0)));
        expect([startX, startY]).toEqual([512, 384]);
        expect(endX).toBeCloseTo(612);
        expect(endY).toBeCloseTo(334);
    });

    it("halves offsets at one view distance beyond the plane", () => {
        const [[, , endX]] = projectOnce(createLine(new Vector(0, 0, 400), new Vector(100, 0, 400)));
        expect(endX).toBeCloseTo(562);
    });

    it("scales, rotates with es-vector-math, then moves each model", () => {
        const model = createLine(new Vector(0, 0, 0), new Vector(50, 0, 0));
        const projector = new WireframeProjector(DEFAULT_PERSPECTIVE_CAMERA);
        const scaledAndMoved = readSegments(projector.project(model, createModelPlacement({ scale: 2, position: new Vector(0, 0, 400) })));
        expect(scaledAndMoved[0][2]).toBeCloseTo(562);
        const turned = readSegments(projector.project(model, createModelPlacement({ rotationY: Angle.fromDegrees(90) })));
        expect(turned[0][2]).toBeCloseTo(512);
    });
});

describe("WireframeProjector camera", () => {
    it("turns the view toward +x with positive yaw", () => {
        const camera = { ...DEFAULT_PERSPECTIVE_CAMERA, yaw: Angle.fromDegrees(90) };
        const [[startX, , endX]] = projectOnce(createLine(new Vector(200, 0, 0), new Vector(0, 0, 200)), camera);
        expect(startX).toBeCloseTo(512);
        expect(endX).toBeCloseTo(312);
    });

    it("tilts the view down with positive pitch", () => {
        const camera = { ...DEFAULT_PERSPECTIVE_CAMERA, pitch: Angle.fromDegrees(90) };
        const [[startX, startY]] = projectOnce(createLine(new Vector(0, -200, 0), new Vector(10, -200, 0)), camera);
        expect(startX).toBeCloseTo(512);
        expect(startY).toBeCloseTo(384);
    });

    it("measures positions relative to the camera position", () => {
        const camera = { ...DEFAULT_PERSPECTIVE_CAMERA, position: new Vector(100, 0, 0) };
        const [[startX]] = projectOnce(createLine(new Vector(100, 0, 0), new Vector(100, 10, 0)), camera);
        expect(startX).toBeCloseTo(512);
    });
});

describe("WireframeProjector near-plane clipping", () => {
    it("drops edges entirely behind the near plane", () => {
        expect(projectOnce(createLine(new Vector(0, 0, -500), new Vector(10, 0, -450)))).toEqual([]);
    });

    it("cuts edges that cross the near plane at that plane", () => {
        // The start is clipped to 1 unit in front of the eye (z = -399), where perspective is 400.
        const [[startX, , endX]] = projectOnce(createLine(new Vector(100, 0, -500), new Vector(100, 0, 100)));
        expect(startX).toBeCloseTo(512 + 100 * 400, 0);
        expect(endX).toBeCloseTo(592);
    });

    it("keeps joints connected unless the shared vertex was clipped", () => {
        const chain = (middle: Vector) =>
            WireframeModel.fromDefinition({
                vertices: [new Vector(-100, 0, 100), middle, new Vector(100, 0, 100)],
                polylines: [{ vertexIndices: [0, 1, 2], isClosed: false }],
            });
        const projector = new WireframeProjector(DEFAULT_PERSPECTIVE_CAMERA);
        const visibleJoint = projector.project(chain(new Vector(0, 0, 100)), AT_ORIGIN);
        expect(Array.from(visibleJoint.segmentNeighbors.slice(0, 4))).toEqual([-1, 1, 0, -1]);
        const clippedJoint = projector.project(chain(new Vector(0, 0, -500)), AT_ORIGIN);
        expect(clippedJoint.segmentCount).toBe(2);
        expect(Array.from(clippedJoint.segmentNeighbors.slice(0, 4))).toEqual([-1, -1, -1, -1]);
    });
});

describe("WireframeModel", () => {
    it("builds boxes and pyramids with the expected edges", () => {
        expect(createBoxModel({ width: 2, height: 2, depth: 2 }).edgeCount).toBe(12);
        expect(createPyramidModel({ baseWidth: 2, height: 3 }).edgeCount).toBe(8);
    });

    it("treats 2D vertices as lying at z = 0", () => {
        const [[, , endX]] = projectOnce(createLine(new Vector(0, 0), new Vector(100, 0)));
        expect(endX).toBeCloseTo(612);
    });

    it("rejects polylines that refer to missing vertices", () => {
        expect(() =>
            WireframeModel.fromDefinition({ vertices: [new Vector(0, 0, 0)], polylines: [{ vertexIndices: [0, 1], isClosed: false }] }),
        ).toThrow(Error);
    });

    it("feeds projected geometry straight into a display list", () => {
        const displayList = new DisplayList();
        const projector = new WireframeProjector(DEFAULT_PERSPECTIVE_CAMERA);
        displayList.addShape(projector.project(createBoxModel({ width: 100, height: 100, depth: 100 }), AT_ORIGIN), SCREEN_SPACE_PLACEMENT);
        expect(displayList.segmentCount).toBe(12);
    });
});
