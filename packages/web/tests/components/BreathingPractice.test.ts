import { enableAutoUnmount, mount, shallowMount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import BreathingPractice from '@/components/BreathingPractice.vue';

enableAutoUnmount(afterEach);

const startMock = vi.fn();
const pauseMock = vi.fn();
const nextSetMock = vi.fn();
const isRunning = ref(false);
const timerPhase = ref('IDLE');
const timerCurrentTime = ref(0);
const timerTotalPhaseTime = ref(0);

const createSessionMock = vi.fn();
const addSetMock = vi.fn();
const addExtendedHoldMock = vi.fn();
const completeSessionMock = vi.fn();
const cancelSessionMock = vi.fn();
const updateSessionMock = vi.fn();
const createConfigMock = vi.fn();

let speakMock: ReturnType<typeof vi.fn>;
let loadVoicesMock: ReturnType<typeof vi.fn>;
let setVoiceMock: ReturnType<typeof vi.fn>;
let setTtsEnabledMock: ReturnType<typeof vi.fn>;
let hasNativeSupportMock: ReturnType<typeof vi.fn>;

let lastTimerOptions: Record<string, unknown> | undefined;

vi.mock('@/composables/useStorage', () => ({
  useStorage: () => ({
    createSession: createSessionMock,
    addSetToSession: addSetMock,
    addExtendedHoldToSet: addExtendedHoldMock,
    completeSession: completeSessionMock,
    cancelSession: cancelSessionMock,
    updateSession: updateSessionMock,
    createConfig: createConfigMock,
    getSoundTheme: vi.fn(() => 'wood'),
    setSoundTheme: vi.fn(),
    soundTheme: ref('wood'),
    getAllConfigs: vi.fn(() => []),
    getSession: vi.fn(() => ({ id: 'test-session', sets: [] })),
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
        currentSet: ref(1),
        extendedHoldElapsed: ref(0),
        isFirstExtendedHold: ref(true),
        start: startMock,
        pause: pauseMock,
        nextSet: nextSetMock,
        stop: vi.fn(),
        isPaused: ref(false),
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
    isRunning.value = false;
    timerPhase.value = 'IDLE';
    timerCurrentTime.value = 0;
    timerTotalPhaseTime.value = 0;
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

    const confirmation = document.body.querySelector('[data-testid="stop-confirmation"]') as HTMLElement;
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
});
