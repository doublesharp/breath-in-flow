<template>
  <div class="hrv-trends">
    <!-- Time range selector -->
    <div class="flex gap-2 mb-4" data-testid="time-range-selector">
      <button
        v-for="range in timeRanges"
        :key="range.days"
        :data-testid="`range-btn-${range.label}`"
        :class="[
          'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
          selectedDays === range.days
            ? 'bg-blue-600 text-white'
            : 'bg-slate-700/60 text-slate-300 hover:bg-slate-600/60',
        ]"
        @click="selectedDays = range.days"
      >
        {{ range.label }}
      </button>
    </div>

    <!-- Charts -->
    <div class="space-y-4">
      <!-- RMSSD Trend -->
      <div class="glass rounded-xl p-4" data-testid="rmssd-chart-container">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">RMSSD Trend</h3>
          <span class="text-xs text-slate-500">Target: &gt;40ms</span>
        </div>
        <div class="relative" style="height: 160px">
          <canvas ref="rmssdCanvas" class="w-full h-full" data-testid="rmssd-canvas" />
          <div v-if="filteredMeasurements.length === 0" class="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            No data in selected range
          </div>
        </div>
      </div>

      <!-- LF Power Trend -->
      <div class="glass rounded-xl p-4" data-testid="lf-power-chart-container">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">LF Power Trend</h3>
          <span class="text-xs text-slate-500">Resonance training effect</span>
        </div>
        <div class="relative" style="height: 160px">
          <canvas ref="lfPowerCanvas" class="w-full h-full" data-testid="lf-power-canvas" />
          <div v-if="filteredMeasurements.length === 0" class="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            No data in selected range
          </div>
        </div>
      </div>

      <!-- Resting Heart Rate Trend -->
      <div class="glass rounded-xl p-4" data-testid="hr-chart-container">
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Resting Heart Rate</h3>
          <span class="text-xs text-slate-500">Lower = better recovery</span>
        </div>
        <div class="relative" style="height: 160px">
          <canvas ref="hrCanvas" class="w-full h-full" data-testid="hr-canvas" />
          <div v-if="filteredMeasurements.length === 0" class="absolute inset-0 flex items-center justify-center text-slate-500 text-sm">
            No data in selected range
          </div>
        </div>
      </div>

      <!-- Morning Readiness Score -->
      <div
        v-if="morningReadinessData.length > 0"
        class="glass rounded-xl p-4"
        data-testid="readiness-chart-container"
      >
        <div class="flex items-center justify-between mb-2">
          <h3 class="text-sm font-semibold text-slate-300 uppercase tracking-wider">Morning Readiness</h3>
          <span class="text-xs text-slate-500">0–100 score</span>
        </div>
        <div class="relative" style="height: 160px">
          <canvas ref="readinessCanvas" class="w-full h-full" data-testid="readiness-canvas" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue';
import type { HrvMeasurement } from '../composables/useHrvStorage';

// ─── Props ────────────────────────────────────────────────────────────────────

const props = withDefaults(
  defineProps<{
    measurements: HrvMeasurement[];
    days?: number;
  }>(),
  {
    days: 30,
  }
);

// ─── Time range selector ──────────────────────────────────────────────────────

const timeRanges = [
  { label: '7d', days: 7 },
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: 0 },
];

const selectedDays = ref(props.days);

// ─── Canvas refs ──────────────────────────────────────────────────────────────

const rmssdCanvas = ref<HTMLCanvasElement | null>(null);
const lfPowerCanvas = ref<HTMLCanvasElement | null>(null);
const hrCanvas = ref<HTMLCanvasElement | null>(null);
const readinessCanvas = ref<HTMLCanvasElement | null>(null);

// ─── Filtered data ────────────────────────────────────────────────────────────

const filteredMeasurements = computed(() => {
  const sorted = [...props.measurements].sort(
    (a, b) => new Date(a.completedAt).getTime() - new Date(b.completedAt).getTime()
  );
  if (selectedDays.value === 0) return sorted;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedDays.value);
  return sorted.filter((m) => new Date(m.completedAt) >= cutoff);
});

// ─── Morning readiness data ───────────────────────────────────────────────────

const morningReadinessData = computed(() => {
  const morningMeasurements = filteredMeasurements.value.filter(
    (m) => m.type === 'morning-readiness'
  );
  if (morningMeasurements.length === 0) return [];

  // Compute a baseline RMSSD from all measurements for percentile scoring
  const allRmssds = props.measurements.map((m) => m.analysis.timeDomain.rmssd);
  const baselineRmssd =
    allRmssds.reduce((a, b) => a + b, 0) / (allRmssds.length || 1);

  return morningMeasurements.map((m) => ({
    date: new Date(m.completedAt),
    value: Math.min(100, Math.max(0, (m.analysis.timeDomain.rmssd / (baselineRmssd || 1)) * 50)),
  }));
});

// ─── Chart utility ───────────────────────────────────────────────────────────

interface TrendChartOptions {
  data: { date: Date; value: number }[];
  width: number;
  height: number;
  lineColor: string;
  fillColor: string;
  showMovingAvg?: boolean;
  movingAvgWindow?: number;
  zones?: { min: number; max: number; color: string }[];
  yLabel?: string;
  formatValue?: (v: number) => string;
}

function computeMovingAverage(
  data: { date: Date; value: number }[],
  window: number
): (number | null)[] {
  return data.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = data.slice(start, i + 1);
    return slice.reduce((sum, p) => sum + p.value, 0) / slice.length;
  });
}

function drawTrendChart(ctx: CanvasRenderingContext2D, options: TrendChartOptions): void {
  const { data, width, height, lineColor, fillColor, zones, yLabel, formatValue } = options;
  const showMovingAvg = options.showMovingAvg ?? false;
  const movingAvgWindow = options.movingAvgWindow ?? 7;

  const padL = 48;
  const padR = 16;
  const padT = 12;
  const padB = 32;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  // Clear
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
  ctx.fillRect(0, 0, width, height);

  if (data.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data', width / 2, height / 2);
    return;
  }

  // Y range
  const values = data.map((d) => d.value);
  const rawMin = Math.min(...values);
  const rawMax = Math.max(...values);
  const pad = Math.max(1, (rawMax - rawMin) * 0.1);
  const yMin = rawMin - pad;
  const yMax = rawMax + pad;

  // X range
  const xMin = data[0].date.getTime();
  const xMax = data[data.length - 1].date.getTime() || xMin + 1;

  function toX(t: number): number {
    if (xMax === xMin) return padL + plotW / 2;
    return padL + ((t - xMin) / (xMax - xMin)) * plotW;
  }
  function toY(v: number): number {
    if (yMax === yMin) return padT + plotH / 2;
    return padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;
  }

  // Zones (background bands)
  if (zones && zones.length > 0) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(padL, padT, plotW, plotH);
    ctx.clip();

    for (const zone of zones) {
      const clampedMin = Math.max(zone.min, yMin);
      const clampedMax = Math.min(zone.max, yMax);
      if (clampedMax <= clampedMin) continue;
      const y1 = toY(clampedMax);
      const y2 = toY(clampedMin);
      ctx.fillStyle = zone.color;
      ctx.fillRect(padL, y1, plotW, y2 - y1);
    }
    ctx.restore();
  }

  // Grid lines (horizontal)
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  const yStep = computeNiceStep(yMax - yMin, 4);
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    const y = toY(v);
    if (y < padT || y > padT + plotH) continue;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  // Grid lines (vertical – every 7 days or similar)
  const msPerDay = 86400000;
  const totalDays = (xMax - xMin) / msPerDay;
  let xStepDays = totalDays <= 10 ? 1 : totalDays <= 35 ? 7 : totalDays <= 100 ? 14 : 30;
  const xStepMs = xStepDays * msPerDay;
  const firstDay = new Date(xMin);
  firstDay.setHours(0, 0, 0, 0);
  // align to even boundary
  const alignedStart =
    Math.ceil(firstDay.getTime() / xStepMs) * xStepMs;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  for (let t = alignedStart; t <= xMax; t += xStepMs) {
    const x = toX(t);
    if (x < padL || x > padL + plotW) continue;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
  }

  // Clip for lines
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, plotW, plotH);
  ctx.clip();

  // Gradient fill under data line
  if (data.length > 1) {
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, fillColor);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.beginPath();
    ctx.moveTo(toX(data[0].date.getTime()), toY(data[0].value));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(data[i].date.getTime()), toY(data[i].value));
    }
    ctx.lineTo(toX(data[data.length - 1].date.getTime()), padT + plotH);
    ctx.lineTo(toX(data[0].date.getTime()), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Data line
  if (data.length > 0) {
    ctx.beginPath();
    ctx.moveTo(toX(data[0].date.getTime()), toY(data[0].value));
    for (let i = 1; i < data.length; i++) {
      ctx.lineTo(toX(data[i].date.getTime()), toY(data[i].value));
    }
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Data points
    for (const point of data) {
      ctx.beginPath();
      ctx.arc(toX(point.date.getTime()), toY(point.value), 3, 0, Math.PI * 2);
      ctx.fillStyle = lineColor;
      ctx.fill();
    }
  }

  // Moving average line
  if (showMovingAvg && data.length >= movingAvgWindow) {
    const mavg = computeMovingAverage(data, movingAvgWindow);
    ctx.beginPath();
    let started = false;
    for (let i = 0; i < data.length; i++) {
      const avg = mavg[i];
      if (avg === null) continue;
      const x = toX(data[i].date.getTime());
      const y = toY(avg);
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // Y-axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let v = Math.ceil(yMin / yStep) * yStep; v <= yMax; v += yStep) {
    const y = toY(v);
    if (y < padT || y > padT + plotH) continue;
    const label = formatValue ? formatValue(v) : String(Math.round(v));
    ctx.fillText(label, padL - 4, y + 3);
  }

  // X-axis date labels
  ctx.textAlign = 'center';
  for (let t = alignedStart; t <= xMax; t += xStepMs) {
    const x = toX(t);
    if (x < padL || x > padL + plotW) continue;
    const d = new Date(t);
    const label = `${d.getMonth() + 1}/${d.getDate()}`;
    ctx.fillText(label, x, padT + plotH + 20);
  }

  // Y-axis label
  if (yLabel) {
    ctx.save();
    ctx.translate(12, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.font = '10px sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillText(yLabel, 0, 0);
    ctx.restore();
  }
}

function computeNiceStep(range: number, targetTicks: number): number {
  const rough = range / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const steps = [1, 2, 5, 10];
  for (const s of steps) {
    if (rough <= s * magnitude) return s * magnitude;
  }
  return magnitude * 10;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function getCanvasSize(canvas: HTMLCanvasElement): { width: number; height: number } {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || canvas.offsetWidth || 300;
  const height = rect.height || canvas.offsetHeight || 160;

  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
  }
  return { width, height };
}

function drawAllCharts() {
  const measurements = filteredMeasurements.value;

  // RMSSD chart
  if (rmssdCanvas.value) {
    const ctx = rmssdCanvas.value.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = getCanvasSize(rmssdCanvas.value);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rmssdData = measurements.map((m) => ({
        date: new Date(m.completedAt),
        value: m.analysis.timeDomain.rmssd,
      }));

      drawTrendChart(ctx, {
        data: rmssdData,
        width,
        height,
        lineColor: '#4ade80',
        fillColor: 'rgba(74, 222, 128, 0.15)',
        showMovingAvg: true,
        movingAvgWindow: 7,
        zones: [
          { min: 40, max: Infinity, color: 'rgba(74, 222, 128, 0.06)' },
          { min: 20, max: 40, color: 'rgba(250, 204, 21, 0.06)' },
          { min: -Infinity, max: 20, color: 'rgba(239, 68, 68, 0.06)' },
        ],
        yLabel: 'ms',
        formatValue: (v) => `${Math.round(v)}`,
      });
    }
  }

  // LF Power chart
  if (lfPowerCanvas.value) {
    const ctx = lfPowerCanvas.value.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = getCanvasSize(lfPowerCanvas.value);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const lfData = measurements.map((m) => ({
        date: new Date(m.completedAt),
        value: m.analysis.frequencyDomain.lfPower,
      }));

      drawTrendChart(ctx, {
        data: lfData,
        width,
        height,
        lineColor: '#60a5fa',
        fillColor: 'rgba(96, 165, 250, 0.15)',
        showMovingAvg: true,
        movingAvgWindow: 7,
        yLabel: 'ms²',
        formatValue: (v) => {
          if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
          return String(Math.round(v));
        },
      });
    }
  }

  // Heart Rate chart
  if (hrCanvas.value) {
    const ctx = hrCanvas.value.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = getCanvasSize(hrCanvas.value);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const hrData = measurements.map((m) => ({
        date: new Date(m.completedAt),
        value: m.analysis.timeDomain.meanHR,
      }));

      drawTrendChart(ctx, {
        data: hrData,
        width,
        height,
        lineColor: '#f87171',
        fillColor: 'rgba(248, 113, 113, 0.15)',
        showMovingAvg: true,
        movingAvgWindow: 7,
        yLabel: 'BPM',
        formatValue: (v) => String(Math.round(v)),
      });
    }
  }

  // Morning Readiness chart
  if (readinessCanvas.value && morningReadinessData.value.length > 0) {
    const ctx = readinessCanvas.value.getContext('2d');
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      const { width, height } = getCanvasSize(readinessCanvas.value);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      drawTrendChart(ctx, {
        data: morningReadinessData.value,
        width,
        height,
        lineColor: '#a78bfa',
        fillColor: 'rgba(167, 139, 250, 0.15)',
        zones: [
          { min: 70, max: 100, color: 'rgba(74, 222, 128, 0.06)' },
          { min: 40, max: 70, color: 'rgba(250, 204, 21, 0.06)' },
          { min: 0, max: 40, color: 'rgba(239, 68, 68, 0.06)' },
        ],
        yLabel: 'Score',
        formatValue: (v) => String(Math.round(v)),
      });
    }
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

onMounted(async () => {
  await nextTick();
  drawAllCharts();
});

watch(
  [filteredMeasurements, morningReadinessData],
  async () => {
    await nextTick();
    drawAllCharts();
  },
  { deep: true }
);
</script>
