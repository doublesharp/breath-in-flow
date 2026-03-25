<template>
  <div class="space-y-6">
    <!-- Section A: Standalone HRV Measurement -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h2 class="text-lg font-bold text-white">HRV Measurement</h2>
        <div class="flex gap-1">
          <button
            @click="mode = 'guided'"
            :class="['px-3 py-1 rounded-lg text-xs font-medium transition-all', mode === 'guided' ? 'text-white bg-emerald-600' : 'text-white/40 bg-white/5']"
          >Guided</button>
          <button
            @click="mode = 'freeform'"
            :class="['px-3 py-1 rounded-lg text-xs font-medium transition-all', mode === 'freeform' ? 'text-white bg-emerald-600' : 'text-white/40 bg-white/5']"
          >Freeform</button>
        </div>
      </div>

      <!-- Sensor selector — compact row -->
      <div class="flex gap-2" data-testid="sensor-selection">
        <button
          v-for="s in sensorOptions"
          :key="s.value"
          @click="selectedSensor = s.value"
          :class="['flex-1 py-2 rounded-lg border text-center text-xs font-medium transition-all',
            selectedSensor === s.value ? 'border-emerald-500 bg-emerald-500/10 text-white' : 'border-white/10 bg-white/5 text-white/50']"
        >{{ s.label }}</button>
      </div>

      <!-- Permission error -->
      <div v-if="permissionError" class="rounded-lg bg-red-500/10 border border-red-500/20 p-2 text-xs text-red-400">
        {{ permissionError }}
      </div>

      <!-- Guided protocols — compact single-line cards -->
      <div v-if="mode === 'guided'" class="space-y-2">
        <button
          v-for="p in protocols"
          :key="p.id"
          @click="showPrepScreen(p)"
          class="flex items-center gap-3 w-full p-3 rounded-xl text-left transition-all bg-white/5 hover:bg-white/10 border border-white/5 hover:border-emerald-500/30 active:scale-[0.98]"
        >
          <span class="text-xl shrink-0">{{ p.icon }}</span>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-white text-sm">{{ p.name }}</div>
            <div class="text-xs text-white/40 truncate">{{ p.description }}</div>
          </div>
          <span class="text-xs text-white/30 shrink-0">{{ formatDuration(p.duration) }}</span>
        </button>
      </div>

      <!-- Freeform — start button -->
      <div v-if="mode === 'freeform'">
        <button @click="showPrepScreen(null)" class="w-full btn-primary py-3 rounded-xl font-semibold">
          Start Measurement
        </button>
      </div>
    </div>

    <!-- ═══ PREP SCREEN MODAL — instructions before starting ═══ -->
    <Teleport to="body">
      <div v-if="showPrep" class="fixed inset-0 z-50 bg-slate-950 flex flex-col safe-area-top safe-area-bottom">
        <div class="flex-1 flex flex-col justify-center items-center px-6 text-center">
          <!-- Protocol info -->
          <div class="text-4xl mb-4">{{ prepProtocol?.icon || '📊' }}</div>
          <h2 class="text-xl font-bold text-white mb-1">{{ prepProtocol?.name || 'Freeform Measurement' }}</h2>
          <p class="text-sm text-white/50 mb-6">{{ prepProtocol ? formatDuration(prepProtocol.duration) : 'Manual stop' }}</p>

          <!-- Sensor-specific instructions -->
          <div class="rounded-2xl bg-white/5 border border-white/10 p-5 mb-6 max-w-sm">
            <h3 class="text-sm font-semibold text-emerald-400 mb-3">How to get a good reading</h3>
            <div v-if="selectedSensor === 'camera'" class="space-y-2 text-sm text-white/70 text-left">
              <p>1. Place your <strong class="text-white">fingertip</strong> gently over the rear camera lens</p>
              <p>2. The flash will turn on to illuminate your finger</p>
              <p>3. Press firmly but don't squeeze — stay relaxed</p>
              <p>4. Keep completely still during the measurement</p>
            </div>
            <div v-else-if="selectedSensor === 'accelerometer'" class="space-y-2 text-sm text-white/70 text-left">
              <p>1. Lie down or recline comfortably</p>
              <p>2. Place the phone <strong class="text-white">flat on your chest</strong> (sternum area)</p>
              <p>3. Screen can face up — just keep the phone stable</p>
              <p>4. Breathe normally and stay as still as possible</p>
            </div>
            <div v-else class="space-y-2 text-sm text-white/70 text-left">
              <p>1. Place phone <strong class="text-white">screen-down on your chest</strong></p>
              <p>2. Cover the rear camera with your <strong class="text-white">fingertip</strong></p>
              <p>3. The flash will illuminate your finger from below</p>
              <p>4. Stay still — follow audio cues for breathing</p>
            </div>
          </div>

          <!-- Camera options (only when camera or dual sensor selected) -->
          <div v-if="selectedSensor === 'camera' || selectedSensor === 'dual'" class="w-full max-w-sm space-y-3 mb-6">
            <!-- Camera picker -->
            <div v-if="availableCameras.length > 1" class="text-left">
              <label class="text-xs font-medium text-white/50 block mb-1">Camera</label>
              <select
                v-model="selectedCameraId"
                class="w-full py-2 px-3 rounded-lg bg-white/5 border border-white/10 text-sm text-white"
              >
                <option value="">Default (rear)</option>
                <option v-for="cam in availableCameras" :key="cam.deviceId" :value="cam.deviceId">
                  {{ cam.label }}
                </option>
              </select>
            </div>

            <!-- Torch toggle -->
            <div class="flex items-center justify-between">
              <span class="text-sm text-white/60">Flash / Torch</span>
              <button
                @click="useTorch = !useTorch"
                :class="['relative w-11 h-6 rounded-full transition-colors', useTorch ? 'bg-emerald-500' : 'bg-white/10']"
              >
                <span :class="['absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform', useTorch ? 'translate-x-5' : '']" />
              </button>
            </div>
          </div>

          <!-- Permission error -->
          <div v-if="permissionError" class="rounded-xl bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-400 mb-4 max-w-sm">
            {{ permissionError }}
          </div>
        </div>

        <!-- Bottom buttons -->
        <div class="px-6 pb-6 space-y-3">
          <button @click="confirmStart" class="w-full btn-primary py-4 rounded-2xl font-bold text-lg">
            Start
          </button>
          <button @click="showPrep = false; prepProtocol = null" class="w-full py-3 rounded-xl font-medium text-white/40 hover:text-white/60">
            Cancel
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ═══ FULLSCREEN MEASUREMENT MODAL ═══ -->
    <Teleport to="body">
      <div v-if="isMeasuring || showResults" class="fixed inset-0 z-50 bg-slate-950 overflow-y-auto safe-area-top safe-area-bottom">
        <!-- Measuring view -->
        <div v-if="isMeasuring" class="flex flex-col h-full p-4">
          <!-- Header -->
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-xs text-white/50">{{ selectedProtocol ? selectedProtocol.name : 'Freeform' }}</div>
              <div class="text-2xl font-bold text-white font-mono">
                {{ formatTimer(elapsedSeconds) }}
                <span v-if="selectedProtocol" class="text-white/30 text-base">/ {{ formatTimer(selectedProtocol.duration) }}</span>
              </div>
            </div>
            <SignalQualityIndicator
              :quality="sensorQuality"
              :sensor-type="selectedSensor === 'accelerometer' ? 'scg' : 'ppg'"
              :ring-size="48"
            />
          </div>

          <!-- Progress bar -->
          <div v-if="selectedProtocol" class="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mb-3">
            <div class="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-1000"
              :style="{ width: `${Math.min(100, (elapsedSeconds / selectedProtocol.duration) * 100)}%` }" />
          </div>

          <!-- Sensor instructions -->
          <p class="text-xs text-white/40 mb-3">
            {{ selectedSensor === 'camera' ? 'Finger on rear camera lens. Keep still.' : selectedSensor === 'accelerometer' ? 'Phone flat on chest. Breathe normally.' : 'Phone on chest, finger on camera.' }}
          </p>

          <!-- Charts area — fills remaining space -->
          <div class="flex-1 space-y-3 min-h-0 overflow-y-auto">
            <!-- HR tachogram -->
            <div v-if="hrDataPoints.length > 0">
              <div class="text-xs text-white/40 mb-1">Heart Rate</div>
              <HrTachogram :hr-data="hrDataPoints" :duration="Math.min(60, Math.max(15, elapsedSeconds))" :height="100" />
            </div>
            <div v-else class="rounded-xl bg-white/5 p-4 text-center text-sm text-white/30">
              Waiting for heart rate data...
            </div>

            <!-- Raw sensor signal -->
            <div>
              <div class="text-xs text-white/40 mb-1">Raw Sensor Signal</div>
              <canvas ref="rawSignalCanvas" class="w-full rounded-lg bg-slate-900/50" height="80" />
            </div>

            <!-- Debug toggle + log -->
            <button @click="showDebug = !showDebug" class="text-[10px] text-white/15 hover:text-white/30 w-full text-center">
              {{ showDebug ? 'Hide' : 'Show' }} Debug
            </button>
            <div v-if="showDebug" class="rounded-lg bg-black/50 border border-white/5 p-2 max-h-32 overflow-y-auto font-mono text-[9px] text-white/40 space-y-px">
              <div v-for="(line, i) in debugLog" :key="i">{{ line }}</div>
            </div>
          </div>

          <!-- Stop button — pinned to bottom -->
          <button @click="stopMeasurement" class="mt-3 w-full btn-danger py-3 rounded-xl font-semibold shrink-0">
            Stop Measurement
          </button>
        </div>

        <!-- Results view -->
        <div v-if="showResults && currentAnalysis" class="p-4 space-y-4">
          <h2 class="text-lg font-bold text-white">Results</h2>
          <HrvMetricsDashboard :analysis="currentAnalysis" />
          <FrequencySpectrum
            :spectrum="currentAnalysis.frequencyDomain.spectrum"
            :lf-peak="currentAnalysis.frequencyDomain.lfPeak"
            :hf-peak="currentAnalysis.frequencyDomain.hfPeak"
          />
          <PoincarePlot :rr-intervals="currentAnalysis.raw.rrIntervals" />

          <div class="card-solid !p-4">
            <label class="text-sm font-medium text-white/80 block mb-2">Notes</label>
            <textarea v-model="measurementNotes" rows="2" class="form-input resize-none w-full" placeholder="Add notes..." />
          </div>

          <div class="flex gap-3">
            <button @click="saveResults" class="flex-1 btn-primary py-3 rounded-xl font-semibold">Save</button>
            <button @click="discardResults" class="flex-1 btn-secondary py-3 rounded-xl font-semibold">Discard</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Section B: Resonance Frequency Assessment -->
    <div class="space-y-3">
      <h2 class="text-lg font-bold text-white">Resonance Frequency</h2>

      <!-- Latest assessment summary -->
      <div v-if="latestAssessment" class="rounded-xl p-3 bg-white/5 border border-white/5">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs text-white/50">Your resonance frequency</div>
            <div class="text-lg font-bold text-emerald-400">{{ latestAssessment.selectedRate.toFixed(1) }} BPM</div>
          </div>
          <div class="text-xs text-white/30">{{ formatDate(latestAssessment.completedAt) }}</div>
        </div>
      </div>

      <button
        @click="showAssessment = true"
        class="flex items-center gap-3 w-full p-3 rounded-xl text-left transition-all bg-white/5 hover:bg-white/10 border border-white/5 hover:border-emerald-500/30 active:scale-[0.98]"
      >
        <span class="text-xl">🎯</span>
        <div class="flex-1">
          <div class="font-semibold text-white text-sm">Find My Resonance Frequency</div>
          <div class="text-xs text-white/40">5 breathing trials to find your optimal rate</div>
        </div>
        <span class="text-xs text-white/30">~25 min</span>
      </button>
    </div>

    <!-- ═══ FULLSCREEN RF ASSESSMENT MODAL ═══ -->
    <Teleport to="body">
      <div v-if="showAssessment" class="fixed inset-0 z-50 bg-slate-950 overflow-y-auto safe-area-top safe-area-bottom">
        <ResonanceAssessment
          :sound-enabled="true"
          :sound-theme="'wood'"
          :tts-enabled="true"
          @cancel="showAssessment = false"
          @complete="onAssessmentComplete"
        />
      </div>
    </Teleport>

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
import { ppgService, listCameras } from '../services/ppgService';
import { soundService } from '../services/soundService';
import { scgService } from '../services/scgService';
import { sensorFusionService } from '../services/sensorFusion';
import { requestSensorPermissions, getPermissionDeniedMessage } from '../services/permissionService';
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
  { value: 'accelerometer' as const, label: 'Chest (recommended)' },
  { value: 'camera' as const, label: 'Camera' },
  { value: 'dual' as const, label: 'Both' },
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
const showPrep = ref(false);
const prepProtocol = ref<Protocol | null>(null);
const availableCameras = ref<{ deviceId: string; label: string }[]>([]);
const selectedCameraId = ref('');
const useTorch = ref(true);
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

const RAW_SIGNAL_MAX_POINTS = 200; // ~6-7 seconds at 30fps
const DEBUG_LOG_MAX = 100;

function addDebugLine(msg: string) {
  const now = new Date();
  const ts = now.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(now.getMilliseconds()).padStart(3, '0').slice(0, 1);
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
      callbacks: {
        onIBI: (sample) => sensorFusionService.addPPGSample(sample),
        onQualityChange: () => {},
      },
      cameraDeviceId: selectedCameraId.value || undefined,
      torchEnabled: useTorch.value,
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
          rawSignalData.value.splice(0, rawSignalData.value.length - RAW_SIGNAL_MAX_POINTS);
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
      addDebugLine(`Starting camera PPG (torch=${useTorch.value}, camera=${selectedCameraId.value || 'default'})...`);
      await ppgService.start({
        callbacks,
        cameraDeviceId: selectedCameraId.value || undefined,
        torchEnabled: useTorch.value,
      });
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

  // Show the most recent 5 seconds based on timestamps (works at any sample rate)
  const VISIBLE_SECONDS = 5;
  const latestTime = data[data.length - 1].time;
  const cutoffTime = latestTime - VISIBLE_SECONDS * 1000;
  let startIdx = data.length - 1;
  while (startIdx > 0 && data[startIdx - 1].time >= cutoffTime) startIdx--;
  const visible = data.slice(startIdx);

  // Auto-scale Y using percentiles to ignore outlier spikes
  const sorted = visible.map(d => d.value).sort((a, b) => a - b);
  const p2 = sorted[Math.floor(sorted.length * 0.05)] ?? 0;
  const p98 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const minV = p2;
  const maxV = p98;
  const range = maxV - minV || 0.01;
  const pad = range * 0.2;

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, 'rgba(52, 211, 153, 0.03)');
  bgGrad.addColorStop(1, 'rgba(52, 211, 153, 0)');

  // Draw filled area under curve
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < visible.length; i++) {
    const x = (i / (visible.length - 1)) * w;
    const clamped = Math.max(minV - pad, Math.min(maxV + pad, visible[i].value));
    const y = h - ((clamped - minV + pad) / (range + 2 * pad)) * h;
    ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(52, 211, 153, 0.9)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < visible.length; i++) {
    const x = (i / (visible.length - 1)) * w;
    const clamped = Math.max(minV - pad, Math.min(maxV + pad, visible[i].value));
    const y = h - ((clamped - minV + pad) / (range + 2 * pad)) * h;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Zero line (center reference)
  const zeroY = h - ((0 - minV + pad) / (range + 2 * pad)) * h;
  if (zeroY > 0 && zeroY < h) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 0.5;
    ctx.setLineDash([4, 4]);
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Labels
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(maxV.toFixed(2), 2, 10);
  ctx.fillText(minV.toFixed(2), 2, h - 2);

  // Latest value + points count
  const lastVal = visible[visible.length - 1].value;
  ctx.textAlign = 'right';
  ctx.fillText(`${lastVal.toFixed(3)}`, w - 2, h - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillText(`${data.length}`, w - 2, 10);
}

// Redraw raw signal at ~15fps when measuring
watch(isMeasuring, (measuring) => {
  if (measuring) {
    let lastDraw = 0;
    const drawLoop = (time: number) => {
      if (!isMeasuring.value) return;
      // Draw at ~15fps
      if (time - lastDraw > 66) {
        drawRawSignal();
        lastDraw = time;
      }
      rawSignalAnimId = requestAnimationFrame(drawLoop);
    };
    rawSignalAnimId = requestAnimationFrame(drawLoop);
  } else {
    if (rawSignalAnimId) {
      cancelAnimationFrame(rawSignalAnimId);
      rawSignalAnimId = null;
    }
  }
});

// Measurement control
const permissionError = ref<string | null>(null);

async function showPrepScreen(protocol: Protocol | null) {
  prepProtocol.value = protocol;
  permissionError.value = null;
  showPrep.value = true;

  // Load available cameras when camera sensor is selected
  if (selectedSensor.value === 'camera' || selectedSensor.value === 'dual') {
    availableCameras.value = await listCameras();
  }
}

async function confirmStart() {
  if (!(await checkPermissions())) return;
  showPrep.value = false;

  if (prepProtocol.value) {
    await startProtocol(prepProtocol.value);
  } else {
    await startFreeform();
  }
  prepProtocol.value = null;
}

async function checkPermissions(): Promise<boolean> {
  permissionError.value = null;
  addDebugLine(`Requesting permissions for ${selectedSensor.value} mode...`);

  const perms = await requestSensorPermissions(selectedSensor.value);
  addDebugLine(`Permissions: camera=${perms.camera} motion=${perms.motion}`);

  const msg = getPermissionDeniedMessage(perms);
  if (msg) {
    permissionError.value = msg;
    addDebugLine(`Permission denied: ${msg}`);
    return false;
  }
  return true;
}

async function startProtocol(protocol: Protocol) {
  selectedProtocol.value = protocol;
  collectedIBIs.value = [];
  hrDataPoints.value = [];
  rawSignalData.value = [];
  debugLog.value = [];
  isMeasuring.value = true;
  showResults.value = false;
  elapsedSeconds.value = 0;
  sensorQuality.value = 0;
  measurementNotes.value = '';
  measurementStartTime.value = new Date();

  addDebugLine(`Starting ${protocol.name} with ${selectedSensor.value} sensor`);
  await startSensor();

  timerInterval = setInterval(() => {
    elapsedSeconds.value++;
    if (selectedProtocol.value && elapsedSeconds.value >= selectedProtocol.value.duration) {
      stopMeasurement();
    }
  }, 1000);
}

async function startFreeform() {
  if (!(await checkPermissions())) return;

  selectedProtocol.value = null;
  collectedIBIs.value = [];
  hrDataPoints.value = [];
  rawSignalData.value = [];
  debugLog.value = [];
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

  // Trim first 5 seconds and last 3 seconds of IBI data.
  // Start: sensor settling, finger placement, phone positioning causes noise.
  // End: user movement to press the Stop button introduces artifacts.
  // Works for both camera PPG and accelerometer SCG.
  let ibis = collectedIBIs.value;
  if (ibis.length > 0) {
    const startTime = ibis[0].timestamp;
    const endTime = ibis[ibis.length - 1].timestamp;
    const trimStartMs = 5000; // discard first 5 seconds
    const trimEndMs = 3000;   // discard last 3 seconds
    ibis = ibis.filter(s =>
      s.timestamp >= startTime + trimStartMs &&
      s.timestamp <= endTime - trimEndMs
    );
    addDebugLine(`Trimmed IBIs: ${collectedIBIs.value.length} → ${ibis.length} (removed ${trimStartMs/1000}s start, ${trimEndMs/1000}s end)`);
  }

  if (ibis.length >= 10) {
    currentAnalysis.value = analyzeHRV(ibis);
    showResults.value = true;
    soundService.playCompletionChime();
  } else {
    addDebugLine(`Not enough IBIs after trimming: ${ibis.length} (need >= 10)`);
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
