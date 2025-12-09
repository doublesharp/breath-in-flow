<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="card-solid animate-fade-in">
      <div class="flex items-center gap-3 mb-6">
        <div
          class="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center"
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
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold text-white">Analytics Dashboard</h2>
          <p class="text-sm text-slate-400">Track your breathing practice and biometrics</p>
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="stat-card bg-blue-500/10 border border-blue-500/20">
          <div class="text-3xl font-bold text-blue-400">{{ stats.totalSessions }}</div>
          <div class="text-sm text-slate-400 mt-1">Total Sessions</div>
        </div>
        <div class="stat-card bg-emerald-500/10 border border-emerald-500/20">
          <div class="text-3xl font-bold text-emerald-400">{{ stats.totalSets }}</div>
          <div class="text-sm text-slate-400 mt-1">Total Sets</div>
        </div>
        <div class="stat-card bg-purple-500/10 border border-purple-500/20">
          <div class="text-3xl font-bold text-purple-400">
            {{ formatTime(stats.avgHoldTime) }}
          </div>
          <div class="text-sm text-slate-400 mt-1">Avg Hold Time</div>
        </div>
        <div class="stat-card bg-amber-500/10 border border-amber-500/20">
          <div class="text-3xl font-bold text-amber-400">
            {{ formatTime(stats.maxHoldTime) }}
          </div>
          <div class="text-sm text-slate-400 mt-1">Best Hold Time</div>
        </div>
      </div>
    </div>

    <!-- Wearable Connection (hidden until server-side OAuth is implemented) -->
    <div v-if="ENABLE_WEARABLES" class="card-solid animate-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-white">Wearable Devices</h3>
        <button
          v-if="!wearableConnected"
          @click="connectWearable"
          class="px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 text-white text-sm font-medium rounded-lg hover:from-blue-600 hover:to-indigo-700 transition-all"
        >
          Connect Device
        </button>
      </div>

      <div
        v-if="wearableConnected"
        class="flex items-center gap-4 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl"
      >
        <div class="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div class="flex-1">
          <div class="font-semibold text-emerald-400">{{ connectedProvider?.name || 'Garmin' }} Connected</div>
          <div class="text-sm text-slate-400">Last synced: {{ lastSyncTime }}</div>
        </div>
        <button
          @click="disconnectWearable"
          class="px-3 py-1.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-all"
        >
          Disconnect
        </button>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          v-for="provider in availableProviders"
          :key="provider.id"
          @click="selectProvider(provider.id)"
          class="p-4 glass rounded-xl hover:bg-white/10 transition-all text-left group"
        >
          <div class="flex items-center gap-3">
            <span class="text-2xl">{{ provider.icon }}</span>
            <div>
              <div class="font-medium text-white group-hover:text-blue-400 transition-colors">{{ provider.name }}</div>
              <div class="text-xs text-slate-500">{{ provider.description }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Charts Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Sessions per Week -->
      <SessionsPerWeekChart :sessions="sessions" />

      <!-- Hold Time Progress -->
      <HoldTimeChart :sessions="sessions" />

      <!-- Stress Levels (if wearable connected) -->
      <div v-if="ENABLE_WEARABLES && wearableConnected && stressData" class="lg:col-span-2">
        <StressChart
          title="Stress Levels During Last Session"
          :pre-data="stressData.pre"
          :during-data="stressData.during"
          :post-data="stressData.post"
        />
      </div>
    </div>

    <!-- Recent Sessions with Biometrics -->
    <div v-if="sessions.length > 0" class="card-solid animate-fade-in">
      <h3 class="text-lg font-semibold text-white mb-4">Recent Sessions</h3>
      <div class="space-y-3">
        <div
          v-for="session in recentSessions"
          :key="session.id"
          class="glass rounded-xl p-4 hover:bg-white/10 transition-all"
        >
          <div class="flex items-center justify-between">
            <div>
              <div class="font-medium text-white">{{ session.configSnapshot.name }}</div>
              <div class="text-sm text-slate-400">{{ formatDate(session.startedAt) }}</div>
            </div>
            <div class="flex items-center gap-4">
              <div class="text-right">
                <div class="text-sm text-slate-400">Sets</div>
                <div class="font-semibold text-white">{{ session.completedSets }}</div>
              </div>
              <div class="text-right">
                <div class="text-sm text-slate-400">Pattern</div>
                <div class="font-semibold text-white">
                  {{ session.configSnapshot.inhaleTime }}-{{ session.configSnapshot.inhaleHoldTime || 0 }}-{{
                    session.configSnapshot.exhaleTime
                  }}-{{ session.configSnapshot.exhaleHoldTime || 0 }}
                </div>
              </div>
              <span
                :class="[
                  'px-3 py-1 rounded-full text-xs font-semibold',
                  session.status === 'COMPLETED'
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-amber-500/20 text-amber-400',
                ]"
              >
                {{ session.status }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="sessions.length === 0" class="card-solid animate-fade-in text-center py-12">
      <div
        class="w-16 h-16 mx-auto mb-4 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center"
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
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>
      <p class="text-slate-400">No session data yet.</p>
      <p class="text-slate-500 text-sm mt-1">Complete some breathing exercises to see your analytics!</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useStorage } from '../composables';
import StressChart from './charts/StressChart.vue';
import HoldTimeChart from './charts/HoldTimeChart.vue';
import SessionsPerWeekChart from './charts/SessionsPerWeekChart.vue';
import { garminService } from '../services/wearables/garmin';
import type { StressDataPoint } from '../services/wearables/types';

const storage = useStorage();

// Feature flag: Wearable integrations require server-side OAuth
// Set to true when backend is available
const ENABLE_WEARABLES = false;

const sessions = computed(() => storage.getAllSessions());
const stats = computed(() => storage.stats.value);
const recentSessions = computed(() => sessions.value.slice(0, 5));

// Wearable state - initialize from service
const wearableConnected = ref(garminService.isConnected());
const connectedProvider = ref<{ id: string; name: string } | null>(
  garminService.isConnected() ? { id: 'garmin', name: 'Garmin Connect' } : null
);
const lastSyncTime = ref('Just now');

// Stress data from service
const stressData = ref<{
  pre: StressDataPoint[];
  during: StressDataPoint[];
  post: StressDataPoint[];
} | null>(null);

const availableProviders = [
  { id: 'garmin', name: 'Garmin Connect', icon: '⌚', description: 'Sync stress & HRV data' },
  { id: 'apple', name: 'Apple Health', icon: '❤️', description: 'iOS HealthKit integration' },
  { id: 'fitbit', name: 'Fitbit', icon: '📱', description: 'Heart rate & sleep data' },
];

// Load stress data when connected
async function loadStressData() {
  if (!wearableConnected.value) {
    stressData.value = null;
    return;
  }

  // Get the most recent session for biometrics
  const recentSession = sessions.value[0];
  if (recentSession) {
    const sessionStart = new Date(recentSession.startedAt);
    const sessionEnd = recentSession.completedAt
      ? new Date(recentSession.completedAt)
      : new Date(sessionStart.getTime() + 10 * 60 * 1000); // Default 10 min session

    const biometrics = await garminService.getSessionBiometrics(sessionStart, sessionEnd);

    stressData.value = {
      pre: biometrics.preSession.stress,
      during: biometrics.duringSession.stress,
      post: biometrics.postSession.stress,
    };
  } else {
    // Generate demo data if no sessions
    const now = new Date();
    const sessionStart = new Date(now.getTime() - 30 * 60 * 1000);
    const sessionEnd = new Date(now.getTime() - 10 * 60 * 1000);

    const biometrics = await garminService.getSessionBiometrics(sessionStart, sessionEnd);

    stressData.value = {
      pre: biometrics.preSession.stress,
      during: biometrics.duringSession.stress,
      post: biometrics.postSession.stress,
    };
  }
}

// Watch for connection changes and load data
watch(
  wearableConnected,
  (connected) => {
    if (connected) {
      loadStressData();
    } else {
      stressData.value = null;
    }
  },
  { immediate: true }
);

function formatTime(seconds: number): string {
  if (!seconds) return '0s';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function connectWearable() {
  // In a real app, this would initiate OAuth flow
  // For now, simulate connection
  wearableConnected.value = true;
  connectedProvider.value = { id: 'garmin', name: 'Garmin Connect' };
  lastSyncTime.value = 'Just now';
}

function disconnectWearable() {
  wearableConnected.value = false;
  connectedProvider.value = null;
}

function selectProvider(providerId: string) {
  const provider = availableProviders.find((p) => p.id === providerId);
  if (provider) {
    connectedProvider.value = { id: provider.id, name: provider.name };
    wearableConnected.value = true;
    lastSyncTime.value = 'Just now';
  }
}
</script>
