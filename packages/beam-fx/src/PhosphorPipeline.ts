import type { DisplayList } from "@rsegrest/vector-display";
import type { WebGLVectorRenderer } from "@rsegrest/vector-display-webgl";
import { BLUR_FRAGMENT_SHADER, COMPOSITE_FRAGMENT_SHADER, PERSISTENCE_FRAGMENT_SHADER } from "./effectShaders.js";
import { FlickerGenerator } from "./FlickerGenerator.js";
import { FullscreenPass } from "./FullscreenPass.js";
import { RenderTarget } from "./RenderTarget.js";

export interface PhosphorSettings {
    // Time for a trail to fade to half brightness.
    readonly persistenceHalfLifeMilliseconds: number;
    readonly bloomStrength: number;
    readonly bloomBlurIterations: number;
    readonly exposure: number;
    // Deepest brightness dip as a fraction of the displayed image: 0 disables flicker, 0.3 dims by up to 30%.
    // Strong full-screen flicker around 3–30 Hz can trigger photosensitive seizures; keep it subtle by default.
    readonly flickerAmount: number;
    // How often the flicker moves to a new random brightness level.
    readonly flickerFrequencyHz: number;
}

export const DEFAULT_PHOSPHOR_SETTINGS: PhosphorSettings = {
    persistenceHalfLifeMilliseconds: 40,
    bloomStrength: 1.2,
    bloomBlurIterations: 2,
    exposure: 1.6,
    flickerAmount: 0.08,
    flickerFrequencyHz: 15,
};

const MAXIMUM_FRAME_GAP_MILLISECONDS = 100;
// 8-bit targets can't store tiny values, so without a floor faint trails would never fully fade.
const EIGHT_BIT_DECAY_FLOOR = 1.5 / 255;

interface TargetSize {
    readonly width: number;
    readonly height: number;
}

export class PhosphorPipeline {
    private readonly gl: WebGL2RenderingContext;
    private readonly renderer: WebGLVectorRenderer;
    private readonly usesFloatStorage: boolean;
    private readonly persistencePass: FullscreenPass;
    private readonly blurPass: FullscreenPass;
    private readonly compositePass: FullscreenPass;
    private readonly flickerGenerator = new FlickerGenerator();
    private settings: PhosphorSettings = DEFAULT_PHOSPHOR_SETTINGS;
    private latestPhosphor: RenderTarget | null = null;
    private scratchPhosphor: RenderTarget | null = null;
    private currentBeams: RenderTarget | null = null;
    private bloomTargets: [RenderTarget, RenderTarget] | null = null;

    constructor(renderer: WebGLVectorRenderer, settings: Partial<PhosphorSettings> = {}) {
        this.renderer = renderer;
        this.gl = renderer.gl;
        this.usesFloatStorage = this.gl.getExtension("EXT_color_buffer_float") !== null;
        this.persistencePass = new FullscreenPass(this.gl, PERSISTENCE_FRAGMENT_SHADER);
        this.blurPass = new FullscreenPass(this.gl, BLUR_FRAGMENT_SHADER);
        this.compositePass = new FullscreenPass(this.gl, COMPOSITE_FRAGMENT_SHADER);
        this.setSettings(settings);
    }

    public get isUsingFloatStorage(): boolean {
        return this.usesFloatStorage;
    }

    public setSettings(settings: Partial<PhosphorSettings>): void {
        this.settings = { ...this.settings, ...settings };
    }

    public renderFrame(displayList: DisplayList, elapsedMilliseconds: number): void {
        const frameMilliseconds = Math.min(Math.max(elapsedMilliseconds, 0), MAXIMUM_FRAME_GAP_MILLISECONDS);
        this.resizeTargetsToDrawingBuffer();
        this.drawBeamsIntoCurrentFrame(displayList);
        this.combineWithFadedPreviousFrame(frameMilliseconds);
        this.blurIntoBloom();
        this.compositeToCanvas(this.calculateFlickerBrightness(frameMilliseconds));
    }

    public dispose(): void {
        this.disposeTargets();
        this.persistencePass.dispose();
        this.blurPass.dispose();
        this.compositePass.dispose();
    }

    private resizeTargetsToDrawingBuffer(): void {
        const width = this.gl.drawingBufferWidth;
        const height = this.gl.drawingBufferHeight;
        if (this.latestPhosphor?.width === width && this.latestPhosphor.height === height) return;
        this.disposeTargets();
        this.latestPhosphor = this.createTarget({ width, height });
        this.scratchPhosphor = this.createTarget({ width, height });
        this.currentBeams = this.createTarget({ width, height });
        const bloomSize = { width: Math.max(1, width >> 1), height: Math.max(1, height >> 1) };
        this.bloomTargets = [this.createTarget(bloomSize), this.createTarget(bloomSize)];
    }

    private createTarget(size: TargetSize): RenderTarget {
        return new RenderTarget(this.gl, { ...size, usesFloatStorage: this.usesFloatStorage });
    }

    private drawBeamsIntoCurrentFrame(displayList: DisplayList): void {
        const gl = this.gl;
        this.currentBeams!.bindForDrawing();
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        this.renderer.drawDisplayList(displayList);
    }

    // Keeps the brighter of this frame's beams and the faded trail. Adding them instead would make anything that
    // stays still build up to 1 / (1 - decay) times its brightness, which grows with refresh rate and persistence.
    private combineWithFadedPreviousFrame(frameMilliseconds: number): void {
        const gl = this.gl;
        const previous = this.latestPhosphor!;
        const next = this.scratchPhosphor!;
        const decay = Math.pow(0.5, frameMilliseconds / this.settings.persistenceHalfLifeMilliseconds);
        next.bindForDrawing();
        gl.disable(gl.BLEND);
        this.persistencePass.use();
        this.bindTexture(previous.texture, 0);
        this.bindTexture(this.currentBeams!.texture, 1);
        gl.uniform1i(this.persistencePass.getUniformLocation("u_previousFrame"), 0);
        gl.uniform1i(this.persistencePass.getUniformLocation("u_currentBeams"), 1);
        gl.uniform1f(this.persistencePass.getUniformLocation("u_decay"), decay);
        gl.uniform1f(this.persistencePass.getUniformLocation("u_decayFloor"), this.usesFloatStorage ? 0 : EIGHT_BIT_DECAY_FLOOR);
        this.persistencePass.draw();
        this.bindTexture(null, 1);
        this.latestPhosphor = next;
        this.scratchPhosphor = previous;
    }

    private blurIntoBloom(): void {
        const gl = this.gl;
        const [horizontalTarget, verticalTarget] = this.bloomTargets!;
        gl.disable(gl.BLEND);
        this.blurPass.use();
        gl.uniform1i(this.blurPass.getUniformLocation("u_source"), 0);
        let sourceTexture = this.latestPhosphor!.texture;
        for (let iteration = 0; iteration < this.settings.bloomBlurIterations; iteration++) {
            this.runBlurStep(sourceTexture, { target: horizontalTarget, isHorizontal: true });
            this.runBlurStep(horizontalTarget.texture, { target: verticalTarget, isHorizontal: false });
            sourceTexture = verticalTarget.texture;
        }
    }

    private runBlurStep(sourceTexture: WebGLTexture, step: { target: RenderTarget; isHorizontal: boolean }): void {
        const { target, isHorizontal } = step;
        target.bindForDrawing();
        this.bindTexture(sourceTexture, 0);
        const texelStepX = isHorizontal ? 1 / target.width : 0;
        const texelStepY = isHorizontal ? 0 : 1 / target.height;
        this.gl.uniform2f(this.blurPass.getUniformLocation("u_texelStep"), texelStepX, texelStepY);
        this.blurPass.draw();
    }

    private calculateFlickerBrightness(frameMilliseconds: number): number {
        const flickerLevel = this.flickerGenerator.advance(frameMilliseconds, this.settings.flickerFrequencyHz);
        const flickerDepth = Math.min(Math.max(this.settings.flickerAmount, 0), 1);
        return 1 - flickerDepth * flickerLevel;
    }

    private compositeToCanvas(flickerBrightness: number): void {
        const gl = this.gl;
        const hasBloom = this.settings.bloomBlurIterations > 0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.disable(gl.BLEND);
        this.compositePass.use();
        this.bindTexture(this.latestPhosphor!.texture, 0);
        this.bindTexture(this.bloomTargets![1].texture, 1);
        gl.uniform1i(this.compositePass.getUniformLocation("u_phosphor"), 0);
        gl.uniform1i(this.compositePass.getUniformLocation("u_bloom"), 1);
        gl.uniform1f(this.compositePass.getUniformLocation("u_bloomStrength"), hasBloom ? this.settings.bloomStrength : 0);
        gl.uniform1f(this.compositePass.getUniformLocation("u_exposure"), this.settings.exposure);
        gl.uniform1f(this.compositePass.getUniformLocation("u_flickerBrightness"), flickerBrightness);
        this.compositePass.draw();
        this.bindTexture(null, 1);
        this.bindTexture(null, 0);
    }

    private bindTexture(texture: WebGLTexture | null, textureUnit: number): void {
        this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
    }

    private disposeTargets(): void {
        this.latestPhosphor?.dispose();
        this.scratchPhosphor?.dispose();
        this.currentBeams?.dispose();
        this.bloomTargets?.forEach((target) => target.dispose());
        this.latestPhosphor = null;
        this.scratchPhosphor = null;
        this.currentBeams = null;
        this.bloomTargets = null;
    }
}

export default PhosphorPipeline;
