import { describe, expect, it } from 'vitest';
import { isHrvAnalysis, normalizeLegacyHrvAnalysis } from '../../src/utils/hrvAnalysisValidation';

function validCurrentAnalysis() {
  return {
    timeDomain: {
      meanRR: 800,
      sdnn: 40,
      rmssd: 35,
      pnn50: 20,
      meanHR: 75,
      minHR: 65,
      maxHR: 85,
      hrRange: 20,
    },
    frequencyDomain: {
      available: true,
      value: {
        lfPowerNorm: 55,
        hfPowerNorm: 45,
        lfHfRatio: 1.2,
        lfPeak: 0.1,
        hfPeak: 0.25,
        spectrum: [{ frequency: 0.1, power: 100 }],
      },
    },
    poincare: {
      available: true,
      value: { points: [{ previousInterval: 800, nextInterval: 810 }] },
    },
    resonance: {
      available: true,
      value: {
        peakToTroughAmplitude: 10,
        waveformSmoothness: 0.7,
        phaseSynchrony: 0.8,
        lfPeakCount: 1,
        lfPeakAmplitude: 60,
      },
    },
    quality: {
      totalSamples: 100,
      artifactsDetected: 0,
      artifactPercentage: 0,
      meanSignalQuality: 0.9,
    },
    raw: {
      rrIntervals: [800, 810],
      timestamps: [0, 800],
      instantaneousHR: [75, 74],
    },
  };
}

describe('HRV analysis record validation', () => {
  it('rejects an available frequency group without a spectrum array', () => {
    const analysis = validCurrentAnalysis();
    analysis.frequencyDomain.value.spectrum = null as never;

    expect(isHrvAnalysis(analysis)).toBe(false);
  });

  it('marks a legacy negative-power spectrum unavailable instead of retaining it', () => {
    const legacy: Record<string, unknown> = validCurrentAnalysis();
    delete legacy.poincare;
    legacy.frequencyDomain = {
      available: true,
      lfPowerNorm: 55,
      hfPowerNorm: 45,
      lfHfRatio: 1.2,
      lfPeak: 0.1,
      hfPeak: 0.25,
      spectrum: [{ frequency: 0.1, power: -1 }],
    };
    legacy.resonance = {
      peakToTroughAmplitude: 10,
      waveformSmoothness: 0.7,
      phaseSynchrony: 0.8,
      lfPeakCount: 1,
    };

    const normalized = normalizeLegacyHrvAnalysis(legacy, { breathingRateBPM: 6 }) as Record<
      string,
      unknown
    >;

    expect(normalized.frequencyDomain).toEqual({
      available: false,
      reason: 'no-variability',
    });
    expect(normalized.resonance).toEqual({
      available: false,
      reason: 'insufficient-data',
    });
  });
});
