/// <reference types="node" />
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { defineComponent, inject, nextTick, type Ref } from 'vue';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import App from '../../src/App.vue';
import { AppConfig, DEFAULT_BREATHING_CONFIG, type BreathingConfig } from '@breath-in-flow/shared';
import { usePreferences } from '../../src/composables';
import { reloadPreferencesForTesting } from '../../src/composables/usePreferences';
import { resetStorageForTesting, useStorage } from '@/composables/useStorage';
import * as permissionService from '../../src/services/permissionService';
import { ttsService } from '@/services/ttsService';
import { LAST_CONFIG_STORAGE_KEY } from '@/constants/storageKeys';

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
    nativeAppMocks.addListener.mockImplementation(async (event: string, handler: () => void) => {
      if (event === 'backButton') nativeAppMocks.backHandler = handler;
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
      expect.arrayContaining(['max-w-7xl', 'py-[10px]', 'sm:py-[12px]', 'flex-wrap'])
    );
    expect(wrapper.get('[data-testid="desktop-navigation"]').classes()).toEqual(
      expect.arrayContaining(['hidden', 'lg:flex', 'gap-[4px]', 'p-[4px]'])
    );
    expect(wrapper.get('[data-testid="mobile-navigation"]').classes()).toEqual(
      expect.arrayContaining(['lg:hidden'])
    );
    expect(wrapper.get('header h1').classes()).toEqual(
      expect.arrayContaining(['min-w-0'])
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
    expect(pulseNavigation[0].text()).toBe('Pulse Variability');
    expect(pulseNavigation[1].text()).toBe('Pulse Variability');
    const suffix = pulseNavigation[1].get('.sm\\:inline');
    expect(suffix.text()).toBe('Variability');
    expect(suffix.classes()).toContain('hidden');
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

  it.each(['desktop', 'mobile'])('switches between all tabs from the %s navigation', async (layout) => {
    usePreferences().setGoal('RELAX');
    const tabViews = [
      ['Pulse Variability', 'Lab view'],
      ['View session history', 'History view'],
      ['Manage breathing presets', 'Presets view'],
      ['View analytics and insights', 'Analytics view'],
      ['Practice breathing exercises', 'Practice view'],
    ];
    const wrapper = mount(App, {
      global: {
        stubs: {
          BreathingPractice: { template: '<div>Practice view</div>' },
          LabTab: { template: '<div>Lab view</div>' },
          SessionHistory: { template: '<div>History view</div>' },
          PracticePresets: { template: '<div>Presets view</div>' },
          AnalyticsDashboard: { template: '<div>Analytics view</div>' },
          HelpSystem: true,
        },
      },
    });

    const nav = wrapper.get(`[data-testid="${layout}-navigation"]`);
    for (const [label, view] of tabViews) {
      const button = nav.get(`button[aria-label="${label}"]`);
      await button.trigger('click');
      expect(button.attributes('aria-current')).toBe('page');
      expect(wrapper.get('main').text()).toBe(view);
    }
  });

  it('provides selectedConfig and clearSelectedConfig to children', async () => {
    usePreferences().setGoal('RELAX');
    const practice = defineComponent({
      setup() {
        return {
          selectedConfig: inject<Ref<BreathingConfig | null>>('selectedConfig'),
          clearSelectedConfig: inject<() => void>('clearSelectedConfig'),
        };
      },
      template: `<div>
        <p data-testid="selection">{{ selectedConfig?.name ?? 'No preset selected' }}</p>
        <button @click="clearSelectedConfig()">Clear selection</button>
      </div>`,
    });
    const preset = { ...DEFAULT_BREATHING_CONFIG, name: 'Evening Reset' };
    const wrapper = mount(App, {
      global: {
        stubs: {
          ...childStubs,
          BreathingPractice: practice,
          PracticePresets: {
            emits: ['loadConfig'],
            setup: () => ({ preset }),
            template: `<button data-testid="load-test-preset" @click="$emit('loadConfig', preset)">Load preset</button>`,
          },
        },
      },
    });

    expect(wrapper.get('[data-testid="selection"]').text()).toBe('No preset selected');
    await wrapper.get('[data-testid="desktop-navigation"] [aria-label="Manage breathing presets"]').trigger('click');
    await wrapper.get('[data-testid="load-test-preset"]').trigger('click');
    expect(wrapper.get('[data-testid="selection"]').text()).toBe('Evening Reset');
    await wrapper.get('main button').trigger('click');
    expect(wrapper.get('[data-testid="selection"]').text()).toBe('No preset selected');
  });

  it('opens Configure Practice with the selected preset and saves changes under its original id', async () => {
    usePreferences().setGoal('RELAX');
    const storage = useStorage();
    const preset = storage.createConfig({ ...DEFAULT_BREATHING_CONFIG, name: 'Evening Reset', inhaleTime: 7 });
    const loadVoices = vi.spyOn(ttsService, 'loadVoices').mockResolvedValue([]);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        stubs: {
          ...childStubs,
          BreathingPractice: false,
          PracticePresets: {
            emits: ['edit-config'],
            setup: () => ({ preset }),
            template: '<button data-testid="edit-test-preset" @click="$emit(\'edit-config\', preset)">Edit preset</button>',
          },
          BreathingVisualizer: true,
          transition: true,
        },
      },
    });

    try {
      await wrapper.get('[data-testid="desktop-navigation"] [aria-label="Manage breathing presets"]').trigger('click');
      await wrapper.get('[data-testid="edit-test-preset"]').trigger('click');
      await flushPromises();

      const dialog = document.body.querySelector('[aria-labelledby="configure-practice-title"]');
      expect(dialog).not.toBeNull();
      const settings = new DOMWrapper(dialog!);
      const name = settings.get('input[aria-label="Preset name"]');
      const inhale = settings.get('#practice-inhale');
      expect(name.element).toHaveProperty('value', 'Evening Reset');
      expect(inhale.element).toHaveProperty('value', '7');
      await name.setValue('Night Reset');
      await inhale.setValue('8');
      await settings.findAll('button').find((button) => button.text() === 'Save Preset')!.trigger('click');
      expect(storage.getAllConfigs()).toEqual([
        expect.objectContaining({ id: preset.id, name: 'Night Reset', inhaleTime: 8 }),
      ]);
    } finally {
      wrapper.unmount();
      loadVoices.mockRestore();
      localStorage.clear();
      resetStorageForTesting();
    }
  });

  it('clears the mounted Practice settings without writing back a pending edit', async () => {
    usePreferences().setGoal('RELAX');
    localStorage.setItem(LAST_CONFIG_STORAGE_KEY, JSON.stringify({ name: 'Custom practice', inhaleTime: 7 }));
    const loadVoices = vi.spyOn(ttsService, 'loadVoices').mockResolvedValue([]);
    const wrapper = mount(App, {
      attachTo: document.body,
      global: {
        stubs: { ...childStubs, BreathingPractice: false, BreathingVisualizer: true },
      },
    });

    try {
      expect(wrapper.get('#practice-title').text()).toBe('Custom practice');
      await wrapper.get('button[title="Configure practice"]').trigger('click');
      await new DOMWrapper(document.body).get('#practice-inhale').setValue('8');

      useStorage().clearPracticeData();
      await flushPromises();

      expect(wrapper.get('#practice-title').text()).toBe('Quick Practice');
      expect(document.body.querySelector('[aria-labelledby="configure-practice-title"]')).toBeNull();
      expect(localStorage.getItem(LAST_CONFIG_STORAGE_KEY)).toBeNull();
    } finally {
      wrapper.unmount();
      loadVoices.mockRestore();
    }
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
