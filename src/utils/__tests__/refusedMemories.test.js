/**
 * The translation from the server's words to a person's.
 *
 * Every reason string below was read out of the backend rather than invented, because a
 * mapping tested against strings this app made up would prove nothing about the strings it
 * will actually receive:
 *
 *   footprint-backend/Footprint.Hub/src/Footprint.Hub.Api/Controllers/V1/JournalsController.cs
 *     BatchSync()          -- the SyncConflict sites: "Entry not found",
 *                             "Not authorized to update this entry",
 *                             "Not authorized to delete this entry"
 *     ValidateEntryDate()  -- "An entry needs a date. The 'date' field was missing or empty."
 *     ValidateVisibility() -- "Invalid visibility '<x>'. Allowed: <list>." (interpolated),
 *                             "Custom visibility requires a non-empty sharedWith list."
 *
 * The last one matters most for the unmapped case: the server is free to add a reason
 * without this app shipping, and an unrecognised reason must still produce an honest
 * sentence rather than a blank line, the word `undefined`, or raw engineer text.
 */

import {
  plainRefusalReason,
  describeRefusedMemory,
  refusedMemoriesFrom,
  GENERIC_REFUSAL,
} from '../refusedMemories';

/** Build a settled queue row the way `SyncQueue._formatOperation` returns one. */
const refusedOperation = ({
  id = 'sync_1',
  type = 'update_entry',
  entityId = 'local-1',
  serverId = 'srv-1',
  data = {},
  reason = 'Entry not found',
} = {}) => ({
  id,
  type,
  entityId,
  serverId,
  data,
  status: 'conflict',
  conflictData: { reason, serverId, clientId: entityId, refusedAt: '2026-10-17T10:00:00Z' },
});

describe('translating what the server said', () => {
  // The common case, and the one whose server text misleads worst: "Entry not found" reads
  // to a person as though the app lost their memory. It did not -- the memory was deleted
  // somewhere else, so the edit has nowhere to land.
  it('explains a memory deleted on another device', () => {
    expect(plainRefusalReason('Entry not found')).toBe(
      'This memory was deleted on another device, so your change could not be saved.'
    );
  });

  it('explains a memory belonging to a different account', () => {
    expect(plainRefusalReason('Not authorized to update this entry')).toBe(
      'This memory belongs to a different account, so your change could not be saved.'
    );
    expect(plainRefusalReason('Not authorized to delete this entry')).toBe(
      'This memory belongs to a different account, so it could not be deleted.'
    );
  });

  it('explains a missing date', () => {
    expect(
      plainRefusalReason("An entry needs a date. The 'date' field was missing or empty.")
    ).toBe('This memory has no date, so it could not be saved.');
  });

  it('explains a custom audience with nobody in it', () => {
    expect(plainRefusalReason('Custom visibility requires a non-empty sharedWith list.')).toBe(
      'This memory is set to be shared with chosen people, but nobody was chosen, so it could not be saved.'
    );
  });

  // Interpolated server-side -- `$"Invalid visibility '{visibility}'. Allowed: {...}."` --
  // so the whole string cannot be a lookup key and the allowed-values list must not leak
  // through to the person.
  it('explains an unrecognised privacy setting, whatever value it carried', () => {
    const expected =
      'This memory’s privacy setting was not one the server recognised, so it could not be saved.';

    expect(
      plainRefusalReason("Invalid visibility 'frends'. Allowed: private, family, friends, everyone, custom.")
    ).toBe(expected);
    expect(plainRefusalReason("Invalid visibility ''. Allowed: private, custom.")).toBe(expected);
  });

  it('explains a refusal that came with no reason at all', () => {
    // ConflictResolver.processServerConflicts' own placeholder.
    expect(plainRefusalReason('The server refused this change without saying why')).toBe(
      'The server would not save this memory and did not say why.'
    );
  });
});

describe('a reason this app has never seen', () => {
  // The server can add a reason at any time. Whatever it adds, the person must get a
  // sentence -- not a blank line, not `undefined`, and not the server's own text.
  const unknown = 'Entry exceeds the per-journal quota of 10000 entries';

  it('still says something honest', () => {
    const why = plainRefusalReason(unknown);

    expect(why).toBe(GENERIC_REFUSAL);
    expect(why.length).toBeGreaterThan(20);
    expect(why).toMatch(/could not be saved/);
  });

  it('does not show the raw server text', () => {
    expect(plainRefusalReason(unknown)).not.toContain('quota');
    expect(plainRefusalReason(unknown)).not.toContain(unknown);
  });

  it('never returns blank or undefined, for any input at all', () => {
    // Each of these has a route into `conflict_data.reason`: a contract change dropping the
    // field, a null in the JSON, an empty string from a server-side interpolation.
    for (const input of [undefined, null, '', '   ', 0, false, {}, [], NaN]) {
      const why = plainRefusalReason(input);

      expect(typeof why).toBe('string');
      expect(why.trim()).not.toBe('');
      expect(why).not.toContain('undefined');
      expect(why).toBe(GENERIC_REFUSAL);
    }
  });
});

describe('naming the memory so a person knows which one', () => {
  it('uses the memory’s own words', () => {
    const described = describeRefusedMemory(
      refusedOperation({
        data: {
          contentBlocks: [{ type: 'text', content: 'the kitchen in the old house', order: 0 }],
        },
      })
    );

    expect(described.title).toBe('the kitchen in the old house');
  });

  it('skips a photo block to reach the words underneath it', () => {
    const described = describeRefusedMemory(
      refusedOperation({
        data: {
          contentBlocks: [
            { type: 'photos', media: [{ localPath: 'a.jpg' }] },
            { type: 'text', content: 'Dad on the back step', order: 1 },
          ],
        },
      })
    );

    expect(described.title).toBe('Dad on the back step');
  });

  it('cuts a long note down to one line, keeping enough to recognise it', () => {
    const described = describeRefusedMemory(
      refusedOperation({
        data: {
          contentBlocks: [
            {
              type: 'text',
              content:
                'We drove up to the lake before sunrise and the mist was still sitting on the water when we arrived',
            },
          ],
        },
      })
    );

    expect(described.title.length).toBeLessThanOrEqual(61);
    expect(described.title).toMatch(/^We drove up to the lake before sunrise/);
    expect(described.title).toMatch(/…$/);
  });

  it('falls back to where it was when there are no words', () => {
    const described = describeRefusedMemory(
      refusedOperation({
        data: {
          contentBlocks: [{ type: 'photos', media: [{ localPath: 'a.jpg' }] }],
          location: { lat: 52.48, lng: -1.9, name: 'Cannon Hill Park' },
        },
      })
    );

    expect(described.title).toBe('Cannon Hill Park');
  });

  it('falls back to what it is made of when there are no words and no place', () => {
    const one = describeRefusedMemory(
      refusedOperation({ data: { contentBlocks: [{ type: 'photos', media: [{ localPath: 'a.jpg' }] }] } })
    );
    expect(one.title).toBe('A memory with one photo');

    const several = describeRefusedMemory(
      refusedOperation({
        data: {
          contentBlocks: [
            { type: 'photos', media: [{ localPath: 'a.jpg' }, { localPath: 'b.jpg' }] },
            { type: 'photos', media: [{ localPath: 'c.jpg' }] },
          ],
        },
      })
    );
    expect(several.title).toBe('A memory with 3 photos');
  });

  // The honest gap. `JournalRepository.delete` queues only `{ local_id }`, so a refused
  // delete has no text, no place, no photos and no date to show. It must not print an id
  // at a person, and it must not claim to name something it cannot.
  it('says plainly that it cannot name a refused delete', () => {
    const described = describeRefusedMemory(
      refusedOperation({
        type: 'delete_entry',
        data: { local_id: 'local-9' },
        reason: 'Not authorized to delete this entry',
      })
    );

    expect(described.title).toBe('A memory you deleted on this phone');
    expect(described.title).not.toContain('local-9');
    expect(described.day).toBeNull();
    expect(described.why).toBe(
      'This memory belongs to a different account, so it could not be deleted.'
    );
  });

  it('keeps the memory’s own day as a day, not an instant', () => {
    // A civil date is a day. `new Date('1978-06-04')` is UTC midnight and renders as
    // 3 June for anybody west of Greenwich -- a bug this project has already shipped once.
    const described = describeRefusedMemory(refusedOperation({ data: { date: '1978-06-04' } }));

    expect(described.day).toContain('1978');
    expect(described.day).toMatch(/4/);
    expect(described.day).not.toMatch(/\b3\b/);
  });

  it('ties the notice back to the memory it belongs to', () => {
    const described = describeRefusedMemory(
      refusedOperation({ id: 'sync_42', entityId: 'local-42', serverId: 'srv-42' })
    );

    expect(described.operationId).toBe('sync_42');
    expect(described.localId).toBe('local-42');
    expect(described.serverId).toBe('srv-42');
  });
});

describe('nothing refused', () => {
  // The whole point of the notice is that it appears when something is wrong. A notice that
  // renders for an empty list is a phantom warning, which is its own version of lying about
  // the sync state.
  it('describes nothing, so nothing is shown', () => {
    expect(refusedMemoriesFrom([])).toEqual([]);
    expect(refusedMemoriesFrom()).toEqual([]);
    expect(refusedMemoriesFrom(undefined)).toEqual([]);
    expect(refusedMemoriesFrom(null)).toEqual([]);
  });

  it('describes one entry per refusal and no more', () => {
    const described = refusedMemoriesFrom([
      refusedOperation({ id: 'sync_1', entityId: 'local-1' }),
      refusedOperation({ id: 'sync_2', entityId: 'local-2' }),
    ]);

    expect(described).toHaveLength(2);
    expect(described.map((m) => m.operationId)).toEqual(['sync_1', 'sync_2']);
  });
});
