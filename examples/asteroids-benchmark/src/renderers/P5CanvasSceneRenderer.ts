import p5 from "p5";
import { ARCADE_SHAPE_POLYLINES, getShapeColor, toCssColor } from "../arcadeShapes.js";
import type { SceneObject, SceneRenderer, WorldSize } from "../sceneTypes.js";

const BEAM_WIDTH_CSS_PIXELS = 1.5;

// Baseline: draws the way asteroids-p5-ts does today, with per-object transforms and beginShape/vertex calls.
export class P5CanvasSceneRenderer implements SceneRenderer {
    public readonly element: HTMLElement;
    private readonly sketch: p5;
    private readonly worldSize: WorldSize;
    private viewScale = 1;

    private constructor(sketch: p5, element: HTMLElement, worldSize: WorldSize) {
        this.sketch = sketch;
        this.element = element;
        this.worldSize = worldSize;
    }

    public static create(container: HTMLElement, worldSize: WorldSize): Promise<P5CanvasSceneRenderer> {
        return new Promise((resolve) => {
            new p5((sketch: p5) => {
                sketch.setup = () => {
                    sketch.createCanvas(worldSize.width, worldSize.height);
                    sketch.noLoop();
                    resolve(new P5CanvasSceneRenderer(sketch, container, worldSize));
                };
            }, container);
        });
    }

    public resize(cssWidth: number, cssHeight: number): void {
        this.sketch.resizeCanvas(cssWidth, cssHeight);
        this.viewScale = cssWidth / this.worldSize.width;
    }

    public waitForDrawingToFinish(): void {
        (this.sketch.drawingContext as CanvasRenderingContext2D).getImageData(0, 0, 1, 1);
    }

    public render(sceneObjects: readonly SceneObject[]): void {
        const sketch = this.sketch;
        sketch.background(0);
        sketch.push();
        sketch.scale(this.viewScale);
        sketch.noFill();
        for (const sceneObject of sceneObjects) {
            this.drawSceneObject(sceneObject);
        }
        sketch.pop();
    }

    private drawSceneObject(sceneObject: SceneObject): void {
        const sketch = this.sketch;
        sketch.push();
        sketch.stroke(toCssColor(getShapeColor(sceneObject.shapeName)));
        sketch.translate(sceneObject.x, sceneObject.y);
        sketch.rotate(sceneObject.rotation);
        sketch.scale(sceneObject.scale);
        if (sceneObject.shapeName === "bullet") {
            sketch.strokeWeight((BEAM_WIDTH_CSS_PIXELS * 2) / (this.viewScale * sceneObject.scale));
            sketch.point(0, 0);
        } else {
            sketch.strokeWeight(BEAM_WIDTH_CSS_PIXELS / (this.viewScale * sceneObject.scale));
            this.drawPolylines(sceneObject);
        }
        sketch.pop();
    }

    private drawPolylines(sceneObject: SceneObject): void {
        const sketch = this.sketch;
        for (const polyline of ARCADE_SHAPE_POLYLINES[sceneObject.shapeName]) {
            sketch.beginShape();
            for (const point of polyline.points) sketch.vertex(point.x, point.y);
            if (polyline.isClosed) sketch.endShape(sketch.CLOSE);
            else sketch.endShape();
        }
    }
}

export default P5CanvasSceneRenderer;
