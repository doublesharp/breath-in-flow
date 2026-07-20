import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HrOscillation from '@/components/hrv/HrOscillation.vue';

const sampleHrData = Array.from({ length: 120 }, (_, i) => ({
  time: i,
  hr: 65 + Math.sin((i * 2 * Math.PI) / 10) * 8,
}));

describe('HrOscillation', () => {
  it('mounts without errors with empty data', () => {
    const wrapper = mount(HrOscillation, {
      props: {
        hrData: [],
        breathingRateBPM: 6,
        trialDurationSeconds: 120,
      },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders a canvas element', () => {
    const wrapper = mount(HrOscillation, {
      props: {
        hrData: [],
        breathingRateBPM: 6,
        trialDurationSeconds: 120,
      },
    });
    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('renders with HR data', () => {
    const wrapper = mount(HrOscillation, {
      props: {
        hrData: sampleHrData,
        breathingRateBPM: 6,
        trialDurationSeconds: 120,
      },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('shows amplitude annotation when provided', () => {
    const wrapper = mount(HrOscillation, {
      props: {
        hrData: sampleHrData,
        breathingRateBPM: 6,
        trialDurationSeconds: 120,
        peakToTroughAmplitude: 19.2,
      },
    });
    expect(wrapper.text()).toContain('19.2');
  });

  it('shows smoothness annotation when provided', () => {
    const wrapper = mount(HrOscillation, {
      props: {
        hrData: sampleHrData,
        breathingRateBPM: 6,
        trialDurationSeconds: 120,
        waveformSmoothness: 0.82,
      },
    });
    expect(wrapper.text()).toContain('0.82');
  });

  it('shows both annotations when provided', () => {
    const wrapper = mount(HrOscillation, {
      props: {
        hrData: sampleHrData,
        breathingRateBPM: 6,
        trialDurationSeconds: 120,
        peakToTroughAmplitude: 15.5,
        waveformSmoothness: 0.75,
      },
    });
    expect(wrapper.text()).toContain('15.5');
    expect(wrapper.text()).toContain('0.75');
  });

  it('hides amplitude annotation when not provided', () => {
    const wrapper = mount(HrOscillation, {
      props: {
        hrData: sampleHrData,
        breathingRateBPM: 6,
        trialDurationSeconds: 120,
      },
    });
    expect(wrapper.text()).not.toContain('Amplitude');
  });

  it('handles different breathing rates', () => {
    const rates = [4.5, 5.0, 5.5, 6.0, 6.5];
    for (const rate of rates) {
      const wrapper = mount(HrOscillation, {
        props: {
          hrData: sampleHrData,
          breathingRateBPM: rate,
          trialDurationSeconds: 120,
        },
      });
      expect(wrapper.exists()).toBe(true);
    }
  });

  it('accepts custom height', () => {
    const wrapper = mount(HrOscillation, {
      props: {
        hrData: sampleHrData,
        breathingRateBPM: 6,
        trialDurationSeconds: 120,
        height: 280,
      },
    });
    expect(wrapper.props('height')).toBe(280);
  });
});
