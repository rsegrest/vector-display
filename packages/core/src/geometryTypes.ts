// Structural types so es-vector-math Vector/Point instances (or any {x, y}) can be passed directly.
export interface PointLike {
    readonly x: number;
    readonly y: number;
}

export interface Polyline {
    readonly points: readonly PointLike[];
    readonly isClosed: boolean;
}

export interface BeamColor {
    readonly red: number;
    readonly green: number;
    readonly blue: number;
}

export interface ShapePlacement {
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
    readonly scale: number;
    readonly intensity: number;
}

// Anything shaped like a Shape can be drawn, including geometry rebuilt each frame (e.g. projected 3D wireframes).
export interface ShapeGeometry {
    readonly segmentCoordinates: Float32Array;
    readonly segmentNeighbors: Int32Array;
    readonly segmentCount: number;
}

// For geometry that is already in world coordinates.
export const SCREEN_SPACE_PLACEMENT: ShapePlacement = { x: 0, y: 0, rotation: 0, scale: 1, intensity: 1 };
