import { ref } from 'vue';
import { TextToSpeech } from '@capacitor-community/text-to-speech';
import kokoroCues from '../data/kokoroCues.json';

const kokoroVoices: SpeechSynthesisVoice[] = kokoroCues.voices.map((voice) => ({
  voiceURI: `kokoro:${voice.id}`,
  name: voice.name,
  lang: voice.lang,
  localService: true,
  default: voice.id === kokoroCues.defaultVoice,
}));

type SpeakOptions = {
  targetDurationSeconds?: number;
};

class TtsService {
  private enabled = false;
  private activeAudio: HTMLAudioElement | null = null;
  private requestId = 0;
  private nativePlaybackActive = false;
  private nativeStopPromise: Promise<void> | null = null;
  private selectedVoiceUri: string | null = null;
  private voicesCache: SpeechSynthesisVoice[] = [];
  private nativeVoicesCache: SpeechSynthesisVoice[] = [];
  private nativeVoiceIndexByUri = new Map<string, number>();
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
    return [...kokoroVoices, ...(await this.loadDeviceVoices())];
  }

  private async loadDeviceVoices(): Promise<SpeechSynthesisVoice[]> {
    this.detectCapabilities();

    // Prefer Web Speech voices when available
    if (!this.hasWebSpeech) {
      try {
        const { voices } = await TextToSpeech.getSupportedVoices();
        const nativeVoices = voices ?? [];
        this.nativeVoiceIndexByUri.clear();
        nativeVoices.forEach((voice, index) => {
          if (voice.voiceURI && !this.nativeVoiceIndexByUri.has(voice.voiceURI)) {
            this.nativeVoiceIndexByUri.set(voice.voiceURI, index);
          }
        });
        this.nativeVoicesCache = this.dedupeVoices(nativeVoices);
        this.hasNativeTts = true;
        this.voicesReady.value = true;
        return this.nativeVoicesCache;
      } catch (err) {
        console.warn('Native TTS getSupportedVoices failed, falling back to Web Speech:', err);
        // Don't set hasNativeTts = true — let speak() try Web Speech instead
        this.hasNativeTts = false;
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

    const immediateVoices = synth.getVoices();
    if (immediateVoices && immediateVoices.length > 0) {
      this.voicesCache = this.dedupeVoices(immediateVoices);
      this.voicesReady.value = true;
      return this.voicesCache;
    }

    this.loadingPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
      let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
      const resolveWithVoices = () => {
        const voices = synth.getVoices();
        if (voices && voices.length > 0) {
          this.voicesCache = this.dedupeVoices(voices);
          this.voicesReady.value = true;
          resolve(this.voicesCache);
          return true;
        }
        return false;
      };

      const cleanup = () => {
        if (fallbackTimeout !== null) {
          clearTimeout(fallbackTimeout);
          fallbackTimeout = null;
        }
        this.loadingPromise = null;
      };

      const handler = () => {
        if (resolveWithVoices()) {
          synth.removeEventListener('voiceschanged', handler);
          cleanup();
        }
      };

      synth.addEventListener('voiceschanged', handler);

      // Fallback timeout in case event never fires
      fallbackTimeout = setTimeout(() => {
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
    return [...kokoroVoices, ...(this.hasWebSpeech ? this.voicesCache : this.nativeVoicesCache)];
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  public setVoiceByUri(uri: string | null | undefined) {
    if (this.selectedVoiceUri !== (uri ?? null)) this.stop();
    this.selectedVoiceUri = uri ?? null;
  }

  public getSelectedVoiceUri(): string | null {
    return this.selectedVoiceUri;
  }

  public hasNativeSupport(): boolean {
    return this.hasNativeTts;
  }

  public stop(): void {
    this.requestId++;
    if (this.activeAudio) {
      this.activeAudio.onerror = null;
      this.activeAudio.pause();
      this.activeAudio = null;
    }
    this.getSynth()?.cancel();
    if (this.nativePlaybackActive) {
      this.nativePlaybackActive = false;
      this.nativeStopPromise = TextToSpeech.stop().catch(() => undefined);
    }
  }

  public async speak(text: string, options?: SpeakOptions) {
    if (!this.enabled || !text) return;
    this.stop();
    const requestId = this.requestId;
    const duration = options?.targetDurationSeconds;
    const deadline = duration && duration > 0 ? Date.now() + duration * 1000 : Infinity;
    const voice = kokoroCues.voices.find((voice) =>
      this.selectedVoiceUri
        ? this.selectedVoiceUri === `kokoro:${voice.id}`
        : voice.id === kokoroCues.defaultVoice
    );
    const cue = voice ? kokoroCues.cues.find((cue) => cue.text === text) : undefined;
    if (voice && cue && typeof Audio !== 'undefined') {
      const audio = new Audio(`${import.meta.env.BASE_URL}audio/kokoro/${voice.id}/${cue.id}.mp3`);
      this.activeAudio = audio;
      const fallback = () => {
        if (this.activeAudio !== audio || this.requestId !== requestId) return;
        audio.onerror = null;
        audio.pause();
        this.activeAudio = null;
        if (this.enabled && Date.now() < deadline) {
          void this.speakDevice(text, options, requestId);
        }
      };
      audio.onerror = fallback;
      try {
        await audio.play();
      } catch {
        fallback();
      }
      return;
    }
    await this.speakDevice(text, options, requestId);
  }

  private async speakDevice(text: string, options: SpeakOptions | undefined, requestId: number) {
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

      synth.speak(utterance);
      return;
    }

    // Native fallback via Capacitor plugin (Android/iOS)
    try {
      const voices = this.nativeVoicesCache;
      const voiceIndex = this.selectedVoiceUri
        ? (this.nativeVoiceIndexByUri.get(this.selectedVoiceUri) ?? -1)
        : -1;
      const selectedVoice = this.selectedVoiceUri
        ? voices.find((voice) => voice.voiceURI === this.selectedVoiceUri)
        : undefined;

      if (this.nativeStopPromise) await this.nativeStopPromise;
      if (!this.enabled || this.requestId !== requestId) return;
      this.nativePlaybackActive = true;
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
    } finally {
      if (this.requestId === requestId) this.nativePlaybackActive = false;
    }
  }
}

export const ttsService = new TtsService();
