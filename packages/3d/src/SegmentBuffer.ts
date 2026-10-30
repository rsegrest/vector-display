import { FLOATS_PER_SHAPE_SEGMENT, NO_NEIGHBOR_SEGMENT, type ShapeGeometry } from "@vector-display/core";

const INITIAL_SEGMENT_CAPACITY = 256;

// Line segments rebuilt every frame, in screen space: add to it, hand it to a display list,
// clear it for the next frame. It grows as needed and keeps its memory between frames.
// The segments are separate pieces (no shared joints): hidden-line removal cuts lines anywhere.
export class SegmentBuffer implements ShapeGeometry {
    private coordinates = new Float32Array(INITIAL_SEGMENT_CAPACITY * FLOATS_PER_SHAPE_SEGMENT);
    private neighbors = new Int32Array(INITIAL_SEGMENT_CAPACITY * 2).fill(NO_NEIGHBOR_SEGMENT);
    private count = 0;

    public get segmentCoordinates(): Float32Array {
        return this.coordinates;
    }

    public get segmentNeighbors(): Int32Array {
        return this.neighbors;
    }

    public get segmentCount(): number {
        return this.count;
    }

    public clear(): void {
        this.count = 0;
    }

    public addSegment(startX: number, startY: number, endX: number, endY: number): void {
        if (this.count * FLOATS_PER_SHAPE_SEGMENT >= this.coordinates.length) this.grow();
        const offset = this.count * FLOATS_PER_SHAPE_SEGMENT;
        this.coordinates[offset] = startX;
        this.coordinates[offset + 1] = startY;
        this.coordinates[offset + 2] = endX;
        this.coordinates[offset + 3] = endY;
        this.count++;
    }

    private grow(): void {
        const coordinates = new Float32Array(this.coordinates.length * 2);
        coordinates.set(this.coordinates);
        this.coordinates = coordinates;
        const neighbors = new Int32Array(this.neighbors.length * 2).fill(NO_NEIGHBOR_SEGMENT);
        neighbors.set(this.neighbors);
        this.neighbors = neighbors;
    }
}
