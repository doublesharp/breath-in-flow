# Kokoro voice guidance

The app bundles four Kokoro voices: Heart and Bella (American female), Michael (American male), and Emma (British female). Each has ten English cues: Full Breath In, Full Breath Out, Hold, Warmup starting, Rest quietly, and all five trial announcements for the fixed resonance assessment rates. Each cue is generated ahead of time. No speech model, account, API key, or hosted inference service is needed during practice.

Kokoro voices appear first in the picker; Heart is the default when no voice was chosen. A Preview voice button plays the selected inhale cue. Explicit device voice choices remain available. Recommendations without a voice preserve the current selection; saved sessions with an explicit voice keep their own choice. Custom text and failed clip playback use device speech. A temporary failure to discover device voices does not overwrite a saved preference.

## Playback behavior

The existing TTS service owns one audio element at a time. New cues, pause, stop, disabling guidance, changing voice, or unmounting stop the previous speech. Each request has an identity so a superseded clip's late error cannot restart speech. Failed clips fall back only once and only before the phase deadline. Native speech waits for pending native cancellation and checks that the request is still current.

TTS settings watchers apply synchronously. Starting a recommended preset changes the configuration and starts the timer in one event; deferred watchers previously left the first phase using stale voice settings. The real browser playback test reproduced this before the change.

## Generation and provenance

Run `pnpm generate:voices` from the repository root after `pnpm install`, with FFmpeg available on PATH. This optional development command uses pinned `kokoro-js@1.2.1`, published May 3, 2025. The seven-day dependency policy remains enabled without exclusions; all 48 newly locked package versions were independently checked against the September 5, 2026 04:56:59 UTC cutoff.

The generator downloads model revision `1939ad2a8e416c0acfeecc08a694d14ef25f2231` from `onnx-community/Kokoro-82M-v1.0-ONNX`, last modified February 8, 2025. Kokoro.js ignores a revision option, so the script downloads and loads an explicit local snapshot. The cache lives under ignored `node_modules/.cache/kokoro`. It generates all four voices with full-precision inference at speed 0.9, then encodes 24 kHz mono MP3 at 96 kbps using FFmpeg libmp3lame. Speaking speed is fixed during generation; playback stays at rate 1, including during short phases.

The 40 clips total about 1,401 KiB on disk. `packages/web/public/audio/kokoro` includes license and attribution notices. The provenance file records the model revision, generator version, voice, text, settings, and SHA-256 hashes of the model/tokenizer/voice inputs. Model inference is absent from the web and Electron bundles; Vite copies the public audio into each build.

## Verification

Regression tests cover Kokoro availability without device voices, selected device voices, fallback, stale errors, disabling guidance, phase deadlines, saved preferences, ordering, and pause cancellation. Review reproduced two preference/picker defects, both fixed with failing tests first.

The browser regression decodes all 40 real files and requires non-silent samples. It previews each voice through the settings UI, checks normal playback rate and cancellation of the previous clip, then starts the recommended routine and checks that Emma remains selected for actual inhale playback. Pausing stops the clip. Hosted services are blocked throughout that test.

Local Whisper tiny transcription recovered every trial rate and the intended phrases except three ambiguous recognitions: Heart and Michael's "Trial 1" became "Try a one", and Bella's isolated "Hold" became "Cold". This is an automated cross-check, not a subjective listening assessment. User demos use the actual app clips at 90% speed, separated by 750 ms pauses. Physical iOS and Android audio hardware remains untested.

The initial single-voice integration passed 1,198 tests and the configured coverage thresholds, type checks, lint, web/Electron builds, and browser checks. The multi-voice expansion adds exact cue routing for each voice and preference regressions. Final expansion checks passed: 1,206 tests in 66 files and all configured coverage thresholds (web: 92.63% lines, 83.86% branches), type checks, lint, web/Electron builds, and six browser tests with three existing platform-specific skips. All 46 audio, provenance, and notice files are byte-identical in the web build and Android/iOS copies. Independent review found no remaining blockers.
