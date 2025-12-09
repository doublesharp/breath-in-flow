import type { SoundTheme } from '@breath-in-flow/shared';

class SoundService {
  private audioContext: AudioContext | null = null;
  private isEnabled = false;
  private currentTheme: SoundTheme = 'default';

  private createReverb(ctx: AudioContext) {
    const input = ctx.createGain();
    const delay = ctx.createDelay();
    const feedback = ctx.createGain();
    const lp = ctx.createBiquadFilter();

    delay.delayTime.value = 0.12;
    feedback.gain.value = 0.06;
    lp.type = 'lowpass';
    lp.frequency.value = 1800;

    input.connect(delay);
    delay.connect(feedback);
    feedback.connect(lp);
    lp.connect(delay);

    const out = ctx.createGain();
    out.gain.value = 0.35;
    delay.connect(out);
    return { input, output: out };
  }

  private applySoftSaturation(ctx: AudioContext, node: AudioNode) {
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i - 128) / 128;
      curve[i] = Math.tanh(x * 1.7);
    }
    shaper.curve = curve;
    node.connect(shaper);
    return shaper;
  }

  private getContext() {
    if (!this.audioContext) {
      const AC =
        window.AudioContext || (window as unknown as Record<string, unknown>).webkitAudioContext;
      if (AC) {
        this.audioContext = new (AC as unknown as typeof AudioContext)();
        // Immediately try to resume for Electron compatibility
        if (this.audioContext.state === 'suspended') {
          this.audioContext.resume().catch(() => {
            // Resume will be retried when audio is enabled or played
          });
        }
      }
    }
    return this.audioContext;
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (enabled) {
      const ctx = this.getContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {
          // Will be retried on next playback attempt
        });
      }
    }
  }

  public setTheme(theme: SoundTheme) {
    this.currentTheme = theme;
  }

  public getTheme() {
    return this.currentTheme;
  }

  // ------------------------------------------------------------
  // PUBLIC API (same)
  // ------------------------------------------------------------

  public playClick() {
    if (!this.isEnabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    // Ensure context is running (important for Electron)
    if (ctx.state === 'suspended') {
      ctx.resume().then(() => {
        this.playTick(ctx, 1.0);
      }).catch(() => {
        // Silently fail - audio context couldn't resume
      });
    } else {
      this.playTick(ctx, 1.0);
    }
  }

  // ------------------------------------------------------------
  // Tick dispatcher
  // ------------------------------------------------------------

  private playTick(ctx: AudioContext, accent: number) {
    switch (this.currentTheme) {
      case 'water':
        return this.waterTick(ctx, accent);
      case 'wind':
        return this.windTick(ctx, accent);
      case 'subtle':
        return this.subtleTick(ctx, accent);
      case 'chimes':
        return this.chimesTick(ctx, accent);
      default:
        return this.defaultTick(ctx, accent);
    }
  }

  // ------------------------------------------------------------
  // TICK IMPLEMENTATIONS (same as last version but louder)
  // ------------------------------------------------------------

  private defaultTick(ctx: AudioContext, accent: number) {
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 600;

    const gain = ctx.createGain();
    const peak = 0.45 * accent;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);

    this.applySoftSaturation(ctx, gain);

    const rev = this.createReverb(ctx);
    osc.connect(gain);
    gain.connect(rev.input);
    rev.output.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.18);
  }

  private waterTick(ctx: AudioContext, accent: number) {
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';

    const base = 650;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.exponentialRampToValueAtTime(base * 0.85, t + 0.06);

    const gain = ctx.createGain();
    const peak = 0.33 * accent;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);

    this.applySoftSaturation(ctx, gain);

    const rev = this.createReverb(ctx);
    osc.connect(gain);
    gain.connect(rev.input);
    rev.output.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.28);
  }

  private windTick(ctx: AudioContext, accent: number) {
    const t = ctx.currentTime;

    const noise = this.makeNoise(ctx);

    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400;
    band.Q.value = 1.8;

    const gain = ctx.createGain();
    const peak = 0.3 * accent;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);

    this.applySoftSaturation(ctx, gain);

    noise.connect(band);
    band.connect(gain);

    // airy anchor tone
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 500;

    const toneGain = ctx.createGain();
    toneGain.gain.setValueAtTime(0, t);
    toneGain.gain.linearRampToValueAtTime(peak * 0.4, t + 0.02);
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);

    osc.connect(toneGain);
    toneGain.connect(gain);

    const rev = this.createReverb(ctx);
    gain.connect(rev.input);
    rev.output.connect(ctx.destination);

    noise.start(t);
    noise.stop(t + 0.22);

    osc.start(t);
    osc.stop(t + 0.2);
  }

  private subtleTick(ctx: AudioContext, accent: number) {
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 660;

    const gain = ctx.createGain();
    const peak = 0.12 * accent;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.14);
  }

  private chimesTick(ctx: AudioContext, accent: number) {
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 1200;

    const gain = ctx.createGain();
    const peak = 0.38 * accent;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);

    this.applySoftSaturation(ctx, gain);

    const rev = this.createReverb(ctx);
    osc.connect(gain);
    gain.connect(rev.input);
    rev.output.connect(ctx.destination);

    osc.start(t);
    osc.stop(t + 0.32);
  }

  private makeNoise(ctx: AudioContext) {
    const bufferSize = ctx.sampleRate * 0.2;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    return src;
  }
}

export const soundService = new SoundService();
