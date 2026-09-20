import { enableAutoUnmount, mount } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextTick } from 'vue';
import PracticePresets from '../../src/components/PracticePresets.vue';

const { useStorageMock } = vi.hoisted(() => ({ useStorageMock: vi.fn() }));
vi.mock('../../src/composables', () => ({ useStorage: useStorageMock }));
enableAutoUnmount(afterEach);

describe('PracticePresets.vue', () => {
  beforeEach(() => {
    useStorageMock.mockReset();
  });
  it('filters saved names and built-in descriptions without case or whitespace sensitivity', async () => {
    const config = { id: 'saved', name: 'Evening calm', inhaleTime: 4, exhaleTime: 6 };
    useStorageMock.mockReturnValue({ getAllConfigs: () => [config] });
    const wrapper = mount(PracticePresets);
    const search = wrapper.get('input[type="search"]');
    await search.setValue('  EVENING  ');
    expect(wrapper.get('[data-testid="search-results"]').text()).toBe('1 routine');
    expect(wrapper.findAll('[data-testid="saved-routine"]')).toHaveLength(1);
    expect(wrapper.find('[data-testid="load-coherent-breathing"]').exists()).toBe(false);
    await wrapper.get('[data-testid="saved-routine"] button').trigger('click');
    expect(wrapper.emitted('loadConfig')).toEqual([[config]]);
    await search.setValue('five-second');
    expect(wrapper.findAll('[data-testid="saved-routine"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="load-coherent-breathing"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="search-results"]').text()).toBe('1 routine');
  });

  it('clears a search with no matches and restores the library', async () => {
    useStorageMock.mockReturnValue({ getAllConfigs: () => [] });
    const wrapper = mount(PracticePresets);
    await wrapper.get('input[type="search"]').setValue('no such routine');
    expect(wrapper.get('[data-testid="search-results"]').text()).toBe('0 routines');
    expect(wrapper.text()).toContain('No routines match');
    expect(wrapper.find('[data-testid="load-coherent-breathing"]').exists()).toBe(false);
    await wrapper.get('button[aria-label="Clear search"]').trigger('click');
    expect(wrapper.find('[data-testid="load-coherent-breathing"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('No routines match');
  });

  it('offers a create action from the empty saved library', async () => {
    useStorageMock.mockReturnValue({ getAllConfigs: () => [] });
    const wrapper = mount(PracticePresets);
    await wrapper.get('[data-testid="create-preset"]').trigger('click');
    expect(wrapper.emitted('createConfig')).toEqual([[]]);
  });
  it('shows empty state when no configs', async () => {
    useStorageMock.mockReturnValue({ getAllConfigs: () => [] });

    const wrapper = mount(PracticePresets);
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

    useStorageMock.mockReturnValue({ getAllConfigs: () => [config] });

    const wrapper = mount(PracticePresets);
    const text = wrapper.text();

    expect(text).toContain('Test Config');
    const phases = wrapper.get('[data-testid="saved-routine"]').findAll('dl > div');
    expect(phases.map((phase) => phase.text())).toEqual([
      'Inhale4s',
      'Hold3s',
      'Exhale5s',
      'Hold2s',
    ]);
    expect(text).toContain('Exhale hold · 10s');
    expect(text).toContain('Inhale hold');
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

    useStorageMock.mockReturnValue({ getAllConfigs: () => [config], deleteConfig: deleteMock });

    const wrapper = mount(PracticePresets, {
      attachTo: document.body,
    });

    // Click delete button
    const btn = wrapper.find('button[title="Delete configuration"]');
    await btn.trigger('click');
    await nextTick();

    // Modal should be visible in document.body (Teleport)
    expect(document.body.textContent).toContain('Are you sure you want to delete');

    // Click confirm delete button in modal
    const confirmBtn = document.body.querySelector('button.btn-danger') as HTMLElement;
    expect(confirmBtn).toBeTruthy();
    confirmBtn.click();
    await nextTick();

    expect(deleteMock).toHaveBeenCalledWith('c1');
    wrapper.unmount();
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

    useStorageMock.mockReturnValue({ getAllConfigs: () => [config], deleteConfig: deleteMock });

    const wrapper = mount(PracticePresets);

    // Click delete button
    const btn = wrapper.find('button[title="Delete configuration"]');
    await btn.trigger('click');

    expect(document.body.textContent).toContain('Are you sure you want to delete');
    const cancel = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Cancel'
    );
    expect(cancel).toBeDefined();
    cancel!.click();
    await nextTick();
    expect(document.body.textContent).not.toContain('Are you sure you want to delete');
    expect(deleteMock).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('ToDelete');
  });

  it('handles preset configurations loading', async () => {
    useStorageMock.mockReturnValue({ getAllConfigs: () => [] });

    const wrapper = mount(PracticePresets);

    // Should display preset section
    expect(wrapper.text()).toContain('Quick Presets');
    // Should have preset buttons for built-in presets
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('emits loadConfig when clicking load button on saved config', async () => {
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

    useStorageMock.mockReturnValue({ getAllConfigs: () => [mockConfig], deleteConfig: vi.fn() });

    const wrapper = mount(PracticePresets);

    const loadButtons = wrapper.findAll('button').filter((b) => b.text().includes('Load'));
    expect(loadButtons.length).toBeGreaterThan(0);
    await loadButtons[0].trigger('click');
    expect(wrapper.emitted('loadConfig')).toEqual([[mockConfig]]);
  });

  it('emits loadConfig when clicking preset button', async () => {
    useStorageMock.mockReturnValue({ getAllConfigs: () => [] });

    const wrapper = mount(PracticePresets);

    await wrapper.get('[data-testid="load-coherent-breathing"]').trigger('click');
    expect(wrapper.emitted('loadConfig')).toEqual([
      [
        expect.objectContaining({
          name: 'Coherent Breathing',
          inhaleTime: 5,
          exhaleTime: 5,
          targetSets: 1,
        }),
      ],
    ]);
  });

  it('shows diaphragm resistance guidance and emits only its validated breathing config', async () => {
    useStorageMock.mockReturnValue({ getAllConfigs: () => [] });

    const wrapper = mount(PracticePresets);

    expect(wrapper.text()).toContain('Diaphragm Resistance Training — Starter');
    const guidanceButton = wrapper.get('[data-testid="guidance-diaphragm-resistance-starter"]');
    expect(guidanceButton.attributes('aria-expanded')).toBe('false');

    await guidanceButton.trigger('click');

    expect(guidanceButton.attributes('aria-expanded')).toBe('true');
    expect(wrapper.text()).toContain('Endurance');
    expect(wrapper.text()).toContain('Strengthening');
    expect(wrapper.text()).toContain('Stop for dizziness');
    expect(wrapper.text()).toContain('purpose-designed inspiratory resistance trainer');

    await wrapper.get('[data-testid="load-diaphragm-resistance-starter"]').trigger('click');
    const emittedConfig = wrapper.emitted('loadConfig')?.at(-1)?.[0] as Record<string, unknown>;

    expect(emittedConfig).toMatchObject({
      name: 'Diaphragm Resistance Training — Starter',
      inhaleTime: 3,
      inhaleHoldTime: 1,
      exhaleTime: 4,
      exhaleHoldTime: 1,
      repetitions: 10,
      targetSets: 2,
      restBetweenSetsSeconds: 60,
      extendedHoldEnabled: false,
    });
    expect(emittedConfig.guidance).toBeUndefined();
    expect(emittedConfig.description).toBeUndefined();
  });

  it('gives the recommended coherent-breathing routine a finite completion target', async () => {
    const { guidedPresets } = await import('../../src/data/guidedPresets');
    const coherent = guidedPresets.find((preset) => preset.id === 'coherent-breathing');

    expect(coherent?.config.targetSets).toBe(1);
  });
});
