# Task 2 Report: Preferences and Recommendation State

## Status: DONE

Commit: `0dbb436b9062d6c4a2b483d04aa513d148859043` — `feat: add private goal preferences` (plain message, no trailers).

(Note: this file previously held an unrelated older "Sensor Reliability" report; it has been replaced with the report for the goal-preferences task.)

## What was implemented

Followed strict TDD (RED → implement → GREEN).

### New files
- `packages/web/src/constants/storageKeys.ts` — centralizes the five localStorage keys. Values verified against the app's actual keys before hardcoding: `breath-in-flow-configs`, `breath-in-flow-sessions`, `breath-in-flow-sound-theme` (from `useStorage.ts`) and `herb_breathing_last_config` (from `BreathingPractice.vue`'s `LAST_CONFIG_KEY`). `PREFERENCES_STORAGE_KEY = 'breath-in-flow-preferences-v1'` per brief.
- `packages/web/src/composables/usePreferences.ts` — module-scoped singleton (matches `useStorage` pattern). Exposes `{ preferences, selectedGoal, needsOnboarding, setGoal, clearGoal, exportPreferences, replacePreferences }`. Validates every read and write with `UserPreferencesSchema`; reactive state is mutated only after successful persistence (quota/write failure logs and leaves the prior in-memory value intact); corrupt JSON, schema mismatch, and read failures all resolve to "needs onboarding". `exportPreferences` returns a detached clone; `replacePreferences` accepts `null` to clear and detaches the accepted object (zod `parse` yields a fresh object). Also exports `reloadPreferencesForTesting()` to simulate an app reload in tests.
- `packages/web/src/services/recommendationService.ts` — pure `resolveRecommendation(goal, presets = guidedPresets)` returning the `Recommendation` union. `GOAL_PRESETS` mapping per brief; Pulse Variability always returns the Lab quick-check action.
- `packages/web/tests/composables/usePreferences.test.ts` — 11 tests.
- `packages/web/tests/services/recommendationService.test.ts` — 5 tests.

### Modified files
- `packages/web/src/composables/index.ts` — added `usePreferences` export.
- `packages/web/vitest.config.ts` — added per-file 100% line/function gates for `src/services/recommendationService.ts` (pure module, required) and `src/composables/usePreferences.ts` (composable, matches the existing `useAppLifecycle`/`useModalIsolation` 100% gates). No existing gate lowered.

## Deviations
1. **`.find()` instead of `.some()`** in `resolveRecommendation`. The brief suggested `guidedPresets.some(({ id }) => id === presetId)` as the existence guard, but the practice recommendation needs the preset's display title (`preset.config.name` — `GuidedPreset` has no `title` field), and the empty-array test requires checking the injected `presets` param rather than the module default. `.find()` performs the same existence guard in a single pass and yields the object for the title. Functionally equivalent guard.
2. **Rebuilt `@breath-in-flow/shared`** (`pnpm --filter @breath-in-flow/shared build`). The web package resolves `@breath-in-flow/shared` to its `dist/`, which was stale from Task 1 and lacked `UserPreferencesSchema` (runtime `undefined`). `dist/` is gitignored, so this is a local prerequisite only and not part of the commit. Downstream builds/CI must build `shared` before `web`.
3. **Storage keys unchanged in existing modules.** `useStorage.ts` and `BreathingPractice.vue` still hardcode their key literals. Refactoring them to import from the new constants file was left out of scope to keep this commit focused on Task 2's additions; the new constants file records today's truth without renaming any stored key.

## Test / verification commands
- Focused (RED, before implementation): `pnpm --filter @breath-in-flow/web test -- usePreferences recommendationService` → FAILED for the right reason (modules did not resolve/exist).
- Focused (GREEN): `pnpm exec vitest run usePreferences recommendationService` → **2 files, 16 tests passed** (11 usePreferences + 5 recommendationService).
- Coverage (two new modules): statements 100%, **lines 100% (37/37)**, **functions 100% (13/13)**, branches 94.73% (18/19 — the single uncovered branch is the unreachable `presetId ? … : undefined` fallback in recommendationService; branches are not gated per-file).
- `pnpm --filter @breath-in-flow/web typecheck` → clean.
- `pnpm --filter @breath-in-flow/web lint` → clean (no changes to authored files).

## Notes
- Pre-existing `tests/components/ResonanceAssessment.test.ts` timeouts appeared only in a full parallel run (5s test timeouts under load); unrelated to this task's changes, which add isolated new files plus one index export and two vitest gates.
