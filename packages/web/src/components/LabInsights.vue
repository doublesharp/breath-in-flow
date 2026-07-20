<template>
  <div class="lab-insights space-y-3" data-testid="lab-insights">
    <!-- No data state -->
    <div
      v-if="measurementInsights.length === 0"
      class="glass rounded-xl p-4 border-l-4 border-blue-500"
      data-testid="no-data-card"
    >
      <div class="flex items-start gap-3">
        <span class="text-blue-400 text-lg">ℹ</span>
        <div>
          <p class="text-sm font-medium text-slate-200">Getting started</p>
          <p class="text-sm text-slate-400 mt-0.5">
            Complete at least three comparable Pulse Variability measurements using the same protocol, duration, sensor,
            and conditions.
          </p>
        </div>
      </div>
    </div>

    <!-- Insight cards -->
    <template v-if="visibleInsights.length > 0">
      <div
        v-for="insight in visibleInsights"
        :key="insight.id"
        :data-testid="`insight-card-${insight.id}`"
        :class="['glass rounded-xl p-4 border-l-4 transition-all', borderColorClass(insight)]"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3 flex-1">
            <span :class="['text-lg leading-none', iconColorClass(insight)]">
              {{ insightIcon(insight) }}
            </span>
            <div class="flex-1">
              <p class="text-sm font-medium text-slate-200">{{ insight.title }}</p>
              <p class="text-sm text-slate-400 mt-0.5">{{ insight.message }}</p>

              <!-- Action button -->
              <div v-if="insight.action" class="mt-3">
                <button
                  :data-testid="`action-btn-${insight.id}`"
                  class="px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-500 transition-colors"
                  @click="handleAction(insight)"
                >
                  {{ insight.action.label }}
                </button>
              </div>
            </div>
          </div>

          <!-- Dismiss button -->
          <button
            v-if="insight.dismissible"
            :data-testid="`dismiss-btn-${insight.id}`"
            class="text-slate-500 hover:text-slate-300 transition-colors text-lg leading-none flex-shrink-0"
            :aria-label="`Dismiss ${insight.title}`"
            @click="dismiss(insight.id)"
          >
            ×
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import type { AssessmentResult } from '@breath-in-flow/shared';
import type { HrvMeasurement } from '../composables/useHrvStorage';
import { buildWithinPersonInsights, type WellnessInsight } from '../utils/measurementTrends';

// ─── Types ────────────────────────────────────────────────────────────────────

interface InsightAction {
  label: string;
  event: string;
  payload?: unknown;
}

interface Insight {
  id: string;
  type: 'recommendation' | 'trend' | 'streak' | 'info';
  title: string;
  message: string;
  action?: InsightAction;
  dismissible: boolean;
  direction?: WellnessInsight['direction'];
}

// ─── Props & Emits ────────────────────────────────────────────────────────────

const props = defineProps<{
  measurements: HrvMeasurement[];
  latestAssessment: AssessmentResult | null;
}>();

const emit = defineEmits<{
  'apply-rf': [rate: number];
}>();

// ─── Dismissed state ─────────────────────────────────────────────────────────

const dismissed = ref<Set<string>>(new Set());

function dismiss(id: string) {
  dismissed.value = new Set([...dismissed.value, id]);
}

// ─── Insight computation ──────────────────────────────────────────────────────

const measurementInsights = computed(() => buildWithinPersonInsights(props.measurements));

const insights = computed<Insight[]>(() => {
  const cards: Insight[] = [];

  if (props.latestAssessment) {
    const rate = props.latestAssessment.selectedRate;
    cards.push({
      id: 'rf-recommendation',
      type: 'recommendation',
      title: 'Resonance Frequency Found',
      message: `${rate.toFixed(1)} BPM was selected from your assessment. Apply it as your default paced-breathing rate?`,
      action: {
        label: 'Apply',
        event: 'apply-rf',
        payload: rate,
      },
      dismissible: true,
    });
  }

  for (const insight of measurementInsights.value) {
    cards.push({
      ...insight,
      type: 'trend',
      dismissible: false,
    });
  }

  if (props.measurements.length >= 2) {
    const days = new Set(
      props.measurements.map((m) => {
        const d = new Date(m.completedAt);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );

    let streak = 0;
    const msPerDay = 86400000;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < 365; i++) {
      const d = new Date(today.getTime() - i * msPerDay);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (days.has(key)) {
        streak++;
      } else {
        break;
      }
    }

    if (streak >= 2) {
      cards.push({
        id: 'measurement-streak',
        type: 'streak',
        title: 'Measurement Streak',
        message: `You've collected Pulse Variability readings ${streak} day${streak !== 1 ? 's' : ''} in a row.`,
        dismissible: false,
      });
    }
  }

  return cards;
});

const visibleInsights = computed(() => insights.value.filter((c) => !dismissed.value.has(c.id)));

// ─── UI helpers ───────────────────────────────────────────────────────────────

function borderColorClass(insight: Insight): string {
  switch (insight.type) {
    case 'recommendation':
      return 'border-emerald-500';
    case 'trend':
      return insight.direction === 'lower'
        ? 'border-amber-500'
        : insight.direction === 'higher'
          ? 'border-emerald-500'
          : 'border-slate-500';
    case 'streak':
      return 'border-emerald-500';
    case 'info':
      return 'border-blue-500';
    default:
      return 'border-slate-500';
  }
}

function iconColorClass(insight: Insight): string {
  switch (insight.type) {
    case 'recommendation':
      return 'text-emerald-400';
    case 'trend':
      return insight.direction === 'lower' ? 'text-amber-400' : 'text-emerald-400';
    case 'streak':
      return 'text-emerald-400';
    case 'info':
      return 'text-blue-400';
    default:
      return 'text-slate-400';
  }
}

function insightIcon(insight: Insight): string {
  switch (insight.type) {
    case 'recommendation':
      return '★';
    case 'trend':
      return insight.direction === 'lower' ? '↓' : insight.direction === 'higher' ? '↑' : '→';
    case 'streak':
      return '🔥';
    case 'info':
      return 'ℹ';
    default:
      return '•';
  }
}

function handleAction(insight: Insight) {
  if (!insight.action) return;
  if (insight.action.event === 'apply-rf') {
    emit('apply-rf', insight.action.payload as number);
  }
  dismiss(insight.id);
}
</script>
