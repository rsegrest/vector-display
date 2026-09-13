import { createShaderProgram } from "@rsegrest/vector-display-webgl";

// One oversized triangle generated from gl_VertexID, so no vertex buffer is needed.
const FULLSCREEN_VERTEX_SHADER = `#version 300 es
out vec2 v_textureCoordinate;
void main() {
    vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
    v_textureCoordinate = position;
    gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`;

export class FullscreenPass {
    public readonly program: WebGLProgram;
    private readonly gl: WebGL2RenderingContext;
    private readonly emptyVertexArray: WebGLVertexArrayObject;
    private readonly uniformLocations = new Map<string, WebGLUniformLocation | null>();

    constructor(gl: WebGL2RenderingContext, fragmentSource: string) {
        this.gl = gl;
        this.program = createShaderProgram(gl, { vertexSource: FULLSCREEN_VERTEX_SHADER, fragmentSource });
        this.emptyVertexArray = gl.createVertexArray();
    }

    public use(): void {
        this.gl.useProgram(this.program);
    }

    public getUniformLocation(uniformName: string): WebGLUniformLocation | null {
        if (!this.uniformLocations.has(uniformName)) {
            this.uniformLocations.set(uniformName, this.gl.getUniformLocation(this.program, uniformName));
        }
        return this.uniformLocations.get(uniformName) ?? null;
    }

    public draw(): void {
        const gl = this.gl;
        gl.bindVertexArray(this.emptyVertexArray);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.bindVertexArray(null);
    }

    public dispose(): void {
        this.gl.deleteVertexArray(this.emptyVertexArray);
        this.gl.deleteProgram(this.program);
    }
}

export default FullscreenPass;
