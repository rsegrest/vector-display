// The browser adapter: owns the canvas, the beam renderer and the frame loop, and
// nothing else. All the decisions about cells and light live in lifeRules.ts and
// lifeBeamGeometry.ts, which is why those have tests and this does not.

import { DisplayList, Shape, SCREEN_SPACE_PLACEMENT, type BeamColor } from "@vector-display/core";
import { WebGLVectorRenderer } from "@vector-display/webgl";
import { PhosphorPipeline } from "@vector-display/beam-fx";
import {
    DEFAULT_BEAM_PALETTE,
    advanceAges,
    beamColorForBucket,
    beamIntensityForBucket,
    groupCellsByAgeBucket,
    polylinesForCellBoxes,
} from "./lifeBeamGeometry.js";
import {
    cellSizeForGrid,
    createEmptyGrid,
    nextGeneration,
    populationOf,
    stampDisk,
    stampGlider,
    wrapCoordinate,
    type LiveCells,
} from "./lifeRules.js";

// 96x64 gives gliders room to travel and keeps segment count near 20k, which is where
// the whole display list still lands in one batched draw call.
const GRID_COLUMNS = 96;
const GRID_ROWS = 64;
const WORLD_WIDTH = GRID_COLUMNS * 10;
const WORLD_HEIGHT = GRID_ROWS * 10;
const CELL_FILL_RATIO = 0.62;
const AGE_BUCKET_COUNT = 8;
const RANDOM_SEED_DENSITY = 0.28;
const PAINT_RADIUS = 2;

function requireElement<ElementType extends HTMLElement>(elementId: string): ElementType {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Missing element #${elementId}`);
    return element as ElementType;
}

const canvas = requireElement<HTMLCanvasElement>("beam-canvas");
const stage = requireElement<HTMLElement>("stage");
const toggleButton = requireElement<HTMLButtonElement>("toggle");
const randomizeButton = requireElement<HTMLButtonElement>("randomize");
const glidersButton = requireElement<HTMLButtonElement>("gliders");
const clearButton = requireElement<HTMLButtonElement>("clear");
const speedSlider = requireElement<HTMLInputElement>("speed");
const speedValue = requireElement<HTMLOutputElement>("speed-value");
const persistenceSlider = requireElement<HTMLInputElement>("persistence");
const persistenceValue = requireElement<HTMLOutputElement>("persistence-value");
const bloomSlider = requireElement<HTMLInputElement>("bloom");
const bloomValue = requireElement<HTMLOutputElement>("bloom-value");
const generationReadout = requireElement<HTMLElement>("generation");
const populationReadout = requireElement<HTMLElement>("population");
const segmentsReadout = requireElement<HTMLElement>("segments");

const renderer = WebGLVectorRenderer.fromCanvas(canvas, { width: WORLD_WIDTH, height: WORLD_HEIGHT });
const phosphor = new PhosphorPipeline(renderer);
const displayList = new DisplayList();

const gridSize = { columns: GRID_COLUMNS, rows: GRID_ROWS };
const cellSize = cellSizeForGrid(gridSize, WORLD_WIDTH, WORLD_HEIGHT);

let live: LiveCells = createEmptyGrid(gridSize);
let ages: Uint8Array = new Uint8Array(live.cells.length);
let generation = 0;
let isRunning = true;
let isPointerDown = false;
let millisecondsSinceGeneration = 0;
let previousTimestamp = performance.now();
let lastReadoutUpdate = 0;

// The shapes are rebuilt each generation because a generation IS new geometry; the
// display list is reused, which is the one allocation that matters per frame.
let cachedShapes: Shape[] = [];
let cachedColors: { color: BeamColor; intensity: number }[] = [];

function seedRandomly(): void {
    live = createEmptyGrid(gridSize);
    for (let index = 0; index < live.cells.length; index++) {
        live.cells[index] = Math.random() < RANDOM_SEED_DENSITY ? 1 : 0;
    }
    ages = new Uint8Array(live.cells.length);
    generation = 0;
    rebuildShapes();
}

function launchGliders(): void {
    // A diagonal file of gliders crossing the field: the clearest demonstration that the
    // grid wraps, and the prettiest thing to watch with persistence turned up.
    for (let index = 0; index < 6; index++) {
        stampGlider(live, (index * 7) % GRID_COLUMNS, index * 5);
    }
    rebuildShapes();
}

function clearField(): void {
    live = createEmptyGrid(gridSize);
    ages = new Uint8Array(live.cells.length);
    generation = 0;
    rebuildShapes();
}

function stepGeneration(): void {
    const next = nextGeneration(live);
    ages = advanceAges(live, ages, next);
    live = next;
    generation++;
    rebuildShapes();
}

function rebuildShapes(): void {
    const buckets = groupCellsByAgeBucket(live, ages, cellSize, CELL_FILL_RATIO, AGE_BUCKET_COUNT);
    cachedShapes = [];
    cachedColors = [];
    for (let bucketIndex = 0; bucketIndex < buckets.length; bucketIndex++) {
        const polylines = polylinesForCellBoxes(buckets[bucketIndex], cellSize);
        if (polylines.length === 0) continue;
        cachedShapes.push(Shape.fromPolylines(polylines));
        cachedColors.push({
            color: beamColorForBucket(bucketIndex, AGE_BUCKET_COUNT, DEFAULT_BEAM_PALETTE),
            intensity: beamIntensityForBucket(bucketIndex, AGE_BUCKET_COUNT, DEFAULT_BEAM_PALETTE),
        });
    }
}

function drawDisplayList(): void {
    displayList.clear();
    for (let index = 0; index < cachedShapes.length; index++) {
        const { color, intensity } = cachedColors[index];
        displayList.setColor(color);
        displayList.addShape(cachedShapes[index], { ...SCREEN_SPACE_PLACEMENT, intensity });
    }
}

function worldFromPointer(event: PointerEvent): { column: number; row: number } {
    const bounds = canvas.getBoundingClientRect();
    const worldX = ((event.clientX - bounds.left) / bounds.width) * WORLD_WIDTH;
    const worldY = ((event.clientY - bounds.top) / bounds.height) * WORLD_HEIGHT;
    return { column: Math.floor(worldX / cellSize), row: Math.floor(worldY / cellSize) };
}

// Age resets to newborn on every stamp, so cells painted by hand flash white.
function paintAtPointer(event: PointerEvent): void {
    const { column, row } = worldFromPointer(event);
    const radius = PAINT_RADIUS;
    for (let rowOffset = -radius; rowOffset <= radius; rowOffset++) {
        for (let columnOffset = -radius; columnOffset <= radius; columnOffset++) {
            const targetColumn = wrapCoordinate(column + columnOffset, GRID_COLUMNS);
            const targetRow = wrapCoordinate(row + rowOffset, GRID_ROWS);
            ages[targetRow * GRID_COLUMNS + targetColumn] = 0;
        }
    }
    stampDisk(live, column, row, radius);
    rebuildShapes();
}

function fitCanvasToStage(): void {
    const pixelRatio = window.devicePixelRatio || 1;
    const aspectRatio = WORLD_WIDTH / WORLD_HEIGHT;
    const availableWidth = stage.clientWidth - 36;
    const availableHeight = stage.clientHeight - 36;
    const cssWidth = Math.max(160, Math.floor(Math.min(availableWidth, availableHeight * aspectRatio)));
    const cssHeight = Math.floor(cssWidth / aspectRatio);
    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    canvas.width = Math.round(cssWidth * pixelRatio);
    canvas.height = Math.round(cssHeight * pixelRatio);
    renderer.setLineStyle({ beamWidth: 1.3 * pixelRatio, glowRadius: 3.2 * pixelRatio });
}

function readSlider(slider: HTMLInputElement, fallback: number): number {
    const parsed = Number(slider.value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function updateReadouts(): void {
    generationReadout.textContent = String(generation);
    populationReadout.textContent = String(populationOf(live));
    segmentsReadout.textContent = String(displayList.segmentCount);
}

function applySettingsFromControls(): void {
    const persistenceMilliseconds = readSlider(persistenceSlider, 80);
    const bloomStrength = readSlider(bloomSlider, 1.4);
    phosphor.setSettings({
        persistenceHalfLifeMilliseconds: persistenceMilliseconds,
        bloomStrength,
        exposure: 1.5,
        flickerAmount: 0.05,
        flickerFrequencyHz: 12,
    });
    persistenceValue.textContent = `${persistenceMilliseconds} ms`;
    bloomValue.textContent = bloomStrength.toFixed(1);
    speedValue.textContent = `${readSlider(speedSlider, 8)} gen/s`;
}

function frame(timestamp: number): void {
    const elapsedMilliseconds = Math.min(timestamp - previousTimestamp, 100);
    previousTimestamp = timestamp;

    const generationsPerSecond = readSlider(speedSlider, 8);
    millisecondsSinceGeneration += elapsedMilliseconds;
    const millisecondsPerGeneration = 1000 / generationsPerSecond;
    if (isRunning) {
        // Catch up at most once per frame so a slow tab does not stampede the automaton.
        if (millisecondsSinceGeneration >= millisecondsPerGeneration) {
            millisecondsSinceGeneration -= millisecondsPerGeneration;
            stepGeneration();
        }
    }

    drawDisplayList();
    phosphor.renderFrame(displayList, elapsedMilliseconds);

    if (timestamp - lastReadoutUpdate > 200) {
        lastReadoutUpdate = timestamp;
        updateReadouts();
    }
    requestAnimationFrame(frame);
}

toggleButton.addEventListener("click", () => {
    isRunning = !isRunning;
    toggleButton.textContent = isRunning ? "Pause" : "Resume";
});
randomizeButton.addEventListener("click", seedRandomly);
glidersButton.addEventListener("click", launchGliders);
clearButton.addEventListener("click", clearField);
speedSlider.addEventListener("input", applySettingsFromControls);
persistenceSlider.addEventListener("input", applySettingsFromControls);
bloomSlider.addEventListener("input", applySettingsFromControls);

canvas.addEventListener("pointerdown", (event) => {
    isPointerDown = true;
    canvas.setPointerCapture(event.pointerId);
    paintAtPointer(event);
});
canvas.addEventListener("pointermove", (event) => {
    if (isPointerDown) paintAtPointer(event);
});
canvas.addEventListener("pointerup", (event) => {
    isPointerDown = false;
    canvas.releasePointerCapture(event.pointerId);
});
window.addEventListener("resize", () => {
    fitCanvasToStage();
    rebuildShapes();
});

// The stage has no measurable size until layout has run, so an initial call would
// size the canvas from zeros and leave it tiny. Fit on the next frame, then follow
// the element for the life of the page.
new ResizeObserver(() => {
    fitCanvasToStage();
}).observe(stage);

fitCanvasToStage();
seedRandomly();
applySettingsFromControls();
requestAnimationFrame(() => {
    fitCanvasToStage();
    previousTimestamp = performance.now();
});

// A debug hook on the real start path, so the capture harness can prove the beam
// painted and can advance the automaton deterministically without waiting on frames.
interface LifeDebugApi {
    readonly generation: () => number;
    readonly population: () => number;
    readonly segmentCount: () => number;
    step: (generations: number) => void;
    seedGliders: () => void;
    setRendererEnabled: (isEnabled: boolean) => void;
}
(window as unknown as { __life: LifeDebugApi }).__life = {
    generation: () => generation,
    population: () => populationOf(live),
    segmentCount: () => displayList.segmentCount,
    step(generations: number) {
        for (let index = 0; index < generations; index++) stepGeneration();
    },
    seedGliders() {
        clearField();
        launchGliders();
    },
    setRendererEnabled(isEnabled: boolean) {
        isRunning = isEnabled;
    },
};

requestAnimationFrame((timestamp) => {
    previousTimestamp = timestamp;
    requestAnimationFrame(frame);
});
