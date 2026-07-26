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
      class="card-solid my-auto max-h-[calc(100dvh-2rem)] max-w-lg w-full overflow-y-auto overscroll-contain animate-scale-in"
    >
      <h2 id="goal-onboarding-title" ref="titleRef" tabindex="-1" class="text-2xl font-bold text-white">
        What brings you here?
      </h2>
      <p class="mt-2 text-slate-400">Pick a starting goal. You can change it any time.</p>

      <fieldset class="mt-6 space-y-3">
        <legend class="sr-only">Choose a wellness goal</legend>
        <label
          v-for="choice in choices"
          :key="choice.goal"
          class="flex items-start gap-3 p-4 rounded-xl border border-white/[0.08] bg-white/[0.03] cursor-pointer transition-colors hover:border-white/20"
          :class="selected === choice.goal ? 'border-amber-400/60 bg-amber-500/10' : ''"
        >
          <input
            v-model="selected"
            type="radio"
            name="wellness-goal"
            class="mt-1 h-4 w-4 accent-amber-400"
            :value="choice.goal"
            :data-testid="choice.testId"
          />
          <span>
            <span class="block font-medium text-white">{{ choice.label }}</span>
            <span class="block text-sm text-slate-400">{{ choice.description }}</span>
          </span>
        </label>
      </fieldset>

      <div class="mt-6 flex justify-end">
        <button data-testid="save-goal" class="btn-primary" :disabled="selected === null" @click="save">
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

const props = defineProps<{ open: boolean }>();
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
    description: 'Head to the Lab for an optional pulse-timing check.',
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
