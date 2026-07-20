# Pulse Variability Feature Completion Design

**Date:** 2026-07-20  
**Status:** Approved  
**Product position:** Standalone wellness and breath-training application for iOS and Android

## Goal

Complete the on-device Pulse Variability feature as a first-class part of Breath in Flow. Camera, chest-motion, and combined sensing must be usable without experimental or Beta treatment, while the product remains accurate about what each phone sensor measures and avoids medical or diagnostic claims.

This work also completes the high-priority partially implemented functionality that directly supports Pulse Variability: measurement eligibility, metric availability, resonance trials, lifecycle handling, local persistence, trends, accessibility, and offline presentation.

## Scope

### Included

- Camera photoplethysmography (PPG) pulse-timing measurement.
- Chest-motion beat-timing measurement.
- Combined camera and chest-motion sensing.
- Quick, readiness, full-analysis, and resonance measurement flows.
- Correct metric eligibility and unavailable states.
- Measurement and assessment persistence and migration.
- Historical trends and conservative within-person insights.
- Mobile lifecycle, permissions, interruption handling, and sensor cleanup.
- Dialog accessibility, reduced-motion support, and offline visual consistency.
- Test coverage, documentation, web builds, Capacitor synchronization, and available native-build verification.

### Not included

- PDF export.
- Multiple patient profiles or clinical record management.
- Third-party wearable OAuth integrations such as Garmin, Fitbit, or Apple Health.
- Diagnostic interpretation, treatment recommendations, or claims of equivalence to clinical ECG.

Those are separate product features with distinct data, privacy, service-credential, and validation requirements.

## Product and Measurement Contract

### Terminology

The feature is named **Pulse Variability** throughout navigation and primary user-facing copy. Camera PPG measures pulse-to-pulse intervals and therefore produces pulse-rate variability (PRV) estimates. Familiar interval metrics such as RMSSD and SDNN may be shown, but the interface must not imply that phone PPG is an ECG or a medical measurement.

Chest-motion and combined sensing are normal supported choices without Beta badges. Their descriptions state how the signal is obtained, their positioning requirements, and the need to remain still. Quality gates, rather than marketing labels, determine whether a measurement can be analyzed.

### Protocol duration

Protocol durations refer to the clean interval analyzed, not merely elapsed capture time. When a protocol discards a five-second settling window and a three-second ending window, acquisition includes those eight seconds in addition to the target analysis duration.

Eligibility is evaluated only after trimming and interval-quality filtering. A full five-minute analysis therefore requires five minutes of eligible analyzed data. The interface presents collection and analysis durations clearly when they differ.

### Metric availability

Metric groups have explicit availability contracts. An unavailable result is represented as unavailable or null, never as a plausible numeric zero.

- Basic pulse rate and supported time-domain variability metrics require sufficient clean detected beats and a stable interval series.
- Poincare metrics require enough successive eligible intervals to form a meaningful plot.
- General LF/HF frequency-domain reporting requires a five-minute eligible analysis segment.
- Short resonance trials may report trial-specific dominant-frequency, concentration, and breathing-response measures, but do not masquerade as a general five-minute frequency-domain analysis.
- Absolute spectral power is not displayed as a trusted clinical value without an independently validated reference implementation. User-facing spectral summaries emphasize relative or normalized power and response concentration.

The dashboard explains unavailable groups using the concrete reason: duration, beat count, signal quality, or missing breathing-rate context.

## Sensor Pipeline

### Provenance

Only provenance-bearing, directly detected beat events may enter interval cleaning, analysis, sensor fusion, or persistence. Provisional heart-rate estimates remain display-only and cannot be converted into detected intervals.

The completed measurement records the sensor sources that were active during acquisition, even after live sensor resources have been released.

### Motion and signal quality

Chest-motion sensing uses an adaptive artifact gate based on the recent signal and movement distribution. Large movement events are rejected before beat timing is emitted. The gate must avoid a single unvalidated device-specific constant and expose bounded quality feedback to the orchestration layer.

The measurement watchdog is refreshed by each valid detected beat. It can therefore detect both failure to acquire an initial signal and a later sensor stall. Recovery offers retry, sensor change, or cancellation without leaking an active stream.

### Combined sensing

Combined sensing estimates a stable timing offset between camera and chest-motion beat streams from recent plausible matches. It pairs events within a bounded, offset-adjusted window, rejects unstable matches, and emits one fused event for one physiological beat. A matched event cannot later be emitted again as an unmatched event.

Fusion quality records agreement and source contribution so downstream analysis can distinguish fused, camera-only fallback, and chest-only fallback intervals.

### Permissions and lifecycle

Camera and motion permission requests originate from an explicit user action before the timed protocol begins. Denials and unavailable sensors produce actionable, non-destructive UI states.

When the app becomes inactive or the document is hidden:

- an active breathing session pauses and retains a recoverable session state;
- an active Pulse Variability capture stops and releases all hardware resources;
- incomplete measurement data is not silently saved as a successful result;
- the foreground UI explains the interruption and permits a clean restart;
- no session remains orphaned as in progress.

Listeners are registered once, removed on unmount, and safe across repeated foreground/background transitions.

## Analysis Architecture

Analysis is split into small pure stages:

1. Preserve detected-event provenance.
2. Trim protocol settling and ending windows.
3. Reject implausible or artifactual intervals.
4. Evaluate duration, beat-count, stationarity, and signal-quality eligibility.
5. Compute only the metric groups that are eligible.
6. Produce an analysis object containing values, availability, reasons, provenance, and quality metadata.

The result types use discriminated available/unavailable states where a numeric placeholder could otherwise be mistaken for a real measurement. Components render from these contracts rather than recreating eligibility rules.

## Resonance Assessment

Every configured resonance trial lasts at least its declared target duration; repetition counts round upward where necessary. The initial Start action performs sensor permission and readiness checks before warm-up.

Automatic scoring uses only trial metrics supported by the short paced-breathing protocol. If sensor quality is insufficient, the trial remains usable through the existing comfort and symptom questions rather than manufacturing objective scores.

Assessments and standalone measurements share the same authoritative persistence path and measurement semantics.

## Persistence and Migration

IndexedDB is the authoritative store for Pulse Variability measurements and resonance assessments. On initialization, an idempotent migration imports valid legacy localStorage assessments and records completion only after successful persistence.

All stored data is validated at the record boundary. Valid legacy fields receive documented defaults where safe. Invalid records are skipped individually with bounded logging so one corrupt entry cannot crash history or the application. Migration and reads never duplicate an already imported assessment.

General breathing configurations and sessions stored in localStorage receive the same defensive per-record validation behavior.

## Trends and Insights

The existing trend and insight components are integrated into the Lab experience and consume the full eligible history rather than an arbitrary last-five subset.

Comparisons are limited to measurements with compatible protocol, posture/context where available, duration, and metric eligibility. Copy describes within-person changes and measurement consistency. It does not use generic population targets, label a value medically good or bad, infer recovery status, or promise that practice caused a change.

Insufficient history produces useful guidance about collecting comparable measurements rather than a score.

## User Experience and Accessibility

- Remaining “HRV Lab” navigation labels become “Pulse Variability.”
- Measurement and assessment overlays use dialog semantics, accessible names, initial focus, focus containment, Escape behavior where safe, focus restoration, and inert background content.
- Reduced-motion preferences disable decorative aurora, glow, scale, and nonessential transitions while preserving readable breathing phase changes and timer updates.
- Measurement interruption, insufficient quality, and unavailable metrics use concise explanations and a clear next action.
- The external font request is removed or replaced with locally available font stacks so the standalone application retains a complete offline presentation.
- Touch targets and bottom actions continue to respect mobile safe areas.

## Testing Strategy

Behavioral changes follow test-driven development: write a focused failing test, confirm that it fails for the expected reason, implement the smallest correct behavior, and then refactor while green.

Coverage includes:

- deterministic interval fixtures and known-answer time-domain calculations;
- eligibility after trimming, including exact protocol boundaries;
- available/unavailable metric contracts and rendering;
- spectral normalization and short-trial restrictions;
- adaptive motion rejection;
- combined-sensor offset estimation, pairing, fallbacks, and deduplication;
- initial and mid-session watchdog failures;
- permissions, background interruption, cleanup, and recovery;
- IndexedDB migration, idempotency, legacy defaults, and corrupt records;
- all configured resonance rates and duration boundaries;
- trends using only comparable eligible data;
- dialog accessibility and reduced-motion styling;
- build-script version and artifact failure behavior.

New high-risk pure modules and changed analysis contracts require 100% line and function coverage. Existing shared analysis, sensor services, Lab, and Resonance thresholds are ratcheted upward rather than weakened. The complete project suite and coverage gates run after each coherent change.

## Delivery and Commits

Work is split into small reviewable commits:

1. Approved design and implementation plan.
2. Analysis eligibility and availability contracts.
3. Sensor reliability and combined-sensing correctness.
4. Lifecycle and permission handling.
5. IndexedDB migration and defensive storage validation.
6. Resonance, trends, and insight completion.
7. Accessibility and offline UX improvements.
8. Coverage and release-tooling gates.
9. Documentation and final native verification adjustments, if needed.

Existing changes are validated before inclusion, and unrelated user work is preserved.

## Acceptance Criteria

- Camera, chest-motion, and combined sensing are complete first-class choices without Beta labeling.
- A successful result contains only detected, eligible intervals with retained source provenance.
- Trimming cannot turn a nominally eligible five-minute result into a shorter analyzed segment.
- Unavailable metrics never appear as numeric zeroes or unsupported claims.
- Combined sensing cannot count the same physiological beat twice.
- Motion artifacts and signal stalls produce bounded recovery states.
- Backgrounding releases sensors and cannot leave a breathing or measurement session orphaned.
- Existing valid assessments migrate once to IndexedDB; corrupt records cannot crash the app.
- Trends compare only compatible eligible measurements and use conservative wellness copy.
- Lab and assessment overlays are keyboard and screen-reader operable and honor reduced motion.
- The application works without a font network request.
- All tests and coverage gates pass; production web and Android builds succeed; iOS verification is run to the extent supported by the installed native toolchain.
- Documentation clearly states measurement semantics, protocol requirements, privacy, and limitations.
