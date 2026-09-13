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
