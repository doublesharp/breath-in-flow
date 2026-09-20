import { describe, expect, it } from 'vitest';
import { DEFAULT_BREATHING_CONFIG, type BreathingConfig } from '@breath-in-flow/shared';
import { getPracticeSummary } from '../../src/utils/practiceSummary';

function config(overrides: Partial<BreathingConfig> = {}): BreathingConfig {
  return { ...DEFAULT_BREATHING_CONFIG, ...overrides } as BreathingConfig;
}

describe('getPracticeSummary', () => {
  it('summarizes a finite routine from every scheduled breathing phase', () => {
    expect(
      getPracticeSummary(
        config({
          inhaleTime: 3,
          inhaleHoldTime: 1,
          exhaleTime: 5,
          exhaleHoldTime: 2,
          repetitions: 8,
          targetSets: 1,
        })
      )
    ).toEqual({ duration: '1m 28s', detail: '8 reps · 1 set' });
  });

  it('labels an unlimited routine per set with manual rests', () => {
    expect(getPracticeSummary(config())).toEqual({
      duration: '32s / set',
      detail: '4 reps · Open-ended · rests at your pace',
    });
  });

  it('includes recovery breaths for an inhale hold followed by an exhale hold', () => {
    expect(
      getPracticeSummary(
        config({
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: true,
          extendedHoldType: 'INHALE',
          extendedHoldMode: 'TIMED',
          extendedHoldDuration: 10,
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType: 'EXHALE',
          secondExtendedHoldMode: 'TIMED',
          secondExtendedHoldDuration: 20,
        })
      )
    ).toEqual({ duration: '46s', detail: '1 rep · 1 set' });
  });

  it('includes the recovery inhale for an exhale hold followed by an inhale hold', () => {
    expect(
      getPracticeSummary(
        config({
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: true,
          extendedHoldType: 'EXHALE',
          extendedHoldMode: 'TIMED',
          extendedHoldDuration: 10,
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType: 'INHALE',
          secondExtendedHoldMode: 'TIMED',
          secondExtendedHoldDuration: 20,
        })
      )
    ).toEqual({ duration: '42s', detail: '1 rep · 1 set' });
  });

  it('marks tolerance holds as additional time while retaining scheduled preparation', () => {
    expect(
      getPracticeSummary(
        config({
          repetitions: 1,
          targetSets: 2,
          extendedHoldEnabled: true,
          extendedHoldType: 'INHALE',
          extendedHoldMode: 'TOLERANCE',
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType: 'EXHALE',
          secondExtendedHoldMode: 'TIMED',
          secondExtendedHoldDuration: 20,
        })
      )
    ).toEqual({
      duration: '1m 12s+',
      detail: '1 rep · 2 sets · rests at your pace · holds at your pace',
    });
  });

  it('counts scheduled rests only between finite sets', () => {
    expect(
      getPracticeSummary(config({ repetitions: 1, targetSets: 3, restBetweenSetsSeconds: 7 }))
    ).toEqual({ duration: '38s', detail: '1 rep · 3 sets' });
  });

  it('labels unscheduled rests between finite sets', () => {
    expect(getPracticeSummary(config({ repetitions: 1, targetSets: 3 }))).toEqual({
      duration: '24s',
      detail: '1 rep · 3 sets · rests at your pace',
    });
  });

  it('preserves fractional scheduled seconds', () => {
    expect(
      getPracticeSummary(
        config({ inhaleTime: 1.25, exhaleTime: 2.5, repetitions: 1, targetSets: 1 })
      )
    ).toEqual({ duration: '3.75s', detail: '1 rep · 1 set' });
  });

  it('carries rounded fractional seconds into the next minute', () => {
    expect(
      getPracticeSummary(
        config({ inhaleTime: 29.9995, exhaleTime: 30, repetitions: 1, targetSets: 1 })
      )
    ).toEqual({ duration: '1m', detail: '1 rep · 1 set' });
  });

  it('formats fractional seconds cleanly after splitting out minutes', () => {
    expect(
      getPracticeSummary(
        config({ inhaleTime: 32.1, exhaleTime: 32.1, repetitions: 1, targetSets: 1 })
      )
    ).toEqual({ duration: '1m 4.2s', detail: '1 rep · 1 set' });
  });

  it('prepares independently for two inhale holds', () => {
    expect(
      getPracticeSummary(
        config({
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: true,
          extendedHoldType: 'INHALE',
          extendedHoldMode: 'TIMED',
          extendedHoldDuration: 10,
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType: 'INHALE',
          secondExtendedHoldMode: 'TIMED',
          secondExtendedHoldDuration: 20,
        })
      )
    ).toEqual({ duration: '46s', detail: '1 rep · 1 set' });
  });

  it('does not add preparation between two exhale holds', () => {
    expect(
      getPracticeSummary(
        config({
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: true,
          extendedHoldType: 'EXHALE',
          extendedHoldMode: 'TIMED',
          extendedHoldDuration: 10,
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType: 'EXHALE',
          secondExtendedHoldMode: 'TIMED',
          secondExtendedHoldDuration: 20,
        })
      )
    ).toEqual({ duration: '38s', detail: '1 rep · 1 set' });
  });

  it('recognizes a tolerance-mode second hold', () => {
    expect(
      getPracticeSummary(
        config({
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: true,
          extendedHoldType: 'EXHALE',
          extendedHoldMode: 'TIMED',
          extendedHoldDuration: 10,
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType: 'INHALE',
          secondExtendedHoldMode: 'TOLERANCE',
        })
      )
    ).toEqual({ duration: '22s+', detail: '1 rep · 1 set · holds at your pace' });
  });

  it('ignores both hold settings when the first hold is disabled', () => {
    expect(
      getPracticeSummary(
        config({
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: false,
          extendedHoldType: 'INHALE',
          extendedHoldMode: 'TOLERANCE',
          secondExtendedHoldEnabled: true,
          secondExtendedHoldType: 'INHALE',
          secondExtendedHoldMode: 'TIMED',
          secondExtendedHoldDuration: 20,
        })
      )
    ).toEqual({ duration: '8s', detail: '1 rep · 1 set' });
  });

  it('ignores second hold settings when the second hold is disabled', () => {
    expect(
      getPracticeSummary(
        config({
          repetitions: 1,
          targetSets: 1,
          extendedHoldEnabled: true,
          extendedHoldType: 'EXHALE',
          extendedHoldMode: 'TIMED',
          extendedHoldDuration: 10,
          secondExtendedHoldEnabled: false,
          secondExtendedHoldType: 'INHALE',
          secondExtendedHoldMode: 'TOLERANCE',
        })
      )
    ).toEqual({ duration: '18s', detail: '1 rep · 1 set' });
  });

  it('returns null for invalid configuration data', () => {
    expect(getPracticeSummary(config({ inhaleTime: 0 }))).toBeNull();
    expect(
      getPracticeSummary(
        config({
          extendedHoldEnabled: true,
          extendedHoldMode: 'TIMED',
          extendedHoldDuration: 0,
        })
      )
    ).toBeNull();
  });
});
