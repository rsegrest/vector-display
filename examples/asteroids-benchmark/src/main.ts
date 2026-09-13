import { ArcadeSimulation } from "./ArcadeSimulation.js";
import { FrameStats } from "./FrameStats.js";
import { P5CanvasSceneRenderer } from "./renderers/P5CanvasSceneRenderer.js";
import { WebGLSceneRenderer } from "./renderers/WebGLSceneRenderer.js";
import type { SceneRenderer } from "./sceneTypes.js";

type RendererMode = "p5" | "webgl" | "phosphor";

const WORLD_SIZE = { width: 1024, height: 768 };
const STATS_REFRESH_MILLISECONDS = 250;

function requireElement<ElementType extends HTMLElement>(elementId: string): ElementType {
    const element = document.getElementById(elementId);
    if (!element) throw new Error(`Missing element #${elementId}`);
    return element as ElementType;
}

const modeSelect = requireElement<HTMLSelectElement>("renderer-mode");
const asteroidCountSelect = requireElement<HTMLSelectElement>("asteroid-count");
const persistenceSlider = requireElement<HTMLInputElement>("persistence");
const bloomSlider = requireElement<HTMLInputElement>("bloom");
const statsElement = requireElement<HTMLDivElement>("stats");
const stageElement = requireElement<HTMLElement>("stage");

const simulation = new ArcadeSimulation(WORLD_SIZE);
const frameStats = new FrameStats();
const webglRenderer = new WebGLSceneRenderer(requireElement<HTMLCanvasElement>("webgl-canvas"), WORLD_SIZE);
const p5Renderer = await P5CanvasSceneRenderer.create(requireElement<HTMLDivElement>("p5-container"), WORLD_SIZE);

let rendererMode: RendererMode = modeSelect.value as RendererMode;
let activeRenderer: SceneRenderer = webglRenderer;
let previousTimestamp = performance.now();
let lastStatsRefresh = 0;

function applyRendererMode(mode: RendererMode): void {
    rendererMode = mode;
    modeSelect.value = mode;
    activeRenderer = mode === "p5" ? p5Renderer : webglRenderer;
    webglRenderer.setPhosphorEnabled(mode === "phosphor");
    p5Renderer.element.hidden = mode !== "p5";
    webglRenderer.element.hidden = mode === "p5";
    document.querySelectorAll<HTMLElement>(".phosphor-control").forEach((control) => {
        control.hidden = mode !== "phosphor";
    });
    frameStats.reset();
}

function applyAsteroidCount(asteroidCount: number): void {
    simulation.setAsteroidCount(asteroidCount);
    asteroidCountSelect.value = String(asteroidCount);
    frameStats.reset();
}

function fitRenderersToStage(): void {
    const aspectRatio = WORLD_SIZE.width / WORLD_SIZE.height;
    const cssWidth = Math.floor(Math.min(stageElement.clientWidth, stageElement.clientHeight * aspectRatio));
    const cssHeight = Math.floor(cssWidth / aspectRatio);
    webglRenderer.resize(cssWidth, cssHeight);
    p5Renderer.resize(cssWidth, cssHeight);
}

function countSegmentsForStats(): number {
    return rendererMode === "p5" ? Number.NaN : webglRenderer.segmentCount;
}

function refreshStats(timestamp: number): void {
    if (timestamp - lastStatsRefresh < STATS_REFRESH_MILLISECONDS) return;
    lastStatsRefresh = timestamp;
    const averages = frameStats.getAverages();
    const segmentCount = countSegmentsForStats();
    statsElement.textContent = [
        `${averages.framesPerSecond.toFixed(0).padStart(4)} fps   objects ${simulation.getSceneObjects().length}   segments ${Number.isNaN(segmentCount) ? "—" : segmentCount}`,
        `CPU ms  update ${averages.updateMilliseconds.toFixed(2)}   render ${averages.renderMilliseconds.toFixed(2)}${rendererMode === "phosphor" && !webglRenderer.isUsingFloatStorage ? "   (8-bit phosphor)" : ""}`,
    ].join("\n");
}

interface BenchmarkRequest {
    readonly mode: RendererMode;
    readonly asteroidCount: number;
    readonly frameCount: number;
    // Reading a pixel forces queued GPU work to finish, but it can also slow down Canvas 2D.
    readonly waitsForGpu: boolean;
}

interface BenchmarkResult {
    readonly mode: RendererMode;
    readonly objectCount: number;
    readonly segmentCount: number;
    readonly updateMilliseconds: number;
    readonly renderSubmitMilliseconds: number;
    readonly renderWithGpuMilliseconds: number;
}

const BENCHMARK_WARMUP_FRAMES = 30;
const FIXED_FRAME_MILLISECONDS = 1000 / 60;
let isBenchmarkRunning = false;

// Renders frames back to back without requestAnimationFrame, so results are valid even in a hidden tab.
function measureFrameCost(request: BenchmarkRequest): BenchmarkResult {
    isBenchmarkRunning = true;
    applyRendererMode(request.mode);
    applyAsteroidCount(request.asteroidCount);
    let totalUpdate = 0;
    let totalSubmit = 0;
    let totalWithGpu = 0;
    for (let frameIndex = 0; frameIndex < BENCHMARK_WARMUP_FRAMES + request.frameCount; frameIndex++) {
        const updateStart = performance.now();
        simulation.advance(FIXED_FRAME_MILLISECONDS / 1000);
        const renderStart = performance.now();
        activeRenderer.render(simulation.getSceneObjects(), FIXED_FRAME_MILLISECONDS);
        const submitEnd = performance.now();
        if (request.waitsForGpu) activeRenderer.waitForDrawingToFinish();
        const gpuEnd = performance.now();
        if (frameIndex < BENCHMARK_WARMUP_FRAMES) continue;
        totalUpdate += renderStart - updateStart;
        totalSubmit += submitEnd - renderStart;
        totalWithGpu += gpuEnd - renderStart;
    }
    isBenchmarkRunning = false;
    return {
        mode: request.mode,
        objectCount: simulation.getSceneObjects().length,
        segmentCount: request.mode === "p5" ? Number.NaN : webglRenderer.segmentCount,
        updateMilliseconds: totalUpdate / request.frameCount,
        renderSubmitMilliseconds: totalSubmit / request.frameCount,
        renderWithGpuMilliseconds: totalWithGpu / request.frameCount,
    };
}

function runFrame(timestamp: number): void {
    const elapsedMilliseconds = timestamp - previousTimestamp;
    previousTimestamp = timestamp;
    if (isBenchmarkRunning) {
        requestAnimationFrame(runFrame);
        return;
    }
    const updateStart = performance.now();
    simulation.advance(elapsedMilliseconds / 1000);
    const renderStart = performance.now();
    activeRenderer.render(simulation.getSceneObjects(), elapsedMilliseconds);
    const renderEnd = performance.now();
    frameStats.record({
        frameIntervalMilliseconds: elapsedMilliseconds,
        updateMilliseconds: renderStart - updateStart,
        renderMilliseconds: renderEnd - renderStart,
    });
    refreshStats(timestamp);
    requestAnimationFrame(runFrame);
}

modeSelect.addEventListener("change", () => applyRendererMode(modeSelect.value as RendererMode));
asteroidCountSelect.addEventListener("change", () => applyAsteroidCount(Number(asteroidCountSelect.value)));
persistenceSlider.addEventListener("input", () => {
    webglRenderer.setPhosphorSettings({ persistenceHalfLifeMilliseconds: Number(persistenceSlider.value) });
});
bloomSlider.addEventListener("input", () => {
    webglRenderer.setPhosphorSettings({ bloomStrength: Number(bloomSlider.value) / 100 });
});
new ResizeObserver(fitRenderersToStage).observe(stageElement);

// Lets a script drive the benchmark, e.g. from the browser console.
Object.assign(window, {
    vectorDisplayBenchmark: {
        setMode: applyRendererMode,
        setAsteroidCount: applyAsteroidCount,
        getAverages: () => ({ ...frameStats.getAverages(), segmentCount: webglRenderer.segmentCount }),
        measureFrameCost,
        setGlowRadiusCssPixels: (glowRadiusCssPixels: number) => webglRenderer.setGlowRadiusCssPixels(glowRadiusCssPixels),
        setPhosphorSettings: (settings: Parameters<WebGLSceneRenderer["setPhosphorSettings"]>[0]) => webglRenderer.setPhosphorSettings(settings),
    },
});

applyRendererMode(rendererMode);
applyAsteroidCount(Number(asteroidCountSelect.value));
fitRenderersToStage();
requestAnimationFrame(runFrame);
