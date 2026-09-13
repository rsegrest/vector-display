export interface FrameSample {
    readonly frameIntervalMilliseconds: number;
    readonly updateMilliseconds: number;
    readonly renderMilliseconds: number;
}

export interface FrameAverages {
    readonly framesPerSecond: number;
    readonly updateMilliseconds: number;
    readonly renderMilliseconds: number;
}

const SAMPLE_WINDOW_SIZE = 120;

export class FrameStats {
    private readonly samples: FrameSample[] = [];

    public record(sample: FrameSample): void {
        this.samples.push(sample);
        if (this.samples.length > SAMPLE_WINDOW_SIZE) this.samples.shift();
    }

    public reset(): void {
        this.samples.length = 0;
    }

    public getAverages(): FrameAverages {
        const sampleCount = Math.max(this.samples.length, 1);
        let totalInterval = 0;
        let totalUpdate = 0;
        let totalRender = 0;
        for (const sample of this.samples) {
            totalInterval += sample.frameIntervalMilliseconds;
            totalUpdate += sample.updateMilliseconds;
            totalRender += sample.renderMilliseconds;
        }
        return {
            framesPerSecond: totalInterval > 0 ? (1000 * this.samples.length) / totalInterval : 0,
            updateMilliseconds: totalUpdate / sampleCount,
            renderMilliseconds: totalRender / sampleCount,
        };
    }
}

export default FrameStats;
