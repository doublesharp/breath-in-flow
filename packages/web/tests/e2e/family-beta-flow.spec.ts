import { expect, test, type Page, type TestInfo } from '@playwright/test';

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

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.clock.install();
});

test('first recommended session completes, saves its check-in, and returns to Practice', async ({
  page,
}, testInfo) => {
  await page.goto('/');

  const onboarding = page.getByRole('dialog', { name: 'What brings you here?' });
  await expect(onboarding).toBeVisible();
  await expect(onboarding.getByTestId('save-goal')).toBeDisabled();
  await reviewScreenshot(page, testInfo, '01-goal-onboarding');

  await onboarding.getByTestId('goal-consistency').check();
  await onboarding.getByTestId('save-goal').click();
  await expect(page.getByTestId('recommended-actions')).toContainText('Coherent Breathing');

  await page.getByTestId('start-recommended').click();
  const beforeCheckIn = page.getByRole('dialog', { name: 'How do you feel right now?' });
  await expect(beforeCheckIn).toBeVisible();
  await beforeCheckIn.getByTestId('feeling-score-3').check();
  await reviewScreenshot(page, testInfo, '02-before-check-in');
  await beforeCheckIn.getByTestId('checkin-submit').click();

  const session = page.getByTestId('session-dialog');
  await expect(session).toBeVisible();
  await expect(session).toContainText('5s');
  await expect(session).toContainText('6 reps');
  await session.getByRole('button', { name: /pause/i }).click();
  await expect(session).toContainText('Paused');
  await reviewScreenshot(page, testInfo, '03-active-practice');
  await session.getByRole('button', { name: /resume/i }).click();

  // Advance in one-second slices so Vue effects and the timer's 100 ms interval
  // can flush between phase transitions, matching real execution ordering.
  for (let second = 0; second < 70; second += 1) {
    await page.clock.fastForward(1_000);
  }

  const afterCheckIn = page.getByRole('dialog', { name: 'How did that feel?' });
  await expect(afterCheckIn).toBeVisible();
  await afterCheckIn.getByTestId('feeling-score-4').check();
  await afterCheckIn.getByTestId('checkin-comment').fill('Steady and comfortable');
  await reviewScreenshot(page, testInfo, '04-after-check-in');
  await afterCheckIn.getByTestId('checkin-submit').click();

  await expect(session).toContainText('Session Complete!');
  await expect(session.getByTestId('completion-mark')).toBeVisible();
  await expect(session.getByTestId('back-to-practice')).toBeVisible();
  await reviewScreenshot(page, testInfo, '05-session-complete');

  await session.getByTestId('back-to-practice').click();
  await expect(session).toBeHidden();
  await expect(page.getByTestId('recommended-actions')).toBeVisible();
  await expect(page.getByTestId('repeat-last')).toBeVisible();
  await reviewScreenshot(page, testInfo, '06-practice-home-after-session');

  const storedSessions = await page.evaluate(() => {
    const value = localStorage.getItem('breath-in-flow-sessions');
    return value ? JSON.parse(value) : [];
  });
  expect(storedSessions[0]).toMatchObject({
    status: 'COMPLETED',
    completedSets: 1,
    checkIn: {
      before: 3,
      after: 4,
      comment: 'Steady and comfortable',
    },
  });

  await page.getByTestId('repeat-last').click();
  const repeatCheckIn = page.getByRole('dialog', { name: 'How do you feel right now?' });
  await expect(repeatCheckIn).toBeVisible();
  await repeatCheckIn.getByTestId('checkin-skip').click();
  await expect(session).toBeVisible();
});

test('onboarding and check-in actions remain reachable in landscape with enlarged text', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/');
  await page.addStyleTag({ content: 'html { font-size: 20px !important; }' });

  const onboarding = page.getByRole('dialog', { name: 'What brings you here?' });
  await onboarding.getByTestId('goal-relax').check();
  const continueButton = onboarding.getByTestId('save-goal');
  await expect(continueButton).toBeInViewport();
  // Radio selection may scroll its container. Capture a deliberate position
  // instead of depending on the browser's automatic focus scrolling.
  await onboarding.getByTestId('goal-onboarding-card').evaluate((card) => {
    card.scrollTop = 0;
  });
  await expect(onboarding.getByRole('heading')).toBeInViewport();
  await reviewScreenshot(page, testInfo, '06-landscape-large-text-onboarding');
  await continueButton.click();

  await page.getByTestId('start-recommended').click();
  const checkIn = page.getByRole('dialog', { name: 'How do you feel right now?' });
  const skipButton = checkIn.getByTestId('checkin-skip');
  const submitButton = checkIn.getByTestId('checkin-submit');
  await expect(skipButton).toBeInViewport();
  await expect(submitButton).toBeInViewport();
  await reviewScreenshot(page, testInfo, '07-landscape-large-text-check-in');
});

test('Kokoro cues decode locally and real guidance stops when practice pauses', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const clips: HTMLAudioElement[] = [];
    Object.assign(window, { guidanceClips: clips });
    window.Audio = new Proxy(window.Audio, {
      construct(target, args) {
        const clip = Reflect.construct(target, args) as HTMLAudioElement;
        clips.push(clip);
        return clip;
      },
    });
  });
  // Exercise the shipped audio files without allowing any hosted speech service.
  await page.route('**/*', (route) => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    return route.abort();
  });
  await page.goto('/');
  const decoded = await page.evaluate(async () => {
    const context = new AudioContext();
    try {
      const results = [];
      for (const id of ['inhale', 'exhale', 'hold', 'warmup', 'rest']) {
        const response = await fetch(`/audio/kokoro/af_heart/${id}.wav`);
        if (!response.ok) throw new Error(`${id}: ${response.status}`);
        const clip = await context.decodeAudioData(await response.arrayBuffer());
        const samples = clip.getChannelData(0);
        let energy = 0;
        for (const sample of samples) energy += sample * sample;
        results.push({ id, duration: clip.duration, rms: Math.sqrt(energy / samples.length) });
      }
      return results;
    } finally {
      await context.close();
    }
  });
  expect(decoded).toHaveLength(5);
  for (const clip of decoded) {
    expect(clip.duration, clip.id).toBeGreaterThan(0.3);
    expect(clip.duration, clip.id).toBeLessThan(4);
    expect(clip.rms, `${clip.id} must contain audible samples`).toBeGreaterThan(0.01);
  }
  const onboarding = page.getByRole('dialog', { name: 'What brings you here?' });
  await onboarding.getByTestId('goal-consistency').check();
  await onboarding.getByTestId('save-goal').click();
  await page.getByTestId('start-recommended').click();
  await page.getByTestId('checkin-skip').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const clips = (window as unknown as { guidanceClips: HTMLAudioElement[] }).guidanceClips;
        return clips.map((clip) => ({
          file: clip.src.split('/').at(-1),
          playing: !clip.paused && clip.currentTime > 0,
          time: clip.currentTime,
          error: clip.error?.message,
        }));
      })
    )
    .toEqual(
      expect.arrayContaining([expect.objectContaining({ file: 'inhale.wav', playing: true })])
    );
  const session = page.getByTestId('session-dialog');
  await session.getByRole('button', { name: /pause/i }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const clips = (window as unknown as { guidanceClips: HTMLAudioElement[] }).guidanceClips;
        return clips.every((clip) => clip.paused);
      })
    )
    .toBe(true);
  await expect(session).toContainText('Paused');
});
