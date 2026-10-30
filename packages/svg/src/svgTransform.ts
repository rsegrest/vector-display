import type { PointLike } from "@vector-display/core";

// An SVG transform matrix [a, b, c, d, e, f], which moves (x, y) to
// (a x + c y + e, b x + d y + f), as in the SVG specification.
export type AffineMatrix = readonly [number, number, number, number, number, number];

export const IDENTITY: AffineMatrix = [1, 0, 0, 1, 0, 0];

// The matrix that applies `inner` first, then `outer`.
export function multiply(outer: AffineMatrix, inner: AffineMatrix): AffineMatrix {
    const [a, b, c, d, e, f] = outer;
    const [a2, b2, c2, d2, e2, f2] = inner;
    return [a * a2 + c * b2, b * a2 + d * b2, a * c2 + c * d2, b * c2 + d * d2, a * e2 + c * f2 + e, b * e2 + d * f2 + f];
}

export function applyToPoint(matrix: AffineMatrix, x: number, y: number): PointLike {
    const [a, b, c, d, e, f] = matrix;
    return { x: a * x + c * y + e, y: b * x + d * y + f };
}

// How much the matrix enlarges lengths, on average: the square root of its area scale.
export function lengthScale(matrix: AffineMatrix): number {
    return Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2])) || 1;
}

const TRANSFORM_FUNCTION = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;

// Reads a transform attribute: a list of functions applied right to left to the
// element's coordinates, so the result is their product in written order.
export function parseTransform(text: string | undefined): AffineMatrix {
    if (!text) return IDENTITY;
    let matrix = IDENTITY;
    for (const match of text.matchAll(TRANSFORM_FUNCTION)) {
        const values = (match[2].match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
        matrix = multiply(matrix, transformFunction(match[1], values));
    }
    return matrix;
}

function transformFunction(name: string, values: readonly number[]): AffineMatrix {
    const radians = (degrees: number): number => (degrees * Math.PI) / 180;
    switch (name) {
        case "matrix":
            return values.length >= 6 ? [values[0], values[1], values[2], values[3], values[4], values[5]] : IDENTITY;
        case "translate":
            return [1, 0, 0, 1, values[0] ?? 0, values[1] ?? 0];
        case "scale":
            return [values[0] ?? 1, 0, 0, values[1] ?? values[0] ?? 1, 0, 0];
        case "rotate": {
            const angle = radians(values[0] ?? 0);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const rotation: AffineMatrix = [cos, sin, -sin, cos, 0, 0];
            if (values.length < 3) return rotation;
            // rotate(a, cx, cy) turns about (cx, cy): move there, turn, move back.
            const [cx, cy] = [values[1], values[2]];
            return multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
        }
        case "skewX":
            return [1, 0, Math.tan(radians(values[0] ?? 0)), 1, 0, 0];
        default: // skewY
            return [1, Math.tan(radians(values[0] ?? 0)), 0, 1, 0, 0];
    }
}
