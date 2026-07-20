# Family Testing Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Breath in Flow ready for a private family test with goal-based first use, recommended and repeat-session shortcuts, optional subjective check-ins, user-initiated support, loss-resistant local backup and restore, and honest native-device evidence.

**Architecture:** Shared Zod contracts define preferences, check-ins, and the versioned backup envelope. Focused Vue composables and services own preferences, recommendations, support, localStorage/IndexedDB snapshots, and rollback; small components render onboarding, recommended actions, check-ins, and data controls while the existing practice component remains the session coordinator. Native validation remains an evidence-producing release gate and never infers physical-device passes from automated tests.

**Tech Stack:** Vue 3, TypeScript, Zod, Vitest, Vue Test Utils, localStorage, IndexedDB, Capacitor 8, `@capacitor/device`, `@capacitor/filesystem`, `@capacitor/share`, Android Gradle, Xcode.

## Global Constraints

- Keep the app standalone: no accounts, backend, cloud sync, analytics, crash reporting, advertising, or automatic data transmission.
- Present exactly four goals: Relax, Train diaphragm, Improve breathing consistency, and Explore pulse variability.
- Never request camera or motion permission during onboarding.
- Check-ins are optional and use the five-point comfort scale defined in the approved design.
- Support is user initiated and contains no health, practice, check-in, PRV, permission, or sensor data.
- Backup format version is `1`; restore replaces rather than merges; imports are limited to 25 MiB.
- Restore must validate before mutation and roll back on a write or read-back failure.
- New pure modules require 100% line and function coverage; existing gates may not be lowered.
- A physical-device check passes only with recorded observation on the named hardware.
- Preserve unrelated work and commit each independently testable task separately.

---

## File Map

### Shared contracts

- `packages/shared/src/schemas.ts` — goal, preferences, feeling, check-in, and session schema changes.
- `packages/shared/src/familyTesting.ts` — backup envelope metadata and strict top-level shape.
- `packages/shared/src/index.ts` — public exports.
- `packages/shared/tests/schemas.test.ts` — preferences and check-in schema behavior.
- `packages/shared/tests/familyTesting.test.ts` — backup envelope behavior.

### Web state and services

- `packages/web/src/constants/storageKeys.ts` — authoritative durable localStorage keys.
- `packages/web/src/composables/usePreferences.ts` — reactive validated goal persistence.
- `packages/web/src/services/recommendationService.ts` — pure goal-to-action mapping.
- `packages/web/src/services/backupService.ts` — versioned export, full validation, replacement restore, read-back verification, and rollback.
- `packages/web/src/services/supportService.ts` — user-triggered device/app context and share/email/clipboard fallbacks.
- `packages/web/src/composables/useStorage.ts` — practice snapshot/replace, latest-completed session, and check-in updates.
- `packages/web/src/composables/useHrvStorage.ts` — complete measurement/assessment snapshot and atomic replacement.
- `packages/web/src/composables/index.ts` — composable exports.

### Web components

- `packages/web/src/components/GoalOnboarding.vue` — accessible first-run goal dialog.
- `packages/web/src/components/RecommendedActions.vue` — goal recommendation and repeat-last-session actions.
- `packages/web/src/components/FeelingCheckIn.vue` — reusable pre/post comfort prompt.
- `packages/web/src/components/DataSupportSettings.vue` — goal editing, export, import preview/confirmation, and support action.
- `packages/web/src/App.vue` — onboarding and shared preference wiring.
- `packages/web/src/components/BreathingPractice.vue` — shortcut and check-in session orchestration.
- `packages/web/src/components/HelpSystem.vue` — data/support entry point.
- `packages/web/src/components/SessionHistory.vue` — stored check-in presentation.

### Tests and native project

- Extend existing well-named test files rather than creating duplicate suites.
- Add focused service/component tests only for new isolated modules.
- `packages/web/package.json`, `pnpm-lock.yaml`, and native generated plugin files — Capacitor device/file/share support.
- `docs/PULSE-VARIABILITY-DEVICE-VALIDATION.md` — current artifact and observed device evidence.

---

### Task 1: Shared Preferences, Check-In, and Backup Contracts

**Files:**

- Modify: `packages/shared/src/schemas.ts`
- Create: `packages/shared/src/familyTesting.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/shared/tests/schemas.test.ts`
- Create: `packages/shared/tests/familyTesting.test.ts`

**Interfaces:**

- Produces: `UserGoal`, `UserPreferences`, `FeelingScore`, `SessionCheckIn`, and their schemas.
- Produces: `BackupEnvelopeShape`, `BackupEnvelopeShapeSchema`, `BACKUP_FORMAT_VERSION`, and `MAX_BACKUP_BYTES`.
- Changes: `Session.checkIn?: SessionCheckIn`.

- [ ] **Step 1: Write failing shared-contract tests**

Add cases equivalent to:

```ts
expect(UserPreferencesSchema.parse({ version: 1, goal: 'RELAX' })).toEqual({
  version: 1,
  goal: 'RELAX',
});
expect(UserGoalSchema.safeParse('DIAGNOSE_ME').success).toBe(false);
expect(SessionCheckInSchema.parse({ before: 1, after: 5, comment: 'More comfortable' })).toEqual({
  before: 1,
  after: 5,
  comment: 'More comfortable',
});
expect(SessionCheckInSchema.safeParse({ after: 6 }).success).toBe(false);
expect(SessionCheckInSchema.safeParse({ comment: 'x'.repeat(501) }).success).toBe(false);
expect(SessionSchema.parse({ ...validSession, checkIn: { before: 2, after: 4 } }).checkIn).toEqual({
  before: 2,
  after: 4,
});
```

Test strict backup shape handling:

```ts
const envelope = BackupEnvelopeShapeSchema.parse({
  formatVersion: 1,
  metadata: { appVersion: '1.0.0', exportedAt: '2026-07-20T12:00:00.000Z' },
  data: {
    preferences: { version: 1, goal: 'RELAX' },
    configs: [],
    sessions: [],
    soundTheme: 'wood',
    lastConfig: null,
    measurements: [],
    assessments: [],
  },
});
expect(envelope.formatVersion).toBe(BACKUP_FORMAT_VERSION);
expect(BackupEnvelopeShapeSchema.safeParse({ ...envelope, unexpected: true }).success).toBe(false);
expect(MAX_BACKUP_BYTES).toBe(25 * 1024 * 1024);
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @breath-in-flow/shared test -- schemas familyTesting`

Expected: FAIL because the new schemas, exports, and module do not exist.

- [ ] **Step 3: Implement the shared schemas**

Add before `SessionSchema`:

```ts
export const UserGoalSchema = z.enum([
  'RELAX',
  'TRAIN_DIAPHRAGM',
  'BUILD_CONSISTENCY',
  'EXPLORE_PULSE_VARIABILITY',
]);
export type UserGoal = z.infer<typeof UserGoalSchema>;

export const UserPreferencesSchema = z
  .object({ version: z.literal(1), goal: UserGoalSchema })
  .strict();
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const FeelingScoreSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type FeelingScore = z.infer<typeof FeelingScoreSchema>;

export const SessionCheckInSchema = z
  .object({
    before: FeelingScoreSchema.optional(),
    after: FeelingScoreSchema.optional(),
    comment: z.string().trim().max(500).optional(),
  })
  .strict()
  .refine(
    (value) => value.before !== undefined || value.after !== undefined || Boolean(value.comment),
    {
      message: 'A check-in must contain at least one response',
    }
  );
export type SessionCheckIn = z.infer<typeof SessionCheckInSchema>;
```

Extend `SessionSchema` with `checkIn: SessionCheckInSchema.optional()`.

Create `familyTesting.ts`:

```ts
import { z } from 'zod';
import { SoundThemeSchema, UserPreferencesSchema } from './schemas.js';

export const BACKUP_FORMAT_VERSION = 1 as const;
export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;

export const BackupEnvelopeShapeSchema = z
  .object({
    formatVersion: z.literal(BACKUP_FORMAT_VERSION),
    metadata: z
      .object({
        appVersion: z.string().min(1).max(50),
        exportedAt: z.string().datetime({ offset: true }),
      })
      .strict(),
    data: z
      .object({
        preferences: UserPreferencesSchema.nullable(),
        configs: z.array(z.unknown()),
        sessions: z.array(z.unknown()),
        soundTheme: SoundThemeSchema,
        lastConfig: z.unknown().nullable(),
        measurements: z.array(z.unknown()),
        assessments: z.array(z.unknown()),
      })
      .strict(),
  })
  .strict();

export type BackupEnvelopeShape = z.infer<typeof BackupEnvelopeShapeSchema>;
```

Export every new value and type from `index.ts`.

- [ ] **Step 4: Run shared tests and verify GREEN**

Run: `pnpm --filter @breath-in-flow/shared test -- schemas familyTesting`

Expected: PASS with every new boundary and existing schema test green.

- [ ] **Step 5: Commit the shared contracts**

```bash
git add packages/shared/src/schemas.ts packages/shared/src/familyTesting.ts packages/shared/src/index.ts packages/shared/tests/schemas.test.ts packages/shared/tests/familyTesting.test.ts
git commit -m "feat: add family testing data contracts"
```

---

### Task 2: Preferences and Recommendation State

**Files:**

- Create: `packages/web/src/constants/storageKeys.ts`
- Create: `packages/web/src/composables/usePreferences.ts`
- Modify: `packages/web/src/composables/index.ts`
- Create: `packages/web/src/services/recommendationService.ts`
- Create: `packages/web/tests/composables/usePreferences.test.ts`
- Create: `packages/web/tests/services/recommendationService.test.ts`

**Interfaces:**

- Produces: `usePreferences(): { preferences, selectedGoal, needsOnboarding, setGoal, clearGoal, exportPreferences, replacePreferences }`.
- Produces: `resolveRecommendation(goal, presets?): Recommendation`.
- `Recommendation` is `{ kind: 'practice'; presetId: string; title: string } | { kind: 'lab'; protocol: 'quick-check'; title: string } | { kind: 'presets'; title: string }`.

- [ ] **Step 1: Write failing preference and recommendation tests**

```ts
const state = usePreferences();
expect(state.needsOnboarding.value).toBe(true);
state.setGoal('TRAIN_DIAPHRAGM');
expect(state.selectedGoal.value).toBe('TRAIN_DIAPHRAGM');
expect(JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toEqual({
  version: 1,
  goal: 'TRAIN_DIAPHRAGM',
});
```

Reload after invalid storage and assert `needsOnboarding` is true. Cover quota errors without changing the previous in-memory value.

```ts
expect(resolveRecommendation('RELAX')).toMatchObject({
  kind: 'practice',
  presetId: 'stress-relief-quick',
});
expect(resolveRecommendation('EXPLORE_PULSE_VARIABILITY')).toEqual({
  kind: 'lab',
  protocol: 'quick-check',
  title: 'Pulse Variability quick check',
});
expect(resolveRecommendation('RELAX', [])).toEqual({
  kind: 'presets',
  title: 'Choose a breathing preset',
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @breath-in-flow/web test -- usePreferences recommendationService`

Expected: FAIL because the modules do not exist.

- [ ] **Step 3: Implement storage keys, preferences, and pure recommendations**

Use these keys:

```ts
export const PREFERENCES_STORAGE_KEY = 'breath-in-flow-preferences-v1';
export const CONFIGS_STORAGE_KEY = 'breath-in-flow-configs';
export const SESSIONS_STORAGE_KEY = 'breath-in-flow-sessions';
export const SOUND_THEME_STORAGE_KEY = 'breath-in-flow-sound-theme';
export const LAST_CONFIG_STORAGE_KEY = 'herb_breathing_last_config';
```

`usePreferences` must validate every read and write with `UserPreferencesSchema`, update reactive state only after successful persistence, and expose cloning export/replace operations for backup.

Implement the mapping:

```ts
const GOAL_PRESETS: Partial<Record<UserGoal, string>> = {
  RELAX: 'stress-relief-quick',
  TRAIN_DIAPHRAGM: 'diaphragm-resistance-starter',
  BUILD_CONSISTENCY: 'coherent-breathing',
};
```

Use `guidedPresets.some(({ id }) => id === presetId)` before returning a practice recommendation. Pulse Variability always returns the explicit Lab action.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @breath-in-flow/web test -- usePreferences recommendationService`

Expected: PASS.

- [ ] **Step 5: Commit preference state**

```bash
git add packages/web/src/constants/storageKeys.ts packages/web/src/composables/usePreferences.ts packages/web/src/composables/index.ts packages/web/src/services/recommendationService.ts packages/web/tests/composables/usePreferences.test.ts packages/web/tests/services/recommendationService.test.ts
git commit -m "feat: add private goal preferences"
```

---

### Task 3: Goal Onboarding and Recommended Shortcuts

**Files:**

- Create: `packages/web/src/components/GoalOnboarding.vue`
- Create: `packages/web/src/components/RecommendedActions.vue`
- Modify: `packages/web/src/App.vue`
- Modify: `packages/web/src/components/BreathingPractice.vue`
- Modify: `packages/web/tests/components/App.test.ts`
- Modify: `packages/web/tests/components/BreathingPracticeFlows.test.ts`
- Create: `packages/web/tests/components/GoalOnboarding.test.ts`
- Create: `packages/web/tests/components/RecommendedActions.test.ts`

**Interfaces:**

- `GoalOnboarding` props: `open: boolean`; emits `select(goal: UserGoal)`.
- `RecommendedActions` props: `goal: UserGoal`, `lastSession: Session | null`; emits `start(config)`, `adjust(config)`, `repeat(config)`, and `openLab()`.
- `BreathingPractice` prop: `goal?: UserGoal`; existing `switch-tab` emit remains.

- [ ] **Step 1: Write failing onboarding and shortcut tests**

Assert a fresh App renders a modal with exactly four radio choices and no calls to camera, motion, or permission services. Select Relax, remount, and assert onboarding stays closed.

```ts
expect(wrapper.get('[role="dialog"]').attributes('aria-labelledby')).toBe('goal-onboarding-title');
expect(wrapper.findAll('input[name="wellness-goal"]')).toHaveLength(4);
await wrapper.get('[data-testid="goal-relax"]').setValue();
await wrapper.get('[data-testid="save-goal"]').trigger('click');
expect(usePreferences().selectedGoal.value).toBe('RELAX');
```

Assert recommendations emit validated clones, not built-in objects:

```ts
await wrapper.get('[data-testid="start-recommended"]').trigger('click');
const emitted = wrapper.emitted('start')![0][0] as BreathingConfig;
expect(emitted.name).toBe('Stress Relief (Quick)');
emitted.name = 'Changed';
expect(guidedPresets.find((p) => p.id === 'stress-relief-quick')!.config.name).toBe(
  'Stress Relief (Quick)'
);
```

Cover missing preset fallback, Pulse Variability navigation, no repeat action without a completed session, latest completed session selection, and config snapshot isolation.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @breath-in-flow/web test -- GoalOnboarding RecommendedActions App BreathingPracticeFlows`

Expected: FAIL on missing components and events.

- [ ] **Step 3: Implement accessible onboarding and shortcuts**

`GoalOnboarding` must use `useModalIsolation`, label every choice, focus its heading/first choice, prevent background interaction, and provide no sensor code.

`RecommendedActions` resolves the goal, obtains a built-in config through `presetConfig`, clones it with `structuredClone`, and renders:

```vue
<button data-testid="start-recommended" class="btn-primary" @click="emitStart">
  Start recommended session
</button>
<button data-testid="adjust-recommended" class="btn-secondary" @click="emitAdjust">
  Adjust first
</button>
<button v-if="lastSession" data-testid="repeat-last" class="btn-secondary" @click="emitRepeat">
  Repeat last session
</button>
```

App owns `usePreferences`, renders onboarding while no goal exists, and passes the selected goal to Practice. BreathingPractice computes the latest completed session, handles adjust by assigning the cloned config, handles Lab by emitting `switch-tab`, and routes start/repeat into the pre-session start request added in Task 4. Until Task 4 lands, use a small `requestSessionStart(config)` adapter that immediately calls the existing validated start function; Task 4 replaces its body without changing callers.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @breath-in-flow/web test -- GoalOnboarding RecommendedActions App BreathingPracticeFlows`

Expected: PASS with no early permission calls.

- [ ] **Step 5: Commit onboarding and shortcuts**

```bash
git add packages/web/src/components/GoalOnboarding.vue packages/web/src/components/RecommendedActions.vue packages/web/src/App.vue packages/web/src/components/BreathingPractice.vue packages/web/tests/components/App.test.ts packages/web/tests/components/BreathingPracticeFlows.test.ts packages/web/tests/components/GoalOnboarding.test.ts packages/web/tests/components/RecommendedActions.test.ts
git commit -m "feat: guide the first family session"
```

---

### Task 4: Optional Session Check-Ins

**Files:**

- Create: `packages/web/src/components/FeelingCheckIn.vue`
- Modify: `packages/web/src/composables/useStorage.ts`
- Modify: `packages/web/src/components/BreathingPractice.vue`
- Modify: `packages/web/src/components/SessionHistory.vue`
- Modify: `packages/web/tests/composables/useStorage.test.ts`
- Modify: `packages/web/tests/components/BreathingPracticeFlows.test.ts`
- Modify: `packages/web/tests/components/SessionHistory.test.ts`
- Create: `packages/web/tests/components/FeelingCheckIn.test.ts`

**Interfaces:**

- `FeelingCheckIn` props: `open`, `stage: 'before' | 'after'`, `initialScore?`; emits `submit({ score, comment? })` and `skip()`.
- `useStorage.setSessionCheckIn(id, updates): Session | undefined` merges and validates check-in data.

- [ ] **Step 1: Write failing check-in tests**

Cover all five labels, optional skip, 500-character limit, focus isolation, and no post-session comment in before mode.

```ts
const updated = storage.setSessionCheckIn(session.id!, { before: 2 });
expect(updated?.checkIn).toEqual({ before: 2 });
storage.completeSession(session.id!);
storage.setSessionCheckIn(session.id!, { after: 4, comment: 'Felt easier' });
expect(storage.getSession(session.id!)?.checkIn).toEqual({
  before: 2,
  after: 4,
  comment: 'Felt easier',
});
```

Flow tests must prove skip starts immediately, submitted pre-score attaches to the created session, a rejected start leaves no orphan check-in, completion is persisted before the post prompt, saving post data is idempotent, and skipping post data leaves the completion intact.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @breath-in-flow/web test -- FeelingCheckIn useStorage BreathingPracticeFlows SessionHistory`

Expected: FAIL on missing component and storage method.

- [ ] **Step 3: Implement check-in storage and UI**

Storage merge must validate before mutation:

```ts
function setSessionCheckIn(id: string, updates: Partial<SessionCheckIn>): Session | undefined {
  const session = getSession(id);
  if (!session) return undefined;
  const parsed = SessionCheckInSchema.safeParse({ ...session.checkIn, ...updates });
  if (!parsed.success) return undefined;
  return updateSession(id, { checkIn: parsed.data });
}
```

Replace the Task 3 adapter with:

```ts
function requestSessionStart(candidate: BreathingConfig) {
  pendingStartConfig.value = BreathingConfigSchema.parse(candidate);
  showBeforeCheckIn.value = true;
}

function continueSessionStart(before?: FeelingScore) {
  const candidate = pendingStartConfig.value;
  showBeforeCheckIn.value = false;
  pendingStartConfig.value = null;
  if (!candidate) return;
  startValidatedExercise(candidate, before);
}
```

`startValidatedExercise` creates the session first, persists `before` only after creation succeeds, and then starts the timer. On automatic or manual completion, keep the completed session ID until the post prompt is saved or skipped. Never call `completeSession` a second time merely to dismiss the prompt.

SessionHistory renders submitted values with the scale labels and comment; it renders no empty check-in section.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @breath-in-flow/web test -- FeelingCheckIn useStorage BreathingPracticeFlows SessionHistory`

Expected: PASS.

- [ ] **Step 5: Commit check-ins**

```bash
git add packages/web/src/components/FeelingCheckIn.vue packages/web/src/composables/useStorage.ts packages/web/src/components/BreathingPractice.vue packages/web/src/components/SessionHistory.vue packages/web/tests/components/FeelingCheckIn.test.ts packages/web/tests/composables/useStorage.test.ts packages/web/tests/components/BreathingPracticeFlows.test.ts packages/web/tests/components/SessionHistory.test.ts
git commit -m "feat: add optional practice check-ins"
```

---

### Task 5: Snapshot and Replacement Repository APIs

**Files:**

- Modify: `packages/web/src/composables/useStorage.ts`
- Modify: `packages/web/src/composables/useHrvStorage.ts`
- Modify: `packages/web/tests/composables/useStorage.test.ts`
- Modify: `packages/web/tests/composables/useHrvStorage.test.ts`

**Interfaces:**

- Produces: `PracticeStorageSnapshot`, `exportPracticeState()`, and `replacePracticeState(snapshot)`.
- Produces: `HrvStorageSnapshot`, `exportHrvState()`, and `replaceHrvState(snapshot)`.
- Exports validated measurement parsing for the backup coordinator without exposing raw IndexedDB access.

- [ ] **Step 1: Write failing repository snapshot tests**

Practice tests export cloned values, replace all state, reject one invalid record without mutating current state, and preserve Date instances after replacement.

HRV tests create measurements and assessments, export both, replace them atomically, and inject an IndexedDB abort to prove neither store is partially replaced.

```ts
const snapshot = await hrv.exportHrvState();
expect(snapshot.measurements).toHaveLength(1);
expect(snapshot.assessments).toHaveLength(1);
await hrv.replaceHrvState({ measurements: [], assessments: [] });
expect(await hrv.getMeasurements()).toEqual([]);
expect(await hrv.getAssessments()).toEqual([]);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @breath-in-flow/web test -- useStorage useHrvStorage`

Expected: FAIL because snapshot interfaces do not exist.

- [ ] **Step 3: Implement validated snapshot operations**

`exportPracticeState` returns detached configs, sessions, and theme. `replacePracticeState` validates every record and the theme before mutating refs or localStorage; on persistence failure it restores the previous refs and rethrows.

`exportHrvState` uses existing validated readers. `replaceHrvState` validates every measurement and assessment before opening one IndexedDB `readwrite` transaction covering `measurements` and `assessments`, clears both stores, writes all records, and waits for completion.

```ts
const tx = db.transaction(['measurements', 'assessments'], 'readwrite');
const measurementsStore = tx.objectStore('measurements');
const assessmentsStore = tx.objectStore('assessments');
measurementsStore.clear();
assessmentsStore.clear();
for (const measurement of validated.measurements) measurementsStore.put(measurement);
for (const assessment of validated.assessments) assessmentsStore.put(assessment);
await waitForTransaction(tx);
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @breath-in-flow/web test -- useStorage useHrvStorage`

Expected: PASS.

- [ ] **Step 5: Commit repository APIs**

```bash
git add packages/web/src/composables/useStorage.ts packages/web/src/composables/useHrvStorage.ts packages/web/tests/composables/useStorage.test.ts packages/web/tests/composables/useHrvStorage.test.ts
git commit -m "feat: add validated backup repositories"
```

---

### Task 6: Versioned Backup, Restore, Verification, and Rollback

**Files:**

- Create: `packages/web/src/services/backupService.ts`
- Create: `packages/web/tests/services/backupService.test.ts`
- Modify: `packages/web/vitest.config.ts`

**Interfaces:**

- Produces: `BackupSummary`, `createBackup()`, `parseBackupText(text, sizeBytes)`, `parseBackupFile(file)`, and `restoreBackup(parsed)`.
- Produces: structured `BackupRestoreError` with stage `validate | snapshot | write | verify | rollback`.

- [ ] **Step 1: Write failing end-to-end backup tests**

Build repository fakes and cover:

- deterministic normalized export fields and record counts;
- complete localStorage and IndexedDB round trip;
- malformed JSON;
- unknown top-level or data fields;
- unsupported version;
- invalid nested config, session, measurement, or assessment;
- file size greater than `MAX_BACKUP_BYTES`;
- no writes before confirmation/service invocation;
- write failure followed by successful rollback;
- read-back mismatch followed by rollback;
- rollback failure reported as stage `rollback` without success.

```ts
const original = await service.createBackup();
await repositories.clearAll();
await service.restoreBackup(service.parseBackupText(original.json));
const restored = await service.createBackup();
expect(normalizeExport(restored.envelope)).toEqual(normalizeExport(original.envelope));
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @breath-in-flow/web test -- backupService`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement coordinator with injected repositories**

Define dependency interfaces so failures are deterministic in tests:

```ts
export interface BackupRepositories {
  practice: {
    exportState(): PracticeStorageSnapshot;
    replaceState(value: PracticeStorageSnapshot): void;
  };
  hrv: {
    exportState(): Promise<HrvStorageSnapshot>;
    replaceState(value: HrvStorageSnapshot): Promise<void>;
  };
  preferences: {
    exportState(): UserPreferences | null;
    replaceState(value: UserPreferences | null): void;
  };
  lastConfig: {
    read(): BreathingConfig | null;
    replace(value: BreathingConfig | null): void;
  };
}
```

`parseBackupFile(file)` rejects `file.size > MAX_BACKUP_BYTES`, reads UTF-8 text, and delegates to `parseBackupText(text, file.size)`. `parseBackupText` applies the same byte limit when called directly, parses the strict shared envelope first, then validates configs with `BreathingConfigSchema`, sessions with `SessionSchema`, preferences with `UserPreferencesSchema`, assessments with `AssessmentResultSchema`, and measurements through the repository validator. Serialize dates to ISO strings and restore them before nested schema validation.

Snapshot every repository before writes. Replace practice/preferences/last-config and then the atomic HRV stores. Re-export and compare normalized values. On failure, restore all snapshots in reverse order, verify rollback, and throw the precise stage.

Add 100% line/function per-file gates for `backupService.ts` without reducing global gates.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `pnpm --filter @breath-in-flow/web test:coverage -- backupService`

Expected: PASS and the new exact coverage gates hold.

- [ ] **Step 5: Commit backup integrity**

```bash
git add packages/web/src/services/backupService.ts packages/web/tests/services/backupService.test.ts packages/web/vitest.config.ts
git commit -m "feat: add loss-resistant local backup"
```

---

### Task 7: Support, Backup UI, and Goal Editing

**Files:**

- Modify: `packages/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `packages/web/src/services/supportService.ts`
- Create: `packages/web/src/components/DataSupportSettings.vue`
- Modify: `packages/web/src/components/HelpSystem.vue`
- Create: `packages/web/tests/services/supportService.test.ts`
- Create: `packages/web/tests/components/DataSupportSettings.test.ts`
- Modify: `packages/web/tests/components/HelpSystem.test.ts`

**Interfaces:**

- Produces: `createSupportMessage()`, `sendSupportMessage()`, and `shareBackupFile(json, filename)`.
- `DataSupportSettings` uses the Task 2 preferences and Task 6 backup service.

- [ ] **Step 1: Write failing support and data-control tests**

Support tests mock native and web APIs and assert fallback order: Capacitor Share, email, clipboard. Assert generated text includes app/build/platform/OS/model when available and excludes known session names, `rmssd`, `checkIn`, `camera`, and stored data.

Data UI tests cover changing all four goals, export success/failure, file size rejection, invalid import, preview counts, cancel without writes, confirmed restore, rollback message, and file-input reset so the same file can be retried.

```ts
await wrapper.get('[data-testid="import-backup-input"]').trigger('change');
expect(wrapper.get('[data-testid="backup-preview"]').text()).toContain('2 sessions');
expect(restoreBackup).not.toHaveBeenCalled();
await wrapper.get('[data-testid="confirm-restore"]').trigger('click');
expect(restoreBackup).toHaveBeenCalledTimes(1);
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `pnpm --filter @breath-in-flow/web test -- supportService DataSupportSettings HelpSystem`

Expected: FAIL because dependencies and modules do not exist.

- [ ] **Step 3: Install compatible Capacitor plugins**

Run:

```bash
pnpm --filter @breath-in-flow/web add @capacitor/device@^8 @capacitor/filesystem@^8 @capacitor/share@^8
```

Expected: package and lockfile update with Capacitor 8-compatible releases and no peer-dependency errors.

- [ ] **Step 4: Implement support and file sharing**

Gather native information only inside the click handler:

```ts
const [app, device] = await Promise.all([App.getInfo(), Device.getInfo()]);
return [
  `App: ${app.name} ${app.version} (${app.build})`,
  `Platform: ${device.platform}`,
  `OS: ${device.operatingSystem} ${device.osVersion}`,
  `Device: ${device.model}`,
  '',
  'Feedback:',
].join('\n');
```

On native platforms use `Share.share`. For backup, write the JSON to `Directory.Cache`, share the returned URI, and delete the temporary file in `finally`. On web, prefer `navigator.share({ files })`, then create and revoke an object URL for download.

For support failure, try an encoded `mailto:hello@breathinflow.app`, then `navigator.clipboard.writeText`. Show which fallback succeeded.

- [ ] **Step 5: Implement Data and Support settings**

Embed `DataSupportSettings` in Help's existing Data tab. It renders the selected goal, four change buttons/radios, Export backup, Restore backup, and Send feedback. Restore preview shows export time and counts and uses an accessible confirmation dialog before calling `restoreBackup`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `pnpm --filter @breath-in-flow/web test -- supportService DataSupportSettings HelpSystem`

Expected: PASS with no automatic native API calls on mount.

- [ ] **Step 7: Commit support and data controls**

```bash
git add packages/web/package.json pnpm-lock.yaml packages/web/src/services/supportService.ts packages/web/src/components/DataSupportSettings.vue packages/web/src/components/HelpSystem.vue packages/web/tests/services/supportService.test.ts packages/web/tests/components/DataSupportSettings.test.ts packages/web/tests/components/HelpSystem.test.ts
git commit -m "feat: add private backup and support controls"
```

---

### Task 8: Release Integration, Native Builds, and Physical Evidence

**Files:**

- Modify generated native plugin registration files only through `cap sync`.
- Modify: `docs/PULSE-VARIABILITY-DEVICE-VALIDATION.md`
- Modify: `README.md`
- Modify coverage tests/config only if new executable branches require additional tests; never lower gates.

**Interfaces:**

- Produces: installable Android artifact and available iOS build evidence.
- Produces: updated physical-device matrix containing observations only.

- [ ] **Step 1: Run the complete JavaScript release matrix**

Run each command without piping through `head` or `tail`:

```bash
pnpm test
pnpm test:coverage
pnpm typecheck
pnpm lint
pnpm format:check
pnpm --filter @breath-in-flow/web build
```

Expected: all tests pass with zero skips, all coverage gates pass, and build/lint/type/format checks are clean. Fix failures with a new failing regression test before production changes, and commit each coherent fix separately.

- [ ] **Step 2: Synchronize Capacitor projects**

Run: `pnpm --filter @breath-in-flow/web cap:sync`

Expected: Device, Filesystem, Share, Keep Awake, TTS, App, and Torch plugins synchronize for Android and iOS; CocoaPods completes; tracked native changes are limited to generated dependency/plugin registration updates.

- [ ] **Step 3: Build Android with Java 21**

Run:

```bash
env JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew assembleDebug
```

Working directory: `packages/web/android`

Expected: `BUILD SUCCESSFUL` and `packages/web/android/app/build/outputs/apk/debug/app-debug.apk` exists. Record its byte size and SHA-256.

- [ ] **Step 4: Build iOS with the available supported toolchain**

Inspect first:

```bash
xcodebuild -version
xcodebuild -showsdks
xcrun simctl list runtimes
xcodebuild -workspace packages/web/ios/App/App.xcworkspace -scheme App -showdestinations
```

Then run a signing-disabled build against an eligible simulator or generic iOS destination. Expected: build succeeds. If Xcode still lacks its matching iOS platform component, record the exact ineligible-destination message and do not mark iOS native compilation passed.

- [ ] **Step 5: Enumerate and use connected physical devices**

Run:

```bash
adb devices -l
xcrun xctrace list devices
```

For an authorized Android device, install with:

```bash
adb install -r packages/web/android/app/build/outputs/apk/debug/app-debug.apk
```

For an available signed iOS target, install/run from the App workspace and record its identifier. If no representative device is connected, record “not run — no connected representative hardware” rather than a pass.

- [ ] **Step 6: Execute and record the physical checklist**

On each available device, observe installation/offline launch, first-run goal flow, recommended and repeat flows, check-ins, export/restore, support share sheet, camera/torch, motion, combined sensing, background/lock interruption, permission denial/recovery, sustained thermal behavior, and any trusted-reference comparison that is actually available.

Update every executed row with date, commit, app build, model, OS, protocol, result, and notes. Leave unavailable reference-device comparisons pending.

- [ ] **Step 7: Update user documentation**

README must explain goal selection, optional check-ins, local backup/restore, explicit support sharing, and that no background reporting exists. Device-validation documentation must distinguish automated, simulator, build, and observed physical evidence.

- [ ] **Step 8: Final review and commit**

Run:

```bash
git diff --check
git status --short
git diff --stat
```

Review all native generated diffs before staging. Commit documentation/native synchronization separately from any regression fix:

```bash
git add README.md docs/PULSE-VARIABILITY-DEVICE-VALIDATION.md packages/web/android packages/web/ios
git commit -m "chore: prepare family device validation"
```

After committing, rerun the complete release matrix against committed HEAD and verify the working tree is clean.

---

## Plan Self-Review Checklist

- Every approved goal, shortcut, check-in, support, backup, and device-evidence requirement has an owning task.
- Reliability reporting is explicitly excluded and no task installs a reporting SDK.
- Shared and web property names match across tasks.
- Backup nested records receive repository-level validation after strict envelope validation.
- Restore performs no mutation before validation and UI confirmation.
- Cross-store failure has snapshot, rollback, and rollback-verification coverage.
- Physical-device results remain separate from builds and simulations.
- Every implementation task begins with a failing test and ends with a focused passing test and commit.
