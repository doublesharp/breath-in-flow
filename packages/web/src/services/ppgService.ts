import {
  createBandpassFilter,
  StreamingPeakDetector,
  assessSignalQuality,
  detectPeaks,
  type HeartRateEstimate,
  type IBISample,
} from '@breath-in-flow/shared';
import type { SOSFilter } from '@breath-in-flow/shared';
import { Capacitor } from '@capacitor/core';
import { Torch } from '@capawesome/capacitor-torch';
import {
  sensorStartFailure,
  type SensorStartFailureReason,
  type SensorStartResult,
} from './sensorTypes';

const PPG_DEBUG = import.meta.env.DEV && import.meta.env.VITE_PPG_DEBUG === 'true';
const DEFAULT_LOW_CUT_HZ = 0.7;
const DEFAULT_HIGH_CUT_HZ = 3.5;
const DEFAULT_FILTER_ORDER = 4;
const ADAPTIVE_FILTER_ORDER = 2;

function debugLog(message: string, ...args: unknown[]): void {
  if (PPG_DEBUG) {
    console.log(message, ...args);
  }
}

function debugWarn(message: string, ...args: unknown[]): void {
  if (PPG_DEBUG) {
    console.warn(message, ...args);
  }
}

export type PPGStatus = 'idle' | 'initializing' | 'capturing' | 'error';

export interface PPGCallbacks {
  onIBI?: (sample: IBISample) => void;
  onHeartRateEstimate?: (estimate: HeartRateEstimate) => void;
  onRawSignal?: (value: number, timestamp: number) => void;
  onQualityChange?: (quality: number) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: PPGStatus) => void;
}

export interface PPGStartOptions {
  callbacks?: PPGCallbacks;
  /** Use a specific camera by deviceId. If not set, uses the default rear camera. */
  cameraDeviceId?: string;
  /** Disable the torch/flash. Default: true (torch enabled). */
  torchEnabled?: boolean;
}

/**
 * List available video input devices (cameras).
 * Useful for letting the user pick the camera closest to the flash.
 */
export async function listCameras(): Promise<{ deviceId: string; label: string }[]> {
  try {
    // Need a brief getUserMedia call to get labeled devices on Android
    const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
    tempStream.getTracks().forEach(t => t.stop());

    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices
      .filter(d => d.kind === 'videoinput')
      .map(d => ({ deviceId: d.deviceId, label: d.label || `Camera ${d.deviceId.slice(0, 8)}` }));
  } catch {
    return [];
  }
}

class PPGService {
  private status: PPGStatus = 'idle';
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private animFrameId: number | null = null;
  private callbacks: PPGCallbacks = {};

  // Signal processing
  private bandpassFilter: SOSFilter;
  private peakDetector: StreamingPeakDetector;
  private rawBuffer: number[] = [];
  private lastPeakTimestamp: number | null = null;
  private signalQuality: number = 0;

  // Rolling normalization buffer (for normalizing filtered signal before peak detection)
  private normBuffer: number[] = [];
  private readonly NORM_WINDOW = 90; // 3 seconds at 30fps

  // Frame throttling
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private torchEnabled: boolean = false;

  // Adaptive bandpass state
  private adaptiveFilterFrameCount: number = 0;
  private recentIBIsMs: number[] = []; // Recent IBI values for adaptive filter
  private currentLowCut: number = DEFAULT_LOW_CUT_HZ;
  private currentHighCut: number = DEFAULT_HIGH_CUT_HZ;

  // Configuration
  private readonly SAMPLE_RATE = 30; // fps
  private readonly BUFFER_SIZE = 300; // 10 seconds at 30fps
  private readonly MIN_PEAK_DISTANCE_SAMPLES = 9; // 300ms at 30fps ≈ 200 BPM max
  private readonly FRAME_INTERVAL_MS = 1000 / 30; // ~33ms between frames
  private readonly QUALITY_CHECK_INTERVAL = 30; // frames between quality checks
  private readonly ADAPTIVE_FILTER_INTERVAL = 300; // frames between adaptive filter updates (~10s)

  constructor() {
    // 4th-order Butterworth bandpass 0.7-3.5 Hz (42-210 BPM)
    // Higher order = sharper rolloff = better rejection of baseline drift
    // Narrower band = less noise, more focused on cardiac frequency
    this.bandpassFilter = createBandpassFilter(
      DEFAULT_LOW_CUT_HZ,
      DEFAULT_HIGH_CUT_HZ,
      this.SAMPLE_RATE,
      DEFAULT_FILTER_ORDER
    );
    this.peakDetector = new StreamingPeakDetector({
      minPeakDistance: this.MIN_PEAK_DISTANCE_SAMPLES,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
      adaptiveRefractory: true,
      minProminence: 0.05,
    });
  }

  public setCallbacks(callbacks: PPGCallbacks): void {
    this.callbacks = callbacks;
  }

  public getStatus(): PPGStatus {
    return this.status;
  }

  public getSignalQuality(): number {
    return this.signalQuality;
  }

  private setStatus(status: PPGStatus): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status);
  }

  /**
   * Enable torch using native Capacitor plugin (Android/iOS) or WebView fallback (desktop).
   */
  private async enableTorch(): Promise<void> {
    // Strategy 1: Native Capacitor torch plugin (most reliable on mobile)
    if (Capacitor.isNativePlatform()) {
      try {
        const { available } = await Torch.isAvailable();
        if (available) {
          await Torch.enable();
          this.torchEnabled = true;
          debugLog('PPG: Torch enabled via native Capacitor plugin');
          return;
        }
      } catch (e) {
        debugWarn('PPG: Native torch plugin failed:', e);
      }
    }

    // Strategy 2: WebView MediaStream torch constraint (Chrome desktop, some Android)
    if (this.stream) {
      const tracks = this.stream.getVideoTracks();
      if (tracks.length > 0) {
        const track = tracks[0];
        try {
          const capabilities = track.getCapabilities?.() as Record<string, unknown> | undefined;
          if (capabilities?.torch) {
            await track.applyConstraints({
              advanced: [{ torch: true } as MediaTrackConstraintSet],
            });
            this.torchEnabled = true;
            debugLog('PPG: Torch enabled via MediaStream constraint');
            return;
          }
        } catch {
          // Fall through
        }

        // Blind attempt — some devices support it without reporting in capabilities
        try {
          await track.applyConstraints({
            advanced: [{ torch: true } as MediaTrackConstraintSet],
          });
          this.torchEnabled = true;
          debugLog('PPG: Torch enabled via blind constraint attempt');
          return;
        } catch {
          // Truly not available
        }
      }
    }

    debugWarn('PPG: Torch/flashlight not available on this device');
  }

  /**
   * Disable torch on stop.
   */
  private async disableTorch(): Promise<void> {
    if (!this.torchEnabled) return;

    if (Capacitor.isNativePlatform()) {
      try {
        await Torch.disable();
      } catch {
        // Ignore — stream stopping will also release the torch
      }
    }
    this.torchEnabled = false;
  }

  public async start(
    callbacksOrOptions?: PPGCallbacks | PPGStartOptions,
  ): Promise<SensorStartResult> {
    // Support both old signature (callbacks only) and new options object
    let options: PPGStartOptions = {};
    if (callbacksOrOptions) {
      if ('callbacks' in callbacksOrOptions || 'cameraDeviceId' in callbacksOrOptions || 'torchEnabled' in callbacksOrOptions) {
        options = callbacksOrOptions as PPGStartOptions;
        if (options.callbacks) this.callbacks = options.callbacks;
      } else {
        this.callbacks = callbacksOrOptions as PPGCallbacks;
      }
    }

    const useTorch = options.torchEnabled !== false; // default true

    if (this.status === 'capturing' || this.status === 'initializing') {
      return { ok: true };
    }

    this.setStatus('initializing');

    try {
      // Request camera access
      const mediaDevices = navigator.mediaDevices;
      if (!mediaDevices || !mediaDevices.getUserMedia) {
        throw new Error(
          'Camera not available on this device. Please use a device with a camera.',
        );
      }

      // Build video constraints — use specific camera if provided
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 30 },
      };
      if (options.cameraDeviceId) {
        videoConstraints.deviceId = { exact: options.cameraDeviceId };
      } else {
        videoConstraints.facingMode = 'environment';
      }

      this.stream = await mediaDevices.getUserMedia({ video: videoConstraints });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      let message = error.message;

      if (
        error.name === 'NotAllowedError' ||
        error.name === 'PermissionDeniedError'
      ) {
        message =
          'Camera permission denied. Please allow camera access and try again.';
      } else if (
        error.name === 'NotFoundError' ||
        error.name === 'DevicesNotFoundError'
      ) {
        message =
          'No camera found on this device. A rear camera is required for PPG capture.';
      } else if (
        error.name === 'NotReadableError' ||
        error.name === 'TrackStartError'
      ) {
        message =
          'Camera is in use by another application. Please close other apps using the camera.';
      }

      this.setStatus('error');
      this.callbacks.onError?.(new Error(message));

      let reason: SensorStartFailureReason = 'start-failed';
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        reason = 'permission-denied';
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        reason = 'unavailable';
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        reason = 'device-busy';
      }
      return sensorStartFailure(reason, message);
    }

    try {
      // Create video element — must be added to DOM for Android WebView compatibility
      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      this.video.playsInline = true;
      this.video.muted = true;
      this.video.setAttribute('autoplay', '');
      this.video.setAttribute('playsinline', '');
      this.video.setAttribute('webkit-playsinline', '');
      // Hide but keep in DOM — some Android WebViews require this for frame capture
      this.video.style.position = 'fixed';
      this.video.style.top = '-9999px';
      this.video.style.left = '-9999px';
      this.video.style.width = '1px';
      this.video.style.height = '1px';
      this.video.style.opacity = '0.01';
      document.body.appendChild(this.video);

      // Reset processing state
      this.rawBuffer = [];
      this.normBuffer = [];
      this.lastRawValue = -1;
      this.lastPeakTimestamp = null;
      this.frameCount = 0;
      this.lastFrameTime = 0;
      this.adaptiveFilterFrameCount = 0;
      this.recentIBIsMs = [];
      this.currentLowCut = DEFAULT_LOW_CUT_HZ;
      this.currentHighCut = DEFAULT_HIGH_CUT_HZ;
      this.bandpassFilter.reset();
      this.peakDetector.reset();

      // Start video playback — must happen before torch and canvas setup
      await this.video.play();
      debugLog('PPG: Video playing, readyState:', this.video.readyState);

      // Wait for video to be ready with actual dimensions (timeout after 5s)
      await new Promise<void>((resolve) => {
        let attempts = 0;
        const checkReady = () => {
          attempts++;
          if (!this.video || this.status !== 'initializing') {
            resolve();
          } else if (this.video.videoWidth > 0 && this.video.videoHeight > 0) {
            debugLog(`PPG: Video ready — ${this.video.videoWidth}x${this.video.videoHeight}`);
            resolve();
          } else if (attempts > 150) {
            // Timeout after ~5 seconds, use defaults
            debugWarn('PPG: Video dimension timeout, using defaults 320x240');
            resolve();
          } else {
            requestAnimationFrame(checkReady);
          }
        };
        checkReady();
      });

      if (!this.video || this.getStatus() !== 'initializing') {
        return sensorStartFailure('start-failed', 'Camera startup was cancelled.');
      }

      // Create canvas matching actual video dimensions (not hardcoded)
      const vw = this.video.videoWidth || 320;
      const vh = this.video.videoHeight || 240;
      debugLog(`PPG: Canvas size ${vw}x${vh}`);
      this.canvas = document.createElement('canvas');
      this.canvas.width = vw;
      this.canvas.height = vh;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

      // Enable torch/flashlight for PPG illumination (unless user disabled it)
      if (useTorch) {
        await this.enableTorch();
      } else {
        debugLog('PPG: Torch disabled by user');
      }

      this.setStatus('capturing');
      this.scheduleNextFrame();
      return { ok: true };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      await this.cleanupCaptureResources();

      this.setStatus('error');
      const message = `Unable to start camera preview. ${error.message}`;
      this.callbacks.onError?.(new Error(message));
      return sensorStartFailure('start-failed', message);
    }
  }

  private async cleanupCaptureResources(): Promise<void> {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    await this.disableTorch();

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.srcObject = null;
      if (this.video.parentNode) {
        this.video.parentNode.removeChild(this.video);
      }
      this.video = null;
    }

    this.canvas = null;
    this.ctx = null;
  }

  private scheduleNextFrame(): void {
    this.animFrameId = requestAnimationFrame((timestamp) => {
      this.captureFrame(timestamp);
    });
  }

  private lastRawValue: number = -1;

  // Exposed for testing purposes
  public processSignalSample(value: number, timestamp: number): IBISample | null {
    // Skip samples where the signal is clearly invalid (camera blocked or saturated)
    if (value < 1 || value > 254) {
      this.callbacks.onRawSignal?.(0, timestamp);
      return null;
    }

    // Rate-of-change filter: reject sudden jumps from finger movement.
    // A real heartbeat causes ~2-5 units change per frame at 30fps.
    // Finger shifts cause 20+ unit jumps. Skip the sample and hold the
    // last good value to avoid injecting a massive transient into the filter.
    if (this.lastRawValue > 0) {
      const delta = Math.abs(value - this.lastRawValue);
      if (delta > 15) {
        // Large jump — don't feed to filter, emit zero for chart
        this.callbacks.onRawSignal?.(0, timestamp);
        // Don't update lastRawValue — wait for signal to stabilize
        return null;
      }
    }
    this.lastRawValue = value;

    // Pass through bandpass filter
    const filtered = this.bandpassFilter.filter(value);

    // Maintain rolling buffer of filtered values
    this.rawBuffer.push(filtered);
    if (this.rawBuffer.length > this.BUFFER_SIZE) {
      this.rawBuffer.shift();
    }

    this.callbacks.onRawSignal?.(filtered, timestamp);

    // Normalize the filtered signal to zero-mean, unit-variance over a rolling window.
    // This makes the peak detector work regardless of absolute signal amplitude.
    this.normBuffer.push(filtered);
    if (this.normBuffer.length > this.NORM_WINDOW) {
      this.normBuffer.shift();
    }

    let normalized = 0;
    if (this.normBuffer.length >= 10) {
      const mean = this.normBuffer.reduce((s, v) => s + v, 0) / this.normBuffer.length;
      const variance = this.normBuffer.reduce((s, v) => s + (v - mean) ** 2, 0) / this.normBuffer.length;
      const std = Math.sqrt(variance);
      normalized = std > 1e-8 ? (filtered - mean) / std : 0;
    }

    // Debug logging every 60 frames (~2 seconds)
    if (this.frameCount % 60 === 0 && this.frameCount > 0) {
      debugLog(
        `PPG signal: raw=${value.toFixed(1)} filtered=${filtered.toFixed(4)} normalized=${normalized.toFixed(3)} bufLen=${this.rawBuffer.length}`
      );
    }

    // Feed the normalized signal to the streaming peak detector
    const peak = this.peakDetector.addSample(normalized, timestamp);

    let ibiSample: IBISample | null = null;

    if (peak !== null) {
      const peakTimestamp = peak.timestamp ?? timestamp;

      if (this.lastPeakTimestamp !== null) {
        const interval = peakTimestamp - this.lastPeakTimestamp;

        // Only emit physiologically plausible intervals (300ms–2000ms = 30–200 BPM)
        // Tighter range: 400-1500ms (40-150 BPM) to reject motion artifacts
        if (interval >= 400 && interval <= 1500) {
          ibiSample = {
            timestamp: peakTimestamp,
            interval,
            quality: this.signalQuality,
            provenance: { source: 'ppg', method: 'peak-detected' },
          };
          this.callbacks.onIBI?.(ibiSample);

          // Track recent IBIs for adaptive bandpass filter
          this.recentIBIsMs.push(interval);
          if (this.recentIBIsMs.length > 10) {
            this.recentIBIsMs.shift();
          }
        }
      }

      this.lastPeakTimestamp = peakTimestamp;
    }

    return ibiSample;
  }

  /**
   * Autocorrelation-based heart rate estimation.
   * Finds the dominant periodicity in the filtered signal without needing
   * explicit peak detection. Works even with weak, noisy PPG signals.
   *
   * Called every 5 seconds as a fallback when peak detection hasn't found enough beats.
   */
  private estimateHRFromAutocorrelation(): HeartRateEstimate | null {
    // Need at least 5 seconds of data (150 samples at 30fps)
    if (this.rawBuffer.length < 150) return null;

    const data = this.rawBuffer.slice(-150); // last 5 seconds
    const N = data.length;

    // Compute mean
    let mean = 0;
    for (let i = 0; i < N; i++) mean += data[i];
    mean /= N;

    // Subtract mean
    const centered = data.map(v => v - mean);

    // Compute autocorrelation for lags corresponding to 40-180 BPM
    // 40 BPM = 1.5s = 45 samples at 30fps
    // 180 BPM = 0.33s = 10 samples at 30fps
    const minLag = Math.round(this.SAMPLE_RATE * 60 / 180); // ~10
    const maxLag = Math.round(this.SAMPLE_RATE * 60 / 40);  // ~45

    let bestLag = 0;
    let bestCorr = -Infinity;

    for (let lag = minLag; lag <= maxLag && lag < N; lag++) {
      let corr = 0;
      let norm1 = 0;
      let norm2 = 0;
      const len = N - lag;
      for (let i = 0; i < len; i++) {
        corr += centered[i] * centered[i + lag];
        norm1 += centered[i] * centered[i];
        norm2 += centered[i + lag] * centered[i + lag];
      }
      const denom = Math.sqrt(norm1 * norm2);
      const ncc = denom > 0 ? corr / denom : 0;

      if (ncc > bestCorr) {
        bestCorr = ncc;
        bestLag = lag;
      }
    }

    // Only accept if autocorrelation is strong enough (> 0.3)
    if (bestCorr < 0.3 || bestLag === 0) {
      if (this.frameCount % 150 === 0) {
        debugLog(`PPG autocorr: bestCorr=${bestCorr.toFixed(3)} bestLag=${bestLag} — too weak`);
      }
      return null;
    }

    const intervalMs = (bestLag / this.SAMPLE_RATE) * 1000;
    const hr = 60000 / intervalMs;

    debugLog(
      `PPG autocorr: HR=${hr.toFixed(1)} BPM (lag=${bestLag}, corr=${bestCorr.toFixed(3)}, interval=${intervalMs.toFixed(0)}ms)`
    );

    const estimate: HeartRateEstimate = {
      timestamp: performance.now(),
      bpm: hr,
      quality: Math.min(1, bestCorr), // correlation strength as quality
      source: 'ppg',
      method: 'autocorrelation-estimate',
    };
    this.callbacks.onHeartRateEstimate?.(estimate);

    return estimate;
  }

  /**
   * Update the adaptive bandpass filter based on estimated heart rate.
   * Called every ADAPTIVE_FILTER_INTERVAL frames (~10 seconds at 30fps).
   *
   * Aboy++-inspired: narrows the passband around the actual heart rate
   * to reject more motion and ambient noise.
   */
  private updateAdaptiveFilter(): void {
    if (this.recentIBIsMs.length < 3) {
      // Not enough data — revert to defaults if we drifted
      if (this.currentLowCut !== DEFAULT_LOW_CUT_HZ || this.currentHighCut !== DEFAULT_HIGH_CUT_HZ) {
        this.currentLowCut = DEFAULT_LOW_CUT_HZ;
        this.currentHighCut = DEFAULT_HIGH_CUT_HZ;
        this.bandpassFilter = createBandpassFilter(
          this.currentLowCut,
          this.currentHighCut,
          this.SAMPLE_RATE,
          DEFAULT_FILTER_ORDER,
        );
      }
      return;
    }

    // Estimate HR from mean IBI
    const meanIBI =
      this.recentIBIsMs.reduce((sum, v) => sum + v, 0) / this.recentIBIsMs.length;
    const hrHz = 1000 / meanIBI; // convert ms to Hz

    // Adjust cutoffs: low = HR * 0.5, high = HR * 2.5, clamped to [0.7, 3.5]
    const newLowCut = Math.max(DEFAULT_LOW_CUT_HZ, hrHz * 0.5);
    const newHighCut = Math.min(DEFAULT_HIGH_CUT_HZ, hrHz * 2.5);

    // Only rebuild if cutoffs changed meaningfully (>0.05 Hz)
    if (
      Math.abs(newLowCut - this.currentLowCut) > 0.05 ||
      Math.abs(newHighCut - this.currentHighCut) > 0.05
    ) {
      this.currentLowCut = newLowCut;
      this.currentHighCut = newHighCut;
      this.bandpassFilter = createBandpassFilter(
        this.currentLowCut,
        this.currentHighCut,
        this.SAMPLE_RATE,
        ADAPTIVE_FILTER_ORDER,
      );
    }
  }

  private captureFrame(timestamp: number): void {
    if (this.status !== 'capturing') return;

    // Throttle to ~30fps
    const delta = timestamp - this.lastFrameTime;
    if (delta < this.FRAME_INTERVAL_MS * 0.8) {
      this.scheduleNextFrame();
      return;
    }
    this.lastFrameTime = timestamp;

    if (
      !this.video ||
      !this.canvas ||
      !this.ctx ||
      this.video.readyState < 2
    ) {
      this.scheduleNextFrame();
      return;
    }

    // Draw current video frame to canvas
    this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);

    // Extract pixel data from central ROI (middle 50% of frame)
    const roiX = Math.floor(this.canvas.width * 0.25);
    const roiY = Math.floor(this.canvas.height * 0.25);
    const roiW = Math.floor(this.canvas.width * 0.5);
    const roiH = Math.floor(this.canvas.height * 0.5);

    const imageData = this.ctx.getImageData(roiX, roiY, roiW, roiH);
    const pixels = imageData.data;

    // Compute average green and red channel intensities (RGBA layout: R=0, G=1, B=2, A=3)
    let redSum = 0;
    let greenSum = 0;
    const pixelCount = roiW * roiH;
    for (let i = 0; i < pixels.length; i += 4) {
      redSum += pixels[i];     // red channel
      greenSum += pixels[i + 1]; // green channel
    }
    const redAvg = pixelCount > 0 ? redSum / pixelCount : 0;
    const greenAvg = pixelCount > 0 ? greenSum / pixelCount : 0;

    // Debug: log pixel values every 2 seconds (60 frames at 30fps)
    if (this.frameCount > 0 && this.frameCount % 60 === 0) {
      debugLog(
        `PPG frame ${this.frameCount}: R=${redAvg.toFixed(1)} G=${greenAvg.toFixed(1)} readyState=${this.video.readyState} torch=${this.torchEnabled}`
      );
    }

    // Use whichever channel has a stronger, non-saturated signal.
    // With flash on finger: red penetrates tissue best and saturates less.
    // Green channel can saturate to 0 on some Android cameras when flash is on.
    // Pick the channel that's not at 0 and not at 255 (saturated).
    const primarySignal =
      greenAvg < 1 || greenAvg > 254
        ? redAvg
        : redAvg < 1 || redAvg > 254
          ? greenAvg
          : redAvg;
    this.processSignalSample(primarySignal, timestamp);

    this.frameCount++;
    this.adaptiveFilterFrameCount++;

    // Periodically update adaptive bandpass filter
    if (this.adaptiveFilterFrameCount >= this.ADAPTIVE_FILTER_INTERVAL) {
      this.updateAdaptiveFilter();
      this.adaptiveFilterFrameCount = 0;
    }

    // Periodically assess signal quality
    if (this.frameCount % this.QUALITY_CHECK_INTERVAL === 0 && this.rawBuffer.length >= 30) {
      this.updateSignalQuality();
    }

    // Autocorrelation fallback: every 5 seconds, if peak detection hasn't found
    // enough beats, use autocorrelation to estimate HR from the filtered signal.
    // This works even with very weak PPG signals where peaks are too small to detect.
    if (this.frameCount > 0 && this.frameCount % 150 === 0 && this.recentIBIsMs.length < 3) {
      this.estimateHRFromAutocorrelation();
    }

    this.scheduleNextFrame();
  }

  private updateSignalQuality(): void {
    if (this.rawBuffer.length < 2) return;

    const peaks = detectPeaks(this.rawBuffer, {
      minPeakDistance: this.MIN_PEAK_DISTANCE_SAMPLES,
      thresholdFactor: 0.3,
      adaptiveWindow: 30,
    });

    const quality = assessSignalQuality(this.rawBuffer, peaks);

    if (quality !== this.signalQuality) {
      this.signalQuality = quality;
      this.callbacks.onQualityChange?.(quality);
    }
  }

  public stop(): void {
    if (this.status === 'idle') return;

    // Cancel animation frame loop
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Disable torch before releasing camera
    void this.disableTorch();

    // Stop all media tracks (releases camera and torch)
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Clean up DOM elements
    if (this.video) {
      this.video.srcObject = null;
      // Remove from DOM (we appended it in start())
      if (this.video.parentNode) {
        this.video.parentNode.removeChild(this.video);
      }
      this.video = null;
    }
    this.canvas = null;
    this.ctx = null;

    // Reset processing state
    this.rawBuffer = [];
    this.normBuffer = [];
    this.lastRawValue = -1;
    this.lastPeakTimestamp = null;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.adaptiveFilterFrameCount = 0;
    this.recentIBIsMs = [];
    this.currentLowCut = DEFAULT_LOW_CUT_HZ;
    this.currentHighCut = DEFAULT_HIGH_CUT_HZ;
    this.signalQuality = 0;
    this.torchEnabled = false;
    this.bandpassFilter.reset();
    this.peakDetector.reset();

    this.setStatus('idle');
  }
}

export const ppgService = new PPGService();
