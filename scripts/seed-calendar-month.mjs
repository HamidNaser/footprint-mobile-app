#!/usr/bin/env node
/**
 * 016 T010: seed a real account with ~300 memories inside one month, for the owner's device
 * walk (T011) against SC-005 -- "A month of up to 300 memories lists and scrolls without
 * visible stutter on a mid-range phone."
 *
 * WHY THIS GOES THROUGH THE HUB API, NOT THE PHONE'S LOCAL DATABASE DIRECTLY
 * The thing SC-005 is about -- `getCalendarIndexRows` / `getEntriesInRange`
 * (`src/services/DatabaseService.js`) and the lists they feed -- reads a SQLite file opened
 * through `expo-sqlite`, a native module. That module does not load under plain Node: it is
 * why `src/database/upgradePaths.test.js`, `DatabaseService.calendar.test.js` and five other
 * suites in this repo say so in their own header comments and substitute Node's built-in
 * `node:sqlite` instead. A script run on a dev machine has no route to open, or write into,
 * the *file* that module manages inside a real phone's sandbox -- and this app has no debug
 * bridge that would let an outside process reach it. So there is no way to write "local
 * memories" from here as a literal file write, on a real iPhone or Android phone.
 *
 * What *does* reach the phone is the ordinary route every real memory takes: the Hub is the
 * source of truth, and `SyncEngine`'s pull (`JournalApi.getChanges`, `src/sync/SyncEngine.js`)
 * is what writes rows into `journal_entries` locally. So this script creates the memories on
 * the server, over the same endpoint the app itself batches saves through --
 * `POST /api/v1/journals/sync` (`JournalApi.batchSync`, `src/api/JournalApi.js`) -- and the
 * owner's phone picks them up the next time it syncs (opening the app, pulling to refresh, or
 * the periodic background sync), exactly as any other memory would arrive. This also means
 * the seeded month survives a preview-build reinstall between now and T011
 * (docs/TESTING.md: "Entries that have reached the server are safe").
 *
 * The request shape and the idempotent-retry behaviour below were read directly off the Hub's
 * controller and DTOs (`Footprint.Hub.Api/Controllers/V1/JournalsController.cs`,
 * `Footprint.Hub.Contracts/Api/Journals/JournalDtos.cs`), not guessed from the client alone:
 * `date` must be a plain `yyyy-MM-dd` string (`CivilDateJsonConverter` throws on anything
 * else -- this script never hands a moment, only a day, matching FR-011); there is no
 * `title` field on `CreateSyncEntry` at all, so one is not sent; `visibility: 'private'`
 * never reaches the audience resolver (`TranslateForStorageAsync`'s "already storable"
 * branch) -- it is stored with no audience and nothing async or fallible, so these seeds
 * cannot trip the project's "sharing fails closed" path; and a repeated `clientId` for the
 * same account is an idempotent no-op in `BatchSync`, not a duplicate -- so running this
 * script twice for the same month does not double the count.
 *
 * Each seeded memory carries one text content block (`{ type: 'text', content }`), which is all
 * `JournalEntryCard` needs to draw a card -- no photo/audio/video upload is attempted, since
 * that would need the upload pipeline and is out of this task's scope.
 *
 * ⚠ **This is a real limitation of what a clean SC-005 walk over this seed proves, not just an
 * implementation shortcut, and it is stated here so it is not read as settled.** List-scroll
 * stutter on a mid-range phone is very often driven by per-row image decode and layout cost,
 * not row count alone, and this app's cards commonly carry photos. A month of 300 text-only
 * memories that scrolls smoothly is real evidence for SC-005's row-count claim -- it does
 * **not** also clear a photo-heavy month, which this script cannot seed without the upload
 * pipeline. The owner should read a clean walk over this data as "list and scroll with up to
 * 300 rows, text-only, does not stutter," not as the whole of SC-005.
 *
 * USAGE
 *   export FOOTPRINT_TOKEN="eyJ..."     # the signed-in account's access token
 *                                       # (same token scripts/seed-events.mjs asks for --
 *                                       #  on the phone/web client:
 *                                       #  AsyncStorage.getItem('@footprint/access_token'))
 *
 *   node scripts/seed-calendar-month.mjs                     # ~300 memories, this month
 *   node scripts/seed-calendar-month.mjs --month=2026-03      # a named month instead
 *   node scripts/seed-calendar-month.mjs --count=150           # fewer/more than ~300
 *   node scripts/seed-calendar-month.mjs --dry-run              # print the plan, send nothing
 *   node scripts/seed-calendar-month.mjs --help
 *
 * Optional environment:
 *   FOOTPRINT_API_URL     defaults to https://api.aqrava.com (the app's own default)
 *   FOOTPRINT_JOURNAL_ID   skip discovery and seed straight into this journal id
 *
 * Journal: by default the script asks the Hub which journal the signed-in account has
 * (`GET /api/v1/journals`) and uses the first one -- the same journal `SyncBootstrap`
 * (`reconcileDefaultJournal`) adopts as the phone's own default, so the seeded memories land
 * in the journal the Journal screen actually queries. If the account has none yet, one is
 * created ("My Journal"), the same fallback `resolveImportJournal.js` uses.
 *
 * WHAT TO DO ON THE PHONE AFTERWARDS
 * Open the app (or pull-to-refresh the Journal, or background/foreground it) so a sync pull
 * runs. The seeded month then shows up in Month and Year mode exactly like any other memory.
 *
 * Re-running for the same month is safe (see idempotent clientId above) and running it again
 * with a larger --count only adds the difference, since each memory's clientId is keyed by
 * its position in the month.
 */

import { pathToFileURL } from 'node:url';

const API = process.env.FOOTPRINT_API_URL || 'https://api.aqrava.com';
const TOKEN = process.env.FOOTPRINT_TOKEN;
const JOURNAL_ID_OVERRIDE = process.env.FOOTPRINT_JOURNAL_ID;

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const HELP = argv.includes('--help') || argv.includes('-h');

function flagValue(name) {
  const prefix = `--${name}=`;
  const hit = argv.find((a) => a.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const pad2 = (n) => String(n).padStart(2, '0');

function usage() {
  return [
    'Seed ~300 memories into one calendar month, via the Hub API (016 T010, SC-005).',
    '',
    'Usage:',
    '  export FOOTPRINT_TOKEN="eyJ..."',
    '  node scripts/seed-calendar-month.mjs [--month=YYYY-MM] [--count=300] [--dry-run]',
    '',
    'Env:',
    '  FOOTPRINT_TOKEN       required unless --dry-run (the signed-in account\'s access token)',
    '  FOOTPRINT_API_URL     default https://api.aqrava.com',
    '  FOOTPRINT_JOURNAL_ID  optional; default is the account\'s first journal (created if none)',
    '',
    'After it runs: open the app on the phone, or pull-to-refresh the Journal, so a sync pull',
    'brings the seeded month down into the phone\'s own local database.',
  ].join('\n');
}

/**
 * Parse `--month=YYYY-MM`, defaulting to the current calendar month. Read once, from numeric
 * parts, never round-tripped through a date string -- the same discipline `calendarModel.js`
 * requires of its own callers (FR-011): nothing here is a moment, only a year and a month.
 */
function resolveTargetMonth() {
  const raw = flagValue('month');
  if (raw == null) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  const match = /^(\d{4})-(\d{2})$/.exec(raw);
  if (!match) {
    throw new Error(`--month must be YYYY-MM, got "${raw}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    throw new Error(`--month's month must be 01-12, got "${match[2]}"`);
  }
  return { year, month };
}

/**
 * The number of days in `year`-`month`, from numeric parts only (day 0 of the next month is
 * the last day of this one) -- the standard idiom, and not a second copy of
 * `periodDate.daysInMonth`'s leap-year rule: this file cannot import that module (it is ES
 * module syntax loaded by Metro's bundler, which plain Node's CommonJS resolver for a
 * same-named `.js` file cannot parse), so it asks `Date` the same question a different way
 * rather than re-deriving the leap rule by hand.
 */
function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

/**
 * Lay out `count` memories across every day of `year`-`month`, pure and network-free so it
 * can be checked by eye in `--dry-run` or exercised directly.
 *
 * The 1st of the month is always left empty -- the one day T010's brief asks for, and the one
 * day the index and `getEntriesInRange` must agree has nothing to return. Every other day
 * gets a share of `count` proportional to a repeating weight pattern (1 to 8), so the month
 * has real variation -- some days with several memories, most with a few -- rather than a
 * flat count per day that would not exercise `buildRows`'s day-heading grouping the way a
 * real month does. The remainder left over by rounding down is handed to the days with the
 * largest fractional share first, so the total is always exactly `count`.
 */
export function planCalendarMonth({ year, month, count = 300 }) {
  const totalDays = daysInMonth(year, month);
  if (!totalDays || totalDays < 2) {
    throw new Error(`${year}-${pad2(month)} does not have enough days to leave one empty.`);
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`count must be a non-negative integer, got ${count}`);
  }

  const EMPTY_DAY = 1;
  const WEIGHTS = [3, 1, 6, 1, 2, 8, 1, 4, 1, 5];
  const weightFor = (day) => (day === EMPTY_DAY ? 0 : WEIGHTS[(day - 1) % WEIGHTS.length]);

  const rows = Array.from({ length: totalDays }, (_, i) => {
    const day = i + 1;
    return { day, weight: weightFor(day) };
  });
  const totalWeight = rows.reduce((sum, r) => sum + r.weight, 0);

  const sized = rows.map((r) => {
    const raw = totalWeight > 0 ? (r.weight / totalWeight) * count : 0;
    const floor = Math.floor(raw);
    return { ...r, entries: floor, frac: raw - floor };
  });

  let remainder = count - sized.reduce((sum, r) => sum + r.entries, 0);
  const byFracDesc = sized.filter((r) => r.weight > 0).sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder && byFracDesc.length > 0; k++) {
    byFracDesc[k % byFracDesc.length].entries += 1;
  }

  const plan = [];
  let seq = 0;
  for (const row of sized) {
    const date = `${year}-${pad2(month)}-${pad2(row.day)}`;
    for (let n = 0; n < row.entries; n++) {
      plan.push({ date, seq, ordinalInDay: n + 1, dayTotal: row.entries });
      seq++;
    }
  }
  return plan;
}

/** A plain self-check over `planCalendarMonth`'s output -- the dry run's evidence. */
export function checkPlan(plan, { year, month, count }) {
  const problems = [];
  if (plan.length !== count) {
    problems.push(`plan has ${plan.length} entries, expected exactly ${count}`);
  }
  const byDate = new Map();
  for (const entry of plan) byDate.set(entry.date, (byDate.get(entry.date) || 0) + 1);
  const totalDays = daysInMonth(year, month);
  const emptyDays = [];
  for (let day = 1; day <= totalDays; day++) {
    const date = `${year}-${pad2(month)}-${pad2(day)}`;
    if (!byDate.has(date)) emptyDays.push(date);
  }
  if (emptyDays.length === 0) {
    problems.push('no day of the month is empty');
  }
  const max = Math.max(0, ...byDate.values());
  if (count > 0 && max < 2) {
    problems.push(`no day has more than one memory (max ${max}); "several" is not exercised`);
  }
  return { ok: problems.length === 0, problems, emptyDays, byDate, max };
}

function formatEntryForWire({ date, journalId, seq, ordinalInDay }) {
  return {
    // Keyed by the date plus the entry's position *within that day* (not the plan's global
    // sequence number), so that re-running with a different --count keeps the same clientId
    // for a day's first N entries as long as that day still gets at least N of them -- which
    // is what makes "running it again with a larger --count only adds the difference" true
    // rather than merely asserted. The global `seq` is used only in the content text, which
    // carries no idempotency weight.
    clientId: `cal-seed-${date}-${pad2(ordinalInDay)}`,
    journalId,
    date,
    datePrecision: 'day',
    visibility: 'private',
    // ContentBlockRequest has no `order` property (only `type`, `content`, `media`,
    // `capturedAt`, `duration`, `location`) -- the server would silently drop one, so none is
    // sent. A single block needs no explicit order anyway.
    contentBlocks: [
      {
        type: 'text',
        content: `Seed memory for SC-005 -- ${date}, #${seq + 1} of the month.`,
      },
    ],
  };
}

function authHeaders(token) {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

/** Bare or wrapped -- `ApiClient` hands back whatever the endpoint answered, and this is the
 * same defensive read `resolveImportJournal.js` and `SyncBootstrap.reconcileDefaultJournal`
 * use for the same endpoint. */
function asJournalList(body) {
  if (Array.isArray(body)) return body;
  for (const key of ['items', 'journals', 'data', 'results']) {
    if (Array.isArray(body?.[key])) return body[key];
  }
  return [];
}

async function resolveJournalId() {
  if (JOURNAL_ID_OVERRIDE) return JOURNAL_ID_OVERRIDE;

  const listRes = await fetch(`${API}/api/v1/journals`, { headers: authHeaders(TOKEN) });
  if (!listRes.ok) {
    throw new Error(`Could not list journals: HTTP ${listRes.status} ${await listRes.text()}`);
  }
  const journals = asJournalList(await listRes.json());
  if (journals.length > 0) {
    return journals[0].id;
  }

  console.log('  No journal yet on this account -- creating "My Journal" to seed into.');
  const createRes = await fetch(`${API}/api/v1/journals`, {
    method: 'POST',
    headers: authHeaders(TOKEN),
    body: JSON.stringify({ name: 'My Journal' }),
  });
  if (!createRes.ok) {
    throw new Error(
      `Could not create a journal to seed into: HTTP ${createRes.status} ${await createRes.text()}`
    );
  }
  const created = await createRes.json();
  return created.id;
}

async function sendBatch(entries, journalId) {
  const payload = {
    creates: entries.map((e) => formatEntryForWire({ ...e, journalId })),
    updates: [],
    deletes: [],
    clientTimestamp: new Date().toISOString(),
  };

  const res = await fetch(`${API}/api/v1/journals/sync`, {
    method: 'POST',
    headers: authHeaders(TOKEN),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Batch sync failed: HTTP ${res.status} ${text.slice(0, 500)}`);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Batch sync returned non-JSON: ${text.slice(0, 200)}`);
  }
  return body;
}

async function main() {
  if (HELP) {
    console.log(usage());
    return;
  }

  const { year, month } = resolveTargetMonth();
  const count = flagValue('count') != null ? Number(flagValue('count')) : 300;

  const plan = planCalendarMonth({ year, month, count });
  const check = checkPlan(plan, { year, month, count });

  console.log(
    `Planned ${plan.length} memories for ${year}-${pad2(month)}${DRY_RUN ? ' (dry run)' : ''}`
  );
  console.log(
    `  empty days: ${check.emptyDays.join(', ') || '(none)'}  |  busiest day has ${check.max}`
  );
  if (!check.ok) {
    console.error('  Plan failed its own self-check:');
    for (const p of check.problems) console.error(`    - ${p}`);
    process.exit(1);
  }

  if (DRY_RUN) {
    console.log('\nFirst three entries that would be sent:');
    for (const entry of plan.slice(0, 3)) {
      console.log(
        '  ' +
          JSON.stringify(
            formatEntryForWire({ ...entry, journalId: JOURNAL_ID_OVERRIDE || '<resolved-journal-id>' })
          )
      );
    }
    console.log('\nDry run: the plan checks out. Nothing was sent.');
    return;
  }

  if (!TOKEN) {
    console.error('FOOTPRINT_TOKEN is not set.\n');
    console.error(usage());
    process.exit(1);
  }

  console.log(`Seeding against ${API} ...`);
  const journalId = await resolveJournalId();
  console.log(`  journal: ${journalId}`);

  const result = await sendBatch(plan, journalId);
  const created = result.created || [];
  const conflicts = result.conflicts || [];
  const unresolvedAudience = result.unresolvedAudience || [];

  console.log(`  created: ${created.length}`);
  if (conflicts.length > 0) {
    console.error(`  conflicts: ${conflicts.length}`);
    for (const c of conflicts.slice(0, 10)) {
      console.error(`    ${c.clientId}: ${c.reason}`);
    }
  }
  if (unresolvedAudience.length > 0) {
    // Should not happen for visibility: 'private' (see the header comment), so a non-empty
    // list here means something about this account's account/journal is not what was assumed.
    console.error(`  unresolvedAudience: ${unresolvedAudience.length} -- unexpected for 'private'`);
  }

  console.log(
    `\nDone. ${created.length} of ${plan.length} created` +
      (conflicts.length ? `, ${conflicts.length} conflicts` : '') +
      '.'
  );
  console.log('Open the app (or pull-to-refresh the Journal) so the next sync pulls these in.');

  process.exit(conflicts.length > 0 || unresolvedAudience.length > 0 ? 1 : 0);
}

// Only run when invoked as a script (`node scripts/seed-calendar-month.mjs`), not when
// another module imports its pure pieces (`planCalendarMonth`, `checkPlan`) -- which is what
// lets those be exercised without also running `main()`'s network and `process.exit` calls.
// `pathToFileURL` (not a hand-built `file://` string) is what makes this agree with
// `import.meta.url` on Windows, where a bare path needs a third slash and backslashes turned
// around to compare equal at all.
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((err) => {
    console.error('Seed failed:', err.message);
    // Whatever got through before the failure is not a problem to clean up: a repeated
    // clientId is an idempotent no-op per account (see the header comment), so running the
    // same command again tops up rather than duplicating anything already created.
    console.error('It is safe to run this command again -- already-created memories will not');
    console.error('be duplicated (each one\'s clientId is a no-op on a repeat).');
    process.exit(1);
  });
}
