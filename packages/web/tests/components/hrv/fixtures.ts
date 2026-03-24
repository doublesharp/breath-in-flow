import type { HRVAnalysis } from '@breath-in-flow/shared';

export const sampleAnalysis: HRVAnalysis = {
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
    vlfPower: 0,
    lfPower: 304.92,
    hfPower: 3677.86,
    totalPower: 3982.77,
    lfPowerNorm: 7.66,
    hfPowerNorm: 92.34,
    lfHfRatio: 0.083,
    lfPeak: 0.148,
    hfPeak: 0.332,
    spectrum: [
      { frequency: 0, power: 0 },
      { frequency: 0.05, power: 50 },
      { frequency: 0.1, power: 120 },
      { frequency: 0.148, power: 305 },
      { frequency: 0.2, power: 800 },
      { frequency: 0.332, power: 3677 },
      { frequency: 0.4, power: 200 },
    ],
  },
  resonance: {
    peakToTroughAmplitude: 19.2,
    waveformSmoothness: 0.82,
    phaseSynchrony: 0.75,
    lfPeakCount: 1,
    lfPeakAmplitude: 304.92,
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
};
