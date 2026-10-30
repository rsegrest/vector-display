import type { PointLike } from "@vector-display/core";
import { addEllipseArc, type LocalPolyline } from "./pathData.js";

// The basic shapes, as polylines in the element's own coordinates.

// A length attribute: a number, with or without a unit. Units and percentages are
// taken as user units, which is what drawing editors write for shapes.
export function readLength(value: string | undefined, fallback = 0): number {
    if (value === undefined) return fallback;
    const number = Number.parseFloat(value);
    return Number.isFinite(number) ? number : fallback;
}

export function readPointList(value: string | undefined): PointLike[] {
    const numbers = (value?.match(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? []).map(Number);
    const points: PointLike[] = [];
    for (let index = 0; index + 1 < numbers.length; index += 2) points.push({ x: numbers[index], y: numbers[index + 1] });
    return points;
}

export function lineShape(x1: number, y1: number, x2: number, y2: number): LocalPolyline[] {
    return [{ points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], isClosed: false }];
}

export function pointListShape(points: PointLike[], isClosed: boolean): LocalPolyline[] {
    return points.length === 0 ? [] : [{ points, isClosed }];
}

export function ellipseShape(centerX: number, centerY: number, radiusX: number, radiusY: number, tolerance: number): LocalPolyline[] {
    if (radiusX <= 0 || radiusY <= 0) return [];
    const points: PointLike[] = [{ x: centerX + radiusX, y: centerY }];
    addEllipseArc(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI, tolerance, (point) => points.push(point));
    // The last point repeats the first; a closed polyline joins them itself.
    points.pop();
    return [{ points, isClosed: true }];
}

// A rectangle, with corners rounded to rx and ry as SVG specifies: one given
// alone sets both, and neither may exceed half the side.
export function rectShape(
    x: number,
    y: number,
    width: number,
    height: number,
    rx: number | undefined,
    ry: number | undefined,
    tolerance: number,
): LocalPolyline[] {
    if (width <= 0 || height <= 0) return [];
    const radiusX = Math.min(Math.max(0, rx ?? ry ?? 0), width / 2);
    const radiusY = Math.min(Math.max(0, ry ?? rx ?? 0), height / 2);
    if (radiusX === 0 || radiusY === 0) {
        return [
            {
                points: [
                    { x, y },
                    { x: x + width, y },
                    { x: x + width, y: y + height },
                    { x, y: y + height },
                ],
                isClosed: true,
            },
        ];
    }
    const points: PointLike[] = [];
    const corner = (centerX: number, centerY: number, startAngle: number): void => {
        points.push({ x: centerX + radiusX * Math.cos(startAngle), y: centerY + radiusY * Math.sin(startAngle) });
        addEllipseArc(centerX, centerY, radiusX, radiusY, 0, startAngle, Math.PI / 2, tolerance, (point) => points.push(point));
    };
    // Clockwise on screen (y down), starting at the top edge's right end.
    corner(x + width - radiusX, y + radiusY, -Math.PI / 2);
    corner(x + width - radiusX, y + height - radiusY, 0);
    corner(x + radiusX, y + height - radiusY, Math.PI / 2);
    corner(x + radiusX, y + radiusY, Math.PI);
    return [{ points, isClosed: true }];
}
