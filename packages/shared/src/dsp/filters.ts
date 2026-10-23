/**
 * Butterworth IIR filters implemented using second-order sections (SOS).
 * Uses bilinear transform with frequency pre-warping for digital coefficient computation.
 */

export class BiquadFilter {
  private b: [number, number, number];
  private a: [number, number, number];
  // State: x[n-1], x[n-2], y[n-1], y[n-2]
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(b: [number, number, number], a: [number, number, number]) {
    this.b = b;
    this.a = a;
  }

  filter(sample: number): number {
    // Direct Form I
    const y =
      this.b[0] * sample +
      this.b[1] * this.x1 +
      this.b[2] * this.x2 -
      this.a[1] * this.y1 -
      this.a[2] * this.y2;
    this.x2 = this.x1;
    this.x1 = sample;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }

  reset(): void {
    this.x1 = 0;
    this.x2 = 0;
    this.y1 = 0;
    this.y2 = 0;
  }
}

export class SOSFilter {
  private sections: BiquadFilter[];

  constructor(sections: BiquadFilter[]) {
    this.sections = sections;
  }

  filter(sample: number): number {
    let output = sample;
    for (const section of this.sections) {
      output = section.filter(output);
    }
    return output;
  }

  reset(): void {
    for (const section of this.sections) {
      section.reset();
    }
  }

  filterBatch(samples: number[]): number[] {
    return samples.map((s) => this.filter(s));
  }
}

/**
 * Compute a lowpass pole-pair section via the bilinear transform, a0 = 1.
 * damping = 1/Q is determined by the poles of the complete Butterworth filter.
 */
function butterworth2ndOrderLP(
  cutoffHz: number,
  sampleRateHz: number,
  damping: number
): BiquadFilter {
  const k = Math.tan((Math.PI * cutoffHz) / sampleRateHz);
  const k2 = k * k;
  const norm = 1 / (1 + damping * k + k2);

  const b0 = k2 * norm;
  const b1 = 2 * k2 * norm;
  const b2 = k2 * norm;
  const a1 = 2 * (k2 - 1) * norm;
  const a2 = (1 - damping * k + k2) * norm;

  return new BiquadFilter([b0, b1, b2], [1, a1, a2]);
}

/**
 * Compute 2nd order Butterworth highpass digital coefficients via bilinear transform.
 */
function butterworth2ndOrderHP(
  cutoffHz: number,
  sampleRateHz: number,
  damping: number
): BiquadFilter {
  const k = Math.tan((Math.PI * cutoffHz) / sampleRateHz);
  const k2 = k * k;
  const norm = 1 / (1 + damping * k + k2);

  const b0 = norm;
  const b1 = -2 * norm;
  const b2 = norm;
  const a1 = 2 * (k2 - 1) * norm;
  const a2 = (1 - damping * k + k2) * norm;

  return new BiquadFilter([b0, b1, b2], [1, a1, a2]);
}

function butterworthSections(
  cutoffHz: number,
  sampleRateHz: number,
  order: number,
  highpass: boolean
): BiquadFilter[] {
  if (!Number.isInteger(order) || order < 1) {
    throw new RangeError('Filter order must be a positive integer');
  }
  const sections: BiquadFilter[] = [];
  if (order % 2 === 1) {
    // The unpaired real pole contributes one first-order section.
    const k = Math.tan((Math.PI * cutoffHz) / sampleRateHz);
    const b0 = (highpass ? 1 : k) / (1 + k);
    sections.push(new BiquadFilter([b0, highpass ? -b0 : b0, 0], [1, (k - 1) / (k + 1), 0]));
  }
  // Conjugate poles on the left unit semicircle. Order 4 gives
  // Q = 0.541196... and 1.306562..., not two identical order-2 sections.
  for (let i = Math.floor(order / 2) - 1; i >= 0; i--) {
    const damping = 2 * Math.sin(((2 * i + 1) * Math.PI) / (2 * order));
    sections.push(
      highpass
        ? butterworth2ndOrderHP(cutoffHz, sampleRateHz, damping)
        : butterworth2ndOrderLP(cutoffHz, sampleRateHz, damping)
    );
  }
  return sections;
}

export function createLowpassFilter(cutoffHz: number, sampleRateHz: number, order = 2): SOSFilter {
  return new SOSFilter(butterworthSections(cutoffHz, sampleRateHz, order, false));
}

export function createHighpassFilter(cutoffHz: number, sampleRateHz: number, order = 2): SOSFilter {
  return new SOSFilter(butterworthSections(cutoffHz, sampleRateHz, order, true));
}

export function createBandpassFilter(
  lowHz: number,
  highHz: number,
  sampleRateHz: number,
  order = 2
): SOSFilter {
  // Preserve the cascade convention: each leg has the requested order,
  // so the combined HP + LP transfer function has order 2 * order.
  return new SOSFilter([
    ...butterworthSections(lowHz, sampleRateHz, order, true),
    ...butterworthSections(highHz, sampleRateHz, order, false),
  ]);
}
