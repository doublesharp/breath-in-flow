import type { UserGoal } from '@breath-in-flow/shared';
import { guidedPresets, type GuidedPreset } from '@/data/guidedPresets';

export type Recommendation =
  | { kind: 'practice'; presetId: string; title: string }
  | { kind: 'lab'; protocol: 'quick-check'; title: string }
  | { kind: 'presets'; title: string };

const GOAL_PRESETS: Partial<Record<UserGoal, string>> = {
  RELAX: 'stress-relief-quick',
  TRAIN_DIAPHRAGM: 'diaphragm-resistance-starter',
  BUILD_CONSISTENCY: 'coherent-breathing',
};

export function resolveRecommendation(
  goal: UserGoal,
  presets: GuidedPreset[] = guidedPresets
): Recommendation {
  // Pulse Variability always points at the Lab, independent of the preset catalog.
  if (goal === 'EXPLORE_PULSE_VARIABILITY') {
    return { kind: 'lab', protocol: 'quick-check', title: 'Pulse Variability quick check' };
  }

  const presetId = GOAL_PRESETS[goal];
  const preset = presetId ? presets.find(({ id }) => id === presetId) : undefined;
  if (preset) {
    return { kind: 'practice', presetId: preset.id, title: preset.config.name };
  }

  return { kind: 'presets', title: 'Choose a breathing preset' };
}
