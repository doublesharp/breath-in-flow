# Breath in Flow

Breath in Flow is a private, standalone wellness and training app for guided breathing practice. It runs on iOS, Android, desktop, and the web, with adjustable breath timing, repetitions, sets, recovery periods, and optional pulse-variability feedback.

> Breath in Flow is not a medical device and does not diagnose, treat, or monitor a health condition. Its camera and motion measurements are intended for personal wellness trends, not clinical decisions.

## Features

### Guided breathing routines

- Configure inhale, inhale hold, exhale, and exhale hold timing.
- Choose repetitions, sets, and timed rest between sets.
- Add optional timed or tolerance-based extended holds.
- Follow a large animated guide with pause, resume, skip-rest, and safe-stop controls.
- Save custom routines locally for quick reuse.

### Diaphragm resistance training

The guided **Diaphragm Resistance Starter** preset uses a 3-second inhale, 1-second hold, 4-second exhale, 1-second hold, 10 repetitions, 2 sets, and 60 seconds of rest between sets. Its in-app guide explains:

- how to position and use an inspiratory resistance trainer;
- how endurance-oriented and strength-oriented sessions differ;
- how to begin conservatively and progress gradually; and
- when to stop and seek advice from a qualified clinician.

Resistance is set on the physical trainer rather than in the app. Beginners should use the lowest comfortable resistance, keep the neck and shoulders relaxed, and stop if breathing becomes strained or symptoms develop.

### Preset techniques

The preset library also includes box breathing, 4-7-8 breathing, coherent breathing, cyclic breathing, and other configurable starting points. Presets are training guides, not prescriptions; shorten or stop a routine whenever it feels uncomfortable.

### Pulse Variability Lab

- Camera sensing is the recommended phone-only mode.
- Chest-motion and combined sensing are clearly marked **Beta**.
- Only intervals produced by detected beats are eligible for variability analysis. Pulse-rate estimates are displayed separately and are never converted into synthetic beat intervals.
- Recordings must pass duration, beat-count, signal-quality, artifact, timestamp, and provenance checks before metrics are reported.
- Frequency-domain metrics require an eligible recording of at least five minutes. Shorter protocols report supported time-domain measures and explain why frequency results are unavailable.
- Failed or empty measurements offer clear retry, sensor-change, and cancel actions.

Phone-camera pulse variability is related to, but not interchangeable with, ECG-derived HRV. Use repeatable resting conditions and look for personal trends rather than comparing a single value with another device or person.

### Local progress tracking

- Completed sessions and saved routines remain on the device.
- Session history and charts summarize practice consistency and recorded holds.
- Measurement records include signal eligibility and algorithm provenance.
- No account is required.

## Getting started

1. Open **Practice** and choose a preset or configure a routine.
2. Set the breath cadence, repetitions, sets, and optional rest time.
3. Tap **Start Practice** and follow the visual guide.
4. Pause or stop whenever needed. The app preserves a completed session summary instead of dropping back to configuration immediately.

For pulse variability, open **Lab**, select the recommended camera mode, read the preparation instructions, and remain still for the entire protocol.

## Safety

- Practice seated or lying down in a safe place, especially for unfamiliar routines.
- Never perform breath holds or rapid/cyclic breathing in water, while driving, while standing where a fall could cause injury, or during another safety-critical activity.
- Stop immediately and return to normal breathing if you feel dizzy, faint, confused, unusually short of breath, have chest pain, or otherwise feel unwell.
- Do not force a hold or resistance level. Progress gradually and allow recovery between sets.
- Ask a qualified healthcare professional before beginning if you are pregnant, have a cardiovascular or respiratory condition, have a history of fainting or seizures, are recovering from surgery or illness, or are uncertain whether breath or inspiratory-muscle training is appropriate for you.

## Development

The project is a pnpm workspace using Vue 3, TypeScript, Vite, Capacitor, Electron, Vitest, and Tailwind CSS.

```bash
corepack pnpm install
corepack pnpm test
corepack pnpm test:coverage
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for additional setup guidance and [docs/HRV-FEATURE.md](docs/HRV-FEATURE.md) for the measurement contract and limitations.

## License

MIT
