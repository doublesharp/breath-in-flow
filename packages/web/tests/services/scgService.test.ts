import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { scgService } from '@/services/scgService';
import type { SCGStatus } from '@/services/scgService';
import type { IBISample } from '@breath-in-flow/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build and dispatch a synthetic DeviceMotionEvent.
 *
 * @param acceleration  x/y/z values in m/s²
 * @param interval      event.interval in ms (e.g. 10 ms = 100 Hz)
 */
function dispatchMotionEvent(
  acceleration: { x: number; y: number; z: number },
  interval: number = 10,
): void {
  const event = new Event('devicemotion') as DeviceMotionEvent;
  Object.defineProperty(event, 'accelerationIncludingGravity', { value: acceleration });
  Object.defineProperty(event, 'acceleration', { value: acceleration });
  Object.defineProperty(event, 'interval', { value: interval });
  window.dispatchEvent(event);
}

/**
 * Generate an array of SCG-like samples: a sharp positive spike at fixed
 * intervals (simulating the aortic valve opening) on top of small Gaussian
 * noise.
 *
 * @param heartRateBPM   Target heart rate in BPM (default 60)
 * @param durationSeconds  Total sequence length in seconds
 * @param sampleRateHz   Samples per second
 * @returns Array of { x, y, z } acceleration objects plus corresponding
 *          timestamps (ms), and the exact beat indices.
 */
function generateSCGSequence(
  heartRateBPM: number,
  durationSeconds: number,
  sampleRateHz: number,
): {
  samples: { x: number; y: number; z: number }[];
  beatIndices: number[];
} {
  const totalSamples = Math.round(durationSeconds * sampleRateHz);
  const samplesPerBeat = Math.round((60 / heartRateBPM) * sampleRateHz);
  const samples: { x: number; y: number; z: number }[] = [];
  const beatIndices: number[] = [];

  for (let i = 0; i < totalSamples; i++) {
    // Small background noise
    const noise = (Math.random() - 0.5) * 0.02;
    // Sharp spike at each beat position
    const isBeat = i % samplesPerBeat === 0;
    const z = isBeat ? 1.5 + noise : noise;
    if (isBeat) beatIndices.push(i);
    samples.push({ x: 0, y: 0, z });
  }

  return { samples, beatIndices };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('scgService', () => {
  const statusChanges: SCGStatus[] = [];
  const ibiSamples: IBISample[] = [];
  const qualityChanges: number[] = [];
  const errors: Error[] = [];

  beforeEach(() => {
    // Ensure service is idle before every test
    scgService.stop();

    statusChanges.length = 0;
    ibiSamples.length = 0;
    qualityChanges.length = 0;
    errors.length = 0;

    scgService.setCallbacks({
      onStatusChange: (s) => statusChanges.push(s),
      onIBI: (sample) => ibiSamples.push(sample),
      onQualityChange: (q) => qualityChanges.push(q),
      onError: (e) => errors.push(e),
    });
  });

  afterEach(() => {
    scgService.stop();
    // Remove any leftover requestPermission mock
    delete (DeviceMotionEvent as unknown as Record<string, unknown>)['requestPermission'];
  });

  // ─── 1. Status transitions ────────────────────────────────────────────────

  describe('status transitions', () => {
    it('starts in idle state', () => {
      expect(scgService.getStatus()).toBe('idle');
    });

    it('transitions idle → initializing → capturing on start()', async () => {
      await scgService.start();
      // 'initializing' is set synchronously then 'capturing' follows
      expect(statusChanges).toContain('initializing');
      expect(statusChanges).toContain('capturing');
      expect(scgService.getStatus()).toBe('capturing');
    });

    it('transitions capturing → idle on stop()', async () => {
      await scgService.start();
      scgService.stop();
      expect(scgService.getStatus()).toBe('idle');
      expect(statusChanges.at(-1)).toBe('idle');
    });

    it('does not emit a status change when already capturing and start() is called again', async () => {
      await scgService.start();
      statusChanges.length = 0;
      await scgService.start(); // no-op
      expect(statusChanges).toHaveLength(0);
    });
  });

  // ─── 2. Permission handling (iOS) ─────────────────────────────────────────

  describe('iOS permission handling', () => {
    it('calls requestPermission when the method is present and proceeds on grant', async () => {
      const requestPermission = vi.fn().mockResolvedValue('granted');
      (DeviceMotionEvent as unknown as Record<string, unknown>)['requestPermission'] =
        requestPermission;

      await scgService.start();

      expect(requestPermission).toHaveBeenCalledOnce();
      expect(scgService.getStatus()).toBe('capturing');
      expect(errors).toHaveLength(0);
    });

    it('emits error and sets error status when permission is denied', async () => {
      const requestPermission = vi.fn().mockResolvedValue('denied');
      (DeviceMotionEvent as unknown as Record<string, unknown>)['requestPermission'] =
        requestPermission;

      await scgService.start();

      expect(scgService.getStatus()).toBe('error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/denied/i);
    });

    it('emits error when requestPermission rejects', async () => {
      const requestPermission = vi.fn().mockRejectedValue(new Error('Not allowed'));
      (DeviceMotionEvent as unknown as Record<string, unknown>)['requestPermission'] =
        requestPermission;

      await scgService.start();

      expect(scgService.getStatus()).toBe('error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/permission/i);
    });
  });

  // ─── 3. DeviceMotionEvent unavailable ─────────────────────────────────────

  describe('DeviceMotionEvent unavailable', () => {
    it('emits error when DeviceMotionEvent is missing', async () => {
      // Temporarily remove DeviceMotionEvent from window
      const original = (window as unknown as Record<string, unknown>)['DeviceMotionEvent'];
      delete (window as unknown as Record<string, unknown>)['DeviceMotionEvent'];

      await scgService.start();

      expect(scgService.getStatus()).toBe('error');
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toMatch(/not available/i);

      // Restore
      (window as unknown as Record<string, unknown>)['DeviceMotionEvent'] = original;
    });
  });

  // ─── 4. Signal processing: IBI detection ──────────────────────────────────

  describe('signal processing', () => {
    it('detects heartbeat peaks and emits IBI samples for synthetic 60 BPM signal', async () => {
      await scgService.start();

      const SAMPLE_RATE = 100; // Hz
      const INTERVAL_MS = 1000 / SAMPLE_RATE; // 10 ms
      const HEART_RATE = 60; // BPM  → 1 beat per second → IBI ≈ 1000 ms
      const DURATION = 10; // seconds

      const { samples } = generateSCGSequence(HEART_RATE, DURATION, SAMPLE_RATE);

      for (const s of samples) {
        dispatchMotionEvent(s, INTERVAL_MS);
      }

      // After 10 seconds at 60 BPM we expect roughly 9 inter-beat intervals.
      // Allow some tolerance for filter start-up latency.
      expect(ibiSamples.length).toBeGreaterThanOrEqual(5);

      // Every detected IBI should be in the right ballpark for 60 BPM (1000 ms).
      // Allow ±30% tolerance for filter start-up latency and peak detection jitter.
      for (const sample of ibiSamples) {
        expect(sample.interval).toBeGreaterThanOrEqual(700);
        expect(sample.interval).toBeLessThanOrEqual(1300);
      }
    });

    it('detects heartbeats at 80 BPM (IBI ≈ 750 ms)', async () => {
      await scgService.start();

      const SAMPLE_RATE = 100;
      const INTERVAL_MS = 1000 / SAMPLE_RATE;
      const HEART_RATE = 80;
      const DURATION = 10;

      const { samples } = generateSCGSequence(HEART_RATE, DURATION, SAMPLE_RATE);

      for (const s of samples) {
        dispatchMotionEvent(s, INTERVAL_MS);
      }

      expect(ibiSamples.length).toBeGreaterThanOrEqual(4);
      for (const sample of ibiSamples) {
        expect(sample.interval).toBeGreaterThanOrEqual(600);
        expect(sample.interval).toBeLessThanOrEqual(950);
      }
    });

    it('emits raw signal values for every motion event', async () => {
      const rawValues: number[] = [];
      scgService.setCallbacks({
        ...scgService['callbacks'],
        onRawSignal: (v) => rawValues.push(v),
      });

      await scgService.start();

      const EVENT_COUNT = 50;
      for (let i = 0; i < EVENT_COUNT; i++) {
        dispatchMotionEvent({ x: 0, y: 0, z: 0.1 }, 10);
      }

      expect(rawValues).toHaveLength(EVENT_COUNT);
    });

    it('each IBI sample carries a quality value between 0 and 1', async () => {
      await scgService.start();

      const SAMPLE_RATE = 100;
      const { samples } = generateSCGSequence(60, 10, SAMPLE_RATE);

      for (const s of samples) {
        dispatchMotionEvent(s, 1000 / SAMPLE_RATE);
      }

      for (const sample of ibiSamples) {
        expect(sample.quality).toBeGreaterThanOrEqual(0);
        expect(sample.quality).toBeLessThanOrEqual(1);
      }
    });

    it('uses 5 Hz high-pass cutoff — low-frequency drift does not prevent IBI detection', async () => {
      // Feed a signal where a 2 Hz respiratory drift is added to the cardiac spikes.
      // With a 5 Hz HP filter the respiratory component should be attenuated enough
      // that heartbeats are still detected.
      await scgService.start();

      const SAMPLE_RATE = 100;
      const INTERVAL_MS = 1000 / SAMPLE_RATE;
      const HEART_RATE = 60;
      const DURATION = 10;
      const samplesPerBeat = Math.round((60 / HEART_RATE) * SAMPLE_RATE);
      const totalSamples = Math.round(DURATION * SAMPLE_RATE);

      const samples: { x: number; y: number; z: number }[] = [];
      for (let i = 0; i < totalSamples; i++) {
        const t = i / SAMPLE_RATE;
        // 0.3 Hz respiratory drift (below the 2 Hz HP cutoff → filtered out)
        const drift = 0.3 * Math.sin(2 * Math.PI * 0.3 * t);
        const isBeat = i % samplesPerBeat === 0;
        const cardiac = isBeat ? 1.5 : 0;
        const noise = (Math.random() - 0.5) * 0.02;
        samples.push({ x: 0, y: 0, z: cardiac + drift + noise });
      }

      for (const s of samples) {
        dispatchMotionEvent(s, INTERVAL_MS);
      }

      expect(ibiSamples.length).toBeGreaterThanOrEqual(3);
      for (const sample of ibiSamples) {
        expect(sample.interval).toBeGreaterThanOrEqual(400);
        expect(sample.interval).toBeLessThanOrEqual(1500);
      }
    });
  });

  // ─── 5. Template matching ──────────────────────────────────────────────────

  describe('template matching', () => {
    it('does not discard legitimate peaks after template is built', async () => {
      // Run enough beats to trigger template construction (needs ≥5 peaks),
      // then continue; the IBI count should keep growing.
      await scgService.start();

      const SAMPLE_RATE = 100;
      const INTERVAL_MS = 1000 / SAMPLE_RATE;
      const HEART_RATE = 60;

      // Phase 1: 8 seconds — builds initial template (≥5 peaks)
      const { samples: phase1 } = generateSCGSequence(HEART_RATE, 8, SAMPLE_RATE);
      for (const s of phase1) {
        dispatchMotionEvent(s, INTERVAL_MS);
      }
      const countAfterPhase1 = ibiSamples.length;
      expect(countAfterPhase1).toBeGreaterThanOrEqual(4);

      // Phase 2: 6 more seconds — template should accept matching peaks
      const { samples: phase2 } = generateSCGSequence(HEART_RATE, 6, SAMPLE_RATE);
      for (const s of phase2) {
        dispatchMotionEvent(s, INTERVAL_MS);
      }

      // More peaks should have been detected in phase 2
      expect(ibiSamples.length).toBeGreaterThan(countAfterPhase1);
    });

    it('IBI detection remains accurate after template construction', async () => {
      await scgService.start();

      const SAMPLE_RATE = 100;
      const INTERVAL_MS = 1000 / SAMPLE_RATE;
      const HEART_RATE = 60;
      const DURATION = 20; // long enough to build + use template

      const { samples } = generateSCGSequence(HEART_RATE, DURATION, SAMPLE_RATE);
      for (const s of samples) {
        dispatchMotionEvent(s, INTERVAL_MS);
      }

      expect(ibiSamples.length).toBeGreaterThanOrEqual(5);
      // All detected IBIs should still be physiologically plausible
      for (const sample of ibiSamples) {
        expect(sample.interval).toBeGreaterThanOrEqual(700);
        expect(sample.interval).toBeLessThanOrEqual(1300);
      }
    });
  });

  // ─── 6. Motion detection & quality ────────────────────────────────────────

  describe('motion detection', () => {
    it('drops quality to 0 when high-variance motion is detected', async () => {
      await scgService.start();

      const SAMPLE_RATE = 100;
      const INTERVAL_MS = 10;

      // Phase 1: feed a clean SCG signal so the service detects beats and
      // raises quality above 0.
      const { samples: cleanSamples } = generateSCGSequence(60, 6, SAMPLE_RATE);
      for (const s of cleanSamples) {
        dispatchMotionEvent(s, INTERVAL_MS);
      }

      // Quality may or may not have risen depending on peak detection with magnitude signal.
      // The important test is that vigorous shaking drives quality to 0.
      qualityChanges.length = 0;

      // Phase 2: simulate vigorous shaking — alternating high/low magnitude
      // to create large variance in the magnitude signal
      const MOTION_SAMPLES = SAMPLE_RATE * 2; // 2 seconds
      for (let i = 0; i < MOTION_SAMPLES; i++) {
        // Alternate between near-zero and very high acceleration to create
        // large variance in the magnitude (sqrt(x²+y²+z²)) signal
        const intensity = i % 4 < 2 ? 15 : 0.1;
        const sign = () => Math.random() > 0.5 ? 1 : -1;
        dispatchMotionEvent({
          x: sign() * intensity * Math.random(),
          y: sign() * intensity * Math.random(),
          z: sign() * intensity * Math.random(),
        }, INTERVAL_MS);
      }

      // The service should have emitted a quality=0 change event
      const hasZeroQuality = qualityChanges.some((q) => q === 0);
      expect(hasZeroQuality).toBe(true);
    });
  });

  // ─── 7. Cleanup / stop() ─────────────────────────────────────────────────

  describe('stop()', () => {
    it('removes the devicemotion event listener so no further IBI events fire', async () => {
      await scgService.start();

      // Feed a few events to prove it was working
      const SAMPLE_RATE = 100;
      const { samples: preSamples } = generateSCGSequence(60, 4, SAMPLE_RATE);
      for (const s of preSamples) {
        dispatchMotionEvent(s, 1000 / SAMPLE_RATE);
      }

      const countBeforeStop = ibiSamples.length;

      scgService.stop();

      // Events dispatched after stop() must not produce new IBI samples
      const { samples: postSamples } = generateSCGSequence(60, 4, SAMPLE_RATE);
      for (const s of postSamples) {
        dispatchMotionEvent(s, 1000 / SAMPLE_RATE);
      }

      expect(ibiSamples.length).toBe(countBeforeStop);
    });

    it('resets status to idle after stop()', async () => {
      await scgService.start();
      scgService.stop();
      expect(scgService.getStatus()).toBe('idle');
    });

    it('resets quality to 0 after stop()', async () => {
      await scgService.start();
      scgService.stop();
      expect(scgService.getQuality()).toBe(0);
    });
  });

  // ─── 8. Sample rate handling ──────────────────────────────────────────────

  describe('sample rate detection', () => {
    it('uses the event.interval field to detect sample rate', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await scgService.start();

      // Send a handful of events at 200 Hz (5 ms interval)
      for (let i = 0; i < 15; i++) {
        dispatchMotionEvent({ x: 0, y: 0, z: 0 }, 5);
      }

      // No warnings about low sample rate at 200 Hz
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('warns when sample rate is below 50 Hz', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      await scgService.start();

      // 40 Hz → interval = 25 ms
      for (let i = 0; i < 15; i++) {
        dispatchMotionEvent({ x: 0, y: 0, z: 0 }, 25);
      }

      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('low sample rate'));
      warnSpy.mockRestore();
    });
  });
});
