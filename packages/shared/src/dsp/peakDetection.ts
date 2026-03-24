/**
 * Peak detection algorithms for physiological signals.
 * Supports both batch and streaming (real-time) modes.
 */

import { mean, standardDeviation } from './statistics.js';

export interface PeakDetectionOptions {
  minPeakDistance: number; // Minimum samples between peaks (refractory period)
  thresholdFactor?: number; // Threshold as fraction of signal range (default 0.5)
  adaptiveWindow?: number; // Window size for adaptive threshold (default 10)
  minProminence?: number; // Minimum peak prominence as fraction of running range (default 0, disabled)
  adaptiveRefractory?: boolean; // Adapt refractory period based on recent IBIs (default false)
}

export interface DetectedPeak {
  index: number;
  amplitude: number;
  timestamp?: number;
}

/**
 * Compute adaptive threshold at each point using a moving window.
 * Threshold = moving mean + thresholdFactor * moving std dev.
 */
function computeAdaptiveThreshold(
  signal: number[],
  windowSize: number,
  thresholdFactor: number,
): number[] {
  const thresholds: number[] = [];
  for (let i = 0; i < signal.length; i++) {
    const start = Math.max(0, i - windowSize + 1);
    const window = signal.slice(start, i + 1);
    const windowMean = mean(window);
    const windowStd = standardDeviation(window);
    thresholds.push(windowMean + thresholdFactor * windowStd);
  }
  return thresholds;
}

/**
 * Compute the running range (max - min) of an array.
 */
function signalRange(signal: number[]): number {
  if (signal.length === 0) return 0;
  let min = signal[0];
  let max = signal[0];
  for (let i = 1; i < signal.length; i++) {
    if (signal[i] < min) min = signal[i];
    if (signal[i] > max) max = signal[i];
  }
  return max - min;
}

/**
 * Find the minimum value in signal[start..end] (inclusive).
 */
function minInRange(signal: number[], start: number, end: number): number {
  let minVal = signal[start];
  for (let i = start + 1; i <= end; i++) {
    if (signal[i] < minVal) minVal = signal[i];
  }
  return minVal;
}

/**
 * Detect peaks in a signal array (batch mode).
 * A peak is a local maximum above the adaptive threshold, with minimum distance enforced.
 * Optional prominence filter rejects small bumps relative to the signal range.
 */
export function detectPeaks(
  signal: number[],
  options: PeakDetectionOptions,
): DetectedPeak[] {
  const { minPeakDistance } = options;
  const thresholdFactor = options.thresholdFactor ?? 0.5;
  const adaptiveWindow = options.adaptiveWindow ?? 10;
  const minProminenceFraction = options.minProminence ?? 0;

  if (signal.length < 3) return [];

  const thresholds = computeAdaptiveThreshold(
    signal,
    adaptiveWindow,
    thresholdFactor,
  );
  const candidatePeaks: DetectedPeak[] = [];
  let lastPeakIndex = -minPeakDistance; // allow first peak at index 0

  for (let i = 1; i < signal.length - 1; i++) {
    const val = signal[i];
    // Local maximum
    if (val > signal[i - 1] && val > signal[i + 1]) {
      // Above adaptive threshold
      if (val > thresholds[i]) {
        // Enforce refractory period
        if (i - lastPeakIndex >= minPeakDistance) {
          candidatePeaks.push({ index: i, amplitude: val });
          lastPeakIndex = i;
        }
      }
    }
  }

  // Prominence filter pass
  if (minProminenceFraction <= 0 || candidatePeaks.length === 0) {
    return candidatePeaks;
  }

  const range = signalRange(signal);
  const minProminenceAbs = minProminenceFraction * range;

  const peaks: DetectedPeak[] = [];
  for (let pi = 0; pi < candidatePeaks.length; pi++) {
    const peak = candidatePeaks[pi];
    const peakIdx = peak.index;

    // Find valley to the left: minimum between previous peak (or start) and this peak
    const leftBoundary = pi > 0 ? candidatePeaks[pi - 1].index : 0;
    const leftValley = leftBoundary < peakIdx
      ? minInRange(signal, leftBoundary, peakIdx)
      : signal[0];

    // Find valley to the right: minimum between this peak and next peak (or end)
    const rightBoundary = pi < candidatePeaks.length - 1
      ? candidatePeaks[pi + 1].index
      : signal.length - 1;
    const rightValley = peakIdx < rightBoundary
      ? minInRange(signal, peakIdx, rightBoundary)
      : signal[signal.length - 1];

    // Prominence = peak height minus the higher of the two surrounding valleys
    const referenceValley = Math.max(leftValley, rightValley);
    const prominence = peak.amplitude - referenceValley;

    if (prominence >= minProminenceAbs) {
      peaks.push(peak);
    }
  }

  return peaks;
}

/**
 * Compute the median of an array (returns 0 for empty arrays).
 */
function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Streaming peak detector for real-time sample-by-sample processing.
 * Uses a lookback window to determine if the previous sample was a local maximum.
 */
export class StreamingPeakDetector {
  private options: Required<PeakDetectionOptions>;
  private buffer: number[] = [];
  private timestamps: (number | undefined)[] = [];
  private lastPeakIndex = -Infinity;
  private sampleIndex = 0;

  // For adaptive refractory period
  private recentIntervals: number[] = [];
  private currentRefractoryPeriod: number;

  // For prominence check: track the minimum value since the last peak
  private minSinceLastPeak: number = Infinity;
  private hasSeenFirstValue = false;

  constructor(options: PeakDetectionOptions) {
    this.options = {
      minPeakDistance: options.minPeakDistance,
      thresholdFactor: options.thresholdFactor ?? 0.5,
      adaptiveWindow: options.adaptiveWindow ?? 10,
      minProminence: options.minProminence ?? 0,
      adaptiveRefractory: options.adaptiveRefractory ?? false,
    };
    this.currentRefractoryPeriod = options.minPeakDistance;
  }

  /**
   * Add a new sample. Returns a DetectedPeak if the previous sample is identified as a peak.
   */
  addSample(value: number, timestamp?: number): DetectedPeak | null {
    // Track running minimum for prominence computation
    if (!this.hasSeenFirstValue) {
      this.minSinceLastPeak = value;
      this.hasSeenFirstValue = true;
    } else {
      if (value < this.minSinceLastPeak) {
        this.minSinceLastPeak = value;
      }
    }

    this.buffer.push(value);
    this.timestamps.push(timestamp);
    const currentIndex = this.sampleIndex++;

    // Need at least 3 samples: prev-prev, prev, current to determine if prev was a peak
    if (this.buffer.length < 3) {
      return null;
    }

    // The candidate is the second-to-last sample (one before the current)
    const candidateBufferIdx = this.buffer.length - 2;
    const candidateValue = this.buffer[candidateBufferIdx];
    const prevValue = this.buffer[candidateBufferIdx - 1];
    const nextValue = this.buffer[candidateBufferIdx + 1]; // = current value

    // Local maximum check
    if (candidateValue <= prevValue || candidateValue <= nextValue) {
      return null;
    }

    // Compute adaptive threshold from the window ending at the candidate
    const windowSize = this.options.adaptiveWindow;
    const windowStart = Math.max(0, candidateBufferIdx - windowSize + 1);
    const window = this.buffer.slice(windowStart, candidateBufferIdx + 1);
    const windowMean = mean(window);
    const windowStd = standardDeviation(window);
    const threshold =
      windowMean + this.options.thresholdFactor * windowStd;

    if (candidateValue <= threshold) {
      return null;
    }

    // The global sample index for the candidate
    const candidateGlobalIndex = currentIndex - 1;

    // Determine effective refractory period
    const effectiveRefractory = this.options.adaptiveRefractory
      ? this.currentRefractoryPeriod
      : this.options.minPeakDistance;

    // Refractory period check
    if (candidateGlobalIndex - this.lastPeakIndex < effectiveRefractory) {
      return null;
    }

    // Prominence check
    if (this.options.minProminence > 0) {
      // Compute running range from the buffer
      const range = signalRange(this.buffer);
      const minProminenceAbs = this.options.minProminence * range;

      // The valley since the last peak is the minimum value observed
      const nearestValley = this.minSinceLastPeak;
      const prominence = candidateValue - nearestValley;

      if (prominence < minProminenceAbs) {
        return null;
      }
    }

    // Update adaptive refractory period based on last 5 intervals
    if (this.options.adaptiveRefractory && this.lastPeakIndex !== -Infinity) {
      const interval = candidateGlobalIndex - this.lastPeakIndex;
      this.recentIntervals.push(interval);
      if (this.recentIntervals.length > 5) {
        this.recentIntervals.shift();
      }
      if (this.recentIntervals.length >= 2) {
        const medianInterval = median(this.recentIntervals);
        // Set refractory to 40% of median interval, but not less than configured minimum
        this.currentRefractoryPeriod = Math.max(
          this.options.minPeakDistance,
          Math.round(medianInterval * 0.4),
        );
      }
    }

    this.lastPeakIndex = candidateGlobalIndex;
    // Reset valley tracker for the next inter-peak period
    this.minSinceLastPeak = value; // start from current sample

    return {
      index: candidateGlobalIndex,
      amplitude: candidateValue,
      timestamp: this.timestamps[candidateBufferIdx],
    };
  }

  reset(): void {
    this.buffer = [];
    this.timestamps = [];
    this.lastPeakIndex = -Infinity;
    this.sampleIndex = 0;
    this.recentIntervals = [];
    this.currentRefractoryPeriod = this.options.minPeakDistance;
    this.minSinceLastPeak = Infinity;
    this.hasSeenFirstValue = false;
  }
}
