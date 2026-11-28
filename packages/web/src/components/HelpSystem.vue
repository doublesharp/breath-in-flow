<template>
  <div>
    <!-- Help Button (Fixed position on desktop, in header on mobile) -->
    <button @click="showHelp = true" class="help-trigger" aria-label="Open help">
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
          d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span class="hidden sm:inline">Help</span>
    </button>

    <!-- Help Modal -->
    <Teleport to="body">
      <Transition name="help-fade">
        <div v-if="showHelp" class="help-modal-overlay safe-area-top safe-area-bottom" @click.self="showHelp = false">
          <div
            ref="helpDialogRef"
            data-testid="help-dialog"
            class="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-dialog-title"
            tabindex="-1"
          >
            <!-- Header -->
            <div class="help-header">
              <div class="flex items-center gap-3">
                <div class="help-section-icon">
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
                      d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 id="help-dialog-title" class="text-xl font-bold text-primary">Help & Guide</h2>
                  <p class="text-sm text-muted">Learn how to use {{ AppConfig.appName }}</p>
                </div>
              </div>
              <button ref="closeButtonRef" @click="showHelp = false" class="help-close-btn" aria-label="Close help">
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
            <div class="help-tab-strip" :class="{ 'help-tab-strip-overflow': moreTabsToRight }">
              <div ref="tabsRef" class="help-tabs" @scroll.passive="updateTabOverflow">
                <button
                  v-for="tab in tabs"
                  :key="tab.id"
                  @click="activeSection = tab.id"
                  @focus="revealTab"
                  :class="['help-tab', { 'help-tab-active': activeSection === tab.id }]"
                  :aria-pressed="activeSection === tab.id"
                >
                  <svg
                    aria-hidden="true"
                    class="w-4 h-4 shrink-0"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  >
                    <path :d="tab.path" />
                  </svg>
                  <span>{{ tab.label }}</span>
                </button>
              </div>
              <button
                ref="scrollTopicsRightRef"
                type="button"
                aria-label="Scroll help topics right"
                class="help-scroll-right min-h-[44px] min-w-[44px]"
                :class="{ invisible: !moreTabsToRight }"
                @click="scrollTopicsRight"
              >
                <svg
                  aria-hidden="true"
                  class="size-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            </div>

            <!-- Content -->
            <div class="help-content">
              <!-- Getting Started -->
              <div v-if="activeSection === 'start'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon" aria-hidden="true">
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
                    <li>
                      <span>Open the <strong>Practice</strong> tab.</span>
                    </li>
                    <li>
                      <span>Tap <strong>Start Practice</strong> to begin with the active routine.</span>
                    </li>
                    <li>Get comfortable and breathe gently at your own pace.</li>
                    <li>
                      <span
                        >Follow the phase label and the expanding and contracting circle. Sage marks inhale, warm clay
                        marks holds, and sand marks exhale.</span
                      >
                    </li>
                  </ol>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Navigation</h4>
                  <ul class="help-list">
                    <li><strong>Practice:</strong> Run guided breathing sessions and adjust timing.</li>
                    <li>
                      <strong>Pulse Variability:</strong> Measure optional pulse timing and estimate a comfortable
                      breathing rate.
                    </li>
                    <li><strong>History:</strong> Review completed sessions, holds, check-ins, and notes.</li>
                    <li><strong>Presets:</strong> Load, edit, or save breathing routines.</li>
                    <li><strong>Analytics:</strong> Track weekly sessions and breath-hold trends.</li>
                  </ul>
                </div>
              </div>

              <!-- Practice Guide -->
              <div v-if="activeSection === 'practice'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon" aria-hidden="true">
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
                      <span class="w-3 h-3 shrink-0 rounded-full bg-(--color-inhale)" aria-hidden="true"></span>
                      <span><strong>Inhale</strong>: Breathe in slowly through your nose.</span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="w-3 h-3 shrink-0 rounded-full bg-(--color-inhale-hold)" aria-hidden="true"></span>
                      <span><strong>Inhale Hold</strong>: Hold comfortably with lungs full.</span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="w-3 h-3 shrink-0 rounded-full bg-(--color-exhale)" aria-hidden="true"></span>
                      <span><strong>Exhale</strong>: Breathe out slowly and evenly.</span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="w-3 h-3 shrink-0 rounded-full bg-(--color-exhale-hold)" aria-hidden="true"></span>
                      <span><strong>Exhale Hold</strong>: Pause comfortably with lungs empty.</span>
                    </div>
                  </div>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Controls</h4>
                  <ul class="help-list">
                    <li><strong>Start Practice:</strong> Begin the active breathing routine.</li>
                    <li><strong>Pause / Resume:</strong> Hold the timer and audio cues, then pick up where you left off.</li>
                    <li>
                      Use <strong>Metronome</strong> and <strong>Voice guidance</strong> at the top of the session to
                      turn each cue on or off for that session.
                    </li>
                    <li>
                      <strong>Stop</strong> pauses the session while you decide whether to continue, save your progress,
                      or exit.
                    </li>
                    <li>
                      <strong>Release Hold:</strong> End an active extended hold (or press Space or Enter on desktop).
                    </li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Visual Guide</h4>
                  <p class="text-secondary text-sm">
                    The circle expands on inhale and contracts on exhale while the countdown shows seconds left in the
                    current phase. On iOS and Android, active sessions pause automatically if you switch apps.
                  </p>
                </div>
              </div>

              <!-- Configuration -->
              <div v-if="activeSection === 'config'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon" aria-hidden="true">
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
                    <li><strong>Inhale (sec)</strong> is the time spent breathing in, from 1 to 60 seconds.</li>
                    <li><strong>Inhale Hold (sec)</strong> is an optional pause after inhaling, up to 60 seconds.</li>
                    <li><strong>Exhale (sec)</strong> is the time spent breathing out, from 1 to 60 seconds.</li>
                    <li><strong>Exhale Hold (sec)</strong> is an optional pause after exhaling, up to 60 seconds.</li>
                    <li><strong>Repetitions per Set</strong> is the number of breath cycles in a set.</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Extended Holds</h4>
                  <p class="text-secondary text-sm mb-3">
                    Extended holds follow the final repetition of each set so you can practice longer breath holds at
                    your own pace.
                  </p>
                  <ul class="help-list">
                    <li><strong>Hold Type:</strong> Choose an inhale hold or an exhale hold.</li>
                    <li><strong>Tolerance Mode:</strong> The timer counts up until you tap Release Hold.</li>
                    <li><strong>Timed Mode:</strong> Hold for a fixed target duration in seconds.</li>
                    <li><strong>Second Hold:</strong> Add an optional second extended hold with its own mode and duration.</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Sets</h4>
                  <p class="text-secondary text-sm">
                    Each set combines your repetitions and any extended holds. Enter a <strong>Target Sets</strong>
                    count, or leave it at 0 to decide after each set whether to continue or finish.
                  </p>
                </div>
              </div>

              <!-- Lab & Measurements -->
              <div v-if="activeSection === 'lab'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon" aria-hidden="true">
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M3 12h4l2-6 4 12 2-6h6" />
                    </svg>
                  </span>
                  Pulse Variability & Measurements
                </h3>

                <div class="help-card">
                  <h4 class="help-card-title">What the camera measures</h4>
                  <p class="text-secondary text-sm">
                    The camera estimates pulse timing from fingertip color changes and reports pulse-rate variability
                    (PRV). PRV is related to, but not interchangeable with, ECG-derived HRV; this is not an ECG or a
                    medical measurement. Compare trends only when posture, time of day, sensor placement, and protocol
                    are similar.
                  </p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Sensor choices</h4>
                  <ul class="help-list">
                    <li>
                      <strong>Camera Pulse:</strong> Cover the rear lens lightly with one fingertip and stay still.
                    </li>
                    <li>
                      <strong>Chest Motion:</strong> Rest the phone flat on your chest and stay still so movement does
                      not mask pulse timing.
                    </li>
                    <li>
                      <strong>Camera + Chest:</strong> Keep the phone steady on your chest with a fingertip over the
                      rear lens so both signals stay clean.
                    </li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Why duration matters</h4>
                  <p class="text-secondary text-sm">
                    Short recordings support basic time-domain metrics once enough clean beats are detected.
                    Frequency-domain metrics require the full five minutes and stay hidden when a recording is too short
                    or noisy. Missing metrics are left blank instead of estimated.
                  </p>
                </div>

                <div class="help-tip warning">
                  <p class="text-sm">
                    Use Pulse Variability results for wellness training and personal trends, not diagnosis. Stop the
                    measurement if you feel unwell and discuss health concerns with a qualified clinician.
                  </p>
                </div>
              </div>

              <!-- Techniques -->
              <div v-if="activeSection === 'techniques'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon" aria-hidden="true">
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
                  <p class="text-muted text-sm mb-2">Equal four-second phases for steady pacing</p>
                  <div class="help-pattern">
                    <span class="text-sage">4s inhale</span>
                    <span class="text-muted">→</span>
                    <span class="text-clay">4s hold</span>
                    <span class="text-muted">→</span>
                    <span class="text-sand">4s exhale</span>
                    <span class="text-muted">→</span>
                    <span class="text-clay">4s hold</span>
                  </div>
                  <p class="text-secondary text-sm mt-2">Useful for focus, grounding, and stress relief.</p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">4-7-8 Relaxation</h4>
                  <p class="text-muted text-sm mb-2">Extended exhale pattern for winding down</p>
                  <div class="help-pattern">
                    <span class="text-sage">4s inhale</span>
                    <span class="text-muted">→</span>
                    <span class="text-clay">7s hold</span>
                    <span class="text-muted">→</span>
                    <span class="text-sand">8s exhale</span>
                  </div>
                  <p class="text-secondary text-sm mt-2">Useful before sleep or during an evening reset.</p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Coherent Breathing (5-5)</h4>
                  <p class="text-muted text-sm mb-2">Even five-second breaths with no holds</p>
                  <div class="help-pattern">
                    <span class="text-sage">5s inhale</span>
                    <span class="text-muted">→</span>
                    <span class="text-sand">5s exhale</span>
                  </div>
                  <p class="text-secondary text-sm mt-2">Useful for daily practice and calm, steady pacing.</p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Diaphragm Resistance Training</h4>
                  <p class="text-secondary text-sm">
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
                  <p class="text-muted text-sm mb-2">Fast-paced breathing followed by recovery holds</p>
                  <div class="help-pattern">
                    <span class="text-sage">2s inhale</span>
                    <span class="text-muted">→</span>
                    <span class="text-sand">2s exhale</span>
                    <span class="text-muted">× 30 reps</span>
                  </div>
                  <p class="text-secondary text-sm mt-2">
                    Followed by an extended exhale hold and a timed recovery inhale hold. Always practice seated or
                    lying down, never in water or while driving.
                  </p>
                </div>

                <div class="help-tip">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5 text-sand flex-shrink-0"
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
                  <span class="help-section-icon" aria-hidden="true">
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
                    <li>Open <strong>Configure</strong> in the Practice tab and adjust your pattern.</li>
                    <li>Enter a name in the "Preset name" field.</li>
                    <li>Tap <strong>Save Preset</strong>.</li>
                    <li>Open the <strong>Presets</strong> tab to load or edit it later.</li>
                  </ol>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Using Presets</h4>
                  <ul class="help-list">
                    <li><strong>Load routine:</strong> Apply the preset to the Practice tab.</li>
                    <li><strong>Edit:</strong> Open a saved preset in Configure Practice to update its settings.</li>
                    <li><strong>Delete:</strong> Remove a saved preset after confirming.</li>
                  </ul>
                  <p class="text-secondary text-sm mt-2">
                    Built-in routines (Box Breathing, 4-7-8 Relaxation, Coherent Breathing, and more) are ready to use
                    any time.
                  </p>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Session History</h4>
                  <p class="text-secondary text-sm mb-2">
                    Sessions save automatically to this device. Open <strong>History</strong> to:
                  </p>
                  <ul class="help-list">
                    <li>Review each session's breathing pattern, sets, and repetitions.</li>
                    <li>Check recorded extended hold times, check-ins, and notes.</li>
                    <li>Remove individual sessions or clear old records.</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Analytics Dashboard</h4>
                  <p class="text-secondary text-sm">
                    Open <strong>Analytics</strong> to see trends across completed sessions:
                  </p>
                  <ul class="help-list">
                    <li><strong>Sessions per Week:</strong> Track weekly practice consistency.</li>
                    <li><strong>Breath Hold Progress:</strong> Follow inhale and exhale hold times over time.</li>
                    <li><strong>Summary Stats:</strong> Review total sessions, total sets, average hold, and best hold.</li>
                  </ul>
                </div>

                <h4 class="help-card-title mt-2">Data & Support</h4>
                <DataSupportSettings />
              </div>

              <!-- Tips -->
              <div v-if="activeSection === 'tips'" class="help-section">
                <h3 class="help-section-title">
                  <span class="help-section-icon" aria-hidden="true">
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
                    <li>Find a quiet, comfortable place to sit or lie down.</li>
                    <li>Loosen tight clothing around your chest or waist.</li>
                    <li>Keep your spine tall and your shoulders relaxed.</li>
                    <li>Close your eyes or soften your gaze.</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">During Practice</h4>
                  <ul class="help-list">
                    <li>Breathe through your nose when comfortable.</li>
                    <li>Let your belly and lower ribs expand gently on inhale.</li>
                    <li>Keep your jaw, neck, and shoulders soft.</li>
                    <li>Stop and breathe normally if you feel dizzy or strained.</li>
                    <li>Let the breath move smoothly without forcing volume or hold time.</li>
                  </ul>
                </div>

                <div class="help-card">
                  <h4 class="help-card-title">Building Your Practice</h4>
                  <ul class="help-list">
                    <li>Begin with short three-to-five-minute sessions.</li>
                    <li>Practice consistently, aiming for a few minutes most days.</li>
                    <li>Increase hold durations gradually as comfort grows.</li>
                    <li>Review weekly consistency in the Analytics tab.</li>
                    <li>Save favorite adjustments as custom presets.</li>
                  </ul>
                </div>

                <div class="help-tip warning">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    class="w-5 h-5 text-sand flex-shrink-0"
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
                    <p class="font-medium text-sand">Safety Note</p>
                    <p class="text-sm">
                      Consult a healthcare provider before starting breathwork if you have a respiratory or
                      cardiovascular condition, or if you are pregnant. Never practice breath holds in water or while
                      driving, and stop immediately if you feel unwell.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="help-footer">
              <p class="text-muted text-sm">{{ AppConfig.appName }} • Breathing exercises for everyone</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { AppConfig } from '@breath-in-flow/shared';
import { ref, watchPostEffect } from 'vue';
import { useModalIsolation } from '../composables/useModalIsolation';
import DataSupportSettings from './DataSupportSettings.vue';

const showHelp = defineModel<boolean>('open', { default: false });
const activeSection = ref('start');
const helpDialogRef = ref<HTMLElement | null>(null);
const closeButtonRef = ref<HTMLElement | null>(null);
const tabsRef = ref<HTMLElement | null>(null);
const scrollTopicsRightRef = ref<HTMLButtonElement | null>(null);
const moreTabsToRight = ref(false);

function updateTabOverflow() {
  const strip = tabsRef.value;
  moreTabsToRight.value = !!strip && strip.scrollWidth - strip.clientWidth - strip.scrollLeft > 1;
  if (!moreTabsToRight.value && scrollTopicsRightRef.value === document.activeElement) {
    (strip?.lastElementChild as HTMLButtonElement | null)?.focus({ preventScroll: true });
  }
}

function scrollTopicsRight() {
  const strip = tabsRef.value;
  if (strip) strip.scrollBy({ left: Math.max(44, strip.clientWidth - 60) });
}

function revealTab(event: FocusEvent) {
  const tab = event.currentTarget as HTMLElement;
  tab.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

watchPostEffect((onCleanup) => {
  const strip = tabsRef.value;
  if (!strip) return;
  updateTabOverflow();

  const observer = new ResizeObserver(updateTabOverflow);
  observer.observe(strip);
  for (const tab of strip.children) observer.observe(tab);
  onCleanup(() => observer.disconnect());
});

useModalIsolation(helpDialogRef, showHelp, {
  initialFocus: () => closeButtonRef.value,
  onEscape: () => {
    showHelp.value = false;
  },
});

const tabs = [
  { id: 'start', label: 'Start', path: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { id: 'practice', label: 'Practice', path: 'M3 12c3-8 6-8 9 0s6 8 9 0' },
  {
    id: 'config',
    label: 'Settings',
    path: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
  { id: 'lab', label: 'Pulse Variability', path: 'M3 12h4l2-6 4 12 2-6h6' },
  {
    id: 'techniques',
    label: 'Techniques',
    path: 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  },
  {
    id: 'data',
    label: 'Data',
    path: 'M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4',
  },
  {
    id: 'tips',
    label: 'Tips',
    path: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z',
  },
];

// Expose for parent component to open help
defineExpose({ showHelp });
</script>

<style scoped>
@reference "../style.css";

.help-trigger {
  @apply flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-lg px-[12px] py-[4px] text-muted hover:text-primary hover:bg-surface-raised transition-colors;
}

.help-modal-overlay {
  @apply fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center;
  padding: max(1rem, env(safe-area-inset-top)) 1rem max(1rem, env(safe-area-inset-bottom));
}

.help-modal {
  @apply w-full min-w-0 max-w-2xl md:max-w-3xl max-h-[90dvh] flex flex-col overflow-hidden rounded-2xl border border-line-strong bg-surface-card shadow-2xl;
}

.help-header {
  @apply flex items-center justify-between gap-2 p-4 sm:p-6 border-b border-line-subtle shrink-0;
}

.help-close-btn {
  @apply min-h-11 min-w-11 shrink-0 p-2 rounded-lg text-muted hover:text-primary hover:bg-surface-raised transition-colors;
}

.help-tab-strip {
  @apply relative flex shrink-0 items-center border-b border-line-subtle bg-surface-inset;
}

.help-tab-strip-overflow::after {
  content: '';
  @apply pointer-events-none absolute inset-y-0 right-0 w-10 max-sm:right-[48px] max-sm:w-[48px];
  background: linear-gradient(to right, transparent, var(--surface-inset) 92%);
}

.help-tabs {
  @apply flex min-w-0 flex-1 flex-nowrap gap-1 overflow-x-auto p-2 sm:px-3;
  scroll-padding-inline: 0.5rem;
}

.help-scroll-right {
  @apply relative z-10 mr-[4px] grid shrink-0 place-items-center rounded-lg border border-line-strong bg-surface-raised text-sage hover:border-sage/60 hover:text-primary sm:hidden;
}

@media (prefers-reduced-motion: no-preference) {
  .help-tabs {
    scroll-behavior: smooth;
  }
}

.help-tab {
  @apply flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 lg:px-3 py-2 text-sm font-medium text-muted hover:text-primary hover:bg-surface-raised transition-colors;
  outline-offset: -2px;
}

.help-tab-active {
  @apply bg-sage text-surface-page hover:bg-sage/90 hover:text-surface-page;
}

.help-content {
  @apply min-h-0 flex-1 overflow-y-auto p-4 sm:p-6;
}

.help-section {
  @apply space-y-4;
}

.help-section-title {
  @apply flex items-center gap-3 text-lg font-bold text-primary mb-4;
}

.help-section-icon {
  @apply w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-surface-raised text-sage;
}

.help-list {
  @apply list-disc space-y-2 pl-5 text-sm text-secondary;
}

.help-list li::marker {
  color: var(--text-muted);
}

ol.help-list {
  list-style-type: decimal;
}

ol.help-list li::marker {
  color: var(--accent-sage);
  font-weight: 600;
}

.help-pattern {
  @apply flex flex-wrap items-center gap-2 text-sm font-medium;
}

.help-tip {
  @apply flex gap-3 p-4 bg-sage/8 border border-sage/20 rounded-xl text-sm text-secondary;
}

.help-tip.warning {
  @apply bg-clay/10 border-clay/25;
}

.help-footer {
  @apply p-4 border-t border-line-subtle text-center shrink-0;
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
