# Family Testing Readiness Design

## Goal

Prepare Breath in Flow for a small, private test with the owner's parents by making the first session obvious, preserving user data, collecting optional subjective feedback, and proving as much native behavior as the available hardware permits.

This milestone keeps the app standalone and privacy-first. It adds no accounts, remote analytics, crash reporting, background telemetry, advertising, or physiological-data transmission.

## Success Criteria

A first-time user can:

1. choose a wellness goal without granting sensor permission;
2. start the recommended activity from a prominent action;
3. repeat the configuration from the latest completed practice;
4. optionally record how they feel before and after a completed practice;
5. send a deliberate support message with basic app and device information;
6. export all durable app data and restore it without silent loss or partial corruption; and
7. install and exercise the release candidate on available representative iOS and Android hardware with the result recorded honestly.

## Scope

### Included

- First-run goal selection and local goal editing.
- Goal-specific recommended actions.
- Repeat-last-session shortcut.
- Optional pre-session and post-session check-ins.
- User-initiated support message composition.
- Versioned full-data backup, validation, preview, replacement restore, and rollback.
- Automated, simulator, build, and available physical-device validation.
- Documentation and tests for every new persistence and user-flow contract.

### Excluded

- Remote crash or reliability reporting.
- Product analytics or behavior tracking.
- Accounts, cloud synchronization, or server infrastructure.
- Push notifications and reminders.
- Wearable integrations.
- Multi-week training programs.
- Patient or clinician management.
- PDF reporting.
- Medical interpretation or clinical claims.

## Product Approach

The implementation will use a lean family-testing experience rather than a general-public growth stack. The existing advanced configuration, history, analytics, and Pulse Variability features remain available, but a new first-use path makes the recommended next action clear.

The four supported goals are:

| Goal                          | Recommended action                                         |
| ----------------------------- | ---------------------------------------------------------- |
| Relax                         | Load and start **Stress Relief (Quick)**                   |
| Train diaphragm               | Load and start **Diaphragm Resistance Training — Starter** |
| Improve breathing consistency | Load and start **Coherent Breathing**                      |
| Explore pulse variability     | Navigate to the Pulse Variability quick-check setup        |

Recommendations are starting points, not prescriptions. Users can choose another preset or customize any breathing configuration before starting.

## Architecture

New behavior will be split into small boundaries rather than added directly to the already-large practice component.

### Shared contracts

The shared package owns validated, serializable contracts for:

- user goal and preferences;
- subjective feeling values;
- session check-ins;
- the versioned backup envelope; and
- backup metadata and record counts.

Dates use the existing runtime `Date` representation inside the app and ISO 8601 strings at the backup boundary. Unknown backup fields are rejected for the current format rather than silently retained. The first backup format version is `1`.

### Preferences service

A focused preferences service owns the first-run completion flag and selected goal. It validates data when loading from local storage, recovers to an unconfigured state when stored data is invalid, and exposes an explicit update operation.

Preference storage must not request camera, motion, notification, or network access.

### Recommendation service

A pure mapping resolves the selected goal into one of two action types:

- a guided preset identifier; or
- a navigation target and Pulse Variability protocol.

The mapping must fail safely when a preset is unavailable by returning an actionable fallback to the preset library rather than throwing during app launch.

### Check-in integration

Check-ins are part of the existing session record so they remain attached to the exact historical configuration. A check-in contains:

- optional pre-session feeling;
- optional post-session feeling; and
- optional post-session comment with a 500-character limit.

The feeling scale is:

1. Very uncomfortable
2. Uncomfortable
3. Neutral
4. Comfortable
5. Very comfortable

The wording intentionally describes immediate subjective comfort rather than diagnosing mood, stress, recovery, or health.

The pre-session prompt appears after the user requests a start but before the timer begins. It offers **Continue** and **Skip**. The post-session prompt appears only after a session is successfully completed and also offers **Save** and **Skip**. Neither prompt can prevent practice or strand a completed session. Cancelled sessions retain a pre-session response only if the user submitted one.

### Support service

Support is a deliberate user action exposed from Help. On activation, the service gathers:

- application name and version;
- build number when a native API exposes it;
- platform;
- operating-system name and version; and
- device model when a native API exposes it.

It must not include user identifiers, sessions, presets, check-ins, Pulse Variability values, sensor samples, permissions, or stored diagnostics.

The service first uses the platform share interface when available. If sharing is unavailable, it opens a pre-addressed email. If neither operation succeeds, it copies the prepared text to the clipboard and gives the user a visible confirmation. No information is collected before the user activates the action, and nothing is sent automatically.

### Backup service

The backup service coordinates the existing localStorage and IndexedDB repositories through explicit export and replace operations. The version 1 envelope contains:

- metadata: format version, app version, and export time;
- user preferences;
- saved breathing configurations;
- practice sessions, including check-ins;
- sound preference and last-used practice configuration where valid;
- Pulse Variability measurements; and
- resonance assessments.

No camera frames, audio, raw motion stream, transient sensor buffer, permission state, or support message is included.

Export returns a deterministic JSON document suitable for native sharing or file download. Restore follows this sequence:

1. read the selected file with a size limit;
2. parse JSON without mutating storage;
3. validate and normalize the complete envelope;
4. show its version, export date, and record counts;
5. require explicit replacement confirmation;
6. snapshot the current durable state in memory;
7. replace all repositories;
8. read back and validate the restored state; and
9. restore the snapshot if any write or verification step fails.

Restore never merges records in format version 1. This avoids duplicate sessions, conflicting identifiers, and unclear precedence. Unsupported future versions are rejected with a clear message and leave existing data untouched.

The initial implementation limits an imported backup to 25 MiB. The application currently stores no images or continuous raw sensor recordings, so a larger file is treated as unexpected or corrupt.

### UI composition

The application receives three focused UI additions:

1. **Goal onboarding** — a first-run dialog with four choices, concise explanations, Continue, and a non-destructive way to close the app without making a choice. The dialog returns until a goal is selected. Sensor permissions are never requested here.
2. **Recommended actions** — a compact Practice-page card with **Start recommended session** and, when available, **Repeat last session**. A breathing shortcut starts its validated configuration through the optional pre-session check-in; a secondary **Adjust first** action loads the same configuration into the editor without starting. Selecting Pulse Variability navigates to the quick-check setup because sensor preparation and permission must remain explicit.
3. **Data and support settings** — a Help section for changing the goal, exporting a backup, restoring a backup, and sending feedback.

The interface follows existing modal isolation, reduced-motion, safe-area, focus management, and responsive patterns.

## Data Flow

### Recommended session

1. App loads validated preferences.
2. Recommendation service resolves the goal.
3. User activates the recommended action.
4. **Start recommended session** passes a fresh validated copy of the built-in preset into the pre-session check-in and then starts Practice.
5. **Adjust first** loads that copy into the Practice editor without starting; Pulse Variability instead switches to Lab quick check.

### Repeat last session

1. Storage selects the most recent completed session.
2. The application validates and clones its `configSnapshot`.
3. The cloned configuration enters the pre-session check-in and then starts Practice without changing the original preset or historical session.
4. A secondary adjustment action may load the clone into the editor without starting.
5. The new session receives a new identifier and its own immutable snapshot.

### Session check-in

1. Start action opens the optional pre-session check-in.
2. Submitted data is held with the pending start request.
3. A successfully created session receives the submitted pre-session value.
4. Completion persists the session before showing the optional post-session prompt.
5. Saving the post-session prompt updates that completed session idempotently.

### Backup and restore

All repository reads and writes pass through one backup coordinator. UI components never read IndexedDB or raw localStorage keys directly. This provides one testable place for format versioning, limits, rollback, and future migrations.

## Error Handling

- Invalid preferences reopen onboarding without crashing the app.
- A missing recommended preset links to Presets and records no session.
- A rejected or failed practice start saves no orphaned check-in.
- Failure to save a post-session check-in does not undo an already completed session; the user receives a retry action.
- Support sharing falls back through share, email, and clipboard with a visible final error if all are unavailable.
- Backup export reports repository read failures and produces no partial file.
- Backup import performs no writes before complete validation and confirmation.
- Restore failure triggers rollback and then verifies the recovered state.
- If rollback itself fails, the app stops further writes, reports exactly which repository failed, and preserves the original import file for manual recovery.
- Native-device validation records failures as findings. A build, simulator, or automated pass never substitutes for a physical-device pass.

## Physical-Device Validation

The existing device-validation document remains authoritative and will be updated with the current commit and artifacts.

The implementation phase will:

1. build and synchronize both Capacitor projects;
2. run the complete automated release matrix;
3. compile Android with the supported Java toolchain;
4. compile iOS when a compatible Xcode platform is installed;
5. enumerate connected iOS and Android devices;
6. install and exercise the release candidate on available representative devices; and
7. record exact device model, OS version, build identifier, protocol, result, and notes.

Camera, torch, motion sampling, background interruption, permission recovery, sustained thermal behavior, and reference comparison can be marked passed only after an observed physical test. If representative hardware is not connected or a trusted reference is unavailable, the corresponding row remains explicitly pending with the exact action required to complete it.

## Testing Strategy

### Shared and pure-unit tests

- Every valid and invalid preference value.
- Backup format version, strict field validation, date serialization, record counts, and size limit.
- Feeling-scale and comment constraints.
- Every goal-to-recommendation mapping and missing-preset fallback.

### Storage tests

- Preferences persistence and corruption recovery.
- Session check-in creation and idempotent update.
- Full backup export with both localStorage and IndexedDB data.
- Export, clear, restore, and re-export equality after normalization.
- Invalid JSON, unsupported version, malformed record, oversized file, repository write failure, read-back mismatch, successful rollback, and rollback failure reporting.
- No restore path mutates existing data before confirmation.

### Component and flow tests

- First-run onboarding, returning-user bypass, goal change, keyboard and screen-reader behavior.
- Recommended breathing preset and Pulse Variability navigation.
- Repeat-last-session absence, availability, and historical snapshot isolation.
- Pre-session save and skip, start failure, post-session save and skip, and completed-session persistence.
- Support share, email, clipboard, and total-failure states with assertions that physiological data is absent.
- Backup download/share, import preview, cancellation, confirmation, success, failure, and rollback presentation.

### Release verification

- Full tests and coverage gates.
- Type checking, linting, formatting, and production web build.
- Capacitor synchronization.
- Android native build.
- Available iOS native build or a precise external-toolchain blocker.
- Physical-device matrix with no inferred passes.

New pure modules require complete line and function coverage. Existing package and high-risk per-file coverage gates may be raised but never lowered.

## Acceptance Criteria

- A clean install presents exactly four goal choices and no permission prompt.
- A selected goal survives restart and can be changed from Help.
- Every breathing goal can immediately start the specified preset or load it for adjustment; the Pulse Variability goal opens quick-check preparation without requesting permission early.
- Repeat last session uses the latest completed session and never mutates history.
- Check-ins are optional, validated, attached to the correct session, and included in backup.
- Support is fully user initiated and includes no health, practice, or sensor data.
- A version 1 backup round-trips all durable data across both storage technologies.
- Invalid or failed restores leave the previous state intact or report a verified rollback failure without claiming success.
- Automated and native release gates pass wherever the local toolchain permits.
- Physical-device checks are supported by recorded observations; unavailable hardware remains an explicit release action.
- The working tree is clean and the implementation is separated into reviewable commits.
