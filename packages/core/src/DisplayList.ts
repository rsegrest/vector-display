import type { BeamColor, ShapePlacement } from "./geometryTypes.js";
import { NO_NEIGHBOR_SEGMENT, type Shape } from "./Shape.js";

// Packed per segment (world units):
//  0-3  x0, y0, x1, y1
//  4-5  start point of the connected previous segment
//  6-7  end point of the connected next segment
//  8-11 red, green, blue, intensity
// 12-13 hasPreviousNeighbor, hasNextNeighbor (1 or 0)
export const FLOATS_PER_BEAM_SEGMENT = 14;

const INITIAL_SEGMENT_CAPACITY = 1024;
const WHITE: BeamColor = { red: 1, green: 1, blue: 1 };

// The beam's drawing program for one frame, in draw order. Reused across frames to avoid allocation.
export class DisplayList {
    private segmentData = new Float32Array(INITIAL_SEGMENT_CAPACITY * FLOATS_PER_BEAM_SEGMENT);
    private usedSegmentCount = 0;
    private currentColor: BeamColor = WHITE;

    public get segmentCount(): number {
        return this.usedSegmentCount;
    }

    public getSegmentData(): Float32Array {
        return this.segmentData.subarray(0, this.usedSegmentCount * FLOATS_PER_BEAM_SEGMENT);
    }

    public clear(): void {
        this.usedSegmentCount = 0;
    }

    public setColor(color: BeamColor): void {
        this.currentColor = color;
    }

    public addShape(shape: Shape, placement: ShapePlacement): void {
        this.ensureCapacity(this.usedSegmentCount + shape.segmentCount);
        this.writeTransformedSegments(shape, placement);
        this.usedSegmentCount += shape.segmentCount;
    }

    private ensureCapacity(requiredSegmentCount: number): void {
        const currentCapacity = this.segmentData.length / FLOATS_PER_BEAM_SEGMENT;
        if (requiredSegmentCount <= currentCapacity) return;
        let newCapacity = currentCapacity;
        while (newCapacity < requiredSegmentCount) newCapacity *= 2;
        const grownData = new Float32Array(newCapacity * FLOATS_PER_BEAM_SEGMENT);
        grownData.set(this.getSegmentData());
        this.segmentData = grownData;
    }

    // World coordinates use a y-down origin at the top left, so positive rotation turns clockwise on screen.
    private writeTransformedSegments(shape: Shape, placement: ShapePlacement): void {
        const { x, y, rotation, scale, intensity } = placement;
        const { red, green, blue } = this.currentColor;
        const scaledCosine = Math.cos(rotation) * scale;
        const scaledSine = Math.sin(rotation) * scale;
        const source = shape.segmentCoordinates;
        const neighbors = shape.segmentNeighbors;
        const target = this.segmentData;
        let targetIndex = this.usedSegmentCount * FLOATS_PER_BEAM_SEGMENT;
        for (let segmentIndex = 0; segmentIndex < shape.segmentCount; segmentIndex++) {
            const sourceIndex = segmentIndex * 4;
            const previousSegment = neighbors[segmentIndex * 2];
            const nextSegment = neighbors[segmentIndex * 2 + 1];
            // Fall back to this segment's own points so unused neighbor slots hold finite values.
            const previousStartIndex = previousSegment === NO_NEIGHBOR_SEGMENT ? sourceIndex : previousSegment * 4;
            const nextEndIndex = nextSegment === NO_NEIGHBOR_SEGMENT ? sourceIndex + 2 : nextSegment * 4 + 2;
            const startX = source[sourceIndex];
            const startY = source[sourceIndex + 1];
            const endX = source[sourceIndex + 2];
            const endY = source[sourceIndex + 3];
            const previousStartX = source[previousStartIndex];
            const previousStartY = source[previousStartIndex + 1];
            const nextEndX = source[nextEndIndex];
            const nextEndY = source[nextEndIndex + 1];
            target[targetIndex] = x + startX * scaledCosine - startY * scaledSine;
            target[targetIndex + 1] = y + startX * scaledSine + startY * scaledCosine;
            target[targetIndex + 2] = x + endX * scaledCosine - endY * scaledSine;
            target[targetIndex + 3] = y + endX * scaledSine + endY * scaledCosine;
            target[targetIndex + 4] = x + previousStartX * scaledCosine - previousStartY * scaledSine;
            target[targetIndex + 5] = y + previousStartX * scaledSine + previousStartY * scaledCosine;
            target[targetIndex + 6] = x + nextEndX * scaledCosine - nextEndY * scaledSine;
            target[targetIndex + 7] = y + nextEndX * scaledSine + nextEndY * scaledCosine;
            target[targetIndex + 8] = red;
            target[targetIndex + 9] = green;
            target[targetIndex + 10] = blue;
            target[targetIndex + 11] = intensity;
            target[targetIndex + 12] = previousSegment === NO_NEIGHBOR_SEGMENT ? 0 : 1;
            target[targetIndex + 13] = nextSegment === NO_NEIGHBOR_SEGMENT ? 0 : 1;
            targetIndex += FLOATS_PER_BEAM_SEGMENT;
        }
    }
}

export default DisplayList;
