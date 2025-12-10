import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import SoundThemeSelector from '../../src/components/SoundThemeSelector.vue';
import { resetStorageForTesting } from '../../src/composables/useStorage';
import { soundService } from '../../src/services/soundService';

vi.mock('../../src/services/soundService', () => ({
  soundService: {
    setTheme: vi.fn(),
    getTheme: vi.fn(() => 'default'),
    playClick: vi.fn(),
    playPhaseChange: vi.fn(),
    setEnabled: vi.fn(),
  },
}));

describe('SoundThemeSelector', () => {
  beforeEach(() => {
    resetStorageForTesting();
    vi.clearAllMocks();
  });

  it('should render theme selector', () => {
    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: true,
      },
    });

    expect(wrapper.find('select').exists()).toBe(true);
    expect(wrapper.find('label').text()).toContain('Sound Theme');
  });

  it('should have all theme options', () => {
    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: true,
      },
    });

    const options = wrapper.findAll('option');
    expect(options.length).toBe(5);
    expect(options[0].attributes('value')).toBe('wood');
    expect(options[1].attributes('value')).toBe('water');
    expect(options[2].attributes('value')).toBe('wind');
    expect(options[3].attributes('value')).toBe('subtle');
    expect(options[4].attributes('value')).toBe('chimes');
  });

  it('should start with wood theme selected', () => {
    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: true,
      },
    });

    const select = wrapper.find('select');
    expect(select.element.value).toBe('wood');
  });

  it('should change theme when selection changes', async () => {
    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: true,
      },
    });

    const select = wrapper.find('select');
    await select.setValue('water');

    expect(soundService.setTheme).toHaveBeenCalledWith('water');
  });

  it('should test sound when test button is clicked and sound is enabled', async () => {
    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: true,
      },
    });

    const button = wrapper.find('button');
    await button.trigger('click');

    expect(soundService.playClick).toHaveBeenCalled();
  });

  it('should not test sound when test button is clicked and sound is disabled', async () => {
    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: false,
      },
    });

    const button = wrapper.find('button');
    await button.trigger('click');

    expect(soundService.playClick).not.toHaveBeenCalled();
  });

  it('should disable test button when sound is disabled', () => {
    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: false,
      },
    });

    const button = wrapper.find('button');
    expect(button.attributes('disabled')).toBeDefined();
  });

  it('should enable test button when sound is enabled', () => {
    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: true,
      },
    });

    const button = wrapper.find('button');
    expect(button.attributes('disabled')).toBeUndefined();
  });

  it('should persist theme selection to storage', async () => {
    resetStorageForTesting();

    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: true,
      },
    });

    const select = wrapper.find('select');
    await select.setValue('chimes');

    // Wait for reactivity to settle
    await wrapper.vm.$nextTick();

    // Verify theme was saved
    const { useStorage } = await import('../../src/composables/useStorage');
    const storage = useStorage();
    expect(storage.getSoundTheme()).toBe('chimes');
  });

  it('should change all themes in sequence', async () => {
    const wrapper = mount(SoundThemeSelector, {
      props: {
        soundEnabled: true,
      },
    });

    const select = wrapper.find('select');
    const themes = ['water', 'wind', 'subtle', 'chimes', 'default'];

    for (const theme of themes) {
      await select.setValue(theme);
      expect(soundService.setTheme).toHaveBeenCalledWith(theme);
    }
  });
});
