/**
 * JournalDateBar -- the ◄ period ► bar shared by the Family and Friends calendar screens (019
 * research R9, FR-007, FR-013, FR-014).
 *
 * A copy of the Journal tab's private `DateSelector` (`src/screens/JournalScreen.js` L355-433,
 * on `release/1.0`), with the same props and the same accessibility. **The duplicate is
 * deliberate and accepted**: the design says the Journal tab is not touched, and 016's tests pin
 * `DateSelector`'s own behaviour, so `JournalScreen.js` keeps its copy and this is a second,
 * separate home for the two new screens. A later clean-up may fold them back together.
 *
 * In day mode (`label` absent) the bar words `date` itself, as "Thu, Mar 5"; given `label`, it
 * shows that instead, with `count`'s words underneath (`memoriesLabel`, the one home of that
 * wording, shared with `CalendarListHeading`). `count` is three-valued: `null`/`undefined` means
 * nobody has read the period's count yet, and nothing is said then -- a `0` would claim a period
 * is empty when it is only unread, which is the mistake the list's own empty state guards
 * against. `periodKind` ('day', 'month' or 'year') names what ◄ ► would step to -- the one fact
 * this component cannot work out for itself, since it is told the *current* period's words and
 * never the neighbour it would land on. `hasPrevious` / `hasNext` double as
 * `accessibilityState.disabled`, so a screen reader and a swipe cannot disagree about which end
 * of the book has been reached (FR-014).
 *
 * **One deliberate difference from `DateSelector` (FR-013, research R9):** `DateSelector` reads
 * `date` with `new Date(date)`, which parses a bare `'YYYY-MM-DD'` key as UTC midnight and shows
 * the day before anywhere west of Greenwich. `date` here is that same kind of day key, but it is
 * worded through `parseDateKey` (`src/utils/journalDate.js`), which builds a *local* calendar day
 * from the key's own year/month/day parts -- never through an instant a time zone could move.
 */

import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { parseDateKey } from '../../utils/journalDate';
import { memoriesLabel } from './CalendarListHeading';

export const JournalDateBar = ({
  date,
  label = null,
  count = null,
  periodKind = 'day',
  hasPrevious = true,
  hasNext = true,
  onPrevious,
  onNext,
  onDatePress,
}) => {
  const formattedDate = useMemo(() => {
    const d = parseDateKey(date);
    if (!d) return '';
    return d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  }, [date]);

  // `memoriesLabel` answers '' for a count there is not one of, which is how "say nothing" and
  // "say 0 memories" stay two different outcomes.
  const counted = label ? memoriesLabel(count) : '';
  const periodWords = label || formattedDate;
  // One label for the two `Text`s below, so a screen reader reads the period and its count as
  // one thing rather than two unrelated fragments -- `memoriesLabel` stays the one home of the
  // count's own words.
  const periodAccessibilityLabel = counted ? `${periodWords}, ${counted}` : periodWords;

  return (
    <View style={styles.dateSelector}>
      {/*
        ⚠ The two arrows are named, as `DateSelector`'s are: a year list draws a
        `chevron-forward` of its own on every closed month heading, so "the one button on screen
        with a forward chevron in it" is not this bar's ►, and a test that pressed the wrong one
        would browse somebody's months while believing it had moved the day.
      */}
      <TouchableOpacity
        testID="date-bar-previous"
        style={styles.dateArrow}
        onPress={onPrevious}
        accessibilityRole="button"
        accessibilityLabel={`Previous ${periodKind}`}
        accessibilityState={{ disabled: !hasPrevious }}
      >
        <Ionicons name="chevron-back" size={20} color="#666" />
      </TouchableOpacity>
      <TouchableOpacity
        testID="date-bar-period"
        onPress={onDatePress}
        accessibilityRole="button"
        accessibilityLabel={periodAccessibilityLabel}
      >
        <Text style={styles.dateText}>{label || formattedDate}</Text>
        {counted ? <Text style={styles.dateCount}>{counted}</Text> : null}
      </TouchableOpacity>
      <TouchableOpacity
        testID="date-bar-next"
        style={styles.dateArrow}
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel={`Next ${periodKind}`}
        accessibilityState={{ disabled: !hasNext }}
      >
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  dateSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 16,
  },
  dateArrow: {
    padding: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  // FR-007's count, under the period it is a count of, and quieter than it.
  dateCount: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
  },
});

export default JournalDateBar;
