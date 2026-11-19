/**
 * ComingUpCard -- Home's "Coming up" card (FR-034, research R11, SC-009).
 *
 * Sits after the Events quick action on Home (`HomeScreen.js`), fed by `useUpcomingEvents`.
 * Shows the next one or two upcoming events (soonest first, a date tile, title and place per
 * row) with a "See all ›" link; tapping the card or "See all ›" is the same action -- both call
 * `onPress`, which `HomeScreen` wires to `navigate('Timeline', { view: 'events' })`. This
 * component does not navigate itself and knows nothing about React Navigation, so it stays
 * testable on its own and HomeScreen keeps ownership of where "See all" actually goes.
 *
 * Three states, matching the spec's own Edge Case distinction between "no events" and "could
 * not ask":
 *  - **no error, no upcoming events**: renders nothing (`null`) -- there is nothing to show and
 *    nothing to say.
 *  - **error**: a quiet "Couldn't load upcoming events" line, instead of disappearing as if
 *    there were none.
 *  - **events**: the card, with up to the first two of `upcoming` (the caller -- today,
 *    `useUpcomingEvents` -- is responsible for the ascending, soonest-first order).
 *
 * `error` takes precedence over `upcoming`: `useUpcomingEvents` fails closed (an error always
 * comes with empty lists), so the two are never both meaningful at once in practice, but the
 * precedence is still fixed here rather than left to whichever branch happens to run first.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const PRIMARY_COLOR = '#4361ee';

const MONTH_ABBREVIATIONS = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

const CIVIL_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * civil `YYYY-MM-DD` -> `{ month, day }` for the date tile, read directly off the string's own
 * digits -- never through `Date` (constitution: a civil date is a day, not an instant; parsing
 * one through `Date` reads it as UTC midnight, which can print the wrong day in some zones). A
 * date that is not a well-formed civil date (the contract says this cannot happen, but
 * `useUpcomingEvents` fails open rather than dropping a malformed-dated event) renders a blank
 * tile rather than throwing.
 */
function dateTileParts(date) {
  const match = CIVIL_DATE.exec(date || '');
  if (!match) return { month: '', day: '' };
  const monthIndex = Number(match[2]) - 1;
  return { month: MONTH_ABBREVIATIONS[monthIndex] || '', day: match[3] };
}

function ComingUpRow({ event }) {
  const { month, day } = dateTileParts(event.date);
  return (
    <View style={styles.row}>
      <View style={styles.dateTile}>
        <Text style={styles.dateTileMonth}>{month}</Text>
        <Text style={styles.dateTileDay}>{day}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {event.title || 'Untitled event'}
        </Text>
        {!!event.location?.name && (
          <Text style={styles.rowPlace} numberOfLines={1}>
            {event.location.name}
          </Text>
        )}
      </View>
    </View>
  );
}

export default function ComingUpCard({ upcoming, error, onPress }) {
  if (error) {
    return (
      <View style={styles.card}>
        <Text style={styles.errorText}>Couldn't load upcoming events</Text>
      </View>
    );
  }

  const events = (upcoming || []).slice(0, 2);
  if (events.length === 0) return null;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.9}>
      <View style={styles.header}>
        <Text style={styles.heading}>Coming up</Text>
        <TouchableOpacity onPress={onPress} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.seeAll}>See all ›</Text>
        </TouchableOpacity>
      </View>
      {events.map((event) => (
        <ComingUpRow key={event.id} event={event} />
      ))}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  seeAll: {
    fontSize: 13,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  dateTile: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#eef1ff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  dateTileMonth: {
    fontSize: 10,
    fontWeight: '700',
    color: PRIMARY_COLOR,
    letterSpacing: 0.4,
  },
  dateTileDay: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  rowBody: {
    flex: 1,
  },
  rowTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1e293b',
  },
  rowPlace: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 1,
  },
  errorText: {
    fontSize: 13,
    color: '#64748b',
    textAlign: 'center',
  },
});
