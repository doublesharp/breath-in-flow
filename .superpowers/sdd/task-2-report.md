# Task 2 — Sensor Reliability and Offset-Aware Fusion

## Scope

Implemented only the assigned sensor-reliability files:

- `packages/web/src/services/adaptiveMotionGate.ts`
- `packages/web/src/services/scgService.ts`
- `packages/web/src/services/sensorFusion.ts`
- `packages/web/tests/services/adaptiveMotionGate.test.ts`
- `packages/web/tests/services/scgService.test.ts`
- `packages/web/tests/services/sensorFusion.test.ts`

The adaptive gate maintains a 60-sample rolling history, accepts a 12-sample
warm-up, evaluates motion using median/MAD plus a scale-relative noise floor,
does not learn rejected transients, and rejects non-finite input. SCG evaluates
that gate before filters or the peak detector and replaces it on every session
reset. Fusion learns the median signed PPG–SCG offset after three plausible
matches, consumes both inputs atomically on match, and flushes only candidates
that have waited past the 100 ms pairing horizon.

## RED evidence

Before production changes, ran:

```text
pnpm --filter @breath-in-flow/web test -- adaptiveMotionGate scgService
```

It exited 1 as expected. The new adaptive-gate test could not resolve
`@/services/adaptiveMotionGate`; the SCG regression observed all three samples
reaching the peak detector; and the fusion tests reported
`createSensorFusionService is not a function`. The same full-suite invocation
also showed one unrelated concurrent `storedRecordValidation` assertion failure.

## GREEN evidence

After implementation and formatting, ran:

```text
pnpm --filter @breath-in-flow/web test -- adaptiveMotionGate scgService sensorFusion measurementSession
```

Result: exit 0 — 35 test files passed, 566 tests passed, 1 skipped.

Also ran:

```text
pnpm --filter @breath-in-flow/web typecheck
pnpm --filter @breath-in-flow/web exec prettier --check src/services/adaptiveMotionGate.ts src/services/scgService.ts src/services/sensorFusion.ts tests/services/adaptiveMotionGate.test.ts tests/services/scgService.test.ts tests/services/sensorFusion.test.ts
pnpm --filter @breath-in-flow/web exec eslint src/services/adaptiveMotionGate.ts src/services/scgService.ts src/services/sensorFusion.ts tests/services/adaptiveMotionGate.test.ts tests/services/scgService.test.ts tests/services/sensorFusion.test.ts
git diff --check
```

All exited 0.

## Self-review

- Motion is rejected before SCG filtering and peak emission; a rejected sample
  cannot update peak/template state.
- Gate history is bounded and reset between capture sessions; rejected samples
  never alter the resting baseline.
- Fusion supports `+140 ms` and `-120 ms` offsets, bounded gradual drift,
  reversed arrival order, disagreement fallback, timeout fallback, and reset.
- Matching removes both queues before emission, while timeout tests advance fake
  timers to verify matched samples are not emitted again.
- No measurement analysis, storage, lifecycle, or UI files were changed by this task.

## Known constraint

Offset discovery is intentionally bounded to 160 ms before an estimate exists;
this covers the specified `+140 ms` and `-120 ms` fixtures while preventing a
later physiological beat from being paired as an initial offset candidate.

## Important-review follow-up

### Findings verified

- Fusion input methods previously replaced every input provenance with
  `peak-detected`, allowing missing, estimated, and wrong-source events into the
  fusion queue.
- SCG mapped every acceleration magnitude below `2` to zero. On devices that
  report acceleration in g, this erased both the 1g resting baseline and real
  movement below 2g.
- The unmatched-event timer always used 100 ms even though initial offset
  discovery permits plausible signed offsets through 160 ms.
- `AdaptiveMotionGate.reset()` existed but was not exercised by its tests.

### Follow-up RED evidence

Added regressions first, then ran:

```text
pnpm --filter @breath-in-flow/web exec vitest run tests/services/adaptiveMotionGate.test.ts tests/services/scgService.test.ts tests/services/sensorFusion.test.ts
```

Result before the fixes: exit 1 — 5 focused failures. Missing, estimated, and
wrong-source provenance were emitted as upgraded PPG fallbacks; a counterpart
arriving at 140 ms was preceded by a premature fallback; and a 1.5g movement
sample reached the SCG peak detector after a learned 1g baseline.

### Follow-up implementation and GREEN evidence

- Fusion now accepts only matching-source `peak-detected` provenance and keeps
  validated source provenance unchanged for single-source fallback.
- SCG now forwards the measured finite magnitude without a unit-specific 2g
  cutoff. The actual gate integration test learns at 1g, rejects movement at
  1.5g, and accepts the subsequent 1.005g resting sample.
- The fallback horizon is 160 ms during offset discovery and 100 ms after three
  plausible matches lock the offset estimate.
- Legacy synthetic SCG DSP fixtures model 1.5-unit cardiac spikes around a 0g
  baseline, which the production gate correctly interprets as whole-device
  motion. Those five peak-detector tests explicitly bypass only the gate; the
  new 1g integration regression exercises the real gate and service pipeline.
- The adaptive reset test proves the old baseline is forgotten and the next
  sample starts a new warm-up.

Focused test command:

```text
pnpm --filter @breath-in-flow/web exec vitest run tests/services/adaptiveMotionGate.test.ts tests/services/scgService.test.ts tests/services/sensorFusion.test.ts
```

Result: exit 0 — 3 test files passed, 54 tests passed, 1 skipped.

Targeted coverage command:

```text
pnpm --filter @breath-in-flow/web exec vitest run tests/services/adaptiveMotionGate.test.ts --coverage --coverage.include=src/services/adaptiveMotionGate.ts --coverage.reporter=text --coverage.thresholds.lines=100 --coverage.thresholds.functions=100
```

Result: exit 0 — 7 tests passed; 100% statements (30/30), branches (12/12),
functions (7/7), and lines (26/26).

Scoped formatting and lint command:

```text
pnpm --filter @breath-in-flow/web exec prettier --check src/services/adaptiveMotionGate.ts src/services/scgService.ts src/services/sensorFusion.ts tests/services/adaptiveMotionGate.test.ts tests/services/scgService.test.ts tests/services/sensorFusion.test.ts
pnpm --filter @breath-in-flow/web exec eslint src/services/adaptiveMotionGate.ts src/services/scgService.ts src/services/sensorFusion.ts tests/services/adaptiveMotionGate.test.ts tests/services/scgService.test.ts tests/services/sensorFusion.test.ts
```

Result: exit 0 — all Task 2 files use the configured format and lint cleanly.

Web typecheck command:

```text
pnpm --filter @breath-in-flow/web typecheck
```

Result: exit 2, blocked solely by concurrent Task 1 availability-contract WIP.
Errors are in `TrialComparison.vue`, `HrvTrends.vue`, `LabTab.vue`,
`ResonanceAssessment.vue`, and HRV component fixtures/tests that still access
frequency/resonance fields outside the new discriminated `value` contract. No
typecheck error references a Task 2 source or test file.

### Follow-up self-review

- Invalid provenance exits before queue mutation or timer creation.
- Matching still removes both validated samples atomically before emission.
- Discovery and locked horizons share the same value for timer scheduling and
  expiry selection, avoiding a schedule/flush boundary mismatch.
- The SCG integration regression uses the real adaptive gate; gate bypasses are
  limited to legacy tests whose purpose is the downstream DSP peak pipeline.
- Concurrent analysis, storage, lifecycle, and UI WIP remains outside this task.
