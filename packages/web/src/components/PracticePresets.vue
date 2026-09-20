<template>
  <div class="preset-library space-y-7">
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

    <header class="library-heading">
      <div>
        <p class="eyebrow">Routine library</p>
        <h2 class="page-title">Breathing routines</h2>
        <p class="muted-copy mt-2">Saved settings and guided routines.</p>
      </div>
      <button data-testid="create-preset" class="btn-secondary" @click="emit('createConfig')">
        <span aria-hidden="true" class="mr-2">+</span>Create preset
      </button>
    </header>

    <div class="library-search-row">
      <div class="library-search">
        <svg
          aria-hidden="true"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
        >
          <circle cx="10.5" cy="10.5" r="6.5" />
          <path d="m16 16 4.5 4.5" />
        </svg>
        <label for="preset-search" class="sr-only">Search presets</label>
        <input
          id="preset-search"
          ref="searchInput"
          v-model="search"
          type="search"
          placeholder="Search routines"
          autocomplete="off"
        />
        <button v-if="search" aria-label="Clear search" class="search-clear" @click="clearSearch">
          <svg
            aria-hidden="true"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
          >
            <path d="m6 6 12 12M6 18 18 6" />
          </svg>
        </button>
      </div>
      <p data-testid="search-results" role="status" class="text-sm muted-copy whitespace-nowrap">
        {{ resultCount }} {{ resultCount === 1 ? 'routine' : 'routines' }}
      </p>
    </div>

    <section v-if="!query || filteredConfigs.length" aria-labelledby="saved-presets-heading">
      <div class="section-heading">
        <h3 id="saved-presets-heading">Saved Presets</h3>
        <span class="section-count">{{ filteredConfigs.length }}</span>
      </div>
      <div v-if="configs.length === 0" class="saved-empty">
        <p>No saved configurations yet.</p>
        <p class="muted-copy text-sm">Save your preferred timing from practice settings.</p>
      </div>
      <div v-else class="routine-grid">
        <article v-for="config in filteredConfigs" :key="config.id" data-testid="saved-routine" class="routine-card">
          <div class="routine-card-heading">
            <h4>{{ config.name }}</h4>
            <span v-if="config.createdAt" class="text-xs muted-copy">{{ formatDate(config.createdAt) }}</span>
          </div>
          <PatternSummary :config="config" compact />
          <div class="routine-actions">
            <button @click="emit('loadConfig', config)" class="btn-secondary">
              Load routine <span aria-hidden="true">→</span>
            </button>
            <button
              @click="deleteConfig(config.id!)"
              :aria-label="'Delete ' + config.name"
              class="routine-delete"
              title="Delete configuration"
            >
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7" />
              </svg>
            </button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="resultCount === 0 && query" class="search-empty">
      <p class="text-lg">No routines match "{{ search.trim() }}"</p>
      <p class="muted-copy mt-2">Try a name or a different breathing pattern.</p>
    </div>

    <section v-if="presets.length" aria-labelledby="quick-presets-heading">
      <div class="section-heading">
        <h3 id="quick-presets-heading">Quick Presets</h3>
        <span class="section-count">{{ presets.length }}</span>
      </div>
      <div class="routine-grid">
        <article v-for="preset in presets" :key="preset.id" class="routine-card">
          <h4>{{ preset.config.name }}</h4>
          <p class="routine-description">{{ preset.description }}</p>
          <PatternSummary :config="preset.config" compact />
          <div class="routine-actions">
            <button :data-testid="'load-' + preset.id" class="btn-secondary" @click="loadPreset(preset)">
              Use routine <span aria-hidden="true">→</span>
            </button>
            <button
              v-if="preset.guidance"
              :data-testid="'guidance-' + preset.id"
              class="btn-ghost"
              :aria-expanded="expandedGuidanceId === preset.id"
              :aria-controls="'guidance-panel-' + preset.id"
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
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import { useStorage } from '../composables';
import PatternSummary from './PatternSummary.vue';
import type { BreathingConfig } from '@breath-in-flow/shared';
import { guidedPresets, presetConfig, type GuidedPreset } from '../data/guidedPresets';

const emit = defineEmits<{
  (e: 'loadConfig', config: BreathingConfig): void;
  (e: 'createConfig'): void;
}>();

const storage = useStorage();
const configs = computed(() => storage.getAllConfigs());

const showDeleteConfirmation = ref(false);
const configToDelete = ref<BreathingConfig | null>(null);

const search = ref('');
const searchInput = ref<HTMLInputElement | null>(null);
const query = computed(() => search.value.trim().toLocaleLowerCase());
const filteredConfigs = computed(() =>
  configs.value.filter((config) => config.name.toLocaleLowerCase().includes(query.value))
);
const presets = computed(() =>
  guidedPresets.filter((preset) =>
    (preset.config.name + ' ' + preset.description).toLocaleLowerCase().includes(query.value)
  )
);
const resultCount = computed(() => filteredConfigs.value.length + presets.value.length);
function clearSearch() {
  search.value = '';
  searchInput.value?.focus();
}
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
