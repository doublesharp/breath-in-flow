<template>
  <div
    class="min-h-screen relative pb-[calc(84px+env(safe-area-inset-bottom,0px))] lg:pb-0"
  >
    <!-- Animated background -->
    <div class="animated-bg"></div>

    <GoalOnboarding :open="needsOnboarding && !helpOpen" :save-error="saveError" @select="handleGoalSelect" />

    <header
      :class="[
        'app-header sticky top-0 z-50 safe-area-top transition-transform duration-300 border-b border-line-subtle',
        headerHidden ? '-translate-y-full' : 'translate-y-0',
      ]"
      style="background: var(--surface-page)"
    >
      <div
        data-testid="app-header-content"
        class="app-header-content mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-[16px] gap-y-[8px] px-4 py-[10px] sm:px-6 sm:py-[12px]"
      >
        <h1 class="app-brand min-w-0 flex items-center gap-3">
          <img :src="brandMark" class="size-[2.15em] max-h-[44px] max-w-[44px] shrink-0" alt="" aria-hidden="true" width="36" height="36" />
          <span>{{ AppConfig.appName }}</span>
        </h1>

        <div class="ml-auto flex min-w-0 max-w-full items-center gap-[8px]">
          <!-- Desktop Navigation -->
          <nav data-testid="desktop-navigation" class="desktop-nav hidden min-w-0 flex-wrap gap-[4px] rounded-xl p-[4px] lg:flex">
            <button
              @click="activeTab = 'practice'"
              class="nav-link min-h-11 px-3 py-2 rounded-lg font-medium text-muted hover:text-primary hover:bg-surface-raised"
              :aria-current="activeTab === 'practice' ? 'page' : undefined"
              aria-label="Practice breathing exercises"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-[1.1em] h-[1.1em] shrink-0"
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
              class="nav-link min-h-11 px-3 py-2 rounded-lg font-medium text-muted hover:text-primary hover:bg-surface-raised"
              :aria-current="activeTab === 'lab' ? 'page' : undefined"
              aria-label="Pulse Variability"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-[1.1em] h-[1.1em] shrink-0"
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
              class="nav-link min-h-11 px-3 py-2 rounded-lg font-medium text-muted hover:text-primary hover:bg-surface-raised"
              :aria-current="activeTab === 'history' ? 'page' : undefined"
              aria-label="View session history"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-[1.1em] h-[1.1em] shrink-0"
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
              class="nav-link min-h-11 px-3 py-2 rounded-lg font-medium text-muted hover:text-primary hover:bg-surface-raised"
              :aria-current="activeTab === 'configs' ? 'page' : undefined"
              aria-label="Manage breathing presets"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-[1.1em] h-[1.1em] shrink-0"
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
              class="nav-link min-h-11 px-3 py-2 rounded-lg font-medium text-muted hover:text-primary hover:bg-surface-raised"
              :aria-current="activeTab === 'analytics' ? 'page' : undefined"
              aria-label="View analytics and insights"
            >
              <span class="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-[1.1em] h-[1.1em] shrink-0"
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
          <HelpSystem v-model:open="helpOpen" />
        </div>
      </div>
    </header>

    <main class="max-w-5xl mx-auto app-main px-4 sm:px-6 py-4 sm:py-6">
      <transition :key="practiceResetVersion" name="fade" mode="out-in">
        <BreathingPractice
          v-if="activeTab === 'practice'"
          ref="breathingPracticeRef"
          key="practice"
          :goal="selectedGoal ?? undefined"
          :open-settings="openPracticeSettings"
          :editing-preset-id="editingPresetId"
          @settings-opened="clearSettingsRequest"
          @switch-tab="(tab: string) => (activeTab = tab as 'practice' | 'lab' | 'history' | 'configs' | 'analytics')"
        />
        <LabTab v-else-if="activeTab === 'lab'" key="lab" />
        <SessionHistory v-else-if="activeTab === 'history'" key="history" />
        <PracticePresets
          v-else-if="activeTab === 'configs'"
          key="configs"
          @load-config="loadConfig"
          @edit-config="editConfig"
          @create-config="createPreset"
        />
        <AnalyticsDashboard v-else-if="activeTab === 'analytics'" key="analytics" />
      </transition>
    </main>

    <!-- Mobile Bottom Navigation -->
    <nav
      data-testid="mobile-navigation"
      class="mobile-nav lg:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-line-subtle"
      style="background: var(--surface-page); backdrop-filter: blur(24px)"
    >
      <div class="flex items-stretch gap-1 px-2 pt-1 safe-area-bottom">
        <button
          @click="activeTab = 'practice'"
          class="flex h-[60px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-muted hover:text-primary transition-colors"
          :aria-current="activeTab === 'practice' ? 'page' : undefined"
          aria-label="Practice breathing exercises"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12c3-8 6-8 9 0s6 8 9 0" />
          </svg>
          <span class="text-xs leading-tight mt-1 font-medium whitespace-nowrap">Practice</span>
        </button>
        <button
          @click="activeTab = 'lab'"
          class="flex h-[60px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-muted hover:text-primary transition-colors"
          :aria-current="activeTab === 'lab' ? 'page' : undefined"
          aria-label="Pulse Variability"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z"
            />
          </svg>
          <span aria-hidden="true" class="text-xs leading-tight mt-1 font-medium whitespace-nowrap">Pulse<span class="hidden sm:inline"> Variability</span></span>
        </button>
        <button
          @click="activeTab = 'history'"
          class="flex h-[60px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-muted hover:text-primary transition-colors"
          :aria-current="activeTab === 'history' ? 'page' : undefined"
          aria-label="View session history"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span class="text-xs leading-tight mt-1 font-medium whitespace-nowrap">History</span>
        </button>
        <button
          @click="activeTab = 'configs'"
          class="flex h-[60px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-muted hover:text-primary transition-colors"
          :aria-current="activeTab === 'configs' ? 'page' : undefined"
          aria-label="Manage breathing presets"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
          <span class="text-xs leading-tight mt-1 font-medium whitespace-nowrap">Presets</span>
        </button>
        <button
          @click="activeTab = 'analytics'"
          class="flex h-[60px] min-w-0 flex-1 flex-col items-center justify-center rounded-xl text-muted hover:text-primary transition-colors"
          :aria-current="activeTab === 'analytics' ? 'page' : undefined"
          aria-label="View analytics and insights"
        >
          <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
          <span class="text-xs leading-tight mt-1 font-medium whitespace-nowrap">Analytics</span>
        </button>
      </div>
    </nav>

    <footer class="hidden lg:block text-center py-8 text-muted text-sm">
      <p class="text-secondary">Breathing exercises for everyone</p>
      <p class="text-muted mt-1.5 text-xs tracking-wide">Designed with guidance from physical therapy expertise</p>
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
import { usePreferences, useStorage } from './composables';
import { AppConfig, type BreathingConfig, type UserGoal } from '@breath-in-flow/shared';
import brandMark from '../assets/logo.svg';

const { selectedGoal, needsOnboarding, saveError, setGoal } = usePreferences();
const { practiceResetVersion } = useStorage();
const helpOpen = ref(false);

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
const editingPresetId = ref<string>();
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

function editConfig(config: BreathingConfig) {
  editingPresetId.value = config.id;
  openPracticeSettings.value = true;
  loadConfig(config);
}

function clearSettingsRequest() {
  openPracticeSettings.value = false;
  editingPresetId.value = undefined;
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
