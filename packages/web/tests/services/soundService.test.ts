import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { soundService } from '../../src/services/soundService';

class FakeOscillator {
  public frequency = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  public type: string = 'sine';
  public connects: unknown[] = [];
  public started = false;
  public stopped = false;
  constructor(public ctx: FakeAudioContext) {}
  connect(node: unknown) {
    this.connects.push(node);
  }
  start(_t?: number) {
    this.started = true;
    this.ctx._started.push(this);
  }
  stop(_t?: number) {
    this.stopped = true;
    this.ctx._stopped.push(this);
  }
}

class FakeGain {
  public gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  public connects: unknown[] = [];
  constructor(public ctx: FakeAudioContext) {}
  connect(node: unknown) {
    this.connects.push(node);
  }
}

class FakeBufferSource {
  public buffer: AudioBuffer | null = null;
  public connects: unknown[] = [];
  public started = false;
  public stopped = false;
  constructor(public ctx: FakeAudioContext) {}
  connect(node: unknown) {
    this.connects.push(node);
  }
  start(_t?: number) {
    this.started = true;
  }
  stop(_t?: number) {
    this.stopped = true;
  }
}

class FakeFilter {
  public type: string = 'lowpass';
  public frequency = {
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  public Q = {
    setValueAtTime: vi.fn(),
  };
  public connects: unknown[] = [];
  constructor(public ctx: FakeAudioContext) {}
  connect(node: unknown) {
    this.connects.push(node);
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  public currentTime = 100;
  public state: 'running' | 'suspended' = 'running';
  public destination = {};
  public sampleRate = 44100;
  public _oscillators: FakeOscillator[] = [];
  public _gains: FakeGain[] = [];
  public _bufferSources: FakeBufferSource[] = [];
  public _filters: FakeFilter[] = [];
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

  createBuffer(channels: number, length: number, sampleRate: number) {
    return {
      getChannelData: () => new Float32Array(length),
      length,
      sampleRate,
      numberOfChannels: channels,
      duration: length / sampleRate,
      copyFromChannel: vi.fn(),
      copyToChannel: vi.fn(),
    } as AudioBuffer;
  }

  createBufferSource() {
    const bs = new FakeBufferSource(this);
    this._bufferSources.push(bs);
    return bs as unknown as AudioBufferSourceNode;
  }

  createBiquadFilter() {
    const f = new FakeFilter(this);
    this._filters.push(f);
    return f as unknown as BiquadFilterNode;
  }

  createWaveShaper() {
    return {
      connect: vi.fn(),
      curve: null,
      oversample: 'none',
    } as unknown as WaveShaperNode;
  }

  createDelay(time?: number) {
    return {
      connect: vi.fn(),
      delayTime: {
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
        value: time || 0,
      },
    } as unknown as DelayNode;
  }

  createConvolver() {
    return {
      connect: vi.fn(),
      buffer: null,
    } as unknown as ConvolverNode;
  }

  createDynamicsCompressor() {
    return {
      connect: vi.fn(),
      threshold: { value: -24 },
      knee: { value: 30 },
      ratio: { value: 12 },
      reduction: { value: 0 },
      attack: { value: 0.003 },
      release: { value: 0.25 },
    } as unknown as DynamicsCompressorNode;
  }

  resume() {
    this.resumed = true;
    this.state = 'running';
    return Promise.resolve();
  }
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

    expect(FakeAudioContext.instances.length).toBe(0);
  });

  it('creates nodes and starts/stops oscillators for click when enabled', async () => {
    soundService.setEnabled(true);

    soundService.playClick();

    // One context should be created
    expect(FakeAudioContext.instances.length).toBeGreaterThanOrEqual(1);
    const ctx = FakeAudioContext.instances[0];

    // One oscillator created for default theme
    expect(ctx._oscillators.length).toBeGreaterThanOrEqual(1);

    // Oscillator should have been started and stopped
    expect(ctx._started.length).toBeGreaterThanOrEqual(1);
    expect(ctx._stopped.length).toBeGreaterThanOrEqual(1);

    // Gain and filter nodes should have been created for reverb
    expect(ctx._gains.length).toBeGreaterThanOrEqual(2); // at least 1 for main + reverb nodes
    expect(ctx._filters.length).toBeGreaterThanOrEqual(1); // for reverb lowpass
  });

  describe('SoundService Branches - Context & Audio Control', () => {
    it('resumes audio context when enabled if it was suspended', async () => {
      // Mock AudioContext
      const resumeMock = vi.fn().mockResolvedValue(undefined);
      const mockContext = {
        state: 'suspended',
        resume: resumeMock,
        close: vi.fn(),
        createGain: () => ({
          connect: vi.fn(),
          gain: { value: 0, linearRampToValueAtTime: vi.fn() },
        }),
        createOscillator: () => ({
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          frequency: { value: 0, exponentialRampToValueAtTime: vi.fn() },
        }),
        currentTime: 0,
      };

      // Inject mock context
      (soundService as unknown as { audioContext: unknown }).audioContext = mockContext;

      soundService.setEnabled(true);

      expect(resumeMock).toHaveBeenCalled();
    });

    it('does not play sound if disabled', () => {
      soundService.setEnabled(false);
      // playClick should return early without doing anything
      // We verify it doesn't throw and the service is disabled
      expect(() => soundService.playClick()).not.toThrow();

      // Verify enabled flag is off
      soundService.setEnabled(true);
      soundService.setEnabled(false);
      // After disabling again, method should still not throw
      expect(() => soundService.playClick()).not.toThrow();
    });

    it('does not play sound if audio context is missing', () => {
      soundService.setEnabled(true);
      (soundService as unknown as { audioContext: null }).audioContext = null;

      // Method should handle null audioContext gracefully
      expect(() => soundService.playClick()).not.toThrow();
    });
  });

  describe('SoundService Extra - Advanced Scenarios', () => {
    const originalAudioContext = (global as unknown as { AudioContext: unknown }).AudioContext;

    afterEach(() => {
      (global as unknown as { AudioContext: unknown }).AudioContext = originalAudioContext;
    });

    it('setEnabled resumes suspended AudioContext', () => {
      const resume = vi.fn(() => {
        (fakeCtx as unknown as { state: string }).state = 'running';
        return Promise.resolve();
      });
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

    it('playClick resumes suspended context before playing', () => {
      const resume = vi.fn(() => Promise.resolve());
      const start = vi.fn();
      const stop = vi.fn();
      const setValueAtTime = vi.fn();
      const linearRampToValueAtTime = vi.fn();
      const exponentialRampToValueAtTime = vi.fn();

      const fakeOsc = () => ({
        start,
        stop,
        connect: vi.fn(),
        frequency: { setValueAtTime, exponentialRampToValueAtTime, linearRampToValueAtTime },
        type: '',
      });
      const fakeGain = () => ({
        connect: vi.fn(),
        gain: { setValueAtTime, linearRampToValueAtTime, exponentialRampToValueAtTime },
      });

      const fakeCtx: unknown = {
        state: 'suspended',
        currentTime: 0,
        resume,
        createOscillator: fakeOsc,
        createGain: fakeGain,
        createWaveShaper: () => ({ connect: vi.fn(), curve: null }),
        createDelay: () => ({ connect: vi.fn(), delayTime: { setValueAtTime: vi.fn() } }),
        createBiquadFilter: () => ({
          connect: vi.fn(),
          frequency: { setValueAtTime: vi.fn() },
          Q: { setValueAtTime: vi.fn() },
        }),
        destination: {},
      };

      const FakeAudioContext = vi.fn(() => fakeCtx);
      (global as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;

      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
      soundService.playClick();

      expect(resume).toHaveBeenCalled();
    });

    it('resumes audio context when playing click if context is suspended', async () => {
      const resume = vi.fn(() => Promise.resolve());
      const fakeOsc = vi.fn(() => ({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
      }));
      const fakeGain = vi.fn(() => ({
        connect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      }));

      const fakeCtx = {
        state: 'suspended',
        currentTime: 0,
        resume,
        createOscillator: fakeOsc,
        createGain: fakeGain,
        createWaveShaper: () => ({ connect: vi.fn(), curve: null }),
        createDelay: () => ({ connect: vi.fn(), delayTime: { setValueAtTime: vi.fn() } }),
        createBiquadFilter: () => ({
          connect: vi.fn(),
          frequency: { setValueAtTime: vi.fn() },
          Q: { setValueAtTime: vi.fn() },
        }),
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

  describe('Sound Themes', () => {
    beforeEach(() => {
      FakeAudioContext.instances = [];
      (global as unknown as Record<string, unknown>).AudioContext =
        FakeAudioContext as unknown as typeof AudioContext;
      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
    });

    it('should default to "wood" theme', () => {
      expect(soundService.getTheme()).toBe('wood');
    });

    it('should change theme to "water"', () => {
      soundService.setTheme('water');
      expect(soundService.getTheme()).toBe('water');
    });

    it('should change theme to "wind"', () => {
      soundService.setTheme('wind');
      expect(soundService.getTheme()).toBe('wind');
    });

    it('should change theme to "subtle"', () => {
      soundService.setTheme('subtle');
      expect(soundService.getTheme()).toBe('subtle');
    });

    it('should change theme to "chimes"', () => {
      soundService.setTheme('chimes');
      expect(soundService.getTheme()).toBe('chimes');
    });

    it('should play "wood" click sound with wood theme', () => {
      soundService.setTheme('wood');
      soundService.playClick();

      const ctx = FakeAudioContext.instances[0];
      // Wood theme creates 1 oscillator + reverb effects
      expect(ctx._oscillators.length).toBeGreaterThanOrEqual(1);
      expect(ctx._started.length).toBeGreaterThanOrEqual(1);
      expect(ctx._filters.length).toBeGreaterThanOrEqual(1); // reverb lowpass filter
    });

    it('should play water click sound with water theme', () => {
      soundService.setTheme('water');
      soundService.playClick();

      const ctx = FakeAudioContext.instances[0];
      // Water theme creates 1 oscillator + reverb nodes
      expect(ctx._oscillators.length).toBeGreaterThanOrEqual(1);
      expect(ctx._filters.length).toBeGreaterThanOrEqual(1); // for reverb lowpass
    });

    it('should play wind click sound with wind theme', () => {
      soundService.setTheme('wind');
      soundService.playClick();

      const ctx = FakeAudioContext.instances[0];
      // Wind theme creates 1 noise (bufferSource) + 1 oscillator + filters
      expect(ctx._bufferSources.length).toBeGreaterThanOrEqual(1);
      expect(ctx._oscillators.length).toBeGreaterThanOrEqual(1);
      expect(ctx._filters.length).toBeGreaterThanOrEqual(1);
    });

    it('should play subtle click sound with subtle theme', () => {
      soundService.setTheme('subtle');
      soundService.playClick();

      const ctx = FakeAudioContext.instances[0];
      expect(ctx._oscillators.length).toBeGreaterThanOrEqual(1);
      expect(ctx._started.length).toBeGreaterThanOrEqual(1);
    });

    it('should play chimes click sound with chimes theme', () => {
      soundService.setTheme('chimes');
      soundService.playClick();

      const ctx = FakeAudioContext.instances[0];
      // Chimes theme creates 1 oscillator + reverb nodes
      expect(ctx._oscillators.length).toBeGreaterThanOrEqual(1);
      expect(ctx._filters.length).toBeGreaterThanOrEqual(1); // for reverb lowpass
    });

    it('should not play sounds when disabled regardless of theme', () => {
      FakeAudioContext.instances = [];
      (global as unknown as Record<string, unknown>).AudioContext =
        FakeAudioContext as unknown as typeof AudioContext;
      (soundService as unknown as { audioContext: null }).audioContext = null;

      soundService.setEnabled(false);
      soundService.setTheme('water');
      soundService.playClick();

      expect(FakeAudioContext.instances.length).toBe(0);
    });

    it('should switch themes without affecting enabled state', () => {
      soundService.setEnabled(true);
      soundService.setTheme('water');
      soundService.setTheme('wind');
      soundService.setTheme('chimes');

      expect(soundService.getTheme()).toBe('chimes');
      soundService.playClick();
      expect(FakeAudioContext.instances.length).toBeGreaterThanOrEqual(1);
    });
  });
});
