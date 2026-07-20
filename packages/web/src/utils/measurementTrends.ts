import type { HrvMeasurement } from '../composables/useHrvStorage';

export interface WellnessInsight {
  id: 'rmssd-comparison';
  title: string;
  message: string;
  direction: 'higher' | 'lower' | 'similar';
}

function hasAvailableRmssd(measurement: HrvMeasurement): boolean {
  if (!Number.isFinite(measurement.analysis.timeDomain.rmssd)) return false;
  if (!measurement.eligibility) return true;
  return (
    measurement.eligibility.eligible && measurement.eligibility.availableMetrics.includes('rmssd')
  );
}

function hasComparableDuration(measurement: HrvMeasurement, anchor: HrvMeasurement): boolean {
  const toleranceSeconds = Math.max(15, anchor.durationSeconds * 0.1);
  return Math.abs(measurement.durationSeconds - anchor.durationSeconds) <= toleranceSeconds;
}

function hasComparableContext(measurement: HrvMeasurement, anchor: HrvMeasurement): boolean {
  if (measurement.sensorMode !== anchor.sensorMode) return false;
  if (measurement.breathingRateBPM === undefined && anchor.breathingRateBPM === undefined)
    return true;
  return measurement.breathingRateBPM === anchor.breathingRateBPM;
}

export function getComparableMeasurements(
  measurements: HrvMeasurement[],
  anchor: HrvMeasurement
): HrvMeasurement[] {
  return measurements
    .filter(
      (measurement) =>
        measurement.type === anchor.type &&
        hasComparableDuration(measurement, anchor) &&
        hasComparableContext(measurement, anchor) &&
        hasAvailableRmssd(measurement)
    )
    .sort((left, right) => left.completedAt.getTime() - right.completedAt.getTime());
}

export function buildWithinPersonInsights(measurements: HrvMeasurement[]): WellnessInsight[] {
  const eligibleMeasurements = measurements
    .filter(hasAvailableRmssd)
    .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime());
  const anchor = eligibleMeasurements.find(
    (candidate) => getComparableMeasurements(measurements, candidate).length >= 3
  );

  if (!anchor) return [];
  const comparable = getComparableMeasurements(measurements, anchor);

  const prior = comparable.filter((measurement) => measurement.id !== anchor.id);
  if (prior.length < 2) return [];
  const priorAverage =
    prior.reduce((sum, measurement) => sum + measurement.analysis.timeDomain.rmssd, 0) /
    prior.length;
  const changeRatio =
    priorAverage === 0 ? 0 : (anchor.analysis.timeDomain.rmssd - priorAverage) / priorAverage;
  const direction: WellnessInsight['direction'] =
    changeRatio > 0.1 ? 'higher' : changeRatio < -0.1 ? 'lower' : 'similar';
  const comparison = direction === 'similar' ? 'close to' : `${direction} than`;

  return [
    {
      id: 'rmssd-comparison',
      title: 'RMSSD comparison',
      direction,
      message: `Your latest RMSSD was ${comparison} your recent comparable measurements. For useful comparisons, collect readings with the same protocol, duration, sensor, and conditions.`,
    },
  ];
}
