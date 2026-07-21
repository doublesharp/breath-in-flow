import { mount } from '@vue/test-utils';
import { describe, it, expect, vi } from 'vitest';
import RecommendedActions from '@/components/RecommendedActions.vue';
import { guidedPresets } from '@/data/guidedPresets';
import { resolveRecommendation } from '@/services/recommendationService';
import {
  DEFAULT_BREATHING_CONFIG,
  type BreathingConfig,
  type Session,
} from '@breath-in-flow/shared';

vi.mock('@/services/recommendationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/services/recommendationService')>();
  return { ...actual, resolveRecommendation: vi.fn(actual.resolveRecommendation) };
});

function completedSession(configName: string): Session {
  const configSnapshot: BreathingConfig = {
    ...DEFAULT_BREATHING_CONFIG,
    id: '11111111-1111-4111-8111-111111111111',
    name: configName,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  return {
    id: '22222222-2222-4222-8222-222222222222',
    configSnapshot,
    status: 'COMPLETED',
    sets: [],
    targetSets: 0,
    completedSets: 0,
    startedAt: new Date('2026-01-02T00:00:00Z'),
    completedAt: new Date('2026-01-02T00:05:00Z'),
  };
}

describe('RecommendedActions', () => {
  it('emits a validated clone that cannot corrupt the built-in preset', async () => {
    const wrapper = mount(RecommendedActions, {
      props: { goal: 'RELAX', lastSession: null },
    });

    await wrapper.get('[data-testid="start-recommended"]').trigger('click');
    const emitted = wrapper.emitted('start')![0][0] as BreathingConfig;
    expect(emitted.name).toBe('Stress Relief (Quick)');

    emitted.name = 'Changed';
    expect(guidedPresets.find((p) => p.id === 'stress-relief-quick')!.config.name).toBe(
      'Stress Relief (Quick)'
    );
  });

  it('emits an adjustable clone through Adjust first', async () => {
    const wrapper = mount(RecommendedActions, {
      props: { goal: 'RELAX', lastSession: null },
    });

    await wrapper.get('[data-testid="adjust-recommended"]').trigger('click');
    const emitted = wrapper.emitted('adjust')![0][0] as BreathingConfig;
    expect(emitted.name).toBe('Stress Relief (Quick)');
  });

  it('routes the pulse variability goal to the Lab', async () => {
    const wrapper = mount(RecommendedActions, {
      props: { goal: 'EXPLORE_PULSE_VARIABILITY', lastSession: null },
    });

    expect(wrapper.find('[data-testid="start-recommended"]').exists()).toBe(false);
    await wrapper.get('[data-testid="open-lab"]').trigger('click');
    expect(wrapper.emitted('openLab')).toHaveLength(1);
  });

  it('falls back without a start action when the preset is missing', async () => {
    vi.mocked(resolveRecommendation).mockReturnValueOnce({
      kind: 'presets',
      title: 'Choose a breathing preset',
    });

    const wrapper = mount(RecommendedActions, {
      props: { goal: 'RELAX', lastSession: null },
    });

    expect(wrapper.find('[data-testid="start-recommended"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="recommended-fallback"]').exists()).toBe(true);
  });

  it('hides the repeat action when there is no completed session', () => {
    const wrapper = mount(RecommendedActions, {
      props: { goal: 'RELAX', lastSession: null },
    });

    expect(wrapper.find('[data-testid="repeat-last"]').exists()).toBe(false);
  });

  it('repeats an isolated snapshot of the last completed session', async () => {
    const lastSession = completedSession('My Saved Session');
    const wrapper = mount(RecommendedActions, {
      props: { goal: 'RELAX', lastSession },
    });

    await wrapper.get('[data-testid="repeat-last"]').trigger('click');
    const emitted = wrapper.emitted('repeat')![0][0] as BreathingConfig;
    expect(emitted.name).toBe('My Saved Session');

    // Mutating the emitted config must not touch the stored session snapshot.
    emitted.name = 'Mutated';
    expect(lastSession.configSnapshot.name).toBe('My Saved Session');
  });
});
