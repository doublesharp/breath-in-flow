# Test audit and app fixes

Audited the current checkout starting at `0533a87`. The original unit and component suite passed all 1,160 tests. Passing tests still concealed defects in the active Vue timer and hold-history chart.

## Findings and fixes

| Area                    | Evidence                                                                                                                                                                                 | Fix                                                                                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase timing            | The test accepted several possible phases and added timing buffers. Exact deadlines failed, and ten repetitions with 1.25-second inhale/exhale phases had not finished at 25 seconds.    | Transition synchronously and carry scheduled deadlines into subsequent phases. Use a monotonic clock so wall-clock corrections cannot change the countdown. |
| Pause and hold accuracy | Pausing at 350 ms preserved only 300 ms. Ending a tolerance hold at 5.25 seconds recorded 5.2. A pause just after a fractional phase deadline lost the overflow.                         | Snapshot actual elapsed time when pausing or ending a hold and preserve elapsed milliseconds across resume.                                                 |
| Unnecessary scheduling  | Resuming at `SET_COMPLETE` restarted a 100 ms interval. Stopping at a phase deadline left a queued transition timeout.                                                                   | Keep the interval stopped between sets and remove deferred transition tasks. Tests assert zero outstanding timers in both cases.                            |
| Countdown audio         | Sound tests only checked that the timer started. A click occurred at 100 ms while the display still showed the original second.                                                          | Match clicks to the displayed countdown boundaries. An additional delayed-callback test ensures catch-up emits one click, avoiding overlapping audio.       |
| Time formatting         | Fractional minute boundaries displayed values such as `1:60`.                                                                                                                            | Round the full duration before splitting minutes and seconds.                                                                                               |
| Hold progress           | Tests checked static labels instead of the improvement value. With holds of 10 and 20 seconds, the chart displayed no change because its first and last groups contained the same holds. | Compare equal-sized, separate groups of up to three holds. Tests cover increasing, decreasing, unchanged, and short histories.                              |
| Landscape screenshot    | The onboarding reference depended on automatic scrolling. The original revision and fixed app produced byte-identical actual screenshots, both differing from the reference.             | Set the scroll position explicitly, assert the heading is visible, and refresh only that reference image after visual inspection.                           |

## Test corrections

- Replaced conditional assertions, broad phase alternatives, and formula-copying assertions with explicit observable results.
- Replaced direct timer-state injection with start, skip, pause, resume, and elapsed-time actions. The composable test file no longer manufactures internal states.
- Replaced chart substring checks with values tied to their labels. A test previously accepted the digit `3` inside the best hold value `30s` as evidence about the session count.
- Made the ectopic-beat preprocessing test require detection and correction. Its previous assertion was skipped if detection failed. The stronger test passed without a sensor algorithm change.
- Ran regression tests before production fixes and verified the expected failures. Review also reproduced and caught overlapping catch-up clicks, which were fixed before final verification.

## Final verification

- `pnpm test:coverage`: 1,177 tests passed across 66 files. All configured coverage thresholds passed.
- Web coverage: 91.92% lines, 83.00% branches. Shared coverage: 98.98% lines, 92.48% branches.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:build-script`, and `pnpm build`: passed.
- Full Playwright suite: five browser tests passed; three platform-specific duplicates were intentionally skipped by the existing configuration. Screenshots cover the session flow and phone, landscape, and desktop layouts.
- Independent read-only review confirmed the timer corrections and found no remaining blocking issues in the reviewed production diff.

Efficiency improvements are supported by scheduler and callback counts, not a device battery or CPU benchmark. This pass focused on reproducible test clues in the active timer, shared display formatting, and hold-history presentation. Native hardware and sensor accuracy were not measured.
