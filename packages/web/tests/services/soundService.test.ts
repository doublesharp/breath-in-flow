import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { soundService } from '../../src/services/soundService';

class FakeOscillator {
  public frequency = { setValueAtTime: vi.fn() };
  public type: string = 'sine';
  public connects: unknown[] = [];
  public started = false;
  public stopped = false;
  constructor(public ctx: FakeAudioContext) {}
  connect(node: unknown) { this.connects.push(node); }
  start(t?: number) { this.started = true; this.ctx._started.push(this); }
  stop(t?: number) { this.stopped = true; this.ctx._stopped.push(this); }
}

class FakeGain {
  public gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  public connects: unknown[] = [];
  constructor(public ctx: FakeAudioContext) {}
  connect(node: unknown) { this.connects.push(node); }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  public currentTime = 100;
  public state: 'running' | 'suspended' = 'running';
  public destination = {};
  public _oscillators: FakeOscillator[] = [];
  public _gains: FakeGain[] = [];
  public _started: FakeOscillator[] = [];
  public _stopped: FakeOscillator[] = [];
  public resumed = false;

  constructor() {
    FakeAudioContext.instances.push(this);
  }

  createOscillator() {
    const o = new FakeOscillator(this);
    this._oscillators.push(o);
    return o as unknown as OscillatorNode;
  }

  createGain() {
    const g = new FakeGain(this);
    this._gains.push(g);
    return g as unknown as GainNode;
  }

  resume() { this.resumed = true; this.state = 'running'; return Promise.resolve(); }
}

describe('soundService', () => {
  beforeEach(() => {
    // Reset global AudioContext to our fake
    (globalThis as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
    // Clear instances
    FakeAudioContext.instances = [];
    // Reset singleton internal state
    (soundService as unknown as { audioContext: null }).audioContext = null;
    soundService.setEnabled(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing when disabled', async () => {
    soundService.setEnabled(false);
    soundService.playClick();
    soundService.playPhaseChange();

    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('creates nodes and starts/stops oscillators for click when enabled', async () => {
    soundService.setEnabled(true);

    soundService.playClick();

    // One context should be created
    expect(FakeAudioContext.instances.length).toBeGreaterThanOrEqual(1);
    const ctx = FakeAudioContext.instances[0];

    // Two oscillators created
    expect(ctx._oscillators.length).toBe(2);

    // Both oscillators should have been started and stopped
    expect(ctx._started.length).toBe(2);
    expect(ctx._stopped.length).toBe(2);

    // Gain envelope methods should have been called
    expect(ctx._gains.length).toBeGreaterThanOrEqual(1);
    const g = ctx._gains[0];
    expect(g.gain.setValueAtTime).toHaveBeenCalled();
    expect(g.gain.linearRampToValueAtTime).toHaveBeenCalled();
    expect(g.gain.exponentialRampToValueAtTime).toHaveBeenCalled();
  });

  it('creates additive oscillators for phase change when enabled', async () => {
    soundService.setEnabled(true);

    soundService.playPhaseChange();

    expect(FakeAudioContext.instances.length).toBeGreaterThanOrEqual(1);
    const ctx = FakeAudioContext.instances[0];

    // For phase change we expect multiple oscillators (freqs array length)
    expect(ctx._oscillators.length).toBeGreaterThanOrEqual(3);
    expect(ctx._gains.length).toBeGreaterThanOrEqual(3);

    // Ensure the gain envelopes for the harmonics were scheduled (at least one harmonic should have
    // scheduled envelope calls in this environment).
    const anySet = ctx._gains.some(g => (g.gain.setValueAtTime as unknown as { mock: { calls: unknown[] } }).mock?.calls.length > 0);
    expect(anySet).toBe(true);
  });

  describe('SoundService Branches - Context & Audio Control', () => {
    it('resumes audio context when enabled if it was suspended', async () => {
      // Mock AudioContext
      const resumeMock = vi.fn().mockResolvedValue(undefined);
      const mockContext = {
        state: 'suspended',
        resume: resumeMock,
        close: vi.fn(),
        createGain: () => ({ connect: vi.fn(), gain: { value: 0, linearRampToValueAtTime: vi.fn() } }),
        createOscillator: () => ({ connect: vi.fn(), start: vi.fn(), stop: vi.fn(), frequency: { value: 0, exponentialRampToValueAtTime: vi.fn() } }),
        currentTime: 0,
      };
      
      // Inject mock context
      (soundService as unknown as { audioContext: unknown }).audioContext = mockContext;
      
      soundService.setEnabled(true);
      
      expect(resumeMock).toHaveBeenCalled();
    });

    it('does not play sound if disabled', () => {
      soundService.setEnabled(false);
      // playClick and playPhaseChange should return early without doing anything
      // We verify they don't throw and the service is disabled
      expect(() => soundService.playClick()).not.toThrow();
      expect(() => soundService.playPhaseChange()).not.toThrow();
      
      // Verify enabled flag is off
      soundService.setEnabled(true);
      soundService.setEnabled(false);
      // After disabling again, methods should still not throw
      expect(() => soundService.playClick()).not.toThrow();
    });

    it('does not play sound if audio context is missing', () => {
      soundService.setEnabled(true);
      (soundService as unknown as { audioContext: null }).audioContext = null;
      
      // Methods should handle null audioContext gracefully
      expect(() => soundService.playClick()).not.toThrow();
      expect(() => soundService.playPhaseChange()).not.toThrow();
    });
  });

  describe('SoundService Extra - Advanced Scenarios', () => {
    const originalAudioContext = (global as unknown as { AudioContext: unknown }).AudioContext;

    afterEach(() => {
      (global as unknown as { AudioContext: unknown }).AudioContext = originalAudioContext;
    });

    it('setEnabled resumes suspended AudioContext', () => {
      const resume = vi.fn(() => { (fakeCtx as unknown as { state: string }).state = 'running'; });
      const fakeCtx: unknown = {
        state: 'suspended',
        resume,
      };

      const FakeAudioContext = vi.fn(() => fakeCtx);
      (global as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
      // Ensure window.AudioContext is also set in the test DOM
      const globalWindow = (global as unknown as Record<string, unknown>).window || {};
      (globalWindow as Record<string, unknown>).AudioContext = FakeAudioContext;
      (global as unknown as Record<string, unknown>).window = globalWindow;

      // Ensure soundService will create a fresh AudioContext instance
      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
      expect(resume).toHaveBeenCalled();
    });

    it('playClick does nothing when disabled in complex scenario', () => {
      const fakeCtx = { state: 'running' };
      const FakeAudioContext = vi.fn(() => fakeCtx);
      (global as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
      const globalWindow = (global as unknown as Record<string, unknown>).window || {};
      (globalWindow as Record<string, unknown>).AudioContext = FakeAudioContext;
      (global as unknown as Record<string, unknown>).window = globalWindow;

      // Ensure disabled
      soundService.setEnabled(false);

      // Should not throw or attempt to access context
      expect(() => soundService.playClick()).not.toThrow();
    });

    it('playPhaseChange runs with a working AudioContext', () => {
      const start = vi.fn();
      const stop = vi.fn();
      const setValueAtTime = vi.fn();
      const linearRampToValueAtTime = vi.fn();
      const exponentialRampToValueAtTime = vi.fn();

      const fakeOsc = () => ({ start, stop, connect: vi.fn(), frequency: { setValueAtTime }, type: '' });
      const fakeGain = () => ({ connect: vi.fn(), gain: { setValueAtTime, linearRampToValueAtTime, exponentialRampToValueAtTime } });

      const fakeCtx: unknown = {
        state: 'running',
        currentTime: 0,
        createOscillator: fakeOsc,
        createGain: fakeGain,
        destination: {},
      };

      const FakeAudioContext = vi.fn(() => fakeCtx);
      (global as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;

      // Ensure soundService will create a fresh AudioContext instance
      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
      expect(() => soundService.playPhaseChange()).not.toThrow();
    });

    it('playClick resumes suspended context before playing', () => {
      const resume = vi.fn();
      const start = vi.fn();
      const stop = vi.fn();
      const setValueAtTime = vi.fn();
      const linearRampToValueAtTime = vi.fn();
      const exponentialRampToValueAtTime = vi.fn();

      const fakeOsc = () => ({ start, stop, connect: vi.fn(), frequency: { setValueAtTime }, type: '' });
      const fakeGain = () => ({ connect: vi.fn(), gain: { setValueAtTime, linearRampToValueAtTime, exponentialRampToValueAtTime } });

      const fakeCtx: unknown = {
        state: 'suspended',
        currentTime: 0,
        resume,
        createOscillator: fakeOsc,
        createGain: fakeGain,
        destination: {},
      };

      const FakeAudioContext = vi.fn(() => fakeCtx);
      (global as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;

      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
      soundService.playClick();

      expect(resume).toHaveBeenCalled();
    });

    it('playPhaseChange resumes suspended context before playing', () => {
      const resume = vi.fn();
      const start = vi.fn();
      const stop = vi.fn();
      const setValueAtTime = vi.fn();
      const linearRampToValueAtTime = vi.fn();
      const exponentialRampToValueAtTime = vi.fn();

      const fakeOsc = () => ({ start, stop, connect: vi.fn(), frequency: { setValueAtTime }, type: '' });
      const fakeGain = () => ({ connect: vi.fn(), gain: { setValueAtTime, linearRampToValueAtTime, exponentialRampToValueAtTime } });

      const fakeCtx: unknown = {
        state: 'suspended',
        currentTime: 0,
        resume,
        createOscillator: fakeOsc,
        createGain: fakeGain,
        destination: {},
      };

      const FakeAudioContext = vi.fn(() => fakeCtx);
      (global as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;

      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
      soundService.playPhaseChange();

      expect(resume).toHaveBeenCalled();
    });

    it('resumes audio context when playing click if context is suspended', async () => {
      const resume = vi.fn(() => Promise.resolve());
      const fakeOsc = vi.fn(() => ({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }));
      const fakeGain = vi.fn(() => ({
        connect: vi.fn(),
        gain: { setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() },
      }));

      const fakeCtx = {
        state: 'suspended',
        currentTime: 0,
        resume,
        createOscillator: fakeOsc,
        createGain: fakeGain,
        destination: {},
      };

      const FakeAudioContext = vi.fn(() => fakeCtx);
      (global as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;

      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
      soundService.playClick();

      expect(resume).toHaveBeenCalled();
    });
  });
});
