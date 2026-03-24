import {
  createBandpassFilter,
  StreamingPeakDetector,
  assessSignalQuality,
  detectPeaks,
  type IBISample,
} from '@breath-in-flow/shared';
import type { SOSFilter } from '@breath-in-flow/shared';

export type PPGStatus = 'idle' | 'initializing' | 'capturing' | 'error';

export interface PPGCallbacks {
  onIBI?: (sample: IBISample) => void;
  onRawSignal?: (value: number, timestamp: number) => void;
  onQualityChange?: (quality: number) => void;
  onError?: (error: Error) => void;
  onStatusChange?: (status: PPGStatus) => void;
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

  public async start(callbacks?: PPGCallbacks): Promise<void> {
    if (callbacks) {
      this.callbacks = callbacks;
    }

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

      this.stream = await mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 30 },
        },
      });
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

    // Create off-screen video element
    this.video = document.createElement('video');
    this.video.srcObject = this.stream;
    this.video.playsInline = true;
    this.video.muted = true;

    // Create off-screen canvas for frame processing
    this.canvas = document.createElement('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext('2d');

    // Try to enable torch (flashlight) for better PPG signal
    const tracks = this.stream.getVideoTracks();
    if (tracks.length > 0) {
      try {
        await tracks[0].applyConstraints({
          advanced: [{ torch: true } as MediaTrackConstraintSet],
        });
      } catch {
        // Torch not available — continue without it
        // Signal quality metric will reflect poor illumination
      }
    }

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

    await this.video.play();

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

    // Use green channel as primary PPG signal (strongest with flash/torch)
    // Red channel available for future cross-validation
    void redAvg; // retained for potential cross-validation use
    this.processSignalSample(greenAvg, timestamp);

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

    // Stop all media tracks (releases camera and torch)
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }

    // Clean up DOM elements
    if (this.video) {
      this.video.srcObject = null;
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
    this.bandpassFilter.reset();
    this.peakDetector.reset();

    this.setStatus('idle');
  }
}

export const ppgService = new PPGService();
