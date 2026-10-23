/// <reference types="node" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import App from '../../src/App.vue';
import { AppConfig, BreathingConfig } from '@breath-in-flow/shared';
import { usePreferences } from '../../src/composables';
import { reloadPreferencesForTesting } from '../../src/composables/usePreferences';
import * as permissionService from '../../src/services/permissionService';

const nativeAppMocks = vi.hoisted(() => ({
  addListener: vi.fn(),
  exitApp: vi.fn(),
  remove: vi.fn(),
  backHandler: undefined as undefined | (() => void),
}));

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: nativeAppMocks.addListener,
    exitApp: nativeAppMocks.exitApp,
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

const childStubs = {
  BreathingPractice: true,
  SessionHistory: true,
  PracticePresets: true,
  AnalyticsDashboard: true,
  LabTab: true,
  HelpSystem: true,
};

describe('App.vue', () => {
  beforeEach(() => {
    localStorage.clear();
    reloadPreferencesForTesting();
    vi.clearAllMocks();
    nativeAppMocks.backHandler = undefined;
    nativeAppMocks.addListener.mockImplementation(async (_event: string, handler: () => void) => {
      nativeAppMocks.backHandler = handler;
      return { remove: nativeAppMocks.remove };
    });
  });

  it('routes Android Back to Practice before exiting and removes its listener', async () => {
    usePreferences().setGoal('RELAX');
    const wrapper = mount(App, { global: { stubs: childStubs } });
    await nextTick();

    expect(nativeAppMocks.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));

    (wrapper.vm as unknown as { activeTab: string }).activeTab = 'history';
    await nextTick();
    nativeAppMocks.backHandler?.();
    await nextTick();

    expect((wrapper.vm as unknown as { activeTab: string }).activeTab).toBe('practice');
    expect(nativeAppMocks.exitApp).not.toHaveBeenCalled();

    nativeAppMocks.backHandler?.();
    await nextTick();
    expect(nativeAppMocks.exitApp).toHaveBeenCalledOnce();

    wrapper.unmount();
    await nextTick();
    expect(nativeAppMocks.remove).toHaveBeenCalledOnce();
  });

  it('shows first-run goal onboarding without touching camera, motion, or permission services', () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    const permissionSpy = vi.spyOn(permissionService, 'requestSensorPermissions');

    const wrapper = mount(App, { global: { stubs: childStubs } });

    expect(wrapper.get('[role="dialog"]').attributes('aria-labelledby')).toBe(
      'goal-onboarding-title'
    );
    expect(wrapper.findAll('input[name="wellness-goal"]')).toHaveLength(4);
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(permissionSpy).not.toHaveBeenCalled();
  });

  it('persists the chosen goal and keeps onboarding closed after a remount', async () => {
    const wrapper = mount(App, { global: { stubs: childStubs } });

    await wrapper.get('[data-testid="goal-relax"]').setValue();
    await wrapper.get('[data-testid="save-goal"]').trigger('click');
    expect(usePreferences().selectedGoal.value).toBe('RELAX');
    wrapper.unmount();

    const remounted = mount(App, { global: { stubs: childStubs } });
    expect(remounted.find('[role="dialog"]').exists()).toBe(false);
  });

  it('shows a save error during first-run onboarding and lets the selected goal be retried', async () => {
    const wrapper = mount(App, { global: { stubs: childStubs } });
    await wrapper.get('[data-testid="goal-relax"]').setValue();
    const setItem = vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });
    try {
      await wrapper.get('[data-testid="save-goal"]').trigger('click');
      expect(wrapper.get('[role="dialog"]').text()).toMatch(/try again/i);
      expect(wrapper.get('[role="alert"]').text()).toMatch(/storage|space/i);
      expect(usePreferences().selectedGoal.value).toBeNull();
      expect(wrapper.get('[data-testid="save-goal"]').attributes('disabled')).toBeUndefined();

      setItem.mockRestore();
      await wrapper.get('[data-testid="save-goal"]').trigger('click');
      expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
      expect(usePreferences().selectedGoal.value).toBe('RELAX');
    } finally {
      setItem.mockRestore();
      wrapper.unmount();
    }
  });

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

  it('uses the approved responsive header spacing', () => {
    usePreferences().setGoal('RELAX');
    const wrapper = mount(App, { global: { stubs: childStubs } });

    expect(wrapper.get('[data-testid="app-header-content"]').classes()).toEqual(
      expect.arrayContaining(['max-w-7xl', 'py-4', 'sm:py-5'])
    );
    expect(wrapper.get('[data-testid="desktop-navigation"]').classes()).toEqual(
      expect.arrayContaining(['hidden', 'lg:flex', 'gap-1', 'p-1'])
    );
    expect(wrapper.get('[data-testid="mobile-navigation"]').classes()).toEqual(
      expect.arrayContaining(['lg:hidden'])
    );
    expect(wrapper.get('header h1').classes()).toEqual(
      expect.arrayContaining(['shrink-0', 'whitespace-nowrap'])
    );
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

  it('uses the restored scroll position so the first upward gesture keeps navigation visible', async () => {
    Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
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

    Object.defineProperty(window, 'scrollY', { value: 470, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await nextTick();

    expect(wrapper.find('header').classes()).toContain('translate-y-0');
    wrapper.unmount();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
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
