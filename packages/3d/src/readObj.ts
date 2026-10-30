import { fromRightHanded, type TriangleMesh } from "./triangleMesh.js";

export interface ModelReadOptions {
    // Convert from the files' right-handed space (y up, z toward the viewer) into this
    // library's (z away). Default true; see fromRightHanded.
    readonly fromRightHanded?: boolean;
}

// Reads a Wavefront OBJ file's vertex positions and faces (all objects and groups, as one
// mesh). Faces with more than three corners are cut into a fan of triangles; normals,
// texture coordinates, materials, lines and points are ignored.
export function readObj(text: string, options: ModelReadOptions = {}): TriangleMesh {
    const positions: number[] = [];
    const indices: number[] = [];
    for (const rawLine of text.split("\n")) {
        const line = rawLine.trim();
        if (line.startsWith("v ")) {
            const parts = line.split(/\s+/);
            positions.push(Number(parts[1]), Number(parts[2]), Number(parts[3]));
        } else if (line.startsWith("f ")) {
            const vertexCount = positions.length / 3;
            const corners = line
                .split(/\s+/)
                .slice(1)
                .map((corner) => {
                    // "v", "v/vt", "v//vn" or "v/vt/vn": the position index comes first.
                    const index = Number.parseInt(corner, 10);
                    // OBJ counts from 1; negative numbers count back from the latest vertex.
                    return index < 0 ? vertexCount + index : index - 1;
                });
            if (corners.some((corner) => !Number.isInteger(corner) || corner < 0 || corner >= vertexCount)) {
                throw new Error(`OBJ face "${line}" refers to a vertex the file has not defined (it has ${vertexCount} so far)`);
            }
            for (let corner = 1; corner + 1 < corners.length; corner++) indices.push(corners[0], corners[corner], corners[corner + 1]);
        }
    }
    const mesh = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
    return options.fromRightHanded === false ? mesh : fromRightHanded(mesh);
}
