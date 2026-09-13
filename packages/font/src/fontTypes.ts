import type { Polyline } from "@rsegrest/vector-display";

// All metrics are in glyph grid units; text size scales them so capHeight equals the requested size.
export interface FontMetrics {
    readonly glyphWidth: number;
    readonly capHeight: number;
    readonly letterSpacing: number;
    readonly lineSpacing: number;
}

export type GlyphTable = Readonly<Record<string, readonly Polyline[]>>;

export type TextAlignment = "left" | "center" | "right";

export interface TextRun {
    readonly text: string;
    // Top of the first line; horizontal position depends on alignment.
    readonly x: number;
    readonly y: number;
    // Height of capital letters in world units.
    readonly size: number;
    readonly alignment?: TextAlignment;
    // Radians, clockwise on screen, around (x, y).
    readonly rotation?: number;
    readonly intensity?: number;
}

export interface TextMeasurement {
    readonly width: number;
    readonly height: number;
}
