#!/usr/bin/env node
/**
 * 016 T002: the calendar's tests, run in three time zones.
 *
 * A memory's date is a calendar day, not a moment (FR-011): nothing may move to another day,
 * month or year because of where it is read. The only way to prove that is to read the same
 * journal from more than one zone, so this runs the calendar's own test files three times --
 * `America/Los_Angeles` (west of Greenwich), `UTC` and `Pacific/Auckland` (east) -- which is
 * SC-004's check. The pattern, and most of the reasoning, is feature 014's research R14 on
 * the web; the phone has its own copy because it has its own test runner.
 *
 * ⚠ **Windows.** Builder machines run Windows, where `TZ=… npx jest` is not a command at all
 * -- a shell prefix like that is POSIX, and under `cmd` it is a syntax error or, worse, a
 * silently ignored argument that makes every zone the machine's own and the whole run
 * meaningless. So each run is spawned with `env: { ...process.env, TZ }`, which is what
 * actually sets the zone, and `shell: true`, which is what makes `npx` resolve to `npx.cmd`.
 * No new dependency.
 *
 * It prints each run's counts, **runs all three even when one fails**, and exits non-zero if
 * any of them failed, so this can never report green over a red run.
 *
 * Targets are named one file at a time, never as a folder or a prefix: a prefix matching
 * nothing cannot be told apart from one whose file was never written. A target that does not
 * exist yet is named as a warning, because the tasks that write those files are still open.
 *
 *   node scripts/test-tz.mjs             the calendar's own test files, in three zones
 *   node scripts/test-tz.mjs --all       the whole suite in three zones (slower, T010)
 *   node scripts/test-tz.mjs --strict    a listed file that does not exist is a failure
 *
 * Each run is given a timeout (ten minutes, or `TEST_TZ_TIMEOUT_MS`), because the failure this
 * script must not have is the quiet one: a jest that hangs would hold the sweep open for ever
 * and report neither a pass nor a fail. A run that reaches it is killed and counted as a
 * failure like any other.
 *
 * `--strict` also sets `CALENDAR_FILES_STRICT=1`, which turns the civil-date grep in
 * `calendarModel.test.js` strict for the same reason: the feature's final run should prove
 * that every file it was meant to read really was read.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const ZONES = ['America/Los_Angeles', 'UTC', 'Pacific/Auckland'];

/**
 * The test files 016 and 019 add or rewrite, which are the ones whose answers a time zone
 * could move. Listed in the order the tasks write them, so what is missing reads as how far
 * the feature has got.
 *
 * 019 put the same Date / Month / Year calendar on the Family and Friends journals, so the
 * suites that read those screens, their hook and their service belong here too (019 T014):
 * a day shown on the wrong day is the one defect three zones catch and one zone cannot.
 */
const TEST_TARGETS = [
  // --- 016: the Journal tab's calendar ---
  'src/utils/__tests__/calendarModel.test.js',                        // T002
  'src/services/__tests__/DatabaseService.calendar.test.js',          // T003
  'src/components/journal/__tests__/CalendarSheet.test.js',           // T004
  'src/screens/__tests__/JournalScreen.calendar.test.js',             // T005-T008
  'src/components/journal/__tests__/CalendarListHeading.test.js',     // T006
  'src/components/journal/__tests__/CalendarSheet.a11y.test.js',      // T009
  'src/components/journal/__tests__/CalendarListHeading.a11y.test.js', // T009
  // --- 019: the same calendar on the Family and Friends journals ---
  'src/services/__tests__/adaptEntry.test.js',                        // 019 T002
  'src/services/__tests__/JournalCalendarService.test.js',            // 019 T004
  'src/components/journal/__tests__/JournalDateBar.test.js',          // 019 T005
  'src/components/journal/__tests__/FacesRow.test.js',                // 019 T006
  'src/hooks/__tests__/usePeopleCalendar.test.js',                    // 019 T007
  'src/screens/__tests__/PersonJournalScreen.calendar.test.js',       // 019 T009-T013
  'src/screens/__tests__/FamilySummaryScreen.calendar.test.js',       // 019 T011-T013
];

/**
 * How long one zone's run may take before it is killed and counted as failed. Ten minutes is
 * far longer than the whole suite needs (about half a minute a zone) and short enough that a
 * hung run is noticed the same day.
 */
const RUN_TIMEOUT_MS = Number(process.env.TEST_TZ_TIMEOUT_MS) || 10 * 60 * 1000;

const flags = process.argv.slice(2);
const strict = flags.includes('--strict');
const whole = flags.includes('--all');

const exists = (relative) => fs.existsSync(path.join(ROOT, relative));

const ANSI = /\u001b\[[0-9;]*m/g;

/**
 * The counts out of jest's own summary lines, which read like
 * `Tests:       77 passed, 77 total`.
 *
 * Whether a run passed is decided by its exit code, never by this: a parse that found
 * nothing must not be able to turn a failure into a pass.
 */
function countsFrom(output) {
  const clean = output.replace(ANSI, '');
  const lines = clean.split(/\r?\n/);

  const lastMatching = (label) => {
    const found = lines.filter((line) => new RegExp(`^\\s*${label}:\\s+\\S`).test(line));
    return found.length > 0 ? found[found.length - 1] : null;
  };

  const tests = lastMatching('Tests');
  if (!tests) return null;

  const number = (label, from) => {
    const match = from.match(new RegExp(`(\\d+)\\s+${label}`));
    return match ? Number(match[1]) : 0;
  };

  // A suite that fails to load runs no tests at all, so the suite counts are what show it.
  const suites = lastMatching('Test Suites');

  return {
    passed: number('passed', tests),
    failed: number('failed', tests),
    skipped: number('skipped', tests),
    // A file a later task has not written yet is a todo in the guard, not a warning, so the
    // line only adds up if todos are counted (see `calendarModel.test.js`).
    todo: number('todo', tests),
    total: number('total', tests),
    suitesPassed: suites ? number('passed', suites) : null,
    suitesFailed: suites ? number('failed', suites) : null,
  };
}

function runZone(zone, files) {
  const command = whole
    ? 'npx jest'
    : `npx jest --runTestsByPath ${files.map((f) => `"${f}"`).join(' ')}`;

  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd: ROOT,
      shell: true,                     // so `npx` resolves to `npx.cmd` on Windows
      env: {
        ...process.env,
        // The zone itself, set in the child's environment rather than as a shell prefix --
        // see the header. This line is the whole point of the script.
        TZ: zone,
        NO_COLOR: '1',                 // keeps the summary parsable and the output plain
        FORCE_COLOR: '0',
        ...(strict ? { CALENDAR_FILES_STRICT: '1' } : {}),
      },
    });

    // Decoded as a stream, not per chunk: a character split across a chunk boundary would
    // otherwise be mangled in the failing run this echoes back.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });

    // `shell: true` means the child *is* the shell, and killing it does not necessarily take
    // jest with it -- so on Windows the whole tree goes, by pid.
    const killTree = () => {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
      } else {
        child.kill('SIGKILL');
      }
    };

    // The failure this script must not have is the quiet one: a jest that never finishes
    // would hold the sweep open for ever and report neither a pass nor a fail.
    const timer = setTimeout(() => {
      output += `\ntest-tz: killed after ${RUN_TIMEOUT_MS} ms without finishing\n`;
      killTree();
      // Resolved here rather than waiting for `close`, so that a child which cannot be killed
      // cannot hold the sweep open either.
      resolve({ zone, code: 1, output });
    }, RUN_TIMEOUT_MS);

    child.on('error', (error) => {
      clearTimeout(timer);
      output += `\n${error.message}\n`;
      resolve({ zone, code: 1, output });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ zone, code: code ?? 1, output });
    });
  });
}

function describeCounts(counts) {
  if (!counts) return 'counts unavailable (jest printed no summary)';

  const suites = counts.suitesPassed === null
    ? ''
    : `; suites ${counts.suitesPassed} passed, ${counts.suitesFailed} failed`;
  const todo = counts.todo > 0 ? `, ${counts.todo} todo` : '';
  return `${counts.passed} passed, ${counts.failed} failed, `
    + `${counts.skipped} skipped${todo} of ${counts.total}${suites}`;
}

async function main() {
  const present = TEST_TARGETS.filter(exists);
  const missing = TEST_TARGETS.filter((target) => !exists(target));

  if (whole) {
    console.log(`test-tz: the whole suite, in ${ZONES.join(', ')}`);
  } else {
    console.log(`test-tz: ${present.length} of ${TEST_TARGETS.length} listed test files, `
      + `in ${ZONES.join(', ')}`);
  }

  // Said only when it bears on what ran: under `--all` the whole suite runs whatever the
  // target list holds, so listing the files it does not name would be noise. Under `--strict`
  // it is a failure either way, so it is still said.
  if (missing.length > 0 && (!whole || strict)) {
    console.log('');
    console.log(`${strict ? 'MISSING' : 'Not written yet'} (${missing.length}):`);
    missing.forEach((target) => console.log(`  - ${target}`));
    if (!strict) {
      console.log('  These belong to tasks of 016 that are still open. Run with --strict to');
      console.log('  make a missing file a failure (T010).');
    }
  }

  if (!whole && present.length === 0) {
    console.log('');
    console.log('FAILED: none of the listed test files exists, so nothing was run.');
    process.exitCode = 1;
    return;
  }

  const results = [];
  for (const zone of ZONES) {
    console.log('');
    console.log(`--- TZ=${zone} ---`);
    // Said before the run, not after: a suite takes long enough that silence looks like a
    // hang.
    const what = whole ? 'the whole suite' : `${present.length} test file${present.length === 1 ? '' : 's'}`;
    console.log(`running ${what} in ${zone}...`);

    // Sequentially, one zone at a time: three jest runs at once would fight over the same
    // cores and the same cache, and the output would interleave into something unreadable.
    // eslint-disable-next-line no-await-in-loop
    const result = await runZone(zone, present);
    const counts = countsFrom(result.output);
    results.push({ ...result, counts });

    if (result.code !== 0) {
      // The whole run, so a failure can be read here rather than reproduced by hand.
      console.log(result.output.replace(ANSI, '').trimEnd());
    }

    console.log(`TZ=${zone}: ${describeCounts(counts)} `
      + `-- ${result.code === 0 ? 'passed' : 'FAILED'}`);
  }

  console.log('');
  console.log('test-tz summary');
  results.forEach(({ zone, code, counts }) => {
    console.log(`  ${code === 0 ? 'pass' : 'FAIL'}  TZ=${zone.padEnd(19)} ${describeCounts(counts)}`);
  });

  const failed = results.filter((result) => result.code !== 0).map((result) => result.zone);
  const strictlyMissing = strict ? missing : [];

  if (failed.length > 0) console.log(`  FAILED in: ${failed.join(', ')}`);
  if (strictlyMissing.length > 0) {
    console.log(`  FAILED: ${strictlyMissing.length} listed file(s) do not exist (--strict)`);
  }

  process.exitCode = failed.length > 0 || strictlyMissing.length > 0 ? 1 : 0;
}

main();
