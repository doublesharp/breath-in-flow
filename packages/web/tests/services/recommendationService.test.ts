import { describe, it, expect } from 'vitest';
import { resolveRecommendation } from '@/services/recommendationService';

describe('resolveRecommendation', () => {
  it('maps RELAX to the stress-relief practice preset', () => {
    expect(resolveRecommendation('RELAX')).toMatchObject({
      kind: 'practice',
      presetId: 'stress-relief-quick',
    });
  });

  it('maps the other practice goals to their presets', () => {
    expect(resolveRecommendation('TRAIN_DIAPHRAGM')).toMatchObject({
      kind: 'practice',
      presetId: 'diaphragm-resistance-starter',
    });
    expect(resolveRecommendation('BUILD_CONSISTENCY')).toMatchObject({
      kind: 'practice',
      presetId: 'coherent-breathing',
    });
  });

  it('uses the preset name as the practice title', () => {
    expect(resolveRecommendation('RELAX')).toEqual({
      kind: 'practice',
      presetId: 'stress-relief-quick',
      title: 'Stress Relief (Quick)',
    });
  });

  it('always routes Pulse Variability to the Lab quick check', () => {
    expect(resolveRecommendation('EXPLORE_PULSE_VARIABILITY')).toEqual({
      kind: 'lab',
      protocol: 'quick-check',
      title: 'Pulse Variability quick check',
    });
  });

  it('falls back to the preset chooser when the mapped preset is unavailable', () => {
    expect(resolveRecommendation('RELAX', [])).toEqual({
      kind: 'presets',
      title: 'Choose a breathing preset',
    });
  });
});
