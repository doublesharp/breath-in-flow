<template>
  <div class="space-y-6">
    <!-- Delete Confirmation Modal -->
    <Teleport to="body">
      <div
        v-if="showDeleteConfirmation"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-preset-title"
        class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        @click.self="showDeleteConfirmation = false"
      >
        <div class="card-solid max-w-md w-full animate-scale-in">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-xl bg-red-500/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-6 h-6 text-red-400"
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
              <h3 id="delete-preset-title" class="text-xl font-bold text-white mb-2">Delete Configuration?</h3>
              <p class="text-slate-300 mb-6">
                Are you sure you want to delete "{{ configToDelete?.name }}"? This action cannot be undone.
              </p>
              <div class="flex gap-3 justify-end">
                <button @click="showDeleteConfirmation = false" class="btn-secondary">Cancel</button>
                <button @click="confirmDelete" class="btn-danger">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <div class="card-solid animate-fade-in opacity-0">
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
        <div
          class="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-8 h-8 text-white"
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
        <p class="text-slate-400">No saved configurations yet.</p>
        <p class="text-slate-500 text-sm mt-1">Create one in the Practice tab!</p>
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
              <div class="text-sm text-slate-400 mt-1">Created {{ formatDate(config.createdAt) }}</div>
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
                :aria-label="`Delete ${config.name}`"
                class="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-all flex items-center justify-center"
                title="Delete configuration"
              >
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
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
              <div v-if="config.restBetweenSetsSeconds" class="text-xs text-slate-400 mt-0.5">
                {{ config.restBetweenSetsSeconds }}s rest
              </div>
            </div>
          </div>

          <!-- Extended Hold Info -->
          <div v-if="config.extendedHoldEnabled" class="mt-4 flex flex-wrap gap-2">
            <span class="px-3 py-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg text-sm border border-indigo-500/30">
              Extended {{ config.extendedHoldType }} Hold ({{
                config.extendedHoldMode === 'TIMED' ? config.extendedHoldDuration + 's' : 'Tolerance'
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
    <div class="card-solid animate-fade-in opacity-0" style="animation-delay: 0.1s">
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
        <article
          v-for="preset in presets"
          :key="preset.id"
          class="glass rounded-xl p-5 transition-colors duration-300 hover:bg-white/10"
        >
          <div class="font-semibold text-white">
            {{ preset.config.name }}
          </div>
          <div class="text-sm text-slate-400 mt-1">{{ preset.description }}</div>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-400 mt-3">
            <span class="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4 text-blue-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18" />
              </svg>
              {{ preset.config.inhaleTime }}s in
            </span>
            <span v-if="preset.config.inhaleHoldTime" class="text-amber-300">
              {{ preset.config.inhaleHoldTime }}s hold
            </span>
            <span class="flex items-center gap-1">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-4 h-4 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
              </svg>
              {{ preset.config.exhaleTime }}s out
            </span>
            <span v-if="preset.config.exhaleHoldTime" class="text-amber-300">
              {{ preset.config.exhaleHoldTime }}s hold
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
              {{ preset.config.repetitions }} reps
            </span>
            <span v-if="preset.config.targetSets > 0">{{ preset.config.targetSets }} sets</span>
            <span v-if="preset.config.restBetweenSetsSeconds > 0">
              {{ preset.config.restBetweenSetsSeconds }}s rest
            </span>
          </div>

          <div class="mt-5 flex flex-wrap gap-3">
            <button
              :data-testid="`load-${preset.id}`"
              class="btn-primary min-h-11 px-4 py-2"
              @click="loadPreset(preset)"
            >
              Use routine
            </button>
            <button
              v-if="preset.guidance"
              :data-testid="`guidance-${preset.id}`"
              class="btn-secondary min-h-11 px-4 py-2"
              :aria-expanded="expandedGuidanceId === preset.id"
              :aria-controls="`guidance-panel-${preset.id}`"
              @click="toggleGuidance(preset.id)"
            >
              {{ expandedGuidanceId === preset.id ? 'Hide guidance' : 'How to use' }}
            </button>
          </div>

          <section
            v-if="preset.guidance && expandedGuidanceId === preset.id"
            :id="`guidance-panel-${preset.id}`"
            class="mt-5 space-y-4 border-t border-white/10 pt-5 text-sm text-slate-300"
            role="region"
            :aria-label="`${preset.config.name} guidance`"
          >
            <p>{{ preset.guidance.purpose }}</p>

            <div>
              <h4 class="font-semibold text-white">Set up</h4>
              <ul class="mt-2 list-disc space-y-1 pl-5">
                <li v-for="item in preset.guidance.setup" :key="item">{{ item }}</li>
              </ul>
            </div>

            <div>
              <h4 class="font-semibold text-white">Technique</h4>
              <ol class="mt-2 list-decimal space-y-1 pl-5">
                <li v-for="item in preset.guidance.steps" :key="item">{{ item }}</li>
              </ol>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="rounded-lg bg-white/5 p-3">
                <h4 class="font-semibold text-teal-200">Endurance</h4>
                <p class="mt-1">{{ preset.guidance.progression.endurance }}</p>
              </div>
              <div class="rounded-lg bg-white/5 p-3">
                <h4 class="font-semibold text-amber-200">Strengthening</h4>
                <p class="mt-1">{{ preset.guidance.progression.strengthening }}</p>
              </div>
            </div>

            <div class="rounded-lg border border-amber-400/20 bg-amber-500/10 p-3">
              <h4 class="font-semibold text-amber-100">Precautions</h4>
              <ul class="mt-2 list-disc space-y-1 pl-5">
                <li v-for="item in preset.guidance.precautions" :key="item">{{ item }}</li>
              </ul>
            </div>
          </section>
        </article>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStorage } from '../composables';
import type { BreathingConfig } from '@breath-in-flow/shared';
import { guidedPresets, presetConfig, type GuidedPreset } from '../data/guidedPresets';

const emit = defineEmits<{
  (e: 'loadConfig', config: BreathingConfig): void;
}>();

const storage = useStorage();
const configs = computed(() => storage.getAllConfigs());

const showDeleteConfirmation = ref(false);
const configToDelete = ref<BreathingConfig | null>(null);

const presets = guidedPresets;
const expandedGuidanceId = ref<string | null>(null);

function loadPreset(preset: GuidedPreset) {
  emit('loadConfig', presetConfig(preset));
}

function toggleGuidance(id: string) {
  expandedGuidanceId.value = expandedGuidanceId.value === id ? null : id;
}

function formatDate(date?: Date): string {
  if (!date) return '';
  return new Date(date).toLocaleDateString();
}

function deleteConfig(id: string) {
  const config = storage.getAllConfigs().find((c) => c.id === id);
  if (config) {
    configToDelete.value = config;
    showDeleteConfirmation.value = true;
  }
}

function confirmDelete() {
  if (configToDelete.value?.id) {
    storage.deleteConfig(configToDelete.value.id);
  }
  showDeleteConfirmation.value = false;
  configToDelete.value = null;
}
</script>
