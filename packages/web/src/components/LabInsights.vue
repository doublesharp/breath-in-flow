<template>
  <div class="lab-insights space-y-3" data-testid="lab-insights">
    <!-- No data state -->
    <div
      v-if="measurements.length < 3"
      class="glass rounded-xl p-4 border-l-4 border-blue-500"
      data-testid="no-data-card"
    >
      <div class="flex items-start gap-3">
        <span class="text-blue-400 text-lg">ℹ</span>
        <div>
          <p class="text-sm font-medium text-slate-200">Getting started</p>
          <p class="text-sm text-slate-400 mt-0.5">
            Take a few more HRV measurements to start seeing insights
          </p>
        </div>
      </div>
    </div>

    <!-- Insight cards -->
    <template v-if="measurements.length >= 3">
      <div
        v-for="insight in visibleInsights"
        :key="insight.id"
        :data-testid="`insight-card-${insight.id}`"
        :class="[
          'glass rounded-xl p-4 border-l-4 transition-all',
          borderColorClass(insight),
        ]"
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

function avgRmssd(ms: HrvMeasurement[]): number {
  if (ms.length === 0) return 0;
  return ms.reduce((sum, m) => sum + m.analysis.timeDomain.rmssd, 0) / ms.length;
}

const insights = computed<Insight[]>(() => {
  const cards: Insight[] = [];
  const now = Date.now();
  const msPerDay = 86400000;

  // 1. RF Recommendation
  if (props.latestAssessment) {
    const rate = props.latestAssessment.selectedRate;
    cards.push({
      id: 'rf-recommendation',
      type: 'recommendation',
      title: 'Resonance Frequency Found',
      message: `Based on your assessment, ${rate.toFixed(1)} BPM produced the strongest resonance. Apply as your default?`,
      action: {
        label: 'Apply',
        event: 'apply-rf',
        payload: rate,
      },
      dismissible: true,
    });
  }

  // 2. RMSSD Trend Insight
  if (props.measurements.length >= 7) {
    const recent = props.measurements.filter(
      (m) => new Date(m.completedAt).getTime() >= now - 7 * msPerDay
    );
    const previous = props.measurements.filter((m) => {
      const t = new Date(m.completedAt).getTime();
      return t >= now - 14 * msPerDay && t < now - 7 * msPerDay;
    });

    if (recent.length >= 2 && previous.length >= 2) {
      const recentAvg = avgRmssd(recent);
      const prevAvg = avgRmssd(previous);
      const changePct = prevAvg > 0 ? ((recentAvg - prevAvg) / prevAvg) * 100 : 0;

      if (changePct > 10) {
        cards.push({
          id: 'rmssd-trend',
          type: 'trend',
          title: 'HRV Improving',
          message: `Your RMSSD has improved ${Math.round(changePct)}% over the last week`,
          dismissible: false,
        });
      } else if (changePct < -10) {
        cards.push({
          id: 'rmssd-trend',
          type: 'trend',
          title: 'HRV Declined',
          message: `Your RMSSD has declined ${Math.round(Math.abs(changePct))}% — consider more recovery time`,
          dismissible: false,
        });
      } else {
        cards.push({
          id: 'rmssd-trend',
          type: 'trend',
          title: 'HRV Stable',
          message: 'Your HRV is stable — consistent practice is paying off',
          dismissible: false,
        });
      }
    }
  }

  // 3. Measurement Streak
  if (props.measurements.length >= 2) {
    const days = new Set(
      props.measurements.map((m) => {
        const d = new Date(m.completedAt);
        return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      })
    );

    let streak = 0;
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
        message: `You've measured HRV ${streak} day${streak !== 1 ? 's' : ''} in a row — keep it up!`,
        dismissible: false,
      });
    }
  }

  // 4. Best Time of Day
  if (props.measurements.length >= 10) {
    const byHour: Record<number, number[]> = {};
    for (const m of props.measurements) {
      const hour = new Date(m.completedAt).getHours();
      if (!byHour[hour]) byHour[hour] = [];
      byHour[hour].push(m.analysis.timeDomain.rmssd);
    }

    // Group into periods
    let morningTotal = 0, morningCount = 0;
    let afternoonTotal = 0, afternoonCount = 0;
    let eveningTotal = 0, eveningCount = 0;

    for (const [hourStr, values] of Object.entries(byHour)) {
      const hour = parseInt(hourStr, 10);
      const sum = values.reduce((a, b) => a + b, 0);
      if (hour >= 5 && hour < 12) {
        morningTotal += sum;
        morningCount += values.length;
      } else if (hour >= 12 && hour < 18) {
        afternoonTotal += sum;
        afternoonCount += values.length;
      } else {
        eveningTotal += sum;
        eveningCount += values.length;
      }
    }

    const periods: { name: string; avg: number; count: number }[] = [];
    if (morningCount > 0) periods.push({ name: 'morning', avg: morningTotal / morningCount, count: morningCount });
    if (afternoonCount > 0) periods.push({ name: 'afternoon', avg: afternoonTotal / afternoonCount, count: afternoonCount });
    if (eveningCount > 0) periods.push({ name: 'evening', avg: eveningTotal / eveningCount, count: eveningCount });

    if (periods.length > 1) {
      const best = periods.reduce((a, b) => (a.avg > b.avg ? a : b));
      cards.push({
        id: 'best-time',
        type: 'info',
        title: 'Best Time to Measure',
        message: `Your HRV tends to be highest in the ${best.name}`,
        dismissible: false,
      });
    }
  }

  return cards;
});

const visibleInsights = computed(() =>
  insights.value.filter((c) => !dismissed.value.has(c.id))
);

// ─── UI helpers ───────────────────────────────────────────────────────────────

function borderColorClass(insight: Insight): string {
  switch (insight.type) {
    case 'recommendation': return 'border-emerald-500';
    case 'trend': return insight.message.toLowerCase().includes('declin')
      ? 'border-amber-500'
      : insight.message.toLowerCase().includes('improv')
        ? 'border-emerald-500'
        : 'border-slate-500';
    case 'streak': return 'border-emerald-500';
    case 'info': return 'border-blue-500';
    default: return 'border-slate-500';
  }
}

function iconColorClass(insight: Insight): string {
  switch (insight.type) {
    case 'recommendation': return 'text-emerald-400';
    case 'trend': return insight.message.toLowerCase().includes('declin')
      ? 'text-amber-400'
      : 'text-emerald-400';
    case 'streak': return 'text-emerald-400';
    case 'info': return 'text-blue-400';
    default: return 'text-slate-400';
  }
}

function insightIcon(insight: Insight): string {
  switch (insight.type) {
    case 'recommendation': return '★';
    case 'trend': return insight.message.toLowerCase().includes('declin') ? '↓' : insight.message.toLowerCase().includes('improv') ? '↑' : '→';
    case 'streak': return '🔥';
    case 'info': return 'ℹ';
    default: return '•';
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
