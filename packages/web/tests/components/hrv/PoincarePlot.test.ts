import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PoincarePlot from '@/components/hrv/PoincarePlot.vue';

const sampleRR = [850, 870, 830, 860, 880, 820, 855, 865, 845, 875];

describe('PoincarePlot', () => {
  it('mounts without errors with empty RR intervals', () => {
    const wrapper = mount(PoincarePlot, {
      props: { rrIntervals: [] },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders a canvas element', () => {
    const wrapper = mount(PoincarePlot, {
      props: { rrIntervals: [] },
    });
    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('renders with RR interval data', () => {
    const wrapper = mount(PoincarePlot, {
      props: { rrIntervals: sampleRR },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('shows axis label text', () => {
    const wrapper = mount(PoincarePlot, {
      props: { rrIntervals: sampleRR },
    });
    // The plot heading should be there
    expect(wrapper.text()).toContain('Poincaré');
  });

  it('shows RR axis description', () => {
    const wrapper = mount(PoincarePlot, {
      props: { rrIntervals: sampleRR },
    });
    expect(wrapper.text()).toContain('RR[n]');
  });

  it('handles single RR interval (edge case)', () => {
    const wrapper = mount(PoincarePlot, {
      props: { rrIntervals: [850] },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('handles exactly 2 RR intervals', () => {
    const wrapper = mount(PoincarePlot, {
      props: { rrIntervals: [850, 870] },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('accepts custom size prop', () => {
    const wrapper = mount(PoincarePlot, {
      props: { rrIntervals: sampleRR, size: 320 },
    });
    expect((wrapper.vm as any).$.props.size).toBe(320);
  });

  it('handles large datasets', () => {
    const rrData = Array.from({ length: 200 }, () => 800 + Math.round(Math.random() * 100));
    const wrapper = mount(PoincarePlot, {
      props: { rrIntervals: rrData },
    });
    expect(wrapper.exists()).toBe(true);
  });
});
