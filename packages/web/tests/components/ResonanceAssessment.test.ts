import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ResonanceAssessment from '../../src/components/ResonanceAssessment.vue';

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: { keepAwake: vi.fn(), allowSleep: vi.fn() },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('../../src/services/ttsService', () => ({
  ttsService: { speak: vi.fn(), setEnabled: vi.fn(), setVoiceByUri: vi.fn() },
}));

vi.mock('../../src/services/soundService', () => ({
  soundService: { playClick: vi.fn(), setEnabled: vi.fn(), setTheme: vi.fn() },
}));

describe('ResonanceAssessment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders INTRO phase by default', () => {
    const wrapper = mount(ResonanceAssessment);
    expect(wrapper.text()).toContain('Resonance Frequency Assessment');
    expect(wrapper.text()).toContain('Start Assessment');
  });

  it('shows warmup config controls on INTRO', () => {
    const wrapper = mount(ResonanceAssessment);
    expect(wrapper.text()).toContain('Warmup');
  });

  it('emits cancel when back button clicked on INTRO', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('transitions to WARMUP when Start Assessment clicked', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    expect(wrapper.text()).toContain('Warmup');
    expect(wrapper.find('[data-testid="breathing-visualizer"]').exists()).toBe(true);
  });

  it('shows cancel confirmation during active phases', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    expect(wrapper.text()).toContain('Cancel assessment');
  });

  describe('Scoring phase', () => {
    it('shows 5 trial cards in SCORING phase', async () => {
      const wrapper = mount(ResonanceAssessment);
      await wrapper.vm.setPhaseForTesting('SCORING');
      await wrapper.vm.$nextTick();
      const cards = wrapper.findAll('[data-testid="trial-card"]');
      expect(cards).toHaveLength(5);
    });

    it('shows comfort rating for each trial', async () => {
      const wrapper = mount(ResonanceAssessment);
      await wrapper.vm.setPhaseForTesting('SCORING');
      await wrapper.vm.$nextTick();
      expect(wrapper.findAll('[data-testid="comfort-rating"]')).toHaveLength(5);
    });
  });

  describe('Result phase', () => {
    it('shows suggested rate after calculating', async () => {
      const wrapper = mount(ResonanceAssessment);
      await wrapper.vm.setPhaseForTesting('RESULT');
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toContain('Suggested Rate');
    });
  });
});
