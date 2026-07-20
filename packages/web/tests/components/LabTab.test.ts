import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enableAutoUnmount, flushPromises, mount, shallowMount } from '@vue/test-utils';
import LabTab from '@/components/LabTab.vue';
import HrvTrends from '@/components/HrvTrends.vue';
import LabInsights from '@/components/LabInsights.vue';
import { ppgService } from '@/services/ppgService';
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

  it('defaults to the recommended camera sensor with accessible selection state', () => {
    const wrapper = shallowMount(LabTab);
    const cameraButton = wrapper.find('[data-testid="sensor-camera"]');

    expect(cameraButton.text()).toContain('Camera');
    expect(cameraButton.text()).toContain('Recommended');
    expect(cameraButton.attributes('aria-pressed')).toBe('true');
    expect(wrapper.find('[data-testid="sensor-accelerometer"]').text()).toContain('Beta');
    expect(wrapper.find('[data-testid="sensor-dual"]').text()).toContain('Beta');
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
    expect(wrapper.text()).toContain('Beta');
  });

  it('shows RF assessment section with "Find My Resonance Frequency" button', () => {
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

    expect(wrapper.text()).toContain('Resonance Frequency');
    expect(wrapper.text()).toContain('Find My Resonance Frequency');
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
    resolvePermissions({ camera: 'granted', motion: 'granted' });
    await flushPromises();

    const interruptedVm = wrapper.vm as unknown as {
      isMeasuring: boolean;
      showPrep: boolean;
      permissionError: string;
    };
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
});
