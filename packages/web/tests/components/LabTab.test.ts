import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enableAutoUnmount, flushPromises, mount, shallowMount } from '@vue/test-utils';
import LabTab from '@/components/LabTab.vue';
import { ppgService } from '@/services/ppgService';
import { sensorFusionService } from '@/services/sensorFusion';

enableAutoUnmount(afterEach);

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

describe('LabTab.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(range.getAttribute('aria-label')).toBe('Measurement duration');
    expect(range.min).toBe('120');
    expect(range.value).toBe('120');
    expect(range.getAttribute('aria-valuetext')).toBe('2 minutes');

    wrapper.unmount();
  });

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

    wrapper.unmount();
  });
});
