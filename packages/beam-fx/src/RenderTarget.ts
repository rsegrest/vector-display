export interface RenderTargetSpec {
    readonly width: number;
    readonly height: number;
    readonly usesFloatStorage: boolean;
}

export class RenderTarget {
    public readonly texture: WebGLTexture;
    public readonly framebuffer: WebGLFramebuffer;
    public readonly width: number;
    public readonly height: number;
    private readonly gl: WebGL2RenderingContext;

    constructor(gl: WebGL2RenderingContext, spec: RenderTargetSpec) {
        this.gl = gl;
        this.width = spec.width;
        this.height = spec.height;
        this.texture = createTargetTexture(gl, spec);
        this.framebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texture, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    public bindForDrawing(): void {
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.framebuffer);
        this.gl.viewport(0, 0, this.width, this.height);
    }

    public dispose(): void {
        this.gl.deleteFramebuffer(this.framebuffer);
        this.gl.deleteTexture(this.texture);
    }
}

function createTargetTexture(gl: WebGL2RenderingContext, spec: RenderTargetSpec): WebGLTexture {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    const internalFormat = spec.usesFloatStorage ? gl.RGBA16F : gl.RGBA8;
    const dataType = spec.usesFloatStorage ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, spec.width, spec.height, 0, gl.RGBA, dataType, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return texture;
}

export default RenderTarget;
