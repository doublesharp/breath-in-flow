# Breath in Flow - Development Agents & Plan

## Project Overview

A breathing practice app for guided breathwork sessions with customizable breathing exercises, hold times, repetitions, and sets.

## Core Features

1. **Breathing Parameters Configuration**
   - Inhale time (seconds)
   - Inhale hold time (seconds)
   - Exhale time (seconds)
   - Exhale hold time (seconds)
   - Number of repetitions

2. **Extended Hold Feature**
   - At end of N repetitions, perform extended hold
   - Choose: Inhale and Hold OR Exhale and Hold
   - Option: Set specific duration OR use timer to record tolerance
   - Repeat the segment again with same or different hold type

3. **Set Management**
   - One complete segment = one set
   - Input target number of sets OR record completed sets
   - Track progress across sets

4. **Data Persistence**
   - Save practice configurations
   - Record session results
   - Track patient progress over time

## Technical Stack

- **Frontend**: Vue 3 + TypeScript + Vite
- **Styling**: TailwindCSS
- **Validation**: Zod
- **Storage**: localStorage (client-side persistence)
- **Package Manager**: pnpm with workspaces
- **Testing**: Vitest + Vue Test Utils
- **Desktop**: Electron (macOS, Windows, Linux)
- **Mobile**: Capacitor (iOS, Android)
- **Charts**: Chart.js + vue-chartjs

## Architecture

### Workspace Structure

```
breath-in-flow/
├── packages/
│   ├── shared/          # Shared types, schemas, utilities
│   ├── database/        # Prisma schema and database client
│   └── web/             # Vue frontend application
│       ├── electron/    # Electron main process
│       ├── ios/         # Capacitor iOS project
│       └── android/     # Capacitor Android project
├── pnpm-workspace.yaml
├── package.json
└── README.md
```

### Database Schema

- **ExerciseConfig**: Saved breathing configurations
- **Session**: Individual practice sessions
- **SessionSet**: Sets within a session
- **ExtendedHold**: Extended hold records

## Development Phases

### Phase 1: Project Setup ✅

- [x] Initialize pnpm workspace
- [x] Set up shared package with types and Zod schemas
- [x] Set up Prisma with SQLite
- [x] Set up Vue + Vite + TailwindCSS

### Phase 2: Core Logic ✅

- [x] Breathing timer logic
- [x] State machine for breathing phases
- [x] Extended hold timer with recording

### Phase 3: UI Components ✅

- [x] Configuration form
- [x] Breathing visualizer
- [x] Timer display
- [x] Set progress tracker
- [x] Session history view

### Phase 4: Data Layer ✅

- [x] Prisma models
- [x] localStorage for client-side persistence
- [x] Save/load configurations
- [x] Session recording

### Phase 5: Testing ✅

- [x] Unit tests for breathing logic
- [x] Component tests for UI
- [x] Integration tests

### Phase 6: Desktop & Mobile Builds ✅

- [x] Electron setup for desktop (macOS DMG working)
- [x] Capacitor setup for mobile (iOS/Android projects created)
- [x] Build scripts for all platforms
- [x] Centralized build commands from workspace root
- [x] Organized dist/ output directory structure

### Phase 7: Analytics & Charts ✅

- [x] Session history with visual charts
- [x] Line chart: breath hold times over sessions (HoldTimeChart)
- [x] Bar chart: sessions per week (SessionsPerWeekChart)
- [x] Progress trends and statistics
- [x] Quick stats dashboard (total sessions, sets, avg/max hold times)
- [ ] Export session data as PDF

### Phase 8: Patient Management (PLANNED)

- [ ] Multiple patient profiles
- [ ] Per-patient custom protocols
- [ ] Session notes and observations
- [ ] Diagnosis/condition tracking

### Phase 9: Wearable Integration (IN PROGRESS)

- [ ] Apple Health integration (HRV, Heart Rate, SpO2)
- [x] Garmin Connect API service structure (stress levels, HRV)
- [ ] Fitbit Web API (Heart Rate, SpO2)
- [x] Stress chart component (StressChart)
- [ ] Real-time stress correlation display
- [ ] Pre/post session biometric comparison

## Clinical Insights

### Altitude Adaptations

Standard 4-7-8 breathing (15 seconds without fresh air) can be stressful at altitude.
Adapted patterns like 3-5-7 reduce oxygen debt while maintaining parasympathetic activation.

### Key Principles

- Long exhale activates parasympathetic response (calming)
- Breath volume matters as much as timing
- Individual patterns should be customized based on:
  - Altitude
  - Fitness level
  - Respiratory conditions
  - Patient tolerance

## Agent Responsibilities

### Setup Agent

- Initialize workspace structure
- Configure build tools and dependencies
- Set up testing framework

### Schema Agent

- Define Zod validation schemas
- Create TypeScript types
- Design Prisma database schema

### Logic Agent

- Implement breathing timer state machine
- Handle phase transitions
- Manage extended holds and repetitions

### UI Agent

- Build Vue components
- Implement responsive design with TailwindCSS
- Create intuitive UX for therapists

### Testing Agent

- Write unit tests for core logic
- Create component tests
- Ensure coverage of edge cases
- Don't create lots of testing files, try to use the same ones with good names
- Don't pass results through `tail` and `head` for tests and coverage
- Run tests after each change to check for regressions or other issues

## Breathing Cycle State Machine

```
States:
- IDLE
- INHALE
- INHALE_HOLD
- EXHALE
- EXHALE_HOLD
- EXTENDED_INHALE_HOLD
- EXTENDED_EXHALE_HOLD
- SET_COMPLETE
- SESSION_COMPLETE

Transitions:
IDLE -> INHALE (start)
INHALE -> INHALE_HOLD (if hold time > 0) | EXHALE
INHALE_HOLD -> EXHALE
EXHALE -> EXHALE_HOLD (if hold time > 0) | INHALE (next rep) | EXTENDED_*_HOLD (at rep threshold)
EXHALE_HOLD -> INHALE (next rep) | EXTENDED_*_HOLD (at rep threshold)
EXTENDED_*_HOLD -> SET_COMPLETE (timed) | recording tolerance
SET_COMPLETE -> IDLE (next set) | SESSION_COMPLETE
```

## UI/UX Design Principles

1. Large, readable timer display
2. Clear phase indicators
3. Visual breathing guide (expanding/contracting circle)
4. Simple configuration with sensible defaults
5. Progress tracking visible at all times
6. Easy pause/resume/stop controls
