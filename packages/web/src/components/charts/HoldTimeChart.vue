<template>
  <div class="card-solid flex h-full min-w-0 flex-col">
    <div class="mb-4 flex min-h-[44px] flex-wrap items-center justify-between gap-3">
      <h3 class="text-lg font-semibold text-primary">{{ title }}</h3>
      <div v-if="improvement !== null" class="flex items-center gap-2">
        <span
          :class="[
            'inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium',
            improvement > 0
              ? 'bg-sage/12 text-sage'
              : improvement < 0
                ? 'bg-terracotta/12 text-danger'
                : 'bg-surface-raised text-muted',
          ]"
        >
          <svg
            class="size-3.5 shrink-0"
            role="img"
            :aria-label="improvement > 0 ? 'Increase' : improvement < 0 ? 'Decrease' : 'No change'"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              :d="
                improvement > 0
                  ? 'M12 20V4m-6 6 6-6 6 6'
                  : improvement < 0
                    ? 'M12 4v16m-6-6 6 6 6-6'
                    : 'M4 12h16m-6-6 6 6-6 6'
              "
            />
          </svg>
          {{ Math.abs(improvement).toFixed(1) }}s
        </span>
      </div>
    </div>

    <figure v-if="chartData">
      <div class="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span class="inline-flex items-center gap-1.5">
          <span aria-hidden="true" class="size-2.5 rounded-full bg-sand"></span>
          Exhale hold
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span aria-hidden="true" class="size-2.5 bg-clay [clip-path:polygon(50%_0,100%_100%,0_100%)]"></span>
          Inhale hold
        </span>
      </div>
      <div class="h-64 rounded-xl bg-surface-inset p-2">
        <Line :data="chartData" :options="chartOptions" aria-label="Breath hold progress" />
      </div>
      <ol aria-label="Extended hold values" class="sr-only">
        <li v-for="(hold, index) in holdData" :key="index">
          {{ format(hold.date, 'MMM d, yyyy') }} · {{ holdTypeLabel[hold.type] }} hold · {{ hold.duration }} seconds
        </li>
      </ol>
      <figcaption class="mt-2 text-xs text-muted">Extended holds by session date</figcaption>
    </figure>
    <div v-else class="flex h-64 shrink-0 items-center justify-center rounded-xl bg-surface-inset p-2 text-muted">
      <p>No hold data available</p>
    </div>

    <!-- Stats Summary -->
    <div v-if="sessions.length > 0" class="mt-auto grid grid-cols-3 gap-3 pt-4">
      <div class="bg-surface-inset rounded-lg p-2 sm:p-3 text-center">
        <div class="text-xs text-muted uppercase tracking-wider">Average</div>
        <div class="text-lg font-semibold tabular-nums text-primary mt-1">
          {{ formatTime(averageHold) }}
        </div>
      </div>
      <div class="bg-surface-inset rounded-lg p-2 sm:p-3 text-center">
        <div class="text-xs text-muted uppercase tracking-wider">Best</div>
        <div class="text-lg font-semibold tabular-nums text-primary mt-1">
          {{ formatTime(maxHold) }}
        </div>
      </div>
      <div class="bg-surface-inset rounded-lg p-2 sm:p-3 text-center">
        <div class="text-xs text-muted uppercase tracking-wider">Sessions</div>
        <div class="text-lg font-semibold tabular-nums text-primary mt-1">
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
import type { ExtendedHoldType, Session } from '@breath-in-flow/shared';
import { chartColors } from './chartColors';
import { format, isSameDay } from 'date-fns';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

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
  completedAt: Date;
  duration: number;
  type: ExtendedHoldType;
  numberInSession: number;
}

const holdTypeLabel = { INHALE: 'Inhale', EXHALE: 'Exhale' };

const holdData = computed<HoldDataPoint[]>(() => {
  const points: HoldDataPoint[] = [];

  props.sessions.forEach((session) => {
    const date = new Date(session.startedAt);
    let numberInSession = 0;
    session.sets.forEach((set) => {
      set.extendedHolds.forEach((hold) => {
        points.push({
          date,
          completedAt: new Date(hold.completedAt),
          duration: hold.actualDuration,
          type: hold.type,
          numberInSession: ++numberInSession,
        });
      });
    });
  });

  return points.sort(
    (a, b) => a.date.getTime() - b.date.getTime() || a.completedAt.getTime() - b.completedAt.getTime()
  );
});

const dateTicks = computed(() => {
  const points = holdData.value;
  const last = points.length - 1;
  if (last <= 0 || isSameDay(points[0].date, points[last].date)) return new Set([last]);

  const ticks = new Set([0, last]);
  // Keep a middle date near the center, with room between it and both end labels.
  const middle = points.findIndex(({ date }, index) =>
    index >= last / 3 && index <= (last * 2) / 3 &&
    !isSameDay(date, points[0].date) && !isSameDay(date, points[last].date)
  );
  if (middle !== -1) ticks.add(middle);
  return ticks;
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

  // Compare equally sized, non-overlapping groups of up to three holds.
  const groupSize = Math.min(3, Math.floor(holdData.value.length / 2));
  const firstHolds = holdData.value.slice(0, groupSize);
  const lastHolds = holdData.value.slice(-groupSize);

  const firstAvg = firstHolds.reduce((sum, h) => sum + h.duration, 0) / firstHolds.length;
  const lastAvg = lastHolds.reduce((sum, h) => sum + h.duration, 0) / lastHolds.length;

  return lastAvg - firstAvg;
});

const chartData = computed<ChartData<'line'> | null>(() => {
  if (!holdData.value.length) return null;

  const labels = holdData.value.map((hold) => format(hold.date, 'MMM d'));
  const data = holdData.value.map((h) => h.duration);

  return {
    labels,
    datasets: [
      {
        label: 'Hold Duration (seconds)',
        data,
        borderColor: chartColors.sage,
        backgroundColor: `${chartColors.sage}1a`,
        fill: true,
        tension: 0.4,
        pointRadius: 6,
        pointHoverRadius: 8,
        pointBackgroundColor: holdData.value.map((h) => (h.type === 'INHALE' ? chartColors.clay : chartColors.sand)),
        pointStyle: holdData.value.map((h) => (h.type === 'INHALE' ? 'triangle' : 'circle')),
        pointBorderColor: chartColors.inset,
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
      backgroundColor: chartColors.inset,
      titleColor: chartColors.primary,
      bodyColor: chartColors.secondary,
      borderColor: chartColors.lineStrong,
      borderWidth: 1,
      padding: 12,
      callbacks: {
        title: ([item]) => {
          const hold = holdData.value[item.dataIndex];
          return `${format(hold.date, 'MMM d, yyyy')} · Hold #${hold.numberInSession}`;
        },
        label: (context) => {
          const hold = holdData.value[context.dataIndex];
          return [
            `${holdTypeLabel[hold.type]} hold: ${hold.duration}s`,
            format(hold.completedAt, 'h:mm a'),
          ];
        },
      },
    },
  },
  scales: {
    x: {
      afterBuildTicks: (scale) => {
        scale.ticks = scale.ticks.filter(({ value }) => dateTicks.value.has(value));
      },
      grid: {
        display: false,
      },
      ticks: {
        color: chartColors.secondary,
        align: 'inner',
        autoSkip: false,
        maxRotation: 0,
      },
    },
    y: {
      min: 0,
      grid: {
        color: chartColors.lineSubtle,
      },
      ticks: {
        color: chartColors.secondary,
        callback: (value) => `${value}s`,
      },
    },
  },
}));

function formatTime(seconds: number): string {
  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) return `${roundedSeconds}s`;
  const mins = Math.floor(roundedSeconds / 60);
  const secs = roundedSeconds % 60;
  return `${mins}m ${secs}s`;
}
</script>
