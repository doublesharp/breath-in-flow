import { describe, it, expect } from 'vitest';
import { fuseTrialResults, fuseAssessmentRuns } from '../../src/hrv/resultsFusion.js';
import type { HRVAnalysis } from '../../src/hrv/types.js';

/** Build a minimal HRVAnalysis for testing. */
function makeAnalysis(overrides: {
  lfPower?: number;
  amplitude?: number;
  smoothness?: number;
  synchrony?: number;
  signalQuality?: number;
}): HRVAnalysis {
  const {
    lfPower = 100,
    amplitude = 10,
    smoothness = 0.5,
    synchrony = 0.6,
    signalQuality = 0.8,
  } = overrides;

  return {
    timeDomain: {
      meanRR: 800,
      sdnn: 50,
      rmssd: 40,
      pnn50: 20,
      meanHR: 75,
      minHR: 65,
      maxHR: 85,
      hrRange: 20,
    },
    frequencyDomain: {
      vlfPower: 50,
      lfPower,
      hfPower: 30,
      totalPower: lfPower + 80,
      lfPowerNorm: 60,
      hfPowerNorm: 40,
      lfHfRatio: 1.5,
      lfPeak: 0.1,
      hfPeak: 0.25,
      spectrum: [],
    },
    resonance: {
      peakToTroughAmplitude: amplitude,
      waveformSmoothness: smoothness,
      phaseSynchrony: synchrony,
      lfPeakCount: 1,
      lfPeakAmplitude: lfPower * 0.8,
    },
    quality: {
      totalSamples: 100,
      artifactsDetected: 5,
      artifactPercentage: 5,
      meanSignalQuality: signalQuality,
    },
    raw: {
      rrIntervals: [],
      timestamps: [],
      instantaneousHR: [],
    },
  };
}

describe('fuseTrialResults', () => {
  it('passes through PPG-only results with PPG confidence', () => {
    const ppg = makeAnalysis({ lfPower: 120, amplitude: 12, smoothness: 0.7, synchrony: 0.8, signalQuality: 0.85 });
    const result = fuseTrialResults(ppg, undefined, 5.5);

    expect(result.source).toBe('ppg');
    expect(result.ppgAnalysis).toBe(ppg);
    expect(result.scgAnalysis).toBeUndefined();
    expect(result.fusedMetrics.lfPower).toBe(120);
    expect(result.fusedMetrics.peakToTroughAmplitude).toBe(12);
    expect(result.fusedMetrics.waveformSmoothness).toBe(0.7);
    expect(result.fusedMetrics.phaseSynchrony).toBe(0.8);
    expect(result.fusedMetrics.confidence).toBe(0.85);
    expect(result.rate).toBe(5.5);
  });

  it('passes through SCG-only results with SCG confidence', () => {
    const scg = makeAnalysis({ lfPower: 90, signalQuality: 0.7 });
    const result = fuseTrialResults(undefined, scg, 6.0);

    expect(result.source).toBe('scg');
    expect(result.scgAnalysis).toBe(scg);
    expect(result.ppgAnalysis).toBeUndefined();
    expect(result.fusedMetrics.lfPower).toBe(90);
    expect(result.fusedMetrics.confidence).toBe(0.7);
    expect(result.rate).toBe(6.0);
  });

  it('fuses dual sources with equal quality as simple average', () => {
    const ppg = makeAnalysis({ lfPower: 100, amplitude: 10, smoothness: 0.6, synchrony: 0.5, signalQuality: 0.8 });
    const scg = makeAnalysis({ lfPower: 100, amplitude: 10, smoothness: 0.6, synchrony: 0.5, signalQuality: 0.8 });
    const result = fuseTrialResults(ppg, scg, 5.5);

    expect(result.source).toBe('fused');
    expect(result.fusedMetrics.lfPower).toBeCloseTo(100);
    expect(result.fusedMetrics.peakToTroughAmplitude).toBeCloseTo(10);
    expect(result.fusedMetrics.waveformSmoothness).toBeCloseTo(0.6);
    expect(result.fusedMetrics.phaseSynchrony).toBeCloseTo(0.5);
  });

  it('weights by quality when unequal — higher quality dominates', () => {
    const ppg = makeAnalysis({ lfPower: 100, signalQuality: 0.9 });
    const scg = makeAnalysis({ lfPower: 200, signalQuality: 0.1 });

    const result = fuseTrialResults(ppg, scg, 5.0);

    // With weights 0.9 and 0.1: fused = (100*0.9 + 200*0.1) / 1.0 = 110
    expect(result.fusedMetrics.lfPower).toBeCloseTo(110);
    expect(result.source).toBe('fused');
  });

  it('boosts confidence when metrics agree within 25%', () => {
    // Same metrics, high quality
    const ppg = makeAnalysis({ lfPower: 100, amplitude: 10, smoothness: 0.6, synchrony: 0.5, signalQuality: 0.8 });
    const scg = makeAnalysis({ lfPower: 110, amplitude: 11, smoothness: 0.65, synchrony: 0.55, signalQuality: 0.8 });

    const result = fuseTrialResults(ppg, scg, 5.5);

    // Metrics agree: confidence = avg(0.8, 0.8) * 1.2 = 0.96
    expect(result.fusedMetrics.confidence).toBeCloseTo(0.96);
  });

  it('penalizes confidence when metrics disagree', () => {
    // Widely different metrics
    const ppg = makeAnalysis({ lfPower: 100, amplitude: 5, smoothness: 0.3, synchrony: 0.2, signalQuality: 0.8 });
    const scg = makeAnalysis({ lfPower: 300, amplitude: 20, smoothness: 0.9, synchrony: 0.9, signalQuality: 0.7 });

    const result = fuseTrialResults(ppg, scg, 5.5);

    // Metrics disagree: confidence = max(0.8, 0.7) * 0.7 = 0.56
    expect(result.fusedMetrics.confidence).toBeCloseTo(0.56);
  });

  it('caps confidence at 1.0 even with high quality agreeing metrics', () => {
    const ppg = makeAnalysis({ signalQuality: 0.95 });
    const scg = makeAnalysis({ signalQuality: 0.95 });
    const result = fuseTrialResults(ppg, scg, 5.5);

    // avg(0.95, 0.95) * 1.2 = 1.14 -> capped to 1.0
    expect(result.fusedMetrics.confidence).toBe(1);
  });

  it('returns zero metrics when neither source is provided', () => {
    const result = fuseTrialResults(undefined, undefined, 5.5);

    expect(result.fusedMetrics.lfPower).toBe(0);
    expect(result.fusedMetrics.confidence).toBe(0);
    expect(result.rate).toBe(5.5);
  });
});

describe('fuseAssessmentRuns', () => {
  it('matches trials by rate and returns fused results', () => {
    const ppgTrials = [
      { rate: 6.5, analysis: makeAnalysis({ lfPower: 80 }) },
      { rate: 5.5, analysis: makeAnalysis({ lfPower: 120 }) },
    ];
    const scgTrials = [
      { rate: 6.5, analysis: makeAnalysis({ lfPower: 90 }) },
      { rate: 5.0, analysis: makeAnalysis({ lfPower: 150 }) },
    ];

    const results = fuseAssessmentRuns(ppgTrials, scgTrials);

    // Should have 3 unique rates: 6.5, 5.5, 5.0 (descending)
    expect(results).toHaveLength(3);
    expect(results[0].rate).toBe(6.5);
    expect(results[0].source).toBe('fused'); // both have 6.5
    expect(results[1].rate).toBe(5.5);
    expect(results[1].source).toBe('ppg'); // only PPG has 5.5
    expect(results[2].rate).toBe(5.0);
    expect(results[2].source).toBe('scg'); // only SCG has 5.0
  });

  it('returns empty array when both runs are empty', () => {
    expect(fuseAssessmentRuns([], [])).toEqual([]);
  });
});
