import { ref } from 'vue';
import { TextToSpeech } from '@capacitor-community/text-to-speech';

type SpeakOptions = {
  targetDurationSeconds?: number;
};

class TtsService {
  private enabled = false;
  private selectedVoiceUri: string | null = null;
  private voicesCache: SpeechSynthesisVoice[] = [];
  private nativeVoicesCache: SpeechSynthesisVoice[] = [];
  private loadingPromise: Promise<SpeechSynthesisVoice[]> | null = null;
  public voicesReady = ref(false);
  private hasWebSpeech = false;
  private hasNativeTts = false;
  private detectionDone = false;

  private computeRate(text: string, targetDurationSeconds?: number): number {
    const comfortableRate = 0.95;
    if (!targetDurationSeconds || targetDurationSeconds <= 0) return comfortableRate;

    const words = Math.max(text.trim().split(/\s+/).length, 1);
    const baseWordsPerSecond = 2.4; // Typical pacing at rate 1.0
    const baseDuration = words / baseWordsPerSecond;

    const desiredRate = baseDuration / targetDurationSeconds;
    const clampedRate = Math.min(Math.max(desiredRate, 0.8), 1.35);

    // When the phase is longer than the phrase, bias slightly slower for a calmer cue
    if (targetDurationSeconds >= baseDuration * 1.5) {
      return Math.max(0.85, clampedRate * 0.92);
    }

    return clampedRate;
  }

  private getSynth(): SpeechSynthesis | null {
    if (typeof window === 'undefined') return null;
    return (window as Window & { speechSynthesis?: SpeechSynthesis }).speechSynthesis ?? null;
  }

  private dedupeVoices(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice[] {
    const seen = new Set<string>();
    const result: SpeechSynthesisVoice[] = [];

    for (const voice of voices) {
      const key = voice.voiceURI || `${voice.name}|${voice.lang}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(voice);
    }

    return result;
  }

  private detectCapabilities() {
    if (this.detectionDone) return;
    const synth = this.getSynth();
    this.hasWebSpeech = Boolean(synth) && typeof SpeechSynthesisUtterance !== 'undefined';
    this.detectionDone = true;
  }

  public async loadVoices(): Promise<SpeechSynthesisVoice[]> {
    this.detectCapabilities();

    // Prefer Web Speech voices when available
    if (!this.hasWebSpeech) {
      try {
        const { voices } = await TextToSpeech.getSupportedVoices();
        this.nativeVoicesCache = this.dedupeVoices(voices ?? []);
        this.hasNativeTts = true;
        this.voicesReady.value = true;
        return this.nativeVoicesCache;
      } catch (err) {
        console.error('Failed to load native TTS voices', err);
        this.hasNativeTts = true;
        this.voicesReady.value = true;
        return [];
      }
    }

    const synth = this.getSynth();
    if (!synth) return [];

    // Already loaded
    if (this.voicesCache.length > 0) {
      this.voicesReady.value = true;
      return this.voicesCache;
    }

    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const resolveWithVoices = () => {
        const voices = synth.getVoices();
        if (voices && voices.length > 0) {
          this.voicesCache = this.dedupeVoices(voices);
          this.voicesReady.value = true;
          resolve(voices);
          return true;
        }
        return false;
      };

      const cleanup = () => {
        this.loadingPromise = null;
      };

      // Try immediately
      if (resolveWithVoices()) {
        cleanup();
        return;
      }

      const handler = () => {
        if (resolveWithVoices()) {
          synth.removeEventListener('voiceschanged', handler);
          cleanup();
        }
      };

      synth.addEventListener('voiceschanged', handler);

      // Fallback timeout in case event never fires
      setTimeout(() => {
        synth.removeEventListener('voiceschanged', handler);
        if (!resolveWithVoices()) {
          resolve([]);
        }
        cleanup();
      }, 600);
    });

    return this.loadingPromise;
  }

  public getVoices(): SpeechSynthesisVoice[] {
    if (this.hasWebSpeech) return this.voicesCache.slice();
    return this.nativeVoicesCache.slice();
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
  }

  public setVoiceByUri(uri: string | null | undefined) {
    this.selectedVoiceUri = uri ?? null;
  }

  public getSelectedVoiceUri(): string | null {
    return this.selectedVoiceUri;
  }

  public hasNativeSupport(): boolean {
    return this.hasNativeTts;
  }

  public async speak(text: string, options?: SpeakOptions) {
    if (!this.enabled || !text) return;

    this.detectCapabilities();

    const rate = this.computeRate(text, options?.targetDurationSeconds);

    // Prefer Web Speech when present (desktop/web, some Android WebViews)
    if (this.hasWebSpeech) {
      const synth = this.getSynth();
      if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return;

      const utterance = new SpeechSynthesisUtterance(text);

      // Best effort voice selection
      const voices = this.voicesCache.length ? this.voicesCache : synth.getVoices();
      let voice: SpeechSynthesisVoice | undefined;
      if (this.selectedVoiceUri) {
        voice = voices.find((v) => v.voiceURI === this.selectedVoiceUri);
      }
      if (!voice) {
        voice = voices.find((v) => v.lang?.toLowerCase().startsWith('en')) ?? voices[0];
      }
      if (voice) {
        utterance.voice = voice;
      }

      utterance.rate = rate;
      utterance.pitch = 1;
      utterance.volume = 1;

      synth.cancel(); // Stop any queued speech to avoid overlap
      synth.speak(utterance);
      return;
    }

    // Native fallback via Capacitor plugin (Android/iOS)
    try {
      const voices = this.nativeVoicesCache;
      const voiceIndex = this.selectedVoiceUri
        ? voices.findIndex((v) => v.voiceURI === this.selectedVoiceUri)
        : -1;
      const selectedVoice = voiceIndex >= 0 ? voices[voiceIndex] : undefined;

      await TextToSpeech.speak({
        text,
        rate,
        pitch: 1,
        volume: 1,
        lang:
          selectedVoice?.lang ?? (typeof navigator !== 'undefined' ? navigator.language : 'en-US'),
        voice: voiceIndex >= 0 ? voiceIndex : undefined,
        category: 'ambient',
      });
    } catch (err) {
      console.error('Native TTS failed', err);
    }
  }
}

export const ttsService = new TtsService();
