import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { limitAnalysisToEligibility, MeasurementSession } from '@/services/measurementSession';
import {
  analyzeHRV,
  evaluateMeasurementEligibility,
  finalizeMeasurement,
} from '@breath-in-flow/shared';
import type { IBISample } from '@breath-in-flow/shared';

function detectedSample(timestamp: number, source: 'ppg' | 'scg' = 'ppg'): IBISample {
  return {
    timestamp,
    interval: 1_000,
    quality: 0.9,
    provenance: { source, method: 'peak-detected' },
  };
}

function sensor(
  startResult: { ok: true } | { ok: false; reason: 'start-failed'; message: string }
) {
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

  it('refreshes the no-data watchdog after every accepted detected beat', async () => {
    const camera = sensor({ ok: true });
    const session = new MeasurementSession({
      protocol: 'quick-check',
      noDataTimeoutMs: 5_000,
      now: () => nowMs,
    });
    await session.start({ ppg: camera });

    session.addDetectedSample(detectedSample(0));
    vi.advanceTimersByTime(4_000);
    session.addDetectedSample(detectedSample(4_000));
    vi.advanceTimersByTime(4_999);

    expect(session.getResult().state).toBe('measuring');

    vi.advanceTimersByTime(1);

    expect(session.getResult().state).toBe('no-data');
    expect(camera.stop).toHaveBeenCalledOnce();
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
    expect(first.activeSources).toEqual(['ppg']);
  });

  it('uses finalized stop samples as the exact returned and eligibility series', async () => {
    const camera = sensor({ ok: true });
    const session = new MeasurementSession({ protocol: 'full-analysis', now: () => nowMs });
    await session.start({ ppg: camera });

    const captured = Array.from({ length: 309 }, (_, index) => detectedSample(index * 1_000));
    for (const sample of captured) session.addDetectedSample(sample);
    const finalized = finalizeMeasurement(captured, 'full-analysis', {
      settlingSeconds: 5,
      endingSeconds: 3,
    });

    const result = session.stop(finalized.samples);

    expect(result.samples).toEqual(finalized.samples);
    expect(result.eligibility).toEqual(finalized.eligibility);
    expect(result.eligibility?.observedDurationSeconds).toBe(300);
    expect(result.activeSources).toEqual(['ppg']);
  });

  it('interrupts once without producing a successful or eligible result', async () => {
    const camera = sensor({ ok: true });
    const onElapsed = vi.fn();
    const session = new MeasurementSession({
      protocol: 'quick-check',
      noDataTimeoutMs: 5_000,
      now: () => nowMs,
      onElapsed,
    });
    await session.start({ ppg: camera });
    session.addDetectedSample(detectedSample(1_000));

    const first = session.interrupt('The app was backgrounded. Restart the measurement.');
    const second = session.interrupt('A duplicate lifecycle event arrived.');
    const stopped = session.stop();
    vi.advanceTimersByTime(10_000);

    expect(camera.stop).toHaveBeenCalledOnce();
    expect(first).toMatchObject({
      state: 'interrupted',
      errorMessage: 'The app was backgrounded. Restart the measurement.',
      activeSources: ['ppg'],
    });
    expect(first.eligibility).toBeUndefined();
    expect(second).toEqual(first);
    expect(stopped).toEqual(first);
    expect(onElapsed).not.toHaveBeenCalled();
  });

  it('stops a sensor that finishes starting after the session was interrupted', async () => {
    let finishStarting!: (result: { ok: true }) => void;
    const camera = {
      start: vi.fn(
        () =>
          new Promise<{ ok: true }>((resolve) => {
            finishStarting = resolve;
          })
      ),
      stop: vi.fn(),
    };
    const session = new MeasurementSession({ protocol: 'quick-check', now: () => nowMs });

    const startOutcome = session.start({ ppg: camera });
    const interrupted = session.interrupt('Measurement interrupted while starting.');
    finishStarting({ ok: true });

    expect(await startOutcome).toEqual({
      ok: false,
      message: 'Measurement interrupted while starting.',
    });
    expect(interrupted.state).toBe('interrupted');
    expect(session.getResult().state).toBe('interrupted');
    expect(camera.stop).toHaveBeenCalledOnce();
  });

  it('removes frequency outputs when the selected protocol does not allow them', () => {
    const samples = Array.from({ length: 70 }, (_, index) => detectedSample(index * 1_000));
    const analysis = analyzeHRV(samples);
    const eligibility = evaluateMeasurementEligibility(samples, 'quick-check', 70);

    const limited = limitAnalysisToEligibility(analysis, eligibility);

    expect(limited.frequencyDomain).toEqual({
      available: false,
      reason: 'protocol-not-supported',
    });
    expect(limited.poincare).toEqual({
      available: false,
      reason: 'protocol-not-supported',
    });
    expect(limited.resonance).toEqual({
      available: false,
      reason: 'protocol-not-supported',
    });
  });

  it('keeps short-trial resonance available without exposing general frequency metrics', () => {
    const samples = Array.from({ length: 121 }, (_, index) => ({
      ...detectedSample(index * 1_000),
      interval: 1_000 + Math.sin(index / 2) * 50,
    }));
    const analysis = analyzeHRV(samples, 6);
    const eligibility = evaluateMeasurementEligibility(samples, 'resonance-trial', 120);

    const limited = limitAnalysisToEligibility(analysis, eligibility);

    expect(limited.frequencyDomain).toEqual({
      available: false,
      reason: 'protocol-not-supported',
    });
    expect(limited.resonance.available).toBe(true);
  });
});
