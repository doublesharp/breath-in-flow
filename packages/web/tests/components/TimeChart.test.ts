import { shallowMount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
// The project uses `HoldTimeChart.vue` as the time chart component.
import HoldTimeChart from '@/components/charts/HoldTimeChart.vue'

// Stub Chart.js used by the chart components to avoid initializing canvases.
vi.mock('chart.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('chart.js')>()
  return {
    ...actual,
    Chart: class {
      static register() {}
      constructor() { this.destroy = vi.fn() }
      update() { }
    }
  }
})

describe('HoldTimeChart.vue', () => {
  it('mounts with empty data without throwing', () => {
    const wrapper = shallowMount(HoldTimeChart, { props: { sessions: [] } })
    expect(wrapper.exists()).toBe(true)
  })
})
