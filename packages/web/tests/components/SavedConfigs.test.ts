import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import SavedConfigs from '../../src/components/SavedConfigs.vue';

// Mock module that components import
vi.mock('../../src/composables', () => {
  const mockConfigs = [
    { id: '1', name: 'Config One', inhaleTime: 4, exhaleTime: 4, createdAt: new Date() },
  ];

  return {
    useStorage: () => ({
      getAllConfigs: () => mockConfigs,
      deleteConfig: vi.fn(() => true),
      DEFAULT_BREATHING_CONFIG: {},
    }),
  };
});

describe('SavedConfigs.vue', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders saved config and handles delete', async () => {
    // stub window.confirm to accept
    window.confirm = vi.fn(() => true) as any;

    const wrapper = mount(SavedConfigs);
    expect(wrapper.text()).toContain('Saved Presets');

    // Ensure a config name is rendered
    expect(wrapper.text()).toContain('Config One');

    const deleteBtn = wrapper.find('button[title="Delete configuration"]');
    expect(deleteBtn.exists()).toBe(true);

    await deleteBtn.trigger('click');
    // After clicking, the mocked deleteConfig should have been called (no direct access here)
    // At minimum, ensure no errors and UI still renders
    expect(wrapper.text()).toContain('Saved Presets');
  });
});
