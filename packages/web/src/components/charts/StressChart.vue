<template>
  <div class="glass rounded-xl p-5">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-white">{{ title }}</h3>
      <div v-if="reduction !== null" class="flex items-center gap-2">
        <span
          :class="[
            'px-3 py-1 rounded-full text-sm font-medium',
            reduction > 0
              ? 'bg-emerald-500/20 text-emerald-400'
              : reduction < 0
                ? 'bg-red-500/20 text-red-400'
                : 'bg-slate-500/20 text-slate-400',
          ]"
        >
          {{ reduction > 0 ? '↓' : reduction < 0 ? '↑' : '→' }}
          {{ Math.abs(reduction).toFixed(1) }}%
        </span>
      </div>
    </div>

    <div class="h-64">
      <Line v-if="chartData" :data="chartData" :options="chartOptions" />
      <div v-else class="h-full flex items-center justify-center text-slate-400">
        <p>No data available</p>
      </div>
    </div>

    <!-- Legend -->
    <div v-if="showLegend" class="mt-4 flex flex-wrap gap-4 text-sm">
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-amber-500"></span>
        <span class="text-slate-400">Pre-session</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-blue-500"></span>
        <span class="text-slate-400">During session</span>
      </div>
      <div class="flex items-center gap-2">
        <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
        <span class="text-slate-400">Post-session</span>
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
import type { StressDataPoint } from '../../services/wearables/types';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const props = withDefaults(
  defineProps<{
    title?: string;
    preData?: StressDataPoint[];
    duringData?: StressDataPoint[];
    postData?: StressDataPoint[];
    showLegend?: boolean;
  }>(),
  {
    title: 'Stress Levels',
    showLegend: true,
  }
);

const reduction = computed(() => {
  if (!props.preData?.length || !props.postData?.length) return null;

  const preAvg = props.preData.reduce((sum, d) => sum + d.value, 0) / props.preData.length;
  const postAvg = props.postData.reduce((sum, d) => sum + d.value, 0) / props.postData.length;

  return ((preAvg - postAvg) / preAvg) * 100;
});

const chartData = computed<ChartData<'line'> | null>(() => {
  const datasets: ChartData<'line'>['datasets'] = [];
  const allLabels: string[] = [];

  if (props.preData?.length) {
    const labels = props.preData.map((d) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    allLabels.push(...labels);
    datasets.push({
      label: 'Pre-session',
      data: props.preData.map((d) => d.value),
      borderColor: 'rgb(245, 158, 11)',
      backgroundColor: 'rgba(245, 158, 11, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
    });
  }

  if (props.duringData?.length) {
    const labels = props.duringData.map((d) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    if (!allLabels.length) allLabels.push(...labels);
    datasets.push({
      label: 'During session',
      data: props.duringData.map((d) => d.value),
      borderColor: 'rgb(59, 130, 246)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
    });
  }

  if (props.postData?.length) {
    const labels = props.postData.map((d) =>
      new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
    if (!allLabels.length) allLabels.push(...labels);
    datasets.push({
      label: 'Post-session',
      data: props.postData.map((d) => d.value),
      borderColor: 'rgb(16, 185, 129)',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 3,
      pointHoverRadius: 6,
    });
  }

  if (!datasets.length) return null;

  return {
    labels: allLabels,
    datasets,
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
      displayColors: true,
      callbacks: {
        label: (context) => `Stress: ${context.parsed.y}`,
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
      max: 100,
      grid: {
        color: 'rgba(148, 163, 184, 0.1)',
      },
      ticks: {
        color: 'rgb(148, 163, 184)',
        callback: (value) => `${value}`,
      },
    },
  },
}));
</script>
