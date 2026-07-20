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

export function evaluateMeasurementEligibility(
  samples: IBISample[],
  protocol: MeasurementProtocol,
  observedDurationSeconds: number,
  options: EligibilityOptions = {}
): MeasurementEligibility {
  const reasons = new Set<EligibilityReason>();
  const warnings = new Set<EligibilityWarning>();

  if (
    !Number.isFinite(observedDurationSeconds) ||
    observedDurationSeconds < MINIMUM_DURATION_SECONDS[protocol]
  ) {
    reasons.add('duration-too-short');
  }

  if (samples.length < Math.ceil(Math.max(0, observedDurationSeconds) / 2)) {
    reasons.add('insufficient-beats');
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
  };
}
