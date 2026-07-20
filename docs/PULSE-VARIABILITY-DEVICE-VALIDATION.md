# Pulse Variability Physical-Device Validation

## Purpose and status

This matrix is the release checklist for behavior that automated tests, browser simulation, Capacitor synchronization, and native compilation cannot prove. A checked item requires an executed test on the named physical device with evidence recorded below. No physical-device check has been executed for this release candidate yet.

Passing this matrix establishes product behavior on the tested hardware only. It does not validate Breath in Flow as a medical device or establish equivalence to ECG-derived HRV.

## Supported native versions

| Platform | Project support floor | Intended build target                                         | Release expectation                                                                                                        |
| -------- | --------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| iOS      | iOS 16.0              | Xcode 26.2, iOS 26.2 platform, iPhone 16 Pro simulator target | Launch and complete supported flows on iOS 16 and a current supported iOS version                                          |
| Android  | Android 7.0 / API 24  | Android API 36                                                | Launch and complete supported flows on API 24 and API 36 hardware, or the nearest available versions with any gap recorded |

Camera, flash/torch, and motion sampling remain capability-dependent even on a supported operating-system version. A device that cannot supply a required sensor must receive an actionable unavailable state rather than a false successful measurement.

## Native build verification

Build and synchronization evidence does not complete any physical-device check below.

| Check                            | Result             | Evidence                                                                                                                                                                                        |
| -------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Capacitor Android/iOS sync       | Passed             | Four native plugins synchronized with no tracked native-project diff.                                                                                                                           |
| Android debug build              | Passed             | Java 21 and Gradle produced `app-debug.apk` (SHA-256 `85e16f7e7bb3f6b86ec4858e112ee232729e933133cf80ef02cd6acd60faeab2`).                                                                       |
| Repository iOS simulator command | Blocked externally | The command targets `iPhone 16 Pro` on the intended iOS 26.2 simulator platform; that target/platform is unavailable locally.                                                                   |
| Direct installed-simulator build | Blocked externally | The only installed simulator runtime is iOS 17.5, including an iPhone 15 Pro. Xcode 26.2 reports that the iOS 26.2 platform component is not installed and exposes no eligible App destination. |

The iOS rows remain blocked and are not release passes. The intended verification target is an iPhone 16 Pro simulator backed by the iOS 26.2 platform. The current machine instead has only the iOS 17.5 simulator runtime, while Xcode 26.2 is missing its iOS 26.2 platform component. Install that component and target, or use a compatible Xcode/runtime pair and explicitly record the substituted target before rerunning verification.

## Device matrix

Use exact model, operating-system build, app commit, build identifier, and reference-device firmware in the evidence log.

| Physical device   | OS                               | Camera and flash | Motion sampling | Background interruption | Permission denial and recovery | Thermal behavior | Trusted reference comparison | Status    |
| ----------------- | -------------------------------- | ---------------- | --------------- | ----------------------- | ------------------------------ | ---------------- | ---------------------------- | --------- |
| iPhone model TBD  | iOS 16.x support floor           | ☐ Not run        | ☐ Not run       | ☐ Not run               | ☐ Not run                      | ☐ Not run        | ☐ Not run                    | ☐ Pending |
| iPhone model TBD  | Current supported iOS            | ☐ Not run        | ☐ Not run       | ☐ Not run               | ☐ Not run                      | ☐ Not run        | ☐ Not run                    | ☐ Pending |
| Android model TBD | Android 7 / API 24 support floor | ☐ Not run        | ☐ Not run       | ☐ Not run               | ☐ Not run                      | ☐ Not run        | ☐ Not run                    | ☐ Pending |
| Android model TBD | Android 16 / API 36 target       | ☐ Not run        | ☐ Not run       | ☐ Not run               | ☐ Not run                      | ☐ Not run        | ☐ Not run                    | ☐ Pending |

## Required checks for each device

### Installation and supported versions

- [ ] Install the exact release-candidate build without development tooling.
- [ ] Launch offline, navigate Practice and Pulse Variability, and confirm locally bundled styling and icons render.
- [ ] Record whether the operating system is the declared support floor, current target, or an intermediate version.

### Camera and flash

- [ ] Start camera sensing from the explicit Start action and confirm the permission prompt does not appear earlier.
- [ ] Confirm rear-camera selection, preview/signal acquisition, flash behavior, and an actionable state when torch control is unavailable.
- [ ] Complete quick and full captures with the finger-position guidance visible and verify camera and flash release on stop, completion, failure, and navigation away.

### Motion sampling

- [ ] Start chest-motion sensing from the explicit Start action and record the observed sampling behavior.
- [ ] Confirm stable placement can acquire detected beats and deliberate large movement is rejected with bounded quality guidance.
- [ ] Complete combined sensing and confirm camera, chest, and fused source contributions are represented without duplicate physiological beats.

### Interruption and cleanup

- [ ] Background the app, lock the screen, and invoke the app switcher during camera, chest, and combined captures.
- [ ] Confirm capture stops, every sensor resource is released, partial data is not saved as successful, and foreground return offers a clean restart.
- [ ] Background an active breathing practice and confirm it pauses with recoverable state rather than remaining orphaned.

### Permission denial and recovery

- [ ] Deny camera permission, motion permission, and both permissions for combined mode.
- [ ] Confirm each denial explains the unavailable sensor without deleting prior history or starting the protocol timer.
- [ ] Grant permission in system settings, return to the app, and complete a clean retry without reinstalling.

### Thermal and sustained operation

- [ ] Run repeated full-analysis camera captures under normal room conditions and record device temperature, operating-system warnings, frame/sampling degradation, and battery impact.
- [ ] Confirm a thermal warning or uncomfortable device temperature leads the tester to stop; do not mark a hot-but-completed run as acceptable.

### Trusted reference comparison

- [ ] Capture simultaneous beat timing with a named, independently trusted reference device whose raw interval export is available.
- [ ] Record synchronization method, posture, protocol, retained duration, beat count, artifact handling, and any excluded segment.
- [ ] Compare detected intervals, missing/extra beats, pulse rate, and supported variability measures. Define acceptance bounds before examining results.
- [ ] Treat disagreement as a validation finding. Do not tune thresholds to one participant or device without a documented, broader validation plan.

## Evidence log

Add one entry per executed device/protocol combination.

| Date    | App commit/build | Device and OS | Protocol and sensor mode | Reference device | Result  | Evidence link or notes               |
| ------- | ---------------- | ------------- | ------------------------ | ---------------- | ------- | ------------------------------------ |
| Not run | —                | —             | —                        | —                | Pending | No physical-device evidence recorded |

## Release sign-off

- [ ] Support-floor iOS device checks complete.
- [ ] Current iOS device checks complete.
- [ ] Support-floor Android device checks complete.
- [ ] API 36 Android device checks complete.
- [ ] Any sensor-specific exclusions are documented in product copy.
- [ ] Comparison findings have been reviewed without medical or diagnostic claims.
