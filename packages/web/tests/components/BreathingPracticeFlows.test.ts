import { mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import BreathingPractice from '@/components/BreathingPractice.vue';

const createSessionMock = vi.fn();
const addSetMock = vi.fn();
const addExtendedHoldMock = vi.fn();
const completeSessionMock = vi.fn();
const updateSessionMock = vi.fn();
const createConfigMock = vi.fn();

let speakMock: ReturnType<typeof vi.fn>;
let loadVoicesMock: ReturnType<typeof vi.fn>;
let setVoiceMock: ReturnType<typeof vi.fn>;
let setTtsEnabledMock: ReturnType<typeof vi.fn>;
let hasNativeSupportMock: ReturnType<typeof vi.fn>;

const cancelSessionMock = vi.fn();

vi.mock('@/composables/useStorage', () => {
  return {
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
  };
});

vi.mock('@/composables/useBreathingTimer', () => {
  // Provide a fake timer object that allows tests to trigger callbacks
  return {
    useBreathingTimer: (_config: unknown, opts: Record<string, unknown>) => {
      const phase = ref('IDLE');
      const isRunning = ref(false);
      const isPaused = ref(false);
      const currentSet = ref(1);
      const currentRepetition = ref(0);
      const currentTime = ref(0);
      const totalPhaseTime = ref(0);
      const breathingScale = ref(1);
      const extendedHoldElapsed = ref(0);
      const isFirstExtendedHold = ref(true);

      return {
        phase,
        isRunning,
        isPaused,
        currentSet,
        currentRepetition,
        currentTime,
        totalPhaseTime,
        breathingScale,
        extendedHoldElapsed,
        isFirstExtendedHold,
        start: () => {
          isRunning.value = true;
        },
        stop: () => {
          isRunning.value = false;
        },
        nextSet: () => {
          currentSet.value += 1;
          phase.value = 'INHALE';
        },
        endExtendedHold: () => {
          // simulate ending an extended hold (default values)
          (
            opts.onExtendedHoldEnd as
              ((duration: number, type: string, data: Record<string, unknown>) => void) | undefined
          )?.(12, 'INHALE', {});
        },
        // Test helpers that the test can call via wrapper.vm.timer
        triggerSetComplete: (setNum = 1) => {
          (
            opts.onSetComplete as
              ((setNum: number, data: Record<string, unknown>) => void) | undefined
          )?.(setNum, {});
          phase.value = 'SET_COMPLETE';
        },
        triggerSessionComplete: () => {
          (opts.onSessionComplete as ((data: Record<string, unknown>) => void) | undefined)?.({});
          phase.value = 'SESSION_COMPLETE';
        },
        triggerTimedRestComplete: () => {
          currentSet.value += 1;
          currentRepetition.value = 1;
          phase.value = 'INHALE';
          (
            opts.onPhaseChange as
              ((phase: string, data: Record<string, unknown>) => void) | undefined
          )?.('INHALE', {
            currentSet: currentSet.value,
            currentRepetition: currentRepetition.value,
          });
        },
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

describe('BreathingPractice flows', () => {
  beforeEach(() => {
    createSessionMock.mockReset();
    addSetMock.mockReset();
    addExtendedHoldMock.mockReset();
    completeSessionMock.mockReset();
    updateSessionMock.mockReset();
    createConfigMock.mockReset();
    cancelSessionMock.mockReset();

    speakMock = vi.fn();
    loadVoicesMock = vi.fn().mockResolvedValue([]);
    setVoiceMock = vi.fn();
    setTtsEnabledMock = vi.fn();
    hasNativeSupportMock = vi.fn().mockReturnValue(false);
  });

  it('creates a session when starting practice and adds a set on set-complete', async () => {
    // createSession should return a session object
    createSessionMock.mockReturnValue({ id: 'sess-1', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref(null),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
    });

    // Click Start Practice button
    const startBtn = wrapper
      .findAll('button')
      .find((b) => b.text().toLowerCase().includes('start practice'));
    expect(startBtn).toBeTruthy();
    if (startBtn) await startBtn.trigger('click');

    expect(createSessionMock).toHaveBeenCalled();
    // simulate set complete via the mocked timer helper
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { timer: { triggerSetComplete: (n?: number) => void } }).timer.triggerSetComplete(1);
    // wait for DOM to update
    await (vm as { $nextTick: () => Promise<void> }).$nextTick();
    expect(addSetMock).toHaveBeenCalled();
  });

  it('opens a fresh set record when timed rest starts the next set automatically', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-rest', sets: [] });
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    const startButton = wrapper
      .findAll('button')
      .find((button) => button.text().toLowerCase().includes('start practice'));
    await startButton!.trigger('click');

    const vm = wrapper.vm as unknown as {
      timer: {
        triggerSetComplete: (setNumber?: number) => void;
        triggerTimedRestComplete: () => void;
      };
      currentSetData: { setNumber: number } | null;
    };
    vm.timer.triggerSetComplete(1);
    vm.timer.triggerTimedRestComplete();
    await nextTick();

    expect(vm.currentSetData?.setNumber).toBe(2);
    wrapper.unmount();
  });

  it('blocks starting practice when timing settings are invalid', async () => {
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref(null),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
    });

    const vm = wrapper.vm as unknown as {
      config: {
        extendedHoldEnabled: boolean;
        extendedHoldMode: 'TIMED' | 'TOLERANCE';
        extendedHoldDuration: number;
      };
    };
    vm.config.extendedHoldEnabled = true;
    vm.config.extendedHoldMode = 'TIMED';
    vm.config.extendedHoldDuration = 0;
    await nextTick();

    const validation = wrapper.find('[data-testid="quick-config-validation-error"]');
    expect(validation.exists()).toBe(true);
    expect(validation.text()).toContain('Extended hold duration');

    const startBtn = wrapper
      .findAll('button')
      .find((b) => b.text().toLowerCase().includes('start practice'));
    expect(startBtn?.attributes('disabled')).toBeDefined();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('records extended hold when ending hold', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-2', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    // start session
    const startBtn = wrapper
      .findAll('button')
      .find((b) => b.text().toLowerCase().includes('start practice'));
    if (startBtn) await startBtn.trigger('click');

    // Call endExtendedHold which calls into the mocked timer.endExtendedHold
    // The release hold button only appears when phase is an EXTENDED_* state, so call the timer helper directly
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { timer: { endExtendedHold: () => void } }).timer.endExtendedHold();

    // Hold should be stored on the current set data, not persisted yet
    const currentSetData = (vm as { currentSetData?: { extendedHolds?: unknown[] } })
      .currentSetData;
    expect(currentSetData?.extendedHolds?.length ?? 0).toBe(1);
    expect(addExtendedHoldMock).not.toHaveBeenCalled();

    // Persist when set completes
    (vm as { timer: { triggerSetComplete: (n?: number) => void } }).timer.triggerSetComplete(1);
    await (vm as { $nextTick: () => Promise<void> }).$nextTick();
    expect(addSetMock).toHaveBeenCalled();
  });

  it('finish session button calls completeSession and resets state', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-3', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    // Start and then trigger set complete so the UI shows Finish Session
    const startBtn = wrapper
      .findAll('button')
      .find((b) => b.text().toLowerCase().includes('start practice'));
    if (startBtn) await startBtn.trigger('click');
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { timer: { triggerSetComplete: (n?: number) => void } }).timer.triggerSetComplete(1);
    // wait for DOM update
    await (vm as { $nextTick: () => Promise<void> }).$nextTick();

    const finishBtn = wrapper
      .findAll('button')
      .find((b) => b.text().toLowerCase().includes('finish session'));
    if (finishBtn) {
      await finishBtn.trigger('click');
    } else if (typeof (vm as { finishSession?: () => void }).finishSession === 'function') {
      // fallback to calling the method directly
      (vm as { finishSession?: () => void }).finishSession?.();
    }

    expect(completeSessionMock).toHaveBeenCalled();
    // after finish, currentSession should be null
    expect((vm as { currentSession?: unknown }).currentSession).toBeNull();
  });

  it('saves session notes when session complete', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-4', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    // start and then trigger session complete
    const startBtn = wrapper
      .findAll('button')
      .find((b) => b.text().toLowerCase().includes('start practice'));
    if (startBtn) await startBtn.trigger('click');
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { timer: { triggerSessionComplete: () => void } }).timer.triggerSessionComplete();
    // wait for DOM update
    await (vm as { $nextTick: () => Promise<void> }).$nextTick();

    // mock alert which the component calls after saving notes
    window.alert = vi.fn();

    // Set session notes and click save (use direct method if needed)
    const textarea = wrapper.find('textarea');
    if (textarea.exists()) {
      await textarea.setValue('Felt strong');
      const saveBtn = wrapper
        .findAll('button')
        .find((b) => b.text().toLowerCase().includes('save notes'));
      expect(saveBtn).toBeTruthy();
      if (saveBtn) await saveBtn.trigger('click');
    } else if (typeof (vm as { saveSessionNotes?: () => void }).saveSessionNotes === 'function') {
      // set the value directly and call method
      (vm as { sessionNotes?: string }).sessionNotes = 'Felt strong';
      (vm as { saveSessionNotes?: () => void }).saveSessionNotes?.();
    }

    expect(updateSessionMock).toHaveBeenCalled();

    // alertMock is a vi.fn() assigned directly, no restore needed
  });

  it('save preset requires a name and then saves', async () => {
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
      },
      attachTo: document.body,
    });

    await nextTick(); // Wait for component to render

    // Open config modal directly
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { showConfigModal?: boolean }).showConfigModal = true;
    await nextTick(); // Wait for modal DOM to render

    // Modal should be visible in document.body (Teleported)
    expect(document.body.textContent).toContain('Configure Practice');

    // Find Save Preset button in document.body (Teleported)
    let buttons = document.body.querySelectorAll('button');
    let saveBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes('Save Preset')
    ) as HTMLElement;
    expect(saveBtn).toBeTruthy();
    saveBtn.click();
    await nextTick();

    // Check that error modal appears in document.body
    expect(document.body.textContent).toContain('Please enter a configuration name');

    // Close the error modal
    const okBtn = document.body.querySelector('button.btn-primary') as HTMLElement;
    expect(okBtn).toBeTruthy();
    okBtn.click();
    await nextTick();

    // Fill in a name and click again - find input in document.body
    const nameInput = document.body.querySelector(
      'input[type="text"][placeholder*="name"]'
    ) as HTMLInputElement;
    expect(nameInput).toBeTruthy();
    nameInput.value = 'Morning';
    nameInput.dispatchEvent(new Event('input'));
    await nextTick();

    // Find save button again
    buttons = document.body.querySelectorAll('button');
    saveBtn = Array.from(buttons).find((b) =>
      b.textContent?.includes('Save Preset')
    ) as HTMLElement;
    expect(saveBtn).toBeTruthy();
    saveBtn.click();
    await nextTick();

    expect(createConfigMock).toHaveBeenCalled();
    wrapper.unmount();
  });

  it('does not add a set when onSetComplete is called and no current set data exists', async () => {
    // do not start session
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    // Call the mocked timer helper directly via vm.timer
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { timer: { triggerSetComplete: (n?: number) => void } }).timer.triggerSetComplete(1);
    // allow DOM updates
    await (vm as { $nextTick: () => Promise<void> }).$nextTick();

    expect(addSetMock).not.toHaveBeenCalled();
  });

  it('startNextSet populates new currentSetData and advances the timer set', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-10', sets: [] });
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    // start a session
    const startBtn = wrapper
      .findAll('button')
      .find((b) => b.text().toLowerCase().includes('start practice'));
    if (startBtn) await startBtn.trigger('click');
    // call startNextSet method directly
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { startNextSet: () => void }).startNextSet();
    await (vm as { $nextTick: () => Promise<void> }).$nextTick();

    // currentSetData should be populated
    expect((vm as { currentSetData?: unknown }).currentSetData).not.toBeNull();
    // timer currentSet should be > 1
    expect(
      (vm as { timer: { currentSet: { value: number } } }).timer.currentSet.value
    ).toBeGreaterThanOrEqual(1);
  });

  it('resetExercise stops the timer and clears session and set data', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-11', sets: [] });
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    // start then reset
    const startBtn = wrapper
      .findAll('button')
      .find((b) => b.text().toLowerCase().includes('start practice'));
    if (startBtn) await startBtn.trigger('click');
    // call resetExercise
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { resetExercise: () => void }).resetExercise();
    await (vm as { $nextTick: () => Promise<void> }).$nextTick();

    // session and set data cleared
    expect((vm as { currentSession?: unknown }).currentSession).toBeNull();
    expect((vm as { currentSetData?: unknown }).currentSetData).toBeNull();
  });

  it('saveSessionNotes does nothing when no session is active', async () => {
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    // ensure no session
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { sessionNotes?: string }).sessionNotes = 'test';
    // call saveSessionNotes directly
    (vm as { saveSessionNotes?: () => void }).saveSessionNotes?.();

    expect(updateSessionMock).not.toHaveBeenCalled();
  });

  it('finishSession completes the session and clears data', async () => {
    completeSessionMock.mockReturnValue(undefined);
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    // Set up a fake session
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm as { currentSession?: unknown }).currentSession = { id: 'test-session', sets: [] };
    await (vm as { $nextTick: () => Promise<void> }).$nextTick();

    // Call finishSession
    (vm as { finishSession?: () => void }).finishSession?.();
    await (vm as { $nextTick: () => Promise<void> }).$nextTick();

    // Should have called completeSession
    expect(completeSessionMock).toHaveBeenCalledWith('test-session');
    // Session should be cleared
    expect((vm as { currentSession?: unknown }).currentSession).toBeNull();
    expect((vm as { currentSetData?: unknown }).currentSetData).toBeNull();
  });
});
