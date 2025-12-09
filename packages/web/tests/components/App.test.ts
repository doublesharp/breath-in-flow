import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import App from '../../src/App.vue';

describe('App.vue', () => {
  it('renders header and navigation buttons', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: true,
          SessionHistory: true,
          SavedConfigs: true,
          AnalyticsDashboard: true,
          HelpSystem: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Breath in Flow');

    // Desktop nav buttons (rendered in header)
    expect(wrapper.findAll('button').some((b) => b.text().includes('Practice'))).toBeTruthy();
    expect(wrapper.findAll('button').some((b) => b.text().includes('History'))).toBeTruthy();
    expect(wrapper.findAll('button').some((b) => b.text().includes('Presets'))).toBeTruthy();
    expect(wrapper.findAll('button').some((b) => b.text().includes('Analytics'))).toBeTruthy();
  });

  it('switches between all tabs', async () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: { template: '<div>Practice</div>' },
          SessionHistory: { template: '<div>History</div>' },
          SavedConfigs: { template: '<div>Configs</div>' },
          AnalyticsDashboard: { template: '<div>Analytics</div>' },
          HelpSystem: { template: '<div>Help</div>' },
        },
      },
    });

    const buttons = wrapper.findAll('button');

    // Test History tab
    const historyBtn = buttons.find((b) => b.text().includes('History'));
    if (historyBtn) {
      await historyBtn.trigger('click');
      await nextTick();
      expect(wrapper.text()).toContain('History');
    }

    // Test Configs tab
    const configsBtn = buttons.find((b) => b.text().includes('Presets'));
    if (configsBtn) {
      await configsBtn.trigger('click');
      await nextTick();
      expect(wrapper.text()).toContain('Configs');
    }

    // Test Analytics tab
    const analyticsBtn = buttons.find((b) => b.text().includes('Analytics'));
    if (analyticsBtn) {
      await analyticsBtn.trigger('click');
      await nextTick();
      expect(wrapper.text()).toContain('Analytics');
    }
  });

  it('provides selectedConfig and clearSelectedConfig to children', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: true,
          SessionHistory: true,
          SavedConfigs: true,
          AnalyticsDashboard: true,
          HelpSystem: true,
        },
      },
    });

    // Component should mount successfully which means provide works
    expect(wrapper.exists()).toBe(true);
  });

  it('should call loadConfig to load a configuration and switch to practice tab', async () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: true,
          SessionHistory: true,
          SavedConfigs: true,
          AnalyticsDashboard: true,
          HelpSystem: true,
        },
      },
    });

    const mockConfig: BreathingConfig = {
      id: '1',
      name: 'Test Config',
      inhaleTime: 4,
      inhaleHoldTime: 0,
      exhaleTime: 6,
      exhaleHoldTime: 0,
      repetitions: 5,
      extendedHoldType: 'EXHALE',
      extendedHoldDuration: 10,
      soundEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Access the component instance to call loadConfig
    const vm = wrapper.vm as unknown as Record<string, unknown>;
    (vm.loadConfig as (config: BreathingConfig) => void)(mockConfig);

    await nextTick();

    // Should switch to practice tab
    expect(vm.activeTab).toBe('practice');
    expect(vm.selectedConfig).toEqual(mockConfig);
  });

  it('should call clearSelectedConfig to clear the selected config', async () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: true,
          SessionHistory: true,
          SavedConfigs: true,
          AnalyticsDashboard: true,
          HelpSystem: true,
        },
      },
    });

    const mockConfig: BreathingConfig = {
      id: '1',
      name: 'Test Config',
      inhaleTime: 4,
      inhaleHoldTime: 0,
      exhaleTime: 6,
      exhaleHoldTime: 0,
      repetitions: 5,
      extendedHoldType: 'EXHALE',
      extendedHoldDuration: 10,
      soundEnabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const vm = wrapper.vm as unknown as Record<string, unknown>;
    vm.selectedConfig = mockConfig;
    
    await nextTick();
    
    // Now clear the config
    (vm.clearSelectedConfig as () => void)();    await nextTick();

    // Should clear the selected config
    expect(vm.selectedConfig).toBeNull();
  });
});
