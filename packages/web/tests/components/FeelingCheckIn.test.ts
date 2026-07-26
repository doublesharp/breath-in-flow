import { mount } from '@vue/test-utils';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { nextTick } from 'vue';
import FeelingCheckIn from '@/components/FeelingCheckIn.vue';

const COMFORT_LABELS = [
  'Very uncomfortable',
  'Uncomfortable',
  'Neutral',
  'Comfortable',
  'Very comfortable',
];

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('FeelingCheckIn', () => {
  it('renders nothing while closed', () => {
    const wrapper = mount(FeelingCheckIn, { props: { open: false, stage: 'before' } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
  });

  it('renders a labelled dialog with all five comfort labels when open', () => {
    const wrapper = mount(FeelingCheckIn, { props: { open: true, stage: 'before' } });

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-labelledby')).toBe('feeling-checkin-title');
    expect(wrapper.find('#feeling-checkin-title').exists()).toBe(true);

    expect(wrapper.findAll('input[name="feeling-score"]')).toHaveLength(5);
    for (const label of COMFORT_LABELS) {
      expect(wrapper.text()).toContain(label);
    }
    expect(dialog.classes()).toContain('overflow-y-auto');
    expect(wrapper.get('[data-testid="checkin-card"]').classes()).toContain('max-h-[calc(100dvh-2rem)]');
  });

  it('emits skip without a score when the skip control is used', async () => {
    const wrapper = mount(FeelingCheckIn, { props: { open: true, stage: 'before' } });

    await wrapper.get('[data-testid="checkin-skip"]').trigger('click');

    expect(wrapper.emitted('skip')).toHaveLength(1);
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('cannot submit until a comfort score is selected', async () => {
    const wrapper = mount(FeelingCheckIn, { props: { open: true, stage: 'before' } });

    const submit = wrapper.get('[data-testid="checkin-submit"]');
    expect(submit.attributes('disabled')).toBeDefined();

    await submit.trigger('click');
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  it('emits the selected score on submit', async () => {
    const wrapper = mount(FeelingCheckIn, { props: { open: true, stage: 'before' } });

    await wrapper.get('[data-testid="feeling-score-2"]').setValue();
    await wrapper.get('[data-testid="checkin-submit"]').trigger('click');

    expect(wrapper.emitted('submit')).toEqual([[{ score: 2 }]]);
  });

  it('does not render a comment field in before mode', () => {
    const wrapper = mount(FeelingCheckIn, { props: { open: true, stage: 'before' } });
    expect(wrapper.find('[data-testid="checkin-comment"]').exists()).toBe(false);
  });

  it('renders a 500-character-limited comment field in after mode', async () => {
    const wrapper = mount(FeelingCheckIn, { props: { open: true, stage: 'after' } });

    const comment = wrapper.get('[data-testid="checkin-comment"]');
    expect(comment.attributes('maxlength')).toBe('500');

    await wrapper.get('[data-testid="feeling-score-4"]').setValue();
    await comment.setValue('Felt easier');
    await wrapper.get('[data-testid="checkin-submit"]').trigger('click');

    expect(wrapper.emitted('submit')).toEqual([[{ score: 4, comment: 'Felt easier' }]]);
  });

  it('omits an empty comment from the after-mode submission', async () => {
    const wrapper = mount(FeelingCheckIn, { props: { open: true, stage: 'after' } });

    await wrapper.get('[data-testid="feeling-score-3"]').setValue();
    await wrapper.get('[data-testid="checkin-comment"]').setValue('   ');
    await wrapper.get('[data-testid="checkin-submit"]').trigger('click');

    expect(wrapper.emitted('submit')).toEqual([[{ score: 3 }]]);
  });

  it('emits skip when Escape is pressed', async () => {
    const wrapper = mount(FeelingCheckIn, {
      props: { open: true, stage: 'before' },
      attachTo: document.body,
    });

    await nextTick();
    await nextTick();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await nextTick();

    expect(wrapper.emitted('skip')).toHaveLength(1);
    expect(wrapper.emitted('submit')).toBeUndefined();

    wrapper.unmount();
  });

  it('isolates focus into the dialog when opened', async () => {
    const background = document.createElement('button');
    background.setAttribute('data-testid', 'background');
    document.body.appendChild(background);
    background.focus();

    const wrapper = mount(FeelingCheckIn, {
      props: { open: true, stage: 'before' },
      attachTo: document.body,
    });

    await nextTick();
    await nextTick();

    expect(background.getAttribute('inert')).toBe('');
    expect(wrapper.get('[role="dialog"]').element.contains(document.activeElement)).toBe(true);

    wrapper.unmount();
  });
});
