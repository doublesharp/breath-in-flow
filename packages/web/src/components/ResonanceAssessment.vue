<template>
  <div class="min-h-screen bg-surface-page">
    <div ref="assessmentContentRef" class="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      <!-- ======================== INTRO PHASE ======================== -->
      <template v-if="phase === 'INTRO'">
        <div class="card-solid animate-scale-in">
          <h1
            ref="phaseHeadingRef"
            data-assessment-phase-heading
            class="text-2xl sm:text-3xl font-bold text-primary mb-4"
            tabindex="-1"
            aria-live="polite"
          >
            Resonance Frequency Assessment
          </h1>

          <!-- Safety Notice -->
          <div
            class="mb-6 rounded-xl border border-clay/25 bg-clay/10 p-4"
          >
            <p class="text-sm text-secondary leading-relaxed">
              Breathe through your nose. Keep breathing comfortable and shallow — do not breathe deeply. If you feel
              faint, dizzy, or your heart beats too hard, take shallower, smoother breaths.
            </p>
          </div>

          <!-- Protocol Summary -->
          <div class="mb-6">
            <h3 class="font-semibold text-primary mb-2">Protocol</h3>
            <p class="text-sm text-muted leading-relaxed">
              5 breathing trials from 6.5 to 4.5 BPM, approximately 2 minutes each, with 2-minute rest periods between
              trials.
            </p>
          </div>

          <!-- Warmup Configuration -->
          <div class="mb-6 space-y-4">
            <h3 class="font-semibold text-primary">Warmup Settings</h3>

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
            <label class="text-sm font-medium text-secondary">Pulse Timing Measurement</label>
            <div class="grid grid-cols-1 gap-2">
              <button
                v-for="mode in sensorModes"
                :key="mode.value"
                @click="selectedSensorMode = mode.value"
                :aria-pressed="selectedSensorMode === mode.value"
                :class="[
                  'p-3 rounded-lg border text-left transition-all',
                  selectedSensorMode === mode.value
                    ? 'border-sage bg-sage/10'
                    : 'border-line-subtle bg-surface-inset',
                ]"
              >
                <div class="font-medium text-primary">{{ mode.label }}</div>
                <div class="text-xs text-muted mt-1">{{ mode.description }}</div>
              </button>
            </div>
          </div>

          <div
            v-if="sensorStatusMessage"
            class="mb-4 rounded-xl border border-clay/25 bg-clay/8 p-3 text-sm text-sand"
            role="status"
          >
            {{ sensorStatusMessage }}
          </div>
          <!-- Action Buttons -->
          <div class="flex flex-col sm:flex-row gap-3 pt-4 border-t border-line-subtle">
            <button data-testid="cancel-btn" @click="requestCancel" class="btn-secondary">Back</button>
            <button
              data-testid="start-btn"
              @click="startAssessment"
              :disabled="isAssessmentStartPending"
              :aria-busy="isAssessmentStartPending"
              class="btn-success btn-action flex-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start Assessment
            </button>
          </div>
        </div>
      </template>

      <!-- ======================== WARMUP / TRIAL_BREATHING PHASES ======================== -->
      <template v-if="phase === 'WARMUP' || phase === 'TRIAL_BREATHING'">
        <div class="card-solid animate-scale-in">
          <!-- Phase Header -->
          <h2
            ref="phaseHeadingRef"
            data-assessment-phase-heading
            class="text-xl sm:text-2xl font-bold text-primary text-center mb-4"
            tabindex="-1"
            aria-live="polite"
          >
            {{ phaseHeaderText }}
          </h2>
          <div
            v-if="sensorStatusMessage && phase === 'TRIAL_BREATHING'"
            class="mb-4 rounded-xl border border-clay/25 bg-clay/8 p-3 text-center text-sm text-sand"
            role="status"
          >
            {{ sensorStatusMessage }}
          </div>
          <div
            v-if="isFinishingTrialData && phase === 'TRIAL_BREATHING'"
            data-testid="finishing-trial-data"
            class="mb-4 rounded-xl border border-sage/25 bg-sage/8 p-3 text-center text-sm text-sage"
            role="status"
            aria-live="polite"
          >
            Finishing clean data collection while pacing continues…
          </div>

          <!-- Sensor-active trial view (replaces BreathingVisualizer) -->
          <div
            v-if="selectedSensorMode !== 'none' && phase === 'TRIAL_BREATHING'"
            class="flex flex-col items-center gap-6 py-8"
          >
            <SignalQualityIndicator
              :quality="sensorQuality"
              :sensor-type="selectedSensorMode === 'camera' ? 'ppg' : 'scg'"
            />
            <div class="text-sm text-secondary text-center">
              {{ sensorInstructions }}
            </div>
            <div class="text-sm text-muted">Follow the audio breathing cues</div>
            <div class="text-2xl font-mono text-primary">{{ formatTime(timer.currentTime.value) }}</div>
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
            <div
              class="inline-flex items-center gap-2 px-4 py-2 bg-surface-inset rounded-xl text-secondary text-sm sm:text-base"
            >
              <span class="text-sage font-semibold">{{ timerConfig.inhaleTime }}s</span>
              <span class="text-muted">&rarr;</span>
              <span class="text-sand font-semibold">{{ timerConfig.exhaleTime }}s</span>
              <span class="text-muted ml-2">&times;</span>
              <span class="text-primary font-semibold">{{ timerConfig.repetitions }} reps</span>
            </div>
          </div>

          <!-- Controls -->
          <div class="mt-6 flex flex-col sm:flex-row justify-center gap-3">
            <button
              v-if="canPause"
              @click="togglePause"
              :class="isPaused ? 'btn-primary' : 'btn-warning'"
              class="btn-action"
            >
              {{ isPaused ? 'Resume' : 'Pause' }}
            </button>
            <button data-testid="cancel-btn" @click="requestCancel" class="btn-danger">Cancel</button>
          </div>
        </div>
      </template>

      <!-- ======================== TRIAL_REST PHASE ======================== -->
      <template v-if="phase === 'TRIAL_REST'">
        <div class="card-solid animate-scale-in text-center">
          <h2
            ref="phaseHeadingRef"
            data-assessment-phase-heading
            class="text-2xl sm:text-3xl font-bold text-primary mb-4"
            tabindex="-1"
            aria-live="polite"
          >
            Rest Quietly
          </h2>

          <p class="text-5xl font-mono font-bold text-sand mb-4 tabular-nums">
            {{ formatTime(restTimeRemaining) }}
          </p>

          <p class="text-muted mb-6">Next trial: {{ trials[currentTrialIndex + 1]?.rate }} BPM</p>

          <!-- Controls -->
          <div class="flex flex-col sm:flex-row justify-center gap-3">
            <button @click="togglePause" :class="isPaused ? 'btn-primary' : 'btn-warning'" class="btn-action">
              {{ isPaused ? 'Resume' : 'Pause' }}
            </button>
            <button data-testid="cancel-btn" @click="requestCancel" class="btn-danger">Cancel</button>
          </div>
        </div>
      </template>

      <!-- ======================== SCORING PHASE ======================== -->
      <template v-if="phase === 'SCORING'">
        <div class="animate-scale-in space-y-6">
          <div class="card-solid">
            <h2
              ref="phaseHeadingRef"
              data-assessment-phase-heading
              class="text-2xl sm:text-3xl font-bold text-primary mb-2"
              tabindex="-1"
              aria-live="polite"
            >
              Rate Your Trials
            </h2>
            <p class="text-sm text-muted leading-relaxed">
              If you used a heart rate monitor, rate the following based on what you observed. Skip these if you didn't
              use one.
            </p>
          </div>

          <!-- Trial Cards -->
          <div v-for="(trial, index) in trials" :key="trial.rate" data-testid="trial-card" class="card-solid">
            <h3 class="text-lg font-bold text-primary mb-4">{{ trial.rate }} BPM</h3>

            <!-- HRV Chart (when sensor data available) -->
            <div v-if="trialAnalyses[index]" class="mb-4">
              <div v-if="expandedTrialHrv[index] && resonanceValueAt(index)">
                <HrOscillation
                  :hr-data="getHrDataForTrial(index)"
                  :breathing-rate-b-p-m="trial.rate"
                  :trial-duration-seconds="trial.repetitions * (trial.inhaleTime + trial.exhaleTime)"
                  :peak-to-trough-amplitude="resonanceValueAt(index)!.peakToTroughAmplitude"
                  :waveform-smoothness="resonanceValueAt(index)!.waveformSmoothness"
                  :height="150"
                />
                <div class="mt-2 grid grid-cols-3 gap-2 text-center">
                  <div class="bg-surface-inset rounded-lg p-2">
                    <div class="text-xs text-muted">LF Peak Share</div>
                    <div class="text-sm font-semibold text-sand">
                      {{ resonanceValueAt(index)!.lfPeakAmplitude.toFixed(1) }}%
                    </div>
                  </div>
                  <div class="bg-surface-inset rounded-lg p-2">
                    <div class="text-xs text-muted">Amplitude</div>
                    <div class="text-sm font-semibold text-sand">
                      {{ resonanceValueAt(index)!.peakToTroughAmplitude.toFixed(1) }} BPM
                    </div>
                  </div>
                  <div class="bg-surface-inset rounded-lg p-2">
                    <div class="text-xs text-muted">Smoothness</div>
                    <div class="text-sm font-semibold text-clay">
                      {{ resonanceValueAt(index)!.waveformSmoothness.toFixed(2) }}
                    </div>
                  </div>
                </div>
              </div>
              <div v-else-if="expandedTrialHrv[index]" class="rounded-lg bg-clay/8 p-3 text-xs text-sand">
                Automatic breathing-response metrics were unavailable for this trial.
              </div>
              <button
                @click="expandedTrialHrv[index] = !expandedTrialHrv[index]"
                class="mt-2 text-xs text-sage hover:text-primary transition-colors"
              >
                {{ expandedTrialHrv[index] ? 'Hide pulse variability data' : 'Show pulse variability data' }}
              </button>
            </div>

            <!-- Comfort Rating -->
            <div data-testid="comfort-rating" class="mb-4">
              <label class="form-label">Comfort (1 = uncomfortable, 5 = very comfortable)</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="rating in 5"
                  :key="rating"
                  @click="trial.comfortRating = rating"
                  :aria-pressed="trial.comfortRating === rating"
                  :class="[
                    'w-10 h-10 rounded-xl font-bold text-sm transition-all duration-200',
                    trial.comfortRating === rating
                      ? 'bg-sage text-surface-page'
                      : 'bg-surface-inset text-muted hover:bg-surface-raised border border-line-subtle',
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
                  :aria-pressed="trial.symptoms.includes(symptom.value)"
                  :class="[
                    'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
                    trial.symptoms.includes(symptom.value)
                      ? 'bg-terracotta/12 text-danger border border-terracotta/40'
                      : 'bg-surface-inset text-muted hover:bg-surface-raised border border-line-subtle',
                  ]"
                >
                  {{ symptom.label }}
                </button>
              </div>
            </div>

            <!-- HR Amplitude (optional) -->
            <div class="mb-4">
              <label class="form-label">HR Amplitude (optional)</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="opt in hrAmplitudeOptions"
                  :key="opt.value"
                  @click="trial.hrAmplitude = trial.hrAmplitude === opt.value ? undefined : opt.value"
                  :aria-pressed="trial.hrAmplitude === opt.value"
                  :class="[
                    'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
                    trial.hrAmplitude === opt.value
                      ? 'bg-sage/15 text-sage border border-sage/40'
                      : 'bg-surface-inset text-muted hover:bg-surface-raised border border-line-subtle',
                  ]"
                >
                  {{ opt.label }}
                </button>
              </div>
            </div>

            <!-- Waveform Smoothness (optional) -->
            <div class="mb-4">
              <label class="form-label">Waveform Smoothness (optional)</label>
              <div class="flex flex-wrap gap-2">
                <button
                  v-for="opt in smoothnessOptions"
                  :key="opt.value"
                  @click="trial.waveformSmoothness = trial.waveformSmoothness === opt.value ? undefined : opt.value"
                  :aria-pressed="trial.waveformSmoothness === opt.value"
                  :class="[
                    'px-3 py-1.5 rounded-xl text-sm font-medium transition-all duration-200',
                    trial.waveformSmoothness === opt.value
                      ? 'bg-sand/15 text-sand border border-sand/40'
                      : 'bg-surface-inset text-muted hover:bg-surface-raised border border-line-subtle',
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
            <button @click="calculateResult" :disabled="!allTrialsRated" class="btn-success btn-action">
              Calculate Result
            </button>
            <p v-if="!allTrialsRated" class="text-sm text-muted mt-2">Rate comfort for all 5 trials to continue</p>
          </div>
        </div>
      </template>

      <!-- ======================== RESULT PHASE ======================== -->
      <template v-if="phase === 'RESULT'">
        <div class="animate-scale-in space-y-6">
          <div class="card-solid text-center">
            <h2
              ref="phaseHeadingRef"
              data-assessment-phase-heading
              class="text-2xl sm:text-3xl font-bold text-primary mb-2"
              tabindex="-1"
              aria-live="polite"
            >
              Suggested Rate
            </h2>
            <p class="text-5xl font-bold text-sage mb-1">{{ selectedRate }} BPM</p>
            <p class="text-sm text-muted">
              Score: {{ trialScores.find((s) => s.rate === selectedRate)?.score ?? 0 }}
            </p>
          </div>

          <!-- All Trial Scores -->
          <div class="grid grid-cols-1 sm:grid-cols-5 gap-3">
            <button
              v-for="ts in trialScores"
              :key="ts.rate"
              @click="selectedRate = ts.rate"
              :disabled="isSavingResult"
              :class="[
                'stat-card cursor-pointer transition-all duration-200',
                selectedRate === ts.rate ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-900' : '',
              ]"
            >
              <div class="text-lg font-bold text-primary">{{ ts.rate }} BPM</div>
              <div class="text-sm text-muted">Score: {{ ts.score }}</div>
            </button>
          </div>

          <!-- Guidance -->
          <div class="card-solid">
            <p class="text-sm text-muted leading-relaxed">
              If two rates scored similarly, confirm by comparing adjacent &plusmn;0.5 BPM rates.
            </p>
          </div>

          <!-- Save Button -->
          <div class="text-center pb-4">
            <p v-if="resultSaveError" class="mb-3 text-sm text-danger" role="alert">
              {{ resultSaveError }}
            </p>
            <button @click="saveResult" class="btn-success btn-action" :disabled="isSavingResult">
              Save &amp; Create Preset
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- ======================== CANCEL CONFIRMATION MODAL ======================== -->
    <div
      v-if="showCancelConfirm"
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      @click.self="showCancelConfirm = false"
    >
      <div
        ref="cancelDialogRef"
        data-testid="cancel-assessment-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cancel-assessment-title"
        aria-describedby="cancel-assessment-description"
        tabindex="-1"
        class="card-solid max-w-md w-full animate-scale-in"
      >
        <div class="flex items-start gap-4">
          <div class="p-3 rounded-xl bg-terracotta/10">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-6 h-6 text-danger"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <div class="flex-1">
            <h3 id="cancel-assessment-title" class="text-xl font-bold text-primary mb-2">Cancel assessment?</h3>
            <p id="cancel-assessment-description" class="text-secondary mb-6">All progress will be lost.</p>
            <div class="flex gap-3 justify-end">
              <button ref="cancelSafeActionRef" @click="showCancelConfirm = false" class="btn-secondary">
                Go Back
              </button>
              <button @click="confirmCancel" class="btn-danger">Confirm Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
export const RESONANCE_TRIAL_DURATION_SECONDS = 120;

interface AssessmentTrialTiming {
  readonly rate: number;
  readonly inhaleTime: number;
  readonly exhaleTime: number;
}

export function buildAssessmentTrials(
  trialTimings: readonly AssessmentTrialTiming[],
  durationSeconds = RESONANCE_TRIAL_DURATION_SECONDS
) {
  return trialTimings.map((trial) => ({
    ...trial,
    repetitions: Math.ceil(durationSeconds / (trial.inhaleTime + trial.exhaleTime)),
    symptoms: [],
  }));
}
</script>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import BreathingVisualizer from './BreathingVisualizer.vue';
import HrOscillation from './hrv/HrOscillation.vue';
import SignalQualityIndicator from './hrv/SignalQualityIndicator.vue';
import { useBreathingTimer } from '../composables/useBreathingTimer';
import { useHrvStorage } from '../composables/useHrvStorage';
import { useStorage } from '../composables/useStorage';
import { useAppLifecycle } from '../composables/useAppLifecycle';
import { useModalIsolation } from '../composables/useModalIsolation';
import {
  ASSESSMENT_TRIALS,
  DEFAULT_BREATHING_CONFIG,
  formatTime,
  analyzeHRV,
  finalizeMeasurement,
  MAX_PLAUSIBLE_IBI_MS,
  type BreathingConfig,
  type AssessmentTrial,
  type AssessmentConfig,
  type AssessmentResult,
  type AssessmentSymptom,
  type HrAmplitude,
  type WaveformSmoothness,
  type IBISample,
  type HRVAnalysis,
  type ResonanceMetrics,
  type HeartRateEstimate,
  type SoundTheme,
} from '@breath-in-flow/shared';
import { ppgService } from '../services/ppgService';
import { scgService } from '../services/scgService';
import { sensorFusionService } from '../services/sensorFusion';
import type { FusedIBISample } from '../services/sensorFusion';
import { MeasurementSession, type MeasurementStartOutcome } from '../services/measurementSession';
import { getPermissionDeniedMessage, requestSensorPermissions } from '../services/permissionService';
import { soundService } from '../services/soundService';
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
    label: 'Camera + Chest',
    description: 'Keep your finger on the camera and the phone steady on your chest so both signals remain clean',
  },
  {
    value: 'accelerometer' as const,
    label: 'Chest Motion',
    description: 'Place the phone flat on your chest and remain still during motion-based pulse timing',
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
const assessmentContentRef = ref<HTMLElement | null>(null);
const phaseHeadingRef = ref<HTMLElement | null>(null);
const cancelDialogRef = ref<HTMLElement | null>(null);
const cancelSafeActionRef = ref<HTMLElement | null>(null);

watch(phase, async () => {
  await nextTick();
  phaseHeadingRef.value?.focus();
});

useModalIsolation(cancelDialogRef, showCancelConfirm, {
  backgroundRef: assessmentContentRef,
  initialFocus: () => cancelSafeActionRef.value,
  onEscape: () => {
    showCancelConfirm.value = false;
  },
});

// Warmup config (user-adjustable on INTRO)
const assessmentConfig = reactive<AssessmentConfig>({
  warmupDurationSeconds: 120,
  warmupRate: 6.0,
  restDurationSeconds: 120,
});

// Build trials with computed repetitions
const trials = ref<AssessmentTrial[]>(buildAssessmentTrials(ASSESSMENT_TRIALS));

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

function syncAudioPreferences() {
  timerConfig.soundEnabled = props.soundEnabled ?? true;
  timerConfig.soundTheme = props.soundTheme ?? 'wood';
  timerConfig.ttsEnabled = props.ttsEnabled ?? false;
  timerConfig.ttsVoice = props.ttsVoice;
  soundService.setEnabled(timerConfig.soundEnabled);
  soundService.setTheme(timerConfig.soundTheme);
  ttsService.setEnabled(timerConfig.ttsEnabled);
  ttsService.setVoiceByUri(timerConfig.ttsVoice ?? '');
}

onMounted(syncAudioPreferences);
watch(() => [props.soundEnabled, props.soundTheme, props.ttsEnabled, props.ttsVoice], syncAudioPreferences);

const timer = useBreathingTimer(timerConfig, {
  onPhaseChange: (breathingPhase, state) => {
    if (phase.value !== 'WARMUP' && phase.value !== 'TRIAL_BREATHING') return;
    if (breathingPhase !== 'INHALE' && breathingPhase !== 'EXHALE') return;

    // The timer ticks at phase boundaries after this first cue.
    if (timerConfig.soundEnabled && breathingPhase === 'INHALE' && state.currentRepetition === 1) {
      soundService.playClick();
    }
    if (timerConfig.ttsEnabled) {
      const phrase = breathingPhase === 'INHALE' ? 'Full Breath In' : 'Full Breath Out';
      void ttsService.speak(phrase, { targetDurationSeconds: state.totalPhaseTime });
    }
  },
  onSessionComplete: () => handlePhaseComplete(),
});

const restTimeRemaining = ref(120);
let restIntervalId: ReturnType<typeof setInterval> | null = null;

// ======================== Sensor / IBI State ========================

const currentTrialIBIs = ref<IBISample[]>([]);
const trialAnalyses = ref<(HRVAnalysis | null)[]>([null, null, null, null, null]);
const sensorQuality = ref(0);
const sensorStatusMessage = ref('');
const isFinishingTrialData = ref(false);
let measurementSession: MeasurementSession | null = null;
let sensorTrialCompletionStarted = false;
let finishingDataTimeoutId: ReturnType<typeof setTimeout> | null = null;

const RESONANCE_SETTLING_SECONDS = 5;
const RESONANCE_ENDING_SECONDS = 3;
const RESONANCE_CAPTURE_HARD_CAP_SECONDS =
  RESONANCE_TRIAL_DURATION_SECONDS +
  RESONANCE_SETTLING_SECONDS +
  RESONANCE_ENDING_SECONDS +
  (2 * MAX_PLAUSIBLE_IBI_MS) / 1_000;

// Expanded HRV panels in SCORING phase
const expandedTrialHrv = reactive<boolean[]>([false, false, false, false, false]);

// ======================== Computed ========================

const currentTrial = computed(() => trials.value[currentTrialIndex.value]);

const isBreathingPhase = computed(() => phase.value === 'WARMUP' || phase.value === 'TRIAL_BREATHING');
const canPause = computed(() => phase.value !== 'TRIAL_BREATHING' || selectedSensorMode.value === 'none');

const phaseHeaderText = computed(() => {
  if (phase.value === 'WARMUP') return `Warmup \u2014 ${assessmentConfig.warmupRate} BPM`;
  if (phase.value === 'TRIAL_BREATHING')
    return `Trial ${currentTrialIndex.value + 1}/5 \u2014 ${currentTrial.value.rate} BPM`;
  return '';
});

const allTrialsRated = computed(() => trials.value.every((t) => t.comfortRating != null));

const trialScores = computed(() =>
  trials.value.map((t) => ({
    rate: t.rate,
    score: scoreTrial(t),
  }))
);

const sensorInstructions = computed(() => {
  switch (selectedSensorMode.value) {
    case 'dual':
      return 'Phone flat on chest (screen down), finger covering rear camera';
    case 'camera':
      return 'Keep your finger covering the camera lens';
    case 'accelerometer':
      return 'Keep the phone flat on your chest';
    default:
      return '';
  }
});

// ======================== HRV Helpers ========================

function getHrDataForTrial(index: number) {
  const analysis = trialAnalyses.value[index];
  if (!analysis) return [];
  const { timestamps, instantaneousHR } = analysis.raw;
  // Mapping an empty series produces no chart points.
  const firstTimestamp = timestamps[0];
  return timestamps.map((timestamp, index) => ({
    time: (timestamp - firstTimestamp) / 1_000,
    hr: instantaneousHR[index],
  }));
}

function resonanceValueAt(index: number): ResonanceMetrics | null {
  const resonance = trialAnalyses.value[index]?.resonance;
  return resonance?.available ? resonance.value : null;
}

function autoPopulateScoring() {
  for (let i = 0; i < trials.value.length; i++) {
    const analysis = trialAnalyses.value[i];
    if (!analysis) continue;

    if (!analysis.resonance.available) continue;

    const trial = trials.value[i];
    const amp = analysis.resonance.value.peakToTroughAmplitude;
    const smooth = analysis.resonance.value.waveformSmoothness;

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
    onElapsed: (elapsedSeconds) => {
      if (phase.value !== 'TRIAL_BREATHING' || selectedSensorMode.value === 'none') return;
      const finalized = finalizeMeasurement(measurementSession?.getResult().samples ?? [], 'resonance-trial', {
        settlingSeconds: RESONANCE_SETTLING_SECONDS,
        endingSeconds: RESONANCE_ENDING_SECONDS,
      });
      if (
        elapsedSeconds >= RESONANCE_TRIAL_DURATION_SECONDS ||
        finalized.analyzedDurationSeconds >=
          RESONANCE_TRIAL_DURATION_SECONDS - RESONANCE_SETTLING_SECONDS - RESONANCE_ENDING_SECONDS
      ) {
        isFinishingTrialData.value = true;
      }
      if (
        finalized.analyzedDurationSeconds >= RESONANCE_TRIAL_DURATION_SECONDS ||
        elapsedSeconds >= RESONANCE_CAPTURE_HARD_CAP_SECONDS
      ) {
        completeCurrentTrial();
      }
    },
    onStateChange: (state) => {
      if (state === 'no-data') {
        sensorStatusMessage.value =
          measurementSession?.getResult().errorMessage ??
          'No detected heart beats were received. Continue with manual scoring or retry the sensor.';
        if (selectedSensorMode.value === 'dual') sensorFusionService.reset();
      }
    },
  });

  if (selectedSensorMode.value === 'dual') {
    sensorFusionService.reset();
    sensorFusionService.setCallbacks({
      onFusedIBI: (sample: FusedIBISample) => measurementSession?.addDetectedSample(sample),
      onQualityChange: (q: number) => {
        sensorQuality.value = q;
      },
    });

    const ppgCallbacks = {
      onIBI: (sample: IBISample) => sensorFusionService.addPPGSample(sample),
      onHeartRateEstimate: (estimate: HeartRateEstimate) => measurementSession?.addHeartRateEstimate(estimate),
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
      onHeartRateEstimate: (estimate: HeartRateEstimate) => measurementSession?.addHeartRateEstimate(estimate),
      onQualityChange: (q: number) => {
        sensorQuality.value = q;
      },
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
  const finalized = finalizeMeasurement(measurementSession?.getResult().samples ?? [], 'resonance-trial', {
    settlingSeconds: RESONANCE_SETTLING_SECONDS,
    endingSeconds: RESONANCE_ENDING_SECONDS,
  });
  const sessionResult = measurementSession?.stop(finalized.samples);
  measurementSession = null;
  currentTrialIBIs.value = sessionResult?.samples ?? [];

  // Analyze collected IBI data
  if (sessionResult?.eligibility?.eligible && currentTrialIBIs.value.length >= 10) {
    const trial = trials.value[currentTrialIndex.value];
    trialAnalyses.value[currentTrialIndex.value] = analyzeHRV(
      {
        samples: currentTrialIBIs.value,
        analyzedDurationSeconds: finalized.analyzedDurationSeconds,
        eligibility: sessionResult.eligibility,
      },
      trial.rate
    );
  } else if (sessionResult?.eligibility && !sessionResult.eligibility.eligible) {
    sensorStatusMessage.value =
      'This trial did not produce enough clean detected beats for automatic pulse-variability scoring. Use the comfort and waveform questions to score it manually.';
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

const ASSESSMENT_INTERRUPTION_MESSAGE =
  'Assessment interrupted when the app became inactive. Return to setup and restart when ready.';
const isAssessmentStartPending = ref(false);
let appIsActive = true;
let assessmentStartGeneration = 0;
let assessmentLifecycleGeneration = 0;
let assessmentUnmounted = false;

async function startAssessment() {
  const generation = ++assessmentStartGeneration;
  const lifecycleAtStart = assessmentLifecycleGeneration;
  isAssessmentStartPending.value = true;

  try {
    sensorStatusMessage.value = '';
    if (selectedSensorMode.value !== 'none') {
      const permissions = await requestSensorPermissions(selectedSensorMode.value);
      if (generation !== assessmentStartGeneration) return;
      if (lifecycleAtStart !== assessmentLifecycleGeneration || !appIsActive) {
        if (!assessmentUnmounted) sensorStatusMessage.value = ASSESSMENT_INTERRUPTION_MESSAGE;
        return;
      }

      const permissionMessage = getPermissionDeniedMessage(permissions);
      if (permissionMessage) {
        sensorStatusMessage.value = permissionMessage;
        return;
      }
    }

    if (generation !== assessmentStartGeneration) return;
    if (lifecycleAtStart !== assessmentLifecycleGeneration || !appIsActive) {
      if (!assessmentUnmounted) sensorStatusMessage.value = ASSESSMENT_INTERRUPTION_MESSAGE;
      return;
    }

    void enableKeepAwake();
    const warmupTrial = ASSESSMENT_TRIALS.find((t) => t.rate === assessmentConfig.warmupRate) ?? ASSESSMENT_TRIALS[1];
    const warmupReps = Math.ceil(
      assessmentConfig.warmupDurationSeconds / (warmupTrial.inhaleTime + warmupTrial.exhaleTime)
    );
    timerConfig.inhaleTime = warmupTrial.inhaleTime;
    timerConfig.exhaleTime = warmupTrial.exhaleTime;
    timerConfig.repetitions = warmupReps;
    syncAudioPreferences();
    phase.value = 'WARMUP';
    timer.start();
  } finally {
    if (generation === assessmentStartGeneration) isAssessmentStartPending.value = false;
  }
}

function handlePhaseComplete() {
  timer.stop();
  if (phase.value === 'WARMUP') {
    startTrial(0);
  } else if (phase.value === 'TRIAL_BREATHING') {
    completeCurrentTrial();
  }
}

function completeCurrentTrial() {
  if (phase.value !== 'TRIAL_BREATHING' || sensorTrialCompletionStarted) return;
  sensorTrialCompletionStarted = true;
  clearFinishingDataTimeout();
  timer.stop();
  stopSensorAndAnalyze();
  isFinishingTrialData.value = false;

  if (currentTrialIndex.value < 4) {
    startRest();
  } else {
    void disableKeepAwake();
    autoPopulateScoring();
    phase.value = 'SCORING';
  }
}

async function startTrial(index: number) {
  currentTrialIndex.value = index;
  const trial = trials.value[index];
  sensorTrialCompletionStarted = false;
  isFinishingTrialData.value = false;
  isPaused.value = false;
  timerConfig.inhaleTime = trial.inhaleTime;
  timerConfig.exhaleTime = trial.exhaleTime;
  timerConfig.repetitions =
    selectedSensorMode.value === 'none'
      ? trial.repetitions
      : Math.ceil(RESONANCE_CAPTURE_HARD_CAP_SECONDS / (trial.inhaleTime + trial.exhaleTime));
  phase.value = 'TRIAL_BREATHING';

  // Start sensor for IBI collection
  const outcome = await startSensor();
  if (!appIsActive || phase.value !== 'TRIAL_BREATHING') return;

  if (!outcome.ok) {
    sensorStatusMessage.value = `${outcome.message ?? 'The sensor could not start.'} Continue with manual scoring for this trial.`;
  } else if (outcome.degradedSources?.length) {
    sensorStatusMessage.value = `Continuing with one sensor; ${outcome.degradedSources.join(' and ')} is unavailable.`;
  }

  clearFinishingDataTimeout();
  if (selectedSensorMode.value !== 'none') {
    finishingDataTimeoutId = setTimeout(() => {
      if (phase.value === 'TRIAL_BREATHING') isFinishingTrialData.value = true;
    }, RESONANCE_TRIAL_DURATION_SECONDS * 1_000);
  }

  timer.start();
}

function startRest() {
  phase.value = 'TRIAL_REST';
  restTimeRemaining.value = assessmentConfig.restDurationSeconds;
  if (timerConfig.ttsEnabled) void ttsService.speak('Rest quietly');
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

function clearFinishingDataTimeout() {
  if (finishingDataTimeoutId !== null) {
    clearTimeout(finishingDataTimeoutId);
    finishingDataTimeoutId = null;
  }
}

// ======================== Pause / Cancel ========================

function togglePause() {
  if (!canPause.value) return;
  if (isPaused.value) {
    isPaused.value = false;
    if (isBreathingPhase.value) timer.resume();
  } else {
    isPaused.value = true;
    ttsService.stop();
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
  ttsService.stop();
  clearRestInterval();
  clearFinishingDataTimeout();
  disableKeepAwake();
  if (selectedSensorMode.value === 'dual') sensorFusionService.reset();
  measurementSession?.interrupt('Assessment cancelled before completion.');
  measurementSession = null;
  showCancelConfirm.value = false;
  emit('cancel');
}

function interruptAssessment() {
  if (phase.value !== 'WARMUP' && phase.value !== 'TRIAL_BREATHING' && phase.value !== 'TRIAL_REST') {
    return;
  }

  timer.stop();
  ttsService.stop();
  clearRestInterval();
  clearFinishingDataTimeout();
  void disableKeepAwake();
  if (selectedSensorMode.value === 'dual') sensorFusionService.reset();
  measurementSession?.interrupt(ASSESSMENT_INTERRUPTION_MESSAGE);
  measurementSession = null;
  currentTrialIBIs.value = [];
  trialAnalyses.value = [null, null, null, null, null];
  sensorQuality.value = 0;
  isPaused.value = false;
  showCancelConfirm.value = false;
  phase.value = 'INTRO';
  sensorStatusMessage.value = ASSESSMENT_INTERRUPTION_MESSAGE;
}

useAppLifecycle({
  onInactive: () => {
    appIsActive = false;
    assessmentLifecycleGeneration += 1;
    assessmentStartGeneration += 1;
    if (isAssessmentStartPending.value) {
      sensorStatusMessage.value = ASSESSMENT_INTERRUPTION_MESSAGE;
    }
    isAssessmentStartPending.value = false;
    interruptAssessment();
  },
  onActive: () => {
    appIsActive = true;
  },
});

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
const hrvStorage = useHrvStorage();
const selectedRate = ref<number>(5.5);
const resultSaveError = ref('');
const isSavingResult = ref(false);
let savedAssessment: AssessmentResult | undefined;

function calculateResult() {
  const suggested = findSuggestedRate(trials.value);
  selectedRate.value = suggested;
  phase.value = 'RESULT';
}

async function saveResult() {
  if (isSavingResult.value) return;
  isSavingResult.value = true;
  resultSaveError.value = '';
  const selected = trials.value.find((t) => t.rate === selectedRate.value)!;
  const presetName = `My Resonance Frequency \u2014 ${selectedRate.value} BPM`;
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

  const result: AssessmentResult = {
    id: savedAssessment?.id ?? uuidv4(),
    trials: trials.value,
    selectedRate: selectedRate.value,
    completedAt: savedAssessment?.completedAt ?? new Date(),
    config: { ...assessmentConfig },
  };

  let saveError = 'Your assessment could not be saved. Please try again.';
  try {
    // Save the assessment before mutating presets. Linking uses the same IndexedDB key,
    // so a retry after either write fails cannot create a duplicate assessment.
    if (savedAssessment?.selectedRate !== result.selectedRate) {
      await hrvStorage.saveAssessment(result);
      savedAssessment = result;
    }

    saveError = 'Your assessment was saved, but the practice preset could not be saved. Please try again.';
    const existing = storage.getAllConfigs().find((config) => config.name.startsWith('My Resonance Frequency'));
    const preset = existing?.id ? storage.updateConfig(existing.id, presetInput) : storage.createConfig(presetInput);
    if (!preset?.id) throw new Error('Preset unavailable after saving');

    saveError = 'Your preset was saved, but it could not be linked to the assessment. Please try again.';
    await hrvStorage.saveAssessment({ ...result, createdPresetId: preset.id });
    emit('complete', preset);
  } catch {
    resultSaveError.value = saveError;
  } finally {
    isSavingResult.value = false;
  }
}

// ======================== Testing Helper ========================

function setPhaseForTesting(p: AssessmentPhase) {
  phase.value = p;
}

function setTrialAnalysisForTesting(index: number, analysis: HRVAnalysis) {
  trialAnalyses.value[index] = analysis;
}

function startTrialForTesting(index: number) {
  return startTrial(index);
}

function getPhaseForTesting() {
  return phase.value;
}

function getTrialAnalysisForTesting(index: number) {
  return trialAnalyses.value[index];
}

defineExpose({
  setPhaseForTesting,
  setTrialAnalysisForTesting,
  startTrialForTesting,
  getPhaseForTesting,
  getTrialAnalysisForTesting,
});

// ======================== Cleanup ========================

onUnmounted(() => {
  assessmentUnmounted = true;
  appIsActive = false;
  assessmentLifecycleGeneration += 1;
  assessmentStartGeneration += 1;
  timer.stop();
  ttsService.stop();
  ttsService.setEnabled(false);
  clearRestInterval();
  clearFinishingDataTimeout();
  disableKeepAwake();
  if (selectedSensorMode.value === 'dual') sensorFusionService.reset();
  measurementSession?.interrupt('Assessment closed before completion.');
  measurementSession = null;
});
</script>
