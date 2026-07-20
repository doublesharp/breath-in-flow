<template>
  <div class="hr-oscillation glass rounded-xl p-4">
    <div class="flex items-start justify-between mb-3">
      <h3 class="text-sm font-semibold text-white/70 uppercase tracking-wider">HR Oscillation</h3>
      <div class="flex gap-3 text-xs">
        <span v-if="peakToTroughAmplitude != null" class="text-amber-400 font-medium">
          Amplitude: {{ peakToTroughAmplitude.toFixed(1) }} BPM
        </span>
        <span v-if="waveformSmoothness != null" class="text-white/60">
          Smoothness: {{ waveformSmoothness.toFixed(2) }}
        </span>
      </div>
    </div>
    <div :style="{ height: height + 'px' }">
      <canvas ref="canvasEl" class="w-full h-full" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';

interface HrPoint {
  time: number;
  hr: number;
}

const props = withDefaults(
  defineProps<{
    hrData: HrPoint[];
    breathingRateBPM: number;
    trialDurationSeconds: number;
    peakToTroughAmplitude?: number;
    waveformSmoothness?: number;
    height?: number;
  }>(),
  {
    peakToTroughAmplitude: undefined,
    waveformSmoothness: undefined,
    height: 200,
  }
);

const canvasEl = ref<HTMLCanvasElement | null>(null);

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
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  const data = props.hrData;
  const duration = props.trialDurationSeconds;

  function toX(t: number) {
    return padL + (t / duration) * plotW;
  }

  // Breathing cycle overlay
  if (props.breathingRateBPM > 0) {
    const cycleDuration = 60 / props.breathingRateBPM; // seconds
    let t = 0;
    let phase = 0; // 0 = inhale, 1 = exhale
    while (t < duration) {
      const halfCycle = cycleDuration / 2;
      const end = Math.min(t + halfCycle, duration);
      const x1 = toX(t);
      const x2 = toX(end);
      ctx.fillStyle = phase === 0 ? 'rgba(74,222,128,0.08)' : 'rgba(96,165,250,0.08)';
      ctx.fillRect(x1, padT, x2 - x1, plotH);
      t += halfCycle;
      phase = 1 - phase;
    }
  }

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  const xStep = duration <= 60 ? 10 : 30;
  for (let t = 0; t <= duration; t += xStep) {
    const x = toX(t);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
  }

  if (!data.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No HR data', W / 2, H / 2);
    return;
  }

  // Y range
  const hrs = data.map((d) => d.hr);
  const minHR = Math.min(...hrs);
  const maxHR = Math.max(...hrs);
  const hrPad = Math.max(3, (maxHR - minHR) * 0.15);
  const yMin = minHR - hrPad;
  const yMax = maxHR + hrPad;

  function toY(hr: number) {
    return padT + (1 - (hr - yMin) / (yMax - yMin)) * plotH;
  }

  // Horizontal grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  const hrStep = Math.max(1, Math.round((yMax - yMin) / 4));
  for (let hr = Math.ceil(yMin / hrStep) * hrStep; hr <= yMax; hr += hrStep) {
    const y = toY(hr);
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  // HR line with warm gradient
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, plotW, plotH);
  ctx.clip();

  if (data.length > 1) {
    // Gradient from amber to red
    const grad = ctx.createLinearGradient(padL, 0, padL + plotW, 0);
    grad.addColorStop(0, '#f59e0b');
    grad.addColorStop(0.5, '#f97316');
    grad.addColorStop(1, '#ef4444');

    // Smooth line
    ctx.beginPath();
    ctx.moveTo(toX(data[0].time), toY(data[0].hr));
    for (let i = 1; i < data.length; i++) {
      const prev = data[i - 1];
      const curr = data[i];
      const cpX = (toX(prev.time) + toX(curr.time)) / 2;
      ctx.bezierCurveTo(cpX, toY(prev.hr), cpX, toY(curr.hr), toX(curr.time), toY(curr.hr));
    }
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Peak and trough detection (simple local extrema)
    const peaks: HrPoint[] = [];
    const troughs: HrPoint[] = [];
    const windowMs = (60 / props.breathingRateBPM / 3) * 1000;

    for (let i = 1; i < data.length - 1; i++) {
      const prev = data[i - 1].hr;
      const curr = data[i].hr;
      const next = data[i + 1].hr;
      if (curr > prev && curr > next) peaks.push(data[i]);
      if (curr < prev && curr < next) troughs.push(data[i]);
    }

    // Draw peak markers (up triangles)
    ctx.fillStyle = 'rgba(251,191,36,0.9)';
    for (const p of peaks) {
      const x = toX(p.time);
      const y = toY(p.hr) - 8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y + 7);
      ctx.lineTo(x + 4, y + 7);
      ctx.closePath();
      ctx.fill();
    }

    // Draw trough markers (down triangles)
    ctx.fillStyle = 'rgba(167,139,250,0.9)';
    for (const t of troughs) {
      const x = toX(t.time);
      const y = toY(t.hr) + 8;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x - 4, y - 7);
      ctx.lineTo(x + 4, y - 7);
      ctx.closePath();
      ctx.fill();
    }

    void windowMs; // suppress unused var warning
  }
  ctx.restore();

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // Y labels
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let hr = Math.ceil(yMin / hrStep) * hrStep; hr <= yMax; hr += hrStep) {
    ctx.fillText(String(Math.round(hr)), padL - 4, toY(hr) + 4);
  }

  // X labels
  ctx.textAlign = 'center';
  for (let t = 0; t <= duration; t += xStep) {
    ctx.fillText(`${t}s`, toX(t), padT + plotH + 16);
  }

  // Y axis label
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px sans-serif';
  ctx.translate(10, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('BPM', 0, 0);
  ctx.restore();
}

watch([() => props.hrData, () => props.breathingRateBPM], drawChart, { deep: true });
onMounted(drawChart);
</script>
