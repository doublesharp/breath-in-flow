import { shallowMount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, it, expect, vi } from 'vitest';
// The project uses `HoldTimeChart.vue` as the time chart component.
import HoldTimeChart from '@/components/charts/HoldTimeChart.vue';
import SessionsPerWeekChart from '@/components/charts/SessionsPerWeekChart.vue';
import StressChart from '@/components/charts/StressChart.vue';
import type { Session } from '@breath-in-flow/shared';
import type { StressDataPoint } from '@/services/wearables/types';

// Stub Chart.js used by the chart components to avoid initializing canvases.
vi.mock('chart.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('chart.js')>();
  return {
    ...actual,
    Chart: class {
      static register() {}
      destroy = vi.fn();
      update() {}
      constructor() {}
    },
  };
});

function makeSession(id: string, startedAt: Date): Session {
  return {
    id,
    configId: 'config',
    configSnapshot: {} as Record<string, unknown>,
    status: 'COMPLETED',
    sets: [],
    targetSets: 1,
    completedSets: 1,
    startedAt,
    completedAt: startedAt,
  } as unknown as Session;
}

function makeStressPoint(value: number, timestamp: string): StressDataPoint {
  return {
    value,
    timestamp: new Date(timestamp),
    source: 'test',
  };
}

function statValue(wrapper: VueWrapper, label: string) {
  const labelNode = wrapper.findAll('.uppercase').find((node) => node.text() === label);
  expect(labelNode, `Missing ${label} statistic`).toBeDefined();
  return labelNode!.element.nextElementSibling!.textContent!.trim();
}

afterEach(() => {
  vi.useRealTimers();
});

describe('HoldTimeChart.vue', () => {
  it('mounts with empty data without throwing', () => {
    const wrapper = shallowMount(HoldTimeChart, { props: { sessions: [] } });
    expect(wrapper.text()).toContain('No hold data available');
  });

  it.each([
    [0, '0s'],
    [30.4, '30s'],
    [59.5, '1m 0s'],
    [60, '1m 0s'],
    [119.5, '2m 0s'],
    [125.4, '2m 5s'],
  ])('normalizes rounded hold statistics at %s seconds', (duration, expected) => {
    const session = makeSession('hold', new Date('2026-09-01T12:00:00Z'));
    session.sets = [
      {
        setNumber: 1,
        completedRepetitions: 1,
        startedAt: session.startedAt,
        extendedHolds: [
          {
            completedAt: session.completedAt!,
            actualDuration: duration,
            type: 'EXHALE',
            mode: 'TOLERANCE',
          },
        ],
      },
    ];
    const wrapper = shallowMount(HoldTimeChart, { props: { sessions: [session] } });
    expect(statValue(wrapper, 'Average')).toBe(expected);
    expect(statValue(wrapper, 'Best')).toBe(expected);
    wrapper.unmount();
  });

  it('renders stats when sessions contain holds', () => {
    // Build minimal session data expected by the component
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as Record<string, unknown>,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 0,
            extendedHolds: [
              {
                completedAt: new Date('2025-01-01T10:00:00Z').toISOString(),
                actualDuration: 10,
                type: 'INHALE',
                mode: 'TIMED',
              },
              {
                completedAt: new Date('2025-01-02T10:00:00Z').toISOString(),
                actualDuration: 20,
                type: 'EXHALE',
                mode: 'TIMED',
              },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as unknown as Session,
      {
        id: 's2',
        configId: 'c2',
        configSnapshot: {} as Record<string, unknown>,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 0,
            extendedHolds: [
              {
                completedAt: new Date('2025-01-03T10:00:00Z').toISOString(),
                actualDuration: 30,
                type: 'INHALE',
                mode: 'TIMED',
              },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as unknown as Session,
    ];

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } });

    // Should render summary stats
    const text = wrapper.text();
    expect(text).toContain('Average');
    expect(text).toContain('Best');
    expect(text).toContain('Sessions');

    expect(statValue(wrapper, 'Average')).toBe('20s');
    expect(statValue(wrapper, 'Best')).toBe('30s');
    expect(statValue(wrapper, 'Sessions')).toBe('2');
  });

  it('displays improvement when enough data exists', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as Record<string, unknown>,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 0,
            extendedHolds: [
              {
                completedAt: new Date('2025-01-01T10:00:00Z').toISOString(),
                actualDuration: 10,
                type: 'INHALE',
                mode: 'TIMED',
              },
              {
                completedAt: new Date('2025-01-02T10:00:00Z').toISOString(),
                actualDuration: 12,
                type: 'EXHALE',
                mode: 'TIMED',
              },
              {
                completedAt: new Date('2025-01-03T10:00:00Z').toISOString(),
                actualDuration: 11,
                type: 'INHALE',
                mode: 'TIMED',
              },
              {
                completedAt: new Date('2025-01-04T10:00:00Z').toISOString(),
                actualDuration: 25,
                type: 'EXHALE',
                mode: 'TIMED',
              },
              {
                completedAt: new Date('2025-01-05T10:00:00Z').toISOString(),
                actualDuration: 28,
                type: 'INHALE',
                mode: 'TIMED',
              },
              {
                completedAt: new Date('2025-01-06T10:00:00Z').toISOString(),
                actualDuration: 30,
                type: 'EXHALE',
                mode: 'TIMED',
              },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as unknown as Session,
    ];

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } });
    const text = wrapper.text();

    expect(text).toContain('↑ 16.7s');
    expect(statValue(wrapper, 'Best')).toBe('30s');
  });

  it.each([
    [[10, 20], '↑ 10.0s'],
    [[20, 10], '↓ 10.0s'],
    [[10, 10], '→ 0.0s'],
    [[10, 15, 20], '↑ 10.0s'],
    [[10, 20, 30, 40], '↑ 20.0s'],
  ])('compares separate groups for hold durations %j', (durations, expected) => {
    const session = makeSession('holds', new Date('2026-01-01'));
    session.sets = [
      {
        setNumber: 1,
        completedRepetitions: 1,
        startedAt: session.startedAt,
        extendedHolds: durations.map((actualDuration, index) => ({
          completedAt: new Date(Date.UTC(2026, 0, index + 1)),
          actualDuration,
          type: 'EXHALE',
          mode: 'TOLERANCE',
        })),
      },
    ];
    const wrapper = shallowMount(HoldTimeChart, { props: { sessions: [session] } });
    expect(wrapper.text()).toContain(expected);
  });

  it('handles single hold correctly', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as Record<string, unknown>,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 0,
            extendedHolds: [
              {
                completedAt: new Date('2025-01-01T10:00:00Z').toISOString(),
                actualDuration: 15,
                type: 'INHALE',
                mode: 'TOLERANCE',
              },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as unknown as Session,
    ];

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } });
    const text = wrapper.text();

    expect(text).toContain('Best');
    expect(text).toContain('Average');
  });

  it('handles sessions with multiple sets', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as Record<string, unknown>,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 4,
            extendedHolds: [
              {
                completedAt: new Date('2025-01-01T10:00:00Z').toISOString(),
                actualDuration: 20,
                type: 'EXHALE',
                mode: 'TIMED',
              },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
          {
            setNumber: 2,
            completedRepetitions: 4,
            extendedHolds: [
              {
                completedAt: new Date('2025-01-01T10:05:00Z').toISOString(),
                actualDuration: 25,
                type: 'EXHALE',
                mode: 'TIMED',
              },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 2,
        completedSets: 2,
        startedAt: new Date(),
        completedAt: new Date(),
      } as unknown as Session,
    ];

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } });
    const text = wrapper.text();

    expect(statValue(wrapper, 'Average')).toBe('23s');
    expect(statValue(wrapper, 'Best')).toBe('25s');
    expect(statValue(wrapper, 'Sessions')).toBe('1');
    expect(text).toContain('↑ 5.0s');
  });

  it('displays improvement metrics when there are multiple holds', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as Record<string, unknown>,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 4,
            extendedHolds: [
              {
                completedAt: new Date('2025-01-01T10:00:00Z').toISOString(),
                actualDuration: 20,
                type: 'EXHALE',
                mode: 'TIMED',
              },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as unknown as Session,
      {
        id: 's2',
        configId: 'c1',
        configSnapshot: {} as Record<string, unknown>,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 4,
            extendedHolds: [
              {
                completedAt: new Date('2025-01-02T10:00:00Z').toISOString(),
                actualDuration: 25,
                type: 'EXHALE',
                mode: 'TIMED',
              },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as unknown as Session,
    ];

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } });
    const text = wrapper.text();

    // Should show stats
    expect(text).toContain('Best');
    expect(text).toContain('Average');
    expect(text).toContain('↑ 5.0s');
    expect(statValue(wrapper, 'Average')).toBe('23s');
    expect(statValue(wrapper, 'Best')).toBe('25s');
    expect(statValue(wrapper, 'Sessions')).toBe('2');
  });

  it('renders with INHALE hold type', () => {
    const sessions: Session[] = [
      {
        id: 's1',
        configId: 'c1',
        configSnapshot: {} as Record<string, unknown>,
        status: 'COMPLETED',
        sets: [
          {
            setNumber: 1,
            completedRepetitions: 4,
            extendedHolds: [
              {
                completedAt: new Date('2025-01-01T10:00:00Z').toISOString(),
                actualDuration: 15,
                type: 'INHALE',
                mode: 'TOLERANCE',
              },
            ],
            startedAt: new Date(),
            completedAt: new Date(),
          },
        ],
        targetSets: 1,
        completedSets: 1,
        startedAt: new Date(),
        completedAt: new Date(),
      } as unknown as Session,
    ];

    const wrapper = shallowMount(HoldTimeChart, { props: { sessions } });
    const text = wrapper.text();

    expect(text).toContain('Best');
    expect(text).toContain('1');
  });
});

describe('SessionsPerWeekChart.vue', () => {
  it('renders empty-state copy when no sessions are available', () => {
    const wrapper = shallowMount(SessionsPerWeekChart, { props: { sessions: [] } });

    expect(wrapper.text()).toContain('No session data available');
  });

  it('buckets sessions by ISO-style week and summarizes current-week activity', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T12:00:00Z'));

    const wrapper = shallowMount(SessionsPerWeekChart, {
      props: {
        sessions: [
          makeSession('this-week-1', new Date('2026-06-22T09:00:00Z')),
          makeSession('this-week-2', new Date('2026-06-24T09:00:00Z')),
          makeSession('last-week', new Date('2026-06-17T09:00:00Z')),
          makeSession('too-old', new Date('2026-03-01T09:00:00Z')),
        ],
      },
    });

    const text = wrapper.text();
    expect(text).toContain('Avg per Week');
    expect(text).toContain('This Week');
    expect(text).toContain('0.4');
    expect(text).toContain('2');
  });
});

describe('StressChart.vue', () => {
  it('renders empty-state copy when no stress data is available', () => {
    const wrapper = shallowMount(StressChart);

    expect(wrapper.text()).toContain('No data available');
  });

  it('shows stress reduction and legend when pre and post averages improve', () => {
    const wrapper = shallowMount(StressChart, {
      props: {
        preData: [
          makeStressPoint(80, '2026-06-24T08:00:00Z'),
          makeStressPoint(60, '2026-06-24T08:05:00Z'),
        ],
        duringData: [makeStressPoint(50, '2026-06-24T08:30:00Z')],
        postData: [
          makeStressPoint(40, '2026-06-24T09:00:00Z'),
          makeStressPoint(30, '2026-06-24T09:05:00Z'),
        ],
      },
    });

    const text = wrapper.text();
    expect(text).toContain('50.0%');
    expect(text).toContain('Pre-session');
    expect(text).toContain('During session');
    expect(text).toContain('Post-session');
  });

  it('hides legend when requested', () => {
    const wrapper = shallowMount(StressChart, {
      props: {
        showLegend: false,
        duringData: [makeStressPoint(42, '2026-06-24T08:30:00Z')],
      },
    });

    expect(wrapper.text()).not.toContain('During session');
  });
});
