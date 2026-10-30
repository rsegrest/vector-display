import { Shape, type BeamColor } from "@vector-display/core";
import type { SvgDrawing, SvgPolyline } from "./readSvg.js";

export interface TargetBox {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

// The drawing's outlines moved and scaled from its viewBox into `target`. By default the
// drawing keeps its proportions and is centred in the box, as an <img> would show it.
export function fitDrawing(drawing: SvgDrawing, target: TargetBox, keepProportions = true): SvgPolyline[] {
    const { viewBox } = drawing;
    let scaleX = target.width / viewBox.width;
    let scaleY = target.height / viewBox.height;
    if (keepProportions) scaleX = scaleY = Math.min(scaleX, scaleY);
    const offsetX = target.x + (target.width - viewBox.width * scaleX) / 2 - viewBox.x * scaleX;
    const offsetY = target.y + (target.height - viewBox.height * scaleY) / 2 - viewBox.y * scaleY;
    return drawing.polylines.map((polyline) => ({
        ...polyline,
        points: polyline.points.map((point) => ({ x: offsetX + point.x * scaleX, y: offsetY + point.y * scaleY })),
    }));
}

// Outlines of one color and opacity, as one shape: draw it with `color`, at intensity `opacity`.
export interface ColoredShape {
    readonly color: BeamColor;
    readonly opacity: number;
    readonly shape: Shape;
}

// Groups outlines by color and opacity, so a whole drawing goes into a display list as a few shapes.
export function shapesByColor(polylines: readonly SvgPolyline[]): ColoredShape[] {
    const groups = new Map<string, { color: BeamColor; opacity: number; members: SvgPolyline[] }>();
    for (const polyline of polylines) {
        const key = `${polyline.color.red},${polyline.color.green},${polyline.color.blue},${polyline.opacity}`;
        let group = groups.get(key);
        if (!group) {
            group = { color: polyline.color, opacity: polyline.opacity, members: [] };
            groups.set(key, group);
        }
        group.members.push(polyline);
    }
    return [...groups.values()].map(({ color, opacity, members }) => ({ color, opacity, shape: Shape.fromPolylines(members) }));
}
