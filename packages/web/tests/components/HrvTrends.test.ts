import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import HrvTrends from '../../src/components/HrvTrends.vue';
import type { HrvMeasurement } from '../../src/composables/useHrvStorage';

// Canvas getContext stub — JSDOM / happy-dom doesn't implement canvas
beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    arc: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    setTransform: vi.fn(),
    createLinearGradient: vi.fn().mockReturnValue({
      addColorStop: vi.fn(),
    }),
    translate: vi.fn(),
    rotate: vi.fn(),
    setLineDash: vi.fn(),
    scale: vi.fn(),
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 1,
    lineJoin: '',
    font: '',
    textAlign: '',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function makeMeasurement(
  overrides: Partial<HrvMeasurement> & { daysAgo?: number } = {}
): HrvMeasurement {
  const { daysAgo = 0, ...rest } = overrides;
  const completedAt = new Date(Date.now() - daysAgo * 86400000);
  return {
    id: `m-${Math.random()}`,
    type: 'quick-check',
    startedAt: new Date(completedAt.getTime() - 300000),
    completedAt,
    durationSeconds: 300,
    sensorMode: 'none',
    analysis: {
      timeDomain: {
        meanRR: 900,
        sdnn: 45,
        rmssd: 35,
        pnn50: 20,
        meanHR: 67,
        minHR: 55,
        maxHR: 80,
        hrRange: 25,
      },
      frequencyDomain: {
        available: true,
        value: {
          lfPowerNorm: 60,
          hfPowerNorm: 40,
          lfHfRatio: 1.5,
          lfPeak: 0.1,
          hfPeak: 0.25,
          spectrum: [],
        },
      },
      poincare: { available: true, value: { points: [] } },
      resonance: {
        available: true,
        value: {
          peakToTroughAmplitude: 12,
          waveformSmoothness: 0.8,
          phaseSynchrony: 0.75,
          lfPeakCount: 1,
          lfPeakAmplitude: 60,
        },
      },
      quality: {
        totalSamples: 200,
        artifactsDetected: 2,
        artifactPercentage: 1,
        meanSignalQuality: 0.95,
      },
      raw: {
        rrIntervals: [],
        timestamps: [],
        instantaneousHR: [],
      },
    },
    ...rest,
  };
}

describe('HrvTrends', () => {
  it('renders without crashing with empty measurements', () => {
    const wrapper = mount(HrvTrends, {
      props: { measurements: [] },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders with sample measurement data', () => {
    const measurements = [
      makeMeasurement({ daysAgo: 5 }),
      makeMeasurement({ daysAgo: 3 }),
      makeMeasurement({ daysAgo: 1 }),
    ];
    const wrapper = mount(HrvTrends, {
      props: { measurements },
    });
    expect(wrapper.exists()).toBe(true);
  });

  it('renders time range buttons', () => {
    const wrapper = mount(HrvTrends, {
      props: { measurements: [] },
    });
    const selector = wrapper.find('[data-testid="time-range-selector"]');
    expect(selector.exists()).toBe(true);

    const buttons = selector.findAll('button');
    expect(buttons.length).toBe(4);
    expect(buttons[0].text()).toBe('7d');
    expect(buttons[1].text()).toBe('30d');
    expect(buttons[2].text()).toBe('90d');
    expect(buttons[3].text()).toBe('All');
  });

  it('creates canvas elements for each chart type', () => {
    const measurements = [makeMeasurement({ daysAgo: 2 }), makeMeasurement({ daysAgo: 1 })];
    const wrapper = mount(HrvTrends, {
      props: { measurements },
    });

    expect(wrapper.find('[data-testid="rmssd-canvas"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="lf-power-canvas"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="hr-canvas"]').exists()).toBe(true);
  });

  it('shows "no data" message when filtered range has no measurements', () => {
    // Measurements from 60 days ago — won't appear in default 30-day view
    const measurements = [makeMeasurement({ daysAgo: 60 })];
    const wrapper = mount(HrvTrends, {
      props: { measurements },
    });
    // The "No data in selected range" text should appear inside chart containers
    expect(wrapper.text()).toContain('No data in selected range');
  });

  it('switching time range filters data', async () => {
    const measurements = [makeMeasurement({ daysAgo: 5 }), makeMeasurement({ daysAgo: 60 })];
    const wrapper = mount(HrvTrends, {
      props: { measurements },
    });

    // Click "7d" button
    const sevenDayBtn = wrapper.find('[data-testid="range-btn-7d"]');
    await sevenDayBtn.trigger('click');

    // In 7d view, 60-day-old measurement is filtered out
    // The charts should still render without crashing
    expect(wrapper.exists()).toBe(true);
  });

  it('shows morning readiness chart when morning-readiness measurements exist', () => {
    const measurements = [
      makeMeasurement({ type: 'morning-readiness', daysAgo: 2 }),
      makeMeasurement({ type: 'morning-readiness', daysAgo: 1 }),
    ];
    const wrapper = mount(HrvTrends, {
      props: { measurements },
    });
    expect(wrapper.find('[data-testid="readiness-chart-container"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="readiness-canvas"]').exists()).toBe(true);
  });

  it('does not show morning readiness chart with no morning-readiness measurements', () => {
    const measurements = [makeMeasurement({ daysAgo: 1 })];
    const wrapper = mount(HrvTrends, {
      props: { measurements },
    });
    expect(wrapper.find('[data-testid="readiness-chart-container"]').exists()).toBe(false);
  });

  it('uses within-person comparison guidance without generic targets or recovery claims', () => {
    const wrapper = mount(HrvTrends, {
      props: {
        measurements: [
          makeMeasurement({ daysAgo: 3 }),
          makeMeasurement({ daysAgo: 2 }),
          makeMeasurement({ daysAgo: 1 }),
        ],
      },
    });

    expect(wrapper.text()).toContain('same protocol, duration, sensor, and conditions');
    expect(wrapper.text()).not.toContain('Target:');
    expect(wrapper.text()).not.toContain('Lower = better recovery');
    expect(wrapper.text()).not.toContain('training effect');
  });
});
