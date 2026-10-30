import type { ModelReadOptions } from "./readObj.js";
import { fromRightHanded, type TriangleMesh } from "./triangleMesh.js";

export interface GltfReadOptions extends ModelReadOptions {
    // Which scene to read; default the file's own default scene, or its first.
    readonly scene?: number;
    // Supplies the bytes of a buffer the file keeps in a separate file (a .gltf with a
    // .bin beside it), given its uri. Not needed for .glb files or embedded data: uris.
    readonly resolveUri?: (uri: string) => Uint8Array;
}

// The parts of glTF 2.0 read here.
interface GltfDocument {
    readonly scene?: number;
    readonly scenes?: readonly { readonly nodes?: readonly number[] }[];
    readonly nodes?: readonly GltfNode[];
    readonly meshes?: readonly { readonly primitives: readonly GltfPrimitive[] }[];
    readonly accessors?: readonly GltfAccessor[];
    readonly bufferViews?: readonly { readonly buffer: number; readonly byteOffset?: number; readonly byteLength: number; readonly byteStride?: number }[];
    readonly buffers?: readonly { readonly uri?: string; readonly byteLength: number }[];
    readonly extensionsRequired?: readonly string[];
}

interface GltfNode {
    readonly children?: readonly number[];
    readonly mesh?: number;
    readonly matrix?: readonly number[];
    readonly translation?: readonly number[];
    readonly rotation?: readonly number[];
    readonly scale?: readonly number[];
}

interface GltfPrimitive {
    readonly attributes: { readonly POSITION?: number };
    readonly indices?: number;
    readonly mode?: number;
}

interface GltfAccessor {
    readonly bufferView?: number;
    readonly byteOffset?: number;
    readonly componentType: number;
    readonly count: number;
    readonly type: string;
    readonly sparse?: unknown;
}

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_JSON_CHUNK = 0x4e4f534a; // "JSON"
const GLB_BINARY_CHUNK = 0x004e4942; // "BIN"
const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const UNSIGNED_SHORT = 5123;
const UNSIGNED_INT = 5125;
const TRIANGLES = 4;
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;

// Reads the triangles of a glTF 2.0 model (.glb, or .gltf as text or parsed JSON) into one
// mesh: every mesh the scene's nodes place, moved by its node's transform. Points, lines,
// materials, textures, animation and skins are ignored.
export function readGltf(input: ArrayBuffer | Uint8Array | string | object, options: GltfReadOptions = {}): TriangleMesh {
    const { document, binaryChunk } = openGltf(input);
    const unsupported = (document.extensionsRequired ?? []).filter((name) => name !== "KHR_materials_unlit" && name !== "KHR_texture_transform");
    if (unsupported.length > 0) {
        throw new Error(`The model requires ${unsupported.join(", ")}: export it again without compression (Blender: glTF export, Data > Compression off)`);
    }
    const buffers = (document.buffers ?? []).map((buffer, index) => bufferBytes(buffer, index, binaryChunk, options.resolveUri));
    const positions: number[] = [];
    const indices: number[] = [];
    const sceneIndex = options.scene ?? document.scene ?? 0;
    const roots = document.scenes?.[sceneIndex]?.nodes ?? (document.nodes ?? []).map((_, index) => index);

    const visit = (nodeIndex: number, parentMatrix: readonly number[], depth: number): void => {
        const node = document.nodes?.[nodeIndex];
        if (!node || depth > 64) return;
        const matrix = multiply4(parentMatrix, nodeMatrix(node));
        if (node.mesh !== undefined) {
            for (const primitive of document.meshes?.[node.mesh]?.primitives ?? []) {
                appendPrimitive(document, buffers, primitive, matrix, positions, indices);
            }
        }
        for (const child of node.children ?? []) visit(child, matrix, depth + 1);
    };
    for (const root of roots) visit(root, IDENTITY_4, 0);

    const mesh = { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
    return options.fromRightHanded === false ? mesh : fromRightHanded(mesh);
}

function openGltf(input: ArrayBuffer | Uint8Array | string | object): { document: GltfDocument; binaryChunk: Uint8Array | undefined } {
    if (typeof input === "string") return { document: JSON.parse(input) as GltfDocument, binaryChunk: undefined };
    if (!(input instanceof ArrayBuffer) && !ArrayBuffer.isView(input)) return { document: input as GltfDocument, binaryChunk: undefined };
    const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : (input as Uint8Array);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    if (bytes.byteLength < 12 || view.getUint32(0, true) !== GLB_MAGIC) {
        // Bytes that are not a .glb: a .gltf file read as bytes.
        return { document: JSON.parse(new TextDecoder().decode(bytes)) as GltfDocument, binaryChunk: undefined };
    }
    let document: GltfDocument | undefined;
    let binaryChunk: Uint8Array | undefined;
    for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        const chunk = bytes.subarray(offset + 8, offset + 8 + length);
        if (type === GLB_JSON_CHUNK) document = JSON.parse(new TextDecoder().decode(chunk)) as GltfDocument;
        else if (type === GLB_BINARY_CHUNK) binaryChunk = chunk;
        offset += 8 + length;
    }
    if (!document) throw new Error("The .glb file has no JSON chunk");
    return { document, binaryChunk };
}

function bufferBytes(
    buffer: { readonly uri?: string; readonly byteLength: number },
    index: number,
    binaryChunk: Uint8Array | undefined,
    resolveUri: ((uri: string) => Uint8Array) | undefined,
): Uint8Array {
    const { uri } = buffer;
    if (uri === undefined) {
        if (index === 0 && binaryChunk) return binaryChunk;
        throw new Error(`glTF buffer ${index} has no uri and the file has no binary chunk`);
    }
    if (uri.startsWith("data:")) {
        const base64 = uri.slice(uri.indexOf(",") + 1);
        return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    }
    if (!resolveUri) throw new Error(`glTF buffer ${index} is a separate file ("${uri}"): pass resolveUri, or export as .glb`);
    return resolveUri(uri);
}

function accessorView(document: GltfDocument, buffers: readonly Uint8Array[], accessorIndex: number): { accessor: GltfAccessor; view: DataView; stride: number } {
    const accessor = document.accessors?.[accessorIndex];
    if (!accessor) throw new Error(`glTF accessor ${accessorIndex} does not exist`);
    if (accessor.sparse !== undefined || accessor.bufferView === undefined) throw new Error(`glTF accessor ${accessorIndex} is sparse, which is not supported`);
    const bufferView = document.bufferViews?.[accessor.bufferView];
    if (!bufferView) throw new Error(`glTF bufferView ${accessor.bufferView} does not exist`);
    const bytes = buffers[bufferView.buffer];
    const start = (bufferView.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
    const view = new DataView(bytes.buffer, bytes.byteOffset + start, bufferView.byteLength - (accessor.byteOffset ?? 0));
    const elementSize = componentSize(accessor.componentType) * (accessor.type === "VEC3" ? 3 : 1);
    return { accessor, view, stride: bufferView.byteStride ?? elementSize };
}

function componentSize(componentType: number): number {
    return componentType === UNSIGNED_BYTE ? 1 : componentType === UNSIGNED_SHORT ? 2 : 4;
}

function appendPrimitive(
    document: GltfDocument,
    buffers: readonly Uint8Array[],
    primitive: GltfPrimitive,
    matrix: readonly number[],
    positions: number[],
    indices: number[],
): void {
    const mode = primitive.mode ?? TRIANGLES;
    if (primitive.attributes.POSITION === undefined || (mode !== TRIANGLES && mode !== TRIANGLE_STRIP && mode !== TRIANGLE_FAN)) return;
    const { accessor, view, stride } = accessorView(document, buffers, primitive.attributes.POSITION);
    if (accessor.componentType !== FLOAT || accessor.type !== "VEC3") {
        throw new Error("glTF positions are quantized (not float VEC3), which is not supported: export without quantization");
    }
    const firstVertex = positions.length / 3;
    for (let vertex = 0; vertex < accessor.count; vertex++) {
        const x = view.getFloat32(vertex * stride, true);
        const y = view.getFloat32(vertex * stride + 4, true);
        const z = view.getFloat32(vertex * stride + 8, true);
        // glTF matrices are column-major.
        positions.push(
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        );
    }
    const corners = primitive.indices === undefined ? Array.from({ length: accessor.count }, (_, index) => index) : readIndices(document, buffers, primitive.indices);
    // A node transform that mirrors (negative determinant) turns the winding inside out.
    const mirrors = determinant3(matrix) < 0;
    const addTriangle = (a: number, b: number, c: number): void => {
        if (mirrors) indices.push(firstVertex + a, firstVertex + c, firstVertex + b);
        else indices.push(firstVertex + a, firstVertex + b, firstVertex + c);
    };
    if (mode === TRIANGLES) {
        for (let corner = 0; corner + 2 < corners.length; corner += 3) addTriangle(corners[corner], corners[corner + 1], corners[corner + 2]);
    } else if (mode === TRIANGLE_STRIP) {
        // Every other triangle of a strip is wound the other way, and is flipped back.
        for (let corner = 0; corner + 2 < corners.length; corner++) {
            if (corner % 2 === 0) addTriangle(corners[corner], corners[corner + 1], corners[corner + 2]);
            else addTriangle(corners[corner + 1], corners[corner], corners[corner + 2]);
        }
    } else {
        for (let corner = 1; corner + 1 < corners.length; corner++) addTriangle(corners[0], corners[corner], corners[corner + 1]);
    }
}

function readIndices(document: GltfDocument, buffers: readonly Uint8Array[], accessorIndex: number): number[] {
    const { accessor, view } = accessorView(document, buffers, accessorIndex);
    const size = componentSize(accessor.componentType);
    const stride = size;
    const result = new Array<number>(accessor.count);
    for (let index = 0; index < accessor.count; index++) {
        const at = index * stride;
        result[index] = size === 1 ? view.getUint8(at) : size === 2 ? view.getUint16(at, true) : view.getUint32(at, true);
    }
    return result;
}

const IDENTITY_4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

// A node's local transform, column-major: its matrix, or translation · rotation · scale.
function nodeMatrix(node: GltfNode): number[] {
    if (node.matrix && node.matrix.length === 16) return [...node.matrix];
    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    const [qx, qy, qz, qw] = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];
    // The rotation matrix of a unit quaternion, its columns scaled.
    return [
        (1 - 2 * (qy * qy + qz * qz)) * sx, 2 * (qx * qy + qz * qw) * sx, 2 * (qx * qz - qy * qw) * sx, 0,
        2 * (qx * qy - qz * qw) * sy, (1 - 2 * (qx * qx + qz * qz)) * sy, 2 * (qy * qz + qx * qw) * sy, 0,
        2 * (qx * qz + qy * qw) * sz, 2 * (qy * qz - qx * qw) * sz, (1 - 2 * (qx * qx + qy * qy)) * sz, 0,
        tx, ty, tz, 1,
    ];
}

function multiply4(left: readonly number[], right: readonly number[]): number[] {
    const product = new Array<number>(16);
    for (let column = 0; column < 4; column++) {
        for (let row = 0; row < 4; row++) {
            product[column * 4 + row] =
                left[row] * right[column * 4] + left[4 + row] * right[column * 4 + 1] + left[8 + row] * right[column * 4 + 2] + left[12 + row] * right[column * 4 + 3];
        }
    }
    return product;
}

function determinant3(m: readonly number[]): number {
    return m[0] * (m[5] * m[10] - m[9] * m[6]) - m[4] * (m[1] * m[10] - m[9] * m[2]) + m[8] * (m[1] * m[6] - m[5] * m[2]);
}
