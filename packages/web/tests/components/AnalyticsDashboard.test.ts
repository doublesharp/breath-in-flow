import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import AnalyticsDashboard from '@/components/AnalyticsDashboard.vue'

const sampleSessions = [
  { id: 's1', sets: 2, duration: 60, createdAt: new Date().toISOString() },
  { id: 's2', sets: 1, duration: 30, createdAt: new Date().toISOString() },
]

vi.mock('@/composables/useStorage', () => ({
  useStorage: () => ({
    getAllSessions: () => sampleSessions,
    saveSession: vi.fn(),
  }),
}))

vi.mock('@/services/wearables/garmin', () => ({
  garminService: {
    isConnected: () => false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  },
}))

describe('AnalyticsDashboard.vue', () => {
  it('renders basic stats from sessions', () => {
    const wrapper = mount(AnalyticsDashboard, { global: { stubs: ['TimeChart', 'WeekChart', 'StressChart'] } })
    const text = wrapper.text()
    expect(text).toContain('Sessions')
    // Expect the sample session count to be visible somewhere in the rendered output
    expect(text).toContain('2')
  })
})
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import AnalyticsDashboard from '../../src/components/AnalyticsDashboard.vue';

vi.mock('../../src/composables', () => ({
  useStorage: () => ({
    getAllSessions: () => [],
    stats: { value: { totalSessions: 5, totalSets: 10, avgHoldTime: 12, maxHoldTime: 30 } },
  }),
}));

describe('AnalyticsDashboard.vue', () => {
  it('renders quick stats from storage.stats', () => {
    const wrapper = mount(AnalyticsDashboard);
    expect(wrapper.text()).toContain('Analytics Dashboard');
    expect(wrapper.text()).toContain('Total Sessions');
    expect(wrapper.text()).toContain('5');
  });
});
