/**
 * What a memory says when the server could not apply the audience the person chose
 * (FR-011, SC-010, research R15).
 *
 * `entry.shareState` -- the `share_state` column, the only record of what the server last said
 * about a memory's audience -- holds nothing else: `waiting` while the phone is still going to
 * send the memory, `refused` once it never will.
 *
 * Here rather than inside `JournalEntryCard` because two surfaces read the same column and must
 * say the same thing about it: the card in the Journal list, and `JournalEntryDetail`, which is
 * what opens when the person taps that card. One copy of the words, so the two cannot drift
 * apart and leave a card reading "Not shared yet" opening a screen reading "Family" (round-1
 * finding 3). A module of its own, and not an export from the card, so that a screen can read
 * these two strings without pulling a card -- and everything a card renders -- in behind them.
 */

import { ShareState } from '../../database/schema';

/** The line under the header, in the two states the server can produce. */
export const SHARE_LINES = {
  [ShareState.WAITING]: 'Waiting to share…',
  [ShareState.REFUSED]: 'Not shared — tap to choose who can see it',
};

/**
 * What stands where the audience label would be, in both states (SC-010).
 *
 * ⚠ The label is what makes a memory *look* shared, so it is replaced whenever the server has
 * said **anything** about the audience -- not only for the two states above. A card or a screen
 * reading "Family" over a memory that is on nobody else's screen is the "appears as shared"
 * half of SC-010, and sharing fails closed: saying less than the truth is safe here, saying
 * more is not.
 */
export const NOT_SHARED_YET = 'Not shared yet';
