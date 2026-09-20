<template>
  <svg
    data-testid="breathing-pressure-field"
    :data-pressure-state="pressureState"
    class="pressure-field"
    viewBox="0 0 100 100"
    role="presentation"
    aria-hidden="true"
  >
    <defs>
      <radialGradient :id="backdropId" cx="46%" cy="43%" r="62%">
        <stop offset="0%" stop-color="#24413c" />
        <stop offset="55%" stop-color="#142d2a" />
        <stop offset="100%" stop-color="#091a19" />
      </radialGradient>
      <radialGradient :id="tealId" cx="34%" cy="30%" r="68%">
        <stop offset="0%" stop-color="#b8ead8" stop-opacity="0.92" />
        <stop offset="48%" stop-color="#65b9a4" stop-opacity="0.58" />
        <stop offset="100%" stop-color="#205c55" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="warmId" cx="68%" cy="70%" r="64%">
        <stop offset="0%" stop-color="#f0d5a7" stop-opacity="0.88" />
        <stop offset="46%" stop-color="#c88e67" stop-opacity="0.48" />
        <stop offset="100%" stop-color="#623f35" stop-opacity="0" />
      </radialGradient>
      <radialGradient :id="centerVeilId" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stop-color="#102725" stop-opacity="0.9" />
        <stop offset="58%" stop-color="#102725" stop-opacity="0.54" />
        <stop offset="100%" stop-color="#102725" stop-opacity="0" />
      </radialGradient>
      <filter :id="warpId" x="-25%" y="-25%" width="150%" height="150%">
        <feTurbulence type="fractalNoise" baseFrequency="0.018 0.026" numOctaves="2" seed="11" result="texture" />
        <feDisplacementMap in="SourceGraphic" in2="texture" scale="5" xChannelSelector="R" yChannelSelector="G" />
        <feGaussianBlur stdDeviation="1.2" />
      </filter>
      <clipPath :id="discId"><circle cx="50" cy="50" r="49" /></clipPath>
    </defs>
    <g :clip-path="`url(#${discId})`">
      <circle data-pressure-layer cx="50" cy="50" r="49" :fill="`url(#${backdropId})`" />
      <circle
        data-pressure-layer
        cx="42"
        cy="42"
        r="53"
        :fill="`url(#${tealId})`"
        :opacity="layerOpacity"
        :style="{ filter: `url(#${warpId})` }"
      />
      <circle
        data-pressure-layer
        data-testid="pressure-energy"
        cx="58"
        cy="58"
        :r="energyRadius"
        :fill="`url(#${warmId})`"
        :opacity="energyOpacity"
        :style="{ filter: `url(#${warpId})` }"
      />
      <circle data-testid="pressure-center-veil" cx="50" cy="50" r="29" :fill="`url(#${centerVeilId})`" />
    </g>
  </svg>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import type { BreathingPhase } from '@breath-in-flow/shared';

const props = withDefaults(defineProps<{ scale: number; phase?: BreathingPhase }>(), { phase: 'IDLE' });
const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, '');
const backdropId = `pressure-backdrop-${instanceId}`;
const tealId = `pressure-teal-${instanceId}`;
const warmId = `pressure-warm-${instanceId}`;
const centerVeilId = `pressure-center-${instanceId}`;
const warpId = `pressure-warp-${instanceId}`;
const discId = `pressure-disc-${instanceId}`;
const motionQuery = typeof window === 'undefined' ? null : window.matchMedia?.('(prefers-reduced-motion: reduce)');
const reduceMotion = ref(motionQuery?.matches ?? false);
const renderedScale = ref(props.scale);
const renderedPhase = ref(props.phase);

const isHold = (phase: BreathingPhase) =>
  phase === 'INHALE_HOLD' ||
  phase === 'EXHALE_HOLD' ||
  phase === 'EXTENDED_INHALE_HOLD' ||
  phase === 'EXTENDED_EXHALE_HOLD';
const updateRenderedState = () => {
  if (reduceMotion.value || props.phase === 'PAUSED') return;
  renderedScale.value = props.scale;
  renderedPhase.value = props.phase;
};
const handleMotionPreference = (event: MediaQueryListEvent) => {
  reduceMotion.value = event.matches;
  if (!event.matches) updateRenderedState();
};
onMounted(() => motionQuery?.addEventListener('change', handleMotionPreference));
onBeforeUnmount(() => motionQuery?.removeEventListener('change', handleMotionPreference));
watch([() => props.scale, () => props.phase], updateRenderedState);

const pressureState = computed(() => (isHold(renderedPhase.value) ? 'neutral' : 'active'));
const pressure = computed(() =>
  isHold(renderedPhase.value) ? 0.48 : Math.max(0, Math.min(1, (renderedScale.value - 0.6) / 0.4))
);
const energyOpacity = computed(() => (0.2 + pressure.value * 0.5).toFixed(3));
const layerOpacity = computed(() => (0.34 + pressure.value * 0.38).toFixed(3));
const energyRadius = computed(() => (49 - pressure.value * 6).toFixed(2));
</script>

<style scoped>
.pressure-field {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 9999px;
  overflow: hidden;
}
@media (prefers-reduced-motion: reduce) {
  .pressure-field,
  .pressure-field * {
    transition: none !important;
    animation: none !important;
  }
}
</style>
