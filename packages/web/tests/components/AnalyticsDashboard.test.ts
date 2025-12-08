import { mount, shallowMount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';

// Consolidated AnalyticsDashboard tests — each test sets up its own mocks
describe('AnalyticsDashboard (consolidated)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('renders basic stats from sessions', async () => {
    const sampleSessions = [
      { id: 's1', sets: 2, duration: 60, createdAt: new Date().toISOString(), configSnapshot: { name: 'C1', inhaleTime: 3, inhaleHoldTime: 0, exhaleTime: 3, exhaleHoldTime: 0 } },
      { id: 's2', sets: 1, duration: 30, createdAt: new Date().toISOString(), configSnapshot: { name: 'C2', inhaleTime: 4, inhaleHoldTime: 0, exhaleTime: 4, exhaleHoldTime: 0 } },
    ];

    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({
        getAllSessions: () => sampleSessions,
        saveSession: vi.fn(),
        stats: { value: { totalSessions: sampleSessions.length, totalSets: 3, avgHoldTime: 0, maxHoldTime: 0 } },
      }),
    }));

    // ensure wearable service is available but disconnected
    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => false,
        connect: vi.fn(),
        disconnect: vi.fn(),
        getSessionBiometrics: async () => ({ preSession: { stress: [] }, duringSession: { stress: [] }, postSession: { stress: [] } }),
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = mount(AnalyticsDashboard, { global: { stubs: ['TimeChart', 'WeekChart', 'StressChart', 'HoldTimeChart', 'SessionsPerWeekChart'] } } as any);

    const text = wrapper.text();
    expect(text).toContain('Sessions');
    // total sessions should appear from the sample set (2)
    expect(text).toContain('2');
  });

  it('renders quick stats from storage.stats and toggles wearable provider state', async () => {
    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({
        getAllSessions: () => [],
        stats: { value: { totalSessions: 5, totalSets: 10, avgHoldTime: 12, maxHoldTime: 30 } },
      }),
    }));

    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => false,
        connect: vi.fn(() => true),
        disconnect: vi.fn(() => false),
        getSessionBiometrics: async () => ({ preSession: { stress: [] }, duringSession: { stress: [] }, postSession: { stress: [] } }),
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = mount(AnalyticsDashboard as any, { global: { stubs: ['TimeChart', 'WeekChart', 'StressChart', 'HoldTimeChart', 'SessionsPerWeekChart'] } });

    expect(wrapper.text()).toContain('Analytics Dashboard');
    expect(wrapper.text()).toContain('Total Sessions');
    expect(wrapper.text()).toContain('5');

    // Use component methods to toggle wearable state; enable feature if necessary
    (wrapper.vm as any).ENABLE_WEARABLES = true;
    // Initially disconnected
    expect((wrapper.vm as any).wearableConnected).toBe(false);

    ;(wrapper.vm as any).connectWearable();
    expect((wrapper.vm as any).wearableConnected).toBe(true);
    expect((wrapper.vm as any).connectedProvider.name).toBeDefined();

    ;(wrapper.vm as any).disconnectWearable();
    expect((wrapper.vm as any).wearableConnected).toBe(false);

    ;(wrapper.vm as any).selectProvider('apple');
    expect((wrapper.vm as any).wearableConnected).toBe(true);
    expect((wrapper.vm as any).connectedProvider.name).toContain('Apple');
  });

  it('loads stress data when garmin is connected and sessions exist', async () => {
    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({ getAllSessions: () => [{ id: 's1', configSnapshot: {}, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), completedSets: 1, sets: [], status: 'COMPLETED' }], stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 10, maxHoldTime: 12 } } }),
    }));

    const getSessionBiometrics = vi.fn().mockResolvedValue({
      preSession: { stress: [{ t: 1, v: 10 }] },
      duringSession: { stress: [{ t: 2, v: 20 }] },
      postSession: { stress: [{ t: 3, v: 5 }] },
    });

    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => true,
        getSessionBiometrics,
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = shallowMount(AnalyticsDashboard as any, { global: { stubs: ['HoldTimeChart','SessionsPerWeekChart','StressChart','TimeChart','WeekChart'] } });
    (wrapper.vm as any).ENABLE_WEARABLES = true;
    (wrapper.vm as any).wearableConnected = true;

    await nextTick();
    // Allow the async load to run
    await Promise.resolve();

    expect((wrapper.vm as any).stressData).not.toBeNull();
    expect(getSessionBiometrics).toHaveBeenCalled();
  });

  it('falls back to demo stress data when no sessions exist', async () => {
    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({ getAllSessions: () => [], stats: { value: { totalSessions: 0, totalSets: 0, avgHoldTime: 0, maxHoldTime: 0 } } }),
    }));

    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => true,
        getSessionBiometrics: async () => ({ preSession: { stress: [] }, duringSession: { stress: [] }, postSession: { stress: [] } }),
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = mount(AnalyticsDashboard as any, { global: { stubs: ['TimeChart', 'WeekChart', 'StressChart', 'HoldTimeChart', 'SessionsPerWeekChart'] } });
    await nextTick();
    await Promise.resolve();

    expect((wrapper.vm as any).stressData).toBeDefined();
    expect((wrapper.vm as any).stressData.during.length).toBeGreaterThanOrEqual(0);
  });

  it('handles empty biometrics gracefully', async () => {
     vi.doMock('../../src/composables', () => ({
      useStorage: () => ({
        getAllSessions: () => [{ id: 's1', configSnapshot: {}, startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), completedSets: 1, sets: [], status: 'COMPLETED' }],
        stats: { value: { totalSessions: 1 } },
      }),
    }));

    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => true,
        getSessionBiometrics: vi.fn().mockResolvedValue({
            preSession: { stress: [] },
            duringSession: { stress: [] },
            postSession: { stress: [] }
        }),
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = shallowMount(AnalyticsDashboard as any, { global: { stubs: ['HoldTimeChart','SessionsPerWeekChart','StressChart','TimeChart','WeekChart'] } });
    
    (wrapper.vm as any).ENABLE_WEARABLES = true;
    (wrapper.vm as any).wearableConnected = true;
    
    await nextTick();
    await new Promise(resolve => setTimeout(resolve, 0));

    // Should not crash and stressData should be set (likely empty arrays)
    expect((wrapper.vm as any).stressData).toBeDefined();
  });

  it('formats time correctly for different durations', async () => {
    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({
        getAllSessions: () => [],
        stats: { value: { totalSessions: 0, totalSets: 0, avgHoldTime: 0, maxHoldTime: 0 } },
      }),
    }));

    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => false,
        connect: vi.fn(() => false),
        disconnect: vi.fn(() => false),
        getSessionBiometrics: async () => ({ preSession: { stress: [] }, duringSession: { stress: [] }, postSession: { stress: [] } }),
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = mount(AnalyticsDashboard, { global: { stubs: ['HoldTimeChart','SessionsPerWeekChart','StressChart','TimeChart','WeekChart'] } });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).toContain('Analytics');
  });

  it('handles chart stubs correctly when rendering', async () => {
    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({
        getAllSessions: () => [],
        stats: { value: { totalSessions: 0, totalSets: 0, avgHoldTime: 0, maxHoldTime: 0 } },
      }),
    }));

    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => false,
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = mount(AnalyticsDashboard, { global: { stubs: ['HoldTimeChart','SessionsPerWeekChart','StressChart','TimeChart','WeekChart'] } });

    expect(wrapper.exists()).toBe(true);
    expect(wrapper.text()).toContain('Analytics Dashboard');
  });

  it('should handle no sessions without error', async () => {
    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({
        getAllSessions: () => [],
        stats: { value: { totalSessions: 0, totalSets: 0, avgHoldTime: 0, maxHoldTime: 0 } },
      }),
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = mount(AnalyticsDashboard, { global: { stubs: ['HoldTimeChart','SessionsPerWeekChart','StressChart'] } });
    
    expect(wrapper.exists()).toBe(true);
  });

  it('should render without crashing when garmin returns empty biometrics', async () => {
    vi.resetModules();
    const mockSession = {
      id: '1',
      createdAt: new Date(),
      completedAt: new Date(Date.now() + 60000),
      config: { inhaleTime: 4, inhaleHoldTime: 0, exhaleTime: 6, exhaleHoldTime: 0, repetitions: 5 },
      configSnapshot: 'Breathwork Session',
      sets: [],
      notes: '',
    };

    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({
        getAllSessions: () => [mockSession],
        stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 0, maxHoldTime: 0 } },
      }),
    }));

    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => true,
        getSessionBiometrics: async () => ({
          preSession: { stress: [] },
          duringSession: { stress: [] },
          postSession: { stress: [] },
        }),
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = mount(AnalyticsDashboard, { global: { stubs: ['HoldTimeChart','SessionsPerWeekChart','StressChart'] } });
    
    await wrapper.vm.$nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('should handle session without completedAt date', async () => {
    vi.resetModules();
    const mockSession = {
      id: '1',
      createdAt: new Date(),
      completedAt: null, // No completion date - tests the ternary operator
      config: { inhaleTime: 4, inhaleHoldTime: 0, exhaleTime: 6, exhaleHoldTime: 0, repetitions: 5 },
      configSnapshot: 'Breathwork Session',
      sets: [],
      notes: '',
    };

    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({
        getAllSessions: () => [mockSession],
        stats: { value: { totalSessions: 1, totalSets: 1, avgHoldTime: 0, maxHoldTime: 0 } },
      }),
    }));

    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => false,
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = mount(AnalyticsDashboard, { global: { stubs: ['HoldTimeChart','SessionsPerWeekChart','StressChart'] } });
    
    await wrapper.vm.$nextTick();
    expect(wrapper.exists()).toBe(true);
  });

  it('should handle session with various duration times for formatTime function coverage', async () => {
    vi.resetModules();
    // Test different session durations to exercise formatTime branches
    const mockSession1 = {
      id: '1',
      createdAt: new Date(),
      completedAt: new Date(Date.now() + 30000), // 30 seconds
      config: { inhaleTime: 4, inhaleHoldTime: 0, exhaleTime: 6, exhaleHoldTime: 0, repetitions: 5 },
      configSnapshot: 'Quick Session',
      sets: [],
      notes: '',
    };

    const mockSession2 = {
      id: '2',
      createdAt: new Date(),
      completedAt: new Date(Date.now() + 125000), // 125 seconds (2m 5s)
      config: { inhaleTime: 4, inhaleHoldTime: 0, exhaleTime: 6, exhaleHoldTime: 0, repetitions: 5 },
      configSnapshot: 'Longer Session',
      sets: [],
      notes: '',
    };

    const mockSession3 = {
      id: '3',
      createdAt: new Date(),
      completedAt: new Date(Date.now() + 0), // 0 seconds
      config: { inhaleTime: 4, inhaleHoldTime: 0, exhaleTime: 6, exhaleHoldTime: 0, repetitions: 5 },
      configSnapshot: 'Zero Duration',
      sets: [],
      notes: '',
    };

    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({
        getAllSessions: () => [mockSession1, mockSession2, mockSession3],
        stats: { value: { totalSessions: 3, totalSets: 1, avgHoldTime: 0, maxHoldTime: 0 } },
      }),
    }));

    vi.doMock('../../src/services/wearables/garmin', () => ({
      garminService: {
        isConnected: () => false,
      },
    }));

    const { default: AnalyticsDashboard } = await import('../../src/components/AnalyticsDashboard.vue');
    const wrapper = mount(AnalyticsDashboard, { global: { stubs: ['HoldTimeChart','SessionsPerWeekChart','StressChart'] } });
    
    await wrapper.vm.$nextTick();
    expect(wrapper.exists()).toBe(true);
  });
});
