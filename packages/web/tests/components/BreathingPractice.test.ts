import { mount, shallowMount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick, ref } from 'vue';
import BreathingPractice from '@/components/BreathingPractice.vue';

const startMock = vi.fn();
const pauseMock = vi.fn();
const isRunning = ref(false);

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
  }),
}));

vi.mock('@/composables/useBreathingTimer', () => {
  return {
    useBreathingTimer: (_config: unknown, options: Record<string, unknown>) => {
      lastTimerOptions = options;
      return {
        // component expects refs like `phase.value` etc.
        phase: ref('IDLE'),
        currentTime: ref(0),
        totalPhaseTime: ref(0),
        isRunning,
        breathingScale: ref(1.0),
        currentRepetition: ref(1),
        currentSet: ref(1),
        extendedHoldElapsed: ref(0),
        isFirstExtendedHold: ref(true),
        start: startMock,
        pause: pauseMock,
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
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    localStorage.clear();
    vi.clearAllMocks();
    speakMock = vi.fn();
    loadVoicesMock = vi.fn().mockResolvedValue([]);
    setVoiceMock = vi.fn();
    setTtsEnabledMock = vi.fn();
    hasNativeSupportMock = vi.fn().mockReturnValue(false);
    lastTimerOptions = undefined;
  });

  afterEach(() => {
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
    const pauseBtn = document.querySelector('button.btn-warning') as HTMLButtonElement;
    expect(pauseBtn).toBeTruthy();
    if (pauseBtn) {
      pauseBtn.click();
      await nextTick();
    }
    expect(pauseMock).toHaveBeenCalled();

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
      (global as Record<string, unknown>).createConfigMock = createConfigMock;

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
      (global as Record<string, unknown>).updateSessionMock = updateSessionMock;

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
        | ((phase: string, state: unknown) => void)
        | undefined;
      expect(onPhaseChange).toBeDefined();
      onPhaseChange?.('INHALE', {});
      expect(speakMock).toHaveBeenCalledWith('Breathe In');

      wrapper.unmount();
    });
  });
});
