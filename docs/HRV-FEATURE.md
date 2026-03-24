# HRV Sensing System — How It Works

## Overview

The app includes a built-in heart rate variability (HRV) measurement system that works using only your phone — no external devices needed. It captures inter-beat intervals (the time between heartbeats), computes HRV metrics, and uses them to objectively score resonance frequency assessment trials.

## Measurement Methods

### Camera PPG (Photoplethysmography)

**What it is:** When you place your finger over the phone's rear camera with the flashlight on, light passes through your fingertip. With each heartbeat, blood volume in your capillaries changes, modulating how much light reaches the camera sensor.

**Signal pipeline:**
1. Camera captures frames at 30 FPS, extracts average green channel intensity (green is absorbed most by hemoglobin)
2. Adaptive bandpass filter adjusts its cutoff frequencies every 10 seconds based on your estimated heart rate (research shows this improves accuracy by up to 7% vs fixed filters)
3. Peak detection with prominence validation identifies systolic peaks
4. Peak-to-peak timing produces inter-beat intervals (IBI)

**Accuracy enhancements (research-backed):**
- Green channel extraction (stronger PPG signal than red)
- Adaptive bandpass filter inspired by the Aboy++ algorithm (F1 score: 85.5%)
- Peak prominence filtering rejects noise while keeping real beats
- Adaptive refractory period tracks running HR to avoid double-detection

### Accelerometer SCG (Seismocardiography)

**What it is:** Each heartbeat creates mechanical vibrations in your chest wall. The aortic valve opening (AO) produces the strongest vibration, detectable by the phone's accelerometer when placed flat on your sternum.

**Signal pipeline:**
1. Z-axis acceleration captured via DeviceMotion API
2. Bandpass filter 5–25 Hz isolates cardiac-specific vibrations, removing respiratory artifacts
3. Hilbert transform envelope extraction (more accurate than simple RMS)
4. Template matching with normalized cross-correlation validates peaks against a learned heartbeat shape (research: 97% sensitivity, 96% PPV)

**Accuracy enhancements (research-backed):**
- 5–25 Hz bandpass (vs generic 1–25 Hz) per Zheng et al. 2024 research
- 17-tap discrete Hilbert FIR transformer for envelope estimation
- Template matching builds an average heartbeat shape after 5 detections, then validates subsequent peaks (NCC threshold ≥ 0.5)
- Template refreshes every 20 beats to adapt to signal changes

### Dual-Sensor Mode (Simultaneous)

**Setup:** Phone placed screen-down flat on your chest, finger covering the rear camera lens.

**How it works:** Both PPG and SCG run simultaneously on the same heartbeats. A real-time sensor fusion service cross-validates each beat:
- When both sensors detect a beat within ±100ms and intervals agree within 30ms: quality-weighted average (highest confidence)
- When they disagree: uses the higher-quality source
- After 5+ consecutive matched beats: confidence gets a 1.2× boost
- Single-sensor detections are still used when only one fires (at reduced confidence)

This is the most accurate mode because two independent measurement methods validate each other.

## HRV Analysis Engine

### Preprocessing
1. **Artifact detection:** Flags intervals outside 300–2000ms (30–200 BPM)
2. **Ectopic beat detection:** Flags intervals differing >20% from local 5-beat median
3. **Correction:** Replaces flagged intervals via linear interpolation

### Time-Domain Metrics
- **RMSSD** — Root mean square of successive differences (parasympathetic indicator)
- **SDNN** — Standard deviation of all NN intervals (overall HRV)
- **pNN50** — Percentage of successive differences > 50ms
- **Mean RR / Mean HR** — Average interval and heart rate
- **HR Range** — Max HR minus Min HR (peak-to-trough)

### Frequency-Domain Metrics (Lomb-Scargle Periodogram)

**Why Lomb-Scargle instead of FFT?** RR intervals are inherently unevenly spaced. FFT requires interpolation that introduces errors. The Lomb-Scargle periodogram handles irregular sampling natively and outperforms FFT for HRV analysis.

**Preprocessing before spectral analysis:**
- Linear detrending (removes slow HR drift)
- Hanning window (reduces spectral leakage in short 2-minute recordings)
- Variance correction (preserves power estimates after windowing)

**Frequency bands (European Society of Cardiology standard):**
- **VLF:** 0.003–0.04 Hz (thermoregulation, hormonal)
- **LF:** 0.04–0.15 Hz — resonance breathing lives here
- **HF:** 0.15–0.4 Hz (respiratory sinus arrhythmia)

**Computed metrics:** LF Power, HF Power, Total Power, LF/HF Ratio, LF Peak frequency, HF Peak frequency, normalized powers, full spectrum

### Resonance-Specific Metrics

These are the metrics that identify your resonance frequency:

- **Peak-to-trough HR amplitude:** For each breathing cycle, how much does HR rise on inhale and fall on exhale? Bigger = better resonance.
- **Waveform smoothness:** What fraction of LF power is concentrated at the breathing frequency? A perfect sinusoidal oscillation = 1.0. Jagged/noisy = low.
- **Phase synchrony:** How well does HR track with the breathing rhythm? Uses phase-independent correlation to handle arbitrary phase offsets.
- **LF peak count:** How many distinct peaks exist in the LF band? Fewer = cleaner resonance (ideally just 1).

## Visualizations

The app includes 7 visualization components:

1. **HR Tachogram** — Real-time scrolling heart rate line chart with quality color-coding and breathing phase overlay
2. **Frequency Spectrum** — Power spectral density plot with LF/HF bands highlighted and peak markers
3. **Poincaré Plot** — Classic RR[n] vs RR[n+1] scatter plot showing beat-to-beat variability patterns
4. **HR Oscillation Waveform** — Full-trial HR waveform with breathing cycle overlay and amplitude annotations
5. **Signal Quality Indicator** — Real-time circular gauge showing sensor signal quality
6. **HRV Metrics Dashboard** — Card grid of all metrics (similar to Elite HRV's Data Details screen)
7. **Trial Comparison** — Bar chart comparing all 5 assessment trials across LF Power, Amplitude, Smoothness, and Phase Synchrony

## Integration with Resonance Assessment

During the assessment, users choose a sensor mode:
- **Manual Scoring** — No sensor, score subjectively (existing behavior)
- **Dual Sensor (Best Accuracy)** — Phone on chest, finger on camera
- **Camera Only** — Finger on camera, any position
- **Accelerometer Only** — Phone on chest

When a sensor is active:
- Audio-only breathing guidance (TTS announces "Breathe in" / "Breathe out")
- Real-time signal quality display during trials
- HRV metrics computed automatically after each 2-minute trial
- Scoring fields auto-populated with objective data (HR amplitude, waveform smoothness)
- Post-trial charts show oscillation waveform, frequency spectrum, and metrics dashboard
- Trial comparison chart in the results screen highlights the winning rate

## Technology Stack

- **DSP:** Custom Butterworth IIR filters (second-order sections), adaptive peak detection, Hilbert transform envelope
- **Spectral analysis:** Custom Lomb-Scargle periodogram implementation in TypeScript
- **Camera:** getUserMedia API + Canvas pixel extraction
- **Accelerometer:** DeviceMotion API with iOS permission handling
- **Platform:** Works on web, iOS (Capacitor), and Android (Capacitor)

## Research References

- [PPG Validation for HRV-Biofeedback RF Assessment](https://pubmed.ncbi.nlm.nih.gov/37678565/) — Smartphone PPG validated for resonance frequency assessment
- [Aboy++ PPG Peak Detection](https://pmc.ncbi.nlm.nih.gov/articles/PMC10370199/) — Robust peak detection, F1 85.5%
- [Adaptive PPG Filtering](https://arxiv.org/html/2510.06158v1) — Per-person cutoff optimization improves IBI by 35ms
- [SCG Template Matching](https://pmc.ncbi.nlm.nih.gov/articles/PMC10224046/) — 96% sensitivity, ±7.8ms IBI agreement
- [SCG AO Detection](https://www.sciencedirect.com/science/article/abs/pii/S1746809423009175) — 97.3% sensitivity with 7-30 Hz bandpass
- [Kubios Phone HRV](https://www.kubios.com/blog/measuring-hrv-with-your-smartphone/) — Phone accelerometer validated for resting HRV
- [Lomb-Scargle for HRV](https://www.adinstruments.com/blog/using-lomb-scargle-periodogram-hrv-analysis) — Superior to FFT for unevenly-sampled RR data
- [PPG + Accelerometer Fusion](https://arxiv.org/abs/2511.00949) — Multi-modal fusion improves accuracy
- [Lehrer Resonance Frequency Protocol](https://pmc.ncbi.nlm.nih.gov/articles/PMC7578229/) — Clinical RF assessment methodology
