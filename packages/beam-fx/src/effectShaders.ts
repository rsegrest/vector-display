export const PERSISTENCE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_previousFrame;
uniform sampler2D u_currentBeams;
uniform float u_decay;
uniform float u_decayFloor;
in vec2 v_textureCoordinate;
out vec4 outColor;
void main() {
    vec3 fadedTrail = max(texture(u_previousFrame, v_textureCoordinate).rgb * u_decay - u_decayFloor, 0.0);
    vec3 currentBeams = texture(u_currentBeams, v_textureCoordinate).rgb;
    outColor = vec4(max(fadedTrail, currentBeams), 1.0);
}
`;

// 9-tap Gaussian blur using 5 bilinear samples.
export const BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_texelStep;
in vec2 v_textureCoordinate;
out vec4 outColor;
void main() {
    vec3 color = texture(u_source, v_textureCoordinate).rgb * 0.2270270270;
    color += texture(u_source, v_textureCoordinate + u_texelStep * 1.3846153846).rgb * 0.3162162162;
    color += texture(u_source, v_textureCoordinate - u_texelStep * 1.3846153846).rgb * 0.3162162162;
    color += texture(u_source, v_textureCoordinate + u_texelStep * 3.2307692308).rgb * 0.0702702703;
    color += texture(u_source, v_textureCoordinate - u_texelStep * 3.2307692308).rgb * 0.0702702703;
    outColor = vec4(color, 1.0);
}
`;

export const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_phosphor;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
uniform float u_exposure;
uniform float u_flickerBrightness;
in vec2 v_textureCoordinate;
out vec4 outColor;
void main() {
    vec3 color = texture(u_phosphor, v_textureCoordinate).rgb
        + texture(u_bloom, v_textureCoordinate).rgb * u_bloomStrength;
    // Flicker scales the tone-mapped result, so its depth matches what the viewer sees.
    outColor = vec4((1.0 - exp(-color * u_exposure)) * u_flickerBrightness, 1.0);
}
`;
