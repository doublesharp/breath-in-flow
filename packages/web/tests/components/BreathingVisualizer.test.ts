import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BreathingVisualizer from '../../src/components/BreathingVisualizer.vue';

describe('BreathingVisualizer', () => {
  it('should render with correct phase label', () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'INHALE',
        currentTime: 4,
        totalTime: 4,
        scale: 0.6,
        isRunning: true,
      },
    });

    expect(wrapper.text()).toContain('Inhale');
  });

  it('should display the correct instruction for each phase', () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'EXHALE',
        currentTime: 4,
        totalTime: 4,
        scale: 1.0,
        isRunning: true,
      },
    });

    expect(wrapper.text()).toContain('Breathe out slowly');
  });

  it('should apply correct scale transform', () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'INHALE',
        currentTime: 2,
        totalTime: 4,
        scale: 0.8,
        isRunning: true,
      },
    });

    const circle = wrapper.find('.breathing-circle');
    expect(circle.attributes('style')).toContain('scale(0.8)');
  });

  it('should show progress ring when running', () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'INHALE',
        currentTime: 2,
        totalTime: 4,
        scale: 0.8,
        isRunning: true,
      },
    });

    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('should not show progress ring when idle', () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'IDLE',
        currentTime: 0,
        totalTime: 0,
        scale: 0.8,
        isRunning: false,
      },
    });

    expect(wrapper.find('svg').exists()).toBe(false);
  });

  it('should display formatted time', () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'INHALE',
        currentTime: 3.5,
        totalTime: 4,
        scale: 0.8,
        isRunning: true,
      },
    });

    expect(wrapper.text()).toContain('3.5');
  });

  it('should apply correct color classes for different phases', async () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'INHALE',
        currentTime: 4,
        totalTime: 4,
        scale: 0.6,
        isRunning: true,
      },
    });

    // Check inhale colors
    expect(wrapper.find('.bg-blue-500').exists() || wrapper.html().includes('blue')).toBe(true);

    // Change to exhale
    await wrapper.setProps({ phase: 'EXHALE' });
    expect(wrapper.html().includes('green')).toBe(true);

    // Change to hold
    await wrapper.setProps({ phase: 'INHALE_HOLD' });
    expect(wrapper.html().includes('purple')).toBe(true);
  });
});
