import {
  createBandpassFilter,
  StreamingPeakDetector,
  assessSignalQuality,
  detectPeaks,
  type IBISample,
} from '@breath-in-flow/shared';
import type { SOSFilter } from '@breath-in-flow/shared';
import { Capacitor } from '@capacitor/core';
import { Torch } from '@capawesome/capacitor-torch';

export type PPGStatus = 'idle' | 'initializing' | 'capturing' | 'error';

export interface PPGCallbacks {
  onIBI?: (sample: IBISample) => void;
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

  // Frame throttling
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private torchEnabled: boolean = false;

  // Adaptive bandpass state
  private adaptiveFilterFrameCount: number = 0;
  private recentIBIsMs: number[] = []; // Recent IBI values for adaptive filter
  private currentLowCut: number = 0.5;
  private currentHighCut: number = 4.0;

  // Configuration
  private readonly SAMPLE_RATE = 30; // fps
  private readonly BUFFER_SIZE = 300; // 10 seconds at 30fps
  private readonly MIN_PEAK_DISTANCE_SAMPLES = 9; // 300ms at 30fps ≈ 200 BPM max
  private readonly FRAME_INTERVAL_MS = 1000 / 30; // ~33ms between frames
  private readonly QUALITY_CHECK_INTERVAL = 30; // frames between quality checks
  private readonly ADAPTIVE_FILTER_INTERVAL = 300; // frames between adaptive filter updates (~10s)

  constructor() {
    this.bandpassFilter = createBandpassFilter(0.5, 4.0, this.SAMPLE_RATE, 2);
    this.peakDetector = new StreamingPeakDetector({
      minPeakDistance: this.MIN_PEAK_DISTANCE_SAMPLES,
      thresholdFactor: 0.6,
      adaptiveWindow: 15,
      adaptiveRefractory: true,
      minProminence: 0.15,
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
          console.log('PPG: Torch enabled via native Capacitor plugin');
          return;
        }
      } catch (e) {
        console.warn('PPG: Native torch plugin failed:', e);
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
            console.log('PPG: Torch enabled via MediaStream constraint');
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
          console.log('PPG: Torch enabled via blind constraint attempt');
          return;
        } catch {
          // Truly not available
        }
      }
    }

    console.warn('PPG: Torch/flashlight not available on this device');
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

  public async start(callbacksOrOptions?: PPGCallbacks | PPGStartOptions): Promise<void> {
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
      return;
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
      return;
    }

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
    this.lastPeakTimestamp = null;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.adaptiveFilterFrameCount = 0;
    this.recentIBIsMs = [];
    this.currentLowCut = 0.5;
    this.currentHighCut = 4.0;
    this.bandpassFilter.reset();
    this.peakDetector.reset();

    // Start video playback — must happen before torch and canvas setup
    await this.video.play();
    console.log('PPG: Video playing, readyState:', this.video.readyState);

    // Wait for video to be ready with actual dimensions (timeout after 5s)
    await new Promise<void>((resolve) => {
      let attempts = 0;
      const checkReady = () => {
        attempts++;
        if (this.video && this.video.videoWidth > 0 && this.video.videoHeight > 0) {
          console.log(`PPG: Video ready — ${this.video.videoWidth}x${this.video.videoHeight}`);
          resolve();
        } else if (attempts > 150) {
          // Timeout after ~5 seconds, use defaults
          console.warn('PPG: Video dimension timeout, using defaults 320x240');
          resolve();
        } else {
          requestAnimationFrame(checkReady);
        }
      };
      checkReady();
    });

    // Create canvas matching actual video dimensions (not hardcoded)
    const vw = this.video.videoWidth || 320;
    const vh = this.video.videoHeight || 240;
    console.log(`PPG: Canvas size ${vw}x${vh}`);
    this.canvas = document.createElement('canvas');
    this.canvas.width = vw;
    this.canvas.height = vh;
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });

    // Enable torch/flashlight for PPG illumination (unless user disabled it)
    if (useTorch) {
      await this.enableTorch();
    } else {
      console.log('PPG: Torch disabled by user');
    }

    this.setStatus('capturing');
    this.scheduleNextFrame();
  }

  private scheduleNextFrame(): void {
    this.animFrameId = requestAnimationFrame((timestamp) => {
      this.captureFrame(timestamp);
    });
  }

  // Exposed for testing purposes
  public processSignalSample(value: number, timestamp: number): IBISample | null {
    // Pass through bandpass filter
    const filtered = this.bandpassFilter.filter(value);

    // Maintain rolling buffer
    this.rawBuffer.push(filtered);
    if (this.rawBuffer.length > this.BUFFER_SIZE) {
      this.rawBuffer.shift();
    }

    this.callbacks.onRawSignal?.(filtered, timestamp);

    // Feed to streaming peak detector
    const peak = this.peakDetector.addSample(filtered, timestamp);

    let ibiSample: IBISample | null = null;

    if (peak !== null) {
      const peakTimestamp = peak.timestamp ?? timestamp;

      if (this.lastPeakTimestamp !== null) {
        const interval = peakTimestamp - this.lastPeakTimestamp;

        // Only emit physiologically plausible intervals (300ms–2000ms = 30–200 BPM)
        if (interval >= 300 && interval <= 2000) {
          ibiSample = {
            timestamp: peakTimestamp,
            interval,
            quality: this.signalQuality,
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
   * Update the adaptive bandpass filter based on estimated heart rate.
   * Called every ADAPTIVE_FILTER_INTERVAL frames (~10 seconds at 30fps).
   *
   * Aboy++-inspired: narrows the passband around the actual heart rate
   * to reject more motion and ambient noise.
   */
  private updateAdaptiveFilter(): void {
    if (this.recentIBIsMs.length < 3) {
      // Not enough data — revert to defaults if we drifted
      if (this.currentLowCut !== 0.5 || this.currentHighCut !== 4.0) {
        this.currentLowCut = 0.5;
        this.currentHighCut = 4.0;
        this.bandpassFilter = createBandpassFilter(
          this.currentLowCut,
          this.currentHighCut,
          this.SAMPLE_RATE,
          2,
        );
      }
      return;
    }

    // Estimate HR from mean IBI
    const meanIBI =
      this.recentIBIsMs.reduce((sum, v) => sum + v, 0) / this.recentIBIsMs.length;
    const hrHz = 1000 / meanIBI; // convert ms to Hz

    // Adjust cutoffs: low = HR * 0.5, high = HR * 2.5, clamped to [0.5, 4.0]
    const newLowCut = Math.max(0.5, hrHz * 0.5);
    const newHighCut = Math.min(4.0, hrHz * 2.5);

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
        2,
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
      console.log(`PPG frame ${this.frameCount}: R=${redAvg.toFixed(1)} G=${greenAvg.toFixed(1)} readyState=${this.video.readyState} torch=${this.torchEnabled}`);
    }

    // Use whichever channel has a stronger, non-saturated signal.
    // With flash on finger: red penetrates tissue best and saturates less.
    // Green channel can saturate to 0 on some Android cameras when flash is on.
    // Pick the channel that's not at 0 and not at 255 (saturated).
    let primarySignal = greenAvg;
    if (greenAvg < 1 || greenAvg > 254) {
      primarySignal = redAvg; // green saturated, use red
    } else if (redAvg < 1 || redAvg > 254) {
      primarySignal = greenAvg; // red saturated, use green
    } else {
      // Neither saturated — use red (better tissue penetration with flash)
      primarySignal = redAvg;
    }
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

    this.scheduleNextFrame();
  }

  private updateSignalQuality(): void {
    if (this.rawBuffer.length < 2) return;

    const peaks = detectPeaks(this.rawBuffer, {
      minPeakDistance: this.MIN_PEAK_DISTANCE_SAMPLES,
      thresholdFactor: 0.6,
      adaptiveWindow: 15,
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
    this.lastPeakTimestamp = null;
    this.frameCount = 0;
    this.lastFrameTime = 0;
    this.adaptiveFilterFrameCount = 0;
    this.recentIBIsMs = [];
    this.currentLowCut = 0.5;
    this.currentHighCut = 4.0;
    this.signalQuality = 0;
    this.torchEnabled = false;
    this.bandpassFilter.reset();
    this.peakDetector.reset();

    this.setStatus('idle');
  }
}

export const ppgService = new PPGService();
