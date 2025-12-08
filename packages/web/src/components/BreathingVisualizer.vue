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
    <div class="relative w-60 h-60 sm:w-80 sm:h-80 flex items-center justify-center">
      <!-- Outer glow ring -->
      <div
        :class="[
          'absolute inset-0 rounded-full transition-all duration-500 opacity-30 blur-xl',
          phaseGlowClass,
        ]"
        :style="{ transform: `scale(${scale * 1.1})` }"
      ></div>

      <!-- Background circle with pulse -->
      <div
        class="absolute inset-4 rounded-full bg-slate-800/30 animate-pulse-glow"
        :style="{ animationDuration: '3s' }"
      ></div>

      <!-- Animated breathing circle -->
      <div
        :class="[
          'breathing-circle w-full h-full flex items-center justify-center relative',
          phaseGlowClass,
        ]"
        :style="{ transform: `scale(${scale})` }"
      >
        <!-- Gradient circle -->
        <div :class="['absolute inset-0 rounded-full', phaseColorBgClass]"></div>

        <!-- Inner content -->
        <div class="relative z-10 text-center">
          <div
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
        class="absolute inset-0 -rotate-90 w-full h-full"
        viewBox="0 0 100 100"
      >
        <circle
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          stroke-width="2"
        />
        <circle
          :key="phase"
          cx="50"
          cy="50"
          r="47"
          fill="none"
          stroke="white"
          stroke-width="3"
          stroke-linecap="round"
          :stroke-dasharray="circumference"
          :stroke-dashoffset="strokeDashoffset"
          class="progress-ring"
        />
      </svg>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { PHASE_INFO, formatTime, type BreathingPhase } from '@breath-in-flow/shared';

const props = defineProps<{
  phase: BreathingPhase;
  currentTime: number;
  totalTime: number;
  scale: number;
  isRunning: boolean;
}>();

const phaseInfo = computed(() => PHASE_INFO[props.phase]);
const displayTime = computed(() => formatTime(props.currentTime));

const circumference = 2 * Math.PI * 47;
const progress = computed(() => {
  if (props.totalTime === 0) return 0;
  return 1 - props.currentTime / props.totalTime;
});
const strokeDashoffset = computed(() => circumference * (1 - progress.value));

const phaseColorClass = computed(() => {
  switch (props.phase) {
    case 'INHALE':
      return 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-blue-500/40';
    case 'INHALE_HOLD':
      return 'bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-purple-500/40';
    case 'EXHALE':
      return 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-green-500/40';
    case 'EXHALE_HOLD':
      return 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-amber-500/40';
    case 'EXTENDED_INHALE_HOLD':
    case 'EXTENDED_EXHALE_HOLD':
      return 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white shadow-indigo-500/40';
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
      return 'bg-gradient-to-br from-blue-400 via-blue-500 to-blue-700';
    case 'INHALE_HOLD':
      return 'bg-gradient-to-br from-purple-400 via-purple-500 to-purple-700';
    case 'EXHALE':
      return 'bg-gradient-to-br from-green-400 via-emerald-500 to-emerald-700';
    case 'EXHALE_HOLD':
      return 'bg-gradient-to-br from-amber-400 via-orange-500 to-orange-700';
    case 'EXTENDED_INHALE_HOLD':
    case 'EXTENDED_EXHALE_HOLD':
      return 'bg-gradient-to-br from-indigo-400 via-indigo-500 to-indigo-700';
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
      return 'glow-blue';
    case 'INHALE_HOLD':
      return 'glow-purple';
    case 'EXHALE':
      return 'glow-green';
    case 'EXHALE_HOLD':
      return 'glow-amber';
    case 'EXTENDED_INHALE_HOLD':
    case 'EXTENDED_EXHALE_HOLD':
      return 'glow-indigo';
    case 'SET_COMPLETE':
    case 'SESSION_COMPLETE':
      return 'glow-emerald';
    default:
      return '';
  }
});
</script>
