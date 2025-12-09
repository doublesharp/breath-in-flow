<template>
  <div class="glass rounded-xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-white">{{ title }}</h3>
      <select
        v-model="weeks"
        class="bg-slate-800/50 text-slate-300 text-sm rounded-lg px-3 py-1.5 border border-slate-600/50 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
      >
        <option :value="4">Last 4 weeks</option>
        <option :value="8">Last 8 weeks</option>
        <option :value="12">Last 12 weeks</option>
      </select>
    </div>

    <div class="h-64">
      <Bar v-if="chartData" :data="chartData" :options="chartOptions" />
      <div v-else class="h-full flex items-center justify-center text-slate-400">
        <p>No session data available</p>
      </div>
    </div>

    <!-- Weekly Summary -->
    <div v-if="sessions.length > 0" class="mt-4 grid grid-cols-2 gap-3">
      <div class="bg-slate-800/50 rounded-lg p-3 text-center">
        <div class="text-xs text-slate-500 uppercase tracking-wider">Avg per Week</div>
        <div class="text-lg font-semibold text-blue-400 mt-1">
          {{ averagePerWeek.toFixed(1) }}
        </div>
      </div>
      <div class="bg-slate-800/50 rounded-lg p-3 text-center">
        <div class="text-xs text-slate-500 uppercase tracking-wider">This Week</div>
        <div class="text-lg font-semibold text-emerald-400 mt-1">
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

interface WeekData {
  label: string;
  start: Date;
  end: Date;
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
      label: format(weekStart, 'MMM d'),
      start: weekStart,
      end: weekEnd,
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
  if (!weeklyData.value.length) return null;

  return {
    labels: weeklyData.value.map((w) => w.label),
    datasets: [
      {
        label: 'Sessions',
        data: weeklyData.value.map((w) => w.count),
        backgroundColor: weeklyData.value.map((_, i) =>
          i === weeklyData.value.length - 1 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(59, 130, 246, 0.6)'
        ),
        borderColor: weeklyData.value.map((_, i) =>
          i === weeklyData.value.length - 1 ? 'rgb(16, 185, 129)' : 'rgb(59, 130, 246)'
        ),
        borderWidth: 1,
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
      backgroundColor: 'rgba(15, 23, 42, 0.9)',
      titleColor: 'rgb(248, 250, 252)',
      bodyColor: 'rgb(148, 163, 184)',
      borderColor: 'rgba(148, 163, 184, 0.2)',
      borderWidth: 1,
      padding: 12,
      callbacks: {
        label: (context) => `${context.parsed.y} session${context.parsed.y !== 1 ? 's' : ''}`,
      },
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        color: 'rgb(148, 163, 184)',
      },
    },
    y: {
      min: 0,
      ticks: {
        stepSize: 1,
        color: 'rgb(148, 163, 184)',
      },
      grid: {
        color: 'rgba(148, 163, 184, 0.1)',
      },
    },
  },
}));
</script>
