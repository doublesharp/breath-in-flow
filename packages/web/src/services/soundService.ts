import type { SoundTheme } from '@breath-in-flow/shared';

class SoundService {
  private audioContext: AudioContext | null = null;
  private isEnabled = false;
  private currentTheme: SoundTheme = 'wood';
  private playbackGeneration = 0;
  private reverbs = new WeakMap<AudioContext, { input: GainNode; output: GainNode }>();

  private createReverb(ctx: AudioContext) {
    const existing = this.reverbs.get(ctx);
    if (existing) return existing;
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
    out.connect(ctx.destination);
    const reverb = { input, output: out };
    this.reverbs.set(ctx, reverb);
    return reverb;
  }

  private applySoftSaturation(ctx: AudioContext, node: AudioNode) {
    const shaper = ctx.createWaveShaper();
    // Web Audio spans [-1, 1] across length - 1 intervals. An odd table places
    // silent input exactly at zero instead of interpolating a negative DC value.
    const curve = new Float32Array(257);
    for (let i = 0; i < curve.length; i++) {
      const x = (2 * i) / (curve.length - 1) - 1;
      curve[i] = Math.tanh(x * 1.7);
    }
    shaper.curve = curve;
    node.connect(shaper);
    return shaper;
  }

  private releaseOnEnd(source: AudioScheduledSourceNode, ...nodes: AudioNode[]) {
    source.onended = () => {
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
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
    if (!enabled) this.playbackGeneration += 1;
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
    const generation = ++this.playbackGeneration;

    // Ensure context is running (important for Electron)
    if (ctx.state === 'suspended') {
      ctx
        .resume()
        .then(() => {
          if (this.isEnabled && generation === this.playbackGeneration) {
            this.playTick(ctx, 1.0);
          }
        })
        .catch(() => {
          // Silently fail - audio context couldn't resume
        });
    } else {
      this.playTick(ctx, 1.0);
    }
  }

  /**
   * Play an ascending three-note completion chime.
   * Works regardless of isEnabled (measurement completion should always be audible).
   */
  public playCompletionChime() {
    const ctx = this.getContext();
    if (!ctx) return;

    const resume = ctx.state === 'suspended' ? ctx.resume() : Promise.resolve();
    void resume
      .then(() => {
        const t = ctx.currentTime;

        // Note 1: C5 (523 Hz)
        const osc1 = ctx.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = 523;
        const gain1 = ctx.createGain();
        gain1.gain.setValueAtTime(0, t);
        gain1.gain.linearRampToValueAtTime(0.3, t + 0.02);
        gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
        osc1.connect(gain1).connect(ctx.destination);
        osc1.start(t);
        osc1.stop(t + 0.6);

        // Note 2: E5 (659 Hz) — delayed slightly
        const osc2 = ctx.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = 659;
        const gain2 = ctx.createGain();
        gain2.gain.setValueAtTime(0, t + 0.15);
        gain2.gain.linearRampToValueAtTime(0.3, t + 0.17);
        gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
        osc2.connect(gain2).connect(ctx.destination);
        osc2.start(t + 0.15);
        osc2.stop(t + 0.8);

        // Note 3: G5 (784 Hz) — final resolve
        const osc3 = ctx.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = 784;
        const gain3 = ctx.createGain();
        gain3.gain.setValueAtTime(0, t + 0.3);
        gain3.gain.linearRampToValueAtTime(0.25, t + 0.32);
        gain3.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
        osc3.connect(gain3).connect(ctx.destination);
        osc3.start(t + 0.3);
        osc3.stop(t + 1.2);
      })
      .catch(() => {
        // Completion still succeeds when the browser cannot resume audio.
      });
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
      case 'wood':
      default:
        return this.defaultTick(ctx, accent);
    }
  }

  // ------------------------------------------------------------
  // Tick implementations
  // ------------------------------------------------------------

  private defaultTick(ctx: AudioContext, accent: number) {
    const t = ctx.currentTime;

    const osc = ctx.createOscillator();
    // A lower pure tone and rounded attack keep the beat audible without a sharp click.
    osc.type = 'sine';
    osc.frequency.value = 240;

    const gain = ctx.createGain();
    const peak = 0.4 * accent;

    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

    const rev = this.createReverb(ctx);
    osc.connect(gain);
    gain.connect(rev.input);

    osc.start(t);
    osc.stop(t + 0.1);
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

    const saturated = this.applySoftSaturation(ctx, gain);

    const rev = this.createReverb(ctx);
    osc.connect(gain);
    saturated.connect(rev.input);
    this.releaseOnEnd(osc, gain, saturated);

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

    const saturated = this.applySoftSaturation(ctx, gain);

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
    saturated.connect(rev.input);
    this.releaseOnEnd(noise, osc, band, toneGain, gain, saturated);

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

    const saturated = this.applySoftSaturation(ctx, gain);

    const rev = this.createReverb(ctx);
    osc.connect(gain);
    saturated.connect(rev.input);
    this.releaseOnEnd(osc, gain, saturated);

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
