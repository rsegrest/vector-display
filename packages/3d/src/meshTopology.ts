import type { TriangleMesh } from "./triangleMesh.js";

// What can be worked out from a mesh's shape alone, once: which triangles share each edge,
// how sharply the surface bends there, and a sphere around it for culling.
export interface MeshTopology {
    readonly mesh: TriangleMesh;
    readonly vertexCount: number;
    readonly faceCount: number;
    // Unit normal of each triangle, pointing out (by its anticlockwise winding).
    readonly faceNormals: Float32Array;
    readonly edgeCount: number;
    // The two vertices of each edge.
    readonly edgeVertices: Uint32Array;
    // The triangles on either side of each edge; the second is -1 on an open border.
    readonly edgeFaces: Int32Array;
    // Cosine of the angle between the two triangles' normals: 1 where the surface is flat
    // across the edge, 0 at a right-angled fold. 1 for border edges.
    readonly edgeCosine: Float32Array;
    // True if no edge is an open border: the surface encloses a volume with no holes.
    readonly isClosed: boolean;
    // A sphere holding every vertex, in the mesh's own coordinates.
    readonly boundingCenter: readonly [number, number, number];
    readonly boundingRadius: number;
}

// Works out the edges, the triangles on each side of them, and how sharp each is. Weld the
// mesh first (weldMesh) if its file repeats vertices: triangles that do not share vertices
// do not share edges.
export function buildMeshTopology(mesh: TriangleMesh): MeshTopology {
    const { positions, indices } = mesh;
    const vertexCount = positions.length / 3;
    const faceCount = indices.length / 3;
    const faceNormals = new Float32Array(faceCount * 3);
    for (let face = 0; face < faceCount; face++) {
        const a = indices[face * 3] * 3;
        const b = indices[face * 3 + 1] * 3;
        const c = indices[face * 3 + 2] * 3;
        const ux = positions[b] - positions[a];
        const uy = positions[b + 1] - positions[a + 1];
        const uz = positions[b + 2] - positions[a + 2];
        const vx = positions[c] - positions[a];
        const vy = positions[c + 1] - positions[a + 1];
        const vz = positions[c + 2] - positions[a + 2];
        const nx = uy * vz - uz * vy;
        const ny = uz * vx - ux * vz;
        const nz = ux * vy - uy * vx;
        const length = Math.hypot(nx, ny, nz) || 1;
        faceNormals[face * 3] = nx / length;
        faceNormals[face * 3 + 1] = ny / length;
        faceNormals[face * 3 + 2] = nz / length;
    }

    // Each edge is found from both of its triangles; the first to arrive records it.
    const edgeOf = new Map<number, number>();
    const edgeVertices: number[] = [];
    const edgeFaces: number[] = [];
    for (let face = 0; face < faceCount; face++) {
        for (let corner = 0; corner < 3; corner++) {
            const from = indices[face * 3 + corner];
            const to = indices[face * 3 + ((corner + 1) % 3)];
            const key = Math.min(from, to) * vertexCount + Math.max(from, to);
            const existing = edgeOf.get(key);
            if (existing === undefined) {
                edgeOf.set(key, edgeVertices.length / 2);
                edgeVertices.push(from, to);
                edgeFaces.push(face, -1);
            } else if (edgeFaces[existing * 2 + 1] === -1) {
                edgeFaces[existing * 2 + 1] = face;
            }
            // A third triangle on one edge (a non-manifold mesh) is left out of the pairing.
        }
    }

    const edgeCount = edgeVertices.length / 2;
    const edgeCosine = new Float32Array(edgeCount).fill(1);
    for (let edge = 0; edge < edgeCount; edge++) {
        const first = edgeFaces[edge * 2] * 3;
        const second = edgeFaces[edge * 2 + 1] * 3;
        if (second < 0) continue;
        edgeCosine[edge] =
            faceNormals[first] * faceNormals[second] + faceNormals[first + 1] * faceNormals[second + 1] + faceNormals[first + 2] * faceNormals[second + 2];
    }
    const { center, radius } = boundingSphere(positions);
    return {
        mesh,
        vertexCount,
        faceCount,
        faceNormals,
        edgeCount,
        edgeVertices: Uint32Array.from(edgeVertices),
        edgeFaces: Int32Array.from(edgeFaces),
        edgeCosine,
        isClosed: !edgeFaces.includes(-1),
        boundingCenter: center,
        boundingRadius: radius,
    };
}

// The box's center and the farthest vertex from it: not the smallest sphere, but close and cheap.
function boundingSphere(positions: Float32Array): { center: [number, number, number]; radius: number } {
    const minimum = [Infinity, Infinity, Infinity];
    const maximum = [-Infinity, -Infinity, -Infinity];
    for (let offset = 0; offset < positions.length; offset += 3) {
        for (let axis = 0; axis < 3; axis++) {
            minimum[axis] = Math.min(minimum[axis], positions[offset + axis]);
            maximum[axis] = Math.max(maximum[axis], positions[offset + axis]);
        }
    }
    if (positions.length === 0) return { center: [0, 0, 0], radius: 0 };
    const center: [number, number, number] = [(minimum[0] + maximum[0]) / 2, (minimum[1] + maximum[1]) / 2, (minimum[2] + maximum[2]) / 2];
    let radius = 0;
    for (let offset = 0; offset < positions.length; offset += 3) {
        radius = Math.max(radius, Math.hypot(positions[offset] - center[0], positions[offset + 1] - center[1], positions[offset + 2] - center[2]));
    }
    return { center, radius };
}
