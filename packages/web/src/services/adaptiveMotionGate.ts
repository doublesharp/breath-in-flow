export interface MotionDecision {
  /** Whether this sample is consistent with the recent resting-motion distribution. */
  accepted: boolean;
  /** Bounded artifact intensity: 0 is resting and 1 is at or beyond rejection. */
  score: number;
  baseline: number;
  threshold: number;
}

const HISTORY_LIMIT = 60;
const WARM_UP_SAMPLES = 12;
const MAD_MULTIPLIER = 6;
const RELATIVE_NOISE_FLOOR = 0.015;
const ABSOLUTE_NOISE_FLOOR = 0.001;

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * Rejects movement transients using a bounded rolling median and median
 * absolute deviation. Values are deliberately scale-relative so the same
 * physical movement is handled consistently across accelerometer units.
 */
export class AdaptiveMotionGate {
  private history: number[] = [];

  addSample(magnitude: number, timestamp: number): MotionDecision {
    if (!Number.isFinite(magnitude) || !Number.isFinite(timestamp)) {
      return { accepted: false, score: 1, baseline: 0, threshold: ABSOLUTE_NOISE_FLOOR };
    }

    if (this.history.length < WARM_UP_SAMPLES) {
      this.addAcceptedSample(magnitude);
      return { accepted: true, score: 0, baseline: median(this.history), threshold: 0 };
    }

    const baseline = median(this.history);
    const deviations = this.history.map((value) => Math.abs(value - baseline));
    const mad = median(deviations);
    const threshold = Math.max(
      MAD_MULTIPLIER * mad,
      Math.abs(baseline) * RELATIVE_NOISE_FLOOR,
      ABSOLUTE_NOISE_FLOOR
    );
    const score = Math.min(1, Math.abs(magnitude - baseline) / threshold);
    const accepted = score < 1;

    if (accepted) this.addAcceptedSample(magnitude);

    return { accepted, score, baseline, threshold };
  }

  reset(): void {
    this.history = [];
  }

  getHistoryLength(): number {
    return this.history.length;
  }

  private addAcceptedSample(magnitude: number): void {
    this.history.push(magnitude);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
  }
}
