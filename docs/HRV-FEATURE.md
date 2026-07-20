# Pulse Variability and HRV-Style Analysis

## Product boundary

Breath in Flow provides phone-based pulse timing for personal wellness and breathing-training feedback. The camera path measures photoplethysmography (PPG), so its beat-to-beat output is pulse-rate variability rather than clinical ECG-derived HRV. Chest-motion and combined sensing use phone motion and camera signals under explicit quality gates. None of these paths diagnoses a condition or replaces a validated medical device or professional assessment.

The UI uses **Pulse Variability** for the feature and labels camera sensing **Recommended**. Camera, chest-motion, and combined modes are supported choices; preparation and signal-quality guidance explains the requirements of each mode.

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

### Chest motion

The phone's motion sensor attempts to detect heartbeat-related chest vibration while the device rests securely on the sternum. An adaptive motion gate rejects large movement before beat timing is emitted. Placement, breathing movement, clothing, phone hardware, and operating-system sampling behavior materially affect the signal, so the phone must remain secure and still.

### Combined mode

Combined mode cross-checks detections from both sensors after estimating their stable timing offset. A camera/chest pair produces one fused event for one beat and cannot later be emitted again as an unmatched event. Combined sensing does not guarantee higher accuracy: a poor-quality second signal may add no useful information. The app records fused and single-sensor contributions and reports sensor-specific failures.

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

Protocol duration is the clean interval analyzed after trimming, not wall-clock capture time. The app discards a five-second settling window and a three-second ending window. Acquisition therefore lasts eight seconds longer than the requested analyzed interval. Eligibility is calculated from the retained detected intervals after trimming and artifact filtering.

| Protocol          | Minimum analyzed time | Minimum capture time | Intended output                                                               |
| ----------------- | --------------------: | -------------------: | ----------------------------------------------------------------------------- |
| Quick Check       |            60 seconds |           68 seconds | Average pulse and short-recording time-domain variability                     |
| Morning Readiness |           120 seconds |          128 seconds | Average pulse and short-recording time-domain variability                     |
| Full Analysis     |           300 seconds |          308 seconds | Time-domain, Poincaré, and frequency-domain results                           |
| Resonance Trial   |           120 seconds |          128 seconds | Average pulse and supported breathing-training response measures              |
| Freeform          |    60 seconds minimum |  analyzed time + 8 s | Short-recording metrics below 300 seconds; full groups at 300 seconds or more |

Guided Lab durations may be longer than these minimums. Elapsed capture time by itself does not establish eligibility, and ending a guided protocol early does not make a too-short retained segment eligible.

### Availability contract

Every metric group is explicitly available or unavailable. Unavailable groups include a concrete reason such as analyzed duration, detected-beat count, signal quality, missing breathing-rate context, or an unresolved sensor error; the UI does not substitute zero.

- Basic pulse rate and supported time-domain measures require enough clean detected beats and a stable interval series.
- Poincaré output requires enough successive eligible intervals to form meaningful pairs.
- General frequency-domain output requires at least five minutes of eligible analyzed data.
- Short resonance trials can report supported dominant-frequency, concentration, and breathing-response measures, but are not labeled as general five-minute frequency analysis.
- Absolute spectral power is not presented as a trusted clinical value. Spectral summaries emphasize relative or normalized power and response concentration.

### Time-domain output

Eligible recordings can report average pulse, RMSSD, pNN50, and SDNN appropriate to their duration. Short recordings label SDNN as a short-recording value. These values are best interpreted as within-person wellness trends collected under similar conditions.

### Frequency-domain output

The app uses a Lomb–Scargle periodogram for irregularly timed intervals. Frequency-domain output is available only for an eligible recording of at least 300 seconds. When the requirement is not met, the result is `unavailable` with a reason; LF, HF, total power, peaks, and ratios are not filled with zeros or plausible-looking defaults.

Frequency bands are reported as signal components. The app does not infer a diagnosis or assign a single autonomic meaning to LF, HF, or LF/HF values.

## Lifecycle and failure behavior

- Camera and motion permissions are requested from the user's Start action before the timed protocol begins. Permission denial leaves the current data intact and offers an actionable retry or sensor change.
- A session cannot report success until its requested sensors actually start.
- A session that receives no usable beat intervals fails explicitly.
- `stop()` is idempotent, which prevents duplicate completion and persistence.
- If both sensors fail in combined mode, the measurement stops rather than remaining in a misleading active state.
- When the app becomes inactive or the document is hidden, an active Pulse Variability capture stops and releases camera, torch, motion listeners, timers, speech, animation frames, and keep-awake state. Partial capture is not saved as successful, and the foreground UI offers a clean restart.
- An active breathing practice pauses on interruption and retains a recoverable session state; it is not left orphaned as in progress.
- Lifecycle listeners are registered once, removed on unmount, and safe across repeated background and foreground transitions.
- Measurement metadata records eligibility, active sensor sources, detected-event provenance, quality, and unavailable-metric reasons even after live resources have been released.

## Reading a result responsibly

- Measure at rest, at a similar time and posture, and under repeatable conditions.
- Keep the device and sensing finger still.
- Prefer a trend across multiple eligible recordings over a single value.
- Do not compare phone PPG values directly with ECG-derived clinical norms.
- Treat symptoms and clinical questions as reasons to consult a qualified professional, not as prompts to repeat a phone measurement.

## Privacy

Breathing sessions, presets, and measurement records are stored locally on the device. Pulse Variability measurements and resonance assessments use IndexedDB as their authoritative store; breathing configurations and sessions remain in localStorage. No account or cloud sync is required.

On initialization, valid legacy resonance assessments are migrated from localStorage to IndexedDB. Migration is idempotent, does not duplicate an existing assessment, and records completion only after successful persistence. Stored data is validated one record at a time; safe legacy defaults are applied where documented, and one corrupt record cannot prevent valid siblings from loading. Camera frames are processed during sensing and are not archived as photos or video by the app.

Removing app data, clearing browser/site storage, or uninstalling the application can delete this local history. The app does not currently provide cross-device backup or account recovery.

## Device and method limitations

- Camera mode requires access to a suitable rear camera. Torch support varies by device and browser/webview; ambient light, finger temperature, pressure, movement, exposure behavior, and frame timing affect the signal.
- Chest-motion mode requires motion permission and a sampling rate capable of resolving the signal. Device placement, case, clothing, breathing movement, and operating-system throttling affect detection.
- Combined mode can improve agreement information but does not guarantee a more accurate result than a clean camera recording.
- Long camera-and-flash captures can warm a device. Stop if the device reports a thermal warning or becomes uncomfortable to hold.
- Background execution is not supported for measurements. Switching apps, locking the device, or hiding the page interrupts capture and requires restart.
- A result is not evidence that the implementation matches a clinical ECG or another consumer device. Comparison against a trusted reference is a separate physical-device validation activity.
- Results are intended for repeatable within-person wellness trends. They do not identify a disease, determine recovery status, recommend treatment, or explain symptoms.

Supported native deployment targets and the uncompleted physical-device checks are tracked in [PULSE-VARIABILITY-DEVICE-VALIDATION.md](PULSE-VARIABILITY-DEVICE-VALIDATION.md).

## Verification

The signal-processing and eligibility code has automated coverage for detection provenance, insufficient duration and beats, invalid timing, artifacts, pulse-estimate separation, fusion deduplication, sensor startup failures, no-data completion, and unavailable frequency metrics. Coverage thresholds are enforced per workspace, with additional floors on the eligibility and sensing lifecycle modules.

## References

These sources inform the feature boundary and conservative training guidance; they do not validate this app as a medical device:

- [Photoplethysmography and HRV measurement considerations](https://pmc.ncbi.nlm.nih.gov/articles/PMC7744620/)
- [Inspiratory muscle training trial methods and safety reporting](https://bmjopen.bmj.com/content/11/9/e049545)
- [Review of inspiratory muscle training protocols](https://pmc.ncbi.nlm.nih.gov/articles/PMC10840713/)
