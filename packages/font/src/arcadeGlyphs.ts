import type { Polyline } from "@rsegrest/vector-display";
import type { FontMetrics, GlyphTable } from "./fontTypes.js";

// Original stroke designs in the style of late-1970s Atari vector games: uppercase only,
// straight strokes on a 4-wide by 6-tall grid (y down, cap line at 0, baseline at 6).
export const ARCADE_FONT_METRICS: FontMetrics = {
    glyphWidth: 4,
    capHeight: 6,
    letterSpacing: 2,
    lineSpacing: 4,
};

function open(...coordinatePairs: number[]): Polyline {
    return { points: toPoints(coordinatePairs), isClosed: false };
}

function closed(...coordinatePairs: number[]): Polyline {
    return { points: toPoints(coordinatePairs), isClosed: true };
}

function dot(x: number, y: number): Polyline {
    return { points: [{ x, y }], isClosed: false };
}

function toPoints(coordinatePairs: readonly number[]): { x: number; y: number }[] {
    const points = [];
    for (let index = 0; index < coordinatePairs.length; index += 2) {
        points.push({ x: coordinatePairs[index], y: coordinatePairs[index + 1] });
    }
    return points;
}

export const ARCADE_GLYPHS: GlyphTable = {
    " ": [],

    A: [open(0, 6, 0, 2, 2, 0, 4, 2, 4, 6), open(0, 4, 4, 4)],
    B: [open(0, 3, 0, 0, 3, 0, 4, 1, 4, 2, 3, 3, 0, 3), open(3, 3, 4, 4, 4, 5, 3, 6, 0, 6, 0, 3)],
    C: [open(4, 0, 0, 0, 0, 6, 4, 6)],
    D: [closed(0, 0, 2, 0, 4, 2, 4, 4, 2, 6, 0, 6)],
    E: [open(4, 0, 0, 0, 0, 6, 4, 6), open(0, 3, 3, 3)],
    F: [open(4, 0, 0, 0, 0, 6), open(0, 3, 3, 3)],
    G: [open(4, 1, 4, 0, 0, 0, 0, 6, 4, 6, 4, 3, 2, 3)],
    H: [open(0, 0, 0, 6), open(4, 0, 4, 6), open(0, 3, 4, 3)],
    I: [open(0, 0, 4, 0), open(2, 0, 2, 6), open(0, 6, 4, 6)],
    J: [open(4, 0, 4, 6, 1, 6, 0, 5, 0, 4)],
    K: [open(0, 0, 0, 6), open(4, 0, 0, 3, 4, 6)],
    L: [open(0, 0, 0, 6, 4, 6)],
    M: [open(0, 6, 0, 0, 2, 2, 4, 0, 4, 6)],
    N: [open(0, 6, 0, 0, 4, 6, 4, 0)],
    O: [closed(0, 0, 4, 0, 4, 6, 0, 6)],
    P: [open(0, 6, 0, 0, 4, 0, 4, 3, 0, 3)],
    Q: [closed(0, 0, 4, 0, 4, 4, 2, 6, 0, 6), open(2, 4, 4, 6)],
    R: [open(0, 6, 0, 0, 4, 0, 4, 3, 0, 3), open(1, 3, 4, 6)],
    S: [open(4, 0, 0, 0, 0, 3, 4, 3, 4, 6, 0, 6)],
    T: [open(0, 0, 4, 0), open(2, 0, 2, 6)],
    U: [open(0, 0, 0, 6, 4, 6, 4, 0)],
    V: [open(0, 0, 2, 6, 4, 0)],
    W: [open(0, 0, 0, 6, 2, 4, 4, 6, 4, 0)],
    X: [open(0, 0, 4, 6), open(4, 0, 0, 6)],
    Y: [open(0, 0, 2, 2, 4, 0), open(2, 2, 2, 6)],
    Z: [open(0, 0, 4, 0, 0, 6, 4, 6)],

    // A slash keeps zero distinct from the letter O.
    "0": [closed(0, 0, 4, 0, 4, 6, 0, 6), open(0, 6, 4, 0)],
    "1": [open(1, 1, 2, 0, 2, 6), open(1, 6, 3, 6)],
    "2": [open(0, 0, 4, 0, 4, 3, 0, 3, 0, 6, 4, 6)],
    "3": [open(0, 0, 4, 0, 4, 6, 0, 6), open(1, 3, 4, 3)],
    "4": [open(0, 0, 0, 3, 4, 3), open(4, 0, 4, 6)],
    "5": [open(4, 0, 0, 0, 0, 3, 3, 3, 4, 4, 4, 5, 3, 6, 0, 6)],
    "6": [open(4, 0, 0, 0, 0, 6, 4, 6, 4, 3, 0, 3)],
    "7": [open(0, 0, 4, 0, 4, 6)],
    "8": [closed(0, 0, 4, 0, 4, 6, 0, 6), open(0, 3, 4, 3)],
    "9": [open(4, 3, 0, 3, 0, 0, 4, 0, 4, 6, 0, 6)],

    ".": [dot(2, 6)],
    ",": [open(2, 5, 1, 7)],
    ":": [dot(2, 1.5), dot(2, 4.5)],
    ";": [dot(2, 1.5), open(2, 4.5, 1, 6.5)],
    "!": [open(2, 0, 2, 4), dot(2, 6)],
    "?": [open(0, 1, 0, 0, 4, 0, 4, 3, 2, 3, 2, 4), dot(2, 6)],
    "'": [open(2, 0, 2, 2)],
    '"': [open(1, 0, 1, 2), open(3, 0, 3, 2)],
    "-": [open(0, 3, 4, 3)],
    "+": [open(2, 1, 2, 5), open(0, 3, 4, 3)],
    "=": [open(0, 2, 4, 2), open(0, 4, 4, 4)],
    "*": [open(2, 1, 2, 5), open(0, 2, 4, 4), open(0, 4, 4, 2)],
    "/": [open(0, 6, 4, 0)],
    "_": [open(0, 6, 4, 6)],
    "<": [open(4, 0, 0, 3, 4, 6)],
    ">": [open(0, 0, 4, 3, 0, 6)],
    "(": [open(3, 0, 1, 2, 1, 4, 3, 6)],
    ")": [open(1, 0, 3, 2, 3, 4, 1, 6)],
    "#": [open(1, 0, 1, 6), open(3, 0, 3, 6), open(0, 2, 4, 2), open(0, 4, 4, 4)],
    "%": [open(0, 6, 4, 0), dot(0.5, 0.5), dot(3.5, 5.5)],
    // Escaped so the key still matches when a page loads this script without a UTF-8 charset.
    "\u00A9": [closed(1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1), open(2.75, 2.25, 1.25, 2.25, 1.25, 3.75, 2.75, 3.75)],
};
