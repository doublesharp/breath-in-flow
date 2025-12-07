<template>
  <div class="space-y-6">
    <div class="card-solid animate-fade-in">
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Saved Presets</h2>
          <p class="text-sm text-slate-400">Your custom breathing configurations</p>
        </div>
      </div>

      <div v-if="configs.length === 0" class="text-center py-12 glass rounded-xl">
        <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
          </svg>
        </div>
        <p class="text-slate-400">No saved configurations yet.</p>
        <p class="text-slate-500 text-sm mt-1">Create one in the Exercise tab!</p>
      </div>

      <div v-else class="space-y-4">
        <div
          v-for="config in configs"
          :key="config.id"
          class="glass rounded-xl p-5 hover:bg-white/10 transition-all duration-300"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1">
              <div class="font-semibold text-white text-lg">{{ config.name }}</div>
              <div class="text-sm text-slate-400 mt-1">
                Created {{ formatDate(config.createdAt) }}
              </div>
            </div>
            <div class="flex items-center gap-3">
              <button @click="$emit('loadConfig', config)" class="btn-primary">
                <span class="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  Load
                </span>
              </button>
              <button
                @click="deleteConfig(config.id!)"
                class="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all flex items-center justify-center"
                title="Delete configuration"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fill-rule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clip-rule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>

          <!-- Config Details -->
          <div class="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3">
              <div class="text-xs text-blue-400 uppercase tracking-wider">Inhale</div>
              <div class="text-lg font-semibold text-white mt-1">{{ config.inhaleTime }}s</div>
              <div v-if="config.inhaleHoldTime > 0" class="text-xs text-slate-400 mt-0.5">
                + {{ config.inhaleHoldTime }}s hold
              </div>
            </div>
            <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3">
              <div class="text-xs text-emerald-400 uppercase tracking-wider">Exhale</div>
              <div class="text-lg font-semibold text-white mt-1">{{ config.exhaleTime }}s</div>
              <div v-if="config.exhaleHoldTime > 0" class="text-xs text-slate-400 mt-0.5">
                + {{ config.exhaleHoldTime }}s hold
              </div>
            </div>
            <div class="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3">
              <div class="text-xs text-purple-400 uppercase tracking-wider">Repetitions</div>
              <div class="text-lg font-semibold text-white mt-1">{{ config.repetitions }}</div>
            </div>
            <div class="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <div class="text-xs text-amber-400 uppercase tracking-wider">Target Sets</div>
              <div class="text-lg font-semibold text-white mt-1">
                {{ config.targetSets || '∞' }}
              </div>
            </div>
          </div>

          <!-- Extended Hold Info -->
          <div v-if="config.extendedHoldEnabled" class="mt-4 flex flex-wrap gap-2">
            <span
              class="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg text-sm border border-indigo-500/30"
            >
              Extended {{ config.extendedHoldType }} Hold ({{
                config.extendedHoldMode === 'TIMED'
                  ? config.extendedHoldDuration + 's'
                  : 'Tolerance'
              }})
            </span>
            <span
              v-if="config.secondExtendedHoldEnabled"
              class="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg text-sm border border-indigo-500/30"
            >
              + Second {{ config.secondExtendedHoldType }} Hold
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Preset Configurations -->
    <div class="card-solid animate-fade-in" style="animation-delay: 0.1s">
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
            />
          </svg>
        </div>
        <div>
          <h3 class="text-xl font-bold text-white">Quick Presets</h3>
          <p class="text-sm text-slate-400">Popular breathing techniques</p>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <button
          v-for="preset in presets"
          :key="preset.name"
          @click="$emit('loadConfig', preset)"
          class="text-left glass rounded-xl p-5 hover:bg-white/10 hover:scale-[1.02] transition-all duration-300 group"
        >
          <div class="font-semibold text-white group-hover:text-blue-400 transition-colors">
            {{ preset.name }}
          </div>
          <div class="text-sm text-slate-400 mt-1">{{ preset.description }}</div>
          <div class="flex items-center gap-4 text-xs text-slate-500 mt-3">
            <span class="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M5 10l7-7m0 0l7 7m-7-7v18"
                />
              </svg>
              {{ preset.inhaleTime }}s in
            </span>
            <span class="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 14l-7 7m0 0l-7-7m7 7V3"
                />
              </svg>
              {{ preset.exhaleTime }}s out
            </span>
            <span class="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4 text-purple-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              {{ preset.repetitions }} reps
            </span>
          </div>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useStorage } from '../composables';
import { DEFAULT_BREATHING_CONFIG, type BreathingConfig } from '@breath-in-flow/shared';

defineEmits<{
  (e: 'loadConfig', config: BreathingConfig): void;
}>();

const storage = useStorage();
const configs = computed(() => storage.getAllConfigs());

interface Preset extends BreathingConfig {
  description: string;
}

const presets: Preset[] = [
  {
    ...DEFAULT_BREATHING_CONFIG,
    name: 'Box Breathing',
    description: 'Equal inhale, hold, exhale, hold - great for relaxation',
    inhaleTime: 4,
    inhaleHoldTime: 4,
    exhaleTime: 4,
    exhaleHoldTime: 4,
    repetitions: 4,
    extendedHoldEnabled: false,
    targetSets: 0,
  },
  {
    ...DEFAULT_BREATHING_CONFIG,
    name: '4-7-8 Relaxation',
    description: 'Classic relaxation technique',
    inhaleTime: 4,
    inhaleHoldTime: 7,
    exhaleTime: 8,
    exhaleHoldTime: 0,
    repetitions: 4,
    extendedHoldEnabled: false,
    targetSets: 0,
  },
  {
    ...DEFAULT_BREATHING_CONFIG,
    name: 'Wim Hof Style',
    description: 'Fast breathing with extended exhale hold',
    inhaleTime: 2,
    inhaleHoldTime: 0,
    exhaleTime: 2,
    exhaleHoldTime: 0,
    repetitions: 30,
    extendedHoldEnabled: true,
    extendedHoldType: 'EXHALE',
    extendedHoldMode: 'TOLERANCE',
    secondExtendedHoldEnabled: true,
    secondExtendedHoldType: 'INHALE',
    targetSets: 3,
  },
  {
    ...DEFAULT_BREATHING_CONFIG,
    name: 'Coherent Breathing',
    description: '5-second inhale and exhale for heart coherence',
    inhaleTime: 5,
    inhaleHoldTime: 0,
    exhaleTime: 5,
    exhaleHoldTime: 0,
    repetitions: 6,
    extendedHoldEnabled: false,
    targetSets: 0,
  },
  {
    ...DEFAULT_BREATHING_CONFIG,
    name: 'Altitude Adapted 3-5-7',
    description: 'Shorter hold for high altitude - reduces oxygen debt',
    inhaleTime: 3,
    inhaleHoldTime: 5,
    exhaleTime: 7,
    exhaleHoldTime: 0,
    repetitions: 6,
    extendedHoldEnabled: false,
    targetSets: 0,
  },
  {
    ...DEFAULT_BREATHING_CONFIG,
    name: 'Stress Relief (Quick)',
    description: '2-minute calming session',
    inhaleTime: 4,
    inhaleHoldTime: 2,
    exhaleTime: 6,
    exhaleHoldTime: 0,
    repetitions: 8,
    extendedHoldEnabled: false,
    targetSets: 1,
  },
];

function formatDate(date?: Date): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
}

function deleteConfig(id: string) {
  if (confirm('Are you sure you want to delete this configuration?')) {
    storage.deleteConfig(id);
  }
}
</script>
