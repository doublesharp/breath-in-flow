# Pulse Variability Physical-Device Validation

## Purpose and status

This matrix is the release checklist for behavior that automated tests, browser simulation, Capacitor synchronization, and native compilation cannot prove. A checked item requires an executed test on the named physical device with evidence recorded below. As of the latest update (2026-07-21) automated, build, and connected-hardware-enumeration evidence has been recorded for this release candidate; **no physical-device observation check has been executed yet.**

Passing this matrix establishes product behavior on the tested hardware only. It does not validate Breath in Flow as a medical device or establish equivalence to ECG-derived HRV.

### Evidence tiers

Every row in this document belongs to exactly one evidence tier. Tiers do not substitute for one another: a build pass never satisfies a physical-observation row.

- **Automated** — deterministic results from the JavaScript release matrix (`pnpm test`, `test:coverage`, `typecheck`, `lint`, `format:check`, web `build`). Proves logic and rendering in a simulated DOM only.
- **Simulator** — behavior observed on an OS simulator/emulator. Not yet available for this candidate (see the iOS rows below).
- **Build** — the native toolchains compile and package the app (Capacitor sync, Android Gradle assemble, iOS xcodebuild). Proves the project links and packages; proves nothing about on-device sensor behavior.
- **Observed physical** — a human ran the app on named hardware and recorded what they saw. This is the only tier that satisfies the device matrix, the per-device checklists, and release sign-off. No automated agent can produce it.

## Supported native versions

| Platform | Project support floor | Intended build target                                         | Release expectation                                                                                                        |
| -------- | --------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| iOS      | iOS 16.0              | Xcode 26.2, iOS 26.2 platform, iPhone 16 Pro simulator target | Launch and complete supported flows on iOS 16 and a current supported iOS version                                          |
| Android  | Android 7.0 / API 24  | Android API 36                                                | Launch and complete supported flows on API 24 and API 36 hardware, or the nearest available versions with any gap recorded |

Camera, flash/torch, and motion sampling remain capability-dependent even on a supported operating-system version. A device that cannot supply a required sensor must receive an actionable unavailable state rather than a false successful measurement.

## Native build verification (Build tier)

Build and synchronization evidence does not complete any physical-device (Observed) check below. Evidence recorded 2026-07-21 on macOS 15 (Darwin 24.6.0), Apple silicon, from `main` after the family-validation prep commit. The app build under test is the Android `app-debug.apk` with SHA-256 `8787ca45a88e3edcad991ae1758c94cea9e9249389e008b04ef960bea579cd31`.

| Check                            | Tier      | Result             | Evidence                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | --------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript release matrix        | Automated | Passed             | `pnpm test` 1120 tests, 0 skipped (shared 267, database 3, web 850). Coverage gates met (stmts 90.45%, branches 82.42%, funcs 87.98%, lines 92.08%). `typecheck`, `lint`, `format:check`, web `build` all clean.                                                                                                                                                                                         |
| Capacitor Android/iOS sync       | Build     | Passed             | `cap sync` registered 7 native plugins for both platforms (keep-awake, text-to-speech, app, device, filesystem, share, torch; `@capacitor/motion` is JS-only). CocoaPods `pod install` completed. Tracked native diff limited to generated plugin/pod registration for the three new plugins plus filesystem's transitive `IONFilesystemLib` pod.                                                        |
| Android debug build              | Build     | Passed             | `env JAVA_HOME=…/openjdk@21 ./gradlew assembleDebug` → `BUILD SUCCESSFUL in 51s`. Output `packages/web/android/app/build/outputs/apk/debug/app-debug.apk`, 10,261,555 bytes, SHA-256 `8787ca45a88e3edcad991ae1758c94cea9e9249389e008b04ef960bea579cd31`. Only benign filesystem-plugin Kotlin deprecation warnings.                                                                                      |
| Repository iOS simulator command | Build     | Blocked externally | Xcode 26.2 (build 17C52), SDK `iphonesimulator26.2`. The scheme reports "Supported platforms for the buildables in the current scheme is empty" and only exposes the ineligible `Any iOS Device` destination.                                                                                                                                                                                            |
| Direct installed-simulator build | Build     | Blocked externally | Signing-disabled `xcodebuild … -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO` and an explicit `iPhone 15 Pro, OS=17.5` destination both fail: `xcodebuild: error: Unable to find a destination matching the provided destination specifier: … { platform:iOS … error:iOS 26.2 is not installed. Please download and install the platform from Xcode > Settings > Components. }`. |

The iOS rows remain blocked and are **not** release passes; iOS native compilation is not verified. The intended verification target is an iPhone 16 Pro simulator backed by the iOS 26.2 platform. The current machine has only the iOS 17.5 simulator runtime installed, while Xcode 26.2 is missing its iOS 26.2 platform component. Install that component and target, or use a compatible Xcode/runtime pair and explicitly record the substituted target before rerunning verification.

## Connected-hardware enumeration (2026-07-21)

Device enumeration was attempted so any authorized hardware could be used. No representative mobile hardware was usable.

| Enumeration                                      | Result                 | Evidence                                                                                                                                                                                                                            |
| ------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adb devices -l`                                 | Could not enumerate    | The adb daemon (v1.0.41 / 37.0.1) fails to complete startup in this environment: every invocation prints `* daemon not running; starting now at tcp:5037` and then hangs. No Android device could be listed, authorized, or driven. |
| `xcrun xctrace list devices`                     | No physical iOS device | Lists only the host Mac (`Justin's M2`). No iPhone/iPad connected.                                                                                                                                                                  |
| USB inspection (`system_profiler SPUSBDataType`) | No phone attached      | The only external Samsung USB device is a mass-storage unit (Vendor `0x04e8`, Product `0x61fb`, 10 Gb/s) — a Samsung portable SSD, not an Android phone.                                                                            |

Because no connected representative phone was reachable, the Android `app-debug.apk` was **not** installed or launched on hardware, and no iOS device install/launch was performed. All Observed-physical rows below remain **not run — no connected representative hardware**.

## Device matrix

Use exact model, operating-system build, app commit, build identifier, and reference-device firmware in the evidence log. Every cell below is an Observed-physical check and requires a human on the named hardware; none can be satisfied by the Build-tier evidence above. As of 2026-07-21 no representative phone was connected (see Connected-hardware enumeration), so all rows read **not run — no connected representative hardware**.

| Physical device   | OS                               | Camera and flash        | Motion sampling         | Background interruption | Permission denial and recovery | Thermal behavior        | Trusted reference comparison | Status    |
| ----------------- | -------------------------------- | ----------------------- | ----------------------- | ----------------------- | ------------------------------ | ----------------------- | ---------------------------- | --------- |
| iPhone model TBD  | iOS 16.x support floor           | ☐ Not run — no hardware | ☐ Not run — no hardware | ☐ Not run — no hardware | ☐ Not run — no hardware        | ☐ Not run — no hardware | ☐ Not run — no hardware      | ☐ Pending |
| iPhone model TBD  | Current supported iOS            | ☐ Not run — no hardware | ☐ Not run — no hardware | ☐ Not run — no hardware | ☐ Not run — no hardware        | ☐ Not run — no hardware | ☐ Not run — no hardware      | ☐ Pending |
| Android model TBD | Android 7 / API 24 support floor | ☐ Not run — no hardware | ☐ Not run — no hardware | ☐ Not run — no hardware | ☐ Not run — no hardware        | ☐ Not run — no hardware | ☐ Not run — no hardware      | ☐ Pending |
| Android model TBD | Android 16 / API 36 target       | ☐ Not run — no hardware | ☐ Not run — no hardware | ☐ Not run — no hardware | ☐ Not run — no hardware        | ☐ Not run — no hardware | ☐ Not run — no hardware      | ☐ Pending |

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

Add one entry per executed device/protocol combination. Only Observed-physical runs belong here; Build-tier evidence lives in the section above.

| Date       | App commit/build                                 | Device and OS             | Protocol and sensor mode | Reference device | Result                                         | Evidence link or notes                                                                                                                          |
| ---------- | ------------------------------------------------ | ------------------------- | ------------------------ | ---------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-21 | app-debug.apk SHA-256 `8787ca45…a579cd31` (main) | none — no phone connected | n/a                      | n/a              | Not run — no connected representative hardware | adb daemon could not start; xctrace shows only the host Mac; sole Samsung USB device is a portable SSD. APK not installed/launched on hardware. |
| Not run    | —                                                | —                         | —                        | —                | Pending                                        | No physical-device observation evidence recorded                                                                                                |

## Release sign-off

- [ ] Support-floor iOS device checks complete.
- [ ] Current iOS device checks complete.
- [ ] Support-floor Android device checks complete.
- [ ] API 36 Android device checks complete.
- [ ] Any sensor-specific exclusions are documented in product copy.
- [ ] Comparison findings have been reviewed without medical or diagnostic claims.
