import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createSensorFusionService,
  sensorFusionService,
  type FusedIBISample,
} from '../../src/services/sensorFusion';
import type { IBISample } from '@breath-in-flow/shared';

function makeSample(timestamp: number, interval: number, quality: number): IBISample {
  return { timestamp, interval, quality };
}

function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

describe('SensorFusionService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sensorFusionService.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    sensorFusionService.reset();
  });

  it('emits fused sample when both sensors agree', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    sensorFusionService.addPPGSample(makeSample(1000, 800, 0.8));
    sensorFusionService.addSCGSample(makeSample(1050, 810, 0.7));

    expect(emitted).toHaveLength(1);
    expect(emitted[0].source).toBe('fused');
    expect(emitted[0].provenance).toEqual({
      source: 'fused',
      method: 'peak-detected',
    });
  });

  it.each([140, -120])('learns and applies a stable signed offset of %ims', (offset) => {
    const service = createSensorFusionService();
    const emitted: FusedIBISample[] = [];
    service.setCallbacks({ onFusedIBI: (sample) => emitted.push(sample) });

    for (let index = 0; index < 4; index++) {
      const scgTimestamp = 1_000 + index * 1_000;
      service.addPPGSample(makeSample(scgTimestamp + offset, 800, 0.8));
      service.addSCGSample(makeSample(scgTimestamp, 805, 0.8));
    }

    expect(emitted).toHaveLength(4);
    expect(emitted.every((sample) => sample.source === 'fused')).toBe(true);
    expect(service.getEstimatedOffset()).toBe(offset);
  });

  it('tracks gradual bounded offset drift without duplicating matched beats', () => {
    const service = createSensorFusionService();
    const emitted: FusedIBISample[] = [];
    service.setCallbacks({ onFusedIBI: (sample) => emitted.push(sample) });

    [130, 140, 150, 160, 170].forEach((offset, index) => {
      const scgTimestamp = 1_000 + index * 1_000;
      service.addSCGSample(makeSample(scgTimestamp, 800, 0.8));
      service.addPPGSample(makeSample(scgTimestamp + offset, 805, 0.8));
    });
    vi.runOnlyPendingTimers();

    expect(emitted).toHaveLength(5);
    expect(emitted.every((sample) => sample.source === 'fused')).toBe(true);
    expect(service.getEstimatedOffset()).toBe(150);
  });

  it('pairs a reversed-arrival offset match exactly once after timers flush', () => {
    const service = createSensorFusionService();
    const emitted: FusedIBISample[] = [];
    service.setCallbacks({ onFusedIBI: (sample) => emitted.push(sample) });

    service.addSCGSample(makeSample(1_000, 800, 0.8));
    service.addPPGSample(makeSample(1_140, 805, 0.8));
    vi.runOnlyPendingTimers();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ source: 'fused', ppgInterval: 805, scgInterval: 800 });
  });

  it('retains a newer candidate when an older unmatched sample times out', () => {
    const service = createSensorFusionService();
    const emitted: FusedIBISample[] = [];
    service.setCallbacks({ onFusedIBI: (sample) => emitted.push(sample) });

    service.addPPGSample(makeSample(1_000, 800, 0.8));
    vi.advanceTimersByTime(50);
    service.addSCGSample(makeSample(2_000, 800, 0.8));
    vi.advanceTimersByTime(51);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].source).toBe('ppg');

    vi.advanceTimersByTime(50);
    expect(emitted).toHaveLength(2);
    expect(emitted[1].source).toBe('scg');
  });

  it('uses quality-weighted average when intervals agree within 30ms', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    // PPG: quality=0.8, interval=800; SCG: quality=0.4, interval=810
    // weighted avg = (800*0.8 + 810*0.4) / (0.8+0.4) = (640+324)/1.2 = 964/1.2 ≈ 803.33
    sensorFusionService.addPPGSample(makeSample(1000, 800, 0.8));
    sensorFusionService.addSCGSample(makeSample(1050, 810, 0.4));

    expect(emitted).toHaveLength(1);
    expect(emitted[0].source).toBe('fused');
    expect(emitted[0].interval).toBeCloseTo(803.33, 1);
    expect(emitted[0].ppgInterval).toBe(800);
    expect(emitted[0].scgInterval).toBe(810);
  });

  it('uses higher-quality source when intervals disagree', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    // Intervals differ by 50ms (>30ms) — PPG has higher quality
    sensorFusionService.addPPGSample(makeSample(1000, 800, 0.9));
    sensorFusionService.addSCGSample(makeSample(1050, 850, 0.5));

    expect(emitted).toHaveLength(1);
    expect(emitted[0].source).toBe('fused');
    expect(emitted[0].interval).toBe(800); // PPG wins (higher quality)
    expect(emitted[0].confidence).toBeCloseTo(0.9 * 0.7, 5);
  });

  it('emits single-source sample after timeout when only one sensor fires', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    sensorFusionService.addPPGSample(makeSample(1000, 800, 0.8));

    expect(emitted).toHaveLength(0);

    // Advance past the 100ms match window
    vi.advanceTimersByTime(101);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].source).toBe('ppg');
    expect(emitted[0].interval).toBe(800);
    expect(emitted[0].ppgInterval).toBe(800);
    expect(emitted[0].confidence).toBeCloseTo(0.8 * 0.8, 5);
  });

  it('emits SCG-only sample after timeout when only SCG fires', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    sensorFusionService.addSCGSample(makeSample(1000, 800, 0.7));
    vi.advanceTimersByTime(101);

    expect(emitted).toHaveLength(1);
    expect(emitted[0].source).toBe('scg');
    expect(emitted[0].scgInterval).toBe(800);
    expect(emitted[0].confidence).toBeCloseTo(0.7 * 0.8, 5);
  });

  it('flushes both unmatched pending sensors after the match window expires', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    sensorFusionService.addPPGSample(makeSample(1000, 800, 0.8));
    sensorFusionService.addSCGSample(makeSample(1201, 760, 0.7));

    expect(emitted).toHaveLength(0);

    vi.advanceTimersByTime(101);

    expect(emitted).toHaveLength(2);
    expect(emitted[0]).toMatchObject({
      source: 'ppg',
      interval: 800,
      ppgInterval: 800,
    });
    expect(emitted[1]).toMatchObject({
      source: 'scg',
      interval: 760,
      scgInterval: 760,
    });
  });

  it('does not overwrite an earlier same-sensor beat while waiting for a match', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (sample) => emitted.push(sample),
    });

    sensorFusionService.addPPGSample(makeSample(1_000, 800, 0.8));
    sensorFusionService.addPPGSample(makeSample(2_000, 790, 0.75));
    sensorFusionService.addSCGSample(makeSample(1_020, 805, 0.7));

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({
      source: 'fused',
      ppgInterval: 800,
      scgInterval: 805,
    });

    vi.advanceTimersByTime(101);

    expect(emitted).toHaveLength(2);
    expect(emitted[1]).toMatchObject({
      source: 'ppg',
      timestamp: 2_000,
      interval: 790,
      provenance: { source: 'ppg', method: 'peak-detected' },
    });
  });

  it('increases confidence after consecutive matches', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    // Fire 5 matching beats
    for (let i = 0; i < 5; i++) {
      const t = 1000 + i * 900;
      sensorFusionService.addPPGSample(makeSample(t, 800, 0.8));
      sensorFusionService.addSCGSample(makeSample(t + 30, 805, 0.8));
    }

    expect(emitted).toHaveLength(5);
    // After 5 consecutive matches the 1.2 multiplier should apply
    // (0.8+0.8)/2 * 1.2 = 0.96
    expect(emitted[4].confidence).toBeCloseTo(0.96, 5);
  });

  it('resets consecutive matches on disagreement', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    // Build up 5 consecutive matches
    for (let i = 0; i < 5; i++) {
      const t = 1000 + i * 900;
      sensorFusionService.addPPGSample(makeSample(t, 800, 0.8));
      sensorFusionService.addSCGSample(makeSample(t + 30, 805, 0.8));
    }

    // Now a disagreeing beat
    sensorFusionService.addPPGSample(makeSample(5500, 800, 0.9));
    sensorFusionService.addSCGSample(makeSample(5540, 850, 0.5));

    expect(emitted).toHaveLength(6);
    // Confidence after disagreement: max(0.9, 0.5) * 0.7 = 0.63
    expect(emitted[5].confidence).toBeCloseTo(0.63, 5);

    // Next agreement beat — consecutive matches reset to 1, no 1.2 multiplier yet
    sensorFusionService.addPPGSample(makeSample(6400, 800, 0.8));
    sensorFusionService.addSCGSample(makeSample(6430, 803, 0.8));
    expect(emitted[6].confidence).toBeCloseTo(0.8, 5); // no 1.2 boost
  });

  it('handles PPG-only and SCG-only gracefully', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    sensorFusionService.addPPGSample(makeSample(1000, 800, 0.8));
    vi.advanceTimersByTime(101);

    sensorFusionService.addSCGSample(makeSample(2000, 750, 0.6));
    vi.advanceTimersByTime(101);

    expect(emitted).toHaveLength(2);
    expect(emitted[0].source).toBe('ppg');
    expect(emitted[1].source).toBe('scg');
  });

  it('reset clears all state', () => {
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    sensorFusionService.addPPGSample(makeSample(1000, 800, 0.8));
    // Reset before the SCG sample or timeout
    sensorFusionService.reset();

    // Advance timers — no timeout should fire
    vi.advanceTimersByTime(200);
    expect(emitted).toHaveLength(0);

    expect(sensorFusionService.getQuality()).toBe(0);
  });

  it('fuzzes paired sensor samples and keeps fused output bounded', () => {
    const rng = createRng(0x51a7e);
    const emitted: FusedIBISample[] = [];
    sensorFusionService.setCallbacks({
      onFusedIBI: (s) => emitted.push(s),
    });

    for (let i = 0; i < 60; i++) {
      const baseTimestamp = 10_000 + i * 1_000;
      const timestampOffset = 60;
      const ppgInterval = randomInt(rng, 500, 1_200);
      const intervalsAgree = rng() < 0.65;
      const scgInterval =
        ppgInterval +
        (intervalsAgree
          ? randomInt(rng, -30, 30)
          : (rng() < 0.5 ? -1 : 1) * randomInt(rng, 31, 180));
      const ppgQuality = Number(rng().toFixed(4));
      const scgQuality = Number(rng().toFixed(4));
      const ppg = makeSample(baseTimestamp, ppgInterval, ppgQuality);
      const scg = makeSample(baseTimestamp + timestampOffset, scgInterval, scgQuality);
      const expectedLength = emitted.length + 1;

      if (rng() < 0.5) {
        sensorFusionService.addPPGSample(ppg);
        sensorFusionService.addSCGSample(scg);
      } else {
        sensorFusionService.addSCGSample(scg);
        sensorFusionService.addPPGSample(ppg);
      }

      expect(emitted).toHaveLength(expectedLength);

      const sample = emitted.at(-1)!;
      expect(sample.source).toBe('fused');
      expect(Number.isFinite(sample.timestamp)).toBe(true);
      expect(Number.isFinite(sample.interval)).toBe(true);
      expect(sample.confidence).toBeGreaterThanOrEqual(0);
      expect(sample.confidence).toBeLessThanOrEqual(1);
      expect(sample.quality).toBe(sample.confidence);
      expect(sample.ppgInterval).toBe(ppgInterval);
      expect(sample.scgInterval).toBe(scgInterval);

      const intervalDiff = Math.abs(ppgInterval - scgInterval);
      if (intervalDiff <= 30) {
        const totalQuality = ppgQuality + scgQuality;
        const expectedInterval =
          totalQuality > 0
            ? (ppgInterval * ppgQuality + scgInterval * scgQuality) / totalQuality
            : (ppgInterval + scgInterval) / 2;
        expect(sample.interval).toBeCloseTo(expectedInterval, 6);
      } else {
        const expectedInterval = ppgQuality >= scgQuality ? ppgInterval : scgInterval;
        expect(sample.interval).toBe(expectedInterval);
      }
    }
  });
});
