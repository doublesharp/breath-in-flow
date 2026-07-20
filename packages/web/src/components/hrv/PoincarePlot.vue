<template>
  <div class="poincare-plot glass rounded-xl p-4">
    <h3 class="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Poincaré Plot</h3>
    <div :style="{ height: size + 'px' }" class="relative">
      <canvas ref="canvasEl" class="w-full h-full" />
    </div>
    <p class="text-xs text-white/40 mt-2 text-center">RR[n] vs RR[n+1]</p>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';

const props = withDefaults(
  defineProps<{
    rrIntervals: number[];
    size?: number;
  }>(),
  {
    size: 240,
  }
);

const canvasEl = ref<HTMLCanvasElement | null>(null);

function drawPlot() {
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
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  const rr = props.rrIntervals;
  if (rr.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Need at least 2 RR intervals', W / 2, H / 2);
    return;
  }

  // Build pairs
  const pairs: [number, number][] = [];
  for (let i = 0; i < rr.length - 1; i++) {
    pairs.push([rr[i], rr[i + 1]]);
  }

  // Range — same for both axes (square plot)
  const allVals = rr;
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const pad = Math.max(20, (maxV - minV) * 0.1);
  const axMin = minV - pad;
  const axMax = maxV + pad;
  const range = axMax - axMin;

  function toX(v: number) {
    return padL + ((v - axMin) / range) * plotW;
  }
  function toY(v: number) {
    return padT + (1 - (v - axMin) / range) * plotH;
  }

  // Grid
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const t = i / gridLines;
    const x = padL + t * plotW;
    const y = padT + t * plotH;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  // Identity line (diagonal)
  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(toX(axMin), toY(axMin));
  ctx.lineTo(toX(axMax), toY(axMax));
  ctx.stroke();
  ctx.setLineDash([]);

  // Density map for coloring
  const cellSize = 20;
  const cols = Math.ceil(plotW / cellSize);
  const rows = Math.ceil(plotH / cellSize);
  const density = new Float32Array(cols * rows);

  for (const [x, y] of pairs) {
    const col = Math.floor(((x - axMin) / range) * (cols - 1));
    const row = Math.floor((1 - (y - axMin) / range) * (rows - 1));
    if (col >= 0 && col < cols && row >= 0 && row < rows) {
      density[row * cols + col]++;
    }
  }
  const maxDensity = Math.max(...Array.from(density)) || 1;

  // Draw points
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, plotW, plotH);
  ctx.clip();

  for (const [x, y] of pairs) {
    const col = Math.floor(((x - axMin) / range) * (cols - 1));
    const row = Math.floor((1 - (y - axMin) / range) * (rows - 1));
    const d = col >= 0 && col < cols && row >= 0 && row < rows ? density[row * cols + col] : 1;
    const t = d / maxDensity;

    // cool (blue) → warm (red/orange) based on density
    const r = Math.round(59 + t * (239 - 59));
    const g = Math.round(130 + t * (68 - 130));
    const b = Math.round(246 + t * (68 - 246));

    ctx.beginPath();
    ctx.arc(toX(x), toY(y), 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${r},${g},${b},0.7)`;
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

  // Tick labels
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '10px sans-serif';
  const tickCount = 4;
  for (let i = 0; i <= tickCount; i++) {
    const val = axMin + (i / tickCount) * range;
    // X axis
    ctx.textAlign = 'center';
    ctx.fillText(Math.round(val).toString(), toX(val), padT + plotH + 16);
    // Y axis
    ctx.textAlign = 'right';
    ctx.fillText(Math.round(val).toString(), padL - 4, toY(val) + 4);
  }

  // Axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('RR[n] (ms)', padL + plotW / 2, padT + plotH + 26);
  ctx.save();
  ctx.translate(10, padT + plotH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('RR[n+1] (ms)', 0, 0);
  ctx.restore();
}

watch(() => props.rrIntervals, drawPlot, { deep: true });
onMounted(drawPlot);
</script>
