import type { BeamColor, Polyline } from "@vector-display/core";

// Vertex data ported from reviving_games/asteroids-p5-ts (src/view/*Display.ts).
export type ArcadeShapeName =
    | "largeAsteroid1"
    | "largeAsteroid2"
    | "largeAsteroid3"
    | "mediumAsteroid1"
    | "mediumAsteroid2"
    | "playerShip"
    | "saucer"
    | "bullet";

export const ASTEROID_SHAPE_NAMES: readonly ArcadeShapeName[] = [
    "largeAsteroid1",
    "largeAsteroid2",
    "largeAsteroid3",
    "mediumAsteroid1",
    "mediumAsteroid2",
];

function closedOutline(coordinatePairs: readonly number[]): Polyline {
    const points = [];
    for (let index = 0; index < coordinatePairs.length; index += 2) {
        points.push({ x: coordinatePairs[index], y: coordinatePairs[index + 1] });
    }
    return { points, isClosed: true };
}

export const ARCADE_SHAPE_POLYLINES: Readonly<Record<ArcadeShapeName, readonly Polyline[]>> = {
    largeAsteroid1: [closedOutline([7, -38, 42, -60, 78, -32, 54, 0, 80, 34, 28, 76, -32, 76, -60, 45, -60, -22, -22, -60])],
    largeAsteroid2: [closedOutline([3, -18, -18, -54, 28, -54, 82, -22, 82, -2, 22, 16, 80, 52, 50, 86, 22, 64, -25, 86, -50, 32, -50, -18])],
    largeAsteroid3: [closedOutline([-2, -40, 34, -60, 72, -20, 28, -9, 72, 24, 28, 80, -18, 56, -34, 78, -70, 38, -48, 16, -68, -22, -22, -60])],
    mediumAsteroid1: [closedOutline([-2, -22, 14, -34, 34, -18, 16, -9, 34, 12, 16, 36, -12, 28, -18, 34, -20, 36, -38, 18, -28, 6, -40, -18, -15, -35])],
    mediumAsteroid2: [closedOutline([8, -16, 34, 12, 18, 20, 36, 28, 18, 60, 2, 25, 4, 60, -16, 60, -40, 20, -40, 10, -22, -16])],
    playerShip: [closedOutline([0, -10, -7.5, 10, -5, 5, 5, 5, 7.5, 10])],
    saucer: [
        closedOutline([-55, 7, 55, 7, 25, 22, -25, 22]),
        closedOutline([-55, 7, 55, 7, 20, -10, -20, -10]),
        closedOutline([20, -10, -20, -10, -10, -30, 10, -30]),
    ],
    bullet: [{ points: [{ x: 0, y: 0 }], isClosed: false }],
};

const ASTEROID_GREEN: BeamColor = { red: 0, green: 200 / 255, blue: 0 };
const SAUCER_GREEN: BeamColor = { red: 0, green: 1, blue: 0 };
const PHOSPHOR_WHITE: BeamColor = { red: 0.85, green: 0.95, blue: 1 };

export function getShapeColor(shapeName: ArcadeShapeName): BeamColor {
    if (shapeName === "saucer") return SAUCER_GREEN;
    if (shapeName === "playerShip" || shapeName === "bullet") return PHOSPHOR_WHITE;
    return ASTEROID_GREEN;
}

export function toCssColor(color: BeamColor): string {
    return `rgb(${Math.round(color.red * 255)}, ${Math.round(color.green * 255)}, ${Math.round(color.blue * 255)})`;
}
