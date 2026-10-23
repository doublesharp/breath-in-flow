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

test('repeated shaped audio ticks decay to silence in the browser audio engine', async ({
  page,
}) => {
  await page.goto('/');
  const results = await page.evaluate(async () => {
    const servicePath = '/src/services/soundService.ts';
    const { soundService } = await import(servicePath);
    const results: Array<{ theme: string; signalPeak: number; tailPeak: number }> = [];
    for (const theme of ['water', 'wind', 'chimes']) {
      const context = new OfflineAudioContext(1, 44_100 * 3, 44_100);
      soundService.setTheme(theme);
      // Use the production graph with the real Web Audio renderer. The public
      // resume path is tested separately because offline contexts cannot resume.
      for (let beat = 0; beat < 500; beat++) soundService.playTick(context, 1);
      const buffer = await context.startRendering();
      const data = buffer.getChannelData(0);
      let signalPeak = 0;
      let tailPeak = 0;
      for (let i = 0; i < data.length; i++) {
        if (i < 44_100) signalPeak = Math.max(signalPeak, Math.abs(data[i]));
        if (i >= 88_200) tailPeak = Math.max(tailPeak, Math.abs(data[i]));
      }
      results.push({ theme, signalPeak, tailPeak });
    }
    return results;
  });
  for (const result of results) {
    expect(result.signalPeak, `${result.theme} must produce audio`).toBeGreaterThan(0.001);
    expect(result.tailPeak, `${result.theme} must return to silence`).toBeLessThan(0.000001);
  }
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
  // Freeze between explicit advances: otherwise wall-clock time spent clicking
  // Pause changes the gradient scale and text rasterization in its snapshot.
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
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
      for (const voice of ['af_heart', 'af_bella', 'am_michael', 'bf_emma']) {
        for (const id of [
          'inhale',
          'exhale',
          'hold',
          'warmup',
          'rest',
          'trial-1',
          'trial-2',
          'trial-3',
          'trial-4',
          'trial-5',
        ]) {
          const response = await fetch(`/audio/kokoro/${voice}/${id}.mp3`);
          if (!response.ok) throw new Error(`${id}: ${response.status}`);
          const clip = await context.decodeAudioData(await response.arrayBuffer());
          const samples = clip.getChannelData(0);
          let energy = 0;
          for (const sample of samples) energy += sample * sample;
          results.push({
            id: `${voice}/${id}`,
            duration: clip.duration,
            rms: Math.sqrt(energy / samples.length),
          });
        }
      }
      return results;
    } finally {
      await context.close();
    }
  });
  expect(decoded).toHaveLength(40);
  for (const clip of decoded) {
    expect(clip.duration, clip.id).toBeGreaterThan(0.3);
    expect(clip.duration, clip.id).toBeLessThan(10);
    expect(clip.rms, `${clip.id} must contain audible samples`).toBeGreaterThan(0.01);
  }
  const onboarding = page.getByRole('dialog', { name: 'What brings you here?' });
  await onboarding.getByTestId('goal-consistency').check();
  await onboarding.getByTestId('save-goal').click();
  await page.getByRole('button', { name: 'Configure practice' }).click();
  // Voice guidance is off by default. Enable it using the adjacent label.
  await page
    .getByText('Voice guidance (TTS)', { exact: true })
    .locator('..')
    .getByRole('button')
    .click();
  for (const voice of ['af_heart', 'af_bella', 'am_michael', 'bf_emma']) {
    await page.getByLabel('Voice', { exact: true }).selectOption(`kokoro:${voice}`);
    await page.getByRole('button', { name: 'Preview voice' }).click();
    await expect
      .poll(() =>
        page.evaluate(() => {
          const clips = (window as unknown as { guidanceClips: HTMLAudioElement[] }).guidanceClips;
          const active = clips.at(-1);
          return {
            path: active ? new URL(active.src).pathname : '',
            playing: active ? !active.paused && active.currentTime > 0 : false,
            rate: active?.playbackRate,
            olderStopped: clips.slice(0, -1).every((clip) => clip.paused),
          };
        })
      )
      .toEqual({
        path: `/audio/kokoro/${voice}/inhale.mp3`,
        playing: true,
        rate: 1,
        olderStopped: true,
      });
  }
  await page.getByRole('button', { name: 'Use these settings' }).click();
  await page.evaluate(() => {
    (window as unknown as { guidanceClips: HTMLAudioElement[] }).guidanceClips.length = 0;
  });
  await page.getByTestId('start-recommended').click();
  await page.getByTestId('checkin-skip').click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const clips = (window as unknown as { guidanceClips: HTMLAudioElement[] }).guidanceClips;
        return clips.map((clip) => ({
          file: new URL(clip.src).pathname,
          playing: !clip.paused && clip.currentTime > 0,
          time: clip.currentTime,
          error: clip.error?.message,
        }));
      })
    )
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file: '/audio/kokoro/bf_emma/inhale.mp3', playing: true }),
      ])
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
