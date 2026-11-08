/**
 * End-to-end check of the built app in an iPhone 12 viewport.
 * Usage: npm run test:e2e   (builds first, then serves dist/ and drives Chromium)
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/opt/node-tools/node_modules/playwright');
  }
}
const { chromium, devices } = loadPlaywright();

const PORT = 4179;
const BASE = `http://localhost:${PORT}/`;
let failures = 0;
let passes = 0;

function check(cond, label) {
  if (cond) {
    passes++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}`);
  }
}

async function step(name, fn) {
  console.log(`\n${name}`);
  try {
    await fn();
  } catch (e) {
    failures++;
    console.log(`  ✗ threw: ${e.message.split('\n')[0]}`);
  }
}

async function main() {
  const root = path.resolve(__dirname, '../..');
  const server = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'preview', '--port', String(PORT), '--strictPort'], { cwd: root, stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 1500));

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 12'], deviceScaleFactor: 1, acceptDownloads: true });
  await ctx.clock.install({ time: new Date('2026-11-09T17:30:00') }); // Monday
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const t = (id) => page.getByTestId(id);
  const item = (id) => page.getByTestId(`item-${id}`);
  const noHorizontalScroll = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

  try {
    await step('Today shows the scheduled workout immediately', async () => {
      await page.goto(BASE);
      await t('today-card').waitFor();
      check((await t('today-card').innerText()).includes('Pull strength'), 'Monday is Pull strength');
      check((await t('today-card').innerText()).includes('3 × 5–8'), 'prescription visible (Pull-ups 3 × 5–8)');
      check(await noHorizontalScroll(), 'no horizontal scroll at 390 px');
    });

    await step('Daily check-in', async () => {
      await t('open-checkin').click();
      await page.getByTestId('ci-sleep').getByRole('textbox').fill('7.5');
      await t('ci-energy').getByRole('radio', { name: '4', exact: true }).click();
      await t('ci-finger').getByRole('radio', { name: '1', exact: true }).click();
      await t('checkin-save').click();
      await page.waitForTimeout(300);
      check((await t('open-checkin').innerText()).includes('Sleep 7.5 h'), 'check-in summary shown');
    });

    let sessionUrl = '';
    await step('Start a session and log sets in a few taps', async () => {
      await t('start-session').click();
      await t('session-screen').waitFor();
      sessionUrl = page.url();
      const pull = item('pull-ups');
      check(await pull.getByTestId('set-editor').isVisible(), 'first exercise opens automatically');
      await pull.getByTestId('set-rir').getByRole('radio', { name: '3', exact: true }).click();
      await pull.getByTestId('log-set').click(); // set 1: 5 reps BW
      check(await t('rest-timer').waitFor({ timeout: 3000 }).then(() => true, () => false), 'rest timer starts after a set');
      await pull.getByRole('button', { name: 'Increase reps' }).click(); // 6
      await pull.getByTestId('log-set').click();
      await pull.getByTestId('log-set').click();
      await page.waitForTimeout(300);
      check((await pull.innerText()).includes('6 · 6 · 6 @ BW') || (await pull.innerText()).includes('5 · 6 · 6 @ BW'), 'logged summary shows reps @ BW');
      check(await item('chest-supported-rows').getByTestId('set-editor').isVisible(), 'next exercise opens after the last set');
    });

    await step('Edit a logged set', async () => {
      await item('pull-ups').locator('.ex-head').click();
      await item('pull-ups').getByRole('button', { name: 'Edit set 1' }).click();
      await item('pull-ups').getByTestId('set-value').getByRole('textbox').fill('7');
      await item('pull-ups').getByTestId('log-set').click();
      await page.waitForTimeout(300);
      check((await item('pull-ups').innerText()).includes('7 · 6 · 6 @ BW'), 'set 1 updated to 7 reps');
    });

    await step('Weights, skip, target change, substitution and extra exercise', async () => {
      const rows = item('chest-supported-rows');
      await rows.locator('.ex-head').click();
      await rows.getByTestId('set-weight').getByRole('textbox').fill('30');
      await rows.getByTestId('log-set').click();
      await page.waitForTimeout(200);
      check((await rows.innerText()).includes('30 kg'), 'weight recorded');
      await rows.getByTestId('item-done').click();
      await page.waitForTimeout(200);
      check((await rows.locator('.tick.on').count()) === 1, 'partly logged exercise can be marked complete');
      await rows.locator('.ex-head').click();
      await rows.getByTestId('item-done').click();
      await page.waitForTimeout(200);
      check((await rows.locator('.tick.on').count()) === 0, 'and marked not done again');

      const curls = item('hammer-curls');
      await curls.locator('.ex-head').click();
      await curls.getByTestId('item-skip').click();
      await page.waitForTimeout(200);
      check((await curls.innerText()).includes('skipped'), 'exercise skipped');

      const lat = item('neutral-lat-pulldown');
      await lat.locator('.ex-head').click();
      await lat.getByTestId('item-target').click();
      await t('rx-sets').getByRole('button', { name: /Decrease/ }).click();
      await t('target-save').click();
      await page.waitForTimeout(200);
      check((await lat.innerText()).includes('(changed)'), 'session target marked as changed');
      check((await lat.innerText()).includes('Programme 2 × 10–12'), 'original prescription still shown');

      const yr = item('prone-y-raises');
      await yr.locator('.ex-head').click();
      await yr.getByTestId('item-substitute').click();
      await t('picker-search').fill('Face pulls');
      await page.getByTestId('exercise-picker').getByRole('button', { name: 'Face pulls' }).click();
      await page.waitForTimeout(200);
      check((await item('face-pulls').innerText()).includes('Instead of Prone Y raises'), 'substitution recorded');

      await t('add-exercise').click();
      await t('picker-search').fill('Ring rows');
      await t('picker-custom').click();
      await t('picker-add').click();
      await page.waitForTimeout(200);
      check(await page.getByText('Ring rows').first().isVisible(), 'extra exercise added');
    });

    await step('Incomplete session can be left and resumed after a reload', async () => {
      await t('save-exit').click();
      await t('resume-session').waitFor();
      await page.reload();
      await t('resume-session').waitFor();
      check(true, 'Today offers “Resume session” after reload');
      await t('resume-session').click();
      await t('session-screen').waitFor();
      check((await item('pull-ups').innerText()).includes('7 · 6 · 6 @ BW'), 'logged sets persisted');
      check((await t('session-progress').innerText()).includes('of 9 done'), 'progress persisted');
    });

    await step('Programme is unchanged by session edits', async () => {
      await page.goto(BASE + '#/schedule');
      await t('day-0').locator('.ex-head').click();
      check((await t('day-0').innerText()).includes('Neutral-grip lat pulldown\n2 × 10–12') || (await t('day-0').innerText()).includes('2 × 10–12'), 'Monday still prescribes 2 × 10–12');
      check(!(await t('day-0').innerText()).includes('Ring rows'), 'extra exercise not added to programme');
      check(await noHorizontalScroll(), 'schedule fits the screen');
    });

    await step('Finish the session', async () => {
      await page.goto(sessionUrl);
      await t('finish-session').click();
      await t('finish-duration').getByRole('textbox').fill('85');
      await t('finish-rpe').getByRole('radio', { name: '7', exact: true }).click();
      await t('complete-session').click();
      await t('view-session').waitFor();
      check((await t('today-card').innerText()).includes('1 h 25 min · RPE 7'), 'Today shows completed session summary');
    });

    await step('Quick-log a climb, then edit and delete it from the log', async () => {
      await t('quick-climb').click();
      await t('climb-grade').getByRole('radio', { name: 'Green', exact: true }).click();
      await t('climb-save').click();
      await page.waitForTimeout(300);
      await page.goto(BASE + '#/log');
      await t('log-search').fill('green');
      await t('log-climb').first().click();
      await t('climb-attempts').getByRole('button', { name: /Increase/ }).click();
      await t('climb-save').click();
      await page.waitForTimeout(200);
      check((await t('log-climb').first().innerText()).includes('2 att.'), 'climb edited');
      await t('log-climb').first().click();
      await page.getByTestId('climb-sheet').getByRole('button', { name: 'Delete' }).click();
      await t('confirm-ok').click();
      await page.waitForTimeout(300);
      check((await t('log-climb').count()) === 0, 'climb deleted');
      await t('log-search').fill('pull');
      check((await t('log-session').count()) === 1, 'search finds the session by exercise name');
    });

    await step('Weekly summary reflects the logged data', async () => {
      await page.goto(BASE + '#/progress/week');
      await t('stat-sessions').waitFor();
      const txt = await t('stat-sessions').innerText();
      check(/1\s*\/\s*6/.test(txt), `sessions 1 / 6 (got "${txt.replace(/\n/g, ' ')}")`);
      check((await t('stat-hours').innerText()).includes('1 h 25 min'), 'training time 1 h 25 min');
      const comp = await t('stat-completion').innerText();
      check(comp.includes('of 9'), `exercise completion counts 9 planned items (got "${comp.replace(/\n/g, ' ')}")`);
    });

    await step('Next day: limit bouldering problems with +1 attempt and send', async () => {
      await ctx.clock.setSystemTime(new Date('2026-11-10T18:00:00'));
      await page.goto(BASE + '#/today');
      await page.reload();
      await t('today-card').waitFor();
      check((await t('today-card').innerText()).includes('Limit bouldering'), 'Tuesday shows limit bouldering');
      check((await t('today-card').innerText()).toLowerCase().includes('finger loading'), 'finger loading is flagged');
      await t('start-session').click();
      const block = item('limit-bouldering');
      await block.locator('.ex-head').click();
      await block.getByTestId('climb-minutes').getByRole('textbox').fill('55');
      await block.getByTestId('log-problem').click();
      await t('climb-grade').getByRole('radio', { name: 'Red', exact: true }).click();
      await t('climb-save').click();
      await page.waitForTimeout(300);
      await block.getByTestId('problem-attempt').click();
      await block.getByTestId('problem-sent').click();
      await page.waitForTimeout(300);
      check((await block.innerText()).includes('2 attempts · sent'), 'attempt added and marked sent');
      await page.goto(BASE + '#/progress/week');
      await t('stat-top-grade').waitFor();
      check((await t('stat-top-grade').innerText()).includes('Red'), 'week summary shows Red sent');
      check((await t('stat-climb-time').innerText()).includes('55 min'), 'climbing time recorded');
    });

    let backupPath = '';
    await step('Export JSON and CSV', async () => {
      await page.goto(BASE + '#/profile');
      const [dl] = await Promise.all([page.waitForEvent('download'), t('export-json').click()]);
      backupPath = path.join(os.tmpdir(), `ctt-backup-${Date.now()}.json`);
      await dl.saveAs(backupPath);
      const json = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      check(json.app === 'climbing-training-tracker' && json.data.sessions.length === 2, 'backup contains 2 sessions');
      const [csv] = await Promise.all([page.waitForEvent('download'), t('export-csv-sessions').click()]);
      const p = path.join(os.tmpdir(), `ctt-${Date.now()}.csv`);
      await csv.saveAs(p);
      check(fs.readFileSync(p, 'utf8').includes('Pull-ups'), 'CSV contains logged sets');
    });

    await step('Sample data preview stays separate from real data', async () => {
      await page.goto(BASE + '#/profile');
      await page.getByRole('switch', { name: 'Sample data preview' }).click();
      await t('confirm-ok').click();
      await t('sample-banner').waitFor();
      await page.waitForTimeout(800);
      const bars = await page.locator('.chart svg path').count();
      check(bars > 5, `sample charts render (${bars} marks)`);
      for (const tab of ['strength', 'climbing', 'fingers', 'mobility', 'recovery', 'body']) {
        await page.goto(BASE + `#/progress/${tab}`);
        await page.waitForTimeout(400);
        const marks = await page.locator('.chart svg path, .chart svg circle').count();
        check(marks > 0 && (await noHorizontalScroll()), `${tab} tab renders charts and fits the screen`);
      }
      await page.getByRole('button', { name: 'Exit' }).click();
      await page.waitForTimeout(800);
      await page.goto(BASE + '#/log');
      await page.waitForTimeout(300);
      check((await t('log-session').count()) === 2, 'real log still has exactly 2 sessions');
      check((await page.getByTestId('sample-banner').count()) === 0, 'banner gone after exit');
    });

    await step('Import a backup (replace) restores data', async () => {
      await page.goto(BASE + '#/profile');
      await t('erase-open').click();
      await t('erase-input').fill('ERASE');
      await t('erase-confirm').click();
      await page.waitForTimeout(300);
      await page.goto(BASE + '#/log');
      await page.getByText('Nothing logged yet').waitFor();
      check((await t('log-session').count()) === 0, 'erased');
      await page.goto(BASE + '#/profile');
      await t('import-file').setInputFiles(backupPath);
      await t('import-replace').click();
      await t('confirm-ok').click();
      await page.waitForTimeout(400);
      check((await page.locator('.toast').innerText()).includes('Backup imported'), 'import confirmed');
      await page.goto(BASE + '#/log');
      await t('log-session').first().waitFor();
      check((await t('log-session').count()) === 2, 'both sessions restored');
    });

    await step('Delete a session', async () => {
      await t('log-session').first().click();
      await t('session-menu').click();
      await t('delete-session').click();
      await t('confirm-ok').click();
      await t('today-screen').waitFor();
      await page.goto(BASE + '#/log');
      await t('log-session').first().waitFor();
      await page.waitForTimeout(300);
      check((await t('log-session').count()) === 1, 'one session left');
    });

    await step('Rising or high discomfort is flagged without diagnosing', async () => {
      await page.goto(BASE + '#/today');
      await t('open-checkin').click();
      await t('ci-finger').getByRole('radio', { name: '6', exact: true }).click();
      await t('checkin-save').click();
      await t('discomfort-flag').waitFor();
      const txt = await t('discomfort-flag').innerText();
      check(txt.includes('reducing or modifying'), 'flag suggests reducing or modifying loading');
      check(txt.includes('not a diagnosis') && !/train through it/i.test(txt.replace('Avoid training through pain', '')), 'flag is not a diagnosis and does not encourage training through pain');
      await page.goto(BASE + '#/progress/strength');
      await page.waitForTimeout(300);
      check((await page.getByText('Progression suggestions are paused').count()) === 1, 'progression suggestions paused while flagged');
    });

    check(errors.length === 0, `no console errors${errors.length ? `: ${errors.slice(0, 3).join(' | ')}` : ''}`);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
