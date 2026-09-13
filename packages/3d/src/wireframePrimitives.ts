import { Vector } from "es-vector-math";
import { WireframeModel } from "./WireframeModel.js";

export interface BoxDimensions {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
}

export interface PyramidDimensions {
    readonly baseWidth: number;
    readonly height: number;
}

// Centered on the origin.
export function createBoxModel(dimensions: BoxDimensions): WireframeModel {
    const halfWidth = dimensions.width / 2;
    const halfHeight = dimensions.height / 2;
    const halfDepth = dimensions.depth / 2;
    const vertices = [-1, 1].flatMap((ySign) =>
        [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
        ].map(([xSign, zSign]) => new Vector(xSign * halfWidth, ySign * halfHeight, zSign * halfDepth)),
    );
    return WireframeModel.fromDefinition({
        vertices,
        polylines: [
            { vertexIndices: [0, 1, 2, 3], isClosed: true },
            { vertexIndices: [4, 5, 6, 7], isClosed: true },
            ...[0, 1, 2, 3].map((corner) => ({ vertexIndices: [corner, corner + 4], isClosed: false })),
        ],
    });
}

// Base centered on the origin, apex pointing up (+y).
export function createPyramidModel(dimensions: PyramidDimensions): WireframeModel {
    const halfBase = dimensions.baseWidth / 2;
    const vertices = [
        new Vector(-halfBase, 0, -halfBase),
        new Vector(halfBase, 0, -halfBase),
        new Vector(halfBase, 0, halfBase),
        new Vector(-halfBase, 0, halfBase),
        new Vector(0, dimensions.height, 0),
    ];
    return WireframeModel.fromDefinition({
        vertices,
        polylines: [
            { vertexIndices: [0, 1, 2, 3], isClosed: true },
            ...[0, 1, 2, 3].map((corner) => ({ vertexIndices: [corner, 4], isClosed: false })),
        ],
    });
}
