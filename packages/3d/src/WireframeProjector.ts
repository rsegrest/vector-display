import { NO_NEIGHBOR_SEGMENT, type ShapeGeometry } from "@rsegrest/vector-display";
import { Angle, VectorMath, type Vector } from "es-vector-math";
import type { WireframeModel } from "./WireframeModel.js";
import type { ModelPlacement3D, PerspectiveCamera } from "./wireframeTypes.js";

const START_CLIPPED = 1;
const END_CLIPPED = 2;
const INITIAL_EDGE_CAPACITY = 64;

// Projects a wireframe into screen-space line segments. The returned geometry is this projector's reusable
// buffer: add it to a display list before projecting the next model.
export class WireframeProjector implements ShapeGeometry {
    private camera: PerspectiveCamera;
    private inverseYaw: Angle;
    private inversePitch: Angle;
    private coordinates = new Float32Array(INITIAL_EDGE_CAPACITY * 4);
    private neighbors = new Int32Array(INITIAL_EDGE_CAPACITY * 2);
    private visibleSegmentOfEdge = new Int32Array(INITIAL_EDGE_CAPACITY);
    private clippedEndpointFlags = new Uint8Array(INITIAL_EDGE_CAPACITY);
    private readonly cameraSpaceVertices: Vector[] = [];
    private visibleSegmentCount = 0;

    constructor(camera: PerspectiveCamera) {
        this.camera = camera;
        this.inverseYaw = Angle.fromRadians(-camera.yaw.radians);
        this.inversePitch = Angle.fromRadians(-camera.pitch.radians);
    }

    public get segmentCoordinates(): Float32Array {
        return this.coordinates;
    }

    public get segmentNeighbors(): Int32Array {
        return this.neighbors;
    }

    public get segmentCount(): number {
        return this.visibleSegmentCount;
    }

    public setCamera(camera: PerspectiveCamera): void {
        this.camera = camera;
        this.inverseYaw = Angle.fromRadians(-camera.yaw.radians);
        this.inversePitch = Angle.fromRadians(-camera.pitch.radians);
    }

    public project(model: WireframeModel, placement: ModelPlacement3D): ShapeGeometry {
        this.ensureCapacity(model.edgeCount);
        this.transformVerticesToCameraSpace(model, placement);
        this.writeVisibleEdges(model);
        this.linkVisibleNeighbors(model);
        return this;
    }

    private ensureCapacity(edgeCount: number): void {
        if (edgeCount <= this.visibleSegmentOfEdge.length) return;
        let capacity = this.visibleSegmentOfEdge.length;
        while (capacity < edgeCount) capacity *= 2;
        this.coordinates = new Float32Array(capacity * 4);
        this.neighbors = new Int32Array(capacity * 2);
        this.visibleSegmentOfEdge = new Int32Array(capacity);
        this.clippedEndpointFlags = new Uint8Array(capacity);
    }

    private transformVerticesToCameraSpace(model: WireframeModel, placement: ModelPlacement3D): void {
        const { position, rotationX, rotationY, rotationZ, scale } = placement;
        this.cameraSpaceVertices.length = model.vertices.length;
        model.vertices.forEach((vertex, vertexIndex) => {
            const rotated = VectorMath.rotateXYZ(rotationX, rotationY, rotationZ, VectorMath.scale(scale, vertex));
            const relativeToCamera = VectorMath.subtract(VectorMath.add(rotated, position), this.camera.position);
            const cameraSpace = VectorMath.rotateX(this.inversePitch, VectorMath.rotateY(this.inverseYaw, relativeToCamera));
            this.cameraSpaceVertices[vertexIndex] = cameraSpace;
        });
    }

    private writeVisibleEdges(model: WireframeModel): void {
        this.visibleSegmentCount = 0;
        for (let edge = 0; edge < model.edgeCount; edge++) {
            const start = this.cameraSpaceVertices[model.edgeVertexIndices[edge * 2]];
            const end = this.cameraSpaceVertices[model.edgeVertexIndices[edge * 2 + 1]];
            const isStartTooClose = this.depthFromEye(start) < this.camera.nearDistance;
            const isEndTooClose = this.depthFromEye(end) < this.camera.nearDistance;
            if (isStartTooClose && isEndTooClose) {
                this.visibleSegmentOfEdge[edge] = NO_NEIGHBOR_SEGMENT;
                continue;
            }
            const visibleStart = isStartTooClose ? this.clipToNearPlane(end, start) : start;
            const visibleEnd = isEndTooClose ? this.clipToNearPlane(start, end) : end;
            const segment = this.visibleSegmentCount;
            this.writeScreenPoint(segment * 4, visibleStart);
            this.writeScreenPoint(segment * 4 + 2, visibleEnd);
            this.clippedEndpointFlags[segment] = (isStartTooClose ? START_CLIPPED : 0) | (isEndTooClose ? END_CLIPPED : 0);
            this.visibleSegmentOfEdge[edge] = segment;
            this.visibleSegmentCount++;
        }
    }

    // A clipped endpoint no longer meets its neighbor, so that joint is left unconnected.
    private linkVisibleNeighbors(model: WireframeModel): void {
        for (let edge = 0; edge < model.edgeCount; edge++) {
            const segment = this.visibleSegmentOfEdge[edge];
            if (segment === NO_NEIGHBOR_SEGMENT) continue;
            const previousSegment = this.findVisibleSegment(model.edgeNeighbors[edge * 2]);
            const nextSegment = this.findVisibleSegment(model.edgeNeighbors[edge * 2 + 1]);
            const flags = this.clippedEndpointFlags[segment];
            const joinsPrevious =
                previousSegment !== NO_NEIGHBOR_SEGMENT &&
                (flags & START_CLIPPED) === 0 &&
                (this.clippedEndpointFlags[previousSegment] & END_CLIPPED) === 0;
            const joinsNext =
                nextSegment !== NO_NEIGHBOR_SEGMENT &&
                (flags & END_CLIPPED) === 0 &&
                (this.clippedEndpointFlags[nextSegment] & START_CLIPPED) === 0;
            this.neighbors[segment * 2] = joinsPrevious ? previousSegment : NO_NEIGHBOR_SEGMENT;
            this.neighbors[segment * 2 + 1] = joinsNext ? nextSegment : NO_NEIGHBOR_SEGMENT;
        }
    }

    private findVisibleSegment(edge: number): number {
        return edge === NO_NEIGHBOR_SEGMENT ? NO_NEIGHBOR_SEGMENT : this.visibleSegmentOfEdge[edge];
    }

    private depthFromEye(cameraSpacePoint: Vector): number {
        return (cameraSpacePoint.z ?? 0) + this.camera.viewDistance;
    }

    private clipToNearPlane(visiblePoint: Vector, hiddenPoint: Vector): Vector {
        const visibleDepth = this.depthFromEye(visiblePoint);
        const hiddenDepth = this.depthFromEye(hiddenPoint);
        const fraction = (this.camera.nearDistance - visibleDepth) / (hiddenDepth - visibleDepth);
        return VectorMath.add(visiblePoint, VectorMath.scale(fraction, VectorMath.subtract(hiddenPoint, visiblePoint)));
    }

    private writeScreenPoint(coordinateOffset: number, cameraSpacePoint: Vector): void {
        const perspective = VectorMath.getPerspective(this.camera.viewDistance, cameraSpacePoint);
        this.coordinates[coordinateOffset] = this.camera.screenCenterX + cameraSpacePoint.x * perspective;
        this.coordinates[coordinateOffset + 1] = this.camera.screenCenterY - cameraSpacePoint.y * perspective;
    }
}

export default WireframeProjector;
