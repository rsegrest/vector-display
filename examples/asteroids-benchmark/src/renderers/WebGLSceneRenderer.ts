import { DisplayList, Shape, type BeamColor } from "@rsegrest/vector-display";
import { WebGLVectorRenderer } from "@rsegrest/vector-display-webgl";
import { PhosphorPipeline, type PhosphorSettings } from "@rsegrest/vector-display-beam-fx";
import { ARCADE_SHAPE_POLYLINES, getShapeColor, type ArcadeShapeName } from "../arcadeShapes.js";
import type { SceneObject, SceneRenderer, WorldSize } from "../sceneTypes.js";

const BEAM_WIDTH_CSS_PIXELS = 1.5;
const DEFAULT_GLOW_RADIUS_CSS_PIXELS = 3;

export class WebGLSceneRenderer implements SceneRenderer {
    public readonly element: HTMLCanvasElement;
    private readonly renderer: WebGLVectorRenderer;
    private readonly phosphorPipeline: PhosphorPipeline;
    private readonly displayList = new DisplayList();
    private readonly shapes = buildShapes();
    private readonly readbackPixel = new Uint8Array(4);
    private isPhosphorEnabled = false;
    private glowRadiusCssPixels = DEFAULT_GLOW_RADIUS_CSS_PIXELS;

    constructor(canvas: HTMLCanvasElement, worldSize: WorldSize) {
        this.element = canvas;
        this.renderer = WebGLVectorRenderer.fromCanvas(canvas, worldSize);
        this.phosphorPipeline = new PhosphorPipeline(this.renderer);
    }

    public get segmentCount(): number {
        return this.displayList.segmentCount;
    }

    public get isUsingFloatStorage(): boolean {
        return this.phosphorPipeline.isUsingFloatStorage;
    }

    public setPhosphorEnabled(isEnabled: boolean): void {
        this.isPhosphorEnabled = isEnabled;
    }

    public setGlowRadiusCssPixels(glowRadiusCssPixels: number): void {
        this.glowRadiusCssPixels = glowRadiusCssPixels;
        this.renderer.setLineStyle({ glowRadius: glowRadiusCssPixels * (window.devicePixelRatio || 1) });
    }

    public setPhosphorSettings(settings: Partial<PhosphorSettings>): void {
        this.phosphorPipeline.setSettings(settings);
    }

    public resize(cssWidth: number, cssHeight: number): void {
        const pixelRatio = window.devicePixelRatio || 1;
        this.element.style.width = `${cssWidth}px`;
        this.element.style.height = `${cssHeight}px`;
        this.element.width = Math.round(cssWidth * pixelRatio);
        this.element.height = Math.round(cssHeight * pixelRatio);
        this.renderer.setLineStyle({
            beamWidth: BEAM_WIDTH_CSS_PIXELS * pixelRatio,
            glowRadius: this.glowRadiusCssPixels * pixelRatio,
        });
    }

    public waitForDrawingToFinish(): void {
        const gl = this.renderer.gl;
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.readbackPixel);
    }

    public render(sceneObjects: readonly SceneObject[], elapsedMilliseconds: number): void {
        this.buildDisplayList(sceneObjects);
        if (this.isPhosphorEnabled) {
            this.phosphorPipeline.renderFrame(this.displayList, elapsedMilliseconds);
            return;
        }
        this.renderer.gl.bindFramebuffer(this.renderer.gl.FRAMEBUFFER, null);
        this.renderer.clear();
        this.renderer.drawDisplayList(this.displayList);
    }

    private buildDisplayList(sceneObjects: readonly SceneObject[]): void {
        const displayList = this.displayList;
        let currentColor: BeamColor | null = null;
        displayList.clear();
        for (const sceneObject of sceneObjects) {
            const color = getShapeColor(sceneObject.shapeName);
            if (color !== currentColor) {
                displayList.setColor(color);
                currentColor = color;
            }
            displayList.addShape(this.shapes[sceneObject.shapeName], sceneObject);
        }
    }
}

function buildShapes(): Record<ArcadeShapeName, Shape> {
    const entries = Object.entries(ARCADE_SHAPE_POLYLINES).map(([shapeName, polylines]) => [
        shapeName,
        Shape.fromPolylines(polylines),
    ]);
    return Object.fromEntries(entries) as Record<ArcadeShapeName, Shape>;
}

export default WebGLSceneRenderer;
