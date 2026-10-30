// Triangle meshes, as model files hold them, and the clean-up a line drawing needs.

// 3D space: x right, y up, z forward (away from the viewer), as for wireframes.
export interface TriangleMesh {
    // x, y, z for each vertex.
    readonly positions: Float32Array;
    // Three vertex indices for each triangle, anticlockwise seen from outside.
    readonly indices: Uint32Array;
}

// Merges vertices that sit at the same place (within `tolerance`) and drops triangles
// that collapse to nothing as a result. Files often repeat a vertex for each triangle that
// uses it (to give each its own normal or texture coordinate), which hides the fact that
// the triangles are neighbors; edges can only be found once they share vertices.
export function weldMesh(mesh: TriangleMesh, tolerance = 1e-5): TriangleMesh {
    const { positions, indices } = mesh;
    const vertexCount = positions.length / 3;
    const lookup = new Map<string, number>();
    const remap = new Uint32Array(vertexCount);
    const welded: number[] = [];
    for (let vertex = 0; vertex < vertexCount; vertex++) {
        const x = positions[vertex * 3];
        const y = positions[vertex * 3 + 1];
        const z = positions[vertex * 3 + 2];
        const key = `${Math.round(x / tolerance)},${Math.round(y / tolerance)},${Math.round(z / tolerance)}`;
        let index = lookup.get(key);
        if (index === undefined) {
            index = welded.length / 3;
            welded.push(x, y, z);
            lookup.set(key, index);
        }
        remap[vertex] = index;
    }
    const kept: number[] = [];
    for (let offset = 0; offset < indices.length; offset += 3) {
        const a = remap[indices[offset]];
        const b = remap[indices[offset + 1]];
        const c = remap[indices[offset + 2]];
        if (a !== b && b !== c && c !== a) kept.push(a, b, c);
    }
    return { positions: Float32Array.from(welded), indices: Uint32Array.from(kept) };
}

export interface MeshBounds {
    readonly minimum: readonly [number, number, number];
    readonly maximum: readonly [number, number, number];
}

export function meshBounds(mesh: TriangleMesh): MeshBounds {
    const minimum: [number, number, number] = [Infinity, Infinity, Infinity];
    const maximum: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    const { positions } = mesh;
    for (let offset = 0; offset < positions.length; offset += 3) {
        for (let axis = 0; axis < 3; axis++) {
            minimum[axis] = Math.min(minimum[axis], positions[offset + axis]);
            maximum[axis] = Math.max(maximum[axis], positions[offset + axis]);
        }
    }
    return { minimum, maximum };
}

// Moves the mesh's center to the origin and scales it to fit a sphere of `radius`: a model
// from any file then has a known size to place.
export function fitToSphere(mesh: TriangleMesh, radius = 1): TriangleMesh {
    const { positions } = mesh;
    const { minimum, maximum } = meshBounds(mesh);
    const center = [0, 1, 2].map((axis) => (minimum[axis] + maximum[axis]) / 2);
    let extent = 0;
    for (let offset = 0; offset < positions.length; offset += 3) {
        extent = Math.max(extent, Math.hypot(positions[offset] - center[0], positions[offset + 1] - center[1], positions[offset + 2] - center[2]));
    }
    const scale = extent > 0 ? radius / extent : 1;
    const fitted = new Float32Array(positions.length);
    for (let offset = 0; offset < positions.length; offset += 3) {
        for (let axis = 0; axis < 3; axis++) fitted[offset + axis] = (positions[offset + axis] - center[axis]) * scale;
    }
    return { positions: fitted, indices: mesh.indices };
}

// Converts positions given in the right-handed convention of OBJ and glTF files (and the
// exporters of Blender and most modelling tools: y up, z toward the viewer) into this
// library's space (z away from the viewer). Negating z alone would mirror the model, so the
// winding of each triangle is reversed too, keeping "anticlockwise from outside" true. A
// model's front, its +z side in the file, then faces the default camera.
export function fromRightHanded(mesh: TriangleMesh): TriangleMesh {
    const positions = Float32Array.from(mesh.positions);
    for (let offset = 2; offset < positions.length; offset += 3) positions[offset] = -positions[offset];
    const indices = Uint32Array.from(mesh.indices);
    for (let offset = 0; offset < indices.length; offset += 3) {
        const second = indices[offset + 1];
        indices[offset + 1] = indices[offset + 2];
        indices[offset + 2] = second;
    }
    return { positions, indices };
}
