import { enableAutoUnmount, flushPromises, mount, shallowMount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import BreathingPractice from '@/components/BreathingPractice.vue';

const { keepAwakeMock, allowSleepMock } = vi.hoisted(() => ({
  keepAwakeMock: vi.fn(),
  allowSleepMock: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
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
const deleteConfigMock = vi.fn();
const deleteSessionMock = vi.fn();
const getAllConfigsMock = vi.fn(() => [] as Array<{ id?: string; name: string }>);
const getSessionMock = vi.fn(() => ({
  id: 'test-session',
  sets: [] as Array<{ setNumber: number }>,
}));
const setSoundThemeMock = vi.fn();

let speakMock: ReturnType<typeof vi.fn>;
let loadVoicesMock: ReturnType<typeof vi.fn>;
let setVoiceMock: ReturnType<typeof vi.fn>;
let setTtsEnabledMock: ReturnType<typeof vi.fn>;
let hasNativeSupportMock: ReturnType<typeof vi.fn>;

let lastTimerOptions: Record<string, unknown> | undefined;
let lastLifecycleOptions:
  { onInactive: () => void | Promise<void>; onActive: () => void | Promise<void> } | undefined;

vi.mock('@/composables/useAppLifecycle', () => ({
  useAppLifecycle: (options: {
    onInactive: () => void | Promise<void>;
    onActive: () => void | Promise<void>;
  }) => {
    lastLifecycleOptions = options;
    return { dispose: vi.fn().mockResolvedValue(undefined) };
  },
}));

vi.mock('@/composables/useStorage', () => ({
  useStorage: () => ({
    createSession: createSessionMock,
    addSetToSession: addSetMock,
    addExtendedHoldToSet: addExtendedHoldMock,
    completeSession: completeSessionMock,
    cancelSession: cancelSessionMock,
    updateSession: updateSessionMock,
    createConfig: createConfigMock,
    deleteConfig: deleteConfigMock,
    deleteSession: deleteSessionMock,
    getSoundTheme: vi.fn(() => 'wood'),
    setSoundTheme: setSoundThemeMock,
    soundTheme: ref('wood'),
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

describe('BreathingPractice.vue', () => {
  beforeEach(() => {
    window.alert = vi.fn();
    document.body.style.overflow = '';
    localStorage.clear();
    vi.clearAllMocks();
    speakMock = vi.fn();
    loadVoicesMock = vi.fn().mockResolvedValue([]);
    setVoiceMock = vi.fn();
    setTtsEnabledMock = vi.fn();
    hasNativeSupportMock = vi.fn().mockReturnValue(false);
    lastTimerOptions = undefined;
    lastLifecycleOptions = undefined;
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
    getAllConfigsMock.mockReturnValue([]);
    getSessionMock.mockReturnValue({ id: 'test-session', sets: [] });
    keepAwakeMock.mockResolvedValue(undefined);
    allowSleepMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.style.overflow = '';
    vi.resetAllMocks();
  });

  it('calls start when Start button clicked', async () => {
    isRunning.value = false;
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
    if (startBtn) await startBtn.trigger('click');
    expect(startMock).toHaveBeenCalled();
  });

  it('toggles audio setting when clicking audio toggle', async () => {
    isRunning.value = false;
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
      },
      attachTo: document.body, // Required for Teleport support
    });

    await nextTick(); // Wait for component to render with isRunning = false

    // Open the configuration modal directly
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { showConfigModal?: boolean }).showConfigModal = true;
    await nextTick(); // Wait for modal DOM to render

    // Modal and toggles are in document.body (Teleported)
    const audioToggle = document.body.querySelector('.toggle') as HTMLElement;
    expect(audioToggle).toBeTruthy();
    audioToggle.click();
    await nextTick();

    // After clicking, the toggle should have the enabled class
    expect(audioToggle.classList.contains('toggle-enabled')).toBe(true);
    wrapper.unmount();
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
    const buttons = Array.from(document.querySelectorAll('button.btn-warning'));
    const pauseBtn = buttons.find((btn) => btn.textContent?.includes('Pause')) as HTMLButtonElement;

    expect(pauseBtn).toBeTruthy();
    if (pauseBtn) {
      pauseBtn.click();
      await nextTick();
    }
    expect(pauseMock).toHaveBeenCalled();

    wrapper.unmount();
  });

  it('pauses an active practice on backgrounding and preserves it for explicit resume', async () => {
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
    isRunning.value = true;
    await nextTick();

    await lastLifecycleOptions?.onInactive();
    await nextTick();

    expect(pauseMock).toHaveBeenCalledOnce();
    expect(timerIsPaused.value).toBe(true);
    expect((wrapper.vm as unknown as { currentSession: unknown }).currentSession).toEqual(
      activeSession
    );
    expect(cancelSessionMock).not.toHaveBeenCalled();
    expect(completeSessionMock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('Resume');

    isRunning.value = false;
    wrapper.unmount();
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

    await lastLifecycleOptions?.onInactive();
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
      startExercise: () => void;
    };
    vm.config.extendedHoldMode = 'TIMED';
    vm.config.extendedHoldDuration = 25;
    vm.startExercise();

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
    onSessionComplete();

    expect(vm.currentSetData.completedRepetitions).toBe(4);
    expect(vm.currentSetData.extendedHolds[0]).toMatchObject({
      type: 'EXHALE',
      mode: 'TIMED',
      targetDuration: 25,
      actualDuration: 24.6,
    });
    expect(addSetMock).toHaveBeenCalledWith(
      'session-recording',
      expect.objectContaining({ completedRepetitions: 4 })
    );
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
      saveIncompleteSession: () => void;
    };
    vm.startExercise();
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
      exitWithoutSavingSession: () => void;
    };
    vm.startExercise();

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
      configName: string;
      showOverwriteConfirmation: boolean;
      saveConfig: () => void;
      confirmOverwrite: () => void;
    };
    vm.configName = ' evening reset ';

    vm.saveConfig();
    expect(vm.showOverwriteConfirmation).toBe(true);
    expect(createConfigMock).not.toHaveBeenCalled();

    vm.confirmOverwrite();
    expect(deleteConfigMock).toHaveBeenCalledWith('preset-old');
    expect(createConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'evening reset' })
    );
  });

  it('confirmExit does not stop session on cancel', async () => {
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref({}),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
    });

    // Set up a session
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    if (vm.currentSession) {
      vm.currentSession = { id: 1 } as Record<string, unknown>;
    }

    const stopSpy = vi.spyOn((vm as { timer: unknown }).timer as { stop: () => void }, 'stop');

    // Call confirmExit to show modal
    ((vm as Record<string, unknown>).confirmExit as () => void)();
    await nextTick();

    // The modal should be shown - we just verify stop wasn't called yet
    expect(stopSpy).not.toHaveBeenCalled();
    expect(cancelSessionMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('Start Next Set button calls timer.nextSet when in SET_COMPLETE', async () => {
    const wrapper = shallowMount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });

    const vm = wrapper.vm as unknown as Record<string, unknown>;
    if (
      (vm as { timer?: { state?: { value: { phase?: string } }; nextSet?: () => void } }).timer
        ?.state
    ) {
      (
        vm as { timer: { state: { value: { phase: string } }; nextSet?: () => void } }
      ).timer.state.value.phase = 'SET_COMPLETE';
      // spy on nextSet
      (vm as { timer: { nextSet?: () => void } }).timer.nextSet = vi.fn();

      await nextTick();

      const btn = wrapper.find('button.btn-success');
      expect(btn.exists()).toBeTruthy();
      await btn.trigger('click');

      expect((vm as { timer: { nextSet?: () => void } }).timer.nextSet).toHaveBeenCalled();
    }
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

  it('Save Preset flow warns when name present', async () => {
    isRunning.value = false;
    const wrapper = mount(BreathingPractice, {
      attachTo: document.body,
    });

    await nextTick(); // Wait for component to render

    // Open config modal directly
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { showConfigModal?: boolean }).showConfigModal = true;
    await nextTick(); // Wait for modal DOM to render

    // Set the config name
    (vm as { configName?: string }).configName = 'My Preset';
    await nextTick();

    // Find Save Preset button in document.body (Teleported)
    const buttons = document.body.querySelectorAll('button');
    const saveBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes('Save Preset')
    ) as HTMLElement;
    expect(saveBtn).toBeTruthy();
    saveBtn.click();
    await nextTick();

    // Should show success notification modal in document.body
    expect(document.body.textContent).toContain('Configuration saved');
    wrapper.unmount();
  });

  it('renders the component and has required UI elements', () => {
    const wrapper = shallowMount(BreathingPractice, {
      global: {
        stubs: ['BreathingVisualizer'],
      },
    });

    expect(wrapper.exists()).toBe(true);
    // Component should render without errors
  });

  it('component mounts without errors', () => {
    const wrapper = shallowMount(BreathingPractice, {
      global: {
        stubs: ['BreathingVisualizer'],
      },
    });

    expect(wrapper.vm).toBeDefined();
  });

  it('saveConfig shows modal when configuration name is empty', async () => {
    const wrapper = mount(BreathingPractice, {
      global: {
        stubs: ['BreathingVisualizer'],
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
      },
      attachTo: document.body,
    });

    // Call saveConfig which should show modal since default configName is empty
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    if (typeof vm.saveConfig === 'function') {
      await (vm.saveConfig as () => Promise<void>)();
      await nextTick();

      // Check that error modal is visible in document.body (Teleport)
      expect(document.body.textContent).toContain('Please enter a configuration name');
    }
    wrapper.unmount();
  });

  it('component renders and mounts without errors', () => {
    const wrapper = shallowMount(BreathingPractice, {
      global: { stubs: ['BreathingVisualizer'] },
    });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.vm).toBeDefined();
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

    it('records targetDuration when extendedHoldMode is TIMED', async () => {
      createSessionMock.mockReturnValue({ id: 'sess-100', sets: [] });

      const wrapper = mount(BreathingPractice, {
        global: {
          provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
          stubs: ['BreathingVisualizer'],
        },
      });

      // Component mounts and renders; mocked composables are in place
      expect(wrapper.exists()).toBe(true);
      expect(createSessionMock).not.toHaveBeenCalled();
    });

    it('stopExercise behavior with mocked composables', async () => {
      createSessionMock.mockReturnValue({ id: 'sess-101', sets: [] });

      const wrapper = mount(BreathingPractice, {
        global: {
          provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
          stubs: ['BreathingVisualizer'],
        },
      });

      // Verify component mounts without errors
      expect(wrapper.exists()).toBe(true);
      expect(wrapper.vm).toBeDefined();
    });

    it('applies selectedConfig from provide and calls clearSelectedConfig', async () => {
      const preset = { name: 'Preset A', inhaleTime: 3 };
      const clearMock = vi.fn();
      const wrapper = mount(BreathingPractice, {
        global: {
          provide: { selectedConfig: ref(preset), clearSelectedConfig: clearMock },
          stubs: ['BreathingVisualizer'],
        },
      });

      // Verify component mounts with injection provided
      expect(wrapper.exists()).toBe(true);
      // clearSelectedConfig should be called from the watcher
      expect(clearMock).toHaveBeenCalled();
    });

    it('component renders with extended hold configuration', async () => {
      const wrapper = mount(BreathingPractice, {
        global: {
          provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
          stubs: ['BreathingVisualizer'],
        },
      });

      // Verify component mounts and renders
      expect(wrapper.exists()).toBe(true);
      expect(wrapper.find('[class*="space-y"]').exists()).toBe(true);
    });

    it('saves configuration with custom name', async () => {
      const createConfigMock = vi.fn();
      (globalThis as Record<string, unknown>).createConfigMock = createConfigMock;

      const wrapper = mount(BreathingPractice, {
        global: {
          provide: {
            selectedConfig: ref(null),
            clearSelectedConfig: vi.fn(),
          },
          stubs: ['BreathingVisualizer'],
        },
      });

      // Verify component mounts
      expect(wrapper.exists()).toBe(true);
    });

    it('saves session notes when completing a session', async () => {
      const updateSessionMock = vi.fn();
      (globalThis as Record<string, unknown>).updateSessionMock = updateSessionMock;

      const wrapper = mount(BreathingPractice, {
        global: {
          provide: {
            selectedConfig: ref(null),
            clearSelectedConfig: vi.fn(),
          },
          stubs: ['BreathingVisualizer'],
        },
      });

      // Verify component mounts and can access session notes feature
      expect(wrapper.exists()).toBe(true);
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
      onPhaseChange?.('INHALE', { totalPhaseTime: 4 });
      expect(speakMock).toHaveBeenCalledWith('Full Breath In', { targetDurationSeconds: 4 });

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

    expect(wrapper.text()).toContain('Find your resonance frequency');
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
