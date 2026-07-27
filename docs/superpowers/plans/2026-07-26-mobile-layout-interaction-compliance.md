# Mobile Layout and Interaction Compliance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove and enforce mobile layout compliance across the app while adding the approved header and Configure Practice spacing.

**Architecture:** A Playwright rendered-geometry helper checks effective touch targets, horizontal overflow, and action reachability on real app surfaces. Shared CSS supplies the 44-pixel minimum without duplicating utility classes, while targeted component classes handle header spacing, modal spacing, and compact switches whose visible track should remain small.

**Tech Stack:** Vue 3, TypeScript, Tailwind CSS 4, Vitest, Vue Test Utils, Playwright Chromium

## Global Constraints

- Every enabled or disabled interactive target is at least 44 by 44 CSS pixels at touch viewports.
- Audited viewports are 390 by 844, 844 by 390 with a 20-pixel root font, and 1440 by 900 CSS pixels.
- Fixed and full-screen surfaces retain safe-area support, vertical scrolling, and a reachable dismissal path.
- No primary tab or audited dialog has document-level horizontal overflow.
- Existing navigation, practice, pulse-variability, history, preset, analytics, and support behavior does not change.
- Tests are written and observed failing before production changes.

---

### Task 1: Rendered Mobile Compliance Gate

**Files:**
- Create: `packages/web/tests/e2e/mobile-compliance.spec.ts`
- Modify: `packages/web/playwright.config.ts`

**Interfaces:**
- Consumes: the app's existing accessible names and `data-testid` attributes.
- Produces: `assertMobileCompliance(page, surface, scope?)`, a reusable Playwright assertion for rendered target geometry and overflow.

- [ ] **Step 1: Write the failing geometry audit**

Create a Playwright suite with a helper that:

```ts
type GeometryViolation = {
  element: string;
  height: number;
  label: string;
  width: number;
};

async function assertMobileCompliance(page: Page, surface: string, scopeSelector = 'body') {
  const result = await page.evaluate(({ scopeSelector }) => {
    const scope = document.querySelector(scopeSelector);
    if (!scope) throw new Error(`Missing audit scope: ${scopeSelector}`);

    const visibleDialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((dialog) => {
      const rect = dialog.getBoundingClientRect();
      const style = getComputedStyle(dialog);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const auditRoot = visibleDialogs.at(-1) ?? scope;
    const candidates = auditRoot.querySelectorAll<HTMLElement>(
      'button, a[href], select, input, textarea, [role="button"], [role="radio"], [role="checkbox"]'
    );

    const violations: GeometryViolation[] = [];
    for (const element of candidates) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
      if (element.closest('[inert]')) continue;

      let effectiveRect = rect;
      if (element.tagName === 'INPUT' && ['checkbox', 'radio'].includes(element.getAttribute('type') ?? '')) {
        const label = element.closest('label') ?? (element.id ? auditRoot.querySelector(`label[for="${element.id}"]`) : null);
        if (label) effectiveRect = label.getBoundingClientRect();
      }

      if (effectiveRect.width < 44 || effectiveRect.height < 44) {
        violations.push({
          element: element.tagName.toLowerCase(),
          height: Math.round(effectiveRect.height),
          label: (element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || '')
            .trim()
            .replace(/\s+/g, ' ')
            .slice(0, 80),
          width: Math.round(effectiveRect.width),
        });
      }
    }

    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      violations,
    };
  }, { scopeSelector });

  expect(result.overflow, `${surface}: horizontal overflow`).toBeLessThanOrEqual(1);
  expect(result.violations, `${surface}: undersized targets`).toEqual([]);
}
```

The suite must complete onboarding through its accessible radio row, then audit:

- Practice home;
- Configure Practice dialog;
- Pulse Variability home and Quick Check preparation;
- History;
- Presets;
- Analytics;
- Help.

Use `expect(page).toHaveScreenshot(...)` for the phone Practice home, phone Configure Practice dialog, phone Pulse Variability home, desktop header, and desktop Configure Practice dialog.

- [ ] **Step 2: Run the audit and verify RED**

Run:

```bash
pnpm --filter @breath-in-flow/web exec playwright test tests/e2e/mobile-compliance.spec.ts
```

Expected: FAIL with rendered violations including `Open help`, `Configure practice`, `Dismiss`, `Guided`, the Pulse Variability range buttons, `Close practice settings`, toggle buttons, `Test`, and the Analytics range selector.

- [ ] **Step 3: Add a desktop Playwright project**

Add this project after `android-phone`:

```ts
{
  name: 'desktop-chromium',
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
  },
},
```

Mark phone-only tests with project guards and keep the desktop test limited to the header and Configure Practice dialog.

- [ ] **Step 4: Run the audit again**

Run the same Playwright command.

Expected: both projects execute and fail only on the still-unfixed spacing and geometry assertions.

- [ ] **Step 5: Commit the failing compliance gate**

```bash
git add packages/web/tests/e2e/mobile-compliance.spec.ts packages/web/playwright.config.ts
git commit -m "test: add rendered mobile compliance gate"
```

### Task 2: Shared Touch Targets and Approved Spacing

**Files:**
- Modify: `packages/web/tests/components/App.test.ts`
- Modify: `packages/web/tests/components/BreathingPracticeFlows.test.ts`
- Modify: `packages/web/src/style.css`
- Modify: `packages/web/src/App.vue`
- Modify: `packages/web/src/components/BreathingPractice.vue`

**Interfaces:**
- Consumes: the rendered compliance assertions from Task 1.
- Produces: global 44-pixel button/select targets, a safe compact switch target, and the approved responsive header/modal spacing.

- [ ] **Step 1: Add focused failing component assertions**

Add tests that assert:

```ts
expect(wrapper.get('[data-testid="app-header-content"]').classes()).toEqual(
  expect.arrayContaining(['py-4', 'sm:py-5'])
);
expect(wrapper.get('[data-testid="desktop-navigation"]').classes()).toEqual(
  expect.arrayContaining(['gap-1.5', 'p-2'])
);
```

For the Configure Practice dialog, open it and assert:

```ts
expect(wrapper.get('[data-testid="configure-practice-header"]').classes()).toEqual(
  expect.arrayContaining(['mb-6', 'sm:mb-8'])
);
expect(wrapper.get('[data-testid="close-practice-settings"]').classes()).toEqual(
  expect.arrayContaining(['min-h-11', 'min-w-11'])
);
```

- [ ] **Step 2: Run focused component tests and verify RED**

Run:

```bash
pnpm --filter @breath-in-flow/web test -- tests/components/App.test.ts tests/components/BreathingPracticeFlows.test.ts
```

Expected: FAIL because the test ids and approved responsive classes do not exist.

- [ ] **Step 3: Implement the shared 44-pixel controls**

In `style.css`, add:

```css
button,
select {
  min-height: 2.75rem;
}

button {
  min-width: 2.75rem;
}
```

Keep the toggle's outer target 48 by 44 pixels and render its existing 48 by 28 track with a pseudo-element:

```css
.toggle {
  @apply relative inline-flex h-11 w-12 items-center rounded-full cursor-pointer;
  background: transparent;
  border: 0;
}

.toggle::before {
  @apply absolute left-0 top-2 h-7 w-12 rounded-full;
  content: '';
  background: linear-gradient(135deg, rgba(82, 72, 64, 0.85) 0%, rgba(54, 47, 40, 0.95) 100%);
  border: 1px solid rgba(180, 156, 130, 0.3);
}

.toggle-enabled,
.toggle-disabled {
  background: transparent;
  border: 0;
  box-shadow: none;
}

.toggle-enabled::before {
  background: linear-gradient(135deg, #6bb59c 0%, #7fc3aa 100%);
  border-color: transparent;
  box-shadow:
    0 4px 12px -2px rgba(107, 181, 156, 0.35),
    inset 0 1px 0 rgba(255, 255, 255, 0.2);
}

.toggle-knob {
  position: relative;
  z-index: 1;
}
```

- [ ] **Step 4: Implement header and dialog spacing**

In `App.vue`:

- add `data-testid="app-header-content"`;
- change `py-3 sm:py-4` to `py-4 sm:py-5`;
- add `data-testid="desktop-navigation"`;
- change the desktop navigation to `gap-1.5 p-2`;
- change every desktop navigation button to `min-h-11 px-5 py-2.5`.

In `BreathingPractice.vue`:

- add `data-testid="configure-practice-header"`;
- change header spacing to `py-4 sm:py-5 mb-6 sm:mb-8`;
- add `data-testid="close-practice-settings"` and `min-h-11 min-w-11` to the close button.

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter @breath-in-flow/web test -- tests/components/App.test.ts tests/components/BreathingPracticeFlows.test.ts
pnpm --filter @breath-in-flow/web exec playwright test tests/e2e/mobile-compliance.spec.ts
```

Expected: component tests PASS; Playwright may report only component-specific layout violations not covered by the shared rule.

- [ ] **Step 6: Commit the shared interaction contract**

```bash
git add packages/web/src/style.css packages/web/src/App.vue packages/web/src/components/BreathingPractice.vue packages/web/tests/components/App.test.ts packages/web/tests/components/BreathingPracticeFlows.test.ts
git commit -m "fix: improve mobile spacing and touch targets"
```

### Task 3: Full-App Visual Proof and Release Gate

**Files:**
- Modify: `packages/web/tests/e2e/mobile-compliance.spec.ts`
- Modify: component files only if the rendered audit identifies a remaining confirmed violation.
- Create: Playwright snapshots under `packages/web/tests/e2e/mobile-compliance.spec.ts-snapshots/`

**Interfaces:**
- Consumes: `assertMobileCompliance` and shared styles from Tasks 1 and 2.
- Produces: stable phone/desktop visual baselines and a zero-violation compliance report.

- [ ] **Step 1: Run the full rendered audit**

Run:

```bash
pnpm --filter @breath-in-flow/web exec playwright test tests/e2e/mobile-compliance.spec.ts
```

Expected: no undersized-target or overflow failures. If the helper reports a visible element, add the smallest local `min-h-11`, `min-w-11`, scroll, or safe-area class that satisfies the existing behavior and re-run until GREEN.

- [ ] **Step 2: Generate review screenshots**

Run:

```bash
pnpm --filter @breath-in-flow/web exec playwright test tests/e2e/mobile-compliance.spec.ts --update-snapshots
```

Expected: phone and desktop snapshot files are generated for the five named visual states.

- [ ] **Step 3: Inspect every generated screenshot**

Inspect the PNG files and confirm:

- the desktop header has comfortable vertical padding and unclipped navigation;
- phone chrome does not dominate the viewport;
- Configure Practice has clear title-to-form separation;
- the close control is obvious and aligned;
- Pulse Variability mode/range controls do not wrap or overlap;
- no bottom navigation obscures content;
- no screenshot contains clipped text or horizontal overflow.

If a visual defect is present, add a failing screenshot or geometry assertion before applying the smallest production correction.

- [ ] **Step 4: Run the full automated release gate**

Run:

```bash
pnpm --filter @breath-in-flow/web test
pnpm --filter @breath-in-flow/web test:e2e
pnpm typecheck
pnpm build
git diff --check
```

Expected: all commands PASS with no warnings attributable to the change.

- [ ] **Step 5: Commit snapshots and final refinements**

```bash
git add packages/web/tests/e2e/mobile-compliance.spec.ts packages/web/tests/e2e/mobile-compliance.spec.ts-snapshots packages/web/src
git commit -m "test: prove app-wide mobile compliance"
```
