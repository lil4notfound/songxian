// 本文件中的设备、校准与训练数据为脱敏样例，仅用于测试。
import { expect, test, type Locator, type Page } from '@playwright/test';

declare global {
  interface Window {
    telemetryControl?: { pause: () => void; resume: () => void };
  }
}

const installTrainingApiMock = async (page: Page, compact = false) => {
  const state = { completed: false, moduleId: 'pelvic_floor', stage: 'beginner' as string | null };
  await page.route('**/api/v1/training/**', async (route) => {
    const request = route.request();
    if (
      request.method() === 'POST' &&
      request.headers()['content-type']?.includes('application/json') &&
      !request.postData()
    ) {
      return route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'FST_ERR_CTP_EMPTY_JSON_BODY' }),
      });
    }
    const url = new URL(request.url());
    const now = new Date().toISOString();
    const localDate = now.slice(0, 10);
    const prescription = {
      mode: 'standard' as const,
      stage: 'beginner' as const,
      version: compact ? 'e2e-beginner-fast' : 'pelvic-three-stage-v1-beginner-3-6',
      targetGroups: 2,
      cyclesPerGroup: compact ? 1 : 10,
      contractionSeconds: compact ? 1 : 3,
      relaxationSeconds: compact ? 1 : 6,
      prepareSeconds: compact ? 1 : 15,
      reprepareSeconds: compact ? 1 : 3,
      completeSeconds: compact ? 1 : 5,
    };
    const respond = (json: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(json) });

    if (url.pathname.endsWith('/plan')) {
      return respond({
        selectedStage: 'beginner',
        unlockedStages: state.completed ? ['beginner', 'intermediate'] : ['beginner'],
        qualifyingDays: { beginner: state.completed ? 14 : 0, intermediate: 0 },
        nextUnlock: state.completed
          ? { stage: 'advanced', current: 0, required: 21 }
          : { stage: 'intermediate', current: 0, required: 14 },
        prescription,
      });
    }
    if (url.pathname.endsWith('/records')) {
      return respond(
        state.completed
          ? [
              {
                date: localDate,
                status: 'complete',
                completedGroups: 2,
                targetGroups: 2,
                sessionCount: 1,
                quality: 'good',
              },
            ]
          : [],
      );
    }
    if (url.pathname.endsWith('/progress')) {
      return respond({
        currentStreak: state.completed ? 1 : 0,
        longestStreak: state.completed ? 1 : 0,
        trainingDays: state.completed ? 1 : 0,
        unlockedStages: state.completed ? ['beginner', 'intermediate'] : ['beginner'],
        qualifyingDays: { beginner: state.completed ? 14 : 0, intermediate: 0 },
        improvements: [],
        message: state.completed ? '已完成今天的训练。' : '正在建立基线。',
      });
    }
    if (url.pathname.endsWith('/summary')) {
      return respond({
        headline: state.moduleId === 'anal' ? '这次提肛带练已记录' : '今天的控制很清晰',
        body: '完成量和训练表现已按规则整理。',
        nextAction: '继续保持，把注意力放在充分放松上。',
        source: state.moduleId === 'anal' ? 'ai' : 'template',
      });
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/sessions')) {
      const start = request.postDataJSON() as {
        requestId: string;
        prescriptionVersion: string;
        startedAt: string;
        moduleId?: string;
        stage: string | null;
        evaluationMode?: string;
      };
      state.moduleId = start.moduleId ?? 'pelvic_floor';
      state.stage = start.stage;
      return respond(
        {
          id: 'e2e-session',
          requestId: start.requestId,
          moduleId: state.moduleId,
          stage: state.stage,
          evaluationMode: start.evaluationMode,
          prescriptionVersion: start.prescriptionVersion,
          startedAt: start.startedAt,
          endedAt: null,
          localDate,
          status: 'active',
          targetGroups: state.moduleId === 'anal' ? 1 : 2,
          completedGroups: 0,
          targetCycles: state.moduleId === 'anal' ? 5 : prescription.cyclesPerGroup * 2,
          completedCycles: 0,
          elapsedSeconds: 0,
          metrics: null,
          assessment: null,
          summary: null,
        },
        201,
      );
    }
    if (request.method() === 'PUT' && url.pathname.endsWith('/complete')) {
      const completion = request.postDataJSON() as Record<string, unknown>;
      state.completed = state.moduleId === 'pelvic_floor';
      return respond({
        id: 'e2e-session',
        prescriptionVersion: prescription.version,
        startedAt: now,
        localDate,
        moduleId: state.moduleId,
        stage: state.stage,
        summary: null,
        ...completion,
      });
    }
    return route.abort();
  });
  return state;
};

const expectFontSizeAtMost = async (locator: Locator, maximum: number) => {
  const fontSize = await locator.evaluate((element) =>
    Number.parseFloat(window.getComputedStyle(element).fontSize),
  );
  expect(fontSize).toBeLessThanOrEqual(maximum);
};

test.beforeEach(async ({ page }) => {
  await installTrainingApiMock(page);
  await page.addInitScript(() => {
    const increment = (key: string) => {
      const current = Number(window.sessionStorage.getItem(key) ?? '0');
      window.sessionStorage.setItem(key, String(current + 1));
    };
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel: () => increment('audioCancelCount'),
        getVoices: () => [],
        resume: () => undefined,
        speak: () => increment('audioSpeakCount'),
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class MockSpeechSynthesisUtterance {
        lang = '';
        rate = 1;
        pitch = 1;
        volume = 1;

        constructor(readonly text: string) {}
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      value: () => {
        increment('audioPlayCount');
        return Promise.resolve();
      },
    });
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      value: () => increment('audioPauseCount'),
    });
  });
  await page.goto('/');
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

test('completes eligibility, opens audio, and redoes a paused cycle', async ({ page }) => {
  await expect(page.getByRole('button', { name: '盆底肌', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '坐姿', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '提肛', exact: true })).toBeVisible();
  await expect(page.getByLabel('当前臀下、腿侧与背部中央接触趋势')).toBeVisible();
  await expect(page.getByRole('button', { name: '听建议' })).toBeEnabled();
  await expectFontSizeAtMost(page.locator('.posture-heading h1'), 32);
  const titleBox = await page.locator('.posture-heading h1').boundingBox();
  const statusBox = await page.locator('.observation-state').boundingBox();
  expect(titleBox).not.toBeNull();
  expect(statusBox).not.toBeNull();
  expect(
    Math.abs(titleBox!.y + titleBox!.height / 2 - (statusBox!.y + statusBox!.height / 2)),
  ).toBeLessThan(8);
  await expect(page.getByRole('dialog', { name: '练习适用确认' })).not.toBeVisible();

  await page.getByRole('button', { name: '盆底肌', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '练习适用确认' })).toBeVisible();
  await expectFontSizeAtMost(page.locator('.eligibility-question h1'), 28);
  await expect(page.locator('.eligibility-question h1')).toBeFocused();
  await expect(page.locator('.app-module-surface')).toHaveAttribute('inert', '');
  expect(
    await page.evaluate(() => ({
      document: getComputedStyle(document.documentElement).overflow,
      page: getComputedStyle(document.body).overflow,
      dialog: getComputedStyle(document.querySelector<HTMLElement>('.eligibility-dialog')!)
        .overflow,
      dialogBody: getComputedStyle(
        document.querySelector<HTMLElement>('.eligibility-dialog__body')!,
      ).overflowY,
    })),
  ).toEqual({ document: 'hidden', page: 'hidden', dialog: 'hidden', dialogBody: 'auto' });
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole('radio', { name: /没有/ }).click();
    await page.getByRole('button', { name: step === 2 ? '确认并开始' : '下一步' }).click();
  }

  await expect(page.getByRole('heading', { name: '准备' })).toBeVisible();
  await expect(page.getByText('初级 · 找到正确的收缩感觉')).toBeVisible();
  await expectFontSizeAtMost(page.locator('.training-focus h1'), 48);
  await expect(page.locator('.app-module-surface')).not.toHaveAttribute('inert', '');
  await page.getByRole('button', { name: '声音设置' }).click();
  await expect(page.getByRole('heading', { name: '声音设置' })).toBeVisible();
  await page.getByRole('button', { name: '关闭声音设置' }).click();

  await page.getByRole('button', { name: '开始盆底肌训练' }).click();
  await page.getByRole('button', { name: '计时带练', exact: true }).click();
  await expect(page.getByLabel('剩余 15 秒')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Number(sessionStorage.getItem('audioPlayCount') ?? '0') +
          Number(sessionStorage.getItem('audioSpeakCount') ?? '0'),
      ),
    )
    .toBeGreaterThan(0);
  const pauseCountBeforePause = await page.evaluate(() =>
    Number(sessionStorage.getItem('audioPauseCount') ?? '0'),
  );
  await page.getByRole('button', { name: '暂停' }).click();
  await expect
    .poll(() => page.evaluate(() => Number(sessionStorage.getItem('audioPauseCount') ?? '0')))
    .toBeGreaterThan(pauseCountBeforePause);
  await expect(page.getByRole('heading', { name: '先完全放松，重新坐好' })).toBeVisible();
  await expect(page.getByText('继续后会先准备 3 秒，再从第 1 轮的收缩重新开始。')).toBeVisible();

  await page.getByRole('button', { name: '准备好，重做本轮' }).click();
  await expect(page.getByRole('heading', { name: '重新准备' })).toBeVisible();
  await expect(page.getByText('本次收缩将重新开始')).toBeVisible();
});

test('shows the posture illustration above one suggestion and plays it on request', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await expect(page.getByLabel('当前臀下、腿侧与背部中央接触趋势')).toBeVisible();
  await expect(page.getByText('现在只做这一件事')).toBeVisible();
  await expect(page.getByRole('button', { name: '听建议' })).toBeVisible();
  await expect(page.getByRole('button', { name: '开始坐姿观察' })).toHaveCount(0);
  await expect(page.getByText('臀下平衡')).toBeVisible();
  await expect(page.getByText('腿侧平衡')).toBeVisible();

  const map = await page.getByLabel('当前臀下、腿侧与背部中央接触趋势').boundingBox();
  const advice = await page.locator('.advice-panel').boundingBox();
  expect(map).not.toBeNull();
  expect(advice).not.toBeNull();
  expect(map!.y).toBeLessThan(advice!.y);

  const mobileLayout = await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>('.posture-layout')!.getBoundingClientRect();
    const navigation = document
      .querySelector<HTMLElement>('.module-tab-bar__material')!
      .getBoundingClientRect();
    return {
      pageHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      gapToNavigation: navigation.top - layout.bottom,
    };
  });
  expect(mobileLayout.pageHeight).toBe(mobileLayout.viewportHeight);
  expect(mobileLayout.gapToNavigation).toBeGreaterThanOrEqual(8);

  const spokenBefore = await page.evaluate(
    () =>
      Number(sessionStorage.getItem('audioPlayCount') ?? '0') +
      Number(sessionStorage.getItem('audioSpeakCount') ?? '0'),
  );
  await page.getByRole('button', { name: '听建议' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Number(sessionStorage.getItem('audioPlayCount') ?? '0') +
          Number(sessionStorage.getItem('audioSpeakCount') ?? '0'),
      ),
    )
    .toBeGreaterThan(spokenBefore);
});

test('opens the training calendar without changing the three-module navigation', async ({
  page,
}) => {
  await page.getByRole('button', { name: '训练记录' }).click();
  await expect(page.getByText('训练记录', { exact: true })).toBeVisible();
  await expect(page.getByText('天连续打卡')).toBeVisible();
  await expect(page.getByRole('button', { name: '盆底肌', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '坐姿', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '提肛', exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight),
  ).toBe(true);
});

test('opens the five-channel device console and starts guided calibration', async ({ page }) => {
  await page.getByRole('button', { name: '设备与校准' }).click();
  await expect(page.getByRole('heading', { name: /坐垫已连接|已连接，信号变化中/ })).toBeVisible();
  await expect(page.getByLabel('五路实时读数')).toBeVisible();
  for (const label of ['臀下左', '臀下右', '腿侧左', '腿侧右', '背部中央']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(page.getByAltText(/二维码/)).toHaveCount(0);
  await expect(page.getByText('演示手机')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '开始引导校准' })).toBeEnabled();
  await page.getByRole('button', { name: '开始引导校准' }).click();
  await expect(page.getByRole('heading', { name: '保持空载' })).toBeVisible();
  await expect(page.getByText('步骤 1 / 29')).toBeVisible();
  await page.getByRole('button', { name: '取消校准' }).click();
  await page.getByRole('button', { name: '返回' }).click();
  await expect(page.getByLabel('当前臀下、腿侧与背部中央接触趋势')).toBeVisible();
});

test('keeps the audio sheet complete and above navigation on a short Android viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 560 });
  await page.getByRole('button', { name: '声音设置' }).click();
  await expect(page.getByRole('dialog', { name: '声音设置' })).toBeVisible();
  await expect(page.getByRole('button', { name: '播放试听' })).toBeVisible();
  await page.locator('.audio-sheet').evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });

  const sheetLayout = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>('.audio-sheet')!.getBoundingClientRect();
    const navigation = document
      .querySelector<HTMLElement>('.module-tab-bar__material')!
      .getBoundingClientRect();
    const topElement = document.elementFromPoint(
      navigation.left + navigation.width / 2,
      navigation.top + navigation.height / 2,
    );
    return {
      sheetTop: sheet.top,
      sheetBottom: sheet.bottom,
      viewportHeight: window.innerHeight,
      navigationCovered: Boolean(topElement?.closest('.sheet-backdrop')),
    };
  });

  expect(sheetLayout.sheetTop).toBeGreaterThanOrEqual(0);
  expect(sheetLayout.sheetBottom).toBeLessThanOrEqual(sheetLayout.viewportHeight + 1);
  expect(sheetLayout.navigationCovered).toBe(true);

  const playsBefore = await page.evaluate(
    () =>
      Number(sessionStorage.getItem('audioPlayCount') ?? '0') +
      Number(sessionStorage.getItem('audioSpeakCount') ?? '0'),
  );
  await page.getByRole('button', { name: '播放试听' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          Number(sessionStorage.getItem('audioPlayCount') ?? '0') +
          Number(sessionStorage.getItem('audioSpeakCount') ?? '0'),
      ),
    )
    .toBeGreaterThan(playsBefore);
});

test('completes two compact groups, saves reflection, marks the calendar, and unlocks', async ({
  page,
}) => {
  await page.unroute('**/api/v1/training/**');
  await installTrainingApiMock(page, true);
  await page.reload();

  await page.getByRole('button', { name: '盆底肌', exact: true }).click();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole('radio', { name: /没有/ }).click();
    await page.getByRole('button', { name: step === 2 ? '确认并开始' : '下一步' }).click();
  }

  await page.getByRole('button', { name: '开始盆底肌训练' }).click();
  await page.getByRole('button', { name: '计时带练', exact: true }).click();
  await expect(page.getByRole('button', { name: '开始第 2 组' })).toBeVisible({ timeout: 10_000 });
  await page.getByRole('button', { name: '开始第 2 组' }).click();
  await expect(page.getByRole('heading', { name: '今天练起来怎么样？' })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: '轻松', exact: true }).click();
  await page.getByRole('button', { name: '容易', exact: true }).click();
  await page.getByRole('button', { name: '没有', exact: true }).click();
  await page.getByRole('button', { name: '保存并查看总结' }).click();
  await expect(page.getByRole('heading', { name: '今天的控制很清晰' })).toBeVisible();
  await page.screenshot({ path: 'output/playwright/mobile-pelvic-summary.png' });
  await expect(page.getByText('1 天')).toBeVisible();

  await page.getByRole('button', { name: '查看记录' }).click();
  await expect(page.getByLabel(/已完成/)).toBeVisible();
  await page.getByRole('button', { name: '盆底肌', exact: true }).click();
  await expect(page.getByRole('button', { name: '中级', exact: true })).toBeEnabled();
});

test('saves an anal session and generates its own summary without changing pelvic progress', async ({
  page,
}) => {
  await page.getByRole('button', { name: '提肛', exact: true }).click();
  await page.getByRole('button', { name: '开始提肛', exact: true }).click();
  const started = page.waitForRequest(
    (request) => request.method() === 'POST' && request.url().endsWith('/sessions'),
  );
  await page.getByRole('button', { name: '计时带练', exact: true }).click();
  expect((await started).postDataJSON()).toMatchObject({
    moduleId: 'anal',
    stage: null,
    evaluationMode: 'timer',
    prescriptionVersion: 'anal-basic-v1',
  });
  await expect(page.getByText('计时模式：未评价动作')).toBeVisible();
  await page.getByRole('button', { name: '不舒服 / 停止' }).click();
  await expect(page.getByRole('heading', { name: '停下来后，记录一下感受。' })).toBeVisible();
  await page.getByRole('button', { name: '合适', exact: true }).click();
  await page.getByRole('button', { name: '容易', exact: true }).click();
  await page.getByRole('button', { name: '没有', exact: true }).click();
  await page.getByRole('button', { name: '保存并查看总结' }).click();
  await expect(page.getByRole('heading', { name: '这次提肛带练已记录' })).toBeVisible();
  await expect(page.getByText('AI 已按训练数据整理')).toBeVisible();
  await page.screenshot({ path: 'output/playwright/mobile-anal-summary.png' });
  await expect(page.getByRole('button', { name: '查看记录' })).toHaveCount(0);
  await page.getByRole('button', { name: '盆底肌', exact: true }).click();
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole('radio', { name: /没有/ }).click();
    await page.getByRole('button', { name: step === 2 ? '确认并开始' : '下一步' }).click();
  }
  await expect(page.getByRole('button', { name: '中级', exact: true })).toBeDisabled();
});

test('freezes a mobile timer session when telemetry stops and requires manual recovery', async ({
  page,
}) => {
  // The mock gateway publishes every 500 ms; stop its scheduler to simulate no new frames.
  await page.addInitScript(() => {
    const browserWindow: Window = window;
    const schedule = browserWindow.setInterval.bind(browserWindow);
    const cancel = browserWindow.clearInterval.bind(browserWindow);
    const streams = new Map<number, { timer: number; handler: TimerHandler; delay?: number }>();
    browserWindow.setInterval = (handler: TimerHandler, delay?: number) => {
      const timer = schedule(handler, delay);
      if (delay === 500) streams.set(timer, { timer, handler, delay });
      return timer;
    };
    browserWindow.clearInterval = (id?: number) => {
      if (id === undefined) return;
      cancel(streams.get(id)?.timer ?? id);
      streams.delete(id);
    };
    browserWindow.telemetryControl = {
      pause: () => streams.forEach((stream) => cancel(stream.timer)),
      resume: () =>
        streams.forEach((stream) => {
          stream.timer = schedule(stream.handler, stream.delay);
        }),
    };
  });
  await page.reload();
  await page.getByRole('button', { name: '提肛', exact: true }).click();
  await page.getByRole('button', { name: '开始提肛', exact: true }).click();
  await page.getByRole('button', { name: '计时带练', exact: true }).click();
  const pauses = await page.evaluate(() =>
    Number(sessionStorage.getItem('audioPauseCount') ?? '0'),
  );
  await page.evaluate(() => window.telemetryControl!.pause());
  const dialog = page.getByRole('dialog', { name: '先调整，再继续' });
  await expect(dialog).toBeVisible({ timeout: 6000 });
  await expect(dialog.getByText('检查坐垫连接，恢复数据后再继续。')).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => Number(sessionStorage.getItem('audioPauseCount') ?? '0')))
    .toBeGreaterThan(pauses);
  const frozen = await page.getByLabel(/剩余 \d+ 秒/).textContent();
  await expect(dialog.getByRole('button', { name: '调整后重做本轮' })).toBeDisabled();
  await dialog.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations({ subtree: true }).map((animation) => animation.finished),
    );
  });
  expect(
    await page.evaluate(() => {
      const navigation = document
        .querySelector<HTMLElement>('.module-tab-bar')!
        .getBoundingClientRect();
      return Boolean(
        document
          .elementFromPoint(
            navigation.x + navigation.width / 2,
            navigation.y + navigation.height / 2,
          )
          ?.closest('.pause-dialog'),
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: 'output/playwright/mobile-interruption.png' });
  await page.evaluate(() => window.telemetryControl!.resume());
  await expect(dialog.getByRole('button', { name: '调整后重做本轮' })).toBeEnabled({
    timeout: 5000,
  });
  expect(await page.getByLabel(/剩余 \d+ 秒/).textContent()).toBe(frozen);
  await dialog.getByRole('button', { name: '调整后重做本轮' }).click();
  await expect(page.getByRole('heading', { name: '重新准备' })).toBeVisible();
  await expect(page.getByText('0 / 5 已完成')).toBeVisible();
});
