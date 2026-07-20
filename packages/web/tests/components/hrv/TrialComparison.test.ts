import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import TrialComparison from '@/components/hrv/TrialComparison.vue';
import { sampleAnalysis } from './fixtures';

const sampleTrials = [
  { rate: 6.5, analysis: sampleAnalysis },
  {
    rate: 6.0,
    analysis: {
      ...sampleAnalysis,
      resonance: {
        ...sampleAnalysis.resonance,
        value: {
          ...sampleAnalysis.resonance.value,
          peakToTroughAmplitude: 14.1,
          waveformSmoothness: 0.71,
        },
      },
    },
  },
  {
    rate: 5.5,
    analysis: {
      ...sampleAnalysis,
      resonance: {
        ...sampleAnalysis.resonance,
        value: {
          ...sampleAnalysis.resonance.value,
          peakToTroughAmplitude: 17.8,
          waveformSmoothness: 0.79,
        },
      },
    },
  },
  {
    rate: 5.0,
    analysis: {
      ...sampleAnalysis,
      resonance: {
        ...sampleAnalysis.resonance,
        value: {
          ...sampleAnalysis.resonance.value,
          peakToTroughAmplitude: 19.2,
          waveformSmoothness: 0.82,
        },
      },
    },
  },
  {
    rate: 4.5,
    analysis: {
      ...sampleAnalysis,
      resonance: {
        ...sampleAnalysis.resonance,
        value: {
          ...sampleAnalysis.resonance.value,
          peakToTroughAmplitude: 15.0,
          waveformSmoothness: 0.69,
        },
      },
    },
  },
];

describe('TrialComparison', () => {
  it('mounts without errors with empty trials', () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: [] },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders a canvas element', () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: [] },
    });
    expect(wrapper.find('canvas').exists()).toBe(true);
  });

  it('renders with trial data', () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: sampleTrials },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('shows metric selector tabs', () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: sampleTrials },
    });
    expect(wrapper.text()).toContain('LF Power %');
    expect(wrapper.text()).toContain('Amplitude');
    expect(wrapper.text()).toContain('Smoothness');
    expect(wrapper.text()).toContain('Phase Sync');
  });

  it('shows section title', () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: sampleTrials },
    });
    expect(wrapper.text()).toContain('Trial Comparison');
  });

  it('clicking a tab switches active metric', async () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: sampleTrials },
    });
    const tabs = wrapper.findAll('button');
    const amplitudeTab = tabs.find((t) => t.text().includes('Amplitude'));
    expect(amplitudeTab).toBeDefined();
    await amplitudeTab!.trigger('click');
    // After click, amplitude tab should have active styling
    expect(amplitudeTab!.classes().join(' ')).toContain('amber');
  });

  it('accepts selectedRate prop', () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: sampleTrials, selectedRate: 5.0 },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('accepts metric prop', () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: sampleTrials, metric: 'amplitude' },
    });
    expect(wrapper.props('metric')).toBe('amplitude');
  });

  it('accepts custom height', () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: sampleTrials, height: 250 },
    });
    expect(wrapper.props('height')).toBe(250);
  });

  it('handles single trial', () => {
    const wrapper = mount(TrialComparison, {
      props: { trials: [sampleTrials[0]] },
    });
    expect(wrapper.exists()).toBe(true);
  });
});
