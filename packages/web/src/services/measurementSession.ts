import {
  evaluateMeasurementEligibility,
  type HeartRateEstimate,
  type IBISample,
  type MeasurementEligibility,
  type MeasurementProtocol,
  type SensorSource,
} from '@breath-in-flow/shared';
import { sensorStartFailure, type SensorStartResult } from './sensorTypes';

export type MeasurementState =
  | 'idle'
  | 'starting'
  | 'acquiring'
  | 'measuring'
  | 'no-data'
  | 'failed'
  | 'interrupted'
  | 'complete';

type MeasurementSensorSource = Exclude<SensorSource, 'fused'>;

export interface MeasurementSensorAdapter {
  start: () => Promise<SensorStartResult>;
  stop: () => void;
}

export interface MeasurementSessionResult {
  state: MeasurementState;
  samples: IBISample[];
  estimates: HeartRateEstimate[];
  activeSources: MeasurementSensorSource[];
  eligibility?: MeasurementEligibility;
  errorMessage?: string;
}

export interface MeasurementStartOutcome {
  ok: boolean;
  degradedSources?: MeasurementSensorSource[];
  message?: string;
}

interface MeasurementSessionOptions {
  protocol: MeasurementProtocol;
  noDataTimeoutMs?: number;
  now?: () => number;
  onStateChange?: (state: MeasurementState) => void;
  onElapsed?: (elapsedSeconds: number) => void;
}

export class MeasurementSession {
  private readonly protocol: MeasurementProtocol;
  private readonly noDataTimeoutMs: number;
  private readonly now: () => number;
  private readonly onStateChange?: (state: MeasurementState) => void;
  private readonly onElapsed?: (elapsedSeconds: number) => void;

  private state: MeasurementState = 'idle';
  private samples: IBISample[] = [];
  private estimates: HeartRateEstimate[] = [];
  private activeSensors = new Map<MeasurementSensorSource, MeasurementSensorAdapter>();
  private pendingSensors = new Map<MeasurementSensorSource, MeasurementSensorAdapter>();
  private acquisitionSources: MeasurementSensorSource[] = [];
  private contributingSources = new Set<MeasurementSensorSource>();
  private eligibility?: MeasurementEligibility;
  private errorMessage?: string;
  private startedAtMs = 0;
  private noDataTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private elapsedIntervalId: ReturnType<typeof setInterval> | null = null;

  constructor(options: MeasurementSessionOptions) {
    this.protocol = options.protocol;
    this.noDataTimeoutMs = options.noDataTimeoutMs ?? 5_000;
    this.now = options.now ?? (() => performance.now());
    this.onStateChange = options.onStateChange;
    this.onElapsed = options.onElapsed;
  }

  async start(
    sensors: Partial<Record<MeasurementSensorSource, MeasurementSensorAdapter>>
  ): Promise<MeasurementStartOutcome> {
    if (this.state !== 'idle') {
      return { ok: false, message: 'Measurement session has already started.' };
    }

    this.setState('starting');
    const entries = Object.entries(sensors) as Array<
      [MeasurementSensorSource, MeasurementSensorAdapter]
    >;
    const outcomes = await Promise.all(
      entries.map(async ([source, adapter]) => {
        this.pendingSensors.set(source, adapter);
        let result: SensorStartResult;
        try {
          result = await adapter.start();
        } catch (error) {
          adapter.stop();
          result = sensorStartFailure(
            'start-failed',
            error instanceof Error ? error.message : String(error)
          );
        } finally {
          this.pendingSensors.delete(source);
        }
        if (result.ok) {
          if (!this.isStarting()) {
            adapter.stop();
          } else {
            this.activeSensors.set(source, adapter);
          }
        }
        return { source, result };
      })
    );

    if (!this.isStarting()) {
      return {
        ok: false,
        message: this.errorMessage ?? 'Measurement ended during sensor startup.',
      };
    }

    const failedSources: MeasurementSensorSource[] = [];
    const failureMessages: string[] = [];
    for (const outcome of outcomes) {
      if (!outcome.result.ok) {
        failedSources.push(outcome.source);
        failureMessages.push(outcome.result.message);
      }
    }

    if (this.activeSensors.size === 0) {
      this.errorMessage = failureMessages.join(' ') || 'No sensor could be started.';
      this.setState('failed');
      return { ok: false, message: this.errorMessage };
    }

    this.startedAtMs = this.now();
    this.setState('acquiring');
    this.refreshNoDataTimeout();
    this.elapsedIntervalId = setInterval(() => {
      this.onElapsed?.(Math.max(0, Math.floor((this.now() - this.startedAtMs) / 1_000)));
    }, 1_000);

    return failedSources.length > 0 ? { ok: true, degradedSources: failedSources } : { ok: true };
  }

  addDetectedSample(sample: IBISample): void {
    if (this.state !== 'acquiring' && this.state !== 'measuring') return;
    if (sample.provenance?.method !== 'peak-detected') return;
    if (
      !Number.isFinite(sample.timestamp) ||
      !Number.isFinite(sample.interval) ||
      !Number.isFinite(sample.quality)
    ) {
      return;
    }

    this.samples.push(sample);
    if (sample.provenance.source === 'fused') {
      for (const source of this.activeSensors.keys()) this.contributingSources.add(source);
    } else {
      this.contributingSources.add(sample.provenance.source);
    }
    if (this.state === 'acquiring') {
      this.setState('measuring');
    }
    this.refreshNoDataTimeout();
  }

  addHeartRateEstimate(estimate: HeartRateEstimate): void {
    if (this.state !== 'acquiring' && this.state !== 'measuring') return;
    this.estimates.push(estimate);
  }

  reportSensorError(error: Error): void {
    if (this.state !== 'acquiring' && this.state !== 'measuring') return;
    this.errorMessage = error.message || 'A sensor error interrupted measurement quality.';
  }

  stop(finalSamples?: IBISample[]): MeasurementSessionResult {
    if (
      this.state === 'complete' ||
      this.state === 'failed' ||
      this.state === 'no-data' ||
      this.state === 'interrupted'
    ) {
      return this.getResult();
    }

    this.clearTimers();

    if (finalSamples) {
      this.samples = [...finalSamples];
    }
    this.snapshotActiveSources();
    this.stopActiveSensors();

    const sampleSpanSeconds =
      this.samples.length > 1
        ? Math.max(0, (this.samples.at(-1)!.timestamp - this.samples[0].timestamp) / 1_000)
        : 0;
    this.eligibility = evaluateMeasurementEligibility(
      this.samples,
      this.protocol,
      sampleSpanSeconds,
      { hasUnresolvedSensorError: Boolean(this.errorMessage) }
    );
    this.setState('complete');
    return this.getResult();
  }

  interrupt(reason: string): MeasurementSessionResult {
    if (
      this.state === 'complete' ||
      this.state === 'failed' ||
      this.state === 'no-data' ||
      this.state === 'interrupted'
    ) {
      return this.getResult();
    }

    this.clearTimers();
    this.snapshotActiveSources();
    this.stopActiveSensors();
    this.eligibility = undefined;
    this.errorMessage = reason;
    this.setState('interrupted');
    return this.getResult();
  }

  getResult(): MeasurementSessionResult {
    return {
      state: this.state,
      samples: [...this.samples],
      estimates: [...this.estimates],
      activeSources:
        this.acquisitionSources.length > 0
          ? [...this.acquisitionSources]
          : [...this.activeSensors.keys()],
      eligibility: this.eligibility,
      errorMessage: this.errorMessage,
    };
  }

  private handleNoData(): void {
    if (this.state !== 'acquiring' && this.state !== 'measuring') return;
    this.clearTimers();
    this.snapshotActiveSources();
    this.stopActiveSensors();
    this.errorMessage =
      'No detected heart beats were received. Reposition the sensor and try again.';
    this.setState('no-data');
  }

  private stopActiveSensors(): void {
    for (const sensor of this.pendingSensors.values()) {
      sensor.stop();
    }
    this.pendingSensors.clear();
    for (const sensor of this.activeSensors.values()) {
      sensor.stop();
    }
    this.activeSensors.clear();
  }

  private snapshotActiveSources(): void {
    const retainedSources = new Set<MeasurementSensorSource>();
    for (const sample of this.samples) {
      const source = sample.provenance?.source;
      if (source === 'ppg' || source === 'scg') {
        retainedSources.add(source);
      } else if (source === 'fused') {
        for (const activeSource of this.activeSensors.keys()) retainedSources.add(activeSource);
      }
    }
    this.acquisitionSources =
      retainedSources.size > 0
        ? [...retainedSources]
        : this.contributingSources.size > 0
          ? [...this.contributingSources]
          : [...this.activeSensors.keys()];
  }

  private refreshNoDataTimeout(): void {
    this.clearNoDataTimeout();
    this.noDataTimeoutId = setTimeout(() => this.handleNoData(), this.noDataTimeoutMs);
  }

  private clearNoDataTimeout(): void {
    if (this.noDataTimeoutId !== null) {
      clearTimeout(this.noDataTimeoutId);
      this.noDataTimeoutId = null;
    }
  }

  private clearTimers(): void {
    this.clearNoDataTimeout();
    if (this.elapsedIntervalId !== null) {
      clearInterval(this.elapsedIntervalId);
      this.elapsedIntervalId = null;
    }
  }

  private setState(state: MeasurementState): void {
    this.state = state;
    this.onStateChange?.(state);
  }

  private isStarting(): boolean {
    return this.state === 'starting';
  }
}
