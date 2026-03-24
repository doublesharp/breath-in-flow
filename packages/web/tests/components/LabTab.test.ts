import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import LabTab from '@/components/LabTab.vue';

// Mock all services and storage
vi.mock('@/services/ppgService', () => ({
  ppgService: {
    start: vi.fn(),
    stop: vi.fn(),
    setCallbacks: vi.fn(),
    getStatus: vi.fn(() => 'idle'),
    getSignalQuality: vi.fn(() => 0),
  },
}));

vi.mock('@/services/scgService', () => ({
  scgService: {
    start: vi.fn(),
    stop: vi.fn(),
    setCallbacks: vi.fn(),
    getStatus: vi.fn(() => 'idle'),
    getQuality: vi.fn(() => 0),
  },
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
    expect(wrapper.text()).toContain('Accelerometer');
    expect(wrapper.text()).toContain('Dual');
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
});
