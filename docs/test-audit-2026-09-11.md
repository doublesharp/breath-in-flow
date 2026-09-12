# Dependency update and test audit

Started from `8e15558` with a clean checkout and 1,177 passing tests. Updated 27 direct packages and used stricter assertions to reproduce three app bugs before changing production code.

## Dependency policy

`pnpm-workspace.yaml` now enforces `minimumReleaseAge: 10080`, with no exclusions. Independently checked npm registry publication timestamps for all 180 new or changed locked package versions against the fixed cutoff **2026-09-05 04:56:59 UTC**. All passed; the newest was Playwright 1.63.0, published September 4 at 22:45:21 UTC.

Key updates include Vue 3.5.42, Vite 8.2.2, Vitest 5.0.0, Playwright 1.63.0, Electron 44.2.0, Capacitor 8.5.1, Prisma 7.10.0, and Zod 4.5.4. TypeScript stays on 6.0.3 because the current lint toolchain does not support 7. Prisma stays on stable 7.10.0 because its latest tag points to an 8.0 release candidate. Releases inside the seven-day window remain excluded.

CI now selects the same pnpm 11.7.0 version as the manifest. The Node engine range reflects the installed toolchain. Added Electron to the active build-script allowlist: its entry in the legacy list did not install its binary. Rebuilding it installed and reported version 44.2.0. Capacitor sync refreshed native paths and the CocoaPods lock; the external IONFilesystemLib version remained unchanged. Prisma's adapter continues to use its own compatible better-sqlite3 12 dependency, alongside the direct package's version 13.

## Test clues and fixes

| Clue                                                                                | Reproduced behavior                                                                                                                                                             | Correction                                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard's formatting test only asserted the static Analytics heading.             | 59.5 seconds displayed as `60s`; 119.5 seconds displayed as `1m 60s`. The hold chart had the same defect.                                                                       | Assert values beside their labels, including minute boundaries. Round total seconds before splitting minutes and seconds.              |
| An RMSSD test explicitly expected a neutral comparison against a zero baseline.     | A new value of 50 after two zero readings was reported as similar.                                                                                                              | Compare against relative upper/lower bounds without division by zero; retain similar for zero against zero.                            |
| Trend tests did not establish that baseline readings preceded the selected reading. | With durations 148, 135, and 120 seconds in chronological order, only the middle reading matched both others; the latest reading incorrectly became part of its prior baseline. | Require two strictly earlier comparable readings. Reuse eligible records and avoid sorting each candidate baseline just to average it. |

The initial regression run produced six expected assertion failures: four formatting cases and the two trend cases. All pass with the fixes.

Also corrected tests that passed without exercising their named behavior: preset cancellation now clicks the actual modal Cancel button, saved/preset loading asserts emitted configuration data, and session deletion/cancellation require the buttons and verify callbacks. The two suites use one component import with per-mount storage mocks and automatically unmount wrappers and Teleports.

Vitest 5 coverage initially hit five-second dynamic-import timeouts with eight workers. Four workers eliminated those failures without raising timeouts; removing repeated imports also reduces unnecessary test setup work. These observations are not an application CPU or battery benchmark.

## Verification

- Final `pnpm test:coverage`: **1,190 tests passed across 66 files**, with all configured thresholds passing. Web: **92.10% lines**, **83.06% branches**.
- Focused corrected interaction tests: 17 passed.
- `pnpm typecheck`, `pnpm lint`, build-script tests, web build, and Electron build passed.
- Frozen-lockfile installation passed the supply-chain policy; no peer dependency issues.
- Playwright: five passed, three existing platform-specific skips; no snapshot updates needed.
- Capacitor Android/iOS sync and CocoaPods installation passed. Electron runtime reported `v44.2.0`.
- Independent review found no blocking issues in the production fixes.

Vite emits a future native-config-loader warning for the existing CommonJS package's TypeScript config files; current builds and tests pass. Native installers, device sensors, and speech quality were not exercised. No speech-engine change is included in this audit.
