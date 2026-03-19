# Resonance Frequency Assessment — Design Spec

## Overview

A guided assessment workflow that walks users through the Lehrer-style resonance frequency protocol: a configurable warmup, five 2-minute breathing trials at decreasing rates (6.5→4.5 BPM), 2-minute rest periods between trials, and a scoring/selection screen to identify the user's individual resonance frequency. On completion, the app auto-creates a breathing preset at the selected rate.

## Motivation

Resonance frequency breathing maximizes heart-rate variability by matching breathing rate to the individual's cardiovascular resonance point. The standard clinical approach (Lehrer/Shaffer) tests 5 rates and selects the one producing the largest, smoothest HR oscillation. This feature brings that protocol into the app so users can find their rate without external tools or manual coordination.

## Trial Parameters (Fixed)

| BPM | Sec/Breath | Inhale (s) | Exhale (s) |
|-----|-----------|------------|------------|
| 6.5 | 9.23      | 3.7        | 5.5        |
| 6.0 | 10.00     | 4.0        | 6.0        |
| 5.5 | 10.91     | 4.4        | 6.5        |
| 5.0 | 12.00     | 4.8        | 7.2        |
| 4.5 | 13.33     | 5.3        | 8.0        |

All trials: 2-minute duration, no hold times, inhale/exhale only. The 5-step protocol always runs in full (6.5, 6.0, 5.5, 5.0, 4.5). Rest periods between trials are always 2 minutes.

## Data Model

### AssessmentTrial

Represents one 2-minute breathing trial:

```typescript
{
  rate: number              // BPM (6.5, 6.0, 5.5, 5.0, 4.5)
  inhaleTime: number        // seconds
  exhaleTime: number        // seconds
  durationSeconds: 120      // always 2 min

  // Scoring (filled after all trials complete)
  comfortRating?: number              // 1-5
  symptoms?: string[]                 // subset of ['airHunger', 'dizziness', 'chestEffort', 'urgeToSigh']
  hrAmplitude?: 'small' | 'medium' | 'large'
  waveformSmoothness?: 'jagged' | 'somewhatSmooth' | 'verySmooth'
  notes?: string
}
```

### AssessmentConfig

User-configurable warmup settings:

```typescript
{
  warmupDurationSeconds: number   // default 120 (2 min), user-configurable
  warmupRate: number              // default 6.0 BPM, user-configurable
  restDurationSeconds: 120        // always 2 min, not configurable
}
```

### AssessmentResult

Persisted after assessment completion:

```typescript
{
  id: string                     // UUID
  trials: AssessmentTrial[]      // all 5 scored trials
  selectedRate: number           // user's chosen BPM
  createdPresetId?: string       // ID of auto-created preset
  completedAt: Date
  config: AssessmentConfig       // warmup settings used
}
```

Stored in localStorage under key `breath-in-flow-assessments`.

## State Machine

The assessment flows linearly through these phases:

```
INTRO → WARMUP → TRIAL_BREATHING → TRIAL_REST → ... (×5 trials, ×4 rests) → SCORING → RESULT
```

### Phase Details

1. **INTRO** — Protocol explanation, warmup duration/rate pickers, "Start Assessment" button.
2. **WARMUP** — Guided breathing at configured warmup rate using BreathingVisualizer + useBreathingTimer. Auto-advances when timer completes.
3. **TRIAL_BREATHING** (×5) — 2-minute breathing at current trial rate. Header shows trial context (e.g., "Trial 3/5 — 5.5 BPM"). Uses BreathingVisualizer. Auto-advances to rest on completion.
4. **TRIAL_REST** (×4, skipped after final trial) — 2-minute countdown. Simple rest screen with text "Rest quietly". Auto-advances to next trial.
5. **SCORING** — All 5 trials displayed as cards. Each card: comfort rating (1-5), symptom toggles (air hunger, dizziness, chest effort, urge to sigh), HR amplitude (small/medium/large), waveform smoothness (jagged/somewhat smooth/very smooth), notes field. "Calculate Result" button computes suggestion.
6. **RESULT** — Shows suggested rate with explanation, all rates listed with scores. User can confirm suggestion or override. "Save & Create Preset" button finalizes.

## Scoring Algorithm

Used to suggest the best rate (not binding — user always makes final choice):

- HR amplitude: large = +3, medium = +2, small = +1
- Waveform smoothness: verySmooth = +3, somewhatSmooth = +2, jagged = +1
- Comfort: 5 = +3, 4 = +2, 3 = +1, 2 = 0, 1 = -1
- Each symptom present: -1
- Tie-breaker: prefer slower rate if no symptoms at that rate; otherwise prefer faster

The app highlights the suggested rate but the user selects the final winner.

## Component Architecture

### New Files

- `packages/web/src/components/ResonanceAssessment.vue` — Main assessment component managing the state machine and rendering phase-specific screens.

### Modified Files

- `packages/shared/src/schemas.ts` — New Zod schemas for AssessmentTrial, AssessmentConfig, AssessmentResult.
- `packages/web/src/composables/useStorage.ts` — New methods: `getAssessments()`, `saveAssessment(result)`.
- `packages/web/src/components/BreathingPractice.vue` — Add "Find My Resonance Frequency" button; conditionally render ResonanceAssessment instead of normal practice UI.

### No New Composable

The state machine is a linear wizard — straightforward enough to manage within the component. It uses `useBreathingTimer` for warmup and trial breathing, and a simple `setInterval` for rest countdowns.

### Reused Components

- `BreathingVisualizer` — used during warmup and trial breathing phases (unchanged).
- `useBreathingTimer` — drives the breathing timer during warmup and trials (unchanged).
- Sound and TTS services — inherited from user's current config (unchanged).

## UI Per Phase

- **INTRO**: Card layout consistent with existing config modal. Warmup duration picker, warmup rate picker, start button.
- **WARMUP / TRIAL_BREATHING**: BreathingVisualizer with header bar showing context ("Warmup — 6.0 BPM" or "Trial 3/5 — 5.5 BPM").
- **TRIAL_REST**: Centered countdown timer, muted styling, "Rest quietly" text. No visualizer.
- **SCORING**: Scrollable list of 5 trial cards with rating inputs. "Calculate Result" button at bottom.
- **RESULT**: Suggested rate highlighted. All rates listed with scores. Tap to select, "Save & Create Preset" to finalize.

## Entry Point

A "Find My Resonance Frequency" button in the Practice tab (in the config area or above the start button). Tapping it replaces the normal practice UI with `ResonanceAssessment.vue`. A back/cancel button returns to normal practice at any point.

## Storage

### New localStorage Key

`breath-in-flow-assessments` — Array of `AssessmentResult` objects.

### Preset Auto-Creation

On result confirmation, creates a `BreathingConfig`:

- `name`: "My Resonance Frequency — X.X BPM"
- `inhaleTime` / `exhaleTime`: from the selected trial
- `inhaleHoldTime`: 0, `exhaleHoldTime`: 0
- `repetitions`: 4
- `targetSets`: 0 (unlimited)
- All extended hold settings: disabled
- Sound/TTS: inherited from current config

Created via existing `createConfig()`. Automatically loaded as the active config so the user can immediately begin practicing at their resonance frequency.

### Assessment History

No dedicated viewing UI initially. Results are persisted for future use. The preset is the practical outcome.

## Out of Scope

- Real-time HRV measurement or device integration during assessment
- Customizable trial rates or order
- Assessment history viewing UI
- Comparative assessment analysis (before/after)
- Export/sharing of assessment results
