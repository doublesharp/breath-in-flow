<template>
  <div class="min-h-screen relative pb-20 md:pb-0">
    <!-- Animated background -->
    <div class="animated-bg"></div>

    <header class="glass sticky top-0 z-50 safe-area-top">
      <div class="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <h1 class="text-lg sm:text-xl font-bold text-white flex items-center gap-2 sm:gap-3">
          <div
            class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/30"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-5 h-5 sm:w-6 sm:h-6 text-white"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
              />
            </svg>
          </div>
          <span>Breath in Flow</span>
        </h1>

        <div class="flex items-center gap-2">
          <!-- Desktop Navigation -->
          <nav class="hidden md:flex gap-1 p-1 bg-slate-800/50 rounded-xl">
            <button
              @click="activeTab = 'practice'"
              :class="[
                'px-4 py-2 rounded-lg font-medium transition-all duration-300',
                activeTab === 'practice'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/10',
              ]"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>Practice</span>
              </span>
            </button>
            <button
              @click="activeTab = 'history'"
              :class="[
                'px-4 py-2 rounded-lg font-medium transition-all duration-300',
                activeTab === 'history'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/10',
              ]"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>History</span>
              </span>
            </button>
            <button
              @click="activeTab = 'configs'"
              :class="[
                'px-4 py-2 rounded-lg font-medium transition-all duration-300',
                activeTab === 'configs'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/10',
              ]"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
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
                <span>Presets</span>
              </span>
            </button>
            <button
              @click="activeTab = 'analytics'"
              :class="[
                'px-4 py-2 rounded-lg font-medium transition-all duration-300',
                activeTab === 'analytics'
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30'
                  : 'text-slate-400 hover:text-white hover:bg-white/10',
              ]"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                  />
                </svg>
                <span>Analytics</span>
              </span>
            </button>
          </nav>

          <!-- Help Button -->
          <HelpSystem />
        </div>
      </div>
    </header>

    <main class="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <transition name="fade" mode="out-in">
        <BreathingPractice v-if="activeTab === 'practice'" key="practice" />
        <SessionHistory v-else-if="activeTab === 'history'" key="history" />
        <SavedConfigs v-else-if="activeTab === 'configs'" key="configs" @load-config="loadConfig" />
        <AnalyticsDashboard v-else-if="activeTab === 'analytics'" key="analytics" />
      </transition>
    </main>

    <!-- Mobile Bottom Navigation -->
    <nav class="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/10">
      <div class="flex justify-around items-center py-2 px-2 safe-area-bottom">
        <button
          @click="activeTab = 'practice'"
          :class="[
            'flex flex-col items-center justify-center px-3 py-2 rounded-xl min-w-[60px] transition-all',
            activeTab === 'practice' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white',
          ]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span class="text-xs mt-1 font-medium">Practice</span>
        </button>
        <button
          @click="activeTab = 'history'"
          :class="[
            'flex flex-col items-center justify-center px-3 py-2 rounded-xl min-w-[60px] transition-all',
            activeTab === 'history' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white',
          ]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span class="text-xs mt-1 font-medium">History</span>
        </button>
        <button
          @click="activeTab = 'configs'"
          :class="[
            'flex flex-col items-center justify-center px-3 py-2 rounded-xl min-w-[60px] transition-all',
            activeTab === 'configs' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white',
          ]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
          <span class="text-xs mt-1 font-medium">Presets</span>
        </button>
        <button
          @click="activeTab = 'analytics'"
          :class="[
            'flex flex-col items-center justify-center px-3 py-2 rounded-xl min-w-[60px] transition-all',
            activeTab === 'analytics' ? 'bg-blue-500/20 text-blue-400' : 'text-slate-400 hover:text-white',
          ]"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span class="text-xs mt-1 font-medium">Analytics</span>
        </button>
      </div>
    </nav>

    <footer class="hidden md:block text-center py-6 text-slate-500 text-sm">
      <p>Breathing exercises for everyone</p>
      <p class="text-slate-600 mt-1">Designed with guidance from physical therapy expertise</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref, provide } from 'vue';
import BreathingPractice from './components/BreathingPractice.vue';
import SessionHistory from './components/SessionHistory.vue';
import SavedConfigs from './components/SavedConfigs.vue';
import AnalyticsDashboard from './components/AnalyticsDashboard.vue';
import HelpSystem from './components/HelpSystem.vue';
import type { BreathingConfig } from '@breath-in-flow/shared';

const activeTab = ref<'practice' | 'history' | 'configs' | 'analytics'>('practice');
const selectedConfig = ref<BreathingConfig | null>(null);

function loadConfig(config: BreathingConfig) {
  selectedConfig.value = config;
  activeTab.value = 'practice';
}

function clearSelectedConfig() {
  selectedConfig.value = null;
}

provide('selectedConfig', selectedConfig);
provide('clearSelectedConfig', clearSelectedConfig);
</script>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition:
    opacity 0.3s ease,
    transform 0.3s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(10px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
