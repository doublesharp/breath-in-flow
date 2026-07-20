# Pulse Variability Feature Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete camera, chest-motion, and combined Pulse Variability sensing as reliable first-class mobile functionality, finish its storage and insight flows, and enforce the result with comprehensive tests and release gates.

**Architecture:** The shared package owns pure interval finalization, eligibility, and metric-availability contracts. Web sensor services own acquisition and fusion, while a lifecycle composable coordinates interruptions without embedding platform logic in large Vue components. IndexedDB is authoritative for Pulse Variability data; Vue components render typed availability instead of reimplementing scientific rules.

**Tech Stack:** Vue 3, TypeScript, Vite, Vitest, Zod, IndexedDB, Capacitor, Android Gradle, iOS/Xcode.

## Global Constraints

- The feature is named **Pulse Variability** in navigation and primary user-facing copy.
- Camera PPG output is pulse-rate variability (PRV), not ECG-derived HRV or a medical measurement.
- Camera, chest-motion, and combined sensing are supported choices without Beta labels.
- Only directly detected, provenance-bearing beats may enter analysis or persistence.
- Unavailable metrics are represented as unavailable or null, never as a plausible numeric zero.
- General LF/HF frequency-domain reporting requires a five-minute eligible analyzed segment.
- Short resonance trials may expose only trial-specific breathing-response metrics.
- IndexedDB is authoritative for Pulse Variability measurements and assessments.
- Backgrounding releases active sensors and cannot leave an orphaned breathing or measurement session.
- New high-risk pure modules and changed analysis contracts require 100% line and function coverage.
- Existing valid local data remains loadable; invalid records are skipped individually with bounded logging.
- No diagnostic interpretation, treatment recommendation, or generic population HRV target may be added.

---

## File Map

- `packages/shared/src/hrv/types.ts`: discriminated metric availability types.
- `packages/shared/src/hrv/eligibility.ts`: protocol and metric-group eligibility rules.
- `packages/shared/src/hrv/finalizeMeasurement.ts`: pure trim, duration, and eligibility boundary.
- `packages/shared/src/hrv/index.ts`: compute only eligible analysis groups.
- `packages/web/src/services/measurementSession.ts`: acquisition watchdog, interruption, and source snapshots.
- `packages/web/src/services/sensorFusion.ts`: offset-aware matching and exactly-once emission.
- `packages/web/src/services/scgService.ts`: adaptive motion rejection.
- `packages/web/src/composables/useAppLifecycle.ts`: foreground/background listener coordination.
- `packages/web/src/composables/useHrvStorage.ts`: validated IndexedDB records and idempotent assessment migration.
- `packages/web/src/composables/useStorage.ts`: defensive validation of legacy localStorage arrays.
- `packages/web/src/components/LabTab.vue`: finalized measurement orchestration and integrated history insights.
- `packages/web/src/components/ResonanceAssessment.vue`: permission preflight, exact trial duration, and IndexedDB save path.
- `packages/web/src/components/HrvTrends.vue` and `LabInsights.vue`: comparable-history logic and conservative copy.
- `packages/web/src/components/hrv/HrvMetricsDashboard.vue`: availability-aware metric rendering.
- `packages/web/src/composables/useModalIsolation.ts`: dialog focus/inert behavior.
- `packages/web/src/style.css` and `App.vue`: reduced motion, offline fonts, and Pulse Variability naming.
- `scripts/build.sh`: authoritative version and artifact validation.

---

### Task 1: Finalized Analysis Window and Metric Availability

**Files:**

- Create: `packages/shared/src/hrv/finalizeMeasurement.ts`
- Create: `packages/shared/tests/hrv/finalizeMeasurement.test.ts`
- Modify: `packages/shared/src/hrv/types.ts`
- Modify: `packages/shared/src/hrv/index.ts`
- Modify: `packages/shared/src/hrv/frequencyDomain.ts`
- Modify: `packages/shared/src/hrv/eligibility.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/hrv/eligibility.test.ts`
- Modify: `packages/shared/tests/hrv/frequencyDomain.test.ts`
- Modify: `packages/web/src/services/measurementSession.ts`
- Modify: `packages/web/tests/services/measurementSession.test.ts`
- Modify: `packages/web/src/components/hrv/HrvMetricsDashboard.vue`
- Modify: `packages/web/tests/components/hrv/HrvMetricsDashboard.test.ts`

**Interfaces:**

- Produces: `finalizeMeasurement(samples, protocol, options): FinalizedMeasurement`.
- Produces: discriminated `MetricAvailability<T, Reason>` objects for frequency, Poincare, and resonance groups.
- Produces: `MeasurementSession.stop(finalSamples?)` eligibility based on the exact returned analysis samples.

- [ ] **Step 1: Add failing finalization boundary tests**

  Add tests that construct monotonic detected PPG samples spanning 308 seconds and assert that `settlingSeconds: 5` plus `endingSeconds: 3` returns a 300-second eligible window. Add a 300-second capture case that trims to 292 seconds and is ineligible for `frequency-domain`.

- [ ] **Step 2: Run the new tests and verify RED**

  Run: `pnpm --filter @breath-in-flow/shared test -- finalizeMeasurement eligibility`

  Expected: FAIL because `finalizeMeasurement` does not exist and eligibility is currently evaluated before trimming.

- [ ] **Step 3: Implement the pure finalization boundary**

  Define:

  ```ts
  export interface FinalizeMeasurementOptions {
    settlingSeconds?: number;
    endingSeconds?: number;
  }

  export interface FinalizedMeasurement {
    samples: IBISample[];
    analyzedDurationSeconds: number;
    eligibility: MeasurementEligibility;
  }

  export function finalizeMeasurement(
    samples: IBISample[],
    protocol: MeasurementProtocol,
    options: FinalizeMeasurementOptions = {}
  ): FinalizedMeasurement;
  ```

  Filter by monotonic sample timestamps using inclusive trim boundaries, compute duration from the retained first and last timestamps, and evaluate eligibility only on the retained series.

- [ ] **Step 4: Add failing availability-contract tests**

  Assert that unavailable frequency results contain `{ available: false, reason }` and no power fields; eligible five-minute results contain `{ available: true, value }`; no-breathing-rate analysis makes resonance unavailable instead of returning a zero-filled object; and short trials retain time-domain and resonance-training availability without general frequency-domain availability.

- [ ] **Step 5: Implement discriminated availability**

  Introduce:

  ```ts
  export type MetricAvailability<T, Reason extends string> =
    { available: true; value: T } | { available: false; reason: Reason };
  ```

  Make `frequencyDomain`, `poincare`, and `resonance` use this contract. Keep raw absolute spectral values internal; expose normalized LF/HF percentages, ratio, peaks, and normalized spectrum to the user contract. Update the dashboard to render values only from available branches and a reason-specific message otherwise.

- [ ] **Step 6: Update session orchestration**

  Snapshot active sources before stopping adapters, refresh the no-data watchdog on every accepted detected beat, and accept finalized samples at stop so the result and eligibility share one series.

- [ ] **Step 7: Verify and commit**

  Run:

  ```bash
  pnpm --filter @breath-in-flow/shared test
  pnpm --filter @breath-in-flow/web test -- measurementSession HrvMetricsDashboard LabTab ResonanceAssessment
  ```

  Expected: all selected tests pass and unavailable metric values cannot be accessed without narrowing.

  Commit: `feat: enforce pulse variability analysis eligibility`

---

### Task 2: Sensor Reliability and Offset-Aware Fusion

**Files:**

- Create: `packages/web/src/services/adaptiveMotionGate.ts`
- Create: `packages/web/tests/services/adaptiveMotionGate.test.ts`
- Modify: `packages/web/src/services/scgService.ts`
- Modify: `packages/web/tests/services/scgService.test.ts`
- Modify: `packages/web/src/services/sensorFusion.ts`
- Modify: `packages/web/tests/services/sensorFusion.test.ts`

**Interfaces:**

- Produces: `AdaptiveMotionGate.addSample(magnitude, timestamp): MotionDecision`.
- Produces: `SensorFusionService` offset-aware pairing with a testable exported factory `createSensorFusionService()`.

- [ ] **Step 1: Add failing adaptive motion tests**

  Cover baseline learning, a large transient rejection, return to acceptance, zero-variance startup, bounded history, and device-scale invariance using proportionally scaled fixtures.

- [ ] **Step 2: Verify RED**

  Run: `pnpm --filter @breath-in-flow/web test -- adaptiveMotionGate scgService`

  Expected: FAIL because no adaptive gate is connected.

- [ ] **Step 3: Implement and integrate the motion gate**

  Use a bounded rolling median and median absolute deviation with a minimum warm-up count and noise floor. Return `{ accepted, score, baseline, threshold }`; reject non-finite values and transient movement before SCG peak emission. Reset the gate between sessions.

- [ ] **Step 4: Add failing fusion tests**

  Cover stable offsets of `+140ms` and `-120ms`, gradual bounded drift, one fused emission per beat, disagreement fallback, timeout flushing, reset, and arrival order reversal. Use fake timers to prove that matched events are never emitted again.

- [ ] **Step 5: Implement offset-aware exactly-once fusion**

  Maintain recent signed offset candidates, use their median after three plausible matches, pair against `ppg.timestamp - scg.timestamp - estimatedOffset`, and remove both inputs atomically. Flush only samples older than the pairing horizon; retain newer candidates for a late counterpart. Export a factory for isolated tests while preserving the singleton export.

- [ ] **Step 6: Verify and commit**

  Run: `pnpm --filter @breath-in-flow/web test -- adaptiveMotionGate scgService sensorFusion measurementSession`

  Expected: all tests pass with fake timers exhausted and no duplicate emissions.

  Commit: `fix: harden mobile pulse sensor fusion`

---

### Task 3: Mobile Lifecycle, Permission, and Interruption Safety

**Files:**

- Modify: `packages/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/web/src/composables/useAppLifecycle.ts`
- Create: `packages/web/tests/composables/useAppLifecycle.test.ts`
- Modify: `packages/web/src/components/BreathingPractice.vue`
- Modify: `packages/web/tests/components/BreathingPractice.test.ts`
- Modify: `packages/web/src/components/LabTab.vue`
- Modify: `packages/web/tests/components/LabTab.test.ts`
- Modify: `packages/web/src/components/ResonanceAssessment.vue`
- Modify: `packages/web/tests/components/ResonanceAssessment.test.ts`

**Interfaces:**

- Produces: `useAppLifecycle({ onInactive, onActive })` with an async `dispose()`.
- Consumes: `MeasurementSession.interrupt(reason)` returning a non-success terminal result.

- [ ] **Step 1: Add the matching Capacitor App dependency**

  Add `@capacitor/app` at the same compatible major and exact policy used by the installed Capacitor packages. Run `pnpm install` and keep only the intentional manifest and lockfile change.

- [ ] **Step 2: Add failing lifecycle tests**

  Mock Capacitor `App.addListener('appStateChange', ...)` and `document.visibilitychange`. Assert one inactive callback per transition, foreground callback on restoration, listener removal, and no callback after disposal.

- [ ] **Step 3: Implement the lifecycle composable**

  Coalesce native and document events into a single active-state transition, register listeners once on mount, remove both native and DOM listeners on unmount, and handle rejected native listener registration with the document fallback.

- [ ] **Step 4: Add failing integration tests**

  Assert backgrounding pauses an active breathing timer and preserves an explicit resumable session; Lab and Resonance release active sensors, do not save partial results, and present an interruption restart state; motion permission is requested during the Resonance Start gesture before warm-up.

- [ ] **Step 5: Integrate lifecycle and permission preflight**

  Route all sensor teardown through idempotent stop methods. Resolve breathing sessions as paused rather than complete. Make assessment permission failure return to setup with the existing actionable permission message.

- [ ] **Step 6: Verify, sync, and commit**

  Run:

  ```bash
  pnpm --filter @breath-in-flow/web test -- useAppLifecycle BreathingPractice LabTab ResonanceAssessment permissionService
  pnpm run build
  pnpm --filter @breath-in-flow/web exec cap sync
  ```

  Expected: tests and build pass; Capacitor sync reports iOS and Android updated.

  Commit: `fix: resolve mobile lifecycle interruptions`

---

### Task 4: Authoritative Storage and Defensive Migration

**Files:**

- Modify: `packages/shared/src/schemas.ts`
- Modify: `packages/shared/tests/schemas.test.ts`
- Create: `packages/web/src/utils/storedRecordValidation.ts`
- Create: `packages/web/tests/utils/storedRecordValidation.test.ts`
- Modify: `packages/web/src/composables/useStorage.ts`
- Modify: `packages/web/tests/composables/useStorage.test.ts`
- Modify: `packages/web/src/composables/useHrvStorage.ts`
- Modify: `packages/web/tests/composables/useHrvStorage.test.ts`
- Modify: `packages/web/src/components/ResonanceAssessment.vue`

**Interfaces:**

- Produces: `validateStoredArray({ key, value, schema, normalize, logLimit }): T[]`.
- Produces: `useHrvStorage().initialize()` and `migrateLegacyAssessments()` as idempotent operations.

- [ ] **Step 1: Add failing stored-record tests**

  Cover a non-array JSON object, mixed valid and invalid entries, legacy breathing configs missing new defaults, invalid session dates, bounded warnings, and a localStorage getter that throws.

- [ ] **Step 2: Implement per-record validation**

  Parse JSON once, require an array, normalize documented legacy defaults before `safeParse`, keep valid entries in input order, and warn at most three times per storage key plus one skipped-count summary.

- [ ] **Step 3: Add failing IndexedDB migration tests**

  Seed legacy assessments, run initialization twice, and assert one IndexedDB record per ID, valid `Date` restoration, preservation of the legacy source until a successful transaction, and no duplicate on a partially pre-migrated database. Add corrupt legacy-record and failed-transaction cases.

- [ ] **Step 4: Implement authoritative initialization and migration**

  Store a migration marker only after all valid assessment puts complete. Upsert by stable assessment ID. Make every IndexedDB read validate records independently. Expose assessments through `useHrvStorage`; remove ResonanceAssessment writes through `useStorage` while leaving legacy read compatibility for migration.

- [ ] **Step 5: Verify and commit**

  Run:

  ```bash
  pnpm --filter @breath-in-flow/shared test -- schemas
  pnpm --filter @breath-in-flow/web test -- storedRecordValidation useStorage useHrvStorage ResonanceAssessment
  ```

  Expected: all tests pass; corrupt records are skipped without rejecting valid siblings.

  Commit: `fix: unify and validate wellness data storage`

---

### Task 5: Complete Resonance, Trends, and Insights

**Files:**

- Create: `packages/web/src/utils/measurementTrends.ts`
- Create: `packages/web/tests/utils/measurementTrends.test.ts`
- Modify: `packages/web/src/components/HrvTrends.vue`
- Modify: `packages/web/tests/components/HrvTrends.test.ts`
- Modify: `packages/web/src/components/LabInsights.vue`
- Modify: `packages/web/tests/components/LabInsights.test.ts`
- Modify: `packages/web/src/components/LabTab.vue`
- Modify: `packages/web/tests/components/LabTab.test.ts`
- Modify: `packages/web/src/components/ResonanceAssessment.vue`
- Modify: `packages/web/tests/components/ResonanceAssessment.test.ts`

**Interfaces:**

- Produces: `getComparableMeasurements(measurements, anchor): HrvMeasurement[]`.
- Produces: `buildWithinPersonInsights(measurements): WellnessInsight[]`.

- [ ] **Step 1: Add failing resonance duration tests**

  For every configured breathing rate, assert `Math.ceil(120 / cycleSeconds)` repetitions and an actual trial duration greater than or equal to 120 seconds. Assert short trials do not expose general frequency-domain power.

- [ ] **Step 2: Fix resonance duration and metric presentation**

  Centralize trial construction in a pure exported helper, use ceiling repetition counts, and render only resonance-training fields that are available for the trial.

- [ ] **Step 3: Add failing comparable-history tests**

  Seed more than five records across protocol types and eligibility states. Assert comparisons include the full history but only records matching type and available metric, preserve chronological order, and require at least three comparable measurements before a directional insight.

- [ ] **Step 4: Implement conservative trends and mount components**

  Remove fixed population targets, recovery claims, causation claims, and “lower is better” copy. Use neutral text such as “higher/lower than your recent comparable measurements” with collection-consistency guidance. Mount Trends and Insights in Lab, load full history, and make the first-use CTA consider both measurements and assessments.

- [ ] **Step 5: Verify and commit**

  Run: `pnpm --filter @breath-in-flow/web test -- measurementTrends HrvTrends LabInsights LabTab ResonanceAssessment`

  Expected: all tests pass and no unsupported target or recovery copy remains.

  Commit: `feat: complete pulse variability trends and resonance`

---

### Task 6: Accessible, Reduced-Motion, Offline UX

**Files:**

- Create: `packages/web/src/composables/useModalIsolation.ts`
- Create: `packages/web/tests/composables/useModalIsolation.test.ts`
- Modify: `packages/web/src/components/LabTab.vue`
- Modify: `packages/web/src/components/ResonanceAssessment.vue`
- Modify: `packages/web/tests/components/LabTab.test.ts`
- Modify: `packages/web/tests/components/ResonanceAssessment.test.ts`
- Modify: `packages/web/src/App.vue`
- Modify: `packages/web/tests/components/App.test.ts`
- Modify: `packages/web/src/style.css`
- Modify: `packages/web/src/components/HelpSystem.vue`
- Modify: `packages/web/tests/components/HelpSystem.test.ts`

**Interfaces:**

- Produces: `useModalIsolation(dialogRef, openRef, options)` for focus containment, restoration, and inert background behavior.

- [ ] **Step 1: Add failing modal isolation tests**

  Assert initial focus, Tab and Shift+Tab wrapping, focus restoration, inert/`aria-hidden` background state, Escape cancellation only where safe, and listener cleanup.

- [ ] **Step 2: Implement and integrate modal isolation**

  Add `role="dialog"`, `aria-modal="true"`, stable headings, and dialog refs to Lab and Resonance overlays. Keep destructive or data-losing Escape behavior disabled while a capture is active and expose a visible Stop action.

- [ ] **Step 3: Add failing naming and offline tests**

  Assert both desktop and mobile navigation accessible names say “Pulse Variability,” no rendered Beta badge exists for sensor modes, and the CSS contains no external `@import` URL.

- [ ] **Step 4: Implement naming, font, and reduced motion**

  Replace external fonts with a system-first stack. Add a `prefers-reduced-motion: reduce` block that removes decorative animation and nonessential transitions while leaving breathing phase text and timer updates intact. Remove Beta copy without removing sensor preparation or quality instructions.

- [ ] **Step 5: Verify and commit**

  Run: `pnpm --filter @breath-in-flow/web test -- useModalIsolation App LabTab ResonanceAssessment HelpSystem`

  Expected: all tests pass; accessibility queries locate both dialogs and no external font request remains.

  Commit: `feat: polish pulse variability accessibility`

---

### Task 7: Coverage, Build Tooling, Documentation, and Release Verification

**Files:**

- Modify: `packages/web/vitest.config.ts`
- Modify: `packages/shared/vitest.config.ts`
- Modify: tests required to satisfy raised gates without excluding production files
- Modify: `scripts/build.sh`
- Create: `scripts/tests/build-script.test.sh`
- Modify: `package.json`
- Modify: `packages/web/package.json`
- Modify: `README.md`
- Modify: `docs/HRV-FEATURE.md`
- Create: `docs/PULSE-VARIABILITY-DEVICE-VALIDATION.md`

**Interfaces:**

- Build script reads the application version from `packages/web/package.json` and exits nonzero when an expected artifact is absent.

- [ ] **Step 1: Add failing build-script checks**

  In a temporary fixture, assert version selection uses the web package, an absent Electron artifact fails rather than passing through `|| true`, and a present artifact is copied to the versioned output name.

- [ ] **Step 2: Harden build tooling and align versions**

  Use one authoritative application version, quote paths, remove success-masking copies, validate each requested platform artifact explicitly, and print only artifacts that exist.

- [ ] **Step 3: Raise coverage gates and fill branch gaps**

  Set shared HRV thresholds to at least 95% lines and 85% branches; sensor services to at least 90% lines and 80% branches; Lab and Resonance to at least 75% lines and statements; and 100% lines/functions for the new finalization, motion-gate, trend, lifecycle, validation, and modal-isolation modules. Add focused cases for uncovered behavior rather than exclusions or ignore comments.

- [ ] **Step 4: Update product and device-validation documentation**

  Document protocol capture versus analysis time, metric availability, supported sensors without Beta labels, interruption behavior, local-only storage, migration, and limitations. Add a physical-device matrix for supported iOS/Android versions, camera/flash, motion sampling, background interruption, permission denial, thermal behavior, and comparison against a trusted reference device. Mark only actually executed physical checks as complete.

- [ ] **Step 5: Run complete verification**

  Run:

  ```bash
  pnpm test
  pnpm run test:coverage
  pnpm run build
  pnpm --filter @breath-in-flow/web exec cap sync
  JAVA_HOME=/opt/homebrew/Cellar/openjdk@21/21.0.11/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug
  ```

  Run the Android command from `packages/web/android`. Run the repository's iOS build command against the installed Xcode/runtime and record an external platform-runtime blocker separately if the required simulator platform is unavailable.

- [ ] **Step 6: Final review and commit**

  Confirm `git diff --check`, review all changed copy for medical overstatement, inspect generated native diffs, and commit only intentional changes.

  Commit: `test: enforce pulse variability release readiness`

---

## Plan Self-Review

- Every acceptance criterion in `docs/superpowers/specs/2026-07-20-pulse-variability-completion-design.md` maps to Tasks 1 through 7.
- Shared interfaces are established before their web consumers.
- Sensor, storage, and accessibility tasks have non-overlapping core files and can be developed in parallel after Task 1 contracts settle.
- No task implements PDF export, patient management, third-party OAuth, diagnosis, or unsupported clinical interpretation.
- Every behavioral task begins with a failing test, includes an exact focused command, and ends with a scoped commit.
