<template>
  <div data-testid="data-support-settings" class="space-y-4">
    <!-- Goal -->
    <div class="help-card">
      <h4 class="help-card-title">Your goal</h4>
      <p class="text-sm text-slate-300">
        Current goal:
        <strong data-testid="selected-goal" class="text-white">{{ selectedGoalLabel }}</strong>
      </p>
      <fieldset class="mt-3 space-y-2">
        <legend class="sr-only">Change your wellness goal</legend>
        <label
          v-for="choice in goalChoices"
          :key="choice.goal"
          class="flex items-start gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.03] cursor-pointer transition-colors hover:border-white/20"
          :class="selectedGoal === choice.goal ? 'border-amber-400/60 bg-amber-500/10' : ''"
        >
          <input
            v-model="goalModel"
            type="radio"
            name="data-support-goal"
            class="mt-1 h-4 w-4 accent-amber-400"
            :value="choice.goal"
            :data-testid="choice.testId"
          />
          <span class="block text-sm font-medium text-white">{{ choice.label }}</span>
        </label>
      </fieldset>
    </div>

    <!-- Backup -->
    <div class="help-card">
      <h4 class="help-card-title">Backup</h4>
      <p class="text-sm text-slate-300 mb-3">
        Export a private copy of your data, or restore one on a new device. Backups stay on your
        device unless you share them.
      </p>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          data-testid="export-backup"
          class="btn-primary"
          :disabled="exporting"
          @click="handleExport"
        >
          Export backup
        </button>
        <label class="btn-secondary cursor-pointer">
          Restore backup
          <input
            data-testid="import-backup-input"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            @change="handleFileChange"
          />
        </label>
      </div>
      <p
        v-if="exportStatus"
        data-testid="export-status"
        class="mt-2 text-sm"
        :class="exportStatus.ok ? 'text-emerald-400' : 'text-rose-400'"
      >
        {{ exportStatus.text }}
      </p>
      <p
        v-if="restoreStatus"
        data-testid="restore-status"
        class="mt-2 text-sm"
        :class="restoreStatus.ok ? 'text-emerald-400' : 'text-rose-400'"
      >
        {{ restoreStatus.text }}
      </p>
    </div>

    <!-- Feedback -->
    <div class="help-card">
      <h4 class="help-card-title">Send feedback</h4>
      <p class="text-sm text-slate-300 mb-3">
        Share a note with the team. We only include your app and device details — never your
        practice data.
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
      <p v-if="feedbackStatus" data-testid="feedback-status" class="mt-2 text-sm text-slate-300">
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
          <h2 id="restore-confirm-title" ref="confirmTitleRef" tabindex="-1" class="text-xl font-bold text-white">
            Restore this backup?
          </h2>
          <p class="mt-2 text-sm text-slate-400">
            This replaces all data currently on this device. This cannot be undone.
          </p>

          <div data-testid="backup-preview" class="mt-4 rounded-xl bg-white/[0.03] p-3 text-sm text-slate-300">
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
import type { UserGoal } from '@breath-in-flow/shared';
import { usePreferences } from '@/composables/usePreferences';
import { useModalIsolation } from '@/composables/useModalIsolation';
import { createDefaultBackupService } from '@/services/appBackupService';
import { BackupRestoreError, type ParsedBackup } from '@/services/backupService';
import { sendSupportMessage, shareBackupFile } from '@/services/supportService';

const { selectedGoal, setGoal } = usePreferences();

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

  try {
    pendingRestore.value = await backupService.parseBackupFile(file);
  } catch (error) {
    restoreStatus.value = { ok: false, text: restoreErrorMessage(error) };
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
    feedbackStatus.value = FEEDBACK_LABELS[method] ?? 'Feedback ready to send.';
  } catch {
    feedbackStatus.value = 'Could not open a way to send feedback. Please try again.';
  } finally {
    sendingFeedback.value = false;
  }
}
</script>

<style scoped>
@reference "tailwindcss";
.help-card {
  @apply bg-slate-800/50 rounded-xl p-4 border border-slate-700/30;
}

.help-card-title {
  @apply font-semibold text-white mb-2;
}

.btn-secondary {
  @apply inline-flex items-center gap-2 min-h-11 px-4 py-2 rounded-lg text-sm font-medium text-slate-200 bg-white/[0.06] border border-white/10 hover:bg-white/10 transition-all;
}
</style>
