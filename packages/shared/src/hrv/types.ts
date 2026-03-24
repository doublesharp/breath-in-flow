export interface IBISample {
  timestamp: number;    // ms since epoch
  interval: number;     // ms between beats
  quality: number;      // 0-1 signal quality
}

export interface TimeDomainMetrics {
  meanRR: number;        // Mean RR interval (ms)
  sdnn: number;          // Standard deviation of NN intervals (ms)
  rmssd: number;         // Root mean square of successive differences (ms)
  pnn50: number;         // Percentage of successive differences > 50ms (%)
  meanHR: number;        // Mean heart rate (BPM) = 60000 / meanRR
  minHR: number;         // Min HR (BPM) = 60000 / maxRR
  maxHR: number;         // Max HR (BPM) = 60000 / minRR
  hrRange: number;       // maxHR - minHR (peak-to-trough)
}

export interface FrequencyDomainMetrics {
  vlfPower: number;      // VLF power (ms²), 0.003-0.04 Hz
  lfPower: number;       // LF power (ms²), 0.04-0.15 Hz
  hfPower: number;       // HF power (ms²), 0.15-0.4 Hz
  totalPower: number;    // Total power (ms²)
  lfPowerNorm: number;   // LF/(LF+HF)*100
  hfPowerNorm: number;   // HF/(LF+HF)*100
  lfHfRatio: number;     // LF/HF
  lfPeak: number;        // Peak frequency in LF band (Hz)
  hfPeak: number;        // Peak frequency in HF band (Hz)
  spectrum: SpectralPoint[];  // Full spectrum for visualization
}

export interface SpectralPoint {
  frequency: number;     // Hz
  power: number;         // ms²/Hz
}

export interface ResonanceMetrics {
  peakToTroughAmplitude: number;  // Average HR max-min per breathing cycle (BPM)
  waveformSmoothness: number;     // 0-1, spectral concentration at breathing freq
  phaseSynchrony: number;         // 0-1, correlation of breathing phase with HR
  lfPeakCount: number;            // Number of distinct peaks in LF band
  lfPeakAmplitude: number;        // Dominant LF peak amplitude (ms²/Hz)
}

export interface HRVQuality {
  totalSamples: number;
  artifactsDetected: number;
  artifactPercentage: number;
  meanSignalQuality: number;
}

export interface HRVAnalysis {
  timeDomain: TimeDomainMetrics;
  frequencyDomain: FrequencyDomainMetrics;
  resonance: ResonanceMetrics;
  quality: HRVQuality;
  raw: {
    rrIntervals: number[];
    timestamps: number[];
    instantaneousHR: number[];
  };
}

// Frequency band definitions (European Society of Cardiology standard)
export const FREQUENCY_BANDS = {
  VLF: { low: 0.003, high: 0.04 },
  LF: { low: 0.04, high: 0.15 },
  HF: { low: 0.15, high: 0.4 },
} as const;
