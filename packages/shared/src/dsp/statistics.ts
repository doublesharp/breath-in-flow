/**
 * Basic statistical functions for DSP operations.
 */

export function mean(data: number[]): number {
  if (data.length === 0) return 0;
  return data.reduce((sum, val) => sum + val, 0) / data.length;
}

export function standardDeviation(data: number[]): number {
  if (data.length < 2) return 0;
  const avg = mean(data);
  const squaredDiffs = data.map((val) => (val - avg) ** 2);
  return Math.sqrt(mean(squaredDiffs));
}

export function median(data: number[]): number {
  if (data.length === 0) return 0;
  const sorted = [...data].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function rms(data: number[]): number {
  if (data.length === 0) return 0;
  const sumOfSquares = data.reduce((sum, val) => sum + val * val, 0);
  return Math.sqrt(sumOfSquares / data.length);
}

export function movingAverage(data: number[], windowSize: number): number[] {
  if (data.length === 0 || windowSize <= 0) return [];
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(data.length, start + windowSize);
    const window = data.slice(start, end);
    result.push(mean(window));
  }
  return result;
}

export function movingStandardDeviation(
  data: number[],
  windowSize: number,
): number[] {
  if (data.length === 0 || windowSize <= 0) return [];
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    const start = Math.max(0, i - Math.floor(windowSize / 2));
    const end = Math.min(data.length, start + windowSize);
    const window = data.slice(start, end);
    result.push(standardDeviation(window));
  }
  return result;
}
