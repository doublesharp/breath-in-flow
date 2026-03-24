<template>
  <div class="hrv-metrics-dashboard" :class="compact ? 'space-y-3' : 'space-y-5'">
    <template v-if="analysis">
      <!-- Heart Rate Section -->
      <section>
        <h4 class="section-header">Heart Rate</h4>
        <div :class="gridClass">
          <MetricCard
            :value="fmtBPM(analysis.timeDomain.minHR)"
            unit="BPM"
            label="MIN HR"
            color="blue"
            :compact="compact"
          />
          <MetricCard
            :value="fmtBPM(analysis.timeDomain.maxHR)"
            unit="BPM"
            label="MAX HR"
            color="red"
            :compact="compact"
          />
          <MetricCard
            :value="fmtBPM(analysis.timeDomain.meanHR)"
            unit="BPM"
            label="AVG HR"
            color="green"
            :compact="compact"
          />
        </div>
      </section>

      <!-- Time-Domain Section -->
      <section>
        <h4 class="section-header">Time-Domain HRV</h4>
        <div :class="gridClass">
          <MetricCard
            :value="fmtMs(analysis.timeDomain.rmssd)"
            unit="ms"
            label="RMSSD"
            color="purple"
            :compact="compact"
          />
          <MetricCard
            :value="fmtMs(analysis.timeDomain.sdnn)"
            unit="ms"
            label="SDNN"
            color="indigo"
            :compact="compact"
          />
          <MetricCard
            :value="fmtPct(analysis.timeDomain.pnn50)"
            unit="%"
            label="pNN50"
            color="cyan"
            :compact="compact"
          />
          <MetricCard
            :value="fmtMs(analysis.timeDomain.meanRR)"
            unit="ms"
            label="MEAN RR"
            color="teal"
            :compact="compact"
          />
        </div>
      </section>

      <!-- Frequency-Domain Section -->
      <section>
        <h4 class="section-header">Frequency-Domain</h4>
        <div :class="gridClass">
          <MetricCard
            :value="fmtPower(analysis.frequencyDomain.totalPower)"
            unit="ms²"
            label="TOTAL PWR"
            color="amber"
            :compact="compact"
          />
          <MetricCard
            :value="fmtRatio(analysis.frequencyDomain.lfHfRatio)"
            unit=""
            label="LF/HF"
            color="orange"
            :compact="compact"
          />
          <MetricCard
            :value="fmtPower(analysis.frequencyDomain.lfPower)"
            unit="ms²"
            label="LF POWER"
            color="blue"
            :compact="compact"
          />
          <MetricCard
            :value="fmtPower(analysis.frequencyDomain.hfPower)"
            unit="ms²"
            label="HF POWER"
            color="green"
            :compact="compact"
          />
          <MetricCard
            :value="fmtHz(analysis.frequencyDomain.lfPeak)"
            unit="Hz"
            label="LF PEAK"
            color="blue"
            :compact="compact"
          />
          <MetricCard
            :value="fmtHz(analysis.frequencyDomain.hfPeak)"
            unit="Hz"
            label="HF PEAK"
            color="green"
            :compact="compact"
          />
        </div>
      </section>

      <!-- Resonance Section -->
      <section>
        <h4 class="section-header">Resonance</h4>
        <div :class="gridClass">
          <MetricCard
            :value="fmtBPM(analysis.resonance.peakToTroughAmplitude)"
            unit="BPM"
            label="AMPLITUDE"
            color="amber"
            :compact="compact"
          />
          <MetricCard
            :value="fmtDecimal(analysis.resonance.waveformSmoothness)"
            unit=""
            label="SMOOTHNESS"
            color="green"
            :compact="compact"
          />
          <MetricCard
            :value="fmtDecimal(analysis.resonance.phaseSynchrony)"
            unit=""
            label="PHASE SYNC"
            color="purple"
            :compact="compact"
          />
        </div>
      </section>
    </template>

    <!-- Empty state -->
    <div v-else class="flex flex-col items-center justify-center py-10 text-white/40">
      <svg class="w-10 h-10 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <p class="text-sm">No HRV analysis data</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from 'vue';
import type { HRVAnalysis } from '@breath-in-flow/shared';

const props = withDefaults(
  defineProps<{
    analysis: HRVAnalysis | null;
    compact?: boolean;
  }>(),
  {
    compact: false,
  }
);

const gridClass = computed(() =>
  props.compact
    ? 'grid grid-cols-2 gap-2'
    : 'grid grid-cols-2 sm:grid-cols-3 gap-3'
);

function fmtBPM(v: number) {
  return v.toFixed(1);
}
function fmtMs(v: number) {
  return v.toFixed(2) + 'ms';
}
function fmtPct(v: number) {
  return v.toFixed(1);
}
function fmtPower(v: number) {
  if (v >= 1000) return (v / 1000).toFixed(2) + 'k';
  return v.toFixed(2);
}
function fmtRatio(v: number) {
  return v.toFixed(2);
}
function fmtHz(v: number) {
  return v.toFixed(3);
}
function fmtDecimal(v: number) {
  return v.toFixed(2);
}

type MetricColor = 'blue' | 'red' | 'green' | 'purple' | 'indigo' | 'cyan' | 'teal' | 'amber' | 'orange';

const colorMap: Record<MetricColor, { bg: string; text: string }> = {
  blue:   { bg: 'rgba(59,130,246,0.1)',  text: '#60a5fa' },
  red:    { bg: 'rgba(239,68,68,0.1)',   text: '#f87171' },
  green:  { bg: 'rgba(34,197,94,0.1)',   text: '#4ade80' },
  purple: { bg: 'rgba(168,85,247,0.1)',  text: '#c084fc' },
  indigo: { bg: 'rgba(99,102,241,0.1)',  text: '#818cf8' },
  cyan:   { bg: 'rgba(6,182,212,0.1)',   text: '#22d3ee' },
  teal:   { bg: 'rgba(20,184,166,0.1)',  text: '#2dd4bf' },
  amber:  { bg: 'rgba(245,158,11,0.1)',  text: '#fbbf24' },
  orange: { bg: 'rgba(249,115,22,0.1)',  text: '#fb923c' },
};

// Inline MetricCard component
const MetricCard = defineComponent({
  props: {
    value: { type: String, required: true },
    unit: { type: String, default: '' },
    label: { type: String, required: true },
    color: { type: String as () => MetricColor, default: 'blue' },
    compact: { type: Boolean, default: false },
  },
  setup(cardProps) {
    return () => {
      const colors = colorMap[cardProps.color] ?? colorMap.blue;
      return h(
        'div',
        {
          class: 'metric-card rounded-xl border border-white/10 text-center',
          style: {
            background: colors.bg,
            padding: cardProps.compact ? '8px 6px' : '14px 10px',
          },
          'data-label': cardProps.label,
        },
        [
          h(
            'div',
            {
              class: 'font-bold tabular-nums leading-tight',
              style: {
                color: colors.text,
                fontSize: cardProps.compact ? '15px' : '18px',
              },
            },
            cardProps.value
          ),
          cardProps.unit
            ? h(
                'div',
                { class: 'text-white/40 uppercase tracking-wider', style: { fontSize: '9px', marginTop: '1px' } },
                cardProps.unit
              )
            : null,
          h(
            'div',
            { class: 'text-white/50 uppercase tracking-wider font-medium', style: { fontSize: '9px', marginTop: '4px' } },
            cardProps.label
          ),
        ]
      );
    };
  },
});
</script>

<style scoped>
.section-header {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
</style>
