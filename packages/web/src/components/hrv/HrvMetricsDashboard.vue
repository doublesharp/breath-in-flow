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
        <h4 class="section-header">Pulse Variability Metrics</h4>
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
        <div v-if="analysis.frequencyDomain.available" :class="gridClass">
          <MetricCard
            :value="fmtPct(analysis.frequencyDomain.value.lfPowerNorm)"
            unit="%"
            label="LF NORM"
            color="blue"
            :compact="compact"
          />
          <MetricCard
            :value="fmtPct(analysis.frequencyDomain.value.hfPowerNorm)"
            unit="%"
            label="HF NORM"
            color="green"
            :compact="compact"
          />
          <MetricCard
            :value="fmtRatio(analysis.frequencyDomain.value.lfHfRatio)"
            unit=""
            label="LF/HF"
            color="orange"
            :compact="compact"
          />
          <MetricCard
            :value="fmtHz(analysis.frequencyDomain.value.lfPeak)"
            unit="Hz"
            label="LF PEAK"
            color="blue"
            :compact="compact"
          />
          <MetricCard
            :value="fmtHz(analysis.frequencyDomain.value.hfPeak)"
            unit="Hz"
            label="HF PEAK"
            color="green"
            :compact="compact"
          />
        </div>
        <div
          v-else
          class="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-white/60"
          role="status"
        >
          <div class="font-medium text-amber-300">Frequency metrics unavailable</div>
          <div class="mt-1 text-xs">
            {{ frequencyUnavailableMessage(analysis.frequencyDomain.reason) }}
          </div>
        </div>
      </section>

      <!-- Resonance Section -->
      <section>
        <h4 class="section-header">Resonance</h4>
        <div v-if="analysis.resonance.available" :class="gridClass">
          <MetricCard
            :value="fmtBPM(analysis.resonance.value.peakToTroughAmplitude)"
            unit="BPM"
            label="AMPLITUDE"
            color="amber"
            :compact="compact"
          />
          <MetricCard
            :value="fmtDecimal(analysis.resonance.value.waveformSmoothness)"
            unit=""
            label="SMOOTHNESS"
            color="green"
            :compact="compact"
          />
          <MetricCard
            :value="fmtDecimal(analysis.resonance.value.phaseSynchrony)"
            unit=""
            label="PHASE SYNC"
            color="purple"
            :compact="compact"
          />
        </div>
        <div
          v-else
          class="rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-sm text-white/60"
          role="status"
        >
          <div class="font-medium text-amber-300">Resonance metrics unavailable</div>
          <div class="mt-1 text-xs">
            {{ resonanceUnavailableMessage(analysis.resonance.reason) }}
          </div>
        </div>
      </section>
    </template>

    <!-- Empty state -->
    <div v-else class="flex flex-col items-center justify-center py-10 text-white/40">
      <svg class="w-10 h-10 mb-3 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
        />
      </svg>
      <p class="text-sm">No pulse variability analysis data</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineComponent, h } from 'vue';
import type { FrequencyDomainUnavailableReason, HRVAnalysis, ResonanceUnavailableReason } from '@breath-in-flow/shared';

const props = withDefaults(
  defineProps<{
    analysis: HRVAnalysis | null;
    compact?: boolean;
  }>(),
  {
    compact: false,
  }
);

const gridClass = computed(() => (props.compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 sm:grid-cols-3 gap-3'));

function fmtBPM(v: number) {
  return v.toFixed(1);
}
function fmtMs(v: number) {
  return v.toFixed(2);
}
function fmtPct(v: number) {
  return v.toFixed(1);
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

function frequencyUnavailableMessage(reason: FrequencyDomainUnavailableReason): string {
  if (reason === 'protocol-not-supported') {
    return 'This protocol is designed for short-recording metrics. Use Full Analysis for frequency-domain results.';
  }
  if (reason === 'no-variability') {
    return 'This recording did not contain enough beat-to-beat variation for a reliable spectrum.';
  }
  if (reason === 'invalid-series') {
    return 'The detected beats did not form a valid continuous series. Try another reading while staying still.';
  }
  if (reason === 'insufficient-beats') {
    return 'More clean detected beats are needed before these metrics can be calculated.';
  }
  if (reason === 'low-signal-quality' || reason === 'too-many-artifacts') {
    return 'Signal quality was not stable enough for frequency metrics. Stay still and try another reading.';
  }
  return 'A longer clean recording is needed before these metrics can be calculated.';
}

function resonanceUnavailableMessage(reason: ResonanceUnavailableReason): string {
  if (reason === 'missing-breathing-rate') {
    return 'A paced breathing rate is required to calculate breathing-response metrics.';
  }
  if (reason === 'no-variability') {
    return 'This trial did not contain enough pulse-to-pulse variation for reliable breathing-response metrics.';
  }
  if (reason === 'low-signal-quality' || reason === 'too-many-artifacts') {
    return 'Signal quality was not stable enough for breathing-response metrics.';
  }
  if (reason === 'protocol-not-supported') {
    return 'This protocol does not include paced breathing-response metrics.';
  }
  return 'More clean detected beats are needed before these metrics can be calculated.';
}

type MetricColor = 'blue' | 'red' | 'green' | 'purple' | 'indigo' | 'cyan' | 'teal' | 'amber' | 'orange';

const colorMap: Record<MetricColor, { bg: string; text: string }> = {
  blue: { bg: 'rgba(59,130,246,0.1)', text: '#60a5fa' },
  red: { bg: 'rgba(239,68,68,0.1)', text: '#f87171' },
  green: { bg: 'rgba(34,197,94,0.1)', text: '#4ade80' },
  purple: { bg: 'rgba(168,85,247,0.1)', text: '#c084fc' },
  indigo: { bg: 'rgba(99,102,241,0.1)', text: '#818cf8' },
  cyan: { bg: 'rgba(6,182,212,0.1)', text: '#22d3ee' },
  teal: { bg: 'rgba(20,184,166,0.1)', text: '#2dd4bf' },
  amber: { bg: 'rgba(245,158,11,0.1)', text: '#fbbf24' },
  orange: { bg: 'rgba(249,115,22,0.1)', text: '#fb923c' },
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
              'data-part': 'value',
            },
            cardProps.value
          ),
          cardProps.unit
            ? h(
                'div',
                {
                  class: 'text-white/40 uppercase tracking-wider',
                  style: { fontSize: '9px', marginTop: '1px' },
                  'data-part': 'unit',
                },
                cardProps.unit
              )
            : null,
          h(
            'div',
            {
              class: 'text-white/50 uppercase tracking-wider font-medium',
              style: { fontSize: '9px', marginTop: '4px' },
              'data-part': 'label',
            },
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
