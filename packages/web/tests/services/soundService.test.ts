import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { soundService } from '../../src/services/soundService';

class FakeOscillator {
  public frequency = {
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
  };
  public type: string = 'sine';
  public connects: unknown[] = [];
  public started = false;
  public stopped = false;
  public stoppedAt: number | undefined;
  public onended: (() => void) | null = null;
  public disconnect = vi.fn();
  constructor(public ctx: FakeAudioContext) {}
  connect(node: unknown) {
    this.connects.push(node);
    return node;
  }
  start(_t?: number) {
    this.started = true;
    this.ctx._started.push(this);
  }
  stop(t?: number) {
    this.stoppedAt = t;
    this.stopped = true;
    this.ctx._stopped.push(this);
  }
}

class FakeGain {
  public disconnect = vi.fn();
  public gain = {
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
  public connects: unknown[] = [];
  constructor(public ctx: FakeAudioContext) {}
  connect(node: unknown) {
    this.connects.push(node);
    return node;
  }
}

class FakeBufferSource {
  public onended: (() => void) | null = null;
  public disconnect = vi.fn();
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
  public disconnect = vi.fn();
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
  public _shapers: Array<{
    connect: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    curve: Float32Array | null;
  }> = [];
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
    const shaper = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      curve: null,
      oversample: 'none',
    };
    this._shapers.push(shaper);
    return shaper as unknown as WaveShaperNode;
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
    // Reset globalThis AudioContext to our fake
    (globalThis as unknown as Record<string, unknown>).AudioContext = FakeAudioContext;
    // Clear instances
    FakeAudioContext.instances = [];
    // Reset singleton internal state
    (soundService as unknown as { audioContext: null }).audioContext = null;
    soundService.setEnabled(false);
    soundService.setTheme('wood');
  });

  it.each(['water', 'wind', 'chimes'] as const)(
    'routes %s through its soft saturation stage',
    (theme) => {
      soundService.setEnabled(true);
      soundService.setTheme(theme);
      soundService.playClick();
      const ctx = FakeAudioContext.instances[0];
      const shaper = ctx._shapers[0];
      const envelope = ctx._gains[0];
      expect(shaper.curve).toBeInstanceOf(Float32Array);
      expect(envelope.connects).toHaveLength(1);
      expect(envelope.connects[0]).toBe(shaper);
      expect(shaper.connect).toHaveBeenCalledOnce();
      expect(ctx._gains).toContain(shaper.connect.mock.calls[0][0]);
    }
  );

  it.each(['water', 'wind', 'chimes'] as const)(
    '%s produces no DC at silent input and releases its nodes',
    (theme) => {
      soundService.setEnabled(true);
      soundService.setTheme(theme);
      soundService.playClick();
      const ctx = FakeAudioContext.instances[0];
      const shaper = ctx._shapers[0];
      const curve = shaper.curve!;
      // Web Audio interpolates zero input at (length - 1) / 2, not length / 2.
      const middle = (curve.length - 1) / 2;
      const atZero = (curve[Math.floor(middle)] + curve[Math.ceil(middle)]) / 2;
      expect(Math.abs(atZero)).toBeLessThan(1e-12);
      const source = theme === 'wind' ? ctx._bufferSources[0] : ctx._oscillators[0];
      expect(source.onended).toBeTypeOf('function');
      source.onended!();
      expect(source.disconnect).toHaveBeenCalledOnce();
      expect(ctx._gains[0].disconnect).toHaveBeenCalledOnce();
      expect(shaper.disconnect).toHaveBeenCalledOnce();
      if (theme === 'wind') {
        expect(ctx._oscillators[0].disconnect).toHaveBeenCalledOnce();
        expect(ctx._filters[0].disconnect).toHaveBeenCalledOnce();
        expect(ctx._gains[1].disconnect).toHaveBeenCalledOnce();
      }
    }
  );

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
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

  it('gives the default beat a rounded onset and a low pure tone', () => {
    soundService.setTheme('wood');
    soundService.setEnabled(true);
    soundService.playClick();

    const ctx = FakeAudioContext.instances[0];
    const tone = ctx._oscillators[0];
    expect(tone.type).toBe('sine');
    expect(tone.frequency.value).toBe(240);

    const envelope = ctx._gains[0].gain;
    expect(envelope.setValueAtTime).toHaveBeenCalledWith(0, ctx.currentTime);
    const [peak, attackEnd] = envelope.linearRampToValueAtTime.mock.calls[0];
    expect(peak).toBeGreaterThanOrEqual(0.3);
    expect(peak).toBeLessThanOrEqual(0.45);
    expect(attackEnd - ctx.currentTime).toBeGreaterThanOrEqual(0.015);
    expect(attackEnd - ctx.currentTime).toBeLessThanOrEqual(0.03);
    expect(envelope.exponentialRampToValueAtTime).toHaveBeenCalledWith(
      0.0001,
      ctx.currentTime + 0.1
    );
    expect(tone.stoppedAt).toBeGreaterThanOrEqual(
      envelope.exponentialRampToValueAtTime.mock.calls[0][1]
    );
  });

  it('cancels a pending click when sound is disabled and re-enabled', async () => {
    soundService.setEnabled(true);
    const context = FakeAudioContext.instances[0];
    context.state = 'suspended';
    let resume!: () => void;
    vi.spyOn(context, 'resume').mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resume = resolve;
        })
    );
    soundService.playClick();
    soundService.setEnabled(false);
    context.state = 'running';
    soundService.setEnabled(true);
    resume();
    await Promise.resolve();
    expect(context._started).toHaveLength(0);
  });

  it('does not create another persistent reverb graph for each beat', () => {
    soundService.setTheme('wood');
    soundService.setEnabled(true);
    const context = FakeAudioContext.instances[0];
    const createDelay = vi.spyOn(context, 'createDelay');
    for (let second = 0; second < 60; second++) {
      context.currentTime += 1;
      soundService.playClick();
    }
    expect(context._started).toHaveLength(60);
    expect(createDelay).toHaveBeenCalledTimes(1);
    expect(context._filters).toHaveLength(1);
  });

  it('plays the full three-note completion chime even when click sounds are disabled', async () => {
    soundService.setEnabled(false);

    soundService.playCompletionChime();
    await Promise.resolve();

    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx._oscillators.map((oscillator) => oscillator.frequency.value)).toEqual([
      523, 659, 784,
    ]);
    expect(ctx._started).toHaveLength(3);
    expect(ctx._stopped).toHaveLength(3);
    expect(ctx._gains).toHaveLength(3);
  });

  it('resumes a suspended context before scheduling the completion chime', async () => {
    const context = new FakeAudioContext();
    context.state = 'suspended';
    (soundService as unknown as { audioContext: FakeAudioContext }).audioContext = context;

    soundService.playCompletionChime();
    await Promise.resolve();

    expect(context.resumed).toBe(true);
    expect(context._started).toHaveLength(3);
  });

  it('handles a rejected completion-chime resume without an unhandled rejection', async () => {
    const context = new FakeAudioContext();
    context.state = 'suspended';
    vi.spyOn(context, 'resume').mockRejectedValue(new Error('Audio is unavailable'));
    (soundService as unknown as { audioContext: FakeAudioContext }).audioContext = context;
    soundService.playCompletionChime();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(context._started).toHaveLength(0);
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
      soundService.setEnabled(true);
      const context = FakeAudioContext.instances[0];
      soundService.setEnabled(false);
      soundService.playClick();
      expect(context._started).toHaveLength(0);
    });

    it('handles a browser without Web Audio support', () => {
      vi.stubGlobal('AudioContext', undefined);
      vi.stubGlobal('webkitAudioContext', undefined);
      soundService.setEnabled(true);
      expect(() => soundService.playClick()).not.toThrow();
      expect(() => soundService.playCompletionChime()).not.toThrow();
      expect(FakeAudioContext.instances).toHaveLength(0);
    });
  });

  describe('SoundService Extra - Advanced Scenarios', () => {
    const originalAudioContext = (globalThis as unknown as { AudioContext: unknown }).AudioContext;

    afterEach(() => {
      (globalThis as unknown as { AudioContext: unknown }).AudioContext = originalAudioContext;
    });

    it('setEnabled resumes suspended AudioContext', () => {
      const resume = vi.fn(() => {
        return Promise.resolve();
      });

      class MockSuspendedAudioContext {
        state = 'suspended';
        resume = resume;
      }

      (globalThis as unknown as Record<string, unknown>).AudioContext = MockSuspendedAudioContext;
      // Ensure window.AudioContext is also set in the test DOM
      const globalThisWindow = (globalThis as unknown as Record<string, unknown>).window || {};
      (globalThisWindow as Record<string, unknown>).AudioContext = MockSuspendedAudioContext;
      (globalThis as unknown as Record<string, unknown>).window = globalThisWindow;

      // Ensure soundService will create a fresh AudioContext instance
      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
      expect(resume).toHaveBeenCalled();
    });

    it('playClick does nothing when disabled in complex scenario', () => {
      class MockRunningAudioContext {
        state = 'running';
      }
      (globalThis as unknown as Record<string, unknown>).AudioContext = MockRunningAudioContext;
      const globalThisWindow = (globalThis as unknown as Record<string, unknown>).window || {};
      (globalThisWindow as Record<string, unknown>).AudioContext = MockRunningAudioContext;
      (globalThis as unknown as Record<string, unknown>).window = globalThisWindow;

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

      class MockSuspendedCtx {
        state = 'suspended';
        currentTime = 0;
        resume = resume;
        createOscillator = fakeOsc;
        createGain = fakeGain;
        createWaveShaper = () => ({ connect: vi.fn(), curve: null });
        createDelay = () => ({ connect: vi.fn(), delayTime: { setValueAtTime: vi.fn() } });
        createBiquadFilter = () => ({
          connect: vi.fn(),
          frequency: { setValueAtTime: vi.fn() },
          Q: { setValueAtTime: vi.fn() },
        });
        destination = {};
      }

      (globalThis as unknown as Record<string, unknown>).AudioContext = MockSuspendedCtx;

      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
      soundService.playClick();

      expect(resume).toHaveBeenCalled();
    });

    it('resumes audio context when playing click if context is suspended', async () => {
      const resume = vi.fn(() => Promise.resolve());
      const fakeOsc = () => ({
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        frequency: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
        },
      });
      const fakeGain = () => ({
        connect: vi.fn(),
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
      });

      class MockSuspendedCtx2 {
        state = 'suspended';
        currentTime = 0;
        resume = resume;
        createOscillator = fakeOsc;
        createGain = fakeGain;
        createWaveShaper = () => ({ connect: vi.fn(), curve: null });
        createDelay = () => ({ connect: vi.fn(), delayTime: { setValueAtTime: vi.fn() } });
        createBiquadFilter = () => ({
          connect: vi.fn(),
          frequency: { setValueAtTime: vi.fn() },
          Q: { setValueAtTime: vi.fn() },
        });
        destination = {};
      }

      (globalThis as unknown as Record<string, unknown>).AudioContext = MockSuspendedCtx2;

      (soundService as unknown as { audioContext: null }).audioContext = null;
      soundService.setEnabled(true);
      soundService.playClick();

      expect(resume).toHaveBeenCalled();
    });
  });

  describe('Sound Themes', () => {
    beforeEach(() => {
      FakeAudioContext.instances = [];
      (globalThis as unknown as Record<string, unknown>).AudioContext =
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
      (globalThis as unknown as Record<string, unknown>).AudioContext =
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
