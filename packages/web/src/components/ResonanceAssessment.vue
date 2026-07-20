<template>
  <div class="min-h-screen" style="background: linear-gradient(135deg, #1f1a15 0%, #2a241d 40%, #1f1a15 100%)">
    <div class="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">

      <!-- ======================== INTRO PHASE ======================== -->
      <template v-if="phase === 'INTRO'">
        <div class="card-solid animate-scale-in">
          <h1 class="text-2xl sm:text-3xl font-bold text-white mb-4">Resonance Frequency Assessment</h1>

          <!-- Safety Notice -->
          <div class="p-4 rounded-2xl mb-6" style="background: linear-gradient(135deg, rgba(194, 106, 79, 0.15) 0%, rgba(194, 106, 79, 0.05) 100%); border: 1px solid rgba(194, 106, 79, 0.25);">
            <p class="text-sm text-slate-300 leading-relaxed">
              Breathe through your nose. Keep breathing comfortable and shallow — do not breathe deeply.
              If you feel faint, dizzy, or your heart beats too hard, take shallower, smoother breaths.
            </p>
          </div>

          <!-- Protocol Summary -->
          <div class="mb-6">
            <h3 class="font-semibold text-slate-200 mb-2">Protocol</h3>
            <p class="text-sm text-slate-400 leading-relaxed">
              5 breathing trials from 6.5 to 4.5 BPM, approximately 2 minutes each, with 2-minute rest periods between trials.
            </p>
          </div>

          <!-- Warmup Configuration -->
          <div class="mb-6 space-y-4">
            <h3 class="font-semibold text-slate-200">Warmup Settings</h3>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Warmup Duration</label>
                <select v-model.number="assessmentConfig.warmupDurationSeconds" class="form-select">
                  <option :value="60">1 min</option>
                  <option :value="120">2 min</option>
                  <option :value="180">3 min</option>
                </select>
              </div>

              <div>
                <label class="form-label">Warmup Rate</label>
                <select v-model.number="assessmentConfig.warmupRate" class="form-select">
                  <option :value="5.5">5.5 BPM</option>
                  <option :value="6.0">6.0 BPM</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Sensor Selection -->
          <div class="mb-6 space-y-3" data-testid="sensor-selection">
            <label class="text-sm font-medium text-white/80">Heart Rate Measurement</label>
            <div class="grid grid-cols-1 gap-2">
              <button
                v-for="mode in sensorModes" :key="mode.value"
                @click="selectedSensorMode = mode.value"
                :class="['p-3 rounded-lg border text-left transition-all',
                  selectedSensorMode === mode.value
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-white/10 bg-white/5']"
              >
                <div class="font-medium text-white">{{ mode.label }}</div>
                <div class="text-xs text-white/50 mt-1">{{ mode.description }}</div>
              </button>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-white/10">
            <button data-testid="cancel-btn" @click="requestCancel" class="btn-secondary">
              Back
            </button>
            <button data-testid="start-btn" @click="startAssessment" class="btn-success btn-action flex-1">
              Start Assessment
            </button>
          </div>
        </div>
      </template>

      <!-- ======================== WARMUP / TRIAL_BREATHING PHASES ======================== -->
      <template v-if="phase === 'WARMUP' || phase === 'TRIAL_BREATHING'">
        <div class="card-solid animate-scale-in">
          <!-- Phase Header -->
          <h2 class="text-xl sm:text-2xl font-bold text-white text-center mb-4">
            {{ phaseHeaderText }}
          </h2>
          <div
            v-if="sensorStatusMessage && phase === 'TRIAL_BREATHING'"
            class="mb-4 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 text-center text-sm text-amber-200"
            role="status"
          >
            {{ sensorStatusMessage }}
          </div>

          <!-- Sensor-active trial view (replaces BreathingVisualizer) -->
          <div v-if="selectedSensorMode !== 'none' && phase === 'TRIAL_BREATHING'" class="flex flex-col items-center gap-6 py-8">
            <SignalQualityIndicator :quality="sensorQuality" :sensor-type="selectedSensorMode === 'camera' ? 'ppg' : 'scg'" />
            <div class="text-sm text-white/60 text-center">
              {{ sensorInstructions }}
            </div>
            <div class="text-sm text-white/40">Follow the audio breathing cues</div>
            <div class="text-2xl font-mono text-white">{{ formatTime(timer.currentTime.value) }}</div>
          </div>

          <!-- Breathing Visualizer (default / warmup / no sensor) -->
          <div v-else data-testid="breathing-visualizer">
            <BreathingVisualizer
              :phase="timer.phase.value"
              :current-time="timer.currentTime.value"
              :total-time="timer.totalPhaseTime.value"
              :scale="timer.breathingScale.value"
              :is-running="timer.isRunning.value"
              :config="timerConfig"
            />
          </div>

          <!-- Breathing Pattern Display -->
          <div class="mt-4 text-center">
            <div class="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50 rounded-xl text-slate-300 text-sm sm:text-base">
              <span class="text-emerald-400 font-semibold">{{ timerConfig.inhaleTime }}s</span>
              <span class="text-slate-500">&rarr;</span>
              <span class="text-blue-400 font-semibold">{{ timerConfig.exhaleTime }}s</span>
              <span class="text-slate-500 ml-2">&times;</span>
              <span class="text-white font-semibold">{{ timerConfig.repetitions }} reps</span>
            </div>
          </div>

          <!-- Controls -->
          <div class="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <button @click="togglePause" :class="isPaused ? 'btn-primary' : 'btn-warning'" class="btn-action">
              {{ isPaused ? 'Resume' : 'Pause' }}
            </button>
            <button data-testid="cancel-btn" @click="requestCancel" class="btn-danger">
              Cancel
            </button>
          </div>
        </div>
      </template>

      <!-- ======================== TRIAL_REST PHASE ======================== -->
      <template v-if="phase === 'TRIAL_REST'">
        <div class="card-solid animate-scale-in text-center">
          <h2 class="text-2xl sm:text-3xl font-bold text-white mb-4">Rest Quietly</h2>

          <p class="text-5xl font-mono font-bold text-amber-400 mb-4 tabular-nums">
            {{ formatTime(restTimeRemaining) }}
          </p>

          <p class="text-slate-400 mb-6">
            Next trial: {{ trials[currentTrialIndex + 1]?.rate }} BPM
          </p>

          <!-- Controls -->
          <div class="flex flex-col sm:flex-row justify-center gap-3">
            <button @click="togglePause" :class="isPaused ? 'btn-primary' : 'btn-warning'" class="btn-action">
              {{ isPaused ? 'Resume' : 'Pause' }}
            </button>
            <button data-testid="cancel-btn" @click="requestCancel" class="btn-danger">
              Cancel
            </button>
          </div>
        </div>
      </template>

      <!-- ======================== SCORING PHASE ======================== -->
      <template v-if="phase === 'SCORING'">
        <div class="animate-scale-in space-y-6">
          <div class="card-solid">
            <h2 class="text-2xl sm:text-3xl font-bold text-white mb-2">Rate Your Trials</h2>
            <p class="text-sm text-slate-400 leading-relaxed">
              If you used a heart rate monitor, rate the following based on what you observed. Skip these if you didn't use one.
            </p>
          </div>

          <!-- Trial Cards -->
          <div
            v-for="(trial, index) in trials"
            :key="trial.rate"
            data-testid="trial-card"
            class="card-solid"
          >
            <h3 class="text-lg font-bold text-white mb-4">{{ trial.rate }} BPM</h3>

            <!-- HRV Chart (when sensor data available) -->
            <div v-if="trialAnalyses[index]" class="mb-4">
              <div v-if="expandedTrialHrv[index]">
                <HrOscillation
                  :hr-data="getHrDataForTrial(index)"
                  :breathing-rate-b-p-m="trial.rate"
                  :trial-duration-seconds="120"
                  :peak-to-trough-amplitude="trialAnalyses[index]!.resonance.peakToTroughAmplitude"
                  :waveform-smoothness="trialAnalyses[index]!.resonance.waveformSmoothness"
                  :height="150"
                />
                <div class="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div class="bg-white/5 rounded-lg p-2">
                    <div class="text-xs text-white/50">LF Power</div>
                    <div class="text-sm font-semibold text-blue-400">{{ Math.round(trialAnalyses[index]!.frequencyDomain.lfPower) }} ms²</div>
                  </div>
                  <div class="bg-white/5 rounded-lg p-2">
                    <div class="text-xs text-white/50">Amplitude</div>
                    <div class="text-sm font-semibold text-amber-400">{{ trialAnalyses[index]!.resonance.peakToTroughAmplitude.toFixed(1) }} BPM</div>
                  </div>
                  <div class="bg-white/5 rounded-lg p-2">
                    <div class="text-xs text-white/50">Smoothness</div>
                    <div class="text-sm font-semibold text-purple-400">{{ trialAnalyses[index]!.resonance.waveformSmoothness.toFixed(2) }}</div>
                  </div>
                </div>
              </div>
              <button
                @click="expandedTrialHrv[index] = !expandedTrialHrv[index]"
                class="mt-2 text-xs text-emerald-400 hover:text-emerald-300 transition-colors"
              >
                {{ expandedTrialHrv[index] ? 'Hide HRV data' : 'Show HRV data' }}
              </button>
            </div>

            <!-- Comfort Rating -->
            <div data-testid="comfort-rating" class="mb-4">
              <label class="form-label">Comfort (1 = uncomfortable, 5 = very comfortable)</label>
              <div class="flex gap-2">
                <button
                  v-for="rating in 5"
                  :key="rating"
                  @click="trial.comfortRating = rating"
                  :class="[
                    'w-10 h-10 rounded-xl font-bold text-sm transition-all duration-200',
                    trial.comfortRating === rating
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 border border-white/10'
                  ]"
                >
                  {{ rating }}
                </button>
              </div>
            </div>

            <!-- Symptoms -->
            <div class="mb-4">
              <label class="form-label">Symptoms</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="symptom in symptomOptions"
                  :key="symptom.value"
                  @click="toggleSymptom(index, symptom.value)"
                  :class="[
                    'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
                    trial.symptoms.includes(symptom.value)
                      ? 'bg-red-500/20 text-red-300 border border-red-500/40'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 border border-white/10'
                  ]"
                >
                  {{ symptom.label }}
                </button>
              </div>
            </div>

            <!-- HR Amplitude (optional) -->
            <div class="mb-4">
              <label class="form-label">HR Amplitude (optional)</label>
              <div class="flex gap-2">
                <button
                  v-for="opt in hrAmplitudeOptions"
                  :key="opt.value"
                  @click="trial.hrAmplitude = trial.hrAmplitude === opt.value ? undefined : opt.value"
                  :class="[
                    'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
                    trial.hrAmplitude === opt.value
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 border border-white/10'
                  ]"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Waveform Smoothness (optional) -->
            <div class="mb-4">
              <label class="form-label">Waveform Smoothness (optional)</label>
              <div class="flex gap-2">
                <button
                  v-for="opt in smoothnessOptions"
                  :key="opt.value"
                  @click="trial.waveformSmoothness = trial.waveformSmoothness === opt.value ? undefined : opt.value"
                  :class="[
                    'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
                    trial.waveformSmoothness === opt.value
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'bg-slate-700/50 text-slate-400 hover:bg-slate-600/50 border border-white/10'
                  ]"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Notes -->
            <div>
              <label class="form-label">Notes (optional)</label>
              <textarea
                v-model="trial.notes"
                rows="2"
                class="form-input resize-none"
                placeholder="Any observations for this trial..."
              ></textarea>
            </div>
          </div>

          <!-- Calculate Button -->
          <div class="text-center pb-4">
            <button
              @click="calculateResult"
              :disabled="!allTrialsRated"
              class="btn-success btn-action"
            >
              Calculate Result
            </button>
            <p v-if="!allTrialsRated" class="text-sm text-slate-500 mt-2">
              Rate comfort for all 5 trials to continue
            </p>
          </div>
        </div>
      </template>

      <!-- ======================== RESULT PHASE ======================== -->
      <template v-if="phase === 'RESULT'">
        <div class="animate-scale-in space-y-6">
          <div class="card-solid text-center">
            <h2 class="text-2xl sm:text-3xl font-bold text-white mb-2">Suggested Rate</h2>
            <p class="text-5xl font-bold text-emerald-400 mb-1">{{ selectedRate }} BPM</p>
            <p class="text-sm text-slate-400">Score: {{ trialScores.find(s => s.rate === selectedRate)?.score ?? 0 }}</p>
          </div>

          <!-- HRV Trial Comparison (when sensor data available) -->
          <template v-if="hasAnyHrvData">
            <TrialComparison
              :trials="trialComparisonData"
              :selected-rate="selectedRate"
            />

            <template v-if="selectedTrialAnalysis">
              <FrequencySpectrum
                v-if="selectedTrialAnalysis.frequencyDomain.available !== false"
                :spectrum="selectedTrialAnalysis.frequencyDomain.spectrum"
                :lf-peak="selectedTrialAnalysis.frequencyDomain.lfPeak"
                :hf-peak="selectedTrialAnalysis.frequencyDomain.hfPeak"
                :lf-power="selectedTrialAnalysis.frequencyDomain.lfPower"
                :hf-power="selectedTrialAnalysis.frequencyDomain.hfPower"
              />
            </template>
          </template>

          <!-- All Trial Scores -->
          <div class="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <button
              v-for="ts in trialScores"
              :key="ts.rate"
              @click="selectedRate = ts.rate"
              :class="[
                'stat-card cursor-pointer transition-all duration-200',
                selectedRate === ts.rate
                  ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900'
                  : ''
              ]"
            >
              <div class="text-lg font-bold text-white">{{ ts.rate }} BPM</div>
              <div class="text-sm text-slate-400">Score: {{ ts.score }}</div>
            </button>
          </div>

          <!-- Guidance -->
          <div class="card-solid">
            <p class="text-sm text-slate-400 leading-relaxed">
              If two rates scored similarly, confirm by comparing adjacent &plusmn;0.5 BPM rates.
            </p>
          </div>

          <!-- Save Button -->
          <div class="text-center pb-4">
            <button @click="saveResult" class="btn-success btn-action">
              Save &amp; Create Preset
            </button>
          </div>
        </div>
      </template>

      <!-- ======================== CANCEL CONFIRMATION MODAL ======================== -->
      <div
        v-if="showCancelConfirm"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        @click.self="showCancelConfirm = false"
      >
        <div class="card-solid max-w-md w-full animate-scale-in">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-xl bg-red-500/10">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div class="flex-1">
              <h3 class="text-xl font-bold text-white mb-2">Cancel assessment?</h3>
              <p class="text-slate-300 mb-6">All progress will be lost.</p>
              <div class="flex gap-3 justify-end">
                <button @click="showCancelConfirm = false" class="btn-secondary">Go Back</button>
                <button @click="confirmCancel" class="btn-danger">Confirm Cancel</button>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onUnmounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import BreathingVisualizer from './BreathingVisualizer.vue';
import HrOscillation from './hrv/HrOscillation.vue';
import TrialComparison from './hrv/TrialComparison.vue';
import FrequencySpectrum from './hrv/FrequencySpectrum.vue';
import SignalQualityIndicator from './hrv/SignalQualityIndicator.vue';
import { useBreathingTimer } from '../composables/useBreathingTimer';
import { useStorage } from '../composables/useStorage';
import {
  ASSESSMENT_TRIALS,
  DEFAULT_BREATHING_CONFIG,
  formatTime,
  analyzeHRV,
  type BreathingConfig,
  type AssessmentTrial,
  type AssessmentConfig,
  type AssessmentResult,
  type AssessmentSymptom,
  type HrAmplitude,
  type WaveformSmoothness,
  type IBISample,
  type HRVAnalysis,
  type HeartRateEstimate,
  type SoundTheme,
} from '@breath-in-flow/shared';
import { ppgService } from '../services/ppgService';
import { scgService } from '../services/scgService';
import { sensorFusionService } from '../services/sensorFusion';
import type { FusedIBISample } from '../services/sensorFusion';
import {
  MeasurementSession,
  type MeasurementStartOutcome,
} from '../services/measurementSession';
import { ttsService } from '../services/ttsService';
import { scoreTrial, findSuggestedRate } from '../utils/assessmentScoring';
import { v4 as uuidv4 } from 'uuid';

// ======================== Props & Emits ========================

const props = defineProps<{
  soundEnabled?: boolean;
  soundTheme?: SoundTheme;
  ttsEnabled?: boolean;
  ttsVoice?: string;
}>();

const emit = defineEmits<{
  cancel: [];
  complete: [config: BreathingConfig];
}>();

// ======================== Types ========================

type AssessmentPhase = 'INTRO' | 'WARMUP' | 'TRIAL_BREATHING' | 'TRIAL_REST' | 'SCORING' | 'RESULT';
type SensorMode = 'none' | 'camera' | 'accelerometer' | 'dual';

// ======================== Sensor Mode ========================

const selectedSensorMode = ref<SensorMode>('camera');

const sensorModes = [
  {
    value: 'camera' as const,
    label: 'Camera Pulse (Recommended)',
    description: 'Finger over the rear camera for automatic pulse-variability scoring',
  },
  {
    value: 'none' as const,
    label: 'Manual Scoring',
    description: 'Use comfort ratings alone or compare with a validated external heart monitor',
  },
  {
    value: 'dual' as const,
    label: 'Camera + Chest (Beta)',
    description: 'Experimental combined camera and chest-motion detection',
  },
  {
    value: 'accelerometer' as const,
    label: 'Chest Motion (Beta)',
    description: 'Experimental phone-on-chest motion detection',
  },
];

// ======================== Scoring UI Options ========================

const symptomOptions: { value: AssessmentSymptom; label: string }[] = [
  { value: 'airHunger', label: 'Air Hunger' },
  { value: 'dizziness', label: 'Dizziness' },
  { value: 'chestEffort', label: 'Chest Effort' },
  { value: 'urgeToSigh', label: 'Urge to Sigh' },
];

const hrAmplitudeOptions: { value: HrAmplitude; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' },
];

const smoothnessOptions: { value: WaveformSmoothness; label: string }[] = [
  { value: 'jagged', label: 'Jagged' },
  { value: 'somewhatSmooth', label: 'Somewhat Smooth' },
  { value: 'verySmooth', label: 'Very Smooth' },
];

// ======================== Assessment State ========================

const phase = ref<AssessmentPhase>('INTRO');
const currentTrialIndex = ref(0);
const isPaused = ref(false);
const showCancelConfirm = ref(false);

// Warmup config (user-adjustable on INTRO)
const assessmentConfig = reactive<AssessmentConfig>({
  warmupDurationSeconds: 120,
  warmupRate: 6.0,
  restDurationSeconds: 120,
});

// Build trials with computed repetitions
const trials = ref<AssessmentTrial[]>(
  ASSESSMENT_TRIALS.map((t) => ({
    ...t,
    repetitions: Math.round(120 / (t.inhaleTime + t.exhaleTime)),
    symptoms: [],
  }))
);

// Reactive timer config — mutated between phases
const timerConfig = reactive<BreathingConfig>({
  ...DEFAULT_BREATHING_CONFIG,
  name: 'Assessment',
  inhaleHoldTime: 0,
  exhaleHoldTime: 0,
  extendedHoldEnabled: false,
  secondExtendedHoldEnabled: false,
  targetSets: 1,
  soundEnabled: props.soundEnabled ?? true,
  soundTheme: props.soundTheme ?? 'wood',
  ttsEnabled: props.ttsEnabled ?? false,
  ttsVoice: props.ttsVoice,
});

const timer = useBreathingTimer(timerConfig, {
  onSessionComplete: () => handlePhaseComplete(),
});

const restTimeRemaining = ref(120);
let restIntervalId: ReturnType<typeof setInterval> | null = null;

// ======================== Sensor / IBI State ========================

const currentTrialIBIs = ref<IBISample[]>([]);
const trialAnalyses = ref<(HRVAnalysis | null)[]>([null, null, null, null, null]);
const sensorQuality = ref(0);
const sensorStatusMessage = ref('');
let measurementSession: MeasurementSession | null = null;

// Expanded HRV panels in SCORING phase
const expandedTrialHrv = reactive<boolean[]>([false, false, false, false, false]);

// ======================== Computed ========================

const currentTrial = computed(() => trials.value[currentTrialIndex.value]);

const isBreathingPhase = computed(
  () => phase.value === 'WARMUP' || phase.value === 'TRIAL_BREATHING'
);

const phaseHeaderText = computed(() => {
  if (phase.value === 'WARMUP') return `Warmup \u2014 ${assessmentConfig.warmupRate} BPM`;
  if (phase.value === 'TRIAL_BREATHING')
    return `Trial ${currentTrialIndex.value + 1}/5 \u2014 ${currentTrial.value.rate} BPM`;
  return '';
});

const allTrialsRated = computed(() =>
  trials.value.every((t) => t.comfortRating != null)
);

const trialScores = computed(() =>
  trials.value.map((t) => ({
    rate: t.rate,
    score: scoreTrial(t),
  }))
);

const hasAnyHrvData = computed(() =>
  trialAnalyses.value.some((a) => a !== null)
);

const trialComparisonData = computed(() =>
  trials.value
    .map((t, i) => {
      const analysis = trialAnalyses.value[i];
      if (!analysis) return null;
      return { rate: t.rate, analysis };
    })
    .filter((x): x is { rate: number; analysis: HRVAnalysis } => x !== null)
);

const selectedTrialAnalysis = computed(() => {
  const idx = trials.value.findIndex((t) => t.rate === selectedRate.value);
  if (idx < 0) return null;
  return trialAnalyses.value[idx];
});

const sensorInstructions = computed(() => {
  switch (selectedSensorMode.value) {
    case 'dual': return 'Phone flat on chest (screen down), finger covering rear camera';
    case 'camera': return 'Keep your finger covering the camera lens';
    case 'accelerometer': return 'Keep the phone flat on your chest';
    default: return '';
  }
});

// ======================== HRV Helpers ========================

function getHrDataForTrial(index: number) {
  const analysis = trialAnalyses.value[index];
  if (!analysis) return [];
  return analysis.raw.timestamps.map((t, i) => ({
    time: t,
    hr: analysis.raw.instantaneousHR[i],
  }));
}

function autoPopulateScoring() {
  for (let i = 0; i < trials.value.length; i++) {
    const analysis = trialAnalyses.value[i];
    if (!analysis) continue;

    const trial = trials.value[i];
    const amp = analysis.resonance.peakToTroughAmplitude;
    const smooth = analysis.resonance.waveformSmoothness;

    // Map amplitude to category
    if (amp >= 15) trial.hrAmplitude = 'large';
    else if (amp >= 5) trial.hrAmplitude = 'medium';
    else trial.hrAmplitude = 'small';

    // Map smoothness to category
    if (smooth >= 0.7) trial.waveformSmoothness = 'verySmooth';
    else if (smooth >= 0.3) trial.waveformSmoothness = 'somewhatSmooth';
    else trial.waveformSmoothness = 'jagged';
  }
}

// ======================== Sensor Start/Stop ========================

async function startSensor(): Promise<MeasurementStartOutcome> {
  if (selectedSensorMode.value === 'none') return { ok: true };

  currentTrialIBIs.value = [];
  sensorStatusMessage.value = '';
  measurementSession = new MeasurementSession({
    protocol: 'resonance-trial',
    onStateChange: (state) => {
      if (state === 'no-data') {
        sensorStatusMessage.value = measurementSession?.getResult().errorMessage ??
          'No detected heart beats were received. Continue with manual scoring or retry the sensor.';
        if (selectedSensorMode.value === 'dual') sensorFusionService.reset();
      }
    },
  });

  if (selectedSensorMode.value === 'dual') {
    sensorFusionService.reset();
    sensorFusionService.setCallbacks({
      onFusedIBI: (sample: FusedIBISample) => measurementSession?.addDetectedSample(sample),
      onQualityChange: (q: number) => { sensorQuality.value = q; },
    });

    const ppgCallbacks = {
      onIBI: (sample: IBISample) => sensorFusionService.addPPGSample(sample),
      onHeartRateEstimate: (estimate: HeartRateEstimate) =>
        measurementSession?.addHeartRateEstimate(estimate),
      onQualityChange: () => {}, // fusion handles quality
    };
    scgService.setCallbacks({
      onIBI: (sample) => sensorFusionService.addSCGSample(sample),
      onHeartRateEstimate: (estimate) => measurementSession?.addHeartRateEstimate(estimate),
      onQualityChange: () => {},
    });
    return measurementSession.start({
      ppg: {
        start: () => ppgService.start(ppgCallbacks),
        stop: () => ppgService.stop(),
      },
      scg: {
        start: () => scgService.start(),
        stop: () => scgService.stop(),
      },
    });
  } else {
    const callbacks = {
      onIBI: (sample: IBISample) => measurementSession?.addDetectedSample(sample),
      onHeartRateEstimate: (estimate: HeartRateEstimate) =>
        measurementSession?.addHeartRateEstimate(estimate),
      onQualityChange: (q: number) => { sensorQuality.value = q; },
    };

    if (selectedSensorMode.value === 'camera') {
      return measurementSession.start({
        ppg: {
          start: () => ppgService.start(callbacks),
          stop: () => ppgService.stop(),
        },
      });
    } else {
      scgService.setCallbacks(callbacks);
      return measurementSession.start({
        scg: {
          start: () => scgService.start(),
          stop: () => scgService.stop(),
        },
      });
    }
  }
}

function stopSensorAndAnalyze() {
  if (selectedSensorMode.value === 'none') return;

  if (selectedSensorMode.value === 'dual') sensorFusionService.reset();
  const sessionResult = measurementSession?.stop();
  measurementSession = null;
  currentTrialIBIs.value = sessionResult?.samples ?? [];

  // Analyze collected IBI data
  if (sessionResult?.eligibility?.eligible && currentTrialIBIs.value.length >= 10) {
    const trial = trials.value[currentTrialIndex.value];
    const analysis = analyzeHRV(currentTrialIBIs.value, trial.rate);
    trialAnalyses.value[currentTrialIndex.value] = analysis;
  } else if (sessionResult?.eligibility && !sessionResult.eligibility.eligible) {
    sensorStatusMessage.value =
      'This trial did not produce enough clean detected beats for automatic HRV scoring. Use the comfort and waveform questions to score it manually.';
  }
}

// ======================== Keep Awake ========================

async function enableKeepAwake() {
  if (Capacitor.isNativePlatform()) {
    try {
      await KeepAwake.keepAwake();
    } catch {
      // best-effort
    }
  }
}

async function disableKeepAwake() {
  if (Capacitor.isNativePlatform()) {
    try {
      await KeepAwake.allowSleep();
    } catch {
      // best-effort
    }
  }
}

// ======================== Phase Transitions ========================

function startAssessment() {
  enableKeepAwake();
  const warmupTrial =
    ASSESSMENT_TRIALS.find((t) => t.rate === assessmentConfig.warmupRate) ?? ASSESSMENT_TRIALS[1];
  const warmupReps = Math.round(
    assessmentConfig.warmupDurationSeconds / (warmupTrial.inhaleTime + warmupTrial.exhaleTime)
  );
  timerConfig.inhaleTime = warmupTrial.inhaleTime;
  timerConfig.exhaleTime = warmupTrial.exhaleTime;
  timerConfig.repetitions = warmupReps;
  phase.value = 'WARMUP';
  ttsService.speak('Warmup starting');
  timer.start();
}

function handlePhaseComplete() {
  timer.stop();
  if (phase.value === 'WARMUP') {
    startTrial(0);
  } else if (phase.value === 'TRIAL_BREATHING') {
    // Stop sensor and analyze IBI data
    stopSensorAndAnalyze();

    if (currentTrialIndex.value < 4) {
      startRest();
    } else {
      disableKeepAwake();
      autoPopulateScoring();
      phase.value = 'SCORING';
    }
  }
}

async function startTrial(index: number) {
  currentTrialIndex.value = index;
  const trial = trials.value[index];
  timerConfig.inhaleTime = trial.inhaleTime;
  timerConfig.exhaleTime = trial.exhaleTime;
  timerConfig.repetitions = trial.repetitions;
  phase.value = 'TRIAL_BREATHING';
  ttsService.speak(`Trial ${index + 1} starting at ${trial.rate} breaths per minute`);

  // Start sensor for IBI collection
  const outcome = await startSensor();
  if (!outcome.ok) {
    sensorStatusMessage.value = `${outcome.message ?? 'The sensor could not start.'} Continue with manual scoring for this trial.`;
  } else if (outcome.degradedSources?.length) {
    sensorStatusMessage.value = `Continuing with one sensor; ${outcome.degradedSources.join(' and ')} is unavailable.`;
  }

  timer.start();
}

function startRest() {
  phase.value = 'TRIAL_REST';
  restTimeRemaining.value = assessmentConfig.restDurationSeconds;
  ttsService.speak('Rest quietly');
  restIntervalId = setInterval(() => {
    if (isPaused.value) return;
    restTimeRemaining.value -= 1;
    if (restTimeRemaining.value <= 0) {
      clearRestInterval();
      startTrial(currentTrialIndex.value + 1);
    }
  }, 1000);
}

function clearRestInterval() {
  if (restIntervalId) {
    clearInterval(restIntervalId);
    restIntervalId = null;
  }
}

// ======================== Pause / Cancel ========================

function togglePause() {
  if (isPaused.value) {
    isPaused.value = false;
    if (isBreathingPhase.value) timer.resume();
  } else {
    isPaused.value = true;
    if (isBreathingPhase.value) timer.pause();
  }
}

function requestCancel() {
  if (phase.value === 'INTRO') {
    emit('cancel');
    return;
  }
  showCancelConfirm.value = true;
}

function confirmCancel() {
  timer.stop();
  clearRestInterval();
  disableKeepAwake();
  if (selectedSensorMode.value === 'dual') sensorFusionService.reset();
  measurementSession?.stop();
  measurementSession = null;
  showCancelConfirm.value = false;
  emit('cancel');
}

// ======================== Scoring Helpers ========================

function toggleSymptom(trialIndex: number, symptom: AssessmentSymptom) {
  const trial = trials.value[trialIndex];
  const idx = trial.symptoms.indexOf(symptom);
  if (idx >= 0) {
    trial.symptoms.splice(idx, 1);
  } else {
    trial.symptoms.push(symptom);
  }
}

// ======================== Result & Save ========================

const storage = useStorage();
const selectedRate = ref<number>(5.5);

function calculateResult() {
  const suggested = findSuggestedRate(trials.value);
  selectedRate.value = suggested;
  phase.value = 'RESULT';
}

function saveResult() {
  const selected = trials.value.find((t) => t.rate === selectedRate.value)!;
  const presetName = `My Resonance Frequency \u2014 ${selectedRate.value} BPM`;
  const existingConfigs = storage.getAllConfigs();
  const existing = existingConfigs.find((c) => c.name.startsWith('My Resonance Frequency'));

  const presetInput = {
    ...DEFAULT_BREATHING_CONFIG,
    name: presetName,
    inhaleTime: selected.inhaleTime,
    exhaleTime: selected.exhaleTime,
    inhaleHoldTime: 0,
    exhaleHoldTime: 0,
    repetitions: Math.round(600 / (selected.inhaleTime + selected.exhaleTime)),
    targetSets: 0,
    extendedHoldEnabled: false,
    secondExtendedHoldEnabled: false,
    soundEnabled: props.soundEnabled ?? true,
    soundTheme: props.soundTheme ?? 'wood',
    ttsEnabled: props.ttsEnabled ?? false,
    ttsVoice: props.ttsVoice,
  };

  let preset;
  if (existing?.id) {
    storage.updateConfig(existing.id, presetInput);
    preset = storage.getConfig(existing.id)!;
  } else {
    preset = storage.createConfig(presetInput);
  }

  const result: AssessmentResult = {
    id: uuidv4(),
    trials: trials.value,
    selectedRate: selectedRate.value,
    createdPresetId: preset.id,
    completedAt: new Date(),
    config: { ...assessmentConfig },
  };
  storage.saveAssessment(result);
  emit('complete', preset);
}

// ======================== Testing Helper ========================

function setPhaseForTesting(p: AssessmentPhase) {
  phase.value = p;
}
defineExpose({ setPhaseForTesting });

// ======================== Cleanup ========================

onUnmounted(() => {
  timer.stop();
  clearRestInterval();
  disableKeepAwake();
  if (selectedSensorMode.value === 'dual') sensorFusionService.reset();
  measurementSession?.stop();
  measurementSession = null;
});
</script>
