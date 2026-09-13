import { describe, expect, it } from "vitest";
import { DisplayList, FLOATS_PER_BEAM_SEGMENT, Shape } from "./index.js";

const IDENTITY_PLACEMENT = { x: 0, y: 0, rotation: 0, scale: 1, intensity: 1 };

function readSegment(displayList: DisplayList, segmentIndex: number): number[] {
    const start = segmentIndex * FLOATS_PER_BEAM_SEGMENT;
    return Array.from(displayList.getSegmentData().slice(start, start + FLOATS_PER_BEAM_SEGMENT));
}

describe("Shape", () => {
    it("closes a polyline back to its first point", () => {
        const square = Shape.fromPolyline({
            points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }],
            isClosed: true,
        });
        expect(square.segmentCount).toBe(4);
        expect(Array.from(square.segmentCoordinates.slice(12, 16))).toEqual([0, 1, 0, 0]);
    });

    it("does not close an open polyline", () => {
        const zigzag = Shape.fromPolyline({
            points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }],
            isClosed: false,
        });
        expect(zigzag.segmentCount).toBe(2);
    });

    it("combines several polylines into one shape", () => {
        const twoLines = Shape.fromPolylines([
            { points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], isClosed: false },
            { points: [{ x: 0, y: 1 }, { x: 1, y: 1 }], isClosed: false },
        ]);
        expect(twoLines.segmentCount).toBe(2);
    });

    it("turns a single point into a zero-length dot segment", () => {
        const dot = Shape.fromPolyline({ points: [{ x: 3, y: 4 }], isClosed: false });
        expect(Array.from(dot.segmentCoordinates)).toEqual([3, 4, 3, 4]);
        expect(Array.from(Shape.createDot().segmentCoordinates)).toEqual([0, 0, 0, 0]);
    });

    it("rejects segment coordinates that are not in groups of four", () => {
        expect(() => Shape.fromSegmentCoordinates([0, 0, 1])).toThrow(Error);
    });
});

describe("DisplayList", () => {
    const unitLine = Shape.fromSegmentCoordinates([0, 0, 1, 0]);

    it("translates, rotates clockwise in y-down space, and scales segments", () => {
        const displayList = new DisplayList();
        displayList.addShape(unitLine, { x: 10, y: 20, rotation: Math.PI / 2, scale: 5, intensity: 1 });
        const [startX, startY, endX, endY] = readSegment(displayList, 0);
        expect([startX, startY]).toEqual([10, 20]);
        expect(endX).toBeCloseTo(10);
        expect(endY).toBeCloseTo(25);
    });

    it("packs the current color and the placement intensity with each segment", () => {
        const displayList = new DisplayList();
        displayList.setColor({ red: 0, green: 0.5, blue: 0.25 });
        displayList.addShape(unitLine, { ...IDENTITY_PLACEMENT, intensity: 0.75 });
        expect(readSegment(displayList, 0).slice(4)).toEqual([0, 0.5, 0.25, 0.75]);
    });

    it("keeps earlier segments when growing past its initial capacity", () => {
        const displayList = new DisplayList();
        const manySegments = Shape.fromSegmentCoordinates(new Array(3000 * 4).fill(0));
        displayList.addShape(unitLine, { ...IDENTITY_PLACEMENT, x: 7 });
        displayList.addShape(manySegments, IDENTITY_PLACEMENT);
        expect(displayList.segmentCount).toBe(3001);
        expect(readSegment(displayList, 0).slice(0, 4)).toEqual([7, 0, 8, 0]);
        expect(displayList.getSegmentData().length).toBe(3001 * FLOATS_PER_BEAM_SEGMENT);
    });

    it("starts empty again after clear()", () => {
        const displayList = new DisplayList();
        displayList.addShape(unitLine, IDENTITY_PLACEMENT);
        displayList.clear();
        expect(displayList.segmentCount).toBe(0);
        expect(displayList.getSegmentData().length).toBe(0);
    });
});
