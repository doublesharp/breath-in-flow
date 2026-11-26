<template>
  <div class="card-solid flex h-full min-w-0 flex-col">
    <div class="mb-4 flex min-h-[44px] flex-wrap items-center justify-between gap-3">
      <h3 class="text-lg font-semibold text-primary">{{ title }}</h3>
      <select
        v-model="weeks"
        aria-label="Session chart date range"
        class="min-h-[44px] max-w-full rounded-lg border bg-surface-raised px-3 py-1.5 text-sm text-secondary"
      >
        <option :value="4">Last 4 weeks</option>
        <option :value="8">Last 8 weeks</option>
        <option :value="12">Last 12 weeks</option>
      </select>
    </div>

    <div v-if="chartData" class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
      <span class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="size-2.5 rounded-sm border"
          :style="{ backgroundColor: previousWeek.fill, borderColor: previousWeek.border }"
        ></span>
        Previous weeks
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="size-2.5 rounded-sm border"
          :style="{ backgroundColor: currentWeek.fill, borderColor: currentWeek.border }"
        ></span>
        This week
      </span>
    </div>
    <div class="h-64 shrink-0 rounded-xl bg-surface-inset p-2">
      <Bar v-if="chartData" :data="chartData" :options="chartOptions" />
      <div v-else class="h-full flex items-center justify-center text-muted">
        <p>No session data available</p>
      </div>
    </div>

    <!-- Weekly Summary -->
    <div v-if="sessions.length > 0" class="mt-auto grid grid-cols-2 gap-3 pt-4">
      <div class="bg-surface-inset rounded-lg p-2 sm:p-3 text-center">
        <div class="text-xs text-muted uppercase tracking-wider">Avg per Week</div>
        <div class="text-lg font-semibold tabular-nums text-primary mt-1">
          {{ averagePerWeek.toFixed(1) }}
        </div>
      </div>
      <div class="bg-surface-inset rounded-lg p-2 sm:p-3 text-center">
        <div class="text-xs text-muted uppercase tracking-wider">This Week</div>
        <div class="text-lg font-semibold tabular-nums text-primary mt-1">
          {{ thisWeekCount }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { Bar } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import type { Session } from '@breath-in-flow/shared';
import { chartColors } from './chartColors';
import { format, startOfWeek, endOfWeek, subWeeks, isWithinInterval } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

const props = withDefaults(
  defineProps<{
    title?: string;
    sessions: Session[];
  }>(),
  {
    title: 'Sessions per Week',
  }
);

const weeks = ref(8);
const previousWeek = { fill: '#675e51', border: '#8d8374' };
const currentWeek = { fill: chartColors.sage, border: '#dceade' };

interface WeekData {
  label: string;
  count: number;
}

const weeklyData = computed<WeekData[]>(() => {
  const data: WeekData[] = [];
  const now = new Date();

  for (let i = weeks.value - 1; i >= 0; i--) {
    const weekStart = startOfWeek(subWeeks(now, i), { weekStartsOn: 1 });
    const weekEnd = endOfWeek(subWeeks(now, i), { weekStartsOn: 1 });

    const count = props.sessions.filter((s) =>
      isWithinInterval(new Date(s.startedAt), { start: weekStart, end: weekEnd })
    ).length;

    data.push({
      label: i === 0 ? 'This week' : format(weekStart, 'MMM d'),
      count,
    });
  }

  return data;
});

const thisWeekCount = computed(() => {
  if (!weeklyData.value.length) return 0;
  return weeklyData.value[weeklyData.value.length - 1].count;
});

const averagePerWeek = computed(() => {
  if (!weeklyData.value.length) return 0;
  const total = weeklyData.value.reduce((sum, w) => sum + w.count, 0);
  return total / weeklyData.value.length;
});

const chartData = computed<ChartData<'bar'> | null>(() => {
  if (!props.sessions.length) return null;
  if (!weeklyData.value.length) return null;

  const colors = weeklyData.value.map((_, index) =>
    index === weeklyData.value.length - 1 ? currentWeek : previousWeek
  );

  return {
    labels: weeklyData.value.map((w) => w.label),
    datasets: [
      {
        label: 'Sessions',
        data: weeklyData.value.map((w) => w.count),
        backgroundColor: colors.map(({ fill }) => fill),
        borderColor: colors.map(({ border }) => border),
        borderWidth: 1.5,
        borderSkipped: false,
        borderRadius: 6,
      },
    ],
  };
});

const chartOptions = computed<ChartOptions<'bar'>>(() => ({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: chartColors.inset,
      titleColor: chartColors.primary,
      bodyColor: chartColors.secondary,
      borderColor: chartColors.lineStrong,
      borderWidth: 1,
      padding: 12,
      callbacks: {
        label: (context) => `${context.parsed.y} session${context.parsed.y !== 1 ? 's' : ''}`,
      },
    },
  },
  scales: {
    x: {
      afterBuildTicks: (scale) => {
        const last = scale.ticks.length - 1;
        if (last < 1) return;
        // Reserve enough full bar slots for the longer current-week label.
        const weeksPerLabel = Math.ceil((scale.ticks.length * 64) / Math.max(1, scale.maxWidth));
        const intervals = Math.max(1, Math.floor(last / weeksPerLabel));
        scale.ticks = Array.from({ length: intervals + 1 }, (_, index) =>
          scale.ticks[Math.round((last * index) / intervals)]
        );
      },
      grid: {
        display: false,
      },
      ticks: {
        color: chartColors.secondary,
        autoSkip: false,
        maxRotation: 0,
      },
    },
    y: {
      min: 0,
      ticks: {
        stepSize: 1,
        color: chartColors.secondary,
      },
      grid: {
        color: chartColors.lineSubtle,
      },
    },
  },
}));
</script>
