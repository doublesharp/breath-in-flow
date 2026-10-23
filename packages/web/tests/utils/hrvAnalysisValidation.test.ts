import { describe, expect, it } from 'vitest';
import type {
  EligibilityReason,
  FrequencyDomainUnavailableReason,
  PoincareUnavailableReason,
  ResonanceUnavailableReason,
} from '@breath-in-flow/shared';
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
  const eligibilityReasons = {
    'duration-too-short': true,
    'insufficient-beats': true,
    'invalid-sample': true,
    'non-monotonic-timestamps': true,
    'implausible-interval': true,
    'unknown-provenance': true,
    'estimated-samples': true,
    'low-signal-quality': true,
    'too-many-artifacts': true,
    'insufficient-coverage': true,
    'sample-gap-too-long': true,
    'sensor-error': true,
  } satisfies Record<EligibilityReason, true>;
  const frequencyReasons = {
    ...eligibilityReasons,
    'insufficient-data': true,
    'invalid-series': true,
    'no-variability': true,
    'protocol-not-supported': true,
  } satisfies Record<FrequencyDomainUnavailableReason, true>;
  const poincareReasons = {
    ...eligibilityReasons,
    'insufficient-data': true,
    'protocol-not-supported': true,
  } satisfies Record<PoincareUnavailableReason, true>;
  const resonanceReasons = {
    ...frequencyReasons,
    'missing-breathing-rate': true,
  } satisfies Record<ResonanceUnavailableReason, true>;

  it.each([
    ['frequencyDomain', frequencyReasons],
    ['poincare', poincareReasons],
    ['resonance', resonanceReasons],
  ] as const)('accepts every supported unavailable reason for %s', (group, reasons) => {
    for (const reason of Object.keys(reasons)) {
      expect(
        isHrvAnalysis({
          ...validCurrentAnalysis(),
          [group]: { available: false, reason },
        }),
        `${group}: ${reason}`
      ).toBe(true);
    }
    expect(
      isHrvAnalysis({
        ...validCurrentAnalysis(),
        [group]: { available: false, reason: 'unrecognized-reason' },
      })
    ).toBe(false);
  });

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
