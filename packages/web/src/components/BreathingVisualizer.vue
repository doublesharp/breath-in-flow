<template>
  <div class="flex flex-col items-center py-4 sm:py-8">
    <!-- Phase Label -->
    <div
      :class="[
        'px-6 py-2.5 rounded-full text-sm font-bold uppercase tracking-wider mb-4 sm:mb-8 shadow-lg transition-all duration-500',
        phaseColorClass,
      ]"
    >
      {{ phaseInfo.label }}
    </div>

    <!-- Breathing Circle Container -->
    <div class="relative w-60 h-60 sm:w-80 sm:h-80 flex items-center justify-center p-4">
      <!-- Outer glow ring -->
      <div
        class="absolute inset-4 rounded-full transition-all duration-700 opacity-30 blur-xl"
        :style="{ transform: `scale(${visualScale * 1.1})`, ...phaseGlowStyle }"
      ></div>

      <!-- Background circle with pulse -->
      <div class="absolute inset-8 rounded-full bg-slate-800/20" style="backface-visibility: hidden"></div>

      <!-- Animated breathing circle -->
      <div
        class="breathing-circle w-full h-full flex items-center justify-center relative"
        :style="{
          transform: `translateZ(0) scale(${visualScale})`,
          padding: '1rem',
          ...phaseGlowStyle,
          willChange: 'transform, box-shadow',
          backfaceVisibility: 'hidden',
        }"
      >
        <BreathingPressureField :scale="visualScale" :phase="phase" />

        <!-- Inner content -->
        <div class="relative z-10 text-center">
          <svg
            v-if="phase === 'SESSION_COMPLETE'"
            data-testid="completion-mark"
            class="mx-auto h-16 w-16 text-white drop-shadow-2xl"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" />
          </svg>
          <div
            v-else
            data-testid="phase-time"
            class="text-6xl sm:text-7xl font-mono font-bold text-white drop-shadow-2xl tabular-nums"
          >
            {{ displayTime }}
          </div>
          <div class="text-white/90 text-base sm:text-lg mt-3 font-medium tracking-wide">
            {{ phaseInfo.instruction }}
          </div>
        </div>
      </div>

      <!-- Progress ring -->
      <svg
        v-if="isRunning && totalTime > 0"
        data-testid="phase-progress-ring"
        class="absolute inset-0 -rotate-90 w-full h-full"
        viewBox="0 0 100 100"
        style="overflow: visible"
      >
        <defs>
          <!-- Solid gradient for inhale -->
          <linearGradient id="inhaleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#d6eee4" stop-opacity="0.92" />
            <stop offset="100%" stop-color="#9bcdbd" stop-opacity="0.92" />
          </linearGradient>
          <!-- Solid gradient for exhale -->
          <linearGradient id="exhaleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#b9ddd3" stop-opacity="0.88" />
            <stop offset="100%" stop-color="#7eaea4" stop-opacity="0.88" />
          </linearGradient>
          <!-- Hold gradients with accented tips -->
          <linearGradient id="inhaleHoldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#d8dfca" stop-opacity="0.78" />
            <stop offset="85%" stop-color="#d8dfca" stop-opacity="0.78" />
            <stop offset="100%" stop-color="#ead8b7" stop-opacity="0.9" />
          </linearGradient>
          <linearGradient id="exhaleHoldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#d8dfca" stop-opacity="0.78" />
            <stop offset="85%" stop-color="#e2cfab" stop-opacity="0.82" />
            <stop offset="100%" stop-color="#c99468" stop-opacity="0.92" />
          </linearGradient>
          <filter id="progressGlow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <!-- Glowing dot filter -->
          <filter id="dotGlow" x="-150%" y="-150%" width="400%" height="400%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <!-- Background circle -->
        <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(214,238,228,0.14)" stroke-width="1" />

        <!-- Persistent ring elements - always in DOM, controlled by opacity -->
        <!-- Inhale ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#inhaleGradient)"
          stroke-width="2.25"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="inhaleRing.dashoffset"
          :style="getRingStyle(inhaleRing)"
        />

        <!-- Inhale Hold ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#inhaleHoldGradient)"
          stroke-width="2.25"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="inhaleHoldRing.dashoffset"
          :style="getRingStyle(inhaleHoldRing)"
        />

        <!-- Exhale ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#exhaleGradient)"
          stroke-width="2.25"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="exhaleRing.dashoffset"
          :style="getRingStyle(exhaleRing)"
        />

        <!-- Exhale Hold ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#exhaleHoldGradient)"
          stroke-width="2.25"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="exhaleHoldRing.dashoffset"
          :style="getRingStyle(exhaleHoldRing)"
        />

        <!-- Extended Inhale Hold ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#inhaleHoldGradient)"
          stroke-width="2.25"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="extendedInhaleHoldRing.dashoffset"
          :style="getRingStyle(extendedInhaleHoldRing)"
        />

        <!-- Extended Exhale Hold ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#exhaleHoldGradient)"
          stroke-width="2.25"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="extendedExhaleHoldRing.dashoffset"
          :style="getRingStyle(extendedExhaleHoldRing)"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';
import { getPhaseInfo, formatTime, type BreathingPhase, type BreathingConfig } from '@breath-in-flow/shared';
import BreathingPressureField from './BreathingPressureField.vue';

const props = defineProps<{
  phase: BreathingPhase;
  currentTime: number;
  totalTime: number;
  scale: number;
  isRunning: boolean;
  config?: BreathingConfig;
}>();

const phaseInfo = computed(() => {
  return getPhaseInfo(props.phase, props.config);
});
const displayTime = computed(() => formatTime(props.currentTime));
const ringRadius = 47;
const circumference = 2 * Math.PI * ringRadius;
const motionQuery = typeof window === 'undefined' ? null : window.matchMedia?.('(prefers-reduced-motion: reduce)');
const reduceMotion = ref(motionQuery?.matches ?? false);
const visualScale = ref(props.scale);

const updateVisualScale = () => {
  if (!reduceMotion.value && props.phase !== 'PAUSED') visualScale.value = props.scale;
};
const handleMotionPreference = (event: MediaQueryListEvent) => {
  reduceMotion.value = event.matches;
  if (!event.matches) updateVisualScale();
};
onMounted(() => motionQuery?.addEventListener('change', handleMotionPreference));
onBeforeUnmount(() => motionQuery?.removeEventListener('change', handleMotionPreference));
watch([() => props.scale, () => props.phase], updateVisualScale);

// Ring states for each phase type
interface RingState {
  dashoffset: number;
  opacity: number;
  shouldFade: boolean;
}

const inhaleRing = ref<RingState>({ dashoffset: circumference, opacity: 0, shouldFade: true });
const inhaleHoldRing = ref<RingState>({ dashoffset: circumference, opacity: 0, shouldFade: true });
const exhaleRing = ref<RingState>({ dashoffset: circumference, opacity: 0, shouldFade: true });
const exhaleHoldRing = ref<RingState>({ dashoffset: circumference, opacity: 0, shouldFade: true });
const extendedInhaleHoldRing = ref<RingState>({ dashoffset: circumference, opacity: 0, shouldFade: true });
const extendedExhaleHoldRing = ref<RingState>({ dashoffset: circumference, opacity: 0, shouldFade: true });

const drawTransition = 'opacity 0.25s ease-out';
const fadeTransition = 'opacity 1.2s ease-out';
const previousPhase = ref<BreathingPhase | null>(null);
const fadingStartOpacity: Partial<Record<BreathingPhase, number>> = {};

const phaseGlowStyle = computed(() => {
  return {
    boxShadow: '0 0 32px 10px rgba(15, 23, 42, 0.22)',
    transition: 'box-shadow 0s linear',
  };
});

function getRingStyle(ring: RingState): Record<string, string | number> {
  return {
    transition: ring.shouldFade ? fadeTransition : drawTransition,
    opacity: ring.opacity,
    pointerEvents: 'none',
    willChange: 'stroke-dashoffset, opacity',
  };
}

function ringForPhase(phase: BreathingPhase): Ref<RingState> | null {
  switch (phase) {
    case 'INHALE':
      return inhaleRing;
    case 'INHALE_HOLD':
      return inhaleHoldRing;
    case 'EXHALE':
      return exhaleRing;
    case 'EXHALE_HOLD':
      return exhaleHoldRing;
    case 'EXTENDED_INHALE_HOLD':
      return extendedInhaleHoldRing;
    case 'EXTENDED_EXHALE_HOLD':
      return extendedExhaleHoldRing;
    default:
      return null;
  }
}

watch(
  () => props.phase,
  (_newPhase, oldPhase) => {
    // Store the completed state of the previous phase for fade-out
    if (oldPhase) {
      const ring = ringForPhase(oldPhase);
      if (ring) {
        if (previousPhase.value && previousPhase.value !== oldPhase) {
          const staleRing = ringForPhase(previousPhase.value);
          if (staleRing) {
            staleRing.value = {
              dashoffset: staleRing.value.dashoffset,
              opacity: 0,
              shouldFade: true,
            };
          }
          delete fadingStartOpacity[previousPhase.value];
        }
        previousPhase.value = oldPhase;
        fadingStartOpacity[oldPhase] = ring.value.opacity;
        ring.value = {
          dashoffset: ring.value.dashoffset,
          opacity: ring.value.opacity,
          shouldFade: true,
        };
      }
    }
  }
);

// Update the active ring based on current phase and progress
watch([() => props.phase, () => props.currentTime, () => props.totalTime], ([phase, currentTime, totalTime]) => {
  const total = totalTime || 0;
  const progress = total > 0 ? 1 - currentTime / total : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clampedProgress);
  const forceFade =
    phase === 'IDLE' ||
    phase === 'PAUSED' ||
    phase === 'SET_REST' ||
    phase === 'SET_COMPLETE' ||
    phase === 'SESSION_COMPLETE';
  const fadeProgress = forceFade ? 1 : clampedProgress;

  switch (phase) {
    case 'INHALE':
      inhaleRing.value = {
        dashoffset: offset,
        opacity: 0.05 + clampedProgress * 0.85,
        shouldFade: false,
      };
      break;
    case 'INHALE_HOLD':
      inhaleHoldRing.value = { dashoffset: offset, opacity: 0.9, shouldFade: false };
      break;
    case 'EXHALE':
      exhaleRing.value = {
        dashoffset: offset,
        opacity: 0.9 - clampedProgress * 0.85,
        shouldFade: false,
      };
      break;
    case 'EXHALE_HOLD':
      exhaleHoldRing.value = { dashoffset: offset, opacity: 0.05, shouldFade: false };
      break;
    case 'EXTENDED_INHALE_HOLD':
      extendedInhaleHoldRing.value = { dashoffset: offset, opacity: 0.9, shouldFade: false };
      break;
    case 'EXTENDED_EXHALE_HOLD':
      extendedExhaleHoldRing.value = { dashoffset: offset, opacity: 0.05, shouldFade: false };
      break;
  }

  if (previousPhase.value && previousPhase.value !== phase) {
    const previous = previousPhase.value;
    const ring = ringForPhase(previous);
    if (ring) {
      const startOpacity = fadingStartOpacity[previous] ?? ring.value.opacity;
      const fadedOpacity = Math.max(0, startOpacity * (1 - fadeProgress));
      ring.value = {
        dashoffset: ring.value.dashoffset,
        opacity: fadedOpacity,
        shouldFade: true,
      };

      if (fadeProgress >= 0.999) {
        ring.value = {
          dashoffset: ring.value.dashoffset,
          opacity: 0,
          shouldFade: true,
        };
        delete fadingStartOpacity[previous];
        previousPhase.value = null;
      }
    } else {
      previousPhase.value = null;
    }
  }
});

const phaseColorClass = computed(() => {
  switch (props.phase) {
    case 'INHALE':
      return 'bg-gradient-to-r from-emerald-700 to-teal-700 text-white shadow-emerald-950/25';
    case 'INHALE_HOLD':
      return 'bg-gradient-to-r from-amber-700 to-orange-800 text-white shadow-amber-950/25';
    case 'EXHALE':
      return 'bg-gradient-to-r from-teal-700 to-cyan-800 text-white shadow-teal-950/25';
    case 'EXHALE_HOLD':
      return 'bg-gradient-to-r from-amber-700 to-orange-800 text-white shadow-amber-950/25';
    case 'EXTENDED_INHALE_HOLD':
    case 'EXTENDED_EXHALE_HOLD':
      return 'bg-gradient-to-r from-orange-700 to-amber-800 text-white shadow-orange-950/25';
    case 'SET_COMPLETE':
    case 'SESSION_COMPLETE':
      return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-emerald-500/40';
    case 'SET_REST':
      return 'bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-teal-500/40';
    case 'PAUSED':
      return 'bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-slate-500/40';
    default:
      return 'bg-gradient-to-r from-slate-600 to-slate-700 text-white';
  }
});
</script>
