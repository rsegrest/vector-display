import { NO_NEIGHBOR_SEGMENT } from "@rsegrest/vector-display";
import { VectorMath, type Vector } from "es-vector-math";
import type { WireframeDefinition, WireframePolyline } from "./wireframeTypes.js";

interface EdgeBuffers {
    readonly vertexIndices: number[];
    readonly neighbors: number[];
}

export class WireframeModel {
    public readonly vertices: readonly Vector[];
    // Two vertex indices per edge (start, end).
    public readonly edgeVertexIndices: Int32Array;
    // Two entries per edge: the connected previous and next edge in its polyline, or NO_NEIGHBOR_SEGMENT.
    public readonly edgeNeighbors: Int32Array;

    private constructor(vertices: readonly Vector[], buffers: EdgeBuffers) {
        this.vertices = vertices;
        this.edgeVertexIndices = Int32Array.from(buffers.vertexIndices);
        this.edgeNeighbors = Int32Array.from(buffers.neighbors);
    }

    public get edgeCount(): number {
        return this.edgeVertexIndices.length / 2;
    }

    // Edges within a polyline connect at shared vertices, which lets the renderer draw clean joints.
    public static fromDefinition(definition: WireframeDefinition): WireframeModel {
        // es-vector-math's expand2D() resets z to 0 even for 3D vectors, so only expand 2D vertices.
        const vertices = definition.vertices.map((vertex) => (vertex.dimensions === 2 ? VectorMath.expand2D(vertex) : vertex));
        const buffers: EdgeBuffers = { vertexIndices: [], neighbors: [] };
        for (const polyline of definition.polylines) {
            assertVertexIndicesExist(polyline, vertices.length);
            appendPolylineEdges(buffers, polyline);
        }
        return new WireframeModel(vertices, buffers);
    }
}

function assertVertexIndicesExist(polyline: WireframePolyline, vertexCount: number): void {
    const invalidIndex = polyline.vertexIndices.find((index) => !Number.isInteger(index) || index < 0 || index >= vertexCount);
    if (invalidIndex !== undefined) {
        throw new Error(`Wireframe polyline refers to vertex ${invalidIndex}, but the model has ${vertexCount} vertices`);
    }
}

function appendPolylineEdges(buffers: EdgeBuffers, polyline: WireframePolyline): void {
    const { vertexIndices, isClosed } = polyline;
    if (vertexIndices.length < 2) return;
    const firstEdge = buffers.vertexIndices.length / 2;
    for (let index = 0; index < vertexIndices.length - 1; index++) {
        buffers.vertexIndices.push(vertexIndices[index], vertexIndices[index + 1]);
    }
    const wrapsAround = isClosed && vertexIndices.length > 2;
    if (wrapsAround) buffers.vertexIndices.push(vertexIndices[vertexIndices.length - 1], vertexIndices[0]);
    const lastEdge = buffers.vertexIndices.length / 2 - 1;
    for (let edge = firstEdge; edge <= lastEdge; edge++) {
        const previousEdge = edge > firstEdge ? edge - 1 : wrapsAround ? lastEdge : NO_NEIGHBOR_SEGMENT;
        const nextEdge = edge < lastEdge ? edge + 1 : wrapsAround ? firstEdge : NO_NEIGHBOR_SEGMENT;
        buffers.neighbors.push(previousEdge, nextEdge);
    }
}

export default WireframeModel;
