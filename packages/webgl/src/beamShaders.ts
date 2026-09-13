// Each beam segment is one instance: a quad around the segment, expanded in pixel space.
export const BEAM_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec4 a_segment;
layout(location = 1) in vec4 a_neighborPoints;
layout(location = 2) in vec4 a_colorIntensity;
layout(location = 3) in vec2 a_neighborFlags;

uniform vec2 u_worldSize;
uniform vec2 u_targetSize;
uniform float u_quadRadius;

flat out vec2 v_startPixel;
flat out vec2 v_endPixel;
flat out vec2 v_previousStartPixel;
flat out vec2 v_nextEndPixel;
flat out vec2 v_neighborFlags;
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
    v_previousStartPixel = worldToPixel(a_neighborPoints.xy);
    v_nextEndPixel = worldToPixel(a_neighborPoints.zw);
    v_neighborFlags = a_neighborFlags;
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
uniform float u_jointOverlap;

flat in vec2 v_startPixel;
flat in vec2 v_endPixel;
flat in vec2 v_previousStartPixel;
flat in vec2 v_nextEndPixel;
flat in vec2 v_neighborFlags;
flat in vec4 v_colorIntensity;

out vec4 outColor;

float distanceToSegment(vec2 point, vec2 segmentStart, vec2 segmentEnd) {
    vec2 startToPoint = point - segmentStart;
    vec2 startToEnd = segmentEnd - segmentStart;
    float lengthSquared = max(dot(startToEnd, startToEnd), 0.000001);
    float projection = clamp(dot(startToPoint, startToEnd) / lengthSquared, 0.0, 1.0);
    return length(startToPoint - startToEnd * projection);
}

float gaussian(float distanceFromCenter, float radius) {
    return exp(-(distanceFromCenter * distanceFromCenter) / (2.0 * radius * radius));
}

// Near a joint, both connected segments cover the same pixels. The closer segment owns each pixel;
// the other contributes only u_jointOverlap (1 = plain additive overlap, 0 = seamless joint).
// Ties go to the previous segment so exactly one of the pair owns every pixel.
float jointOwnership(vec2 pixel, float distanceFromBeam) {
    bool previousIsCloser = v_neighborFlags.x > 0.5
        && distanceToSegment(pixel, v_previousStartPixel, v_startPixel) <= distanceFromBeam;
    bool nextIsCloser = v_neighborFlags.y > 0.5
        && distanceToSegment(pixel, v_endPixel, v_nextEndPixel) < distanceFromBeam;
    return (previousIsCloser || nextIsCloser) ? u_jointOverlap : 1.0;
}

void main() {
    vec2 pixel = gl_FragCoord.xy;
    float distanceFromBeam = distanceToSegment(pixel, v_startPixel, v_endPixel);
    float coreCoverage = 1.0 - smoothstep(u_beamHalfWidth - 0.5, u_beamHalfWidth + 0.5, distanceFromBeam);
    float glow = u_glowStrength * gaussian(distanceFromBeam, u_glowRadius);

    // The beam dwells at segment endpoints, so real vector monitors drew vertices and dots brighter.
    float distanceFromEndpoint = min(distance(pixel, v_startPixel), distance(pixel, v_endPixel));
    float endpointDwell = u_endpointBrightness * gaussian(distanceFromEndpoint, u_beamHalfWidth * 2.0 + 0.5);

    float brightness = (coreCoverage + glow + endpointDwell) * v_colorIntensity.a * jointOwnership(pixel, distanceFromBeam);
    outColor = vec4(v_colorIntensity.rgb * brightness, 1.0);
}
`;
