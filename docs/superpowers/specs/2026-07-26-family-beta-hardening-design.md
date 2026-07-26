# Family Beta Hardening Design

## Goal

Produce a debug-signed Android APK that can be sideloaded for a small private
family test without telemetry, accounts, or network services. The build must be
reproducible from source, preserve local data across upgrades that use the same
debug key, and avoid presenting incomplete or low-quality pulse measurements as
reliable wellness insights.

## Confirmed Findings

The implementation addresses findings that were reproduced in source, installed
native plugin code, tests, or generated assets:

1. the root build skips the shared package even though the web package imports
   its generated `dist` output;
2. the checked native asset bundles can become older than the current web build;
3. Android Back is consumed by Capacitor but has no application listener, so it
   can become a dead gesture;
4. full-screen practice and first-run/check-in dialogs can strand controls around
   safe areas, small landscape viewports, the software keyboard, or large text;
5. local-storage write failures are logged but reported to callers as success;
6. the default/recommended unlimited-set configuration stops at a set boundary
   instead of reaching the standard completion and post-session flow;
7. interrupted in-progress sessions are not reconciled on launch;
8. pulse-variability eligibility does not reject large sample gaps, quality
   warnings are not surfaced, and artifact-heavy results can influence trends;
9. the LF/HF boundary counts the 0.15 Hz point in both bands;
10. resonance amplitude is phase-sensitive, source provenance is imprecise, and
    several result labels imply more certainty than a phone-derived wellness
    estimate supports;
11. the current component test environment cannot reproduce browser-level
    `inert`, focus, hit-testing, viewport, or keyboard behavior;
12. Android build version metadata and displayed app version disagree.

The completed-session exit and post-session modal interaction bugs are already
fixed and remain protected by regression tests.

## Product Decisions

- Distribution uses the repository's debug signing path for direct sideloading.
  It is not an app-store artifact. Testers must receive upgrades signed by the
  same development machine/key to preserve upgrade compatibility.
- Camera pulse variability remains available as a wellness/training feature.
  Measurements with insufficient temporal coverage or a long sample gap are
  ineligible, and elevated artifact results are not used for change claims.
- Resonance assessment remains available only with conservative, phase-invariant
  scoring and explicit non-medical wording.
- Dual-sensor collection remains available, but recorded provenance describes
  sensors that actually contributed accepted data.
- No crash reporting, analytics, remote logging, or background transmission is
  introduced.

## Implementation

### Deterministic build and native package

The root `build` command builds shared before web. Mobile commands use that root
pipeline, synchronize Capacitor immediately before Gradle/Xcode, and verify that
native assets match the generated web manifest. Android version name comes from
the package version and version code has a documented monotonic value. The
configured Capacitor plugin list contains only installed plugins.

The debug APK is copied to `dist/android` with the application version in its
name. Verification records its SHA-256 digest, package id, version, minimum SDK,
target SDK, signing certificate, and embedded web asset names.

### Mobile navigation and layout

A single application-level Android Back handler closes the highest-priority
visible layer first: confirmation/check-in/dialog, active or completed practice
back to Practice, secondary tab back to Practice, and finally the native default
exit behavior from the Practice home screen. Modal ownership is explicit so
background navigation is inert while a dialog is visible.

Full-screen practice applies top and bottom safe-area padding. Onboarding and
check-in overlays scroll, constrain their card height, keep actions reachable
when the viewport shrinks, and retain accessible focus/escape behavior.

### Session and persistence correctness

Storage mutations return a result or throw; they never convert quota/security
errors into apparent success. UI operations retain the unsaved user input and
show a retryable message. Multi-key backup restore remains transactional using
its existing verified rollback implementation.

Unlimited practice still permits additional sets, but also exposes a clear
`Finish session` action at each completed set. Finishing uses the same normal
session completion, check-in, notes, and summary path as a finite target.
Recommended coherent breathing receives a finite beginner target so the primary
first-run path completes automatically.

At launch, stale `IN_PROGRESS` sessions are marked cancelled with a recovery
timestamp rather than left permanently incomplete.

### Pulse-variability correctness

Eligibility derives temporal coverage from successive accepted samples and
records the largest gap:

- coverage below 85% or a gap longer than 5 seconds is ineligible;
- coverage from 85% through 94% is eligible with a visible low-coverage warning;
- artifact rate from 5% through 10% remains viewable with a visible quality
  warning but is excluded from directional trend comparisons;
- artifact rate above the existing eligibility limit remains ineligible.

These thresholds are conservative product gates for phone-derived wellness
measurements, not clinical standards. Records persist coverage, maximum gap,
warnings, and actual contributing sources so historical explanations remain
stable.

Frequency-domain integration assigns the 0.15 Hz boundary to HF only. Resonance
amplitude uses a phase-invariant per-cycle peak-to-trough estimate. Results use
realistic display precision and wording such as `estimated breathing response`
and `average pulse rate`; the result screen keeps a nearby statement that phone
measurements are not medical measurements.

### Testing

Tests are written before each behavior change. Coverage includes:

- fresh-build ordering and native-asset synchronization;
- Android Back routing and modal priority;
- small phone, landscape, and enlarged-text dialog reachability;
- local-storage write rejection and retry behavior;
- finite and unlimited session completion;
- stale-session launch recovery;
- HRV coverage, maximum gap, artifact warning, trend exclusion, LF/HF boundary,
  phase invariance, and actual source provenance;
- a real Chromium end-to-end flow from start through both check-ins, completion,
  and return to Practice.

The final gate is unit/component/integration tests, coverage, typecheck, lint,
format check, production build, Capacitor sync, Gradle debug assembly, APK
inspection, and installation smoke testing when an Android device is connected.
Physical camera, torch, motion, interruption, and thermal rows remain pending
unless observed on real hardware; automation cannot mark them passed.

## Acceptance Criteria

1. A clean checkout can produce the same web/native dependency graph without
   relying on previously generated shared output.
2. Android Back never silently does nothing in a user-visible app state.
3. Check-in and onboarding actions remain reachable at phone/landscape sizes.
4. A failed durable write is visible and retryable.
5. Recommended and unlimited practice can reach the standard completion flow.
6. Missing or artifact-heavy pulse data cannot produce an unqualified trend.
7. The APK reports the intended package/version and embeds the current web build.
8. All automated release gates pass, and unexecuted physical tests are reported
   honestly rather than inferred.
