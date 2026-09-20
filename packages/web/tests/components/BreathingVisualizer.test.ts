import { afterEach, describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import BreathingVisualizer from '../../src/components/BreathingVisualizer.vue';
import BreathingPressureField from '../../src/components/BreathingPressureField.vue';
import { BreathingPhase, PHASE_INFO, DEFAULT_BREATHING_CONFIG } from '@breath-in-flow/shared';

afterEach(() => vi.unstubAllGlobals());

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

  it('preserves the whole breathing circle scale while paused', async () => {
    const wrapper = mount(BreathingVisualizer, {
      props: { phase: 'EXHALE', currentTime: 2, totalTime: 4, scale: 0.86, isRunning: true },
    });
    const circle = wrapper.get('.breathing-circle');
    const activeTransform = circle.attributes('style');

    await wrapper.setProps({ phase: 'PAUSED', scale: 0.8, isRunning: false });
    expect(circle.attributes('style')).toBe(activeTransform);
  });

  it('preserves the whole breathing circle scale with reduced motion', async () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    const wrapper = mount(BreathingVisualizer, {
      props: { phase: 'INHALE', currentTime: 3, totalTime: 4, scale: 0.7, isRunning: true },
    });
    const circle = wrapper.get('.breathing-circle');
    const initialTransform = circle.attributes('style');

    await wrapper.setProps({ scale: 0.96, currentTime: 1 });
    expect(circle.attributes('style')).toBe(initialTransform);

    wrapper.unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('drives the pressure field from the breathing scale', async () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'INHALE',
        currentTime: 4,
        totalTime: 4,
        scale: 0.6,
        isRunning: true,
      },
    });

    const field = wrapper.getComponent(BreathingPressureField);
    expect(field.props('scale')).toBe(0.6);
    expect(field.props('phase')).toBe('INHALE');

    await wrapper.setProps({ currentTime: 2, scale: 0.8 });
    expect(field.props('scale')).toBe(0.8);
  });

  it('uses a continuous gradient field with a protected timer center', () => {
    const wrapper = mount(BreathingPressureField, { props: { scale: 0.8, phase: 'INHALE' } });

    expect(wrapper.find('[data-pressure-point]').exists()).toBe(false);
    expect(wrapper.findAll('[data-pressure-layer]')).toHaveLength(3);
    expect(wrapper.get('[data-testid="pressure-center-veil"]').attributes('fill')).toMatch(
      /^url\(#pressure-center-[^)]+\)$/
    );
  });

  it('builds pressure through inhale and releases it through exhale', async () => {
    const wrapper = mount(BreathingPressureField, { props: { scale: 0.6, phase: 'INHALE' } });
    const energy = () => wrapper.get('[data-testid="pressure-energy"]');
    const lowPressure = Number(energy().attributes('opacity'));

    await wrapper.setProps({ scale: 1 });
    const highPressure = Number(energy().attributes('opacity'));
    expect(highPressure).toBeGreaterThan(lowPressure);

    await wrapper.setProps({ phase: 'EXHALE', scale: 0.78 });
    expect(Number(energy().attributes('opacity'))).toBeLessThan(highPressure);
  });

  it('renders regular and extended holds at one steady neutral level', async () => {
    const wrapper = mount(BreathingPressureField, { props: { scale: 1, phase: 'INHALE_HOLD' } });
    const energy = () => wrapper.get('[data-testid="pressure-energy"]');
    const initial = `${energy().attributes('r')}:${energy().attributes('opacity')}:${energy().attributes('fill')}`;

    await wrapper.setProps({ scale: 0.6, phase: 'EXTENDED_EXHALE_HOLD' });
    expect(
      `${energy().attributes('r')}:${energy().attributes('opacity')}:${energy().attributes('fill')}`
    ).toBe(initial);
    expect(
      wrapper.get('[data-testid="breathing-pressure-field"]').attributes('data-pressure-state')
    ).toBe('neutral');
  });

  it('preserves the preceding pressure field while paused', async () => {
    const wrapper = mount(BreathingPressureField, { props: { scale: 0.84, phase: 'EXHALE' } });
    const energy = () => wrapper.get('[data-testid="pressure-energy"]');
    const beforePause = `${energy().attributes('r')}:${energy().attributes('opacity')}:${energy().attributes('fill')}`;

    await wrapper.setProps({ scale: 0.6, phase: 'PAUSED' });
    expect(
      `${energy().attributes('r')}:${energy().attributes('opacity')}:${energy().attributes('fill')}`
    ).toBe(beforePause);
  });

  it('keeps the rendered gradient still when reduced motion is requested', async () => {
    const removeEventListener = vi.fn();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );
    const wrapper = mount(BreathingPressureField, { props: { scale: 0.7, phase: 'INHALE' } });
    const energy = () => wrapper.get('[data-testid="pressure-energy"]');
    const initial = `${energy().attributes('r')}:${energy().attributes('opacity')}:${energy().attributes('fill')}`;

    await wrapper.setProps({ scale: 0.98, phase: 'EXHALE' });
    expect(
      `${energy().attributes('r')}:${energy().attributes('opacity')}:${energy().attributes('fill')}`
    ).toBe(initial);

    wrapper.unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
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

    expect(wrapper.find('[data-testid="phase-progress-ring"]').exists()).toBe(true);
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

    expect(wrapper.find('[data-testid="phase-progress-ring"]').exists()).toBe(false);
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

  it('shows a completion mark instead of a meaningless zero timer', () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'SESSION_COMPLETE',
        currentTime: 0,
        totalTime: 0,
        scale: 1,
        isRunning: false,
      },
    });

    expect(wrapper.find('[data-testid="completion-mark"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="phase-time"]').exists()).toBe(false);
  });

  it('keeps phase label colors distinct from the pressure field palette', async () => {
    const wrapper = mount(BreathingVisualizer, {
      props: {
        phase: 'INHALE',
        currentTime: 4,
        totalTime: 4,
        scale: 0.6,
        isRunning: true,
      },
    });

    expect(wrapper.get('.rounded-full').classes()).toContain('from-emerald-700');

    await wrapper.setProps({ phase: 'EXHALE' });
    expect(wrapper.get('.rounded-full').classes()).toContain('from-teal-700');

    await wrapper.setProps({ phase: 'INHALE_HOLD' });
    expect(wrapper.get('.rounded-full').classes()).toContain('from-amber-700');
  });

  describe('BreathingVisualizer phase classes', () => {
    const phases: BreathingPhase[] = [
      'INHALE',
      'INHALE_HOLD',
      'EXHALE',
      'EXHALE_HOLD',
      'EXTENDED_INHALE_HOLD',
      'EXTENDED_EXHALE_HOLD',
      'SET_REST',
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
