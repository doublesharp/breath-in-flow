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
