<template>
  <div class="glass rounded-xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-white">{{ title }}</h3>
      <div v-if="improvement !== null" class="flex items-center gap-2">
        <span
          :class="[
            'px-3 py-1 rounded-full text-sm font-medium',
            improvement > 0
              ? 'bg-emerald-500/20 text-emerald-400'
              : improvement < 0
                ? 'bg-red-500/20 text-red-400'
                : 'bg-slate-500/20 text-slate-400',
          ]"
        >
          {{ improvement > 0 ? '↑' : improvement < 0 ? '↓' : '→' }}
          {{ Math.abs(improvement).toFixed(1) }}s
        </span>
      </div>
    </div>

    <div class="h-64">
      <Line v-if="chartData" :data="chartData" :options="chartOptions" />
      <div v-else class="h-full flex items-center justify-center text-slate-400">
        <p>No hold data available</p>
      </div>
    </div>

    <!-- Stats Summary -->
    <div v-if="sessions.length > 0" class="mt-4 grid grid-cols-3 gap-3">
      <div class="bg-slate-800/50 rounded-lg p-3 text-center">
        <div class="text-xs text-slate-500 uppercase tracking-wider">Average</div>
        <div class="text-lg font-semibold text-blue-400 mt-1">
          {{ formatTime(averageHold) }}
        </div>
      </div>
      <div class="bg-slate-800/50 rounded-lg p-3 text-center">
        <div class="text-xs text-slate-500 uppercase tracking-wider">Best</div>
        <div class="text-lg font-semibold text-emerald-400 mt-1">
          {{ formatTime(maxHold) }}
        </div>
      </div>
      <div class="bg-slate-800/50 rounded-lg p-3 text-center">
        <div class="text-xs text-slate-500 uppercase tracking-wider">Sessions</div>
        <div class="text-lg font-semibold text-purple-400 mt-1">
          {{ sessions.length }}
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
  type ChartOptions,
} from 'chart.js';
import type { Session } from '@breath-in-flow/shared';
import { format } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const props = withDefaults(
  defineProps<{
    title?: string;
    sessions: Session[];
  }>(),
  {
    title: 'Breath Hold Progress',
  }
);

// Extract hold times from sessions
interface HoldDataPoint {
  date: Date;
  duration: number;
  type: string;
}

const holdData = computed<HoldDataPoint[]>(() => {
  const points: HoldDataPoint[] = [];

  props.sessions.forEach((session) => {
    session.sets.forEach((set) => {
      set.extendedHolds.forEach((hold) => {
        points.push({
          date: new Date(hold.completedAt),
          duration: hold.actualDuration,
          type: hold.type,
        });
      });
    });
  });

  return points.sort((a, b) => a.date.getTime() - b.date.getTime());
});

const averageHold = computed(() => {
  if (!holdData.value.length) return 0;
  return holdData.value.reduce((sum, h) => sum + h.duration, 0) / holdData.value.length;
});

const maxHold = computed(() => {
  if (!holdData.value.length) return 0;
  return Math.max(...holdData.value.map((h) => h.duration));
});

const improvement = computed(() => {
  if (holdData.value.length < 2) return null;

  // Compare first 3 vs last 3 holds
  const firstHolds = holdData.value.slice(0, 3);
  const lastHolds = holdData.value.slice(-3);

  const firstAvg = firstHolds.reduce((sum, h) => sum + h.duration, 0) / firstHolds.length;
  const lastAvg = lastHolds.reduce((sum, h) => sum + h.duration, 0) / lastHolds.length;

  return lastAvg - firstAvg;
});

const chartData = computed<ChartData<'line'> | null>(() => {
  if (!holdData.value.length) return null;

  const labels = holdData.value.map((h) => format(h.date, 'MMM d'));
  const data = holdData.value.map((h) => h.duration);

  return {
    labels,
    datasets: [
      {
        label: 'Hold Duration (seconds)',
        data,
        borderColor: 'rgb(139, 92, 246)',
        backgroundColor: 'rgba(139, 92, 246, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: holdData.value.map((h) =>
          h.type === 'INHALE' ? 'rgb(59, 130, 246)' : 'rgb(16, 185, 129)'
        ),
        pointBorderColor: 'rgb(15, 23, 42)',
        pointBorderWidth: 2,
      },
    ],
  };
});

const chartOptions = computed<ChartOptions<'line'>>(() => ({
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
        label: (context) => {
          const hold = holdData.value[context.dataIndex];
          return [`${hold.type} hold: ${hold.duration}s`, format(hold.date, 'h:mm a')];
        },
      },
    },
  },
  scales: {
    x: {
      grid: {
        color: 'rgba(148, 163, 184, 0.1)',
      },
      ticks: {
        color: 'rgb(148, 163, 184)',
      },
    },
    y: {
      min: 0,
      grid: {
        color: 'rgba(148, 163, 184, 0.1)',
      },
      ticks: {
        color: 'rgb(148, 163, 184)',
        callback: (value) => `${value}s`,
      },
    },
  },
}));

function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}
</script>
