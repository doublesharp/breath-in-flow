import type { HRVAnalysis } from '@breath-in-flow/shared';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasFiniteNumbers(record: Record<string, unknown>, keys: readonly string[]): boolean {
  return keys.every((key) => typeof record[key] === 'number' && Number.isFinite(record[key]));
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
  );
}

function isAvailability(
  value: unknown,
  validateAvailableValue: (availableValue: unknown) => boolean
): boolean {
  if (!isRecord(value) || typeof value.available !== 'boolean') return false;
  return value.available
    ? validateAvailableValue(value.value)
    : typeof value.reason === 'string' && value.reason.length > 0;
}

function isFrequencyDomain(value: unknown): boolean {
  return isAvailability(value, (availableValue) => {
    if (!isRecord(availableValue)) return false;
    if (
      !hasFiniteNumbers(availableValue, [
        'lfPowerNorm',
        'hfPowerNorm',
        'lfHfRatio',
        'lfPeak',
        'hfPeak',
      ]) ||
      !Array.isArray(availableValue.spectrum)
    ) {
      return false;
    }
    return availableValue.spectrum.every(
      (point) => isRecord(point) && hasFiniteNumbers(point, ['frequency', 'power'])
    );
  });
}

function isPoincare(value: unknown): boolean {
  return isAvailability(value, (availableValue) => {
    if (!isRecord(availableValue) || !Array.isArray(availableValue.points)) return false;
    return availableValue.points.every(
      (point) => isRecord(point) && hasFiniteNumbers(point, ['previousInterval', 'nextInterval'])
    );
  });
}

function isResonance(value: unknown): boolean {
  return isAvailability(
    value,
    (availableValue) =>
      isRecord(availableValue) &&
      hasFiniteNumbers(availableValue, [
        'peakToTroughAmplitude',
        'waveformSmoothness',
        'phaseSynchrony',
        'lfPeakCount',
        'lfPeakAmplitude',
      ])
  );
}

export function isHrvAnalysis(value: unknown): value is HRVAnalysis {
  if (!isRecord(value)) return false;
  const { timeDomain, quality, raw } = value;
  return (
    isRecord(timeDomain) &&
    hasFiniteNumbers(timeDomain, [
      'meanRR',
      'sdnn',
      'rmssd',
      'pnn50',
      'meanHR',
      'minHR',
      'maxHR',
      'hrRange',
    ]) &&
    isFrequencyDomain(value.frequencyDomain) &&
    isPoincare(value.poincare) &&
    isResonance(value.resonance) &&
    isRecord(quality) &&
    hasFiniteNumbers(quality, [
      'totalSamples',
      'artifactsDetected',
      'artifactPercentage',
      'meanSignalQuality',
    ]) &&
    isRecord(raw) &&
    isFiniteNumberArray(raw.rrIntervals) &&
    isFiniteNumberArray(raw.timestamps) &&
    isFiniteNumberArray(raw.instantaneousHR)
  );
}
