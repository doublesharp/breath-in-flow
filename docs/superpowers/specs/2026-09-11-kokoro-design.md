# Kokoro voice guidance

The app bundles Kokoro Heart audio for five standard English cues: Full Breath In, Full Breath Out, Hold, Warmup starting, and Rest quietly. Each cue is generated ahead of time. No speech model, account, API key, or hosted inference service is needed during practice.

Kokoro Heart is the first voice in the picker and the default when no voice was chosen. Explicit device voice choices remain available. Custom text and failed clip playback use device speech. A temporary failure to discover device voices does not overwrite a saved preference.

## Playback behavior

The existing TTS service owns one audio element at a time. New cues, pause, stop, disabling guidance, changing voice, or unmounting stop the previous speech. Each request has an identity so a superseded clip's late error cannot restart speech. Failed clips fall back only once and only before the phase deadline. Native speech waits for pending native cancellation and checks that the request is still current.

TTS settings watchers apply synchronously. Starting a recommended preset changes the configuration and starts the timer in one event; deferred watchers previously left the first phase using stale voice settings. The real browser playback test reproduced this before the change.

## Generation and provenance

Run `pnpm generate:voices` from the repository root after `pnpm install`. This optional development command uses pinned `kokoro-js@1.2.1`, published May 3, 2025. The seven-day dependency policy remains enabled without exclusions; all 48 newly locked package versions were independently checked against the September 5, 2026 04:56:59 UTC cutoff.

The generator downloads model revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231` from `onnx-community/Kokoro-82M-v1.0-ONNX`, last modified February 8, 2025. Kokoro.js ignores a revision option, so the script downloads and loads an explicit local snapshot. The cache lives under ignored `node_modules/.cache/kokoro`. It generates 24 kHz mono WAV clips with `af_heart`, full-precision inference, and speed 0.9.

The five clips total about 828 KiB on disk. `packages/web/public/audio/kokoro` includes license and attribution notices. The provenance file records the model revision, generator version, voice, text, settings, and SHA-256 hashes of the model/tokenizer/voice inputs. Model inference is absent from the web and Electron bundles; Vite copies the public audio into each build.

## Verification

Regression tests cover Kokoro availability without device voices, selected device voices, fallback, stale errors, disabling guidance, phase deadlines, saved preferences, ordering, and pause cancellation. Review reproduced two preference/picker defects, both fixed with failing tests first.

The browser regression decodes all five real files and requires non-silent samples, starts the recommended routine, observes actual inhale playback, and pauses it. Hosted services are blocked throughout that test. Local Whisper transcription independently returned the intended words for all five clips. This checks intelligibility, not a subjective listening assessment; physical iOS and Android audio hardware remains untested.

Final checks passed: 1,198 tests across 66 files with all configured coverage thresholds; web coverage is 92.41% lines and 83.47% branches. Type checks, lint, build-script tests, web/Electron builds, frozen installation, and peer checks passed. The browser suite passed six tests with three existing platform-specific skips. Re-running generation succeeded from the cached snapshot. The web, Android, and iOS copies contain byte-identical audio and notices. Independent review found no remaining blockers.
