import { describe, expect, it } from "vitest";
import { DepthBuffer } from "./index.js";

// From the vector-demos meshes demo, where this depth buffer began (2026-10-30).
describe("DepthBuffer", () => {
  it("records the nearest surface over each cell a triangle covers", () => {
    const depth = new DepthBuffer(16);
    depth.fillTriangle(2, 2, 0.5, 12, 2, 0.5, 2, 12, 0.5);
    expect(depth.at(4, 4)).toBeCloseTo(0.5, 6);
    expect(depth.at(14, 14)).toBe(0);
    // A nearer triangle over part of it wins; a farther one does not.
    depth.fillTriangle(2, 2, 0.8, 6, 2, 0.8, 2, 6, 0.8);
    depth.fillTriangle(2, 2, 0.2, 12, 2, 0.2, 2, 12, 0.2);
    expect(depth.at(3, 3)).toBeCloseTo(0.8, 6);
    expect(depth.at(8, 3)).toBeCloseTo(0.5, 6);
  });

  it("fills the same cells whichever way round the corners are given", () => {
    const first = new DepthBuffer(16);
    const second = new DepthBuffer(16);
    first.fillTriangle(1, 1, 0.4, 13, 3, 0.4, 5, 14, 0.4);
    second.fillTriangle(5, 14, 0.4, 13, 3, 0.4, 1, 1, 0.4);
    for (let row = 0; row < 16; row++) for (let column = 0; column < 16; column++) expect(second.at(column, row)).toBe(first.at(column, row));
  });

  it("leaves no pinholes under a sliver thinner than a cell", () => {
    const depth = new DepthBuffer(32);
    depth.fillTriangle(2, 10.4, 0.5, 30, 10.6, 0.5, 30, 10.5, 0.5);
    for (let column = 4; column < 28; column++) expect(Math.max(depth.at(column, 9), depth.at(column, 10))).toBeGreaterThan(0);
  });

  it("slopes nearness across a tilted triangle", () => {
    const depth = new DepthBuffer(16);
    depth.fillTriangle(0, 0, 0.2, 16, 0, 0.6, 0, 16, 0.2);
    expect(depth.at(2, 2)).toBeLessThan(depth.at(10, 2));
    expect(depth.at(10, 2)).toBeCloseTo(0.2 + (10.5 / 16) * 0.4, 5);
  });

  it("hides the part of a line that passes behind a surface, and only that part", () => {
    const depth = new DepthBuffer(64);
    // A wall across the middle columns.
    depth.fillTriangle(20, 0, 0.5, 40, 0, 0.5, 40, 64, 0.5);
    depth.fillTriangle(20, 0, 0.5, 40, 64, 0.5, 20, 64, 0.5);
    const runs: number[][] = [];
    depth.traceVisible(2, 30, 0.3, 62, 30, 0.3, 0.01, (x0, y0, x1, y1) => runs.push([x0, y0, x1, y1]));
    expect(runs).toHaveLength(2);
    expect(runs[0][0]).toBeCloseTo(2, 5);
    expect(runs[0][2]).toBeGreaterThan(17);
    expect(runs[0][2]).toBeLessThan(22);
    expect(runs[1][0]).toBeGreaterThan(38);
    expect(runs[1][0]).toBeLessThan(43);
    expect(runs[1][2]).toBeCloseTo(62, 5);
  });

  it("shows a line in front of the surface, or lying on it, whole", () => {
    const depth = new DepthBuffer(64);
    depth.fillTriangle(0, 0, 0.5, 64, 0, 0.5, 0, 64, 0.5);
    for (const nearness of [0.7, 0.5]) {
      const runs: number[][] = [];
      depth.traceVisible(5, 5, nearness, 25, 20, nearness, 0.01, (x0, y0, x1, y1) => runs.push([x0, y0, x1, y1]));
      expect(runs).toHaveLength(1);
      expect(runs[0]).toEqual([5, 5, 25, 20]);
    }
  });
});

