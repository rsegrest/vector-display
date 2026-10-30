import type { ModelPlacement3D, PerspectiveCamera } from "./wireframeTypes.js";

// The transform from a model's own coordinates into the camera's, as one 3×4 matrix
// (row-major: x', y', z' each a row of four), so a mesh's thousands of vertices are moved
// with plain arithmetic. It is the same transform WireframeProjector applies with
// es-vector-math, step for step: scale, rotate about x, then y, then z, move to the
// placement's position, then undo the camera's position, yaw and pitch.
export type AffineTransform3D = Float64Array;

export function modelToCameraTransform(placement: ModelPlacement3D, camera: PerspectiveCamera): AffineTransform3D {
    const { rotationX, rotationY, rotationZ, scale, position } = placement;
    // Placement: Rz · Ry · Rx · scale, then + position.
    let matrix = multiply3(rotationMatrixZ(rotationZ.radians), multiply3(rotationMatrixY(rotationY.radians), rotationMatrixX(rotationX.radians)));
    matrix = matrix.map((value) => value * scale);
    // Camera: Rx(-pitch) · Ry(-yaw) · (p - camera position).
    const view = multiply3(rotationMatrixX(-camera.pitch.radians), rotationMatrixY(-camera.yaw.radians));
    const combined = multiply3(view, matrix);
    const offset = [
        position.x - camera.position.x,
        position.y - camera.position.y,
        (position.z ?? 0) - (camera.position.z ?? 0),
    ];
    const translation = [0, 1, 2].map((row) => view[row * 3] * offset[0] + view[row * 3 + 1] * offset[1] + view[row * 3 + 2] * offset[2]);
    return Float64Array.from([
        combined[0], combined[1], combined[2], translation[0],
        combined[3], combined[4], combined[5], translation[1],
        combined[6], combined[7], combined[8], translation[2],
    ]);
}

// The placement's rotation alone (no scale), for turning normals.
export function placementRotation(placement: ModelPlacement3D, camera: PerspectiveCamera): Float64Array {
    const rotation = multiply3(
        rotationMatrixZ(placement.rotationZ.radians),
        multiply3(rotationMatrixY(placement.rotationY.radians), rotationMatrixX(placement.rotationX.radians)),
    );
    return Float64Array.from(multiply3(multiply3(rotationMatrixX(-camera.pitch.radians), rotationMatrixY(-camera.yaw.radians)), rotation));
}

// The same sign conventions as es-vector-math's rotateX, rotateY and rotateZ.
function rotationMatrixX(radians: number): number[] {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return [1, 0, 0, 0, c, -s, 0, s, c];
}

function rotationMatrixY(radians: number): number[] {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return [c, 0, s, 0, 1, 0, -s, 0, c];
}

function rotationMatrixZ(radians: number): number[] {
    const c = Math.cos(radians);
    const s = Math.sin(radians);
    return [c, -s, 0, s, c, 0, 0, 0, 1];
}

function multiply3(left: readonly number[], right: readonly number[]): number[] {
    const product = new Array<number>(9);
    for (let row = 0; row < 3; row++) {
        for (let column = 0; column < 3; column++) {
            product[row * 3 + column] =
                left[row * 3] * right[column] + left[row * 3 + 1] * right[3 + column] + left[row * 3 + 2] * right[6 + column];
        }
    }
    return product;
}
