<template>
  <div class="frequency-spectrum glass rounded-xl p-4">
    <h3 class="text-sm font-semibold text-white/70 uppercase tracking-wider mb-3">Frequency Spectrum</h3>
    <div :style="{ height: height + 'px' }" class="relative">
      <canvas ref="canvasEl" class="w-full h-full" />
    </div>
    <!-- Legend -->
    <div class="flex gap-4 mt-3 flex-wrap">
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-sm" style="background: rgba(107, 114, 128, 0.5)" />
        <span class="text-xs text-white/50">VLF</span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-sm" style="background: rgba(59, 130, 246, 0.5)" />
        <span class="text-xs text-white/50"> LF{{ lfPower != null ? ` · ${formatPower(lfPower)}` : '' }} </span>
      </div>
      <div class="flex items-center gap-1.5">
        <span class="w-3 h-3 rounded-sm" style="background: rgba(34, 197, 94, 0.5)" />
        <span class="text-xs text-white/50"> HF{{ hfPower != null ? ` · ${formatPower(hfPower)}` : '' }} </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { SpectralPoint } from '@breath-in-flow/shared';
import { ref, watch, onMounted } from 'vue';

const props = withDefaults(
  defineProps<{
    spectrum: SpectralPoint[];
    lfPeak?: number;
    hfPeak?: number;
    lfPower?: number;
    hfPower?: number;
    height?: number;
  }>(),
  {
    lfPeak: undefined,
    hfPeak: undefined,
    lfPower: undefined,
    hfPower: undefined,
    height: 180,
  }
);

const canvasEl = ref<HTMLCanvasElement | null>(null);

// Band boundaries (Hz)
const VLF_LOW = 0.003;
const VLF_HIGH = 0.04;
const LF_LOW = 0.04;
const LF_HIGH = 0.15;
const HF_LOW = 0.15;
const HF_HIGH = 0.4;
const X_MAX = 0.45;

function formatPower(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k ms²`;
  return `${Math.round(v)} ms²`;
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
  const padL = 52;
  const padR = 12;
  const padT = 10;
  const padB = 24;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, W, H);

  if (!props.spectrum.length) {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No spectrum data', W / 2, H / 2);
    return;
  }

  const maxPower = Math.max(...props.spectrum.map((p) => p.power)) * 1.1 || 1;

  function toX(freq: number): number {
    return padL + (freq / X_MAX) * plotW;
  }
  function toY(power: number): number {
    return padT + (1 - power / maxPower) * plotH;
  }

  // Band fills
  const bands = [
    { low: VLF_LOW, high: VLF_HIGH, color: 'rgba(107,114,128,0.25)' },
    { low: LF_LOW, high: LF_HIGH, color: 'rgba(59,130,246,0.3)' },
    { low: HF_LOW, high: HF_HIGH, color: 'rgba(34,197,94,0.3)' },
  ];

  for (const band of bands) {
    const x1 = toX(band.low);
    const x2 = toX(band.high);
    ctx.fillStyle = band.color;
    ctx.fillRect(x1, padT, x2 - x1, plotH);
  }

  // Grid lines
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

  // Band boundary lines
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  for (const freq of [VLF_LOW, VLF_HIGH, LF_HIGH, HF_HIGH]) {
    const x = toX(freq);
    ctx.beginPath();
    ctx.setLineDash([3, 3]);
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Area fill for spectrum
  ctx.save();
  ctx.beginPath();
  ctx.rect(padL, padT, plotW, plotH);
  ctx.clip();

  const points = props.spectrum.filter((p) => p.frequency <= X_MAX);
  if (points.length > 1) {
    const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
    grad.addColorStop(0, 'rgba(245,158,11,0.6)');
    grad.addColorStop(1, 'rgba(245,158,11,0.05)');

    ctx.beginPath();
    ctx.moveTo(toX(points[0].frequency), padT + plotH);
    ctx.lineTo(toX(points[0].frequency), toY(points[0].power));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toX(points[i].frequency), toY(points[i].power));
    }
    ctx.lineTo(toX(points[points.length - 1].frequency), padT + plotH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Spectrum line
    ctx.beginPath();
    ctx.moveTo(toX(points[0].frequency), toY(points[0].power));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(toX(points[i].frequency), toY(points[i].power));
    }
    ctx.strokeStyle = 'rgba(245,158,11,0.9)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.restore();

  // Peak markers
  const peaks = [
    { freq: props.lfPeak, color: 'rgba(96,165,250,0.9)', label: 'LF' },
    { freq: props.hfPeak, color: 'rgba(74,222,128,0.9)', label: 'HF' },
  ];
  for (const peak of peaks) {
    if (peak.freq == null) continue;
    const x = toX(peak.freq);
    ctx.strokeStyle = peak.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = peak.color;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${peak.label} ${peak.freq.toFixed(3)}Hz`, x, padT - 2);
  }

  // Axes
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(padL, padT);
  ctx.lineTo(padL, padT + plotH);
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.stroke();

  // Y axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i <= gridCount; i++) {
    const power = maxPower * (1 - i / gridCount);
    const y = padT + (i / gridCount) * plotH;
    const label = power >= 1000 ? `${(power / 1000).toFixed(0)}k` : Math.round(power).toString();
    ctx.fillText(label, padL - 4, y + 4);
  }

  // X axis labels
  ctx.textAlign = 'center';
  const xTicks = [0, 0.1, 0.2, 0.3, 0.4];
  for (const freq of xTicks) {
    const x = toX(freq);
    ctx.fillText(`${freq.toFixed(1)}`, x, padT + plotH + 16);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Hz', padL + plotW / 2, padT + plotH + 24);
}

watch(() => props.spectrum, drawChart, { deep: true });
watch([() => props.lfPeak, () => props.hfPeak], drawChart);

onMounted(drawChart);
</script>
