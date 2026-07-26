# Family Beta Hardening Implementation Plan

**Goal:** Fix confirmed findings 1–10 and produce a verified debug-signed Android
APK for private sideload testing.

**Architecture:** Keep portable measurement rules in `packages/shared`, native
orchestration and persistence in `packages/web`, and release assembly in the
root scripts. Each behavior change starts with a failing regression test and is
committed after its focused and adjacent suites pass.

**Tech stack:** Vue 3, TypeScript, Vitest, Capacitor 8, Gradle, pnpm workspaces.

---

## Task 1: Make builds deterministic and version-consistent

**Files:**

- Modify: `package.json`
- Modify: `scripts/build.sh`
- Modify: `scripts/tests/build-script.test.sh`
- Modify: `packages/shared/src/config.ts`
- Modify: `packages/web/capacitor.config.ts`
- Modify: `packages/web/android/app/build.gradle`
- Test: existing build-script and shared tests

Add failing checks for shared-before-web ordering, synchronized Android assets,
and package-derived version metadata. Change root/mobile build entry points to
build shared then web, remove configurations for uninstalled Capacitor plugins,
and pass package version/code into Gradle. Run build-script tests, shared tests,
typecheck, and a web build. Commit the validated release-build batch.

## Task 2: Make mobile navigation and dialogs reliable

**Files:**

- Modify: `packages/web/src/App.vue`
- Modify: `packages/web/src/components/BreathingPractice.vue`
- Modify: `packages/web/src/components/FeelingCheckIn.vue`
- Modify: `packages/web/src/components/GoalOnboarding.vue`
- Modify: adjacent component tests

Add tests for Android Back routing and scroll/safe-area layout contracts. Add a
single native Back listener at app scope, expose explicit practice-close
behavior, apply safe areas to the session overlay, and make modal cards
viewport-constrained with scrollable overlays. Run focused App/practice/modal
tests and web typecheck. Commit the mobile UX batch.

## Task 3: Make persistence failures truthful and recover stale sessions

**Files:**

- Modify: `packages/web/src/composables/useStorage.ts`
- Modify: `packages/web/src/components/BreathingPractice.vue`
- Modify: `packages/web/tests/composables/useStorage.test.ts`
- Modify: practice flow/component tests

Add failure-path tests showing mutations rollback in-memory changes and throw
when durable writes fail. Implement a snapshot/mutate/persist/rollback helper.
Reconcile stale in-progress sessions during initialization. Preserve check-in
input and show a retryable save error. Run storage and practice flow tests.
Commit the persistence batch.

## Task 4: Normalize recommended and unlimited completion behavior

**Files:**

- Modify: `packages/web/src/data/guidedPresets.ts`
- Modify: `packages/web/src/components/BreathingPractice.vue` only if required
- Modify: preset and practice-flow tests

First assert that coherent breathing has a finite beginner target and that a
manual unlimited finish reaches the same completion/check-in state as automatic
completion. Set the recommended preset to one set and repair any remaining
manual path discrepancy. Run timer, preset, and practice flow tests. Commit the
session-flow batch.

## Task 5: Add temporal-coverage HRV eligibility

**Files:**

- Modify: `packages/shared/src/hrv/types.ts`
- Modify: `packages/shared/src/hrv/eligibility.ts`
- Modify: `packages/shared/src/hrv/finalizeMeasurement.ts`
- Modify: `packages/shared/tests/hrv/eligibility.test.ts`
- Modify: storage validation/types and their tests

Add failing tests for below-85% coverage, 85–94% warning coverage, gaps above
five seconds, and persisted fields. Derive coverage and maximum gap on the
monotonic sample clock, add reason/warning contracts, and keep legacy records
loadable through explicit normalization. Run shared and HRV storage tests.
Commit the eligibility batch.

## Task 6: Prevent low-quality HRV trend claims and surface quality

**Files:**

- Modify: `packages/web/src/utils/measurementTrends.ts`
- Modify: `packages/web/src/components/LabTab.vue`
- Modify: HRV trend, Lab, and analysis validation tests

Add tests that elevated-artifact measurements remain viewable but are excluded
from comparisons. Render eligibility reasons/warnings, coverage, largest gap,
artifact percentage, and mean signal quality near results. Add nearby
phone-derived/non-medical wording. Run focused tests and web typecheck. Commit
the quality-communication batch.

## Task 7: Correct spectral boundary and resonance amplitude

**Files:**

- Modify: `packages/shared/src/hrv/frequencyDomain.ts`
- Modify: `packages/shared/src/hrv/resonanceMetrics.ts`
- Modify: frequency and resonance tests

Expose/test band integration so 0.15 Hz belongs to HF only. Replace
inhale/exhale-anchored amplitude with per-cycle maximum minus minimum and prove
phase-shift stability. Run the full shared HRV suite. Commit the analysis batch.

## Task 8: Record actual source provenance and sensor errors

**Files:**

- Modify: `packages/web/src/services/measurementSession.ts`
- Modify: `packages/web/src/components/LabTab.vue`
- Modify: measurement-session tests

Track sources observed on accepted peak-detected samples rather than sensors
that merely started. Carry unresolved session errors into eligibility. Add
tests for degraded dual-sensor sessions in which only one source contributes.
Commit the provenance batch.

## Task 9: Improve wellness terminology and display precision

**Files:**

- Modify: `packages/web/src/components/LabTab.vue`
- Modify: `packages/web/src/components/HrvTrends.vue`
- Modify: `packages/web/src/components/hrv/HrvMetricsDashboard.vue`
- Modify: associated component tests

Replace clinical/absolute labels with `average pulse rate` and `estimated
breathing response`, remove `optimal` wording, and round values to measurement-
appropriate precision. Run associated component tests and snapshots/assertions.
Commit the presentation batch.

## Task 10: Add real-browser flow and visual regression coverage

**Files:**

- Modify: `packages/web/package.json`
- Modify: `pnpm-lock.yaml`
- Add: `packages/web/playwright.config.ts`
- Add: `packages/web/tests/e2e/family-beta-flow.spec.ts`
- Add: reviewed screenshot baselines only when stable and useful

Install Playwright as a development dependency and add a phone-sized Chromium
flow covering onboarding, recommended-session launch, before check-in, a
shortened practice, after check-in, completion, and Back to Practice. Add a
landscape/enlarged-text dialog reachability test. Capture screenshots at
onboarding, active practice, post-session check-in, and completion; inspect them
at actual size and adjust layout/contrast/action hierarchy when defects are
visible. Keep deterministic structural and interaction assertions separate from
selective screenshot comparisons to avoid brittle animation failures.

## Task 11: Verify, assess readiness, and assemble the sideload artifact

Run:

1. `pnpm test`
2. `pnpm test:coverage`
3. `pnpm typecheck`
4. `pnpm lint`
5. `pnpm format:check`
6. `pnpm build`
7. `pnpm build:android`

Inspect the APK with Android build tools, compute SHA-256, compare embedded asset
names to the current web manifest, and install/launch it if an authorized device
is connected. Perform a short readiness pass over the completed findings, test
evidence, package metadata, offline behavior, backup/upgrade expectations, and
open physical-device rows. Update the device-validation document with only
observed results, commit final documentation if changed, and report remaining
physical-only gates.
