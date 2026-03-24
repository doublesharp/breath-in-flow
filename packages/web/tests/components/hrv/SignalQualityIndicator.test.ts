import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SignalQualityIndicator from '@/components/hrv/SignalQualityIndicator.vue';

describe('SignalQualityIndicator', () => {
  it('mounts without errors', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.8, sensorType: 'ppg' },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('displays correct percentage for high quality', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.85, sensorType: 'ppg' },
    });
    expect(wrapper.text()).toContain('85%');
  });

  it('displays correct percentage for low quality', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.2, sensorType: 'ppg' },
    });
    expect(wrapper.text()).toContain('20%');
  });

  it('shows "Good signal" message for quality >= 0.7', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.75, sensorType: 'ppg' },
    });
    expect(wrapper.text()).toContain('Good signal');
  });

  it('shows "Excellent signal" for quality >= 0.85', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.9, sensorType: 'ppg' },
    });
    expect(wrapper.text()).toContain('Excellent signal');
  });

  it('shows PPG-specific message for poor quality', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.2, sensorType: 'ppg' },
    });
    expect(wrapper.text()).toMatch(/Poor|finger/i);
  });

  it('shows SCG-specific message for poor quality', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.2, sensorType: 'scg' },
    });
    expect(wrapper.text()).toMatch(/motion|still/i);
  });

  it('shows PPG sensor label', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.8, sensorType: 'ppg' },
    });
    expect(wrapper.text()).toContain('PPG Sensor');
  });

  it('shows SCG sensor label', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.8, sensorType: 'scg' },
    });
    expect(wrapper.text()).toContain('SCG Sensor');
  });

  it('clamps percentage at 0 for negative quality', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: -0.5, sensorType: 'ppg' },
    });
    expect(wrapper.text()).toContain('0%');
  });

  it('clamps percentage at 100 for quality > 1', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 1.5, sensorType: 'ppg' },
    });
    expect(wrapper.text()).toContain('100%');
  });

  it('renders SVG ring', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.7, sensorType: 'ppg' },
    });
    expect(wrapper.find('svg').exists()).toBe(true);
  });

  it('accepts custom ringSize', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.8, sensorType: 'ppg', ringSize: 100 },
    });
    expect((wrapper.vm as any).$.props.ringSize).toBe(100);
  });

  it('shows "Adjust finger position" for mid-range PPG quality', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.35, sensorType: 'ppg' },
    });
    expect(wrapper.text()).toContain('Adjust finger position');
  });

  it('shows "Hold very still" for mid-range SCG quality', () => {
    const wrapper = mount(SignalQualityIndicator, {
      props: { quality: 0.35, sensorType: 'scg' },
    });
    expect(wrapper.text()).toContain('Hold very still');
  });
});
