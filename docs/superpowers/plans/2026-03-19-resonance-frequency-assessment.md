# Resonance Frequency Assessment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided resonance frequency assessment to the breathing app — 5 breathing trials with rest periods, scoring, and auto-preset creation.

**Architecture:** Self-contained `ResonanceAssessment.vue` component with its own state machine, reusing existing `BreathingVisualizer` and `useBreathingTimer`. New Zod schemas in shared package, new storage methods in `useStorage`, entry point button in `BreathingPractice.vue`.

**Tech Stack:** Vue 3 (Composition API, `<script setup>`), TypeScript, Zod, Vitest, happy-dom

**Spec:** `docs/superpowers/specs/2026-03-18-resonance-frequency-assessment-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `packages/shared/src/schemas.ts` | Modify | Add assessment Zod schemas and types |
| `packages/shared/src/index.ts` | Modify | Export new assessment types |
| `packages/web/src/composables/useStorage.ts` | Modify | Add assessment CRUD methods |
| `packages/web/src/components/ResonanceAssessment.vue` | Create | Assessment state machine, all phase UIs, scoring, result |
| `packages/web/src/components/BreathingPractice.vue` | Modify | Add "Find My Resonance Frequency" button, toggle to assessment view |
| `packages/web/tests/composables/useStorage.test.ts` | Modify | Tests for assessment storage methods |
| `packages/web/tests/components/ResonanceAssessment.test.ts` | Create | Tests for assessment component |

---

### Task 1: Assessment Schemas in Shared Package

**Files:**
- Modify: `packages/shared/src/schemas.ts` (append after line 373)
- Modify: `packages/shared/src/index.ts` (add exports)

- [ ] **Step 1: Add assessment Zod schemas to schemas.ts**

Append to end of `packages/shared/src/schemas.ts`:

```typescript
// ============================================
// Resonance Frequency Assessment Schemas
// ============================================

export const ASSESSMENT_TRIALS = [
  { rate: 6.5, inhaleTime: 3.7, exhaleTime: 5.5 },
  { rate: 6.0, inhaleTime: 4.0, exhaleTime: 6.0 },
  { rate: 5.5, inhaleTime: 4.4, exhaleTime: 6.5 },
  { rate: 5.0, inhaleTime: 4.8, exhaleTime: 7.2 },
  { rate: 4.5, inhaleTime: 5.3, exhaleTime: 8.0 },
] as const;

export const AssessmentSymptomSchema = z.enum([
  'airHunger',
  'dizziness',
  'chestEffort',
  'urgeToSigh',
]);
export type AssessmentSymptom = z.infer<typeof AssessmentSymptomSchema>;

export const HrAmplitudeSchema = z.enum(['small', 'medium', 'large']);
export type HrAmplitude = z.infer<typeof HrAmplitudeSchema>;

export const WaveformSmoothnessSchema = z.enum(['jagged', 'somewhatSmooth', 'verySmooth']);
export type WaveformSmoothness = z.infer<typeof WaveformSmoothnessSchema>;

export const AssessmentTrialSchema = z.object({
  rate: z.number(),
  inhaleTime: z.number(),
  exhaleTime: z.number(),
  repetitions: z.number(),

  // Scoring (filled after all trials)
  comfortRating: z.number().min(1).max(5).optional(),
  symptoms: z.array(AssessmentSymptomSchema).default([]),
  hrAmplitude: HrAmplitudeSchema.optional(),
  waveformSmoothness: WaveformSmoothnessSchema.optional(),
  notes: z.string().max(500).optional(),
});
export type AssessmentTrial = z.infer<typeof AssessmentTrialSchema>;

export const AssessmentConfigSchema = z.object({
  warmupDurationSeconds: z.number().min(60).max(300).default(120),
  warmupRate: z.number().min(4.5).max(7.0).default(6.0),
  restDurationSeconds: z.number().default(120), // fixed at 120, not user-configurable
});
export type AssessmentConfig = z.infer<typeof AssessmentConfigSchema>;

export const AssessmentResultSchema = z.object({
  id: z.string().uuid(),
  trials: z.array(AssessmentTrialSchema),
  selectedRate: z.number(),
  createdPresetId: z.string().uuid().optional(),
  completedAt: z.date(),
  config: AssessmentConfigSchema,
});
export type AssessmentResult = z.infer<typeof AssessmentResultSchema>;
```

- [ ] **Step 2: Add exports to index.ts**

Add to the schemas export block in `packages/shared/src/index.ts`:

```typescript
// In the export block from './schemas.js':
  ASSESSMENT_TRIALS,
  AssessmentSymptomSchema,
  HrAmplitudeSchema,
  WaveformSmoothnessSchema,
  AssessmentTrialSchema,
  AssessmentConfigSchema,
  AssessmentResultSchema,

// In the type export block:
  AssessmentSymptom,
  HrAmplitude,
  WaveformSmoothness,
  AssessmentTrial,
  AssessmentConfig,
  AssessmentResult,
```

- [ ] **Step 3: Verify shared package builds**

Run: `cd packages/shared && pnpm build`
Expected: Clean build with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/index.ts
git commit -m "feat: add resonance frequency assessment schemas"
```

---

### Task 2: Assessment Storage Methods

**Files:**
- Modify: `packages/web/src/composables/useStorage.ts`
- Modify: `packages/web/tests/composables/useStorage.test.ts`

- [ ] **Step 1: Write failing tests for assessment storage**

Add to `packages/web/tests/composables/useStorage.test.ts`:

```typescript
describe('Assessment operations', () => {
  beforeEach(() => {
    localStorageMock.clear();
    resetStorageForTesting();
  });

  it('should return empty array when no assessments exist', () => {
    const storage = useStorage();
    expect(storage.getAssessments()).toEqual([]);
  });

  it('should save and retrieve an assessment', () => {
    const storage = useStorage();
    const assessment = {
      id: crypto.randomUUID(),
      trials: [],
      selectedRate: 5.5,
      completedAt: new Date(),
      config: {
        warmupDurationSeconds: 120,
        warmupRate: 6.0,
        restDurationSeconds: 120,
      },
    };

    storage.saveAssessment(assessment);
    const results = storage.getAssessments();
    expect(results).toHaveLength(1);
    expect(results[0].selectedRate).toBe(5.5);
    expect(results[0].id).toBe(assessment.id);
  });

  it('should persist assessments to localStorage', () => {
    const storage = useStorage();
    const assessment = {
      id: crypto.randomUUID(),
      trials: [],
      selectedRate: 6.0,
      completedAt: new Date(),
      config: {
        warmupDurationSeconds: 120,
        warmupRate: 6.0,
        restDurationSeconds: 120,
      },
    };

    storage.saveAssessment(assessment);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'breath-in-flow-assessments',
      expect.any(String)
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/web && pnpm vitest run tests/composables/useStorage.test.ts`
Expected: FAIL — `getAssessments` and `saveAssessment` not defined

- [ ] **Step 3: Implement assessment storage methods**

In `packages/web/src/composables/useStorage.ts`:

1. Add a module-level ref:
```typescript
const assessments = ref<AssessmentResult[]>([]);
```

2. In `loadFromStorage()`, add:
```typescript
const storedAssessments = localStorage.getItem('breath-in-flow-assessments');
if (storedAssessments) {
  assessments.value = JSON.parse(storedAssessments, (key, value) => {
    if (key === 'completedAt') {
      return value ? new Date(value) : value;
    }
    return value;
  });
}
```

3. In `saveToStorage()`, add:
```typescript
localStorage.setItem('breath-in-flow-assessments', JSON.stringify(assessments.value));
```

4. Add to `resetStorageForTesting()`:
```typescript
assessments.value = [];
```

5. Inside the `useStorage()` function, add:
```typescript
function getAssessments(): AssessmentResult[] {
  return assessments.value;
}

function saveAssessment(result: AssessmentResult): void {
  assessments.value.unshift(result);
  saveToStorage();
}
```

6. Add to the return object:
```typescript
// Assessment operations
getAssessments,
saveAssessment,
```

7. Add imports at top:
```typescript
import type { AssessmentResult } from '@breath-in-flow/shared';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web && pnpm vitest run tests/composables/useStorage.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/composables/useStorage.ts packages/web/tests/composables/useStorage.test.ts
git commit -m "feat: add assessment storage methods to useStorage"
```

---

### Task 3: Scoring Algorithm (Pure Function)

The scoring logic should be a testable pure function inside the assessment component. We'll write it as a standalone function within `ResonanceAssessment.vue`'s `<script setup>` but test it through the component's behavior.

However, since it's pure logic, we can extract it to a small utility and test it directly first.

**Files:**
- Create: `packages/web/src/utils/assessmentScoring.ts`
- Create: `packages/web/tests/utils/assessmentScoring.test.ts`

- [ ] **Step 1: Write failing tests for scoring**

Create `packages/web/tests/utils/assessmentScoring.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { scoreTrial, findSuggestedRate } from '../../src/utils/assessmentScoring';
import type { AssessmentTrial } from '@breath-in-flow/shared';

function makeTrial(overrides: Partial<AssessmentTrial> = {}): AssessmentTrial {
  return {
    rate: 5.5,
    inhaleTime: 4.4,
    exhaleTime: 6.5,
    repetitions: 11,
    symptoms: [],
    ...overrides,
  };
}

describe('scoreTrial', () => {
  it('scores maximum when all fields are best', () => {
    const trial = makeTrial({
      comfortRating: 5,
      symptoms: [],
      hrAmplitude: 'large',
      waveformSmoothness: 'verySmooth',
    });
    expect(scoreTrial(trial)).toBe(9); // 3+3+3
  });

  it('scores with comfort only when HR fields missing', () => {
    const trial = makeTrial({ comfortRating: 5, symptoms: [] });
    expect(scoreTrial(trial)).toBe(3);
  });

  it('subtracts 1 per symptom', () => {
    const trial = makeTrial({
      comfortRating: 5,
      symptoms: ['airHunger', 'dizziness'],
      hrAmplitude: 'large',
      waveformSmoothness: 'verySmooth',
    });
    expect(scoreTrial(trial)).toBe(7); // 9 - 2
  });

  it('returns -1 for comfort rating 1', () => {
    const trial = makeTrial({ comfortRating: 1, symptoms: [] });
    expect(scoreTrial(trial)).toBe(-1);
  });

  it('returns 0 for comfort rating 2', () => {
    const trial = makeTrial({ comfortRating: 2, symptoms: [] });
    expect(scoreTrial(trial)).toBe(0);
  });
});

describe('findSuggestedRate', () => {
  it('picks trial with highest score', () => {
    const trials = [
      makeTrial({ rate: 6.5, comfortRating: 3, hrAmplitude: 'small', waveformSmoothness: 'jagged', symptoms: [] }),
      makeTrial({ rate: 5.5, comfortRating: 5, hrAmplitude: 'large', waveformSmoothness: 'verySmooth', symptoms: [] }),
      makeTrial({ rate: 4.5, comfortRating: 4, hrAmplitude: 'medium', waveformSmoothness: 'somewhatSmooth', symptoms: [] }),
    ];
    expect(findSuggestedRate(trials)).toBe(5.5);
  });

  it('breaks tie by fewer symptoms first', () => {
    const trials = [
      makeTrial({ rate: 6.0, comfortRating: 5, symptoms: ['airHunger'] }),
      makeTrial({ rate: 5.5, comfortRating: 4, symptoms: [] }),
    ];
    // 6.0: 3 - 1 = 2, 5.5: 2 - 0 = 2 (tied). 5.5 has fewer symptoms → wins
    expect(findSuggestedRate(trials)).toBe(5.5);
  });

  it('breaks tie by slower rate when no symptoms on either', () => {
    const trials = [
      makeTrial({ rate: 6.0, comfortRating: 4, symptoms: [] }),
      makeTrial({ rate: 5.0, comfortRating: 4, symptoms: [] }),
    ];
    // Both score 2, both 0 symptoms → prefer slower (5.0)
    expect(findSuggestedRate(trials)).toBe(5.0);
  });

  it('breaks tie by faster rate when both have symptoms', () => {
    const trials = [
      makeTrial({ rate: 6.0, comfortRating: 5, symptoms: ['dizziness'] }),
      makeTrial({ rate: 5.0, comfortRating: 5, symptoms: ['airHunger'] }),
    ];
    // Both score 2, both 1 symptom → prefer faster (6.0)
    expect(findSuggestedRate(trials)).toBe(6.0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/web && pnpm vitest run tests/utils/assessmentScoring.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement scoring functions**

Create `packages/web/src/utils/assessmentScoring.ts`:

```typescript
import type { AssessmentTrial } from '@breath-in-flow/shared';

const COMFORT_SCORES: Record<number, number> = {
  5: 3,
  4: 2,
  3: 1,
  2: 0,
  1: -1,
};

const HR_AMPLITUDE_SCORES: Record<string, number> = {
  large: 3,
  medium: 2,
  small: 1,
};

const SMOOTHNESS_SCORES: Record<string, number> = {
  verySmooth: 3,
  somewhatSmooth: 2,
  jagged: 1,
};

export function scoreTrial(trial: AssessmentTrial): number {
  let score = 0;

  if (trial.comfortRating != null) {
    score += COMFORT_SCORES[trial.comfortRating] ?? 0;
  }

  if (trial.hrAmplitude) {
    score += HR_AMPLITUDE_SCORES[trial.hrAmplitude] ?? 0;
  }

  if (trial.waveformSmoothness) {
    score += SMOOTHNESS_SCORES[trial.waveformSmoothness] ?? 0;
  }

  score -= trial.symptoms.length;

  return score;
}

export function findSuggestedRate(trials: AssessmentTrial[]): number {
  const scored = trials.map((t) => ({
    rate: t.rate,
    score: scoreTrial(t),
    symptomCount: t.symptoms.length,
  }));

  scored.sort((a, b) => {
    // Primary: highest score
    if (a.score !== b.score) return b.score - a.score;
    // Tie-breaker 1: fewer symptoms
    if (a.symptomCount !== b.symptomCount) return a.symptomCount - b.symptomCount;
    // Tie-breaker 2: if no symptoms on either, prefer slower (lower BPM)
    if (a.symptomCount === 0 && b.symptomCount === 0) return a.rate - b.rate;
    // Tie-breaker 3: if both have symptoms, prefer faster (higher BPM)
    return b.rate - a.rate;
  });

  return scored[0].rate;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web && pnpm vitest run tests/utils/assessmentScoring.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/utils/assessmentScoring.ts packages/web/tests/utils/assessmentScoring.test.ts
git commit -m "feat: add assessment scoring algorithm with tests"
```

---

### Task 4: ResonanceAssessment Component — State Machine & Breathing Phases

This is the core component. We build it in stages: first the state machine skeleton with INTRO/WARMUP/TRIAL_BREATHING/TRIAL_REST phases, then scoring/result in the next task.

**Files:**
- Create: `packages/web/src/components/ResonanceAssessment.vue`
- Create: `packages/web/tests/components/ResonanceAssessment.test.ts`

- [ ] **Step 1: Write tests for the assessment state machine**

Create `packages/web/tests/components/ResonanceAssessment.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ResonanceAssessment from '../../src/components/ResonanceAssessment.vue';

// Mock KeepAwake
vi.mock('@capacitor-community/keep-awake', () => ({
  KeepAwake: {
    keepAwake: vi.fn(),
    allowSleep: vi.fn(),
  },
}));

// Mock Capacitor
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => false },
}));

// Mock ttsService
vi.mock('../../src/services/ttsService', () => ({
  ttsService: {
    speak: vi.fn(),
    setEnabled: vi.fn(),
    setVoiceByUri: vi.fn(),
  },
}));

// Mock soundService
vi.mock('../../src/services/soundService', () => ({
  soundService: {
    playClick: vi.fn(),
    setEnabled: vi.fn(),
    setTheme: vi.fn(),
  },
}));

describe('ResonanceAssessment', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders INTRO phase by default', () => {
    const wrapper = mount(ResonanceAssessment);
    expect(wrapper.text()).toContain('Resonance Frequency Assessment');
    expect(wrapper.text()).toContain('Start Assessment');
  });

  it('shows warmup config controls on INTRO', () => {
    const wrapper = mount(ResonanceAssessment);
    // Should have warmup duration and rate controls
    expect(wrapper.text()).toContain('Warmup');
  });

  it('emits cancel when back button clicked on INTRO', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    expect(wrapper.emitted('cancel')).toBeTruthy();
  });

  it('transitions to WARMUP when Start Assessment clicked', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    // Should now be in warmup phase
    expect(wrapper.text()).toContain('Warmup');
    expect(wrapper.find('[data-testid="breathing-visualizer"]').exists()).toBe(true);
  });

  it('shows cancel confirmation during active phases', async () => {
    const wrapper = mount(ResonanceAssessment);
    // Start assessment
    await wrapper.find('[data-testid="start-btn"]').trigger('click');
    // Click cancel
    await wrapper.find('[data-testid="cancel-btn"]').trigger('click');
    // Should show confirmation
    expect(wrapper.text()).toContain('Cancel assessment');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/web && pnpm vitest run tests/components/ResonanceAssessment.test.ts`
Expected: FAIL — component does not exist

- [ ] **Step 3: Create ResonanceAssessment.vue with state machine and breathing phases**

Create `packages/web/src/components/ResonanceAssessment.vue`. This is a large component — the full implementation is outlined here with key sections:

**Template structure:**
```
<template>
  <!-- Cancel Confirmation Modal -->
  <!-- INTRO phase: protocol explanation, warmup config, start button -->
  <!-- WARMUP phase: BreathingVisualizer with "Warmup — X.X BPM" header -->
  <!-- TRIAL_BREATHING phase: BreathingVisualizer with "Trial N/5 — X.X BPM" header -->
  <!-- TRIAL_REST phase: centered countdown, "Rest quietly" text -->
  <!-- SCORING phase: (Task 5) -->
  <!-- RESULT phase: (Task 5) -->
</template>
```

**Script setup key sections:**

```typescript
<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import BreathingVisualizer from './BreathingVisualizer.vue';
import { useBreathingTimer } from '../composables/useBreathingTimer';
import { useStorage } from '../composables/useStorage';
import {
  ASSESSMENT_TRIALS,
  DEFAULT_BREATHING_CONFIG,
  formatTime,
  type BreathingConfig,
  type AssessmentTrial,
  type AssessmentConfig,
  type AssessmentResult,
} from '@breath-in-flow/shared';
import { ttsService } from '../services/ttsService';
import { scoreTrial, findSuggestedRate } from '../utils/assessmentScoring';
import { v4 as uuidv4 } from 'uuid';

type AssessmentPhase = 'INTRO' | 'WARMUP' | 'TRIAL_BREATHING' | 'TRIAL_REST' | 'SCORING' | 'RESULT';

const props = defineProps<{
  soundEnabled?: boolean;
  soundTheme?: string;
  ttsEnabled?: boolean;
  ttsVoice?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  complete: [config: BreathingConfig];
}>();

// Assessment state
const phase = ref<AssessmentPhase>('INTRO');
const currentTrialIndex = ref(0);
const isPaused = ref(false);
const showCancelConfirm = ref(false);

// Warmup config (user-adjustable)
const assessmentConfig = reactive<AssessmentConfig>({
  warmupDurationSeconds: 120,
  warmupRate: 6.0,
  restDurationSeconds: 120,
});

// Build trials with computed repetitions
const trials = ref<AssessmentTrial[]>(
  ASSESSMENT_TRIALS.map((t) => ({
    ...t,
    repetitions: Math.round(120 / (t.inhaleTime + t.exhaleTime)),
    symptoms: [],
  }))
);

// Reactive config object mutated between phases for useBreathingTimer
// Inherits user's sound/TTS settings via props
const timerConfig = reactive<BreathingConfig>({
  ...DEFAULT_BREATHING_CONFIG,
  name: 'Assessment',
  inhaleHoldTime: 0,
  exhaleHoldTime: 0,
  extendedHoldEnabled: false,
  secondExtendedHoldEnabled: false,
  targetSets: 1,
  soundEnabled: props.soundEnabled ?? true,
  soundTheme: (props.soundTheme as any) ?? 'wood',
  ttsEnabled: props.ttsEnabled ?? false,
  ttsVoice: props.ttsVoice,
});

// Timer instance
const timer = useBreathingTimer(timerConfig, {
  onSessionComplete: () => handlePhaseComplete(),
});

// Rest countdown
const restTimeRemaining = ref(120);
let restIntervalId: ReturnType<typeof setInterval> | null = null;

// Current trial info
const currentTrial = computed(() => trials.value[currentTrialIndex.value]);
const isBreathingPhase = computed(() =>
  phase.value === 'WARMUP' || phase.value === 'TRIAL_BREATHING'
);

// Phase header text
const phaseHeaderText = computed(() => {
  if (phase.value === 'WARMUP') {
    return `Warmup — ${assessmentConfig.warmupRate} BPM`;
  }
  if (phase.value === 'TRIAL_BREATHING') {
    return `Trial ${currentTrialIndex.value + 1}/5 — ${currentTrial.value.rate} BPM`;
  }
  return '';
});

// Keep-awake
async function enableKeepAwake() {
  if (Capacitor.isNativePlatform()) {
    try { await KeepAwake.keepAwake(); } catch {}
  }
}
async function disableKeepAwake() {
  if (Capacitor.isNativePlatform()) {
    try { await KeepAwake.allowSleep(); } catch {}
  }
}

// Start the assessment (INTRO → WARMUP)
function startAssessment() {
  enableKeepAwake();

  // Configure warmup
  const warmupTrial = ASSESSMENT_TRIALS.find(
    (t) => t.rate === assessmentConfig.warmupRate
  ) ?? ASSESSMENT_TRIALS[1]; // default 6.0 BPM

  const warmupReps = Math.round(
    assessmentConfig.warmupDurationSeconds / (warmupTrial.inhaleTime + warmupTrial.exhaleTime)
  );

  timerConfig.inhaleTime = warmupTrial.inhaleTime;
  timerConfig.exhaleTime = warmupTrial.exhaleTime;
  timerConfig.repetitions = warmupReps;

  phase.value = 'WARMUP';
  ttsService.speak('Warmup starting');
  timer.start();
}

// Handle completion of a breathing phase (warmup or trial)
function handlePhaseComplete() {
  timer.stop();

  if (phase.value === 'WARMUP') {
    startTrial(0);
  } else if (phase.value === 'TRIAL_BREATHING') {
    if (currentTrialIndex.value < 4) {
      startRest();
    } else {
      // All 5 trials complete → scoring
      disableKeepAwake();
      phase.value = 'SCORING';
    }
  }
}

// Start a specific trial
function startTrial(index: number) {
  currentTrialIndex.value = index;
  const trial = trials.value[index];

  timerConfig.inhaleTime = trial.inhaleTime;
  timerConfig.exhaleTime = trial.exhaleTime;
  timerConfig.repetitions = trial.repetitions;

  phase.value = 'TRIAL_BREATHING';
  ttsService.speak(`Trial ${index + 1} starting at ${trial.rate} breaths per minute`);
  timer.start();
}

// Start rest period
function startRest() {
  phase.value = 'TRIAL_REST';
  restTimeRemaining.value = assessmentConfig.restDurationSeconds;
  ttsService.speak('Rest quietly');

  restIntervalId = setInterval(() => {
    if (isPaused.value) return;
    restTimeRemaining.value -= 1;
    if (restTimeRemaining.value <= 0) {
      clearRestInterval();
      startTrial(currentTrialIndex.value + 1);
    }
  }, 1000);
}

function clearRestInterval() {
  if (restIntervalId) {
    clearInterval(restIntervalId);
    restIntervalId = null;
  }
}

// Pause/Resume
function togglePause() {
  if (isPaused.value) {
    isPaused.value = false;
    if (isBreathingPhase.value) timer.resume();
  } else {
    isPaused.value = true;
    if (isBreathingPhase.value) timer.pause();
  }
}

// Cancel
function requestCancel() {
  if (phase.value === 'INTRO') {
    emit('cancel');
    return;
  }
  showCancelConfirm.value = true;
}

function confirmCancel() {
  timer.stop();
  clearRestInterval();
  disableKeepAwake();
  showCancelConfirm.value = false;
  emit('cancel');
}

// Cleanup
onUnmounted(() => {
  timer.stop();
  clearRestInterval();
  disableKeepAwake();
});

// Testing helper (used by tests to jump to specific phases)
function setPhaseForTesting(p: AssessmentPhase) {
  phase.value = p;
}
defineExpose({ setPhaseForTesting });
</script>
```

The template should include:
- `data-testid="cancel-btn"` on the cancel/back button
- `data-testid="start-btn"` on the Start Assessment button
- `data-testid="breathing-visualizer"` wrapper div around BreathingVisualizer
- Prominent breathing guidance in INTRO: "Breathe through your nose. Keep breathing comfortable and shallow..."
- `v-if` blocks for each `phase` value

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/web && pnpm vitest run tests/components/ResonanceAssessment.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/components/ResonanceAssessment.vue packages/web/tests/components/ResonanceAssessment.test.ts
git commit -m "feat: add ResonanceAssessment component with state machine"
```

---

### Task 5: Scoring & Result Phases

**Files:**
- Modify: `packages/web/src/components/ResonanceAssessment.vue` (add SCORING and RESULT template sections + logic)
- Modify: `packages/web/tests/components/ResonanceAssessment.test.ts` (add scoring/result tests)

- [ ] **Step 1: Write tests for scoring and result phases**

Add to `packages/web/tests/components/ResonanceAssessment.test.ts`:

```typescript
describe('Scoring phase', () => {
  it('shows 5 trial cards in SCORING phase', async () => {
    const wrapper = mount(ResonanceAssessment);
    // Directly set the phase for testing
    await wrapper.vm.setPhaseForTesting('SCORING');
    const cards = wrapper.findAll('[data-testid="trial-card"]');
    expect(cards).toHaveLength(5);
  });

  it('shows comfort rating for each trial', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.vm.setPhaseForTesting('SCORING');
    // Each card should have comfort rating controls
    expect(wrapper.findAll('[data-testid="comfort-rating"]')).toHaveLength(5);
  });
});

describe('Result phase', () => {
  it('shows suggested rate after calculating', async () => {
    const wrapper = mount(ResonanceAssessment);
    await wrapper.vm.setPhaseForTesting('RESULT');
    expect(wrapper.text()).toContain('Suggested Rate');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/web && pnpm vitest run tests/components/ResonanceAssessment.test.ts`
Expected: FAIL

- [ ] **Step 3: Add SCORING template section**

In the template, add the SCORING phase UI:
- Scrollable list of 5 trial cards, each with `data-testid="trial-card"`
- Each card shows: rate label (e.g., "6.5 BPM"), comfort rating (1-5 star/button selector with `data-testid="comfort-rating"`), symptom toggle chips (air hunger, dizziness, chest effort, urge to sigh), optional HR amplitude radio group (small/medium/large), optional waveform smoothness radio group (jagged/somewhat smooth/very smooth), optional notes textarea
- Guidance text at top: "If you used a heart rate monitor, rate the HR fields based on what you observed. Skip these if you didn't use one."
- "Calculate Result" button at bottom

In the script, add:
```typescript
function calculateResult() {
  const suggested = findSuggestedRate(trials.value);
  selectedRate.value = suggested;
  phase.value = 'RESULT';
}
```

- [ ] **Step 4: Add RESULT template section**

In the template, add the RESULT phase UI:
- "Suggested Rate" heading with the rate highlighted
- All 5 rates listed with their scores (from `scoreTrial`)
- Radio/tap selection to override the suggestion
- Guidance note about confirming with ±0.5 BPM adjacent rates
- "Save & Create Preset" button

In the script, add the preset creation and save logic:
```typescript
const storage = useStorage();
const selectedRate = ref<number>(5.5);

function saveResult() {
  const selected = trials.value.find((t) => t.rate === selectedRate.value)!;

  // Create preset
  const presetName = `My Resonance Frequency — ${selectedRate.value} BPM`;
  const existingConfigs = storage.getAllConfigs();
  const existing = existingConfigs.find((c) =>
    c.name.startsWith('My Resonance Frequency')
  );

  const presetInput = {
    ...DEFAULT_BREATHING_CONFIG,
    name: presetName,
    inhaleTime: selected.inhaleTime,
    exhaleTime: selected.exhaleTime,
    inhaleHoldTime: 0,
    exhaleHoldTime: 0,
    repetitions: Math.round(600 / (selected.inhaleTime + selected.exhaleTime)),
    targetSets: 0,
    extendedHoldEnabled: false,
    secondExtendedHoldEnabled: false,
    // Inherit user's audio settings
    soundEnabled: props.soundEnabled ?? true,
    soundTheme: (props.soundTheme as any) ?? 'wood',
    ttsEnabled: props.ttsEnabled ?? false,
    ttsVoice: props.ttsVoice,
  };

  let preset;
  if (existing?.id) {
    storage.updateConfig(existing.id, presetInput);
    preset = storage.getConfig(existing.id)!;
  } else {
    preset = storage.createConfig(presetInput);
  }

  // Save assessment result
  const result: AssessmentResult = {
    id: uuidv4(),
    trials: trials.value,
    selectedRate: selectedRate.value,
    createdPresetId: preset.id,
    completedAt: new Date(),
    config: { ...assessmentConfig },
  };
  storage.saveAssessment(result);

  emit('complete', preset);
}

// Note: setPhaseForTesting and defineExpose were already added in Task 4
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/web && pnpm vitest run tests/components/ResonanceAssessment.test.ts`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/ResonanceAssessment.vue packages/web/tests/components/ResonanceAssessment.test.ts
git commit -m "feat: add scoring and result phases to assessment"
```

---

### Task 6: Entry Point in BreathingPractice

**Files:**
- Modify: `packages/web/src/components/BreathingPractice.vue`

- [ ] **Step 1: Add import and state for assessment mode**

In the `<script setup>` section of `BreathingPractice.vue`, add:

```typescript
import ResonanceAssessment from './ResonanceAssessment.vue';

const showAssessment = ref(false);

function onAssessmentComplete(preset: BreathingConfig) {
  showAssessment.value = false;
  // Load the new preset as active config, but preserve current audio settings
  const currentAudio = {
    soundEnabled: config.soundEnabled,
    soundTheme: config.soundTheme,
    ttsEnabled: config.ttsEnabled,
    ttsVoice: config.ttsVoice,
  };
  Object.assign(config, preset, currentAudio);
  configName.value = preset.name;
}

function onAssessmentCancel() {
  showAssessment.value = false;
}
```

- [ ] **Step 2: Add conditional rendering in template**

Wrap the existing practice content in a `v-if="!showAssessment"` and add the assessment component:

At the top of the non-running content area (around line 784, before `<!-- Regular Configuration View -->`):

```html
<!-- Assessment Mode -->
<ResonanceAssessment
  v-if="showAssessment"
  :sound-enabled="config.soundEnabled"
  :sound-theme="config.soundTheme"
  :tts-enabled="config.ttsEnabled"
  :tts-voice="config.ttsVoice"
  @cancel="onAssessmentCancel"
  @complete="onAssessmentComplete"
/>

<!-- Regular Configuration View (when not running and not in assessment) -->
<div v-else class="space-y-4 sm:space-y-6">
```

**Important:** The `v-if="showAssessment"` / `v-else` must wrap at a level that also hides the fullscreen session Teleport. Add `&& !showAssessment` to the `v-if="isRunning"` guard on the fullscreen session modal (around line 118), so the assessment and running session don't overlap:

```html
<div v-if="isRunning && !showAssessment" class="fixed inset-0 z-50 ...">
```

- [ ] **Step 3: Add the "Find My Resonance Frequency" button**

After the "Start Practice" button (around line 869), add:

```html
<button @click="showAssessment = true" class="btn-secondary btn-action">
  <span class="flex items-center gap-2 justify-center">
    <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
    Find My Resonance Frequency
  </span>
</button>
```

- [ ] **Step 4: Run existing BreathingPractice tests to ensure nothing is broken**

Run: `cd packages/web && pnpm vitest run tests/components/BreathingPractice.test.ts`
Expected: All PASS (existing tests should not break)

- [ ] **Step 5: Run full test suite**

Run: `cd packages/web && pnpm vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add packages/web/src/components/BreathingPractice.vue
git commit -m "feat: add resonance frequency assessment entry point"
```

---

### Task 7: Manual Smoke Test & Polish

- [ ] **Step 1: Start the dev server**

Run: `cd packages/web && pnpm dev`

- [ ] **Step 2: Manual verification checklist**

Verify each of these in the browser:
- [ ] "Find My Resonance Frequency" button visible in Practice tab
- [ ] Clicking button shows INTRO screen with warmup config
- [ ] Back button returns to normal practice view
- [ ] Start Assessment transitions to warmup breathing
- [ ] Warmup uses BreathingVisualizer with correct rate
- [ ] After warmup, auto-advances to Trial 1
- [ ] Trial header shows "Trial 1/5 — 6.5 BPM"
- [ ] After trial, auto-advances to rest with countdown
- [ ] Rest countdown shows and auto-advances to next trial
- [ ] After all 5 trials, shows scoring screen
- [ ] Scoring form: comfort, symptoms, HR fields, notes all work
- [ ] Calculate Result shows suggested rate
- [ ] Can override rate selection
- [ ] Save creates preset and returns to practice
- [ ] New preset appears in presets list
- [ ] Pause/resume works during breathing and rest phases
- [ ] Cancel with confirmation works during active phases

- [ ] **Step 3: Fix any issues found**

Address any visual, behavioral, or layout issues.

- [ ] **Step 4: Run full test suite one final time**

Run: `cd packages/web && pnpm vitest run`
Expected: All PASS

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "polish: resonance frequency assessment UI refinements"
```
