# Lab Tab — Design Spec

## Overview

A new "Lab" tab that consolidates all measurement and analysis features: standalone HRV measurement, resonance frequency assessment, historical data archival, trend visualization, and data-driven practice recommendations.

## Navigation

5 tabs: **Practice | Lab | History | Presets | Analytics**

Lab icon: beaker/flask SVG.

## Lab Tab Contents

### Section 1: Standalone HRV Measurement

**Guided protocols (default view):**

- "Quick Check" — 2 minutes, basic HRV snapshot (RMSSD, SDNN, meanHR, LF/HF)
- "Full Analysis" — 5 minutes, comprehensive HRV (all time-domain, frequency-domain, Poincaré)
- "Morning Readiness" — 3 minutes, focused on resting HRV baseline for daily tracking

Each protocol card shows: name, duration, what it measures, "Start" button.

**Freeform mode:** Toggle at top "Guided / Freeform". Freeform shows sensor selector + start button, user controls duration manually.

**Sensor selection:** Same 4 modes as assessment (manual, camera, accelerometer, dual).

**During measurement:** Audio cue "Measurement starting", real-time HR tachogram, signal quality indicator, countdown timer (guided) or elapsed timer (freeform), "Stop" button.

**After measurement:** Full HRV report — HrvMetricsDashboard, FrequencySpectrum, PoincaréPlot, HrTachogram of the full recording. "Save" button archives to IndexedDB. Option to add notes.

### Section 2: Resonance Frequency Assessment

Moved from Practice tab. Same ResonanceAssessment component, now rendered in Lab.

Shows last assessment result summary if one exists: "Your resonance frequency: 5.5 BPM (assessed Mar 24)".

### Section 3: Recent Results

List of last 5 HRV measurements with date, protocol, key metrics. "View All" links to History tab (or a dedicated sub-view).

## Practice Tab Changes

- Remove "Find My Resonance Frequency" button from BreathingPractice.vue
- Add dismissible CTA card: "Discover your optimal breathing rate" → switches to Lab tab
- CTA hidden once user has any HRV measurement or assessment (checked via storage)
- CTA also has an "x" dismiss button → sets `lab-cta-dismissed` flag

## IndexedDB Storage Layer

### New composable: `useHrvStorage`

Replace localStorage for HRV data with IndexedDB via a simple wrapper.

**Database:** `breath-in-flow-hrv`
**Object stores:**

- `measurements` — individual HRV measurement sessions
- `assessments` — RF assessment results (migrated from localStorage)

**Measurement record:**

```typescript
interface HrvMeasurement {
  id: string;
  type: 'quick-check' | 'full-analysis' | 'morning-readiness' | 'freeform' | 'assessment-trial';
  startedAt: Date;
  completedAt: Date;
  durationSeconds: number;
  sensorMode: 'none' | 'camera' | 'accelerometer' | 'dual';
  analysis: HRVAnalysis;
  breathingRateBPM?: number; // If during paced breathing
  assessmentId?: string; // If part of an RF assessment
  notes?: string;
  tags?: string[]; // e.g., 'morning', 'pre-practice', 'post-practice'
}
```

**Methods:**

- `saveMeasurement(measurement)` → Promise<void>
- `getMeasurements(options?: { limit?, after?, before?, type? })` → Promise<HrvMeasurement[]>
- `getMeasurementById(id)` → Promise<HrvMeasurement | null>
- `deleteMeasurement(id)` → Promise<void>
- `getLatestMeasurement()` → Promise<HrvMeasurement | null>
- `getMeasurementStats(days?)` → Promise<{ count, avgRmssd, avgLfPower, ... }>

**Migration:** On first load, migrate any existing `breath-in-flow-assessments` from localStorage into IndexedDB, then remove from localStorage.

## Historical Trend Charts

### In Lab tab — "Recent Results" section with mini sparklines

### In Analytics tab — full trend views (or a new sub-section):

- **RMSSD over time** — line chart, daily/weekly averages
- **LF Power over time** — line chart, tracks resonance training effectiveness
- **Morning readiness trend** — if user does morning checks, show readiness score over time
- **RF history** — if user has done multiple assessments, show how their RF has changed

## Data-Driven Recommendations

### Suggest-then-confirm (after RF assessment):

- "Based on your assessment, 5.5 BPM produced the strongest resonance. Apply this as your default breathing rate?" → [Apply] [Dismiss]
- Creates/updates the "My Resonance Frequency" preset

### Passive insights (ongoing):

- In Lab tab: "Your RMSSD has improved 15% over the last 2 weeks"
- In Lab tab: "Your LF power is consistently highest during afternoon sessions"
- In Practice tab (if HRV data exists): "Your HRV responds best to 5.5 BPM breathing"

Insights computed from archived data, shown as dismissible cards.

## Component Architecture

### New files:

- `packages/web/src/components/LabTab.vue` — Main Lab tab container
- `packages/web/src/components/HrvMeasurement.vue` — Standalone HRV measurement flow (protocols, sensor, real-time display, results)
- `packages/web/src/composables/useHrvStorage.ts` — IndexedDB wrapper for HRV data
- `packages/web/src/components/HrvTrends.vue` — Historical trend charts
- `packages/web/src/components/LabInsights.vue` — Data-driven insight cards

### Modified files:

- `packages/web/src/App.vue` — Add Lab tab to navigation
- `packages/web/src/components/BreathingPractice.vue` — Remove RF button, add Lab CTA
- `packages/web/src/composables/useStorage.ts` — Add `hasAnyHrvData()` check for CTA logic

### Moved:

- ResonanceAssessment.vue stays where it is but is rendered in LabTab instead of BreathingPractice

## Out of Scope

- Cloud sync / backup of HRV data
- Export to CSV/JSON
- Integration with Apple Health / Google Health Connect
- AI-powered coaching based on HRV trends
