import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enableAutoUnmount, flushPromises, mount } from '@vue/test-utils';
import ResonanceAssessment, {
  buildAssessmentTrials,
  RESONANCE_TRIAL_DURATION_SECONDS,
} from '../../src/components/ResonanceAssessment.vue';
import { ASSESSMENT_TRIALS, type HRVAnalysis } from '@breath-in-flow/shared';
import { ppgService } from '../../src/services/ppgService';
import type { IBISample } from '@breath-in-flow/shared';

enableAutoUnmount(afterEach);

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

function resonanceAnalysis(available = true): HRVAnalysis {
  return {
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
    frequencyDomain: { available: false, reason: 'protocol-not-supported' },
    poincare: { available: false, reason: 'protocol-not-supported' },
    resonance: available
      ? {
          available: true,
          value: {
            peakToTroughAmplitude: 12,
            waveformSmoothness: 0.8,
            phaseSynchrony: 0.7,
            lfPeakCount: 1,
            lfPeakAmplitude: 80,
          },
        }
      : { available: false, reason: 'protocol-not-supported' },
    quality: {
      totalSamples: 120,
      artifactsDetected: 0,
      artifactPercentage: 0,
      meanSignalQuality: 0.9,
    },
    raw: {
      rrIntervals: [1_000, 980, 1_020],
      timestamps: [0, 1_000, 1_980],
      instantaneousHR: [60, 61.2, 58.8],
    },
  };
}

// Several tests advance hundreds of virtual seconds (warmup + full trials) against the
// production 100ms breathing-timer interval, which re-renders Vue on every tick. That is
// thousands of scheduler flushes per test: on an idle machine the heaviest case runs ~2.8s,
// so under CPU contention it intermittently exceeds vitest's default 5000ms real-time test
// timeout (the pre-existing "sensor-timing" flake). This raises only the real-wall-clock
// budget for this suite; no assertion is loosened, no timer behavior is changed, and no
// retries are added.
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

  it('focuses and politely announces each replaced assessment phase heading', async () => {
    const wrapper = mount(ResonanceAssessment, { attachTo: document.body });

    await wrapper.vm.setPhaseForTesting('SCORING');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const heading = wrapper.get<HTMLElement>('[data-assessment-phase-heading]');
    expect(heading.text()).toContain('Rate Your Trials');
    expect(heading.attributes('aria-live')).toBe('polite');
    expect(document.activeElement).toBe(heading.element);
    wrapper.unmount();
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

  it('invalidates pending permission after inactive then active and requires another Start', async () => {
    let resolvePermission!: (permissions: { camera: 'granted'; motion: 'granted' }) => void;
    requestSensorPermissions.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermission = resolve;
      })
    );
    const wrapper = mount(ResonanceAssessment);

    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    expect(requestSensorPermissions).toHaveBeenCalledOnce();

    await lastLifecycleOptions?.onInactive();
    await lastLifecycleOptions?.onActive();
    resolvePermission({ camera: 'granted', motion: 'granted' });
    await flushPromises();

    expect(wrapper.text()).toContain('Start Assessment');
    expect(wrapper.text()).toContain('interrupted');
    expect(wrapper.find('[data-testid="breathing-visualizer"]').exists()).toBe(false);

    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await flushPromises();
    expect(requestSensorPermissions).toHaveBeenCalledTimes(2);
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

  it.each([
    { label: 'camera', mode: 'camera', selection: null },
    { label: 'dual', mode: 'dual', selection: 'Camera + Chest' },
  ])('starts $label permission preflight from the Start gesture', async ({ mode, selection }) => {
    let resolvePermission!: (permissions: { camera: 'granted'; motion: 'granted' }) => void;
    requestSensorPermissions.mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermission = resolve;
      })
    );
    const wrapper = mount(ResonanceAssessment);
    if (selection) {
      await wrapper
        .findAll('button')
        .find((button) => button.text().includes(selection))!
        .trigger('click');
    }

    await wrapper.find('[data-testid="start-btn"]').trigger('click');

    expect(requestSensorPermissions).toHaveBeenCalledWith(mode);
    expect(wrapper.text()).toContain('Start Assessment');
    expect(wrapper.find('[data-testid="breathing-visualizer"]').exists()).toBe(false);

    resolvePermission({ camera: 'granted', motion: 'granted' });
    await flushPromises();
    expect(wrapper.text()).toContain('Warmup');
  });

  it.each([
    { label: 'camera', mode: 'camera', selection: null },
    { label: 'dual', mode: 'dual', selection: 'Camera + Chest' },
  ])('keeps $label denial in setup with actionable guidance', async ({ selection }) => {
    requestSensorPermissions.mockResolvedValueOnce({ camera: 'denied', motion: 'granted' });
    getPermissionDeniedMessage.mockReturnValueOnce(
      'Camera permission denied. Please allow access in your browser settings and reload.'
    );
    const wrapper = mount(ResonanceAssessment);
    if (selection) {
      await wrapper
        .findAll('button')
        .find((button) => button.text().includes(selection))!
        .trigger('click');
    }

    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Start Assessment');
    expect(wrapper.text()).toContain('Camera permission denied');
    expect(wrapper.text()).not.toContain('Continue with manual scoring for this trial.');
    expect(wrapper.find('[data-testid="breathing-visualizer"]').exists()).toBe(false);
    expect(ppgService.start).not.toHaveBeenCalled();
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
    expect(ppgService.stop).toHaveBeenCalledOnce();
    finishSensorStart({ ok: true });
    await flushPromises();

    expect(ppgService.stop).toHaveBeenCalledTimes(2);
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
      expect(sensorSection.text()).toContain('Pulse Timing Measurement');
      expect(sensorSection.text()).toContain('Camera Pulse (Recommended)');
      expect(sensorSection.text()).toContain('Manual Scoring');
      expect(sensorSection.text()).toContain('Camera + Chest');
      expect(sensorSection.text()).toContain('Chest Motion');
      expect(sensorSection.text()).not.toMatch(/\bBeta\b/i);
    });

    it('keeps supported sensor positioning guidance without experimental treatment', () => {
      const wrapper = mount(ResonanceAssessment);
      const sensorSection = wrapper.find('[data-testid="sensor-selection"]');
      const buttons = sensorSection.findAll('button');
      // 4 modes: none, dual, camera, accelerometer
      expect(buttons).toHaveLength(4);
      expect(buttons[2].text()).toContain('Camera + Chest');
      expect(buttons[2].text()).toContain('both signals');
      expect(buttons[3].text()).toContain('phone flat on your chest');
      expect(sensorSection.text()).not.toContain('Best Accuracy');
    });

    it('defaults to the recommended camera pulse sensor mode', () => {
      const wrapper = mount(ResonanceAssessment);
      const sensorSection = wrapper.find('[data-testid="sensor-selection"]');
      const buttons = sensorSection.findAll('button');
      expect(buttons[0].classes()).toContain('border-emerald-500');
      expect(buttons[0].attributes('aria-pressed')).toBe('true');
      expect(buttons[1].classes()).not.toContain('border-emerald-500');
      expect(buttons[1].attributes('aria-pressed')).toBe('false');
      expect(buttons[2].classes()).not.toContain('border-emerald-500');
      expect(buttons[3].classes()).not.toContain('border-emerald-500');
    });
  });

  it('isolates and names the cancel confirmation while focusing the safe action', async () => {
    const wrapper = mount(ResonanceAssessment, { attachTo: document.body });
    await wrapper.get('[data-testid="start-btn"]').trigger('click');
    await flushPromises();
    const cancel = wrapper.get<HTMLElement>('[data-testid="cancel-btn"]');
    cancel.element.focus();
    await cancel.trigger('click');
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    const dialog = wrapper.get('[data-testid="cancel-assessment-dialog"]');
    expect(dialog.attributes('role')).toBe('alertdialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(dialog.attributes('aria-labelledby')).toBe('cancel-assessment-title');
    expect(document.activeElement?.textContent).toContain('Go Back');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(wrapper.find('[data-testid="cancel-assessment-dialog"]').exists()).toBe(false);
    expect(document.activeElement).toBe(cancel.element);
    wrapper.unmount();
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

    it('expands available pulse-variability details and explains unavailable analysis', async () => {
      const wrapper = mount(ResonanceAssessment);
      await wrapper.vm.setTrialAnalysisForTesting(0, resonanceAnalysis());
      await wrapper.vm.setTrialAnalysisForTesting(1, resonanceAnalysis(false));
      await wrapper.vm.setPhaseForTesting('SCORING');
      await wrapper.vm.$nextTick();

      const toggles = wrapper
        .findAll('button')
        .filter((button) => button.text() === 'Show pulse variability data');
      await toggles[0].trigger('click');
      expect(wrapper.text()).toContain('LF Peak Share');
      expect(wrapper.text()).toContain('80.0%');
      expect(wrapper.text()).toContain('12.0 BPM');
      expect(wrapper.text()).toContain('0.80');

      await toggles[1].trigger('click');
      expect(wrapper.text()).toContain(
        'Automatic breathing-response metrics were unavailable for this trial.'
      );
    });

    it('calculates a result only after every trial has a comfort rating', async () => {
      const wrapper = mount(ResonanceAssessment);
      await wrapper.vm.setPhaseForTesting('SCORING');
      await wrapper.vm.$nextTick();

      const calculate = wrapper
        .findAll('button')
        .find((button) => button.text() === 'Calculate Result')!;
      expect(calculate.attributes('disabled')).toBeDefined();

      for (const card of wrapper.findAll('[data-testid="trial-card"]')) {
        await card
          .findAll('button')
          .find((button) => button.text() === '5')!
          .trigger('click');
      }
      expect(calculate.attributes('disabled')).toBeUndefined();
      await calculate.trigger('click');

      expect(wrapper.text()).toContain('Suggested Rate');
      const alternativeRate = wrapper
        .findAll('button')
        .find((button) => button.text().includes('6.5 BPM'))!;
      await alternativeRate.trigger('click');
      expect(alternativeRate.classes()).toContain('ring-2');
    });
  });

  it('disables pause during sensor trials while retaining manual-trial and rest pause', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.vm.setPhaseForTesting('TRIAL_BREATHING');
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Keep your finger covering the camera lens');
    expect(wrapper.findAll('button').find((button) => button.text() === 'Pause')).toBeUndefined();

    await wrapper.vm.setPhaseForTesting('INTRO');
    await wrapper.vm.$nextTick();
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Manual Scoring'))!
      .trigger('click');
    await wrapper.vm.setPhaseForTesting('TRIAL_BREATHING');
    await wrapper.vm.$nextTick();
    const manualPause = wrapper.findAll('button').find((button) => button.text() === 'Pause')!;
    await manualPause.trigger('click');
    expect(wrapper.text()).toContain('Resume');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Resume')!
      .trigger('click');

    await wrapper.vm.setPhaseForTesting('TRIAL_REST');
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Rest Quietly');
    expect(wrapper.text()).toContain('Next trial:');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Pause')!
      .trigger('click');
    expect(wrapper.text()).toContain('Resume');
  });

  it.each([
    { rate: 6, trialIndex: 1, phaseOffset: Math.PI / 3 },
    { rate: 5, trialIndex: 3, phaseOffset: Math.PI / 2 },
  ])(
    'paces the $rate BPM sensor trial until a finalized 120-second detected-beat window is available',
    async ({ rate, trialIndex, phaseOffset }) => {
      const wrapper = mount(ResonanceAssessment);
      const vm = wrapper.vm as unknown as {
        startTrialForTesting: (index: number) => Promise<void>;
        getPhaseForTesting: () => string;
        getTrialAnalysisForTesting: (index: number) => HRVAnalysis | null;
      };
      await vm.startTrialForTesting(trialIndex);
      await flushPromises();

      const callbacks = vi.mocked(ppgService.start).mock.calls.at(-1)![0] as {
        onIBI: (sample: IBISample) => void;
      };
      let beatTimestamp = 10_000;
      callbacks.onIBI({
        timestamp: beatTimestamp,
        interval: 1_000,
        quality: 0.9,
        provenance: { source: 'ppg', method: 'peak-detected' },
      });

      let elapsedSeconds = 0;
      let sawFinishingState = false;
      while (elapsedSeconds < 132 && vm.getPhaseForTesting() === 'TRIAL_BREATHING') {
        elapsedSeconds += 1;
        await vi.advanceTimersByTimeAsync(1_000);
        if (vm.getPhaseForTesting() !== 'TRIAL_BREATHING') break;
        const interval =
          1_000 + Math.sin(phaseOffset + 2 * Math.PI * (rate / 60) * (beatTimestamp / 1_000)) * 45;
        beatTimestamp += interval;
        callbacks.onIBI({
          timestamp: beatTimestamp,
          interval,
          quality: 0.9,
          provenance: { source: 'ppg', method: 'peak-detected' },
        });
        if (elapsedSeconds >= 120) {
          await wrapper.vm.$nextTick();
          const finishingState = wrapper.find('[data-testid="finishing-trial-data"]');
          sawFinishingState ||=
            finishingState.exists() &&
            finishingState.text().includes('Finishing clean data collection');
        }
      }
      await flushPromises();

      expect(elapsedSeconds).toBeGreaterThan(120);
      expect(elapsedSeconds).toBeLessThanOrEqual(132);
      expect(ppgService.stop).toHaveBeenCalledOnce();
      const analysis = vm.getTrialAnalysisForTesting(trialIndex);
      expect(analysis).not.toBeNull();
      expect(analysis!.raw.timestamps.at(-1)! - analysis!.raw.timestamps[0]).toBeGreaterThanOrEqual(
        120_000
      );
      expect(analysis!.resonance.available).toBe(true);
      expect(sawFinishingState).toBe(true);
    }
  );

  it('stops a sensor trial at the derived hard cap when detected timestamps cannot fill the clean window', async () => {
    const wrapper = mount(ResonanceAssessment);
    const vm = wrapper.vm as unknown as {
      startTrialForTesting: (index: number) => Promise<void>;
      getPhaseForTesting: () => string;
      getTrialAnalysisForTesting: (index: number) => HRVAnalysis | null;
    };
    await vm.startTrialForTesting(1);
    await flushPromises();
    const callbacks = vi.mocked(ppgService.start).mock.calls.at(-1)![0] as {
      onIBI: (sample: IBISample) => void;
    };
    let timestamp = 10_000;
    callbacks.onIBI({
      timestamp,
      interval: 1_000,
      quality: 0.9,
      provenance: { source: 'ppg', method: 'peak-detected' },
    });

    let elapsedSeconds = 0;
    while (elapsedSeconds < 140 && vm.getPhaseForTesting() === 'TRIAL_BREATHING') {
      elapsedSeconds += 1;
      await vi.advanceTimersByTimeAsync(1_000);
      if (vm.getPhaseForTesting() !== 'TRIAL_BREATHING') break;
      timestamp += 100;
      callbacks.onIBI({
        timestamp,
        interval: 1_000,
        quality: 0.9,
        provenance: { source: 'ppg', method: 'peak-detected' },
      });
    }
    await flushPromises();

    expect(elapsedSeconds).toBe(132);
    expect(ppgService.stop).toHaveBeenCalledOnce();
    expect(vm.getTrialAnalysisForTesting(1)).toBeNull();
  });

  it('advances a manual assessment through warmup, trial, rest, and the next trial', async () => {
    // This test observes phase transitions, not every animation frame. Render
    // once per virtual second while still executing every 100 ms timer tick.
    const advanceSeconds = async (seconds: number) => {
      for (let second = 0; second < seconds; second++) {
        vi.advanceTimersByTime(1_000);
        await flushPromises();
      }
    };
    const wrapper = mount(ResonanceAssessment);
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Manual Scoring'))!
      .trigger('click');
    await wrapper.get('[data-testid="start-btn"]').trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Warmup');
    expect(requestSensorPermissions).not.toHaveBeenCalled();

    await advanceSeconds(130);
    await flushPromises();
    expect(wrapper.text()).toContain('Trial 1/5');
    expect(wrapper.find('[data-testid="breathing-visualizer"]').exists()).toBe(true);

    await advanceSeconds(140);
    await flushPromises();
    expect(wrapper.text()).toContain('Rest Quietly');

    await advanceSeconds(121);
    await flushPromises();
    expect(wrapper.text()).toContain('Trial 2/5');
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

    it('does not create a practice preset when authoritative assessment persistence fails', async () => {
      localStorage.removeItem('breath-in-flow-configs');
      let rejectAssessment!: (error: Error) => void;
      saveAssessment.mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectAssessment = reject;
        })
      );
      const wrapper = mount(ResonanceAssessment);
      await wrapper.vm.setPhaseForTesting('RESULT');
      await wrapper.vm.$nextTick();

      await wrapper
        .findAll('button')
        .find((button) => button.text().includes('Save & Create Preset'))!
        .trigger('click');

      expect(localStorage.getItem('breath-in-flow-configs')).toBeNull();
      expect(wrapper.emitted('complete')).toBeUndefined();

      rejectAssessment(new Error('IndexedDB unavailable'));
      await flushPromises();
      expect(wrapper.text()).toContain('could not be saved');
      expect(localStorage.getItem('breath-in-flow-configs')).toBeNull();
    });
  });
}, 30_000);
