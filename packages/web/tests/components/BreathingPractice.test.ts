import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import BreathingPractice from '@/components/BreathingPractice.vue'

const startMock = vi.fn()
const pauseMock = vi.fn()
const isRunning = ref(false)

vi.mock('@/composables/useBreathingTimer', () => {
  return {
    useBreathingTimer: () => ({
      // component expects refs like `phase.value` etc.
      phase: ref('IDLE'),
      currentTime: ref(0),
      totalPhaseTime: ref(0),
      isRunning,
      breathingScale: ref(1.0),
      currentRepetition: ref(1),
      currentSet: ref(1),
      extendedHoldElapsed: ref(0),
      start: startMock,
      pause: pauseMock,
      stop: vi.fn(),
      isPaused: ref(false),
    }),
  }
})

describe('BreathingPractice.vue', () => {
  it('calls start when Start button clicked', async () => {
    isRunning.value = false
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref({}) },
        stubs: ['BreathingVisualizer'],
      },
    })
    const buttons = wrapper.findAll('button')
    const startBtn = buttons.find(b => b.text().toLowerCase().includes('start'))
    expect(startBtn).toBeTruthy()
    if (startBtn) await startBtn.trigger('click')
    expect(startMock).toHaveBeenCalled()
  })

  it('calls pause when Pause button clicked', async () => {
    isRunning.value = true
    const wrapper = mount(BreathingPractice, {
      global: {
        provide: { selectedConfig: ref({}) },
        stubs: ['BreathingVisualizer'],
      },
    })
    const buttons = wrapper.findAll('button')
    const pauseBtn = buttons.find(b => b.text().toLowerCase().includes('pause'))
    if (pauseBtn) await pauseBtn.trigger('click')
    expect(pauseMock).toHaveBeenCalled()
  })
})
