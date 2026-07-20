import type { HRVAnalysis } from '@breath-in-flow/shared';

const ELIGIBILITY_REASONS = [
  'duration-too-short',
  'insufficient-beats',
  'invalid-sample',
  'non-monotonic-timestamps',
  'implausible-interval',
  'unknown-provenance',
  'estimated-samples',
  'low-signal-quality',
  'too-many-artifacts',
  'sensor-error',
] as const;
const FREQUENCY_REASONS = [
  ...ELIGIBILITY_REASONS,
  'insufficient-data',
  'invalid-series',
  'no-variability',
  'protocol-not-supported',
] as const;
const POINCARE_REASONS = [
  ...ELIGIBILITY_REASONS,
  'insufficient-data',
  'protocol-not-supported',
] as const;
const RESONANCE_REASONS = [
  ...ELIGIBILITY_REASONS,
  'insufficient-data',
  'missing-breathing-rate',
  'protocol-not-supported',
] as const;

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

function normalizeLegacySpectrum(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return null;
  if (
    !value.every(
      (point) =>
        isRecord(point) &&
        typeof point.frequency === 'number' &&
        Number.isFinite(point.frequency) &&
        typeof point.power === 'number' &&
        Number.isFinite(point.power) &&
        point.power >= 0
    )
  ) {
    return null;
  }

  const totalPower = value.reduce((sum, point) => sum + (point as { power: number }).power, 0);
  if (totalPower <= 0) return null;
  return value.map((point) => ({
    frequency: (point as { frequency: number }).frequency,
    power: ((point as { power: number }).power / totalPower) * 100,
  }));
}

/**
 * Converts the exact analysis shape persisted before a4d004c to the current
 * availability unions. Legacy absolute spectral powers are deliberately
 * discarded; only already-relative band values and a normalized spectrum are
 * retained. Current-shape and unrelated malformed values pass through for the
 * regular validator to handle.
 */
export function normalizeLegacyHrvAnalysis(
  value: unknown,
  context: { breathingRateBPM?: unknown } = {}
): unknown {
  if (!isRecord(value) || value.poincare !== undefined) return value;
  const frequency = value.frequencyDomain;
  const resonance = value.resonance;
  if (
    !isRecord(frequency) ||
    typeof frequency.available !== 'boolean' ||
    'value' in frequency ||
    'reason' in frequency ||
    !isRecord(resonance) ||
    'available' in resonance
  ) {
    return value;
  }

  const spectrum = normalizeLegacySpectrum(frequency.spectrum);
  const relativeFrequencyKeys = [
    'lfPowerNorm',
    'hfPowerNorm',
    'lfHfRatio',
    'lfPeak',
    'hfPeak',
  ] as const;
  const normalizedFrequency =
    frequency.available && spectrum && hasFiniteNumbers(frequency, relativeFrequencyKeys)
      ? {
          available: true as const,
          value: {
            lfPowerNorm: frequency.lfPowerNorm,
            hfPowerNorm: frequency.hfPowerNorm,
            lfHfRatio: frequency.lfHfRatio,
            lfPeak: frequency.lfPeak,
            hfPeak: frequency.hfPeak,
            spectrum,
          },
        }
      : {
          available: false as const,
          reason:
            frequency.available === false &&
            typeof frequency.unavailableReason === 'string' &&
            frequency.unavailableReason.length > 0
              ? frequency.unavailableReason
              : spectrum
                ? 'invalid-series'
                : 'no-variability',
        };

  const rrIntervals = isRecord(value.raw) ? value.raw.rrIntervals : undefined;
  const normalizedPoincare =
    isFiniteNumberArray(rrIntervals) && rrIntervals.length >= 2
      ? {
          available: true as const,
          value: {
            points: rrIntervals.slice(1).map((nextInterval, index) => ({
              previousInterval: rrIntervals[index],
              nextInterval,
            })),
          },
        }
      : { available: false as const, reason: 'insufficient-data' as const };

  const relativeLfPeakAmplitude = spectrum
    ? Math.max(
        0,
        ...spectrum
          .filter((point) => point.frequency >= 0.04 && point.frequency <= 0.15)
          .map((point) => point.power)
      )
    : null;
  const normalizedResonance =
    typeof context.breathingRateBPM === 'number' &&
    Number.isFinite(context.breathingRateBPM) &&
    relativeLfPeakAmplitude !== null &&
    hasFiniteNumbers(resonance, [
      'peakToTroughAmplitude',
      'waveformSmoothness',
      'phaseSynchrony',
      'lfPeakCount',
    ])
      ? {
          available: true as const,
          value: {
            peakToTroughAmplitude: resonance.peakToTroughAmplitude,
            waveformSmoothness: resonance.waveformSmoothness,
            phaseSynchrony: resonance.phaseSynchrony,
            lfPeakCount: resonance.lfPeakCount,
            lfPeakAmplitude: relativeLfPeakAmplitude,
          },
        }
      : {
          available: false as const,
          reason:
            typeof context.breathingRateBPM === 'number' &&
            Number.isFinite(context.breathingRateBPM)
              ? ('insufficient-data' as const)
              : ('missing-breathing-rate' as const),
        };

  return {
    ...value,
    frequencyDomain: normalizedFrequency,
    poincare: normalizedPoincare,
    resonance: normalizedResonance,
  };
}

function isAvailability(
  value: unknown,
  validateAvailableValue: (availableValue: unknown) => boolean,
  validReasons: readonly string[]
): boolean {
  if (!isRecord(value) || typeof value.available !== 'boolean') return false;
  return value.available
    ? validateAvailableValue(value.value)
    : typeof value.reason === 'string' && validReasons.includes(value.reason);
}

function isFrequencyDomain(value: unknown): boolean {
  return isAvailability(
    value,
    (availableValue) => {
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
    },
    FREQUENCY_REASONS
  );
}

function isPoincare(value: unknown): boolean {
  return isAvailability(
    value,
    (availableValue) => {
      if (!isRecord(availableValue) || !Array.isArray(availableValue.points)) return false;
      return availableValue.points.every(
        (point) => isRecord(point) && hasFiniteNumbers(point, ['previousInterval', 'nextInterval'])
      );
    },
    POINCARE_REASONS
  );
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
      ]),
    RESONANCE_REASONS
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
