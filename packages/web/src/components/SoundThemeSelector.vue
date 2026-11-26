<template>
  <div class="sound-theme-selector">
    <label for="sound-theme" class="block text-sm font-medium text-secondary mb-2"> Sound Theme </label>
    <div class="flex flex-col sm:flex-row gap-2">
      <select
        id="sound-theme"
        v-model="selectedTheme"
        @change="onThemeChange"
        class="min-w-0 flex-1 rounded-lg border border-line-strong bg-surface-raised px-3 py-2 text-primary"
      >
        <option value="wood">Woodblock</option>
        <option value="water">Water</option>
        <option value="wind">Wind</option>
        <option value="subtle">Subtle</option>
        <option value="chimes">Chimes</option>
      </select>
      <button
        @click="testTheme"
        class="btn-secondary flex shrink-0 items-center justify-center gap-2 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="!soundEnabled"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 shrink-0" aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
          />
        </svg>
        Test
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import type { SoundTheme } from '@breath-in-flow/shared';
import { soundService } from '../services/soundService';
import { useStorage } from '../composables/useStorage';

const props = defineProps<{
  soundEnabled: boolean;
}>();

const storage = useStorage();
const selectedTheme = ref<SoundTheme>('wood');

onMounted(() => {
  selectedTheme.value = storage.getSoundTheme();
  soundService.setTheme(selectedTheme.value);
});

function onThemeChange() {
  storage.setSoundTheme(selectedTheme.value);
  soundService.setTheme(selectedTheme.value);
}

function testTheme() {
  if (props.soundEnabled) {
    // Temporarily enable the sound service for testing
    soundService.setEnabled(true);
    soundService.playClick();
  }
}

// Watch for external changes to sound theme
watch(
  () => storage.soundTheme?.value,
  (newTheme) => {
    if (newTheme) {
      selectedTheme.value = newTheme;
      soundService.setTheme(newTheme);
    }
  }
);
</script>
