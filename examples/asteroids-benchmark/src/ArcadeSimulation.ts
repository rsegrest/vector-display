import { Vector } from "es-vector-math";
import { SinusoidalTween } from "motion-and-tween/tween";
import { ASTEROID_SHAPE_NAMES } from "./arcadeShapes.js";
import type { SceneObject, WorldSize } from "./sceneTypes.js";

interface MovingObject {
    position: Vector;
    velocity: Vector;
    rotationSpeed: number;
    remainingSeconds: number;
    readonly sceneObject: SceneObject;
}

const SHIP_TURN_SPEED = 1.4;
const SECONDS_BETWEEN_SHOTS = 0.12;
const BULLET_SPEED = 480;
const BULLET_LIFETIME_SECONDS = 1.1;
const SAUCER_SPEED = 90;
const SAUCER_BASE_Y = 110;

export class ArcadeSimulation {
    public readonly worldSize: WorldSize;
    private readonly asteroids: MovingObject[] = [];
    private readonly bullets: MovingObject[] = [];
    private readonly ship: SceneObject;
    private readonly saucer: SceneObject;
    private readonly saucerBob = { offset: 0 };
    private readonly saucerBobTween: SinusoidalTween.EaseInOut;
    private readonly sceneObjects: SceneObject[] = [];
    private secondsUntilNextShot = 0;

    constructor(worldSize: WorldSize) {
        this.worldSize = worldSize;
        this.ship = { shapeName: "playerShip", x: worldSize.width / 2, y: worldSize.height / 2, rotation: 0, scale: 1.6, intensity: 1 };
        this.saucer = { shapeName: "saucer", x: 0, y: SAUCER_BASE_Y, rotation: 0, scale: 0.45, intensity: 1 };
        this.saucerBobTween = new SinusoidalTween.EaseInOut({
            obj: this.saucerBob,
            propertyToChange: "offset",
            beginValue: 0,
            finishValue: 60,
            actionDuration: 90,
        });
    }

    public get asteroidCount(): number {
        return this.asteroids.length;
    }

    public setAsteroidCount(asteroidCount: number): void {
        while (this.asteroids.length < asteroidCount) this.asteroids.push(this.createRandomAsteroid());
        this.asteroids.length = asteroidCount;
    }

    public getSceneObjects(): readonly SceneObject[] {
        return this.sceneObjects;
    }

    public advance(elapsedSeconds: number): void {
        const clampedSeconds = Math.min(elapsedSeconds, 0.1);
        this.advanceAsteroids(clampedSeconds);
        this.advanceShip(clampedSeconds);
        this.advanceBullets(clampedSeconds);
        this.advanceSaucer(clampedSeconds);
        this.collectSceneObjects();
    }

    private createRandomAsteroid(): MovingObject {
        const shapeName = ASTEROID_SHAPE_NAMES[Math.floor(Math.random() * ASTEROID_SHAPE_NAMES.length)];
        const heading = Math.random() * Math.PI * 2;
        const position = new Vector(Math.random() * this.worldSize.width, Math.random() * this.worldSize.height);
        return {
            position,
            velocity: new Vector(1, 0).setAngleRadians(heading).setLength(20 + Math.random() * 60),
            rotationSpeed: (Math.random() - 0.5) * 1.2,
            remainingSeconds: Infinity,
            sceneObject: {
                shapeName,
                x: position.x,
                y: position.y,
                rotation: Math.random() * Math.PI * 2,
                scale: shapeName.startsWith("large") ? 0.5 + Math.random() * 0.3 : 0.4 + Math.random() * 0.4,
                intensity: 1,
            },
        };
    }

    private advanceAsteroids(elapsedSeconds: number): void {
        for (const asteroid of this.asteroids) {
            this.moveWithWrapping(asteroid, elapsedSeconds);
            asteroid.sceneObject.rotation += asteroid.rotationSpeed * elapsedSeconds;
        }
    }

    private advanceShip(elapsedSeconds: number): void {
        this.ship.rotation += SHIP_TURN_SPEED * elapsedSeconds;
        this.secondsUntilNextShot -= elapsedSeconds;
        if (this.secondsUntilNextShot > 0) return;
        this.secondsUntilNextShot = SECONDS_BETWEEN_SHOTS;
        this.bullets.push(this.createBulletFromShip());
    }

    // The ship shape's nose points up (-y), so its heading is a quarter turn behind its rotation.
    private createBulletFromShip(): MovingObject {
        const heading = this.ship.rotation - Math.PI / 2;
        const direction = new Vector(1, 0).setAngleRadians(heading);
        const position = new Vector(this.ship.x, this.ship.y).add(direction.scale(16 * this.ship.scale));
        return {
            position,
            velocity: direction.scale(BULLET_SPEED),
            rotationSpeed: 0,
            remainingSeconds: BULLET_LIFETIME_SECONDS,
            sceneObject: { shapeName: "bullet", x: position.x, y: position.y, rotation: 0, scale: 1, intensity: 1.4 },
        };
    }

    private advanceBullets(elapsedSeconds: number): void {
        for (const bullet of this.bullets) {
            this.moveWithWrapping(bullet, elapsedSeconds);
            bullet.remainingSeconds -= elapsedSeconds;
        }
        const liveBullets = this.bullets.filter((bullet) => bullet.remainingSeconds > 0);
        this.bullets.splice(0, this.bullets.length, ...liveBullets);
    }

    // The bob is frame-based: motion-and-tween advances one frame per update().
    private advanceSaucer(elapsedSeconds: number): void {
        this.saucer.x = (this.saucer.x + SAUCER_SPEED * elapsedSeconds) % this.worldSize.width;
        this.saucerBobTween.update();
        if (!this.saucerBobTween.getIsPlaying()) this.saucerBobTween.yoyo();
        this.saucer.y = SAUCER_BASE_Y + this.saucerBob.offset;
    }

    private moveWithWrapping(movingObject: MovingObject, elapsedSeconds: number): void {
        const moved = movingObject.position.add(movingObject.velocity.scale(elapsedSeconds));
        movingObject.position = new Vector(wrap(moved.x, this.worldSize.width), wrap(moved.y, this.worldSize.height));
        movingObject.sceneObject.x = movingObject.position.x;
        movingObject.sceneObject.y = movingObject.position.y;
    }

    private collectSceneObjects(): void {
        this.sceneObjects.length = 0;
        for (const asteroid of this.asteroids) this.sceneObjects.push(asteroid.sceneObject);
        for (const bullet of this.bullets) this.sceneObjects.push(bullet.sceneObject);
        this.sceneObjects.push(this.saucer, this.ship);
    }
}

function wrap(coordinate: number, limit: number): number {
    return ((coordinate % limit) + limit) % limit;
}

export default ArcadeSimulation;
