class SoundService {
  private audioContext: AudioContext | null = null;
  private isEnabled: boolean = false;

  constructor() {
    // Lazy initialization
  }

  private getContext() {
    if (!this.audioContext) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass();
      }
    }
    return this.audioContext;
  }

  public setEnabled(enabled: boolean) {
    this.isEnabled = enabled;
    if (enabled) {
      const ctx = this.getContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume();
      }
    }
  }

  public playClick() {
    if (!this.isEnabled) return;
    
    const ctx = this.getContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const t = ctx.currentTime;

    // Create two oscillators for a more hollow woodblock sound
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    // Frequencies for woodblock (high resonance)
    osc1.frequency.setValueAtTime(800, t);
    osc2.frequency.setValueAtTime(1200, t);
    
    osc1.type = 'sine';
    osc2.type = 'sine';

    // Envelope: Sharp attack, quick decay
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

    osc1.start(t);
    osc2.start(t);
    osc1.stop(t + 0.1);
    osc2.stop(t + 0.1);
  }

  public playPhaseChange() {
    if (!this.isEnabled) return;
    
    const ctx = this.getContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const t = ctx.currentTime;
    const masterGain = ctx.createGain();
    masterGain.connect(ctx.destination);
    masterGain.gain.setValueAtTime(0.2, t);

    // Additive synthesis for a bell/chime sound
    // Fundamental + Overtones
    const freqs = [523.25, 1046.50, 1567.98]; // C5, C6, G6 (approx)
    const decays = [1.5, 1.0, 0.8];

    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      
      osc.connect(gain);
      gain.connect(masterGain);
      
      // Envelope
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.3 / (i + 1), t + 0.02); // Lower volume for higher harmonics
      gain.gain.exponentialRampToValueAtTime(0.001, t + decays[i]);
      
      osc.start(t);
      osc.stop(t + decays[i]);
    });
  }
}

export const soundService = new SoundService();
