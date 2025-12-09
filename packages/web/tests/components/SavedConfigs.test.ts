import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';

describe('SavedConfigs.vue', () => {
  it('shows empty state when no configs', async () => {
    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({ getAllConfigs: () => [] }),
    }));

    const { default: SavedConfigs } = await import('../../src/components/SavedConfigs.vue');
    const wrapper = mount(SavedConfigs as unknown);
    expect(wrapper.text()).toContain('No saved configurations yet.');
  });

  it('renders config details including hold lines and extended hold info', async () => {
    const now = new Date();
    const config = {
      id: 'c1',
      name: 'Test Config',
      createdAt: now,
      inhaleTime: 4,
      inhaleHoldTime: 3,
      exhaleTime: 5,
      exhaleHoldTime: 2,
      repetitions: 4,
      targetSets: 1,
      extendedHoldEnabled: true,
      extendedHoldType: 'EXHALE',
      extendedHoldMode: 'TIMED',
      extendedHoldDuration: 10,
      secondExtendedHoldEnabled: true,
      secondExtendedHoldType: 'INHALE',
      secondExtendedHoldMode: 'TIMED',
    };

    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({ getAllConfigs: () => [config] }),
    }));

    const { default: SavedConfigs } = await import('../../src/components/SavedConfigs.vue');
    const wrapper = mount(SavedConfigs as unknown);
    const text = wrapper.text();

    expect(text).toContain('Test Config');
    expect(text).toContain('+ 3s hold');
    expect(text).toContain('+ 2s hold');
    expect(text).toContain('Extended EXHALE Hold');
    expect(text).toContain('Second INHALE Hold');
  });

  it('calls deleteConfig when confirmed', async () => {
    const deleteMock = vi.fn();
    const config = {
      id: 'c1',
      name: 'ToDelete',
      createdAt: new Date(),
      inhaleTime: 2,
      exhaleTime: 2,
      inhaleHoldTime: 0,
      exhaleHoldTime: 0,
      repetitions: 1,
      targetSets: 0,
      extendedHoldEnabled: false,
    };

    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({ getAllConfigs: () => [config], deleteConfig: deleteMock }),
    }));

    // Mock confirm to return true
    (global as unknown as Record<string, unknown>).confirm = () => true;

    const { default: SavedConfigs } = await import('../../src/components/SavedConfigs.vue');
    const wrapper = mount(SavedConfigs as unknown);

    // Click delete button
    const btn = wrapper.find('button[title="Delete configuration"]');
    await btn.trigger('click');

    expect(deleteMock).toHaveBeenCalledWith('c1');
  });

  it('does not call deleteConfig when user cancels', async () => {
    const deleteMock = vi.fn();
    const config = {
      id: 'c1',
      name: 'ToDelete',
      createdAt: new Date(),
      inhaleTime: 2,
      exhaleTime: 2,
      inhaleHoldTime: 0,
      exhaleHoldTime: 0,
      repetitions: 1,
      targetSets: 0,
      extendedHoldEnabled: false,
    };

    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({ getAllConfigs: () => [config], deleteConfig: deleteMock }),
    }));

    // Mock confirm to return false
    (global as unknown as Record<string, unknown>).confirm = () => false;

    const { default: SavedConfigs } = await import('../../src/components/SavedConfigs.vue');
    const wrapper = mount(SavedConfigs as unknown);

    // Click delete button
    const btn = wrapper.find('button[title="Delete configuration"]');
    await btn.trigger('click');

    expect(deleteMock).not.toHaveBeenCalled();
  });

  it('handles preset configurations loading', async () => {
    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({ getAllConfigs: () => [] }),
    }));

    const { default: SavedConfigs } = await import('../../src/components/SavedConfigs.vue');
    const wrapper = mount(SavedConfigs as unknown);

    // Should display preset section
    expect(wrapper.text()).toContain('Quick Presets');
    // Should have preset buttons for built-in presets
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('emits loadConfig when clicking load button on saved config', async () => {
    vi.resetModules();
    const mockConfig = {
      id: '1',
      name: 'Custom Breathing',
      inhaleTime: 4,
      inhaleHoldTime: 0,
      exhaleTime: 6,
      exhaleHoldTime: 0,
      repetitions: 5,
      extendedHoldEnabled: false,
      targetSets: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({ getAllConfigs: () => [mockConfig], deleteConfig: vi.fn() }),
    }));

    const { default: SavedConfigs } = await import('../../src/components/SavedConfigs.vue');
    const wrapper = mount(SavedConfigs as unknown);

    const loadButtons = wrapper.findAll('button').filter((b) => b.text().includes('Load'));
    if (loadButtons.length > 0) {
      await loadButtons[0].trigger('click');
      const emitted = wrapper.emitted('loadConfig');
      expect(emitted).toBeDefined();
    }
  });

  it('emits loadConfig when clicking preset button', async () => {
    vi.resetModules();
    vi.doMock('../../src/composables', () => ({
      useStorage: () => ({ getAllConfigs: () => [] }),
    }));

    const { default: SavedConfigs } = await import('../../src/components/SavedConfigs.vue');
    const wrapper = mount(SavedConfigs as unknown);

    // Find preset buttons (they should be the ones in "Quick Presets" section)
    const buttons = wrapper.findAll('button');
    const presetButton = buttons.find((b) => b.text().includes('Hold'));

    if (presetButton) {
      await presetButton.trigger('click');
      const emitted = wrapper.emitted('loadConfig');
      expect(emitted).toBeDefined();
    }
  });
});
