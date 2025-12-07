<template>
  <div class="space-y-4 sm:space-y-6">
    <!-- Quick Start / Practice View - Always at Top -->
    <div class="card-solid !p-4 sm:!p-6">
      <BreathingVisualizer
        :phase="timer.phase.value"
        :current-time="timer.currentTime.value"
        :total-time="timer.totalPhaseTime.value"
        :scale="timer.breathingScale.value"
        :is-running="timer.isRunning.value"
      />

      <!-- Current Pattern Display (when not running) -->
      <div v-if="!isRunning" class="mt-4 sm:mt-6 text-center">
        <div class="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50 rounded-xl text-slate-300">
          <span class="text-blue-400 font-semibold">{{ config.inhaleTime }}s</span>
          <span class="text-slate-500">→</span>
          <span v-if="config.inhaleHoldTime" class="text-purple-400 font-semibold">{{ config.inhaleHoldTime }}s</span>
          <span v-if="config.inhaleHoldTime" class="text-slate-500">→</span>
          <span class="text-emerald-400 font-semibold">{{ config.exhaleTime }}s</span>
          <span v-if="config.exhaleHoldTime" class="text-slate-500">→</span>
          <span v-if="config.exhaleHoldTime" class="text-amber-400 font-semibold">{{ config.exhaleHoldTime }}s</span>
          <span class="text-slate-500 ml-2">×</span>
          <span class="text-white font-semibold">{{ config.repetitions }} reps</span>
        </div>
      </div>

      <!-- Progress Stats (when running) -->
      <div v-if="isRunning" class="mt-4 sm:mt-8 grid grid-cols-3 gap-4">
        <div class="stat-card">
          <div class="text-3xl font-bold text-white">
            {{ timer.currentRepetition.value }}
            <span class="text-slate-500 text-lg">/ {{ config.repetitions }}</span>
          </div>
          <div class="text-sm text-slate-400 mt-1">Repetitions</div>
        </div>
        <div class="stat-card">
          <div class="text-3xl font-bold text-white">
            {{ timer.currentSet.value }}
            <span class="text-slate-500 text-lg">/ {{ config.targetSets || '∞' }}</span>
          </div>
          <div class="text-sm text-slate-400 mt-1">Set</div>
        </div>
        <div class="stat-card">
          <div class="text-3xl font-bold text-emerald-400">
            {{ currentSession?.completedSets || 0 }}
          </div>
          <div class="text-sm text-slate-400 mt-1">Completed</div>
        </div>
      </div>

      <!-- Extended Hold Controls -->
      <div
        v-if="timer.phase.value === 'EXTENDED_INHALE_HOLD' || timer.phase.value === 'EXTENDED_EXHALE_HOLD'"
        class="mt-8 text-center p-6 glass rounded-2xl animate-scale-in"
      >
        <p class="text-slate-300 mb-3">Hold as long as comfortable</p>
        <p class="text-5xl font-mono font-bold text-indigo-400 animate-pulse-glow">
          {{ formatTime(timer.extendedHoldElapsed.value) }}
        </p>
        <button @click="endExtendedHold" class="mt-6 btn-warning btn-action">
          <span class="flex items-center gap-2 justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Release Hold
          </span>
        </button>
      </div>

      <!-- Set Complete Controls -->
      <div v-if="timer.phase.value === 'SET_COMPLETE'" class="mt-8 text-center p-8 glass rounded-2xl animate-scale-in">
        <div class="flex flex-col sm:flex-row justify-center gap-4">
          <button @click="startNextSet" class="btn-success btn-action">
            <span class="flex items-center gap-2 justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Start Next Set
            </span>
          </button>
          <button @click="finishSession" class="btn-secondary btn-action">
            <span class="flex items-center gap-2 justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Finish Session
            </span>
          </button>
        </div>
      </div>

      <!-- Session Complete -->
      <div v-if="timer.phase.value === 'SESSION_COMPLETE'" class="mt-8 text-center p-8 glass rounded-2xl animate-scale-in">
        <div class="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
          </svg>
        </div>
        <p class="text-3xl text-emerald-400 font-bold mb-2">Session Complete!</p>
        <p class="text-slate-400 mb-6">Great job on completing your breathing practice!</p>
        <button @click="resetExercise" class="btn-primary btn-action">
          <span class="flex items-center gap-2 justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Start New Session
          </span>
        </button>
      </div>

      <!-- Main Controls - Prominently at Top -->
      <div
        v-if="timer.phase.value !== 'SESSION_COMPLETE' && timer.phase.value !== 'SET_COMPLETE'"
        class="mt-4 sm:mt-8 flex flex-col sm:flex-row justify-center gap-4"
      >
        <button v-if="!timer.isRunning.value" @click="startExercise" class="btn-success btn-action">
          <span class="flex items-center gap-2 justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Start Practice
          </span>
        </button>

        <template v-else>
          <button v-if="!timer.isPaused.value" @click="timer.pause()" class="btn-warning btn-action">
            <span class="flex items-center gap-2 justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Pause
            </span>
          </button>
          <button v-else @click="timer.resume()" class="btn-primary btn-action">
            <span class="flex items-center gap-2 justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Resume
            </span>
          </button>

          <button @click="stopExercise" class="btn-danger btn-action">
            <span class="flex items-center gap-2 justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
              </svg>
              Stop
            </span>
          </button>
        </template>
      </div>
    </div>

    <!-- Configuration Panel - Collapsible when not running -->
    <div v-if="!isRunning" class="card-solid animate-fade-in">
      <button @click="showConfig = !showConfig" class="w-full flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div class="text-left">
            <h2 class="text-xl font-bold text-white">Configure Practice</h2>
            <p class="text-sm text-slate-400">Customize your breathing pattern</p>
          </div>
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          :class="['w-6 h-6 text-slate-400 transition-transform', showConfig ? 'rotate-180' : '']"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      <div v-if="showConfig" class="mt-6">
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Basic Timing -->
          <div class="space-y-5">
            <h3 class="font-semibold text-slate-200 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Breathing Timing
            </h3>

            <div class="grid grid-cols-2 gap-4">
              <div>
                <label class="form-label">Inhale (sec)</label>
                <input v-model.number="config.inhaleTime" type="number" min="1" max="60" class="form-input" />
              </div>
              <div>
                <label class="form-label">Inhale Hold</label>
                <input v-model.number="config.inhaleHoldTime" type="number" min="0" max="60" class="form-input" />
              </div>
              <div>
                <label class="form-label">Exhale (sec)</label>
                <input v-model.number="config.exhaleTime" type="number" min="1" max="60" class="form-input" />
              </div>
              <div>
                <label class="form-label">Exhale Hold</label>
                <input v-model.number="config.exhaleHoldTime" type="number" min="0" max="60" class="form-input" />
              </div>
            </div>

            <div>
              <label class="form-label">Repetitions per Set</label>
              <input v-model.number="config.repetitions" type="number" min="1" max="100" class="form-input" />
            </div>
          </div>

          <!-- Extended Hold & Sets -->
          <div class="space-y-5">
            <h3 class="font-semibold text-slate-200 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Extended Hold
            </h3>

            <div class="flex items-center gap-3">
              <button
                @click="config.extendedHoldEnabled = !config.extendedHoldEnabled"
                :class="['toggle', config.extendedHoldEnabled ? 'toggle-enabled' : 'toggle-disabled']"
              >
                <span :class="['toggle-knob', config.extendedHoldEnabled ? 'toggle-knob-enabled' : 'toggle-knob-disabled']" />
              </button>
              <span class="text-slate-300">Enable Extended Hold</span>
            </div>

            <template v-if="config.extendedHoldEnabled">
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label">Hold Type</label>
                  <select v-model="config.extendedHoldType" class="form-select">
                    <option value="INHALE">Inhale Hold</option>
                    <option value="EXHALE">Exhale Hold</option>
                  </select>
                </div>
                <div>
                  <label class="form-label">Mode</label>
                  <select v-model="config.extendedHoldMode" class="form-select">
                    <option value="TOLERANCE">Tolerance</option>
                    <option value="TIMED">Timed</option>
                  </select>
                </div>
              </div>

              <div v-if="config.extendedHoldMode === 'TIMED'">
                <label class="form-label">Hold Duration (seconds)</label>
                <input v-model.number="config.extendedHoldDuration" type="number" min="1" max="300" class="form-input" />
              </div>

              <!-- Second Extended Hold -->
              <div class="pt-4 border-t border-slate-700/50">
                <div class="flex items-center gap-3 mb-3">
                  <button
                    @click="config.secondExtendedHoldEnabled = !config.secondExtendedHoldEnabled"
                    :class="['toggle', config.secondExtendedHoldEnabled ? 'toggle-enabled' : 'toggle-disabled']"
                  >
                    <span :class="['toggle-knob', config.secondExtendedHoldEnabled ? 'toggle-knob-enabled' : 'toggle-knob-disabled']" />
                  </button>
                  <span class="text-slate-300">Second Extended Hold</span>
                </div>

                <div v-if="config.secondExtendedHoldEnabled">
                  <label class="form-label">Second Hold Type</label>
                  <select v-model="config.secondExtendedHoldType" class="form-select">
                    <option value="INHALE">Inhale Hold</option>
                    <option value="EXHALE">Exhale Hold</option>
                  </select>
                </div>
              </div>
            </template>

            <div class="pt-4 border-t border-slate-700/50">
              <h3 class="font-semibold text-slate-200 flex items-center gap-2 mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
                Sets
              </h3>
              <div>
                <label class="form-label">Target Sets (0 = unlimited)</label>
                <input v-model.number="config.targetSets" type="number" min="0" max="20" class="form-input" />
              </div>
            </div>
          </div>
        </div>

        <!-- Save Config -->
        <div class="mt-8 pt-6 border-t border-slate-700/50 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
          <div class="flex-1">
            <input v-model="configName" type="text" placeholder="Enter a name to save this configuration..." class="form-input" />
          </div>
          <button @click="saveConfig" class="btn-secondary whitespace-nowrap">
            <span class="flex items-center gap-2 justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              Save Preset
            </span>
          </button>
        </div>
      </div>
    </div>

    <!-- Session Notes -->
    <div v-if="currentSession && timer.phase.value === 'SESSION_COMPLETE'" class="card-solid animate-fade-in">
      <h3 class="font-bold text-white mb-4 flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
        Session Notes
      </h3>
      <textarea v-model="sessionNotes" rows="3" class="form-input resize-none" placeholder="Add any notes about this session..."></textarea>
      <button @click="saveSessionNotes" class="mt-3 btn-secondary">Save Notes</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, inject, onMounted } from 'vue';
import BreathingVisualizer from './BreathingVisualizer.vue';
import { useBreathingTimer, useStorage } from '../composables';
import {
  DEFAULT_BREATHING_CONFIG,
  formatTime,
  type BreathingConfig,
  type Session,
  type SessionSet,
} from '@breath-in-flow/shared';

const LAST_CONFIG_KEY = 'herb_breathing_last_config';

const storage = useStorage();
const selectedConfig = inject<{ value: BreathingConfig | null }>('selectedConfig');

// UI state
const showConfig = ref(false);

// Configuration - start with defaults, will be overwritten by saved config
const config = reactive<BreathingConfig>({
  ...DEFAULT_BREATHING_CONFIG,
  name: 'Quick Practice',
});
const configName = ref('');

// Session state
const currentSession = ref<Session | null>(null);
const currentSetData = ref<SessionSet | null>(null);
const sessionNotes = ref('');

// Load last used config on mount
onMounted(() => {
  const savedConfig = localStorage.getItem(LAST_CONFIG_KEY);
  if (savedConfig) {
    try {
      const parsed = JSON.parse(savedConfig);
      Object.assign(config, parsed);
      configName.value = parsed.name || '';
    } catch {
      // Invalid saved config, use defaults
    }
  }
});

// Save config to localStorage whenever it changes
watch(
  config,
  (newConfig) => {
    localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(newConfig));
  },
  { deep: true }
);

// Timer
const timer = useBreathingTimer(config, {
  onPhaseChange: (phase, _state) => {
    console.log('Phase changed:', phase);
  },
  onRepetitionComplete: (rep, _state) => {
    console.log('Repetition complete:', rep);
    if (currentSetData.value) {
      currentSetData.value.completedRepetitions = rep;
    }
  },
  onSetComplete: (set, _state) => {
    console.log('Set complete:', set);
    if (currentSession.value && currentSetData.value) {
      currentSetData.value.completedAt = new Date();
      storage.addSetToSession(currentSession.value.id!, currentSetData.value);
    }
  },
  onExtendedHoldStart: (type, _state) => {
    console.log('Extended hold started:', type);
  },
  onExtendedHoldEnd: (duration, type, _state) => {
    console.log('Extended hold ended:', duration, type);
    if (currentSession.value && currentSetData.value) {
      storage.addExtendedHoldToSet(currentSession.value.id!, currentSession.value.sets.length, {
        type,
        mode: config.extendedHoldMode,
        targetDuration: config.extendedHoldMode === 'TIMED' ? config.extendedHoldDuration : undefined,
        actualDuration: duration,
        completedAt: new Date(),
      });
    }
  },
  onSessionComplete: (_state) => {
    console.log('Session complete');
    if (currentSession.value) {
      storage.completeSession(currentSession.value.id!);
    }
  },
});

// Watch for config changes from parent (when loading presets)
watch(
  () => selectedConfig?.value,
  (newConfig: BreathingConfig | null | undefined) => {
    if (newConfig) {
      Object.assign(config, newConfig);
      configName.value = newConfig.name;
    }
  },
  { immediate: true }
);

// Check if practice is running
const isRunning = ref(false);
watch(
  () => timer.isRunning.value,
  (running: boolean) => {
    isRunning.value = running;
  }
);

function startExercise() {
  // Create new session
  currentSession.value = storage.createSession(config);

  // Create first set
  currentSetData.value = {
    setNumber: 1,
    completedRepetitions: 0,
    extendedHolds: [],
    startedAt: new Date(),
  };

  timer.start();
}

function stopExercise() {
  if (currentSession.value) {
    storage.cancelSession(currentSession.value.id!);
  }
  timer.stop();
  currentSession.value = null;
  currentSetData.value = null;
}

function endExtendedHold() {
  timer.endExtendedHold();
}

function startNextSet() {
  // Create new set data
  currentSetData.value = {
    setNumber: timer.currentSet.value + 1,
    completedRepetitions: 0,
    extendedHolds: [],
    startedAt: new Date(),
  };

  timer.nextSet();
}

function finishSession() {
  if (currentSession.value) {
    storage.completeSession(currentSession.value.id!);
  }
  timer.stop();
  currentSession.value = null;
  currentSetData.value = null;
}

function resetExercise() {
  timer.stop();
  currentSession.value = null;
  currentSetData.value = null;
}

function saveConfig() {
  if (!configName.value.trim()) {
    alert('Please enter a configuration name');
    return;
  }

  storage.createConfig({
    ...config,
    name: configName.value.trim(),
  });

  alert('Configuration saved!');
}

function saveSessionNotes() {
  if (currentSession.value) {
    storage.updateSession(currentSession.value.id!, { notes: sessionNotes.value });
    alert('Notes saved!');
  }
}
</script>
