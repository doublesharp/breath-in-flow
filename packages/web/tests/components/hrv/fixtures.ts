import type { HRVAnalysis } from '@breath-in-flow/shared';

export const sampleAnalysis = {
  timeDomain: {
    meanRR: 1141,
    sdnn: 76.05,
    rmssd: 127.38,
    pnn50: 80,
    meanHR: 53,
    minHR: 48,
    maxHR: 67,
    hrRange: 19,
  },
  frequencyDomain: {
    available: true,
    value: {
      lfPowerNorm: 7.66,
      hfPowerNorm: 92.34,
      lfHfRatio: 0.083,
      lfPeak: 0.148,
      hfPeak: 0.332,
      spectrum: [
        { frequency: 0.05, power: 0.5 },
        { frequency: 0.1, power: 3 },
        { frequency: 0.148, power: 7.66 },
        { frequency: 0.2, power: 20 },
        { frequency: 0.332, power: 68.84 },
      ],
    },
  },
  poincare: { available: true, value: { points: [] } },
  resonance: {
    available: true,
    value: {
      peakToTroughAmplitude: 19.2,
      waveformSmoothness: 0.82,
      phaseSynchrony: 0.75,
      lfPeakCount: 1,
      lfPeakAmplitude: 7.66,
    },
  },
  quality: {
    totalSamples: 240,
    artifactsDetected: 3,
    artifactPercentage: 1.25,
    meanSignalQuality: 0.92,
  },
  raw: {
    rrIntervals: [850, 870, 830, 860, 880, 820],
    timestamps: [0, 850, 1720, 2550, 3410, 4290],
    instantaneousHR: [70.6, 69.0, 72.3, 69.8, 68.2, 73.2],
  },
} satisfies HRVAnalysis;
