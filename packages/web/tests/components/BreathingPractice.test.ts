import { DOMWrapper, enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import { DEFAULT_BREATHING_CONFIG, type SoundTheme } from '@breath-in-flow/shared';
import { LAST_CONFIG_STORAGE_KEY, SKIP_CHECK_INS_STORAGE_KEY } from '@/constants/storageKeys';
import { soundService } from '@/services/soundService';
import BreathingPractice from '@/components/BreathingPractice.vue';

const { keepAwakeMock, allowSleepMock, addAppListener, removeAppListener, isNativePlatform } = vi.hoisted(() => ({
  keepAwakeMock: vi.fn(),
  allowSleepMock: vi.fn(),
  addAppListener: vi.fn(),
  removeAppListener: vi.fn(),
  isNativePlatform: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform },
}));

vi.mock('@capacitor/app', () => ({
  App: { addListener: addAppListener },
}));

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: { keepAwake: keepAwakeMock, allowSleep: allowSleepMock },
}));

enableAutoUnmount(afterEach);

const startMock = vi.fn();
const pauseMock = vi.fn();
const resumeMock = vi.fn();
const stopMock = vi.fn();
const nextSetMock = vi.fn();
const endExtendedHoldMock = vi.fn();
const isRunning = ref(false);
const timerIsPaused = ref(false);
const timerPhase = ref('IDLE');
const timerCurrentTime = ref(0);
const timerTotalPhaseTime = ref(0);
const timerCurrentSet = ref(1);

const createSessionMock = vi.fn();
const addSetMock = vi.fn();
const addExtendedHoldMock = vi.fn();
const completeSessionMock = vi.fn();
const cancelSessionMock = vi.fn();
const updateSessionMock = vi.fn();
const createConfigMock = vi.fn();
const updateConfigMock = vi.fn();
const deleteConfigMock = vi.fn();
const deleteSessionMock = vi.fn();
const getAllConfigsMock = vi.fn(() => [] as Array<{ id?: string; name: string }>);
const getSessionMock = vi.fn(() => ({
  id: 'test-session',
  sets: [] as Array<{ setNumber: number }>,
}));
const soundTheme = ref<SoundTheme>('wood');
const setSoundThemeMock = vi.fn((theme: SoundTheme) => { soundTheme.value = theme; });

let speakMock: ReturnType<typeof vi.fn>;
let stopTtsMock: ReturnType<typeof vi.fn>;
let loadVoicesMock: ReturnType<typeof vi.fn>;
let setVoiceMock: ReturnType<typeof vi.fn>;
let setTtsEnabledMock: ReturnType<typeof vi.fn>;
let hasNativeSupportMock: ReturnType<typeof vi.fn>;

let lastTimerOptions: Record<string, unknown> | undefined;
let changeAppState: (state: { isActive: boolean }) => void;

vi.mock('@/composables/useStorage', () => ({
  useStorage: () => ({
    createSession: createSessionMock,
    addSetToSession: addSetMock,
    addExtendedHoldToSet: addExtendedHoldMock,
    completeSession: completeSessionMock,
    cancelSession: cancelSessionMock,
    updateSession: updateSessionMock,
    createConfig: createConfigMock,
    updateConfig: updateConfigMock,
    deleteConfig: deleteConfigMock,
    deleteSession: deleteSessionMock,
    getSoundTheme: () => soundTheme.value,
    setSoundTheme: setSoundThemeMock,
    soundTheme,
    practiceResetVersion: ref(0),
    getAllConfigs: getAllConfigsMock,
    getSession: getSessionMock,
  }),
}));

const hasAnyMeasurementsMock = vi.fn().mockResolvedValue(false);

vi.mock('@/composables/useHrvStorage', () => ({
  useHrvStorage: () => ({
    hasAnyMeasurements: hasAnyMeasurementsMock,
    saveMeasurement: vi.fn(),
    getMeasurements: vi.fn().mockResolvedValue([]),
    getLatestAssessment: vi.fn().mockResolvedValue(null),
  }),
}));

vi.mock('@/composables/useBreathingTimer', () => {
  return {
    useBreathingTimer: (_config: unknown, options: Record<string, unknown>) => {
      lastTimerOptions = options;
      return {
        // component expects refs like `phase.value` etc.
        phase: timerPhase,
        pausedPhase: ref(null),
        currentTime: timerCurrentTime,
        totalPhaseTime: timerTotalPhaseTime,
        isRunning,
        breathingScale: ref(1.0),
        currentRepetition: ref(1),
        currentSet: timerCurrentSet,
        extendedHoldElapsed: ref(0),
        isFirstExtendedHold: ref(true),
        start: startMock,
        pause: pauseMock,
        resume: resumeMock,
        nextSet: nextSetMock,
        endExtendedHold: endExtendedHoldMock,
        stop: stopMock,
        isPaused: timerIsPaused,
      };
    },
  };
});

vi.mock('@/services/ttsService', () => ({
  ttsService: {
    get stop() {
      stopTtsMock = stopTtsMock ?? vi.fn();
      return stopTtsMock;
    },
    get speak() {
      speakMock = speakMock ?? vi.fn();
      return speakMock;
    },
    get loadVoices() {
      loadVoicesMock = loadVoicesMock ?? vi.fn().mockResolvedValue([]);
      return loadVoicesMock;
    },
    get setVoiceByUri() {
      setVoiceMock = setVoiceMock ?? vi.fn();
      return setVoiceMock;
    },
    get setEnabled() {
      setTtsEnabledMock = setTtsEnabledMock ?? vi.fn();
      return setTtsEnabledMock;
    },
    get hasNativeSupport() {
      hasNativeSupportMock = hasNativeSupportMock ?? vi.fn().mockReturnValue(false);
      return hasNativeSupportMock;
    },
  },
}));

const page = new DOMWrapper(document.body);
const settingsSelector = '[aria-labelledby="configure-practice-title"]';

function buttonWithText(root: Pick<DOMWrapper<Element>, 'findAll'>, label: string) {
  const button = root.findAll('button').find((candidate) => candidate.text() === label);
  expect(button, `Missing button "${label}"`).toBeDefined();
  return button!;
}

describe('BreathingPractice.vue', () => {
  beforeEach(() => {
    window.alert = vi.fn();
    document.body.style.overflow = '';
    localStorage.clear();
    vi.clearAllMocks();
    speakMock = vi.fn();
    stopTtsMock = vi.fn();
    loadVoicesMock = vi.fn().mockResolvedValue([]);
    setVoiceMock = vi.fn();
    setTtsEnabledMock = vi.fn();
    hasNativeSupportMock = vi.fn().mockReturnValue(false);
    lastTimerOptions = undefined;
    isNativePlatform.mockReturnValue(true);
    removeAppListener.mockResolvedValue(undefined);
    addAppListener.mockImplementation(async (_event, callback) => {
      changeAppState = callback;
      return { remove: removeAppListener };
    });
    isRunning.value = false;
    timerIsPaused.value = false;
    pauseMock.mockImplementation(() => {
      timerIsPaused.value = true;
    });
    resumeMock.mockImplementation(() => {
      timerIsPaused.value = false;
    });
    timerPhase.value = 'IDLE';
    timerCurrentTime.value = 0;
    timerTotalPhaseTime.value = 0;
    timerCurrentSet.value = 1;
    soundTheme.value = 'wood';
    setSoundThemeMock.mockImplementation((theme) => { soundTheme.value = theme; });
    getAllConfigsMock.mockReturnValue([]);
    getSessionMock.mockReturnValue({ id: 'test-session', sets: [] });
    keepAwakeMock.mockResolvedValue(undefined);
    allowSleepMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.style.overflow = '';
    vi.resetAllMocks();
  });

  it('shows a named breathing pattern and per-set timing before starting', async () => {
    const wrapper = mount(BreathingPractice);
    await flushPromises();
    const summary = wrapper.get('[data-testid="practice-panel"]');
    expect(summary.get('h2').text()).toBe('Quick Practice');
    expect(summary.findAll('dl > div').map((phase) => phase.text())).toEqual([
      'Inhale4s',
      'Exhale4s',
    ]);
    expect(summary.text()).toContain('32s / set');
    expect(summary.text()).toContain('Open-ended');
    expect(summary.find('[data-testid="phase-time"]').exists()).toBe(false);
  });

  it('consumes a preset creation request by opening settings on mount', async () => {
    const wrapper = mount(BreathingPractice, {
      props: { openSettings: true },
      attachTo: document.body,
    });
    await flushPromises();
    expect(
      document.body.querySelector('[aria-labelledby="configure-practice-title"]')
    ).not.toBeNull();
    expect(wrapper.emitted('settingsOpened')).toEqual([[]]);
    document.body
      .querySelector<HTMLButtonElement>('[data-testid="close-practice-settings"]')!
      .click();
    await nextTick();
    expect(document.body.querySelector('[aria-labelledby="configure-practice-title"]')).toBeNull();
  });

  it('preserves a saved device voice while only Kokoro is available', async () => {
    localStorage.setItem(
      'herb_breathing_last_config',
      JSON.stringify({ ttsVoice: 'saved-device', ttsEnabled: true })
    );
    loadVoicesMock.mockResolvedValue([
      {
        voiceURI: 'kokoro:af_heart',
        name: 'Kokoro Heart',
        lang: 'en-US',
        default: true,
        localService: true,
      },
    ]);
    mount(BreathingPractice);
    await flushPromises();
    expect(setVoiceMock).toHaveBeenLastCalledWith('saved-device');
  });

  it('restores the last preset when its metadata dates have been serialized', async () => {
    localStorage.setItem(
      'herb_breathing_last_config',
      JSON.stringify({
        name: 'Restored preset',
        inhaleTime: 7,
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-02T10:00:00.000Z',
      })
    );
    const wrapper = mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
    const vm = wrapper.vm as unknown as {
      config: { name: string; inhaleTime: number; createdAt: Date; updatedAt: Date };
    };
    expect(vm.config.name).toBe('Restored preset');
    expect(vm.config.inhaleTime).toBe(7);
    expect(vm.config.createdAt).toEqual(new Date('2026-10-01T10:00:00.000Z'));
    expect(vm.config.updatedAt).toEqual(new Date('2026-10-02T10:00:00.000Z'));
  });

  it('mounts with defaults when persisted practice settings cannot be read', () => {
    const read = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new Error('Storage unavailable');
    });
    try {
      const wrapper = mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
      expect(wrapper.get('[data-testid="practice-panel"]').text()).toContain('Quick Practice');
      expect(read).toHaveBeenCalledWith('herb_breathing_last_config');
    } finally {
      read.mockRestore();
    }
  });

  it('flushes valid settings when leaving before the debounce fires', async () => {
    const wrapper = mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
    const vm = wrapper.vm as unknown as { config: { inhaleTime: number } };
    vm.config.inhaleTime = 9;
    await nextTick();
    wrapper.unmount();
    expect(JSON.parse(localStorage.getItem('herb_breathing_last_config') ?? 'null')).toMatchObject({
      inhaleTime: 9,
    });
  });

  it('retains the last valid settings while a number field is invalid', async () => {
    vi.useFakeTimers();
    localStorage.setItem(
      'herb_breathing_last_config',
      JSON.stringify({ name: 'Saved', inhaleTime: 7 })
    );
    const wrapper = mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
    try {
      const vm = wrapper.vm as unknown as { config: { inhaleTime: number } };
      vm.config.inhaleTime = 0;
      await nextTick();
      vi.advanceTimersByTime(300);
      expect(JSON.parse(localStorage.getItem('herb_breathing_last_config')!)).toMatchObject({
        name: 'Saved',
        inhaleTime: 7,
      });
    } finally {
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('reports a settings write failure and lets the user retry', async () => {
    vi.useFakeTimers();
    const wrapper = mount(BreathingPractice, {
      props: { openSettings: true },
      global: { stubs: { BreathingVisualizer: true, teleport: true } },
    });
    const write = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Storage full');
    });
    try {
      const vm = wrapper.vm as unknown as { config: { inhaleTime: number } };
      vm.config.inhaleTime = 9;
      await nextTick();
      vi.advanceTimersByTime(300);
      await nextTick();
      expect(wrapper.get('[data-testid="config-save-error"]').text()).toContain(
        'could not be saved'
      );
      write.mockRestore();
      await wrapper.get('[data-testid="retry-config-save"]').trigger('click');
      expect(wrapper.find('[data-testid="config-save-error"]').exists()).toBe(false);
      expect(JSON.parse(localStorage.getItem('herb_breathing_last_config')!)).toMatchObject({
        inhaleTime: 9,
      });
    } finally {
      write.mockRestore();
      wrapper.unmount();
      vi.useRealTimers();
    }
  });

  it('lists Kokoro first even when another English default voice sorts earlier', async () => {
    loadVoicesMock.mockResolvedValue([
      {
        voiceURI: 'kokoro:af_heart',
        name: 'Kokoro Heart',
        lang: 'en-US',
        default: true,
        localService: true,
      },
      {
        voiceURI: 'kokoro:af_bella',
        name: 'Kokoro Bella',
        lang: 'en-US',
        default: false,
        localService: true,
      },
      {
        voiceURI: 'kokoro:am_michael',
        name: 'Kokoro Michael',
        lang: 'en-US',
        default: false,
        localService: true,
      },
      {
        voiceURI: 'kokoro:bf_emma',
        name: 'Kokoro Emma',
        lang: 'en-GB',
        default: false,
        localService: true,
      },
      { voiceURI: 'device:alex', name: 'Alex', lang: 'en-US', default: true, localService: true },
    ]);
    localStorage.setItem('herb_breathing_last_config', JSON.stringify({ ttsEnabled: true }));
    const wrapper = mount(BreathingPractice, { attachTo: document.body });
    await flushPromises();
    await wrapper.get('button[title="Configure practice"]').trigger('click');
    await nextTick();
    const voiceOptions = Array.from(document.body.querySelectorAll('option')).filter(
      (option) => option.value.startsWith('kokoro:') || option.value.startsWith('device:')
    );
    expect(voiceOptions.map((option) => option.value)).toEqual([
      'kokoro:af_heart',
      'kokoro:af_bella',
      'kokoro:am_michael',
      'kokoro:bf_emma',
      'device:alex',
    ]);
    const picker = document.body.querySelector<HTMLSelectElement>('#guidance-voice')!;
    expect(picker).not.toBeNull();
    picker.value = 'kokoro:af_bella';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    const preview = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Preview voice'
    );
    expect(preview).toBeDefined();
    preview!.click();
    expect(setVoiceMock).toHaveBeenLastCalledWith('kokoro:af_bella');
    expect(speakMock).toHaveBeenLastCalledWith('Full Breath In');
  });

  it('calls start when Start button clicked', async () => {
    isRunning.value = false;
    createSessionMock.mockReturnValue({ id: 'sess-start', sets: [] });
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
    });
    const buttons = wrapper.findAll('button');
    const startBtn = buttons.find((b) => b.text().toLowerCase().includes('start'));
    expect(startBtn).toBeTruthy();
    await startBtn!.trigger('click');
    // Resolve the optional pre-session check-in before the timer starts.
    await nextTick();
    const skipCheckIn = document.body.querySelector<HTMLElement>('[data-testid="checkin-skip"]');
    expect(skipCheckIn).not.toBeNull();
    skipCheckIn?.click();
    await nextTick();
    expect(startMock).toHaveBeenCalled();
  });

  it('exposes named toggle buttons with an updated pressed state', async () => {
    mount(BreathingPractice, { props: { openSettings: true }, attachTo: document.body });
    await flushPromises();
    const settings = page.get(settingsSelector);

    for (const [label, initial] of [
      ['Enable Extended Hold', false],
      ['Second Extended Hold', false],
      ['Metronome', true],
      ['Voice guidance (TTS)', false],
    ] as const) {
      const toggle = settings.get(`button[type="button"][aria-label="${label}"]`);
      expect(toggle.attributes('role')).toBeUndefined();
      expect(toggle.attributes('aria-pressed')).toBe(String(initial));
      await toggle.trigger('click');
      expect(toggle.attributes('aria-pressed')).toBe(String(!initial));
    }
  });

  it('calls pause when Pause button clicked', async () => {
    isRunning.value = true;
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
      attachTo: document.body,
    });
    await nextTick();

    // The pause button is in the fullscreen modal teleported to body
    // Use a more specific selector to find the Pause button by its text content
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-testid="session-dialog"] button'));
    const pauseBtn = buttons.find((btn) => btn.textContent?.trim() === 'Pause')!;

    expect(pauseBtn).toBeTruthy();
    stopTtsMock.mockClear();
    pauseBtn.click();
    await nextTick();
    expect(pauseMock).toHaveBeenCalledOnce();
    expect(stopTtsMock).toHaveBeenCalledOnce();

    wrapper.unmount();
  });

  it('pauses an active practice on backgrounding and preserves it for explicit resume', async () => {
    const setSoundEnabled = vi.spyOn(soundService, 'setEnabled');
    const activeSession = { id: 'session-mobile', sets: [] };
    createSessionMock.mockReturnValueOnce(activeSession);
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref(null),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
      attachTo: document.body,
    });

    await wrapper
      .findAll('button')
      .find((button) => button.text().toLowerCase().includes('start'))!
      .trigger('click');
    await nextTick();
    const skipCheckIn = document.body.querySelector<HTMLElement>('[data-testid="checkin-skip"]');
    expect(skipCheckIn).not.toBeNull();
    skipCheckIn?.click();
    await nextTick();
    isRunning.value = true;
    await nextTick();

    expect(addAppListener).toHaveBeenCalledExactlyOnceWith('appStateChange', expect.any(Function));
    stopTtsMock.mockClear();
    changeAppState({ isActive: false });
    await nextTick();

    expect(pauseMock).toHaveBeenCalledOnce();
    expect(stopTtsMock).toHaveBeenCalled();
    expect(setSoundEnabled).toHaveBeenLastCalledWith(false);
    setSoundEnabled.mockRestore();
    expect(timerIsPaused.value).toBe(true);
    expect((wrapper.vm as unknown as { currentSession: unknown }).currentSession).toEqual(
      activeSession
    );
    expect(cancelSessionMock).not.toHaveBeenCalled();
    expect(completeSessionMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Resume');

    changeAppState({ isActive: true });
    changeAppState({ isActive: false });
    expect(pauseMock).toHaveBeenCalledOnce();
    expect(resumeMock).not.toHaveBeenCalled();

    isRunning.value = false;
    wrapper.unmount();
    await flushPromises();
    expect(removeAppListener).toHaveBeenCalledOnce();
  });

  it('does not bind native app state events or pause on browser visibility changes', async () => {
    isNativePlatform.mockReturnValue(false);
    mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
    isRunning.value = true;
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await nextTick();
      expect(addAppListener).not.toHaveBeenCalled();
      expect(pauseMock).not.toHaveBeenCalled();
    } finally {
      visibility.mockRestore();
      isRunning.value = false;
    }
  });

  it('reconciles to asleep when backgrounding occurs while keep-awake is still pending', async () => {
    let resolveKeepAwake!: () => void;
    keepAwakeMock.mockReturnValueOnce(
      new Promise<void>((resolve) => {
        resolveKeepAwake = resolve;
      })
    );
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref(null),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
    });

    isRunning.value = true;
    await nextTick();
    expect(keepAwakeMock).toHaveBeenCalledOnce();

    changeAppState({ isActive: false });
    await nextTick();
    expect(timerIsPaused.value).toBe(true);
    expect(allowSleepMock).not.toHaveBeenCalled();

    resolveKeepAwake();
    await flushPromises();

    expect(allowSleepMock).toHaveBeenCalledOnce();
    wrapper.unmount();
  });

  it('presents a focused modal session and hides background controls while running', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Start trigger';
    document.body.appendChild(trigger);
    trigger.focus();

    isRunning.value = false;
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
      attachTo: document.body,
    });

    isRunning.value = true;
    await nextTick();
    await nextTick();

    const sessionDialog = document.activeElement as HTMLElement;
    expect(sessionDialog).toBeTruthy();
    expect(sessionDialog.dataset.testid).toBe('session-dialog');
    expect(sessionDialog.getAttribute('role')).toBe('dialog');
    expect(sessionDialog.getAttribute('aria-modal')).toBe('true');
    expect(wrapper.attributes('inert')).toBe('');
    expect(wrapper.attributes('aria-hidden')).toBe('true');
    expect(document.activeElement).toBe(sessionDialog);
    expect(document.body.style.overflow).toBe('hidden');

    isRunning.value = false;
    await nextTick();
    await nextTick();

    expect(wrapper.attributes('inert')).toBeUndefined();
    expect(wrapper.attributes('aria-hidden')).toBeUndefined();
    expect(document.body.style.overflow).toBe('');
    expect(document.activeElement).toBe(trigger);

    wrapper.unmount();
    trigger.remove();
  });

  it('labels the stop confirmation as an alert dialog and focuses the safe action', async () => {
    isRunning.value = true;
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
      attachTo: document.body,
    });
    await nextTick();

    (wrapper.vm as unknown as { confirmExit: () => void }).confirmExit();
    await nextTick();
    await nextTick();

    const cancel = document.activeElement as HTMLButtonElement;
    const confirmation = cancel.closest('[data-testid="stop-confirmation"]') as HTMLElement;
    expect(cancel.dataset.testid).toBe('cancel-stop');
    expect(confirmation.getAttribute('role')).toBe('alertdialog');
    expect(confirmation.getAttribute('aria-modal')).toBe('true');
    expect(confirmation.getAttribute('aria-labelledby')).toBe('stop-session-title');
    expect(cancel).toBeTruthy();

    wrapper.unmount();
  });

  it('keeps the completion view visible after the timer stops running', async () => {
    isRunning.value = false;
    timerPhase.value = 'SESSION_COMPLETE';
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
      attachTo: document.body,
    });
    await nextTick();

    const sessionDialog = document.body.querySelector('[data-testid="session-dialog"]');
    expect(sessionDialog).toBeTruthy();
    expect(sessionDialog?.textContent).toContain('Session Complete!');

    wrapper.unmount();
  });

  it('opens the safe stop confirmation when Escape is pressed during a session', async () => {
    isRunning.value = true;
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
      attachTo: document.body,
    });
    await nextTick();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();
    await nextTick();

    const confirmation = document.body.querySelector(
      '[data-testid="stop-confirmation"]'
    ) as HTMLElement;
    expect(confirmation.style.display).not.toBe('none');
    expect((document.activeElement as HTMLElement).dataset.testid).toBe('cancel-stop');

    wrapper.unmount();
  });

  it('routes system Back through the visible practice layer before closing the session', async () => {
    isRunning.value = true;
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
      attachTo: document.body,
    });
    await nextTick();

    const vm = wrapper.vm as unknown as {
      handleSystemBack: () => boolean;
      showStopConfirmation: boolean;
    };
    expect(vm.handleSystemBack()).toBe(true);
    await nextTick();
    expect(vm.showStopConfirmation).toBe(true);

    expect(vm.handleSystemBack()).toBe(true);
    await nextTick();
    expect(vm.showStopConfirmation).toBe(false);

    wrapper.unmount();
  });

  it('applies safe-area padding to the full-screen practice dialog', async () => {
    isRunning.value = true;
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
      attachTo: document.body,
    });
    await nextTick();

    const dialog = document.body.querySelector('[data-testid="session-dialog"]');
    expect(dialog?.classList.contains('safe-area-top')).toBe(true);
    expect(dialog?.classList.contains('safe-area-bottom')).toBe(true);

    wrapper.unmount();
  });

  it('resets session notes when starting a new session', async () => {
    isRunning.value = false;
    createSessionMock.mockReturnValue({ id: 'sess-notes', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
    });

    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { sessionNotes?: string }).sessionNotes = 'Old notes';
    await nextTick();

    (vm as { startExercise?: () => void }).startExercise?.();
    (vm as { continueSessionStart?: () => void }).continueSessionStart?.();
    await nextTick();

    expect((vm as { sessionNotes?: string }).sessionNotes).toBe('');
    wrapper.unmount();
  });

  it('blocks session creation when the current breathing settings are invalid', async () => {
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });
    const vm = wrapper.vm as unknown as {
      config: { inhaleTime: number };
      configValidationError: string;
      startExercise: () => void;
    };
    vm.config.inhaleTime = 0;
    await nextTick();

    vm.startExercise();

    expect(vm.configValidationError).toContain('Inhale time');
    expect(createSessionMock).not.toHaveBeenCalled();
    expect(startMock).not.toHaveBeenCalled();
  });

  it('records repetitions, timed holds, completed sets, and session completion', async () => {
    const session = { id: 'session-recording', sets: [] };
    createSessionMock.mockReturnValue(session);
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });
    const vm = wrapper.vm as unknown as {
      config: { extendedHoldMode: string; extendedHoldDuration: number };
      currentSetData: {
        completedRepetitions: number;
        extendedHolds: Array<Record<string, unknown>>;
      };
      finishSession: () => void;
      startExercise: () => void;
      continueSessionStart: () => void;
    };
    vm.config.extendedHoldMode = 'TIMED';
    vm.config.extendedHoldDuration = 25;
    vm.startExercise();
    vm.continueSessionStart();

    const onRepetitionComplete = lastTimerOptions?.onRepetitionComplete as (rep: number) => void;
    const onExtendedHoldEnd = lastTimerOptions?.onExtendedHoldEnd as (
      duration: number,
      type: string
    ) => void;
    const onSetComplete = lastTimerOptions?.onSetComplete as () => void;
    const onSessionComplete = lastTimerOptions?.onSessionComplete as () => void;
    onRepetitionComplete(4);
    onExtendedHoldEnd(24.6, 'EXHALE');
    onSetComplete();
    timerPhase.value = 'SESSION_COMPLETE';
    onSessionComplete();
    const completedSet = vm.currentSetData;
    vm.finishSession();

    expect(completedSet.completedRepetitions).toBe(4);
    expect(completedSet.extendedHolds[0]).toMatchObject({
      type: 'EXHALE',
      mode: 'TIMED',
      targetDuration: 25,
      actualDuration: 24.6,
    });
    expect(addSetMock).toHaveBeenCalledWith(
      'session-recording',
      expect.objectContaining({ completedRepetitions: 4 })
    );
    expect(completeSessionMock).toHaveBeenCalledOnce();
    expect(completeSessionMock).toHaveBeenCalledWith('session-recording');
  });

  it('persists a partial set before marking an interrupted session cancelled', () => {
    createSessionMock.mockReturnValue({ id: 'session-partial', sets: [] });
    getSessionMock.mockReturnValue({ id: 'session-partial', sets: [] });
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });
    const vm = wrapper.vm as unknown as {
      currentSetData: { completedRepetitions: number };
      startExercise: () => void;
      continueSessionStart: () => void;
      saveIncompleteSession: () => void;
    };
    vm.startExercise();
    vm.continueSessionStart();
    vm.currentSetData.completedRepetitions = 2;

    vm.saveIncompleteSession();

    expect(addSetMock).toHaveBeenCalledWith(
      'session-partial',
      expect.objectContaining({ setNumber: 1, completedRepetitions: 2 })
    );
    expect(cancelSessionMock).toHaveBeenCalledWith('session-partial');
    expect(stopMock).toHaveBeenCalled();
  });

  it('discards the session record when the user exits without saving', () => {
    createSessionMock.mockReturnValue({ id: 'session-discarded', sets: [] });
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });
    const vm = wrapper.vm as unknown as {
      startExercise: () => void;
      continueSessionStart: () => void;
      exitWithoutSavingSession: () => void;
    };
    vm.startExercise();
    vm.continueSessionStart();

    vm.exitWithoutSavingSession();

    expect(deleteSessionMock).toHaveBeenCalledWith('session-discarded');
    expect(cancelSessionMock).not.toHaveBeenCalled();
    expect(stopMock).toHaveBeenCalled();
  });

  it('requires confirmation before replacing a preset with the same name', async () => {
    getAllConfigsMock.mockReturnValue([{ id: 'preset-old', name: 'Evening Reset' }]);
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });
    const vm = wrapper.vm as unknown as {
      config: { id?: string; createdAt?: Date; updatedAt?: Date };
      configName: string;
      showOverwriteConfirmation: boolean;
      saveConfig: () => void;
      confirmOverwrite: () => void;
    };
    vm.config.id = '11111111-1111-4111-8111-111111111111';
    vm.config.createdAt = new Date('2026-07-19T08:00:00.000Z');
    vm.config.updatedAt = new Date('2026-07-20T08:00:00.000Z');
    vm.configName = ' evening reset ';

    vm.saveConfig();
    expect(vm.showOverwriteConfirmation).toBe(true);
    expect(createConfigMock).not.toHaveBeenCalled();

    vm.confirmOverwrite();
    expect(updateConfigMock).toHaveBeenCalledWith(
      'preset-old',
      expect.objectContaining({ name: 'evening reset' })
    );
    expect(deleteConfigMock).not.toHaveBeenCalled();
    expect(createConfigMock).not.toHaveBeenCalled();
    const updatePayload = updateConfigMock.mock.calls[0]?.[1];
    expect(updatePayload).not.toHaveProperty('id');
    expect(updatePayload).not.toHaveProperty('createdAt');
    expect(updatePayload).not.toHaveProperty('updatedAt');
  });

  it('keeps practice active when the stop confirmation is cancelled', async () => {
    isRunning.value = true;
    timerPhase.value = 'INHALE';
    mount(BreathingPractice, { attachTo: document.body, global: { stubs: ['BreathingVisualizer'] } });
    await nextTick();

    const session = page.get('[data-testid="session-dialog"]');
    await session.get('[data-testid="session-header-exit"]').trigger('click');
    await page.get('[data-testid="cancel-stop"]').trigger('click');

    expect(page.find('[data-testid="stop-confirmation"]').exists()).toBe(false);
    expect(page.find('[data-testid="session-dialog"]').exists()).toBe(true);
    expect(stopMock).not.toHaveBeenCalled();
    expect(cancelSessionMock).not.toHaveBeenCalled();
    expect(deleteSessionMock).not.toHaveBeenCalled();
  });

  it('Start Next Set button calls timer.nextSet when in SET_COMPLETE', async () => {
    const wrapper = mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
    timerPhase.value = 'SET_COMPLETE';
    isRunning.value = true;
    await nextTick();
    const button = Array.from(document.body.querySelectorAll('button')).find((element) =>
      element.textContent?.includes('Start Next Set')
    );
    expect(button).toBeDefined();
    button!.click();
    await nextTick();
    expect(nextSetMock).toHaveBeenCalledOnce();
    expect(
      (wrapper.vm as unknown as { currentSetData: { setNumber: number } }).currentSetData
    ).toMatchObject({ setNumber: 2, completedRepetitions: 0, extendedHolds: [] });
  });

  it('shows configured rest countdown with an early next-set action', async () => {
    const wrapper = mount(BreathingPractice, {
      attachTo: document.body,
      global: { stubs: ['BreathingVisualizer'] },
    });
    timerPhase.value = 'SET_REST';
    timerCurrentTime.value = 42;
    timerTotalPhaseTime.value = 60;
    isRunning.value = true;

    await nextTick();

    expect(document.body.textContent).toContain('Rest between sets');
    expect(document.body.textContent).toContain('42');
    const nextButton = Array.from(document.body.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Start next set now')
    );
    expect(nextButton).toBeDefined();
    nextButton!.click();
    await nextTick();
    expect(nextSetMock).toHaveBeenCalledOnce();
    isRunning.value = false;
    wrapper.unmount();
  });

  it('exposes a bounded rest-between-sets configuration field', async () => {
    const wrapper = mount(BreathingPractice, { attachTo: document.body });
    const vm = wrapper.vm as unknown as { showConfigModal: boolean };
    vm.showConfigModal = true;
    await nextTick();

    const input = document.body.querySelector(
      'input[name="restBetweenSetsSeconds"]'
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(input?.min).toBe('0');
    expect(input?.max).toBe('600');
    expect(document.body.textContent).toContain('0 waits for you to start the next set');

    wrapper.unmount();
  });

  it('warns accessibly when the preset name is empty', async () => {
    mount(BreathingPractice, { props: { openSettings: true }, attachTo: document.body });
    await flushPromises();

    await buttonWithText(page.get(settingsSelector), 'Save Preset').trigger('click');

    const alert = page.get('[role="alert"]');
    expect(alert.text()).toContain('Please enter a preset name.');
    expect(alert.get('svg').classes()).toContain('text-clay');
    expect(createConfigMock).not.toHaveBeenCalled();
  });

  it.each(['create', 'overwrite'])('reports a %s failure with error tone and keeps settings open for retry', async (operation) => {
    const save = operation === 'create' ? createConfigMock : updateConfigMock;
    save.mockImplementationOnce(() => { throw new Error('Storage full'); });
    if (operation === 'overwrite') getAllConfigsMock.mockReturnValue([{ id: 'existing', name: 'Evening Reset' }]);
    mount(BreathingPractice, { props: { openSettings: true }, attachTo: document.body });
    await flushPromises();

    const settings = page.get(settingsSelector);
    await settings.get('input[aria-label="Preset name"]').setValue('Evening Reset');
    await buttonWithText(settings, 'Save Preset').trigger('click');
    if (operation === 'overwrite') {
      await buttonWithText(page.get('[aria-labelledby="overwrite-preset-title"]'), 'Overwrite').trigger('click');
    }

    expect(save).toHaveBeenCalledOnce();
    const alert = page.get('[role="alert"]');
    expect(alert.text()).toContain('Your preset could not be saved.');
    expect(alert.get('svg').classes()).toContain('text-danger');
    expect(page.find('[role="status"]').exists()).toBe(false);

    await buttonWithText(alert, 'OK').trigger('click');
    await nextTick();
    expect(page.get(settingsSelector).get('input[aria-label="Preset name"]').element).toHaveProperty('value', 'Evening Reset');
  });

  it('traps focus in the top confirmation and restores it when Escape closes each layer', async () => {
    getAllConfigsMock.mockReturnValue([{ id: 'existing', name: 'Evening Reset' }]);
    const wrapper = mount(BreathingPractice, { attachTo: document.body });
    const trigger = wrapper.get<HTMLButtonElement>('button[aria-label="Configure practice"]');
    trigger.element.focus();
    await trigger.trigger('click');
    await nextTick();
    const settings = page.get(settingsSelector);
    expect(document.activeElement).toBe(settings.get('[data-testid="close-practice-settings"]').element);
    expect(trigger.element.closest('[inert]')).not.toBeNull();

    await settings.get('input[aria-label="Preset name"]').setValue('Evening Reset');
    const save = buttonWithText(settings, 'Save Preset');
    save.element.focus();
    await save.trigger('click');
    await nextTick();

    const confirmation = page.get('[aria-labelledby="overwrite-preset-title"]');
    const cancel = buttonWithText(confirmation, 'Cancel');
    const overwrite = buttonWithText(confirmation, 'Overwrite');
    expect(document.activeElement).toBe(cancel.element);
    expect(settings.attributes('inert')).toBeDefined();
    await cancel.trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(overwrite.element);
    await overwrite.trigger('keydown', { key: 'Escape' });
    expect(page.find('[aria-labelledby="overwrite-preset-title"]').exists()).toBe(false);
    expect(document.activeElement).toBe(save.element);

    await save.trigger('keydown', { key: 'Escape' });
    expect(page.find(settingsSelector).exists()).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
    expect(trigger.element.closest('[inert]')).toBeNull();
    expect(updateConfigMock).not.toHaveBeenCalled();
  });

  it.each([
    [' ', 'EXTENDED_EXHALE_HOLD'],
    ['Enter', 'EXTENDED_INHALE_HOLD'],
  ])('releases a tolerance hold with %j when the session dialog has focus', async (key, phase) => {
    isRunning.value = true;
    timerPhase.value = phase;
    const wrapper = mount(BreathingPractice, { attachTo: document.body });
    await flushPromises();
    const dialog = page.get('[data-testid="session-dialog"]');
    expect(document.activeElement).toBe(dialog.element);
    expect(dialog.get('button[aria-label^="Release hold"]').text()).toContain('Release Hold');

    const keyboard = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    dialog.element.dispatchEvent(keyboard);
    expect(keyboard.defaultPrevented).toBe(true);
    expect(endExtendedHoldMock).toHaveBeenCalledOnce();

    const removeListener = vi.spyOn(window, 'removeEventListener');
    wrapper.unmount();
    expect(removeListener).toHaveBeenCalledWith('keydown', expect.any(Function));
    removeListener.mockRestore();
  });

  it('leaves keys alone on interactive controls, while paused, or with a stop confirmation open', async () => {
    isRunning.value = true;
    timerPhase.value = 'EXTENDED_EXHALE_HOLD';
    mount(BreathingPractice, { attachTo: document.body });
    await flushPromises();
    const dialog = page.get('[data-testid="session-dialog"]');
    const release = dialog.get('button[aria-label^="Release hold"]');
    const exit = dialog.get('[data-testid="session-header-exit"]');

    await release.trigger('keydown', { key: 'Enter' });
    await exit.trigger('keydown', { key: ' ' });
    timerIsPaused.value = true;
    await dialog.trigger('keydown', { key: 'Enter' });
    timerIsPaused.value = false;

    await exit.trigger('click');
    await nextTick();
    const stop = page.get('[data-testid="stop-confirmation"]');
    expect(dialog.attributes('inert')).toBeDefined();
    await stop.trigger('keydown', { key: 'Enter' });
    expect(endExtendedHoldMock).not.toHaveBeenCalled();
    await stop.get('[data-testid="cancel-stop"]').trigger('keydown', { key: 'Escape' });
    expect(page.find('[data-testid="stop-confirmation"]').exists()).toBe(false);
    expect(dialog.attributes('inert')).toBeUndefined();
    await release.trigger('click');
    expect(endExtendedHoldMock).toHaveBeenCalledOnce();
  });

  it('reports a discard failure and lets the active session be discarded on retry', async () => {
    localStorage.setItem(SKIP_CHECK_INS_STORAGE_KEY, 'true');
    createSessionMock.mockReturnValue({ id: 'active', sets: [] });
    deleteSessionMock.mockImplementationOnce(() => { throw new Error('Storage full'); });
    const wrapper = mount(BreathingPractice, { attachTo: document.body });
    await buttonWithText(wrapper.get('[data-testid="practice-panel"]'), 'Start Practice').trigger('click');
    isRunning.value = true;
    timerPhase.value = 'INHALE';
    await nextTick();
    const dialog = page.get('[data-testid="session-dialog"]');

    await dialog.get('[data-testid="session-header-exit"]').trigger('click');
    await buttonWithText(page.get('[data-testid="stop-confirmation"]'), 'Exit').trigger('click');
    const alert = page.get('[role="alert"]');
    expect(alert.text()).toContain('This session could not be deleted.');
    expect(stopMock).not.toHaveBeenCalled();
    await buttonWithText(alert, 'OK').trigger('click');
    await dialog.get('[data-testid="session-header-exit"]').trigger('click');
    await buttonWithText(page.get('[data-testid="stop-confirmation"]'), 'Exit').trigger('click');
    expect(deleteSessionMock.mock.calls).toEqual([['active'], ['active']]);
    expect(stopMock).toHaveBeenCalledOnce();
  });

  describe('BreathingPractice TIMED extended hold and stopExercise', () => {
    beforeEach(() => {
      createSessionMock.mockReset();
      addSetMock.mockReset();
      addExtendedHoldMock.mockReset();
      completeSessionMock.mockReset();
      cancelSessionMock.mockReset();
      updateSessionMock.mockReset();
      createConfigMock.mockReset();
    });

    it('records both timed hold targets and actual durations in the saved set', async () => {
      createSessionMock.mockReturnValue({ id: 'sess-100', sets: [] });
      const wrapper = mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
      const vm = wrapper.vm as unknown as {
        config: {
          extendedHoldEnabled: boolean;
          extendedHoldMode: string;
          extendedHoldDuration: number;
          secondExtendedHoldEnabled: boolean;
          secondExtendedHoldMode: string;
          secondExtendedHoldDuration: number;
        };
        timer: { isFirstExtendedHold: { value: boolean } };
        startExercise: () => void;
        continueSessionStart: () => void;
      };
      Object.assign(vm.config, {
        extendedHoldEnabled: true,
        extendedHoldMode: 'TIMED',
        extendedHoldDuration: 20,
        secondExtendedHoldEnabled: true,
        secondExtendedHoldMode: 'TIMED',
        secondExtendedHoldDuration: 7,
      });
      vm.startExercise();
      vm.continueSessionStart();
      const onHoldEnd = lastTimerOptions!.onExtendedHoldEnd as (
        duration: number,
        type: string
      ) => void;
      onHoldEnd(12.5, 'EXHALE');
      vm.timer.isFirstExtendedHold.value = false;
      onHoldEnd(7, 'INHALE');
      (lastTimerOptions!.onSetComplete as () => void)();
      expect(addSetMock).toHaveBeenCalledWith(
        'sess-100',
        expect.objectContaining({
          extendedHolds: [
            expect.objectContaining({
              mode: 'TIMED',
              type: 'EXHALE',
              targetDuration: 20,
              actualDuration: 12.5,
            }),
            expect.objectContaining({
              mode: 'TIMED',
              type: 'INHALE',
              targetDuration: 7,
              actualDuration: 7,
            }),
          ],
        })
      );
    });

    it('stopExercise stops the timer and clears active session data', async () => {
      createSessionMock.mockReturnValue({ id: 'sess-101', sets: [] });
      const wrapper = mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
      const vm = wrapper.vm as unknown as {
        startExercise: () => void;
        continueSessionStart: () => void;
        stopExercise: () => void;
        currentSession: { id: string } | null;
        currentSetData: unknown;
        sessionNotes: string;
      };
      vm.startExercise();
      vm.continueSessionStart();
      expect(vm.currentSession?.id).toBe('sess-101');
      vm.sessionNotes = 'Partial practice';
      vm.stopExercise();
      expect(stopMock).toHaveBeenCalledOnce();
      expect(vm.currentSession).toBeNull();
      expect(vm.currentSetData).toBeNull();
      expect(vm.sessionNotes).toBe('');
    });

    it('applies selectedConfig from provide and calls clearSelectedConfig', async () => {
      localStorage.setItem(
        'herb_breathing_last_config',
        JSON.stringify({ name: 'Previous routine', inhaleTime: 9, ttsVoice: 'kokoro:bf_emma' })
      );
      const preset = { name: 'Preset A', inhaleTime: 3 };
      const clearMock = vi.fn();
      const wrapper = mount(BreathingPractice, {
        global: {
          provide: { selectedConfig: ref(preset), clearSelectedConfig: clearMock },
          stubs: ['BreathingVisualizer'],
        },
      });

      await flushPromises();
      const panel = wrapper.get('[data-testid="practice-panel"]');
      expect(panel.get('h2').text()).toBe('Preset A');
      expect(panel.findAll('dl > div')[0].text()).toBe('Inhale3s');
      expect(setVoiceMock).toHaveBeenLastCalledWith('kokoro:bf_emma');
      expect(clearMock).toHaveBeenCalled();
    });

    it('configures the second hold mode and saves a timed duration', async () => {
      mount(BreathingPractice, { props: { openSettings: true }, attachTo: document.body });
      await flushPromises();
      const settings = page.get(settingsSelector);
      expect(settings.find('#second-hold-mode').exists()).toBe(false);

      await settings.get('button[aria-label="Enable Extended Hold"]').trigger('click');
      await settings.get('button[aria-label="Second Extended Hold"]').trigger('click');
      const mode = settings.get('#second-hold-mode');
      expect(settings.get('label[for="second-hold-mode"]').text()).toBe('Second Hold Mode');
      await mode.setValue('TOLERANCE');
      expect(settings.find('#second-hold-duration').exists()).toBe(false);
      await mode.setValue('TIMED');
      const duration = settings.get('#second-hold-duration');
      expect(settings.get('label[for="second-hold-duration"]').text()).toBe('Second Hold Duration (sec)');
      expect(duration.attributes()).toMatchObject({ type: 'number', min: '1', max: '300' });
      await duration.setValue('37');
      await settings.get('input[aria-label="Preset name"]').setValue('Two holds');
      await buttonWithText(settings, 'Save Preset').trigger('click');

      expect(createConfigMock).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        name: 'Two holds',
        secondExtendedHoldEnabled: true,
        secondExtendedHoldMode: 'TIMED',
        secondExtendedHoldDuration: 37,
      }));
    });

    it('saves a trimmed custom preset name and the selected theme in both saved configurations', async () => {
      const setTheme = vi.spyOn(soundService, 'setTheme');
      const preset = { ...DEFAULT_BREATHING_CONFIG, name: 'Preset A', soundTheme: 'wind' as const };
      const wrapper = mount(BreathingPractice, {
        props: { openSettings: true },
        global: { provide: { selectedConfig: ref(preset) } },
        attachTo: document.body,
      });
      await flushPromises();
      const settings = page.get(settingsSelector);
      const theme = settings.get('#sound-theme');
      expect(setSoundThemeMock).toHaveBeenCalledWith('wind');
      expect(setTheme).toHaveBeenCalledWith('wind');
      expect(theme.element).toHaveProperty('value', 'wind');

      await theme.setValue('water');
      await settings.get('input[aria-label="Preset name"]').setValue('  Evening Reset  ');
      await buttonWithText(settings, 'Save Preset').trigger('click');

      expect(createConfigMock).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
        name: 'Evening Reset',
        soundTheme: 'water',
      }));
      const status = page.get('[role="status"]');
      expect(status.text()).toContain('Configuration saved!');
      expect(status.get('svg').classes()).toContain('text-sage');

      wrapper.unmount();
      expect(JSON.parse(localStorage.getItem(LAST_CONFIG_STORAGE_KEY)!)).toMatchObject({ soundTheme: 'water' });
      setTheme.mockRestore();
    });

    it('saves session notes from the completion dialog and supports retry after a write failure', async () => {
      localStorage.setItem(SKIP_CHECK_INS_STORAGE_KEY, 'true');
      createSessionMock.mockReturnValue({ id: 'with-notes', sets: [] });
      updateSessionMock.mockImplementationOnce(() => { throw new Error('Storage full'); });
      const wrapper = mount(BreathingPractice, { attachTo: document.body });
      await buttonWithText(wrapper.get('[data-testid="practice-panel"]'), 'Start Practice').trigger('click');
      timerPhase.value = 'SESSION_COMPLETE';
      await nextTick();

      const dialog = page.get('[data-testid="session-dialog"]');
      expect(page.findAll('#session-notes')).toHaveLength(1);
      await dialog.get('#session-notes').setValue('The second set felt more comfortable.');
      const save = buttonWithText(dialog, 'Save Notes');
      await save.trigger('click');
      const alert = page.get('[role="alert"]');
      expect(alert.text()).toContain('Your session notes could not be saved.');
      await buttonWithText(alert, 'OK').trigger('click');
      await save.trigger('click');

      const write = ['with-notes', { notes: 'The second set felt more comfortable.' }];
      expect(updateSessionMock.mock.calls).toEqual([write, write]);
      expect(page.get('[role="status"]').text()).toContain('Notes saved!');
    });

    it('announces phases when TTS enabled', async () => {
      isRunning.value = false;
      const wrapper = mount(BreathingPractice, {
        global: {
          provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
          stubs: ['BreathingVisualizer'],
        },
      });

      const vm = wrapper.vm as unknown as Record<string, unknown>;
      (vm as { config: { ttsEnabled: boolean } }).config.ttsEnabled = true;
      await nextTick();

      const onPhaseChange = lastTimerOptions?.onPhaseChange as
        ((phase: string, state: unknown) => void) | undefined;
      expect(onPhaseChange).toBeDefined();
      onPhaseChange?.('INHALE', { currentTime: 2, totalPhaseTime: 4 });
      expect(speakMock).toHaveBeenCalledWith('Full Breath In', { targetDurationSeconds: 2 });

      wrapper.unmount();
    });
  });

  it('shows Lab CTA when no HRV data exists', async () => {
    localStorage.removeItem('lab-cta-dismissed');
    hasAnyMeasurementsMock.mockResolvedValue(false);

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref(null),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
    });

    // Wait for async onMounted to resolve
    await nextTick();
    await nextTick();
    await new Promise((r) => setTimeout(r, 10));
    await nextTick();

    expect(wrapper.text()).toContain('Explore Pulse Variability');
    wrapper.unmount();
  });

  it('persists Lab CTA dismissal so it stays out of the training flow', async () => {
    hasAnyMeasurementsMock.mockResolvedValue(false);
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });
    await flushPromises();
    const vm = wrapper.vm as unknown as { dismissLabCta: () => void; showLabCta: boolean };
    expect(vm.showLabCta).toBe(true);

    vm.dismissLabCta();

    expect(vm.showLabCta).toBe(false);
    expect(localStorage.getItem('lab-cta-dismissed')).toBe('true');
  });
});
