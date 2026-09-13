// Smoothly interpolated random levels in [0, 1], changing target once per flicker period.
// Changes slower than the display refresh rate are visible; per-frame noise blurs into a steady image.
export class FlickerGenerator {
    private readonly randomSource: () => number;
    private millisecondsIntoPeriod = 0;
    private startLevel: number;
    private targetLevel: number;

    constructor(randomSource: () => number = Math.random) {
        this.randomSource = randomSource;
        this.startLevel = randomSource();
        this.targetLevel = randomSource();
    }

    public advance(elapsedMilliseconds: number, frequencyHz: number): number {
        if (frequencyHz <= 0) return this.startLevel;
        const periodMilliseconds = 1000 / frequencyHz;
        this.millisecondsIntoPeriod += Math.max(elapsedMilliseconds, 0);
        while (this.millisecondsIntoPeriod >= periodMilliseconds) {
            this.millisecondsIntoPeriod -= periodMilliseconds;
            this.startLevel = this.targetLevel;
            this.targetLevel = this.randomSource();
        }
        const progress = this.millisecondsIntoPeriod / periodMilliseconds;
        const easedProgress = progress * progress * (3 - 2 * progress);
        return this.startLevel + (this.targetLevel - this.startLevel) * easedProgress;
    }
}

export default FlickerGenerator;
