import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import HrvMetricsDashboard from '@/components/hrv/HrvMetricsDashboard.vue';
import type { HRVAnalysis } from '@breath-in-flow/shared';

const sampleAnalysis: HRVAnalysis = {
  timeDomain: {
    meanRR: 1141,
    sdnn: 76.05,
    rmssd: 127.38,
    pnn50: 80,
    meanHR: 53,
    minHR: 48,
    maxHR: 67,
    hrRange: 19,
  },
  frequencyDomain: {
    available: true,
    value: {
      lfPowerNorm: 7.66,
      hfPowerNorm: 92.34,
      lfHfRatio: 0.083,
      lfPeak: 0.148,
      hfPeak: 0.332,
      spectrum: [
        { frequency: 0.05, power: 1.25 },
        { frequency: 0.148, power: 7.66 },
        { frequency: 0.332, power: 92.34 },
      ],
    },
  },
  poincare: { available: true, value: { points: [] } },
  resonance: {
    available: true,
    value: {
      peakToTroughAmplitude: 19.2,
      waveformSmoothness: 0.82,
      phaseSynchrony: 0.75,
      lfPeakCount: 1,
      lfPeakAmplitude: 7.66,
    },
  },
  quality: {
    totalSamples: 240,
    artifactsDetected: 3,
    artifactPercentage: 1.25,
    meanSignalQuality: 0.92,
  },
  raw: {
    rrIntervals: [850, 870, 830, 860, 880, 820],
    timestamps: [0, 850, 1720, 2550, 3410, 4290],
    instantaneousHR: [70.6, 69.0, 72.3, 69.8, 68.2, 73.2],
  },
};

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
    expect(wrapper.text()).toContain('No pulse variability analysis data');
    expect(wrapper.text()).not.toContain('HRV');
  });

  it('renders with analysis data', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('displays Pulse Rate section header', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('Pulse Rate');
  });

  it('uses pulse-variability-accurate copy for time-domain metrics', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('Pulse Variability Metrics');
    expect(wrapper.text()).not.toContain('Time-Domain HRV');
  });

  it('displays Frequency-Domain section header', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('Frequency-Domain');
  });

  it('labels resonance values as an estimated breathing response', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('Estimated Breathing Response');
  });

  it('displays MIN PULSE card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('MIN PULSE');
  });

  it('displays MAX PULSE card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('MAX PULSE');
  });

  it('displays AVG PULSE card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('AVG PULSE');
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

  it('displays normalized LF power card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('LF NORM');
  });

  it('displays normalized HF power card', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).toContain('HF NORM');
  });

  it('does not display absolute power cards', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    expect(wrapper.text()).not.toContain('TOTAL PWR');
    expect(wrapper.text()).not.toContain('LF POWER');
    expect(wrapper.text()).not.toContain('HF POWER');
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
    expect(wrapper.text()).toContain('48');
  });

  it('displays correct RMSSD value', () => {
    const wrapper = mount(HrvMetricsDashboard, {
      props: { analysis: sampleAnalysis },
    });
    const rmssdCard = wrapper.find('[data-label="RMSSD"]');
    expect(rmssdCard.find('[data-part="value"]').text()).toBe('127.4');
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
    expect(wrapper.text()).toContain('Pulse Rate');
    expect(wrapper.text()).toContain('Estimated Breathing Response');
  });

  it('explains when frequency metrics are unavailable instead of showing zero cards', () => {
    const analysis: HRVAnalysis = {
      ...sampleAnalysis,
      frequencyDomain: {
        available: false,
        reason: 'no-variability' as const,
      },
    };

    const wrapper = mount(HrvMetricsDashboard, { props: { analysis } });

    expect(wrapper.text()).toContain('Frequency metrics unavailable');
    expect(wrapper.text()).toContain('enough beat-to-beat variation');
    expect(wrapper.text()).not.toContain('LF NORM');
    expect(wrapper.text()).not.toContain('LF PEAK');
  });

  it('explains when resonance metrics lack breathing-rate context', () => {
    const analysis: HRVAnalysis = {
      ...sampleAnalysis,
      resonance: {
        available: false,
        reason: 'missing-breathing-rate' as const,
      },
    };

    const wrapper = mount(HrvMetricsDashboard, { props: { analysis } });

    expect(wrapper.text()).toContain('Resonance metrics unavailable');
    expect(wrapper.text()).toContain('paced breathing rate');
    expect(wrapper.text()).not.toContain('AMPLITUDE');
  });

  it('explains when resonance metrics lack spectral variability', () => {
    const analysis: HRVAnalysis = {
      ...sampleAnalysis,
      resonance: {
        available: false,
        reason: 'no-variability' as const,
      },
    };

    const wrapper = mount(HrvMetricsDashboard, { props: { analysis } });

    expect(wrapper.text()).toContain('Resonance metrics unavailable');
    expect(wrapper.text()).toContain('enough pulse-to-pulse variation');
    expect(wrapper.text()).not.toContain('SMOOTHNESS');
  });
});
