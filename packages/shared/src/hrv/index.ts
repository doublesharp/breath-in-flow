export * from './types.js';
export * from './preprocessing.js';
export * from './timeDomain.js';
export * from './frequencyDomain.js';
export * from './resonanceMetrics.js';
export * from './resultsFusion.js';
export * from './eligibility.js';
export * from './finalizeMeasurement.js';

import { mean } from '../dsp/statistics.js';
import type {
  IBISample,
  HRVAnalysis,
  MetricAvailability,
  PoincareMetrics,
  PoincareUnavailableReason,
  ResonanceMetrics,
  ResonanceUnavailableReason,
} from './types.js';
import { preprocessIBI } from './preprocessing.js';
import { computeTimeDomainMetrics } from './timeDomain.js';
import { computeFrequencyDomainMetrics } from './frequencyDomain.js';
import { computeResonanceMetrics } from './resonanceMetrics.js';

function availableMetric<T, Reason extends string>(value: T): MetricAvailability<T, Reason> {
  return { available: true, value };
}

function poincareMetrics(
  intervals: number[],
  unavailableForProtocol: boolean
): MetricAvailability<PoincareMetrics, PoincareUnavailableReason> {
  if (unavailableForProtocol) {
    return { available: false, reason: 'protocol-not-supported' };
  }
  if (intervals.length < 3) {
    return { available: false, reason: 'insufficient-data' };
  }

  return availableMetric({
    points: intervals.slice(0, -1).map((previousInterval, index) => ({
      previousInterval,
      nextInterval: intervals[index + 1],
    })),
  });
}

function normalizeIBISamples(samples: IBISample[]): {
  samples: IBISample[];
  discardedCount: number;
} {
  const finiteSamples = samples
    .filter(
      (sample) =>
        sample.provenance?.method === 'peak-detected' &&
        Number.isFinite(sample.timestamp) &&
        Number.isFinite(sample.interval) &&
        sample.interval > 0
    )
    .map((sample) => ({
      ...sample,
      quality: Number.isFinite(sample.quality) ? Math.min(1, Math.max(0, sample.quality)) : 0,
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const normalizedSamples: IBISample[] = [];
  let duplicateOrUnorderedCount = 0;

  for (const sample of finiteSamples) {
    const previous = normalizedSamples[normalizedSamples.length - 1];
    if (previous && sample.timestamp <= previous.timestamp) {
      duplicateOrUnorderedCount++;
      continue;
    }
    normalizedSamples.push(sample);
  }

  return {
    samples: normalizedSamples,
    discardedCount: samples.length - finiteSamples.length + duplicateOrUnorderedCount,
  };
}

/**
 * Full HRV analysis pipeline.
 *
 * @param samples           - raw IBI samples
 * @param breathingRateBPM  - optional breathing rate for resonance metrics
 */
export function analyzeHRV(samples: IBISample[], breathingRateBPM?: number): HRVAnalysis {
  const normalized = normalizeIBISamples(samples);
  const usableSamples = normalized.samples;

  // 1. Extract intervals and timestamps
  const rawIntervals = usableSamples.map((s) => s.interval);
  const rawTimestamps = usableSamples.map((s) => s.timestamp);
  const signalQualities = usableSamples.map((s) => s.quality);

  // 2. Preprocessing
  const preprocessed = preprocessIBI(rawIntervals, rawTimestamps);
  const { cleanedIntervals, cleanedTimestamps, artifactIndices } = preprocessed;

  // 3. Time-domain metrics
  const timeDomain = computeTimeDomainMetrics(cleanedIntervals);

  // 4. Frequency-domain metrics
  const computedFrequencyDomain = computeFrequencyDomainMetrics(
    cleanedIntervals,
    cleanedTimestamps
  );
  const hasBreathingContext =
    breathingRateBPM != null && Number.isFinite(breathingRateBPM) && breathingRateBPM > 0;
  const analysisDurationSeconds =
    cleanedTimestamps.length > 1 ? (cleanedTimestamps.at(-1)! - cleanedTimestamps[0]) / 1_000 : 0;
  const frequencyDomain = hasBreathingContext
    ? ({ available: false, reason: 'protocol-not-supported' } as const)
    : analysisDurationSeconds < 300
      ? ({ available: false, reason: 'duration-too-short' } as const)
      : computedFrequencyDomain;

  const poincare = poincareMetrics(cleanedIntervals, hasBreathingContext);

  // 5. Resonance metrics
  let resonance: MetricAvailability<ResonanceMetrics, ResonanceUnavailableReason>;
  if (hasBreathingContext && cleanedIntervals.length < 2) {
    resonance = { available: false, reason: 'insufficient-data' };
  } else if (hasBreathingContext && !computedFrequencyDomain.available) {
    resonance = { available: false, reason: computedFrequencyDomain.reason };
  } else if (hasBreathingContext && computedFrequencyDomain.available) {
    resonance = availableMetric(
      computeResonanceMetrics(
        cleanedIntervals,
        cleanedTimestamps,
        breathingRateBPM,
        computedFrequencyDomain.value.spectrum
      )
    );
  } else {
    resonance = { available: false, reason: 'missing-breathing-rate' };
  }

  // 6. Quality metrics
  const artifactsDetected = artifactIndices.length + normalized.discardedCount;
  const quality = {
    totalSamples: samples.length,
    artifactsDetected,
    artifactPercentage: samples.length > 0 ? (artifactsDetected / samples.length) * 100 : 0,
    meanSignalQuality: signalQualities.length > 0 ? mean(signalQualities) : 0,
  };

  // 7. Raw output
  const instantaneousHR = cleanedIntervals.map((rr) => 60000 / rr);

  return {
    timeDomain,
    frequencyDomain,
    poincare,
    resonance,
    quality,
    raw: {
      rrIntervals: cleanedIntervals,
      timestamps: cleanedTimestamps,
      instantaneousHR,
    },
  };
}
