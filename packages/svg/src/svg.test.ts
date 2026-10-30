import { describe, expect, it } from "vitest";
import { fitDrawing, parseColor, readSvg, shapesByColor } from "./index.js";
import { flattenPathData } from "./pathData.js";
import { applyToPoint, parseTransform } from "./svgTransform.js";
import { parseXmlElements } from "./xmlElements.js";

const svg = (body: string, attributes = 'viewBox="0 0 100 100"'): string => `<svg xmlns="http://www.w3.org/2000/svg" ${attributes}>${body}</svg>`;
const near = (actual: number, expected: number, within = 1e-6): void => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(within);

describe("the XML reader", () => {
    it("keeps elements and attributes, and skips declarations, comments and CDATA", () => {
        const document = parseXmlElements(
            `<?xml version="1.0"?><!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x" [<!ENTITY a "b">]>
             <!-- a <path> in a comment --><svg:svg><g id='one' data-x="a &amp; b &#65;&#x42;"><![CDATA[<path/>]]><path d="M0 0"/></g></svg:svg>`,
        );
        const root = document.children[0];
        expect(root.name).toBe("svg");
        const group = root.children[0];
        expect(group.attributes.get("id")).toBe("one");
        expect(group.attributes.get("data-x")).toBe("a & b AB");
        expect(group.children.map((child) => child.name)).toEqual(["path"]);
    });
});

describe("colors", () => {
    it("reads keywords, hex forms, rgb() and hsl()", () => {
        expect(parseColor("orange")).toEqual({ red: 1, green: 165 / 255, blue: 0 });
        expect(parseColor("#f00")).toEqual({ red: 1, green: 0, blue: 0 });
        expect(parseColor("#00ff0080")).toEqual({ red: 0, green: 1, blue: 0 });
        expect(parseColor("rgb(0, 0, 255)")).toEqual({ red: 0, green: 0, blue: 1 });
        expect(parseColor("rgb(100% 50% 0%)")).toEqual({ red: 1, green: 0.5, blue: 0 });
        const green = parseColor("hsl(120, 100%, 50%)")!;
        near(green.red, 0);
        near(green.green, 1);
        near(green.blue, 0);
        expect(parseColor("no-such-color")).toBeUndefined();
    });
});

describe("transforms", () => {
    it("applies the listed functions right to left, as SVG does", () => {
        const matrix = parseTransform("translate(10, 20) scale(2)");
        expect(applyToPoint(matrix, 1, 1)).toEqual({ x: 12, y: 22 });
        const turned = applyToPoint(parseTransform("rotate(90)"), 1, 0);
        near(turned.x, 0);
        near(turned.y, 1);
        const aboutCenter = applyToPoint(parseTransform("rotate(180 5 5)"), 0, 0);
        near(aboutCenter.x, 10);
        near(aboutCenter.y, 10);
        expect(applyToPoint(parseTransform("matrix(1 0 0 1 3 4)"), 0, 0)).toEqual({ x: 3, y: 4 });
    });
});

describe("path data", () => {
    it("reads moves, lines and closes, absolute and relative, and implicit linetos", () => {
        const [first, second] = flattenPathData("M10 10 20 10 l0 10 h-10 z m5 5 H30 V40", 0.1);
        expect(first.points).toEqual([
            { x: 10, y: 10 },
            { x: 20, y: 10 },
            { x: 20, y: 20 },
            { x: 10, y: 20 },
        ]);
        expect(first.isClosed).toBe(true);
        // After a close the current point is the subpath's start, so m5 5 moves from (10, 10).
        expect(second.points).toEqual([
            { x: 15, y: 15 },
            { x: 30, y: 15 },
            { x: 30, y: 40 },
        ]);
        expect(second.isClosed).toBe(false);
    });

    it("reads numbers that run together", () => {
        const [line] = flattenPathData("M1.5.5L-1-2e1", 0.1);
        expect(line.points).toEqual([
            { x: 1.5, y: 0.5 },
            { x: -1, y: -20 },
        ]);
    });

    it("flattens a cubic curve to within the tolerance", () => {
        const tolerance = 0.05;
        const [curve] = flattenPathData("M0 0 C 0 100 100 100 100 0", tolerance);
        expect(curve.points[0]).toEqual({ x: 0, y: 0 });
        expect(curve.points.at(-1)).toEqual({ x: 100, y: 0 });
        // Every point lies on the curve; between points the chord stays within tolerance
        // (checked at each chord's middle against the curve's nearest sample).
        const samples = Array.from({ length: 2001 }, (_, index) => {
            const t = index / 2000;
            const u = 1 - t;
            return { x: 3 * u * t * t * 100 + t * t * t * 100, y: 3 * u * u * t * 100 + 3 * u * t * t * 100 };
        });
        const distanceToCurve = (x: number, y: number): number => Math.min(...samples.map((sample) => Math.hypot(sample.x - x, sample.y - y)));
        for (let index = 1; index < curve.points.length; index++) {
            const a = curve.points[index - 1];
            const b = curve.points[index];
            expect(distanceToCurve((a.x + b.x) / 2, (a.y + b.y) / 2)).toBeLessThan(tolerance + 0.1);
        }
        expect(curve.points.length).toBeGreaterThan(10);
    });

    it("reflects the previous control point for S and T", () => {
        const smooth = flattenPathData("M0 0 C 0 10 10 10 10 0 S 20 -10 20 0", 0.01)[0];
        const explicit = flattenPathData("M0 0 C 0 10 10 10 10 0 C 10 -10 20 -10 20 0", 0.01)[0];
        expect(smooth.points).toEqual(explicit.points);
        const quadraticSmooth = flattenPathData("M0 0 Q 5 10 10 0 T 20 0", 0.01)[0];
        const quadraticExplicit = flattenPathData("M0 0 Q 5 10 10 0 Q 15 -10 20 0", 0.01)[0];
        expect(quadraticSmooth.points).toEqual(quadraticExplicit.points);
    });

    it("draws arcs on the right circle, in the right direction, ending exactly", () => {
        // A half circle of radius 10 from (0, 0) to (20, 0), sweeping clockwise on screen (y down):
        // through the top, (10, -10).
        const [arc] = flattenPathData("M0 0 A 10 10 0 0 1 20 0", 0.01);
        expect(arc.points.at(-1)).toEqual({ x: 20, y: 0 });
        for (const point of arc.points) near(Math.hypot(point.x - 10, point.y), 10, 1e-9);
        expect(Math.min(...arc.points.map((point) => point.y))).toBeLessThan(-9.9);
        // Radii too small to reach are enlarged to the smallest that does: the same half circle.
        const [enlarged] = flattenPathData("M0 0 a 1 1 0 0 1 20 0", 0.01);
        for (const point of enlarged.points) near(Math.hypot(point.x - 10, point.y), 10, 1e-9);
    });

    it("stops at what it cannot read rather than throwing", () => {
        expect(flattenPathData("M0 0 L 10", 0.1)[0].points).toEqual([{ x: 0, y: 0 }]);
        expect(flattenPathData("", 0.1)).toEqual([]);
    });
});

describe("readSvg", () => {
    it("reads the basic shapes", () => {
        const drawing = readSvg(
            svg(`<line x1="0" y1="0" x2="10" y2="10" stroke="red"/>
                 <polyline points="0,0 10,0 10,10" stroke="red"/>
                 <polygon points="0 0 10 0 10 10" stroke="red"/>
                 <rect x="10" y="10" width="20" height="10" stroke="red"/>
                 <circle cx="50" cy="50" r="10" stroke="red"/>
                 <ellipse cx="50" cy="50" rx="20" ry="5" stroke="red"/>`),
        );
        const [line, polyline, polygon, rect, circle, ellipse] = drawing.polylines;
        expect(line.points).toHaveLength(2);
        expect([polyline.isClosed, polygon.isClosed]).toEqual([false, true]);
        expect(rect.points).toEqual([
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 30, y: 20 },
            { x: 10, y: 20 },
        ]);
        for (const point of circle.points) near(Math.hypot(point.x - 50, point.y - 50), 10, 1e-9);
        for (const point of ellipse.points) near(((point.x - 50) / 20) ** 2 + ((point.y - 50) / 5) ** 2, 1, 1e-9);
        expect(circle.isClosed).toBe(true);
    });

    it("rounds a rectangle's corners, with one radius setting both", () => {
        const [rounded] = readSvg(svg(`<rect x="0" y="0" width="40" height="20" rx="5" stroke="white"/>`)).polylines;
        const xs = rounded.points.map((point) => point.x);
        const ys = rounded.points.map((point) => point.y);
        expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([0, 40, 0, 20]);
        // No corner point: the corners are cut by quarter circles of radius 5.
        expect(rounded.points.some((point) => point.x === 0 && point.y === 0)).toBe(false);
        expect(rounded.points.length).toBeGreaterThan(8);
    });

    it("colors outlines by stroke, then by fill, inheriting from groups; style wins over attributes", () => {
        const drawing = readSvg(
            svg(`<g stroke="blue" fill="yellow">
                   <path d="M0 0 L10 0"/>
                   <path d="M0 0 L10 0" style="stroke: lime" stroke="red"/>
                   <path d="M0 0 L10 0" stroke="none"/>
                   <path d="M0 0 L10 0" stroke="none" fill="none"/>
                 </g>`),
        );
        expect(drawing.polylines.map((polyline) => [polyline.paint, polyline.color])).toEqual([
            ["stroke", { red: 0, green: 0, blue: 1 }],
            ["stroke", { red: 0, green: 1, blue: 0 }],
            ["fill", { red: 1, green: 1, blue: 0 }],
        ]);
        expect(readSvg(svg(`<path d="M0 0 L10 0" fill="red"/>`), { outlineFills: false }).polylines).toHaveLength(0);
    });

    it("multiplies opacity down through groups, and uses currentColor and the override", () => {
        const [faded] = readSvg(svg(`<g opacity="0.5"><path d="M0 0 L1 0" stroke="red" opacity="0.5" stroke-opacity="0.8"/></g>`)).polylines;
        near(faded.opacity, 0.2);
        const [current] = readSvg(svg(`<path d="M0 0 L1 0" stroke="currentColor"/>`), { currentColor: { red: 0, green: 1, blue: 1 } }).polylines;
        expect(current.color).toEqual({ red: 0, green: 1, blue: 1 });
        const [inherited] = readSvg(svg(`<g color="red"><path d="M0 0 L1 0" stroke="currentColor"/></g>`)).polylines;
        expect(inherited.color).toEqual({ red: 1, green: 0, blue: 0 });
        const [override] = readSvg(svg(`<path d="M0 0 L1 0" stroke="red"/>`), { colorOverride: { red: 0, green: 0, blue: 1 } }).polylines;
        expect(override.color).toEqual({ red: 0, green: 0, blue: 1 });
    });

    it("applies transforms through groups, and leaves out what is hidden or never drawn", () => {
        const drawing = readSvg(
            svg(`<g transform="translate(10 0)"><path id="a" d="M0 0 L1 0" stroke="red" transform="scale(2)"/></g>
                 <path d="M0 0 L1 0" stroke="red" display="none"/>
                 <g style="display:none"><path d="M0 0 L1 0" stroke="red"/></g>
                 <path d="M0 0 L1 0" stroke="red" visibility="hidden"/>
                 <defs><path d="M0 0 L1 0" stroke="red"/></defs>
                 <text x="0" y="0">hi</text><image href="x.png"/>`),
        );
        expect(drawing.polylines).toHaveLength(1);
        expect(drawing.polylines[0].points).toEqual([
            { x: 10, y: 0 },
            { x: 12, y: 0 },
        ]);
        expect(drawing.polylines[0].id).toBe("a");
        expect(drawing.skipped).toEqual({ text: 1, image: 1 });
    });

    it("draws <use> references, symbols included, at their x and y", () => {
        const drawing = readSvg(
            svg(`<defs><path id="dash" d="M0 0 L5 0"/><symbol id="mark"><path d="M0 0 L0 5"/></symbol></defs>
                 <use href="#dash" x="10" y="10" stroke="red"/>
                 <use xlink:href="#mark" x="20" stroke="red"/>`),
        );
        expect(drawing.polylines.map((polyline) => polyline.points)).toEqual([
            [
                { x: 10, y: 10 },
                { x: 15, y: 10 },
            ],
            [
                { x: 20, y: 0 },
                { x: 20, y: 5 },
            ],
        ]);
    });

    it("fits a nested <svg>'s viewBox into its viewport", () => {
        const [inner] = readSvg(svg(`<svg x="10" y="10" width="20" height="20" viewBox="0 0 10 10"><path d="M0 0 L10 10" stroke="red"/></svg>`)).polylines;
        expect(inner.points).toEqual([
            { x: 10, y: 10 },
            { x: 30, y: 30 },
        ]);
    });

    it("reports the viewBox, or width and height when there is none", () => {
        expect(readSvg(svg("", 'viewBox="-5 -5 10 20"')).viewBox).toEqual({ x: -5, y: -5, width: 10, height: 20 });
        expect(readSvg(svg("", 'width="64px" height="32"')).viewBox).toEqual({ x: 0, y: 0, width: 64, height: 32 });
        expect(() => readSvg("<html></html>")).toThrow(/no <svg>/);
    });
});

describe("placing a drawing", () => {
    it("fits the viewBox into a box, keeping proportions and centring", () => {
        const drawing = readSvg(svg(`<path d="M0 0 L100 50" stroke="red"/>`, 'viewBox="0 0 100 50"'));
        expect(fitDrawing(drawing, { x: 0, y: 0, width: 200, height: 200 })[0].points).toEqual([
            { x: 0, y: 50 },
            { x: 200, y: 150 },
        ]);
        expect(fitDrawing(drawing, { x: 0, y: 0, width: 200, height: 200 }, false)[0].points).toEqual([
            { x: 0, y: 0 },
            { x: 200, y: 200 },
        ]);
    });

    it("groups outlines into one shape per color and opacity", () => {
        const drawing = readSvg(
            svg(`<path d="M0 0 L1 0" stroke="red"/><path d="M0 1 L1 1" stroke="red"/><path d="M0 2 L1 2" stroke="blue"/>`),
        );
        const shapes = shapesByColor(drawing.polylines);
        expect(shapes.map((group) => [group.color, group.shape.segmentCount])).toEqual([
            [{ red: 1, green: 0, blue: 0 }, 2],
            [{ red: 0, green: 0, blue: 1 }, 1],
        ]);
    });
});
