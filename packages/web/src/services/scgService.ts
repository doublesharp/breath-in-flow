/**
 * Accelerometer SCG (seismocardiography) service.
 *
 * Detects heartbeats through chest-wall vibrations when the phone is placed
 * flat on the user's sternum (face-up).  The aortic valve opening (AO) event
 * produces the dominant peak in the Z-axis acceleration signal.
 *
 * Signal pipeline (per sample):
 *   raw Z-axis → high-pass 5 Hz → low-pass 25 Hz → Hilbert envelope → peak detector
 *
 * Research basis: Zheng et al. 2024 achieves 97.3% sensitivity using 7–30 Hz
 * bandpass; we use 5 Hz HP as a compromise to retain some lower cardiac content
 * while still rejecting respiratory artifacts (1–5 Hz).
 *
 * Timing note: the service maintains a synthetic elapsed-time counter
 * incremented by event.interval each sample, or measured arrival intervals when
 * the device does not provide one.
 */

import {
  createHighpassFilter,
  createLowpassFilter,
  StreamingPeakDetector,
  assessIBIQuality,
  standardDeviation,
  type HeartRateEstimate,
  type IBISample,
} from '@breath-in-flow/shared';

import type { SOSFilter } from '@breath-in-flow/shared';
import { Capacitor } from '@capacitor/core';
import { Motion } from '@capacitor/motion';
import { AdaptiveMotionGate } from './adaptiveMotionGate';
import { sensorStartFailure, type SensorStartResult } from './sensorTypes';

// ─── Public types ─────────────────────────────────────────────────────────────

export type SCGStatus = 'idle' | 'initializing' | 'capturing' | 'error';

export interface SCGCallbacks {
  onIBI?: (sample: IBISample) => void;
  onHeartRateEstimate?: (estimate: HeartRateEstimate) => void;
  onRawSignal?: (value: number, timestamp: number) => void;
  onQualityChange?: (quality: number) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: SCGStatus) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Assumed sample rate used until the real rate is measured. */
const DEFAULT_SAMPLE_RATE_HZ = 100;

/** Default interval in ms corresponding to the default sample rate. */
const DEFAULT_INTERVAL_MS = 1000 / DEFAULT_SAMPLE_RATE_HZ;

/** Number of initial events used to estimate the device sample rate. */
const RATE_ESTIMATION_EVENTS = 10;

/**
 * High-pass cutoff: removes baseline drift and gravity.
 * Lowered from 5 Hz to 2 Hz because the Capacitor Motion plugin quantizes
 * acceleration to 0.1 m/s² resolution — we need to preserve more of the
 * cardiac signal (fundamental at ~1-2 Hz) to detect peaks from the quantized data.
 * Breathing (~0.2-0.4 Hz) is still removed.
 */
const HP_CUTOFF_HZ = 2;

/** Low-pass cutoff: removes high-frequency electronic noise. */
const LP_CUTOFF_HZ = 25;

/** Hilbert FIR half-length N (total taps = 2N+1 = 17). */
const HILBERT_N = 8;

/**
 * Envelope smoothing window in seconds.
 * A 150 ms moving average merges ringing bumps caused by the bandpass filter
 * responding to a sharp cardiac transient, producing one clean envelope peak
 * per heartbeat.  The ringing frequency of a 5 Hz HP filter (~5 Hz, ~200 ms
 * period) requires a window of at least half a period (100 ms) to average out;
 * 150 ms provides comfortable margin.
 */
const ENVELOPE_SMOOTH_SECONDS = 0.15;

/** Maximum plausible heart rate (limits minimum peak distance in samples). */
const MAX_HEART_RATE_BPM = 200;

/** Time without a detected peak before quality is zeroed (synthetic ms). */
const NO_PEAK_TIMEOUT_MS = 3000;

/** Minimum number of recent IBI samples before running quality assessment. */
const MIN_IBI_FOR_QUALITY = 3;

/** Number of recent IBI intervals kept for quality assessment. */
const MAX_RECENT_IBIS = 20;

/** Warn if the detected sample rate is below this value. */
const MIN_RECOMMENDED_SAMPLE_RATE_HZ = 50;

const SCG_DEBUG = import.meta.env.DEV && import.meta.env.VITE_SCG_DEBUG === 'true';

export function resolveMotionInterval(
  eventIntervalMs: number | undefined,
  fallbackIntervalMs: number
): number {
  if (
    typeof eventIntervalMs === 'number' &&
    Number.isFinite(eventIntervalMs) &&
    eventIntervalMs > 0
  ) {
    return eventIntervalMs;
  }
  return fallbackIntervalMs;
}

// ─── Service implementation ───────────────────────────────────────────────────

class SCGService {
  // --- Status & callbacks ---
  private status: SCGStatus = 'idle';
  private callbacks: SCGCallbacks = {};

  // Signal processing objects (created/reset when capturing starts)
  private hpFilter: SOSFilter | null = null;
  private lpFilter: SOSFilter | null = null;
  private peakDetector: StreamingPeakDetector | null = null;

  // Sample-rate estimation
  private sampleRateHz: number = DEFAULT_SAMPLE_RATE_HZ;
  private lastIntervalMs: number = DEFAULT_INTERVAL_MS;
  private lastMotionArrivalMs: number = 0;
  private rateEstimationTimestamps: number[] = []; // wall-clock ms
  private rateEstimated = false;

  // Synthetic elapsed-time clock (ms since start(), advanced by event.interval)
  private elapsedMs: number = 0;
  private measurementStartMonotonicMs: number = 0;

  // Hilbert FIR coefficients (computed once per sample-rate change)
  private hilbertCoeffs: number[] = [];
  // Circular buffer for Hilbert FIR delay line
  private hilbertBuffer: number[] = [];

  // Envelope smoothing (moving average post-Hilbert)
  private envelopeBuffer: number[] = [];
  private envelopeSmoothSamples: number = Math.round(
    DEFAULT_SAMPLE_RATE_HZ * ENVELOPE_SMOOTH_SECONDS
  );

  // IBI tracking
  private lastPeakElapsedMs: number | null = null;
  private lastPeakDetectionElapsedMs: number | null = null;
  private recentIBIs: number[] = [];
  private sampleCount: number = 0;

  // Template matching state
  private template: number[] | null = null;
  private templateMatchCount = 0;
  private readonly TEMPLATE_UPDATE_INTERVAL = 20;
  private readonly TEMPLATE_NCC_THRESHOLD = 0.5;
  private TEMPLATE_WINDOW_SAMPLES: number = Math.round(DEFAULT_SAMPLE_RATE_HZ * 0.1); // ±100ms

  // Circular buffer of recent filtered samples for template extraction
  private filteredHistory: number[] = [];
  // Must be large enough for autocorrelation (5+ seconds of data)
  private filteredHistoryMaxLen: number = Math.round(DEFAULT_SAMPLE_RATE_HZ * 6);

  // Detected peak sample indices since start (for template extraction)
  private detectedPeakSampleIndices: number[] = [];
  private sampleIndex: number = 0;
  private peakDetectorStartSampleIndex = 0;
  private pendingPeaks: Array<{ index: number; timestamp: number }> = [];

  // Quality
  private currentQuality = 0;
  private motionGate = new AdaptiveMotionGate();

  // Bound event handler reference (needed for removeEventListener)
  private boundHandleMotion: ((event: DeviceMotionEvent) => void) | null = null;
  private capacitorListenerId: { remove: () => Promise<void> } | null = null;
  private startGeneration = 0;
  private pendingStartPromise: Promise<SensorStartResult> | null = null;
  // ─── Public API ─────────────────────────────────────────────────────────────

  public setCallbacks(callbacks: SCGCallbacks): void {
    this.callbacks = callbacks;
  }

  public getStatus(): SCGStatus {
    return this.status;
  }

  public getQuality(): number {
    return this.currentQuality;
  }

  public start(): Promise<SensorStartResult> {
    if (this.pendingStartPromise) return this.pendingStartPromise;
    if (this.status === 'capturing') return Promise.resolve({ ok: true });

    const generation = ++this.startGeneration;
    this.setStatus('initializing');
    this.resetInternals();
    const pending = this.startCapture(generation);
    this.pendingStartPromise = pending;
    void pending.finally(() => {
      if (this.pendingStartPromise === pending) this.pendingStartPromise = null;
    });
    return pending;
  }

  private async startCapture(generation: number): Promise<SensorStartResult> {
    const cancelled = () => sensorStartFailure('start-failed', 'Motion startup was cancelled.');
    if (generation !== this.startGeneration) return cancelled();

    // Strategy 1: Use Capacitor Motion plugin on native (more reliable than DeviceMotionEvent in WebView)
    if (Capacitor.isNativePlatform()) {
      try {
        this.debug('SCG: Using Capacitor Motion plugin (native)');
        const listener = await Motion.addListener('accel', (event) => {
          if (generation !== this.startGeneration || this.status !== 'capturing') return;
          // Convert Capacitor motion event to DeviceMotionEvent-like format
          const fakeEvent = {
            acceleration: event.acceleration,
            accelerationIncludingGravity: event.accelerationIncludingGravity,
            interval: event.interval,
          } as DeviceMotionEvent;
          this.handleMotion(fakeEvent);
        });
        if (generation !== this.startGeneration) {
          void listener.remove();
          return cancelled();
        }
        this.capacitorListenerId = listener;
        this.setStatus('capturing');
        this.debug('SCG: Capacitor Motion listener added, status: capturing');
        return { ok: true };
      } catch (err) {
        if (generation !== this.startGeneration) return cancelled();
        console.warn('SCG: Capacitor Motion failed, falling back to web API:', err);
      }
    }

    // Strategy 2: Web DeviceMotionEvent API (desktop browsers, some WebViews)
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      const message = 'Motion sensor not available. This device may not have an accelerometer.';
      this.emitError(new Error(message));
      return sensorStartFailure('unavailable', message);
    }

    // iOS 13+ requires explicit permission
    if (
      typeof (DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    ) {
      try {
        const permission = await (
          DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
        ).requestPermission();
        if (generation !== this.startGeneration) return cancelled();
        if (permission !== 'granted') {
          const message =
            'Motion sensor permission denied. Please enable in iOS Settings > Privacy > Motion & Fitness.';
          this.emitError(new Error(message));
          return sensorStartFailure('permission-denied', message);
        }
      } catch (err) {
        if (generation !== this.startGeneration) return cancelled();
        const message = `Failed to request motion permission: ${
          err instanceof Error ? err.message : String(err)
        }`;
        this.emitError(new Error(message));
        return sensorStartFailure('start-failed', message);
      }
    }

    this.debug('SCG: Using web DeviceMotionEvent API');
    this.boundHandleMotion = (event) => {
      if (generation !== this.startGeneration || this.status !== 'capturing') return;
      this.handleMotion(event);
    };
    window.addEventListener('devicemotion', this.boundHandleMotion);
    this.setStatus('capturing');
    this.debug('SCG: Status set to capturing');
    return { ok: true };
  }

  public stop(): void {
    this.startGeneration++;
    this.pendingStartPromise = null;
    // Remove Capacitor Motion listener if used
    if (this.capacitorListenerId) {
      void this.capacitorListenerId.remove();
      this.capacitorListenerId = null;
    }
    // Remove web API listener
    if (typeof window !== 'undefined' && this.boundHandleMotion) {
      window.removeEventListener('devicemotion', this.boundHandleMotion);
      this.boundHandleMotion = null;
    }
    this.resetInternals();
    this.setStatus('idle');
  }

  // ─── Motion event handler ────────────────────────────────────────────────────

  /** Called for every DeviceMotionEvent from the accelerometer. */
  private handleMotion(event: DeviceMotionEvent): void {
    // Debug: log first few events to confirm accelerometer is working
    if (this.sampleCount < 3) {
      const acc = event.accelerationIncludingGravity || event.acceleration;
      const mag = acc ? Math.sqrt((acc.x ?? 0) ** 2 + (acc.y ?? 0) ** 2 + (acc.z ?? 0) ** 2) : 0;
      this.debug(
        `SCG event #${this.sampleCount}: x=${acc?.x?.toFixed(3)} y=${acc?.y?.toFixed(3)} z=${acc?.z?.toFixed(3)} mag=${mag.toFixed(3)} interval=${event.interval}`
      );
    }

    // ── 1. Advance synthetic clock ──
    // Missing device intervals must use actual arrivals, not the assumed sample rate.
    const arrivalMs = performance.now();
    const arrivalIntervalMs = resolveMotionInterval(
      arrivalMs - this.lastMotionArrivalMs,
      this.lastIntervalMs
    );
    this.lastMotionArrivalMs = arrivalMs;
    const intervalMs = resolveMotionInterval(event.interval, arrivalIntervalMs);
    this.lastIntervalMs = intervalMs;
    this.elapsedMs += intervalMs;
    this.sampleCount++;

    const magnitude = this.getAccelerationMagnitude(event);
    if (magnitude === null) return;
    const motionDecision = this.motionGate.addSample(magnitude, this.elapsedMs);
    if (!motionDecision.accepted) {
      this.updateQuality(0);
      return;
    }

    // ── 2. Sample-rate estimation ──
    if (!this.rateEstimated) {
      this.rateEstimationTimestamps.push(arrivalMs);

      const rateFromInterval = 1000 / resolveMotionInterval(event.interval, Number.NaN);
      if (rateFromInterval >= 10 && rateFromInterval <= 1000) {
        this.applySampleRate(rateFromInterval);
      } else if (this.rateEstimationTimestamps.length >= RATE_ESTIMATION_EVENTS) {
        this.estimateSampleRateFromWallClock();
      }
    }

    // ── 3. Extract Z-axis signal ──
    // Use total acceleration magnitude — works regardless of phone orientation
    // (face-up, face-down, or on side). The high-pass filter removes the static
    // gravity component, leaving only dynamic cardiac/motion vibrations.
    const z = this.extractSignal(event);
    if (z === null) return;

    // Emit raw (unfiltered) Z-axis for external visualization
    this.callbacks.onRawSignal?.(z, this.toMonotonicTimestamp(this.elapsedMs));

    // Ensure filters exist (lazy init in case rate wasn't known at start)
    if (!this.hpFilter || !this.lpFilter || !this.peakDetector) {
      this.rebuildFiltersAndDetector();
    }

    // ── 4. Filter ──
    const afterHP = this.hpFilter!.filter(z);
    const filtered = this.lpFilter!.filter(afterHP);

    // Store filtered sample in history ring buffer for template extraction
    this.filteredHistory.push(filtered);
    if (this.filteredHistory.length > this.filteredHistoryMaxLen) {
      this.filteredHistory.shift();
    }
    this.sampleIndex++;

    // ── 5. Hilbert envelope + smoothing ──
    const instantEnvelope = this.hilbertEnvelope(filtered);

    // Moving-average smoothing merges ringing bumps caused by the bandpass
    // filter responding to a sharp cardiac transient, yielding one clean
    // envelope peak per heartbeat.
    this.envelopeBuffer.push(instantEnvelope);
    if (this.envelopeBuffer.length > this.envelopeSmoothSamples) {
      this.envelopeBuffer.shift();
    }
    const envelope = this.envelopeBuffer.reduce((s, v) => s + v, 0) / this.envelopeBuffer.length;

    // ── 6. Peak detection ──
    const peak = this.peakDetector!.addSample(envelope, this.elapsedMs);

    if (peak) {
      this.pendingPeaks.push({
        index: this.peakDetectorStartSampleIndex + peak.index,
        timestamp: peak.timestamp ?? this.elapsedMs,
      });
    }

    // A streaming candidate refers to the previous sample. Wait until its
    // trailing template window has arrived before accepting or rejecting it.
    while (
      this.pendingPeaks.length > 0 &&
      this.pendingPeaks[0].index + this.TEMPLATE_WINDOW_SAMPLES < this.sampleIndex
    ) {
      const { index: peakSampleIndex, timestamp: peakElapsedMs } = this.pendingPeaks.shift()!;

      // Template validation: only apply after we have a template
      const accepted = this.validatePeakWithTemplate(peakSampleIndex);

      if (accepted) {
        this.lastPeakDetectionElapsedMs = peakElapsedMs;
        this.detectedPeakSampleIndices.push(peakSampleIndex);

        if (this.lastPeakElapsedMs !== null) {
          const ibi = peakElapsedMs - this.lastPeakElapsedMs;

          // Physiological sanity check: 200 BPM (300 ms) to 30 BPM (2000 ms)
          // Tighter range for SCG: 400-1500ms (40-150 BPM) to reduce motion artifacts
          if (ibi >= 400 && ibi <= 1500) {
            this.recentIBIs.push(ibi);
            if (this.recentIBIs.length > MAX_RECENT_IBIS) {
              this.recentIBIs.shift();
            }

            const quality = this.computeQuality();
            this.updateQuality(quality);

            const sample: IBISample = {
              timestamp: this.toMonotonicTimestamp(peakElapsedMs),
              interval: ibi,
              quality,
              provenance: { source: 'scg', method: 'peak-detected' },
            };
            this.callbacks.onIBI?.(sample);
          }
        }

        this.lastPeakElapsedMs = peakElapsedMs;

        // Build/update template after enough initial peaks
        const totalPeaks = this.detectedPeakSampleIndices.length;
        if (totalPeaks === 5) {
          // Build initial template from the first 5 peaks
          this.rebuildTemplate();
        } else if (totalPeaks > 5 && totalPeaks % this.TEMPLATE_UPDATE_INTERVAL === 0) {
          // Periodically update template with recent good matches
          this.rebuildTemplate();
        }
      }
    }

    // ── 6b. Autocorrelation fallback — every 3 seconds if no peaks found ──
    // The quantized 0.1 m/s² accelerometer data may not produce detectable peaks
    // but still contains periodic heartbeat information in the timing of the 0.1 jumps.
    const autocorrInterval = Math.max(1, Math.round(this.sampleRateHz * 3)); // Every 3 seconds
    const peakDetectionStale =
      this.lastPeakDetectionElapsedMs === null ||
      this.elapsedMs - this.lastPeakDetectionElapsedMs > NO_PEAK_TIMEOUT_MS;
    if (this.sampleCount > 0 && this.sampleCount % autocorrInterval === 0 && peakDetectionStale) {
      this.estimateHRFromAutocorrelation();
    }

    // ── 7. Continuous quality monitoring ──
    // Use FILTERED signal variance to detect motion — the high-pass filter removes
    // gravity and breathing, so only cardiac vibrations and actual motion remain.
    // Large motion produces huge filtered variance; resting cardiac signal is small.
    if (this.filteredHistory.length >= 20) {
      // Use last ~0.5s of filtered data
      const recentFiltered = this.filteredHistory.slice(-Math.round(this.sampleRateHz * 0.5));
      const filteredVariance =
        recentFiltered.length > 1 ? standardDeviation(recentFiltered) ** 2 : 0;

      // Debug: log every ~2 seconds with more detail
      if (this.sampleCount % Math.round(this.sampleRateHz * 2) < 1) {
        const env =
          this.envelopeBuffer.length > 0 ? this.envelopeBuffer[this.envelopeBuffer.length - 1] : 0;
        this.debug(
          `SCG: fltVar=${filteredVariance.toFixed(4)} flt=${filtered.toFixed(4)} env=${env.toFixed(4)} z=${z.toFixed(1)} peaks=${this.recentIBIs.length} q=${this.currentQuality.toFixed(2)} n=${this.sampleCount}`
        );
      }

      // TODO: Re-enable motion gate after tuning with real device data
      // For now, disabled to debug peak detection with actual accelerometer readings
      // if (filteredVariance > 10.0) {
      //   this.updateQuality(0);
      //   return;
      // }
    }

    // Set quality to moderate if we have any samples flowing, regardless of peaks
    // This lets us observe the signal even before peak detection kicks in
    if (this.sampleCount > 20 && this.currentQuality === 0) {
      this.updateQuality(0.3);
    }
  }

  // ─── Hilbert envelope ────────────────────────────────────────────────────────

  /**
   * Computes the Hilbert-transform envelope of the incoming sample stream.
   *
   * Uses a causal 17-tap FIR discrete Hilbert transformer (N=8) windowed with
   * a Hanning window.  The envelope at each sample is:
   *   envelope[n] = sqrt(x[n-N]² + xHilbert[n]²)
   *
   * @param sample - latest filtered sample
   * @returns instantaneous envelope amplitude
   */
  private hilbertEnvelope(sample: number): number {
    // Push into delay line
    this.hilbertBuffer.push(sample);
    if (this.hilbertBuffer.length > 2 * HILBERT_N + 1) {
      this.hilbertBuffer.shift();
    }

    if (this.hilbertBuffer.length < 2 * HILBERT_N + 1) {
      return Math.abs(sample);
    }

    // Apply Hilbert FIR to get the quadrature component
    const coeffs = this.hilbertCoeffs;
    let quadrature = 0;
    for (let k = 0; k < coeffs.length; k++) {
      quadrature += coeffs[k] * this.hilbertBuffer[k];
    }

    // The in-phase component is delayed by N samples to match Hilbert latency
    const inPhase = this.hilbertBuffer[HILBERT_N];

    return Math.sqrt(inPhase * inPhase + quadrature * quadrature);
  }

  /**
   * Build the 17-tap discrete Hilbert FIR coefficients with Hanning window.
   *   h[n] = 2/(π*(n-N)) for odd (n-N), 0 for even (n-N)
   *   windowed by w[n] = 0.5 * (1 - cos(2π*n / (2N)))
   */
  private buildHilbertCoeffs(): void {
    const N = HILBERT_N;
    const taps = 2 * N + 1;
    this.hilbertCoeffs = new Array(taps).fill(0);
    for (let n = 0; n < taps; n++) {
      const k = n - N; // centre at 0
      if (k !== 0 && k % 2 !== 0) {
        const hanning = 0.5 * (1 - Math.cos((2 * Math.PI * n) / (2 * N)));
        this.hilbertCoeffs[n] = (2 / (Math.PI * k)) * hanning;
      }
    }
  }

  // ─── Template matching ───────────────────────────────────────────────────────

  /**
   * Compute the normalised cross-correlation between two equal-length vectors.
   * Returns a value in [-1, 1]; negative means anti-correlated.
   */
  private normalizedCrossCorrelation(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA * normB);
    return denom > 1e-12 ? dot / denom : 0;
  }

  /**
   * Update / set the template by averaging the waveform segments around the
   * most recent `count` detected peaks.
   */
  private rebuildTemplate(): void {
    const W = this.TEMPLATE_WINDOW_SAMPLES;
    const recentPeaks = this.detectedPeakSampleIndices.slice(-5);
    const segments: number[][] = [];

    for (const peakIdx of recentPeaks) {
      const segment = this.extractSegmentAroundSample(peakIdx, W);
      if (segment === null) continue;
      const norm = Math.sqrt(segment.reduce((sum, value) => sum + value * value, 0));
      if (norm > 1e-12) segments.push(segment.map((value) => value / norm));
    }

    if (segments.length === 0) return;

    const len = segments[0].length;
    const avg = new Array(len).fill(0);
    // NCC compares shape independently of amplitude. Give each beat equal
    // weight so a large startup transient cannot dominate the learned shape.
    for (const seg of segments) {
      for (let i = 0; i < len; i++) {
        avg[i] += seg[i] / segments.length;
      }
    }
    this.template = avg;
  }

  /**
   * Extract a ±W sample window from filteredHistory centred on `peakSampleIdx`.
   * Returns null if insufficient history is available.
   */
  private extractSegmentAroundSample(peakSampleIdx: number, W: number): number[] | null {
    // filteredHistory holds the last filteredHistoryMaxLen samples.
    // The most recent sample is at sampleIndex - 1.
    const oldestAvailable = this.sampleIndex - this.filteredHistory.length;
    const startIdx = peakSampleIdx - W;
    const endIdx = peakSampleIdx + W;

    if (startIdx < oldestAvailable || endIdx >= this.sampleIndex) return null;

    const result: number[] = [];
    for (let idx = startIdx; idx <= endIdx; idx++) {
      const histPos = idx - oldestAvailable;
      result.push(this.filteredHistory[histPos]);
    }
    return result;
  }

  /**
   * Validate a candidate peak against the current template.
   * Returns true if the peak should be accepted (no template yet → always accept).
   */
  private validatePeakWithTemplate(peakSampleIdx: number): boolean {
    if (this.template === null) return true;

    const W = this.TEMPLATE_WINDOW_SAMPLES;
    const segment = this.extractSegmentAroundSample(peakSampleIdx, W);
    if (segment === null) return false;

    const ncc = this.normalizedCrossCorrelation(this.template, segment);
    if (ncc >= this.TEMPLATE_NCC_THRESHOLD) {
      this.templateMatchCount++;
      return true;
    }
    return false;
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private axisCalibrated = false;
  private bestAxis: 'x' | 'y' | 'z' = 'z';
  private calibrationSamples: { x: number; y: number; z: number }[] = [];

  /**
   * Extract the best acceleration axis for cardiac signal detection.
   *
   * Auto-detects which axis has gravity (largest absolute mean) during the
   * first 30 samples. The gravity axis is perpendicular to the chest surface
   * and carries the strongest cardiac vibration signal.
   *
   * Works in any orientation: face-up (Z), face-down (Z), on-side (X or Y).
   */
  private extractSignal(event: DeviceMotionEvent): number | null {
    const acc = event.accelerationIncludingGravity ?? event.acceleration;
    if (!acc) return null;

    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;

    // Auto-calibrate: find the axis carrying gravity (largest mean absolute value)
    if (!this.axisCalibrated) {
      this.calibrationSamples.push({ x, y, z });
      if (this.calibrationSamples.length >= 30) {
        const avgX = this.calibrationSamples.reduce((s, v) => s + Math.abs(v.x), 0) / 30;
        const avgY = this.calibrationSamples.reduce((s, v) => s + Math.abs(v.y), 0) / 30;
        const avgZ = this.calibrationSamples.reduce((s, v) => s + Math.abs(v.z), 0) / 30;

        if (avgX >= avgY && avgX >= avgZ) this.bestAxis = 'x';
        else if (avgY >= avgX && avgY >= avgZ) this.bestAxis = 'y';
        else this.bestAxis = 'z';

        this.axisCalibrated = true;
        this.debug(
          `SCG: Auto-calibrated axis=${this.bestAxis} (avgX=${avgX.toFixed(2)} avgY=${avgY.toFixed(2)} avgZ=${avgZ.toFixed(2)})`
        );
      }
      return z; // Use Z during calibration
    }

    // Return the gravity-aligned axis
    switch (this.bestAxis) {
      case 'x':
        return x;
      case 'y':
        return y;
      case 'z':
        return z;
    }
  }

  private getAccelerationMagnitude(event: DeviceMotionEvent): number | null {
    const acceleration = event.accelerationIncludingGravity ?? event.acceleration;
    if (!acceleration) return null;

    const x = acceleration.x ?? 0;
    const y = acceleration.y ?? 0;
    const z = acceleration.z ?? 0;
    const magnitude = Math.sqrt(x * x + y * y + z * z);
    if (!Number.isFinite(magnitude)) return Number.NaN;

    return magnitude;
  }

  private estimateSampleRateFromWallClock(): void {
    const timestamps = this.rateEstimationTimestamps;
    if (timestamps.length < 2) return;

    const intervals: number[] = [];
    for (let i = 1; i < timestamps.length; i++) {
      intervals.push(timestamps[i] - timestamps[i - 1]);
    }
    const avgIntervalMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (avgIntervalMs > 0) {
      const estimated = 1000 / avgIntervalMs;
      if (estimated >= 10 && estimated <= 1000) {
        this.applySampleRate(estimated);
      }
    }
  }

  private applySampleRate(hz: number): void {
    if (this.rateEstimated) return;
    this.sampleRateHz = hz;
    this.rateEstimated = true;
    this.rebuildFiltersAndDetector();
    if (hz < MIN_RECOMMENDED_SAMPLE_RATE_HZ) {
      console.warn(`SCG: low sample rate detected (${hz.toFixed(1)} Hz). Accuracy may be reduced.`);
    }
  }

  private rebuildFiltersAndDetector(): void {
    const fs = this.sampleRateHz;
    const lowpassCutoffHz = Math.min(LP_CUTOFF_HZ, fs * 0.45);
    const highpassCutoffHz = Math.min(HP_CUTOFF_HZ, lowpassCutoffHz * 0.5);
    this.hpFilter = createHighpassFilter(highpassCutoffHz, fs);
    this.lpFilter = createLowpassFilter(lowpassCutoffHz, fs);

    this.TEMPLATE_WINDOW_SAMPLES = Math.round(fs * 0.1); // ±100 ms
    this.filteredHistoryMaxLen = Math.max(
      2 * this.TEMPLATE_WINDOW_SAMPLES + 1,
      Math.round(fs * 6) // 6 seconds for autocorrelation
    );

    // Rebuild Hilbert coefficients for the (potentially new) sample rate
    this.buildHilbertCoeffs();
    this.hilbertBuffer = [];

    // Envelope smoothing window
    this.envelopeSmoothSamples = Math.max(1, Math.round(fs * ENVELOPE_SMOOTH_SECONDS));
    this.envelopeBuffer = [];

    const minPeakDistance = Math.max(1, Math.floor(fs * (60 / MAX_HEART_RATE_BPM)));
    this.peakDetectorStartSampleIndex = this.sampleIndex;
    this.pendingPeaks = [];
    this.peakDetector = new StreamingPeakDetector({
      minPeakDistance,
      thresholdFactor: 0.3, // Lower for quantized accelerometer data (0.1 m/s² resolution)
      adaptiveWindow: Math.max(10, Math.round(fs * 0.5)),
      minProminence: 0.1, // Lower — cardiac peaks are small with quantized data
    });
  }

  /**
   * Autocorrelation-based HR estimation for quantized accelerometer data.
   * When the accelerometer resolution is too low for peak detection (0.1 m/s²),
   * the timing of the quantization steps still carries cardiac periodicity.
   */
  private estimateHRFromAutocorrelation(): HeartRateEstimate | null {
    // Use the filtered signal history (high-pass removes gravity)
    const data = this.filteredHistory;
    if (data.length < Math.round(this.sampleRateHz * 3)) return null; // need 3+ seconds

    const N = Math.min(data.length, Math.round(this.sampleRateHz * 5));
    const segment = data.slice(-N);

    // Compute mean
    let mean = 0;
    for (let i = 0; i < N; i++) mean += segment[i];
    mean /= N;

    // Center
    const centered = segment.map((v) => v - mean);

    // Autocorrelation for lags corresponding to 40-150 BPM
    const minLag = Math.round((this.sampleRateHz * 60) / 150); // ~25 at 60Hz
    const maxLag = Math.round((this.sampleRateHz * 60) / 40); // ~90 at 60Hz

    const correlations: Array<{ lag: number; ncc: number }> = [];
    let bestLag = 0;
    let bestCorr = -Infinity;

    for (let lag = minLag; lag <= maxLag && lag < N; lag++) {
      let corr = 0,
        norm1 = 0,
        norm2 = 0;
      const len = N - lag;
      for (let i = 0; i < len; i++) {
        corr += centered[i] * centered[i + lag];
        norm1 += centered[i] * centered[i];
        norm2 += centered[i + lag] * centered[i + lag];
      }
      const denom = Math.sqrt(norm1 * norm2);
      const ncc = denom > 0 ? corr / denom : 0;
      correlations.push({ lag, ncc });
      if (ncc > bestCorr) {
        bestCorr = ncc;
        bestLag = lag;
      }
    }

    if (bestLag > 0 && bestCorr > 0) {
      const localPeak = correlations.find((point, index) => {
        const previous = correlations[index - 1]?.ncc ?? -Infinity;
        const next = correlations[index + 1]?.ncc ?? -Infinity;
        return point.ncc >= bestCorr * 0.8 && point.ncc >= previous && point.ncc >= next;
      });
      bestLag = localPeak?.lag ?? bestLag;
      bestCorr = localPeak?.ncc ?? bestCorr;
    }

    const intervalMs = (bestLag / this.sampleRateHz) * 1000;
    const hr = 60000 / intervalMs;

    this.debug(
      `SCG autocorr: corr=${bestCorr.toFixed(3)} lag=${bestLag} HR=${hr.toFixed(1)} BPM interval=${intervalMs.toFixed(0)}ms`
    );

    if (
      bestCorr < 0.15 ||
      bestLag === 0 ||
      !Number.isFinite(intervalMs) ||
      intervalMs < 400 ||
      intervalMs > 1500
    ) {
      return null;
    }

    const estimate: HeartRateEstimate = {
      timestamp: this.toMonotonicTimestamp(this.elapsedMs),
      bpm: hr,
      quality: Math.min(1, bestCorr),
      source: 'scg',
      method: 'autocorrelation-estimate',
    };
    this.callbacks.onHeartRateEstimate?.(estimate);
    this.updateQuality(Math.min(1, bestCorr * 1.5));
    return estimate;
  }

  private computeQuality(): number {
    // Motion gating using filtered signal (gravity removed)
    if (this.filteredHistory.length >= 20) {
      const recentFiltered = this.filteredHistory.slice(-Math.round(this.sampleRateHz * 0.5));
      const filteredVar = recentFiltered.length > 1 ? standardDeviation(recentFiltered) ** 2 : 0;
      if (filteredVar > 10.0) {
        return 0;
      }
    }

    // No-peak timeout: phone may not be on chest
    if (
      this.lastPeakDetectionElapsedMs !== null &&
      this.elapsedMs - this.lastPeakDetectionElapsedMs > NO_PEAK_TIMEOUT_MS
    ) {
      return 0;
    }

    // IBI regularity quality
    if (this.recentIBIs.length >= MIN_IBI_FOR_QUALITY) {
      return assessIBIQuality(this.recentIBIs);
    }

    // Not enough data yet — return a moderate quality value
    return 0.5;
  }

  private updateQuality(quality: number): void {
    if (quality !== this.currentQuality) {
      this.currentQuality = quality;
      this.callbacks.onQualityChange?.(quality);
    }
  }

  private setStatus(status: SCGStatus): void {
    if (status !== this.status) {
      this.status = status;
      this.callbacks.onStatusChange?.(status);
    }
  }

  private emitError(error: Error): void {
    this.setStatus('error');
    this.callbacks.onError?.(error);
  }

  private toMonotonicTimestamp(elapsedTimestampMs: number): number {
    return this.measurementStartMonotonicMs + elapsedTimestampMs;
  }

  private resetInternals(): void {
    this.hpFilter = null;
    this.lpFilter = null;
    this.peakDetector = null;
    this.hilbertBuffer = [];
    this.hilbertCoeffs = [];
    this.envelopeBuffer = [];
    this.envelopeSmoothSamples = Math.round(DEFAULT_SAMPLE_RATE_HZ * ENVELOPE_SMOOTH_SECONDS);
    this.rateEstimationTimestamps = [];
    this.rateEstimated = false;
    this.sampleRateHz = DEFAULT_SAMPLE_RATE_HZ;
    this.lastIntervalMs = DEFAULT_INTERVAL_MS;
    this.elapsedMs = 0;
    this.measurementStartMonotonicMs = performance.now();
    this.lastMotionArrivalMs = this.measurementStartMonotonicMs;
    this.lastPeakElapsedMs = null;
    this.lastPeakDetectionElapsedMs = null;
    this.recentIBIs = [];
    this.sampleCount = 0;
    this.currentQuality = 0;
    this.motionGate = new AdaptiveMotionGate();
    this.template = null;
    this.templateMatchCount = 0;
    this.filteredHistory = [];
    this.axisCalibrated = false;
    this.bestAxis = 'z';
    this.calibrationSamples = [];
    this.filteredHistoryMaxLen = Math.round(DEFAULT_SAMPLE_RATE_HZ * 6);
    this.detectedPeakSampleIndices = [];
    this.sampleIndex = 0;
    this.peakDetectorStartSampleIndex = 0;
    this.pendingPeaks = [];
    this.TEMPLATE_WINDOW_SAMPLES = Math.round(DEFAULT_SAMPLE_RATE_HZ * 0.1);
  }

  private debug(message: string): void {
    if (SCG_DEBUG) {
      console.log(message);
    }
  }
}

// Singleton export, matching the pattern used by ttsService
export const scgService = new SCGService();
