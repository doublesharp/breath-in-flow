import { describe, expect, it } from 'vitest';
import {
  evaluateMeasurementEligibility,
  type DetectionMethod,
  type IBISample,
  type MeasurementProtocol,
} from '../../src/hrv/index.js';

function samplesFor(
  durationSeconds: number,
  options: {
    quality?: number;
    method?: DetectionMethod;
    intervalAt?: { index: number; value: number };
  } = {}
): IBISample[] {
  const count = Math.ceil(durationSeconds / 0.8);
  let timestamp = 10_000;

  return Array.from({ length: count }, (_, index) => {
    const interval = options.intervalAt?.index === index ? options.intervalAt.value : 800;
    timestamp += 800;
    return {
      timestamp,
      interval,
      quality: options.quality ?? 0.8,
      provenance: {
        source: 'ppg',
        method: options.method ?? 'peak-detected',
      },
    };
  });
}

function evaluate(
  durationSeconds: number,
  protocol: MeasurementProtocol,
  samples = samplesFor(durationSeconds)
) {
  return evaluateMeasurementEligibility(samples, protocol, durationSeconds);
}

describe('evaluateMeasurementEligibility', () => {
  it('allows a quality morning recording and exposes only short-recording metrics', () => {
    const result = evaluate(130, 'morning-readiness');

    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([]);
    expect(result.availableMetrics).toEqual([
      'average-pulse',
      'rmssd',
      'pnn50',
      'sdnn-short-recording',
    ]);
    expect(result.availableMetrics).not.toContain('frequency-domain');
  });

  it('rejects autocorrelation estimates even when duration and quality pass', () => {
    const result = evaluate(
      130,
      'morning-readiness',
      samplesFor(130, { method: 'autocorrelation-estimate' })
    );

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('estimated-samples');
  });

  it('rejects samples without provenance for new measurement analysis', () => {
    const samples = samplesFor(130).map(({ provenance: _provenance, ...sample }) => sample);
    const result = evaluate(130, 'morning-readiness', samples);

    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('unknown-provenance');
  });

  it('enforces protocol-specific minimum durations', () => {
    expect(evaluate(59, 'quick-check').reasons).toContain('duration-too-short');
    expect(evaluate(119, 'morning-readiness').reasons).toContain('duration-too-short');
    expect(evaluate(299, 'full-analysis').reasons).toContain('duration-too-short');
    expect(evaluate(119, 'resonance-trial').reasons).toContain('duration-too-short');
  });

  it('rejects low-quality and sparse recordings', () => {
    const lowQuality = evaluate(130, 'morning-readiness', samplesFor(130, { quality: 0.49 }));
    const sparse = evaluate(130, 'morning-readiness', samplesFor(40));

    expect(lowQuality.reasons).toContain('low-signal-quality');
    expect(sparse.reasons).toContain('insufficient-beats');
  });

  it('rejects unordered timestamps and physiologically implausible intervals', () => {
    const unordered = samplesFor(130);
    unordered[20] = { ...unordered[20], timestamp: unordered[19].timestamp };
    const implausible = samplesFor(130, { intervalAt: { index: 20, value: 250 } });

    expect(evaluateMeasurementEligibility(unordered, 'morning-readiness', 130).reasons).toContain(
      'non-monotonic-timestamps'
    );
    expect(evaluateMeasurementEligibility(implausible, 'morning-readiness', 130).reasons).toContain(
      'implausible-interval'
    );
  });

  it('warns from five percent artifacts and rejects above ten percent', () => {
    const cautionSamples = samplesFor(60);
    for (const index of [10, 20, 30, 40, 50]) cautionSamples[index].interval = 1200;
    const rejectedSamples = samplesFor(60);
    for (const index of [5, 12, 19, 26, 33, 40, 47, 54, 61, 68]) {
      rejectedSamples[index].interval = 1200;
    }

    const caution = evaluateMeasurementEligibility(cautionSamples, 'quick-check', 60);
    const rejected = evaluateMeasurementEligibility(rejectedSamples, 'quick-check', 60);

    expect(caution.eligible).toBe(true);
    expect(caution.warnings).toContain('elevated-artifacts');
    expect(caution.artifactPercentage).toBeGreaterThanOrEqual(5);
    expect(rejected.eligible).toBe(false);
    expect(rejected.reasons).toContain('too-many-artifacts');
  });

  it('unlocks complete analysis and resonance groups only for their protocols', () => {
    expect(evaluate(300, 'full-analysis').availableMetrics).toContain('frequency-domain');
    expect(evaluate(300, 'full-analysis').availableMetrics).toContain('poincare');
    const resonanceTrial = evaluate(120, 'resonance-trial');
    expect(resonanceTrial.availableMetrics).toEqual([
      'average-pulse',
      'rmssd',
      'pnn50',
      'sdnn-short-recording',
      'resonance-training',
    ]);
    expect(resonanceTrial.availableMetrics).not.toContain('frequency-domain');
    expect(resonanceTrial.warnings).toContain('short-recording-sdnn');
  });

  it('switches freeform metric groups at five eligible minutes', () => {
    const shortRecording = evaluate(60, 'freeform');
    const fullRecording = evaluate(300, 'freeform');

    expect(shortRecording.availableMetrics).toContain('sdnn-short-recording');
    expect(shortRecording.availableMetrics).not.toContain('frequency-domain');
    expect(shortRecording.warnings).toContain('short-recording-sdnn');
    expect(fullRecording.availableMetrics).toContain('sdnn');
    expect(fullRecording.availableMetrics).toContain('frequency-domain');
    expect(fullRecording.warnings).not.toContain('short-recording-sdnn');
  });

  it('reports bounded reasons for an empty recording with invalid duration', () => {
    const result = evaluateMeasurementEligibility([], 'quick-check', Number.NaN);

    expect(result.eligible).toBe(false);
    expect(result.reasons).toEqual(['duration-too-short', 'low-signal-quality']);
    expect(result.artifactPercentage).toBe(0);
    expect(result.meanQuality).toBe(0);
  });

  it('does not preprocess non-finite sample quality as an artifact series', () => {
    const samples = samplesFor(60);
    samples[0] = { ...samples[0], quality: Number.NaN };

    const result = evaluateMeasurementEligibility(samples, 'quick-check', 60);

    expect(result.reasons).toContain('invalid-sample');
    expect(result.artifactPercentage).toBe(0);
  });

  it('rejects a recording with an unresolved sensor error', () => {
    const result = evaluateMeasurementEligibility(samplesFor(130), 'morning-readiness', 130, {
      hasUnresolvedSensorError: true,
    });

    expect(result.reasons).toContain('sensor-error');
  });
});
