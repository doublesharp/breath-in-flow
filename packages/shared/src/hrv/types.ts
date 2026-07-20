export type SensorSource = 'ppg' | 'scg' | 'fused';
export type DetectionMethod = 'peak-detected' | 'autocorrelation-estimate';

export interface SampleProvenance {
  source: SensorSource;
  method: DetectionMethod;
}

export interface IBISample {
  timestamp: number; // milliseconds on the measurement's monotonic clock
  interval: number; // milliseconds between detected beats
  quality: number; // 0-1 signal quality
  provenance?: SampleProvenance; // optional only for backward-compatible stored records
}

export interface HeartRateEstimate {
  timestamp: number;
  bpm: number;
  quality: number;
  source: Exclude<SensorSource, 'fused'>;
  method: 'autocorrelation-estimate';
}

export type MeasurementProtocol =
  'quick-check' | 'morning-readiness' | 'full-analysis' | 'resonance-trial' | 'freeform';

export type MetricGroup =
  | 'average-pulse'
  | 'rmssd'
  | 'pnn50'
  | 'sdnn-short-recording'
  | 'sdnn'
  | 'frequency-domain'
  | 'poincare'
  | 'resonance-training';

export type EligibilityReason =
  | 'duration-too-short'
  | 'insufficient-beats'
  | 'invalid-sample'
  | 'non-monotonic-timestamps'
  | 'implausible-interval'
  | 'unknown-provenance'
  | 'estimated-samples'
  | 'low-signal-quality'
  | 'too-many-artifacts'
  | 'sensor-error';

export type EligibilityWarning = 'elevated-artifacts' | 'short-recording-sdnn';

export interface MeasurementEligibility {
  eligible: boolean;
  reasons: EligibilityReason[];
  warnings: EligibilityWarning[];
  availableMetrics: MetricGroup[];
  artifactPercentage: number;
  meanQuality: number;
  detectedBeatCount: number;
  observedDurationSeconds: number;
}

export interface TimeDomainMetrics {
  meanRR: number; // Mean RR interval (ms)
  sdnn: number; // Standard deviation of NN intervals (ms)
  rmssd: number; // Root mean square of successive differences (ms)
  pnn50: number; // Percentage of successive differences > 50ms (%)
  meanHR: number; // Mean heart rate (BPM) = 60000 / meanRR
  minHR: number; // Min HR (BPM) = 60000 / maxRR
  maxHR: number; // Max HR (BPM) = 60000 / minRR
  hrRange: number; // maxHR - minHR (peak-to-trough)
}

export type MetricAvailability<T, Reason extends string> =
  { available: true; value: T } | { available: false; reason: Reason };

export type FrequencyDomainUnavailableReason =
  | EligibilityReason
  | 'insufficient-data'
  | 'invalid-series'
  | 'no-variability'
  | 'protocol-not-supported';

export interface FrequencyDomainMetrics {
  lfPowerNorm: number; // LF/(LF+HF)*100
  hfPowerNorm: number; // HF/(LF+HF)*100
  lfHfRatio: number; // LF/HF
  lfPeak: number; // Peak frequency in LF band (Hz)
  hfPeak: number; // Peak frequency in HF band (Hz)
  spectrum: SpectralPoint[]; // Relative spectrum, normalized to sum to 100
}

export type FrequencyDomainAvailability = MetricAvailability<
  FrequencyDomainMetrics,
  FrequencyDomainUnavailableReason
>;

export interface SpectralPoint {
  frequency: number; // Hz
  power: number; // relative spectral contribution, normalized to sum to 100
}

export interface PoincarePoint {
  previousInterval: number;
  nextInterval: number;
}

export interface PoincareMetrics {
  points: PoincarePoint[];
}

export type PoincareUnavailableReason =
  EligibilityReason | 'insufficient-data' | 'protocol-not-supported';

export type PoincareAvailability = MetricAvailability<PoincareMetrics, PoincareUnavailableReason>;

export interface ResonanceMetrics {
  peakToTroughAmplitude: number; // Average HR max-min per breathing cycle (BPM)
  waveformSmoothness: number; // 0-1, spectral concentration at breathing freq
  phaseSynchrony: number; // 0-1, correlation of breathing phase with HR
  lfPeakCount: number; // Number of distinct peaks in LF band
  lfPeakAmplitude: number; // Dominant LF peak contribution in the normalized spectrum
}

export type ResonanceUnavailableReason =
  FrequencyDomainUnavailableReason | 'missing-breathing-rate';

export type ResonanceAvailability = MetricAvailability<
  ResonanceMetrics,
  ResonanceUnavailableReason
>;

export interface HRVQuality {
  totalSamples: number;
  artifactsDetected: number;
  artifactPercentage: number;
  meanSignalQuality: number;
}

export interface HRVAnalysis {
  timeDomain: TimeDomainMetrics;
  frequencyDomain: FrequencyDomainAvailability;
  poincare: PoincareAvailability;
  resonance: ResonanceAvailability;
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
