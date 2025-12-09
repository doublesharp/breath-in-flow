import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import BreathingVisualizer from '../../src/components/BreathingVisualizer.vue';
import { BreathingPhase, PHASE_INFO, DEFAULT_BREATHING_CONFIG } from '@breath-in-flow/shared';

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
    const config = {
      ...DEFAULT_BREATHING_CONFIG,
      exhaleTime: 4,
    };
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'EXHALE',
        currentTime: 4,
        totalTime: 4,
        scale: 1.0,
        isRunning: true,
        config,
      },
    });

    expect(wrapper.text()).toContain('Breathe out steadily');
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

    expect(wrapper.text()).toContain('4');
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

    // Check inhale colors (now green)
    expect(wrapper.html().includes('green') || wrapper.html().includes('emerald')).toBe(true);

    // Change to exhale (now blue)
    await wrapper.setProps({ phase: 'EXHALE' });
    expect(wrapper.html().includes('blue')).toBe(true);

    // Change to hold (now amber/orange)
    await wrapper.setProps({ phase: 'INHALE_HOLD' });
    expect(wrapper.html().includes('amber') || wrapper.html().includes('orange')).toBe(true);
  });

  describe('BreathingVisualizer phase classes', () => {
    const phases: BreathingPhase[] = [
      'INHALE',
      'INHALE_HOLD',
      'EXHALE',
      'EXHALE_HOLD',
      'EXTENDED_INHALE_HOLD',
      'EXTENDED_EXHALE_HOLD',
      'SET_COMPLETE',
      'SESSION_COMPLETE',
      'PAUSED',
      'IDLE',
    ];

    phases.forEach((phase) => {
      it(`renders classes for ${phase}`, () => {
        const wrapper = mount(BreathingVisualizer, {
          props: { phase, currentTime: 1, totalTime: 2, scale: 1, isRunning: true },
        });

        // Phase label should match PHASE_INFO mapping
        const label = PHASE_INFO[phase].label;
        expect(wrapper.text()).toContain(label);

        // Component should render successfully without errors
        expect(wrapper.exists()).toBe(true);
        expect(wrapper.find('[class*="breathing-circle"]').exists()).toBe(true);
      });
    });
  });
});
