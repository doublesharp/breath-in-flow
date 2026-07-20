import { describe, it, expect } from 'vitest';
import { scoreTrial, findSuggestedRate } from '../../src/utils/assessmentScoring';
import type { AssessmentTrial } from '@breath-in-flow/shared';

function makeTrial(overrides: Partial<AssessmentTrial> = {}): AssessmentTrial {
  return {
    rate: 5.5,
    inhaleTime: 4.4,
    exhaleTime: 6.5,
    repetitions: 11,
    symptoms: [],
    ...overrides,
  };
}

describe('scoreTrial', () => {
  it('scores maximum when all fields are best', () => {
    const trial = makeTrial({
      comfortRating: 5,
      symptoms: [],
      hrAmplitude: 'large',
      waveformSmoothness: 'verySmooth',
    });
    expect(scoreTrial(trial)).toBe(9); // 3+3+3
  });

  it('scores with comfort only when HR fields missing', () => {
    const trial = makeTrial({ comfortRating: 5, symptoms: [] });
    expect(scoreTrial(trial)).toBe(3);
  });

  it('subtracts 1 per symptom', () => {
    const trial = makeTrial({
      comfortRating: 5,
      symptoms: ['airHunger', 'dizziness'],
      hrAmplitude: 'large',
      waveformSmoothness: 'verySmooth',
    });
    expect(scoreTrial(trial)).toBe(7); // 9 - 2
  });

  it('returns -1 for comfort rating 1', () => {
    const trial = makeTrial({ comfortRating: 1, symptoms: [] });
    expect(scoreTrial(trial)).toBe(-1);
  });

  it('returns 0 for comfort rating 2', () => {
    const trial = makeTrial({ comfortRating: 2, symptoms: [] });
    expect(scoreTrial(trial)).toBe(0);
  });
});

describe('findSuggestedRate', () => {
  it('picks trial with highest score', () => {
    const trials = [
      makeTrial({
        rate: 6.5,
        comfortRating: 3,
        hrAmplitude: 'small',
        waveformSmoothness: 'jagged',
        symptoms: [],
      }),
      makeTrial({
        rate: 5.5,
        comfortRating: 5,
        hrAmplitude: 'large',
        waveformSmoothness: 'verySmooth',
        symptoms: [],
      }),
      makeTrial({
        rate: 4.5,
        comfortRating: 4,
        hrAmplitude: 'medium',
        waveformSmoothness: 'somewhatSmooth',
        symptoms: [],
      }),
    ];
    expect(findSuggestedRate(trials)).toBe(5.5);
  });

  it('breaks tie by fewer symptoms first', () => {
    const trials = [
      makeTrial({ rate: 6.0, comfortRating: 5, symptoms: ['airHunger'] }),
      makeTrial({ rate: 5.5, comfortRating: 4, symptoms: [] }),
    ];
    // 6.0: 3 - 1 = 2, 5.5: 2 - 0 = 2 (tied). 5.5 has fewer symptoms → wins
    expect(findSuggestedRate(trials)).toBe(5.5);
  });

  it('breaks tie by slower rate when no symptoms on either', () => {
    const trials = [
      makeTrial({ rate: 6.0, comfortRating: 4, symptoms: [] }),
      makeTrial({ rate: 5.0, comfortRating: 4, symptoms: [] }),
    ];
    // Both score 2, both 0 symptoms → prefer slower (5.0)
    expect(findSuggestedRate(trials)).toBe(5.0);
  });

  it('breaks tie by faster rate when both have symptoms', () => {
    const trials = [
      makeTrial({ rate: 6.0, comfortRating: 5, symptoms: ['dizziness'] }),
      makeTrial({ rate: 5.0, comfortRating: 5, symptoms: ['airHunger'] }),
    ];
    // Both score 2, both 1 symptom → prefer faster (6.0)
    expect(findSuggestedRate(trials)).toBe(6.0);
  });
});
