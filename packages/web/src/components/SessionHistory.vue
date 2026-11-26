<template>
  <div class="space-y-6">
    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteModal"
          ref="deleteDialogRef"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-session-title"
          class="modal-overlay"
          @click.self="cancelDelete"
        >
          <div class="modal-content">
            <div class="modal-header">
              <div class="w-12 h-12 rounded-full bg-terracotta/15 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-6 h-6 text-danger"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 id="delete-session-title" class="text-lg font-semibold text-primary mt-3">Delete Session</h3>
              <div v-if="sessionToDelete" class="mt-3 p-3 rounded-lg bg-surface-inset border border-line-subtle">
                <p class="text-secondary text-sm font-medium">
                  {{ formatSessionForDelete(sessionToDelete) }}
                </p>
              </div>
              <p class="text-muted text-sm mt-3">
                Are you sure you want to delete this session? This action cannot be undone.
              </p>
            </div>
            <div class="modal-actions">
              <button @click="cancelDelete" class="btn-secondary flex-1">Cancel</button>
              <button @click="confirmDelete" class="btn-danger flex-1">Delete</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- Clear All Confirmation Modal -->
    <Teleport to="body">
      <Transition name="modal">
        <div
          v-if="showDeleteAllModal"
          ref="deleteAllDialogRef"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clear-sessions-title"
          class="modal-overlay"
          @click.self="cancelDeleteAll"
        >
          <div class="modal-content">
            <div class="modal-header">
              <div class="w-12 h-12 rounded-full bg-terracotta/15 flex items-center justify-center">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-6 h-6 text-danger"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 id="clear-sessions-title" class="text-lg font-semibold text-primary mt-3">Clear All Sessions</h3>
              <p class="text-muted text-sm mt-1">
                Are you sure you want to clear all {{ sessions.length }} sessions? This action cannot be undone.
              </p>
            </div>
            <div class="modal-actions">
              <button @click="cancelDeleteAll" class="btn-secondary flex-1">Cancel</button>
              <button @click="confirmDeleteAll" class="btn-danger flex-1">Clear All</button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

    <div class="card-solid animate-fade-in">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div class="flex items-center gap-3">
          <div
            class="w-10 h-10 shrink-0 rounded-xl bg-surface-raised text-sage flex items-center justify-center"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <div>
            <h2 class="text-xl font-bold text-primary">Session History</h2>
            <p class="text-sm text-muted">Track your progress over time</p>
          </div>
        </div>
        <button
          v-if="sessions.length > 0"
          @click="deleteAllSessions"
          class="ml-auto min-h-11 shrink-0 whitespace-nowrap rounded-xl border border-terracotta/25 bg-terracotta/10 px-4 py-2 text-sm font-medium text-danger transition-all hover:border-terracotta/40 hover:bg-terracotta/16 hover:text-primary"
        >
          Clear All
        </button>
      </div>

      <!-- Stats Summary -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div class="stat-card">
          <div class="text-2xl font-semibold tabular-nums text-primary sm:text-3xl">{{ stats.totalSessions }}</div>
          <div class="text-sm text-muted mt-1">Total Sessions</div>
        </div>
        <div class="stat-card">
          <div class="text-2xl font-semibold tabular-nums text-primary sm:text-3xl">{{ stats.totalSets }}</div>
          <div class="text-sm text-muted mt-1">Total Sets</div>
        </div>
        <div class="stat-card">
          <div class="text-2xl font-semibold tabular-nums text-primary sm:text-3xl">
            {{ formatTimeSimple(stats.avgHoldTime) }}
          </div>
          <div class="text-sm text-muted mt-1">Avg Hold Time</div>
        </div>
        <div class="stat-card">
          <div class="text-2xl font-semibold tabular-nums text-sage sm:text-3xl">
            {{ formatTimeSimple(stats.maxHoldTime) }}
          </div>
          <div class="text-sm text-muted mt-1">Best Hold Time</div>
        </div>
      </div>

      <!-- Session List -->
      <div v-if="sessions.length === 0" class="text-center py-12 px-4 bg-surface-inset border border-line-subtle rounded-xl">
        <div
          class="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-raised text-sage flex items-center justify-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-8 h-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
            />
          </svg>
        </div>
        <p class="text-muted">No sessions recorded yet.</p>
        <p class="text-muted text-sm mt-1">Start your first breathing practice!</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="session in sessions"
          :key="session.id"
          class="rounded-xl bg-surface-raised border border-line-subtle p-3 sm:p-5"
        >
          <div class="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
            <div>
              <div class="font-semibold text-primary wrap-anywhere">
                {{ session.configSnapshot.name }}
              </div>
              <div class="text-sm text-muted mt-1">
                {{ formatSessionDate(session.startedAt) }}
              </div>
            </div>
            <div class="flex items-center gap-3">
              <SessionStatusBadge :status="session.status" />
              <button
                @click="deleteSession(session.id!)"
                class="w-11 h-11 shrink-0 rounded-lg bg-terracotta/10 text-danger hover:bg-terracotta/16 hover:text-primary transition-all flex items-center justify-center"
                title="Delete session"
                aria-label="Delete session"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fill-rule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Session Details -->
          <div class="mt-4 grid grid-cols-2 sm:grid-cols-[1fr_2fr_1fr] gap-2">
            <div class="bg-surface-inset rounded-lg p-3">
              <div class="text-xs text-muted uppercase tracking-wider">Sets</div>
              <div class="text-base font-semibold tabular-nums text-primary mt-1">{{ session.completedSets }}</div>
            </div>
            <div class="col-span-2 sm:col-span-1 bg-surface-inset rounded-lg p-3 overflow-x-auto">
              <div class="text-xs text-muted uppercase tracking-wider">Pattern</div>
              <div class="text-base font-semibold tabular-nums text-primary mt-1 whitespace-nowrap">
                {{ formatSessionPattern(session.configSnapshot) }}
              </div>
            </div>
            <div class="col-start-2 row-start-1 sm:col-start-3 bg-surface-inset rounded-lg p-3">
              <div class="text-xs text-muted uppercase tracking-wider">Reps</div>
              <div class="text-base font-semibold tabular-nums text-primary mt-1">
                {{ session.configSnapshot.repetitions }}
              </div>
            </div>
          </div>

          <!-- Extended Holds -->
          <div v-if="getSessionHolds(session).length > 0" class="mt-4">
            <div class="text-xs text-muted uppercase tracking-wider mb-2">Extended Holds</div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="(hold, index) in getSessionHolds(session)"
                :key="index"
                class="px-3 py-1.5 bg-clay/12 text-sand rounded-lg text-sm border border-clay/25"
              >
                {{ hold.type }}: {{ formatTimeSimple(hold.actualDuration) }}
              </span>
            </div>
          </div>

          <!-- Check-In -->
          <div v-if="session.checkIn" data-testid="session-checkin" class="mt-4 p-3 bg-surface-inset rounded-lg">
            <div class="text-xs text-muted uppercase tracking-wider mb-2">Check-In</div>
            <div class="flex flex-wrap gap-2">
              <span
                v-if="session.checkIn.before"
                class="px-3 py-1.5 bg-surface-raised text-secondary rounded-lg text-sm border border-line-subtle"
              >
                Before: {{ feelingLabel(session.checkIn.before) }}
              </span>
              <span
                v-if="session.checkIn.after"
                class="px-3 py-1.5 bg-surface-raised text-secondary rounded-lg text-sm border border-line-subtle"
              >
                After: {{ feelingLabel(session.checkIn.after) }}
              </span>
            </div>
            <p v-if="session.checkIn.comment" class="text-secondary text-sm italic mt-2">
              "{{ session.checkIn.comment }}"
            </p>
          </div>

          <!-- Notes -->
          <div v-if="session.notes" class="mt-4 p-3 bg-surface-inset rounded-lg">
            <div class="text-xs text-muted uppercase tracking-wider mb-1">Notes</div>
            <p class="text-secondary text-sm italic">"{{ session.notes }}"</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useModalIsolation } from '../composables/useModalIsolation';
import { formatSessionDate, formatSessionPattern } from '../utils/practiceSummary';
import SessionStatusBadge from './SessionStatusBadge.vue';
import { useStorage } from '../composables';
import { formatTimeSimple, type FeelingScore, type Session, type ExtendedHoldRecord } from '@breath-in-flow/shared';

const FEELING_LABELS: Record<FeelingScore, string> = {
  1: 'Very uncomfortable',
  2: 'Uncomfortable',
  3: 'Neutral',
  4: 'Comfortable',
  5: 'Very comfortable',
};

function feelingLabel(score: FeelingScore): string {
  return FEELING_LABELS[score];
}

const storage = useStorage();

const sessions = computed(() => storage.getAllSessions());
const stats = computed(() => storage.stats.value);

// Delete confirmation modal state
const showDeleteModal = ref(false);
const sessionToDelete = ref<string | null>(null);
const showDeleteAllModal = ref(false);
const deleteDialogRef = ref<HTMLElement | null>(null);
const deleteAllDialogRef = ref<HTMLElement | null>(null);

useModalIsolation(deleteDialogRef, showDeleteModal, { onEscape: cancelDelete });
useModalIsolation(deleteAllDialogRef, showDeleteAllModal, { onEscape: cancelDeleteAll });

function getSessionHolds(session: Session): ExtendedHoldRecord[] {
  return session.sets.flatMap((set) => set.extendedHolds);
}

function deleteSession(id: string) {
  sessionToDelete.value = id;
  showDeleteModal.value = true;
}

function cancelDelete() {
  showDeleteModal.value = false;
  sessionToDelete.value = null;
}

function confirmDelete() {
  if (sessionToDelete.value) {
    storage.deleteSession(sessionToDelete.value);
  }
  showDeleteModal.value = false;
  sessionToDelete.value = null;
}

function deleteAllSessions() {
  showDeleteAllModal.value = true;
}

function cancelDeleteAll() {
  showDeleteAllModal.value = false;
}

function confirmDeleteAll() {
  storage.deleteAllSessions();
  showDeleteAllModal.value = false;
}

function formatSessionForDelete(sessionId: string): string {
  const session = sessions.value.find((s) => s.id === sessionId);
  if (!session || !session.configSnapshot) return 'Unknown session';

  const date = new Date(session.startedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  const pattern = `${session.configSnapshot.inhaleTime ?? 0}s / ${session.configSnapshot.inhaleHoldTime ?? 0}s / ${session.configSnapshot.exhaleTime ?? 0}s / ${session.configSnapshot.exhaleHoldTime ?? 0}s`;

  return `${date} • ${pattern}`;
}
</script>

<style scoped>
@reference "../style.css";
.modal-overlay {
  @apply fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4;
}

.modal-content {
  @apply bg-surface-card rounded-2xl shadow-2xl w-full max-w-sm p-6 border border-line-strong text-center;
}

.modal-header {
  @apply flex flex-col items-center;
}

.modal-actions {
  @apply flex gap-3 mt-6;
}

/* Modal transitions */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-active .modal-content,
.modal-leave-active .modal-content {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-content,
.modal-leave-to .modal-content {
  transform: scale(0.95) translateY(10px);
  opacity: 0;
}
</style>
