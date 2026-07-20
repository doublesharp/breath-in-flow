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
    // Direct Form II Transposed
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
 * Compute 2nd order Butterworth lowpass digital coefficients via bilinear transform.
 * Returns [b0, b1, b2, a0, a1, a2] (a0 normalized to 1).
 */
function butterworth2ndOrderLP(cutoffHz: number, sampleRateHz: number): BiquadFilter {
  // Pre-warp the cutoff frequency
  const Wd = 2 * sampleRateHz * Math.tan((Math.PI * cutoffHz) / sampleRateHz);
  // Bilinear transform for 2nd order Butterworth LP
  // H(s) = Wn^2 / (s^2 + sqrt(2)*Wn*s + Wn^2)
  const k = Wd / (2 * sampleRateHz); // normalized pre-warped freq (= tan(pi*fc/fs))
  const k2 = k * k;
  const sqrt2 = Math.SQRT2;
  const norm = 1 / (1 + sqrt2 * k + k2);

  const b0 = k2 * norm;
  const b1 = 2 * k2 * norm;
  const b2 = k2 * norm;
  const a1 = 2 * (k2 - 1) * norm;
  const a2 = (1 - sqrt2 * k + k2) * norm;

  return new BiquadFilter([b0, b1, b2], [1, a1, a2]);
}

/**
 * Compute 2nd order Butterworth highpass digital coefficients via bilinear transform.
 */
function butterworth2ndOrderHP(cutoffHz: number, sampleRateHz: number): BiquadFilter {
  const k = Math.tan((Math.PI * cutoffHz) / sampleRateHz);
  const k2 = k * k;
  const sqrt2 = Math.SQRT2;
  const norm = 1 / (1 + sqrt2 * k + k2);

  const b0 = norm;
  const b1 = -2 * norm;
  const b2 = norm;
  const a1 = 2 * (k2 - 1) * norm;
  const a2 = (1 - sqrt2 * k + k2) * norm;

  return new BiquadFilter([b0, b1, b2], [1, a1, a2]);
}

export function createLowpassFilter(cutoffHz: number, sampleRateHz: number, order = 2): SOSFilter {
  const numSections = Math.ceil(order / 2);
  const sections: BiquadFilter[] = [];
  for (let i = 0; i < numSections; i++) {
    sections.push(butterworth2ndOrderLP(cutoffHz, sampleRateHz));
  }
  return new SOSFilter(sections);
}

export function createHighpassFilter(cutoffHz: number, sampleRateHz: number, order = 2): SOSFilter {
  const numSections = Math.ceil(order / 2);
  const sections: BiquadFilter[] = [];
  for (let i = 0; i < numSections; i++) {
    sections.push(butterworth2ndOrderHP(cutoffHz, sampleRateHz));
  }
  return new SOSFilter(sections);
}

export function createBandpassFilter(
  lowHz: number,
  highHz: number,
  sampleRateHz: number,
  order = 2
): SOSFilter {
  // Implement bandpass as HP followed by LP (cascade approach)
  const numSections = Math.ceil(order / 2);
  const sections: BiquadFilter[] = [];
  for (let i = 0; i < numSections; i++) {
    sections.push(butterworth2ndOrderHP(lowHz, sampleRateHz));
  }
  for (let i = 0; i < numSections; i++) {
    sections.push(butterworth2ndOrderLP(highHz, sampleRateHz));
  }
  return new SOSFilter(sections);
}
