import type { PointLike } from "@vector-display/core";

// A run of connected points in the element's own coordinates.
export interface LocalPolyline {
    readonly points: PointLike[];
    isClosed: boolean;
}

const MAX_CURVE_DEPTH = 16;

// Reads an SVG path's d attribute and flattens it into polylines: one per
// subpath, curves and arcs cut into straight pieces that stay within `tolerance`
// of the true curve. Coordinates are the path's own; the caller applies transforms.
// As in a browser, a command with numbers missing is not drawn, and ends the path.
export function flattenPathData(d: string, tolerance: number): LocalPolyline[] {
    const scanner = new PathScanner(d);
    const polylines: LocalPolyline[] = [];
    let current: PointLike = { x: 0, y: 0 };
    let subpathStart: PointLike = current;
    let polyline: LocalPolyline | null = null;
    // The control point a following S or T reflects, and which kind of curve left it.
    let previousControl: PointLike | null = null;
    let previousCommand = "";
    let command = "";

    const lineTo = (point: PointLike): void => {
        if (!polyline) {
            polyline = { points: [current], isClosed: false };
            polylines.push(polyline);
        }
        polyline.points.push(point);
        current = point;
    };
    const relative = (x: number, y: number, isRelative: boolean): PointLike => (isRelative ? { x: current.x + x, y: current.y + y } : { x, y });

    for (;;) {
        const next = scanner.readCommand();
        if (next !== undefined) {
            command = next;
        } else if (scanner.atEnd()) {
            break;
        } else if (command === "M" || command === "m") {
            // Further coordinate pairs after a moveto are implicit linetos.
            command = command === "M" ? "L" : "l";
        } else if (command === "" || command === "Z" || command === "z") {
            // Numbers with no command to give them meaning: the rest of the path is unreadable.
            break;
        }
        const isRelative = command === command.toLowerCase();
        const upper = command.toUpperCase();
        let control: PointLike | null = null;
        switch (upper) {
            case "M": {
                const point = relative(scanner.number(), scanner.number(), isRelative);
                if (scanner.failed) return polylines;
                polyline = { points: [point], isClosed: false };
                polylines.push(polyline);
                current = subpathStart = point;
                break;
            }
            case "L": {
                const point = relative(scanner.number(), scanner.number(), isRelative);
                if (scanner.failed) return polylines;
                lineTo(point);
                break;
            }
            case "H": {
                const x = scanner.number();
                if (scanner.failed) return polylines;
                lineTo({ x: isRelative ? current.x + x : x, y: current.y });
                break;
            }
            case "V": {
                const y = scanner.number();
                if (scanner.failed) return polylines;
                lineTo({ x: current.x, y: isRelative ? current.y + y : y });
                break;
            }
            case "C":
            case "S": {
                const first: PointLike =
                    upper === "C"
                        ? relative(scanner.number(), scanner.number(), isRelative)
                        : reflected(previousControl, current, previousCommand === "C" || previousCommand === "S");
                const second = relative(scanner.number(), scanner.number(), isRelative);
                const end = relative(scanner.number(), scanner.number(), isRelative);
                if (scanner.failed) return polylines;
                const start = current;
                addCubic(start, first, second, end, tolerance, lineTo);
                control = second;
                break;
            }
            case "Q":
            case "T": {
                const middle: PointLike =
                    upper === "Q"
                        ? relative(scanner.number(), scanner.number(), isRelative)
                        : reflected(previousControl, current, previousCommand === "Q" || previousCommand === "T");
                const end = relative(scanner.number(), scanner.number(), isRelative);
                if (scanner.failed) return polylines;
                const start = current;
                // A quadratic curve is the cubic whose controls lie two thirds of the way to its one control.
                addCubic(start, towards(start, middle, 2 / 3), towards(end, middle, 2 / 3), end, tolerance, lineTo);
                control = middle;
                break;
            }
            case "A": {
                const radiusX = scanner.number();
                const radiusY = scanner.number();
                const rotation = scanner.number();
                const isLargeArc = scanner.flag();
                const isSweep = scanner.flag();
                const end = relative(scanner.number(), scanner.number(), isRelative);
                if (scanner.failed) return polylines;
                addEndpointArc(current, radiusX, radiusY, rotation, isLargeArc, isSweep, end, tolerance, lineTo);
                current = end;
                break;
            }
            case "Z":
                if (polyline) polyline.isClosed = true;
                polyline = null;
                current = subpathStart;
                break;
            default:
                // An unknown letter ends what can be read.
                return polylines;
        }
        previousControl = control;
        previousCommand = upper;
    }
    return polylines;
}

function reflected(control: PointLike | null, about: PointLike, applies: boolean): PointLike {
    return applies && control ? { x: 2 * about.x - control.x, y: 2 * about.y - control.y } : about;
}

function towards(from: PointLike, to: PointLike, amount: number): PointLike {
    return { x: from.x + (to.x - from.x) * amount, y: from.y + (to.y - from.y) * amount };
}

// Splits the curve in half until each piece's controls lie within tolerance of
// its chord, then emits the pieces' ends.
export function addCubic(
    start: PointLike,
    first: PointLike,
    second: PointLike,
    end: PointLike,
    tolerance: number,
    emit: (point: PointLike) => void,
    depth = 0,
): void {
    if (depth >= MAX_CURVE_DEPTH || isFlat(start, first, second, end, tolerance)) {
        emit(end);
        return;
    }
    const a = towards(start, first, 0.5);
    const b = towards(first, second, 0.5);
    const c = towards(second, end, 0.5);
    const ab = towards(a, b, 0.5);
    const bc = towards(b, c, 0.5);
    const middle = towards(ab, bc, 0.5);
    addCubic(start, a, ab, middle, tolerance, emit, depth + 1);
    addCubic(middle, bc, c, end, tolerance, emit, depth + 1);
}

function isFlat(start: PointLike, first: PointLike, second: PointLike, end: PointLike, tolerance: number): boolean {
    return distanceToLine(first, start, end) <= tolerance && distanceToLine(second, start, end) <= tolerance;
}

function distanceToLine(point: PointLike, from: PointLike, to: PointLike): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return Math.hypot(point.x - from.x, point.y - from.y);
    return Math.abs((point.x - from.x) * dy - (point.y - from.y) * dx) / length;
}

// Points along an ellipse (centre, radii, tilted by `rotation` radians) from angle
// `startAngle`, turning by `sweep` radians, close enough to stay within tolerance.
// The start point itself is not emitted.
export function addEllipseArc(
    centerX: number,
    centerY: number,
    radiusX: number,
    radiusY: number,
    rotation: number,
    startAngle: number,
    sweep: number,
    tolerance: number,
    emit: (point: PointLike) => void,
): void {
    const radius = Math.max(radiusX, radiusY);
    const largestStep = radius > tolerance ? 2 * Math.acos(1 - tolerance / radius) : Math.PI / 2;
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / Math.min(largestStep, Math.PI / 2)));
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    for (let step = 1; step <= steps; step++) {
        const angle = startAngle + (sweep * step) / steps;
        const x = radiusX * Math.cos(angle);
        const y = radiusY * Math.sin(angle);
        emit({ x: centerX + x * cos - y * sin, y: centerY + x * sin + y * cos });
    }
}

// An SVG arc command, given by its ends, converted to centre form (SVG 1.1,
// appendix F.6.5) and flattened. Radii too small to reach are enlarged (F.6.6).
function addEndpointArc(
    start: PointLike,
    radiusX: number,
    radiusY: number,
    rotationDegrees: number,
    isLargeArc: boolean,
    isSweep: boolean,
    end: PointLike,
    tolerance: number,
    emit: (point: PointLike) => void,
): void {
    if (start.x === end.x && start.y === end.y) return;
    let rx = Math.abs(radiusX);
    let ry = Math.abs(radiusY);
    if (rx === 0 || ry === 0) {
        emit(end);
        return;
    }
    const phi = (rotationDegrees * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const halfX = (start.x - end.x) / 2;
    const halfY = (start.y - end.y) / 2;
    const x1 = cos * halfX + sin * halfY;
    const y1 = -sin * halfX + cos * halfY;
    const reach = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (reach > 1) {
        rx *= Math.sqrt(reach);
        ry *= Math.sqrt(reach);
    }
    const numerator = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const denominator = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    const coefficient = (isLargeArc === isSweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
    const centerX1 = (coefficient * rx * y1) / ry;
    const centerY1 = (-coefficient * ry * x1) / rx;
    const centerX = cos * centerX1 - sin * centerY1 + (start.x + end.x) / 2;
    const centerY = sin * centerX1 + cos * centerY1 + (start.y + end.y) / 2;
    const startAngle = Math.atan2((y1 - centerY1) / ry, (x1 - centerX1) / rx);
    let sweep = Math.atan2((-y1 - centerY1) / ry, (-x1 - centerX1) / rx) - startAngle;
    if (!isSweep && sweep > 0) sweep -= 2 * Math.PI;
    if (isSweep && sweep < 0) sweep += 2 * Math.PI;
    const points: PointLike[] = [];
    addEllipseArc(centerX, centerY, rx, ry, phi, startAngle, sweep, tolerance, (point) => points.push(point));
    // The last point is the end exactly, not the arithmetic's near miss.
    points[points.length - 1] = end;
    points.forEach(emit);
}

// Reads the d attribute's numbers, flags and command letters. The syntax lets
// numbers run together ("1.5.5" is 1.5 and .5, "1-2" is 1 and -2) and arc flags
// be single unseparated digits.
class PathScanner {
    public failed = false;
    private position = 0;

    public constructor(private readonly text: string) {}

    public atEnd(): boolean {
        this.skipSeparators();
        return this.position >= this.text.length;
    }

    public readCommand(): string | undefined {
        this.skipSeparators();
        const character = this.text[this.position];
        if (character !== undefined && /[MmLlHhVvCcSsQqTtAaZz]/.test(character)) {
            this.position++;
            return character;
        }
        return undefined;
    }

    public number(): number {
        this.skipSeparators();
        const match = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;
        match.lastIndex = this.position;
        const found = match.exec(this.text);
        if (!found) {
            this.failed = true;
            return 0;
        }
        this.position = match.lastIndex;
        return Number(found[0]);
    }

    public flag(): boolean {
        this.skipSeparators();
        const character = this.text[this.position];
        if (character !== "0" && character !== "1") {
            this.failed = true;
            return false;
        }
        this.position++;
        return character === "1";
    }

    private skipSeparators(): void {
        while (this.position < this.text.length && /[\s,]/.test(this.text[this.position])) this.position++;
    }
}
