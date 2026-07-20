import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ttsService } from '@/services/ttsService';

const { nativeGetVoicesMock, nativeSpeakMock } = vi.hoisted(() => ({
  nativeGetVoicesMock: vi.fn(),
  nativeSpeakMock: vi.fn(),
}));

vi.mock('@capacitor-community/text-to-speech', () => ({
  TextToSpeech: {
    getSupportedVoices: nativeGetVoicesMock,
    speak: nativeSpeakMock,
  },
}));

const mockVoices: SpeechSynthesisVoice[] = [
  {
    voiceURI: 'voice-en-us',
    name: 'Test EN',
    lang: 'en-US',
    localService: true,
    default: false,
  } as SpeechSynthesisVoice,
  {
    voiceURI: 'voice-es',
    name: 'Test ES',
    lang: 'es-ES',
    localService: true,
    default: false,
  } as SpeechSynthesisVoice,
];

const speakMock = vi.fn();
const cancelMock = vi.fn();
const getVoicesMock = vi.fn(() => mockVoices);
const addEventListenerMock = vi.fn();
const removeEventListenerMock = vi.fn();
const utteranceCtor = vi.fn(function (this: SpeechSynthesisUtterance, text: string) {
  (this as SpeechSynthesisUtterance).text = text;
});

type TtsServiceInternals = {
  voicesCache: SpeechSynthesisVoice[];
  nativeVoicesCache: SpeechSynthesisVoice[];
  nativeVoiceIndexByUri: Map<string, number>;
  loadingPromise: Promise<SpeechSynthesisVoice[]> | null;
  hasWebSpeech: boolean;
  hasNativeTts: boolean;
  detectionDone: boolean;
};

function resetServiceState() {
  const service = ttsService as unknown as TtsServiceInternals;
  service.voicesCache = [];
  service.nativeVoicesCache = [];
  service.nativeVoiceIndexByUri = new Map();
  service.loadingPromise = null;
  service.hasWebSpeech = false;
  service.hasNativeTts = false;
  service.detectionDone = false;
  ttsService.voicesReady.value = false;
}

function installSpeechSynthesis() {
  vi.stubGlobal('speechSynthesis', {
    getVoices: getVoicesMock,
    speak: speakMock,
    cancel: cancelMock,
    addEventListener: addEventListenerMock,
    removeEventListener: removeEventListenerMock,
  });
  vi.stubGlobal(
    'SpeechSynthesisUtterance',
    utteranceCtor as unknown as typeof SpeechSynthesisUtterance
  );
}

describe('ttsService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    speakMock.mockReset();
    cancelMock.mockReset();
    getVoicesMock.mockReturnValue(mockVoices);
    utteranceCtor.mockClear();
    addEventListenerMock.mockReset();
    removeEventListenerMock.mockReset();
    nativeGetVoicesMock.mockReset();
    nativeSpeakMock.mockReset();
    resetServiceState();
    installSpeechSynthesis();
    ttsService.setEnabled(false);
    ttsService.setVoiceByUri(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not speak when disabled', () => {
    ttsService.speak('hello');
    expect(speakMock).not.toHaveBeenCalled();
  });

  it('speaks using selected voice when enabled', async () => {
    ttsService.setEnabled(true);
    await ttsService.loadVoices();
    ttsService.setVoiceByUri('voice-en-us');
    ttsService.speak('hello world');

    expect(cancelMock).toHaveBeenCalled();
    expect(speakMock).toHaveBeenCalled();
    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.voice?.voiceURI).toBe('voice-en-us');
  });

  it('falls back to first available voice when none selected', async () => {
    ttsService.setEnabled(true);
    await ttsService.loadVoices();
    ttsService.speak('fallback');

    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.voice?.voiceURI).toBe('voice-en-us');
  });

  it('returns the same de-duplicated web voice list that it caches', async () => {
    getVoicesMock.mockReturnValue([mockVoices[0], mockVoices[0], mockVoices[1]]);

    const loaded = await ttsService.loadVoices();

    expect(loaded.map((voice) => voice.voiceURI)).toEqual(['voice-en-us', 'voice-es']);
    expect(ttsService.getVoices()).toEqual(loaded);
  });

  it('waits for asynchronously published web voices and removes its listener', async () => {
    vi.useFakeTimers();
    getVoicesMock.mockReturnValue([]);
    const pendingVoices = ttsService.loadVoices();
    const handler = addEventListenerMock.mock.calls[0]?.[1] as (() => void) | undefined;
    expect(handler).toBeTypeOf('function');

    getVoicesMock.mockReturnValue(mockVoices);
    handler?.();

    await expect(pendingVoices).resolves.toEqual(mockVoices);
    expect(removeEventListenerMock).toHaveBeenCalledWith('voiceschanged', handler);
    expect(ttsService.voicesReady.value).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('resolves an empty web voice list when the browser never publishes voices', async () => {
    vi.useFakeTimers();
    getVoicesMock.mockReturnValue([]);

    const pendingVoices = ttsService.loadVoices();
    await vi.advanceTimersByTimeAsync(600);

    await expect(pendingVoices).resolves.toEqual([]);
    expect(removeEventListenerMock).toHaveBeenCalledWith('voiceschanged', expect.any(Function));
  });

  it('loads and de-duplicates native voices when Web Speech is unavailable', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    nativeGetVoicesMock.mockResolvedValue({
      voices: [mockVoices[0], mockVoices[0], mockVoices[1]],
    });

    await expect(ttsService.loadVoices()).resolves.toEqual(mockVoices);
    expect(ttsService.getVoices()).toEqual(mockVoices);
    expect(ttsService.hasNativeSupport()).toBe(true);
  });

  it('reports native voice discovery failure without claiming native support', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    nativeGetVoicesMock.mockRejectedValue(new Error('native voices unavailable'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await expect(ttsService.loadVoices()).resolves.toEqual([]);

    expect(ttsService.hasNativeSupport()).toBe(false);
    expect(ttsService.voicesReady.value).toBe(true);
    expect(warn).toHaveBeenCalledWith(
      'Native TTS getSupportedVoices failed, falling back to Web Speech:',
      expect.objectContaining({ message: 'native voices unavailable' })
    );
  });

  it('speaks natively with the selected voice index and language', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    nativeGetVoicesMock.mockResolvedValue({ voices: mockVoices });
    nativeSpeakMock.mockResolvedValue(undefined);
    ttsService.setEnabled(true);
    await ttsService.loadVoices();
    ttsService.setVoiceByUri('voice-es');

    await ttsService.speak('Respira suavemente', { targetDurationSeconds: 3 });

    expect(ttsService.getSelectedVoiceUri()).toBe('voice-es');
    expect(nativeSpeakMock).toHaveBeenCalledWith(
      expect.objectContaining({
        text: 'Respira suavemente',
        lang: 'es-ES',
        voice: 1,
        category: 'ambient',
      })
    );
  });

  it('preserves the native plugin index when duplicate voices are hidden from the picker', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    nativeGetVoicesMock.mockResolvedValue({
      voices: [mockVoices[0], mockVoices[0], mockVoices[1]],
    });
    nativeSpeakMock.mockResolvedValue(undefined);
    ttsService.setEnabled(true);
    await ttsService.loadVoices();
    ttsService.setVoiceByUri('voice-es');

    await ttsService.speak('Respira');

    expect(nativeSpeakMock).toHaveBeenCalledWith(expect.objectContaining({ voice: 2 }));
  });

  it('contains native playback failures and leaves the exercise running', async () => {
    vi.stubGlobal('speechSynthesis', undefined);
    vi.stubGlobal('SpeechSynthesisUtterance', undefined);
    nativeSpeakMock.mockRejectedValue(new Error('speaker unavailable'));
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    ttsService.setEnabled(true);

    await expect(ttsService.speak('Continue breathing')).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      'Native TTS failed',
      expect.objectContaining({ message: 'speaker unavailable' })
    );
  });

  it('does not enqueue empty guidance text', async () => {
    ttsService.setEnabled(true);

    await ttsService.speak('');

    expect(speakMock).not.toHaveBeenCalled();
    expect(nativeSpeakMock).not.toHaveBeenCalled();
  });

  it('speeds up guidance for short phases', async () => {
    ttsService.setEnabled(true);
    await ttsService.loadVoices();
    ttsService.speak('Full Breath In', { targetDurationSeconds: 1 });

    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.rate).toBeCloseTo(1.25, 2);
  });

  it('slows guidance when there is ample time', async () => {
    ttsService.setEnabled(true);
    await ttsService.loadVoices();
    ttsService.speak('Full Breath Out', { targetDurationSeconds: 5 });

    const utterance = speakMock.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.rate).toBeCloseTo(0.85, 2);
  });
});
