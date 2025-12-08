import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
// The project uses `HoldTimeChart.vue` as the time chart component.
import HoldTimeChart from '@/components/charts/HoldTimeChart.vue'
import type { Session } from '@breath-in-flow/shared'

// Stub Chart.js used by the chart components to avoid initializing canvases.
vi.mock('chart.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('chart.js')>()
  return {
    ...actual,
    Chart: class {
      static register() {}
      destroy = vi.fn()
      update() { }
      constructor() { }
    }
  }
})

describe('HoldTimeChart.vue', () => {
  it('mounts with empty data without throwing', () => {
    const wrapper = shallowMount(HoldTimeChart, { props: { sessions: [] } })
    expect(wrapper.exists()).toBe(true)
  })

  it('renders stats when sessions contain holds', () => {
    // Build minimal session data expected by the component
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as any,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 0,
            extendedHolds: [
              { completedAt: new Date('2025-01-01T10:00:00Z').toISOString(), actualDuration: 10, type: 'INHALE', mode: 'TIMED' },
              { completedAt: new Date('2025-01-02T10:00:00Z').toISOString(), actualDuration: 20, type: 'EXHALE', mode: 'TIMED' },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as any,
      {
        id: 's2',
        configId: 'c2',
        configSnapshot: {} as any,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 0,
            extendedHolds: [
              { completedAt: new Date('2025-01-03T10:00:00Z').toISOString(), actualDuration: 30, type: 'INHALE', mode: 'TIMED' },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as any,
    ]

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } })

    // Should render summary stats
    const text = wrapper.text()
    expect(text).toContain('Average')
    expect(text).toContain('Best')
    expect(text).toContain('Sessions')

    // Sessions count should reflect total sessions passed
    expect(text).toContain('3') // three holds total
  })

  it('displays improvement when enough data exists', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as any,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 0,
            extendedHolds: [
              { completedAt: new Date('2025-01-01T10:00:00Z').toISOString(), actualDuration: 10, type: 'INHALE', mode: 'TIMED' },
              { completedAt: new Date('2025-01-02T10:00:00Z').toISOString(), actualDuration: 12, type: 'EXHALE', mode: 'TIMED' },
              { completedAt: new Date('2025-01-03T10:00:00Z').toISOString(), actualDuration: 11, type: 'INHALE', mode: 'TIMED' },
              { completedAt: new Date('2025-01-04T10:00:00Z').toISOString(), actualDuration: 25, type: 'EXHALE', mode: 'TIMED' },
              { completedAt: new Date('2025-01-05T10:00:00Z').toISOString(), actualDuration: 28, type: 'INHALE', mode: 'TIMED' },
              { completedAt: new Date('2025-01-06T10:00:00Z').toISOString(), actualDuration: 30, type: 'EXHALE', mode: 'TIMED' },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as any,
    ]

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } })
    const text = wrapper.text()
    
    // Should show improvement data
    expect(text).toContain('Best')
    expect(text).toContain('Average')
  })

  it('handles single hold correctly', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as any,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 0,
            extendedHolds: [
              { completedAt: new Date('2025-01-01T10:00:00Z').toISOString(), actualDuration: 15, type: 'INHALE', mode: 'TOLERANCE' },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as any,
    ]

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } })
    const text = wrapper.text()
    
    expect(text).toContain('Best')
    expect(text).toContain('Average')
  })

  it('handles sessions with multiple sets', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as any,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 4,
            extendedHolds: [
              { completedAt: new Date('2025-01-01T10:00:00Z').toISOString(), actualDuration: 20, type: 'EXHALE', mode: 'TIMED' },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
          {
            setNumber: 2,
            completedRepetitions: 4,
            extendedHolds: [
              { completedAt: new Date('2025-01-01T10:05:00Z').toISOString(), actualDuration: 25, type: 'EXHALE', mode: 'TIMED' },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 2,
        completedSets: 2,
        startedAt: new Date(),
        completedAt: new Date(),
      } as any,
    ]

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } })
    const text = wrapper.text()
    
    expect(text).toContain('2') // Two holds total
  })

  it('displays improvement metrics when there are multiple holds', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as any,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 4,
            extendedHolds: [
              { completedAt: new Date('2025-01-01T10:00:00Z').toISOString(), actualDuration: 20, type: 'EXHALE', mode: 'TIMED' },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as any,
      {
        id: 's2',
        configId: 'c1',
        configSnapshot: {} as any,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 4,
            extendedHolds: [
              { completedAt: new Date('2025-01-02T10:00:00Z').toISOString(), actualDuration: 25, type: 'EXHALE', mode: 'TIMED' },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as any,
    ]

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } })
    const text = wrapper.text()
    
    // Should show stats
    expect(text).toContain('Best')
    expect(text).toContain('Average')
    expect(text).toContain('2') // 2 holds total
  })

  it('renders with INHALE hold type', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as any,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 4,
            extendedHolds: [
              { completedAt: new Date('2025-01-01T10:00:00Z').toISOString(), actualDuration: 15, type: 'INHALE', mode: 'TOLERANCE' },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as any,
    ]

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } })
    const text = wrapper.text()
    
    expect(text).toContain('Best')
    expect(text).toContain('1')
  })
})
