import { median } from '../dsp/statistics.js';

export interface PreprocessingResult {
  cleanedIntervals: number[];
  cleanedTimestamps: number[];
  artifactIndices: number[];
  artifactCount: number;
}

const MIN_INTERVAL_MS = 300; // 200 BPM max
const MAX_INTERVAL_MS = 2000; // 30 BPM min
const ECTOPIC_THRESHOLD = 0.2; // 20% deviation from local median
const LOCAL_WINDOW = 5; // 5-beat window for local median

/**
 * Detects and corrects artifacts in IBI (Inter-Beat Interval) series.
 *
 * Steps:
 * 1. Range check: flag intervals outside 300-2000ms
 * 2. Ectopic detection: flag intervals >20% from local 5-beat median
 * 3. Linear interpolation correction for flagged intervals
 */
export function preprocessIBI(intervals: number[], timestamps: number[]): PreprocessingResult {
  if (intervals.length === 0) {
    return {
      cleanedIntervals: [],
      cleanedTimestamps: [],
      artifactIndices: [],
      artifactCount: 0,
    };
  }

  const n = intervals.length;
  const artifactFlags = new Array<boolean>(n).fill(false);

  // Step 1: Range check
  for (let i = 0; i < n; i++) {
    if (intervals[i] < MIN_INTERVAL_MS || intervals[i] > MAX_INTERVAL_MS) {
      artifactFlags[i] = true;
    }
  }

  // Step 2: Ectopic detection using local 5-beat median
  for (let i = 0; i < n; i++) {
    if (artifactFlags[i]) continue; // already flagged

    // Collect a window of valid (non-flagged) neighbors
    const halfWindow = Math.floor(LOCAL_WINDOW / 2);
    const windowStart = Math.max(0, i - halfWindow);
    const windowEnd = Math.min(n, i + halfWindow + 1);
    const windowValues: number[] = [];

    for (let j = windowStart; j < windowEnd; j++) {
      if (!artifactFlags[j]) {
        windowValues.push(intervals[j]);
      }
    }

    if (windowValues.length >= 2) {
      const localMedian = median(windowValues);
      const deviation = Math.abs(intervals[i] - localMedian) / localMedian;
      if (deviation > ECTOPIC_THRESHOLD) {
        artifactFlags[i] = true;
      }
    }
  }

  // Collect artifact indices
  const artifactIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (artifactFlags[i]) artifactIndices.push(i);
  }

  // Step 3: Linear interpolation correction
  const cleanedIntervals = [...intervals];
  for (const idx of artifactIndices) {
    // Find nearest valid intervals before and after
    let prevIdx = idx - 1;
    while (prevIdx >= 0 && artifactFlags[prevIdx]) prevIdx--;

    let nextIdx = idx + 1;
    while (nextIdx < n && artifactFlags[nextIdx]) nextIdx++;

    if (prevIdx >= 0 && nextIdx < n) {
      // Interpolate between surrounding valid values
      const t = (idx - prevIdx) / (nextIdx - prevIdx);
      cleanedIntervals[idx] = cleanedIntervals[prevIdx] * (1 - t) + cleanedIntervals[nextIdx] * t;
    } else if (prevIdx >= 0) {
      cleanedIntervals[idx] = cleanedIntervals[prevIdx];
    } else if (nextIdx < n) {
      cleanedIntervals[idx] = cleanedIntervals[nextIdx];
    }
  }

  return {
    cleanedIntervals,
    cleanedTimestamps: [...timestamps],
    artifactIndices,
    artifactCount: artifactIndices.length,
  };
}
