# Pulse Variability and HRV-Style Analysis

## Product boundary

Breath in Flow provides phone-based pulse timing for personal wellness and breathing-training feedback. The camera path measures photoplethysmography (PPG), so its beat-to-beat output is pulse-rate variability rather than clinical ECG-derived HRV. Chest-motion sensing is experimental. Neither path diagnoses a condition or replaces a validated medical device or professional assessment.

The UI uses **Pulse Variability** for the feature and labels camera sensing **Recommended**. Chest and combined modes are labeled **Beta**.

## Measurement contract

The analysis boundary deliberately distinguishes two types of output:

1. A `HeartRateEstimate` is a smoothed pulse-rate estimate. It may come from autocorrelation when the waveform is periodic enough to estimate a rate, but individual beats cannot be located reliably.
2. An `IBISample` is an interval between two detected beat events. It contains a timestamp, interval, quality score, source, and detection provenance.

Only eligible `IBISample` values enter variability analysis. The app never converts an autocorrelation rate estimate into evenly spaced synthetic intervals. This prevents a smooth fallback estimate from appearing as artificially low or otherwise misleading variability.

Combined mode matches contemporaneous camera and chest detections and emits at most one fused interval for a heartbeat. If a sensor becomes unavailable, the session reports the degraded state rather than silently fabricating the missing stream.

## Sensors

### Camera PPG — Recommended

The user covers the rear camera and flash with a fingertip while keeping the phone still. The detector filters the optical waveform, locates candidate beats, rejects implausible timing, and attaches quality and provenance to accepted intervals.

Camera measurements are sensitive to pressure, hand movement, cold fingers, ambient-light leakage, camera exposure behavior, and device-specific frame timing. A steady pulse-rate estimate can still be shown when individual beat timing is not trustworthy, but that estimate is excluded from variability metrics.

### Chest motion — Beta

The phone's motion sensor attempts to detect heartbeat-related chest vibration while the device rests securely on the sternum. Placement, breathing movement, clothing, phone hardware, and operating-system sampling behavior materially affect the signal. Treat this mode as experimental and use the camera mode when a repeatable phone-only reading is the priority.

### Combined mode — Beta

Combined mode cross-checks detections from both sensors. It does not guarantee higher accuracy: a poor-quality second signal may add no useful information. The app tracks sensor-specific failures and only fuses detections that satisfy its time and interval agreement rules.

## Eligibility gates

A recording must pass every applicable gate before analysis:

- minimum protocol duration;
- enough detected beats for the observed duration;
- finite, monotonic timestamps and finite quality values;
- physiologically plausible interval bounds;
- known detected-beat provenance rather than estimated samples;
- mean signal quality of at least 0.5;
- no more than 10% detected artifacts; and
- no unresolved sensor error.

Recordings with 5–10% artifacts receive a warning. Ineligible recordings save the reason for the UI and expose retry, change-sensor, and cancel actions instead of showing default metric values.

## Protocols and available metrics

| Protocol          | Eligibility duration | Intended output                                                               |
| ----------------- | -------------------: | ----------------------------------------------------------------------------- |
| Quick Check       |           60 seconds | Average pulse and short-recording time-domain variability                     |
| Morning Readiness |          120 seconds | Average pulse and short-recording time-domain variability                     |
| Full Analysis     |          300 seconds | Time-domain, Poincare, and frequency-domain results                           |
| Resonance Trial   |          120 seconds | Average pulse and breathing-training response measures                        |
| Freeform          |   60 seconds minimum | Short-recording metrics below 300 seconds; full groups at 300 seconds or more |

The guided Lab durations may be longer than the minimum eligibility duration. Ending a guided protocol early does not make a too-short recording eligible.

### Time-domain output

Eligible recordings can report average pulse, RMSSD, pNN50, and SDNN appropriate to their duration. Short recordings label SDNN as a short-recording value. These values are best interpreted as within-person wellness trends collected under similar conditions.

### Frequency-domain output

The app uses a Lomb–Scargle periodogram for irregularly timed intervals. Frequency-domain output is available only for an eligible recording of at least 300 seconds. When the requirement is not met, the result is `unavailable` with a reason; LF, HF, total power, peaks, and ratios are not filled with zeros or plausible-looking defaults.

Frequency bands are reported as signal components. The app does not infer a diagnosis or assign a single autonomic meaning to LF, HF, or LF/HF values.

## Lifecycle and failure behavior

- Sensor permissions are requested in context when a measurement begins.
- A session cannot report success until its requested sensors actually start.
- A session that receives no usable beat intervals fails explicitly.
- `stop()` is idempotent, which prevents duplicate completion and persistence.
- If both sensors fail in combined mode, the measurement stops rather than remaining in a misleading active state.
- Measurement metadata records algorithm version `2`, eligibility, provenance, and unavailable-metric reasons.

## Reading a result responsibly

- Measure at rest, at a similar time and posture, and under repeatable conditions.
- Keep the device and sensing finger still.
- Prefer a trend across multiple eligible recordings over a single value.
- Do not compare phone PPG values directly with ECG-derived clinical norms.
- Treat symptoms and clinical questions as reasons to consult a qualified professional, not as prompts to repeat a phone measurement.

## Privacy

Breathing sessions, presets, and measurement records are stored locally on the device. Camera frames are processed during sensing and are not archived as photos or video by the app.

## Verification

The signal-processing and eligibility code has automated coverage for detection provenance, insufficient duration and beats, invalid timing, artifacts, pulse-estimate separation, fusion deduplication, sensor startup failures, no-data completion, and unavailable frequency metrics. Coverage thresholds are enforced per workspace, with additional floors on the eligibility and sensing lifecycle modules.

## References

These sources inform the feature boundary and conservative training guidance; they do not validate this app as a medical device:

- [Photoplethysmography and HRV measurement considerations](https://pmc.ncbi.nlm.nih.gov/articles/PMC7744620/)
- [Inspiratory muscle training trial methods and safety reporting](https://bmjopen.bmj.com/content/11/9/e049545)
- [Review of inspiratory muscle training protocols](https://pmc.ncbi.nlm.nih.gov/articles/PMC10840713/)
