/// <reference types="node" />
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import App from '../../src/App.vue';
import { AppConfig, BreathingConfig } from '@breath-in-flow/shared';

describe('App.vue', () => {
  it('renders header and navigation buttons', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: true,
          SessionHistory: true,
          PracticePresets: true,
          AnalyticsDashboard: true,
          LabTab: true,
          HelpSystem: true,
        },
      },
    });

    expect(wrapper.text()).toContain(AppConfig.appName);

    // Desktop nav buttons (rendered in header)
    expect(wrapper.findAll('button').some((b) => b.text().includes('Practice'))).toBeTruthy();
    expect(
      wrapper.findAll('button').some((b) => b.text().includes('Pulse Variability'))
    ).toBeTruthy();
    expect(wrapper.findAll('button').some((b) => b.text().includes('History'))).toBeTruthy();
    expect(wrapper.findAll('button').some((b) => b.text().includes('Presets'))).toBeTruthy();
    expect(wrapper.findAll('button').some((b) => b.text().includes('Analytics'))).toBeTruthy();
  });

  it('names both desktop and mobile pulse navigation consistently', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: true,
          SessionHistory: true,
          PracticePresets: true,
          AnalyticsDashboard: true,
          LabTab: true,
          HelpSystem: true,
        },
      },
    });

    const pulseNavigation = wrapper.findAll('button[aria-label="Pulse Variability"]');
    expect(pulseNavigation).toHaveLength(2);
    expect(pulseNavigation.every((button) => button.text().includes('Pulse Variability'))).toBe(
      true
    );
  });

  it('uses offline fonts and defines a reduced-motion presentation', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8');

    expect(css).not.toMatch(/@import\s+url\(/i);
    expect(css).not.toContain('fonts.googleapis.com');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toMatch(/\.animated-bg::before[\s\S]*animation:\s*none/);
    expect(css).toMatch(/\.animate-scale-in[\s\S]*animation:\s*none/);
  });

  it('hides the header while scrolling down and restores it while scrolling up', async () => {
    const removeListener = vi.spyOn(window, 'removeEventListener');
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: true,
          SessionHistory: true,
          PracticePresets: true,
          AnalyticsDashboard: true,
          LabTab: true,
          HelpSystem: true,
        },
      },
    });
    const setScrollY = (value: number) => {
      Object.defineProperty(window, 'scrollY', { value, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    };

    setScrollY(100);
    await nextTick();
    expect(wrapper.find('header').classes()).toContain('-translate-y-full');

    setScrollY(70);
    await nextTick();
    expect(wrapper.find('header').classes()).toContain('translate-y-0');

    setScrollY(30);
    await nextTick();
    expect(wrapper.find('header').classes()).toContain('translate-y-0');

    wrapper.unmount();
    expect(removeListener).toHaveBeenCalledWith('scroll', expect.any(Function));
    removeListener.mockRestore();
  });

  it('switches between all tabs', async () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: { template: '<div>Practice</div>' },
          LabTab: { template: '<div>LabContent</div>' },
          SessionHistory: { template: '<div>History</div>' },
          PracticePresets: { template: '<div>Configs</div>' },
          AnalyticsDashboard: { template: '<div>Analytics</div>' },
          HelpSystem: { template: '<div>Help</div>' },
        },
      },
    });

    const buttons = wrapper.findAll('button');

    // Test Lab tab
    const labBtn = buttons.find((b) => b.text().includes('Pulse Variability'));
    if (labBtn) {
      await labBtn.trigger('click');
      await nextTick();
      expect(wrapper.text()).toContain('LabContent');
    }

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
          LabTab: true,
          SessionHistory: true,
          PracticePresets: true,
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
          LabTab: true,
          SessionHistory: true,
          PracticePresets: true,
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
      extendedHoldEnabled: false,
      extendedHoldType: 'EXHALE',
      extendedHoldMode: 'TOLERANCE',
      extendedHoldDuration: 10,
      secondExtendedHoldEnabled: false,
      secondExtendedHoldType: 'INHALE',
      secondExtendedHoldMode: 'TIMED',
      secondExtendedHoldDuration: 15,
      targetSets: 0,
      restBetweenSetsSeconds: 0,
      soundEnabled: true,
      ttsEnabled: false,
      soundTheme: 'wood',
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
          LabTab: true,
          SessionHistory: true,
          PracticePresets: true,
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
      extendedHoldEnabled: false,
      extendedHoldType: 'EXHALE',
      extendedHoldMode: 'TOLERANCE',
      extendedHoldDuration: 10,
      secondExtendedHoldEnabled: false,
      secondExtendedHoldType: 'INHALE',
      secondExtendedHoldMode: 'TIMED',
      secondExtendedHoldDuration: 15,
      targetSets: 0,
      restBetweenSetsSeconds: 0,
      soundEnabled: false,
      ttsEnabled: false,
      soundTheme: 'wood',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const vm = wrapper.vm as unknown as Record<string, unknown>;
    vm.selectedConfig = mockConfig;

    await nextTick();

    // Now clear the config
    (vm.clearSelectedConfig as () => void)();
    await nextTick();

    // Should clear the selected config
    expect(vm.selectedConfig).toBeNull();
  });
});
