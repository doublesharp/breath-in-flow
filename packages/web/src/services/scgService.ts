/**
 * Accelerometer SCG (seismocardiography) service.
 *
 * Detects heartbeats through chest-wall vibrations when the phone is placed
 * flat on the user's sternum (face-up).  The aortic valve opening (AO) event
 * produces the dominant peak in the Z-axis acceleration signal.
 *
 * Signal pipeline (per sample):
 *   raw Z-axis → high-pass 1 Hz → low-pass 25 Hz → RMS envelope → peak detector
 *
 * Timing note: the service maintains a synthetic elapsed-time counter
 * incremented by event.interval each sample.  This makes it both accurate on
 * real hardware and fully deterministic in tests where performance.now() does
 * not advance between synchronous dispatches.
 */

import {
  createHighpassFilter,
  createLowpassFilter,
  StreamingPeakDetector,
  assessIBIQuality,
  rms,
  standardDeviation,
  type IBISample,
} from '@breath-in-flow/shared';

import type { SOSFilter } from '@breath-in-flow/shared';

// ─── Public types ─────────────────────────────────────────────────────────────

export type SCGStatus = 'idle' | 'initializing' | 'capturing' | 'error';

export interface SCGCallbacks {
  onIBI?: (sample: IBISample) => void;
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

/** High-pass cutoff: removes gravity and slow respiratory drift. */
const HP_CUTOFF_HZ = 1;

/** Low-pass cutoff: removes high-frequency electronic noise. */
const LP_CUTOFF_HZ = 25;

/** RMS envelope window in seconds. */
const RMS_WINDOW_SECONDS = 0.05;

/** Maximum plausible heart rate (limits minimum peak distance in samples). */
const MAX_HEART_RATE_BPM = 200;

/** Window used to estimate motion variance for quality gating (seconds). */
const MOTION_VARIANCE_WINDOW_SECONDS = 1;

/** Raw acceleration variance threshold above which the user is considered moving. */
const MOTION_VARIANCE_THRESHOLD = 0.5; // (m/s²)²

/** Time without a detected peak before quality is zeroed (synthetic ms). */
const NO_PEAK_TIMEOUT_MS = 3000;

/** Minimum number of recent IBI samples before running quality assessment. */
const MIN_IBI_FOR_QUALITY = 3;

/** Number of recent IBI intervals kept for quality assessment. */
const MAX_RECENT_IBIS = 20;

/** Warn if the detected sample rate is below this value. */
const MIN_RECOMMENDED_SAMPLE_RATE_HZ = 50;

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
  private rateEstimationTimestamps: number[] = []; // wall-clock ms
  private rateEstimated = false;

  // Synthetic elapsed-time clock (ms since start(), advanced by event.interval)
  private elapsedMs: number = 0;

  // RMS envelope window
  private rmsBuffer: number[] = [];
  private rmsWindowSamples: number = Math.round(DEFAULT_SAMPLE_RATE_HZ * RMS_WINDOW_SECONDS);

  // Motion quality monitoring
  private rawAccBuffer: number[] = [];
  private motionWindowSamples: number = Math.round(
    DEFAULT_SAMPLE_RATE_HZ * MOTION_VARIANCE_WINDOW_SECONDS,
  );

  // IBI tracking
  private lastPeakElapsedMs: number | null = null;
  private lastPeakDetectionElapsedMs: number | null = null;
  private recentIBIs: number[] = [];

  // Quality
  private currentQuality = 0;

  // Bound event handler reference (needed for removeEventListener)
  private boundHandleMotion = this.handleMotion.bind(this);

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

  public async start(): Promise<void> {
    if (this.status === 'capturing') return;

    this.setStatus('initializing');

    // Check for DeviceMotionEvent API
    if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) {
      this.emitError(new Error('DeviceMotionEvent is not available in this environment'));
      return;
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
        if (permission !== 'granted') {
          this.emitError(
            new Error(
              'Motion sensor permission denied. Please enable motion access in iOS Settings > Privacy > Motion & Fitness.',
            ),
          );
          return;
        }
      } catch (err) {
        this.emitError(
          new Error(
            `Failed to request motion permission: ${err instanceof Error ? err.message : String(err)}`,
          ),
        );
        return;
      }
    }

    this.resetInternals();
    window.addEventListener('devicemotion', this.boundHandleMotion);
    this.setStatus('capturing');
  }

  public stop(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('devicemotion', this.boundHandleMotion);
    }
    this.resetInternals();
    this.setStatus('idle');
  }

  // ─── Motion event handler ────────────────────────────────────────────────────

  /** Called for every DeviceMotionEvent from the accelerometer. */
  private handleMotion(event: DeviceMotionEvent): void {
    // ── 1. Advance synthetic clock ──
    // Use event.interval when available; fall back to the last known interval.
    const intervalMs =
      event.interval && event.interval > 0 ? event.interval : this.lastIntervalMs;
    this.lastIntervalMs = intervalMs;
    this.elapsedMs += intervalMs;

    // ── 2. Sample-rate estimation ──
    if (!this.rateEstimated) {
      this.rateEstimationTimestamps.push(performance.now());

      const rateFromInterval = 1000 / intervalMs;
      if (rateFromInterval >= 10 && rateFromInterval <= 1000) {
        this.applySampleRate(rateFromInterval);
      } else if (this.rateEstimationTimestamps.length >= RATE_ESTIMATION_EVENTS) {
        this.estimateSampleRateFromWallClock();
      }
    }

    // ── 3. Extract Z-axis signal ──
    const z = this.extractZAxis(event);
    if (z === null) return;

    // Track raw magnitude for motion detection
    const rawMag = this.extractMagnitude(event) ?? Math.abs(z);
    this.rawAccBuffer.push(rawMag);
    if (this.rawAccBuffer.length > this.motionWindowSamples) {
      this.rawAccBuffer.shift();
    }

    // Emit raw (unfiltered) signal for external visualization
    this.callbacks.onRawSignal?.(z, this.elapsedMs);

    // Ensure filters exist (lazy init in case rate wasn't known at start)
    if (!this.hpFilter || !this.lpFilter || !this.peakDetector) {
      this.rebuildFiltersAndDetector();
    }

    // ── 4. Filter ──
    const afterHP = this.hpFilter!.filter(z);
    const filtered = this.lpFilter!.filter(afterHP);

    // ── 5. RMS envelope ──
    this.rmsBuffer.push(Math.abs(filtered));
    if (this.rmsBuffer.length > this.rmsWindowSamples) {
      this.rmsBuffer.shift();
    }
    const envelope = rms(this.rmsBuffer);

    // ── 6. Peak detection ──
    const peak = this.peakDetector!.addSample(envelope, this.elapsedMs);

    if (peak) {
      this.lastPeakDetectionElapsedMs = this.elapsedMs;

      if (this.lastPeakElapsedMs !== null) {
        const ibi = this.elapsedMs - this.lastPeakElapsedMs;

        // Physiological sanity check: 200 BPM (300 ms) to 30 BPM (2000 ms)
        if (ibi >= 300 && ibi <= 2000) {
          this.recentIBIs.push(ibi);
          if (this.recentIBIs.length > MAX_RECENT_IBIS) {
            this.recentIBIs.shift();
          }

          const quality = this.computeQuality();
          this.updateQuality(quality);

          const sample: IBISample = {
            timestamp: this.elapsedMs,
            interval: ibi,
            quality,
          };
          this.callbacks.onIBI?.(sample);
        }
      }

      this.lastPeakElapsedMs = this.elapsedMs;
    }

    // ── 7. Continuous quality monitoring ──
    // Check for motion artefacts and peak timeout on every sample so that
    // quality degrades promptly even when no peak is being detected.
    if (this.rawAccBuffer.length >= this.motionWindowSamples) {
      const motionVariance = standardDeviation(this.rawAccBuffer) ** 2;
      if (motionVariance > MOTION_VARIANCE_THRESHOLD) {
        this.updateQuality(0);
        return;
      }
    }

    if (
      this.lastPeakDetectionElapsedMs !== null &&
      this.elapsedMs - this.lastPeakDetectionElapsedMs > NO_PEAK_TIMEOUT_MS
    ) {
      this.updateQuality(0);
    }
  }

  // ─── Internal helpers ────────────────────────────────────────────────────────

  private extractZAxis(event: DeviceMotionEvent): number | null {
    // Prefer pure acceleration (gravity already removed by hardware)
    if (event.acceleration?.z !== null && event.acceleration?.z !== undefined) {
      return event.acceleration.z;
    }

    // Fall back to accelerationIncludingGravity. The high-pass filter will
    // remove the static ~9.8 m/s² gravity component.
    if (
      event.accelerationIncludingGravity?.z !== null &&
      event.accelerationIncludingGravity?.z !== undefined
    ) {
      return event.accelerationIncludingGravity.z;
    }

    return null;
  }

  private extractMagnitude(event: DeviceMotionEvent): number | null {
    const acc = event.acceleration ?? event.accelerationIncludingGravity;
    if (!acc) return null;
    const x = acc.x ?? 0;
    const y = acc.y ?? 0;
    const z = acc.z ?? 0;
    return Math.sqrt(x * x + y * y + z * z);
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
      console.warn(
        `SCG: low sample rate detected (${hz.toFixed(1)} Hz). Accuracy may be reduced.`,
      );
    }
  }

  private rebuildFiltersAndDetector(): void {
    const fs = this.sampleRateHz;
    this.hpFilter = createHighpassFilter(HP_CUTOFF_HZ, fs);
    this.lpFilter = createLowpassFilter(LP_CUTOFF_HZ, fs);

    this.rmsWindowSamples = Math.max(1, Math.round(fs * RMS_WINDOW_SECONDS));
    this.motionWindowSamples = Math.max(1, Math.round(fs * MOTION_VARIANCE_WINDOW_SECONDS));

    const minPeakDistance = Math.floor(fs * (60 / MAX_HEART_RATE_BPM));
    this.peakDetector = new StreamingPeakDetector({
      minPeakDistance,
      thresholdFactor: 0.6,
      adaptiveWindow: Math.max(10, Math.round(fs * 0.5)),
    });
  }

  private computeQuality(): number {
    // Motion gating: high variance → user is moving
    const motionVariance = standardDeviation(this.rawAccBuffer) ** 2;
    if (motionVariance > MOTION_VARIANCE_THRESHOLD) {
      return 0;
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

  private resetInternals(): void {
    this.hpFilter = null;
    this.lpFilter = null;
    this.peakDetector = null;
    this.rmsBuffer = [];
    this.rawAccBuffer = [];
    this.rateEstimationTimestamps = [];
    this.rateEstimated = false;
    this.sampleRateHz = DEFAULT_SAMPLE_RATE_HZ;
    this.lastIntervalMs = DEFAULT_INTERVAL_MS;
    this.elapsedMs = 0;
    this.rmsWindowSamples = Math.round(DEFAULT_SAMPLE_RATE_HZ * RMS_WINDOW_SECONDS);
    this.motionWindowSamples = Math.round(
      DEFAULT_SAMPLE_RATE_HZ * MOTION_VARIANCE_WINDOW_SECONDS,
    );
    this.lastPeakElapsedMs = null;
    this.lastPeakDetectionElapsedMs = null;
    this.recentIBIs = [];
    this.currentQuality = 0;
  }
}

// Singleton export, matching the pattern used by ttsService
export const scgService = new SCGService();
