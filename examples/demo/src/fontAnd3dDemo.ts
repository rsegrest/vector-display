import { DisplayList, SCREEN_SPACE_PLACEMENT, type BeamColor } from "@rsegrest/vector-display";
import {
    DEFAULT_PERSPECTIVE_CAMERA,
    WireframeModel,
    WireframeProjector,
    createBoxModel,
    createModelPlacement,
    createPyramidModel,
    type PerspectiveCamera,
    type WireframePolyline,
} from "@rsegrest/vector-display-3d";
import { PhosphorPipeline } from "@rsegrest/vector-display-beam-fx";
import { ARCADE_GLYPHS, VectorFont } from "@rsegrest/vector-display-font";
import { WebGLVectorRenderer } from "@rsegrest/vector-display-webgl";
import { Angle, Vector } from "es-vector-math";

const WORLD_SIZE = { width: 1024, height: 768 };
const TEXT_WHITE: BeamColor = { red: 0.85, green: 0.95, blue: 1 };
const WIREFRAME_GREEN: BeamColor = { red: 0.2, green: 1, blue: 0.3 };
const BEAM_WIDTH_CSS_PIXELS = 1.5;
const GLOW_RADIUS_CSS_PIXELS = 3;

function requireElement<ElementType extends HTMLElement>(elementId: string): ElementType {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Missing element #${elementId}`);
    return element as ElementType;
}

const canvas = requireElement<HTMLCanvasElement>("vector-canvas");
const stage = requireElement<HTMLElement>("stage");
const phosphorToggle = requireElement<HTMLInputElement>("phosphor-toggle");
const cameraTurnToggle = requireElement<HTMLInputElement>("camera-turn-toggle");

const renderer = WebGLVectorRenderer.fromCanvas(canvas, WORLD_SIZE);
const phosphor = new PhosphorPipeline(renderer, { flickerAmount: 0.04, bloomStrength: 0.8 });
// Softer vertex highlights keep small text from looking beaded.
renderer.setLineStyle({ endpointBrightness: 0.25, jointOverlap: 0.35 });
const displayList = new DisplayList();
const font = VectorFont.createArcadeFont();

const glyphCharacters = Object.keys(ARCADE_GLYPHS).filter((character) => character !== " ");
const letterRow = glyphCharacters.filter((character) => /[A-Z]/.test(character)).join("");
const digitAndSymbolRow = glyphCharacters.filter((character) => !/[A-Z]/.test(character)).join("");

// Battlezone-style ground: lines running into the distance plus cross lines.
function createGroundGridModel(): WireframeModel {
    const vertices: Vector[] = [];
    const polylines: WireframePolyline[] = [];
    const addLine = (start: Vector, end: Vector) => {
        vertices.push(start, end);
        polylines.push({ vertexIndices: [vertices.length - 2, vertices.length - 1], isClosed: false });
    };
    for (let x = -1200; x <= 1200; x += 200) addLine(new Vector(x, 0, -200), new Vector(x, 0, 2600));
    for (let z = -200; z <= 2600; z += 200) addLine(new Vector(-1200, 0, z), new Vector(1200, 0, z));
    return WireframeModel.fromDefinition({ vertices, polylines });
}

const groundGrid = createGroundGridModel();
const spinningBox = createBoxModel({ width: 160, height: 160, depth: 160 });
const pyramid = createPyramidModel({ baseWidth: 320, height: 280 });
const flyingPyramid = createPyramidModel({ baseWidth: 120, height: 100 });
const projector = new WireframeProjector(DEFAULT_PERSPECTIVE_CAMERA);

function createCamera(elapsedSeconds: number): PerspectiveCamera {
    const yawDegrees = cameraTurnToggle.checked ? Math.sin(elapsedSeconds * 0.35) * 18 : 0;
    return {
        ...DEFAULT_PERSPECTIVE_CAMERA,
        position: new Vector(0, 260, -300),
        yaw: Angle.fromDegrees(yawDegrees),
        viewDistance: 320,
        nearDistance: 4,
        screenCenterX: WORLD_SIZE.width / 2,
        screenCenterY: 470,
    };
}

function addTextSamples(elapsedSeconds: number): void {
    displayList.setColor(TEXT_WHITE);
    font.addText(displayList, { text: "VECTOR DISPLAY FONT", x: 512, y: 24, size: 30, alignment: "center" });
    font.addText(displayList, { text: letterRow, x: 512, y: 86, size: 22, alignment: "center" });
    font.addText(displayList, { text: digitAndSymbolRow, x: 512, y: 124, size: 22, alignment: "center" });
    font.addText(displayList, { text: "SCORE 01250\nHIGH  99000", x: 40, y: 182, size: 16 });
    font.addText(displayList, { text: "© 2026 RICK SEGREST", x: 984, y: 182, size: 16, alignment: "right" });
    font.addText(displayList, { text: "Lowercase maps to caps", x: 984, y: 212, size: 16, alignment: "right", intensity: 0.7 });
    font.addText(displayList, { text: "SPIN", x: 512, y: 214, size: 18, alignment: "center", rotation: elapsedSeconds * 1.5 });
    font.addText(displayList, { text: "3D WIREFRAMES  ES-VECTOR-MATH PROJECTION", x: 512, y: 300, size: 16, alignment: "center", intensity: 0.8 });
}

function addWireframeScene(elapsedSeconds: number): void {
    projector.setCamera(createCamera(elapsedSeconds));
    displayList.setColor(WIREFRAME_GREEN);
    const flyingZ = 1800 - ((elapsedSeconds * 450) % 2600);
    const scene = [
        { model: groundGrid, placement: createModelPlacement({}), intensity: 0.55 },
        {
            model: spinningBox,
            placement: createModelPlacement({
                position: new Vector(0, 180, 300),
                rotationX: Angle.fromRadians(elapsedSeconds * 0.7),
                rotationY: Angle.fromRadians(elapsedSeconds * 1.1),
            }),
            intensity: 1,
        },
        { model: pyramid, placement: createModelPlacement({ position: new Vector(-600, 0, 1100), rotationY: Angle.fromRadians(elapsedSeconds * 0.4) }), intensity: 1 },
        { model: pyramid, placement: createModelPlacement({ position: new Vector(700, 0, 1700), rotationY: Angle.fromRadians(-elapsedSeconds * 0.3) }), intensity: 1 },
        // Flies toward and past the camera, showing near-plane clipping.
        { model: flyingPyramid, placement: createModelPlacement({ position: new Vector(-40, 200, flyingZ), rotationY: Angle.fromRadians(elapsedSeconds * 2) }), intensity: 1 },
    ];
    for (const { model, placement, intensity } of scene) {
        displayList.addShape(projector.project(model, placement), { ...SCREEN_SPACE_PLACEMENT, intensity });
    }
}

function fitCanvasToStage(): void {
    const pixelRatio = window.devicePixelRatio || 1;
    const aspectRatio = WORLD_SIZE.width / WORLD_SIZE.height;
    const cssWidth = Math.floor(Math.min(stage.clientWidth, stage.clientHeight * aspectRatio));
    const cssHeight = Math.floor(cssWidth / aspectRatio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * pixelRatio);
    canvas.height = Math.round(cssHeight * pixelRatio);
    renderer.setLineStyle({ beamWidth: BEAM_WIDTH_CSS_PIXELS * pixelRatio, glowRadius: GLOW_RADIUS_CSS_PIXELS * pixelRatio });
}

function renderFrame(elapsedSeconds: number, frameMilliseconds: number): void {
    displayList.clear();
    addTextSamples(elapsedSeconds);
    addWireframeScene(elapsedSeconds);
    if (phosphorToggle.checked) {
        phosphor.renderFrame(displayList, frameMilliseconds);
        return;
    }
    renderer.gl.bindFramebuffer(renderer.gl.FRAMEBUFFER, null);
    renderer.clear();
    renderer.drawDisplayList(displayList);
}

const startTimestamp = performance.now();
let previousTimestamp = startTimestamp;

function runFrame(timestamp: number): void {
    renderFrame((timestamp - startTimestamp) / 1000, timestamp - previousTimestamp);
    previousTimestamp = timestamp;
    requestAnimationFrame(runFrame);
}

new ResizeObserver(fitCanvasToStage).observe(stage);
fitCanvasToStage();
Object.assign(window, { vectorFontDemo: { renderFrame } });
requestAnimationFrame(runFrame);
