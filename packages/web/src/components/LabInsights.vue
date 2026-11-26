<template>
  <div class="lab-insights space-y-3" data-testid="lab-insights">
    <!-- No data state -->
    <div
      v-if="showEmptyGuidance && measurementInsights.length === 0"
      class="rounded-xl border border-line-subtle border-l-4 border-l-sand/50 bg-surface-inset p-4"
      data-testid="no-data-card"
    >
      <div class="flex items-start gap-3">
        <svg aria-hidden="true" class="h-5 w-5 shrink-0 text-sand" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <path :d="infoIcon" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <div>
          <p class="text-sm font-medium text-primary">Getting started</p>
          <p class="text-sm text-muted mt-0.5">
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
        :class="['rounded-xl border border-line-subtle border-l-4 bg-surface-inset p-4', insightStyles[insight.type].borderColor]"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-start gap-3 flex-1">
            <svg
              aria-hidden="true"
              class="h-5 w-5 shrink-0"
              :class="insightStyles[insight.type].iconColor"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
            >
              <path :d="insightIcon(insight)" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
            <div class="flex-1">
              <p class="text-sm font-medium text-primary">{{ insight.title }}</p>
              <p class="text-sm text-muted mt-0.5">{{ insight.message }}</p>
            </div>
          </div>

          <!-- Dismiss button -->
          <button
            v-if="insight.dismissible"
            :data-testid="`dismiss-btn-${insight.id}`"
            class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-raised hover:text-primary transition-colors"
            :aria-label="`Dismiss ${insight.title}`"
            @click="dismiss(insight.id)"
          >
            <svg aria-hidden="true" class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="m6 6 12 12M18 6 6 18" stroke-linecap="round" />
            </svg>
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

interface Insight {
  id: string;
  type: 'recommendation' | 'trend' | 'streak' | 'info';
  title: string;
  message: string;
  dismissible: boolean;
  direction?: WellnessInsight['direction'];
}

// ─── Props ────────────────────────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  measurements: HrvMeasurement[];
  latestAssessment: AssessmentResult | null;
  showEmptyGuidance?: boolean;
}>(), { showEmptyGuidance: true });

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
      message: `${rate.toFixed(1)} BPM was selected from your assessment and saved with the assessment result.`,
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

const insightStyles = {
  recommendation: { borderColor: 'border-l-sage/50', iconColor: 'text-sage' },
  trend: { borderColor: 'border-l-muted/50', iconColor: 'text-muted' },
  streak: { borderColor: 'border-l-sage/50', iconColor: 'text-sage' },
  info: { borderColor: 'border-l-sand/50', iconColor: 'text-sand' },
};

const infoIcon = 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 11v5m0-8h.01';

function insightIcon(insight: Insight): string {
  switch (insight.type) {
    case 'recommendation':
      return 'M12 3 9 9l-6 1 4.5 4.5-1 6.5 5.5-3 5.5 3-1-6.5L21 10l-6-1-3-6Z';
    case 'trend':
      if (insight.direction === 'lower') return 'M5 7l14 10m-6 0h6v-6';
      if (insight.direction === 'higher') return 'M5 17 19 7m-6 0h6v6';
      return 'M5 12h14m-5-5 5 5-5 5';
    case 'streak':
      return 'M5 8h14v12H5zM5 11h14M9 4v4m6-4v4m-6 7 2 2 4-4';
    case 'info':
      return infoIcon;
  }
}
</script>
