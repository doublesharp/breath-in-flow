import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  limitAnalysisToEligibility,
  MeasurementSession,
} from '@/services/measurementSession';
import { analyzeHRV, evaluateMeasurementEligibility } from '@breath-in-flow/shared';
import type { IBISample } from '@breath-in-flow/shared';

function detectedSample(timestamp: number, source: 'ppg' | 'scg' = 'ppg'): IBISample {
  return {
    timestamp,
    interval: 1_000,
    quality: 0.9,
    provenance: { source, method: 'peak-detected' },
  };
}

function sensor(startResult: { ok: true } | { ok: false; reason: 'start-failed'; message: string }) {
  return {
    start: vi.fn().mockResolvedValue(startResult),
    stop: vi.fn(),
  };
}

describe('MeasurementSession', () => {
  let nowMs = 0;

  beforeEach(() => {
    vi.useFakeTimers();
    nowMs = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fails without starting elapsed time when the requested sensor cannot start', async () => {
    const camera = sensor({ ok: false, reason: 'start-failed', message: 'Camera failed' });
    const onElapsed = vi.fn();
    const session = new MeasurementSession({
      protocol: 'quick-check',
      noDataTimeoutMs: 5_000,
      now: () => nowMs,
      onElapsed,
    });

    const result = await session.start({ ppg: camera });
    vi.advanceTimersByTime(2_000);

    expect(result.ok).toBe(false);
    expect(session.getResult().state).toBe('failed');
    expect(onElapsed).not.toHaveBeenCalled();
    expect(camera.stop).not.toHaveBeenCalled();
  });

  it('moves to no-data and stops the sensor after five seconds without a detected beat', async () => {
    const camera = sensor({ ok: true });
    const session = new MeasurementSession({
      protocol: 'quick-check',
      noDataTimeoutMs: 5_000,
      now: () => nowMs,
    });

    await session.start({ ppg: camera });
    expect(session.getResult().state).toBe('acquiring');

    vi.advanceTimersByTime(5_001);

    expect(session.getResult().state).toBe('no-data');
    expect(camera.stop).toHaveBeenCalledOnce();
  });

  it('continues a dual session with the sensor that starts successfully', async () => {
    const camera = sensor({ ok: true });
    const motion = sensor({ ok: false, reason: 'start-failed', message: 'Motion failed' });
    const session = new MeasurementSession({
      protocol: 'morning-readiness',
      now: () => nowMs,
    });

    const result = await session.start({ ppg: camera, scg: motion });

    expect(result).toMatchObject({ ok: true, degradedSources: ['scg'] });
    expect(session.getResult().state).toBe('acquiring');
    expect(session.getResult().activeSources).toEqual(['ppg']);
  });

  it('keeps autocorrelation estimates out of the detected sample array', async () => {
    const camera = sensor({ ok: true });
    const session = new MeasurementSession({ protocol: 'quick-check', now: () => nowMs });
    await session.start({ ppg: camera });

    session.addHeartRateEstimate({
      timestamp: 500,
      bpm: 60,
      quality: 0.8,
      source: 'ppg',
      method: 'autocorrelation-estimate',
    });
    session.addDetectedSample(detectedSample(1_000));

    expect(session.getResult().estimates).toHaveLength(1);
    expect(session.getResult().samples).toHaveLength(1);
    expect(session.getResult().state).toBe('measuring');
  });

  it('stops cleanly once and calculates protocol-specific eligibility', async () => {
    const camera = sensor({ ok: true });
    const session = new MeasurementSession({
      protocol: 'quick-check',
      now: () => nowMs,
    });
    await session.start({ ppg: camera });

    for (let index = 0; index < 70; index++) {
      session.addDetectedSample(detectedSample(index * 1_000));
    }
    nowMs = 70_000;

    const first = session.stop();
    const second = session.stop();

    expect(camera.stop).toHaveBeenCalledOnce();
    expect(first.state).toBe('complete');
    expect(second).toEqual(first);
    expect(first.eligibility?.eligible).toBe(true);
    expect(first.eligibility?.availableMetrics).toContain('rmssd');
    expect(first.eligibility?.availableMetrics).not.toContain('frequency-domain');
  });

  it('removes frequency outputs when the selected protocol does not allow them', () => {
    const samples = Array.from({ length: 70 }, (_, index) => detectedSample(index * 1_000));
    const analysis = analyzeHRV(samples);
    const eligibility = evaluateMeasurementEligibility(samples, 'quick-check', 70);

    const limited = limitAnalysisToEligibility(analysis, eligibility);

    expect(limited.frequencyDomain.available).toBe(false);
    expect(limited.frequencyDomain.unavailableReason).toBe('protocol-not-supported');
    expect(limited.frequencyDomain.spectrum).toHaveLength(0);
    expect(limited.frequencyDomain.lfPeak).toBe(0);
    expect(limited.frequencyDomain.hfPeak).toBe(0);
  });
});
