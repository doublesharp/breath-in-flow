<template>
  <div class="sound-theme-selector">
    <label for="sound-theme" class="block text-sm font-medium text-slate-300 mb-2"> Sound Theme </label>
    <div class="flex flex-col sm:flex-row gap-2">
      <select
        id="sound-theme"
        v-model="selectedTheme"
        @change="onThemeChange"
        class="flex-1 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-slate-200 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
      >
        <option value="wood">🥁 Woodblock</option>
        <option value="water">💧 Water</option>
        <option value="wind">🌬️ Wind</option>
        <option value="subtle">✨ Subtle</option>
        <option value="chimes">🔔 Chimes</option>
      </select>
      <button
        @click="testTheme"
        class="px-4 py-2 text-sm font-medium bg-slate-700 hover:bg-slate-600 text-slate-200 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-slate-700 flex items-center justify-center gap-2 whitespace-nowrap"
        :disabled="!soundEnabled"
      >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

<style scoped>
/* Dark theme for select dropdown options */
select option {
  background-color: #1e293b;
  color: #e2e8f0;
}
</style>
