import type { ShapeGeometry } from "@vector-display/core";
import { modelToCameraTransform, placementRotation } from "./cameraTransform.js";
import { DepthBuffer } from "./DepthBuffer.js";
import type { MeshTopology } from "./meshTopology.js";
import { SegmentBuffer } from "./SegmentBuffer.js";
import type { ModelPlacement3D, PerspectiveCamera } from "./wireframeTypes.js";

export interface MeshSceneOptions {
    // The screen space the camera draws into, from (0, 0): the same units as the camera's
    // screenCenterX and screenCenterY. Models wholly outside it are skipped.
    readonly screenWidth: number;
    readonly screenHeight: number;
    // Columns of the depth grid across the screen (rows follow the screen's proportions).
    // Finer is more exact where lines pass behind edges, and slower. Default 512.
    readonly depthColumns?: number;
    // Cut away the parts of lines that surfaces hide (default true).
    readonly hiddenLines?: boolean;
    // How much nearer than a point a surface must be before it hides the point, as a
    // fraction. Lines lie on the surfaces they belong to, so some slack is needed. Default 0.012.
    readonly depthTolerance?: number;
}

export interface MeshSceneItem {
    readonly topology: MeshTopology;
    readonly placement: ModelPlacement3D;
    // Edges where the surface folds by more than this are drawn as creases. Default 30°.
    readonly creaseAngleDegrees?: number;
    // Also draw every other edge (the mesh's triangles), dimmer. Default false.
    readonly drawAllEdges?: boolean;
    // Its surfaces hide the lines of everything behind them, its own included (default true).
    // Turn off for a model that should be see-through.
    readonly hidesOthers?: boolean;
    // Treat both sides of every triangle as solid. A closed model seen from outside needs only
    // the sides facing out, which halves the work; seen from inside (a room) it needs both.
    // Default: on when the eye is inside the model's bounding sphere, or the mesh is open.
    readonly twoSided?: boolean;
}

// One model's lines for this frame, sorted the way a draftsman would weight them:
// draw silhouettes brightest, creases a little dimmer, other edges dimmest.
export interface MeshLines {
    // The outline: where a surface facing the viewer meets one facing away.
    readonly silhouettes: ShapeGeometry;
    // Sharp folds, and open borders where the surface stops.
    readonly creases: ShapeGeometry;
    // The rest of the edges, when the item asks for them.
    readonly otherEdges: ShapeGeometry;
    // True when the model was skipped: behind the camera or off the screen.
    readonly isCulled: boolean;
}

export interface MeshSceneStatistics {
    readonly items: number;
    readonly culled: number;
    // Triangles measured into the depth grid.
    readonly depthTriangles: number;
    // Segments drawn, after hidden parts were cut away.
    readonly segments: number;
}

interface ItemBuffers {
    readonly lines: { silhouettes: SegmentBuffer; creases: SegmentBuffer; otherEdges: SegmentBuffer; isCulled: boolean };
    cameraSpace: Float32Array;
    facing: Uint8Array;
    isTwoSided: boolean;
}

const DEFAULT_CREASE_DEGREES = 30;

// Draws triangle meshes as line drawings, the way a draftsman would: of all a mesh's edges
// it keeps the outline (silhouette edges), sharp folds (creases) and open borders, then cuts
// away whatever part of those any model in the scene hides, by a depth buffer shared by all
// of them. One camera, any number of models, each with its own placement; the same camera and
// placement types as WireframeProjector, and the same projection.
export class MeshScene {
    private readonly options: Required<MeshSceneOptions>;
    private readonly depth: DepthBuffer;
    private readonly cellsPerUnit: number;
    private readonly buffers: ItemBuffers[] = [];
    private statistics: MeshSceneStatistics = { items: 0, culled: 0, depthTriangles: 0, segments: 0 };
    private camera!: PerspectiveCamera;

    public constructor(options: MeshSceneOptions) {
        this.options = { depthColumns: 512, hiddenLines: true, depthTolerance: 0.012, ...options };
        this.cellsPerUnit = this.options.depthColumns / options.screenWidth;
        this.depth = new DepthBuffer(this.options.depthColumns, Math.max(1, Math.ceil(options.screenHeight * this.cellsPerUnit)));
    }

    public get lastStatistics(): MeshSceneStatistics {
        return this.statistics;
    }

    // Projects the items for this camera. The result holds one MeshLines per item, in order;
    // its geometry is reused by the next render, so add it to a display list first.
    public render(camera: PerspectiveCamera, items: readonly MeshSceneItem[]): readonly MeshLines[] {
        this.camera = camera;
        while (this.buffers.length < items.length) this.buffers.push(newItemBuffers());
        let culled = 0;
        items.forEach((item, index) => {
            const buffers = this.buffers[index];
            buffers.lines.silhouettes.clear();
            buffers.lines.creases.clear();
            buffers.lines.otherEdges.clear();
            buffers.lines.isCulled = !this.transformItem(item, buffers);
            if (buffers.lines.isCulled) culled++;
        });
        let depthTriangles = 0;
        if (this.options.hiddenLines) {
            this.depth.clear();
            items.forEach((item, index) => {
                const buffers = this.buffers[index];
                if (!buffers.lines.isCulled && item.hidesOthers !== false) depthTriangles += this.fillDepth(item, buffers);
            });
        }
        let segments = 0;
        items.forEach((item, index) => {
            const buffers = this.buffers[index];
            if (buffers.lines.isCulled) return;
            this.traceEdges(item, buffers);
            segments += buffers.lines.silhouettes.segmentCount + buffers.lines.creases.segmentCount + buffers.lines.otherEdges.segmentCount;
        });
        this.statistics = { items: items.length, culled, depthTriangles, segments };
        return this.buffers.slice(0, items.length).map((buffers) => buffers.lines);
    }

    // Moves the item's vertices into camera space and works out which faces look toward the
    // eye. False if the item is culled.
    private transformItem(item: MeshSceneItem, buffers: ItemBuffers): boolean {
        const { topology, placement } = item;
        const transform = modelToCameraTransform(placement, this.camera);
        if (!this.isInView(topology, placement, transform)) return false;
        buffers.isTwoSided = item.twoSided ?? (!topology.isClosed || this.isEyeInside(topology, placement, transform));
        const { vertexCount, faceCount, mesh } = topology;
        if (buffers.cameraSpace.length < vertexCount * 3) buffers.cameraSpace = new Float32Array(vertexCount * 3);
        if (buffers.facing.length < faceCount) buffers.facing = new Uint8Array(faceCount);
        const { positions } = mesh;
        const { cameraSpace } = buffers;
        for (let vertex = 0; vertex < vertexCount; vertex++) {
            const x = positions[vertex * 3];
            const y = positions[vertex * 3 + 1];
            const z = positions[vertex * 3 + 2];
            cameraSpace[vertex * 3] = transform[0] * x + transform[1] * y + transform[2] * z + transform[3];
            cameraSpace[vertex * 3 + 1] = transform[4] * x + transform[5] * y + transform[6] * z + transform[7];
            cameraSpace[vertex * 3 + 2] = transform[8] * x + transform[9] * y + transform[10] * z + transform[11];
        }
        // The eye sits viewDistance behind the camera's position, at (0, 0, -viewDistance) in camera space.
        const rotation = placementRotation(placement, this.camera);
        const { faceNormals, mesh: { indices } } = topology;
        const eyeZ = -this.camera.viewDistance;
        for (let face = 0; face < faceCount; face++) {
            const nx = faceNormals[face * 3];
            const ny = faceNormals[face * 3 + 1];
            const nz = faceNormals[face * 3 + 2];
            const corner = indices[face * 3] * 3;
            const towardEye =
                (rotation[0] * nx + rotation[1] * ny + rotation[2] * nz) * -cameraSpace[corner] +
                (rotation[3] * nx + rotation[4] * ny + rotation[5] * nz) * -cameraSpace[corner + 1] +
                (rotation[6] * nx + rotation[7] * ny + rotation[8] * nz) * (eyeZ - cameraSpace[corner + 2]);
            buffers.facing[face] = towardEye > 0 ? 1 : 0;
        }
        return true;
    }

    // Whether the eye is inside the model's bounding sphere, where it may be inside the model.
    private isEyeInside(topology: MeshTopology, placement: ModelPlacement3D, transform: Float64Array): boolean {
        const [cx, cy, cz] = topology.boundingCenter;
        const x = transform[0] * cx + transform[1] * cy + transform[2] * cz + transform[3];
        const y = transform[4] * cx + transform[5] * cy + transform[6] * cz + transform[7];
        const z = transform[8] * cx + transform[9] * cy + transform[10] * cz + transform[11];
        return Math.hypot(x, y, z + this.camera.viewDistance) <= topology.boundingRadius * Math.abs(placement.scale);
    }

    // Whether the model's bounding sphere reaches the screen at all.
    private isInView(topology: MeshTopology, placement: ModelPlacement3D, transform: Float64Array): boolean {
        const [cx, cy, cz] = topology.boundingCenter;
        const x = transform[0] * cx + transform[1] * cy + transform[2] * cz + transform[3];
        const y = transform[4] * cx + transform[5] * cy + transform[6] * cz + transform[7];
        const z = transform[8] * cx + transform[9] * cy + transform[10] * cz + transform[11];
        const radius = topology.boundingRadius * Math.abs(placement.scale);
        const { viewDistance, nearDistance, screenCenterX, screenCenterY } = this.camera;
        const depth = z + viewDistance;
        if (depth + radius < nearDistance) return false;
        // A sphere that reaches past the near plane may cover any part of the screen.
        if (depth - radius <= nearDistance) return true;
        const perspective = viewDistance / depth;
        const screenRadius = (radius * viewDistance) / (depth - radius);
        const screenX = screenCenterX + x * perspective;
        const screenY = screenCenterY - y * perspective;
        const { screenWidth, screenHeight } = this.options;
        return screenX + screenRadius >= 0 && screenX - screenRadius <= screenWidth && screenY + screenRadius >= 0 && screenY - screenRadius <= screenHeight;
    }

    // Measures the item's triangles into the depth grid, each clipped at the near plane. On a
    // closed surface seen from outside only those facing the eye can hide anything, which
    // halves the work; otherwise the ones facing away count too: they are what shows through a
    // hole, or the walls around a viewer inside.
    private fillDepth(item: MeshSceneItem, buffers: ItemBuffers): number {
        const { topology } = item;
        const { indices } = topology.mesh;
        const frontOnly = !buffers.isTwoSided;
        let filled = 0;
        const polygon: number[] = [];
        for (let face = 0; face < topology.faceCount; face++) {
            if (frontOnly && !buffers.facing[face]) continue;
            polygon.length = 0;
            this.clipTriangle(buffers.cameraSpace, indices[face * 3], indices[face * 3 + 1], indices[face * 3 + 2], polygon);
            const corners = polygon.length / 3;
            if (corners < 3) continue;
            // The clipped triangle is a triangle or a quadrilateral: fill it as a fan.
            const gridCorners: number[] = [];
            for (let corner = 0; corner < corners; corner++) {
                const [x, y, w] = this.toGrid(polygon[corner * 3], polygon[corner * 3 + 1], polygon[corner * 3 + 2]);
                gridCorners.push(x, y, w);
            }
            for (let corner = 1; corner + 1 < corners; corner++) {
                this.depth.fillTriangle(
                    gridCorners[0], gridCorners[1], gridCorners[2],
                    gridCorners[corner * 3], gridCorners[corner * 3 + 1], gridCorners[corner * 3 + 2],
                    gridCorners[corner * 3 + 3], gridCorners[corner * 3 + 4], gridCorners[corner * 3 + 5],
                );
            }
            filled++;
        }
        return filled;
    }

    // The part of a triangle in front of the near plane (Sutherland–Hodgman against that one
    // plane), as camera-space corners appended to `out`.
    private clipTriangle(cameraSpace: Float32Array, a: number, b: number, c: number, out: number[]): void {
        const { viewDistance, nearDistance } = this.camera;
        const corners = [a, b, c];
        for (let index = 0; index < 3; index++) {
            const from = corners[index] * 3;
            const to = corners[(index + 1) % 3] * 3;
            const fromDistance = cameraSpace[from + 2] + viewDistance - nearDistance;
            const toDistance = cameraSpace[to + 2] + viewDistance - nearDistance;
            if (fromDistance >= 0) out.push(cameraSpace[from], cameraSpace[from + 1], cameraSpace[from + 2]);
            if (fromDistance >= 0 !== toDistance >= 0) {
                const amount = fromDistance / (fromDistance - toDistance);
                out.push(
                    cameraSpace[from] + (cameraSpace[to] - cameraSpace[from]) * amount,
                    cameraSpace[from + 1] + (cameraSpace[to + 1] - cameraSpace[from + 1]) * amount,
                    cameraSpace[from + 2] + (cameraSpace[to + 2] - cameraSpace[from + 2]) * amount,
                );
            }
        }
    }

    private traceEdges(item: MeshSceneItem, buffers: ItemBuffers): void {
        const { topology } = item;
        const { edgeVertices, edgeFaces, edgeCosine, edgeCount } = topology;
        const { hiddenLines, depthTolerance } = this.options;
        const creaseCosine = Math.cos(((item.creaseAngleDegrees ?? DEFAULT_CREASE_DEGREES) * Math.PI) / 180);
        const { facing, cameraSpace } = buffers;
        const { silhouettes, creases, otherEdges } = buffers.lines;
        for (let edge = 0; edge < edgeCount; edge++) {
            const firstFace = edgeFaces[edge * 2];
            const secondFace = edgeFaces[edge * 2 + 1];
            const firstFront = facing[firstFace] === 1;
            const secondFront = secondFace >= 0 && facing[secondFace] === 1;
            let target: SegmentBuffer;
            if (secondFace < 0) {
                // An open border is where the surface simply stops.
                target = creases;
            } else if (firstFront !== secondFront) {
                target = silhouettes;
            } else {
                // Both sides face away: with hidden lines on, the mesh's own front covers this edge,
                // unless the viewer may be looking at the back of the surface from inside.
                if (hiddenLines && !firstFront && !buffers.isTwoSided) continue;
                if (edgeCosine[edge] < creaseCosine) target = creases;
                else if (item.drawAllEdges) target = otherEdges;
                else continue;
            }
            const from = edgeVertices[edge * 2] * 3;
            const to = edgeVertices[edge * 2 + 1] * 3;
            const visible = this.clipSegment(cameraSpace, from, to);
            if (!visible) continue;
            const [startX, startY, startW] = this.toGrid(visible[0], visible[1], visible[2]);
            const [endX, endY, endW] = this.toGrid(visible[3], visible[4], visible[5]);
            if (!hiddenLines) {
                target.addSegment(startX / this.cellsPerUnit, startY / this.cellsPerUnit, endX / this.cellsPerUnit, endY / this.cellsPerUnit);
                continue;
            }
            this.depth.traceVisible(startX, startY, startW, endX, endY, endW, depthTolerance, (x0, y0, x1, y1) =>
                target.addSegment(x0 / this.cellsPerUnit, y0 / this.cellsPerUnit, x1 / this.cellsPerUnit, y1 / this.cellsPerUnit),
            );
        }
    }

    // The part of an edge in front of the near plane, as two camera-space points; null if none.
    private clipSegment(cameraSpace: Float32Array, from: number, to: number): number[] | null {
        const { viewDistance, nearDistance } = this.camera;
        const fromDistance = cameraSpace[from + 2] + viewDistance - nearDistance;
        const toDistance = cameraSpace[to + 2] + viewDistance - nearDistance;
        if (fromDistance < 0 && toDistance < 0) return null;
        const start = [cameraSpace[from], cameraSpace[from + 1], cameraSpace[from + 2]];
        const end = [cameraSpace[to], cameraSpace[to + 1], cameraSpace[to + 2]];
        if (fromDistance < 0 || toDistance < 0) {
            const amount = fromDistance / (fromDistance - toDistance);
            const crossing = [0, 1, 2].map((axis) => start[axis] + (end[axis] - start[axis]) * amount);
            if (fromDistance < 0) start.splice(0, 3, ...crossing);
            else end.splice(0, 3, ...crossing);
        }
        return [...start, ...end];
    }

    // A camera-space point projected as WireframeProjector does, in depth-grid coordinates,
    // with its nearness (1 / distance from the eye).
    private toGrid(x: number, y: number, z: number): [number, number, number] {
        const { viewDistance, screenCenterX, screenCenterY } = this.camera;
        const depthFromEye = z + viewDistance;
        const perspective = viewDistance / depthFromEye;
        return [
            (screenCenterX + x * perspective) * this.cellsPerUnit,
            (screenCenterY - y * perspective) * this.cellsPerUnit,
            1 / depthFromEye,
        ];
    }
}

function newItemBuffers(): ItemBuffers {
    return {
        lines: { silhouettes: new SegmentBuffer(), creases: new SegmentBuffer(), otherEdges: new SegmentBuffer(), isCulled: false },
        cameraSpace: new Float32Array(0),
        facing: new Uint8Array(0),
        isTwoSided: false,
    };
}
