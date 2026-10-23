/**
 * Peak detection algorithms for physiological signals.
 * Supports both batch and streaming (real-time) modes.
 */

import { mean, standardDeviation } from './statistics.js';

export interface PeakDetectionOptions {
  minPeakDistance: number; // Minimum samples between peaks (refractory period)
  thresholdFactor?: number; // Threshold as fraction of signal range (default 0.5)
  adaptiveWindow?: number; // Window size for adaptive threshold (default 10)
  minProminence?: number; // Fraction of batch range or streaming adaptive-window range (default 0)
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
  thresholdFactor: number
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
 * Find each sample's minimum up to the nearest strictly higher sample (or edge).
 * Scan left-to-right for left minima, and right-to-left for right minima.
 */
function prominenceMinima(signal: number[], direction: 1 | -1): number[] {
  const minima = new Array<number>(signal.length);
  const stack: number[] = [];
  const start = direction === 1 ? 0 : signal.length - 1;

  for (let i = start; i >= 0 && i < signal.length; i += direction) {
    let minimum = signal[i];
    // Stack heights decrease strictly. Each removed sample carries the minimum
    // back to its higher neighbor, so smaller shoulders and equal peaks cannot
    // truncate a valley. Each index is pushed and popped at most once: O(N).
    while (stack.length > 0 && signal[stack[stack.length - 1]] <= signal[i]) {
      minimum = Math.min(minimum, minima[stack.pop()!]);
    }
    minima[i] = minimum;
    stack.push(i);
  }

  return minima;
}

/**
 * Detect peaks in a signal array (batch mode).
 * A peak is a local maximum above the adaptive threshold, with minimum distance enforced.
 * Optional prominence filter rejects small bumps relative to the signal range.
 */
export function detectPeaks(signal: number[], options: PeakDetectionOptions): DetectedPeak[] {
  const { minPeakDistance } = options;
  const thresholdFactor = options.thresholdFactor ?? 0.5;
  const adaptiveWindow = options.adaptiveWindow ?? 10;
  const minProminenceFraction = options.minProminence ?? 0;

  if (signal.length < 3) return [];

  const thresholds = computeAdaptiveThreshold(signal, adaptiveWindow, thresholdFactor);
  const candidatePeaks: DetectedPeak[] = [];

  for (let i = 1; i < signal.length - 1; i++) {
    const val = signal[i];
    // Local maximum
    if (val > signal[i - 1] && val > signal[i + 1]) {
      // Above adaptive threshold
      if (val > thresholds[i]) {
        candidatePeaks.push({ index: i, amplitude: val });
      }
    }
  }

  if (candidatePeaks.length === 0) return [];

  const range = minProminenceFraction > 0 ? signalRange(signal) : 0;
  const minProminenceAbs = minProminenceFraction * range;
  const leftMinima = minProminenceFraction > 0 ? prominenceMinima(signal, 1) : [];
  const rightMinima = minProminenceFraction > 0 ? prominenceMinima(signal, -1) : [];

  const peaks: DetectedPeak[] = [];
  let lastPeakIndex = -minPeakDistance;
  for (const peak of candidatePeaks) {
    const peakIdx = peak.index;
    if (peakIdx - lastPeakIndex < minPeakDistance) continue;
    if (minProminenceFraction <= 0) {
      peaks.push(peak);
      lastPeakIndex = peakIdx;
      continue;
    }

    // Prominence = peak height minus the higher of the two surrounding valleys
    const referenceValley = Math.max(leftMinima[peakIdx], rightMinima[peakIdx]);
    const prominence = peak.amplitude - referenceValley;

    if (prominence >= minProminenceAbs) {
      peaks.push(peak);
      // Only accepted peaks start the refractory period.
      lastPeakIndex = peakIdx;
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
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
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
    this.buffer.push(value);
    this.timestamps.push(timestamp);
    const currentIndex = this.sampleIndex++;
    // Keep the candidate's adaptive window and its confirming next sample.
    // Trim before any early return so flat/noisy streams also stay bounded.
    const retainedLength = Math.max(3, this.options.adaptiveWindow + 1);
    if (this.buffer.length > retainedLength) {
      this.buffer.shift();
      this.timestamps.shift();
    }

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
    const threshold = windowMean + this.options.thresholdFactor * windowStd;

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
      // Old amplitude excursions must age out of the prominence reference.
      const range = signalRange(this.buffer);
      const minProminenceAbs = this.options.minProminence * range;

      const bufferStartIndex = currentIndex - this.buffer.length + 1;
      const valleyStart = Math.max(0, this.lastPeakIndex - bufferStartIndex + 1);
      const nearestValley = minInRange(this.buffer, valleyStart, this.buffer.length - 1);
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
          Math.round(medianInterval * 0.4)
        );
      }
    }

    this.lastPeakIndex = candidateGlobalIndex;

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
  }
}
