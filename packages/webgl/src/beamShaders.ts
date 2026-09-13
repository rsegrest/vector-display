// Each beam segment is one instance: a quad around the segment, expanded in pixel space.
export const BEAM_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec4 a_segment;
layout(location = 1) in vec4 a_colorIntensity;

uniform vec2 u_worldSize;
uniform vec2 u_targetSize;
uniform float u_quadRadius;

flat out vec2 v_startPixel;
flat out vec2 v_endPixel;
flat out vec4 v_colorIntensity;

vec2 worldToPixel(vec2 worldPosition) {
    vec2 normalized = worldPosition / u_worldSize;
    return vec2(normalized.x, 1.0 - normalized.y) * u_targetSize;
}

void main() {
    vec2 startPixel = worldToPixel(a_segment.xy);
    vec2 endPixel = worldToPixel(a_segment.zw);
    vec2 direction = endPixel - startPixel;
    float segmentLength = length(direction);
    vec2 tangent = segmentLength > 0.0001 ? direction / segmentLength : vec2(1.0, 0.0);
    vec2 normal = vec2(-tangent.y, tangent.x);

    // Triangle strip corners: vertex 0..3 -> (along, across) = (0,-1), (0,1), (1,-1), (1,1).
    float along = float(gl_VertexID / 2);
    float across = float(gl_VertexID % 2) * 2.0 - 1.0;
    vec2 cornerPixel = mix(startPixel, endPixel, along)
        + tangent * (along * 2.0 - 1.0) * u_quadRadius
        + normal * across * u_quadRadius;

    v_startPixel = startPixel;
    v_endPixel = endPixel;
    v_colorIntensity = a_colorIntensity;
    gl_Position = vec4(cornerPixel / u_targetSize * 2.0 - 1.0, 0.0, 1.0);
}
`;

export const BEAM_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform float u_beamHalfWidth;
uniform float u_glowRadius;
uniform float u_glowStrength;
uniform float u_endpointBrightness;

flat in vec2 v_startPixel;
flat in vec2 v_endPixel;
flat in vec4 v_colorIntensity;

out vec4 outColor;

float distanceToSegment(vec2 point) {
    vec2 startToPoint = point - v_startPixel;
    vec2 startToEnd = v_endPixel - v_startPixel;
    float lengthSquared = max(dot(startToEnd, startToEnd), 0.000001);
    float projection = clamp(dot(startToPoint, startToEnd) / lengthSquared, 0.0, 1.0);
    return length(startToPoint - startToEnd * projection);
}

float gaussian(float distanceFromCenter, float radius) {
    return exp(-(distanceFromCenter * distanceFromCenter) / (2.0 * radius * radius));
}

void main() {
    vec2 pixel = gl_FragCoord.xy;
    float distanceFromBeam = distanceToSegment(pixel);
    float coreCoverage = 1.0 - smoothstep(u_beamHalfWidth - 0.5, u_beamHalfWidth + 0.5, distanceFromBeam);
    float glow = u_glowStrength * gaussian(distanceFromBeam, u_glowRadius);

    // The beam dwells at segment endpoints, so real vector monitors drew vertices and dots brighter.
    float distanceFromEndpoint = min(distance(pixel, v_startPixel), distance(pixel, v_endPixel));
    float endpointDwell = u_endpointBrightness * gaussian(distanceFromEndpoint, u_beamHalfWidth * 2.0 + 0.5);

    float brightness = (coreCoverage + glow + endpointDwell) * v_colorIntensity.a;
    outColor = vec4(v_colorIntensity.rgb * brightness, 1.0);
}
`;
