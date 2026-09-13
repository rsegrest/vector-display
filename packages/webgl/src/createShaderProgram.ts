export interface ShaderSources {
    readonly vertexSource: string;
    readonly fragmentSource: string;
}

interface ShaderStage {
    readonly shaderType: GLenum;
    readonly source: string;
}

export function createShaderProgram(gl: WebGL2RenderingContext, sources: ShaderSources): WebGLProgram {
    const vertexShader = compileShader(gl, { shaderType: gl.VERTEX_SHADER, source: sources.vertexSource });
    const fragmentShader = compileShader(gl, { shaderType: gl.FRAGMENT_SHADER, source: sources.fragmentSource });
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        const log = gl.getProgramInfoLog(program);
        gl.deleteProgram(program);
        throw new Error(`Failed to link shader program: ${log}`);
    }
    return program;
}

function compileShader(gl: WebGL2RenderingContext, stage: ShaderStage): WebGLShader {
    const shader = gl.createShader(stage.shaderType);
    if (!shader) throw new Error("Failed to create shader");
    gl.shaderSource(shader, stage.source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Failed to compile shader: ${log}`);
    }
    return shader;
}
