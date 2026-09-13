import { Angle, Vector } from "es-vector-math";

// 3D space: x right, y up, z forward (away from the viewer).
export interface WireframePolyline {
    readonly vertexIndices: readonly number[];
    readonly isClosed: boolean;
}

export interface WireframeDefinition {
    readonly vertices: readonly Vector[];
    readonly polylines: readonly WireframePolyline[];
}

// Applied in order: scale, rotate (x, then y, then z, as in es-vector-math rotateXYZ), then move to position.
export interface ModelPlacement3D {
    readonly position: Vector;
    readonly rotationX: Angle;
    readonly rotationY: Angle;
    readonly rotationZ: Angle;
    readonly scale: number;
}

// Uses es-vector-math's perspective model: the eye sits viewDistance behind the projection plane at position,
// so points on that plane (z = 0 relative to the camera) keep their size.
export interface PerspectiveCamera {
    readonly position: Vector;
    // Positive yaw turns the view toward +x; positive pitch tilts it toward -y (down).
    readonly yaw: Angle;
    readonly pitch: Angle;
    readonly viewDistance: number;
    // Lines closer to the eye than this are clipped, so objects can pass beside or through the viewer.
    readonly nearDistance: number;
    readonly screenCenterX: number;
    readonly screenCenterY: number;
}

export const DEFAULT_PERSPECTIVE_CAMERA: PerspectiveCamera = {
    position: new Vector(0, 0, 0),
    yaw: Angle.fromRadians(0),
    pitch: Angle.fromRadians(0),
    viewDistance: 400,
    nearDistance: 1,
    screenCenterX: 512,
    screenCenterY: 384,
};

export function createModelPlacement(overrides: Partial<ModelPlacement3D>): ModelPlacement3D {
    return {
        position: new Vector(0, 0, 0),
        rotationX: Angle.fromRadians(0),
        rotationY: Angle.fromRadians(0),
        rotationZ: Angle.fromRadians(0),
        scale: 1,
        ...overrides,
    };
}
