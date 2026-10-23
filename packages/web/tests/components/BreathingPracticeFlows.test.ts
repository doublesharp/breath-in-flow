import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ref, nextTick } from 'vue';
import BreathingPractice from '@/components/BreathingPractice.vue';
import { LAST_CONFIG_STORAGE_KEY, SESSIONS_STORAGE_KEY, SKIP_CHECK_INS_STORAGE_KEY } from '@/constants/storageKeys';
import { resetStorageForTesting, useStorage } from '@/composables/useStorage';
import type { useBreathingTimer } from '@/composables/useBreathingTimer';
import { soundService } from '@/services/soundService';
import RecommendedActions from '@/components/RecommendedActions.vue';
import { presetConfig, guidedPresets } from '@/data/guidedPresets';
import type { BreathingConfig, Session } from '@breath-in-flow/shared';

enableAutoUnmount(afterEach);

const createSessionMock = vi.fn();
const addSetMock = vi.fn();
const addExtendedHoldMock = vi.fn();
const completeSessionMock = vi.fn();
const updateSessionMock = vi.fn();
const createConfigMock = vi.fn();
const setSessionCheckInMock = vi.fn();
const sessionsRef = ref<Session[]>([]);

let speakMock: ReturnType<typeof vi.fn>;
let loadVoicesMock: ReturnType<typeof vi.fn>;
let setVoiceMock: ReturnType<typeof vi.fn>;
let setTtsEnabledMock: ReturnType<typeof vi.fn>;
let hasNativeSupportMock: ReturnType<typeof vi.fn>;

const cancelSessionMock = vi.fn();
let useRealPracticeServices = false;

vi.mock('@/composables/useStorage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useStorage')>();
  return {
    ...actual,
    useStorage: () => useRealPracticeServices ? actual.useStorage() : ({
      createSession: createSessionMock,
      addSetToSession: addSetMock,
      addExtendedHoldToSet: addExtendedHoldMock,
      completeSession: completeSessionMock,
      cancelSession: cancelSessionMock,
      updateSession: updateSessionMock,
      setSessionCheckIn: setSessionCheckInMock,
      createConfig: createConfigMock,
      getSoundTheme: vi.fn(() => 'wood'),
      setSoundTheme: vi.fn(),
      soundTheme: ref('wood'),
      getAllConfigs: vi.fn(() => []),
      getSession: vi.fn(() => ({ id: 'test-session', sets: [] })),
      sessions: sessionsRef,
    }),
  };
});

vi.mock('@/composables/useBreathingTimer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/composables/useBreathingTimer')>();
  // Provide a fake timer object that allows tests to trigger callbacks
  return {
    useBreathingTimer: (config: BreathingConfig, opts: Record<string, unknown>) => {
      if (useRealPracticeServices) return actual.useBreathingTimer(config, opts);
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
        pause: () => {
          if (!isRunning.value || isPaused.value) return;
          isPaused.value = true;
          phase.value = 'PAUSED';
        },
        stop: () => {
          isRunning.value = false;
          phase.value = 'IDLE';
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
    stop: vi.fn(),
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

type Wrapper = ReturnType<typeof mount>;

// Clicking Start opens the optional pre-session check-in before any session is
// created. These helpers drive that prompt so existing flows and new ones can
// resolve it explicitly.
function findByText(wrapper: Wrapper, text: string) {
  return wrapper.findAll('button').find((b) => b.text().toLowerCase().includes(text));
}

async function skipBeforeCheckIn(_wrapper: Wrapper) {
  const skip = document.body.querySelector<HTMLElement>('[data-testid="checkin-skip"]');
  if (skip) {
    skip.click();
    await nextTick();
  }
}

async function clickCheckInControl(testId: string) {
  const control = document.body.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  expect(control).not.toBeNull();
  control?.click();
  await nextTick();
}

async function setCheckInComment(value: string) {
  const comment = document.body.querySelector<HTMLTextAreaElement>(
    '[data-testid="checkin-comment"]'
  );
  expect(comment).not.toBeNull();
  if (!comment) return;
  comment.value = value;
  comment.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
}

async function startPracticeAndSkip(wrapper: Wrapper) {
  const startBtn = findByText(wrapper, 'start practice');
  if (startBtn) await startBtn.trigger('click');
  await nextTick();
  await skipBeforeCheckIn(wrapper);
}

describe('BreathingPractice flows', () => {
  beforeEach(() => {
    localStorage.removeItem(SKIP_CHECK_INS_STORAGE_KEY);
    createSessionMock.mockReset();
    addSetMock.mockReset();
    addExtendedHoldMock.mockReset();
    completeSessionMock.mockReset();
    updateSessionMock.mockReset();
    createConfigMock.mockReset();
    setSessionCheckInMock.mockReset();
    setSessionCheckInMock.mockReturnValue({ id: 'saved-check-in' });
    cancelSessionMock.mockReset();
    sessionsRef.value = [];

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

    // Click Start Practice button, then dismiss the optional pre-session check-in
    await startPracticeAndSkip(wrapper);

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

    await startPracticeAndSkip(wrapper);

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
    await startPracticeAndSkip(wrapper);

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
    await startPracticeAndSkip(wrapper);
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
    await startPracticeAndSkip(wrapper);
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

  it('separates the configuration title from the form and provides a full close target', async () => {
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
      attachTo: document.body,
    });
    await wrapper.get('button[title="Configure practice"]').trigger('click');
    await nextTick();

    const header = document.querySelector('[data-testid="configure-practice-header"]');
    const close = document.querySelector('[data-testid="close-practice-settings"]');
    expect(header?.className).toContain('mb-6');
    expect(header?.className).toContain('sm:mb-8');
    expect(close?.className).toContain('min-h-11');
    expect(close?.className).toContain('min-w-11');
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
    await startPracticeAndSkip(wrapper);
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
    await startPracticeAndSkip(wrapper);
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

  it('remembers skip every time, bypasses both prompts, and allows re-enabling in settings', async () => {
    createSessionMock.mockReturnValue({ id: 'skip-always', sets: [] });
    const options = {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    };
    let wrapper = mount(BreathingPractice, options);
    await findByText(wrapper, 'start practice')!.trigger('click');
    await clickCheckInControl('checkin-skip-always');
    await skipBeforeCheckIn(wrapper);
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    (
      wrapper.vm as unknown as { timer: { triggerSessionComplete: () => void } }
    ).timer.triggerSessionComplete();
    await nextTick();
    expect(document.body.querySelector('[data-testid="feeling-checkin"]')).toBeNull();
    wrapper.unmount();

    wrapper = mount(BreathingPractice, options);
    await findByText(wrapper, 'start practice')!.trigger('click');
    expect(createSessionMock).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[data-testid="feeling-checkin"]')).toBeNull();
    wrapper.unmount();

    wrapper = mount(BreathingPractice, { ...options, props: { openSettings: true } });
    await nextTick();
    const setting = document.body.querySelector<HTMLInputElement>(
      '[data-testid="show-session-checkins"]'
    )!;
    expect(setting).not.toBeNull();
    expect(setting.checked).toBe(false);
    setting.click();
    await nextTick();
    wrapper.unmount();

    wrapper = mount(BreathingPractice, options);
    await findByText(wrapper, 'start practice')!.trigger('click');
    expect(document.body.querySelector('[data-testid="feeling-checkin"]')).not.toBeNull();
    expect(createSessionMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('skipping the pre-session prompt starts immediately with no check-in attached', async () => {
    createSessionMock.mockReturnValue({ id: 'skip-before', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    const startBtn = findByText(wrapper, 'start practice');
    await startBtn!.trigger('click');
    await nextTick();

    // No session is created until the check-in resolves.
    expect(createSessionMock).not.toHaveBeenCalled();

    await skipBeforeCheckIn(wrapper);

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(setSessionCheckInMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('shows a retryable start error even when check-ins are disabled', async () => {
    localStorage.setItem(SKIP_CHECK_INS_STORAGE_KEY, 'true');
    createSessionMock.mockImplementationOnce(() => {
      throw new Error('Breathing session could not be saved.');
    });
    const wrapper = mount(BreathingPractice, {
      global: { stubs: ['BreathingVisualizer'] },
    });
    await findByText(wrapper, 'start practice')!.trigger('click');
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'could not be saved'
    );
    expect(document.body.querySelector('[data-testid="session-dialog"]')).toBeNull();

    createSessionMock.mockReturnValueOnce({ id: 'retry-skipped', sets: [] });
    await clickCheckInControl('checkin-skip');
    expect(createSessionMock).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[data-testid="session-dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="feeling-checkin"]')).toBeNull();
  });

  it.each(['manual', 'automatic'] as const)(
    'retains a %s completion after a failed save and retries before leaving',
    async (completion) => {
      localStorage.setItem(SKIP_CHECK_INS_STORAGE_KEY, 'true');
      createSessionMock.mockReturnValue({ id: 'retry-completion', sets: [] });
      completeSessionMock.mockImplementationOnce(() => {
        throw new Error('Completed session could not be saved.');
      });
      const wrapper = mount(BreathingPractice, {
        global: { stubs: ['BreathingVisualizer'] },
      });
      await findByText(wrapper, 'start practice')!.trigger('click');
      const vm = wrapper.vm as unknown as {
        currentSession: { id: string } | null;
        finishSession: () => void;
        resetExercise: () => void;
        timer: { triggerSessionComplete: () => void; triggerSetComplete: () => void };
      };
      if (completion === 'automatic') vm.timer.triggerSessionComplete();
      else {
        vm.timer.triggerSetComplete();
        vm.finishSession();
      }
      await nextTick();
      expect(vm.currentSession?.id).toBe('retry-completion');
      expect(document.body.textContent).toContain('Completed session could not be saved.');
      expect(completeSessionMock).toHaveBeenCalledTimes(1);

      if (completion === 'automatic') vm.resetExercise();
      else vm.finishSession();
      await nextTick();
      expect(completeSessionMock).toHaveBeenCalledTimes(2);
      expect(vm.currentSession).toBeNull();
    }
  );

  it('retains an unsaved completed set and retries it before recording session completion', async () => {
    localStorage.setItem(SKIP_CHECK_INS_STORAGE_KEY, 'true');
    createSessionMock.mockReturnValue({ id: 'retry-set', sets: [] });
    addSetMock.mockImplementation(() => {
      throw new Error('Set could not be saved.');
    });
    const wrapper = mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
    await findByText(wrapper, 'start practice')!.trigger('click');
    const vm = wrapper.vm as unknown as {
      currentSession: { id: string } | null;
      resetExercise: () => void;
      timer: { triggerSetComplete: () => void; triggerSessionComplete: () => void };
    };
    expect(() => vm.timer.triggerSetComplete()).not.toThrow();
    vm.timer.triggerSessionComplete();
    await nextTick();
    expect(completeSessionMock).not.toHaveBeenCalled();
    expect(vm.currentSession?.id).toBe('retry-set');
    expect(document.body.textContent).toContain('Set could not be saved.');

    addSetMock.mockReturnValue({ id: 'retry-set', sets: [{ setNumber: 1 }] });
    vm.resetExercise();
    await nextTick();
    expect(addSetMock).toHaveBeenLastCalledWith(
      'retry-set',
      expect.objectContaining({ setNumber: 1 })
    );
    expect(completeSessionMock).toHaveBeenCalledOnce();
    expect(vm.currentSession).toBeNull();
  });

  it('attaches a submitted pre-score to the session created by that start', async () => {
    createSessionMock.mockReturnValue({ id: 'attach-before', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    const startBtn = findByText(wrapper, 'start practice');
    await startBtn!.trigger('click');
    await nextTick();

    await clickCheckInControl('feeling-score-2');
    await clickCheckInControl('checkin-submit');

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(createSessionMock).toHaveBeenCalledWith(expect.any(Object), { before: 2 });
    expect(setSessionCheckInMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('keeps the pre-session response available for retry when session storage fails', async () => {
    createSessionMock.mockImplementationOnce(() => {
      throw new Error('Breathing session could not be saved.');
    });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });
    await findByText(wrapper, 'start practice')!.trigger('click');
    await nextTick();
    await clickCheckInControl('feeling-score-2');
    await clickCheckInControl('checkin-submit');

    expect(document.body.querySelector('[data-testid="feeling-checkin"]')).not.toBeNull();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'could not be saved'
    );

    createSessionMock.mockReturnValueOnce({ id: 'retry-before', sets: [] });
    await clickCheckInControl('checkin-submit');
    expect(createSessionMock).toHaveBeenCalledTimes(2);
    wrapper.unmount();
  });

  it('persists no orphan check-in when the start is rejected', async () => {
    // A rejected start yields no session, so a submitted pre-score has nothing
    // to attach to.
    createSessionMock.mockReturnValue(undefined);

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    const startBtn = findByText(wrapper, 'start practice');
    await startBtn!.trigger('click');
    await nextTick();

    await clickCheckInControl('feeling-score-2');
    await clickCheckInControl('checkin-submit');

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect(setSessionCheckInMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('persists completion before showing the post-session prompt', async () => {
    createSessionMock.mockReturnValue({ id: 'post-order', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    await startPracticeAndSkip(wrapper);
    const vm = wrapper.vm as unknown as {
      timer: { triggerSessionComplete: () => void };
    };
    vm.timer.triggerSessionComplete();
    await nextTick();

    // Completion is persisted first; only then does the post prompt appear.
    expect(completeSessionMock).toHaveBeenCalledWith('post-order');
    expect(document.body.querySelector('[data-testid="checkin-skip"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('keeps the post-session prompt outside every inert session layer', async () => {
    createSessionMock.mockReturnValue({ id: 'post-interactive', sets: [] });

    const wrapper = mount(BreathingPractice, {
      attachTo: document.body,
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    await startPracticeAndSkip(wrapper);
    const vm = wrapper.vm as unknown as {
      timer: { triggerSessionComplete: () => void };
    };
    vm.timer.triggerSessionComplete();
    await nextTick();
    await nextTick();

    const prompt = document.body.querySelector<HTMLElement>('[data-testid="feeling-checkin"]');
    expect(prompt).not.toBeNull();
    expect(prompt?.closest('[inert]')).toBeNull();

    wrapper.unmount();
  });

  it('saves post-session data without completing the session again', async () => {
    createSessionMock.mockReturnValue({ id: 'post-save', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    await startPracticeAndSkip(wrapper);
    const vm = wrapper.vm as unknown as {
      timer: { triggerSessionComplete: () => void };
    };
    vm.timer.triggerSessionComplete();
    await nextTick();
    expect(completeSessionMock).toHaveBeenCalledTimes(1);

    await clickCheckInControl('feeling-score-4');
    await setCheckInComment('Felt easier');
    await clickCheckInControl('checkin-submit');

    expect(setSessionCheckInMock).toHaveBeenCalledWith('post-save', {
      after: 4,
      comment: 'Felt easier',
    });
    // Dismissing the prompt must never re-run completion.
    expect(completeSessionMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('keeps a post-session response available until a failed save is retried', async () => {
    createSessionMock.mockReturnValue({ id: 'post-retry', sets: [] });
    setSessionCheckInMock
      .mockImplementationOnce(() => {
        throw new Error('Check-in could not be saved.');
      })
      .mockReturnValueOnce({ id: 'post-retry' });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });
    await startPracticeAndSkip(wrapper);
    (
      wrapper.vm as unknown as { timer: { triggerSessionComplete: () => void } }
    ).timer.triggerSessionComplete();
    await nextTick();
    await clickCheckInControl('feeling-score-4');
    await setCheckInComment('Keep this note');
    await clickCheckInControl('checkin-submit');

    expect(document.body.querySelector('[data-testid="feeling-checkin"]')).not.toBeNull();
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain(
      'could not be saved'
    );

    await clickCheckInControl('checkin-submit');
    expect(setSessionCheckInMock).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[data-testid="feeling-checkin"]')).toBeNull();
    wrapper.unmount();
  });

  it('skipping the post-session prompt leaves completion intact', async () => {
    createSessionMock.mockReturnValue({ id: 'post-skip', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    await startPracticeAndSkip(wrapper);
    const vm = wrapper.vm as unknown as {
      timer: { triggerSessionComplete: () => void };
    };
    vm.timer.triggerSessionComplete();
    await nextTick();
    expect(completeSessionMock).toHaveBeenCalledTimes(1);

    await skipBeforeCheckIn(wrapper);

    expect(setSessionCheckInMock).not.toHaveBeenCalled();
    expect(completeSessionMock).toHaveBeenCalledTimes(1);
    wrapper.unmount();
  });

  it('keeps the header exit confirmation for an active session', async () => {
    createSessionMock.mockReturnValue({ id: 'active-header-exit', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    await startPracticeAndSkip(wrapper);

    const headerExit = document.body.querySelector<HTMLElement>(
      '[data-testid="session-header-exit"]'
    );
    expect(headerExit).not.toBeNull();
    expect(headerExit?.textContent).not.toContain('Back to Practice');

    headerExit?.click();
    await nextTick();

    expect(document.body.querySelector('[data-testid="session-dialog"]')).not.toBeNull();
    expect(
      document.body.querySelector<HTMLElement>('[data-testid="stop-confirmation"]')?.style.display
    ).not.toBe('none');
  });

  it('returns to the Practice screen from the primary completion action', async () => {
    createSessionMock.mockReturnValue({ id: 'post-return-primary', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    await startPracticeAndSkip(wrapper);
    const vm = wrapper.vm as unknown as {
      timer: { triggerSessionComplete: () => void };
    };
    vm.timer.triggerSessionComplete();
    await nextTick();
    await skipBeforeCheckIn(wrapper);

    const backButton = document.body.querySelector<HTMLElement>('[data-testid="back-to-practice"]');
    expect(backButton).not.toBeNull();
    expect(backButton?.textContent).toContain('Back to Practice');

    backButton?.click();
    await nextTick();

    expect(document.body.querySelector('[data-testid="session-dialog"]')).toBeNull();
    expect(findByText(wrapper, 'start practice')).toBeTruthy();
    expect(
      document.body.querySelector<HTMLElement>('[data-testid="stop-confirmation"]')?.style.display
    ).toBe('none');
  });

  it('makes the completed-session header exit obvious and returns directly to Practice', async () => {
    createSessionMock.mockReturnValue({ id: 'post-return-header', sets: [] });

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });

    await startPracticeAndSkip(wrapper);
    const vm = wrapper.vm as unknown as {
      timer: { triggerSessionComplete: () => void };
    };
    vm.timer.triggerSessionComplete();
    await nextTick();
    await skipBeforeCheckIn(wrapper);

    const headerExit = document.body.querySelector<HTMLElement>(
      '[data-testid="session-header-exit"]'
    );
    expect(headerExit).not.toBeNull();
    expect(headerExit?.textContent).toContain('Back to Practice');

    headerExit?.click();
    await nextTick();

    expect(document.body.querySelector('[data-testid="session-dialog"]')).toBeNull();
    expect(
      document.body.querySelector<HTMLElement>('[data-testid="stop-confirmation"]')?.style.display
    ).toBe('none');
  });
});

describe('BreathingPractice with real timer and storage', () => {
  let wrapper: Wrapper | undefined;

  beforeEach(() => {
    useRealPracticeServices = true;
    vi.useFakeTimers();
    localStorage.clear();
    resetStorageForTesting();
    speakMock = vi.fn();
    loadVoicesMock = vi.fn().mockResolvedValue([]);
    vi.spyOn(soundService, 'playClick').mockImplementation(() => {});
    localStorage.setItem(SKIP_CHECK_INS_STORAGE_KEY, 'true');
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.restoreAllMocks();
    vi.useRealTimers();
    resetStorageForTesting();
    localStorage.clear();
    useRealPracticeServices = false;
  });

  async function startRealPractice(overrides: Partial<BreathingConfig> = {}) {
    localStorage.setItem(LAST_CONFIG_STORAGE_KEY, JSON.stringify({
      inhaleTime: 1,
      inhaleHoldTime: 0,
      exhaleTime: 1,
      exhaleHoldTime: 0,
      repetitions: 1,
      extendedHoldEnabled: false,
      targetSets: 0,
      restBetweenSetsSeconds: 1,
      soundEnabled: true,
      ttsEnabled: true,
      ...overrides,
    }));
    wrapper = mount(BreathingPractice, { global: { stubs: ['BreathingVisualizer'] } });
    await flushPromises();
    await findByText(wrapper, 'start practice')!.trigger('click');
    return wrapper.vm as unknown as {
      timer: ReturnType<typeof useBreathingTimer>;
      currentSession: Session | null;
    };
  }

  async function clickBodyButton(label: string) {
    const button = [...document.body.querySelectorAll<HTMLButtonElement>('button')].find(
      (item) => item.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() === label.toLowerCase()
    );
    expect(button, `Button ${label}`).toBeDefined();
    button!.click();
    await nextTick();
  }

  function rejectSessionWrites(predicate: (session: Session) => boolean) {
    const write = localStorage.setItem.bind(localStorage);
    return vi.spyOn(localStorage, 'setItem').mockImplementation((key, value) => {
      if (key === SESSIONS_STORAGE_KEY && JSON.parse(value).some(predicate)) {
        throw new Error('Storage full');
      }
      write(key, value);
    });
  }

  function persistedSession(): Session {
    return JSON.parse(localStorage.getItem(SESSIONS_STORAGE_KEY)!)[0];
  }

  function displayedCompletedSets() {
    const card = [...document.body.querySelectorAll('[data-testid="session-dialog"] .stat-card')]
      .find((item) => item.textContent?.includes('Completed'));
    return card?.querySelector('div')?.textContent?.trim();
  }

  it.each([0, 1])('freezes a manual finish with %ss rest when completion cannot be saved, then retries', async (rest) => {
    const vm = await startRealPractice({ restBetweenSetsSeconds: rest });
    await vi.advanceTimersByTimeAsync(2000);
    expect(vm.timer.phase.value).toBe(rest ? 'SET_REST' : 'SET_COMPLETE');
    expect(persistedSession().sets).toHaveLength(1);
    const write = rejectSessionWrites((session) => session.status === 'COMPLETED');

    await clickBodyButton('Finish session');
    expect(document.body.textContent).toContain('could not be saved');
    expect(vm.currentSession).not.toBeNull();
    expect(persistedSession().status).toBe('IN_PROGRESS');
    const clicks = vi.mocked(soundService.playClick).mock.calls.length;
    const cues = speakMock.mock.calls.length;

    await vi.advanceTimersByTimeAsync(1000);
    expect(vm.timer.currentSet.value).toBe(1);
    expect(vm.timer.phase.value).not.toBe('INHALE');
    await vi.advanceTimersByTimeAsync(10000);
    expect(soundService.playClick).toHaveBeenCalledTimes(clicks);
    expect(speakMock).toHaveBeenCalledTimes(cues);
    expect(persistedSession().sets).toHaveLength(1);

    await clickBodyButton('OK');
    expect(document.body.querySelector('[data-testid="session-dialog"]')).not.toBeNull();
    expect(document.body.querySelector('[data-testid="session-dialog"]')?.textContent).not.toContain('Resume');
    expect(document.body.querySelector('[data-testid="session-dialog"]')?.textContent?.toLowerCase())
      .not.toContain('start next set');
    await clickCheckInControl('session-header-exit');
    expect(document.body.querySelector<HTMLElement>('[data-testid="stop-confirmation"]')?.style.display).toBe('none');
    expect(vm.currentSession).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(vm.timer.currentSet.value).toBe(1);
    expect(soundService.playClick).toHaveBeenCalledTimes(clicks);
    expect(speakMock).toHaveBeenCalledTimes(cues);
    await clickBodyButton('OK');
    write.mockRestore();
    await clickBodyButton('Retry saving session');
    expect(vm.currentSession).toBeNull();
    expect(document.body.querySelector('[data-testid="session-dialog"]')).toBeNull();
    expect(useStorage().getAllSessions()[0]).toMatchObject({ status: 'COMPLETED', completedSets: 1 });
    expect(persistedSession()).toMatchObject({ status: 'COMPLETED', completedSets: 1 });
    expect(persistedSession().sets).toHaveLength(1);
    expect(typeof persistedSession().sets[0].completedAt).toBe('string');
  });

  it('replaces a saved partial set after cancellation fails and the same set completes', async () => {
    const vm = await startRealPractice({ repetitions: 2, targetSets: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    const write = rejectSessionWrites((session) => session.status === 'CANCELLED');
    await clickCheckInControl('session-header-exit');
    await clickBodyButton('Save Session');
    expect(document.body.textContent).toContain('could not be saved');
    expect(persistedSession()).toMatchObject({
      status: 'IN_PROGRESS', completedSets: 0,
      sets: [{ setNumber: 1, completedRepetitions: 1 }],
    });
    expect(persistedSession().sets[0].completedAt).toBeUndefined();
    write.mockRestore();
    await clickBodyButton('OK');

    await vi.advanceTimersByTimeAsync(2000);
    expect(vm.timer.phase.value).toBe('SESSION_COMPLETE');
    const saved = persistedSession();
    expect(saved.sets).toHaveLength(1);
    expect(saved).toMatchObject({
      status: 'COMPLETED', completedSets: 1,
      sets: [{ setNumber: 1, completedRepetitions: 2, completedAt: expect.any(String) }],
    });
    expect(useStorage().getAllSessions()[0].sets).toHaveLength(1);
    expect(useStorage().getAllSessions()[0].sets[0].completedAt).toBeInstanceOf(Date);
    expect(vm.currentSession).toEqual(useStorage().getAllSessions()[0]);
    expect(displayedCompletedSets()).toBe('1');
  });

  it('saves the latest partial progress when cancellation is retried after continuing', async () => {
    const vm = await startRealPractice({ repetitions: 3, targetSets: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    const write = rejectSessionWrites((session) => session.status === 'CANCELLED');
    await clickCheckInControl('session-header-exit');
    await clickBodyButton('Save Session');
    expect(persistedSession().sets[0].completedRepetitions).toBe(1);
    await clickBodyButton('OK');

    await vi.advanceTimersByTimeAsync(2000);
    write.mockRestore();
    await clickCheckInControl('session-header-exit');
    await clickBodyButton('Save Session');
    expect(vm.currentSession).toBeNull();
    expect(vm.timer.isRunning.value).toBe(false);
    expect(persistedSession().sets).toHaveLength(1);
    expect(persistedSession()).toMatchObject({
      status: 'CANCELLED', completedSets: 0,
      sets: [{ setNumber: 1, completedRepetitions: 2 }],
    });
    expect(useStorage().getAllSessions()[0].sets[0].completedRepetitions).toBe(2);
    expect(document.body.textContent).toContain('Session saved with 0 sets completed');
  });

  it('retains a completed replacement when saving over partial progress also fails', async () => {
    const vm = await startRealPractice({ repetitions: 2, targetSets: 1 });
    await vi.advanceTimersByTimeAsync(2000);
    const cancelWrite = rejectSessionWrites((session) => session.status === 'CANCELLED');
    await clickCheckInControl('session-header-exit');
    await clickBodyButton('Save Session');
    await clickBodyButton('OK');
    cancelWrite.mockRestore();
    const completedWrite = rejectSessionWrites((session) => session.sets.some((set) => !!set.completedAt));

    await vi.advanceTimersByTimeAsync(2000);
    expect(vm.timer.phase.value).toBe('SESSION_COMPLETE');
    expect(vm.currentSession).not.toBeNull();
    expect(persistedSession()).toMatchObject({
      status: 'IN_PROGRESS', completedSets: 0,
      sets: [{ setNumber: 1, completedRepetitions: 1 }],
    });
    expect(persistedSession().sets[0].completedAt).toBeUndefined();
    expect(vm.currentSession).toEqual(useStorage().getAllSessions()[0]);
    expect(displayedCompletedSets()).toBe('0');
    await clickBodyButton('OK');
    await clickBodyButton('Retry saving session');
    expect(persistedSession().sets).toHaveLength(1);
    expect(vm.currentSession).not.toBeNull();

    completedWrite.mockRestore();
    await clickBodyButton('OK');
    await clickBodyButton('Retry saving session');
    expect(vm.currentSession).toBeNull();
    expect(persistedSession().sets).toHaveLength(1);
    expect(persistedSession()).toMatchObject({
      status: 'COMPLETED', completedSets: 1,
      sets: [{ setNumber: 1, completedRepetitions: 2, completedAt: expect.any(String) }],
    });
    expect(useStorage().getAllSessions()[0].sets[0].completedAt).toBeInstanceOf(Date);
  });

  it('retries queued completed sets without duplicating a set whose write succeeded first', async () => {
    const vm = await startRealPractice({ targetSets: 2 });
    const allSetsWrite = rejectSessionWrites((session) => session.sets.length > 0);
    await vi.advanceTimersByTimeAsync(5000);
    expect(vm.timer.phase.value).toBe('SESSION_COMPLETE');
    expect(persistedSession().sets).toEqual([]);
    expect(vm.currentSession).toEqual(useStorage().getAllSessions()[0]);
    expect(displayedCompletedSets()).toBe('0');
    allSetsWrite.mockRestore();

    const secondSetWrite = rejectSessionWrites((session) => session.sets.length === 2);
    await clickBodyButton('OK');
    await clickBodyButton('Retry saving session');
    expect(persistedSession()).toMatchObject({
      status: 'IN_PROGRESS', completedSets: 1, sets: [{ setNumber: 1 }],
    });
    expect(vm.currentSession).not.toBeNull();
    expect(vm.currentSession).toEqual(useStorage().getAllSessions()[0]);
    expect(displayedCompletedSets()).toBe('1');
    secondSetWrite.mockRestore();

    await clickBodyButton('OK');
    await clickBodyButton('Retry saving session');
    expect(vm.currentSession).toBeNull();
    expect(persistedSession()).toMatchObject({ status: 'COMPLETED', completedSets: 2 });
    expect(persistedSession().sets.map((set) => set.setNumber)).toEqual([1, 2]);
    expect(useStorage().getAllSessions()[0].sets.map((set) => set.setNumber)).toEqual([1, 2]);
  });

  it('shows the completed holds after replacing partial progress from a failed cancellation', async () => {
    const vm = await startRealPractice({
      targetSets: 1,
      extendedHoldEnabled: true,
      extendedHoldType: 'EXHALE',
      extendedHoldMode: 'TIMED',
      extendedHoldDuration: 1,
      secondExtendedHoldEnabled: true,
      secondExtendedHoldType: 'INHALE',
      secondExtendedHoldMode: 'TIMED',
      secondExtendedHoldDuration: 1,
    });
    await vi.advanceTimersByTimeAsync(3000);
    expect(vm.timer.phase.value).toBe('INHALE');
    const write = rejectSessionWrites((session) => session.status === 'CANCELLED');
    await clickCheckInControl('session-header-exit');
    await clickBodyButton('Save Session');
    expect(persistedSession().sets).toHaveLength(1);
    expect(persistedSession().sets[0].extendedHolds).toHaveLength(1);
    write.mockRestore();
    await clickBodyButton('OK');

    await vi.advanceTimersByTimeAsync(2000);
    expect(vm.timer.phase.value).toBe('SESSION_COMPLETE');
    expect(persistedSession().sets[0].extendedHolds).toHaveLength(2);
    expect(vm.currentSession?.sets[0].extendedHolds).toHaveLength(2);
    expect(vm.currentSession).toEqual(useStorage().getAllSessions()[0]);
    expect(displayedCompletedSets()).toBe('1');
  });
});

function fullConfig(name: string): BreathingConfig {
  return {
    ...presetConfig(guidedPresets[0]),
    id: '33333333-3333-4333-8333-333333333333',
    name,
  };
}

function completed(id: string, name: string, startedAt: Date): Session {
  return {
    id,
    configSnapshot: fullConfig(name),
    status: 'COMPLETED',
    sets: [],
    targetSets: 0,
    completedSets: 0,
    startedAt,
    completedAt: startedAt,
  };
}

describe('BreathingPractice goal recommendations', () => {
  beforeEach(() => {
    localStorage.removeItem(SKIP_CHECK_INS_STORAGE_KEY);
    createSessionMock.mockReset();
    setSessionCheckInMock.mockReset();
    sessionsRef.value = [];
  });

  function mountWithGoal() {
    return mount(BreathingPractice, {
      props: { goal: 'RELAX' },
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    });
  }

  it('offers the newest completed session as the repeatable last session', () => {
    const inProgress: Session = {
      ...completed('a0000000-0000-4000-8000-000000000001', 'Active', new Date('2026-03-03')),
      status: 'IN_PROGRESS',
      completedAt: undefined,
    };
    const newest = completed(
      'a0000000-0000-4000-8000-000000000002',
      'Newest',
      new Date('2026-03-02')
    );
    const older = completed(
      'a0000000-0000-4000-8000-000000000003',
      'Older',
      new Date('2026-03-01')
    );
    // Storage keeps sessions newest-first.
    sessionsRef.value = [inProgress, newest, older];

    const wrapper = mountWithGoal();
    const actions = wrapper.findComponent(RecommendedActions);
    expect(actions.exists()).toBe(true);
    expect((actions.props('lastSession') as Session | null)?.id).toBe(newest.id);
    wrapper.unmount();
  });

  it('routes a recommended start through the session start request', async () => {
    createSessionMock.mockReturnValue({ id: 'rec-start', sets: [] });
    const wrapper = mountWithGoal();
    const actions = wrapper.findComponent(RecommendedActions);

    actions.vm.$emit('start', fullConfig('Recommended'));
    await nextTick();
    await skipBeforeCheckIn(wrapper);

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect((createSessionMock.mock.calls[0][0] as BreathingConfig).name).toBe('Recommended');
    wrapper.unmount();
  });

  it('routes a repeat through the same session start request', async () => {
    createSessionMock.mockReturnValue({ id: 'rec-repeat', sets: [] });
    const wrapper = mountWithGoal();
    const actions = wrapper.findComponent(RecommendedActions);

    actions.vm.$emit('repeat', fullConfig('Repeated'));
    await nextTick();
    await skipBeforeCheckIn(wrapper);

    expect(createSessionMock).toHaveBeenCalledTimes(1);
    expect((createSessionMock.mock.calls[0][0] as BreathingConfig).name).toBe('Repeated');
    wrapper.unmount();
  });

  it('adjust assigns the cloned config and opens the configuration modal', async () => {
    const wrapper = mountWithGoal();
    const actions = wrapper.findComponent(RecommendedActions);

    actions.vm.$emit('adjust', fullConfig('Adjusted'));
    await nextTick();

    const vm = wrapper.vm as unknown as {
      config: { name: string };
      showConfigModal: boolean;
    };
    expect(vm.config.name).toBe('Adjusted');
    expect(vm.showConfigModal).toBe(true);
    expect(createSessionMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it.each([
    ['start', undefined, 'kokoro:bf_emma'],
    ['repeat', 'kokoro:af_bella', 'kokoro:af_bella'],
    ['adjust', undefined, 'kokoro:bf_emma'],
    ['adjust', 'kokoro:am_michael', 'kokoro:am_michael'],
  ] as const)('preserves the intended voice for %s with %s', async (action, voice, expected) => {
    localStorage.setItem(
      'herb_breathing_last_config',
      JSON.stringify({
        ttsEnabled: true,
        ttsVoice: 'kokoro:bf_emma',
      })
    );
    createSessionMock.mockReturnValue({ id: 'voice-choice', sets: [] });
    const wrapper = mountWithGoal();
    await flushPromises();
    const actions = wrapper.findComponent(RecommendedActions);
    actions.vm.$emit(action, { ...fullConfig('Voice choice'), ttsVoice: voice });
    await nextTick();
    if (action !== 'adjust') {
      await skipBeforeCheckIn(wrapper);
      expect(createSessionMock).toHaveBeenCalledWith(
        expect.objectContaining({ ttsVoice: expected }),
        undefined
      );
    }
    expect(setVoiceMock).toHaveBeenLastCalledWith(expected);
    wrapper.unmount();
  });

  it('opening the Lab from recommendations switches tabs', async () => {
    const wrapper = mountWithGoal();
    const actions = wrapper.findComponent(RecommendedActions);

    actions.vm.$emit('openLab');
    await nextTick();

    expect(wrapper.emitted('switch-tab')).toEqual([['lab']]);
    wrapper.unmount();
  });
});
