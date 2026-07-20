import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HrvMetricsDashboard from '@/components/hrv/HrvMetricsDashboard.vue';
import { sampleAnalysis } from './fixtures';

describe('HrvMetricsDashboard', () => {
  it('mounts without errors when analysis is null', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: null },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('shows empty state when analysis is null', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: null },
    });
    expect(wrapper.text()).toContain('No HRV analysis data');
  });

  it('renders with analysis data', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('displays Heart Rate section header', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('Heart Rate');
  });

  it('displays Time-Domain HRV section header', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('Time-Domain');
  });

  it('displays Frequency-Domain section header', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('Frequency-Domain');
  });

  it('displays Resonance section header', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('Resonance');
  });

  it('displays MIN HR card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('MIN HR');
  });

  it('displays MAX HR card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('MAX HR');
  });

  it('displays AVG HR card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('AVG HR');
  });

  it('displays RMSSD card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('RMSSD');
  });

  it('displays SDNN card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('SDNN');
  });

  it('displays pNN50 card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('pNN50');
  });

  it('displays MEAN RR card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('MEAN RR');
  });

  it('displays LF POWER card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('LF POWER');
  });

  it('displays HF POWER card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('HF POWER');
  });

  it('displays TOTAL PWR card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('TOTAL PWR');
  });

  it('displays LF/HF ratio card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('LF/HF');
  });

  it('displays LF PEAK card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('LF PEAK');
  });

  it('displays HF PEAK card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('HF PEAK');
  });

  it('displays AMPLITUDE card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('AMPLITUDE');
  });

  it('displays SMOOTHNESS card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('SMOOTHNESS');
  });

  it('displays PHASE SYNC card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('PHASE SYNC');
  });

  it('displays correct minHR value', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('48.0');
  });

  it('displays correct RMSSD value', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    const rmssdCard = wrapper.find('[data-label="RMSSD"]');
    expect(rmssdCard.find('[data-part="value"]').text()).toBe('127.38');
    expect(rmssdCard.find('[data-part="unit"]').text()).toBe('ms');
  });

  it('accepts compact prop without crashing', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis, compact: true },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('compact mode still shows all sections', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis, compact: true },
    });
    expect(wrapper.text()).toContain('Heart Rate');
    expect(wrapper.text()).toContain('Resonance');
  });

  it('explains when frequency metrics are unavailable instead of showing zero cards', () => {
    const analysis = {
      ...sampleAnalysis,
      frequencyDomain: {
        ...sampleAnalysis.frequencyDomain,
        available: false,
        unavailableReason: 'no-variability' as const,
        lfPower: 0,
        hfPower: 0,
        totalPower: 0,
        lfPeak: 0,
        hfPeak: 0,
        spectrum: [],
      },
    };

    const wrapper = mount(HrvMetricsDashboard, { props: { analysis } });

    expect(wrapper.text()).toContain('Frequency metrics unavailable');
    expect(wrapper.text()).toContain('enough beat-to-beat variation');
    expect(wrapper.text()).not.toContain('LF POWER');
    expect(wrapper.text()).not.toContain('LF PEAK');
  });
});
