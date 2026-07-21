<template>
  <div data-testid="recommended-actions" class="card-solid !p-4 sm:!p-5">
    <p class="text-sm font-medium text-amber-200/90">Recommended for you</p>
    <h2 class="mt-1 text-lg font-bold text-white">{{ recommendation.title }}</h2>

    <div class="mt-4 flex flex-col sm:flex-row flex-wrap gap-3">
      <template v-if="recommendedConfig">
        <button data-testid="start-recommended" class="btn-primary" @click="emitStart">
          Start recommended session
        </button>
        <button data-testid="adjust-recommended" class="btn-secondary" @click="emitAdjust">Adjust first</button>
      </template>

      <button v-else-if="recommendation.kind === 'lab'" data-testid="open-lab" class="btn-primary" @click="emitOpenLab">
        Open the Lab
      </button>

      <p v-else data-testid="recommended-fallback" class="text-sm text-slate-400">
        Choose a breathing preset below to get started.
      </p>

      <button v-if="lastSession" data-testid="repeat-last" class="btn-secondary" @click="emitRepeat">
        Repeat last session
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, toRaw } from 'vue';
import { BreathingConfigSchema, type BreathingConfig, type Session, type UserGoal } from '@breath-in-flow/shared';
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

// Detached, validated clone so a caller can never mutate the built-in preset.
function buildRecommendedConfig(): BreathingConfig | null {
  const preset = recommendedPreset.value;
  return preset ? structuredClone(presetConfig(preset)) : null;
}

// Backs the v-if for the start/adjust controls without cloning on every render.
const recommendedConfig = computed(() => recommendedPreset.value !== null);

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
