import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ttsService } from '@/services/ttsService';

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
const utteranceCtor = vi.fn(function (this: SpeechSynthesisUtterance, text: string) {
  (this as SpeechSynthesisUtterance).text = text;
});

function installSpeechSynthesis() {
  vi.stubGlobal('speechSynthesis', {
    getVoices: getVoicesMock,
    speak: speakMock,
    cancel: cancelMock,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
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
    installSpeechSynthesis();
    ttsService.setEnabled(false);
    ttsService.setVoiceByUri(null);
  });

  afterEach(() => {
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
