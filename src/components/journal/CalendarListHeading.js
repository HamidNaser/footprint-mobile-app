/**
 * CalendarListHeading -- the two heading rows of a month or a year list (016 FR-005, FR-006).
 *
 * A month or a year is the Journal's own feed with headings threaded through it: the same
 * `ViewportFlatList`, the same unchanged `JournalEntryCard`, and rows of three kinds built by
 * `calendarModel.buildRows` (research R8). This file draws the two that are not memories.
 *
 *   `dayHeading`    FR-005's **small grey heading**, one per day with memories ("Thu 5 March"),
 *                   and the one a month's month-only memories sit under ("March 2026").
 *   `monthHeading`  FR-006's heading for a month of a year ("March 2026", with its count),
 *                   which a year list pins and which opens and closes on a tap.
 *
 * ## What it deliberately does not do
 *
 * **It never draws a memory, and it never wraps one.** FR-009 is the feature's governing rule --
 * *"we should not change how journal entries are shown"* -- so a heading is a sibling of the
 * cards in one flat list and never a container around them. That is also what keeps a year's
 * cards at full width (FR-006) rather than boxed inside a section.
 *
 * **It parses no date.** Every label arrives already worded, from `calendarModel`, which is the
 * one place in this feature that turns a civil date into words -- so "Thu 5 March" is decided by
 * the same module that decides which day a memory is on, and there is no second wording to keep
 * in step. Nothing here reads a date string at all, which is why there is nothing here for a
 * time zone to move. `calendarModel.test.js`'s civil-date guard reads this file to keep it so.
 *
 * **It owns no state.** Whether a month is open belongs to the screen (`openMonths` in
 * `data-model.md`); this component is told, and reports a tap.
 *
 * **It measures nothing, and reports its own height when asked.** `onLayout` is handed to the
 * **month** heading's own row, because in a year that row is pinned (`stickyHeaderIndices`,
 * research R8) and the screen needs its real height: a card's map pin is brought into view with
 * `scrollToIndex`'s `viewOffset`, which puts the piece at the very top of the list -- which in a
 * year is exactly where this heading sits, so without that height the piece lands *under* it
 * (FR-017, analyze round 3's C1). A **day** heading is never pinned and so is never measured: its
 * height is not the gap anything has to clear, and handing it over would be the wrong number.
 *
 * **A heading it does not recognise draws nothing** -- not an empty grey bar in the middle of
 * somebody's memories, which reads as a defect. `buildRows` emits only the two kinds above, so
 * anything else is a row this file does not understand, and drawing a blank one would be
 * guessing. A label of nothing but spaces is the same answer, for the same reason.
 *
 * Accessibility labels and roles are T009's, deliberately written last so they cover the finished
 * lists. Two things here are already for their benefit: the month heading is a real
 * `TouchableOpacity` when it has somewhere to report a tap (so a role and an `expanded` state
 * have something to sit on), and no label sets `numberOfLines`, so nothing can be cut off at the
 * largest text size.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/** The Journal feed's own background, so a pinned month heading is opaque over it. */
const FEED_BACKGROUND = '#F0F4FF';

/** The grey FR-005 asks for: the iOS secondary label, as the rest of this app's captions use. */
const HEADING_GREY = '#8E8E93';

const INK = '#333';

/** The card's own horizontal padding, so a heading's words line up with the words under them. */
const CARD_PADDING = 16;

/**
 * How many memories a period holds, in words: "1 memory", "4 memories".
 *
 * **One home for them.** The month heading says them, the Journal's date bar says them about the
 * same period in month and year mode (FR-007: *"the date bar MUST name the period and its
 * count"*), and T009's spoken label says them a third time ("March 2026, 4 memories"). Two
 * copies would be two things to keep in step, and the one that drifted would be the one read
 * aloud to somebody who cannot see the other.
 *
 * **Nothing at all for a count that is not one.** A period whose memories have not been read yet
 * has no count to give, and the honest answer there is silence: *"undefined memories"* over
 * somebody's journal, or a `0` that claims a period is empty when nobody has looked, would both
 * be the screen asserting something it does not know. The three-valued read in `JournalScreen`
 * is the other half of this -- it hands over `null` until there is an answer.
 */
export function memoriesLabel(count) {
  if (!Number.isInteger(count) || count < 0) return '';
  return count === 1 ? '1 memory' : `${count} memories`;
}

/** Whether a label is a label, rather than absent or a run of spaces. */
const worded = (label) => typeof label === 'string' && label.trim().length > 0;

export const CalendarListHeading = ({
  kind,
  label,
  count,
  open = false,
  onPress = null,
  onLayout = null,
}) => {
  if (!worded(label)) return null;

  if (kind === 'dayHeading') {
    // Text and nothing else: it opens nothing, so it is not a control. A row that lights up
    // under a finger and then does nothing is worse than a row that plainly does not. FR-014
    // reads it as a `header`, named by the very words it already draws -- there is no second
    // wording to invent, because `calendarModel` is the one place that turns a civil date into
    // words, and this component parses none.
    return (
      <View style={styles.dayRow} accessibilityRole="header" accessibilityLabel={label}>
        <Text style={styles.dayLabel}>{label}</Text>
      </View>
    );
  }

  if (kind !== 'monthHeading') return null;

  const words = memoriesLabel(count);
  const body = (
    <>
      <Ionicons
        name={open ? 'chevron-down' : 'chevron-forward'}
        size={16}
        color={HEADING_GREY}
      />
      <Text style={styles.monthLabel}>{label}</Text>
      {words ? <Text style={styles.monthCount}>{words}</Text> : null}
    </>
  );

  // T009, FR-014: "March 2026, 4 memories, open" -- the month, its count when it has one, and
  // whether it is open or closed, said in words. FR-014 ties `button` to "a tile or a heading
  // that opens" and `header` to a heading -- so the role itself answers whether this one does:
  // `button` plus `accessibilityState.expanded` (the doubled signal FR-014's own example gives)
  // when something is listening for a tap, `header` and no `expanded` state when nothing is,
  // because a heading that cannot be opened is not the control FR-014 means by `button`. A
  // heading given no count says nothing about one, the same silence `memoriesLabel` already
  // keeps for a period nobody has read yet.
  const spokenLabel = [label, words, open ? 'open' : 'closed'].filter(worded).join(', ');

  // Nothing listening means nothing to open: a heading that dimmed under a tap and then left the
  // month exactly as it was would be offering something it cannot do. It still says what it is,
  // though -- FR-014 asks that of every month heading, tappable or not -- just as a `header`
  // rather than as a `button` it is not.
  if (typeof onPress !== 'function') {
    return (
      <View
        style={styles.monthRow}
        onLayout={onLayout}
        accessibilityRole="header"
        accessibilityLabel={spokenLabel}
      >
        {body}
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.monthRow}
      onPress={onPress}
      onLayout={onLayout}
      accessibilityRole="button"
      accessibilityLabel={spokenLabel}
      accessibilityState={{ expanded: open }}
    >
      {body}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  // Small, grey and tight to the card below it, so it reads as a label on that day's memories
  // rather than as a memory of its own.
  dayRow: {
    paddingHorizontal: CARD_PADDING,
    paddingTop: 14,
    paddingBottom: 6,
  },
  dayLabel: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.3,
    color: HEADING_GREY,
  },

  // Opaque, and that is load-bearing: in a year list only the month heading rows are sticky
  // (research R8), so this one has a month's cards sliding underneath it. A transparent heading
  // would have them legible through the words naming them.
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: CARD_PADDING,
    paddingVertical: 10,
    backgroundColor: FEED_BACKGROUND,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#DCE4F7',
  },
  monthLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: INK,
  },
  monthCount: {
    fontSize: 12,
    color: HEADING_GREY,
  },
});

export default CalendarListHeading;
