<template>
  <div
    v-if="open"
    ref="dialogRef"
    data-testid="feeling-checkin"
    role="dialog"
    aria-modal="true"
    aria-labelledby="feeling-checkin-title"
    class="fixed inset-0 z-[100] flex items-start sm:items-center justify-center overflow-y-auto p-4 bg-black/70 backdrop-blur-sm safe-area-top safe-area-bottom"
  >
    <div
      data-testid="checkin-card"
      class="card-solid my-auto max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg min-w-0 overflow-y-auto overscroll-contain animate-scale-in"
    >
      <h2 id="feeling-checkin-title" ref="titleRef" tabindex="-1" class="text-2xl font-bold text-white">
        {{ title }}
      </h2>
      <p class="mt-2 text-slate-400">This optional check-in is just for you. You can skip it.</p>

      <fieldset class="mt-6 space-y-2">
        <legend class="sr-only">Choose how comfortable you feel</legend>
        <label
          v-for="option in options"
          :key="option.score"
          class="flex items-center gap-3 p-3 rounded-xl border border-white/[0.08] bg-white/[0.03] cursor-pointer transition-colors hover:border-white/20"
          :class="selectedScore === option.score ? 'border-amber-400/60 bg-amber-500/10' : ''"
        >
          <input
            v-model.number="selectedScore"
            type="radio"
            name="feeling-score"
            class="h-4 w-4 accent-amber-400"
            :value="option.score"
            :data-testid="`feeling-score-${option.score}`"
          />
          <span class="font-medium text-white">{{ option.label }}</span>
        </label>
      </fieldset>

      <div v-if="stage === 'after'" class="mt-5">
        <label for="feeling-checkin-comment" class="form-label">Add a note (optional)</label>
        <textarea
          id="feeling-checkin-comment"
          v-model="comment"
          data-testid="checkin-comment"
          rows="3"
          maxlength="500"
          class="form-input resize-none w-full"
          placeholder="Anything you noticed about this practice..."
        ></textarea>
      </div>

      <label class="mt-5 flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          data-testid="checkin-skip-always"
          class="mt-1 h-4 w-4 accent-amber-400"
          :checked="skipEveryTime"
          @change="emit('update:skipEveryTime', ($event.target as HTMLInputElement).checked)"
        />
        <span>
          <span class="font-medium text-white">Skip every time</span>
          <span class="block text-sm text-slate-400">Skip check-ins before and after practice. Turn them back on in settings.</span>
        </span>
      </label>

      <p
        v-if="errorMessage"
        role="alert"
        class="mt-5 rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm font-medium text-rose-100"
      >
        {{ errorMessage }}
      </p>

      <div
        data-testid="checkin-actions"
        class="sticky bottom-0 z-10 -mx-6 -mb-6 mt-6 flex justify-end gap-3 border-t border-white/[0.06] bg-[#2b241d]/95 px-6 py-4 backdrop-blur-sm"
      >
        <button data-testid="checkin-skip" class="btn-secondary" @click="skip">Skip</button>
        <button data-testid="checkin-submit" class="btn-primary" :disabled="selectedScore === null" @click="submit">
          {{ submitLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import type { FeelingScore } from '@breath-in-flow/shared';
import { useModalIsolation } from '../composables/useModalIsolation';

const props = defineProps<{
  open: boolean;
  stage: 'before' | 'after';
  initialScore?: FeelingScore;
  errorMessage?: string;
  skipEveryTime?: boolean;
}>();

const emit = defineEmits<{
  submit: [{ score: FeelingScore; comment?: string }];
  skip: [];
  'update:skipEveryTime': [value: boolean];
}>();

const options: Array<{ score: FeelingScore; label: string }> = [
  { score: 1, label: 'Very uncomfortable' },
  { score: 2, label: 'Uncomfortable' },
  { score: 3, label: 'Neutral' },
  { score: 4, label: 'Comfortable' },
  { score: 5, label: 'Very comfortable' },
];

const selectedScore = ref<FeelingScore | null>(props.initialScore ?? null);
const comment = ref('');

const title = computed(() => (props.stage === 'before' ? 'How do you feel right now?' : 'How did that feel?'));
const submitLabel = computed(() => (props.stage === 'before' ? 'Continue' : 'Save'));

// Reset the form each time the prompt opens so a new session starts clean.
watch(
  () => props.open,
  (open) => {
    if (open) {
      selectedScore.value = props.initialScore ?? null;
      comment.value = '';
    }
  }
);

function submit() {
  if (selectedScore.value === null) return;
  const payload: { score: FeelingScore; comment?: string } = { score: selectedScore.value };
  const trimmed = comment.value.trim();
  if (props.stage === 'after' && trimmed) payload.comment = trimmed;
  emit('submit', payload);
}

function skip() {
  emit('skip');
}

const dialogRef = ref<HTMLElement | null>(null);
const titleRef = ref<HTMLElement | null>(null);
const isolationActive = ref(false);

useModalIsolation(dialogRef, isolationActive, {
  initialFocus: () => titleRef.value,
  // Escape skips the optional check-in, matching the app's dialog conventions.
  onEscape: () => emit('skip'),
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
</script>
