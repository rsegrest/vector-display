import type { BeamColor, PointLike, Polyline } from "@vector-display/core";
import { flattenPathData, type LocalPolyline } from "./pathData.js";
import { parsePaint, parseColor, type SvgPaint } from "./svgColor.js";
import { ellipseShape, lineShape, pointListShape, readLength, readPointList, rectShape } from "./svgShapes.js";
import { applyToPoint, IDENTITY, lengthScale, multiply, parseTransform, type AffineMatrix } from "./svgTransform.js";
import { descendants, parseXmlElements, type XmlElement } from "./xmlElements.js";

// One outline from the drawing, in the drawing's user coordinates (its viewBox),
// y pointing down as in SVG, which is also the display's screen space.
export interface SvgPolyline extends Polyline {
    readonly points: readonly PointLike[];
    readonly isClosed: boolean;
    readonly color: BeamColor;
    // The element's opacity times its stroke or fill opacity: use it as the beam's intensity.
    readonly opacity: number;
    // Whether the outline is a stroke the drawing paints, or the edge of a filled shape.
    readonly paint: "stroke" | "fill";
    // The id of the element the outline came from, if it has one.
    readonly id?: string;
}

export interface SvgViewBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export interface SvgDrawing {
    readonly viewBox: SvgViewBox;
    readonly polylines: readonly SvgPolyline[];
    // Elements that draw something but cannot become outlines, by name, with how many there were:
    // text (convert it to paths first: Inkscape's Path > Object to Path), images, stylesheets.
    readonly skipped: Readonly<Record<string, number>>;
}

export interface SvgReadOptions {
    // How far a flattened curve may stray from the true one, in user units.
    // Default: a thousandth of the drawing's larger side.
    readonly tolerance?: number;
    // Draw the edges of filled shapes that have no stroke (default true): a vector display draws
    // only lines, and most icons are made of fills.
    readonly outlineFills?: boolean;
    // What "currentColor" means where the drawing does not set the color property. Default white.
    readonly currentColor?: BeamColor;
    // Draw everything in this one color instead of the drawing's own.
    readonly colorOverride?: BeamColor;
}

// The parts of an element's style that pass down to its children.
interface InheritedStyle {
    readonly transform: AffineMatrix;
    readonly stroke: SvgPaint;
    readonly fill: SvgPaint;
    readonly color: BeamColor;
    readonly opacity: number;
    readonly strokeOpacity: number;
    readonly fillOpacity: number;
    readonly isVisible: boolean;
}

const WHITE: BeamColor = { red: 1, green: 1, blue: 1 };
// Containers whose children are drawn.
const GROUPS = new Set(["svg", "g", "a", "switch"]);
// Drawn only through <use>, or never drawn at all.
const NOT_RENDERED = new Set([
    "defs", "symbol", "clipPath", "mask", "pattern", "marker", "linearGradient", "radialGradient", "filter",
    "title", "desc", "metadata", "script", "foreignObject", "namedview",
]);
// Drawn by a browser, but with nothing a line drawing can keep.
const UNSUPPORTED = new Set(["text", "image", "style"]);
const MAX_USE_DEPTH = 8;

// Reads an SVG document into outlines: paths, lines, polylines, polygons, rectangles,
// circles and ellipses, with their transforms, through <use> references, colored
// by their stroke (or fill). Text, images, gradients' shading and CSS stylesheets
// cannot be drawn as outlines; see SvgDrawing.skipped.
export function readSvg(text: string, options: SvgReadOptions = {}): SvgDrawing {
    const document = parseXmlElements(text);
    const root = document.children.find((element) => element.name === "svg");
    if (!root) throw new Error("Not an SVG document: there is no <svg> element");
    const viewBox = readViewBox(root);
    const reader = new SvgReader(root, {
        tolerance: options.tolerance ?? Math.max(viewBox.width, viewBox.height, 1) / 1000,
        outlineFills: options.outlineFills ?? true,
        colorOverride: options.colorOverride,
    });
    const style: InheritedStyle = {
        transform: IDENTITY,
        stroke: "none",
        fill: { red: 0, green: 0, blue: 0 },
        color: options.currentColor ?? WHITE,
        opacity: 1,
        strokeOpacity: 1,
        fillOpacity: 1,
        isVisible: true,
    };
    reader.readChildren(root, reader.styleOf(root, style), 0);
    return { viewBox, polylines: reader.polylines, skipped: reader.skipped };
}

function readViewBox(root: XmlElement): SvgViewBox {
    const numbers = (root.attributes.get("viewBox") ?? "").split(/[\s,]+/).filter((part) => part !== "").map(Number);
    if (numbers.length === 4 && numbers.every(Number.isFinite) && numbers[2] > 0 && numbers[3] > 0) {
        return { x: numbers[0], y: numbers[1], width: numbers[2], height: numbers[3] };
    }
    return { x: 0, y: 0, width: readLength(root.attributes.get("width"), 300), height: readLength(root.attributes.get("height"), 150) };
}

interface ReaderSettings {
    readonly tolerance: number;
    readonly outlineFills: boolean;
    readonly colorOverride: BeamColor | undefined;
}

class SvgReader {
    public readonly polylines: SvgPolyline[] = [];
    public readonly skipped: Record<string, number> = {};
    private readonly byId = new Map<string, XmlElement>();

    public constructor(
        root: XmlElement,
        private readonly settings: ReaderSettings,
    ) {
        for (const element of descendants(root)) {
            const id = element.attributes.get("id");
            if (id !== undefined && !this.byId.has(id)) this.byId.set(id, element);
        }
    }

    public readChildren(element: XmlElement, style: InheritedStyle, useDepth: number): void {
        for (const child of element.children) this.readElement(child, style, useDepth);
    }

    // The element's own style over the inherited one: presentation attributes, then the style
    // attribute, which wins.
    public styleOf(element: XmlElement, inherited: InheritedStyle): InheritedStyle {
        const properties = new Map(element.attributes);
        for (const declaration of (element.attributes.get("style") ?? "").split(";")) {
            const colon = declaration.indexOf(":");
            if (colon > 0) properties.set(declaration.slice(0, colon).trim(), declaration.slice(colon + 1).trim());
        }
        const number = (name: string, fallback: number): number => {
            const value = properties.get(name);
            if (value === undefined) return fallback;
            const parsed = value.endsWith("%") ? Number.parseFloat(value) / 100 : Number.parseFloat(value);
            return Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : fallback;
        };
        const visibility = properties.get("visibility");
        return {
            transform: multiply(inherited.transform, parseTransform(element.attributes.get("transform"))),
            stroke: parsePaint(properties.get("stroke")) ?? inherited.stroke,
            fill: parsePaint(properties.get("fill")) ?? inherited.fill,
            color: parseColor(properties.get("color") ?? "") ?? inherited.color,
            // Opacity does not inherit as such: a group's opacity multiplies into everything in it.
            opacity: inherited.opacity * number("opacity", 1),
            strokeOpacity: number("stroke-opacity", inherited.strokeOpacity),
            fillOpacity: number("fill-opacity", inherited.fillOpacity),
            isVisible: visibility === undefined ? inherited.isVisible : visibility === "visible",
        };
    }

    private readElement(element: XmlElement, inherited: InheritedStyle, useDepth: number): void {
        const { name } = element;
        if (NOT_RENDERED.has(name)) return;
        if (UNSUPPORTED.has(name)) {
            this.skipped[name] = (this.skipped[name] ?? 0) + 1;
            return;
        }
        if (element.attributes.get("display") === "none" || /(^|;)\s*display\s*:\s*none/.test(element.attributes.get("style") ?? "")) return;
        const style = this.styleOf(element, inherited);
        if (GROUPS.has(name)) {
            this.readChildren(element, name === "svg" ? this.nestedViewport(element, style) : style, useDepth);
            return;
        }
        if (name === "use") {
            this.readUse(element, style, useDepth);
            return;
        }
        const outlines = this.shapeOutlines(element, style);
        if (outlines) this.addOutlines(element, outlines, style);
    }

    // A nested <svg> is its own viewport: placed at x, y, and its viewBox fitted into its width and height.
    private nestedViewport(element: XmlElement, style: InheritedStyle): InheritedStyle {
        const x = readLength(element.attributes.get("x"));
        const y = readLength(element.attributes.get("y"));
        let placement: AffineMatrix = [1, 0, 0, 1, x, y];
        const box = (element.attributes.get("viewBox") ?? "").split(/[\s,]+/).filter((part) => part !== "").map(Number);
        const width = readLength(element.attributes.get("width"), Number.NaN);
        const height = readLength(element.attributes.get("height"), Number.NaN);
        if (box.length === 4 && box[2] > 0 && box[3] > 0 && Number.isFinite(width) && Number.isFinite(height)) {
            // preserveAspectRatio's default, xMidYMid meet: as large as fits, centred.
            const scale = Math.min(width / box[2], height / box[3]);
            const offsetX = (width - box[2] * scale) / 2 - box[0] * scale;
            const offsetY = (height - box[3] * scale) / 2 - box[1] * scale;
            placement = multiply(placement, [scale, 0, 0, scale, offsetX, offsetY]);
        }
        return { ...style, transform: multiply(style.transform, placement) };
    }

    private readUse(element: XmlElement, style: InheritedStyle, useDepth: number): void {
        const reference = element.attributes.get("href") ?? element.attributes.get("xlink:href") ?? "";
        const target = reference.startsWith("#") ? this.byId.get(reference.slice(1)) : undefined;
        if (!target || useDepth >= MAX_USE_DEPTH) return;
        const offset: AffineMatrix = [1, 0, 0, 1, readLength(element.attributes.get("x")), readLength(element.attributes.get("y"))];
        const placed = { ...style, transform: multiply(style.transform, offset) };
        if (target.name === "symbol") this.readChildren(target, this.styleOf(target, placed), useDepth + 1);
        else this.readElement(target, placed, useDepth + 1);
    }

    private shapeOutlines(element: XmlElement, style: InheritedStyle): LocalPolyline[] | undefined {
        const attribute = (name: string): string | undefined => element.attributes.get(name);
        const length = (name: string): number => readLength(attribute(name));
        // The tolerance is in final units, so a shape drawn large by its transform is cut finer.
        const tolerance = this.settings.tolerance / lengthScale(style.transform);
        switch (element.name) {
            case "path":
                return flattenPathData(attribute("d") ?? "", tolerance);
            case "line":
                return lineShape(length("x1"), length("y1"), length("x2"), length("y2"));
            case "polyline":
                return pointListShape(readPointList(attribute("points")), false);
            case "polygon":
                return pointListShape(readPointList(attribute("points")), true);
            case "rect": {
                const rx = attribute("rx");
                const ry = attribute("ry");
                return rectShape(
                    length("x"),
                    length("y"),
                    length("width"),
                    length("height"),
                    rx === undefined ? undefined : readLength(rx),
                    ry === undefined ? undefined : readLength(ry),
                    tolerance,
                );
            }
            case "circle":
                return ellipseShape(length("cx"), length("cy"), length("r"), length("r"), tolerance);
            case "ellipse":
                return ellipseShape(length("cx"), length("cy"), length("rx"), length("ry"), tolerance);
            default:
                // Anything else (an editor's own elements, say) draws nothing.
                return undefined;
        }
    }

    private addOutlines(element: XmlElement, outlines: LocalPolyline[], style: InheritedStyle): void {
        if (!style.isVisible) return;
        const usesStroke = style.stroke !== "none";
        const usesFill = !usesStroke && this.settings.outlineFills && style.fill !== "none";
        if (!usesStroke && !usesFill) return;
        const paint = usesStroke ? style.stroke : style.fill;
        const color = this.settings.colorOverride ?? (paint === "currentColor" ? style.color : (paint as BeamColor));
        const opacity = style.opacity * (usesStroke ? style.strokeOpacity : style.fillOpacity);
        const id = element.attributes.get("id");
        for (const outline of outlines) {
            if (outline.points.length === 0) continue;
            this.polylines.push({
                points: outline.points.map((point) => applyToPoint(style.transform, point.x, point.y)),
                isClosed: outline.isClosed,
                color,
                opacity,
                paint: usesStroke ? "stroke" : "fill",
                ...(id === undefined ? {} : { id }),
            });
        }
    }
}
