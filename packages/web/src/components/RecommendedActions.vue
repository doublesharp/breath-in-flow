<template>
  <aside data-testid="recommended-actions" class="recommendation">
    <div class="recommendation-copy">
      <p class="eyebrow">Recommended</p>
      <h2>{{ recommendation.title }}</h2>
      <p v-if="summary" class="recommendation-duration">{{ summary.duration }}</p>
    </div>
    <div class="recommendation-actions">
      <template v-if="hasRecommendedConfig">
        <button
          data-testid="start-recommended"
          class="btn-secondary recommendation-start"
          aria-label="Start recommended session"
          @click="emitStart"
        >
          <span>Start<span class="hidden min-[390px]:inline"> session</span></span>
          <svg
            aria-hidden="true"
            class="size-3.5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M4 12h15m-6-6 6 6-6 6" />
          </svg>
        </button>
        <button data-testid="adjust-recommended" class="btn-ghost" @click="emitAdjust">Adjust</button>
      </template>
      <button
        v-else-if="recommendation.kind === 'lab'"
        data-testid="open-lab"
        class="btn-secondary recommendation-start"
        @click="emitOpenLab"
      >
        Open the Lab
      </button>
      <p v-else data-testid="recommended-fallback" class="muted-copy text-sm">
        Choose a routine in Presets to get started.
      </p>
      <button v-if="lastSession" data-testid="repeat-last" class="btn-ghost" aria-label="Repeat last session" @click="emitRepeat">
        Repeat last<span class="hidden min-[480px]:inline"> session</span>
      </button>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, toRaw } from 'vue';
import { BreathingConfigSchema, type BreathingConfig, type Session, type UserGoal } from '@breath-in-flow/shared';
import { getPracticeSummary } from '@/utils/practiceSummary';
import { resolveRecommendation } from '@/services/recommendationService';
import { guidedPresets, presetConfig } from '@/data/guidedPresets';

const props = defineProps<{ goal: UserGoal; lastSession: Session | null }>();
const emit = defineEmits<{
  start: [config: BreathingConfig];
  adjust: [config: BreathingConfig];
  repeat: [config: BreathingConfig];
  openLab: [];
}>();

const recommendation = computed(() => resolveRecommendation(props.goal));

const recommendedPreset = computed(() => {
  const rec = recommendation.value;
  return rec.kind === 'practice' ? (guidedPresets.find((preset) => preset.id === rec.presetId) ?? null) : null;
});

const summary = computed(() => (recommendedPreset.value ? getPracticeSummary(recommendedPreset.value.config) : null));

// Detached, validated clone so a caller can never mutate the built-in preset.
function buildRecommendedConfig(): BreathingConfig | null {
  const preset = recommendedPreset.value;
  return preset ? structuredClone(presetConfig(preset)) : null;
}

// Backs the v-if for the start/adjust controls without cloning on every render.
const hasRecommendedConfig = computed(() => recommendedPreset.value !== null);

function emitStart() {
  const config = buildRecommendedConfig();
  if (config) emit('start', config);
}

function emitAdjust() {
  const config = buildRecommendedConfig();
  if (config) emit('adjust', config);
}

function emitRepeat() {
  if (!props.lastSession) return;
  // toRaw unwraps the reactive prop so structuredClone can detach the snapshot.
  const snapshot = structuredClone(toRaw(props.lastSession.configSnapshot));
  const result = BreathingConfigSchema.safeParse(snapshot);
  if (result.success) emit('repeat', result.data);
}

function emitOpenLab() {
  emit('openLab');
}
</script>
