import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import GoalOnboarding from '@/components/GoalOnboarding.vue';

describe('GoalOnboarding', () => {
  it('renders a labelled dialog with exactly four named goal choices when open', () => {
    const wrapper = mount(GoalOnboarding, { props: { open: true } });

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes('aria-labelledby')).toBe('goal-onboarding-title');
    expect(wrapper.find('#goal-onboarding-title').exists()).toBe(true);
    expect(wrapper.findAll('input[name="wellness-goal"]')).toHaveLength(4);
    expect(dialog.classes()).toContain('overflow-y-auto');
    expect(wrapper.get('[data-testid="goal-onboarding-card"]').classes()).toEqual(
      expect.arrayContaining(['max-h-[calc(100dvh-2rem)]', 'w-[calc(100vw-2rem)]', 'min-w-0'])
    );
    expect(wrapper.get('[data-testid="goal-onboarding-actions"]').classes()).toEqual(
      expect.arrayContaining(['sticky', 'bottom-0', 'z-10'])
    );
  });

  it('renders nothing while closed', () => {
    const wrapper = mount(GoalOnboarding, { props: { open: false } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('emits the chosen goal only after a selection is made', async () => {
    const wrapper = mount(GoalOnboarding, { props: { open: true } });

    // No selection yet: saving must not emit a goal.
    await wrapper.get('[data-testid="save-goal"]').trigger('click');
    expect(wrapper.emitted('select')).toBeUndefined();

    await wrapper.get('[data-testid="goal-relax"]').setValue();
    await wrapper.get('[data-testid="save-goal"]').trigger('click');

    expect(wrapper.emitted('select')).toEqual([['RELAX']]);
  });

  it('reaches every supported goal through its labelled control', async () => {
    const cases: Array<[string, string]> = [
      ['goal-relax', 'RELAX'],
      ['goal-diaphragm', 'TRAIN_DIAPHRAGM'],
      ['goal-consistency', 'BUILD_CONSISTENCY'],
      ['goal-pulse', 'EXPLORE_PULSE_VARIABILITY'],
    ];

    for (const [testId, goal] of cases) {
      const wrapper = mount(GoalOnboarding, { props: { open: true } });
      await wrapper.get(`[data-testid="${testId}"]`).setValue();
      await wrapper.get('[data-testid="save-goal"]').trigger('click');
      expect(wrapper.emitted('select')).toEqual([[goal]]);
      wrapper.unmount();
    }
  });
});
