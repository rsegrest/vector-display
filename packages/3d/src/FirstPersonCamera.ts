import { Angle, Vector } from "es-vector-math";
import { DEFAULT_PERSPECTIVE_CAMERA, type PerspectiveCamera } from "./wireframeTypes.js";

// Looking up or down stops just short of straight, where turning left and right would lose its meaning.
const PITCH_LIMIT = Math.PI / 2 - 0.01;

// A walking viewer: turns and tilts their head, and walks on the floor in the direction they
// face, as in a first-person game. Gives the PerspectiveCamera to project with.
export class FirstPersonCamera {
    public position: Vector;
    // Radians; positive turns toward +x.
    public yaw: number;
    // Radians; positive tilts the view down (toward -y), as PerspectiveCamera's pitch does.
    public pitch: number;

    public constructor(position = new Vector(0, 0, 0), yaw = 0, pitch = 0) {
        this.position = position;
        this.yaw = yaw;
        this.pitch = clampPitch(pitch);
    }

    public turn(yawBy: number, pitchBy = 0): void {
        this.yaw += yawBy;
        this.pitch = clampPitch(this.pitch + pitchBy);
    }

    // Moves along the floor: `forward` the way the viewer faces (tilt ignored), `right` to
    // their right, and `up` straight up.
    public walk(forward: number, right = 0, up = 0): void {
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);
        this.position = new Vector(
            this.position.x + forward * sin + right * cos,
            this.position.y + up,
            (this.position.z ?? 0) + forward * cos - right * sin,
        );
    }

    public perspectiveCamera(base: PerspectiveCamera = DEFAULT_PERSPECTIVE_CAMERA): PerspectiveCamera {
        return { ...base, position: this.position, yaw: Angle.fromRadians(this.yaw), pitch: Angle.fromRadians(this.pitch) };
    }
}

function clampPitch(pitch: number): number {
    return Math.min(PITCH_LIMIT, Math.max(-PITCH_LIMIT, pitch));
}
