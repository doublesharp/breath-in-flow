<template>
  <div class="hr-tachogram glass rounded-xl overflow-hidden" :style="{ height: height + 'px' }">
    <canvas ref="canvasEl" class="w-full h-full" />
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';

interface HrDataPoint {
  time: number;
  hr: number;
  quality: number;
}

interface BreathingPhase {
  start: number;
  end: number;
  type: 'inhale' | 'exhale';
}

const props = withDefaults(
  defineProps<{
    hrData: HrDataPoint[];
    breathingPhases?: BreathingPhase[];
    duration?: number;
    showBreathingOverlay?: boolean;
    height?: number;
  }>(),
  {
    breathingPhases: () => [],
    duration: 60,
    showBreathingOverlay: false,
    height: 200,
  }
);

const canvasEl = ref<HTMLCanvasElement | null>(null);
let animFrameId: number | null = null;
let lastData: HrDataPoint[] = [];

function getQualityColor(quality: number): string {
  if (quality > 0.7) return '#4ade80';
  if (quality > 0.4) return '#f59e0b';
  return '#ef4444';
}

function draw() {
  const canvas = canvasEl.value;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
  }

  const W = rect.width;
  const H = rect.height;
  const padL = 44;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Background
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  const data = lastData;
  if (!data.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for heart rate data…', W / 2, H / 2);
    return;
  }

  // Determine time window — use actual data range if shorter than requested duration
  const latestTime = data[data.length - 1].time;
  const earliestTime = data[0].time;
  const dataSpan = latestTime - earliestTime;
  const windowEnd = latestTime;
  const windowStart = dataSpan < props.duration ? earliestTime : windowEnd - props.duration;

  // Y range
  const hrs = data.map((d) => d.hr);
  const minHR = Math.min(...hrs);
  const maxHR = Math.max(...hrs);
  const hrPad = Math.max(5, (maxHR - minHR) * 0.15);
  const yMin = minHR - hrPad;
  const yMax = maxHR + hrPad;

  function toX(t: number): number {
    return padL + ((t - windowStart) / props.duration) * plotW;
  }
  function toY(hr: number): number {
    return padT + (1 - (hr - yMin) / (yMax - yMin)) * plotH;
  }

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;

  // Vertical grid every 10s
  for (let t = Math.ceil(windowStart / 10) * 10; t <= windowEnd; t += 10) {
    const x = toX(t);
    if (x < padL || x > padL + plotW) continue;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
  }

  // Horizontal grid (3-4 lines)
  const hrStep = Math.ceil((yMax - yMin) / 4 / 5) * 5;
  for (let hr = Math.ceil(yMin / hrStep) * hrStep; hr <= yMax; hr += hrStep) {
    const y = toY(hr);
    if (y < padT || y > padT + plotH) continue;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  // Breathing overlay
  if (props.showBreathingOverlay && props.breathingPhases?.length) {
    for (const phase of props.breathingPhases) {
      const x1 = Math.max(padL, toX(phase.start));
      const x2 = Math.min(padL + plotW, toX(phase.end));
      if (x2 < padL || x1 > padL + plotW) continue;
      ctx.fillStyle =
        phase.type === 'inhale' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(96, 165, 250, 0.1)';
      ctx.fillRect(x1, padT, x2 - x1, plotH);
    }
  }

  // Clip to plot area
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, plotW, plotH);
  ctx.clip();

  // Gradient fill below HR line
  const visibleData = data.filter((d) => d.time >= windowStart - 2 && d.time <= windowEnd + 2);
  if (visibleData.length > 1) {
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, 'rgba(74, 222, 128, 0.3)');
    grad.addColorStop(1, 'rgba(74, 222, 128, 0.0)');

    ctx.beginPath();
    ctx.moveTo(toX(visibleData[0].time), toY(visibleData[0].hr));
    for (let i = 1; i < visibleData.length; i++) {
      ctx.lineTo(toX(visibleData[i].time), toY(visibleData[i].hr));
    }
    ctx.lineTo(toX(visibleData[visibleData.length - 1].time), padT + plotH);
    ctx.lineTo(toX(visibleData[0].time), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // HR line with quality coloring
    let segStart = 0;
    for (let i = 1; i <= visibleData.length; i++) {
      const prevQuality = visibleData[segStart].quality;
      const atEnd = i === visibleData.length;
      const qualityChanged =
        !atEnd && Math.abs(visibleData[i].quality - prevQuality) > 0.1;

      if (atEnd || qualityChanged) {
        ctx.beginPath();
        ctx.moveTo(toX(visibleData[segStart].time), toY(visibleData[segStart].hr));
        for (let j = segStart + 1; j <= (atEnd ? i - 1 : i); j++) {
          ctx.lineTo(toX(visibleData[j].time), toY(visibleData[j].hr));
        }
        ctx.strokeStyle = getQualityColor(prevQuality);
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.stroke();
        segStart = i - (atEnd ? 1 : 0);
      }
    }

    // Latest point dot
    const last = visibleData[visibleData.length - 1];
    ctx.beginPath();
    ctx.arc(toX(last.time), toY(last.hr), 4, 0, Math.PI * 2);
    ctx.fillStyle = getQualityColor(last.quality);
    ctx.fill();
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

  // Y-axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  for (let hr = Math.ceil(yMin / hrStep) * hrStep; hr <= yMax; hr += hrStep) {
    const y = toY(hr);
    if (y < padT || y > padT + plotH) continue;
    ctx.fillText(String(Math.round(hr)), padL - 6, y + 4);
  }

  // X-axis labels
  ctx.textAlign = 'center';
  for (let t = Math.ceil(windowStart / 10) * 10; t <= windowEnd; t += 10) {
    const x = toX(t);
    if (x < padL || x > padL + plotW) continue;
    const label = t >= 0 ? `${Math.round(t)}s` : '';
    ctx.fillText(label, x, padT + plotH + 18);
  }

  // Y-axis title
  ctx.save();
  ctx.translate(12, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = '10px sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('BPM', 0, 0);
  ctx.restore();
}

function tick() {
  draw();
  animFrameId = requestAnimationFrame(tick);
}

watch(
  () => props.hrData,
  (newData) => {
    lastData = [...newData];
  },
  { deep: true, immediate: true }
);

onMounted(() => {
  lastData = [...props.hrData];
  tick();
});

onUnmounted(() => {
  if (animFrameId !== null) cancelAnimationFrame(animFrameId);
});
</script>
