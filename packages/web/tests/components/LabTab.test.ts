import { describe, it, expect, vi, beforeEach } from 'vitest';
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import LabTab from '@/components/LabTab.vue';
import { ppgService } from '@/services/ppgService';
import { sensorFusionService } from '@/services/sensorFusion';

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
  useHrvStorage: () => ({
    saveMeasurement: vi.fn(),
    getMeasurements: vi.fn().mockResolvedValue([]),
    getMeasurementById: vi.fn(),
    deleteMeasurement: vi.fn(),
    getLatestMeasurement: vi.fn().mockResolvedValue(null),
    getMeasurementStats: vi.fn(),
    hasAnyMeasurements: vi.fn().mockResolvedValue(false),
    saveAssessment: vi.fn(),
    getAssessments: vi.fn().mockResolvedValue([]),
    getLatestAssessment: vi.fn().mockResolvedValue(null),
    migrateFromLocalStorage: vi.fn(),
  }),
}));

describe('LabTab.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
    expect(wrapper.text()).toContain('Chest (recommended)');
    expect(wrapper.text()).toContain('Both');
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

    await wrapper.findAll('button').find((button) => button.text() === 'Freeform')!.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Both')!.trigger('click');
    await wrapper.findAll('button').find((button) => button.text() === 'Start Measurement')!.trigger('click');
    await flushPromises();
    const startButton = Array.from(document.body.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Start',
    );
    expect(startButton).toBeDefined();
    startButton!.click();
    await flushPromises();

    const ppgStart = vi.mocked(ppgService.start);
    const ppgCallbacks = ppgStart.mock.calls.at(-1)![0] as {
      callbacks: { onIBI: (sample: { timestamp: number; interval: number; quality: number }) => void };
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
});
