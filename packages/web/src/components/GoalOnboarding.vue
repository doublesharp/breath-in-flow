<template>
  <div
    v-if="open"
    ref="dialogRef"
    role="dialog"
    aria-modal="true"
    aria-labelledby="goal-onboarding-title"
    class="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto p-4 bg-black/70 backdrop-blur-sm safe-area-top safe-area-bottom"
  >
    <div
      data-testid="goal-onboarding-card"
      class="card-solid my-auto grid max-h-[calc(100dvh-2rem)] w-full max-w-lg min-w-0 grid-rows-[minmax(0,1fr)_auto] overflow-hidden !p-0 animate-scale-in"
    >
      <div class="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
        <h2
          id="goal-onboarding-title"
          ref="titleRef"
          tabindex="-1"
          class="text-2xl font-bold text-primary focus:outline-none"
        >
          What brings you here?
        </h2>
        <p class="mt-2 text-muted">Pick a starting goal. You can change it any time.</p>

        <fieldset class="mt-4 space-y-2 sm:mt-6 sm:space-y-3">
          <legend class="sr-only">Choose a wellness goal</legend>
          <label
            v-for="choice in choices"
            :key="choice.goal"
            class="selectable-row flex min-h-14 items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors hover:border-sage/60 sm:p-4"
            :class="selected === choice.goal ? 'border-sage/70 bg-sage/12' : 'border-line-subtle bg-surface-inset'"
          >
            <input
              v-model="selected"
              type="radio"
              name="wellness-goal"
              class="selectable-row-input"
              :value="choice.goal"
              :data-testid="choice.testId"
            />
            <span
              aria-hidden="true"
              class="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border"
              :class="selected === choice.goal ? 'border-sage' : 'border-muted'"
            >
              <span v-if="selected === choice.goal" class="size-2.5 rounded-full bg-sage"></span>
            </span>
            <span>
              <span class="block font-medium text-primary">{{ choice.label }}</span>
              <span class="block text-sm text-muted">{{ choice.description }}</span>
            </span>
          </label>
        </fieldset>

        <p v-if="saveError" role="alert" class="mt-4 text-sm text-danger">{{ saveError }}</p>
      </div>

      <div
        data-testid="goal-onboarding-actions"
        class="sticky bottom-0 flex items-center justify-end gap-3 border-t border-line-subtle bg-surface-card px-4 py-3 sm:px-6"
      >
        <p v-if="selected === null" id="goal-selection-hint" class="mr-auto text-sm text-sand">
          Select a goal to continue
        </p>
        <button
          data-testid="save-goal"
          class="btn-primary disabled:opacity-45"
          :disabled="selected === null"
          :aria-describedby="selected === null ? 'goal-selection-hint' : undefined"
          @click="save"
        >
          Continue
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import type { UserGoal } from '@breath-in-flow/shared';
import { useModalIsolation } from '../composables/useModalIsolation';

const props = defineProps<{ open: boolean; saveError?: string | null }>();
const emit = defineEmits<{ select: [goal: UserGoal] }>();

const choices: Array<{ goal: UserGoal; testId: string; label: string; description: string }> = [
  {
    goal: 'RELAX',
    testId: 'goal-relax',
    label: 'Relax and unwind',
    description: 'A short, calming pattern for a quick reset.',
  },
  {
    goal: 'TRAIN_DIAPHRAGM',
    testId: 'goal-diaphragm',
    label: 'Train my diaphragm',
    description: 'A conservative cadence for controlled breathing practice.',
  },
  {
    goal: 'BUILD_CONSISTENCY',
    testId: 'goal-consistency',
    label: 'Build a consistent habit',
    description: 'An even, paced rhythm to practice most days.',
  },
  {
    goal: 'EXPLORE_PULSE_VARIABILITY',
    testId: 'goal-pulse',
    label: 'Explore pulse variability',
    description: 'Head to Pulse Variability for an optional pulse-timing check.',
  },
];

const selected = ref<UserGoal | null>(null);
const dialogRef = ref<HTMLElement | null>(null);
const titleRef = ref<HTMLElement | null>(null);

// Onboarding is mandatory, so it renders open on first paint. useModalIsolation
// activates on an open transition, so mirror the prop into this ref after mount
// to run the focus trap and background isolation for the initially-open dialog.
const isolationActive = ref(false);
useModalIsolation(dialogRef, isolationActive, {
  initialFocus: () => titleRef.value,
});
watch(
  () => props.open,
  (open) => {
    isolationActive.value = open;
  }
);
onMounted(() => {
  isolationActive.value = props.open;
});

function save() {
  if (selected.value === null) return;
  emit('select', selected.value);
}
</script>
