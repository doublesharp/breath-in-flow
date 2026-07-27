import { mean } from '../dsp/statistics.js';
import { preprocessIBI } from './preprocessing.js';
import type {
  EligibilityReason,
  EligibilityWarning,
  IBISample,
  MeasurementEligibility,
  MeasurementProtocol,
  MetricGroup,
} from './types.js';

const MINIMUM_DURATION_SECONDS: Record<MeasurementProtocol, number> = {
  'quick-check': 60,
  'morning-readiness': 120,
  'full-analysis': 300,
  'resonance-trial': 120,
  freeform: 60,
};

export const MAX_PLAUSIBLE_IBI_MS = 2_000;
export const MINIMUM_COVERAGE_PERCENTAGE = 85;
export const COVERAGE_WARNING_PERCENTAGE = 95;
export const MAXIMUM_SAMPLE_GAP_SECONDS = 5;

export interface EligibilityOptions {
  hasUnresolvedSensorError?: boolean;
}

function metricGroupsFor(
  protocol: MeasurementProtocol,
  observedDurationSeconds: number
): MetricGroup[] {
  switch (protocol) {
    case 'quick-check':
    case 'morning-readiness':
      return ['average-pulse', 'rmssd', 'pnn50', 'sdnn-short-recording'];
    case 'full-analysis':
      return ['average-pulse', 'rmssd', 'pnn50', 'sdnn', 'frequency-domain', 'poincare'];
    case 'resonance-trial':
      return ['average-pulse', 'rmssd', 'pnn50', 'sdnn-short-recording', 'resonance-training'];
    case 'freeform':
      return observedDurationSeconds >= 300
        ? ['average-pulse', 'rmssd', 'pnn50', 'sdnn', 'frequency-domain', 'poincare']
        : ['average-pulse', 'rmssd', 'pnn50', 'sdnn-short-recording'];
  }
}

function temporalCoverage(
  samples: IBISample[],
  observedDurationSeconds: number
): { coveragePercentage: number; maximumGapSeconds: number } {
  if (
    samples.length < 2 ||
    !Number.isFinite(observedDurationSeconds) ||
    observedDurationSeconds <= 0
  ) {
    return { coveragePercentage: 0, maximumGapSeconds: 0 };
  }

  let coveredMilliseconds = 0;
  let maximumGapMilliseconds = 0;
  for (let index = 1; index < samples.length; index++) {
    const gap = samples[index].timestamp - samples[index - 1].timestamp;
    if (!Number.isFinite(gap) || gap <= 0) continue;
    maximumGapMilliseconds = Math.max(maximumGapMilliseconds, gap);

    // A detected sample's IBI describes the time actually represented by that
    // beat. Any timestamp gap beyond the IBI is unobserved time, not coverage.
    const representedInterval = samples[index].interval;
    if (Number.isFinite(representedInterval) && representedInterval > 0) {
      coveredMilliseconds += Math.min(gap, representedInterval);
    }
  }

  return {
    coveragePercentage: Math.min(
      100,
      (coveredMilliseconds / (observedDurationSeconds * 1_000)) * 100
    ),
    maximumGapSeconds: maximumGapMilliseconds / 1_000,
  };
}

export function evaluateMeasurementEligibility(
  samples: IBISample[],
  protocol: MeasurementProtocol,
  observedDurationSeconds: number,
  options: EligibilityOptions = {}
): MeasurementEligibility {
  const reasons = new Set<EligibilityReason>();
  const warnings = new Set<EligibilityWarning>();
  const { coveragePercentage, maximumGapSeconds } = temporalCoverage(
    samples,
    observedDurationSeconds
  );

  if (
    !Number.isFinite(observedDurationSeconds) ||
    observedDurationSeconds < MINIMUM_DURATION_SECONDS[protocol]
  ) {
    reasons.add('duration-too-short');
  }

  if (samples.length < Math.ceil(Math.max(0, observedDurationSeconds) / 2)) {
    reasons.add('insufficient-beats');
  }
  if (samples.length > 1 && coveragePercentage < MINIMUM_COVERAGE_PERCENTAGE) {
    reasons.add('insufficient-coverage');
  } else if (
    coveragePercentage >= MINIMUM_COVERAGE_PERCENTAGE &&
    coveragePercentage < COVERAGE_WARNING_PERCENTAGE
  ) {
    warnings.add('limited-coverage');
  }
  if (maximumGapSeconds > MAXIMUM_SAMPLE_GAP_SECONDS) {
    reasons.add('sample-gap-too-long');
  }

  const hasInvalidSample = samples.some(
    (sample) =>
      !Number.isFinite(sample.timestamp) ||
      !Number.isFinite(sample.interval) ||
      !Number.isFinite(sample.quality) ||
      sample.quality < 0 ||
      sample.quality > 1
  );
  if (hasInvalidSample) reasons.add('invalid-sample');

  for (let index = 1; index < samples.length; index++) {
    if (samples[index].timestamp <= samples[index - 1].timestamp) {
      reasons.add('non-monotonic-timestamps');
      break;
    }
  }

  if (samples.some((sample) => sample.interval < 300 || sample.interval > MAX_PLAUSIBLE_IBI_MS)) {
    reasons.add('implausible-interval');
  }

  if (samples.some((sample) => !sample.provenance)) {
    reasons.add('unknown-provenance');
  }
  if (samples.some((sample) => sample.provenance?.method === 'autocorrelation-estimate')) {
    reasons.add('estimated-samples');
  }

  const qualityValues = samples
    .map((sample) => sample.quality)
    .filter((quality) => Number.isFinite(quality));
  const meanQuality = qualityValues.length > 0 ? mean(qualityValues) : 0;
  if (meanQuality < 0.5) reasons.add('low-signal-quality');

  let artifactPercentage = 0;
  if (!hasInvalidSample && samples.length > 0) {
    const preprocessing = preprocessIBI(
      samples.map((sample) => sample.interval),
      samples.map((sample) => sample.timestamp)
    );
    artifactPercentage = (preprocessing.artifactCount / samples.length) * 100;
    if (artifactPercentage > 10) {
      reasons.add('too-many-artifacts');
    } else if (artifactPercentage >= 5) {
      warnings.add('elevated-artifacts');
    }
  }

  if (options.hasUnresolvedSensorError) reasons.add('sensor-error');

  const eligible = reasons.size === 0;
  if (
    eligible &&
    (protocol === 'quick-check' ||
      protocol === 'morning-readiness' ||
      protocol === 'resonance-trial' ||
      (protocol === 'freeform' && observedDurationSeconds < 300))
  ) {
    warnings.add('short-recording-sdnn');
  }

  return {
    eligible,
    reasons: [...reasons],
    warnings: [...warnings],
    availableMetrics: eligible ? metricGroupsFor(protocol, observedDurationSeconds) : [],
    artifactPercentage,
    meanQuality,
    detectedBeatCount: samples.length,
    observedDurationSeconds,
    coveragePercentage,
    maximumGapSeconds,
  };
}
