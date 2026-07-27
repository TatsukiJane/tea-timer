/**
 * Checks that a new build installs itself — and only at a safe moment.
 *
 * Three scenarios, all against the *built* app served over http:
 *   A. nothing going on          → the update lands by itself, and says so
 *   B. an infusion is running    → the page is left alone, and updates after pause
 *   C. the editor is open        → unsaved text survives, and updates on leaving
 *
 * Run after `npm run build`:  npm run smoke:update
 *
 * Not part of `npm run verify` or CI: it needs Chromium, and it takes a minute.
 *
 * The "second version" is derived from the built one rather than built from edited
 * sources: the bundle is renamed and the service worker's precache manifest is
 * rewritten to match. That is enough for the browser to see a genuinely new worker
 * with a genuinely different payload, and it keeps the script from touching the
 * working tree. What is under test is *whether* an update is applied and when, not
 * what changed inside it.
 */

import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { cp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4199
const ROOT = 'e2e/.update-tmp'
const LIVE = `${ROOT}/live`
const BASE = `http://127.0.0.1:${PORT}/tea-timer/`

const require = createRequire(import.meta.url)

function loadPlaywright() {
  for (const candidate of [
    'playwright',
    '@playwright/test',
    '/opt/node22/lib/node_modules/playwright',
    '/usr/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright',
  ]) {
    try {
      return require(candidate)
    } catch {
      /* try the next one */
    }
  }
  throw new Error('Playwright not found. Install it (npm i -D playwright).')
}

let failures = 0
let checks = 0

function check(label, actual, expected) {
  checks += 1
  if (actual === expected) {
    console.log(`  ok   ${label}${expected === true ? '' : ` = ${actual}`}`)
  } else {
    failures += 1
    console.log(`  FAIL ${label}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`)
  }
}

/** The bundle the page is *running* — a version marker that works on any screen. */
const running = (page) =>
  page.evaluate(() => document.querySelector('script[src]')?.src.split('/').pop() ?? '?')

async function waitForRunning(page, want, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    // Reloading destroys the execution context mid-call; that is the event we are
    // waiting for, so a throw here is just "not yet".
    if ((await running(page).catch(() => '')) === want) return true
    await sleep(250)
  }
  return false
}

/**
 * Waits until a worker actually controls the page.
 *
 * Skipping this asks for an update while the very first worker is still activating:
 * with no controlled clients the new worker activates immediately instead of
 * waiting, so there is nothing left for the app to apply. That state does not exist
 * in life — by the time a build ships, the app has been controlled since the
 * previous visit — and testing it would only measure the browser's own rules.
 */
async function controlled(page) {
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      return navigator.serviceWorker.controller !== null && registration?.active?.state === 'activated'
    },
    null,
    { timeout: 20_000 },
  )
  await page.waitForTimeout(500)
}

/** Asks the browser to look for a new worker, the way the app itself does. */
const checkForUpdate = (page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration()
    await registration?.update()
  })

/* ── The two versions ───────────────────────────────────────────────────────── */

async function buildVersions() {
  await rm(ROOT, { recursive: true, force: true })
  await cp('dist', `${ROOT}/v1/tea-timer`, { recursive: true })
  await cp('dist', `${ROOT}/v2/tea-timer`, { recursive: true })

  const dir = `${ROOT}/v2/tea-timer`
  const assets = await readdir(`${dir}/assets`)
  const oldName = assets.find((name) => /^index-.*\.js$/.test(name))
  if (oldName === undefined) throw new Error('no index bundle in dist/assets — run npm run build first')
  const newName = 'index-UPDATED2.js'
  await rename(`${dir}/assets/${oldName}`, `${dir}/assets/${newName}`)

  const html = await readFile(`${dir}/index.html`, 'utf8')
  await writeFile(`${dir}/index.html`, html.replaceAll(oldName, newName))

  let sw = await readFile(`${dir}/sw.js`, 'utf8')
  sw = sw.replaceAll(oldName, newName)
  // index.html is precached with a content hash, so it must change too — otherwise
  // the new worker keeps serving the old page, which points at the renamed bundle.
  const revision = sw.match(/"index\.html",revision:"([a-f0-9]+)"/)
  if (revision === null) throw new Error('could not find the index.html precache revision in sw.js')
  sw = sw.replace(revision[1], revision[1].replace(/^./, (c) => (c === 'f' ? 'e' : 'f')))
  await writeFile(`${dir}/sw.js`, sw)

  return { v1: oldName, v2: newName }
}

const serve = async (version) => {
  await rm(`${LIVE}/tea-timer`, { recursive: true, force: true })
  await cp(`${ROOT}/${version}/tea-timer`, `${LIVE}/tea-timer`, { recursive: true })
}

/* ── Run ────────────────────────────────────────────────────────────────────── */

const { v1, v2 } = await buildVersions()
console.log(`\nversions: ${v1} → ${v2}`)
await serve('v1')

const server = spawn(process.execPath, ['e2e/static-server.mjs', LIVE, String(PORT)], {
  stdio: 'ignore',
})

let browser
try {
  const deadline = Date.now() + 20_000
  for (;;) {
    try {
      if ((await fetch(BASE)).ok) break
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error('static server did not start')
    await sleep(200)
  }

  const { chromium } = loadPlaywright()
  browser = await chromium.launch()

  const open = async () => {
    const context = await browser.newContext({ viewport: { width: 390, height: 900 } })
    const page = await context.newPage()
    page.on('pageerror', (error) => console.log('  pageerror:', error.message))
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.waitForSelector('[data-testid=new-mode]', { timeout: 15_000 })
    await controlled(page)
    return { context, page }
  }

  console.log('\n· an update applies itself when nothing is at stake')
  {
    const { context, page } = await open()
    check('starts on the old build', await running(page), v1)
    await serve('v2')
    await checkForUpdate(page)
    check('new build applied without being asked', await waitForRunning(page, v2, 25_000), true)
    check('the app says what happened', await page.getByText('Приложение обновлено').count() > 0, true)
    await context.close()
  }

  console.log('\n· a running infusion is never interrupted')
  await serve('v1')
  {
    const { context, page } = await open()
    await page.getByTestId('new-mode').click()
    await page.getByTestId('mode-title').fill('Долгий пролив')
    const time = page.getByTestId('step-seconds').nth(0)
    await time.click()
    await time.press('ControlOrMeta+a')
    await time.press('Backspace')
    await time.pressSequentially('500')
    await page.getByTestId('save-mode').click()
    await page.waitForSelector('[data-testid=mode-list]')

    await page
      .locator('[data-testid=mode-list] > li')
      .first()
      .getByRole('link', { name: 'Заваривать', exact: true })
      .click()
    await page.getByTestId('start-step').click()
    await page.waitForSelector('[data-testid=pause-step]')

    await serve('v2')
    await checkForUpdate(page)
    await sleep(6000)
    check('the step is still running', await page.getByTestId('pause-step').count() > 0, true)
    check('still on the old build, deliberately', await running(page), v1)

    // Pausing makes a reload harmless, and the update must take it from there.
    await page.getByTestId('pause-step').click()
    check('applied as soon as the step is paused', await waitForRunning(page, v2, 25_000), true)
    await context.close()
  }

  console.log('\n· an open editor holds unsaved text, so it holds the update too')
  await serve('v1')
  {
    const { context, page } = await open()
    await page.getByTestId('new-mode').click()
    await page.getByTestId('mode-title').fill('Недописанный чай')

    await serve('v2')
    await checkForUpdate(page)
    await sleep(6000)
    check('unsaved text survived', await page.getByTestId('mode-title').inputValue(), 'Недописанный чай')
    check('still on the old build, deliberately', await running(page), v1)

    await page.getByRole('link', { name: 'Назад' }).click()
    check('applied after leaving the editor', await waitForRunning(page, v2, 25_000), true)
    await context.close()
  }
} finally {
  await browser?.close()
  server.kill()
  await rm(ROOT, { recursive: true, force: true })
}

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exitCode = 1
