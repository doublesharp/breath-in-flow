<template>
  <div class="trial-comparison glass rounded-xl p-4">
    <div class="flex items-center justify-between mb-3">
      <h3 class="text-sm font-semibold text-white/70 uppercase tracking-wider">Trial Comparison</h3>
    </div>

    <!-- Metric selector tabs -->
    <div class="flex gap-1 mb-4 overflow-x-auto pb-1">
      <button
        v-for="m in metrics"
        :key="m.key"
        @click="activeMetric = m.key"
        :class="[
          'px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-all',
          activeMetric === m.key
            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
            : 'text-white/40 hover:text-white/60 border border-transparent',
        ]"
      >
        {{ m.label }}
      </button>
    </div>

    <!-- Bar chart -->
    <div :style="{ height: height + 'px' }" class="relative">
      <canvas ref="canvasEl" class="w-full h-full" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HRVAnalysis } from '@breath-in-flow/shared';
import { ref, watch, onMounted } from 'vue';

interface Trial {
  rate: number;
  analysis: HRVAnalysis;
}

type MetricKey = 'lfPower' | 'amplitude' | 'smoothness' | 'phaseSynchrony';

const props = withDefaults(
  defineProps<{
    trials: Trial[];
    selectedRate?: number;
    metric?: MetricKey;
    height?: number;
  }>(),
  {
    selectedRate: undefined,
    metric: 'lfPower',
    height: 200,
  }
);

const metrics: { key: MetricKey; label: string }[] = [
  { key: 'lfPower', label: 'LF Power' },
  { key: 'amplitude', label: 'Amplitude' },
  { key: 'smoothness', label: 'Smoothness' },
  { key: 'phaseSynchrony', label: 'Phase Sync' },
];

const activeMetric = ref<MetricKey>(props.metric);
const canvasEl = ref<HTMLCanvasElement | null>(null);

function getMetricValue(trial: Trial, key: MetricKey): number {
  switch (key) {
    case 'lfPower':
      return trial.analysis.frequencyDomain.lfPower;
    case 'amplitude':
      return trial.analysis.resonance.peakToTroughAmplitude;
    case 'smoothness':
      return trial.analysis.resonance.waveformSmoothness;
    case 'phaseSynchrony':
      return trial.analysis.resonance.phaseSynchrony;
  }
}

function getMetricLabel(key: MetricKey): string {
  switch (key) {
    case 'lfPower':
      return 'ms²';
    case 'amplitude':
      return 'BPM';
    case 'smoothness':
    case 'phaseSynchrony':
      return '';
  }
}

function formatValue(v: number, key: MetricKey): string {
  if (key === 'lfPower') {
    return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
  }
  if (key === 'amplitude') return v.toFixed(1);
  return v.toFixed(2);
}

function drawChart() {
  const canvas = canvasEl.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const W = rect.width;
  const H = rect.height;
  const padL = 48;
  const padR = 12;
  const padT = 20;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  if (!props.trials.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No trial data', W / 2, H / 2);
    return;
  }

  const key = activeMetric.value;
  const values = props.trials.map((t) => getMetricValue(t, key));
  const maxVal = Math.max(...values) * 1.15 || 1;

  const n = props.trials.length;
  const barGap = plotW * 0.05;
  const totalGap = barGap * (n + 1);
  const barW = (plotW - totalGap) / n;

  // Horizontal grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  const gridCount = 4;
  for (let i = 0; i <= gridCount; i++) {
    const y = padT + (i / gridCount) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  // Bars
  for (let i = 0; i < n; i++) {
    const trial = props.trials[i];
    const val = values[i];
    const isSelected = trial.rate === props.selectedRate;
    const x = padL + barGap + i * (barW + barGap);
    const barH = (val / maxVal) * plotH;
    const y = padT + plotH - barH;

    // Intensity: darker bars for lower, brighter for higher
    const intensity = val / maxVal;
    const alpha = 0.35 + intensity * 0.55;

    const grad = ctx.createLinearGradient(x, y, x, padT + plotH);
    grad.addColorStop(0, `rgba(245,158,11,${alpha})`);
    grad.addColorStop(1, `rgba(249,115,22,${alpha * 0.5})`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();

    // Selected highlight glow
    if (isSelected) {
      ctx.strokeStyle = 'rgba(251,191,36,0.8)';
      ctx.lineWidth = 2;
      ctx.shadowColor = 'rgba(251,191,36,0.5)';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // Value label on top of bar
    ctx.fillStyle = isSelected ? '#fbbf24' : 'rgba(255,255,255,0.7)';
    ctx.font = `${Math.min(10, barW * 0.35)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(formatValue(val, key), x + barW / 2, y - 5);

    // Rate label below
    ctx.fillStyle = isSelected ? '#fbbf24' : 'rgba(255,255,255,0.5)';
    ctx.font = '10px sans-serif';
    ctx.fillText(`${trial.rate}`, x + barW / 2, padT + plotH + 16);
  }

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // Y labels
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridCount; i++) {
    const val = maxVal * (1 - i / gridCount);
    const y = padT + (i / gridCount) * plotH;
    const label = key === 'lfPower' && val >= 1000
      ? `${(val / 1000).toFixed(0)}k`
      : val >= 10
      ? Math.round(val).toString()
      : val.toFixed(2);
    ctx.fillText(label, padL - 4, y + 4);
  }

  // Unit label
  const unitLabel = getMetricLabel(key);
  if (unitLabel) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '9px sans-serif';
    ctx.translate(10, padT + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText(unitLabel, 0, 0);
    ctx.restore();
  }

  // X axis title
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Breathing Rate (BPM)', padL + plotW / 2, padT + plotH + 26);
}

watch([() => props.trials, activeMetric, () => props.selectedRate], drawChart, { deep: true });
onMounted(drawChart);
</script>
