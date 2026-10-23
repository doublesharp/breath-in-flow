import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MeasurementSession } from '@/services/measurementSession';
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

  it('rejects a second start and supplies a fallback when no sensors are requested', async () => {
    const camera = sensor({ ok: true });
    const started = new MeasurementSession({ protocol: 'quick-check', now: () => nowMs });
    await started.start({ ppg: camera });

    await expect(started.start({ ppg: camera })).resolves.toEqual({
      ok: false,
      message: 'Measurement session has already started.',
    });

    const empty = new MeasurementSession({ protocol: 'quick-check', now: () => nowMs });
    await expect(empty.start({})).resolves.toEqual({
      ok: false,
      message: 'No sensor could be started.',
    });
    expect(empty.getResult()).toMatchObject({
      state: 'failed',
      errorMessage: 'No sensor could be started.',
    });
  });

  it.each(['throw', 'reject'] as const)(
    'cleans up an adapter that fails with %s and resolves a failed start',
    async (failure) => {
      const error = new Error('Camera startup crashed.');
      const camera = {
        start: vi.fn(() => {
          if (failure === 'throw') throw error;
          return Promise.reject(error);
        }),
        stop: vi.fn(),
      };
      const onElapsed = vi.fn();
      const session = new MeasurementSession({ protocol: 'quick-check', onElapsed });

      await expect(session.start({ ppg: camera })).resolves.toEqual({
        ok: false,
        message: error.message,
      });
      expect(camera.stop).toHaveBeenCalledOnce();
      expect(session.getResult()).toMatchObject({
        state: 'failed',
        activeSources: [],
        errorMessage: error.message,
      });
      expect(
        (session as unknown as { pendingSensors: Map<unknown, unknown> }).pendingSensors.size
      ).toBe(0);
      vi.advanceTimersByTime(10_000);
      expect(onElapsed).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('continues with a healthy peer when a pending adapter rejects', async () => {
    let rejectCamera!: (error: Error) => void;
    const camera = {
      start: vi.fn(() => new Promise<{ ok: true }>((_resolve, reject) => (rejectCamera = reject))),
      stop: vi.fn(),
    };
    const motion = sensor({ ok: true });
    const session = new MeasurementSession({ protocol: 'quick-check' });
    const pending = session.start({ ppg: camera, scg: motion });
    await Promise.resolve();
    expect(session.getResult().activeSources).toEqual(['scg']);

    rejectCamera(new Error('Camera startup crashed.'));

    await expect(pending).resolves.toEqual({ ok: true, degradedSources: ['ppg'] });
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(motion.stop).not.toHaveBeenCalled();
    expect(session.getResult()).toMatchObject({ state: 'acquiring', activeSources: ['scg'] });
    session.addDetectedSample(detectedSample(1_000, 'scg'));
    expect(session.getResult().state).toBe('measuring');
    session.stop();
    expect(camera.stop).toHaveBeenCalledOnce();
    expect(motion.stop).toHaveBeenCalledOnce();
  });

  it('cleans up a rejected pending start without changing an interrupted session', async () => {
    let rejectCamera!: (error: unknown) => void;
    const camera = {
      start: vi.fn(() => new Promise<{ ok: true }>((_resolve, reject) => (rejectCamera = reject))),
      stop: vi.fn(),
    };
    const session = new MeasurementSession({ protocol: 'quick-check' });
    const pending = session.start({ ppg: camera });
    session.interrupt('App backgrounded.');
    rejectCamera('Camera registration cancelled.');

    await expect(pending).resolves.toEqual({ ok: false, message: 'App backgrounded.' });
    expect(session.getResult().state).toBe('interrupted');
    expect(camera.stop).toHaveBeenCalledTimes(2);
    expect(
      (session as unknown as { pendingSensors: Map<unknown, unknown> }).pendingSensors.size
    ).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
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

  it('records only sensors that contributed retained detected samples', async () => {
    const camera = sensor({ ok: true });
    const motion = sensor({ ok: true });
    const session = new MeasurementSession({
      protocol: 'quick-check',
      now: () => nowMs,
    });
    await session.start({ ppg: camera, scg: motion });

    for (let index = 0; index < 70; index++) {
      session.addDetectedSample(detectedSample(index * 1_000, 'ppg'));
    }
    const result = session.stop();

    expect(result.activeSources).toEqual(['ppg']);
  });

  it('makes a completed recording ineligible after an unresolved sensor error', async () => {
    const camera = sensor({ ok: true });
    const session = new MeasurementSession({
      protocol: 'quick-check',
      now: () => nowMs,
    });
    await session.start({ ppg: camera });
    for (let index = 0; index < 70; index++) {
      session.addDetectedSample(detectedSample(index * 1_000));
    }

    session.reportSensorError(new Error('Camera stream stopped unexpectedly.'));
    const result = session.stop();

    expect(result.eligibility?.reasons).toContain('sensor-error');
    expect(result.errorMessage).toContain('Camera stream stopped');
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

  it('ignores samples and estimates outside acquisition plus invalid detected samples', async () => {
    const camera = sensor({ ok: true });
    const session = new MeasurementSession({ protocol: 'quick-check', now: () => nowMs });
    const estimate = {
      timestamp: 500,
      bpm: 60,
      quality: 0.8,
      source: 'ppg' as const,
      method: 'autocorrelation-estimate' as const,
    };

    session.addDetectedSample(detectedSample(0));
    session.addHeartRateEstimate(estimate);
    await session.start({ ppg: camera });
    session.addDetectedSample({
      ...detectedSample(1_000),
      provenance: { source: 'ppg', method: 'autocorrelation-estimate' },
    });
    session.addDetectedSample({ ...detectedSample(2_000), timestamp: Number.NaN });
    session.addDetectedSample({ ...detectedSample(3_000), interval: Number.POSITIVE_INFINITY });
    session.addDetectedSample({ ...detectedSample(4_000), quality: Number.NaN });

    expect(session.getResult()).toMatchObject({ samples: [], estimates: [] });

    session.stop();
    session.addDetectedSample(detectedSample(5_000));
    session.addHeartRateEstimate(estimate);
    expect(session.getResult()).toMatchObject({ samples: [], estimates: [] });
  });

  it('completes an empty capture with zero observed duration', async () => {
    const camera = sensor({ ok: true });
    const session = new MeasurementSession({ protocol: 'quick-check', now: () => nowMs });
    await session.start({ ppg: camera });

    const result = session.stop();

    expect(result.state).toBe('complete');
    expect(result.samples).toEqual([]);
    expect(result.eligibility?.observedDurationSeconds).toBe(0);
    expect(result.eligibility?.eligible).toBe(false);
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

  it.each(['interrupt', 'stop'] as const)(
    'stops a pending sensor immediately on %s and cleans up a late successful start',
    async (action) => {
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
      const ended =
        action === 'interrupt'
          ? session.interrupt('Measurement interrupted while starting.')
          : session.stop();
      expect(camera.stop).toHaveBeenCalledOnce();
      expect(ended.activeSources).toEqual([]);
      finishStarting({ ok: true });

      expect(await startOutcome).toMatchObject({ ok: false });
      expect(session.getResult().state).toBe(action === 'interrupt' ? 'interrupted' : 'complete');
      expect(camera.stop).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
    }
  );

  it('stops an already-started adapter immediately while a sibling is still pending', async () => {
    const camera = sensor({ ok: true });
    let finishMotionStart!: (result: { ok: true }) => void;
    const motion = {
      start: vi.fn(
        () =>
          new Promise<{ ok: true }>((resolve) => {
            finishMotionStart = resolve;
          })
      ),
      stop: vi.fn(),
    };
    const session = new MeasurementSession({ protocol: 'morning-readiness', now: () => nowMs });

    const startOutcome = session.start({ ppg: camera, scg: motion });
    await Promise.resolve();
    await Promise.resolve();

    const interrupted = session.interrupt('Measurement interrupted during dual startup.');

    expect(camera.stop).toHaveBeenCalledOnce();
    expect(motion.stop).toHaveBeenCalledOnce();
    expect(interrupted.activeSources).toEqual(['ppg']);

    finishMotionStart({ ok: true });

    expect(await startOutcome).toEqual({
      ok: false,
      message: 'Measurement interrupted during dual startup.',
    });
    expect(motion.stop).toHaveBeenCalledTimes(2);
    expect(session.getResult().activeSources).toEqual(['ppg']);
  });

  it('removes frequency outputs when the selected protocol does not allow them', () => {
    const samples = Array.from({ length: 70 }, (_, index) => detectedSample(index * 1_000));
    const eligibility = evaluateMeasurementEligibility(samples, 'quick-check', 70);
    const limited = analyzeHRV({ samples, analyzedDurationSeconds: 70, eligibility });

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
    const eligibility = evaluateMeasurementEligibility(samples, 'resonance-trial', 120);
    const limited = analyzeHRV({ samples, analyzedDurationSeconds: 120, eligibility }, 6);

    expect(limited.frequencyDomain).toEqual({
      available: false,
      reason: 'protocol-not-supported',
    });
    expect(limited.resonance.available).toBe(true);
  });

  it('uses the bounded fallback reason when an ineligible contract has no reasons', () => {
    const samples = Array.from({ length: 70 }, (_, index) => detectedSample(index * 1_000));
    const eligibility = evaluateMeasurementEligibility(samples, 'quick-check', 70);
    const limited = analyzeHRV({
      samples,
      analyzedDurationSeconds: 70,
      eligibility: {
        ...eligibility,
        eligible: false,
        reasons: [],
        availableMetrics: [],
      },
    });

    expect(limited.frequencyDomain).toEqual({
      available: false,
      reason: 'insufficient-data',
    });
  });
});
