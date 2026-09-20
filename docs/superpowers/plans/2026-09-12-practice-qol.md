# Practice and preset refinement implementation plan

> Execute in this session with focused subagent implementation and independent review where useful. Track completion here.

Goal: make starting and choosing a practice clearer and more compact.

Architecture: Vue keeps ownership of settings, session lifecycle, and navigation. A pure web utility provides validated display summaries based on the actual Vue timer. A small PatternSummary component shares phase labels and duration presentation across practice, configuration, and presets.

Constraints: preserve persisted data and voice choices; no dependencies; warm neutral palette; 44px minimum affected touch targets; reduced motion; no new health claims. Start remains visible at 1280x720 and 390x844 with the default recommendation. Work on feature/refined-practice-ui.

## Task 1: Accurate routine summaries

- [x] Create packages/web/src/utils/practiceSummary.ts and tests in packages/web/tests/utils/practiceSummary.test.ts.
- [x] Export getPracticeSummary(config: BreathingConfig): { duration: string; detail: string } | null. Invalid configurations return null. Duration uses human-readable minutes/seconds, per-set labeling for unlimited sets, and a plus suffix when user-controlled holds add unknown time. Detail describes repetitions/sets and manual rests or holds.
- [x] Trace Vue timer transitions before implementing. Scheduled seconds include final breath preparation, both enabled holds with independent modes and durations, and rest only between sets. Do not use the incorrect existing calculateSetTime helper as a reference.
- [x] Write and run failing tests for plain finite/open-ended sets, both hold orders, timed and tolerance combinations, final phase holds, rests, fractional seconds, and invalid input. Implement, then rerun the focused utility suite.

## Task 2: Preset discovery and shared pattern presentation

- [x] Extend packages/web/tests/components/PracticePresets.test.ts with search-by-name/description, clear/no-match results, preserved emitted config data, and createConfig event behavior. Run the suite to establish failures.
- [x] Add PatternSummary.vue consuming config and an optional compact boolean. Render named phase durations and getPracticeSummary output. Omit unavailable summaries.
- [x] Update PracticePresets.vue with a labeled search input, live result count, clear button, compact saved empty state, reusable phase summary, and consistent routine cards. Retain guidance and delete confirmation.
- [x] Wire createConfig through App.vue into BreathingPractice.vue using a one-shot open-settings prop and consumption event. This must survive the existing out-in tab transition without losing the request.
- [x] Run preset and App component tests.

## Task 3: Practice layout and visual system

- [x] Add practice flow assertions for named phase summaries, exact duration, open settings from the preset action, and validation feedback. Run affected tests before behavior changes.
- [x] Replace idle BreathingVisualizer with a compact practice panel: routine heading, decorative concentric breathing rings, PatternSummary, and grouped Start/Configure actions. Keep the active-session timer and controls; apply the later approved gradient animation refinement below.
- [x] Compact RecommendedActions.vue; add recommended duration and shorten visible action copy while preserving accessible names and events.
- [x] Simplify App.vue header/nav styling and common buttons/cards in style.css. Use warm neutral surfaces, fine borders, subdued shadows, sage primary actions with dark text, and consistent focus-visible outlines. Avoid gratuitous animation; preserve active breathing motion.
- [x] Add PatternSummary inside the configuration dialog. Keep sticky header/footer and scrolling behavior intact.
- [x] Run affected component suites after changes.

## Task 4: Review and verification

- [x] Inspect browser desktop and mobile views, search, preset creation, configuration, active session and reduced motion. Add an existing e2e-file regression for Start visibility and preset-to-configuration navigation.
- [x] Run pnpm test, pnpm typecheck, pnpm lint, pnpm build and browser regressions. Review intentional visual baseline differences before accepting updates.
- [x] Independent review of the final diff; fix material findings and rerun affected checks.
- [x] Record results in the design document and leave local changes ready for review.

## Approved animation refinement

- [x] Inspect the doublephas3d interference-garden reference and match its pressure-field inspiration to the breathing phase.
- [x] Replace the initial dot field with a continuous, asymmetric SVG gradient per the user's follow-up. Increase intensity on inhale, decrease it on exhale, and use the same neutral intensity on all holds.
- [x] Freeze circle scale and gradient appearance during pause and reduced motion. Preserve timer and phase labels.
- [x] Add a looping local animation-demo.html using the real timer and visualizer, without recording a session.
- [x] Verify actual SVG opacity/radius and rendered transforms through an entire cycle in phone and desktop browsers.
