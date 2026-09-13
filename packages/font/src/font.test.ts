import { DisplayList, FLOATS_PER_BEAM_SEGMENT } from "@rsegrest/vector-display";
import { describe, expect, it } from "vitest";
import { ARCADE_FONT_METRICS, ARCADE_GLYPHS, VectorFont } from "./index.js";

const MAXIMUM_DESCENDER_UNITS = 1;

function readSegmentEndpoints(displayList: DisplayList): number[][] {
    const data = displayList.getSegmentData();
    const segments = [];
    for (let index = 0; index < data.length; index += FLOATS_PER_BEAM_SEGMENT) {
        segments.push(Array.from(data.slice(index, index + 4)));
    }
    return segments;
}

function findMinimumX(displayList: DisplayList): number {
    return Math.min(...readSegmentEndpoints(displayList).flatMap(([x0, , x1]) => [x0, x1]));
}

describe("arcade glyphs", () => {
    it("covers every uppercase letter and digit", () => {
        const font = VectorFont.createArcadeFont();
        const required = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        const missing = Array.from(required).filter((character) => !font.hasGlyph(character));
        expect(missing).toEqual([]);
    });

    it("keeps every glyph inside its grid cell", () => {
        const { glyphWidth, capHeight } = ARCADE_FONT_METRICS;
        for (const [character, polylines] of Object.entries(ARCADE_GLYPHS)) {
            for (const point of polylines.flatMap((polyline) => polyline.points)) {
                expect(point.x, `glyph "${character}" x`).toBeGreaterThanOrEqual(0);
                expect(point.x, `glyph "${character}" x`).toBeLessThanOrEqual(glyphWidth);
                expect(point.y, `glyph "${character}" y`).toBeGreaterThanOrEqual(0);
                expect(point.y, `glyph "${character}" y`).toBeLessThanOrEqual(capHeight + MAXIMUM_DESCENDER_UNITS);
            }
        }
    });

    it("draws digits differently from the letters they resemble", () => {
        const font = VectorFont.createArcadeFont();
        for (const [digit, letter] of [["0", "O"], ["1", "I"], ["2", "Z"], ["5", "S"], ["6", "G"], ["8", "B"]]) {
            const digitCoordinates = Array.from(font.findGlyph(digit)!.segmentCoordinates);
            const letterCoordinates = Array.from(font.findGlyph(letter)!.segmentCoordinates);
            expect(digitCoordinates, `${digit} vs ${letter}`).not.toEqual(letterCoordinates);
        }
    });
});

describe("VectorFont", () => {
    const font = VectorFont.createArcadeFont();

    it("measures monospaced lines and multi-line height in world units", () => {
        // "ABC": 3 glyphs of 4 units + 2 gaps of 2 units = 16 units; size 12 doubles the 6-unit cap height.
        expect(font.measureText("ABC", 12)).toEqual({ width: 32, height: 12 });
        expect(font.measureText("AB\nC", 6)).toEqual({ width: 10, height: 16 });
    });

    it("places each glyph at its column, scaled to the requested size", () => {
        const displayList = new DisplayList();
        font.addText(displayList, { text: "II", x: 100, y: 50, size: 12 });
        const segments = readSegmentEndpoints(displayList);
        expect(segments).toHaveLength(6);
        expect(segments[0]).toEqual([100, 50, 108, 50]);
        expect(segments[3]).toEqual([112, 50, 120, 50]);
    });

    it("offsets centered and right-aligned lines by their width", () => {
        const centered = new DisplayList();
        font.addText(centered, { text: "II", x: 100, y: 0, size: 6, alignment: "center" });
        expect(findMinimumX(centered)).toBe(95);
        const rightAligned = new DisplayList();
        font.addText(rightAligned, { text: "II", x: 100, y: 0, size: 6, alignment: "right" });
        expect(findMinimumX(rightAligned)).toBe(90);
    });

    it("uses uppercase glyphs for lowercase letters", () => {
        const lowercase = new DisplayList();
        const uppercase = new DisplayList();
        font.addText(lowercase, { text: "score", x: 0, y: 0, size: 6 });
        font.addText(uppercase, { text: "SCORE", x: 0, y: 0, size: 6 });
        expect(Array.from(lowercase.getSegmentData())).toEqual(Array.from(uppercase.getSegmentData()));
    });

    it("skips unknown characters and spaces but keeps their column", () => {
        const displayList = new DisplayList();
        font.addText(displayList, { text: "~ I", x: 0, y: 0, size: 6 });
        expect(findMinimumX(displayList)).toBe(12);
    });

    it("starts each new line below the previous one", () => {
        const displayList = new DisplayList();
        font.addText(displayList, { text: "I\nI", x: 0, y: 0, size: 6 });
        const segments = readSegmentEndpoints(displayList);
        expect(segments[3]).toEqual([0, 10, 4, 10]);
    });

    it("rotates the whole run around its anchor", () => {
        const displayList = new DisplayList();
        font.addText(displayList, { text: "II", x: 0, y: 0, size: 6, rotation: Math.PI / 2 });
        const [startX, startY] = readSegmentEndpoints(displayList)[3];
        expect(startX).toBeCloseTo(0);
        expect(startY).toBeCloseTo(6);
    });
});
