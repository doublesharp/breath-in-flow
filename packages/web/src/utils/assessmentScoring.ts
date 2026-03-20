import type { AssessmentTrial } from '@breath-in-flow/shared';

const COMFORT_SCORES: Record<number, number> = {
  5: 3,
  4: 2,
  3: 1,
  2: 0,
  1: -1,
};

const HR_AMPLITUDE_SCORES: Record<string, number> = {
  large: 3,
  medium: 2,
  small: 1,
};

const SMOOTHNESS_SCORES: Record<string, number> = {
  verySmooth: 3,
  somewhatSmooth: 2,
  jagged: 1,
};

export function scoreTrial(trial: AssessmentTrial): number {
  let score = 0;

  if (trial.comfortRating != null) {
    score += COMFORT_SCORES[trial.comfortRating] ?? 0;
  }

  if (trial.hrAmplitude) {
    score += HR_AMPLITUDE_SCORES[trial.hrAmplitude] ?? 0;
  }

  if (trial.waveformSmoothness) {
    score += SMOOTHNESS_SCORES[trial.waveformSmoothness] ?? 0;
  }

  score -= trial.symptoms.length;

  return score;
}

export function findSuggestedRate(trials: AssessmentTrial[]): number {
  const scored = trials.map((t) => ({
    rate: t.rate,
    score: scoreTrial(t),
    symptomCount: t.symptoms.length,
  }));

  scored.sort((a, b) => {
    // Primary: highest score
    if (a.score !== b.score) return b.score - a.score;
    // Tie-breaker 1: fewer symptoms
    if (a.symptomCount !== b.symptomCount) return a.symptomCount - b.symptomCount;
    // Tie-breaker 2: if no symptoms on either, prefer slower (lower BPM)
    if (a.symptomCount === 0 && b.symptomCount === 0) return a.rate - b.rate;
    // Tie-breaker 3: if both have symptoms, prefer faster (higher BPM)
    return b.rate - a.rate;
  });

  return scored[0].rate;
}
