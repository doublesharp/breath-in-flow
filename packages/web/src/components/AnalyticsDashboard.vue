<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="card-solid animate-fade-in">
      <div class="flex items-center gap-3 mb-6">
        <div class="w-10 h-10 shrink-0 rounded-xl bg-surface-raised text-sage flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <div>
          <h2 class="text-xl font-bold text-primary">Analytics Dashboard</h2>
          <p class="text-sm text-muted">Track your breathing practice and hold progress</p>
        </div>
      </div>

      <!-- Quick Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div class="stat-card">
          <div class="text-2xl font-semibold tabular-nums text-primary sm:text-3xl">{{ stats.totalSessions }}</div>
          <div class="text-sm text-muted mt-1">Total Sessions</div>
        </div>
        <div class="stat-card">
          <div class="text-2xl font-semibold tabular-nums text-primary sm:text-3xl">{{ stats.totalSets }}</div>
          <div class="text-sm text-muted mt-1">Total Sets</div>
        </div>
        <div class="stat-card">
          <div class="text-2xl font-semibold tabular-nums text-primary sm:text-3xl">
            {{ formatTime(stats.avgHoldTime) }}
          </div>
          <div class="text-sm text-muted mt-1">Avg Hold Time</div>
        </div>
        <div class="stat-card">
          <div class="text-2xl font-semibold tabular-nums text-sage sm:text-3xl">
            {{ formatTime(stats.maxHoldTime) }}
          </div>
          <div class="text-sm text-muted mt-1">Best Hold Time</div>
        </div>
      </div>
    </div>

    <!-- Wearable Connection (hidden until server-side OAuth is implemented) -->
    <div v-if="ENABLE_WEARABLES" class="card-solid animate-fade-in">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold text-primary">Wearable Devices</h3>
        <button v-if="!wearableConnected" @click="connectWearable" class="btn-primary">Connect Device</button>
      </div>

      <div v-if="wearableConnected" class="flex items-center gap-4 p-4 bg-sage/10 border border-sage/20 rounded-xl">
        <div class="w-12 h-12 rounded-full bg-sage/15 flex items-center justify-center">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-6 h-6 text-sage"
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
          <div class="font-semibold text-sage">{{ connectedProvider?.name || 'Garmin' }} Connected</div>
          <div class="text-sm text-muted">Last synced: {{ lastSyncTime }}</div>
        </div>
        <button
          @click="disconnectWearable"
          class="px-3 py-1.5 text-sm text-danger hover:text-danger hover:bg-terracotta/10 rounded-lg transition-all"
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
            <svg
              aria-hidden="true"
              class="size-6 shrink-0 text-sage"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path :d="provider.iconPath" />
            </svg>
            <div>
              <div class="font-medium text-primary group-hover:text-sage transition-colors">{{ provider.name }}</div>
              <div class="text-xs text-muted">{{ provider.description }}</div>
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- Charts Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Sessions per Week -->
      <SessionsPerWeekChart :sessions="completedSessions" />

      <!-- Hold Time Progress -->
      <HoldTimeChart :sessions="completedSessions" />

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

    <!-- Recent Sessions -->
    <div v-if="sessions.length > 0" class="card-solid animate-fade-in">
      <h3 class="text-lg font-semibold text-primary mb-4">Recent Sessions</h3>
      <div class="space-y-3">
        <div
          v-for="session in recentSessions"
          :key="session.id"
          class="rounded-xl border border-line-subtle bg-surface-inset p-3 sm:p-4"
        >
          <div
            class="flex flex-col gap-3 sm:grid sm:grid-cols-[minmax(0,1fr)_3.5rem_10rem_7rem] sm:items-center sm:gap-4"
          >
            <div class="min-w-0 wrap-anywhere">
              <div class="font-medium text-primary">{{ session.configSnapshot.name }}</div>
              <div class="text-sm text-muted">{{ formatSessionDate(session.startedAt) }}</div>
            </div>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-2 sm:contents">
              <div>
                <div class="text-sm text-muted">Sets</div>
                <div class="font-semibold tabular-nums text-primary">{{ session.completedSets }}</div>
              </div>
              <div class="min-w-0 max-w-full">
                <div class="text-sm text-muted">Pattern</div>
                <div class="font-semibold tabular-nums text-primary">
                  {{ formatSessionPattern(session.configSnapshot) }}
                </div>
              </div>
              <SessionStatusBadge :status="session.status" class="ml-auto sm:m-0" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div v-if="sessions.length === 0" class="card-solid animate-fade-in text-center py-12">
      <div class="w-16 h-16 mx-auto mb-4 rounded-full bg-surface-raised text-sage flex items-center justify-center">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
          />
        </svg>
      </div>
      <p class="text-muted">No session data yet.</p>
      <p class="text-muted text-sm mt-1">Complete some breathing exercises to see your analytics!</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { formatSessionDate, formatSessionPattern } from '../utils/practiceSummary';
import { useStorage } from '../composables';
import SessionStatusBadge from './SessionStatusBadge.vue';
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
const completedSessions = computed(() => sessions.value.filter((session) => session.status === 'COMPLETED'));
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
  {
    id: 'garmin',
    name: 'Garmin Connect',
    iconPath:
      'M9 6l1-4h4l1 4m-6 12 1 4h4l1-4M9 6h6a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H9a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Zm3 3v3l2 1',
    description: 'Sync stress & HRV data',
  },
  {
    id: 'apple',
    name: 'Apple Health',
    iconPath: 'M20.8 5.6a5.1 5.1 0 0 0-7.2 0L12 7.2l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 21l8.8-8.2a5.1 5.1 0 0 0 0-7.2Z',
    description: 'iOS HealthKit integration',
  },
  { id: 'fitbit', name: 'Fitbit', iconPath: 'M3 12h4l2-6 4 12 2-6h6', description: 'Heart rate & sleep data' },
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
  const roundedSeconds = Math.round(seconds);
  if (roundedSeconds < 60) return `${roundedSeconds}s`;
  const mins = Math.floor(roundedSeconds / 60);
  const secs = roundedSeconds % 60;
  return `${mins}m ${secs}s`;
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
