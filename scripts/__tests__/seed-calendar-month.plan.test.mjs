// 016 whole-branch review, item 2 -- `--undo`'s id derivation, tested before it is wired up.
//
// `seed-calendar-month.mjs` is a plain Node ESM script, not transformed by Jest (jest's own
// default `transform` matches `\.[jt]sx?$`, which a bare `.mjs` file does not, and this repo's
// other `.mjs` tool -- `scripts/test-tz.mjs` -- is likewise run by hand, with `node`, not by
// jest; see T010's ledger entry: "the pure planning layer was exercised by hand"). So this test
// runs on Node's own built-in runner, the same way: `node --test scripts/__tests__/*.mjs`.
//
// What this file pins, ahead of `--undo` existing: the server's delete contract takes a
// *server* id, never a `clientId` (`BatchSyncRequest.Deletes` is `List<string>`, resolved with
// `journalEntryRepository.GetByIdAsync`, read off `footprint-backend`'s own DTOs and
// controller -- see the script's header for the exact files). So `--undo` cannot derive what to
// delete in one step the way `--dry-run`'s plan does; what it CAN derive purely, with no
// network, is the exact set of `clientId`s the original seed used for a given `{year, month,
// count}` -- and that set is what makes the two-call resolve-then-delete safe: the first call
// is idempotent against exactly those ids and can only ever touch an entry that carries one of
// them, which nothing but this script's own deterministic scheme would ever produce.

import test from 'node:test';
import assert from 'node:assert/strict';

import { planCalendarMonth, clientIdFor, planUndo } from '../seed-calendar-month.mjs';

test('clientIdFor is deterministic and keyed by date + position in that day', () => {
  const a = clientIdFor({ date: '2026-03-05', ordinalInDay: 1 });
  const b = clientIdFor({ date: '2026-03-05', ordinalInDay: 1 });
  assert.equal(a, b);
  assert.notEqual(a, clientIdFor({ date: '2026-03-05', ordinalInDay: 2 }));
  assert.notEqual(a, clientIdFor({ date: '2026-03-06', ordinalInDay: 1 }));
});

test('planUndo({year, month, count}) names exactly the clientIds planCalendarMonth would create for the same arguments', () => {
  const args = { year: 2026, month: 3, count: 37 };
  const plan = planCalendarMonth(args);
  const expectedIds = plan.map((entry) => clientIdFor(entry));

  const undoIds = planUndo(args);

  assert.deepEqual(undoIds, expectedIds);
  assert.equal(undoIds.length, plan.length);
});

test('planUndo never produces an id outside the one month/count it was asked about', () => {
  const marchIds = new Set(planUndo({ year: 2026, month: 3, count: 50 }));
  const aprilIds = new Set(planUndo({ year: 2026, month: 4, count: 50 }));
  const smallerMarchIds = new Set(planUndo({ year: 2026, month: 3, count: 10 }));

  // No id generated for one month ever names a day in another month.
  for (const id of marchIds) assert.ok(!aprilIds.has(id));

  // A smaller --count for the same month is a strict subset -- it can only ever ask to delete
  // entries a matching (or larger) seed run would itself have created, never something an
  // unrelated or wildcard match could have reached.
  for (const id of smallerMarchIds) assert.ok(marchIds.has(id));
});

test('planUndo has no duplicate ids -- one clientId per planned entry, every time', () => {
  const ids = planUndo({ year: 2026, month: 1, count: 300 });
  assert.equal(new Set(ids).size, ids.length);
});

test('planUndo({count: 0}) is empty -- nothing to resolve or delete', () => {
  assert.deepEqual(planUndo({ year: 2026, month: 6, count: 0 }), []);
});
