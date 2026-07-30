/**
 * End-to-end smoke run against the *built* app.
 *
 * Run it after `npm run build`; it starts `vite preview` itself so the base path
 * (/tea-timer/) and the service worker are the real ones. Deliberately not part of
 * `npm run verify` or CI: it needs a Chromium install, whereas verify has to work
 * anywhere.
 *
 *   npm run build && npm run smoke
 *
 * Playwright is resolved from the local install if present, otherwise from a global
 * one — this environment ships Chromium globally and re-downloading it is neither
 * necessary nor allowed.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4183
const BASE = `http://127.0.0.1:${PORT}/tea-timer/`

const require = createRequire(import.meta.url)

function loadPlaywright() {
  const candidates = [
    'playwright',
    '@playwright/test',
    '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright',
  ]
  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch {
      /* try the next one */
    }
  }
  throw new Error(
    'Playwright not found. Install it (npm i -D playwright) or run where a global install exists.',
  )
}

let failures = 0
let checks = 0

function check(label, actual, expected) {
  checks += 1
  const ok = typeof expected === 'function' ? expected(actual) : actual === expected
  if (ok) {
    console.log(`  ok   ${label}${expected === true || typeof expected === 'function' ? '' : ` = ${actual}`}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  }
}

/**
 * Types a pour time with real key events.
 *
 * `fill()` is not usable on the m:ss field: it assigns the DOM value directly, and
 * a controlled input that reformats on every keystroke can re-render and write the
 * old text back before the synthetic input event is processed — so the digits
 * appended instead of replacing, intermittently. Keystrokes go through React the
 * same way a user's do.
 */
async function setTime(locator, digits) {
  await locator.click()
  await locator.press('ControlOrMeta+a')
  await locator.press('Backspace')
  await locator.pressSequentially(digits)
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await sleep(300)
  }
  throw new Error(`preview server did not start at ${url}`)
}

const preview = spawn(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['vite', 'preview', '--port', String(PORT), '--strictPort'],
  { stdio: 'ignore' },
)

let browser
try {
  await waitForServer(BASE)
  const { chromium } = loadPlaywright()
  browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: { width: 390, height: 900 },
    colorScheme: 'dark',
  })
  // Records every scheduled oscillator start so the repeating alarm can be checked
  // without listening to it: headless Chromium has no speakers, but the schedule on
  // the audio clock is exactly what makes the signal survive a throttled tab.
  await context.addInitScript(() => {
    window.__oscStarts = []
    const proto = window.AudioContext?.prototype
    if (!proto) return
    const create = proto.createOscillator
    proto.createOscillator = function patched() {
      window.__audioCtx = this
      const osc = create.call(this)
      const start = osc.start.bind(osc)
      osc.start = (when) => {
        window.__oscStarts.push(when ?? this.currentTime)
        start(when)
      }
      return osc
    }
  })
  // Vibration is a no-op in headless Chromium, but the *pattern* is the thing worth
  // checking: it has to be one buzz per pip, of the pip's own length.
  await context.addInitScript(() => {
    window.__vibrations = []
    const proto = window.Navigator?.prototype
    if (!proto || typeof proto.vibrate !== 'function') return
    const original = proto.vibrate
    proto.vibrate = function patched(pattern) {
      window.__vibrations.push(pattern)
      return original.call(this, pattern)
    }
  })

  const page = await context.newPage()

  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))

  console.log('\n· create a tea with two presets and a rinse')
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByTestId('new-mode').click()
  await page.getByTestId('mode-title').fill('Шу Пуэр 2018')
  await page.getByTestId('preset-volume-0').fill('150')
  await page.getByTestId('preset-grams-0').fill('8')
  // Temperature is a preset-level setting, not a per-step one.
  await page.getByTestId('preset-temp-0').fill('95')

  const seconds = page.getByTestId('step-seconds')
  await setTime(seconds.nth(0), '002')
  await page.getByRole('switch', { name: 'Промывка' }).nth(0).click()
  // The row index is tracked rather than counted: count() does not wait for the
  // freshly added row, so it can address the previous one.
  let stepCount = 1
  for (const value of ['002', '045']) {
    await page.getByRole('button', { name: 'Добавить пролив' }).first().click()
    await setTime(seconds.nth(stepCount), value)
    stepCount += 1
  }

  console.log('· time is entered left to right through the m:ss mask')
  const lastTime = seconds.nth(2)
  await setTime(lastTime, '2')
  check('a lone digit is minutes, colon inserted by itself', await lastTime.inputValue(), '2:')
  await setTime(lastTime, '200')
  check('digits stay where they were typed', await lastTime.inputValue(), '2:00')
  await setTime(lastTime, '175')
  await page.getByTestId('mode-title').click()
  check('an overflowing seconds part tidies up on blur', await lastTime.inputValue(), '2:15')
  await setTime(lastTime, '045')
  check('a short pour is entered with its leading zero', await lastTime.inputValue(), '0:45')

  await page.getByTestId('add-preset').click()
  await page.getByTestId('preset-volume-1').fill('200')
  await page.getByTestId('preset-grams-1').fill('10')

  console.log('· copy the time curve to the second preset')
  await page.getByRole('button', { name: 'Скопировать проливы' }).nth(1).click()
  await page.getByRole('button', { name: /150 мл/ }).click()
  check('step inputs across both presets', await seconds.count(), 6)

  await page.getByTestId('save-mode').click()
  await page.waitForSelector('[data-testid=mode-list]')

  console.log('\n· persistence across a reload')
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForSelector('[data-testid=mode-list]')
  check('cards in the list', await page.locator('[data-testid=mode-list] > li').count(), 1)
  const cardText = await page.locator('[data-testid=mode-list] > li').first().innerText()
  check('card shows both volumes', cardText.includes('150 / 200 мл'), true)
  // The rinse must not be counted as an infusion.
  check('card counts infusions without the rinse', cardText.includes('2 пролива'), true)

  console.log('\n· brew screen')
  await page
    .locator('[data-testid=mode-list] > li')
    .first()
    .getByRole('link', { name: 'Заваривать', exact: true })
    .click()
  await page.waitForSelector('[data-testid=preset-picker]')
  check('preset picker appears when there is more than one preset', true, true)
  await page.getByTestId('pick-preset-150').click()

  check(
    'brewing context shows volume, leaf and temperature together',
    await page.getByTestId('brew-context').innerText(),
    '150 мл · 8 г · 95°',
  )
  check('first step is the rinse', await page.getByTestId('step-title').innerText(), 'Промывка')

  console.log('\n· run a step to completion')
  await page.getByTestId('start-step').click()
  await page.waitForSelector('[data-testid=next-step]', { timeout: 10_000 })
  check('readout reaches zero', await page.getByTestId('timer-readout').innerText(), '0:00')

  console.log('\n· the signal repeats until it is switched off')
  await page.waitForSelector('[data-testid=silence-alarm]', { timeout: 5000 })
  const scheduled = await page.evaluate(() => ({
    count: window.__oscStarts.length,
    last: Math.max(...window.__oscStarts),
    // The app's own context, so "far ahead" is measured against the clock the
    // pips are actually scheduled on.
    now: window.__audioCtx.currentTime,
  }))
  check('more than one burst of pips is scheduled', scheduled.count > 3, true)
  check(
    'pips are scheduled far past the deadline, so throttling cannot cut them off',
    scheduled.last > scheduled.now + 30,
    true,
  )

  // Two oscillators start at the same instant per pip: the fundamental and the
  // octave that makes it carry. One voice per instant would mean a bare sine again.
  const voicesPerPip = await page.evaluate(() => {
    const perInstant = new Map()
    for (const at of window.__oscStarts) perInstant.set(at, (perInstant.get(at) ?? 0) + 1)
    return [...perInstant.values()]
  })
  check(
    'every pip is a fundamental plus its octave',
    voicesPerPip.length > 0 && voicesPerPip.every((n) => n === 2),
    true,
  )

  check(
    'the vibration is one buzz per pip, of the pip length',
    JSON.stringify(await page.evaluate(() => window.__vibrations.at(-1))),
    JSON.stringify([130, 90, 130, 90, 130]),
  )

  console.log('· the window title blinks while the window is not in front')
  const restingTitle = await page.title()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', { value: () => false, configurable: true })
  })
  await sleep(1300)
  check('the title carries the alarm when the window is behind', (await page.title()).includes('⏰'), true)

  await page.getByTestId('silence-alarm').click()
  check('the silence button disappears once pressed', await page.getByTestId('silence-alarm').count(), 0)
  const afterSilence = await page.evaluate(() => window.__oscStarts.length)
  await sleep(2500)
  check(
    'nothing new is scheduled after silencing',
    await page.evaluate(() => window.__oscStarts.length),
    afterSilence,
  )
  check('silencing gives the title back', await page.title(), restingTitle)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hasFocus', { value: () => true, configurable: true })
  })

  console.log('· advancing must not auto-start the next step')
  await page.getByTestId('next-step').click()
  check('numbering starts after the rinse', await page.getByTestId('step-title').innerText(), 'Пролив 1')
  await page.waitForSelector('[data-testid=start-step]', { timeout: 5000 })
  check('next step is idle, waiting for a manual start', true, true)

  console.log('\n· "Далее" marks the pour behind you, "Назад" un-marks it')
  const stepRows = page.locator('[data-testid=step-list] > li > button')
  check('the rinse that ran out is marked done', await stepRows.nth(0).getAttribute('data-done'), 'true')
  await page.getByTestId('skip-next').click()
  check(
    'skipping forward marks the pour you left, without waiting for its timer',
    await stepRows.nth(1).getAttribute('data-done'),
    'true',
  )
  await page.getByRole('button', { name: 'Назад' }).click()
  check(
    'going back un-marks the pour you returned to',
    await stepRows.nth(1).getAttribute('data-done'),
    'false',
  )
  check('and leaves you on it', await page.getByTestId('step-title').innerText(), 'Пролив 1')

  console.log('\n· state stays correct when the tab is hidden past a deadline')
  await page.getByTestId('start-step').click()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'hidden', configurable: true })
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await sleep(3000)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { get: () => 'visible', configurable: true })
    Object.defineProperty(document, 'hidden', { get: () => false, configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForSelector('[data-testid=next-step]', { timeout: 5000 })
  check('step reads as finished after the background gap', await page.getByTestId('timer-readout').innerText(), '0:00')

  console.log('\n· service worker and offline')
  const swState = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return { scope: registration.scope, state: registration.active?.state ?? null }
  })
  check('service worker scope is under the base path', swState.scope.endsWith('/tea-timer/'), true)
  check('service worker is activated', swState.state, 'activated')

  // The token must never reach Cache Storage. See docs/sync.md.
  const githubCached = await page.evaluate(async () => {
    for (const name of await caches.keys()) {
      const keys = await caches.open(name).then((cache) => cache.keys())
      if (keys.some((request) => request.url.includes('api.github.com'))) return true
    }
    return false
  })
  check('nothing from api.github.com is cached', githubCached, false)

  await context.setOffline(true)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=mode-list]', { timeout: 15_000 })
  check('app boots offline from the precache', await page.locator('[data-testid=mode-list] > li').count(), 1)

  console.log('\n· offline save is queued rather than lost')
  await page.goto(`${BASE}#/settings`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('gh-owner').fill('example')
  await page.getByTestId('gh-repo').fill('tea-vault')
  await page.getByTestId('github-token').fill('github_pat_smoke_test_placeholder')
  await page.getByTestId('save-token').click()
  await page.getByTestId('save-github').click()
  // Both writes are async against IndexedDB; navigating before they land would
  // leave sync looking unconfigured.
  await page.waitForSelector('text=Настройки сохранены', { timeout: 10_000 })

  console.log('· the signal volume is remembered')
  await page.getByTestId('volume-low').click()
  // The write goes to IndexedDB; reloading before it lands would prove nothing.
  await page.waitForTimeout(500)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-testid=volume-low]')
  check(
    'the chosen volume survives a reload',
    await page.getByTestId('volume-low').getAttribute('data-state'),
    'on',
  )

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('new-mode').click()
  await page.getByTestId('mode-title').fill('Оффлайн чай')
  await setTime(page.getByTestId('step-seconds').nth(0), '030')
  await page.getByTestId('save-mode').click()
  await page.waitForSelector('[data-testid=mode-list]')
  await page.waitForTimeout(1000)
  check('saved while offline', await page.locator('[data-testid=mode-list] > li').count(), 2)
  check(
    'pending count is shown, so nothing is silently unsynced',
    (await page.getByTestId('sync-status').innerText()).includes('Не отправлено'),
    true,
  )
  await context.setOffline(false)

  console.log('\n· duplicate opens an unsaved copy')
  await page.getByRole('button', { name: 'Действия' }).first().click()
  await page.getByRole('menuitem', { name: 'Дублировать' }).click()
  await page.waitForSelector('[data-testid=mode-title]')
  check(
    'the copy is named after the original',
    (await page.getByTestId('mode-title').inputValue()).endsWith('(копия)'),
    true,
  )
  check('the copy carries the pours over', (await page.getByTestId('step-seconds').count()) > 0, true)
  await page.getByRole('link', { name: 'Назад' }).click()
  await page.waitForSelector('[data-testid=mode-list]')
  await page.waitForTimeout(400)
  check(
    'backing out of a duplicate writes nothing',
    await page.locator('[data-testid=mode-list] > li').count(),
    2,
  )

  console.log('\n· delete with confirmation')
  await page.getByRole('button', { name: 'Действия' }).first().click()
  await page.getByRole('menuitem', { name: 'Удалить' }).click()
  await page.getByTestId('confirm-delete').click()
  await page.waitForTimeout(600)
  check('one card removed', await page.locator('[data-testid=mode-list] > li').count(), 1)

  // Sync failures are expected here (the repo is a placeholder); anything else is not.
  const unexpected = consoleErrors.filter(
    (text) => !/Failed to load resource|api\.github\.com|net::ERR/.test(text),
  )
  check('no unexpected console errors', unexpected.length === 0 ? true : unexpected.join(' | '), true)
} finally {
  await browser?.close()
  preview.kill()
}

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exitCode = 1
