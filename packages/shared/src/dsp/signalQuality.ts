/**
 * Signal quality assessment for physiological signals.
 */

import type { DetectedPeak } from './peakDetection.js';
import { mean, standardDeviation, median } from './statistics.js';

/**
 * Assess overall signal quality based on detected peaks.
 * Returns a score from 0.0 (poor) to 1.0 (excellent).
 *
 * Considers:
 * - Peak regularity: std dev / mean of inter-peak intervals (lower = better)
 * - Amplitude consistency: std dev / mean of peak amplitudes (lower = better)
 * - Minimum peak count: need enough peaks to assess quality
 */
export function assessSignalQuality(signal: number[], peaks: DetectedPeak[]): number {
  if (peaks.length < 2) return 0;

  // Inter-peak intervals
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i].index - peaks[i - 1].index);
  }

  const intervalMean = mean(intervals);
  const intervalStd = standardDeviation(intervals);
  // Coefficient of variation: lower = more regular
  const intervalCV = intervalMean > 0 ? intervalStd / intervalMean : 1;

  // Amplitude consistency
  const amplitudes = peaks.map((p) => p.amplitude);
  const ampMean = mean(amplitudes);
  const ampStd = standardDeviation(amplitudes);
  const ampCV = ampMean > 0 ? ampStd / ampMean : 1;

  // SNR: ratio of peak amplitude to noise floor (estimated as signal std dev)
  const signalStd = standardDeviation(signal);
  const snrScore = signalStd > 0 ? Math.min(1, ampMean / (2 * signalStd)) : 0;

  // Convert CVs to scores (0 = bad, 1 = perfect)
  // CV of 0 = perfect regularity, CV of 1+ = poor
  const regularityScore = Math.max(0, 1 - intervalCV);
  const consistencyScore = Math.max(0, 1 - ampCV);

  // Weighted combination
  return Math.max(0, Math.min(1, 0.4 * regularityScore + 0.3 * consistencyScore + 0.3 * snrScore));
}

/**
 * Assess quality of an inter-beat interval (IBI) series.
 * Returns a score from 0.0 (poor) to 1.0 (excellent).
 *
 * Considers:
 * - Physiological range: intervals should be between 300ms and 2000ms
 * - Regularity: no sudden jumps > 20% of local median
 */
export function assessIBIQuality(intervals: number[]): number {
  if (intervals.length === 0) return 0;
  if (intervals.length === 1) {
    const ibi = intervals[0];
    return ibi >= 300 && ibi <= 2000 ? 1 : 0;
  }

  // Check physiological range
  const inRangeCount = intervals.filter((ibi) => ibi >= 300 && ibi <= 2000).length;
  const rangeScore = inRangeCount / intervals.length;

  // Check for sudden jumps (ectopic beats / artifacts)
  // Compute local median using a 5-sample window
  let jumpCount = 0;
  for (let i = 0; i < intervals.length; i++) {
    const start = Math.max(0, i - 2);
    const end = Math.min(intervals.length, i + 3);
    const window = [...intervals.slice(start, i), ...intervals.slice(i + 1, end)];
    if (window.length === 0) continue;
    const localMedian = median(window);
    if (localMedian > 0) {
      const relativeChange = Math.abs(intervals[i] - localMedian) / localMedian;
      if (relativeChange > 0.2) {
        jumpCount++;
      }
    }
  }
  const regularityScore = 1 - jumpCount / intervals.length;

  return 0.5 * rangeScore + 0.5 * regularityScore;
}
