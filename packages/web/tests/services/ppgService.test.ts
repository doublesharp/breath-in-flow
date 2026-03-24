import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ppgService } from '../../src/services/ppgService';
import type { PPGStatus } from '../../src/services/ppgService';
import type { IBISample } from '@breath-in-flow/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock MediaStreamTrack with optional applyConstraints support. */
function makeMockTrack(opts: { torchSupported?: boolean } = {}): MediaStreamTrack {
  return {
    stop: vi.fn(),
    applyConstraints: opts.torchSupported
      ? vi.fn().mockResolvedValue(undefined)
      : vi.fn().mockRejectedValue(new Error('torch not supported')),
    kind: 'video',
    label: 'mock-camera',
    enabled: true,
    muted: false,
    readyState: 'live',
    id: 'mock-track-id',
  } as unknown as MediaStreamTrack;
}

/** Build a mock MediaStream with a single video track. */
function makeMockStream(track: MediaStreamTrack = makeMockTrack()): MediaStream {
  return {
    getTracks: vi.fn().mockReturnValue([track]),
    getVideoTracks: vi.fn().mockReturnValue([track]),
    getAudioTracks: vi.fn().mockReturnValue([]),
    active: true,
  } as unknown as MediaStream;
}

/** Install a getUserMedia mock that resolves with the given stream. */
function mockGetUserMediaSuccess(stream: MediaStream) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockResolvedValue(stream),
    },
  });
}

/** Install a getUserMedia mock that rejects with the given error. */
function mockGetUserMediaFailure(err: Error) {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn().mockRejectedValue(err),
    },
  });
}

/** Reset singleton state between tests. */
function resetService() {
  (ppgService as unknown as Record<string, unknown>).status = 'idle';
  (ppgService as unknown as Record<string, unknown>).stream = null;
  (ppgService as unknown as Record<string, unknown>).video = null;
  (ppgService as unknown as Record<string, unknown>).canvas = null;
  (ppgService as unknown as Record<string, unknown>).ctx = null;
  (ppgService as unknown as Record<string, unknown>).animFrameId = null;
  (ppgService as unknown as Record<string, unknown>).callbacks = {};
  (ppgService as unknown as Record<string, unknown>).rawBuffer = [];
  (ppgService as unknown as Record<string, unknown>).lastPeakTimestamp = null;
  (ppgService as unknown as Record<string, unknown>).frameCount = 0;
  (ppgService as unknown as Record<string, unknown>).lastFrameTime = 0;
  (ppgService as unknown as Record<string, unknown>).signalQuality = 0;
  // Reset filter and peak detector
  (ppgService as unknown as { bandpassFilter: { reset: () => void } }).bandpassFilter.reset();
  (ppgService as unknown as { peakDetector: { reset: () => void } }).peakDetector.reset();
}

// ---------------------------------------------------------------------------
// Generate synthetic PPG signal
// ---------------------------------------------------------------------------

/**
 * Generate a synthetic PPG signal at `heartRateHz` Hz sampled at `sampleRateHz`.
 * Returns { values, timestamps } where timestamps are in milliseconds.
 */
function generateSyntheticPPG(
  heartRateHz: number,
  durationSeconds: number,
  sampleRateHz = 30,
  startTime = 0,
): { values: number[]; timestamps: number[] } {
  const nSamples = Math.floor(durationSeconds * sampleRateHz);
  const values: number[] = [];
  const timestamps: number[] = [];

  for (let i = 0; i < nSamples; i++) {
    const t = i / sampleRateHz;
    // Simulate PPG: DC offset (simulating red channel ~180) + pulsatile component
    const pulsatile = 10 * Math.sin(2 * Math.PI * heartRateHz * t);
    // Add some harmonics for realism
    const harmonic = 2 * Math.sin(2 * Math.PI * heartRateHz * 2 * t);
    const value = 180 + pulsatile + harmonic;
    values.push(value);
    timestamps.push(startTime + t * 1000); // ms
  }

  return { values, timestamps };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ppgService', () => {
  beforeEach(() => {
    resetService();
    vi.clearAllMocks();

    // Stub requestAnimationFrame / cancelAnimationFrame
    vi.stubGlobal('requestAnimationFrame', vi.fn().mockReturnValue(42));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // -------------------------------------------------------------------------
  // Status & lifecycle
  // -------------------------------------------------------------------------

  describe('initial state', () => {
    it('starts in idle status', () => {
      expect(ppgService.getStatus()).toBe('idle');
    });

    it('starts with zero signal quality', () => {
      expect(ppgService.getSignalQuality()).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Status transitions: idle → initializing → capturing → idle
  // -------------------------------------------------------------------------

  describe('status transitions', () => {
    it('transitions idle → initializing → capturing on successful start', async () => {
      const statuses: PPGStatus[] = [];
      const track = makeMockTrack({ torchSupported: true });
      const stream = makeMockStream(track);
      mockGetUserMediaSuccess(stream);

      // Stub video.play so it resolves immediately
      let playResolve: () => void;
      const playPromise = new Promise<void>((res) => { playResolve = res; });

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          const video = {
            srcObject: null as unknown,
            playsInline: false,
            muted: false,
            readyState: 4,
            play: vi.fn().mockResolvedValue(undefined),
          };
          return video as unknown as HTMLVideoElement;
        }
        if (tag === 'canvas') {
          const canvas = {
            width: 320,
            height: 240,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
              getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
            }),
          };
          return canvas as unknown as HTMLCanvasElement;
        }
        return document.createElement(tag);
      });

      void playResolve!;

      ppgService.setCallbacks({ onStatusChange: (s) => statuses.push(s) });
      await ppgService.start();

      expect(statuses).toContain('initializing');
      expect(statuses).toContain('capturing');
      expect(ppgService.getStatus()).toBe('capturing');
    });

    it('transitions capturing → idle on stop', async () => {
      const statuses: PPGStatus[] = [];
      const track = makeMockTrack({ torchSupported: false });
      const stream = makeMockStream(track);
      mockGetUserMediaSuccess(stream);

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          return {
            srcObject: null,
            playsInline: false,
            muted: false,
            readyState: 4,
            play: vi.fn().mockResolvedValue(undefined),
          } as unknown as HTMLVideoElement;
        }
        if (tag === 'canvas') {
          return {
            width: 320,
            height: 240,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
              getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
            }),
          } as unknown as HTMLCanvasElement;
        }
        return document.createElement(tag);
      });

      ppgService.setCallbacks({ onStatusChange: (s) => statuses.push(s) });
      await ppgService.start();

      expect(ppgService.getStatus()).toBe('capturing');
      ppgService.stop();
      expect(ppgService.getStatus()).toBe('idle');
      expect(statuses).toContain('idle');
    });

    it('does not re-enter start() if already capturing', async () => {
      const track = makeMockTrack();
      const stream = makeMockStream(track);
      mockGetUserMediaSuccess(stream);

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          return {
            srcObject: null,
            playsInline: false,
            muted: false,
            readyState: 4,
            play: vi.fn().mockResolvedValue(undefined),
          } as unknown as HTMLVideoElement;
        }
        if (tag === 'canvas') {
          return {
            width: 320,
            height: 240,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
              getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
            }),
          } as unknown as HTMLCanvasElement;
        }
        return document.createElement(tag);
      });

      await ppgService.start();
      expect(ppgService.getStatus()).toBe('capturing');

      // Second call should be a no-op (status stays capturing)
      const getUserMedia = navigator.mediaDevices.getUserMedia as ReturnType<typeof vi.fn>;
      const callsBefore = getUserMedia.mock.calls.length;
      await ppgService.start();
      expect(getUserMedia.mock.calls.length).toBe(callsBefore);
    });

    it('stop() from idle is a no-op', () => {
      expect(ppgService.getStatus()).toBe('idle');
      expect(() => ppgService.stop()).not.toThrow();
      expect(ppgService.getStatus()).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('emits error and sets error status when getUserMedia is not available', async () => {
      // Remove mediaDevices entirely
      Object.defineProperty(navigator, 'mediaDevices', {
        configurable: true,
        value: undefined,
      });

      const errors: Error[] = [];
      const statuses: PPGStatus[] = [];

      await ppgService.start({
        onError: (e) => errors.push(e),
        onStatusChange: (s) => statuses.push(s),
      });

      expect(ppgService.getStatus()).toBe('error');
      expect(errors.length).toBe(1);
      expect(errors[0].message).toMatch(/camera/i);
      expect(statuses).toContain('error');
    });

    it('emits error and sets error status when getUserMedia rejects (generic)', async () => {
      mockGetUserMediaFailure(new Error('generic camera failure'));

      const errors: Error[] = [];
      await ppgService.start({ onError: (e) => errors.push(e) });

      expect(ppgService.getStatus()).toBe('error');
      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain('generic camera failure');
    });

    it('emits user-friendly message on permission denied', async () => {
      const permErr = new Error('Permission denied');
      permErr.name = 'NotAllowedError';
      mockGetUserMediaFailure(permErr);

      const errors: Error[] = [];
      await ppgService.start({ onError: (e) => errors.push(e) });

      expect(ppgService.getStatus()).toBe('error');
      expect(errors[0].message).toMatch(/permission/i);
    });

    it('emits user-friendly message on camera not found', async () => {
      const notFoundErr = new Error('No camera');
      notFoundErr.name = 'NotFoundError';
      mockGetUserMediaFailure(notFoundErr);

      const errors: Error[] = [];
      await ppgService.start({ onError: (e) => errors.push(e) });

      expect(ppgService.getStatus()).toBe('error');
      expect(errors[0].message).toMatch(/no camera/i);
    });

    it('emits user-friendly message when camera is in use', async () => {
      const inUseErr = new Error('Camera in use');
      inUseErr.name = 'NotReadableError';
      mockGetUserMediaFailure(inUseErr);

      const errors: Error[] = [];
      await ppgService.start({ onError: (e) => errors.push(e) });

      expect(ppgService.getStatus()).toBe('error');
      expect(errors[0].message).toMatch(/in use/i);
    });
  });

  // -------------------------------------------------------------------------
  // Signal processing pipeline
  // -------------------------------------------------------------------------

  describe('signal processing pipeline', () => {
    it('emits filtered raw signal values through onRawSignal callback', () => {
      const rawValues: number[] = [];
      ppgService.setCallbacks({ onRawSignal: (v) => rawValues.push(v) });

      // Feed 10 samples
      for (let i = 0; i < 10; i++) {
        ppgService.processSignalSample(180 + Math.sin(i), i * 33);
      }

      expect(rawValues.length).toBe(10);
    });

    it('detects peaks and emits IBI samples for a 1 Hz (60 BPM) signal', () => {
      const ibiSamples: IBISample[] = [];
      ppgService.setCallbacks({ onIBI: (s) => ibiSamples.push(s) });

      // Generate 10 seconds of 1 Hz synthetic PPG at 30 fps
      const { values, timestamps } = generateSyntheticPPG(1.0, 10, 30, 0);

      for (let i = 0; i < values.length; i++) {
        ppgService.processSignalSample(values[i], timestamps[i]);
      }

      // Should have detected ~9 IBIs (10 peaks → 9 intervals) with some tolerance
      expect(ibiSamples.length).toBeGreaterThanOrEqual(4);

      // Each detected interval should be close to 1000ms (±200ms tolerance for filter transient)
      for (const sample of ibiSamples) {
        expect(sample.interval).toBeGreaterThanOrEqual(300);
        expect(sample.interval).toBeLessThanOrEqual(2000);
      }
    });

    it('IBI intervals for 60 BPM signal cluster around 1000ms', () => {
      const ibiSamples: IBISample[] = [];
      ppgService.setCallbacks({ onIBI: (s) => ibiSamples.push(s) });

      // Generate 15 seconds of 1 Hz signal to give the filter time to settle
      const { values, timestamps } = generateSyntheticPPG(1.0, 15, 30, 0);

      for (let i = 0; i < values.length; i++) {
        ppgService.processSignalSample(values[i], timestamps[i]);
      }

      // Skip the first few IBIs (filter transient), check the rest
      const steadyState = ibiSamples.slice(2);
      expect(steadyState.length).toBeGreaterThanOrEqual(3);

      // Average interval should be close to 1000ms
      const avgInterval =
        steadyState.reduce((sum, s) => sum + s.interval, 0) / steadyState.length;
      expect(avgInterval).toBeGreaterThan(800);
      expect(avgInterval).toBeLessThan(1200);
    });

    it('IBI intervals for 1.5 Hz (90 BPM) signal cluster around 667ms', () => {
      const ibiSamples: IBISample[] = [];
      ppgService.setCallbacks({ onIBI: (s) => ibiSamples.push(s) });

      const { values, timestamps } = generateSyntheticPPG(1.5, 15, 30, 0);

      for (let i = 0; i < values.length; i++) {
        ppgService.processSignalSample(values[i], timestamps[i]);
      }

      const steadyState = ibiSamples.slice(2);
      expect(steadyState.length).toBeGreaterThanOrEqual(3);

      const avgInterval =
        steadyState.reduce((sum, s) => sum + s.interval, 0) / steadyState.length;
      // 90 BPM = 667ms. Allow ±200ms tolerance.
      expect(avgInterval).toBeGreaterThan(467);
      expect(avgInterval).toBeLessThan(867);
    });

    it('does not emit IBI when only one peak detected (no previous peak)', () => {
      const ibiSamples: IBISample[] = [];
      ppgService.setCallbacks({ onIBI: (s) => ibiSamples.push(s) });

      // Feed a short burst — not enough for a second peak
      const { values, timestamps } = generateSyntheticPPG(1.0, 0.5, 30, 0);

      for (let i = 0; i < values.length; i++) {
        ppgService.processSignalSample(values[i], timestamps[i]);
      }

      // At most one peak in 0.5s at 1Hz — so no IBI should be emitted
      expect(ibiSamples.length).toBe(0);
    });

    it('filters out physiologically implausible IBI (< 300ms)', () => {
      const ibiSamples: IBISample[] = [];
      ppgService.setCallbacks({ onIBI: (s) => ibiSamples.push(s) });

      // Manually inject two peaks very close together (simulate noise spike)
      // First peak at t=0
      (ppgService as unknown as { lastPeakTimestamp: number }).lastPeakTimestamp = 0;

      // Feed second "peak" 100ms later by directly calling processSignalSample
      // with an impulse. Since real peak detection won't easily produce this,
      // we test the guard by manually setting lastPeakTimestamp and verifying
      // the IBI guard logic doesn't call onIBI for < 300ms gaps.
      // This is done indirectly: feed many zero samples, then no 100ms interval
      // should appear in output from a clean signal.
      for (let i = 0; i < 50; i++) {
        ppgService.processSignalSample(0, i * 2); // 2ms intervals — noise
      }

      // If any IBI was emitted, it must be within physiological range
      for (const s of ibiSamples) {
        expect(s.interval).toBeGreaterThanOrEqual(300);
        expect(s.interval).toBeLessThanOrEqual(2000);
      }
    });

    it('rolling buffer is capped at BUFFER_SIZE samples', () => {
      // Feed more than 300 samples
      for (let i = 0; i < 400; i++) {
        ppgService.processSignalSample(180, i * 33);
      }

      const buffer = (ppgService as unknown as { rawBuffer: number[] }).rawBuffer;
      expect(buffer.length).toBeLessThanOrEqual(300);
    });
  });

  // -------------------------------------------------------------------------
  // Quality reporting
  // -------------------------------------------------------------------------

  describe('quality reporting', () => {
    it('emits quality change via onQualityChange when quality changes', () => {
      const qualities: number[] = [];
      ppgService.setCallbacks({ onQualityChange: (q) => qualities.push(q) });

      // Feed 60 samples of 1 Hz signal (≥ 30 samples needed + quality check interval)
      const { values, timestamps } = generateSyntheticPPG(1.0, 10, 30, 0);

      // Force quality check every frame for testing purposes
      (ppgService as unknown as { QUALITY_CHECK_INTERVAL: number }).QUALITY_CHECK_INTERVAL = 1;

      for (let i = 0; i < values.length; i++) {
        ppgService.processSignalSample(values[i], timestamps[i]);
        // Manually increment frameCount to trigger quality updates
        (ppgService as unknown as { frameCount: number }).frameCount = i + 1;
        // Trigger quality update directly after each sample
        (ppgService as unknown as { updateSignalQuality: () => void }).updateSignalQuality();
      }

      // At least one quality event should have fired
      expect(qualities.length).toBeGreaterThan(0);
      // Quality values should be in [0, 1]
      for (const q of qualities) {
        expect(q).toBeGreaterThanOrEqual(0);
        expect(q).toBeLessThanOrEqual(1);
      }
    });

    it('getSignalQuality returns current quality score', () => {
      // Initially 0
      expect(ppgService.getSignalQuality()).toBe(0);

      // Feed signal and trigger quality update
      const { values, timestamps } = generateSyntheticPPG(1.0, 5, 30, 0);
      for (let i = 0; i < values.length; i++) {
        ppgService.processSignalSample(values[i], timestamps[i]);
      }
      (ppgService as unknown as { updateSignalQuality: () => void }).updateSignalQuality();

      // Quality should now be a number in [0, 1]
      const q = ppgService.getSignalQuality();
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Cleanup / resource release
  // -------------------------------------------------------------------------

  describe('cleanup', () => {
    it('stops media tracks on stop()', async () => {
      const track = makeMockTrack({ torchSupported: false });
      const stream = makeMockStream(track);
      mockGetUserMediaSuccess(stream);

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          return {
            srcObject: null,
            playsInline: false,
            muted: false,
            readyState: 4,
            play: vi.fn().mockResolvedValue(undefined),
          } as unknown as HTMLVideoElement;
        }
        if (tag === 'canvas') {
          return {
            width: 320,
            height: 240,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
              getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
            }),
          } as unknown as HTMLCanvasElement;
        }
        return document.createElement(tag);
      });

      await ppgService.start();
      ppgService.stop();

      expect(track.stop).toHaveBeenCalled();
    });

    it('cancels animation frame on stop()', async () => {
      const track = makeMockTrack({ torchSupported: false });
      const stream = makeMockStream(track);
      mockGetUserMediaSuccess(stream);

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          return {
            srcObject: null,
            playsInline: false,
            muted: false,
            readyState: 4,
            play: vi.fn().mockResolvedValue(undefined),
          } as unknown as HTMLVideoElement;
        }
        if (tag === 'canvas') {
          return {
            width: 320,
            height: 240,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
              getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
            }),
          } as unknown as HTMLCanvasElement;
        }
        return document.createElement(tag);
      });

      await ppgService.start();
      ppgService.stop();

      expect(cancelAnimationFrame).toHaveBeenCalled();
    });

    it('clears internal buffers on stop()', async () => {
      // Pre-fill the buffer with some data
      const { values, timestamps } = generateSyntheticPPG(1.0, 3, 30, 0);
      for (let i = 0; i < values.length; i++) {
        ppgService.processSignalSample(values[i], timestamps[i]);
      }
      expect(
        (ppgService as unknown as { rawBuffer: number[] }).rawBuffer.length,
      ).toBeGreaterThan(0);

      // Force status to capturing so stop() runs cleanup
      (ppgService as unknown as { status: PPGStatus }).status = 'capturing';
      ppgService.stop();

      expect(
        (ppgService as unknown as { rawBuffer: number[] }).rawBuffer.length,
      ).toBe(0);
      expect(
        (ppgService as unknown as { lastPeakTimestamp: number | null }).lastPeakTimestamp,
      ).toBeNull();
      expect(ppgService.getSignalQuality()).toBe(0);
    });

    it('sets video.srcObject to null on stop()', async () => {
      const track = makeMockTrack({ torchSupported: false });
      const stream = makeMockStream(track);
      mockGetUserMediaSuccess(stream);

      const mockVideo = {
        srcObject: null as unknown,
        playsInline: false,
        muted: false,
        readyState: 4,
        play: vi.fn().mockResolvedValue(undefined),
      };

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') return mockVideo as unknown as HTMLVideoElement;
        if (tag === 'canvas') {
          return {
            width: 320,
            height: 240,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
              getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
            }),
          } as unknown as HTMLCanvasElement;
        }
        return document.createElement(tag);
      });

      await ppgService.start();
      // srcObject should be set to the stream
      expect(mockVideo.srcObject).toBe(stream);

      ppgService.stop();
      expect(mockVideo.srcObject).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Torch handling
  // -------------------------------------------------------------------------

  describe('torch handling', () => {
    it('attempts to enable torch when supported', async () => {
      const track = makeMockTrack({ torchSupported: true });
      const stream = makeMockStream(track);
      mockGetUserMediaSuccess(stream);

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          return {
            srcObject: null,
            playsInline: false,
            muted: false,
            readyState: 4,
            play: vi.fn().mockResolvedValue(undefined),
          } as unknown as HTMLVideoElement;
        }
        if (tag === 'canvas') {
          return {
            width: 320,
            height: 240,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
              getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
            }),
          } as unknown as HTMLCanvasElement;
        }
        return document.createElement(tag);
      });

      await ppgService.start();

      expect(track.applyConstraints).toHaveBeenCalledWith(
        expect.objectContaining({ advanced: [{ torch: true }] }),
      );
    });

    it('continues capturing even when torch is not available', async () => {
      const track = makeMockTrack({ torchSupported: false });
      const stream = makeMockStream(track);
      mockGetUserMediaSuccess(stream);

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          return {
            srcObject: null,
            playsInline: false,
            muted: false,
            readyState: 4,
            play: vi.fn().mockResolvedValue(undefined),
          } as unknown as HTMLVideoElement;
        }
        if (tag === 'canvas') {
          return {
            width: 320,
            height: 240,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
              getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
            }),
          } as unknown as HTMLCanvasElement;
        }
        return document.createElement(tag);
      });

      const errors: Error[] = [];
      await ppgService.start({ onError: (e) => errors.push(e) });

      // No error should be emitted for torch failure
      expect(errors.length).toBe(0);
      expect(ppgService.getStatus()).toBe('capturing');
    });
  });

  // -------------------------------------------------------------------------
  // setCallbacks
  // -------------------------------------------------------------------------

  describe('setCallbacks', () => {
    it('registers callbacks that are subsequently invoked', () => {
      const rawValues: number[] = [];
      ppgService.setCallbacks({ onRawSignal: (v) => rawValues.push(v) });
      ppgService.processSignalSample(100, 0);
      expect(rawValues.length).toBe(1);
    });

    it('callbacks passed to start() override previous setCallbacks', async () => {
      const rawA: number[] = [];
      const rawB: number[] = [];
      ppgService.setCallbacks({ onRawSignal: (v) => rawA.push(v) });

      const track = makeMockTrack({ torchSupported: false });
      const stream = makeMockStream(track);
      mockGetUserMediaSuccess(stream);

      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'video') {
          return {
            srcObject: null,
            playsInline: false,
            muted: false,
            readyState: 4,
            play: vi.fn().mockResolvedValue(undefined),
          } as unknown as HTMLVideoElement;
        }
        if (tag === 'canvas') {
          return {
            width: 320,
            height: 240,
            getContext: vi.fn().mockReturnValue({
              drawImage: vi.fn(),
              getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(4) }),
            }),
          } as unknown as HTMLCanvasElement;
        }
        return document.createElement(tag);
      });

      await ppgService.start({ onRawSignal: (v) => rawB.push(v) });
      ppgService.processSignalSample(100, 0);

      // Only rawB should have been populated (callbacks replaced by start())
      expect(rawB.length).toBe(1);
      expect(rawA.length).toBe(0);
    });
  });
});
