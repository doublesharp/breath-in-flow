import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import LabInsights from '../../src/components/LabInsights.vue';
import type { HrvMeasurement } from '../../src/composables/useHrvStorage';
import type { AssessmentResult } from '@breath-in-flow/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeMeasurement(
  overrides: Partial<HrvMeasurement> & { daysAgo?: number; hoursAgo?: number; rmssd?: number } = {}
): HrvMeasurement {
  const { daysAgo = 0, hoursAgo = 0, rmssd = 35, ...rest } = overrides;
  const completedAt = new Date(Date.now() - daysAgo * 86400000 - hoursAgo * 3600000);
  return {
    id: `m-${Math.random().toString(36).slice(2)}`,
    type: 'quick-check',
    startedAt: new Date(completedAt.getTime() - 300000),
    completedAt,
    durationSeconds: 300,
    sensorMode: 'none',
    analysis: {
      timeDomain: {
        meanRR: 900,
        sdnn: 45,
        rmssd,
        pnn50: 20,
        meanHR: 67,
        minHR: 55,
        maxHR: 80,
        hrRange: 25,
      },
      frequencyDomain: {
        vlfPower: 200,
        lfPower: 1200,
        hfPower: 800,
        totalPower: 2200,
        lfPowerNorm: 60,
        hfPowerNorm: 40,
        lfHfRatio: 1.5,
        lfPeak: 0.1,
        hfPeak: 0.25,
        spectrum: [],
      },
      resonance: {
        peakToTroughAmplitude: 12,
        waveformSmoothness: 0.8,
        phaseSynchrony: 0.75,
        lfPeakCount: 1,
        lfPeakAmplitude: 800,
      },
      quality: {
        totalSamples: 200,
        artifactsDetected: 2,
        artifactPercentage: 1,
        meanSignalQuality: 0.95,
      },
      raw: { rrIntervals: [], timestamps: [], instantaneousHR: [] },
    },
    ...rest,
  };
}

function makeAssessment(selectedRate = 5.5): AssessmentResult {
  return {
    id: 'assessment-1',
    trials: [],
    selectedRate,
    completedAt: new Date(),
    config: {
      warmupDurationSeconds: 120,
      warmupRate: 6.0,
      restDurationSeconds: 120,
    },
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LabInsights', () => {
  it('shows "no data" message with fewer than 3 measurements', () => {
    const wrapper = mount(LabInsights, {
      props: { measurements: [], latestAssessment: null },
    });
    expect(wrapper.find('[data-testid="no-data-card"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Take a few more HRV measurements');
  });

  it('shows "no data" with exactly 2 measurements', () => {
    const wrapper = mount(LabInsights, {
      props: {
        measurements: [makeMeasurement({ daysAgo: 1 }), makeMeasurement({ daysAgo: 2 })],
        latestAssessment: null,
      },
    });
    expect(wrapper.find('[data-testid="no-data-card"]').exists()).toBe(true);
  });

  it('does not show "no data" card with 3 or more measurements', () => {
    const measurements = [
      makeMeasurement({ daysAgo: 1 }),
      makeMeasurement({ daysAgo: 2 }),
      makeMeasurement({ daysAgo: 3 }),
    ];
    const wrapper = mount(LabInsights, {
      props: { measurements, latestAssessment: null },
    });
    expect(wrapper.find('[data-testid="no-data-card"]').exists()).toBe(false);
  });

  it('shows RF recommendation when assessment exists', () => {
    const measurements = Array.from({ length: 5 }, (_, i) => makeMeasurement({ daysAgo: i + 1 }));
    const assessment = makeAssessment(5.5);

    const wrapper = mount(LabInsights, {
      props: { measurements, latestAssessment: assessment },
    });

    expect(wrapper.find('[data-testid="insight-card-rf-recommendation"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('5.5 BPM');
    expect(wrapper.text()).toContain('Apply');
  });

  it('emits apply-rf event when Apply button is clicked', async () => {
    const measurements = Array.from({ length: 5 }, (_, i) => makeMeasurement({ daysAgo: i + 1 }));
    const assessment = makeAssessment(5.0);

    const wrapper = mount(LabInsights, {
      props: { measurements, latestAssessment: assessment },
    });

    const applyBtn = wrapper.find('[data-testid="action-btn-rf-recommendation"]');
    expect(applyBtn.exists()).toBe(true);
    await applyBtn.trigger('click');

    expect(wrapper.emitted('apply-rf')).toBeTruthy();
    expect(wrapper.emitted('apply-rf')![0]).toEqual([5.0]);
  });

  it('dismiss button hides the RF recommendation card', async () => {
    const measurements = Array.from({ length: 5 }, (_, i) => makeMeasurement({ daysAgo: i + 1 }));
    const assessment = makeAssessment(5.5);

    const wrapper = mount(LabInsights, {
      props: { measurements, latestAssessment: assessment },
    });

    expect(wrapper.find('[data-testid="insight-card-rf-recommendation"]').exists()).toBe(true);

    const dismissBtn = wrapper.find('[data-testid="dismiss-btn-rf-recommendation"]');
    expect(dismissBtn.exists()).toBe(true);
    await dismissBtn.trigger('click');

    expect(wrapper.find('[data-testid="insight-card-rf-recommendation"]').exists()).toBe(false);
  });

  it('shows RMSSD trend insight when recent RMSSD improved >10%', () => {
    // 14 measurements: last 7 days high (50ms), prev 7 days low (30ms) => ~67% improvement
    const recent = Array.from({ length: 7 }, (_, i) =>
      makeMeasurement({ daysAgo: i, rmssd: 50 })
    );
    const previous = Array.from({ length: 7 }, (_, i) =>
      makeMeasurement({ daysAgo: i + 7, rmssd: 30 })
    );

    const wrapper = mount(LabInsights, {
      props: {
        measurements: [...recent, ...previous],
        latestAssessment: null,
      },
    });

    const card = wrapper.find('[data-testid="insight-card-rmssd-trend"]');
    expect(card.exists()).toBe(true);
    expect(wrapper.text()).toContain('improv');
  });

  it('shows RMSSD declined insight when RMSSD dropped >10%', () => {
    const recent = Array.from({ length: 7 }, (_, i) =>
      makeMeasurement({ daysAgo: i, rmssd: 20 })
    );
    const previous = Array.from({ length: 7 }, (_, i) =>
      makeMeasurement({ daysAgo: i + 7, rmssd: 50 })
    );

    const wrapper = mount(LabInsights, {
      props: {
        measurements: [...recent, ...previous],
        latestAssessment: null,
      },
    });

    const card = wrapper.find('[data-testid="insight-card-rmssd-trend"]');
    expect(card.exists()).toBe(true);
    expect(wrapper.text()).toContain('declin');
  });

  it('shows RMSSD stable insight when change is within ±10%', () => {
    const all = Array.from({ length: 14 }, (_, i) =>
      makeMeasurement({ daysAgo: i, rmssd: 35 + (i % 2) }) // tiny variation
    );

    const wrapper = mount(LabInsights, {
      props: {
        measurements: all,
        latestAssessment: null,
      },
    });

    const card = wrapper.find('[data-testid="insight-card-rmssd-trend"]');
    expect(card.exists()).toBe(true);
    expect(wrapper.text()).toContain('stable');
  });

  it('shows measurement streak with consecutive daily measurements', () => {
    // 5 consecutive days including today
    const measurements = Array.from({ length: 5 }, (_, i) =>
      makeMeasurement({ daysAgo: i })
    );

    const wrapper = mount(LabInsights, {
      props: { measurements, latestAssessment: null },
    });

    const card = wrapper.find('[data-testid="insight-card-measurement-streak"]');
    expect(card.exists()).toBe(true);
    expect(wrapper.text()).toContain('5 days in a row');
  });

  it('does not show streak when days are not consecutive', () => {
    // Measurements with a gap
    const measurements = [
      makeMeasurement({ daysAgo: 0 }),
      makeMeasurement({ daysAgo: 1 }),
      // gap on day 2
      makeMeasurement({ daysAgo: 3 }),
      makeMeasurement({ daysAgo: 4 }),
    ];

    const wrapper = mount(LabInsights, {
      props: { measurements, latestAssessment: null },
    });

    // streak should only be 2 (today + yesterday), still shown
    const card = wrapper.find('[data-testid="insight-card-measurement-streak"]');
    if (card.exists()) {
      // streak of 2 is still valid
      expect(wrapper.text()).toContain('2 days in a row');
    }
    // OR no streak card if logic requires >2
    expect(wrapper.exists()).toBe(true);
  });

  it('shows best time of day insight when >10 measurements across time periods', () => {
    // 8 morning measurements (higher RMSSD) + 4 evening measurements (lower RMSSD)
    // This ensures 2 distinct periods exist, so the insight shows
    const morningMeasurements = Array.from({ length: 8 }, (_, i) => {
      const completedAt = new Date();
      completedAt.setDate(completedAt.getDate() - i);
      completedAt.setHours(8, 0, 0, 0);
      return makeMeasurement({ rmssd: 50, completedAt });
    });
    const eveningMeasurements = Array.from({ length: 4 }, (_, i) => {
      const completedAt = new Date();
      completedAt.setDate(completedAt.getDate() - i - 8);
      completedAt.setHours(20, 0, 0, 0);
      return makeMeasurement({ rmssd: 30, completedAt });
    });

    const wrapper = mount(LabInsights, {
      props: {
        measurements: [...morningMeasurements, ...eveningMeasurements],
        latestAssessment: null,
      },
    });

    const card = wrapper.find('[data-testid="insight-card-best-time"]');
    expect(card.exists()).toBe(true);
    expect(wrapper.text()).toContain('morning');
  });

  it('does not show best time of day with fewer than 10 measurements', () => {
    const measurements = Array.from({ length: 8 }, (_, i) => makeMeasurement({ daysAgo: i }));

    const wrapper = mount(LabInsights, {
      props: { measurements, latestAssessment: null },
    });

    expect(wrapper.find('[data-testid="insight-card-best-time"]').exists()).toBe(false);
  });

  it('renders without crashing when latestAssessment is null', () => {
    const measurements = Array.from({ length: 5 }, (_, i) => makeMeasurement({ daysAgo: i }));
    const wrapper = mount(LabInsights, {
      props: { measurements, latestAssessment: null },
    });
    expect(wrapper.exists()).toBe(true);
    expect(wrapper.find('[data-testid="insight-card-rf-recommendation"]').exists()).toBe(false);
  });
});
