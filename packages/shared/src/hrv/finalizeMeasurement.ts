import { evaluateMeasurementEligibility } from './eligibility.js';
import type { IBISample, MeasurementEligibility, MeasurementProtocol } from './types.js';

export interface FinalizeMeasurementOptions {
  settlingSeconds?: number;
  endingSeconds?: number;
}

export interface FinalizedMeasurement {
  samples: IBISample[];
  analyzedDurationSeconds: number;
  eligibility: MeasurementEligibility;
}

function nonNegativeSeconds(value: number | undefined): number {
  return Number.isFinite(value) && value! > 0 ? value! : 0;
}

export function finalizeMeasurement(
  samples: IBISample[],
  protocol: MeasurementProtocol,
  options: FinalizeMeasurementOptions = {}
): FinalizedMeasurement {
  // Trimming assumes an ordered capture. Reject malformed timing before a
  // timestamp outside the retained interval can silently disappear.
  if (
    samples.some(
      (sample, index) =>
        !Number.isFinite(sample.timestamp) ||
        (index > 0 && sample.timestamp <= samples[index - 1].timestamp)
    )
  ) {
    return {
      samples: samples.slice(),
      analyzedDurationSeconds: 0,
      eligibility: evaluateMeasurementEligibility(samples, protocol, 0),
    };
  }
  const firstTimestamp = samples.at(0)?.timestamp;
  const lastTimestamp = samples.at(-1)?.timestamp;
  const settlingMilliseconds = nonNegativeSeconds(options.settlingSeconds) * 1_000;
  const endingMilliseconds = nonNegativeSeconds(options.endingSeconds) * 1_000;

  const retainedSamples =
    firstTimestamp === undefined || lastTimestamp === undefined
      ? []
      : samples.filter(
          (sample) =>
            sample.timestamp >= firstTimestamp + settlingMilliseconds &&
            sample.timestamp <= lastTimestamp - endingMilliseconds
        );

  const analyzedDurationSeconds =
    retainedSamples.length > 1
      ? Math.max(0, (retainedSamples.at(-1)!.timestamp - retainedSamples[0].timestamp) / 1_000)
      : 0;

  return {
    samples: retainedSamples,
    analyzedDurationSeconds,
    eligibility: evaluateMeasurementEligibility(retainedSamples, protocol, analyzedDurationSeconds),
  };
}
