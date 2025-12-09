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
        :class="['absolute inset-4 rounded-full transition-all duration-500 opacity-30 blur-xl', phaseGlowClass]"
        :style="{ transform: `scale(${scale * 1.1})` }"
      ></div>

      <!-- Background circle with pulse -->
      <div
        class="absolute inset-8 rounded-full bg-slate-800/30 animate-pulse-glow"
        :style="{ animationDuration: '3s' }"
      ></div>

      <!-- Animated breathing circle -->
      <div
        :class="['breathing-circle w-full h-full flex items-center justify-center relative', phaseGlowClass]"
        :style="{ transform: `scale(${scale})`, padding: '1rem' }"
      >
        <!-- Gradient circle -->
        <div :class="['absolute inset-0 rounded-full', phaseColorBgClass]"></div>

        <!-- Inner content -->
        <div class="relative z-10 text-center">
          <div class="text-6xl sm:text-7xl font-mono font-bold text-white drop-shadow-2xl tabular-nums">
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
        class="absolute inset-0 -rotate-90 w-full h-full"
        viewBox="0 0 100 100"
        style="overflow: visible"
      >
        <defs>
          <!-- Solid gradient for inhale -->
          <linearGradient id="inhaleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="white" stop-opacity="1" />
            <stop offset="100%" stop-color="white" stop-opacity="1" />
          </linearGradient>
          <!-- Solid gradient for exhale -->
          <linearGradient id="exhaleGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="white" stop-opacity="1" />
            <stop offset="100%" stop-color="white" stop-opacity="1" />
          </linearGradient>
          <!-- Hold gradients with accented tips -->
          <linearGradient id="inhaleHoldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="white" stop-opacity="0.9" />
            <stop offset="85%" stop-color="white" stop-opacity="0.9" />
            <stop offset="100%" stop-color="white" stop-opacity="1" />
          </linearGradient>
          <linearGradient id="exhaleHoldGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="white" stop-opacity="0.9" />
            <stop offset="85%" stop-color="white" stop-opacity="0.9" />
            <stop offset="100%" stop-color="#f59e0b" stop-opacity="1" />
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
        <circle cx="50" cy="50" r="47" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1.5" />

        <!-- Persistent ring elements - always in DOM, controlled by opacity -->
        <!-- Inhale ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#inhaleGradient)"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="inhaleRing.dashoffset"
          filter="url(#progressGlow)"
          :style="getRingStyle(inhaleRing)"
        />

        <!-- Inhale Hold ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#inhaleHoldGradient)"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="inhaleHoldRing.dashoffset"
          filter="url(#progressGlow)"
          :style="getRingStyle(inhaleHoldRing)"
        />

        <!-- Exhale ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#exhaleGradient)"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="exhaleRing.dashoffset"
          filter="url(#progressGlow)"
          :style="getRingStyle(exhaleRing)"
        />

        <!-- Exhale Hold ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#exhaleHoldGradient)"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="exhaleHoldRing.dashoffset"
          filter="url(#progressGlow)"
          :style="getRingStyle(exhaleHoldRing)"
        />

        <!-- Extended Inhale Hold ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#inhaleHoldGradient)"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="extendedInhaleHoldRing.dashoffset"
          filter="url(#progressGlow)"
          :style="getRingStyle(extendedInhaleHoldRing)"
        />

        <!-- Extended Exhale Hold ring -->
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="url(#exhaleHoldGradient)"
          stroke-width="4"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="extendedExhaleHoldRing.dashoffset"
          filter="url(#progressGlow)"
          :style="getRingStyle(extendedExhaleHoldRing)"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, type Ref } from 'vue';
import { getPhaseInfo, formatTime, type BreathingPhase, type BreathingConfig } from '@breath-in-flow/shared';

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
  (newPhase, oldPhase) => {
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

    const nextRing = newPhase ? ringForPhase(newPhase) : null;
    if (nextRing) {
      nextRing.value = {
        dashoffset: circumference,
        opacity: 0,
        shouldFade: false,
      };
    }
  }
);

// Update the active ring based on current phase and progress
watch([() => props.phase, () => props.currentTime, () => props.totalTime], ([phase, currentTime, totalTime]) => {
  const total = totalTime || 0;
  const progress = total > 0 ? 1 - currentTime / total : 0;
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clampedProgress);
  const forceFade = phase === 'IDLE' || phase === 'PAUSED' || phase === 'SET_COMPLETE' || phase === 'SESSION_COMPLETE';
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
      return 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-500/40';
    case 'INHALE_HOLD':
      return 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/40';
    case 'EXHALE':
      return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/40';
    case 'EXHALE_HOLD':
      return 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/40';
    case 'EXTENDED_INHALE_HOLD':
    case 'EXTENDED_EXHALE_HOLD':
      return 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-red-500/40';
    case 'SET_COMPLETE':
    case 'SESSION_COMPLETE':
      return 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-emerald-500/40';
    case 'PAUSED':
      return 'bg-gradient-to-r from-slate-500 to-slate-600 text-white shadow-slate-500/40';
    default:
      return 'bg-gradient-to-r from-slate-600 to-slate-700 text-white';
  }
});

const phaseColorBgClass = computed(() => {
  switch (props.phase) {
    case 'INHALE':
      return 'bg-gradient-to-br from-green-400 via-emerald-500 to-emerald-700';
    case 'INHALE_HOLD':
      return 'bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700';
    case 'EXHALE':
      return 'bg-gradient-to-br from-blue-400 via-blue-500 to-blue-700';
    case 'EXHALE_HOLD':
      return 'bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700';
    case 'EXTENDED_INHALE_HOLD':
    case 'EXTENDED_EXHALE_HOLD':
      return 'bg-gradient-to-br from-red-400 via-red-500 to-red-700';
    case 'SET_COMPLETE':
    case 'SESSION_COMPLETE':
      return 'bg-gradient-to-br from-emerald-400 via-emerald-500 to-emerald-700';
    case 'PAUSED':
      return 'bg-gradient-to-br from-slate-400 via-slate-500 to-slate-700';
    default:
      return 'bg-gradient-to-br from-slate-500 via-slate-600 to-slate-800';
  }
});

const phaseGlowClass = computed(() => {
  switch (props.phase) {
    case 'INHALE':
      return 'glow-green';
    case 'INHALE_HOLD':
      return 'glow-amber';
    case 'EXHALE':
      return 'glow-blue';
    case 'EXHALE_HOLD':
      return 'glow-amber';
    case 'EXTENDED_INHALE_HOLD':
    case 'EXTENDED_EXHALE_HOLD':
      return 'glow-red';
    case 'SET_COMPLETE':
    case 'SESSION_COMPLETE':
      return 'glow-emerald';
    default:
      return '';
  }
});
</script>
