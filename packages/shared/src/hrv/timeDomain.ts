import { mean, standardDeviation } from '../dsp/statistics.js';
import type { TimeDomainMetrics } from './types.js';

/**
 * Computes time-domain HRV metrics from a series of RR intervals (ms).
 */
export function computeTimeDomainMetrics(rrIntervals: number[]): TimeDomainMetrics {
  if (rrIntervals.length === 0) {
    return {
      meanRR: 0,
      sdnn: 0,
      rmssd: 0,
      pnn50: 0,
      meanHR: 0,
      minHR: 0,
      maxHR: 0,
      hrRange: 0,
    };
  }

  // meanRR
  const meanRR = mean(rrIntervals);

  // sdnn: standard deviation of all NN intervals
  const sdnn = standardDeviation(rrIntervals);

  // Successive differences
  const successiveDiffs: number[] = [];
  for (let i = 1; i < rrIntervals.length; i++) {
    successiveDiffs.push(rrIntervals[i] - rrIntervals[i - 1]);
  }

  // rmssd: root mean square of successive differences
  let rmssd = 0;
  if (successiveDiffs.length > 0) {
    const sumSq = successiveDiffs.reduce((acc, d) => acc + d * d, 0);
    rmssd = Math.sqrt(sumSq / successiveDiffs.length);
  }

  // pnn50: percentage of successive differences > 50ms
  let pnn50 = 0;
  if (successiveDiffs.length > 0) {
    const count50 = successiveDiffs.filter((d) => Math.abs(d) > 50).length;
    pnn50 = (count50 / successiveDiffs.length) * 100;
  }

  // HR calculations
  const meanHR = 60000 / meanRR;
  const minRR = Math.min(...rrIntervals);
  const maxRR = Math.max(...rrIntervals);
  // minHR = 60000/maxRR, maxHR = 60000/minRR
  const minHR = 60000 / maxRR;
  const maxHR = 60000 / minRR;
  const hrRange = maxHR - minHR;

  return {
    meanRR,
    sdnn,
    rmssd,
    pnn50,
    meanHR,
    minHR,
    maxHR,
    hrRange,
  };
}
