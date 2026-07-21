<template>
  <div
    class="min-h-screen relative pb-24 md:pb-0"
    style="padding-bottom: max(6rem, env(safe-area-inset-bottom) + 5rem)"
  >
    <!-- Animated background -->
    <div class="animated-bg"></div>

    <GoalOnboarding :open="needsOnboarding" @select="handleGoalSelect" />

    <header
      :class="[
        'sticky top-0 z-50 safe-area-top transition-transform duration-300 border-b border-white/[0.08]',
        headerHidden ? '-translate-y-full' : 'translate-y-0',
      ]"
      style="background: linear-gradient(135deg, rgb(38, 32, 27) 0%, rgb(32, 27, 22) 100%)"
    >
      <div class="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
        <h1 class="text-lg sm:text-xl font-bold text-white flex items-center gap-2 sm:gap-3">
          <div
            class="w-9 h-9 sm:w-11 sm:h-11 rounded-2xl flex items-center justify-center shadow-lg relative overflow-hidden"
            style="
              background: linear-gradient(145deg, #e3b25c 0%, #7fc3aa 45%, #c26a4f 100%);
              box-shadow:
                0 8px 24px -4px rgba(194, 106, 79, 0.35),
                0 4px 12px -2px rgba(107, 181, 156, 0.28);
            "
          >
            <div class="absolute inset-0 bg-gradient-to-t from-white/10 to-transparent"></div>
            <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5 sm:w-6 sm:h-6 relative z-10" viewBox="0 0 100 100">
              <!-- Breathing wave pattern -->
              <path
                d="M 20 50 Q 30 35, 40 50 T 60 50 T 80 50"
                fill="none"
                stroke="white"
                stroke-width="4"
                opacity="0.7"
                stroke-linecap="round"
              />
              <path
                d="M 22 58 Q 32 48, 42 58 T 62 58 T 82 58"
                fill="none"
                stroke="white"
                stroke-width="3"
                opacity="0.4"
                stroke-linecap="round"
              />
              <!-- Center breathing indicator -->
              <circle cx="50" cy="50" r="12" fill="white" opacity="0.9" />
              <circle cx="50" cy="50" r="6" fill="white" opacity="0.6" />
            </svg>
          </div>
          <span class="bg-gradient-to-r from-white via-slate-200 to-slate-300 bg-clip-text text-transparent">{{
            AppConfig.appName
          }}</span>
        </h1>

        <div class="flex items-center gap-2">
          <!-- Desktop Navigation -->
          <nav
            class="hidden md:flex gap-1 p-1.5 rounded-2xl"
            style="
              background: linear-gradient(135deg, rgba(70, 60, 52, 0.6) 0%, rgba(47, 40, 34, 0.8) 100%);
              border: 1px solid rgba(255, 255, 255, 0.06);
            "
          >
            <button
              @click="activeTab = 'practice'"
              :class="[
                'px-4 py-2 rounded-xl font-medium transition-all duration-400',
                activeTab === 'practice' ? 'text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :style="
                activeTab === 'practice'
                  ? 'background: linear-gradient(135deg, #c26a4f 0%, #d58a69 100%); box-shadow: 0 8px 24px -4px rgba(194, 106, 79, 0.35);'
                  : ''
              "
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
              @click="activeTab = 'lab'"
              :class="[
                'px-4 py-2 rounded-xl font-medium transition-all duration-400',
                activeTab === 'lab' ? 'text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :style="
                activeTab === 'lab'
                  ? 'background: linear-gradient(135deg, #c26a4f 0%, #d58a69 100%); box-shadow: 0 8px 24px -4px rgba(194, 106, 79, 0.35);'
                  : ''
              "
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
                'px-4 py-2 rounded-xl font-medium transition-all duration-400',
                activeTab === 'history' ? 'text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :style="
                activeTab === 'history'
                  ? 'background: linear-gradient(135deg, #c26a4f 0%, #d58a69 100%); box-shadow: 0 8px 24px -4px rgba(194, 106, 79, 0.35);'
                  : ''
              "
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
                'px-4 py-2 rounded-xl font-medium transition-all duration-400',
                activeTab === 'configs' ? 'text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :style="
                activeTab === 'configs'
                  ? 'background: linear-gradient(135deg, #c26a4f 0%, #d58a69 100%); box-shadow: 0 8px 24px -4px rgba(194, 106, 79, 0.35);'
                  : ''
              "
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
                'px-4 py-2 rounded-xl font-medium transition-all duration-400',
                activeTab === 'analytics' ? 'text-white shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5',
              ]"
              :style="
                activeTab === 'analytics'
                  ? 'background: linear-gradient(135deg, #c26a4f 0%, #d58a69 100%); box-shadow: 0 8px 24px -4px rgba(194, 106, 79, 0.35);'
                  : ''
              "
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
          key="practice"
          :goal="selectedGoal ?? undefined"
          @switch-tab="(tab: string) => (activeTab = tab as 'practice' | 'lab' | 'history' | 'configs' | 'analytics')"
        />
        <LabTab v-else-if="activeTab === 'lab'" key="lab" />
        <SessionHistory v-else-if="activeTab === 'history'" key="history" />
        <PracticePresets v-else-if="activeTab === 'configs'" key="configs" @load-config="loadConfig" />
        <AnalyticsDashboard v-else-if="activeTab === 'analytics'" key="analytics" />
      </transition>
    </main>

    <!-- Mobile Bottom Navigation -->
    <nav
      class="md:hidden fixed bottom-0 left-0 right-0 z-50 border-t border-white/[0.06]"
      style="
        background: linear-gradient(180deg, rgba(38, 32, 27, 0.95) 0%, rgba(32, 27, 22, 0.98) 100%);
        backdrop-filter: blur(24px);
      "
    >
      <div class="flex justify-around items-center py-2 px-2 safe-area-bottom">
        <button
          @click="activeTab = 'practice'"
          :class="[
            'flex flex-col items-center justify-center px-3 py-2 rounded-2xl min-w-[60px] transition-all duration-300',
            activeTab === 'practice' ? 'text-amber-200' : 'text-slate-400 hover:text-white',
          ]"
          :style="
            activeTab === 'practice'
              ? 'background: linear-gradient(135deg, rgba(194, 106, 79, 0.18) 0%, rgba(227, 178, 92, 0.12) 100%);'
              : ''
          "
          :aria-current="activeTab === 'practice' ? 'page' : undefined"
          aria-label="Practice breathing exercises"
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
          @click="activeTab = 'lab'"
          :class="[
            'flex flex-col items-center justify-center px-3 py-2 rounded-2xl min-w-[60px] transition-all duration-300',
            activeTab === 'lab' ? 'text-amber-200' : 'text-slate-400 hover:text-white',
          ]"
          :style="
            activeTab === 'lab'
              ? 'background: linear-gradient(135deg, rgba(194, 106, 79, 0.18) 0%, rgba(227, 178, 92, 0.12) 100%);'
              : ''
          "
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
          :style="
            activeTab === 'history'
              ? 'background: linear-gradient(135deg, rgba(194, 106, 79, 0.18) 0%, rgba(227, 178, 92, 0.12) 100%);'
              : ''
          "
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
          :style="
            activeTab === 'configs'
              ? 'background: linear-gradient(135deg, rgba(194, 106, 79, 0.18) 0%, rgba(227, 178, 92, 0.12) 100%);'
              : ''
          "
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
          :style="
            activeTab === 'analytics'
              ? 'background: linear-gradient(135deg, rgba(194, 106, 79, 0.18) 0%, rgba(227, 178, 92, 0.12) 100%);'
              : ''
          "
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

    <footer class="hidden md:block text-center py-8 text-slate-500 text-sm">
      <p class="text-slate-400">Breathing exercises for everyone</p>
      <p class="text-slate-600 mt-1.5 text-xs tracking-wide">Designed with guidance from physical therapy expertise</p>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref, provide, onMounted, onUnmounted } from 'vue';
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

onMounted(() => {
  lastScrollY = window.scrollY;
  window.addEventListener('scroll', onScroll, { passive: true });
});
onUnmounted(() => window.removeEventListener('scroll', onScroll));

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
    opacity 0.4s cubic-bezier(0.22, 1, 0.36, 1),
    transform 0.4s cubic-bezier(0.22, 1, 0.36, 1);
}

.fade-enter-from {
  opacity: 0;
  transform: translateY(16px);
}

.fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
