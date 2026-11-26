<template>
  <div class="space-y-4 sm:space-y-6">
    <!-- Section A: Standalone HRV Measurement -->
    <div class="card-solid !p-3 sm:!p-6 space-y-3 sm:space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <h2 class="text-base font-bold text-primary sm:text-lg">Pulse Variability</h2>
        <div class="flex shrink-0 gap-1">
          <button
            @click="mode = 'guided'"
            :aria-pressed="mode === 'guided'"
            :class="[
              'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
              mode === 'guided' ? 'text-surface-page bg-sage' : 'text-secondary bg-surface-inset hover:bg-surface-raised',
            ]"
          >
            Guided
          </button>
          <button
            @click="mode = 'freeform'"
            :aria-pressed="mode === 'freeform'"
            :class="[
              'px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
              mode === 'freeform' ? 'text-surface-page bg-sage' : 'text-secondary bg-surface-inset hover:bg-surface-raised',
            ]"
          >
            Freeform
          </button>
        </div>
      </div>

      <!-- Sensor selector — compact row -->
      <div class="grid grid-cols-3 gap-2" data-testid="sensor-selection" role="group" aria-label="Pulse sensor">
        <button
          v-for="s in sensorOptions"
          :key="s.value"
          :data-testid="`sensor-${s.value}`"
          @click="selectedSensor = s.value"
          :aria-pressed="selectedSensor === s.value"
          :class="[
            'min-h-11 px-2 py-2 rounded-lg border text-center text-xs font-medium transition-all',
            selectedSensor === s.value
              ? 'border-sage bg-sage/10 text-primary'
              : 'border-line-subtle bg-surface-inset text-muted',
          ]"
        >
          <span class="block">{{ s.label }}</span>
          <span v-if="s.badge" class="mt-0.5 block text-[9px] uppercase tracking-wide text-sage">
            {{ s.badge }}
          </span>
        </button>
      </div>

      <!-- Permission error -->
      <div v-if="permissionError" class="rounded-lg bg-terracotta/10 border border-terracotta/30 p-2 text-xs text-danger">
        {{ permissionError }}
      </div>
      <div
        v-if="measurementNotice"
        class="rounded-lg bg-clay/10 border border-clay/25 p-2 text-xs text-sand"
        role="status"
      >
        {{ measurementNotice }}
      </div>
      <div v-if="showRecoveryActions" class="rounded-xl border border-clay/25 bg-clay/8 p-3" role="alert">
        <p class="text-sm text-sand">Choose how you want to continue.</p>
        <div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
          <button class="btn-primary min-h-11 rounded-lg px-3" @click="retryMeasurement">Retry</button>
          <button class="btn-secondary min-h-11 rounded-lg px-3" @click="chooseAnotherSensor">Change sensor</button>
          <button class="min-h-11 rounded-lg px-3 text-secondary hover:bg-surface-inset" @click="dismissRecovery">
            Cancel
          </button>
        </div>
      </div>

      <!-- Guided protocols — compact single-line cards -->
      <div v-if="mode === 'guided'" class="space-y-2">
        <button
          v-for="p in protocols"
          :key="p.id"
          :data-testid="`protocol-${p.id}`"
          @click="showPrepScreen(p)"
          class="flex items-center gap-2 sm:gap-3 w-full p-2.5 sm:p-3 rounded-xl text-left transition-colors bg-surface-inset hover:bg-surface-raised border border-line-subtle hover:border-sage/30 active:scale-[0.98]"
        >
          <svg
            aria-hidden="true"
            class="w-5 h-5 shrink-0 text-sage"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="p.iconPath" />
          </svg>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-primary text-sm">{{ p.name }}</div>
            <div :data-testid="`protocol-description-${p.id}`" class="mt-0.5 text-xs leading-relaxed text-muted">
              {{ p.description }}
            </div>
          </div>
          <span class="flex shrink-0 items-center gap-2 text-xs text-secondary tabular-nums">
            {{ formatDuration(p.duration) }}
            <span aria-hidden="true" class="text-xl leading-none text-sage">›</span>
          </span>
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
      <div
        v-if="showPrep"
        ref="prepDialogRef"
        data-testid="prep-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pulse-prep-dialog-title"
        tabindex="-1"
        class="fixed inset-0 z-50 bg-surface-page flex flex-col overflow-y-auto safe-area-top safe-area-bottom"
      >
        <div
          data-testid="prep-content"
          :inert="isStartPending || undefined"
          class="flex-1 flex flex-col justify-center items-center px-6 py-5 text-center"
        >
          <!-- Protocol info -->
          <svg
            aria-hidden="true"
            class="w-9 h-9 mb-4 shrink-0 text-sage"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path :d="prepProtocol?.iconPath ?? 'M3 12h4l2-6 4 12 2-6h6'" />
          </svg>
          <h2 id="pulse-prep-dialog-title" class="text-xl font-bold text-primary mb-1">
            {{ prepProtocol?.name || 'Freeform Measurement' }}
          </h2>

          <!-- Duration slider -->
          <div v-if="prepProtocol" class="w-full max-w-xs mb-6">
            <label for="measurement-duration" class="mb-2 block text-xs font-medium text-secondary">
              Analyzed duration
            </label>
            <div class="flex justify-between items-baseline mb-1">
              <span class="text-lg font-bold text-primary">{{ formatDuration(customDuration) }}</span>
              <span v-if="customDuration < 60" class="text-[10px] text-sand">Longer = more accurate</span>
            </div>
            <input
              id="measurement-duration"
              data-testid="measurement-duration"
              type="range"
              v-model.number="customDuration"
              :min="minimumProtocolDuration"
              :max="prepProtocol.id === 'full-analysis' ? 600 : 300"
              step="30"
              aria-label="Analyzed duration"
              :aria-valuetext="formatDuration(customDuration)"
              class="w-full h-1.5 rounded-full appearance-none bg-surface-raised accent-sage"
            />
            <div class="flex justify-between text-[9px] text-muted mt-1">
              <span>{{ formatDuration(minimumProtocolDuration) }}</span>
              <span>{{ formatDuration(prepProtocol.id === 'full-analysis' ? 600 : 300) }}</span>
            </div>
            <p class="mt-2 text-[11px] text-muted">
              Analyzes {{ formatTimer(customDuration) }} after {{ formatTimer(captureDurationSeconds) }}–{{
                formatTimer(maxCaptureDurationSeconds)
              }}
              of sensor capture.
            </p>
          </div>
          <p v-else class="text-sm text-muted mb-6">Manual stop</p>

          <!-- Sensor-specific instructions -->
          <div class="rounded-2xl bg-surface-inset border border-line-subtle p-5 mb-6 max-w-sm">
            <h3 class="text-sm font-semibold text-sage mb-3">How to get a good reading</h3>
            <div v-if="selectedSensor === 'camera'" class="space-y-2 text-sm text-secondary text-left">
              <p>1. Place your <strong class="text-primary">fingertip</strong> gently over the rear camera lens</p>
              <p>2. The flash will turn on to illuminate your finger</p>
              <p>3. Press firmly but don't squeeze — stay relaxed</p>
              <p>4. Keep completely still during the measurement</p>
            </div>
            <div v-else-if="selectedSensor === 'accelerometer'" class="space-y-2 text-sm text-secondary text-left">
              <p>1. Lie down or recline comfortably</p>
              <p>2. Place the phone <strong class="text-primary">flat on your chest</strong> (sternum area)</p>
              <p>3. Screen can face up — just keep the phone stable</p>
              <p>4. Breathe normally and stay as still as possible</p>
            </div>
            <div v-else class="space-y-2 text-sm text-secondary text-left">
              <p>1. Place phone <strong class="text-primary">screen-down on your chest</strong></p>
              <p>2. Cover the rear camera with your <strong class="text-primary">fingertip</strong></p>
              <p>3. The flash will illuminate your finger from below</p>
              <p>4. Stay still — follow audio cues for breathing</p>
            </div>
          </div>

          <!-- Camera options (only when camera or dual sensor selected) -->
          <div v-if="selectedSensor === 'camera' || selectedSensor === 'dual'" class="w-full max-w-sm space-y-3 mb-6">
            <!-- Camera picker -->
            <div v-if="availableCameras.length > 1" class="text-left">
              <label class="text-xs font-medium text-muted block mb-1">Camera</label>
              <select
                v-model="selectedCameraId"
                class="w-full py-2 px-3 rounded-lg bg-surface-inset border border-line-subtle text-sm text-primary"
              >
                <option value="">Default (rear)</option>
                <option v-for="cam in availableCameras" :key="cam.deviceId" :value="cam.deviceId">
                  {{ cam.label }}
                </option>
              </select>
            </div>

            <!-- Torch toggle -->
            <div class="flex items-center justify-between">
              <span class="text-sm text-secondary">Flash / Torch</span>
              <button
                @click="useTorch = !useTorch"
                aria-label="Flash / Torch"
                :aria-pressed="useTorch"
                :class="[
                  'relative w-11 rounded-lg',
                  useTorch ? 'text-sage' : 'text-muted',
                ]"
              >
                <span class="block h-6 rounded-full border border-current" aria-hidden="true">
                  <span
                    class="absolute top-1/2 left-1 size-4 -translate-y-1/2 rounded-full bg-current transition-transform"
                    :class="{ 'translate-x-5': useTorch }"
                  />
                </span>
              </button>
            </div>
          </div>

          <!-- Permission error -->
          <div
            v-if="permissionError"
            class="rounded-xl bg-terracotta/10 border border-terracotta/30 p-3 text-sm text-danger mb-4 max-w-sm"
          >
            {{ permissionError }}
          </div>
        </div>

        <!-- Bottom buttons -->
        <div data-testid="prep-actions" class="mobile-action-dock px-6 pt-3 space-y-3">
          <button
            @click="confirmStart"
            :disabled="isStartPending"
            :aria-busy="isStartPending"
            class="w-full btn-primary min-h-11 py-4 rounded-2xl font-bold text-lg disabled:cursor-not-allowed disabled:opacity-50"
          >
            Start
          </button>
          <button
            @click="cancelPendingStart"
            class="w-full py-3 rounded-xl font-medium text-muted hover:text-secondary"
          >
            Cancel
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ═══ FULLSCREEN MEASUREMENT MODAL ═══ -->
    <Teleport to="body">
      <div
        v-if="isMeasuring || showResults"
        ref="measurementDialogRef"
        data-testid="measurement-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pulse-measurement-dialog-title"
        tabindex="-1"
        class="fixed inset-0 z-50 bg-surface-page overflow-y-auto safe-area-top safe-area-bottom"
      >
        <!-- Measuring view -->
        <div v-if="isMeasuring" class="flex flex-col h-full p-4">
          <h2
            id="pulse-measurement-dialog-title"
            ref="measurementPhaseHeadingRef"
            data-testid="measurement-phase-heading"
            class="sr-only"
            tabindex="-1"
            aria-live="polite"
          >
            Pulse variability measurement in progress
          </h2>
          <!-- Header -->
          <div class="flex items-center justify-between mb-4">
            <div>
              <div class="text-xs text-muted">{{ selectedProtocol ? selectedProtocol.name : 'Freeform' }}</div>
              <div class="text-2xl font-bold text-primary font-mono">
                {{ formatTimer(elapsedSeconds) }}
                <span v-if="selectedProtocol" class="text-muted text-base"
                  >/ {{ formatTimer(captureDurationSeconds) }}</span
                >
              </div>
            </div>
            <SignalQualityIndicator
              :quality="sensorQuality"
              :sensor-type="selectedSensor === 'accelerometer' ? 'scg' : 'ppg'"
              :ring-size="48"
            />
          </div>

          <!-- Progress bar -->
          <div v-if="selectedProtocol" class="w-full h-1.5 rounded-full bg-surface-raised overflow-hidden mb-3">
            <div
              data-testid="measurement-progress"
              class="h-full rounded-full bg-sage transition-all duration-1000"
              :style="{ width: `${Math.min(100, (elapsedSeconds / captureDurationSeconds) * 100)}%` }"
            />
          </div>

          <!-- Sensor instructions -->
          <p class="text-xs text-muted mb-3">
            {{
              selectedSensor === 'camera'
                ? 'Finger on rear camera lens. Keep still.'
                : selectedSensor === 'accelerometer'
                  ? 'Phone flat on chest. Breathe normally.'
                  : 'Phone on chest, finger on camera.'
            }}
          </p>

          <!-- Charts area — fills remaining space -->
          <div class="flex-1 space-y-3 min-h-0 overflow-y-auto">
            <!-- HR tachogram -->
            <div v-if="hrDataPoints.length > 0">
              <div class="text-xs text-muted mb-1">Heart Rate</div>
              <HrTachogram
                :hr-data="hrDataPoints"
                :duration="Math.min(60, Math.max(15, elapsedSeconds))"
                :height="100"
              />
            </div>
            <div v-else class="min-h-20 rounded-xl bg-surface-inset p-4 text-center text-sm text-muted" role="status">
              {{ signalGuidance }}
            </div>

            <!-- Raw sensor signal -->
            <div>
              <div class="text-xs text-muted mb-1">Raw Sensor Signal</div>
              <canvas ref="rawSignalCanvas" class="w-full rounded-lg bg-surface-inset" height="80" />
            </div>

            <!-- Debug toggle + log -->
            <button
              v-if="debugControlsEnabled"
              @click="showDebug = !showDebug"
              class="text-[10px] text-muted hover:text-muted w-full text-center"
            >
              {{ showDebug ? 'Hide' : 'Show' }} Debug
            </button>
            <div
              v-if="debugControlsEnabled && showDebug"
              class="rounded-lg bg-black/50 border border-line-subtle p-2 max-h-32 overflow-y-auto font-mono text-[9px] text-muted space-y-px"
            >
              <div v-for="(line, i) in debugLog" :key="i">{{ line }}</div>
            </div>
          </div>

          <!-- Stop button — pinned to bottom -->
          <button
            @click="stopMeasurement"
            class="mobile-action-dock mt-3 w-full btn-danger min-h-11 pt-3 rounded-xl font-semibold shrink-0"
          >
            Stop Measurement
          </button>
        </div>

        <!-- Results view -->
        <div v-if="showResults && currentAnalysis" class="p-4 space-y-4">
          <h2
            id="pulse-measurement-dialog-title"
            ref="measurementPhaseHeadingRef"
            data-testid="measurement-phase-heading"
            class="text-lg font-bold text-primary"
            tabindex="-1"
            aria-live="polite"
          >
            Pulse Variability Results
          </h2>
          <HrvMetricsDashboard :analysis="currentAnalysis" />
          <section
            v-if="currentEligibility"
            data-testid="measurement-quality"
            class="rounded-xl border border-line-subtle bg-surface-inset p-4"
            aria-labelledby="measurement-quality-title"
          >
            <h3 id="measurement-quality-title" class="font-semibold text-primary">Measurement quality</h3>
            <dl class="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt class="text-secondary">Time covered</dt>
                <dd class="font-semibold text-primary">
                  {{
                    currentEligibility.coveragePercentage === undefined
                      ? 'Not recorded'
                      : `${currentEligibility.coveragePercentage.toFixed(0)}%`
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-secondary">Longest sample gap</dt>
                <dd class="font-semibold text-primary">
                  {{
                    currentEligibility.maximumGapSeconds === undefined
                      ? 'Not recorded'
                      : `${currentEligibility.maximumGapSeconds.toFixed(1)} s`
                  }}
                </dd>
              </div>
              <div>
                <dt class="text-secondary">Corrected beats</dt>
                <dd class="font-semibold text-primary">{{ currentEligibility.artifactPercentage.toFixed(1) }}%</dd>
              </div>
              <div>
                <dt class="text-secondary">Average signal quality</dt>
                <dd class="font-semibold text-primary">{{ (currentEligibility.meanQuality * 100).toFixed(0) }}%</dd>
              </div>
            </dl>
            <ul
              v-if="currentEligibility.warnings.length > 0"
              class="mt-3 space-y-2 rounded-lg border border-clay/25 bg-clay/8 p-3 text-sm text-sand"
            >
              <li v-for="warning in currentEligibility.warnings" :key="warning">
                {{ eligibilityWarningMessage(warning) }}
              </li>
            </ul>
            <p class="mt-3 text-xs leading-relaxed text-secondary">
              This is a phone-derived wellness estimate, not a medical measurement. Results with limited coverage or
              elevated corrections remain in your history but are not used for trend comparisons.
            </p>
          </section>
          <FrequencySpectrum
            v-if="currentAnalysis.frequencyDomain.available"
            :spectrum="currentAnalysis.frequencyDomain.value.spectrum"
            :lf-peak="currentAnalysis.frequencyDomain.value.lfPeak"
            :hf-peak="currentAnalysis.frequencyDomain.value.hfPeak"
          />
          <PoincarePlot v-if="currentAnalysis.poincare.available" :rr-intervals="currentAnalysis.raw.rrIntervals" />
          <div
            v-else
            data-testid="poincare-unavailable"
            class="rounded-xl border border-clay/25 bg-clay/8 p-3 text-sm text-secondary"
            role="status"
          >
            <div class="font-medium text-sand">Poincaré plot unavailable</div>
            <div class="mt-1 text-xs">
              {{ poincareUnavailableMessage(currentAnalysis.poincare.reason) }}
            </div>
          </div>

          <div class="card-solid !p-4">
            <label class="text-sm font-medium text-secondary block mb-2">Notes</label>
            <textarea
              v-model="measurementNotes"
              rows="2"
              class="form-input resize-none w-full"
              placeholder="Add notes..."
            />
          </div>

          <p v-if="measurementSaveError" class="text-sm text-danger" role="alert">{{ measurementSaveError }}</p>
          <div class="flex gap-3">
            <button @click="saveResults" class="flex-1 btn-primary py-3 rounded-xl font-semibold" :disabled="isSavingMeasurement">Save</button>
            <button @click="discardResults" class="flex-1 btn-secondary py-3 rounded-xl font-semibold" :disabled="isSavingMeasurement">Discard</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Section B: Resonance Frequency Assessment -->
    <div class="space-y-3">
      <h2 class="text-lg font-bold text-primary">Estimated Breathing Response</h2>

      <!-- Latest assessment summary -->
      <div v-if="latestAssessment" class="rounded-xl p-3 bg-surface-inset border border-line-subtle">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-xs text-secondary">Suggested practice rate</div>
            <div class="text-lg font-bold text-sage">{{ latestAssessment.selectedRate.toFixed(1) }} BPM</div>
          </div>
          <div class="text-xs text-muted">{{ formatDate(latestAssessment.completedAt) }}</div>
        </div>
      </div>

      <button
        @click="startAssessment"
        class="flex items-center gap-3 w-full p-3 rounded-xl text-left transition-colors bg-surface-inset hover:bg-surface-raised border border-line-subtle hover:border-sage/30 active:scale-[0.98]"
      >
        <svg
          aria-hidden="true"
          class="w-5 h-5 shrink-0 text-sage"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 12h.01" />
        </svg>
        <div class="min-w-0 flex-1">
          <div class="font-semibold text-primary text-sm">Estimate My Breathing Response</div>
          <div class="text-xs text-secondary">5 breathing trials to suggest a practice rate</div>
        </div>
        <span class="flex shrink-0 items-center gap-2 text-xs text-secondary">
          ~25 min
          <span aria-hidden="true" class="text-xl leading-none text-sage">›</span>
        </span>
      </button>
    </div>

    <!-- ═══ FULLSCREEN RF ASSESSMENT MODAL ═══ -->
    <Teleport to="body">
      <div
        v-if="showAssessment"
        ref="assessmentDialogRef"
        role="dialog"
        aria-modal="true"
        aria-labelledby="resonance-assessment-dialog-title"
        tabindex="-1"
        class="fixed inset-0 z-50 bg-surface-page overflow-y-auto safe-area-top safe-area-bottom"
      >
        <h2 id="resonance-assessment-dialog-title" class="sr-only">Resonance frequency assessment</h2>
        <ResonanceAssessment
          :sound-enabled="true"
          :sound-theme="storage.soundTheme.value"
          :tts-enabled="true"
          :tts-voice="assessmentVoice"
          @cancel="showAssessment = false"
          @complete="onAssessmentComplete"
        />
      </div>
    </Teleport>

    <!-- Section C: Trends and Insights -->
    <div class="space-y-3">
      <h2 class="text-xl font-bold text-primary" :class="{ 'sr-only': !measurements.length }">Trends</h2>
      <HrvTrends :measurements="measurements">
        <template #empty-action>
          <button class="btn-primary mt-4" @click="showPrepScreen(quickCheckProtocol)">
            Start Quick Check
          </button>
        </template>
      </HrvTrends>
    </div>

    <div v-if="measurements.length || latestAssessment" class="space-y-3">
      <h2 class="text-xl font-bold text-primary">Insights</h2>
      <LabInsights
        :measurements="measurements"
        :latest-assessment="latestAssessment"
        :show-empty-guidance="measurements.length > 0"
      />
    </div>

    <!-- Section D: Recent Results -->
    <div v-if="recentMeasurements.length" class="space-y-3">
      <h2 class="text-xl font-bold text-primary">Recent Results</h2>

      <div
        v-for="m in recentMeasurements"
        :key="m.id"
        class="flex justify-between items-center p-3 rounded-xl bg-surface-inset"
      >
        <div>
          <div class="text-sm font-medium text-primary">{{ formatType(m.type) }}</div>
          <div class="text-xs text-muted">{{ formatDate(m.completedAt) }}</div>
        </div>
        <div class="text-right">
          <div class="text-sm text-primary">Pulse {{ m.analysis.timeDomain.meanHR.toFixed(0) }} BPM</div>
          <div class="text-xs text-muted">RMSSD {{ m.analysis.timeDomain.rmssd.toFixed(1) }}ms</div>
        </div>
      </div>
    </div>
    <p class="text-sm text-muted">
      Pulse estimates are for general wellness and personal trend tracking — not for medical diagnosis.
    </p>
  </div>
</template>

<script setup lang="ts">
import { chartColors } from './charts/chartColors';
import { computed, ref, watch, onMounted, onUnmounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import HrTachogram from './hrv/HrTachogram.vue';
import SignalQualityIndicator from './hrv/SignalQualityIndicator.vue';
import HrvMetricsDashboard from './hrv/HrvMetricsDashboard.vue';
import FrequencySpectrum from './hrv/FrequencySpectrum.vue';
import PoincarePlot from './hrv/PoincarePlot.vue';
import ResonanceAssessment from './ResonanceAssessment.vue';
import HrvTrends from './HrvTrends.vue';
import LabInsights from './LabInsights.vue';
import { ppgService, listCameras } from '../services/ppgService';
import type { PPGCallbacks } from '../services/ppgService';
import { soundService } from '../services/soundService';
import { scgService } from '../services/scgService';
import { sensorFusionService } from '../services/sensorFusion';
import { MeasurementSession, type MeasurementStartOutcome } from '../services/measurementSession';
import { requestSensorPermissions, getPermissionDeniedMessage } from '../services/permissionService';
import { BreathingConfigSchema, analyzeHRV, finalizeMeasurement, MAX_PLAUSIBLE_IBI_MS } from '@breath-in-flow/shared';
import { LAST_CONFIG_STORAGE_KEY } from '../constants/storageKeys';
import { useStorage } from '../composables/useStorage';
import { useHrvStorage, type HrvMeasurement } from '../composables/useHrvStorage';
import { useAppLifecycle } from '../composables/useAppLifecycle';
import { useModalIsolation } from '../composables/useModalIsolation';
import type {
  AssessmentResult,
  HeartRateEstimate,
  HRVAnalysis,
  IBISample,
  MeasurementProtocol,
  MeasurementEligibility,
  PoincareUnavailableReason,
  SampleProvenance,
} from '@breath-in-flow/shared';

interface Protocol {
  id: string;
  name: string;
  duration: number;
  description: string;
  iconPath: string;
}

const quickCheckProtocol: Protocol = {
  id: 'quick-check',
  name: 'Quick Check',
  duration: 120,
  description: 'Short pulse-variability trend with time-domain metrics when enough clean beats are detected',
  iconPath: 'M13 3 5 14h6l-1 7 9-11h-6l1-7Z',
};

const protocols: Protocol[] = [
  quickCheckProtocol,
  {
    id: 'full-analysis',
    name: 'Full Analysis',
    duration: 300,
    description: 'Five-minute protocol for time, frequency, and Poincar\u00E9 metrics when the signal supports them',
    iconPath: 'M8 3h8m-7 0v7l-5 8a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-8V3m-8 12h10',
  },
  {
    id: 'morning-readiness',
    name: 'Morning Readiness',
    duration: 180,
    description: 'Repeatable three-minute pulse-variability baseline for personal trend tracking',
    iconPath: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19m0-14-1.4 1.4M6.4 17.6 5 19',
  },
];

const sensorOptions = [
  { value: 'camera' as const, label: 'Camera', badge: 'Recommended' },
  { value: 'accelerometer' as const, label: 'Chest' },
  { value: 'dual' as const, label: 'Both' },
];

const hrvStorage = useHrvStorage();
const storage = useStorage();
const assessmentVoice = ref('');

function startAssessment() {
  try {
    const lastConfig = JSON.parse(localStorage.getItem(LAST_CONFIG_STORAGE_KEY) ?? 'null');
    const voice = BreathingConfigSchema.shape.ttsVoice.safeParse(lastConfig?.ttsVoice);
    assessmentVoice.value = voice.success ? voice.data ?? '' : '';
  } catch {
    assessmentVoice.value = '';
  }
  showAssessment.value = true;
}

// State
const mode = ref<'guided' | 'freeform'>('guided');
const isMeasuring = ref(false);
const showResults = ref(false);
const showAssessment = ref(false);
const currentAnalysis = ref<HRVAnalysis | null>(null);
const sensorQuality = ref(0);
const elapsedSeconds = ref(0);
const selectedSensor = ref<'camera' | 'accelerometer' | 'dual'>('camera');
const selectedProtocol = ref<Protocol | null>(null);
const showPrep = ref(false);
const prepDialogRef = ref<HTMLElement | null>(null);
const measurementDialogRef = ref<HTMLElement | null>(null);
const measurementPhaseHeadingRef = ref<HTMLElement | null>(null);
const assessmentDialogRef = ref<HTMLElement | null>(null);
const prepProtocol = ref<Protocol | null>(null);
const availableCameras = ref<{ deviceId: string; label: string }[]>([]);
const selectedCameraId = ref('');
const useTorch = ref(true);
const customDuration = ref(120); // seconds, adjustable in prep screen
const collectedIBIs = ref<IBISample[]>([]);
const measurementNotes = ref('');
const measurementSaveError = ref('');
const isSavingMeasurement = ref(false);
const measurementStartTime = ref<Date>(new Date());
const currentEligibility = ref<MeasurementEligibility | null>(null);
const currentSampleProvenance = ref<SampleProvenance[]>([]);
const currentAcquisitionSources = ref<Array<'ppg' | 'scg'>>([]);
const measurements = ref<HrvMeasurement[]>([]);
const recentMeasurements = computed(() => measurements.value.slice(0, 5));
const latestAssessment = ref<AssessmentResult | null>(null);
const hrDataPoints = ref<Array<{ time: number; hr: number; quality: number }>>([]);
const rawSignalData = ref<Array<{ time: number; value: number }>>([]);
const debugLog = ref<string[]>([]);
const showDebug = ref(false);
const debugControlsEnabled = import.meta.env.DEV && import.meta.env.MODE !== 'test';
const showRecoveryActions = ref(false);
const SETTLING_SECONDS = 5;
const ENDING_SECONDS = 3;
const CAPTURE_PADDING_SECONDS = SETTLING_SECONDS + ENDING_SECONDS;
const minimumProtocolDuration = computed(() => prepProtocol.value?.duration ?? 30);
const captureDurationSeconds = computed(() =>
  prepProtocol.value !== null || (isMeasuring.value && selectedProtocol.value !== null)
    ? customDuration.value + CAPTURE_PADDING_SECONDS
    : customDuration.value
);
const maxCaptureDurationSeconds = computed(() => captureDurationSeconds.value + (2 * MAX_PLAUSIBLE_IBI_MS) / 1_000);
const measurementDialogOpen = computed(() => isMeasuring.value || showResults.value);
const measurementPhaseKey = computed(() =>
  isMeasuring.value ? 'measuring' : showResults.value ? 'results' : 'closed'
);

useModalIsolation(prepDialogRef, showPrep, { onEscape: cancelPendingStart });
useModalIsolation(measurementDialogRef, measurementDialogOpen, {
  focusKey: measurementPhaseKey,
  initialFocus: () => measurementPhaseHeadingRef.value,
});
useModalIsolation(assessmentDialogRef, showAssessment);
const signalGuidance = computed(() => {
  if (hrDataPoints.value.length === 0 && sensorQuality.value <= 0) return 'Waiting for a pulse';
  if (sensorQuality.value < 0.35) {
    return selectedSensor.value === 'accelerometer'
      ? 'Too much movement — keep the phone still on your chest'
      : 'Signal is weak — reposition your finger over the camera';
  }
  if (sensorQuality.value < 0.6) return 'Reposition your finger or phone for a steadier signal';
  return 'Pulse detected — keep still';
});

const RAW_SIGNAL_MAX_POINTS = 200; // ~6-7 seconds at 30fps
const DEBUG_LOG_MAX = 100;

function addDebugLine(msg: string) {
  const now = new Date();
  const ts =
    now.toLocaleTimeString('en-US', { hour12: false }) +
    '.' +
    String(now.getMilliseconds()).padStart(3, '0').slice(0, 1);
  debugLog.value.push(`[${ts}] ${msg}`);
  if (debugLog.value.length > DEBUG_LOG_MAX) debugLog.value.shift();
}

let measurementSession: MeasurementSession | null = null;

// Sensor management
async function startSensor(protocol: MeasurementProtocol): Promise<MeasurementStartOutcome> {
  measurementSession = new MeasurementSession({
    protocol,
    onElapsed: (seconds) => {
      elapsedSeconds.value = seconds;
      if (selectedProtocol.value && seconds >= captureDurationSeconds.value) {
        const finalized = finalizeMeasurement(
          measurementSession?.getResult().samples ?? [],
          selectedProtocol.value.id as MeasurementProtocol,
          {
            settlingSeconds: SETTLING_SECONDS,
            endingSeconds: ENDING_SECONDS,
          }
        );
        const hasTargetAnalysisWindow = finalized.analyzedDurationSeconds >= customDuration.value;
        if (hasTargetAnalysisWindow || seconds >= maxCaptureDurationSeconds.value) {
          stopMeasurement();
        }
      }
    },
    onStateChange: (state) => {
      if (state === 'no-data') {
        if (selectedSensor.value === 'dual') sensorFusionService.reset();
        permissionError.value =
          measurementSession?.getResult().errorMessage ??
          'No detected heart beats were received. Reposition the sensor and try again.';
        isMeasuring.value = false;
        showRecoveryActions.value = true;
        void disableKeepAwake();
      }
    },
  });

  if (selectedSensor.value === 'dual') {
    sensorFusionService.reset();
    sensorFusionService.setCallbacks({
      onFusedIBI: (sample) => {
        measurementSession?.addDetectedSample(sample);
        addHrDataPoint(sample);
      },
      onQualityChange: (q: number) => {
        sensorQuality.value = q;
      },
    });

    // Detected beats flow through fusion exactly once. If only one sensor sees
    // a beat, fusion emits that source after its short match window.
    const ppgCallbacks = {
      onIBI: (sample) => {
        sensorFusionService.addPPGSample(sample);
      },
      onHeartRateEstimate: recordHeartRateEstimate,
      onRawSignal: (value: number, timestamp: number) => {
        rawSignalData.value.push({ time: timestamp, value });
        if (rawSignalData.value.length > RAW_SIGNAL_MAX_POINTS) {
          rawSignalData.value.splice(0, rawSignalData.value.length - RAW_SIGNAL_MAX_POINTS);
        }
      },
      onQualityChange: (q: number) => {
        sensorQuality.value = Math.max(sensorQuality.value, q);
      },
      onError: (error: Error) => {
        measurementSession?.reportSensorError(error);
        addDebugLine(`CAMERA ERROR: ${error.message}`);
      },
    } satisfies PPGCallbacks;
    scgService.setCallbacks({
      onIBI: (sample) => {
        sensorFusionService.addSCGSample(sample);
      },
      onHeartRateEstimate: recordHeartRateEstimate,
      onQualityChange: (q: number) => {
        sensorQuality.value = Math.max(sensorQuality.value, q);
      },
      onError: (error: Error) => {
        measurementSession?.reportSensorError(error);
        addDebugLine(`MOTION ERROR: ${error.message}`);
      },
    });
    return measurementSession.start({
      ppg: {
        start: () =>
          ppgService.start({
            callbacks: ppgCallbacks,
            cameraDeviceId: selectedCameraId.value || undefined,
            torchEnabled: useTorch.value,
          }),
        stop: () => ppgService.stop(),
      },
      scg: {
        start: () => scgService.start(),
        stop: () => scgService.stop(),
      },
    });
  } else {
    const callbacks = {
      onIBI: (sample: IBISample) => {
        measurementSession?.addDetectedSample(sample);
        addHrDataPoint(sample);
        addDebugLine(
          `IBI: ${sample.interval.toFixed(0)}ms (${(60000 / sample.interval).toFixed(0)} BPM) q=${sample.quality.toFixed(2)}`
        );
      },
      onHeartRateEstimate: recordHeartRateEstimate,
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
        measurementSession?.reportSensorError(err);
        addDebugLine(`ERROR: ${err.message}`);
      },
    };

    if (selectedSensor.value === 'camera') {
      addDebugLine(`Starting camera PPG (torch=${useTorch.value}, camera=${selectedCameraId.value || 'default'})...`);
      return measurementSession.start({
        ppg: {
          start: () =>
            ppgService.start({
              callbacks,
              cameraDeviceId: selectedCameraId.value || undefined,
              torchEnabled: useTorch.value,
            }),
          stop: () => ppgService.stop(),
        },
      });
    } else {
      addDebugLine('Starting accelerometer SCG...');
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

function addHrDataPoint(sample: IBISample) {
  const hr = 60000 / sample.interval;
  hrDataPoints.value.push({
    time: elapsedSeconds.value,
    hr,
    quality: sample.quality,
  });
}

function addHeartRateEstimateDataPoint(estimate: HeartRateEstimate) {
  hrDataPoints.value.push({
    time: elapsedSeconds.value,
    hr: estimate.bpm,
    quality: estimate.quality,
  });
}

function recordHeartRateEstimate(estimate: HeartRateEstimate) {
  measurementSession?.addHeartRateEstimate(estimate);
  addHeartRateEstimateDataPoint(estimate);
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
    ctx.fillStyle = chartColors.muted;
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Waiting for sensor data...', w / 2, h / 2);
    return;
  }

  // Show the most recent 5 seconds based on timestamps
  const VISIBLE_SECONDS = 8; // Show 8 seconds — enough for ~8-10 heartbeats
  const latestTime = data[data.length - 1].time;
  const cutoffTime = latestTime - VISIBLE_SECONDS * 1000;
  let startIdx = data.length - 1;
  while (startIdx > 0 && data[startIdx - 1].time >= cutoffTime) startIdx--;
  const visible = data.slice(startIdx);
  if (visible.length < 3) return;

  // Apply 5-point moving average for smoother display
  const smoothed: number[] = [];
  const SMOOTH_W = 5;
  for (let i = 0; i < visible.length; i++) {
    let sum = 0,
      count = 0;
    for (
      let j = Math.max(0, i - Math.floor(SMOOTH_W / 2));
      j <= Math.min(visible.length - 1, i + Math.floor(SMOOTH_W / 2));
      j++
    ) {
      sum += visible[j].value;
      count++;
    }
    smoothed.push(sum / count);
  }

  // IQR-based scale — very robust against movement spikes
  const sortedSmooth = [...smoothed].sort((a, b) => a - b);
  const q1 = sortedSmooth[Math.floor(sortedSmooth.length * 0.25)] ?? 0;
  const q3 = sortedSmooth[Math.floor(sortedSmooth.length * 0.75)] ?? 0;
  const iqr = q3 - q1 || 0.01;
  // Show 2x IQR around the median for tight, stable scaling
  const med = sortedSmooth[Math.floor(sortedSmooth.length * 0.5)] ?? 0;
  const minV = med - iqr * 1.5;
  const maxV = med + iqr * 1.5;
  const range = maxV - minV || 0.01;

  // Helper to map value to Y pixel
  const toY = (v: number) => {
    const clamped = Math.max(minV, Math.min(maxV, v));
    return h - ((clamped - minV) / range) * h;
  };

  // Gradient fill under curve
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, `${chartColors.sage}0f`);
  bgGrad.addColorStop(1, 'transparent');
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let i = 0; i < smoothed.length; i++) {
    ctx.lineTo((i / (smoothed.length - 1)) * w, toY(smoothed[i]));
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fillStyle = bgGrad;
  ctx.fill();

  // Draw smoothed signal line
  ctx.beginPath();
  ctx.strokeStyle = chartColors.sage;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < smoothed.length; i++) {
    const x = (i / (smoothed.length - 1)) * w;
    if (i === 0) ctx.moveTo(x, toY(smoothed[i]));
    else ctx.lineTo(x, toY(smoothed[i]));
  }
  ctx.stroke();

  // Overlay detected heartbeat markers from recent IBIs
  if (hrDataPoints.value.length > 0) {
    const recentBeats = hrDataPoints.value.filter((p) => {
      const beatTimeMs = p.time * 1000; // p.time is in seconds elapsed
      return beatTimeMs >= elapsedSeconds.value * 1000 - VISIBLE_SECONDS * 1000;
    });

    // Show beat markers as vertical ticks at the top of the chart
    ctx.fillStyle = `${chartColors.sand}b3`;
    for (const beat of recentBeats) {
      // Map beat time to X position (approximate — beats are in seconds, chart is in ms)
      const beatMs = beat.time * 1000;
      const xFrac = (beatMs - (elapsedSeconds.value * 1000 - VISIBLE_SECONDS * 1000)) / (VISIBLE_SECONDS * 1000);
      if (xFrac >= 0 && xFrac <= 1) {
        const x = xFrac * w;
        // Small triangle/dot at top
        ctx.beginPath();
        ctx.arc(x, 6, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Show live BPM in top-right
    const lastBeat = hrDataPoints.value[hrDataPoints.value.length - 1];
    if (lastBeat) {
      ctx.fillStyle = chartColors.sand;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${lastBeat.hr.toFixed(0)} BPM`, w - 4, 14);
    }
  }

  // Subtle center line
  const centerY = h / 2;
  ctx.beginPath();
  ctx.strokeStyle = chartColors.lineSubtle;
  ctx.lineWidth = 0.5;
  ctx.setLineDash([3, 3]);
  ctx.moveTo(0, centerY);
  ctx.lineTo(w, centerY);
  ctx.stroke();
  ctx.setLineDash([]);
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
const measurementNotice = ref<string | null>(null);
const isStartPending = ref(false);
let appIsActive = true;
let startGeneration = 0;
let lifecycleGeneration = 0;
let pendingStartGeneration: number | null = null;

async function showPrepScreen(protocol: Protocol | null) {
  prepProtocol.value = protocol;
  customDuration.value = protocol?.duration ?? 120;
  permissionError.value = null;
  showRecoveryActions.value = false;
  showPrep.value = true;

  // Load available cameras when camera sensor is selected
  if (selectedSensor.value === 'camera' || selectedSensor.value === 'dual') {
    availableCameras.value = await listCameras();
  }
}

async function confirmStart() {
  if (isStartPending.value) return;
  const generation = ++startGeneration;
  const lifecycleAtStart = lifecycleGeneration;
  pendingStartGeneration = generation;
  isStartPending.value = true;
  const protocol = prepProtocol.value;

  try {
    permissionError.value = null;
    measurementNotice.value = null;
    addDebugLine(`Requesting permissions for ${selectedSensor.value} mode...`);

    const permissions = await requestSensorPermissions(selectedSensor.value);
    addDebugLine(`Permissions: camera=${permissions.camera} motion=${permissions.motion}`);

    if (generation !== startGeneration) return;
    if (lifecycleAtStart !== lifecycleGeneration || !appIsActive) {
      permissionError.value = MEASUREMENT_INTERRUPTION_MESSAGE;
      showRecoveryActions.value = false;
      showPrep.value = true;
      return;
    }

    const permissionMessage = getPermissionDeniedMessage(permissions);
    if (permissionMessage) {
      permissionError.value = permissionMessage;
      addDebugLine(`Permission denied: ${permissionMessage}`);
      return;
    }

    if (protocol) {
      await startProtocol(protocol);
    } else {
      await startFreeform();
    }

    if (generation !== startGeneration) return;
    if (lifecycleAtStart !== lifecycleGeneration || !appIsActive) {
      permissionError.value = MEASUREMENT_INTERRUPTION_MESSAGE;
      showPrep.value = true;
      prepProtocol.value = protocol;
      return;
    }
    showPrep.value = false;
    prepProtocol.value = null;
  } finally {
    if (pendingStartGeneration === generation) {
      pendingStartGeneration = null;
      isStartPending.value = false;
    }
  }
}

function cancelPendingStart() {
  startGeneration += 1;
  if (measurementSession) {
    if (selectedSensor.value === 'dual') sensorFusionService.reset();
    measurementSession.interrupt('Measurement start cancelled.');
    measurementSession = null;
  }
  showPrep.value = false;
  prepProtocol.value = null;
}

async function enableKeepAwake() {
  if (Capacitor.isNativePlatform()) {
    try {
      await KeepAwake.keepAwake();
    } catch {
      /* ignore */
    }
  }
}

async function disableKeepAwake() {
  if (Capacitor.isNativePlatform()) {
    try {
      await KeepAwake.allowSleep();
    } catch {
      /* ignore */
    }
  }
}

async function startProtocol(protocol: Protocol) {
  selectedProtocol.value = protocol;
  collectedIBIs.value = [];
  hrDataPoints.value = [];
  rawSignalData.value = [];
  debugLog.value = [];
  isMeasuring.value = false;
  showResults.value = false;
  elapsedSeconds.value = 0;
  sensorQuality.value = 0;
  measurementNotes.value = '';
  measurementSaveError.value = '';
  measurementStartTime.value = new Date();
  currentEligibility.value = null;
  currentSampleProvenance.value = [];
  currentAcquisitionSources.value = [];
  showRecoveryActions.value = false;

  addDebugLine(`Starting ${protocol.name} with ${selectedSensor.value} sensor`);
  const outcome = await startSensor(protocol.id as MeasurementProtocol);
  if (!outcome.ok) {
    permissionError.value = outcome.message ?? 'Unable to start the selected sensor.';
    showRecoveryActions.value = true;
    return;
  }
  if (outcome.degradedSources?.length) {
    addDebugLine(`Continuing without ${outcome.degradedSources.join(' and ')}`);
    measurementNotice.value = `One sensor is unavailable. Continuing with ${
      outcome.degradedSources.includes('scg') ? 'the camera' : 'the chest sensor'
    } only.`;
  }
  isMeasuring.value = true;
  void enableKeepAwake();
}

async function startFreeform() {
  selectedProtocol.value = null;
  collectedIBIs.value = [];
  hrDataPoints.value = [];
  rawSignalData.value = [];
  debugLog.value = [];
  isMeasuring.value = false;
  showResults.value = false;
  elapsedSeconds.value = 0;
  sensorQuality.value = 0;
  measurementNotes.value = '';
  measurementSaveError.value = '';
  measurementStartTime.value = new Date();
  currentEligibility.value = null;
  currentSampleProvenance.value = [];
  currentAcquisitionSources.value = [];
  showRecoveryActions.value = false;

  const outcome = await startSensor('freeform');
  if (!outcome.ok) {
    permissionError.value = outcome.message ?? 'Unable to start the selected sensor.';
    showRecoveryActions.value = true;
    return;
  }
  if (outcome.degradedSources?.length) {
    addDebugLine(`Continuing without ${outcome.degradedSources.join(' and ')}`);
    measurementNotice.value = `One sensor is unavailable. Continuing with ${
      outcome.degradedSources.includes('scg') ? 'the camera' : 'the chest sensor'
    } only.`;
  }
  isMeasuring.value = true;
  void enableKeepAwake();
}

function stopMeasurement() {
  void disableKeepAwake();
  if (selectedSensor.value === 'dual') sensorFusionService.reset();
  const capturedSamples = measurementSession?.getResult().samples ?? [];
  const protocol = (selectedProtocol.value?.id as MeasurementProtocol | undefined) ?? 'freeform';
  const finalized = finalizeMeasurement(capturedSamples, protocol, {
    settlingSeconds: SETTLING_SECONDS,
    endingSeconds: ENDING_SECONDS,
  });
  const sessionResult = measurementSession?.stop(finalized.samples);
  measurementSession = null;
  collectedIBIs.value = sessionResult?.samples ?? [];
  currentEligibility.value = sessionResult?.eligibility ?? null;
  currentAcquisitionSources.value = sessionResult?.activeSources ?? [];
  currentSampleProvenance.value =
    sessionResult?.samples.flatMap((sample) => (sample.provenance ? [sample.provenance] : [])) ?? [];
  isMeasuring.value = false;

  const ibis = collectedIBIs.value;
  addDebugLine(`Finalized IBIs: ${capturedSamples.length} → ${ibis.length} (removed 5s start, 3s end)`);

  if (sessionResult?.eligibility && !sessionResult.eligibility.eligible) {
    permissionError.value = measurementEligibilityMessage(sessionResult.eligibility.reasons);
    showRecoveryActions.value = true;
    addDebugLine(`Measurement unavailable: ${sessionResult.eligibility.reasons.join(', ')}`);
  } else if (ibis.length >= 10) {
    currentAnalysis.value = analyzeHRV({
      samples: ibis,
      analyzedDurationSeconds: finalized.analyzedDurationSeconds,
      eligibility: sessionResult?.eligibility ?? finalized.eligibility,
    });
    showResults.value = true;
    soundService.playCompletionChime();
  } else {
    addDebugLine(`Not enough IBIs after trimming: ${ibis.length} (need >= 10)`);
    permissionError.value =
      'There were not enough clean pulse beats for a reliable result. Reposition the sensor and try again.';
    showRecoveryActions.value = true;
  }
}

const MEASUREMENT_INTERRUPTION_MESSAGE =
  'Measurement interrupted when the app became inactive. Reposition the sensor and restart.';

function interruptMeasurement() {
  const sessionState = measurementSession?.getResult().state;
  const hasActiveSession = sessionState === 'starting' || sessionState === 'acquiring' || sessionState === 'measuring';
  if (!hasActiveSession && !isMeasuring.value) return;

  void disableKeepAwake();
  if (selectedSensor.value === 'dual') sensorFusionService.reset();
  measurementSession?.interrupt(MEASUREMENT_INTERRUPTION_MESSAGE);
  measurementSession = null;
  isMeasuring.value = false;
  showResults.value = false;
  currentAnalysis.value = null;
  collectedIBIs.value = [];
  currentEligibility.value = null;
  currentSampleProvenance.value = [];
  currentAcquisitionSources.value = [];
  hrDataPoints.value = [];
  rawSignalData.value = [];
  sensorQuality.value = 0;
  measurementNotice.value = null;
  permissionError.value = MEASUREMENT_INTERRUPTION_MESSAGE;
  showRecoveryActions.value = true;
}

async function retryMeasurement() {
  const protocol = selectedProtocol.value;
  permissionError.value = null;
  showRecoveryActions.value = false;
  await showPrepScreen(protocol);
}

function chooseAnotherSensor() {
  permissionError.value = null;
  showRecoveryActions.value = false;
  mode.value = 'freeform';
}

function dismissRecovery() {
  permissionError.value = null;
  measurementNotice.value = null;
  showRecoveryActions.value = false;
}

function measurementEligibilityMessage(reasons: string[]): string {
  if (reasons.includes('duration-too-short')) {
    return 'This recording was too short for the selected protocol. Try again and complete the full timer.';
  }
  if (reasons.includes('low-signal-quality') || reasons.includes('too-many-artifacts')) {
    return 'Signal quality was too low for a reliable result. Reposition the sensor, stay still, and try again.';
  }
  if (
    reasons.includes('insufficient-coverage') ||
    reasons.includes('sample-gap-too-long') ||
    reasons.includes('sensor-error')
  ) {
    return 'The sensor stream was interrupted or incomplete. Keep the app open, reposition the sensor, and try again.';
  }
  return 'There were not enough clean detected beats for a reliable result. Reposition the sensor and try again.';
}

function eligibilityWarningMessage(warning: MeasurementEligibility['warnings'][number]): string {
  if (warning === 'elevated-artifacts') {
    return 'More beats than usual needed correction, so this reading is not used for trend comparisons.';
  }
  if (warning === 'limited-coverage') {
    return 'The sensor covered less than 95% of the recording, so this reading is not used for trend comparisons.';
  }
  return 'SDNN from a short recording is shown only as a short-recording estimate.';
}

function poincareUnavailableMessage(reason: PoincareUnavailableReason): string {
  if (reason === 'protocol-not-supported') {
    return 'This protocol does not include a Poincaré plot.';
  }
  if (reason === 'insufficient-data' || reason === 'insufficient-beats') {
    return 'More clean pulse intervals are needed before this plot can be calculated.';
  }
  if (reason === 'low-signal-quality' || reason === 'too-many-artifacts') {
    return 'Signal quality was not stable enough for a Poincaré plot. Stay still and try again.';
  }
  return 'This recording did not provide a valid interval series for a Poincaré plot.';
}

async function saveResults() {
  if (!currentAnalysis.value || isSavingMeasurement.value) return;
  isSavingMeasurement.value = true;
  measurementSaveError.value = '';
  try {
    await hrvStorage.saveMeasurement({
      id: crypto.randomUUID(),
      type: (selectedProtocol.value?.id as 'quick-check' | 'full-analysis' | 'morning-readiness') ?? 'freeform',
      startedAt: measurementStartTime.value,
      completedAt: new Date(),
      durationSeconds: currentEligibility.value?.observedDurationSeconds ?? elapsedSeconds.value,
      sensorMode: selectedSensor.value,
      acquisitionSources: currentAcquisitionSources.value.length > 0 ? [...currentAcquisitionSources.value] : undefined,
      analysis: currentAnalysis.value,
      algorithmVersion: 2,
      eligibility: currentEligibility.value ?? undefined,
      sampleProvenance: {
        sources: [...new Set(currentSampleProvenance.value.map((item) => item.source))],
        detectionMethods: [...new Set(currentSampleProvenance.value.map((item) => item.method))],
      },
      notes: measurementNotes.value || undefined,
    });
  } catch {
    measurementSaveError.value = 'Your measurement could not be saved. Please try again.';
    return;
  } finally {
    isSavingMeasurement.value = false;
  }
  showResults.value = false;
  currentAnalysis.value = null;
  await loadRecentResults();
}

function discardResults() {
  measurementSaveError.value = '';
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
    measurements.value = await hrvStorage.getMeasurements();
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
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (remaining === 0) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  return minutes === 0 ? `${remaining} sec` : `${minutes} min ${remaining} sec`;
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
    freeform: 'Freeform',
    'assessment-trial': 'Assessment Trial',
  };
  return names[type] ?? type;
}

// Lifecycle
useAppLifecycle({
  onInactive: () => {
    appIsActive = false;
    lifecycleGeneration += 1;
    startGeneration += 1;
    if (pendingStartGeneration !== null) {
      permissionError.value = MEASUREMENT_INTERRUPTION_MESSAGE;
      showRecoveryActions.value = false;
      showPrep.value = true;
    }
    interruptMeasurement();
  },
  onActive: () => {
    appIsActive = true;
  },
});

onMounted(async () => {
  await hrvStorage.initialize();
  await Promise.all([loadRecentResults(), loadLatestAssessment()]);
});

onUnmounted(() => {
  appIsActive = false;
  lifecycleGeneration += 1;
  startGeneration += 1;
  if (measurementSession) {
    if (selectedSensor.value === 'dual') sensorFusionService.reset();
    measurementSession.interrupt('Measurement closed before completion.');
    measurementSession = null;
    void disableKeepAwake();
  }
});
</script>
