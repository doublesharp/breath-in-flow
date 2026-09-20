<template>
  <div
    class="min-h-screen relative pb-24 lg:pb-0"
    style="padding-bottom: max(6rem, env(safe-area-inset-bottom) + 5rem)"
  >
    <!-- Animated background -->
    <div class="animated-bg"></div>

    <GoalOnboarding :open="needsOnboarding" @select="handleGoalSelect" />

    <header
      :class="[
        'app-header sticky top-0 z-50 safe-area-top transition-transform duration-300 border-b border-white/[0.08]',
        headerHidden ? '-translate-y-full' : 'translate-y-0',
      ]"
      style="background: var(--surface-page)"
    >
      <div
        data-testid="app-header-content"
        class="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between"
      >
        <h1 class="app-brand shrink-0 whitespace-nowrap flex items-center gap-3">
          <svg class="brand-mark" aria-hidden="true" width="36" height="36" viewBox="0 0 40 40" fill="none">
            <circle cx="20" cy="20" r="18" stroke="currentColor" stroke-opacity=".45" />
            <path d="M9 20c4-10 7-10 11 0s7 10 11 0" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
          </svg>
          <span>{{ AppConfig.appName }}</span>
        </h1>

        <div class="flex items-center gap-2">
          <!-- Desktop Navigation -->
          <nav data-testid="desktop-navigation" class="desktop-nav hidden lg:flex gap-1 p-1 rounded-xl">
            <button
              @click="activeTab = 'practice'"
              :class="[
                'nav-link min-h-11 px-4 py-2.5 rounded-lg font-medium',
                activeTab === 'practice' ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :aria-current="activeTab === 'practice' ? 'page' : undefined"
              aria-label="Practice breathing exercises"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12c3-8 6-8 9 0s6 8 9 0" />
                </svg>
                <span>Practice</span>
              </span>
            </button>
            <button
              @click="activeTab = 'lab'"
              :class="[
                'nav-link min-h-11 px-4 py-2.5 rounded-lg font-medium',
                activeTab === 'lab' ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :aria-current="activeTab === 'lab' ? 'page' : undefined"
              aria-label="Pulse Variability"
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
                    d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
                  />
                </svg>
                <span>Pulse Variability</span>
              </span>
            </button>
            <button
              @click="activeTab = 'history'"
              :class="[
                'nav-link min-h-11 px-4 py-2.5 rounded-lg font-medium',
                activeTab === 'history' ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :aria-current="activeTab === 'history' ? 'page' : undefined"
              aria-label="View session history"
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
                'nav-link min-h-11 px-4 py-2.5 rounded-lg font-medium',
                activeTab === 'configs' ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :aria-current="activeTab === 'configs' ? 'page' : undefined"
              aria-label="Manage breathing presets"
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
                'nav-link min-h-11 px-4 py-2.5 rounded-lg font-medium',
                activeTab === 'analytics' ? 'text-white' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :aria-current="activeTab === 'analytics' ? 'page' : undefined"
              aria-label="View analytics and insights"
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
        <BreathingPractice
          v-if="activeTab === 'practice'"
          ref="breathingPracticeRef"
          key="practice"
          :goal="selectedGoal ?? undefined"
          :open-settings="openPracticeSettings"
          @settings-opened="openPracticeSettings = false"
          @switch-tab="(tab: string) => (activeTab = tab as 'practice' | 'lab' | 'history' | 'configs' | 'analytics')"
        />
        <LabTab v-else-if="activeTab === 'lab'" key="lab" />
        <SessionHistory v-else-if="activeTab === 'history'" key="history" />
        <PracticePresets
          v-else-if="activeTab === 'configs'"
          key="configs"
          @load-config="loadConfig"
          @create-config="createPreset"
        />
        <AnalyticsDashboard v-else-if="activeTab === 'analytics'" key="analytics" />
      </transition>
    </main>

    <!-- Mobile Bottom Navigation -->
    <nav
      data-testid="mobile-navigation"
      class="mobile-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06]"
      style="background: var(--surface-page); backdrop-filter: blur(24px)"
    >
      <div class="flex justify-around items-center py-2 px-2 safe-area-bottom">
        <button
          @click="activeTab = 'practice'"
          :class="[
            'flex flex-col items-center justify-center px-3 py-2 rounded-2xl min-w-[60px] transition-all duration-300',
            activeTab === 'practice' ? 'text-amber-200' : 'text-slate-400 hover:text-white',
          ]"
          :aria-current="activeTab === 'practice' ? 'page' : undefined"
          aria-label="Practice breathing exercises"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12c3-8 6-8 9 0s6 8 9 0" />
          </svg>
          <span class="text-xs mt-1 font-medium">Practice</span>
        </button>
        <button
          @click="activeTab = 'lab'"
          :class="[
            'flex flex-col items-center justify-center px-3 py-2 rounded-2xl min-w-[60px] transition-all duration-300',
            activeTab === 'lab' ? 'text-amber-200' : 'text-slate-400 hover:text-white',
          ]"
          :aria-current="activeTab === 'lab' ? 'page' : undefined"
          aria-label="Pulse Variability"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
          <span class="text-xs mt-1 font-medium">Pulse Variability</span>
        </button>
        <button
          @click="activeTab = 'history'"
          :class="[
            'flex flex-col items-center justify-center px-3 py-2 rounded-2xl min-w-[60px] transition-all duration-300',
            activeTab === 'history' ? 'text-amber-200' : 'text-slate-400 hover:text-white',
          ]"
          :aria-current="activeTab === 'history' ? 'page' : undefined"
          aria-label="View session history"
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
            'flex flex-col items-center justify-center px-3 py-2 rounded-2xl min-w-[60px] transition-all duration-300',
            activeTab === 'configs' ? 'text-amber-200' : 'text-slate-400 hover:text-white',
          ]"
          :aria-current="activeTab === 'configs' ? 'page' : undefined"
          aria-label="Manage breathing presets"
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
            'flex flex-col items-center justify-center px-3 py-2 rounded-2xl min-w-[60px] transition-all duration-300',
            activeTab === 'analytics' ? 'text-amber-200' : 'text-slate-400 hover:text-white',
          ]"
          :aria-current="activeTab === 'analytics' ? 'page' : undefined"
          aria-label="View analytics and insights"
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

    <footer class="hidden lg:block text-center py-8 text-slate-500 text-sm">
      <p class="text-slate-400">Breathing exercises for everyone</p>
      <p class="text-slate-600 mt-1.5 text-xs tracking-wide">Designed with guidance from physical therapy expertise</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref, provide, onMounted, onUnmounted } from 'vue';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import BreathingPractice from './components/BreathingPractice.vue';
import GoalOnboarding from './components/GoalOnboarding.vue';
import HelpSystem from './components/HelpSystem.vue';
import { usePreferences } from './composables';
import { AppConfig, type BreathingConfig, type UserGoal } from '@breath-in-flow/shared';

const { selectedGoal, needsOnboarding, setGoal } = usePreferences();

function handleGoalSelect(goal: UserGoal) {
  setGoal(goal);
}

const AnalyticsDashboard = defineAsyncComponent(() => import('./components/AnalyticsDashboard.vue'));
const LabTab = defineAsyncComponent(() => import('./components/LabTab.vue'));
const PracticePresets = defineAsyncComponent(() => import('./components/PracticePresets.vue'));
const SessionHistory = defineAsyncComponent(() => import('./components/SessionHistory.vue'));

const activeTab = ref<'practice' | 'lab' | 'history' | 'configs' | 'analytics'>('practice');
const selectedConfig = ref<BreathingConfig | null>(null);
const openPracticeSettings = ref(false);
const breathingPracticeRef = ref<{ handleSystemBack?: () => boolean } | null>(null);
let backButtonListener: PluginListenerHandle | null = null;

// Auto-hide header on scroll down, show on scroll up
const headerHidden = ref(false);
let lastScrollY = 0;
const SCROLL_THRESHOLD = 10;

function onScroll() {
  const currentY = window.scrollY;
  if (currentY < 50) {
    // Always show near top of page
    headerHidden.value = false;
  } else if (currentY - lastScrollY > SCROLL_THRESHOLD) {
    // Scrolling down
    headerHidden.value = true;
  } else if (lastScrollY - currentY > SCROLL_THRESHOLD) {
    // Scrolling up
    headerHidden.value = false;
  }
  lastScrollY = currentY;
}

onMounted(async () => {
  lastScrollY = window.scrollY;
  window.addEventListener('scroll', onScroll, { passive: true });
  if (Capacitor.isNativePlatform()) {
    backButtonListener = await NativeApp.addListener('backButton', () => {
      if (activeTab.value === 'practice' && breathingPracticeRef.value?.handleSystemBack?.()) {
        return;
      }
      if (activeTab.value !== 'practice') {
        activeTab.value = 'practice';
        return;
      }
      void NativeApp.exitApp();
    });
  }
});
onUnmounted(() => {
  window.removeEventListener('scroll', onScroll);
  void backButtonListener?.remove();
  backButtonListener = null;
});

function loadConfig(config: BreathingConfig) {
  selectedConfig.value = config;
  activeTab.value = 'practice';
}

function createPreset() {
  openPracticeSettings.value = true;
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
    opacity 0.16s ease,
    transform 0.16s ease;
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
