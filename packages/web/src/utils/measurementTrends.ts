import type { HrvMeasurement } from '../composables/useHrvStorage';

export interface WellnessInsight {
  id: 'rmssd-comparison';
  title: string;
  message: string;
  direction: 'higher' | 'lower' | 'similar';
}

export type ComparableMetric = 'rmssd' | 'average-pulse' | 'frequency-domain';

function hasAvailableMetric(measurement: HrvMeasurement, metric: ComparableMetric): boolean {
  const eligibility = measurement.eligibility;
  if (!eligibility?.eligible || !eligibility.availableMetrics.includes(metric)) return false;

  if (metric === 'rmssd') return Number.isFinite(measurement.analysis.timeDomain.rmssd);
  if (metric === 'average-pulse') return Number.isFinite(measurement.analysis.timeDomain.meanHR);
  return (
    measurement.analysis.frequencyDomain.available &&
    Number.isFinite(measurement.analysis.frequencyDomain.value.lfPowerNorm)
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
  anchor: HrvMeasurement,
  metric: ComparableMetric = 'rmssd'
): HrvMeasurement[] {
  return measurements
    .filter(
      (measurement) =>
        measurement.type === anchor.type &&
        hasComparableDuration(measurement, anchor) &&
        hasComparableContext(measurement, anchor) &&
        hasAvailableMetric(measurement, metric)
    )
    .sort((left, right) => left.completedAt.getTime() - right.completedAt.getTime());
}

export function getLatestComparableMeasurements(
  measurements: HrvMeasurement[],
  metric: ComparableMetric,
  type?: HrvMeasurement['type']
): HrvMeasurement[] {
  const anchor = measurements
    .filter(
      (measurement) =>
        (!type || measurement.type === type) && hasAvailableMetric(measurement, metric)
    )
    .sort((left, right) => right.completedAt.getTime() - left.completedAt.getTime())[0];
  return anchor ? getComparableMeasurements(measurements, anchor, metric) : [];
}

export function buildWithinPersonInsights(measurements: HrvMeasurement[]): WellnessInsight[] {
  const eligibleMeasurements = measurements
    .filter((measurement) => hasAvailableMetric(measurement, 'rmssd'))
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
