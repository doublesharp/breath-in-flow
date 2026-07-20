<template>
  <div>
    <!-- Help Button (Fixed position on desktop, in header on mobile) -->
    <button @click="showHelp = true" class="help-trigger" aria-label="Open help">
      <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span class="hidden sm:inline">Help</span>
    </button>

    <!-- Help Modal -->
    <Teleport to="body">
      <Transition name="help-fade">
        <div v-if="showHelp" class="help-modal-overlay safe-area-top safe-area-bottom" @click.self="showHelp = false">
          <div class="help-modal" role="dialog" aria-modal="true" aria-labelledby="help-dialog-title">
            <!-- Header -->
            <div class="help-header">
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
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 id="help-dialog-title" class="text-xl font-bold text-white">Help & Guide</h2>
                  <p class="text-sm text-slate-400">Learn how to use {{ AppConfig.appName }}</p>
                </div>
              </div>
              <button @click="showHelp = false" class="help-close-btn" aria-label="Close help">
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

            <!-- Navigation Tabs -->
            <div class="help-tabs">
              <button
                v-for="tab in tabs"
                :key="tab.id"
                @click="activeSection = tab.id"
                :class="['help-tab', activeSection === tab.id ? 'help-tab-active' : '']"
              >
                <component :is="tab.icon" class="w-4 h-4" />
                <span>{{ tab.label }}</span>
              </button>
            </div>

            <!-- Content -->
            <div class="help-content">
              <!-- Getting Started -->
              <div v-if="activeSection === 'start'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon bg-emerald-500/20 text-emerald-400">
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
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </span>
                  Getting Started
                </h3>

                <div class="help-card">
                  <h4 class="help-card-title">Quick Start</h4>
                  <ol class="help-list">
                    <li>Go to the <strong>Practice</strong> tab</li>
                    <li>The default pattern is ready to use - just tap <strong>Start Practice</strong></li>
                    <li>Follow the visual breathing guide - the circle expands and contracts</li>
                    <li>The color indicates the current phase (blue = inhale, green = exhale)</li>
                  </ol>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Navigation</h4>
                  <ul class="help-list">
                    <li><strong>Practice</strong> - Main breathing practice area</li>
                    <li><strong>Lab</strong> - Optional pulse-variability measurements and resonance training</li>
                    <li><strong>History</strong> - View your past sessions</li>
                    <li><strong>Presets</strong> - Save and load breathing patterns</li>
                    <li><strong>Analytics</strong> - Track your progress with charts</li>
                  </ul>
                </div>
              </div>

              <!-- Practice Guide -->
              <div v-if="activeSection === 'practice'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon bg-blue-500/20 text-blue-400">
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
                  </span>
                  Practice Guide
                </h3>

                <div class="help-card">
                  <h4 class="help-card-title">Breathing Phases</h4>
                  <div class="space-y-3">
                    <div class="flex items-center gap-3">
                      <span class="w-3 h-3 rounded-full bg-blue-500"></span>
                      <span><strong>Inhale</strong> - Breathe in slowly through your nose</span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="w-3 h-3 rounded-full bg-purple-500"></span>
                      <span><strong>Inhale Hold</strong> - Hold your breath with lungs full</span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="w-3 h-3 rounded-full bg-emerald-500"></span>
                      <span><strong>Exhale</strong> - Breathe out slowly through your mouth</span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="w-3 h-3 rounded-full bg-amber-500"></span>
                      <span><strong>Exhale Hold</strong> - Hold with lungs empty</span>
                    </div>
                  </div>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Controls</h4>
                  <ul class="help-list">
                    <li><strong>Start</strong> - Begin the breathing practice</li>
                    <li><strong>Pause/Resume</strong> - Temporarily stop or continue</li>
                    <li><strong>Stop</strong> - End the current session</li>
                    <li><strong>Release Hold</strong> - End an extended breath hold early</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Visual Guide</h4>
                  <p class="text-slate-300 text-sm">
                    The breathing circle shows your progress through each phase. Watch the circle expand during inhale
                    and contract during exhale. The countdown timer shows seconds remaining in the current phase.
                  </p>
                </div>
              </div>

              <!-- Configuration -->
              <div v-if="activeSection === 'config'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon bg-purple-500/20 text-purple-400">
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
                        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                      />
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </span>
                  Configuration
                </h3>

                <div class="help-card">
                  <h4 class="help-card-title">Breathing Timing</h4>
                  <ul class="help-list">
                    <li><strong>Inhale Time</strong> - Duration for breathing in (1-60 seconds)</li>
                    <li><strong>Inhale Hold</strong> - Optional pause after inhaling (0-60 seconds)</li>
                    <li><strong>Exhale Time</strong> - Duration for breathing out (1-60 seconds)</li>
                    <li><strong>Exhale Hold</strong> - Optional pause after exhaling (0-60 seconds)</li>
                    <li><strong>Repetitions</strong> - How many breath cycles per set</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Extended Holds</h4>
                  <p class="text-slate-300 text-sm mb-3">
                    Extended holds are longer breath holds performed at the end of each set. They're great for building
                    breath tolerance.
                  </p>
                  <ul class="help-list">
                    <li><strong>Hold Type</strong> - Choose inhale hold or exhale hold</li>
                    <li><strong>Tolerance Mode</strong> - Timer counts up; release when ready</li>
                    <li><strong>Timed Mode</strong> - Set a specific duration to hold</li>
                    <li><strong>Second Hold</strong> - Optionally add another extended hold</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Sets</h4>
                  <p class="text-slate-300 text-sm">
                    A set consists of your repetitions plus any extended holds. Set a
                    <strong>Target Sets</strong> number or leave at 0 to go indefinitely. After each set, choose to
                    continue or finish your session.
                  </p>
                </div>
              </div>

              <!-- Lab & Measurements -->
              <div v-if="activeSection === 'lab'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon bg-emerald-500/20 text-emerald-400">♥</span>
                  Lab & Measurements
                </h3>

                <div class="help-card">
                  <h4 class="help-card-title">What the camera measures</h4>
                  <p class="text-slate-300 text-sm">
                    The camera estimates pulse timing from fingertip color changes. The app reports pulse variability,
                    which can resemble ECG-derived HRV but is not an ECG or a medical measurement. Compare trends only
                    when posture, time of day, sensor placement, and protocol are similar.
                  </p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Sensor choices</h4>
                  <ul class="help-list">
                    <li>
                      <strong>Camera Pulse</strong> - Recommended phone-only option; cover the rear lens gently and keep
                      still.
                    </li>
                    <li>
                      <strong>Chest Motion</strong> - Experimental (Beta); phone motion can be mistaken for heart
                      timing.
                    </li>
                    <li>
                      <strong>Camera + Chest</strong> - Experimental (Beta); requires both signals to remain steady.
                    </li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Why duration matters</h4>
                  <p class="text-slate-300 text-sm">
                    Short protocols can support basic time-domain trend metrics when enough clean beats are detected.
                    Frequency-domain results require the full five minutes and appear as unavailable when the recording
                    is too short or too noisy. The app never fills missing metrics with made-up values.
                  </p>
                </div>

                <div class="help-tip warning">
                  <p class="text-sm">
                    Use Lab results for wellness training and personal trends, not diagnosis. Stop the measurement if
                    you feel unwell and discuss health concerns with a qualified clinician.
                  </p>
                </div>
              </div>

              <!-- Techniques -->
              <div v-if="activeSection === 'techniques'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon bg-amber-500/20 text-amber-400">
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
                        d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                      />
                    </svg>
                  </span>
                  Popular Techniques
                </h3>

                <div class="help-card">
                  <h4 class="help-card-title">Box Breathing (4-4-4-4)</h4>
                  <p class="text-slate-400 text-sm mb-2">Used by Navy SEALs for stress relief</p>
                  <div class="help-pattern">
                    <span class="text-blue-400">4s inhale</span>
                    <span class="text-slate-500">→</span>
                    <span class="text-purple-400">4s hold</span>
                    <span class="text-slate-500">→</span>
                    <span class="text-emerald-400">4s exhale</span>
                    <span class="text-slate-500">→</span>
                    <span class="text-amber-400">4s hold</span>
                  </div>
                  <p class="text-slate-300 text-sm mt-2">Great for: Focus, anxiety relief, grounding</p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">4-7-8 Relaxation</h4>
                  <p class="text-slate-400 text-sm mb-2">Dr. Andrew Weil's relaxation technique</p>
                  <div class="help-pattern">
                    <span class="text-blue-400">4s inhale</span>
                    <span class="text-slate-500">→</span>
                    <span class="text-purple-400">7s hold</span>
                    <span class="text-slate-500">→</span>
                    <span class="text-emerald-400">8s exhale</span>
                  </div>
                  <p class="text-slate-300 text-sm mt-2">Great for: Sleep, deep relaxation, calming</p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Coherent Breathing (5-5)</h4>
                  <p class="text-slate-400 text-sm mb-2">Even-paced breathing for a calm, steady practice</p>
                  <div class="help-pattern">
                    <span class="text-blue-400">5s inhale</span>
                    <span class="text-slate-500">→</span>
                    <span class="text-emerald-400">5s exhale</span>
                  </div>
                  <p class="text-slate-300 text-sm mt-2">Great for: Heart coherence, balance, daily practice</p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Diaphragm Resistance Training</h4>
                  <p class="text-slate-300 text-sm">
                    Use the guided starter preset with a purpose-designed inspiratory resistance trainer. Begin with
                    light resistance and controlled technique. Endurance work adds comfortable repetitions or sets;
                    strengthening uses higher resistance only after technique is consistent.
                  </p>
                  <ul class="help-list mt-3">
                    <li>Do not substitute a blocked airway or improvised restriction.</li>
                    <li>Keep the shoulders and neck relaxed; do not strain or chase breathlessness.</li>
                    <li>Stop for dizziness, faintness, chest pain, unusual shortness of breath, or loss of control.</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Cyclic Hyperventilation Method</h4>
                  <p class="text-slate-400 text-sm mb-2">Power breathing with extended holds</p>
                  <div class="help-pattern">
                    <span class="text-blue-400">2s inhale</span>
                    <span class="text-slate-500">→</span>
                    <span class="text-emerald-400">2s exhale</span>
                    <span class="text-slate-500">× 30 reps</span>
                  </div>
                  <p class="text-slate-300 text-sm mt-2">Then: Extended exhale hold + recovery breath</p>
                  <p class="text-slate-300 text-sm">Great for: Energy, cold tolerance, breath control</p>
                </div>

                <div class="help-tip">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5 text-amber-400 flex-shrink-0"
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
                  <p>Start with shorter hold times and work your way up. Never push to the point of discomfort.</p>
                </div>
              </div>

              <!-- Presets & History -->
              <div v-if="activeSection === 'data'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon bg-indigo-500/20 text-indigo-400">
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
                  </span>
                  Presets & History
                </h3>

                <div class="help-card">
                  <h4 class="help-card-title">Saving Presets</h4>
                  <ol class="help-list">
                    <li>Configure your breathing pattern in the Practice tab</li>
                    <li>Enter a name in the "Configuration name" field</li>
                    <li>Tap <strong>Save Configuration</strong></li>
                    <li>Access your saved presets in the Presets tab</li>
                  </ol>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Using Presets</h4>
                  <ul class="help-list">
                    <li><strong>Load</strong> - Apply the preset to the Practice tab</li>
                    <li><strong>Edit</strong> - Modify the preset settings</li>
                    <li><strong>Delete</strong> - Remove the preset</li>
                  </ul>
                  <p class="text-slate-300 text-sm mt-2">
                    Built-in templates (Box Breathing, 4-7-8, etc.) are available as quick-start options.
                  </p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Session History</h4>
                  <p class="text-slate-300 text-sm mb-2">
                    Every completed session is automatically saved. View your history to:
                  </p>
                  <ul class="help-list">
                    <li>See your breathing pattern for each session</li>
                    <li>Review extended hold times and tolerance</li>
                    <li>Track your progress over time</li>
                    <li>Delete old sessions you no longer need</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Analytics Dashboard</h4>
                  <p class="text-slate-300 text-sm">The Analytics tab shows your progress with visual charts:</p>
                  <ul class="help-list">
                    <li><strong>Hold Time Chart</strong> - Track breath hold improvements</li>
                    <li><strong>Sessions Per Week</strong> - Monitor practice consistency</li>
                    <li><strong>Quick Stats</strong> - Total sessions, sets, and averages</li>
                  </ul>
                </div>
              </div>

              <!-- Tips -->
              <div v-if="activeSection === 'tips'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon bg-rose-500/20 text-rose-400">
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
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                      />
                    </svg>
                  </span>
                  Tips & Best Practices
                </h3>

                <div class="help-card">
                  <h4 class="help-card-title">Before You Start</h4>
                  <ul class="help-list">
                    <li>Find a quiet, comfortable place to sit or lie down</li>
                    <li>Loosen any tight clothing</li>
                    <li>Sit with good posture - spine straight, shoulders relaxed</li>
                    <li>Close your eyes or soften your gaze</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">During Practice</h4>
                  <ul class="help-list">
                    <li>Breathe through your nose when possible</li>
                    <li>Let your belly expand on inhale (diaphragmatic breathing)</li>
                    <li>Keep your jaw and shoulders relaxed</li>
                    <li>If you feel dizzy, stop and breathe normally</li>
                    <li>Don't force - let the breath flow naturally</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Building Your Practice</h4>
                  <ul class="help-list">
                    <li>Start with shorter sessions (3-5 minutes)</li>
                    <li>Practice consistently - daily is ideal</li>
                    <li>Gradually increase hold times as you improve</li>
                    <li>Track your progress using the Analytics tab</li>
                    <li>Save your favorite patterns as presets</li>
                  </ul>
                </div>

                <div class="help-tip warning">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5 text-amber-400 flex-shrink-0"
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
                  <div>
                    <p class="font-medium text-amber-400">Safety Note</p>
                    <p class="text-sm">
                      Consult a healthcare provider before starting breathwork if you have respiratory conditions,
                      cardiovascular issues, or are pregnant. Stop immediately if you feel unwell.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="help-footer">
              <p class="text-slate-500 text-sm">{{ AppConfig.appName }} • Breathing exercises for everyone</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { AppConfig } from '@breath-in-flow/shared';
import { ref, h } from 'vue';

const showHelp = ref(false);
const activeSection = ref('start');

// Tab configuration with inline icon components
const tabs = [
  {
    id: 'start',
    label: 'Start',
    icon: {
      render: () =>
        h(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            class: 'w-4 h-4',
            fill: 'none',
            viewBox: '0 0 24 24',
            stroke: 'currentColor',
          },
          [
            h('path', {
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'stroke-width': '2',
              d: 'M13 10V3L4 14h7v7l9-11h-7z',
            }),
          ]
        ),
    },
  },
  {
    id: 'practice',
    label: 'Practice',
    icon: {
      render: () =>
        h(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            class: 'w-4 h-4',
            fill: 'none',
            viewBox: '0 0 24 24',
            stroke: 'currentColor',
          },
          [
            h('path', {
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'stroke-width': '2',
              d: 'M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
            }),
          ]
        ),
    },
  },
  {
    id: 'config',
    label: 'Settings',
    icon: {
      render: () =>
        h(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            class: 'w-4 h-4',
            fill: 'none',
            viewBox: '0 0 24 24',
            stroke: 'currentColor',
          },
          [
            h('path', {
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'stroke-width': '2',
              d: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
            }),
            h('path', {
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'stroke-width': '2',
              d: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
            }),
          ]
        ),
    },
  },
  {
    id: 'lab',
    label: 'Lab',
    icon: {
      render: () =>
        h(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            class: 'w-4 h-4',
            fill: 'none',
            viewBox: '0 0 24 24',
            stroke: 'currentColor',
          },
          [
            h('path', {
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'stroke-width': '2',
              d: 'M3 12h4l2-6 4 12 2-6h6',
            }),
          ]
        ),
    },
  },
  {
    id: 'techniques',
    label: 'Techniques',
    icon: {
      render: () =>
        h(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            class: 'w-4 h-4',
            fill: 'none',
            viewBox: '0 0 24 24',
            stroke: 'currentColor',
          },
          [
            h('path', {
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'stroke-width': '2',
              d: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
            }),
          ]
        ),
    },
  },
  {
    id: 'data',
    label: 'Data',
    icon: {
      render: () =>
        h(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            class: 'w-4 h-4',
            fill: 'none',
            viewBox: '0 0 24 24',
            stroke: 'currentColor',
          },
          [
            h('path', {
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'stroke-width': '2',
              d: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
            }),
          ]
        ),
    },
  },
  {
    id: 'tips',
    label: 'Tips',
    icon: {
      render: () =>
        h(
          'svg',
          {
            xmlns: 'http://www.w3.org/2000/svg',
            class: 'w-4 h-4',
            fill: 'none',
            viewBox: '0 0 24 24',
            stroke: 'currentColor',
          },
          [
            h('path', {
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              'stroke-width': '2',
              d: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
            }),
          ]
        ),
    },
  },
];

// Expose for parent component to open help
defineExpose({ showHelp });
</script>

<style scoped>
@reference "tailwindcss";
.help-trigger {
  @apply flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all duration-300;
}

.help-modal-overlay {
  @apply fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4;
}

.help-modal {
  @apply bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-700/50;
}

.help-header {
  @apply flex items-center justify-between p-4 sm:p-6 border-b border-slate-700/50 flex-shrink-0;
}

.help-close-btn {
  @apply min-h-11 min-w-11 p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-all;
}

.help-tabs {
  @apply flex gap-1 p-2 sm:p-3 border-b border-slate-700/50 overflow-x-auto flex-shrink-0 bg-slate-800/50;
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.help-tabs::-webkit-scrollbar {
  display: none;
}

.help-tab {
  @apply min-h-11 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-400 hover:text-white hover:bg-white/10 transition-all whitespace-nowrap;
}

.help-tab-active {
  @apply bg-blue-500/20 text-blue-400;
}

.help-content {
  @apply flex-1 overflow-y-auto p-4 sm:p-6;
}

.help-section {
  @apply space-y-4;
}

.help-section-title {
  @apply flex items-center gap-3 text-lg font-bold text-white mb-4;
}

.help-section-icon {
  @apply w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0;
}

.help-card {
  @apply bg-slate-800/50 rounded-xl p-4 border border-slate-700/30;
}

.help-card-title {
  @apply font-semibold text-white mb-2;
}

.help-list {
  @apply space-y-2 text-sm text-slate-300;
}

.help-list li {
  @apply flex items-start gap-2;
}

.help-list li::before {
  content: '•';
  @apply text-slate-500 mt-0.5;
}

ol.help-list {
  counter-reset: list-counter;
}

ol.help-list li {
  counter-increment: list-counter;
}

ol.help-list li::before {
  content: counter(list-counter) '.';
  @apply text-blue-400 font-medium;
}

.help-pattern {
  @apply flex flex-wrap items-center gap-2 text-sm font-medium;
}

.help-tip {
  @apply flex gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl text-sm text-slate-300;
}

.help-tip.warning {
  @apply bg-amber-500/10 border-amber-500/20;
}

.help-footer {
  @apply p-4 border-t border-slate-700/50 text-center flex-shrink-0;
}
</style>

<style>
/* Global transition styles for Teleported modal */
.help-fade-enter-active,
.help-fade-leave-active {
  transition: opacity 0.3s ease;
}

.help-fade-enter-active .help-modal,
.help-fade-leave-active .help-modal {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.help-fade-enter-from,
.help-fade-leave-to {
  opacity: 0 !important;
}

.help-fade-enter-from .help-modal,
.help-fade-leave-to .help-modal {
  transform: scale(0.95) translateY(10px) !important;
  opacity: 0 !important;
}
</style>
