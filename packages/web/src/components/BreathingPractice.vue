<template>
  <div :inert="isSessionVisible || undefined" :aria-hidden="isSessionVisible ? 'true' : undefined">
    <!-- Fullscreen Session Modal -->
    <Teleport to="body">
      <!-- Stop Session Confirmation Modal -->
      <div
        v-show="showStopConfirmation"
        data-testid="stop-confirmation"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="stop-session-title"
        aria-describedby="stop-session-description"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        @click.self="showStopConfirmation = false"
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
              <h3 id="stop-session-title" class="text-xl font-bold text-white mb-2">Stop Session?</h3>
              <p id="stop-session-description" class="text-slate-300 mb-6">
                Choose what to do with this in-progress session. You can keep going, save the incomplete progress, or
                exit without saving.
              </p>
              <div class="flex flex-col sm:flex-row gap-3 justify-end">
                <button
                  ref="cancelStopButtonRef"
                  data-testid="cancel-stop"
                  @click="showStopConfirmation = false"
                  class="btn-secondary"
                >
                  Cancel
                </button>
                <button @click="saveIncompleteSession" class="btn-primary">Save Session</button>
                <button @click="exitWithoutSavingSession" class="btn-danger">Exit</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Success Notification Modal -->
      <div
        v-show="showSuccessNotification"
        role="status"
        aria-live="polite"
        class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        @click.self="showSuccessNotification = false"
      >
        <div class="card-solid max-w-md w-full animate-scale-in">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-xl bg-emerald-500/10">
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
              <h3 class="text-xl font-bold text-white mb-2">{{ successMessage }}</h3>
              <div class="flex gap-3 justify-end mt-4">
                <button @click="showSuccessNotification = false" class="btn-primary">OK</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Overwrite Confirmation Modal -->
      <div
        v-show="showOverwriteConfirmation"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="overwrite-preset-title"
        class="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
        @click.self="showOverwriteConfirmation = false"
      >
        <div class="card-solid max-w-md w-full animate-scale-in">
          <div class="flex items-start gap-4">
            <div class="p-3 rounded-xl bg-amber-500/10">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-6 h-6 text-amber-400"
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
              <h3 id="overwrite-preset-title" class="text-xl font-bold text-white mb-2">Overwrite Preset?</h3>
              <p class="text-slate-300 mb-6">
                A preset named "{{ configName }}" already exists. Do you want to overwrite it?
              </p>
              <div class="flex gap-3 justify-end">
                <button @click="showOverwriteConfirmation = false" class="btn-secondary">Cancel</button>
                <button @click="confirmOverwrite" class="btn-warning">Overwrite</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        v-if="isSessionVisible"
        ref="sessionDialogRef"
        data-testid="session-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-dialog-title"
        tabindex="-1"
        class="fixed inset-0 z-50 overflow-y-auto safe-area-top safe-area-bottom"
        style="background: linear-gradient(135deg, #1f1a15 0%, #2a241d 40%, #1f1a15 100%)"
      >
        <div class="min-h-screen p-4 sm:p-6 lg:p-8">
          <!-- Exit Button -->
          <div class="sticky top-3 z-20 mb-3 flex justify-end pointer-events-none">
            <button
              data-testid="session-header-exit"
              @click="timer.phase.value === 'SESSION_COMPLETE' ? resetExercise() : confirmExit()"
              :aria-label="timer.phase.value === 'SESSION_COMPLETE' ? 'Back to Practice' : 'Exit breathing session'"
              :title="timer.phase.value === 'SESSION_COMPLETE' ? 'Back to Practice' : 'Exit session'"
              :class="[
                'min-h-11 rounded-xl transition-colors backdrop-blur-sm pointer-events-auto',
                timer.phase.value === 'SESSION_COMPLETE'
                  ? 'flex items-center gap-2 border border-emerald-400/40 bg-emerald-500/20 px-4 py-2.5 font-semibold text-emerald-50 shadow-lg shadow-emerald-950/30 hover:bg-emerald-500/30'
                  : 'p-2.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white',
              ]"
            >
              <svg
                v-if="timer.phase.value === 'SESSION_COMPLETE'"
                xmlns="http://www.w3.org/2000/svg"
                class="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
              <span v-if="timer.phase.value === 'SESSION_COMPLETE'">Back to Practice</span>
              <svg
                v-else
                xmlns="http://www.w3.org/2000/svg"
                class="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Session Content -->
          <div class="max-w-4xl mx-auto">
            <div class="card-solid !p-4 sm:!p-6">
              <h1 id="session-dialog-title" class="sr-only">Guided breathing session</h1>
              <BreathingVisualizer
                :phase="timer.phase.value"
                :current-time="timer.currentTime.value"
                :total-time="timer.totalPhaseTime.value"
                :scale="timer.breathingScale.value"
                :is-running="timer.isRunning.value"
                :config="config"
              />

              <!-- Progress Stats (when running) -->
              <div class="mt-4 sm:mt-8">
                <!-- Breathing Pattern Display -->
                <div class="mb-6 text-center">
                  <div
                    class="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50 rounded-xl text-slate-300 text-sm sm:text-base"
                  >
                    <span class="text-emerald-400 font-semibold">{{ config.inhaleTime }}s</span>
                    <span class="text-slate-500">→</span>
                    <span v-if="config.inhaleHoldTime" class="text-amber-400 font-semibold"
                      >{{ config.inhaleHoldTime }}s</span
                    >
                    <span v-if="config.inhaleHoldTime" class="text-slate-500">→</span>
                    <span class="text-blue-400 font-semibold">{{ config.exhaleTime }}s</span>
                    <span v-if="config.exhaleHoldTime" class="text-slate-500">→</span>
                    <span v-if="config.exhaleHoldTime" class="text-amber-400 font-semibold"
                      >{{ config.exhaleHoldTime }}s</span
                    >
                    <span class="text-slate-500 ml-2">×</span>
                    <span class="text-white font-semibold">{{ config.repetitions }} reps</span>
                  </div>
                </div>

                <!-- Progress Stats Grid -->
                <div class="grid grid-cols-3 gap-4">
                  <div class="stat-card">
                    <div class="text-3xl font-bold text-white">
                      {{ timer.currentRepetition.value }}
                      <span class="text-slate-500 text-lg">/ {{ config.repetitions }}</span>
                    </div>
                    <div class="text-sm text-slate-400 mt-1">Repetitions</div>
                  </div>
                  <div class="stat-card">
                    <div class="text-3xl font-bold text-white">
                      {{ timer.currentSet.value }}
                      <span class="text-slate-500 text-lg">/ {{ config.targetSets || '∞' }}</span>
                    </div>
                    <div class="text-sm text-slate-400 mt-1">Set</div>
                  </div>
                  <div class="stat-card">
                    <div class="text-3xl font-bold text-emerald-400">
                      {{ currentSession?.sets.length || 0 }}
                    </div>
                    <div class="text-sm text-slate-400 mt-1">Completed</div>
                  </div>
                </div>
              </div>

              <!-- Extended Hold Controls -->
              <div
                v-if="timer.phase.value === 'EXTENDED_INHALE_HOLD' || timer.phase.value === 'EXTENDED_EXHALE_HOLD'"
                class="mt-8 text-center p-6 glass rounded-2xl animate-scale-in"
              >
                <p class="text-slate-300 mb-3">
                  {{ isToleranceExtendedHold ? 'Hold as long as comfortable' : 'Hold for the timer' }}
                </p>
                <p class="text-5xl font-mono font-bold text-indigo-400 animate-pulse-glow">
                  {{ formatTime(isToleranceExtendedHold ? timer.extendedHoldElapsed.value : timer.currentTime.value) }}
                </p>
                <button
                  @click="endExtendedHold"
                  @keydown.space.prevent="endExtendedHold"
                  @keydown.enter.prevent="endExtendedHold"
                  class="mt-6 btn-warning btn-action"
                  aria-label="Release hold (Press Space or Enter)"
                >
                  <span class="flex items-center gap-2 justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    Release Hold
                  </span>
                  <span class="text-xs text-slate-400 mt-2 block">Press Space or Enter</span>
                </button>
              </div>

              <!-- Set Complete Controls -->
              <div
                v-if="timer.phase.value === 'SET_REST'"
                class="mt-8 text-center p-8 glass rounded-2xl animate-scale-in"
              >
                <p class="text-xl font-semibold text-white">Rest between sets</p>
                <p class="mt-2 text-5xl font-mono font-bold text-teal-300 tabular-nums">
                  {{ formatTime(timer.currentTime.value) }}
                </p>
                <p class="mt-2 text-sm text-slate-400">The next set starts automatically.</p>
                <div class="mt-6 flex flex-col sm:flex-row justify-center gap-4">
                  <button @click="startNextSet" class="btn-success btn-action">Start next set now</button>
                  <button @click="finishSession" class="btn-secondary btn-action">Finish session</button>
                </div>
              </div>

              <!-- Set Complete Controls -->
              <div
                v-if="timer.phase.value === 'SET_COMPLETE'"
                class="mt-8 text-center p-8 glass rounded-2xl animate-scale-in"
              >
                <div class="flex flex-col sm:flex-row justify-center gap-4">
                  <button @click="startNextSet" class="btn-success btn-action">
                    <span class="flex items-center gap-2 justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Start Next Set
                    </span>
                  </button>
                  <button @click="finishSession" class="btn-secondary btn-action">
                    <span class="flex items-center gap-2 justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-6 h-6"
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
                      Finish Session
                    </span>
                  </button>
                </div>
              </div>

              <!-- Session Complete -->
              <div
                v-if="timer.phase.value === 'SESSION_COMPLETE'"
                class="mt-8 text-center p-8 glass rounded-2xl animate-scale-in"
              >
                <div
                  class="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-10 h-10 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z"
                    />
                  </svg>
                </div>
                <p class="text-3xl text-emerald-400 font-bold mb-2">Session Complete!</p>
                <p class="text-slate-400 mb-6">Great job on completing your breathing practice!</p>

                <!-- Session Notes -->
                <div v-if="currentSession" class="mb-6 text-left">
                  <label class="form-label text-left block mb-2">Session Notes</label>
                  <textarea
                    v-model="sessionNotes"
                    rows="3"
                    class="form-input resize-none w-full"
                    placeholder="Add any notes about this session..."
                  ></textarea>
                  <button @click="saveSessionNotes" class="mt-3 btn-secondary">Save Notes</button>
                </div>

                <button data-testid="back-to-practice" @click="resetExercise" class="btn-primary btn-action">
                  <span class="flex items-center gap-2 justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back to Practice
                  </span>
                </button>
              </div>

              <!-- Main Controls -->
              <div
                v-if="
                  timer.phase.value !== 'SESSION_COMPLETE' &&
                  timer.phase.value !== 'SET_COMPLETE' &&
                  timer.phase.value !== 'SET_REST'
                "
                class="mt-4 sm:mt-8 flex flex-col sm:flex-row justify-center gap-4"
              >
                <template v-if="!timer.isPaused.value">
                  <button @click="timer.pause()" class="btn-warning btn-action">
                    <span class="flex items-center gap-2 justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Pause
                    </span>
                  </button>
                </template>
                <template v-else>
                  <button @click="timer.resume()" class="btn-primary btn-action">
                    <span class="flex items-center gap-2 justify-center">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="w-6 h-6"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Resume
                    </span>
                  </button>
                </template>

                <button @click="confirmExit" class="btn-danger btn-action">
                  <span class="flex items-center gap-2 justify-center">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      class="w-6 h-6"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                      />
                    </svg>
                    Stop
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Configuration Modal -->
      <div
        v-if="showConfigModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="configure-practice-title"
        class="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
        @click.self="showConfigModal = false"
      >
        <div
          class="card-solid max-w-4xl w-full my-4 sm:my-8 animate-scale-in max-h-[95vh] sm:max-h-[90vh] overflow-y-auto !p-4 sm:!p-6"
        >
          <!-- Modal Header -->
          <div
            data-testid="configure-practice-header"
            class="sticky top-0 bg-slate-800/95 backdrop-blur-sm -mx-4 sm:-mx-6 -mt-4 sm:-mt-6 px-4 sm:px-6 py-4 sm:py-5 mb-6 sm:mb-8 border-b border-slate-700/50 flex items-center justify-between z-10"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center"
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
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
              </div>
              <div>
                <h2 id="configure-practice-title" class="text-xl font-bold text-white">Configure Practice</h2>
                <p class="text-sm text-slate-400">Customize your breathing pattern</p>
              </div>
            </div>
            <button
              data-testid="close-practice-settings"
              @click="showConfigModal = false"
              aria-label="Close practice settings"
              class="min-h-11 min-w-11 p-2 rounded-lg hover:bg-slate-700/50 text-slate-400 hover:text-white transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Configuration Content -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <!-- Basic Timing -->
            <div class="space-y-5">
              <h3 class="font-semibold text-slate-200 flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5 text-blue-400"
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
                Breathing Timing
              </h3>

              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="form-label">Inhale (sec)</label>
                  <input v-model.number="config.inhaleTime" type="number" min="1" max="60" class="form-input" />
                </div>
                <div>
                  <label class="form-label">Inhale Hold</label>
                  <input v-model.number="config.inhaleHoldTime" type="number" min="0" max="60" class="form-input" />
                </div>
                <div>
                  <label class="form-label">Exhale (sec)</label>
                  <input v-model.number="config.exhaleTime" type="number" min="1" max="60" class="form-input" />
                </div>
                <div>
                  <label class="form-label">Exhale Hold</label>
                  <input v-model.number="config.exhaleHoldTime" type="number" min="0" max="60" class="form-input" />
                </div>
              </div>

              <div>
                <label class="form-label">Repetitions per Set</label>
                <input v-model.number="config.repetitions" type="number" min="1" max="100" class="form-input" />
              </div>
            </div>

            <!-- Extended Hold & Sets -->
            <div class="space-y-5">
              <h3 class="font-semibold text-slate-200 flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="w-5 h-5 text-purple-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                Extended Hold
              </h3>

              <div class="flex items-center gap-3">
                <button
                  @click="config.extendedHoldEnabled = !config.extendedHoldEnabled"
                  :class="['toggle', config.extendedHoldEnabled ? 'toggle-enabled' : 'toggle-disabled']"
                >
                  <span
                    :class="[
                      'toggle-knob',
                      config.extendedHoldEnabled ? 'toggle-knob-enabled' : 'toggle-knob-disabled',
                    ]"
                  />
                </button>
                <span class="text-slate-300">Enable Extended Hold</span>
              </div>

              <template v-if="config.extendedHoldEnabled">
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="form-label">Hold Type</label>
                    <select v-model="config.extendedHoldType" class="form-select">
                      <option value="INHALE">Inhale Hold</option>
                      <option value="EXHALE">Exhale Hold</option>
                    </select>
                  </div>
                  <div>
                    <label class="form-label">Mode</label>
                    <select v-model="config.extendedHoldMode" class="form-select">
                      <option value="TOLERANCE">Tolerance</option>
                      <option value="TIMED">Timed</option>
                    </select>
                  </div>
                </div>

                <div v-if="config.extendedHoldMode === 'TIMED'">
                  <label class="form-label">Hold Duration (seconds)</label>
                  <input
                    v-model.number="config.extendedHoldDuration"
                    type="number"
                    min="1"
                    max="300"
                    class="form-input"
                  />
                </div>

                <!-- Second Extended Hold -->
                <div class="pt-4 border-t border-slate-700/50">
                  <div class="flex items-center gap-3 mb-3">
                    <button
                      @click="config.secondExtendedHoldEnabled = !config.secondExtendedHoldEnabled"
                      :class="['toggle', config.secondExtendedHoldEnabled ? 'toggle-enabled' : 'toggle-disabled']"
                    >
                      <span
                        :class="[
                          'toggle-knob',
                          config.secondExtendedHoldEnabled ? 'toggle-knob-enabled' : 'toggle-knob-disabled',
                        ]"
                      />
                    </button>
                    <span class="text-slate-300">Second Extended Hold</span>
                  </div>

                  <div v-if="config.secondExtendedHoldEnabled">
                    <label class="form-label">Second Hold Type</label>
                    <select v-model="config.secondExtendedHoldType" class="form-select">
                      <option value="INHALE">Inhale Hold</option>
                      <option value="EXHALE">Exhale Hold</option>
                    </select>
                  </div>
                </div>
              </template>

              <div class="pt-4 border-t border-slate-700/50">
                <h3 class="font-semibold text-slate-200 flex items-center gap-2 mb-4">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5 text-emerald-400"
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
                  Sets
                </h3>
                <div class="space-y-4">
                  <label class="form-label">Target Sets (0 = unlimited)</label>
                  <input v-model.number="config.targetSets" type="number" min="0" max="20" class="form-input" />
                  <div>
                    <label class="form-label" for="rest-between-sets">Rest between sets (seconds)</label>
                    <input
                      id="rest-between-sets"
                      v-model.number="config.restBetweenSetsSeconds"
                      name="restBetweenSetsSeconds"
                      type="number"
                      min="0"
                      max="600"
                      class="form-input"
                    />
                    <p class="mt-1 text-xs text-slate-400">0 waits for you to start the next set.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Audio Settings -->
          <div class="mt-8 pt-6 border-t border-slate-700/50 w-full">
            <h3 class="font-semibold text-slate-200 flex items-center gap-2 mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-5 h-5 text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z"
                />
              </svg>
              Audio
            </h3>

            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <button
                  @click="config.soundEnabled = !config.soundEnabled"
                  :class="['toggle', config.soundEnabled ? 'toggle-enabled' : 'toggle-disabled']"
                >
                  <span
                    :class="['toggle-knob', config.soundEnabled ? 'toggle-knob-enabled' : 'toggle-knob-disabled']"
                  />
                </button>
                <span class="text-slate-300">Metronome (Click on count)</span>
              </div>

              <div class="w-full sm:w-auto">
                <SoundThemeSelector :sound-enabled="config.soundEnabled" />
              </div>
            </div>

            <div class="mt-4 space-y-3">
              <div class="flex items-center gap-3">
                <button
                  @click="config.ttsEnabled = !config.ttsEnabled"
                  :class="['toggle', config.ttsEnabled ? 'toggle-enabled' : 'toggle-disabled']"
                >
                  <span :class="['toggle-knob', config.ttsEnabled ? 'toggle-knob-enabled' : 'toggle-knob-disabled']" />
                </button>
                <span class="text-slate-300">Voice guidance (TTS)</span>
                <span v-if="!isTtsAvailable" class="text-xs text-slate-400">(not available)</span>
              </div>

              <div v-if="config.ttsEnabled" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="form-label">Voice</label>
                  <div class="relative">
                    <select v-model="config.ttsVoice" class="form-select" :disabled="!isTtsAvailable || loadingVoices">
                      <option v-if="loadingVoices" value="">Loading voices...</option>
                      <option v-else v-for="voice in sortedVoices" :key="voice.voiceURI" :value="voice.voiceURI">
                        {{ formatVoiceLabel(voice) }}
                      </option>
                    </select>
                    <div v-if="loadingVoices" class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg
                        class="animate-spin h-4 w-4 text-slate-400"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          class="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          stroke-width="4"
                        ></circle>
                        <path
                          class="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        ></path>
                      </svg>
                    </div>
                  </div>
                  <p v-if="!isTtsAvailable && !loadingVoices" class="text-xs text-slate-400 mt-2">
                    Voice list unavailable on this platform.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="mt-8 pt-6 border-t border-slate-700/50">
            <div
              v-if="configValidationError"
              data-testid="config-validation-error"
              class="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
            >
              {{ configValidationError }}
            </div>

            <!-- Save Preset Section -->
            <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              <div class="flex-1">
                <input
                  v-model="configName"
                  type="text"
                  placeholder="Enter a name to save this configuration..."
                  class="form-input"
                />
              </div>
              <button @click="saveConfig" class="btn-secondary whitespace-nowrap" :disabled="!canUseConfig">
                <span class="flex items-center gap-2 justify-center">
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
                      d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4"
                    />
                  </svg>
                  Save Preset
                </span>
              </button>
              <button @click="applyConfigAndClose" class="btn-primary whitespace-nowrap" :disabled="!canUseConfig">
                <span class="flex items-center gap-2 justify-center">
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
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Use these settings
                </span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Regular Configuration View (when not running) -->
    <div class="space-y-4 sm:space-y-6">
      <!-- Lab CTA (at bottom, after Start button) is rendered below -->

      <!-- Goal-based recommendation and repeat shortcuts -->
      <RecommendedActions
        v-if="goal && !isRunning"
        :goal="goal"
        :last-session="lastSession"
        @start="requestSessionStart"
        @adjust="handleRecommendedAdjust"
        @repeat="requestSessionStart"
        @open-lab="handleOpenLab"
      />

      <!-- Quick Start / Practice View - Always at Top -->
      <div class="card-solid !p-4 sm:!p-6">
        <BreathingVisualizer
          :phase="timer.phase.value"
          :current-time="timer.currentTime.value"
          :total-time="timer.totalPhaseTime.value"
          :scale="timer.breathingScale.value"
          :is-running="timer.isRunning.value"
          :config="config"
        />

        <!-- Current Pattern Display (when not running) -->
        <div v-if="!isRunning" class="mt-4 sm:mt-6 text-center">
          <div class="inline-flex items-center gap-2 px-4 py-2 bg-slate-700/50 rounded-xl text-slate-300">
            <span class="text-emerald-400 font-semibold">{{ config.inhaleTime }}s</span>
            <span class="text-slate-500">→</span>
            <span v-if="config.inhaleHoldTime" class="text-amber-400 font-semibold">{{ config.inhaleHoldTime }}s</span>
            <span v-if="config.inhaleHoldTime" class="text-slate-500">→</span>
            <span class="text-blue-400 font-semibold">{{ config.exhaleTime }}s</span>
            <span v-if="config.exhaleHoldTime" class="text-slate-500">→</span>
            <span v-if="config.exhaleHoldTime" class="text-amber-400 font-semibold">{{ config.exhaleHoldTime }}s</span>
            <span class="text-slate-500 ml-2">×</span>
            <span class="text-white font-semibold">{{ config.repetitions }} reps</span>
            <button
              @click="showConfigModal = true"
              class="p-1.5 rounded-lg hover:bg-slate-600/50 text-slate-400 hover:text-white transition-colors mr-1"
              title="Configure practice"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </button>
          </div>
          <p
            v-if="configValidationError"
            data-testid="quick-config-validation-error"
            class="mx-auto mt-3 max-w-xl rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200"
          >
            {{ configValidationError }}
          </p>
        </div>

        <!-- Progress Stats (when running) -->
        <div v-if="isRunning" class="mt-4 sm:mt-8">
          <p class="text-center text-slate-400 text-lg">Session in progress...</p>
        </div>

        <!-- Main Controls - Prominently at Top -->
        <div v-if="!isRunning" class="mt-4 sm:mt-8 flex flex-col sm:flex-row justify-center gap-4">
          <button @click="startExercise" class="btn-success btn-action" :disabled="!canUseConfig">
            <span class="flex items-center gap-2 justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Start Practice
            </span>
          </button>
        </div>
      </div>

      <!-- Lab CTA — compact, bottom placement -->
      <div
        v-if="showLabCta && !labCtaDismissed"
        class="flex items-center justify-between px-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06]"
      >
        <button
          @click="$emit('switch-tab', 'lab')"
          class="text-xs text-white/40 hover:text-emerald-400 transition-colors"
        >
          Explore your estimated breathing response in the
          <span class="font-medium text-white/60">Lab</span> →
        </button>
        <button @click="dismissLabCta" class="text-white/20 hover:text-white/50 ml-3 shrink-0" aria-label="Dismiss">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-3.5 h-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- Session Notes -->
      <div v-if="currentSession && timer.phase.value === 'SESSION_COMPLETE'" class="card-solid animate-fade-in">
        <h3 class="font-bold text-white mb-4 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="w-5 h-5 text-blue-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          Session Notes
        </h3>
        <textarea
          v-model="sessionNotes"
          rows="3"
          class="form-input resize-none"
          placeholder="Add any notes about this session..."
        ></textarea>
        <button @click="saveSessionNotes" class="mt-3 btn-secondary">Save Notes</button>
      </div>
    </div>

    <Teleport to="body">
      <!-- Optional pre-session comfort check-in -->
      <FeelingCheckIn
        :open="showBeforeCheckIn"
        stage="before"
        :error-message="beforeCheckInError"
        @submit="submitBeforeCheckIn"
        @skip="continueSessionStart()"
      />

      <!-- Optional post-session comfort check-in -->
      <FeelingCheckIn
        :open="showAfterCheckIn"
        stage="after"
        :error-message="afterCheckInError"
        @submit="saveAfterCheckIn"
        @skip="skipAfterCheckIn"
      />
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, inject, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { Capacitor } from '@capacitor/core';
import { KeepAwake } from '@capacitor-community/keep-awake';
import BreathingVisualizer from './BreathingVisualizer.vue';
import SoundThemeSelector from './SoundThemeSelector.vue';
import RecommendedActions from './RecommendedActions.vue';
import FeelingCheckIn from './FeelingCheckIn.vue';
import { useBreathingTimer, useStorage } from '../composables';
import { useAppLifecycle } from '../composables/useAppLifecycle';
import { useHrvStorage } from '../composables/useHrvStorage';
import {
  DEFAULT_BREATHING_CONFIG,
  BreathingConfigSchema,
  CreateBreathingConfigSchema,
  formatTime,
  type BreathingConfig,
  type FeelingScore,
  type Session,
  type SessionCheckIn,
  type SessionSet,
  type BreathingPhase,
  type TimerState,
  type UserGoal,
} from '@breath-in-flow/shared';
import { ttsService } from '../services/ttsService';

const LAST_CONFIG_KEY = 'herb_breathing_last_config';

const storage = useStorage();
// Provide safe defaults for injected values to avoid test warnings when not provided
const selectedConfig = inject<{ value: BreathingConfig | null } | null>('selectedConfig', null);
// Provide a safe no-op default so tests that don't provide this injection won't warn
const clearSelectedConfig = inject('clearSelectedConfig', () => {}) as () => void;

// UI state
const showConfigModal = ref(false);
const showStopConfirmation = ref(false);
const showSuccessNotification = ref(false);
const successMessage = ref('');
const showOverwriteConfirmation = ref(false);
const loadingVoices = ref(false);
const sessionDialogRef = ref<HTMLElement | null>(null);
const cancelStopButtonRef = ref<HTMLButtonElement | null>(null);
// Lab CTA state
const showLabCta = ref(false);
const labCtaDismissed = ref(localStorage.getItem('lab-cta-dismissed') === 'true');

defineProps<{ goal?: UserGoal }>();

const emit = defineEmits<{
  'switch-tab': [tab: string];
}>();

// The newest completed session, used to offer a one-tap repeat. Storage keeps
// sessions newest-first, so the first COMPLETED entry is the most recent one.
const lastSession = computed<Session | null>(
  () => storage.sessions.value.find((session) => session.status === 'COMPLETED') ?? null
);

function dismissLabCta() {
  showLabCta.value = false;
  labCtaDismissed.value = true;
  localStorage.setItem('lab-cta-dismissed', 'true');
}

// Configuration - start with defaults, will be overwritten by saved config
const config = reactive<BreathingConfig>({
  ...DEFAULT_BREATHING_CONFIG,
  name: 'Quick Practice',
});
const configName = ref('');
const configFieldLabels: Record<string, string> = {
  inhaleTime: 'Inhale time',
  inhaleHoldTime: 'Inhale hold time',
  exhaleTime: 'Exhale time',
  exhaleHoldTime: 'Exhale hold time',
  repetitions: 'Repetitions',
  extendedHoldDuration: 'Extended hold duration',
  secondExtendedHoldDuration: 'Second extended hold duration',
  targetSets: 'Target sets',
  restBetweenSetsSeconds: 'Rest between sets',
};

function parseCurrentConfig() {
  return BreathingConfigSchema.safeParse({
    ...DEFAULT_BREATHING_CONFIG,
    ...config,
  });
}

const configValidationError = computed(() => {
  const result = parseCurrentConfig();
  if (result.success) return '';

  const issue = result.error.issues[0];
  const field = String(issue?.path[0] ?? '');
  const label = configFieldLabels[field] ?? 'Practice settings';
  return `${label}: ${issue?.message ?? 'Please check this value'}`;
});

const canUseConfig = computed(() => configValidationError.value === '');

function getValidatedConfig(): BreathingConfig | null {
  const result = parseCurrentConfig();
  return result.success ? result.data : null;
}

const ttsVoices = ref<SpeechSynthesisVoice[]>([]);
const isTtsAvailable = computed(() => ttsVoices.value.length > 0 || ttsService.hasNativeSupport());
const userLang = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : 'en';
const userLangBase = userLang.split('-')[0];
const sortedVoices = computed(() => {
  const voices = [...ttsVoices.value];
  const score = (voice: SpeechSynthesisVoice) => {
    const lang = voice.lang?.toLowerCase() ?? '';
    const base = lang.split('-')[0];
    const exactMatch = lang === userLang ? 0 : 1;
    const baseMatch = base === userLangBase ? 0 : 1;
    const isEnglish = base === 'en' ? 0 : 1;
    const isDefault = voice.default ? 0 : 1;
    return [exactMatch, baseMatch, isEnglish, isDefault, voice.name?.toLowerCase() ?? '', lang];
  };

  return voices.sort((a, b) => {
    const kokoroFirst = Number(b.voiceURI === 'kokoro:af_heart') - Number(a.voiceURI === 'kokoro:af_heart');
    if (kokoroFirst) return kokoroFirst;
    const sa = score(a);
    const sb = score(b);
    for (let i = 0; i < sa.length; i += 1) {
      if (sa[i] < sb[i]) return -1;
      if (sa[i] > sb[i]) return 1;
    }
    return 0;
  });
});

// Session state
const currentSession = ref<Session | null>(null);
const currentSetData = ref<SessionSet | null>(null);
const sessionNotes = ref('');

// Optional check-in state. The pre-session prompt holds the pending config until
// the user continues or skips; the post-session prompt keeps the completed
// session id so its response can be saved after completion is already persisted.
const showBeforeCheckIn = ref(false);
const pendingStartConfig = ref<BreathingConfig | null>(null);
const beforeCheckInError = ref('');
const showAfterCheckIn = ref(false);
const completedSessionId = ref<string | null>(null);
const afterCheckInError = ref('');

// Load last used config on mount
onMounted(async () => {
  window.addEventListener('keydown', handleEscape);
  const savedConfig = localStorage.getItem(LAST_CONFIG_KEY);
  if (savedConfig) {
    try {
      const parsed = JSON.parse(savedConfig);
      // Validate config with Zod schema before applying
      const validatedConfig = BreathingConfigSchema.parse({ ...DEFAULT_BREATHING_CONFIG, ...parsed });
      Object.assign(config, validatedConfig);
      configName.value = validatedConfig.name || '';
    } catch (error) {
      // Invalid saved config, use defaults and log error
      console.warn('Invalid saved config in localStorage, using defaults:', error);
    }
  }

  refreshVoices();

  // Check if Lab CTA should be shown
  if (!labCtaDismissed.value) {
    try {
      const hrvStorageInstance = useHrvStorage();
      const hasData = await hrvStorageInstance.hasAnyMeasurements();
      showLabCta.value = !hasData;
    } catch {
      // IndexedDB may not be available
    }
  }
});

// Save config to localStorage whenever it changes (debounced to avoid excessive writes)
let saveConfigTimeout: ReturnType<typeof setTimeout> | null = null;
watch(
  config,
  (newConfig) => {
    if (saveConfigTimeout) {
      clearTimeout(saveConfigTimeout);
    }
    saveConfigTimeout = setTimeout(() => {
      localStorage.setItem(LAST_CONFIG_KEY, JSON.stringify(newConfig));
      saveConfigTimeout = null;
    }, 300);
  },
  { deep: true }
);

// Track TTS watchers for cleanup
const ttsWatchStopHandles: (() => void)[] = [];

ttsWatchStopHandles.push(
  watch(
    () => config.ttsEnabled,
    (enabled) => {
      ttsService.setEnabled(enabled);
    },
    { immediate: true, flush: 'sync' }
  )
);

ttsWatchStopHandles.push(
  watch(
    () => config.ttsVoice,
    (voiceUri) => {
      ttsService.setVoiceByUri(voiceUri);
    },
    { immediate: true, flush: 'sync' }
  )
);

// Timer
const timer = useBreathingTimer(config, {
  onPhaseChange: (phase, state) => {
    if (
      phase === 'INHALE' &&
      state.currentRepetition === 1 &&
      currentSession.value &&
      currentSetData.value?.setNumber !== state.currentSet
    ) {
      currentSetData.value = {
        setNumber: state.currentSet,
        completedRepetitions: 0,
        extendedHolds: [],
        startedAt: new Date(),
      };
    }
    announcePhase(phase, state);
  },
  onRepetitionComplete: (rep, _state) => {
    if (currentSetData.value) {
      currentSetData.value.completedRepetitions = rep;
    }
  },
  onSetComplete: (_set, _state) => {
    if (currentSession.value && currentSetData.value) {
      currentSetData.value.completedAt = new Date();
      storage.addSetToSession(currentSession.value.id!, currentSetData.value);
    }
  },
  onExtendedHoldStart: (_type, _state) => {
    // Extended hold started
  },
  onExtendedHoldEnd: (duration, type, _state) => {
    if (currentSession.value && currentSetData.value) {
      const isFirst = timer.isFirstExtendedHold.value;
      const mode = isFirst ? config.extendedHoldMode : config.secondExtendedHoldMode;
      const targetDuration =
        mode === 'TIMED' ? (isFirst ? config.extendedHoldDuration : config.secondExtendedHoldDuration) : undefined;

      currentSetData.value.extendedHolds.push({
        type,
        mode,
        targetDuration,
        actualDuration: duration,
        completedAt: new Date(),
      });
    }
  },
  onSessionComplete: (_state) => {
    if (currentSession.value) {
      finalizeCompletedSession(currentSession.value.id!);
    }
  },
});

const isToleranceExtendedHold = computed(() => {
  const phase = timer.phase.value;
  if (phase !== 'EXTENDED_INHALE_HOLD' && phase !== 'EXTENDED_EXHALE_HOLD') return false;

  const mode = timer.isFirstExtendedHold.value ? config.extendedHoldMode : config.secondExtendedHoldMode;
  return mode === 'TOLERANCE';
});

const isNativePlatform = Capacitor.isNativePlatform();

// Reconcile the latest desired state after each native operation. A lifecycle
// sleep request can therefore overtake an in-flight keep-awake request safely.
let keepAwakeDesired = false;
let keepAwakeActive = false;
let keepAwakeReconcilePromise: Promise<void> | null = null;

function reconcileKeepAwake(): Promise<void> {
  if (!isNativePlatform) return Promise.resolve();
  if (keepAwakeReconcilePromise) return keepAwakeReconcilePromise;

  let failedTarget: boolean | null = null;
  const reconciliation = (async () => {
    while (keepAwakeActive !== keepAwakeDesired) {
      const targetAwake = keepAwakeDesired;
      try {
        if (targetAwake) await KeepAwake.keepAwake();
        else await KeepAwake.allowSleep();
        keepAwakeActive = targetAwake;
      } catch (error) {
        failedTarget = targetAwake;
        console.warn(targetAwake ? 'KeepAwake.keepAwake failed' : 'KeepAwake.allowSleep failed', error);
        break;
      }
    }
  })();
  keepAwakeReconcilePromise = reconciliation;
  void reconciliation.finally(() => {
    if (keepAwakeReconcilePromise !== reconciliation) return;
    keepAwakeReconcilePromise = null;
    if (keepAwakeActive !== keepAwakeDesired && keepAwakeDesired !== failedTarget) {
      void reconcileKeepAwake();
    }
  });
  return reconciliation;
}

function enableKeepAwake(): Promise<void> {
  keepAwakeDesired = true;
  return reconcileKeepAwake();
}

function allowSleep(): Promise<void> {
  keepAwakeDesired = false;
  return reconcileKeepAwake();
}

watch(
  () => ({ running: timer.isRunning.value, paused: timer.isPaused.value }),
  ({ running, paused }) => {
    if (running && !paused) {
      void enableKeepAwake();
    } else {
      ttsService.stop();
      void allowSleep();
    }
  },
  { immediate: true }
);

useAppLifecycle({
  onInactive: () => {
    if (timer.isRunning.value && !timer.isPaused.value) {
      timer.pause();
    }
  },
  onActive: () => {},
});

// Cleanup watchers and services on unmount
onUnmounted(() => {
  window.removeEventListener('keydown', handleEscape);
  document.body.style.overflow = bodyOverflowBeforeSession;
  void allowSleep();
  // Stop all TTS watchers
  ttsWatchStopHandles.forEach((stop) => stop());
  // Reset TTS service
  ttsService.setEnabled(false);
  // Clear any pending localStorage save timeout
  if (saveConfigTimeout) {
    clearTimeout(saveConfigTimeout);
  }
});

// Watch for config changes from parent (when loading presets)
watch(
  () => selectedConfig?.value,
  (newConfig: BreathingConfig | null | undefined) => {
    if (newConfig) {
      Object.assign(config, { ...DEFAULT_BREATHING_CONFIG, ...newConfig });
      configName.value = newConfig.name;
      // Update sound theme in storage so the selector updates
      if (newConfig.soundTheme) {
        storage.setSoundTheme(newConfig.soundTheme);
      }
      // Clear the selected config so it doesn't persist if user navigates away and back
      clearSelectedConfig?.();
    }
  },
  { immediate: true }
);

// Check if practice is running
const isRunning = ref(false);
watch(
  () => timer.isRunning.value,
  (running: boolean) => {
    isRunning.value = running;
  },
  { immediate: true }
);

const isSessionVisible = computed(() => isRunning.value || timer.phase.value === 'SESSION_COMPLETE');
let focusBeforeSession: HTMLElement | null = null;
let bodyOverflowBeforeSession = '';

watch(
  isSessionVisible,
  async (visible) => {
    if (visible) {
      focusBeforeSession = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      bodyOverflowBeforeSession = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      await nextTick();
      sessionDialogRef.value?.focus();
      return;
    }

    const focusTarget = focusBeforeSession;
    focusBeforeSession = null;
    document.body.style.overflow = bodyOverflowBeforeSession;
    await nextTick();
    if (focusTarget?.isConnected) focusTarget.focus();
  },
  { immediate: true }
);

watch(showStopConfirmation, async (visible) => {
  if (visible) {
    await nextTick();
    cancelStopButtonRef.value?.focus();
  } else if (isSessionVisible.value) {
    await nextTick();
    sessionDialogRef.value?.focus();
  }
});

function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;

  if (showStopConfirmation.value) {
    showStopConfirmation.value = false;
  } else if (showOverwriteConfirmation.value) {
    showOverwriteConfirmation.value = false;
  } else if (showSuccessNotification.value) {
    showSuccessNotification.value = false;
  } else if (showConfigModal.value) {
    showConfigModal.value = false;
  } else if (isSessionVisible.value && timer.phase.value !== 'SESSION_COMPLETE') {
    confirmExit();
  }
}

function handleSystemBack(): boolean {
  if (showStopConfirmation.value) {
    showStopConfirmation.value = false;
    return true;
  }
  if (showOverwriteConfirmation.value) {
    showOverwriteConfirmation.value = false;
    return true;
  }
  if (showSuccessNotification.value) {
    showSuccessNotification.value = false;
    return true;
  }
  if (showConfigModal.value) {
    showConfigModal.value = false;
    return true;
  }
  if (showAfterCheckIn.value) {
    skipAfterCheckIn();
    return true;
  }
  if (showBeforeCheckIn.value) {
    showBeforeCheckIn.value = false;
    pendingStartConfig.value = null;
    return true;
  }
  if (timer.phase.value === 'SESSION_COMPLETE') {
    resetExercise();
    return true;
  }
  if (isSessionVisible.value) {
    confirmExit();
    return true;
  }
  return false;
}

defineExpose({ handleSystemBack });

function startValidatedExercise(candidate: BreathingConfig, before?: FeelingScore): boolean {
  Object.assign(config, candidate);

  // Create the session first; a rejected start leaves no session, so a submitted
  // pre-session score is never persisted as an orphan check-in.
  let session: Session | undefined;
  try {
    session = storage.createSession(candidate, before === undefined ? undefined : { before });
  } catch (error) {
    beforeCheckInError.value =
      error instanceof Error
        ? error.message
        : 'This session could not be saved. Please free some storage and try again.';
    return false;
  }
  if (!session?.id) {
    beforeCheckInError.value = 'This session could not be saved. Please try again.';
    return false;
  }
  currentSession.value = session;

  sessionNotes.value = '';

  // Create first set
  currentSetData.value = {
    setNumber: 1,
    completedRepetitions: 0,
    extendedHolds: [],
    startedAt: new Date(),
  };

  timer.start();
  return true;
}

// Single seam for beginning a session. A start request opens the optional
// pre-session check-in; the session itself begins only once the check-in is
// continued or skipped. Callers (start, repeat, Start Practice) stay the same.
function requestSessionStart(candidate: BreathingConfig) {
  pendingStartConfig.value = BreathingConfigSchema.parse(candidate);
  beforeCheckInError.value = '';
  showBeforeCheckIn.value = true;
}

function continueSessionStart(before?: FeelingScore) {
  const candidate = pendingStartConfig.value;
  if (!candidate) return;
  if (!startValidatedExercise(candidate, before)) return;
  showBeforeCheckIn.value = false;
  pendingStartConfig.value = null;
  beforeCheckInError.value = '';
}

function submitBeforeCheckIn(payload: { score: FeelingScore }) {
  continueSessionStart(payload.score);
}

// Completion is persisted before the post-session prompt appears, and the
// completed session id is retained so a submitted response can be saved without
// completing the session a second time.
function finalizeCompletedSession(id: string) {
  try {
    storage.completeSession(id);
  } catch (error) {
    successMessage.value =
      error instanceof Error ? error.message : 'The completed session could not be saved. Please try again.';
    showSuccessNotification.value = true;
    return;
  }
  completedSessionId.value = id;
  afterCheckInError.value = '';
  showAfterCheckIn.value = true;
}

function saveAfterCheckIn(payload: { score: FeelingScore; comment?: string }) {
  const id = completedSessionId.value;
  if (!id) return;
  const updates: Partial<SessionCheckIn> = { after: payload.score };
  if (payload.comment) updates.comment = payload.comment;
  try {
    const saved = storage.setSessionCheckIn(id, updates);
    if (!saved) throw new Error('Your check-in could not be saved. Please try again.');
  } catch (error) {
    afterCheckInError.value =
      error instanceof Error ? error.message : 'Your check-in could not be saved. Please try again.';
    return;
  }
  showAfterCheckIn.value = false;
  completedSessionId.value = null;
  afterCheckInError.value = '';
}

function skipAfterCheckIn() {
  showAfterCheckIn.value = false;
  completedSessionId.value = null;
  afterCheckInError.value = '';
}

function startExercise() {
  const validatedConfig = getValidatedConfig();
  if (!validatedConfig) return;
  requestSessionStart(validatedConfig);
}

function handleRecommendedAdjust(sessionConfig: BreathingConfig) {
  Object.assign(config, sessionConfig);
  configName.value = sessionConfig.name;
  showConfigModal.value = true;
}

function handleOpenLab() {
  emit('switch-tab', 'lab');
}

function stopExercise() {
  timer.stop();
  currentSession.value = null;
  currentSetData.value = null;
  sessionNotes.value = '';
}

function confirmExit() {
  showStopConfirmation.value = true;
}

function persistPartialSetProgress() {
  if (!currentSession.value || !currentSetData.value) return;

  const session = storage.getSession(currentSession.value.id!);
  const hasSetAlready = session?.sets.some((set) => set.setNumber === currentSetData.value?.setNumber);

  if (!hasSetAlready) {
    storage.addSetToSession(currentSession.value.id!, { ...currentSetData.value });
  }
}

function exitWithoutSavingSession() {
  showStopConfirmation.value = false;

  if (currentSession.value?.id) {
    storage.deleteSession(currentSession.value.id);
  }

  stopExercise();
}

function saveIncompleteSession() {
  showStopConfirmation.value = false;

  if (currentSession.value?.id) {
    persistPartialSetProgress();
    storage.cancelSession(currentSession.value.id);

    const setsCompleted = currentSession.value.sets.length;
    successMessage.value = `Session saved with ${setsCompleted} set${setsCompleted !== 1 ? 's' : ''} completed`;
    showSuccessNotification.value = true;
    setTimeout(() => {
      showSuccessNotification.value = false;
    }, 3000);
  }

  stopExercise();
}

function endExtendedHold() {
  timer.endExtendedHold();
}

function startNextSet() {
  // Create new set data
  currentSetData.value = {
    setNumber: timer.currentSet.value + 1,
    completedRepetitions: 0,
    extendedHolds: [],
    startedAt: new Date(),
  };

  timer.nextSet();
}

function finishSession() {
  // Automatic target-set completion is persisted by onSessionComplete. Manual
  // finishes from SET_COMPLETE/SET_REST still need to finalize the session and
  // then offer the optional post-session check-in.
  if (currentSession.value && timer.phase.value !== 'SESSION_COMPLETE') {
    finalizeCompletedSession(currentSession.value.id!);
  }
  timer.stop();
  currentSession.value = null;
  currentSetData.value = null;
}

function resetExercise() {
  timer.stop();
  currentSession.value = null;
  currentSetData.value = null;
  sessionNotes.value = '';
}

function applyConfigAndClose() {
  const validatedConfig = getValidatedConfig();
  if (!validatedConfig) return;
  Object.assign(config, validatedConfig);
  showConfigModal.value = false;
}

function saveConfig() {
  const validatedConfig = getValidatedConfig();
  if (!validatedConfig) return;

  if (!configName.value.trim()) {
    successMessage.value = 'Please enter a configuration name';
    showSuccessNotification.value = true;
    return;
  }

  // Check if a saved preset with this name already exists
  const existingConfigs = storage.getAllConfigs();
  const existingConfig = existingConfigs?.find((c) => c.name.toLowerCase() === configName.value.trim().toLowerCase());

  if (existingConfig) {
    // Show confirmation modal to overwrite
    showOverwriteConfirmation.value = true;
    return;
  }

  // Save the new config
  storage.createConfig({
    ...CreateBreathingConfigSchema.parse(validatedConfig),
    name: configName.value.trim(),
  });

  successMessage.value = 'Configuration saved!';
  showSuccessNotification.value = true;
}

function confirmOverwrite() {
  showOverwriteConfirmation.value = false;

  const validatedConfig = getValidatedConfig();
  if (!validatedConfig) return;

  // Guard against undefined configName
  if (!configName.value) {
    return;
  }

  // Preserve the preset identity so historical sessions keep their config link.
  const existingConfigs = storage.getAllConfigs();
  const existingConfig = existingConfigs?.find((c) => c.name.toLowerCase() === configName.value.trim().toLowerCase());
  const updatedConfig = {
    ...CreateBreathingConfigSchema.parse(validatedConfig),
    name: configName.value.trim(),
  };

  if (existingConfig?.id) {
    storage.updateConfig(existingConfig.id, updatedConfig);
  } else {
    storage.createConfig(updatedConfig);
  }

  successMessage.value = 'Configuration saved!';
  showSuccessNotification.value = true;
}

function saveSessionNotes() {
  if (currentSession.value) {
    storage.updateSession(currentSession.value.id!, { notes: sessionNotes.value });
    successMessage.value = 'Notes saved!';
    showSuccessNotification.value = true;
  }
}

async function refreshVoices() {
  loadingVoices.value = true;
  try {
    const voices = await ttsService.loadVoices();
    ttsVoices.value = voices;
    const hasVoices = voices.length > 0;
    const hasDeviceVoices = voices.some((voice) => !voice.voiceURI.startsWith('kokoro:'));
    if (config.ttsVoice && hasDeviceVoices && !voices.some((v) => v.voiceURI === config.ttsVoice)) {
      config.ttsVoice = undefined;
    }
    if (!config.ttsVoice && hasVoices) {
      const preferred = voices.find((v) => v.lang?.toLowerCase().startsWith('en'))?.voiceURI ?? voices[0].voiceURI;
      config.ttsVoice = preferred;
    }
    if (config.ttsVoice) {
      ttsService.setVoiceByUri(config.ttsVoice);
    } else if (!hasVoices) {
      ttsService.setVoiceByUri(null);
    }
  } finally {
    loadingVoices.value = false;
  }
}

function getPhaseDurationSeconds(phase: BreathingPhase, state: TimerState): number {
  switch (phase) {
    case 'INHALE':
      return config.inhaleTime;
    case 'EXHALE':
      return config.exhaleTime;
    case 'INHALE_HOLD':
      return config.inhaleHoldTime;
    case 'EXHALE_HOLD':
      return config.exhaleHoldTime;
    case 'EXTENDED_INHALE_HOLD':
      return state.isFirstExtendedHold ? config.extendedHoldDuration : config.secondExtendedHoldDuration;
    case 'EXTENDED_EXHALE_HOLD':
      return state.isFirstExtendedHold ? config.extendedHoldDuration : config.secondExtendedHoldDuration;
    default:
      return 0;
  }
}

function formatVoiceLabel(voice: SpeechSynthesisVoice): string {
  const parts: string[] = [];
  if (voice.name) parts.push(voice.name);
  if (voice.lang) parts.push(voice.lang);
  if (voice.default) parts.push('default');
  if (voice.localService === false) parts.push('online');
  return parts.join(' • ') || 'Voice';
}

function announcePhase(phase: BreathingPhase, state: TimerState) {
  if (!config.ttsEnabled) return;

  const durationSeconds = getPhaseDurationSeconds(phase, state);
  const phrases: Partial<Record<BreathingPhase, string>> = {
    INHALE: 'Full Breath In',
    EXHALE: 'Full Breath Out',
    INHALE_HOLD: 'Hold',
    EXHALE_HOLD: 'Hold',
    EXTENDED_INHALE_HOLD: 'Hold',
    EXTENDED_EXHALE_HOLD: 'Hold',
  };
  const phrase = phrases[phase];
  if (phrase) {
    ttsService.speak(phrase, { targetDurationSeconds: durationSeconds });
  } else {
    ttsService.stop();
  }
}
</script>
