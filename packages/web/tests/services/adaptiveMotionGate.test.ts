import { describe, expect, it } from 'vitest';
import { AdaptiveMotionGate } from '@/services/adaptiveMotionGate';

describe('AdaptiveMotionGate', () => {
  it('learns a resting baseline before evaluating motion artifacts', () => {
    const gate = new AdaptiveMotionGate();

    for (let timestamp = 0; timestamp < 12; timestamp++) {
      expect(gate.addSample(9.8, timestamp)).toMatchObject({ accepted: true, baseline: 9.8 });
    }

    const decision = gate.addSample(9.82, 12);
    expect(decision).toMatchObject({ accepted: true, baseline: 9.8 });
    expect(decision.score).toBeLessThan(1);
  });

  it('rejects a large transient without teaching it as the new baseline', () => {
    const gate = new AdaptiveMotionGate();
    for (let timestamp = 0; timestamp < 12; timestamp++) gate.addSample(10, timestamp);

    const transient = gate.addSample(18, 12);
    const recovered = gate.addSample(10.05, 13);

    expect(transient).toMatchObject({ accepted: false, baseline: 10 });
    expect(transient.score).toBe(1);
    expect(recovered).toMatchObject({ accepted: true, baseline: 10 });
  });

  it('handles a zero-variance startup with a finite noise floor', () => {
    const gate = new AdaptiveMotionGate();
    for (let timestamp = 0; timestamp < 12; timestamp++) gate.addSample(0, timestamp);

    const resting = gate.addSample(0, 12);
    const movement = gate.addSample(0.1, 13);

    expect(resting).toMatchObject({ accepted: true, baseline: 0 });
    expect(resting.threshold).toBeGreaterThan(0);
    expect(movement).toMatchObject({ accepted: false, baseline: 0 });
    expect(Number.isFinite(movement.score)).toBe(true);
  });

  it('keeps only a bounded recent history', () => {
    const gate = new AdaptiveMotionGate();
    for (let timestamp = 0; timestamp < 500; timestamp++) gate.addSample(9.8, timestamp);

    expect(gate.getHistoryLength()).toBeLessThanOrEqual(60);
  });

  it('forgets the learned baseline when reset', () => {
    const gate = new AdaptiveMotionGate();
    for (let timestamp = 0; timestamp < 12; timestamp++) gate.addSample(10, timestamp);
    expect(gate.addSample(18, 12).accepted).toBe(false);

    gate.reset();

    expect(gate.getHistoryLength()).toBe(0);
    expect(gate.addSample(18, 13)).toMatchObject({ accepted: true, baseline: 18 });
  });

  it('makes the same decisions for proportionally scaled device fixtures', () => {
    const unitScaleGate = new AdaptiveMotionGate();
    const tenScaleGate = new AdaptiveMotionGate();
    const fixture = [1, 1.01, 0.99, 1, 1.02, 0.98, 1, 1.01, 0.99, 1, 1, 1.01, 1.8, 1.02];

    const unitDecisions = fixture.map(
      (magnitude, timestamp) => unitScaleGate.addSample(magnitude, timestamp).accepted
    );
    const tenScaleDecisions = fixture.map(
      (magnitude, timestamp) => tenScaleGate.addSample(magnitude * 10, timestamp).accepted
    );

    expect(tenScaleDecisions).toEqual(unitDecisions);
  });

  it('rejects non-finite magnitudes', () => {
    const decision = new AdaptiveMotionGate().addSample(Number.NaN, 0);

    expect(decision).toMatchObject({ accepted: false, score: 1 });
  });
});
