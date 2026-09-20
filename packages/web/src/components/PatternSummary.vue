<template>
  <div class="pattern-summary" :class="{ 'pattern-summary-compact': compact }">
    <dl class="pattern-phases" aria-label="Breathing pattern">
      <div v-for="phase in phases" :key="phase.id" :class="'pattern-phase-' + phase.kind">
        <dt>{{ phase.label }}</dt>
        <dd>{{ phase.seconds }}<span>s</span></dd>
      </div>
    </dl>
    <div v-if="summary" class="pattern-meta">
      <span class="pattern-duration">{{ summary.duration }}</span>
      <span class="pattern-detail">{{ summary.detail }}</span>
    </div>
    <p v-if="config.extendedHoldEnabled" class="pattern-holds">
      {{ holdLabel(config.extendedHoldType, config.extendedHoldMode, config.extendedHoldDuration) }}
      <template v-if="config.secondExtendedHoldEnabled">
        <span aria-hidden="true"> → </span>
        {{ holdLabel(config.secondExtendedHoldType, config.secondExtendedHoldMode, config.secondExtendedHoldDuration) }}
      </template>
    </p>
    <p v-if="config.restBetweenSetsSeconds > 0 && config.targetSets !== 1" class="pattern-holds">
      {{ config.restBetweenSetsSeconds }}s rest between sets
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { BreathingConfig, ExtendedHoldMode, ExtendedHoldType } from '@breath-in-flow/shared';
import { getPracticeSummary } from '@/utils/practiceSummary';

const props = defineProps<{ config: BreathingConfig; compact?: boolean }>();
const summary = computed(() => getPracticeSummary(props.config));
const phases = computed(() =>
  [
    { id: 'inhale', kind: 'inhale', label: 'Inhale', seconds: props.config.inhaleTime },
    { id: 'inhale-hold', kind: 'hold', label: 'Hold', seconds: props.config.inhaleHoldTime },
    { id: 'exhale', kind: 'exhale', label: 'Exhale', seconds: props.config.exhaleTime },
    { id: 'exhale-hold', kind: 'hold', label: 'Hold', seconds: props.config.exhaleHoldTime },
  ].filter((phase) => Number.isFinite(phase.seconds) && phase.seconds > 0)
);

function holdLabel(type: ExtendedHoldType, mode: ExtendedHoldMode, duration: number): string {
  const label = type === 'INHALE' ? 'Inhale hold' : 'Exhale hold';
  return mode === 'TOLERANCE' ? `${label} · at your pace` : `${label} · ${duration}s`;
}
</script>
