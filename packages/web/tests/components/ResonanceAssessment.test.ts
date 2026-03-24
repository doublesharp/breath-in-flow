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

vi.mock('../../src/services/ppgService', () => ({
  ppgService: { start: vi.fn(), stop: vi.fn(), setCallbacks: vi.fn() },
}));

vi.mock('../../src/services/scgService', () => ({
  scgService: { start: vi.fn(), stop: vi.fn(), setCallbacks: vi.fn() },
}));

vi.mock('../../src/services/sensorFusion', () => ({
  sensorFusionService: { start: vi.fn(), stop: vi.fn(), reset: vi.fn(), setCallbacks: vi.fn(), addPPGSample: vi.fn(), addSCGSample: vi.fn(), getQuality: vi.fn(() => 0) },
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

  describe('Sensor mode selection', () => {
    it('renders sensor mode selector in INTRO phase', () => {
      const wrapper = mount(ResonanceAssessment);
      const sensorSection = wrapper.find('[data-testid="sensor-selection"]');
      expect(sensorSection.exists()).toBe(true);
      expect(sensorSection.text()).toContain('Heart Rate Measurement');
      expect(sensorSection.text()).toContain('Manual Scoring');
      expect(sensorSection.text()).toContain('Dual Sensor (Best Accuracy)');
      expect(sensorSection.text()).toContain('Camera Only (Finger PPG)');
      expect(sensorSection.text()).toContain('Accelerometer Only (Chest)');
    });

    it('shows the dual sensor mode option in INTRO phase', () => {
      const wrapper = mount(ResonanceAssessment);
      const sensorSection = wrapper.find('[data-testid="sensor-selection"]');
      const buttons = sensorSection.findAll('button');
      // 4 modes: none, dual, camera, accelerometer
      expect(buttons).toHaveLength(4);
      expect(buttons[1].text()).toContain('Dual Sensor (Best Accuracy)');
    });

    it('defaults to none (Manual Scoring) sensor mode', () => {
      const wrapper = mount(ResonanceAssessment);
      const sensorSection = wrapper.find('[data-testid="sensor-selection"]');
      // The first button (Manual Scoring) should have the selected class
      const buttons = sensorSection.findAll('button');
      expect(buttons[0].classes()).toContain('border-emerald-500');
      expect(buttons[1].classes()).not.toContain('border-emerald-500');
      expect(buttons[2].classes()).not.toContain('border-emerald-500');
      expect(buttons[3].classes()).not.toContain('border-emerald-500');
    });
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
