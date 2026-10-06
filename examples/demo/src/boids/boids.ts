// The browser adapter: owns the canvas, the renderer and the frame loop, nothing else.
// The flocking decisions live in boidsRules.ts and the light in boidsBeamGeometry.ts,
// which is why those carry tests and this does not.

import { DisplayList, Shape, SCREEN_SPACE_PLACEMENT } from "@vector-display/core";
import { WebGLVectorRenderer } from "@vector-display/webgl";
import { PhosphorPipeline } from "@vector-display/beam-fx";
import {
    BOID_BEAM_COLOR,
    DEFAULT_BOID_BEAM_SETTINGS,
    placedBoids,
    trailPolylines,
    type BoidBeamSettings,
} from "./boidsBeamGeometry.js";
import {
    createFlock,
    createSeededRandom,
    polarizationOf,
    stepFlock,
    type BoidFlock,
    type FlockingSettings,
} from "./boidsRules.js";

const WORLD_WIDTH = 960;
const WORLD_HEIGHT = 640;
const FIXED_STEP_SECONDS = 1 / 60;
// The flock is stepped at a fixed rate and drawn whatever the frame rate is, so a slow
// frame does not silently change the simulation.
const MAXIMUM_STEPS_LOCKED_PER_FRAME = 5;
const INITIAL_SEED = 20261004;

function requireElement<ElementType extends HTMLElement>(elementId: string): ElementType {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Missing element #${elementId}`);
    return element as ElementType;
}

const canvas = requireElement<HTMLCanvasElement>("beam-canvas");
const stage = requireElement<HTMLElement>("stage");
const scatterButton = requireElement<HTMLButtonElement>("scatter");
const pauseButton = requireElement<HTMLButtonElement>("pause");
const countSlider = requireElement<HTMLInputElement>("count");
const countValue = requireElement<HTMLOutputElement>("count-value");
const separationSlider = requireElement<HTMLInputElement>("separation");
const separationValue = requireElement<HTMLOutputElement>("separation-value");
const alignmentSlider = requireElement<HTMLInputElement>("alignment");
const alignmentValue = requireElement<HTMLOutputElement>("alignment-value");
const cohesionSlider = requireElement<HTMLInputElement>("cohesion");
const cohesionValue = requireElement<HTMLOutputElement>("cohesion-value");
const persistenceSlider = requireElement<HTMLInputElement>("persistence");
const persistenceValue = requireElement<HTMLOutputElement>("persistence-value");
const trailSlider = requireElement<HTMLInputElement>("trail");
const trailValue = requireElement<HTMLOutputElement>("trail-value");
const boidsReadout = requireElement<HTMLElement>("boids");
const polarizationReadout = requireElement<HTMLElement>("polarization");
const segmentsReadout = requireElement<HTMLElement>("segments");

const renderer = WebGLVectorRenderer.fromCanvas(canvas, { width: WORLD_WIDTH, height: WORLD_HEIGHT });
const phosphor = new PhosphorPipeline(renderer);
const displayList = new DisplayList();

const outline = Shape.fromPolyline({
    points: [
        { x: 4.5, y: 0 },
        { x: -4.5, y: -2.5 },
        { x: -4.5, y: 2.5 },
    ],
    isClosed: true,
});

let flock: BoidFlock = createFlock(220, WORLD_WIDTH, WORLD_HEIGHT, createSeededRandom(INITIAL_SEED));
let isRunning = true;
let accumulatedSeconds = 0;
let previousTimestamp = performance.now();
let lastReadoutUpdate = 0;
let trailShapeCache = { trailLength: -1, shape: null as Shape | null };

function readSlider(slider: HTMLInputElement, fallback: number): number {
    const parsed = Number(slider.value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function flockingSettings(): FlockingSettings {
    return {
        perceptionRadius: 70,
        separationRadius: 18,
        separationWeight: readSlider(separationSlider, 90),
        alignmentWeight: readSlider(alignmentSlider, 60),
        cohesionWeight: readSlider(cohesionSlider, 45),
        minimumSpeed: 40,
        maximumSpeed: 110,
    };
}

function beamSettings(): BoidBeamSettings {
    return { ...DEFAULT_BOID_BEAM_SETTINGS, trailLength: readSlider(trailSlider, 14) };
}

function scatterFlock(): void {
    // A fresh random seed each scatter, so no two scatters look alike, while any fixed
    // seed still replays identically for a capture.
    const count = Math.round(readSlider(countSlider, 220));
    flock = createFlock(count, WORLD_WIDTH, WORLD_HEIGHT, createSeededRandom((Math.random() * 0xffffffff) >>> 0));
    trailShapeCache = { trailLength: -1, shape: null };
}

function resetFlockFromSeed(seed: number): void {
    flock = createFlock(Math.round(readSlider(countSlider, 220)), WORLD_WIDTH, WORLD_HEIGHT, createSeededRandom(seed));
    trailShapeCache = { trailLength: -1, shape: null };
}

function resizeFlockToCount(count: number): void {
    if (count === flock.count) return;
    const resized = createFlock(count, WORLD_WIDTH, WORLD_HEIGHT, createSeededRandom(INITIAL_SEED + count));
    // Keep the existing boids where they are and only add or drop the difference, so
    // dragging the slider reshapes the flock instead of restarting it.
    const kept = Math.min(count, flock.count);
    for (let index = 0; index < kept; index++) {
        resized.x[index] = flock.x[index];
        resized.y[index] = flock.y[index];
        resized.vx[index] = flock.vx[index];
        resized.vy[index] = flock.vy[index];
    }
    flock = resized;
}

function trailShapeFor(trailLength: number): Shape | null {
    if (trailLength <= 0) return null;
    if (trailShapeCache.trailLength === trailLength && trailShapeCache.shape) return trailShapeCache.shape;
    // Trails are one open two-point segment each, drawn in the boid's own frame at the
    // origin; the real endpoints arrive as placements, so the shape is a unit segment.
    const shape = Shape.fromPolyline({ points: [{ x: 0, y: 0 }, { x: 1, y: 0 }], isClosed: false });
    trailShapeCache = { trailLength, shape };
    return shape;
}

function buildDisplayList(): void {
    const beam = beamSettings();
    displayList.clear();

    const trails = trailPolylines(flock, beam);

    // Trails first so the arrowheads draw on top of them.
    const trailShape = trailShapeFor(beam.trailLength);
    if (trailShape) {
        displayList.setColor({ red: 0.2, green: 0.5, blue: 0.36 });
        for (const trail of trails) {
            const start = trail.points[0];
            const end = trail.points[1];
            const deltaX = end.x - start.x;
            const deltaY = end.y - start.y;
            const length = Math.hypot(deltaX, deltaY);
            displayList.addShape(trailShape, {
                x: start.x,
                y: start.y,
                rotation: Math.atan2(deltaY, deltaX),
                scale: Math.max(length, 1e-3),
                intensity: 0.55,
            });
        }
    }

    displayList.setColor(BOID_BEAM_COLOR);
    for (const placed of placedBoids(flock, beam)) {
        displayList.addShape(outline, {
            ...SCREEN_SPACE_PLACEMENT,
            x: placed.x,
            y: placed.y,
            rotation: placed.rotation,
            scale: 1,
            intensity: placed.intensity,
        });
    }
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
    renderer.setLineStyle({ beamWidth: 1.35 * pixelRatio, glowRadius: 3 * pixelRatio });
}

function applyPhosphorSettings(): void {
    const persistenceMilliseconds = readSlider(persistenceSlider, 120);
    phosphor.setSettings({
        persistenceHalfLifeMilliseconds: persistenceMilliseconds,
        bloomStrength: 1.5,
        exposure: 1.6,
        flickerAmount: 0.04,
        flickerFrequencyHz: 12,
    });
    persistenceValue.textContent = `${persistenceMilliseconds} ms`;
}

function applyControlReadouts(): void {
    countValue.textContent = String(Math.round(readSlider(countSlider, 220)));
    separationValue.textContent = String(Math.round(readSlider(separationSlider, 90)));
    alignmentValue.textContent = String(Math.round(readSlider(alignmentSlider, 60)));
    cohesionValue.textContent = String(Math.round(readSlider(cohesionSlider, 45)));
    trailValue.textContent = String(Math.round(readSlider(trailSlider, 14)));
}

function updateReadouts(): void {
    boidsReadout.textContent = String(flock.count);
    polarizationReadout.textContent = polarizationOf(flock).toFixed(2);
    segmentsReadout.textContent = String(displayList.segmentCount);
}

function frame(timestamp: number): void {
    const elapsedSeconds = Math.min((timestamp - previousTimestamp) / 1000, 0.25);
    previousTimestamp = timestamp;

    if (isRunning) {
        accumulatedSeconds += elapsedSeconds;
        let steps = 0;
        while (accumulatedSeconds >= FIXED_STEP_SECONDS && steps < MAXIMUM_STEPS_LOCKED_PER_FRAME) {
            flock = stepFlock(flock, flockingSettings(), FIXED_STEP_SECONDS);
            accumulatedSeconds -= FIXED_STEP_SECONDS;
            steps++;
        }
    }

    buildDisplayList();
    phosphor.renderFrame(displayList, elapsedSeconds * 1000);

    if (timestamp - lastReadoutUpdate > 200) {
        lastReadoutUpdate = timestamp;
        updateReadouts();
    }
    requestAnimationFrame(frame);
}

scatterButton.addEventListener("click", scatterFlock);
pauseButton.addEventListener("click", () => {
    isRunning = !isRunning;
    pauseButton.textContent = isRunning ? "Pause" : "Resume";
});
countSlider.addEventListener("input", () => resizeFlockToCount(Math.round(readSlider(countSlider, 220))));
for (const slider of [separationSlider, alignmentSlider, cohesionSlider, trailSlider]) {
    slider.addEventListener("input", applyControlReadouts);
}
persistenceSlider.addEventListener("input", applyPhosphorSettings);

new ResizeObserver(() => {
    fitCanvasToStage();
}).observe(stage);

fitCanvasToStage();
applyPhosphorSettings();
applyControlReadouts();

// A debug hook on the real start path, so a capture harness can prove the beam painted
// and drive the simulation deterministically instead of racing the frame loop.
interface BoidsDebugApi {
    readonly count: () => number;
    readonly polarization: () => number;
    readonly segmentCount: () => number;
    readonly speedRange: () => { minimum: number; maximum: number };
    step: (steps: number) => void;
    reseed: (seed: number, count: number) => void;
    setRunning: (isRunning: boolean) => void;
}
(window as unknown as { __boids: BoidsDebugApi }).__boids = {
    count: () => flock.count,
    polarization: () => polarizationOf(flock),
    segmentCount: () => displayList.segmentCount,
    speedRange() {
        let minimum = Number.POSITIVE_INFINITY;
        let maximum = 0;
        for (let index = 0; index < flock.count; index++) {
            const speed = Math.hypot(flock.vx[index], flock.vy[index]);
            minimum = Math.min(minimum, speed);
            maximum = Math.max(maximum, speed);
        }
        return { minimum, maximum };
    },
    step(steps: number) {
        for (let index = 0; index < steps; index++) flock = stepFlock(flock, flockingSettings(), FIXED_STEP_SECONDS);
    },
    reseed(seed: number, count: number) {
        resetFlockFromSeed(seed);
        if (count !== flock.count) resizeFlockToCount(count);
    },
    setRunning(running: boolean) {
        isRunning = running;
    },
};

requestAnimationFrame((timestamp) => {
    previousTimestamp = timestamp;
    requestAnimationFrame(frame);
});
