# Wellness Accuracy and Mobile Hardening Design

## Outcome

Breath in Flow will ship as a standalone wellness and training app for iOS and Android. The app will guide breathing practices, record sessions reliably, and offer conservative pulse-variability feedback without presenting itself as a diagnostic or clinical device.

This hardening pass will preserve the existing product and in-progress work while fixing confirmed data-integrity, native-build, dependency, accessibility, and sensor-lifecycle defects. The implementation must prefer withholding a result over displaying a precise-looking result derived from weak, estimated, duplicated, or insufficient data.

## Product Positioning

- The app is a wellness and breath-training tool, not a medical device.
- Sensor-derived metrics are educational training feedback and must not diagnose, screen for, or rule out disease.
- Camera photoplethysmography (PPG) is the recommended phone-only measurement method.
- Camera-derived beat variability will be described as pulse variability in explanatory copy. Familiar metric names such as RMSSD may remain where useful, accompanied by concise context that the values are camera-derived estimates rather than ECG measurements.
- Accelerometer seismocardiography (SCG) and simultaneous dual-sensor mode remain available as experimental features. They must be labeled accordingly anywhere the user selects or interprets them.
- The app must never imply that a passing automated test suite establishes physiological validity on real devices.

## Scope

### Included

- Preserve, review, format, validate, and commit the existing dirty worktree in coherent feature commits.
- Correct PPG, SCG, dual-sensor, and HRV-analysis data flow.
- Prevent estimated heart rate from being treated as detected beat-to-beat intervals.
- Introduce measurement eligibility and metric availability rules.
- Improve sensor permissions, startup, failure recovery, and native plugin synchronization.
- Fix confirmed breathing-session and extended-hold lifecycle defects encountered during review.
- Improve mobile presentation, accessibility, reduced-motion behavior, and interaction feedback.
- Update direct dependencies to the newest compatible and safe releases.
- Resolve known dependency advisories without forcing incompatible major upgrades.
- Add regression and integration coverage, with explicit coverage gates for critical paths.
- Verify web, Android, and iOS build paths to the extent supported by the local environment.
- Reconcile HRV documentation with the implemented behavior and wellness positioning.

### Not Included

- Medical diagnosis, treatment recommendations, readiness-to-exercise clearance, or normative clinical ranges.
- Claims that phone PPG is equivalent to ECG-derived HRV.
- Claims that SCG or dual mode is validated across phone models without an external device study.
- Cloud accounts, remote health-data synchronization, or clinician dashboards.
- Apple Health, Health Connect, Garmin, or Fitbit expansion beyond fixing regressions in code already present.
- A wholesale visual redesign or replacement of Vue, Capacitor, Chart.js, or local persistence.

## Architecture

The app will keep its current Vue 3, TypeScript, Capacitor, and shared-package structure. Sensor capture, measurement orchestration, analysis eligibility, mathematical analysis, persistence, and presentation will have explicit boundaries:

1. Sensor services emit genuine detected inter-beat intervals and separate coarse heart-rate estimates.
2. A measurement orchestrator owns the shared monotonic time base, sensor lifecycle, no-data watchdog, and optional dual-sensor fusion.
3. An eligibility module decides whether a recording can produce time-domain, frequency-domain, or resonance-training metrics.
4. The pure shared analysis package calculates only the metric groups allowed by the eligibility decision.
5. The UI renders available metrics, warnings, and recovery actions without substituting zeroes for unavailable results.
6. Persistence stores the eligibility decision, provenance, warnings, and algorithm version alongside the result so historical readings remain interpretable.

This separation prevents a sensor fallback or UI shortcut from silently turning an approximate pulse estimate into an HRV result.

## Sensor Data Contracts

### Detected beat intervals

`IBISample` continues to mean a genuine interval between two detected beat events. Every newly captured sample will carry explicit provenance through the measurement pipeline:

- sensor source: `ppg`, `scg`, or `fused`
- detection method: peak-detected
- timestamp from the shared monotonic measurement clock
- interval in milliseconds
- bounded quality score from 0 to 1

Legacy stored records remain readable. They are not silently reclassified or reanalyzed under the new algorithm.

### Coarse heart-rate estimates

Autocorrelation fallback output will use a separate `HeartRateEstimate` contract and callback. It may support positioning feedback and a provisional heart-rate display, but it cannot enter `collectedIBIs`, sensor fusion, HRV analysis, or persistence as a detected interval.

PPG and SCG services must not synthesize evenly spaced beat events from one rolling-window estimate.

### Time base

PPG, SCG, and fusion will use one monotonic browser-performance time origin. Sensor-local synthetic elapsed time may still be used internally for deterministic filtering and scheduling, but emitted timestamps must be mapped to the shared origin.

The Capacitor Motion event's reported interval will be used when valid. The service will not replace every native interval with a hard-coded 16 ms value.

### Dual-sensor fusion

Dual mode will collect only fusion output. Raw PPG and SCG callbacks feed the fusion buffer but do not also append directly to the analysis series.

Fusion will use bounded per-sensor queues instead of one pending sample per source. It will account for the stable timing offset between a mechanical SCG event and the later peripheral PPG pulse, match compatible intervals without duplicating samples, flush unmatched genuine detections once, and preserve source/confidence metadata.

Dual mode remains experimental even after these integrity fixes.

## Measurement Eligibility

The app will evaluate a recording after sensor-settling trimming and before analysis. A result is eligible only when all of the following are true:

- all analysis samples are genuine detected intervals
- timestamps are finite and strictly increasing
- intervals are physiologically plausible
- the observed post-trim span meets the protocol minimum
- detected beat count is at least one beat per two seconds of observed time
- mean signal quality is at least 0.50
- corrected or discarded artifacts are no more than 10% of captured samples
- no unresolved sensor-start or no-data error occurred

Recordings with 5% to 10% artifacts are usable with an explicit caution. Recordings with more than 10% artifacts are rejected. A sensor producing no genuine detected interval for five seconds after its settling period triggers recovery guidance rather than continuing silently.

Eligibility failures return structured reason codes and user-facing recovery text. They do not produce zero-filled metric cards.

## Metric Availability by Protocol

### Quick Check

- Default duration: 120 seconds
- Minimum duration: 60 seconds
- Available when eligible: average pulse rate, RMSSD, pNN50, signal-quality summary
- SDNN may be shown only with a short-recording label and without normative interpretation
- Frequency-domain, VLF, LF/HF, and absolute spectral-power cards are unavailable

### Morning Readiness

- Default duration: 180 seconds
- Minimum duration: 120 seconds
- Available when eligible: average pulse rate, RMSSD, pNN50, short-recording SDNN, quality and trend comparison against the user's own prior comparable readings
- No population health classification or diagnostic readiness claim
- Frequency-domain cards are unavailable

### Full Analysis

- Default and minimum duration for complete frequency output: 300 seconds
- Available when eligible: time-domain metrics, supported frequency-domain metrics, Poincare visualization, and quality metadata
- VLF interpretation remains omitted because a five-minute recording is not sufficient for a stable physiological VLF interpretation
- LF/HF is labeled descriptive and not as a direct sympathetic/parasympathetic balance score

### Resonance Trials

- Two-minute trials may produce within-assessment training metrics: pulse oscillation amplitude, dominant frequency near the paced-breathing frequency, waveform concentration, and relative trial comparison
- General-purpose VLF, LF/HF, total-power, or clinical autonomic interpretations are not shown for these short trials
- Trials failing eligibility remain incomplete and can be retried; they do not receive an objective score

### Freeform

Metric groups unlock according to the same elapsed-time and quality rules. Stopping early produces either a limited eligible result or a clear insufficient-data outcome.

## HRV and Pulse-Variability Analysis

- Keep the pure shared analysis API deterministic and side-effect free.
- Validate input length, ordering, finiteness, provenance, and metric availability before computing results.
- Preserve raw and cleaned series separately in the analysis result.
- Report detected, corrected, and discarded sample counts separately.
- Avoid returning plausible default peak frequencies when no valid spectrum exists; unavailable values must be represented as unavailable.
- Validate absolute spectral scaling against a trusted reference implementation and analytic synthetic fixtures before displaying absolute power.
- Retain relative spectral peak and concentration tests for resonance training, with known-frequency synthetic fixtures.
- Keep artifact correction conservative. Recordings requiring excessive correction are rejected rather than cosmetically repaired.
- Add an algorithm-version field to newly persisted sensor measurements.

## Sensor Lifecycle and Permissions

- Permissions are requested only after a user chooses a sensor and presses Start.
- Android must not request camera access at app launch.
- Opening the preparation screen must not acquire and immediately release the camera solely to enumerate labels.
- Sensor service `start()` methods return an explicit success or failure result. A timer cannot begin until the required sensor path has started.
- Dual mode reports partial startup explicitly and offers camera-only fallback instead of silently changing behavior.
- A preflight state communicates: requesting permission, positioning, acquiring pulse, ready, weak signal, and unavailable.
- A no-data watchdog stops a failed measurement and offers Retry, Change sensor, or Cancel.
- Camera, torch, motion listeners, animation frames, keep-awake, timers, and speech are released on stop, failure, component unmount, and app background transitions.

## Breathing Session Correctness

- Extended-hold start callbacks fire when the hold actually begins, not before a required recovery inhale or exhale.
- Timed and tolerance holds record one completion with the correct first- or second-hold mode.
- Navigating or backgrounding during an active practice cannot leave an orphaned in-progress session.
- Active full-screen session and measurement surfaces isolate background controls from keyboard and screen-reader interaction.
- Pause/resume and background recovery retain monotonic elapsed-time behavior without timer drift.

## Mobile UX and Accessibility

The existing warm visual direction and compact bottom navigation will remain. Improvements will focus on clarity and smoothness:

- Camera becomes the visibly recommended sensor; SCG and Both receive Beta labels and short explanations.
- Protocol descriptions wrap to a useful second line rather than truncating before the distinguishing information.
- Duration sliders receive visible labels, accessible names, current values, and protocol-specific minimums.
- Sensor quality language distinguishes no data, weak signal, positioning problems, and motion instead of treating every zero-quality state as excessive motion.
- Full-screen modals use dialog semantics, focus management, background isolation, and reliable safe-area padding.
- Primary actions stay reachable above the bottom safe area and keyboard.
- Loading and sensor-state transitions avoid layout jumps.
- Reduced-motion preferences disable nonessential scaling, glow, and page-transition animation while preserving breathing instructions.
- Text and controls meet practical mobile contrast and touch-target requirements.
- Results explain unavailable metrics and quality cautions in plain language.
- Debug controls remain development-only and are hidden in production builds.

## Persistence and Compatibility

- Existing configurations, sessions, assessments, and HRV measurements remain loadable.
- New measurement records add provenance, eligibility, warnings, and algorithm version without rewriting historical data.
- Date serialization and IndexedDB/localStorage migration remain backward compatible.
- Invalid or partially corrupted stored entries are skipped with bounded logging rather than crashing the app.
- No health or sensor data leaves the device as part of this work.

## Dependency and Native Project Policy

- Update patch and minor versions within the current major line when tests and builds pass.
- Evaluate major updates individually. Adopt them only when the framework and plugin compatibility matrix, type checking, tests, and supported builds pass.
- Keep all Capacitor core/platform packages on the same compatible release line.
- Update the Motion plugin and run Capacitor sync so Android and iOS contain every installed native plugin.
- Regenerate native dependency references instead of hand-editing generated Capacitor files.
- Resolve the known `@hono/node-server` and `esbuild` advisories through safe direct upgrades, compatible transitive upgrades, or narrowly scoped package-manager overrides.
- Do not move to TypeScript 7 or a new Electron major solely because it is newest; compatibility evidence is required.
- Commit the lockfile produced by the final dependency graph.

## Testing Strategy

All behavioral fixes use red-green-refactor development. New tests should extend existing well-named test files unless a genuinely new module requires one focused test file.

### Required regression coverage

- PPG and SCG timestamps share a comparable monotonic origin.
- Capacitor Motion intervals are honored.
- Autocorrelation estimates never enter the IBI series.
- Dual mode emits each detected interval at most once and handles sensor offset, disagreement, and single-sensor fallback.
- Sensor startup failure and no-data timeout prevent false measurement completion.
- Eligibility rejects estimated, short, low-quality, non-monotonic, and artifact-heavy recordings.
- Protocol-specific metric availability is enforced.
- Invalid spectra expose unavailable values rather than default-looking peaks.
- Extended-hold callbacks and persisted modes are correct.
- Full-screen dialogs isolate background navigation and expose accessible controls.
- Permission prompts occur in context, not at Android app launch.
- Existing storage data remains readable.

### Coverage gates

After the new tests:

- web global statements and lines: at least 80%
- web global branches: at least 70%
- web global functions: at least 75%
- `LabTab.vue` and `ResonanceAssessment.vue`: at least 75% statements and lines
- PPG, SCG, fusion, permission, and measurement-eligibility services: at least 90% lines and 80% branches
- shared HRV code: retain at least 95% lines and 85% branches

Coverage percentage is not a substitute for reference-data and failure-path assertions.

## Validation Gates

The completed branch must run, with fresh output:

- `pnpm install`
- `pnpm test`
- `pnpm test:coverage`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm build`
- Electron production build or the narrowest supported packaging smoke check
- Capacitor sync for both platforms
- `cap ls` showing Motion and the other required plugins for Android and iOS
- Android debug APK build
- iOS simulator build with code signing disabled
- mobile viewport interaction checks for practice, Lab preparation, measurement failure, results, history, presets, and analytics

If a native simulator, SDK, signing identity, or hardware sensor is unavailable, the limitation must be reported separately from product failures. Real-device physiological validation remains a documented follow-up and must not be claimed as completed by simulator tests.

## Commit Strategy

The existing dirty WIP is user-owned and will not be discarded. Files will be staged deliberately by coherent concern after validation:

1. Design specification.
2. Validated workspace, storage, database, and existing non-sensor test improvements.
3. Safe dependency updates, advisory remediation, and synchronized native projects.
4. HRV provenance, eligibility, mathematical-output, and documentation corrections.
5. PPG, SCG, clock, fusion, permission, and sensor-lifecycle fixes.
6. Breathing-session lifecycle fixes.
7. Mobile UX, accessibility, reduced-motion, and production-debug cleanup.
8. Coverage and release-gate documentation that is not naturally included with the feature it tests.

Tests belong in the same commit as the behavior they protect. A commit will not be described as validated until its relevant tests and checks have run successfully.

## Acceptance Criteria

- A normal user can complete breathing practices offline on iOS or Android without granting sensor permissions.
- Camera permission appears only when the user starts a camera-based measurement.
- Camera PPG is the default recommended sensor; SCG and Both are clearly experimental.
- The app cannot create HRV results from autocorrelation-only or duplicated fusion data.
- Weak, short, or failed recordings end with actionable guidance rather than zero-filled or authoritative-looking results.
- Quick, Morning, Full, Resonance, and Freeform modes show only metrics supported by their duration and data quality.
- Existing local data remains accessible.
- Required native plugins are synchronized and Android/iOS build checks pass, subject only to explicitly documented environmental constraints.
- Dependency audit has no known vulnerability that has an available compatible fix left unapplied.
- Coverage gates and all validation commands pass.
- Documentation matches the shipped algorithm and wellness positioning.
