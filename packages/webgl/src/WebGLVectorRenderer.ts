import { FLOATS_PER_BEAM_SEGMENT, type DisplayList } from "@rsegrest/vector-display";
import { BEAM_FRAGMENT_SHADER, BEAM_VERTEX_SHADER } from "./beamShaders.js";
import { createShaderProgram } from "./createShaderProgram.js";

// All sizes are in framebuffer pixels (multiply CSS pixels by devicePixelRatio).
export interface LineStyle {
    readonly beamWidth: number;
    readonly glowRadius: number;
    readonly glowStrength: number;
    readonly endpointBrightness: number;
}

export interface WorldSize {
    readonly width: number;
    readonly height: number;
}

export const DEFAULT_LINE_STYLE: LineStyle = {
    beamWidth: 1.5,
    glowRadius: 4,
    glowStrength: 0.25,
    endpointBrightness: 0.6,
};

const BYTES_PER_FLOAT = 4;
const GLOW_EXTENT_IN_RADII = 3;

interface BeamUniformLocations {
    readonly worldSize: WebGLUniformLocation | null;
    readonly targetSize: WebGLUniformLocation | null;
    readonly quadRadius: WebGLUniformLocation | null;
    readonly beamHalfWidth: WebGLUniformLocation | null;
    readonly glowRadius: WebGLUniformLocation | null;
    readonly glowStrength: WebGLUniformLocation | null;
    readonly endpointBrightness: WebGLUniformLocation | null;
}

export class WebGLVectorRenderer {
    public readonly gl: WebGL2RenderingContext;
    private readonly program: WebGLProgram;
    private readonly uniforms: BeamUniformLocations;
    private readonly vertexArray: WebGLVertexArrayObject;
    private readonly segmentBuffer: WebGLBuffer;
    private segmentBufferCapacityBytes = 0;
    private worldSize: WorldSize;
    private lineStyle: LineStyle = DEFAULT_LINE_STYLE;

    constructor(gl: WebGL2RenderingContext, worldSize: WorldSize) {
        this.gl = gl;
        this.worldSize = worldSize;
        this.program = createShaderProgram(gl, {
            vertexSource: BEAM_VERTEX_SHADER,
            fragmentSource: BEAM_FRAGMENT_SHADER,
        });
        this.uniforms = this.findUniformLocations();
        this.segmentBuffer = gl.createBuffer();
        this.vertexArray = this.createSegmentVertexArray();
    }

    public static fromCanvas(canvas: HTMLCanvasElement, worldSize: WorldSize): WebGLVectorRenderer {
        const gl = canvas.getContext("webgl2", {
            alpha: false,
            antialias: false,
            depth: false,
            premultipliedAlpha: false,
        });
        if (!gl) throw new Error("WebGL2 is not available in this browser");
        return new WebGLVectorRenderer(gl, worldSize);
    }

    public setWorldSize(worldSize: WorldSize): void {
        this.worldSize = worldSize;
    }

    public setLineStyle(lineStyle: Partial<LineStyle>): void {
        this.lineStyle = { ...this.lineStyle, ...lineStyle };
    }

    public clear(): void {
        const gl = this.gl;
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
    }

    // Draws additively into the currently bound framebuffer, which must match the drawing buffer size.
    public drawDisplayList(displayList: DisplayList): void {
        const segmentCount = displayList.segmentCount;
        if (segmentCount === 0) return;
        const gl = this.gl;
        this.uploadSegmentData(displayList.getSegmentData());
        gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.enable(gl.BLEND);
        gl.blendEquation(gl.FUNC_ADD);
        gl.blendFunc(gl.ONE, gl.ONE);
        gl.useProgram(this.program);
        this.applyUniforms();
        gl.bindVertexArray(this.vertexArray);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, segmentCount);
        gl.bindVertexArray(null);
    }

    public dispose(): void {
        this.gl.deleteBuffer(this.segmentBuffer);
        this.gl.deleteVertexArray(this.vertexArray);
        this.gl.deleteProgram(this.program);
    }

    private findUniformLocations(): BeamUniformLocations {
        const gl = this.gl;
        const program = this.program;
        return {
            worldSize: gl.getUniformLocation(program, "u_worldSize"),
            targetSize: gl.getUniformLocation(program, "u_targetSize"),
            quadRadius: gl.getUniformLocation(program, "u_quadRadius"),
            beamHalfWidth: gl.getUniformLocation(program, "u_beamHalfWidth"),
            glowRadius: gl.getUniformLocation(program, "u_glowRadius"),
            glowStrength: gl.getUniformLocation(program, "u_glowStrength"),
            endpointBrightness: gl.getUniformLocation(program, "u_endpointBrightness"),
        };
    }

    private createSegmentVertexArray(): WebGLVertexArrayObject {
        const gl = this.gl;
        const vertexArray = gl.createVertexArray();
        const strideBytes = FLOATS_PER_BEAM_SEGMENT * BYTES_PER_FLOAT;
        gl.bindVertexArray(vertexArray);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.segmentBuffer);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, strideBytes, 0);
        gl.vertexAttribDivisor(0, 1);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 4, gl.FLOAT, false, strideBytes, 4 * BYTES_PER_FLOAT);
        gl.vertexAttribDivisor(1, 1);
        gl.bindVertexArray(null);
        return vertexArray;
    }

    private uploadSegmentData(segmentData: Float32Array): void {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.segmentBuffer);
        if (segmentData.byteLength > this.segmentBufferCapacityBytes) {
            this.segmentBufferCapacityBytes = segmentData.byteLength * 2;
            gl.bufferData(gl.ARRAY_BUFFER, this.segmentBufferCapacityBytes, gl.DYNAMIC_DRAW);
        }
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, segmentData);
    }

    private applyUniforms(): void {
        const gl = this.gl;
        const { beamWidth, glowRadius, glowStrength, endpointBrightness } = this.lineStyle;
        const beamHalfWidth = beamWidth / 2;
        gl.uniform2f(this.uniforms.worldSize, this.worldSize.width, this.worldSize.height);
        gl.uniform2f(this.uniforms.targetSize, gl.drawingBufferWidth, gl.drawingBufferHeight);
        gl.uniform1f(this.uniforms.quadRadius, beamHalfWidth + glowRadius * GLOW_EXTENT_IN_RADII + 1);
        gl.uniform1f(this.uniforms.beamHalfWidth, beamHalfWidth);
        gl.uniform1f(this.uniforms.glowRadius, glowRadius);
        gl.uniform1f(this.uniforms.glowStrength, glowStrength);
        gl.uniform1f(this.uniforms.endpointBrightness, endpointBrightness);
    }
}

export default WebGLVectorRenderer;
