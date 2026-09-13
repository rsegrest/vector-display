import type { Polyline } from "./geometryTypes.js";

export const FLOATS_PER_SHAPE_SEGMENT = 4;
export const NO_NEIGHBOR_SEGMENT = -1;

interface ShapeBuffers {
    readonly coordinates: number[];
    readonly neighborIndices: number[];
}

export class Shape {
    public readonly segmentCoordinates: Float32Array;
    // Two entries per segment: the index of the connected previous and next segment, or NO_NEIGHBOR_SEGMENT.
    public readonly segmentNeighbors: Int32Array;

    private constructor(buffers: ShapeBuffers) {
        this.segmentCoordinates = Float32Array.from(buffers.coordinates);
        this.segmentNeighbors = Int32Array.from(buffers.neighborIndices);
    }

    public get segmentCount(): number {
        return this.segmentCoordinates.length / FLOATS_PER_SHAPE_SEGMENT;
    }

    public static fromPolyline(polyline: Polyline): Shape {
        return Shape.fromPolylines([polyline]);
    }

    public static fromPolylines(polylines: readonly Polyline[]): Shape {
        const buffers: ShapeBuffers = { coordinates: [], neighborIndices: [] };
        for (const polyline of polylines) {
            appendPolylineSegments(buffers, polyline);
        }
        return new Shape(buffers);
    }

    // Consecutive segments whose end and start coincide are treated as connected, including last-to-first.
    public static fromSegmentCoordinates(segmentCoordinates: ArrayLike<number>): Shape {
        if (segmentCoordinates.length % FLOATS_PER_SHAPE_SEGMENT !== 0) {
            throw new Error(
                `Segment coordinates must come in groups of ${FLOATS_PER_SHAPE_SEGMENT} (x0, y0, x1, y1), but received ${segmentCoordinates.length} values`,
            );
        }
        const coordinates = Array.from(segmentCoordinates);
        return new Shape({ coordinates, neighborIndices: findTouchingNeighbors(coordinates) });
    }

    // A zero-length segment renders as a round dot, like a bullet on a vector monitor.
    public static createDot(): Shape {
        return new Shape({ coordinates: [0, 0, 0, 0], neighborIndices: [NO_NEIGHBOR_SEGMENT, NO_NEIGHBOR_SEGMENT] });
    }
}

function appendPolylineSegments(buffers: ShapeBuffers, polyline: Polyline): void {
    const { points, isClosed } = polyline;
    if (points.length === 0) return;
    if (points.length === 1) {
        buffers.coordinates.push(points[0].x, points[0].y, points[0].x, points[0].y);
        buffers.neighborIndices.push(NO_NEIGHBOR_SEGMENT, NO_NEIGHBOR_SEGMENT);
        return;
    }
    const firstSegmentIndex = buffers.coordinates.length / FLOATS_PER_SHAPE_SEGMENT;
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
        const start = points[pointIndex];
        const end = points[pointIndex + 1];
        buffers.coordinates.push(start.x, start.y, end.x, end.y);
    }
    const wrapsAround = isClosed && points.length > 2;
    if (wrapsAround) {
        const last = points[points.length - 1];
        buffers.coordinates.push(last.x, last.y, points[0].x, points[0].y);
    }
    const segmentCount = buffers.coordinates.length / FLOATS_PER_SHAPE_SEGMENT - firstSegmentIndex;
    appendChainNeighbors(buffers.neighborIndices, { firstSegmentIndex, segmentCount, wrapsAround });
}

function appendChainNeighbors(
    neighborIndices: number[],
    chain: { firstSegmentIndex: number; segmentCount: number; wrapsAround: boolean },
): void {
    const { firstSegmentIndex, segmentCount, wrapsAround } = chain;
    const lastSegmentIndex = firstSegmentIndex + segmentCount - 1;
    for (let segmentIndex = firstSegmentIndex; segmentIndex <= lastSegmentIndex; segmentIndex++) {
        const isFirst = segmentIndex === firstSegmentIndex;
        const isLast = segmentIndex === lastSegmentIndex;
        const previousIndex = isFirst ? (wrapsAround ? lastSegmentIndex : NO_NEIGHBOR_SEGMENT) : segmentIndex - 1;
        const nextIndex = isLast ? (wrapsAround ? firstSegmentIndex : NO_NEIGHBOR_SEGMENT) : segmentIndex + 1;
        neighborIndices.push(previousIndex, nextIndex);
    }
}

function findTouchingNeighbors(coordinates: readonly number[]): number[] {
    const segmentCount = coordinates.length / FLOATS_PER_SHAPE_SEGMENT;
    const neighborIndices = new Array<number>(segmentCount * 2).fill(NO_NEIGHBOR_SEGMENT);
    for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex++) {
        const nextIndex = (segmentIndex + 1) % segmentCount;
        if (nextIndex === segmentIndex) continue;
        if (nextIndex === 0 && segmentCount <= 2) continue;
        const endOffset = segmentIndex * FLOATS_PER_SHAPE_SEGMENT + 2;
        const nextStartOffset = nextIndex * FLOATS_PER_SHAPE_SEGMENT;
        const touches =
            coordinates[endOffset] === coordinates[nextStartOffset] &&
            coordinates[endOffset + 1] === coordinates[nextStartOffset + 1];
        if (!touches) continue;
        neighborIndices[segmentIndex * 2 + 1] = nextIndex;
        neighborIndices[nextIndex * 2] = segmentIndex;
    }
    return neighborIndices;
}

export default Shape;
