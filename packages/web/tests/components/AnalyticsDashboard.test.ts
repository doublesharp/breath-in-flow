import { enableAutoUnmount, flushPromises, shallowMount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_BREATHING_CONFIG, type SessionStatus } from '@breath-in-flow/shared';
import AnalyticsDashboard from '@/components/AnalyticsDashboard.vue';
import SessionStatusBadge from '@/components/SessionStatusBadge.vue';
import HoldTimeChart from '@/components/charts/HoldTimeChart.vue';
import SessionsPerWeekChart from '@/components/charts/SessionsPerWeekChart.vue';
import { resetStorageForTesting, useStorage } from '@/composables/useStorage';
import type { SessionBiometrics } from '@/services/wearables/types';
import { garminService } from '@/services/wearables/garmin';

vi.mock('@/services/wearables/garmin', () => ({
  garminService: { isConnected: vi.fn(), getSessionBiometrics: vi.fn() },
}));

enableAutoUnmount(afterEach);

const storage = useStorage();
const startedAt = new Date('2026-07-20T12:00:00Z');
const completedAt = new Date('2026-07-20T12:05:00Z');

function addSession(name: string, status: SessionStatus, holds: number[] = []) {
  const session = storage.createSession({ ...DEFAULT_BREATHING_CONFIG, name });
  holds.forEach((actualDuration, index) => {
    storage.addSetToSession(session.id!, {
      setNumber: index + 1,
      completedRepetitions: 4,
      extendedHolds: [{ type: 'EXHALE', mode: 'TOLERANCE', actualDuration, completedAt }],
      startedAt,
      completedAt,
    });
  });
  return storage.updateSession(session.id!, {
    status,
    startedAt,
    completedAt: status === 'IN_PROGRESS' ? undefined : completedAt,
  })!;
}

function biometrics(sessionStart: Date, sessionEnd: Date): SessionBiometrics {
  const empty = { stress: [], heartRate: [], hrv: [], spo2: [] };
  return {
    sessionId: 'session-biometrics',
    sessionStart,
    sessionEnd,
    preSession: empty,
    duringSession: { ...empty, stress: [{ timestamp: sessionStart, value: 25, source: 'garmin' }] },
    postSession: empty,
    averages: {},
  };
}

describe('AnalyticsDashboard.vue', () => {
  beforeEach(() => {
    localStorage.clear();
    resetStorageForTesting();
    vi.resetAllMocks();
    vi.mocked(garminService.isConnected).mockReturnValue(false);
  });

  it('limits both charts and summary stats to completed sessions while listing all statuses', () => {
    const completed = addSession('Completed routine', 'COMPLETED', [30, 90]);
    addSession('Cancelled routine', 'CANCELLED', [250]);
    addSession('Current routine', 'IN_PROGRESS');

    const wrapper = shallowMount(AnalyticsDashboard, {
      global: { stubs: { SessionStatusBadge: false } },
    });
    expect(wrapper.getComponent(SessionsPerWeekChart).props('sessions')).toEqual([completed]);
    expect(wrapper.getComponent(HoldTimeChart).props('sessions')).toEqual([completed]);
    expect(wrapper.findAll('.stat-card').map((card) => card.text())).toEqual([
      '1Total Sessions',
      '2Total Sets',
      '1m 0sAvg Hold Time',
      '1m 30sBest Hold Time',
    ]);

    const badges = wrapper.findAllComponents(SessionStatusBadge);
    expect(badges.map((badge) => badge.text())).toEqual(['In progress', 'Cancelled', 'Completed']);
    expect(badges.map((badge) => badge.attributes('data-status'))).toEqual([
      'IN_PROGRESS',
      'CANCELLED',
      'COMPLETED',
    ]);
    const icons = badges.map((badge) => badge.get('svg[aria-hidden="true"] path').attributes('d'));
    expect(new Set(icons).size).toBe(3);
    expect(wrapper.text()).toContain('4s · 4s');
    expect(wrapper.text()).toContain('Recent Sessions');
    expect(wrapper.text()).toContain('Track your breathing practice and hold progress');
    expect(wrapper.text()).toContain('Completed routine');
    expect(wrapper.text()).toContain('Cancelled routine');
    expect(wrapper.text()).toContain('Current routine');
    expect(wrapper.text()).not.toContain('No session data yet.');
  });

  it('shows an empty history, empty charts, and zero stats for a new user', () => {
    const wrapper = shallowMount(AnalyticsDashboard);
    expect(wrapper.get('h2').text()).toBe('Analytics Dashboard');
    expect(wrapper.text()).toContain('No session data yet.');
    expect(wrapper.text()).not.toContain('Recent Sessions');
    expect(wrapper.text()).not.toContain('Wearable Devices');
    expect(wrapper.findAll('.stat-card').map((card) => card.text())).toEqual([
      '0Total Sessions',
      '0Total Sets',
      '0sAvg Hold Time',
      '0sBest Hold Time',
    ]);
    expect(wrapper.getComponent(SessionsPerWeekChart).props('sessions')).toEqual([]);
    expect(wrapper.getComponent(HoldTimeChart).props('sessions')).toEqual([]);
    expect(garminService.getSessionBiometrics).not.toHaveBeenCalled();
  });

  it.each([
    [30.4, '30s'],
    [59.5, '1m 0s'],
    [119.5, '2m 0s'],
    [125.4, '2m 5s'],
  ])('formats a completed hold of %s seconds as %s', (duration, expected) => {
    addSession('Timed hold', 'COMPLETED', [duration]);

    const wrapper = shallowMount(AnalyticsDashboard);
    expect(wrapper.findAll('.stat-card').slice(2).map((card) => card.get('.tabular-nums').text())).toEqual([
      expected,
      expected,
    ]);
  });

  it.each([
    ['COMPLETED', completedAt],
    ['IN_PROGRESS', new Date('2026-07-20T12:10:00Z')],
  ] as const)('requests biometrics with the stored start and expected end for a %s session', async (status, end) => {
    addSession('Recent practice', status);
    vi.mocked(garminService.isConnected).mockReturnValue(true);
    vi.mocked(garminService.getSessionBiometrics).mockImplementation(async (start, end) => biometrics(start, end));

    const wrapper = shallowMount(AnalyticsDashboard);
    await flushPromises();

    expect(garminService.getSessionBiometrics).toHaveBeenCalledExactlyOnceWith(startedAt, end);
    expect(wrapper.text()).not.toContain('Stress Levels During Last Session');
  });

  it('uses the demo time window when the wearable is connected and history is empty', async () => {
    vi.setSystemTime(startedAt);
    try {
      vi.mocked(garminService.isConnected).mockReturnValue(true);
      vi.mocked(garminService.getSessionBiometrics).mockImplementation(async (start, end) => biometrics(start, end));

      const wrapper = shallowMount(AnalyticsDashboard);
      await flushPromises();

      expect(garminService.getSessionBiometrics).toHaveBeenCalledExactlyOnceWith(
        new Date('2026-07-20T11:30:00Z'),
        new Date('2026-07-20T11:50:00Z')
      );
      expect(wrapper.text()).toContain('No session data yet.');
    } finally {
      vi.useRealTimers();
    }
  });
});
