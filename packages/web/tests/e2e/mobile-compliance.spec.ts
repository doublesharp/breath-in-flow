import { expect, test, type Page, type TestInfo } from '@playwright/test';

type GeometryViolation = {
  element: string;
  height: number;
  label: string;
  reason: 'clipped' | 'undersized' | 'unreachable';
  width: number;
};

async function completeOnboarding(page: Page) {
  await page.goto('/');
  const onboarding = page.getByRole('dialog', { name: 'What brings you here?' });
  await onboarding.getByTestId('goal-relax').check();
  await onboarding.getByTestId('save-goal').click();
  await expect(page.getByTestId('recommended-actions')).toBeVisible();
}

async function reviewScreenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    animations: 'disabled',
  });
  await expect(page).toHaveScreenshot(`${name}.png`, {
    animations: 'disabled',
    caret: 'hide',
  });
}

async function assertMobileCompliance(page: Page, surface: string) {
  // Modal and tab entrances scale for 300–400 ms. Measure their settled
  // geometry instead of the deliberately smaller first animation frame.
  await page.waitForTimeout(450);
  const result = await page.evaluate(() => {
    const visibleDialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter((dialog) => {
      const rect = dialog.getBoundingClientRect();
      const style = getComputedStyle(dialog);
      return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
    });
    const root = visibleDialogs.at(-1) ?? document.body;
    const candidates = root.querySelectorAll<HTMLElement>(
      'button, a[href], select, input, textarea, [role="button"], [role="radio"], [role="checkbox"]'
    );
    const violations: GeometryViolation[] = [];
    const hasVerticalScrollContainer = (element: HTMLElement) => {
      let current: HTMLElement | null = element.parentElement;
      while (current) {
        const currentStyle = getComputedStyle(current);
        const scrolls = /(auto|scroll)/.test(currentStyle.overflowY) && current.scrollHeight > current.clientHeight;
        if (scrolls) return true;
        current = current.parentElement;
      }
      return document.documentElement.scrollHeight > document.documentElement.clientHeight;
    };

    for (const element of candidates) {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width === 0 || rect.height === 0) continue;
      if (element.closest('[inert]')) continue;

      let effectiveRect = rect;
      const inputType = element.getAttribute('type');
      if (element.tagName === 'INPUT' && (inputType === 'checkbox' || inputType === 'radio')) {
        const label = element.closest('label') ?? (element.id ? root.querySelector(`label[for="${element.id}"]`) : null);
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
          reason: 'undersized',
          width: Math.round(effectiveRect.width),
        });
      }

      const label = (element.getAttribute('aria-label') || element.textContent || element.getAttribute('name') || '')
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, 80);
      if (effectiveRect.left < -1 || effectiveRect.right > window.innerWidth + 1) {
        violations.push({
          element: element.tagName.toLowerCase(),
          height: Math.round(effectiveRect.height),
          label,
          reason: 'clipped',
          width: Math.round(effectiveRect.width),
        });
      }
      const verticallyOutside = effectiveRect.bottom <= 0 || effectiveRect.top >= window.innerHeight;
      if (verticallyOutside && !hasVerticalScrollContainer(element)) {
        violations.push({
          element: element.tagName.toLowerCase(),
          height: Math.round(effectiveRect.height),
          label,
          reason: 'unreachable',
          width: Math.round(effectiveRect.width),
        });
      }
    }

    return {
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      violations,
    };
  });

  expect(result.overflow, `${surface}: horizontal overflow`).toBeLessThanOrEqual(1);
  expect(result.violations, `${surface}: undersized targets`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
});

test('primary phone surfaces meet the mobile interaction contract', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'android-phone', 'Phone-only compliance path');
  await completeOnboarding(page);
  await assertMobileCompliance(page, 'Practice home');
  await reviewScreenshot(page, testInfo, 'mobile-practice-home');

  await page.getByRole('button', { name: 'Configure practice' }).click();
  const configuration = page.getByRole('dialog', { name: 'Configure Practice' });
  await expect(configuration).toBeVisible();
  await assertMobileCompliance(page, 'Configure Practice');
  await reviewScreenshot(page, testInfo, 'mobile-configure-practice');
  await configuration.getByRole('button', { name: 'Close practice settings' }).click();

  await page.getByRole('button', { name: 'Pulse Variability' }).click();
  await expect(page.getByRole('heading', { name: 'Pulse Variability' })).toBeVisible();
  await assertMobileCompliance(page, 'Pulse Variability home');
  await reviewScreenshot(page, testInfo, 'mobile-pulse-variability');

  await page.getByTestId('protocol-quick-check').click();
  const preparation = page.getByTestId('prep-dialog');
  await expect(preparation).toBeVisible();
  await assertMobileCompliance(page, 'Pulse Variability preparation');
  await preparation.getByRole('button', { name: 'Cancel' }).click();

  await page.getByRole('button', { name: 'View session history' }).click();
  await expect(page.getByRole('heading', { name: 'Session History' })).toBeVisible();
  await assertMobileCompliance(page, 'History');

  await page.getByRole('button', { name: 'Manage breathing presets' }).click();
  await expect(page.getByRole('heading', { name: 'Saved Presets' })).toBeVisible();
  await assertMobileCompliance(page, 'Presets');

  await page.getByRole('button', { name: 'View analytics and insights' }).click();
  await expect(page.getByRole('heading', { name: 'Analytics Dashboard' })).toBeVisible();
  await assertMobileCompliance(page, 'Analytics');

  await page.getByRole('button', { name: 'Open help' }).click();
  await expect(page.getByRole('dialog', { name: 'Help & Guide' })).toBeVisible();
  await assertMobileCompliance(page, 'Help');
});

test('wide header and Configure Practice spacing remain responsive', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop-only visual review');
  await completeOnboarding(page);
  await assertMobileCompliance(page, 'Wide Practice home');
  await reviewScreenshot(page, testInfo, 'desktop-header');

  await page.getByRole('button', { name: 'Configure practice' }).click();
  await expect(page.getByRole('dialog', { name: 'Configure Practice' })).toBeVisible();
  await assertMobileCompliance(page, 'Wide Configure Practice');
  await reviewScreenshot(page, testInfo, 'desktop-configure-practice');
});

test('Configure Practice remains usable in landscape with enlarged text', async ({ page }) => {
  test.skip(test.info().project.name !== 'android-phone', 'Phone-only landscape audit');
  await page.setViewportSize({ width: 844, height: 390 });
  await completeOnboarding(page);
  await page.addStyleTag({ content: 'html { font-size: 20px !important; }' });
  await page.getByRole('button', { name: 'Configure practice' }).click();

  const configuration = page.getByRole('dialog', { name: 'Configure Practice' });
  await expect(configuration).toBeVisible();
  await expect(configuration.getByRole('button', { name: 'Close practice settings' })).toBeInViewport();
  await assertMobileCompliance(page, 'Landscape Configure Practice');
});
