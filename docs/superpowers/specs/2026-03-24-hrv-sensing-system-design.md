# HRV Sensing System — Design Spec

## Overview

A standalone heart rate variability (HRV) sensing system built into the breathing app using the phone's camera (photoplethysmography/PPG) and accelerometer (seismocardiography/SCG). No external hardware required. The system captures inter-beat intervals (IBI), computes comprehensive HRV metrics, and provides real-time visualizations — replacing the need for Elite HRV or similar external apps.

## Motivation

The resonance frequency assessment currently requires users to manually score trials using subjective observations from an external HRV app. By building HRV sensing directly into the app, we can:
- Auto-capture RR intervals during breathing trials
- Auto-compute LF power, peak-to-trough amplitude, and waveform smoothness
- Auto-populate assessment scoring fields with objective data
- Provide rich real-time visualizations (charts, waveforms, spectral plots)
- Make the app a standalone product — no external devices or apps needed

## Key Constraint: One Sensor at a Time

Camera PPG requires the user's finger on the camera lens. Accelerometer SCG requires the phone flat on the chest. These cannot run simultaneously — they use the same physical device in different positions.

**Sensor modes:**
- **Single-sensor (default):** User picks ONE sensor per assessment run — camera PPG or accelerometer SCG. Audio-only breathing guidance during trials (can't see screen).
- **Dual-sensor (optional):** User runs the full 5-trial assessment TWICE (once per sensor). The app fuses results at the analysis level — comparing HRV metrics across both runs for higher-confidence scoring.
- **No sensor:** Manual scoring mode (existing behavior) for users who use an external app like Elite HRV.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Sensor Layer                          │
│  ┌──────────────┐     ┌──────────────────┐              │
│  │ Camera PPG   │     │ Accelerometer SCG│              │
│  │ Service      │     │ Service          │              │
│  └──────┬───────┘     └────────┬─────────┘              │
│         │ IBI stream           │ IBI stream              │
│         └──────────┬───────────┘                         │
│           (one at a time)                                │
│                    ▼                                     │
│         ┌──────────────────┐                             │
│         │  HRV Analysis    │                             │
│         │  Engine          │                             │
│         └────────┬─────────┘                             │
│                  │ HRV metrics                           │
│                  ▼                                       │
│  ┌───────────────────────────────────────────────┐       │
│  │  Results     │  Visualizations │  Assessment  │       │
│  │  Fusion      │  (charts)       │  Integration │       │
│  │  (dual-run)  │                 │              │       │
│  └───────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────┘
```

## Sub-Project 1: DSP Utilities

Shared digital signal processing primitives used by both PPG and SCG services.

### Location: `packages/shared/src/dsp/`

### Components

**Butterworth IIR Filter** (`filters.ts`)
- Second-order sections (SOS) implementation for numerical stability
- Factory functions: `lowpass(fc, fs)`, `highpass(fc, fs)`, `bandpass(fLow, fHigh, fs)`
- Real-time streaming filter via `filter(sample)` method (maintains internal state)
- `reset()` to clear filter state between sessions

**Peak Detection** (`peakDetection.ts`)
- Adaptive threshold peak detector based on Pan-Tompkins principles
- Configurable minimum peak distance (based on physiological HR range: 30-240 BPM)
- Returns peak indices and amplitudes
- Refractory period to prevent double-detection
- `detectPeaks(signal, options)` for batch processing
- `StreamingPeakDetector` class for real-time use

**Signal Quality Index** (`signalQuality.ts`)
- `assessQuality(signal, peaks)` → 0.0-1.0 score
- Based on: peak regularity, signal-to-noise ratio, morphology consistency
- Thresholds: >0.8 = good, 0.5-0.8 = acceptable, <0.5 = poor

**Moving Average / RMS** (`statistics.ts`)
- `movingAverage(data, windowSize)`
- `rms(data)`
- `standardDeviation(data)`
- `median(data)`

## Sub-Project 2: HRV Analysis Engine

Pure mathematical analysis of IBI (inter-beat interval) data. No sensor dependencies.

### Location: `packages/shared/src/hrv/`

### Input: IBI Data

```typescript
interface IBISample {
  timestamp: number;    // ms since epoch
  interval: number;     // ms between beats
  quality: number;      // 0-1 signal quality
}
```

### Preprocessing (`preprocessing.ts`)

1. **Artifact detection**: Flag intervals outside physiological range (300-2000ms, i.e., 30-200 BPM)
2. **Ectopic beat detection**: Flag intervals that differ by >20% from local median (5-beat window)
3. **Artifact correction**: Replace flagged intervals via cubic spline interpolation from surrounding valid intervals
4. **Output**: Cleaned IBI series with artifact count metadata

### Time-Domain Metrics (`timeDomain.ts`)

```typescript
interface TimeDomainMetrics {
  meanRR: number;        // Mean RR interval (ms)
  sdnn: number;          // Standard deviation of NN intervals (ms)
  rmssd: number;         // Root mean square of successive differences (ms)
  pnn50: number;         // Percentage of successive differences > 50ms (%)
  meanHR: number;        // Mean heart rate (BPM)
  minHR: number;         // Minimum heart rate (BPM)
  maxHR: number;         // Maximum heart rate (BPM)
  hrRange: number;       // Max HR - Min HR (peak-to-trough amplitude)
}
```

### Frequency-Domain Metrics (`frequencyDomain.ts`)

**Method: Lomb-Scargle Periodogram**
- Chosen because RR intervals are inherently unevenly sampled — no resampling/interpolation needed
- Directly computes power spectral density from raw IBI timestamps
- Superior to FFT for HRV analysis per published research (Moody 1993, Laguna 1998)

**Implementation:**
- Custom TypeScript implementation of the Lomb-Scargle algorithm
- Evaluate at frequencies 0.003-0.4 Hz with 0.001 Hz resolution
- Frequency bands per European Society of Cardiology / North American Society of Pacing and Electrophysiology standards:
  - VLF: 0.003-0.04 Hz
  - LF: 0.04-0.15 Hz
  - HF: 0.15-0.4 Hz

```typescript
interface FrequencyDomainMetrics {
  // Power in each band (ms²)
  vlfPower: number;
  lfPower: number;
  hfPower: number;
  totalPower: number;

  // Normalized power (%)
  lfPowerNorm: number;   // LF / (LF + HF) × 100
  hfPowerNorm: number;   // HF / (LF + HF) × 100

  // Ratios
  lfHfRatio: number;

  // Peak frequencies (Hz)
  lfPeak: number;        // Frequency of max power in LF band
  hfPeak: number;        // Frequency of max power in HF band

  // Full spectrum for visualization
  spectrum: { frequency: number; power: number }[];
}
```

### Resonance-Specific Metrics (`resonanceMetrics.ts`)

Metrics specifically designed for resonance frequency assessment:

```typescript
interface ResonanceMetrics {
  // Peak-to-trough HR amplitude (BPM) — computed per breathing cycle
  peakToTroughAmplitude: number;

  // Waveform smoothness (0-1) — computed as ratio of power in
  // fundamental breathing frequency vs total LF power.
  // Higher = cleaner sinusoidal oscillation, less jaggedness
  waveformSmoothness: number;

  // Phase synchrony estimate (0-1) — correlation between
  // expected breathing phase and HR acceleration/deceleration
  phaseSynchrony: number;

  // Number of distinct peaks in LF band (fewer = better resonance)
  lfPeakCount: number;

  // Dominant LF peak amplitude (ms²/Hz)
  lfPeakAmplitude: number;
}
```

**Peak-to-trough amplitude**: For each breathing cycle (known from trial rate), find HR max during inhale and HR min during exhale, compute difference, average across all cycles.

**Waveform smoothness**: Compute spectral concentration — ratio of power within ±0.01 Hz of the breathing frequency to total LF power. A perfect sinusoid concentrates all power at one frequency (smoothness → 1.0). Jagged waveforms spread power across multiple frequencies (smoothness → 0).

**Phase synchrony**: Cross-correlate the breathing pace signal (known square wave of inhale/exhale) with the instantaneous HR signal. Peak correlation near zero lag indicates good phase synchrony.

### Comprehensive Output

```typescript
interface HRVAnalysis {
  timeDomain: TimeDomainMetrics;
  frequencyDomain: FrequencyDomainMetrics;
  resonance: ResonanceMetrics;
  quality: {
    totalSamples: number;
    artifactsDetected: number;
    artifactPercentage: number;
    meanSignalQuality: number;
  };
  raw: {
    rrIntervals: number[];       // Cleaned RR intervals (ms)
    timestamps: number[];        // Corresponding timestamps
    instantaneousHR: number[];   // 60000/RR for each interval
  };
}
```

## Sub-Project 3: Camera PPG Service

Captures video frames from the phone camera with flash on, extracts PPG signal from fingertip blood volume changes.

### Location: `packages/web/src/services/ppgService.ts`

### Signal Acquisition Pipeline

1. **Camera setup**: `getUserMedia({ video: { facingMode: 'environment', width: 320, height: 240 } })` — low resolution is fine, we just need average pixel color. Enable torch/flash via `MediaStreamTrack.applyConstraints({ advanced: [{ torch: true }] })`.

2. **Frame capture**: Draw video frames to an off-screen `<canvas>` at 30 FPS using `requestAnimationFrame`. Extract average red channel intensity from central region of interest (ROI).

3. **Signal extraction**: The red channel average over time produces the raw PPG waveform — blood volume changes modulate light absorption through the fingertip.

4. **Preprocessing**:
   - Bandpass filter: 0.5-4.0 Hz (corresponds to 30-240 BPM) using Butterworth IIR
   - Detrend: Remove slow baseline drift with high-pass component
   - Normalize: Zero-mean, unit-variance for consistent peak detection

5. **Peak detection**: Apply adaptive threshold peak detector to find systolic peaks. Minimum peak distance = 300ms (200 BPM max).

6. **IBI extraction**: Compute intervals between successive peaks → IBI stream.

7. **Quality assessment**: Continuously assess signal quality. If quality drops below 0.5, emit warning (finger not properly placed, motion artifact, etc.).

### API

```typescript
interface PPGService {
  // Lifecycle
  start(): Promise<void>;       // Request camera, start capture
  stop(): void;                  // Release camera, clean up
  isActive(): boolean;

  // Real-time data streams (callbacks)
  onIBI(callback: (sample: IBISample) => void): void;
  onRawSignal(callback: (value: number, timestamp: number) => void): void;
  onQualityChange(callback: (quality: number) => void): void;
  onError(callback: (error: Error) => void): void;

  // State
  getSignalQuality(): number;    // Current quality 0-1
  getStatus(): 'idle' | 'initializing' | 'capturing' | 'error';
}
```

### Platform Considerations

- **Web**: `getUserMedia` + `<canvas>` for frame processing. Torch control via `MediaStreamTrack` constraints.
- **iOS (Capacitor)**: May need native plugin for camera + torch control. `getUserMedia` works in WKWebView but torch access may be limited.
- **Android (Capacitor)**: `getUserMedia` works well in WebView. Torch control available.
- **Fallback**: If torch unavailable, still attempt capture but warn about reduced accuracy.

## Sub-Project 4: Accelerometer SCG Service

Detects heartbeat vibrations through the phone's accelerometer when placed on the chest (seismocardiography).

### Location: `packages/web/src/services/scgService.ts`

### Signal Acquisition Pipeline

1. **Accelerometer setup**: Use `DeviceMotionEvent` web API (requires HTTPS, user permission on iOS 13+). Request high sampling rate.

2. **Signal extraction**: Use the Z-axis acceleration (perpendicular to chest wall) as primary signal. Compute total acceleration magnitude as fallback: `sqrt(x² + y² + z²)`.

3. **Preprocessing**:
   - High-pass filter: 1 Hz to remove gravity and respiratory motion
   - Low-pass filter: 25 Hz to remove high-frequency noise
   - Effective bandpass: 1-25 Hz for SCG cardiac signal
   - The aortic valve opening (AO) point produces the largest peak in SCG

4. **Peak detection**: Detect AO peaks using envelope-based detection:
   - Compute RMS envelope over 50ms sliding window
   - Apply adaptive threshold peak detection on envelope
   - Minimum peak distance = 300ms

5. **IBI extraction**: Intervals between AO peaks → IBI stream.

6. **Quality assessment**: SCG quality depends heavily on stillness. Motion detection: if accelerometer variance exceeds threshold, quality drops.

### API

Same interface as PPGService (`IBISensorService` shared interface):

```typescript
interface SCGService {
  start(): Promise<void>;
  stop(): void;
  isActive(): boolean;
  onIBI(callback: (sample: IBISample) => void): void;
  onRawSignal(callback: (value: number, timestamp: number) => void): void;
  onQualityChange(callback: (quality: number) => void): void;
  onError(callback: (error: Error) => void): void;
  getSignalQuality(): number;
  getStatus(): 'idle' | 'initializing' | 'capturing' | 'error';
}
```

### Platform Considerations

- **Web**: `DeviceMotionEvent` requires HTTPS. iOS 13+ requires `DeviceMotionEvent.requestPermission()`. Sampling rate varies by device (typically 60-100 Hz, some devices support 120+ Hz).
- **Capacitor**: `@capacitor/motion` plugin provides consistent cross-platform access.
- **Minimum requirement**: 50 Hz sampling rate for reliable SCG. If device reports lower, warn user.

### Limitations

- User must be supine or seated very still
- Phone must be on sternum/chest
- Cannot see screen during measurement — audio-only mode required
- More susceptible to motion artifacts than PPG
- Lower accuracy than PPG in general, but no finger-on-camera needed

## Sub-Project 5: Results Fusion (Dual-Run Mode)

Since camera PPG and accelerometer SCG cannot run simultaneously (same device, different positions), fusion happens at the **results level** — comparing HRV metrics from two separate assessment runs.

### Location: `packages/shared/src/hrv/resultsFusion.ts`

### How Dual-Run Mode Works

1. User completes a full 5-trial assessment with **sensor A** (e.g., camera PPG)
2. User completes a second full 5-trial assessment with **sensor B** (e.g., accelerometer SCG)
3. The app fuses results per-trial: for each breathing rate, it has two independent HRV analyses
4. Fusion produces higher-confidence scoring by cross-validating metrics across sensors

### Fusion Strategy: Confidence-Weighted Averaging

```typescript
interface FusedTrialResult {
  rate: number;                    // BPM
  ppgAnalysis?: HRVAnalysis;       // From PPG assessment run
  scgAnalysis?: HRVAnalysis;       // From SCG assessment run
  fusedMetrics: {
    lfPower: number;               // Weighted average
    peakToTroughAmplitude: number;
    waveformSmoothness: number;
    phaseSynchrony: number;
    confidence: number;            // Higher when sensors agree
  };
}
```

**Algorithm:**
1. For each trial rate, if both sensor runs have data:
   - Weight each metric by its run's signal quality score
   - If metrics agree within 25%: average them, confidence = high (0.8-1.0)
   - If metrics disagree by >25%: use higher-quality run's data, confidence = medium (0.5-0.8)
2. If only one sensor run exists: use it directly, confidence = signal quality score
3. Cross-validate: if both sensors independently agree on the best rate, confidence boost

## Sub-Project 6: HRV Visualizations

Rich, real-time charts and post-trial analysis displays.

### Location: `packages/web/src/components/hrv/`

### Chart Library

Use **lightweight Canvas-based rendering** rather than a heavy charting library. The app already uses Vue — we'll create custom Vue components with `<canvas>` elements for performance.

For static post-analysis charts where interactivity is needed, consider a small charting lib like `uPlot` (lightweight, performant) or custom SVG.

### Real-Time Displays (during measurement)

**1. HR Tachogram** (`HrTachogram.vue`)
- Scrolling line chart showing instantaneous heart rate over time
- X-axis: time (last 60 seconds, scrolling)
- Y-axis: heart rate (BPM), auto-scaled
- Color-coded by signal quality (green = good, yellow = acceptable, red = poor)
- Shows breathing cycle overlay (inhale/exhale phases shaded)

**2. Signal Quality Indicator** (`SignalQualityIndicator.vue`)
- Simple bar/ring showing current signal quality (0-100%)
- Color transitions: green → yellow → red
- Text status: "Good signal" / "Adjust finger" / "Keep still"

**3. Raw Signal Preview** (`RawSignalPreview.vue`)
- Small waveform display showing raw PPG or SCG signal
- Helps user verify sensor placement
- Shows detected peaks marked with dots

### Post-Trial Analysis Displays

**4. Frequency Spectrum** (`FrequencySpectrum.vue`)
- Power spectral density plot from Lomb-Scargle
- X-axis: frequency (0-0.5 Hz)
- Y-axis: power (ms²/Hz)
- LF band (0.04-0.15 Hz) shaded blue, HF band (0.15-0.4 Hz) shaded green
- LF peak frequency marked with vertical line
- Peak annotations showing LF power, HF power values

**5. Poincaré Plot** (`PoincarePlot.vue`)
- Scatter plot: RR[n] vs RR[n+1]
- Reveals beat-to-beat variability patterns
- Ellipse fit showing SD1 (short-term) and SD2 (long-term) variability
- Classic HRV visualization — visually striking

**6. Trial Comparison** (`TrialComparison.vue`)
- Side-by-side or stacked comparison of all 5 assessment trials
- Bar chart comparing: LF power, peak-to-trough amplitude, waveform smoothness
- Highlight the winning trial
- Radar/spider chart showing multi-metric comparison per trial

**7. HR Oscillation Waveform** (`HrOscillation.vue`)
- The key visualization for resonance assessment
- Shows HR waveform over the full 2-minute trial
- Breathing cycle overlay (expected inhale/exhale based on trial rate)
- Annotations: peak-to-trough amplitude, smoothness score
- This is what the user visually evaluates for "biggest, smoothest oscillation"

### Metrics Dashboard (`HrvMetricsDashboard.vue`)

Card-based layout (similar to Elite HRV screenshots) showing:
- Heart Rate: MIN / MAX / AVG
- Signal quality badge
- Time-Domain: RMSSD, SDNN, pNN50, Mean RR, HRV CV
- Frequency-Domain: Total Power, LF Power, HF Power, LF/HF Ratio, LF Peak, HF Peak
- Resonance: Peak-to-trough amplitude, Waveform smoothness, Phase synchrony

## Sub-Project 7: Assessment Integration

Wires the HRV sensing system into the resonance frequency assessment flow.

### Audio-Only Breathing Mode

When HRV measurement is active during a breathing trial:
- **Visual mode disabled**: BreathingVisualizer is hidden
- **Audio-only guidance**: TTS announces "Breathe in" and "Breathe out" at the correct timing
- **Measurement UI shown instead**: Real-time HR tachogram, signal quality indicator, raw signal preview
- **User instruction**: "Place your finger over the camera" or "Place phone on chest"

### Assessment Flow Changes

The existing assessment flow (INTRO → WARMUP → TRIAL → REST → SCORING → RESULT) gains these modifications:

**INTRO phase additions:**
- Sensor selection: "Camera (finger)", "Accelerometer (chest)", or "Both"
- Brief calibration: 10-second signal check to verify sensor works before starting
- If "Both" selected, one sensor captures during trials and the other could capture during rest (or both simultaneously if UX allows)

**TRIAL_BREATHING phase:**
- If sensor active: switch to audio-only breathing guidance
- Show real-time HR tachogram and signal quality instead of BreathingVisualizer
- Collect IBI data throughout the 2-minute trial
- Compute HRV metrics at end of trial

**TRIAL_REST phase:**
- Stop sensor capture
- Display just-completed trial's HRV results as preview cards
- Show HR oscillation waveform for the trial that just finished

**SCORING phase:**
- Auto-populate from computed metrics:
  - `hrAmplitude`: mapped from peak-to-trough amplitude (thresholds: <5 BPM = small, 5-15 = medium, >15 = large)
  - `waveformSmoothness`: mapped from smoothness score (thresholds: <0.3 = jagged, 0.3-0.7 = somewhatSmooth, >0.7 = verySmooth)
  - `comfortRating`: still manual (subjective)
  - `symptoms`: still manual (subjective)
- Show detailed HRV metrics dashboard per trial
- User can still override auto-populated fields

**RESULT phase:**
- Enhanced with trial comparison charts
- Frequency spectrum overlay for all 5 trials
- Clear visual showing which trial had best LF power, amplitude, smoothness
- Radar chart comparing trials across all metrics

### Scoring Algorithm Enhancement

When HRV data is available, the scoring algorithm uses objective data:

```typescript
// Objective scoring (replaces subjective HR fields)
- Peak-to-trough amplitude: >20 BPM = +4, 15-20 = +3, 10-15 = +2, 5-10 = +1, <5 = 0
- LF power: scored relative to other trials (highest = +3, second = +2, etc.)
- Waveform smoothness: >0.7 = +3, 0.5-0.7 = +2, 0.3-0.5 = +1, <0.3 = 0
- Phase synchrony: >0.8 = +2, 0.5-0.8 = +1, <0.5 = 0

// Subjective scoring (still manual)
- Comfort: 5 = +3, 4 = +2, 3 = +1, 2 = 0, 1 = -1
- Symptoms: -1 each
```

## File Structure

```
packages/shared/src/
├── dsp/
│   ├── index.ts
│   ├── filters.ts           # Butterworth IIR bandpass/lowpass/highpass
│   ├── peakDetection.ts     # Adaptive threshold peak detector
│   ├── signalQuality.ts     # Signal quality index
│   └── statistics.ts        # Moving average, RMS, std dev
├── hrv/
│   ├── index.ts
│   ├── types.ts             # IBISample, HRVAnalysis, all metric interfaces
│   ├── preprocessing.ts     # Artifact detection/correction
│   ├── timeDomain.ts        # RMSSD, SDNN, pNN50, etc.
│   ├── frequencyDomain.ts   # Lomb-Scargle periodogram, LF/HF power
│   └── resonanceMetrics.ts  # Peak-to-trough, smoothness, phase sync
│
packages/web/src/
├── services/
│   ├── ppgService.ts        # Camera PPG capture + processing
│   ├── scgService.ts        # Accelerometer SCG capture + processing
│   └── sensorFusion.ts      # Quality-weighted IBI fusion
├── components/hrv/
│   ├── HrTachogram.vue      # Real-time scrolling HR chart
│   ├── SignalQualityIndicator.vue
│   ├── RawSignalPreview.vue
│   ├── FrequencySpectrum.vue
│   ├── PoincarePlot.vue
│   ├── TrialComparison.vue
│   ├── HrOscillation.vue
│   └── HrvMetricsDashboard.vue
│
packages/shared/tests/
├── dsp/
│   ├── filters.test.ts
│   ├── peakDetection.test.ts
│   └── signalQuality.test.ts
├── hrv/
│   ├── preprocessing.test.ts
│   ├── timeDomain.test.ts
│   ├── frequencyDomain.test.ts
│   └── resonanceMetrics.test.ts

packages/web/tests/
├── services/
│   ├── ppgService.test.ts
│   ├── scgService.test.ts
│   └── sensorFusion.test.ts
```

## Testing Strategy

- **DSP utilities**: Tested with known synthetic signals (sine waves at known frequencies, known filter responses)
- **HRV engine**: Tested with published reference IBI datasets and known-answer metric values
- **PPG/SCG services**: Mock camera/accelerometer, test signal processing pipeline with synthetic PPG/SCG waveforms
- **Sensor fusion**: Test with synthetic dual-sensor scenarios (agreement, disagreement, single-sensor dropout)
- **Visualizations**: Snapshot testing for chart rendering, prop-driven display verification

## Out of Scope (for now)

- BLE heart rate monitor support (planned for later phase)
- Cloud storage or sync of HRV data
- Machine learning-based signal enhancement
- Real-time breathing rate detection from HRV
- Apple HealthKit / Google Health Connect integration
- Continuous background HRV monitoring

## References

- [Lomb-Scargle for HRV Analysis](https://www.adinstruments.com/blog/using-lomb-scargle-periodogram-hrv-analysis)
- [PPG Validation for HRV-Biofeedback](https://pubmed.ncbi.nlm.nih.gov/37678565/)
- [Robust PPG Peak Detection](https://pmc.ncbi.nlm.nih.gov/articles/PMC10370199/)
- [SCG Heartbeat Detection via Template Matching](https://pmc.ncbi.nlm.nih.gov/articles/PMC10224046/)
- [Smartphone SCG Heart Rate Detection](https://link.springer.com/chapter/10.1007/978-3-319-70063-2_15)
- [Kubios Smartphone HRV Measurement](https://www.kubios.com/blog/measuring-hrv-with-your-smartphone/)
- [Capacitor BLE Plugin](https://github.com/capacitor-community/bluetooth-le)
- [PPG + Accelerometer Fusion](https://arxiv.org/abs/2511.00949)
- [European Society of Cardiology HRV Standards](https://www.escardio.org/)
