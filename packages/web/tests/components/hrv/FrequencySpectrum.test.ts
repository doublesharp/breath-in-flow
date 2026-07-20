import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FrequencySpectrum from '@/components/hrv/FrequencySpectrum.vue';
import type { SpectralPoint } from '@breath-in-flow/shared';

const sampleSpectrum: SpectralPoint[] = [
  { frequency: 0.0, power: 0 },
  { frequency: 0.05, power: 100 },
  { frequency: 0.1, power: 300 },
  { frequency: 0.148, power: 800 },
  { frequency: 0.15, power: 200 },
  { frequency: 0.2, power: 1200 },
  { frequency: 0.332, power: 600 },
  { frequency: 0.4, power: 50 },
];

describe('FrequencySpectrum', () => {
  it('mounts without errors with empty spectrum', () => {
    const wrapper = mount(FrequencySpectrum, {
      props: { spectrum: [] },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders a canvas element', () => {
    const wrapper = mount(FrequencySpectrum, {
      props: { spectrum: [] },
    });
    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('renders with spectrum data', () => {
    const wrapper = mount(FrequencySpectrum, {
      props: { spectrum: sampleSpectrum },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('displays legend with band labels', () => {
    const wrapper = mount(FrequencySpectrum, {
      props: { spectrum: sampleSpectrum },
    });
    expect(wrapper.text()).toContain('VLF');
    expect(wrapper.text()).toContain('LF');
    expect(wrapper.text()).toContain('HF');
  });

  it('shows LF power in legend when provided', () => {
    const wrapper = mount(FrequencySpectrum, {
      props: { spectrum: sampleSpectrum, lfPower: 304.92 },
    });
    expect(wrapper.text()).toContain('305');
  });

  it('shows HF power in legend when provided', () => {
    const wrapper = mount(FrequencySpectrum, {
      props: { spectrum: sampleSpectrum, hfPower: 3677.86 },
    });
    // 3677.86 ms² should show as "3.7k ms²" or similar
    expect(wrapper.text()).toMatch(/3\.\d+k|3677/);
  });

  it('accepts lfPeak and hfPeak props', () => {
    const wrapper = mount(FrequencySpectrum, {
      props: {
        spectrum: sampleSpectrum,
        lfPeak: 0.148,
        hfPeak: 0.332,
      },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('accepts custom height', () => {
    const wrapper = mount(FrequencySpectrum, {
      props: { spectrum: sampleSpectrum, height: 250 },
    });
    expect(wrapper.props('height')).toBe(250);
  });

  it('handles single-point spectrum gracefully', () => {
    const wrapper = mount(FrequencySpectrum, {
      props: { spectrum: [{ frequency: 0.1, power: 100 }] },
    });
    expect(wrapper.exists()).toBe(true);
  });
});
