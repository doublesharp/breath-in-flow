<template>
  <div class="space-y-6">
    <!-- Section A: Standalone HRV Measurement -->
    <div class="space-y-6">
      <h2 class="text-xl font-bold text-white">HRV Measurement</h2>

      <!-- Mode toggle: Guided / Freeform -->
      <div class="flex gap-2">
        <button
          @click="mode = 'guided'"
          :class="[
            'px-4 py-2 rounded-xl font-medium transition-all duration-300',
            mode === 'guided'
              ? 'text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg'
              : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10',
          ]"
        >
          Guided
        </button>
        <button
          @click="mode = 'freeform'"
          :class="[
            'px-4 py-2 rounded-xl font-medium transition-all duration-300',
            mode === 'freeform'
              ? 'text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-lg'
              : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10',
          ]"
        >
          Freeform
        </button>
      </div>

      <!-- Sensor selector (shared by both guided and freeform) -->
      <div v-if="!isMeasuring && !showResults" class="space-y-3" data-testid="sensor-selection">
        <label class="text-sm font-medium text-white/80">Sensor</label>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="s in sensorOptions"
            :key="s.value"
            @click="selectedSensor = s.value"
            :class="[
              'p-3 rounded-xl border text-center transition-all text-sm',
              selectedSensor === s.value
                ? 'border-emerald-500 bg-emerald-500/10 text-white'
                : 'border-white/10 bg-white/5 text-white/60',
            ]"
          >
            {{ s.label }}
          </button>
        </div>
        <p class="text-xs text-white/30">
          {{ selectedSensor === 'camera' ? 'Place fingertip over rear camera lens. Flash will illuminate your finger.' : selectedSensor === 'accelerometer' ? 'Place phone flat on your chest (screen down). Stay very still.' : 'Phone on chest, finger on rear camera. Best accuracy.' }}
        </p>
      </div>

      <!-- Guided protocols (default) -->
      <div v-if="mode === 'guided' && !isMeasuring && !showResults" class="space-y-4">
        <div class="grid gap-3">
          <button
            v-for="p in protocols"
            :key="p.id"
            @click="pendingProtocol = p"
            :class="[
              'flex items-start gap-4 p-4 rounded-2xl text-left transition-all duration-300 border',
              pendingProtocol?.id === p.id
                ? 'bg-emerald-500/10 border-emerald-500/30'
                : 'bg-white/5 hover:bg-white/10 border-white/5 hover:border-white/10',
            ]"
          >
            <span class="text-2xl mt-0.5">{{ p.icon }}</span>
            <div class="flex-1">
              <div class="font-semibold text-white">{{ p.name }}</div>
              <div class="text-sm text-white/50 mt-1">{{ p.description }}</div>
              <div class="text-xs text-white/30 mt-2">{{ formatDuration(p.duration) }}</div>
            </div>
          </button>
        </div>
        <button
          v-if="pendingProtocol"
          @click="startProtocol(pendingProtocol)"
          class="w-full btn-primary py-3 rounded-xl font-semibold"
        >
          Start {{ pendingProtocol.name }}
        </button>
      </div>

      <!-- Freeform (start/stop manually) -->
      <div v-if="mode === 'freeform' && !isMeasuring && !showResults" class="space-y-4">
        <button @click="startFreeform" class="w-full btn-primary py-3 rounded-xl font-semibold">
          Start Measurement
        </button>
      </div>

      <!-- Active measurement view -->
      <div v-if="isMeasuring" class="space-y-4">
        <div class="card-solid !p-4">
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-sm text-white/50">
                {{ selectedProtocol ? selectedProtocol.name : 'Freeform Measurement' }}
              </div>
              <div class="text-2xl font-bold text-white font-mono">
                {{ formatTimer(elapsedSeconds) }}
                <span v-if="selectedProtocol" class="text-white/30 text-lg">
                  / {{ formatTimer(selectedProtocol.duration) }}
                </span>
              </div>
            </div>
            <SignalQualityIndicator
              :quality="sensorQuality"
              :sensor-type="selectedSensor === 'accelerometer' ? 'scg' : 'ppg'"
              :ring-size="48"
            />
          </div>

          <!-- Progress bar for guided -->
          <div v-if="selectedProtocol" class="w-full h-2 rounded-full bg-white/10 overflow-hidden mb-4">
            <div
              class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-1000"
              :style="{ width: `${Math.min(100, (elapsedSeconds / selectedProtocol.duration) * 100)}%` }"
            />
          </div>

          <!-- Sensor placement instructions -->
          <p class="text-xs text-white/40 mb-4">
            <template v-if="selectedSensor === 'camera'">
              Place your fingertip gently over the rear camera lens. Keep still.
            </template>
            <template v-else-if="selectedSensor === 'accelerometer'">
              Place the phone flat on your chest (sternum), screen up. Breathe normally and stay still.
            </template>
            <template v-else>
              Place your fingertip over the camera and the phone on your chest for dual-sensor mode.
            </template>
          </p>

          <!-- HR tachogram -->
          <div v-if="hrDataPoints.length > 0">
            <div class="text-xs text-white/40 mb-1">Heart Rate</div>
            <HrTachogram
              :hr-data="hrDataPoints"
              :duration="selectedProtocol ? selectedProtocol.duration : Math.max(60, elapsedSeconds)"
              :height="100"
            />
          </div>
          <div v-else class="rounded-xl bg-white/5 p-4 text-center text-sm text-white/30">
            Waiting for heart rate data...
          </div>

          <!-- Raw sensor signal chart -->
          <div>
            <div class="text-xs text-white/40 mb-1">Raw Sensor Signal</div>
            <canvas ref="rawSignalCanvas" class="w-full rounded-lg bg-slate-900/50" height="80" />
          </div>
        </div>

        <button @click="stopMeasurement" class="w-full btn-danger py-3 rounded-xl font-semibold">
          Stop Measurement
        </button>

        <!-- Debug toggle -->
        <button @click="showDebug = !showDebug" class="text-xs text-white/20 hover:text-white/40 w-full text-center py-1">
          {{ showDebug ? 'Hide' : 'Show' }} Debug Log
        </button>

        <!-- Debug log panel -->
        <div v-if="showDebug" class="rounded-xl bg-black/40 border border-white/5 p-3 max-h-48 overflow-y-auto font-mono text-[10px] text-white/50 space-y-0.5">
          <div v-if="debugLog.length === 0" class="text-white/20">No log entries yet...</div>
          <div v-for="(line, i) in debugLog" :key="i">{{ line }}</div>
        </div>
      </div>

      <!-- Results view -->
      <div v-if="showResults && currentAnalysis" class="space-y-4">
        <HrvMetricsDashboard :analysis="currentAnalysis" />
        <FrequencySpectrum
          :spectrum="currentAnalysis.frequencyDomain.spectrum"
          :lf-peak="currentAnalysis.frequencyDomain.lfPeak"
          :hf-peak="currentAnalysis.frequencyDomain.hfPeak"
        />
        <PoincarePlot :rr-intervals="currentAnalysis.raw.rrIntervals" />

        <!-- Notes -->
        <div class="card-solid !p-4">
          <label class="text-sm font-medium text-white/80 block mb-2">Notes</label>
          <textarea
            v-model="measurementNotes"
            rows="3"
            class="form-input resize-none w-full"
            placeholder="Add any notes about this measurement..."
          />
        </div>

        <!-- Actions -->
        <div class="flex gap-3">
          <button @click="saveResults" class="flex-1 btn-primary py-3 rounded-xl font-semibold">
            Save &amp; Close
          </button>
          <button @click="discardResults" class="flex-1 btn-secondary py-3 rounded-xl font-semibold">
            Discard
          </button>
        </div>
      </div>
    </div>

    <!-- Section B: Resonance Frequency Assessment -->
    <div class="space-y-4">
      <h2 class="text-xl font-bold text-white">Resonance Frequency</h2>

      <ResonanceAssessment
        v-if="showAssessment"
        :sound-enabled="false"
        :sound-theme="'wood'"
        :tts-enabled="false"
        @cancel="showAssessment = false"
        @complete="onAssessmentComplete"
      />

      <template v-else>
        <!-- Latest assessment summary -->
        <div v-if="latestAssessment" class="rounded-2xl p-4 bg-white/5 border border-white/5 mb-2">
          <div class="text-sm text-white/50">Your resonance frequency</div>
          <div class="text-lg font-bold text-emerald-400">
            {{ latestAssessment.selectedRate.toFixed(1) }} BPM
          </div>
          <div class="text-xs text-white/30 mt-1">
            Assessed {{ formatDate(latestAssessment.completedAt) }}
          </div>
        </div>

        <button
          @click="showAssessment = true"
          class="w-full btn-secondary py-3 rounded-xl font-semibold flex items-center justify-center gap-2"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Find My Resonance Frequency
        </button>
      </template>
    </div>

    <!-- Section C: Recent Results -->
    <div class="space-y-3">
      <h2 class="text-xl font-bold text-white">Recent Results</h2>

      <div v-if="recentMeasurements.length === 0" class="text-sm text-white/30 py-4 text-center">
        No measurements yet. Start a measurement above to see results here.
      </div>

      <div
        v-for="m in recentMeasurements"
        :key="m.id"
        class="flex justify-between items-center p-3 rounded-xl bg-white/5"
      >
        <div>
          <div class="text-sm font-medium text-white">{{ formatType(m.type) }}</div>
          <div class="text-xs text-white/50">{{ formatDate(m.completedAt) }}</div>
        </div>
        <div class="text-right">
          <div class="text-sm text-white">HR {{ m.analysis.timeDomain.meanHR.toFixed(0) }} BPM</div>
          <div class="text-xs text-white/50">RMSSD {{ m.analysis.timeDomain.rmssd.toFixed(1) }}ms</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import HrTachogram from './hrv/HrTachogram.vue';
import SignalQualityIndicator from './hrv/SignalQualityIndicator.vue';
import HrvMetricsDashboard from './hrv/HrvMetricsDashboard.vue';
import FrequencySpectrum from './hrv/FrequencySpectrum.vue';
import PoincarePlot from './hrv/PoincarePlot.vue';
import ResonanceAssessment from './ResonanceAssessment.vue';
import { ppgService } from '../services/ppgService';
import { scgService } from '../services/scgService';
import { sensorFusionService } from '../services/sensorFusion';
import { analyzeHRV } from '@breath-in-flow/shared';
import { useHrvStorage } from '../composables/useHrvStorage';
import type { IBISample, HRVAnalysis, AssessmentResult } from '@breath-in-flow/shared';

interface Protocol {
  id: string;
  name: string;
  duration: number;
  description: string;
  icon: string;
}

const protocols: Protocol[] = [
  { id: 'quick-check', name: 'Quick Check', duration: 120, description: 'Basic HRV snapshot — RMSSD, SDNN, heart rate', icon: '\u26A1' },
  { id: 'full-analysis', name: 'Full Analysis', duration: 300, description: 'Comprehensive HRV — all metrics, frequency analysis, Poincar\u00E9', icon: '\uD83D\uDD2C' },
  { id: 'morning-readiness', name: 'Morning Readiness', duration: 180, description: 'Daily baseline check — track your readiness over time', icon: '\u2600\uFE0F' },
];

const sensorOptions = [
  { value: 'camera' as const, label: 'Camera' },
  { value: 'accelerometer' as const, label: 'Accelerometer' },
  { value: 'dual' as const, label: 'Dual' },
];

const hrvStorage = useHrvStorage();

// State
const mode = ref<'guided' | 'freeform'>('guided');
const isMeasuring = ref(false);
const showResults = ref(false);
const showAssessment = ref(false);
const currentAnalysis = ref<HRVAnalysis | null>(null);
const sensorQuality = ref(0);
const elapsedSeconds = ref(0);
const selectedSensor = ref<'camera' | 'accelerometer' | 'dual'>('accelerometer');
const selectedProtocol = ref<Protocol | null>(null);
const pendingProtocol = ref<Protocol | null>(null);
const collectedIBIs = ref<IBISample[]>([]);
const measurementNotes = ref('');
const measurementStartTime = ref<Date>(new Date());
const recentMeasurements = ref<Array<{
  id: string;
  type: string;
  completedAt: Date;
  analysis: HRVAnalysis;
}>>([]);
const latestAssessment = ref<AssessmentResult | null>(null);
const hrDataPoints = ref<Array<{ time: number; hr: number; quality: number }>>([]);
const rawSignalData = ref<Array<{ time: number; value: number }>>([]);
const debugLog = ref<string[]>([]);
const showDebug = ref(false);

const RAW_SIGNAL_MAX_POINTS = 500; // ~5-8 seconds at 60-100Hz
const DEBUG_LOG_MAX = 100;

function addDebugLine(msg: string) {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false, fractionalSecondDigits: 1 });
  debugLog.value.push(`[${ts}] ${msg}`);
  if (debugLog.value.length > DEBUG_LOG_MAX) debugLog.value.shift();
}

let timerInterval: ReturnType<typeof setInterval> | null = null;

// Sensor management
async function startSensor() {
  if (selectedSensor.value === 'dual') {
    sensorFusionService.reset();
    sensorFusionService.setCallbacks({
      onFusedIBI: (sample) => {
        collectedIBIs.value.push(sample);
        addHrDataPoint(sample);
      },
      onQualityChange: (q: number) => { sensorQuality.value = q; },
    });

    await ppgService.start({
      onIBI: (sample) => sensorFusionService.addPPGSample(sample),
      onQualityChange: () => {},
    });
    scgService.setCallbacks({
      onIBI: (sample) => sensorFusionService.addSCGSample(sample),
      onQualityChange: () => {},
    });
    await scgService.start();
  } else {
    const callbacks = {
      onIBI: (sample: IBISample) => {
        collectedIBIs.value.push(sample);
        addHrDataPoint(sample);
        addDebugLine(`IBI: ${sample.interval.toFixed(0)}ms (${(60000/sample.interval).toFixed(0)} BPM) q=${sample.quality.toFixed(2)}`);
      },
      onRawSignal: (value: number, timestamp: number) => {
        rawSignalData.value.push({ time: timestamp, value });
        if (rawSignalData.value.length > RAW_SIGNAL_MAX_POINTS) {
          rawSignalData.value = rawSignalData.value.slice(-RAW_SIGNAL_MAX_POINTS);
        }
      },
      onQualityChange: (q: number) => {
        sensorQuality.value = q;
        addDebugLine(`Quality: ${(q * 100).toFixed(0)}%`);
      },
      onError: (err: Error) => {
        addDebugLine(`ERROR: ${err.message}`);
      },
    };

    if (selectedSensor.value === 'camera') {
      addDebugLine('Starting camera PPG...');
      await ppgService.start(callbacks);
      addDebugLine(`Camera status: ${ppgService.getStatus()}`);
    } else {
      addDebugLine('Starting accelerometer SCG...');
      scgService.setCallbacks(callbacks);
      await scgService.start();
      addDebugLine(`SCG status: ${scgService.getStatus()}`);
    }
  }
}

function stopSensor() {
  if (selectedSensor.value === 'dual') {
    ppgService.stop();
    scgService.stop();
    sensorFusionService.reset();
  } else if (selectedSensor.value === 'camera') {
    ppgService.stop();
  } else {
    scgService.stop();
  }
}

function addHrDataPoint(sample: IBISample) {
  const hr = 60000 / sample.interval;
  hrDataPoints.value.push({
    time: elapsedSeconds.value,
    hr,
    quality: sample.quality,
  });
}

// Raw signal canvas
const rawSignalCanvas = ref<HTMLCanvasElement | null>(null);
let rawSignalAnimId: number | null = null;

function drawRawSignal() {
  const canvas = rawSignalCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const data = rawSignalData.value;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = w * (window.devicePixelRatio || 1);
  canvas.height = h * (window.devicePixelRatio || 1);
  ctx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  ctx.clearRect(0, 0, w, h);

  if (data.length < 2) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for sensor data...', w / 2, h / 2);
    return;
  }

  // Auto-scale Y
  let minV = Infinity, maxV = -Infinity;
  for (const d of data) {
    if (d.value < minV) minV = d.value;
    if (d.value > maxV) maxV = d.value;
  }
  const range = maxV - minV || 1;
  const pad = range * 0.1;

  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.8)'; // emerald
  ctx.lineWidth = 1.5;
  for (let i = 0; i < data.length; i++) {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((data[i].value - minV + pad) / (range + 2 * pad)) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Y-axis labels
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(maxV.toFixed(2), 2, 10);
  ctx.fillText(minV.toFixed(2), 2, h - 2);
  ctx.textAlign = 'right';
  ctx.fillText(`${data.length} pts`, w - 2, 10);
}

// Redraw raw signal at ~15fps when measuring
watch(isMeasuring, (measuring) => {
  if (measuring) {
    const drawLoop = () => {
      drawRawSignal();
      if (isMeasuring.value) {
        rawSignalAnimId = requestAnimationFrame(drawLoop);
      }
    };
    // Throttle to ~15fps
    const throttledLoop = () => {
      drawRawSignal();
      if (isMeasuring.value) {
        rawSignalAnimId = window.setTimeout(() => requestAnimationFrame(throttledLoop), 66) as unknown as number;
      }
    };
    throttledLoop();
  } else {
    if (rawSignalAnimId) {
      cancelAnimationFrame(rawSignalAnimId);
      rawSignalAnimId = null;
    }
  }
});

// Measurement control
async function startProtocol(protocol: Protocol) {
  selectedProtocol.value = protocol;
  collectedIBIs.value = [];
  hrDataPoints.value = [];
  isMeasuring.value = true;
  showResults.value = false;
  elapsedSeconds.value = 0;
  sensorQuality.value = 0;
  measurementNotes.value = '';
  measurementStartTime.value = new Date();

  await startSensor();

  timerInterval = setInterval(() => {
    elapsedSeconds.value++;
    if (selectedProtocol.value && elapsedSeconds.value >= selectedProtocol.value.duration) {
      stopMeasurement();
    }
  }, 1000);
}

function startFreeform() {
  selectedProtocol.value = null;
  collectedIBIs.value = [];
  hrDataPoints.value = [];
  isMeasuring.value = true;
  showResults.value = false;
  elapsedSeconds.value = 0;
  sensorQuality.value = 0;
  measurementNotes.value = '';
  measurementStartTime.value = new Date();

  startSensor();

  timerInterval = setInterval(() => {
    elapsedSeconds.value++;
  }, 1000);
}

function stopMeasurement() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  stopSensor();
  isMeasuring.value = false;

  if (collectedIBIs.value.length >= 10) {
    currentAnalysis.value = analyzeHRV(collectedIBIs.value);
    showResults.value = true;
  }
}

async function saveResults() {
  if (!currentAnalysis.value) return;
  await hrvStorage.saveMeasurement({
    id: crypto.randomUUID(),
    type: (selectedProtocol.value?.id as 'quick-check' | 'full-analysis' | 'morning-readiness') ?? 'freeform',
    startedAt: measurementStartTime.value,
    completedAt: new Date(),
    durationSeconds: elapsedSeconds.value,
    sensorMode: selectedSensor.value,
    analysis: currentAnalysis.value,
    notes: measurementNotes.value || undefined,
  });
  showResults.value = false;
  currentAnalysis.value = null;
  await loadRecentResults();
}

function discardResults() {
  showResults.value = false;
  currentAnalysis.value = null;
}

function onAssessmentComplete() {
  showAssessment.value = false;
  loadLatestAssessment();
}

// Data loading
async function loadRecentResults() {
  try {
    const results = await hrvStorage.getMeasurements({ limit: 5 });
    recentMeasurements.value = results;
  } catch {
    // IndexedDB may not be available in tests
  }
}

async function loadLatestAssessment() {
  try {
    latestAssessment.value = await hrvStorage.getLatestAssessment();
  } catch {
    // IndexedDB may not be available in tests
  }
}

// Formatting helpers
function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  return m === 1 ? '1 minute' : `${m} minutes`;
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatDate(date: Date): string {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatType(type: string): string {
  const names: Record<string, string> = {
    'quick-check': 'Quick Check',
    'full-analysis': 'Full Analysis',
    'morning-readiness': 'Morning Readiness',
    'freeform': 'Freeform',
    'assessment-trial': 'Assessment Trial',
  };
  return names[type] ?? type;
}

// Lifecycle
onMounted(() => {
  loadRecentResults();
  loadLatestAssessment();
});

onUnmounted(() => {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  if (isMeasuring.value) {
    stopSensor();
  }
});
</script>

<style scoped>
@reference "tailwindcss";

.btn-primary {
  @apply bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-lg hover:shadow-xl transition-all;
}

.btn-secondary {
  @apply bg-white/10 text-white hover:bg-white/15 transition-all;
}

.btn-danger {
  @apply bg-red-600/80 text-white hover:bg-red-600 transition-all;
}

.card-solid {
  @apply rounded-2xl p-6 border border-white/5;
  background: linear-gradient(135deg, rgba(70, 60, 52, 0.4) 0%, rgba(47, 40, 34, 0.6) 100%);
}
</style>
