import type { ArcadeShapeName } from "./arcadeShapes.js";

export interface SceneObject {
    shapeName: ArcadeShapeName;
    x: number;
    y: number;
    rotation: number;
    scale: number;
    intensity: number;
}

export interface WorldSize {
    readonly width: number;
    readonly height: number;
}

export interface SceneRenderer {
    readonly element: HTMLElement;
    render(sceneObjects: readonly SceneObject[], elapsedMilliseconds: number): void;
    resize(cssWidth: number, cssHeight: number): void;
    // Blocks until queued drawing has actually executed, so benchmarks measure real GPU work.
    waitForDrawingToFinish(): void;
}
