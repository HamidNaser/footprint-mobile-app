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
 * The test files 016 adds or rewrites, which are the ones whose answers a time zone could
 * move. Listed in the order the tasks write them, so what is missing reads as how far the
 * feature has got.
 */
const TEST_TARGETS = [
  'src/utils/__tests__/calendarModel.test.js',                        // T002
  'src/services/__tests__/DatabaseService.calendar.test.js',          // T003
  'src/components/journal/__tests__/CalendarSheet.test.js',           // T004
  'src/screens/__tests__/JournalScreen.calendar.test.js',             // T005-T008
  'src/components/journal/__tests__/CalendarListHeading.test.js',     // T006
  'src/components/journal/__tests__/CalendarSheet.a11y.test.js',      // T009
  'src/components/journal/__tests__/CalendarListHeading.a11y.test.js', // T009
];

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

    child.on('error', (error) => {
      output += `\n${error.message}\n`;
      resolve({ zone, code: 1, output });
    });
    child.on('close', (code) => resolve({ zone, code: code ?? 1, output }));
  });
}

function describeCounts(counts) {
  if (!counts) return 'counts unavailable (jest printed no summary)';

  const suites = counts.suitesPassed === null
    ? ''
    : `; suites ${counts.suitesPassed} passed, ${counts.suitesFailed} failed`;
  return `${counts.passed} passed, ${counts.failed} failed, `
    + `${counts.skipped} skipped of ${counts.total}${suites}`;
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

  if (missing.length > 0) {
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
