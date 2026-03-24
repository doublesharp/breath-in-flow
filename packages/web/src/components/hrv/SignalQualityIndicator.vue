<template>
  <div class="signal-quality-indicator flex flex-col items-center gap-2">
    <!-- Circular progress ring -->
    <div class="relative" :style="{ width: ringSize + 'px', height: ringSize + 'px' }">
      <svg
        :width="ringSize"
        :height="ringSize"
        :viewBox="`0 0 ${ringSize} ${ringSize}`"
        class="-rotate-90"
        style="overflow: visible"
      >
        <!-- Background track -->
        <circle
          :cx="center"
          :cy="center"
          :r="radius"
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          :stroke-width="strokeWidth"
        />
        <!-- Progress arc -->
        <circle
          :cx="center"
          :cy="center"
          :r="radius"
          fill="none"
          :stroke="qualityColor"
          :stroke-width="strokeWidth"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="dashOffset"
          class="quality-arc"
          :style="{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease' }"
        />
      </svg>
      <!-- Center text -->
      <div class="absolute inset-0 flex items-center justify-center">
        <span class="font-bold tabular-nums" :style="{ color: qualityColor, fontSize: pctFontSize + 'px' }">
          {{ pctDisplay }}%
        </span>
      </div>
    </div>

    <!-- Status message -->
    <p class="text-xs font-medium text-center" :style="{ color: qualityColor }">
      {{ statusMessage }}
    </p>
    <p class="text-xs text-white/40 text-center">{{ sensorLabel }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    quality: number;
    sensorType: 'ppg' | 'scg';
    ringSize?: number;
  }>(),
  {
    ringSize: 80,
  }
);

const strokeWidth = 7;
const center = computed(() => props.ringSize / 2);
const radius = computed(() => props.ringSize / 2 - strokeWidth);
const circumference = computed(() => 2 * Math.PI * radius.value);
const dashOffset = computed(() => circumference.value * (1 - Math.min(1, Math.max(0, props.quality))));

const pctDisplay = computed(() => Math.round(Math.min(1, Math.max(0, props.quality)) * 100));
const pctFontSize = computed(() => Math.round(props.ringSize * 0.2));

const qualityColor = computed(() => {
  const q = props.quality;
  if (q >= 0.7) return '#4ade80'; // green
  if (q >= 0.3) return '#f59e0b'; // amber
  return '#ef4444'; // red
});

const statusMessage = computed(() => {
  const q = props.quality;
  if (q >= 0.85) return 'Excellent signal';
  if (q >= 0.7) return 'Good signal';
  if (q >= 0.5) return 'Fair signal';
  if (q >= 0.3) {
    return props.sensorType === 'ppg' ? 'Adjust finger position' : 'Hold very still';
  }
  return props.sensorType === 'ppg' ? 'Poor — check finger' : 'Too much motion';
});

const sensorLabel = computed(() => {
  return props.sensorType === 'ppg' ? 'PPG Sensor' : 'SCG Sensor';
});
</script>
