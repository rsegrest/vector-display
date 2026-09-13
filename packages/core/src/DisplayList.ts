import type { BeamColor, ShapePlacement } from "./geometryTypes.js";
import type { Shape } from "./Shape.js";

// Packed per segment: x0, y0, x1, y1 (world units), red, green, blue, intensity.
export const FLOATS_PER_BEAM_SEGMENT = 8;

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
        const target = this.segmentData;
        let targetIndex = this.usedSegmentCount * FLOATS_PER_BEAM_SEGMENT;
        for (let sourceIndex = 0; sourceIndex < source.length; sourceIndex += 4) {
            const startX = source[sourceIndex];
            const startY = source[sourceIndex + 1];
            const endX = source[sourceIndex + 2];
            const endY = source[sourceIndex + 3];
            target[targetIndex] = x + startX * scaledCosine - startY * scaledSine;
            target[targetIndex + 1] = y + startX * scaledSine + startY * scaledCosine;
            target[targetIndex + 2] = x + endX * scaledCosine - endY * scaledSine;
            target[targetIndex + 3] = y + endX * scaledSine + endY * scaledCosine;
            target[targetIndex + 4] = red;
            target[targetIndex + 5] = green;
            target[targetIndex + 6] = blue;
            target[targetIndex + 7] = intensity;
            targetIndex += FLOATS_PER_BEAM_SEGMENT;
        }
    }
}

export default DisplayList;
