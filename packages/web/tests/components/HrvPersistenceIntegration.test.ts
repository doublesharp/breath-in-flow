import 'fake-indexeddb/auto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { enableAutoUnmount, flushPromises, mount, shallowMount } from '@vue/test-utils';
import type { HRVAnalysis, MeasurementEligibility, SampleProvenance } from '@breath-in-flow/shared';
import LabTab from '@/components/LabTab.vue';
import ResonanceAssessment from '@/components/ResonanceAssessment.vue';
import { useHrvStorage } from '@/composables/useHrvStorage';
import { resetStorageForTesting } from '@/composables/useStorage';

enableAutoUnmount(afterEach);

vi.mock('@/composables/useAppLifecycle', () => ({
  useAppLifecycle: () => ({ dispose: vi.fn().mockResolvedValue(undefined) }),
}));

function deleteHrvDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('breath-in-flow-hrv');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Pulse variability database deletion was blocked.'));
  });
}

function analysisFixture(): HRVAnalysis {
  return {
    timeDomain: {
      meanRR: 1_000,
      sdnn: 24,
      rmssd: 22,
      pnn50: 8,
      meanHR: 60,
      minHR: 57,
      maxHR: 63,
      hrRange: 6,
    },
    frequencyDomain: { available: false, reason: 'protocol-not-supported' },
    poincare: { available: false, reason: 'protocol-not-supported' },
    resonance: { available: false, reason: 'protocol-not-supported' },
    quality: {
      totalSamples: 60,
      artifactsDetected: 0,
      artifactPercentage: 0,
      meanSignalQuality: 0.94,
    },
    raw: {
      rrIntervals: [1_000, 990, 1_010],
      timestamps: [0, 1_000, 1_990],
      instantaneousHR: [60, 60.6, 59.4],
    },
  };
}

describe('pulse variability component persistence integration', () => {
  beforeEach(async () => {
    localStorage.clear();
    resetStorageForTesting();
    await deleteHrvDatabase();
  });

  afterEach(async () => {
    await deleteHrvDatabase();
    localStorage.clear();
    resetStorageForTesting();
  });

  it('persists LabTab nested reactive analysis, eligibility, and provenance through real IndexedDB', async () => {
    const wrapper = shallowMount(LabTab, {
      global: {
        stubs: {
          FrequencySpectrum: true,
          HrTachogram: true,
          HrvMetricsDashboard: true,
          HrvTrends: true,
          LabInsights: true,
          PoincarePlot: true,
          ResonanceAssessment: true,
          SignalQualityIndicator: true,
        },
      },
    });
    await flushPromises();

    const eligibility: MeasurementEligibility = {
      eligible: true,
      reasons: [],
      warnings: [],
      availableMetrics: ['average-pulse', 'rmssd', 'pnn50'],
      artifactPercentage: 0,
      meanQuality: 0.94,
      detectedBeatCount: 60,
      observedDurationSeconds: 120,
    };
    const provenance: SampleProvenance[] = [
      { source: 'ppg', method: 'peak-detected' },
      { source: 'ppg', method: 'peak-detected' },
    ];
    const vm = wrapper.vm as unknown as {
      currentAnalysis: HRVAnalysis | null;
      currentEligibility: MeasurementEligibility | null;
      currentSampleProvenance: SampleProvenance[];
      elapsedSeconds: number;
      saveResults: () => Promise<void>;
    };
    vm.currentAnalysis = analysisFixture();
    vm.currentEligibility = eligibility;
    vm.currentSampleProvenance = provenance;
    vm.elapsedSeconds = 120;

    await expect(vm.saveResults()).resolves.toBeUndefined();

    const stored = await useHrvStorage().getMeasurements();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({
      analysis: { timeDomain: { rmssd: 22 }, quality: { meanSignalQuality: 0.94 } },
      eligibility: { detectedBeatCount: 60, availableMetrics: ['average-pulse', 'rmssd', 'pnn50'] },
      sampleProvenance: { sources: ['ppg'], detectionMethods: ['peak-detected'] },
    });
  });

  it('persists ResonanceAssessment nested reactive trials before creating its practice preset', async () => {
    const wrapper = mount(ResonanceAssessment, {
      global: {
        stubs: {
          BreathingVisualizer: true,
          HrOscillation: true,
          SignalQualityIndicator: true,
        },
      },
    });
    const vm = wrapper.vm as unknown as {
      setPhaseForTesting: (phase: 'SCORING') => void;
      trials: Array<{ comfortRating?: number; notes?: string }>;
    };
    vm.setPhaseForTesting('SCORING');
    await wrapper.vm.$nextTick();
    vm.trials.forEach((trial, index) => {
      trial.comfortRating = 4;
      trial.notes = index === 0 ? 'Comfortable and steady.' : undefined;
    });
    await wrapper.vm.$nextTick();

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Calculate Result')!
      .trigger('click');
    await wrapper
      .findAll('button')
      .find((button) => button.text().includes('Save & Create Preset'))!
      .trigger('click');
    await flushPromises();

    const stored = await useHrvStorage().getAssessments();
    expect(stored).toHaveLength(1);
    expect(stored[0].trials).toHaveLength(5);
    expect(stored[0].trials[0]).toMatchObject({
      rate: 6.5,
      comfortRating: 4,
      notes: 'Comfortable and steady.',
    });
    expect(localStorage.getItem('breath-in-flow-configs')).not.toBeNull();
  });
});
