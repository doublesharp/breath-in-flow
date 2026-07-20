# Wellness Accuracy and Mobile Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Breath in Flow as a reliable offline wellness and breath-training app with correct sensor provenance, conservative pulse-variability output, synchronized iOS/Android projects, improved mobile UX, and guided diaphragm resistance training.

**Architecture:** Preserve the existing Vue/shared-package design while separating detected intervals from heart-rate estimates, measurement eligibility from analysis, and guided-preset metadata from persisted breathing configuration. Both timer implementations share a backward-compatible timed-rest phase, while a measurement orchestrator in the Lab owns startup, no-data handling, fusion, eligibility, and cleanup.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, Zod, pnpm workspaces, Capacitor 8, Electron, localStorage/IndexedDB, Chart.js.

## Global Constraints

- The product is a wellness and training app, not a medical device.
- Camera PPG is recommended; SCG and dual mode are experimental and labeled Beta.
- Autocorrelation output is a `HeartRateEstimate` and never enters HRV analysis.
- `restBetweenSetsSeconds` is 0 through 600 seconds; 0 preserves manual set completion.
- Quick Check is at least 60 seconds, Morning Readiness at least 120 seconds, and complete frequency output at least 300 seconds.
- Eligible recordings require genuine ordered samples, mean quality at least 0.50, and no more than 10% corrected or discarded artifacts.
- Existing stored configurations and measurements remain readable without destructive migration.
- Update safe patch/minor dependencies; major upgrades require compatibility evidence.
- Tests are written and observed failing before implementation code.
- Preserve unrelated dirty WIP and stage only the files named by each commit.

---

### Task 1: Validate and Fold Foundational WIP

**Files:**

- Modify: `.gitignore`
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/database/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/database/prisma/schema.prisma`
- Modify: `packages/database/prisma.config.ts`
- Modify: `packages/database/src/client.ts`
- Modify: `packages/database/tests/operations.test.ts`
- Modify: `packages/web/src/composables/useStorage.ts`
- Modify: `packages/web/src/composables/useHrvStorage.ts`
- Create: `packages/web/src/utils/storageSerialization.ts`
- Test: `packages/web/tests/composables/useStorage.test.ts`
- Test: `packages/web/tests/composables/useHrvStorage.test.ts`

**Interfaces:**

- Consumes: existing Zod schemas and local browser storage keys.
- Produces: Prisma 7 client initialization and date-safe local persistence used by later tasks.

- [ ] **Step 1: Review only the listed diffs for accidental behavior changes**

Run: `git diff -- .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml packages/database packages/shared/package.json packages/web/package.json packages/web/src/composables/useStorage.ts packages/web/src/composables/useHrvStorage.ts packages/web/src/utils/storageSerialization.ts packages/web/tests/composables/useStorage.test.ts packages/web/tests/composables/useHrvStorage.test.ts`

Expected: changes are limited to dependency/build configuration, Prisma 7 initialization, storage validation/date revival, and their tests.

- [ ] **Step 2: Run the focused tests and type checks**

Run: `pnpm --filter @breath-in-flow/database test && pnpm --filter @breath-in-flow/web test -- tests/composables/useStorage.test.ts tests/composables/useHrvStorage.test.ts && pnpm --filter @breath-in-flow/database typecheck && pnpm --filter @breath-in-flow/web typecheck`

Expected: all selected tests and type checks pass.

- [ ] **Step 3: Commit the validated foundation**

```bash
git add .gitignore package.json pnpm-workspace.yaml pnpm-lock.yaml packages/database packages/shared/package.json packages/web/package.json packages/web/src/composables/useStorage.ts packages/web/src/composables/useHrvStorage.ts packages/web/src/utils/storageSerialization.ts packages/web/tests/composables/useStorage.test.ts packages/web/tests/composables/useHrvStorage.test.ts
git commit -m "fix: harden local persistence and database setup"
```

### Task 2: Add Backward-Compatible Timed Rest Between Sets

**Files:**

- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/src/timer.ts`
- Modify: `packages/shared/tests/schemas.test.ts`
- Modify: `packages/shared/tests/timer.test.ts`
- Modify: `packages/web/src/composables/useBreathingTimer.ts`
- Modify: `packages/web/tests/composables/useBreathingTimer.test.ts`
- Modify: `packages/web/src/components/BreathingVisualizer.vue`
- Modify: `packages/web/tests/components/BreathingVisualizer.test.ts`
- Modify: `packages/web/src/components/BreathingPractice.vue`
- Modify: `packages/web/tests/components/BreathingPractice.test.ts`

**Interfaces:**

- Consumes: `BreathingConfig`, `BreathingPhase`, and existing `nextSet()` controls.
- Produces: `restBetweenSetsSeconds: number`, `SET_REST`, automatic rest completion, and early rest skipping.

- [ ] **Step 1: Write schema and shared-timer failing tests**

```ts
expect(BreathingConfigSchema.parse({ ...DEFAULT_BREATHING_CONFIG }).restBetweenSetsSeconds).toBe(0);
expect(
  BreathingConfigSchema.safeParse({ ...DEFAULT_BREATHING_CONFIG, restBetweenSetsSeconds: 601 })
    .success
).toBe(false);

const config = {
  ...DEFAULT_BREATHING_CONFIG,
  inhaleTime: 1,
  exhaleTime: 1,
  repetitions: 1,
  targetSets: 2,
  restBetweenSetsSeconds: 3,
};
const timer = new BreathingTimer(config);
timer.start();
vi.advanceTimersByTime(2200);
expect(timer.getState().phase).toBe('SET_REST');
vi.advanceTimersByTime(3100);
expect(timer.getState().phase).toBe('INHALE');
expect(timer.getState().currentSet).toBe(2);
```

- [ ] **Step 2: Verify the new tests fail for the missing field and phase**

Run: `pnpm --filter @breath-in-flow/shared test -- tests/schemas.test.ts tests/timer.test.ts`

Expected: FAIL because `restBetweenSetsSeconds` and `SET_REST` do not exist.

- [ ] **Step 3: Implement the schema and shared timer**

```ts
// BaseBreathingConfigSchema
restBetweenSetsSeconds: z.number().int().min(0).max(600).default(0),

// BreathingPhaseSchema
'SET_REST',

// completeSet()
if (this.config.restBetweenSetsSeconds > 0) {
  this.setPhase('SET_REST', this.config.restBetweenSetsSeconds);
  return;
}
this.setPhase('SET_COMPLETE', 0);
this.stopInterval();

// transitionToNextPhase()
case 'SET_REST':
  this.startNextSet();
  break;
```

Update `calculateSetTime`/planned duration helpers so rests are counted only between finite target sets.

- [ ] **Step 4: Run shared tests to green**

Run: `pnpm --filter @breath-in-flow/shared test -- tests/schemas.test.ts tests/timer.test.ts`

Expected: PASS.

- [ ] **Step 5: Write Vue timer and component failing tests**

```ts
it('counts down configured rest and starts the next set automatically', () => {
  const timer = useBreathingTimer({
    ...DEFAULT_BREATHING_CONFIG,
    inhaleTime: 1,
    exhaleTime: 1,
    repetitions: 1,
    targetSets: 2,
    restBetweenSetsSeconds: 3,
  });
  timer.start();
  vi.advanceTimersByTime(2500);
  expect(timer.phase.value).toBe('SET_REST');
  vi.advanceTimersByTime(3100);
  expect(timer.currentSet.value).toBe(2);
  expect(timer.phase.value).toBe('INHALE');
});
```

Add assertions that the configuration modal exposes `Rest between sets`, the rest screen shows a countdown and `Start next set now`, and a zero value retains `SET_COMPLETE`.

- [ ] **Step 6: Verify Vue tests fail for missing rest behavior**

Run: `pnpm --filter @breath-in-flow/web test -- tests/composables/useBreathingTimer.test.ts tests/components/BreathingVisualizer.test.ts tests/components/BreathingPractice.test.ts`

Expected: FAIL on missing `SET_REST`, controls, and field.

- [ ] **Step 7: Implement Vue rest behavior and UI**

```ts
// completeSet() in useBreathingTimer
if (config.restBetweenSetsSeconds > 0) {
  setPhase('SET_REST', config.restBetweenSetsSeconds);
  return;
}

// transitionToNextPhase
case 'SET_REST':
  startNextSet();
  break;

function nextSet() {
  if (state.value.phase !== 'SET_COMPLETE' && state.value.phase !== 'SET_REST') return;
  startNextSet();
}
```

Add `SET_REST` phase copy/color and a number input with `min="0"`, `max="600"`, and helper text that zero waits for manual continuation.

- [ ] **Step 8: Run the complete rest regression set**

Run: `pnpm --filter @breath-in-flow/shared test -- tests/schemas.test.ts tests/timer.test.ts && pnpm --filter @breath-in-flow/web test -- tests/composables/useBreathingTimer.test.ts tests/components/BreathingVisualizer.test.ts tests/components/BreathingPractice.test.ts`

Expected: PASS.

- [ ] **Step 9: Commit timed rest**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/timer.ts packages/shared/tests/schemas.test.ts packages/shared/tests/timer.test.ts packages/web/src/composables/useBreathingTimer.ts packages/web/tests/composables/useBreathingTimer.test.ts packages/web/src/components/BreathingVisualizer.vue packages/web/tests/components/BreathingVisualizer.test.ts packages/web/src/components/BreathingPractice.vue packages/web/tests/components/BreathingPractice.test.ts
git commit -m "feat: add timed rest between breathing sets"
```

### Task 3: Add Guided Diaphragm Resistance Training Preset

**Files:**

- Create: `packages/web/src/data/guidedPresets.ts`
- Modify: `packages/web/src/components/PracticePresets.vue`
- Modify: `packages/web/tests/components/PracticePresets.test.ts`

**Interfaces:**

- Consumes: `BreathingConfigSchema`, `DEFAULT_BREATHING_CONFIG`.
- Produces: `GuidedPreset`, `guidedPresets`, and a sanitized `loadConfig` payload.

- [ ] **Step 1: Write failing component tests**

```ts
it('shows diaphragm training guidance and emits only validated config', async () => {
  const wrapper = await mountPresets();
  expect(wrapper.text()).toContain('Diaphragm Resistance Training — Starter');
  await wrapper.get('[data-testid="guidance-diaphragm-resistance-starter"]').trigger('click');
  expect(wrapper.text()).toContain('Endurance');
  expect(wrapper.text()).toContain('Strengthening');
  expect(wrapper.text()).toContain('Stop for dizziness');
  await wrapper.get('[data-testid="load-diaphragm-resistance-starter"]').trigger('click');
  const config = wrapper.emitted('loadConfig')?.at(-1)?.[0] as Record<string, unknown>;
  expect(config).toMatchObject({
    inhaleTime: 3,
    inhaleHoldTime: 1,
    exhaleTime: 4,
    exhaleHoldTime: 1,
    repetitions: 10,
    targetSets: 2,
    restBetweenSetsSeconds: 60,
  });
  expect(config.guidance).toBeUndefined();
});
```

- [ ] **Step 2: Verify the preset test fails**

Run: `pnpm --filter @breath-in-flow/web test -- tests/components/PracticePresets.test.ts`

Expected: FAIL because the preset and guidance controls do not exist.

- [ ] **Step 3: Define guided preset data and sanitizer**

```ts
export interface RoutineGuidance {
  purpose: string;
  setup: string[];
  steps: string[];
  progression: { endurance: string; strengthening: string };
  precautions: string[];
}

export interface GuidedPreset {
  id: string;
  description: string;
  config: BreathingConfig;
  guidance?: RoutineGuidance;
}

export function presetConfig(preset: GuidedPreset): BreathingConfig {
  return BreathingConfigSchema.parse(preset.config);
}
```

Populate `diaphragm-resistance-starter` with the exact defaults and conservative copy from the design specification.

- [ ] **Step 4: Render accessible guidance and separate Load action**

Use a real `<button :aria-expanded>` to toggle a region with `role="region"`, and call `emit('loadConfig', presetConfig(preset))` from a distinct Load button. Keep existing built-ins in the same data module so all presets share one rendering path.

- [ ] **Step 5: Run component, type, and accessibility-oriented assertions**

Run: `pnpm --filter @breath-in-flow/web test -- tests/components/PracticePresets.test.ts && pnpm --filter @breath-in-flow/web typecheck`

Expected: PASS.

- [ ] **Step 6: Commit the guided preset**

```bash
git add packages/web/src/data/guidedPresets.ts packages/web/src/components/PracticePresets.vue packages/web/tests/components/PracticePresets.test.ts
git commit -m "feat: add guided diaphragm resistance preset"
```

### Task 4: Establish HRV Provenance and Eligibility

**Files:**

- Modify: `packages/shared/src/hrv/types.ts`
- Create: `packages/shared/src/hrv/eligibility.ts`
- Modify: `packages/shared/src/hrv/index.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/tests/hrv/eligibility.test.ts`
- Modify: `packages/shared/tests/hrv/timeDomain.test.ts`

**Interfaces:**

- Produces: `HeartRateEstimate`, `SampleProvenance`, `MeasurementProtocol`, `MeasurementEligibility`, `evaluateMeasurementEligibility(samples, protocol, observedDurationSeconds)`.

- [ ] **Step 1: Write failing eligibility tests**

```ts
expect(
  evaluateMeasurementEligibility(detectedSamples(130), 'morning-readiness', 130).eligible
).toBe(true);
expect(
  evaluateMeasurementEligibility(estimatedSamples(130), 'morning-readiness', 130).reasons
).toContain('estimated-samples');
expect(evaluateMeasurementEligibility(detectedSamples(50), 'quick-check', 50).reasons).toContain(
  'duration-too-short'
);
expect(
  evaluateMeasurementEligibility(lowQualitySamples(130), 'morning-readiness', 130).reasons
).toContain('low-signal-quality');
```

- [ ] **Step 2: Verify eligibility tests fail**

Run: `pnpm --filter @breath-in-flow/shared test -- tests/hrv/eligibility.test.ts`

Expected: FAIL because the eligibility API is missing.

- [ ] **Step 3: Implement provenance and eligibility types**

```ts
export type SensorSource = 'ppg' | 'scg' | 'fused';
export type DetectionMethod = 'peak-detected' | 'autocorrelation-estimate';
export interface HeartRateEstimate {
  timestamp: number;
  bpm: number;
  quality: number;
  source: Exclude<SensorSource, 'fused'>;
  method: 'autocorrelation-estimate';
}
export interface SampleProvenance {
  source: SensorSource;
  method: 'peak-detected';
}
export interface MeasurementEligibility {
  eligible: boolean;
  reasons: EligibilityReason[];
  warnings: EligibilityWarning[];
  availableMetrics: MetricGroup[];
  artifactPercentage: number;
  meanQuality: number;
}
```

Legacy `IBISample.provenance` remains optional for reading stored data; newly captured samples set it explicitly. Eligibility rejects known estimate provenance and applies protocol duration, quality, order, count, plausibility, and artifact gates.

- [ ] **Step 4: Run eligibility and all shared HRV tests**

Run: `pnpm --filter @breath-in-flow/shared test -- tests/hrv`

Expected: PASS.

- [ ] **Step 5: Commit provenance and eligibility**

```bash
git add packages/shared/src/hrv/types.ts packages/shared/src/hrv/eligibility.ts packages/shared/src/hrv/index.ts packages/shared/src/index.ts packages/shared/tests/hrv
git commit -m "feat: gate pulse variability analysis by provenance"
```

### Task 5: Separate Sensor Estimates from Detected Intervals

**Files:**

- Modify: `packages/web/src/services/ppgService.ts`
- Modify: `packages/web/src/services/scgService.ts`
- Modify: `packages/web/tests/services/ppgService.test.ts`
- Modify: `packages/web/tests/services/scgService.test.ts`

**Interfaces:**

- Consumes: `HeartRateEstimate`, `IBISample.provenance`.
- Produces: `onHeartRateEstimate`; `start(): Promise<SensorStartResult>`; shared monotonic emitted timestamps.

- [ ] **Step 1: Write failing sensor contract tests**

Assert that an autocorrelation-only signal calls `onHeartRateEstimate` and never `onIBI`; peak detections set `provenance.method === 'peak-detected'`; native SCG uses `event.interval`; PPG and SCG timestamps are based on injected/shared `performance.now()`; and unavailable permission returns `{ ok: false, reason }`.

- [ ] **Step 2: Verify sensor tests fail for the current synthetic IBI behavior**

Run: `pnpm --filter @breath-in-flow/web test -- tests/services/ppgService.test.ts tests/services/scgService.test.ts`

Expected: FAIL because autocorrelation currently emits `IBISample`, SCG hard-codes 16 ms, and `start()` does not return explicit results.

- [ ] **Step 3: Implement distinct estimate callbacks and start results**

```ts
export interface SensorStartResult {
  ok: boolean;
  reason?: 'permission-denied' | 'unavailable' | 'start-failed';
  message?: string;
}

interface SensorCallbacks {
  onIBI?: (sample: IBISample) => void;
  onHeartRateEstimate?: (estimate: HeartRateEstimate) => void;
  // existing raw, quality, error, status callbacks
}
```

PPG/SCG autocorrelation emits one coarse BPM estimate only. Detected peaks emit monotonic timestamps relative to the shared performance origin. Native SCG passes `event.interval` when finite and positive, otherwise the current measured/default interval.

- [ ] **Step 4: Re-enable SCG motion/no-peak quality gating**

Quality stays zero until valid detected intervals exist. Motion-contaminated windows emit positioning guidance through status/error state and never a fixed fallback quality.

- [ ] **Step 5: Run sensor tests and typecheck**

Run: `pnpm --filter @breath-in-flow/web test -- tests/services/ppgService.test.ts tests/services/scgService.test.ts && pnpm --filter @breath-in-flow/web typecheck`

Expected: PASS.

- [ ] **Step 6: Commit sensor contracts**

```bash
git add packages/web/src/services/ppgService.ts packages/web/src/services/scgService.ts packages/web/tests/services/ppgService.test.ts packages/web/tests/services/scgService.test.ts
git commit -m "fix: separate pulse estimates from detected intervals"
```

### Task 6: Correct Dual-Sensor Fusion

**Files:**

- Modify: `packages/web/src/services/sensorFusion.ts`
- Modify: `packages/web/tests/services/sensorFusion.test.ts`

**Interfaces:**

- Produces: bounded PPG/SCG queues, offset-aware matching, `flush()`, and exactly-once fused output.

- [ ] **Step 1: Write failing queue/fusion tests**

Test three queued beats per source, stable 180 ms mechanical-to-peripheral offset, interval agreement/disagreement, timeout fallback, duplicate timestamp suppression, bounded queue size, and reset cancellation.

- [ ] **Step 2: Verify fusion tests fail**

Run: `pnpm --filter @breath-in-flow/web test -- tests/services/sensorFusion.test.ts`

Expected: FAIL because the service keeps only one sample per source and does not model offset.

- [ ] **Step 3: Implement bounded offset-aware queues**

```ts
interface QueuedSample { sample: IBISample; receivedAt: number }
const MAX_QUEUE_SIZE = 16;
const MATCH_TOLERANCE_MS = 100;

private ppgQueue: QueuedSample[] = [];
private scgQueue: QueuedSample[] = [];
private estimatedOffsetMs: number | null = null;
```

Match on interval agreement and corrected event time, update offset only from high-quality matches, emit each sample once, and flush unmatched genuine detections after the bounded wait.

- [ ] **Step 4: Run fusion tests**

Run: `pnpm --filter @breath-in-flow/web test -- tests/services/sensorFusion.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit fusion integrity**

```bash
git add packages/web/src/services/sensorFusion.ts packages/web/tests/services/sensorFusion.test.ts
git commit -m "fix: make dual sensor fusion ordered and duplicate free"
```

### Task 7: Harden Measurement Lifecycle and Protocol Metrics

**Files:**

- Modify: `packages/web/src/services/permissionService.ts`
- Modify: `packages/web/tests/services/permissionService.test.ts`
- Create: `packages/web/src/services/measurementSession.ts`
- Create: `packages/web/tests/services/measurementSession.test.ts`
- Modify: `packages/web/src/components/LabTab.vue`
- Modify: `packages/web/tests/components/LabTab.test.ts`
- Modify: `packages/web/src/components/ResonanceAssessment.vue`
- Modify: `packages/web/tests/components/ResonanceAssessment.test.ts`
- Modify: `packages/web/src/composables/useHrvStorage.ts`
- Modify: `packages/shared/src/schemas.ts`

**Interfaces:**

- Consumes: sensor start results, fusion output, `evaluateMeasurementEligibility`.
- Produces: explicit preflight/session states, no-data timeout, protocol-limited analysis/persistence.

- [ ] **Step 1: Write failing measurement-session tests**

Cover startup failure preventing timer start, five seconds without genuine IBI causing `no-data`, dual partial startup offering camera fallback, clean stop idempotency, and eligibility determining metric groups.

- [ ] **Step 2: Verify measurement tests fail**

Run: `pnpm --filter @breath-in-flow/web test -- tests/services/measurementSession.test.ts tests/components/LabTab.test.ts tests/components/ResonanceAssessment.test.ts`

Expected: FAIL because current Lab starts its timer despite sensor failure and analyzes ten samples without protocol gates.

- [ ] **Step 3: Implement the session orchestrator**

```ts
export type MeasurementState =
  | 'idle'
  | 'requesting-permission'
  | 'starting'
  | 'acquiring'
  | 'ready'
  | 'measuring'
  | 'no-data'
  | 'failed'
  | 'complete';

export interface MeasurementSessionResult {
  state: MeasurementState;
  samples: IBISample[];
  estimates: HeartRateEstimate[];
  eligibility?: MeasurementEligibility;
}
```

The orchestrator owns timeout/timer cleanup and appends only detected/fused IBIs. Estimates can update provisional BPM but never the sample array.

- [ ] **Step 4: Make permissions contextual**

`listCameras()` uses `enumerateDevices()` without opening a stream. `confirmStart()` requests permissions once. Remove the duplicate permission call from freeform. Lab defaults to camera, labels SCG/Both Beta, and starts elapsed time only after an explicit successful sensor start.

- [ ] **Step 5: Enforce protocol output rules**

Quick and Morning results omit frequency cards. Full analysis requires 300 seconds for frequency output. Resonance trials use only resonance-training metrics and do not show general VLF/LF-HF/total-power interpretation.

- [ ] **Step 6: Persist provenance, eligibility, warnings, and `algorithmVersion: 2`**

Keep new fields optional/defaulted in schemas so prior IndexedDB values parse. Do not rewrite old measurements.

- [ ] **Step 7: Run lifecycle, Lab, resonance, and storage tests**

Run: `pnpm --filter @breath-in-flow/web test -- tests/services/permissionService.test.ts tests/services/measurementSession.test.ts tests/components/LabTab.test.ts tests/components/ResonanceAssessment.test.ts tests/composables/useHrvStorage.test.ts && pnpm --filter @breath-in-flow/shared test -- tests/schemas.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit measurement lifecycle**

```bash
git add packages/web/src/services/permissionService.ts packages/web/tests/services/permissionService.test.ts packages/web/src/services/measurementSession.ts packages/web/tests/services/measurementSession.test.ts packages/web/src/components/LabTab.vue packages/web/tests/components/LabTab.test.ts packages/web/src/components/ResonanceAssessment.vue packages/web/tests/components/ResonanceAssessment.test.ts packages/web/src/composables/useHrvStorage.ts packages/shared/src/schemas.ts
git commit -m "fix: gate pulse variability measurements by quality"
```

### Task 8: Make Frequency Results Explicitly Available or Unavailable

**Files:**

- Modify: `packages/shared/src/hrv/types.ts`
- Modify: `packages/shared/src/hrv/frequencyDomain.ts`
- Modify: `packages/shared/src/hrv/index.ts`
- Modify: `packages/shared/tests/hrv/frequencyDomain.test.ts`
- Modify: `packages/web/src/components/hrv/HrvMetricsDashboard.vue`
- Modify: `packages/web/tests/components/hrv/HrvMetricsDashboard.test.ts`
- Modify: `packages/web/src/components/hrv/FrequencySpectrum.vue`
- Modify: `packages/web/tests/components/hrv/FrequencySpectrum.test.ts`

**Interfaces:**

- Produces: `FrequencyDomainMetrics.available`, nullable peak/power fields when unavailable, and plain-language UI states.

- [ ] **Step 1: Write failing invalid-spectrum and protocol tests**

Assert non-monotonic, short, or constant input returns `{ available: false, reason }` with no default 0.1/0.25 peaks; valid analytic fixtures recover their known dominant frequency within tolerance.

- [ ] **Step 2: Verify frequency tests fail**

Run: `pnpm --filter @breath-in-flow/shared test -- tests/hrv/frequencyDomain.test.ts`

Expected: FAIL because unavailable spectra currently resemble numeric results.

- [ ] **Step 3: Implement explicit availability**

```ts
export interface FrequencyDomainMetrics {
  available: boolean;
  unavailableReason?: 'insufficient-duration' | 'invalid-series' | 'no-spectrum';
  lfPeak: number | null;
  hfPeak: number | null;
  // power fields are number | null
  spectrum: SpectralPoint[];
}
```

Do not label unvalidated absolute scaling as ms². Until the trusted-reference fixture passes, display relative/normalized spectral values only.

- [ ] **Step 4: Update dashboard and spectrum unavailable states**

Render “Not available for this recording” and the structured reason; never coerce null to zero.

- [ ] **Step 5: Run shared and component tests**

Run: `pnpm --filter @breath-in-flow/shared test -- tests/hrv && pnpm --filter @breath-in-flow/web test -- tests/components/hrv/HrvMetricsDashboard.test.ts tests/components/hrv/FrequencySpectrum.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit analysis semantics**

```bash
git add packages/shared/src/hrv packages/shared/tests/hrv packages/web/src/components/hrv/HrvMetricsDashboard.vue packages/web/tests/components/hrv/HrvMetricsDashboard.test.ts packages/web/src/components/hrv/FrequencySpectrum.vue packages/web/tests/components/hrv/FrequencySpectrum.test.ts
git commit -m "fix: make unsupported variability metrics unavailable"
```

### Task 9: Fix Breathing Lifecycle and Full-Screen Accessibility

**Files:**

- Modify: `packages/web/src/composables/useBreathingTimer.ts`
- Modify: `packages/web/tests/composables/useBreathingTimer.test.ts`
- Modify: `packages/web/src/components/BreathingPractice.vue`
- Modify: `packages/web/tests/components/BreathingPracticeFlows.test.ts`
- Modify: `packages/web/src/App.vue`
- Modify: `packages/web/tests/components/App.test.ts`
- Modify: `packages/web/src/style.css`

**Interfaces:**

- Produces: correctly timed extended-hold callbacks, idempotent session cleanup, modal dialog semantics, inert background, reduced motion.

- [ ] **Step 1: Write failing callback and lifecycle tests**

Assert `onExtendedHoldStart` fires once only after a required recovery breath; route/unmount/background cleanup cancels or completes in-progress state once; and opening a full-screen practice sets the app shell inert/aria-hidden while focus enters the dialog.

- [ ] **Step 2: Verify tests fail**

Run: `pnpm --filter @breath-in-flow/web test -- tests/composables/useBreathingTimer.test.ts tests/components/BreathingPracticeFlows.test.ts tests/components/App.test.ts`

Expected: FAIL on the early duplicate callback and missing accessibility isolation.

- [ ] **Step 3: Move extended-hold callback to the actual hold phase**

Call `onExtendedHoldStart` immediately before `setPhase('EXTENDED_*_HOLD', ...)`, not before recovery inhale/exhale.

- [ ] **Step 4: Add dialog/focus/background lifecycle handling**

Use `role="dialog"`, `aria-modal="true"`, explicit accessible labels, initial focus, focus restoration, and app-shell `inert` while active. Add `prefers-reduced-motion` overrides for nonessential transforms/glow/transitions.

- [ ] **Step 5: Run lifecycle and accessibility tests**

Run: `pnpm --filter @breath-in-flow/web test -- tests/composables/useBreathingTimer.test.ts tests/components/BreathingPracticeFlows.test.ts tests/components/App.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit breathing lifecycle fixes**

```bash
git add packages/web/src/composables/useBreathingTimer.ts packages/web/tests/composables/useBreathingTimer.test.ts packages/web/src/components/BreathingPractice.vue packages/web/tests/components/BreathingPracticeFlows.test.ts packages/web/src/App.vue packages/web/tests/components/App.test.ts packages/web/src/style.css
git commit -m "fix: harden breathing session lifecycle"
```

### Task 10: Update Dependencies and Synchronize Native Projects

**Files:**

- Modify: `package.json`
- Modify: `packages/database/package.json`
- Modify: `packages/shared/package.json`
- Modify: `packages/web/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/web/android/**` generated by Capacitor sync except app-owned sources
- Modify: `packages/web/ios/**` generated by Capacitor sync except app-owned sources
- Modify: `packages/web/android/app/src/main/java/com/breathinflow/app/MainActivity.java`

**Interfaces:**

- Produces: aligned safe dependency graph and native projects containing Motion, KeepAwake, TTS, and Torch.

- [ ] **Step 1: Record current upgrade/audit evidence**

Run: `pnpm outdated -r && pnpm audit`

Expected: patch/minor updates are listed; known Hono/esbuild advisories are reproduced before remediation.

- [ ] **Step 2: Apply safe same-major updates**

Update Capacitor packages together, Vue/Vite/Vitest/Tailwind/tooling patch-minors, and safe transitive overrides needed to remove available-fix advisories. Keep TypeScript 6 and Electron 42 unless their major upgrade matrices and builds pass independently.

- [ ] **Step 3: Install and verify dependency graph**

Run: `pnpm install && pnpm outdated -r && pnpm audit`

Expected: install succeeds, no compatible safe patch/minor remains unapplied without documentation, and no advisory with an available compatible fix remains.

- [ ] **Step 4: Remove Android launch-time permission request**

Reduce `MainActivity` to an empty `BridgeActivity` subclass; camera permission is requested through the in-context web/native flow only.

- [ ] **Step 5: Synchronize Capacitor platforms**

Run: `pnpm --filter @breath-in-flow/web exec cap sync android && pnpm --filter @breath-in-flow/web exec cap sync ios && pnpm --filter @breath-in-flow/web exec cap ls`

Expected: both platforms list Motion, KeepAwake, TTS, and Torch, and generated package paths reference the installed Capacitor versions.

- [ ] **Step 6: Run dependency-sensitive verification**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build`

Expected: PASS.

- [ ] **Step 7: Commit dependencies and native sync**

```bash
git add package.json packages/database/package.json packages/shared/package.json packages/web/package.json pnpm-lock.yaml pnpm-workspace.yaml packages/web/android packages/web/ios
git commit -m "chore: update dependencies and sync mobile plugins"
```

### Task 11: Polish Mobile Lab and Preset UX

**Files:**

- Modify: `packages/web/src/components/LabTab.vue`
- Modify: `packages/web/src/components/PracticePresets.vue`
- Modify: `packages/web/src/components/ResonanceAssessment.vue`
- Modify: `packages/web/src/components/HelpSystem.vue`
- Modify: `packages/web/src/style.css`
- Modify: existing corresponding component tests.

**Interfaces:**

- Produces: camera-first sensor selection, wrapped protocol descriptions, labeled duration controls, actionable no-data states, safe areas, development-only debug controls.

- [ ] **Step 1: Add failing UX assertions to existing component tests**

Assert camera is selected/recommended; SCG/dual show Beta; the duration input has an accessible name/current value/minimum; protocol descriptions are not line-clamped to one line; no-data offers Retry/Change sensor/Cancel; debug controls are absent when `import.meta.env.PROD`; and primary actions include bottom safe-area padding.

- [ ] **Step 2: Verify focused component tests fail**

Run: `pnpm --filter @breath-in-flow/web test -- tests/components/LabTab.test.ts tests/components/PracticePresets.test.ts tests/components/ResonanceAssessment.test.ts tests/components/HelpSystem.test.ts`

Expected: FAIL on current labels, truncation, debug visibility, or recovery controls.

- [ ] **Step 3: Implement the mobile UX states**

Use plain-language statuses: “Waiting for a pulse”, “Signal is weak”, “Reposition your finger/phone”, and “Too much movement”. Keep debug output behind `import.meta.env.DEV`. Apply `env(safe-area-inset-*)`, 44 px minimum targets, and stable containers for sensor transitions.

- [ ] **Step 4: Reconcile help copy with wellness positioning**

Describe camera output as pulse variability, make SCG experimental, explain metric availability by duration, and include the diaphragm preset’s equipment and safety boundaries.

- [ ] **Step 5: Run UX tests and production build**

Run: `pnpm --filter @breath-in-flow/web test -- tests/components && pnpm --filter @breath-in-flow/web build`

Expected: PASS and production build succeeds.

- [ ] **Step 6: Commit UX polish**

```bash
git add packages/web/src/components packages/web/tests/components packages/web/src/style.css
git commit -m "feat: improve mobile wellness guidance and recovery"
```

### Task 12: Coverage and Release Gates

**Files:**

- Modify: `packages/shared/vitest.config.ts`
- Modify: `packages/web/vite.config.ts`
- Modify: `packages/database/vitest.config.ts`
- Modify: existing focused tests required to meet gates.
- Modify: `README.md` and HRV documentation found by `rg -l "HRV|PPG|SCG|Lomb|LF/HF" README.md docs packages`.

**Interfaces:**

- Produces: enforced coverage floors and current algorithm/product documentation.

- [ ] **Step 1: Add explicit coverage thresholds**

```ts
thresholds: {
  statements: 80,
  lines: 80,
  branches: 70,
  functions: 75,
}
```

Keep stricter existing shared floors, and use per-file thresholds/coverage inspection for Lab, Resonance, sensors, fusion, permission, and eligibility.

- [ ] **Step 2: Run coverage and add focused missing-path tests first**

Run: `pnpm test:coverage`

Expected: any remaining uncovered failure path is reported. Add a failing assertion for that behavior before modifying production code; repeat until global and critical-file gates pass.

- [ ] **Step 3: Format and run the complete web/shared/database gate**

Run: `pnpm format && pnpm format:check && pnpm test && pnpm test:coverage && pnpm typecheck && pnpm lint && pnpm build`

Expected: every command exits 0 with no test failures.

- [ ] **Step 4: Run desktop and native builds**

Run: `pnpm --filter @breath-in-flow/web build:electron`

Run from `packages/web/android`: `JAVA_HOME='/Applications/Android Studio.app/Contents/jbr/Contents/Home' ./gradlew assembleDebug`

Run: `xcodebuild -workspace packages/web/ios/App/App.xcworkspace -scheme App -sdk iphonesimulator -configuration Debug CODE_SIGNING_ALLOWED=NO build`

Expected: Electron build, Android debug APK, and iOS simulator build succeed. Environmental failures are recorded separately and are not converted into product changes.

- [ ] **Step 5: Perform mobile interaction checks**

At 390×844 verify Practice, active session, timed rest, diaphragm guidance, Lab prep/start failure/no-data/results, History, Presets, and Analytics. Confirm keyboard focus, background isolation, safe-area reachability, and reduced-motion behavior.

- [ ] **Step 6: Review final diff and audit spec coverage**

Run: `git diff --check && git status --short && git log --oneline --decorate -12`

Expected: no whitespace errors, only intentional remaining files, and coherent commits corresponding to the plan.

- [ ] **Step 7: Commit release gates and documentation**

```bash
git add packages/shared/vitest.config.ts packages/web/vite.config.ts packages/database/vitest.config.ts README.md docs packages/shared/tests packages/web/tests
git commit -m "test: enforce wellness release quality gates"
```
