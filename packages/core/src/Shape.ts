import type { Polyline } from "./geometryTypes.js";

export const FLOATS_PER_SHAPE_SEGMENT = 4;

export class Shape {
    public readonly segmentCoordinates: Float32Array;

    private constructor(segmentCoordinates: Float32Array) {
        this.segmentCoordinates = segmentCoordinates;
    }

    public get segmentCount(): number {
        return this.segmentCoordinates.length / FLOATS_PER_SHAPE_SEGMENT;
    }

    public static fromPolyline(polyline: Polyline): Shape {
        return Shape.fromPolylines([polyline]);
    }

    public static fromPolylines(polylines: readonly Polyline[]): Shape {
        const coordinates: number[] = [];
        for (const polyline of polylines) {
            appendPolylineSegments(coordinates, polyline);
        }
        return new Shape(Float32Array.from(coordinates));
    }

    public static fromSegmentCoordinates(segmentCoordinates: ArrayLike<number>): Shape {
        if (segmentCoordinates.length % FLOATS_PER_SHAPE_SEGMENT !== 0) {
            throw new Error(
                `Segment coordinates must come in groups of ${FLOATS_PER_SHAPE_SEGMENT} (x0, y0, x1, y1), but received ${segmentCoordinates.length} values`,
            );
        }
        return new Shape(Float32Array.from(segmentCoordinates));
    }

    // A zero-length segment renders as a round dot, like a bullet on a vector monitor.
    public static createDot(): Shape {
        return new Shape(new Float32Array(FLOATS_PER_SHAPE_SEGMENT));
    }
}

function appendPolylineSegments(coordinates: number[], polyline: Polyline): void {
    const { points, isClosed } = polyline;
    if (points.length === 1) {
        coordinates.push(points[0].x, points[0].y, points[0].x, points[0].y);
        return;
    }
    for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex++) {
        const start = points[pointIndex];
        const end = points[pointIndex + 1];
        coordinates.push(start.x, start.y, end.x, end.y);
    }
    if (isClosed && points.length > 2) {
        const last = points[points.length - 1];
        coordinates.push(last.x, last.y, points[0].x, points[0].y);
    }
}

export default Shape;
