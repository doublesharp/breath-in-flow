# Correctness and test audit — October 23, 2026

Reviewed the shared library, practice flow, sensor lifecycle, audio, storage/backup, and build entry points. The checkout started at `dc36997` with six modified files implementing optional check-in preferences and a softer default sound. Those changes were preserved. Dependencies were not changed.

## Corrections

| Area                 | Defects addressed                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Practice timer       | The shared timer accumulated interval drift, mishandled fractional durations and delayed ticks, and reused the first extended hold's settings for the second. It now carries monotonic phase deadlines, performs the correct preparation breath, and records actual hold duration. The practice summary uses the same duration calculation. Invalid discrete counts and timer configurations are rejected.                    |
| Practice persistence | A skipped check-in concealed start failures. Failed set/completion writes could lose retry state. Completed sets now remain queued until saved, completion can be retried, and failed starts expose retry controls. Serialized preset dates reload correctly. Settings survive navigation before the debounce, invalid drafts preserve the saved value, and storage failures receive error feedback.                          |
| Sensor lifecycle     | Interrupting pending startup now stops acquired resources immediately. Motion startup ignores stale callbacks, removes late registrations, and shares concurrent startup. Missing motion intervals use arrival timing. Template matching waits for the candidate's complete window. PPG reacquires a stable shifted baseline without bridging the rejected region and restores default filter coefficients between sessions.  |
| Signal analysis      | Streaming prominence history is bounded; rejected batch bumps no longer suppress valid peaks. Butterworth sections use the requested order, including odd orders. LF boundaries agree throughout analysis. Synchrony accounts for irregular sampling covariance. Lomb–Scargle retains a valid single basis. Quality stays within its documented range, and invalid timestamps cannot disappear before eligibility validation. |
| Storage and backups  | Legacy assessments migrate before snapshots/replacement. Rollback compensates stores that actually changed and continues if one compensation fails. IndexedDB replacement aborts synchronous enqueue failures. Persisted records require unique IDs. Onboarding reports failed preference writes. Validation accepts every supported unavailable-result reason. Database default selection is transactional.                  |
| Audio                | The default envelope finishes before oscillator stop. Disabled sound cancels a deferred click, completion handles rejected audio resume, reverb is reused, and soft-saturation nodes connect to the output path. The intended 240 Hz default tuning is retained.                                                                                                                                                              |
| Reporting and builds | Trends compare the newest eligible reading with its own cohort. Root development/test/typecheck commands and individual desktop build scripts build the shared package before its consumers.                                                                                                                                                                                                                                  |

## Test quality and efficiency

Regressions were reproduced before production fixes. Tests that previously passed without exercising the claimed behavior were corrected: actual camera ROI extraction, asynchronous startup cleanup, streaming template rejection, filter output after reset, persisted storage failures, hold metadata, stop/next-set actions, missing Web Audio support, and desktop prerequisite ordering.

Numerical tests now check filter frequency response, exact sinusoidal synchrony and clock translation, LF/HF boundaries, rank-one periodogram behavior, and peak recovery after an outlier. The window test requires both sidelobe reduction and retained power; identity and zero-output mutations fail.

Independent review exposed three regressions during implementation and a preexisting partial-write defect:

- A smaller shoulder truncated batch peak prominence. Two linear passes now find each peak's full surrounding valleys; exact fixtures and a separate direct-search reference cover shoulders, equal peaks, and rejected bumps.
- Connecting the existing audio shaping curve exposed a DC offset. The corrected curve places silence exactly at zero and ended ticks disconnect their nodes. A Chromium `OfflineAudioContext` regression renders 500 ticks for each shaped theme, requires nonzero initial sound, and checks that output returns below 0.000001 after two seconds. The intermediate graph failed at 1.236. This verifies rendered samples without claiming physical playback quality.
- Manual completion could advance into another set when saving failed. Finishing pauses timing before persistence and retains retry state without advancement controls.
- A failed cancellation after saving partial progress could later duplicate that set. Saving completed progress replaces the partial record. Session snapshots refresh after writes and rollbacks so counts, hold details, and completion dates stay accurate. Integration tests use the actual timer and localStorage repository, including failures between separate successful writes.

Finalization also rejects non-monotonic capture timing before trimming can conceal an out-of-order or duplicate timestamp. Three additional fixtures reproduced the bypass and now preserve the rejection.

Efficiency evidence uses matched fixtures and operation counts, not a latency or battery claim:

- Two 61-sample raw/finalized quick analyses: **194,346 → 0 sine/cosine calls** by skipping unavailable spectral work.
- An ineligible 301-sample analysis: **479,493 → 0 calls**, or **480,095 → 0** with breathing context. Eligible resonance analysis still computes its spectrum.
- Sixty metronome beats: **60 → 1 persistent reverb graphs** per audio context.
- Streaming peak buffers retain only the configured adaptive window plus the confirming sample, with a minimum of three samples, instead of the full capture.

## Verification

- `pnpm test`: **1,408 tests passed across 67 files** — 341 shared, 4 database, and 1,063 web tests. The build-script prerequisite/artifact checks also passed.
- `pnpm typecheck`, `pnpm lint`, and `pnpm build`: passed, including the browser-test TypeScript configuration and production web bundle.
- Full Playwright suite: **11 passed, 3 intentional platform-specific skips**. The run used desktop Chromium and Chromium with an Android viewport; no failed tests or retries.
- Coverage thresholds remain unchanged, and all configured global and per-file gates passed:

| Package  | Statements | Branches | Functions |  Lines |
| -------- | ---------: | -------: | --------: | -----: |
| Shared   |     98.30% |   95.24% |    99.36% | 99.24% |
| Database |     97.77% |   81.81% |    96.77% | 97.50% |
| Web      |     91.68% |   85.10% |    89.72% | 93.22% |

Three visual fixtures were updated after inspection: the before/after check-in screens include the existing skip preference, and desktop configuration includes the corrected checkbox touch target. The paused-session screenshot now freezes the clock before starting, removing a wall-clock animation race. Screenshot tolerances were not loosened, and the final browser run passed without updating fixtures.

Run logs, red/green regressions, coverage reports, source hashes, and the final browser report are retained outside git at `/Volumes/Scratch/breath-in-flow/reports/review-2026-10-23`. The final full-suite source/test hashes matched the completed fixes.

## Completeness limits

Real wearable account integration remains disabled pending server-side OAuth. PDF export and patient management remain roadmap items. This audit does not implement those features.

Browser checks cover desktop Chromium and an emulated Android viewport, including actual local audio decoding and session persistence. They do not establish physical camera/motion accuracy, permission behavior on phones, thermal performance, native installer readiness, or clinical validity. No physical-device validation was performed. Subsequent native CI packaging is recorded below; the existing [physical-device checklist](PULSE-VARIABILITY-DEVICE-VALIDATION.md) remains a separate gate.

## Release closeout

The fixes were committed by implementation area. Application metadata is aligned at **0.0.4**, including Android and iOS build number **4**. The shared and database packages received patch versions **1.0.1**. The existing build-script suite now checks version consistency across these application metadata files.

Release preparation found additional build-path defects. Electron commands now select Vite's `electron` mode without Unix-only environment assignments, with a regression checking relative asset paths and native build plugins. Each desktop CI job builds shared before consuming it, and the Android job uses the existing versioned build and asset-verification command. The Intel runner now uses `macos-15-intel`, a [supported GitHub runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners). Build jobs leave publication to the final draft-release job.

Fresh checks passed after these changes: all **1,408 tests**, build-script regressions, typechecks, ESLint, `actionlint`, the production web build, and the Electron renderer/main/preload builds. The Electron build establishes bundle generation, not installer or hardware acceptance. Closeout logs are retained under the audit's Scratch report directory in `closeout/`.

## CI follow-up

The first GitHub release run passed tests and all desktop builds, but Android SDK setup failed because the action's default package list requested the removed `tools` package. The workflow now explicitly requests `platform-tools`. The [rerun on main](https://github.com/doublesharp/breath-in-flow/actions/runs/39985805915) passed tests and all five platform builds; release creation is intentionally skipped for a branch run.

The downloaded Android APK passed `apksigner verify`. Its manifest reports `com.breathinflow.app`, version `0.0.4`, minimum Android API 24, and ARM and x86 architectures. It is a debug build for direct installation. The CI fix is included in the `0.0.5` patch release, with native build number `5`. Logs and artifact checks are retained in the audit's `ci-fixes/` Scratch report directory.
