<template>
  <div data-testid="data-support-settings" class="space-y-4">
    <!-- Goal -->
    <div class="help-card">
      <h4 class="help-card-title">Your goal</h4>
      <p class="text-sm text-secondary">
        Current goal:
        <strong data-testid="selected-goal" class="text-primary">{{ selectedGoalLabel }}</strong>
      </p>
      <fieldset class="mt-3 space-y-2">
        <legend class="sr-only">Change your wellness goal</legend>
        <label
          v-for="choice in goalChoices"
          :key="choice.goal"
          class="flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors"
          :class="
            selectedGoal === choice.goal
              ? 'border-clay/60 bg-clay/10'
              : 'border-line-subtle bg-surface-raised hover:border-line-strong'
          "
        >
          <input
            v-model="goalModel"
            type="radio"
            name="data-support-goal"
            class="mt-1 h-4 w-4 shrink-0 accent-sage"
            :value="choice.goal"
            :data-testid="choice.testId"
          />
          <span class="block text-sm font-medium text-primary">{{ choice.label }}</span>
        </label>
      </fieldset>
    </div>

    <!-- Backup -->
    <div class="help-card">
      <h4 class="help-card-title">Backup</h4>
      <p class="text-sm text-secondary mb-3">
        Export a private copy of your data, or restore one on a new device. Backups stay on your device unless you share
        them.
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="export-backup"
          class="btn-primary"
          :disabled="exporting || erasing"
          @click="handleExport"
        >
          Export backup
        </button>
        <label class="btn-secondary inline-flex min-h-11 items-center cursor-pointer focus-within:outline-2 focus-within:outline-offset-4 focus-within:outline-sage">
          Restore backup
          <input
            data-testid="import-backup-input"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            :disabled="erasing || readingBackup"
            @change="handleFileChange"
          />
        </label>
      </div>
      <p
        v-if="exportStatus"
        data-testid="export-status"
        class="mt-2 text-sm"
        :class="exportStatus.ok ? 'text-sage' : 'text-danger'"
      >
        {{ exportStatus.text }}
      </p>
      <p
        v-if="restoreStatus"
        data-testid="restore-status"
        class="mt-2 text-sm"
        :class="restoreStatus.ok ? 'text-sage' : 'text-danger'"
      >
        {{ restoreStatus.text }}
      </p>
    </div>

    <section class="help-card" aria-labelledby="privacy-wellness-title">
      <h4 id="privacy-wellness-title" class="help-card-title">Privacy &amp; Wellness</h4>
      <p class="text-sm text-secondary">
        Sessions, presets, preferences, and optional pulse readings stay on this device in localStorage and IndexedDB.
        Breath in Flow has no accounts, cloud sync, analytics, or ads.
      </p>
      <a
        :href="privacyPolicyUrl"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex min-h-11 items-center text-sm font-medium text-sage underline underline-offset-4"
        @click="openPrivacyPolicy"
      >
        Read the privacy policy
      </a>
      <p class="text-sm text-secondary">
        Breath in Flow is for general wellness and relaxation. It is not a medical device and is not intended to
        diagnose, treat, cure, or prevent any condition. Never practice extended breath holds in water, while driving,
        or if you feel dizzy or lightheaded.
      </p>
    </section>

    <section class="help-card" aria-labelledby="reset-data-title">
      <h4 id="reset-data-title" class="help-card-title">Reset &amp; Erase Data</h4>
      <button
        type="button"
        data-testid="erase-all-data"
        class="practice-stop min-h-11 !border-terracotta"
        :disabled="erasing || exporting || readingBackup || confirmOpen"
        @click="openErase"
      >
        Erase all local data
      </button>
      <p
        v-if="eraseStatus"
        data-testid="erase-status"
        :role="eraseStatus.ok ? 'status' : 'alert'"
        class="mt-2 text-sm"
        :class="eraseStatus.ok ? 'text-sage' : 'text-danger'"
      >
        {{ eraseStatus.text }}
      </p>
    </section>

    <div
      v-if="eraseOpen"
      ref="eraseDialogRef"
      data-testid="erase-confirm-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="erase-confirm-title"
      aria-describedby="erase-confirm-description"
      tabindex="-1"
      class="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm safe-area-top safe-area-bottom"
    >
      <div class="card-solid max-h-full w-full max-w-md overflow-y-auto">
        <h2 id="erase-confirm-title" class="text-xl font-bold text-primary">Erase all local data?</h2>
        <p id="erase-confirm-description" class="mt-2 text-sm text-muted">
          This permanently removes all sessions, presets, pulse variability readings, assessments, and saved preferences
          on this device. You can keep a copy by exporting a backup before you erase.
        </p>
        <div class="mt-6 flex flex-wrap justify-end gap-2">
          <button
            ref="cancelEraseRef"
            type="button"
            data-testid="cancel-erase"
            class="btn-secondary !border-muted/65"
            :disabled="erasing"
            @click="cancelErase"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-erase"
            class="btn-danger !border-terracotta"
            :disabled="erasing"
            @click="confirmErase"
          >
            {{ erasing ? 'Erasing…' : 'Erase data' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Feedback -->
    <div class="help-card">
      <h4 class="help-card-title">Send feedback</h4>
      <p class="text-sm text-secondary mb-3">
        Share a note with the team. Messages include only your app and device details, never your practice data.
      </p>
      <button
        type="button"
        data-testid="send-feedback"
        class="btn-secondary"
        :disabled="sendingFeedback"
        @click="handleFeedback"
      >
        Send feedback
      </button>
      <p v-if="feedbackStatus" data-testid="feedback-status" class="mt-2 text-sm text-secondary">
        {{ feedbackStatus }}
      </p>
    </div>

    <!-- Restore confirmation. Rendered inline (not teleported) so it stays part
         of the embedding Help modal's subtree. -->
    <div
      v-if="pendingRestore"
      ref="confirmDialogRef"
      data-testid="restore-confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-confirm-title"
      tabindex="-1"
      class="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm safe-area-top safe-area-bottom"
    >
      <div class="card-solid max-w-md w-full">
        <h2 id="restore-confirm-title" ref="confirmTitleRef" tabindex="-1" class="text-xl font-bold text-primary">
          Restore this backup?
        </h2>
        <p class="mt-2 text-sm text-muted">
          This replaces all data currently on this device. This cannot be undone.
        </p>

        <div data-testid="backup-preview" class="mt-4 rounded-xl bg-surface-inset p-3 text-sm text-secondary">
          <p>Exported {{ formattedExportedAt }}</p>
          <ul class="mt-2 space-y-1">
            <li>{{ previewCounts.sessions }} sessions</li>
            <li>{{ previewCounts.measurements }} measurements</li>
            <li>{{ previewCounts.configs }} presets</li>
            <li>{{ previewCounts.assessments }} assessments</li>
          </ul>
        </div>

        <div class="mt-6 flex justify-end gap-2">
          <button
            type="button"
            data-testid="cancel-restore"
            class="btn-secondary"
            :disabled="restoring"
            @click="cancelRestore"
          >
            Cancel
          </button>
          <button
            type="button"
            data-testid="confirm-restore"
            class="btn-primary"
            :disabled="restoring"
            @click="confirmRestore"
          >
            Restore
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Capacitor } from '@capacitor/core';
import type { UserGoal } from '@breath-in-flow/shared';
import { usePreferences } from '@/composables/usePreferences';
import { useHrvStorage } from '@/composables/useHrvStorage';
import { useStorage } from '@/composables/useStorage';
import { useModalIsolation } from '@/composables/useModalIsolation';
import { createDefaultBackupService } from '@/services/appBackupService';
import { BackupRestoreError, type ParsedBackup } from '@/services/backupService';
import { sendSupportMessage, shareBackupFile } from '@/services/supportService';

const { selectedGoal, setGoal, replacePreferences } = usePreferences();
const privacyPolicyUrl = `${import.meta.env.BASE_URL}privacy.html`;

function openPrivacyPolicy(event: MouseEvent) {
  // The bundled WebViews cannot open their local asset URLs in an external tab.
  if (!Capacitor.isNativePlatform() && window.location.protocol !== 'file:') return;
  event.preventDefault();
  window.location.assign(privacyPolicyUrl);
}

// Built once; wiring is lazy, so no storage/native work happens until an action runs.
const backupService = createDefaultBackupService();

const goalChoices: Array<{ goal: UserGoal; testId: string; label: string }> = [
  { goal: 'RELAX', testId: 'goal-relax', label: 'Relax and unwind' },
  { goal: 'TRAIN_DIAPHRAGM', testId: 'goal-diaphragm', label: 'Train my diaphragm' },
  { goal: 'BUILD_CONSISTENCY', testId: 'goal-consistency', label: 'Build a consistent habit' },
  { goal: 'EXPLORE_PULSE_VARIABILITY', testId: 'goal-pulse', label: 'Explore pulse variability' },
];

const selectedGoalLabel = computed(
  () => goalChoices.find((choice) => choice.goal === selectedGoal.value)?.label ?? 'Not set'
);

const goalModel = computed<UserGoal | null>({
  get: () => selectedGoal.value,
  set: (goal) => {
    if (goal) setGoal(goal);
  },
});

// --- Export ---
const exporting = ref(false);
const exportStatus = ref<{ ok: boolean; text: string } | null>(null);

async function handleExport() {
  exporting.value = true;
  exportStatus.value = null;
  try {
    const { json } = await backupService.createBackup();
    const filename = `breath-in-flow-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const result = await shareBackupFile(json, filename);
    // The user dismissing the share sheet is a quiet no-op — no status to show.
    if (result.method === 'cancel') return;
    exportStatus.value = {
      ok: true,
      text: result.method === 'download' ? 'Backup downloaded.' : 'Backup ready to share.',
    };
  } catch {
    exportStatus.value = { ok: false, text: 'Could not export your backup. Please try again.' };
  } finally {
    exporting.value = false;
  }
}

// --- Restore ---
const pendingRestore = ref<ParsedBackup | null>(null);
const readingBackup = ref(false);
const restoring = ref(false);
const restoreStatus = ref<{ ok: boolean; text: string } | null>(null);

const confirmDialogRef = ref<HTMLElement | null>(null);
const confirmTitleRef = ref<HTMLElement | null>(null);
const confirmOpen = computed(() => pendingRestore.value !== null);
useModalIsolation(confirmDialogRef, confirmOpen, {
  initialFocus: () => confirmTitleRef.value,
  onEscape: () => cancelRestore(),
});

const previewCounts = computed(() => {
  const data = pendingRestore.value?.data;
  return {
    sessions: data?.sessions.length ?? 0,
    measurements: data?.measurements.length ?? 0,
    configs: data?.configs.length ?? 0,
    assessments: data?.assessments.length ?? 0,
  };
});

const formattedExportedAt = computed(() => {
  const raw = pendingRestore.value?.envelope.metadata.exportedAt;
  if (!raw) return 'unknown date';
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString();
});

function restoreErrorMessage(error: unknown): string {
  if (error instanceof BackupRestoreError) {
    if (error.stage === 'rollback') {
      return 'Restore failed and your data may now be inconsistent. Please restore again or reinstall.';
    }
    if (error.stage === 'validate') return error.message;
    return 'Restore failed, but your original data was kept.';
  }
  return 'This file could not be restored.';
}

async function handleFileChange(event: Event) {
  restoreStatus.value = null;
  pendingRestore.value = null;
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  // Clear the input immediately so selecting the same file again still fires 'change'.
  input.value = '';
  if (!file) return;

  readingBackup.value = true;
  try {
    pendingRestore.value = await backupService.parseBackupFile(file);
  } catch (error) {
    restoreStatus.value = { ok: false, text: restoreErrorMessage(error) };
  } finally {
    readingBackup.value = false;
  }
}

async function confirmRestore() {
  const parsed = pendingRestore.value;
  if (!parsed) return;
  restoring.value = true;
  restoreStatus.value = null;
  try {
    await backupService.restoreBackup(parsed);
    pendingRestore.value = null;
    restoreStatus.value = { ok: true, text: 'Your backup has been restored.' };
  } catch (error) {
    pendingRestore.value = null;
    restoreStatus.value = { ok: false, text: restoreErrorMessage(error) };
  } finally {
    restoring.value = false;
  }
}

function cancelRestore() {
  pendingRestore.value = null;
}

const eraseOpen = ref(false);
const erasing = ref(false);
const eraseStatus = ref<{ ok: boolean; text: string } | null>(null);
const eraseDialogRef = ref<HTMLElement | null>(null);
const cancelEraseRef = ref<HTMLButtonElement | null>(null);
useModalIsolation(eraseDialogRef, eraseOpen, {
  initialFocus: () => cancelEraseRef.value,
  canEscape: () => !erasing.value,
  onEscape: cancelErase,
});

function openErase() {
  eraseStatus.value = null;
  eraseOpen.value = true;
}

function cancelErase() {
  eraseOpen.value = false;
}

async function confirmErase() {
  if (erasing.value) return;
  erasing.value = true;
  try {
    await useHrvStorage().clearHrvData();
    useStorage().clearPracticeData();
    replacePreferences(null);
    eraseStatus.value = { ok: true, text: 'All local data was erased.' };
  } catch {
    eraseStatus.value = { ok: false, text: 'Some local data could not be erased. Please try again.' };
  } finally {
    erasing.value = false;
    eraseOpen.value = false;
  }
}

// --- Feedback ---
const sendingFeedback = ref(false);
const feedbackStatus = ref<string | null>(null);

const FEEDBACK_LABELS: Record<string, string> = {
  share: 'Opened the share sheet.',
  email: 'Opened your email app.',
  clipboard: 'Copied the details to your clipboard — paste them into a message.',
};

async function handleFeedback() {
  sendingFeedback.value = true;
  feedbackStatus.value = null;
  try {
    const { method } = await sendSupportMessage();
    // The user dismissing the share sheet is a quiet no-op — no status to show.
    if (method === 'cancel') return;
    feedbackStatus.value = FEEDBACK_LABELS[method] ?? 'Feedback ready to send.';
  } catch {
    feedbackStatus.value = 'Could not open a way to send feedback. Please try again.';
  } finally {
    sendingFeedback.value = false;
  }
}
</script>
