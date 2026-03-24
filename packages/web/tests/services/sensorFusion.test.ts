import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sensorFusionService, type FusedIBISample } from '../../src/services/sensorFusion';
import type { IBISample } from '@breath-in-flow/shared';

function makeSample(timestamp: number, interval: number, quality: number): IBISample {
  return { timestamp, interval, quality };
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
});
