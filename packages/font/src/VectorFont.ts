import { Shape, type DisplayList } from "@rsegrest/vector-display";
import { ARCADE_FONT_METRICS, ARCADE_GLYPHS } from "./arcadeGlyphs.js";
import type { FontMetrics, GlyphTable, TextAlignment, TextMeasurement, TextRun } from "./fontTypes.js";

export interface VectorFontDefinition {
    readonly glyphs: GlyphTable;
    readonly metrics: FontMetrics;
}

interface MutablePlacement {
    x: number;
    y: number;
    rotation: number;
    scale: number;
    intensity: number;
}

const ALIGNMENT_OFFSET_FACTORS: Readonly<Record<TextAlignment, number>> = { left: 0, center: 0.5, right: 1 };

export class VectorFont {
    public readonly metrics: FontMetrics;
    private readonly glyphShapes: ReadonlyMap<string, Shape>;
    private readonly glyphPlacement: MutablePlacement = { x: 0, y: 0, rotation: 0, scale: 1, intensity: 1 };

    private constructor(definition: VectorFontDefinition) {
        this.metrics = definition.metrics;
        this.glyphShapes = new Map(
            Object.entries(definition.glyphs).map(([character, polylines]) => [character, Shape.fromPolylines(polylines)]),
        );
    }

    public static fromDefinition(definition: VectorFontDefinition): VectorFont {
        return new VectorFont(definition);
    }

    // Extra glyphs replace or add to the built-in arcade glyphs.
    public static createArcadeFont(extraGlyphs: GlyphTable = {}): VectorFont {
        return new VectorFont({ glyphs: { ...ARCADE_GLYPHS, ...extraGlyphs }, metrics: ARCADE_FONT_METRICS });
    }

    public hasGlyph(character: string): boolean {
        return this.findGlyph(character) !== undefined;
    }

    // Lowercase letters fall back to uppercase glyphs, since arcade fonts had no lowercase.
    public findGlyph(character: string): Shape | undefined {
        return this.glyphShapes.get(character) ?? this.glyphShapes.get(character.toUpperCase());
    }

    public measureText(text: string, size: number): TextMeasurement {
        const lines = text.split("\n");
        const scale = size / this.metrics.capHeight;
        const widestLineLength = Math.max(...lines.map((line) => Array.from(line).length));
        const lineHeight = this.metrics.capHeight + this.metrics.lineSpacing;
        return {
            width: this.measureLineUnits(widestLineLength) * scale,
            height: (lines.length * lineHeight - this.metrics.lineSpacing) * scale,
        };
    }

    // Characters without a glyph are skipped but still take up space, so columns stay aligned.
    public addText(displayList: DisplayList, textRun: TextRun): void {
        const scale = textRun.size / this.metrics.capHeight;
        const alignmentFactor = ALIGNMENT_OFFSET_FACTORS[textRun.alignment ?? "left"];
        const lines = textRun.text.split("\n");
        lines.forEach((line, lineIndex) => {
            const characters = Array.from(line);
            const lineStartUnits = -this.measureLineUnits(characters.length) * alignmentFactor;
            const lineTopUnits = lineIndex * (this.metrics.capHeight + this.metrics.lineSpacing);
            characters.forEach((character, characterIndex) => {
                const glyph = this.findGlyph(character);
                if (!glyph || glyph.segmentCount === 0) return;
                const offsetUnits = lineStartUnits + characterIndex * (this.metrics.glyphWidth + this.metrics.letterSpacing);
                this.placeGlyph({ textRun, scale, offsetXUnits: offsetUnits, offsetYUnits: lineTopUnits });
                displayList.addShape(glyph, this.glyphPlacement);
            });
        });
    }

    private measureLineUnits(characterCount: number): number {
        if (characterCount === 0) return 0;
        return characterCount * this.metrics.glyphWidth + (characterCount - 1) * this.metrics.letterSpacing;
    }

    private placeGlyph(layout: { textRun: TextRun; scale: number; offsetXUnits: number; offsetYUnits: number }): void {
        const { textRun, scale, offsetXUnits, offsetYUnits } = layout;
        const rotation = textRun.rotation ?? 0;
        const cosine = Math.cos(rotation);
        const sine = Math.sin(rotation);
        const offsetX = offsetXUnits * scale;
        const offsetY = offsetYUnits * scale;
        this.glyphPlacement.x = textRun.x + offsetX * cosine - offsetY * sine;
        this.glyphPlacement.y = textRun.y + offsetX * sine + offsetY * cosine;
        this.glyphPlacement.rotation = rotation;
        this.glyphPlacement.scale = scale;
        this.glyphPlacement.intensity = textRun.intensity ?? 1;
    }
}

export default VectorFont;
