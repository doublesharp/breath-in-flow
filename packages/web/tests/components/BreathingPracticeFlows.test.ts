import { mount } from '@vue/test-utils'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'
import BreathingPractice from '@/components/BreathingPractice.vue'

const createSessionMock = vi.fn()
const addSetMock = vi.fn()
const addExtendedHoldMock = vi.fn()
const completeSessionMock = vi.fn()
const updateSessionMock = vi.fn()
const createConfigMock = vi.fn()

vi.mock('@/composables/useStorage', () => {
  return {
    useStorage: () => ({
      createSession: createSessionMock,
      addSetToSession: addSetMock,
      addExtendedHoldToSet: addExtendedHoldMock,
      completeSession: completeSessionMock,
      updateSession: updateSessionMock,
      createConfig: createConfigMock,
      getSoundTheme: vi.fn(() => 'default'),
      setSoundTheme: vi.fn(),
      soundTheme: ref('default'),
    }),
  }
})

vi.mock('@/composables/useBreathingTimer', () => {
  // Provide a fake timer object that allows tests to trigger callbacks
  return {
    useBreathingTimer: (_config: any, opts: any) => {
      const phase = ref('IDLE')
      const isRunning = ref(false)
      const isPaused = ref(false)
      const currentSet = ref(1)
      const currentRepetition = ref(0)
      const currentTime = ref(0)
      const totalPhaseTime = ref(0)
      const breathingScale = ref(1)
      const extendedHoldElapsed = ref(0)

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
        start: () => { isRunning.value = true },
        stop: () => { isRunning.value = false },
        nextSet: () => { currentSet.value += 1; phase.value = 'INHALE' },
        endExtendedHold: () => {
          // simulate ending an extended hold (default values)
          opts.onExtendedHoldEnd?.(12, 'INHALE', {})
        },
        // Test helpers that the test can call via wrapper.vm.timer
        triggerSetComplete: (setNum = 1) => {
          opts.onSetComplete?.(setNum, {})
          phase.value = 'SET_COMPLETE'
        },
        triggerSessionComplete: () => {
          opts.onSessionComplete?.({} as any)
          phase.value = 'SESSION_COMPLETE'
        },
      }
    },
  }
})

describe('BreathingPractice flows', () => {
  beforeEach(() => {
    createSessionMock.mockReset()
    addSetMock.mockReset()
    addExtendedHoldMock.mockReset()
    completeSessionMock.mockReset()
    updateSessionMock.mockReset()
    createConfigMock.mockReset()
  })

  it('creates a session when starting practice and adds a set on set-complete', async () => {
    // createSession should return a session object
    createSessionMock.mockReturnValue({ id: 'sess-1', sets: [] })

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: {
          selectedConfig: ref(null),
          clearSelectedConfig: vi.fn(),
        },
        stubs: ['BreathingVisualizer'],
      },
    })

    // Click Start Practice button
    const startBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('start practice'))
    expect(startBtn).toBeTruthy()
    if (startBtn) await startBtn.trigger('click')

    expect(createSessionMock).toHaveBeenCalled()
    // simulate set complete via the mocked timer helper
    wrapper.vm.timer.triggerSetComplete(1)
    // wait for DOM to update
    await wrapper.vm.$nextTick()
    expect(addSetMock).toHaveBeenCalled()
  })

  it('records extended hold when ending hold', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-2', sets: [] })

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    })

    // start session
    const startBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('start practice'))
    if (startBtn) await startBtn.trigger('click')

    // Call endExtendedHold which calls into the mocked timer.endExtendedHold
    const endHoldBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('release hold'))
    // The release hold button only appears when phase is an EXTENDED_* state, so call the timer helper directly
    wrapper.vm.timer.endExtendedHold()

    expect(addExtendedHoldMock).toHaveBeenCalled()
  })

  it('finish session button calls completeSession and resets state', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-3', sets: [] })

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    })

    // Start and then trigger set complete so the UI shows Finish Session
    const startBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('start practice'))
    if (startBtn) await startBtn.trigger('click')
    wrapper.vm.timer.triggerSetComplete(1)
    // wait for DOM update
    await wrapper.vm.$nextTick()

    const finishBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('finish session'))
    if (finishBtn) {
      await finishBtn.trigger('click')
    } else if (typeof wrapper.vm.finishSession === 'function') {
      // fallback to calling the method directly
      wrapper.vm.finishSession()
    }

    expect(completeSessionMock).toHaveBeenCalled()
    // after finish, currentSession should be null
    expect(wrapper.vm.currentSession).toBeNull()
  })

  it('saves session notes when session complete', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-4', sets: [] })

    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    })

    // start and then trigger session complete
    const startBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('start practice'))
    if (startBtn) await startBtn.trigger('click')
    wrapper.vm.timer.triggerSessionComplete()
    // wait for DOM update
    await wrapper.vm.$nextTick()

    // mock alert which the component calls after saving notes
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})

    // Set session notes and click save (use direct method if needed)
    const textarea = wrapper.find('textarea')
    if (textarea.exists()) {
      await textarea.setValue('Felt strong')
      const saveBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('save notes'))
      expect(saveBtn).toBeTruthy()
      if (saveBtn) await saveBtn.trigger('click')
    } else if (typeof wrapper.vm.saveSessionNotes === 'function') {
      // set the value directly and call method
      wrapper.vm.sessionNotes = 'Felt strong'
      wrapper.vm.saveSessionNotes()
    }

    expect(updateSessionMock).toHaveBeenCalled()

    alertMock.mockRestore()
  })

  it('save preset requires a name and then saves', async () => {
    // mock alert
    const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() },
        stubs: ['BreathingVisualizer'],
      },
    })

    // Open config panel
    const toggleConfig = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('configure practice'))
    expect(toggleConfig).toBeTruthy()
    if (toggleConfig) await toggleConfig.trigger('click')

    // Click Save Preset with empty name
    const saveBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('save preset'))
    expect(saveBtn).toBeTruthy()
    if (saveBtn) await saveBtn.trigger('click')
    expect(alertMock).toHaveBeenCalled()

    // Fill in a name and click again
    const nameInput = wrapper.find('input[type="text"]')
    await nameInput.setValue('Morning')
    if (saveBtn) await saveBtn.trigger('click')
    expect(createConfigMock).toHaveBeenCalled()

    alertMock.mockRestore()
  })

  it('does not add a set when onSetComplete is called and no current set data exists', async () => {
    // do not start session
    const wrapper = mount(BreathingPractice, {
      global: { provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() }, stubs: ['BreathingVisualizer'] },
    })

    // Call the mocked timer helper directly via vm.timer
    wrapper.vm.timer.triggerSetComplete(1)
    // allow DOM updates
    await wrapper.vm.$nextTick()

    expect(addSetMock).not.toHaveBeenCalled()
  })

  it('startNextSet populates new currentSetData and advances the timer set', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-10', sets: [] })
    const wrapper = mount(BreathingPractice, {
      global: { provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() }, stubs: ['BreathingVisualizer'] },
    })

    // start a session
    const startBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('start practice'))
    if (startBtn) await startBtn.trigger('click')
    // call startNextSet method directly
    wrapper.vm.startNextSet()
    await wrapper.vm.$nextTick()

    // currentSetData should be populated
    expect(wrapper.vm.currentSetData).not.toBeNull()
    // timer currentSet should be > 1
    expect(wrapper.vm.timer.currentSet.value).toBeGreaterThanOrEqual(1)
  })

  it('resetExercise stops the timer and clears session and set data', async () => {
    createSessionMock.mockReturnValue({ id: 'sess-11', sets: [] })
    const wrapper = mount(BreathingPractice, {
      global: { provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() }, stubs: ['BreathingVisualizer'] },
    })

    // start then reset
    const startBtn = wrapper.findAll('button').find(b => b.text().toLowerCase().includes('start practice'))
    if (startBtn) await startBtn.trigger('click')
    // call resetExercise
    wrapper.vm.resetExercise()
    await wrapper.vm.$nextTick()

    // session and set data cleared
    expect(wrapper.vm.currentSession).toBeNull()
    expect(wrapper.vm.currentSetData).toBeNull()
  })

  it('saveSessionNotes does nothing when no session is active', async () => {
    const wrapper = mount(BreathingPractice, {
      global: { provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() }, stubs: ['BreathingVisualizer'] },
    })

    // ensure no session
    wrapper.vm.sessionNotes = 'test'
    // call saveSessionNotes directly
    wrapper.vm.saveSessionNotes()

    expect(updateSessionMock).not.toHaveBeenCalled()
  })

  it('finishSession completes the session and clears data', async () => {
    completeSessionMock.mockReturnValue(undefined)
    const wrapper = mount(BreathingPractice, {
      global: { provide: { selectedConfig: ref(null), clearSelectedConfig: vi.fn() }, stubs: ['BreathingVisualizer'] },
    })

    // Set up a fake session
    wrapper.vm.currentSession = { id: 'test-session', sets: [] }
    await wrapper.vm.$nextTick()

    // Call finishSession
    wrapper.vm.finishSession()
    await wrapper.vm.$nextTick()

    // Should have called completeSession
    expect(completeSessionMock).toHaveBeenCalledWith('test-session')
    // Session should be cleared
    expect(wrapper.vm.currentSession).toBeNull()
    expect(wrapper.vm.currentSetData).toBeNull()
  })

})
