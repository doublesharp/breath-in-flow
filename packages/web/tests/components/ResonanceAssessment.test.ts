import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ResonanceAssessment, {
  buildAssessmentTrials,
  RESONANCE_TRIAL_DURATION_SECONDS,
} from '../../src/components/ResonanceAssessment.vue';
import { ASSESSMENT_TRIALS } from '@breath-in-flow/shared';
import { ppgService } from '../../src/services/ppgService';

const { saveAssessment, requestSensorPermissions, getPermissionDeniedMessage } = vi.hoisted(() => ({
  saveAssessment: vi.fn(),
  requestSensorPermissions: vi.fn(),
  getPermissionDeniedMessage: vi.fn(),
}));

let lastLifecycleOptions:
  { onInactive: () => void | Promise<void>; onActive: () => void | Promise<void> } | undefined;

vi.mock('../../src/composables/useAppLifecycle', () => ({
  useAppLifecycle: (options: {
    onInactive: () => void | Promise<void>;
    onActive: () => void | Promise<void>;
  }) => {
    lastLifecycleOptions = options;
    return { dispose: vi.fn().mockResolvedValue(undefined) };
  },
}));

vi.mock('../../src/composables/useHrvStorage', () => ({
  useHrvStorage: () => ({ saveAssessment }),
}));

vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: { keepAwake: vi.fn(), allowSleep: vi.fn() },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

vi.mock('../../src/services/ttsService', () => ({
  ttsService: { speak: vi.fn(), setEnabled: vi.fn(), setVoiceByUri: vi.fn() },
}));

vi.mock('../../src/services/permissionService', () => ({
  requestSensorPermissions,
  getPermissionDeniedMessage,
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
  sensorFusionService: {
    start: vi.fn(),
    stop: vi.fn(),
    reset: vi.fn(),
    setCallbacks: vi.fn(),
    addPPGSample: vi.fn(),
    addSCGSample: vi.fn(),
    getQuality: vi.fn(() => 0),
  },
}));

describe('ResonanceAssessment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    lastLifecycleOptions = undefined;
    requestSensorPermissions.mockResolvedValue({ camera: 'granted', motion: 'granted' });
    getPermissionDeniedMessage.mockReturnValue(null);
    vi.mocked(ppgService.start).mockResolvedValue({ ok: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('builds every configured trial to last at least two minutes', () => {
    const trials = buildAssessmentTrials(ASSESSMENT_TRIALS, RESONANCE_TRIAL_DURATION_SECONDS);

    expect(trials).toHaveLength(ASSESSMENT_TRIALS.length);
    for (const trial of trials) {
      const cycleSeconds = trial.inhaleTime + trial.exhaleTime;
      expect(trial.repetitions).toBe(Math.ceil(RESONANCE_TRIAL_DURATION_SECONDS / cycleSeconds));
      expect(trial.repetitions * cycleSeconds).toBeGreaterThanOrEqual(
        RESONANCE_TRIAL_DURATION_SECONDS
      );
    }
  });

  it('does not render general frequency-domain power for short resonance trials', async () => {
    const wrapper = mount(ResonanceAssessment);

    await wrapper.vm.setPhaseForTesting('RESULT');
    await wrapper.vm.setTrialAnalysisForTesting(0, {
      timeDomain: {
        meanRR: 1_000,
        sdnn: 20,
        rmssd: 18,
        pnn50: 5,
        meanHR: 60,
        minHR: 55,
        maxHR: 68,
        hrRange: 13,
      },
      frequencyDomain: {
        available: true,
        value: {
          lfPowerNorm: 70,
          hfPowerNorm: 30,
          lfHfRatio: 2.3,
          lfPeak: 0.1,
          hfPeak: 0.25,
          spectrum: [{ frequency: 0.1, power: 100 }],
        },
      },
      poincare: { available: false, reason: 'protocol-not-supported' },
      resonance: {
        available: true,
        value: {
          peakToTroughAmplitude: 12,
          waveformSmoothness: 0.8,
          phaseSynchrony: 0.7,
          lfPeakCount: 1,
          lfPeakAmplitude: 80,
        },
      },
      quality: {
        totalSamples: 120,
        artifactsDetected: 0,
        artifactPercentage: 0,
        meanSignalQuality: 0.9,
      },
      raw: { rrIntervals: [], timestamps: [], instantaneousHR: [] },
    });
    await wrapper.vm.$nextTick();

    expect(wrapper.findComponent({ name: 'FrequencySpectrum' }).exists()).toBe(false);
    expect(wrapper.text()).not.toContain('LF Power');
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

  it('requests motion permission from the Start gesture before entering warmup', async () => {
    let resolvePermission!: (permissions: { camera: 'granted'; motion: 'granted' }) => void;
    requestSensorPermissions.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermission = resolve;
      })
    );
    const wrapper = mount(ResonanceAssessment);
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Chest Motion'))!
      .trigger('click');

    await wrapper.find('[data-testid="start-btn"]').trigger('click');

    expect(requestSensorPermissions).toHaveBeenCalledWith('accelerometer');
    expect(wrapper.text()).toContain('Start Assessment');

    resolvePermission({ camera: 'granted', motion: 'granted' });
    await flushPromises();

    expect(wrapper.text()).toContain('Warmup');
  });

  it('returns to setup with actionable permission guidance when motion is denied', async () => {
    requestSensorPermissions.mockResolvedValueOnce({ camera: 'granted', motion: 'denied' });
    getPermissionDeniedMessage.mockReturnValueOnce(
      'Motion sensor permission denied. Please allow access in your browser settings and reload.'
    );
    const wrapper = mount(ResonanceAssessment);
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Chest Motion'))!
      .trigger('click');

    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Start Assessment');
    expect(wrapper.text()).toContain('Motion sensor permission denied');
    expect(wrapper.find('[data-testid="breathing-visualizer"]').exists()).toBe(false);
  });

  it('shows cancel confirmation during active phases', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    expect(wrapper.text()).toContain('Cancel assessment');
  });

  it('pauses and resumes an active warmup', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="start-btn"]').trigger('click');

    const pauseButton = wrapper.findAll('button').find((button) => button.text() === 'Pause');
    await pauseButton!.trigger('click');
    expect(wrapper.text()).toContain('Resume');

    const resumeButton = wrapper.findAll('button').find((button) => button.text() === 'Resume');
    await resumeButton!.trigger('click');
    expect(wrapper.text()).toContain('Pause');
  });

  it('cleans up and emits cancel when active cancellation is confirmed', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');

    const confirmButton = wrapper
      .findAll('button')
      .find((button) => button.text() === 'Confirm Cancel');
    await confirmButton!.trigger('click');

    expect(wrapper.emitted('cancel')).toBeTruthy();
    expect(wrapper.text()).not.toContain('Cancel assessment?');
  });

  it('releases an active trial sensor once and returns to a restart state on backgrounding', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await flushPromises();

    await vi.advanceTimersByTimeAsync(125_000);
    await flushPromises();
    expect(ppgService.start).toHaveBeenCalledOnce();
    expect(lastLifecycleOptions).toBeDefined();

    await lastLifecycleOptions?.onInactive();
    await lastLifecycleOptions?.onInactive();
    await wrapper.vm.$nextTick();

    expect(ppgService.stop).toHaveBeenCalledOnce();
    expect(saveAssessment).not.toHaveBeenCalled();
    expect(wrapper.text()).toContain('Start Assessment');
    expect(wrapper.text()).toContain('interrupted');
  });

  it('does not resume a trial when sensor startup finishes after background interruption', async () => {
    let finishSensorStart!: (result: { ok: true }) => void;
    vi.mocked(ppgService.start).mockReturnValueOnce(
      new Promise((resolve) => {
        finishSensorStart = resolve;
      })
    );
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await flushPromises();
    await vi.advanceTimersByTimeAsync(125_000);

    expect(ppgService.start).toHaveBeenCalledOnce();
    await lastLifecycleOptions?.onInactive();
    finishSensorStart({ ok: true });
    await flushPromises();

    expect(ppgService.stop).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain('Start Assessment');
    expect(wrapper.text()).toContain(
      'Assessment interrupted when the app became inactive. Return to setup and restart when ready.'
    );
    expect(wrapper.text()).not.toContain('Continue with manual scoring for this trial.');
  });

  describe('Sensor mode selection', () => {
    it('renders sensor mode selector in INTRO phase', () => {
      const wrapper = mount(ResonanceAssessment);
      const sensorSection = wrapper.find('[data-testid="sensor-selection"]');
      expect(sensorSection.exists()).toBe(true);
      expect(sensorSection.text()).toContain('Heart Rate Measurement');
      expect(sensorSection.text()).toContain('Camera Pulse (Recommended)');
      expect(sensorSection.text()).toContain('Manual Scoring');
      expect(sensorSection.text()).toContain('Camera + Chest (Beta)');
      expect(sensorSection.text()).toContain('Chest Motion (Beta)');
    });

    it('shows experimental sensor modes without claiming best accuracy', () => {
      const wrapper = mount(ResonanceAssessment);
      const sensorSection = wrapper.find('[data-testid="sensor-selection"]');
      const buttons = sensorSection.findAll('button');
      // 4 modes: none, dual, camera, accelerometer
      expect(buttons).toHaveLength(4);
      expect(buttons[2].text()).toContain('Camera + Chest (Beta)');
      expect(sensorSection.text()).not.toContain('Best Accuracy');
    });

    it('defaults to the recommended camera pulse sensor mode', () => {
      const wrapper = mount(ResonanceAssessment);
      const sensorSection = wrapper.find('[data-testid="sensor-selection"]');
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

    it('toggles symptom, amplitude, and smoothness observations', async () => {
      const wrapper = mount(ResonanceAssessment);
      await wrapper.vm.setPhaseForTesting('SCORING');
      await wrapper.vm.$nextTick();

      const dizziness = wrapper.findAll('button').find((button) => button.text() === 'Dizziness');
      await dizziness!.trigger('click');
      expect(dizziness!.classes()).toContain('bg-red-500/20');
      await dizziness!.trigger('click');
      expect(dizziness!.classes()).not.toContain('bg-red-500/20');

      const smallAmplitude = wrapper.findAll('button').find((button) => button.text() === 'Small');
      await smallAmplitude!.trigger('click');
      expect(smallAmplitude!.classes()).toContain('bg-blue-500/20');

      const smooth = wrapper.findAll('button').find((button) => button.text() === 'Very Smooth');
      await smooth!.trigger('click');
      expect(smooth!.classes()).toContain('bg-purple-500/20');
    });
  });

  describe('Result phase', () => {
    it('shows suggested rate after calculating', async () => {
      const wrapper = mount(ResonanceAssessment);
      await wrapper.vm.setPhaseForTesting('RESULT');
      await wrapper.vm.$nextTick();
      expect(wrapper.text()).toContain('Suggested Rate');
    });

    it('persists completed assessments through the authoritative IndexedDB storage', async () => {
      saveAssessment.mockResolvedValue(undefined);
      const wrapper = mount(ResonanceAssessment);
      await wrapper.vm.setPhaseForTesting('RESULT');
      await wrapper.vm.$nextTick();

      await wrapper
        .findAll('button')
        .find((button) => button.text().includes('Save & Create Preset'))!
        .trigger('click');

      expect(saveAssessment).toHaveBeenCalledWith(
        expect.objectContaining({ completedAt: expect.any(Date) })
      );
    });
  });
});
