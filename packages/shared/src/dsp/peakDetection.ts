/**
 * Peak detection algorithms for physiological signals.
 * Supports both batch and streaming (real-time) modes.
 */

import { mean, standardDeviation } from './statistics.js';

export interface PeakDetectionOptions {
  minPeakDistance: number; // Minimum samples between peaks (refractory period)
  thresholdFactor?: number; // Threshold as fraction of signal range (default 0.5)
  adaptiveWindow?: number; // Window size for adaptive threshold (default 10)
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
 * Detect peaks in a signal array (batch mode).
 * A peak is a local maximum above the adaptive threshold, with minimum distance enforced.
 */
export function detectPeaks(
  signal: number[],
  options: PeakDetectionOptions,
): DetectedPeak[] {
  const { minPeakDistance } = options;
  const thresholdFactor = options.thresholdFactor ?? 0.5;
  const adaptiveWindow = options.adaptiveWindow ?? 10;

  if (signal.length < 3) return [];

  const thresholds = computeAdaptiveThreshold(
    signal,
    adaptiveWindow,
    thresholdFactor,
  );
  const peaks: DetectedPeak[] = [];
  let lastPeakIndex = -minPeakDistance; // allow first peak at index 0

  for (let i = 1; i < signal.length - 1; i++) {
    const val = signal[i];
    // Local maximum
    if (val > signal[i - 1] && val > signal[i + 1]) {
      // Above adaptive threshold
      if (val > thresholds[i]) {
        // Enforce refractory period
        if (i - lastPeakIndex >= minPeakDistance) {
          peaks.push({ index: i, amplitude: val });
          lastPeakIndex = i;
        }
      }
    }
  }

  return peaks;
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

  constructor(options: PeakDetectionOptions) {
    this.options = {
      minPeakDistance: options.minPeakDistance,
      thresholdFactor: options.thresholdFactor ?? 0.5,
      adaptiveWindow: options.adaptiveWindow ?? 10,
    };
  }

  /**
   * Add a new sample. Returns a DetectedPeak if the previous sample is identified as a peak.
   */
  addSample(value: number, timestamp?: number): DetectedPeak | null {
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

    // Refractory period check
    if (candidateGlobalIndex - this.lastPeakIndex < this.options.minPeakDistance) {
      return null;
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
  }
}
