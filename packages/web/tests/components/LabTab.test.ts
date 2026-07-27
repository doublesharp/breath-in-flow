import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enableAutoUnmount, flushPromises, mount, shallowMount } from '@vue/test-utils';
import LabTab from '@/components/LabTab.vue';
import HrvTrends from '@/components/HrvTrends.vue';
import LabInsights from '@/components/LabInsights.vue';
import { ppgService } from '@/services/ppgService';
import { scgService } from '@/services/scgService';
import { sensorFusionService } from '@/services/sensorFusion';
import { requestSensorPermissions } from '@/services/permissionService';
import type { HrvMeasurement } from '@/composables/useHrvStorage';
import type { HRVAnalysis, IBISample, PoincareUnavailableReason } from '@breath-in-flow/shared';

enableAutoUnmount(afterEach);
afterEach(() => vi.useRealTimers());

const hrvStorageMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  saveMeasurement: vi.fn(),
  getMeasurements: vi.fn(),
  getMeasurementById: vi.fn(),
  deleteMeasurement: vi.fn(),
  getLatestMeasurement: vi.fn(),
  getMeasurementStats: vi.fn(),
  hasAnyMeasurements: vi.fn(),
  saveAssessment: vi.fn(),
  getAssessments: vi.fn(),
  getLatestAssessment: vi.fn(),
  migrateFromLocalStorage: vi.fn(),
}));

let lastLifecycleOptions:
  { onInactive: () => void | Promise<void>; onActive: () => void | Promise<void> } | undefined;

vi.mock('@/composables/useAppLifecycle', () => ({
  useAppLifecycle: (options: {
    onInactive: () => void | Promise<void>;
    onActive: () => void | Promise<void>;
  }) => {
    lastLifecycleOptions = options;
    return { dispose: vi.fn().mockResolvedValue(undefined) };
  },
}));

// Mock all services and storage
vi.mock('@/services/ppgService', () => ({
  ppgService: {
    start: vi.fn().mockResolvedValue({ ok: true }),
    stop: vi.fn(),
    setCallbacks: vi.fn(),
    getStatus: vi.fn(() => 'idle'),
    getSignalQuality: vi.fn(() => 0),
  },
  listCameras: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/services/scgService', () => ({
  scgService: {
    start: vi.fn().mockResolvedValue({ ok: true }),
    stop: vi.fn(),
    setCallbacks: vi.fn(),
    getStatus: vi.fn(() => 'idle'),
    getQuality: vi.fn(() => 0),
  },
}));

vi.mock('@/services/permissionService', () => ({
  requestSensorPermissions: vi.fn().mockResolvedValue({
    camera: 'granted',
    motion: 'granted',
  }),
  getPermissionDeniedMessage: vi.fn().mockReturnValue(null),
}));

vi.mock('@/services/sensorFusion', () => ({
  sensorFusionService: {
    reset: vi.fn(),
    setCallbacks: vi.fn(),
    addPPGSample: vi.fn(),
    addSCGSample: vi.fn(),
    getQuality: vi.fn(() => 0),
  },
}));

vi.mock('@/composables/useHrvStorage', () => ({
  useHrvStorage: () => hrvStorageMock,
}));

function analysisWithPoincareUnavailable(reason: PoincareUnavailableReason): HRVAnalysis {
  return {
    timeDomain: {
      meanRR: 1_000,
      sdnn: 20,
      rmssd: 18,
      pnn50: 10,
      meanHR: 60,
      minHR: 58,
      maxHR: 62,
      hrRange: 4,
    },
    frequencyDomain: { available: false, reason: 'protocol-not-supported' },
    poincare: { available: false, reason },
    resonance: { available: false, reason: 'protocol-not-supported' },
    quality: {
      totalSamples: 60,
      artifactsDetected: 0,
      artifactPercentage: 0,
      meanSignalQuality: 0.9,
    },
    raw: {
      rrIntervals: [1_000, 1_010, 990],
      timestamps: [0, 1_000, 2_010],
      instantaneousHR: [60, 59.4, 60.6],
    },
  };
}

describe('LabTab.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lastLifecycleOptions = undefined;
    hrvStorageMock.initialize.mockResolvedValue(undefined);
    hrvStorageMock.getMeasurements.mockResolvedValue([]);
    hrvStorageMock.getLatestMeasurement.mockResolvedValue(null);
    hrvStorageMock.hasAnyMeasurements.mockResolvedValue(false);
    hrvStorageMock.getAssessments.mockResolvedValue([]);
    hrvStorageMock.getLatestAssessment.mockResolvedValue(null);
  });

  it('awaits storage initialization before exposing a migrated legacy assessment', async () => {
    const migratedAssessment = {
      id: crypto.randomUUID(),
      trials: [],
      selectedRate: 5.5,
      completedAt: new Date('2026-07-20T00:00:00.000Z'),
      config: {
        warmupDurationSeconds: 120,
        warmupRate: 6,
        restDurationSeconds: 120,
      },
    };
    hrvStorageMock.initialize.mockImplementationOnce(async () => {
      hrvStorageMock.getLatestAssessment.mockResolvedValue(migratedAssessment);
    });

    const wrapper = shallowMount(LabTab);
    await flushPromises();

    expect(hrvStorageMock.initialize).toHaveBeenCalledOnce();
    expect(hrvStorageMock.initialize.mock.invocationCallOrder[0]).toBeLessThan(
      hrvStorageMock.getMeasurements.mock.invocationCallOrder[0]
    );
    expect(hrvStorageMock.initialize.mock.invocationCallOrder[0]).toBeLessThan(
      hrvStorageMock.getLatestAssessment.mock.invocationCallOrder[0]
    );
    expect(wrapper.text()).toContain('5.5 BPM');
  });

  it('renders guided protocols by default', () => {
    const wrapper = shallowMount(LabTab, {
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Quick Check');
    expect(wrapper.text()).toContain('Full Analysis');
    expect(wrapper.text()).toContain('Morning Readiness');
    expect(
      wrapper.find('[data-testid="protocol-description-quick-check"]').classes()
    ).not.toContain('truncate');
  });

  it('presents every supported sensor without Beta treatment', () => {
    const wrapper = shallowMount(LabTab);
    const cameraButton = wrapper.find('[data-testid="sensor-camera"]');

    expect(cameraButton.text()).toContain('Camera');
    expect(cameraButton.text()).toContain('Recommended');
    expect(cameraButton.attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="sensor-accelerometer"]').text()).toContain('Chest');
    expect(wrapper.find('[data-testid="sensor-dual"]').text()).toContain('Both');
    expect(wrapper.text()).not.toMatch(/\bBeta\b/i);
  });

  it('labels and isolates the preparation dialog, then restores focus on safe Escape', async () => {
    const wrapper = mount(LabTab, { attachTo: document.body });
    const trigger = wrapper.get<HTMLElement>('[data-testid="protocol-quick-check"]');
    trigger.element.focus();

    await trigger.trigger('click');
    await flushPromises();

    const dialog = document.body.querySelector<HTMLElement>('[data-testid="prep-dialog"]');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('pulse-prep-dialog-title');
    expect(dialog?.contains(document.activeElement)).toBe(true);
    const background = Array.from(document.body.children).find(
      (element) => element === wrapper.element || element.contains(wrapper.element)
    ) as HTMLElement;
    expect(background.getAttribute('inert')).toBe('');
    expect(background.getAttribute('aria-hidden')).toBe('true');

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();

    expect(document.body.querySelector('[data-testid="prep-dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger.element);
    expect(background.hasAttribute('inert')).toBe(false);
    wrapper.unmount();
  });

  it('keeps an active capture open on Escape and exposes a visible Stop action', async () => {
    const wrapper = mount(LabTab, { attachTo: document.body });
    await wrapper.get('[data-testid="protocol-quick-check"]').trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Start')!
      .click();
    await flushPromises();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();

    const dialog = document.body.querySelector<HTMLElement>('[data-testid="measurement-dialog"]');
    expect(dialog?.getAttribute('role')).toBe('dialog');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('pulse-measurement-dialog-title');
    expect(dialog?.textContent).toContain('Stop Measurement');
    expect((wrapper.vm as unknown as { isMeasuring: boolean }).isMeasuring).toBe(true);
    wrapper.unmount();
  });

  it('moves focus to the announced Results heading when the open measurement dialog changes phase', async () => {
    const wrapper = mount(LabTab, { attachTo: document.body });
    const vm = wrapper.vm as unknown as {
      isMeasuring: boolean;
      showResults: boolean;
      currentAnalysis: HRVAnalysis | null;
    };
    vm.isMeasuring = true;
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(
      document.body.querySelector('[data-testid="measurement-phase-heading"]')
    );
    expect(document.activeElement?.textContent).toContain('measurement in progress');

    vm.currentAnalysis = analysisWithPoincareUnavailable('protocol-not-supported');
    vm.showResults = true;
    vm.isMeasuring = false;
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();

    expect(document.activeElement).toBe(
      document.body.querySelector('[data-testid="measurement-phase-heading"]')
    );
    expect(document.activeElement?.textContent).toContain('Results');
    wrapper.unmount();
  });

  it('shows measurement coverage, artifact cautions, and a nearby non-medical note', async () => {
    const wrapper = mount(LabTab, { attachTo: document.body });
    const vm = wrapper.vm as unknown as {
      showResults: boolean;
      currentAnalysis: HRVAnalysis | null;
      currentEligibility: {
        eligible: boolean;
        reasons: string[];
        warnings: string[];
        availableMetrics: string[];
        artifactPercentage: number;
        meanQuality: number;
        detectedBeatCount: number;
        observedDurationSeconds: number;
        coveragePercentage: number;
        maximumGapSeconds: number;
      } | null;
    };
    vm.currentAnalysis = analysisWithPoincareUnavailable('protocol-not-supported');
    vm.currentEligibility = {
      eligible: true,
      reasons: [],
      warnings: ['elevated-artifacts', 'limited-coverage'],
      availableMetrics: ['average-pulse', 'rmssd'],
      artifactPercentage: 6.2,
      meanQuality: 0.82,
      detectedBeatCount: 112,
      observedDurationSeconds: 120,
      coveragePercentage: 91,
      maximumGapSeconds: 2.4,
    };
    vm.showResults = true;
    await wrapper.vm.$nextTick();

    const quality = document.body.querySelector('[data-testid="measurement-quality"]');
    expect(quality?.textContent).toContain('91%');
    expect(quality?.textContent).toContain('2.4 s');
    expect(quality?.textContent).toContain('6.2%');
    expect(quality?.textContent).toContain('not a medical measurement');
    expect(quality?.textContent).toContain('not used for trend comparisons');

    wrapper.unmount();
  });

  it('uses conservative breathing-response wording', () => {
    const wrapper = mount(LabTab);

    expect(wrapper.text()).toContain('Estimated Breathing Response');
    expect(wrapper.text()).toContain('suggest a practice rate');
    expect(wrapper.text()).not.toContain('optimal rate');
    expect(wrapper.text()).not.toContain('Your resonance frequency');
  });

  it('labels the duration control and enforces the selected protocol minimum', async () => {
    const wrapper = mount(LabTab, { attachTo: document.body });
    await wrapper.find('[data-testid="protocol-quick-check"]').trigger('click');
    await flushPromises();

    const range = document.body.querySelector(
      '[data-testid="measurement-duration"]'
    ) as HTMLInputElement;
    expect(range.getAttribute('aria-label')).toBe('Analyzed duration');
    expect(range.min).toBe('120');
    expect(range.value).toBe('120');
    expect(range.getAttribute('aria-valuetext')).toBe('2 minutes');

    wrapper.unmount();
  });

  it('keeps the preparation UI busy and noninteractive until sensor startup resolves', async () => {
    let resolveStart!: (result: { ok: true }) => void;
    vi.mocked(ppgService.start).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStart = resolve;
      })
    );
    const wrapper = mount(LabTab, { attachTo: document.body });
    await wrapper.get('[data-testid="protocol-quick-check"]').trigger('click');
    await flushPromises();

    const startButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start'
    )!;
    startButton.click();
    await flushPromises();

    expect(document.body.querySelector('[data-testid="prep-dialog"]')).not.toBeNull();
    expect(startButton.disabled).toBe(true);
    expect(startButton.getAttribute('aria-busy')).toBe('true');
    expect(document.body.querySelector('[data-testid="prep-content"]')?.hasAttribute('inert')).toBe(
      true
    );
    expect(document.body.querySelector('[data-testid="measurement-dialog"]')).toBeNull();

    resolveStart({ ok: true });
    await flushPromises();

    expect(document.body.querySelector('[data-testid="prep-dialog"]')).toBeNull();
    expect(document.body.querySelector('[data-testid="measurement-dialog"]')).not.toBeNull();
    wrapper.unmount();
  });

  it('advertises five analyzed minutes while timing Full Analysis for 5:08 of capture', async () => {
    const wrapper = mount(LabTab, { attachTo: document.body });
    await wrapper.find('[data-testid="protocol-full-analysis"]').trigger('click');
    await flushPromises();

    const range = document.body.querySelector(
      '[data-testid="measurement-duration"]'
    ) as HTMLInputElement;
    expect(range.value).toBe('300');
    expect(document.body.textContent).toContain('Analyzes 5:00 after 5:08–5:12 of sensor capture');

    const startButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start'
    );
    startButton!.click();
    await flushPromises();

    expect(document.body.textContent).toContain('/ 5:08');
    const vm = wrapper.vm as unknown as { elapsedSeconds: number };
    vm.elapsedSeconds = 154;
    await wrapper.vm.$nextTick();
    expect(
      (document.body.querySelector('[data-testid="measurement-progress"]') as HTMLElement).style
        .width
    ).toBe('50%');

    wrapper.unmount();
  });

  it('waits for a 300-second finalized beat window before auto-stopping Full Analysis', async () => {
    vi.useFakeTimers();
    const wrapper = mount(LabTab, { attachTo: document.body });
    await wrapper.find('[data-testid="protocol-full-analysis"]').trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Start')!
      .click();
    await flushPromises();

    const ppgStart = vi.mocked(ppgService.start);
    const ppgCallbacks = ppgStart.mock.calls.at(-1)![0] as {
      callbacks: { onIBI: (sample: IBISample) => void };
    };
    vi.advanceTimersByTime(1_999);
    ppgCallbacks.callbacks.onIBI({
      timestamp: 1_999,
      interval: 1_000,
      quality: 0.9,
      provenance: { source: 'ppg', method: 'peak-detected' },
    });
    vi.advanceTimersByTime(1);
    for (let second = 3; second <= 308; second += 1) {
      vi.advanceTimersByTime(999);
      ppgCallbacks.callbacks.onIBI({
        timestamp: second * 1_000 - 1,
        interval: 1_000 + Math.sin(second / 3) * 20,
        quality: 0.9,
        provenance: { source: 'ppg', method: 'peak-detected' },
      });
      vi.advanceTimersByTime(1);
    }
    await wrapper.vm.$nextTick();

    const measuringVm = wrapper.vm as unknown as { isMeasuring: boolean };
    expect(measuringVm.isMeasuring).toBe(true);

    for (let second = 309; second <= 310; second += 1) {
      vi.advanceTimersByTime(999);
      ppgCallbacks.callbacks.onIBI({
        timestamp: second * 1_000 - 1,
        interval: 1_000,
        quality: 0.9,
        provenance: { source: 'ppg', method: 'peak-detected' },
      });
      vi.advanceTimersByTime(1);
    }
    await wrapper.vm.$nextTick();

    const vm = wrapper.vm as unknown as {
      isMeasuring: boolean;
      currentEligibility: { eligible: boolean; observedDurationSeconds: number };
    };
    expect(vm.isMeasuring).toBe(false);
    expect(vm.currentEligibility.eligible).toBe(true);
    expect(vm.currentEligibility.observedDurationSeconds).toBe(300);

    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Save')!
      .click();
    await flushPromises();
    expect(hrvStorageMock.saveMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({ durationSeconds: 300 })
    );

    wrapper.unmount();
  });

  it('caps Full Analysis overrun when a final beat stalls before the eligible window', async () => {
    vi.useFakeTimers();
    const wrapper = mount(LabTab, { attachTo: document.body });
    await wrapper.find('[data-testid="protocol-full-analysis"]').trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Start')!
      .click();
    await flushPromises();

    const ppgStart = vi.mocked(ppgService.start);
    const ppgCallbacks = ppgStart.mock.calls.at(-1)![0] as {
      callbacks: { onIBI: (sample: IBISample) => void };
    };
    vi.advanceTimersByTime(1_999);
    ppgCallbacks.callbacks.onIBI({
      timestamp: 1_999,
      interval: 1_000,
      quality: 0.9,
      provenance: { source: 'ppg', method: 'peak-detected' },
    });
    vi.advanceTimersByTime(1);
    for (let second = 3; second <= 309; second += 1) {
      vi.advanceTimersByTime(999);
      ppgCallbacks.callbacks.onIBI({
        timestamp: second * 1_000 - 1,
        interval: 1_000,
        quality: 0.9,
        provenance: { source: 'ppg', method: 'peak-detected' },
      });
      vi.advanceTimersByTime(1);
    }

    vi.advanceTimersByTime(3_000);
    await wrapper.vm.$nextTick();

    const vm = wrapper.vm as unknown as {
      isMeasuring: boolean;
      elapsedSeconds: number;
      showRecoveryActions: boolean;
      permissionError: string;
      currentEligibility: { eligible: boolean; observedDurationSeconds: number };
    };
    expect(vm.isMeasuring).toBe(false);
    expect(vm.elapsedSeconds).toBe(312);
    expect(vm.currentEligibility.eligible).toBe(false);
    expect(vm.currentEligibility.observedDurationSeconds).toBe(299);
    expect(vm.showRecoveryActions).toBe(true);
    expect(vm.permissionError).toContain('too short');

    wrapper.unmount();
  });

  it.each([
    ['Quick Check', 'protocol-not-supported' as const, 'does not include a Poincaré plot'],
    ['resonance trial', 'protocol-not-supported' as const, 'does not include a Poincaré plot'],
    ['short recording', 'insufficient-data' as const, 'More clean pulse intervals are needed'],
  ])(
    'renders a reason-specific unavailable Poincaré state for %s',
    async (_case, reason, message) => {
      const wrapper = mount(LabTab, {
        attachTo: document.body,
        global: { stubs: { PoincarePlot: true } },
      });
      const vm = wrapper.vm as unknown as {
        showResults: boolean;
        currentAnalysis: HRVAnalysis;
      };
      vm.currentAnalysis = analysisWithPoincareUnavailable(reason);
      vm.showResults = true;
      await wrapper.vm.$nextTick();

      expect(document.body.querySelector('poincare-plot-stub')).toBeNull();
      expect(
        document.body.querySelector('[data-testid="poincare-unavailable"]')?.textContent
      ).toContain(message);

      wrapper.unmount();
    }
  );

  it('keeps development diagnostics out of normal test and production UI', async () => {
    const wrapper = mount(LabTab, { attachTo: document.body });
    (wrapper.vm as unknown as { isMeasuring: boolean }).isMeasuring = true;
    await wrapper.vm.$nextTick();

    expect(document.body.textContent).not.toContain('Show Debug');
    wrapper.unmount();
  });

  it('offers recovery actions after a measurement cannot produce clean beats', async () => {
    const wrapper = mount(LabTab);
    const vm = wrapper.vm as unknown as {
      permissionError: string;
      showRecoveryActions: boolean;
    };
    vm.permissionError = 'No detected pulse was received.';
    vm.showRecoveryActions = true;
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('No detected pulse was received.');
    expect(wrapper.text()).toContain('Retry');
    expect(wrapper.text()).toContain('Change sensor');
    expect(wrapper.text()).toContain('Cancel');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Retry')!
      .trigger('click');
    await flushPromises();
    expect(document.body.textContent).toContain('Freeform Measurement');

    vm.showRecoveryActions = true;
    vm.permissionError = 'Try another sensor.';
    await wrapper.vm.$nextTick();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Change sensor')!
      .trigger('click');
    expect((wrapper.vm as unknown as { mode: string }).mode).toBe('freeform');

    vm.showRecoveryActions = true;
    vm.permissionError = 'Dismiss this message.';
    await wrapper.vm.$nextTick();
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancel')!
      .trigger('click');
    expect(vm.showRecoveryActions).toBe(false);
    expect(vm.permissionError).toBeNull();
  });

  it('shows mode toggle (Guided / Freeform)', () => {
    const wrapper = shallowMount(LabTab, {
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    const buttons = wrapper.findAll('button');
    const guidedBtn = buttons.find((b) => b.text() === 'Guided');
    const freeformBtn = buttons.find((b) => b.text() === 'Freeform');

    expect(guidedBtn).toBeTruthy();
    expect(freeformBtn).toBeTruthy();
  });

  it('shows sensor selection in freeform mode', async () => {
    const wrapper = shallowMount(LabTab, {
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    // Switch to freeform mode
    const buttons = wrapper.findAll('button');
    const freeformBtn = buttons.find((b) => b.text() === 'Freeform');
    await freeformBtn!.trigger('click');

    expect(wrapper.find('[data-testid="sensor-selection"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Camera');
    expect(wrapper.text()).toContain('Chest');
    expect(wrapper.text()).toContain('Both');
    expect(wrapper.text()).not.toMatch(/\bBeta\b/i);
  });

  it('shows the estimated breathing-response assessment action', () => {
    const wrapper = shallowMount(LabTab, {
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Estimated Breathing Response');
    expect(wrapper.text()).toContain('Estimate My Breathing Response');
  });

  it('shows recent results section', () => {
    const wrapper = shallowMount(LabTab, {
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    expect(wrapper.text()).toContain('Recent Results');
    expect(wrapper.text()).toContain('No measurements yet');
  });

  it('loads full measurement history and mounts trends and insights', async () => {
    const history = Array.from({ length: 7 }, (_, index) => ({
      id: `measurement-${index}`,
      type: 'quick-check',
      startedAt: new Date(2026, 6, index + 1, 7, 58),
      completedAt: new Date(2026, 6, index + 1, 8),
      durationSeconds: 120,
      sensorMode: 'camera',
      analysis: analysisWithPoincareUnavailable('protocol-not-supported'),
    })) as HrvMeasurement[];
    hrvStorageMock.getMeasurements.mockResolvedValueOnce(history);

    const wrapper = shallowMount(LabTab);
    await flushPromises();

    expect(hrvStorageMock.getMeasurements).toHaveBeenCalledWith();
    expect(wrapper.findComponent(HrvTrends).props('measurements')).toHaveLength(7);
    expect(wrapper.findComponent(LabInsights).props('measurements')).toHaveLength(7);
  });

  it('does not show the first-use measurement CTA when an assessment already exists', async () => {
    hrvStorageMock.getLatestAssessment.mockResolvedValueOnce({
      id: crypto.randomUUID(),
      trials: [],
      selectedRate: 5.5,
      completedAt: new Date('2026-07-20T08:00:00Z'),
      config: { warmupDurationSeconds: 120, warmupRate: 6, restDurationSeconds: 120 },
    });

    const wrapper = shallowMount(LabTab);
    await flushPromises();

    expect(wrapper.text()).not.toContain('No measurements yet. Start a measurement above');
    expect(wrapper.text()).toContain('No standalone measurements yet');
  });

  it('collects only the fused beat in dual-sensor mode', async () => {
    const wrapper = mount(LabTab, {
      attachTo: document.body,
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Freeform')!
      .trigger('click');
    await wrapper.get('[data-testid="sensor-dual"]').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();
    const startButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start'
    );
    expect(startButton).toBeDefined();
    startButton!.click();
    await flushPromises();

    const ppgStart = vi.mocked(ppgService.start);
    const ppgCallbacks = ppgStart.mock.calls.at(-1)![0] as {
      callbacks: {
        onIBI: (sample: { timestamp: number; interval: number; quality: number }) => void;
      };
    };
    const fusionCallbacks = vi.mocked(sensorFusionService.setCallbacks).mock.calls.at(-1)![0];
    const sample = {
      timestamp: 1_000,
      interval: 800,
      quality: 0.9,
      provenance: { source: 'ppg' as const, method: 'peak-detected' as const },
    };

    ppgCallbacks.callbacks.onIBI(sample);
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('hr-tachogram-stub')).toBeNull();

    fusionCallbacks.onFusedIBI?.({
      ...sample,
      source: 'fused',
      provenance: { source: 'fused', method: 'peak-detected' },
      ppgInterval: 800,
      scgInterval: 805,
      confidence: 0.85,
    });
    await wrapper.vm.$nextTick();
    expect(document.body.querySelector('hr-tachogram-stub')).not.toBeNull();

    wrapper.unmount();
  });

  it('persists the successfully acquired source when dual mode degrades to camera only', async () => {
    vi.mocked(scgService.start).mockResolvedValueOnce({
      ok: false,
      reason: 'start-failed',
      message: 'Chest sensor unavailable.',
    });
    const wrapper = mount(LabTab, { attachTo: document.body });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Freeform')!
      .trigger('click');
    await wrapper.get('[data-testid="sensor-dual"]').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Start')!
      .click();
    await flushPromises();

    expect(wrapper.text()).toContain('camera only');
    const vm = wrapper.vm as unknown as {
      stopMeasurement: () => void;
      saveResults: () => Promise<void>;
      currentAnalysis: HRVAnalysis | null;
      currentEligibility: {
        eligible: boolean;
        reasons: never[];
        warnings: never[];
        availableMetrics: Array<'average-pulse' | 'rmssd' | 'pnn50'>;
        artifactPercentage: number;
        meanQuality: number;
        detectedBeatCount: number;
        observedDurationSeconds: number;
      } | null;
    };
    vm.stopMeasurement();
    vm.currentAnalysis = analysisWithPoincareUnavailable('protocol-not-supported');
    vm.currentEligibility = {
      eligible: true,
      reasons: [],
      warnings: [],
      availableMetrics: ['average-pulse', 'rmssd', 'pnn50'],
      artifactPercentage: 0,
      meanQuality: 0.9,
      detectedBeatCount: 60,
      observedDurationSeconds: 120,
    };

    await vm.saveResults();

    expect(hrvStorageMock.saveMeasurement).toHaveBeenCalledWith(
      expect.objectContaining({ sensorMode: 'dual', acquisitionSources: ['ppg'] })
    );
    wrapper.unmount();
  });

  it('captures chest-sensor beats and surfaces signal feedback before stopping', async () => {
    const wrapper = mount(LabTab, {
      attachTo: document.body,
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Freeform')!
      .trigger('click');
    await wrapper.get('[data-testid="sensor-accelerometer"]').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Start')!
      .click();
    await flushPromises();

    const callbacks = vi.mocked(scgService.setCallbacks).mock.calls.at(-1)![0] as {
      onIBI: (sample: IBISample) => void;
      onHeartRateEstimate: (estimate: { timestamp: number; bpm: number; quality: number }) => void;
      onQualityChange: (quality: number) => void;
      onError: (error: Error) => void;
    };
    expect((wrapper.vm as unknown as { isMeasuring: boolean }).isMeasuring).toBe(true);
    callbacks.onIBI({
      timestamp: 1_000,
      interval: 800,
      quality: 0.9,
      provenance: { source: 'scg', method: 'peak-detected' },
    });
    expect((wrapper.vm as unknown as { isMeasuring: boolean }).isMeasuring).toBe(true);
    callbacks.onHeartRateEstimate({ timestamp: 1_100, bpm: 75, quality: 0.8 });
    expect((wrapper.vm as unknown as { isMeasuring: boolean }).isMeasuring).toBe(true);
    callbacks.onQualityChange(0.8);
    expect((wrapper.vm as unknown as { isMeasuring: boolean }).isMeasuring).toBe(true);
    callbacks.onError(new Error('movement detected'));
    await wrapper.vm.$nextTick();

    expect((wrapper.vm as unknown as { signalGuidance: string }).signalGuidance).toBe(
      'Pulse detected — keep still'
    );
    expect(document.body.querySelector('hr-tachogram-stub')).not.toBeNull();

    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Stop Measurement')!
      .click();
    await wrapper.vm.$nextTick();
    expect(scgService.stop).toHaveBeenCalledOnce();
    expect(document.body.textContent).toContain('This recording was too short');
  });

  it('does not begin measurement when the sensor fails to start', async () => {
    vi.mocked(ppgService.start).mockResolvedValueOnce({
      ok: false,
      reason: 'start-failed',
      message: 'Unable to start camera preview.',
    });
    const wrapper = mount(LabTab, {
      attachTo: document.body,
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Freeform')!
      .trigger('click');
    await wrapper.get('[data-testid="sensor-camera"]').trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();
    const startButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start'
    );
    startButton!.click();
    await flushPromises();

    expect(document.body.textContent).toContain('Unable to start camera preview.');
    expect(document.body.textContent).not.toContain('Stop Measurement');

    await lastLifecycleOptions?.onInactive();
    await wrapper.vm.$nextTick();
    expect(document.body.textContent).toContain('Unable to start camera preview.');
    expect(document.body.textContent).not.toContain('Measurement interrupted');
    expect(ppgService.stop).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  it('interrupts an active capture once on backgrounding without saving partial results', async () => {
    const wrapper = mount(LabTab, {
      attachTo: document.body,
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Freeform')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Start')!
      .click();
    await flushPromises();

    expect((wrapper.vm as unknown as { isMeasuring: boolean }).isMeasuring).toBe(true);
    expect(lastLifecycleOptions).toBeDefined();

    await lastLifecycleOptions?.onInactive();
    await lastLifecycleOptions?.onInactive();
    await wrapper.vm.$nextTick();

    const vm = wrapper.vm as unknown as {
      isMeasuring: boolean;
      showResults: boolean;
      showRecoveryActions: boolean;
      permissionError: string;
    };
    expect(ppgService.stop).toHaveBeenCalledOnce();
    expect(hrvStorageMock.saveMeasurement).not.toHaveBeenCalled();
    expect(vm.isMeasuring).toBe(false);
    expect(vm.showResults).toBe(false);
    expect(vm.showRecoveryActions).toBe(true);
    expect(vm.permissionError).toContain('interrupted');
    expect(wrapper.text()).toContain('Retry');

    wrapper.unmount();
  });

  it('invalidates a pending permission preflight when the app becomes inactive', async () => {
    let resolvePermissions!: (permissions: { camera: 'granted'; motion: 'granted' }) => void;
    vi.mocked(requestSensorPermissions).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermissions = resolve;
      })
    );
    const wrapper = mount(LabTab, {
      attachTo: document.body,
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Freeform')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();
    const startButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start'
    )!;
    startButton.click();
    await Promise.resolve();

    expect(requestSensorPermissions).toHaveBeenCalledOnce();
    expect(ppgService.start).not.toHaveBeenCalled();

    await lastLifecycleOptions?.onInactive();
    await lastLifecycleOptions?.onActive();
    await wrapper.vm.$nextTick();
    const interruptedVm = wrapper.vm as unknown as {
      isMeasuring: boolean;
      showPrep: boolean;
      permissionError: string;
      isStartPending: boolean;
    };
    expect(interruptedVm.isStartPending).toBe(true);
    const pendingStartButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start'
    ) as HTMLButtonElement;
    expect(pendingStartButton.disabled).toBe(true);
    pendingStartButton.click();
    expect(requestSensorPermissions).toHaveBeenCalledOnce();

    resolvePermissions({ camera: 'granted', motion: 'granted' });
    await flushPromises();

    expect(ppgService.start).not.toHaveBeenCalled();
    expect(interruptedVm.isMeasuring).toBe(false);
    expect(interruptedVm.showPrep).toBe(true);
    expect(interruptedVm.permissionError).toContain('interrupted');

    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Start')!
      .click();
    await flushPromises();

    expect(ppgService.start).toHaveBeenCalledOnce();
    expect((wrapper.vm as unknown as { isMeasuring: boolean }).isMeasuring).toBe(true);
    wrapper.unmount();
  });

  it('coalesces repeated Start activation while permission preflight is pending', async () => {
    let resolveFirst!: (permissions: { camera: 'granted'; motion: 'granted' }) => void;
    vi.mocked(requestSensorPermissions).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFirst = resolve;
      })
    );
    const wrapper = mount(LabTab, {
      attachTo: document.body,
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Freeform')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();
    const startButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start'
    ) as HTMLButtonElement;

    startButton.click();
    startButton.click();
    await wrapper.vm.$nextTick();

    expect(requestSensorPermissions).toHaveBeenCalledOnce();

    resolveFirst({ camera: 'granted', motion: 'granted' });
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      isMeasuring: boolean;
      showPrep: boolean;
      permissionError: string | null;
    };
    expect(ppgService.start).toHaveBeenCalledOnce();
    expect(vm.isMeasuring).toBe(true);
    expect(vm.showPrep).toBe(false);
    expect(vm.permissionError).toBeNull();
    wrapper.unmount();
  });

  it('cancels a pending permission start without reopening prep or starting a sensor', async () => {
    let resolvePermissions!: (permissions: { camera: 'granted'; motion: 'granted' }) => void;
    vi.mocked(requestSensorPermissions).mockReturnValueOnce(
      new Promise((resolve) => {
        resolvePermissions = resolve;
      })
    );
    const wrapper = mount(LabTab, {
      attachTo: document.body,
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Freeform')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();

    const prepActions = document.body.querySelector('[data-testid="prep-actions"]')!;
    (
      Array.from(prepActions.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Start'
      ) as HTMLButtonElement
    ).click();
    await wrapper.vm.$nextTick();
    expect(requestSensorPermissions).toHaveBeenCalledOnce();

    (
      Array.from(prepActions.querySelectorAll('button')).find(
        (button) => button.textContent?.trim() === 'Cancel'
      ) as HTMLButtonElement
    ).click();
    await wrapper.vm.$nextTick();

    resolvePermissions({ camera: 'granted', motion: 'granted' });
    await flushPromises();

    const vm = wrapper.vm as unknown as {
      isMeasuring: boolean;
      showPrep: boolean;
      prepProtocol: unknown;
      isStartPending: boolean;
    };
    expect(ppgService.start).not.toHaveBeenCalled();
    expect(vm.isMeasuring).toBe(false);
    expect(vm.showPrep).toBe(false);
    expect(vm.prepProtocol).toBeNull();
    expect(vm.isStartPending).toBe(false);
    wrapper.unmount();
  });

  it('keeps a reopened prep screen locked until a cancelled sensor start settles', async () => {
    let resolveSensorStart!: (outcome: { ok: true }) => void;
    vi.mocked(ppgService.start).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveSensorStart = resolve;
      })
    );
    const wrapper = mount(LabTab, {
      attachTo: document.body,
      global: {
        stubs: {
          HrTachogram: true,
          SignalQualityIndicator: true,
          HrvMetricsDashboard: true,
          FrequencySpectrum: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
        },
      },
    });

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Freeform')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();
    Array.from(document.body.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Start')!
      .click();
    await Promise.resolve();
    expect(ppgService.start).toHaveBeenCalledOnce();

    Array.from(
      document.body.querySelector('[data-testid="prep-actions"]')!.querySelectorAll('button')
    )
      .find((button) => button.textContent?.trim() === 'Cancel')!
      .click();
    await wrapper.vm.$nextTick();

    const vm = wrapper.vm as unknown as {
      isMeasuring: boolean;
      isStartPending: boolean;
      showPrep: boolean;
    };
    expect(vm.isStartPending).toBe(true);
    expect(vm.showPrep).toBe(false);

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Start Measurement')!
      .trigger('click');
    await flushPromises();
    const reopenedStart = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start'
    ) as HTMLButtonElement;
    expect(reopenedStart.disabled).toBe(true);
    reopenedStart.click();
    expect(ppgService.start).toHaveBeenCalledOnce();

    resolveSensorStart({ ok: true });
    await flushPromises();

    expect(ppgService.stop).toHaveBeenCalledOnce();
    expect(vm.isStartPending).toBe(false);
    expect(vm.isMeasuring).toBe(false);
    expect(reopenedStart.disabled).toBe(false);
    wrapper.unmount();
  });

  it('formats measurement metadata defensively for the results list', () => {
    const wrapper = shallowMount(LabTab);
    const vm = wrapper.vm as unknown as {
      formatDuration: (seconds: number) => string;
      formatTimer: (seconds: number) => string;
      formatDate: (date: Date) => string;
      formatType: (type: string) => string;
      measurementEligibilityMessage: (reasons: string[]) => string;
      poincareUnavailableMessage: (reason: PoincareUnavailableReason) => string;
    };

    expect(vm.formatDuration(60)).toBe('1 minute');
    expect(vm.formatDuration(120)).toBe('2 minutes');
    expect(vm.formatTimer(65)).toBe('1:05');
    expect(vm.formatDate(new Date('invalid'))).toBe('');
    expect(vm.formatDate(new Date(2026, 6, 20))).not.toBe('');
    expect(vm.formatType('quick-check')).toBe('Quick Check');
    expect(vm.formatType('custom-protocol')).toBe('custom-protocol');
    expect(vm.measurementEligibilityMessage(['low-signal-quality'])).toContain(
      'Signal quality was too low'
    );
    expect(vm.measurementEligibilityMessage(['insufficient-beats'])).toContain(
      'not enough clean detected beats'
    );
    expect(vm.poincareUnavailableMessage('low-signal-quality')).toContain(
      'Signal quality was not stable enough'
    );
    expect(vm.poincareUnavailableMessage('sensor-error')).toContain(
      'did not provide a valid interval series'
    );
  });
});
