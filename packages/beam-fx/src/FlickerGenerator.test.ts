import { describe, expect, it } from "vitest";
import { FlickerGenerator } from "./FlickerGenerator.js";

function createSequence(values: readonly number[]): () => number {
    let index = 0;
    return () => values[index++ % values.length];
}

describe("FlickerGenerator", () => {
    it("eases from one random level to the next over each period", () => {
        const flicker = new FlickerGenerator(createSequence([0, 1, 0.5]));
        expect(flicker.advance(0, 10)).toBe(0);
        expect(flicker.advance(50, 10)).toBeCloseTo(0.5);
        expect(flicker.advance(50, 10)).toBeCloseTo(1);
        expect(flicker.advance(50, 10)).toBeCloseTo(0.75);
    });

    it("stays within [0, 1] and never jumps between frames at 60 fps", () => {
        const flicker = new FlickerGenerator();
        let previousLevel = flicker.advance(0, 15);
        for (let frame = 0; frame < 600; frame++) {
            const level = flicker.advance(1000 / 60, 15);
            expect(level).toBeGreaterThanOrEqual(0);
            expect(level).toBeLessThanOrEqual(1);
            expect(Math.abs(level - previousLevel)).toBeLessThan(0.5);
            previousLevel = level;
        }
    });

    it("holds its level when the frequency is zero", () => {
        const flicker = new FlickerGenerator(createSequence([0.3, 0.9]));
        expect(flicker.advance(500, 0)).toBe(0.3);
        expect(flicker.advance(500, 0)).toBe(0.3);
    });
});
