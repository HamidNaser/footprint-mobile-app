import React, { memo } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import Avatar from './Avatar';
import { rosterForDay, rosterCaption } from '../utils/dayRoster';

/**
 * Who this day is showing entries for, and who had nothing to show.
 *
 * Sits above the list. Every member of the group appears, always, in a fixed order — head,
 * spouse, then children. Whoever recorded something on the day is drawn normally; everyone
 * else is dimmed and still present.
 *
 * That second half is the reason this exists. The summary merges the household's entries
 * and groups them by day, so a day holding one entry from one child looked like a broken
 * screen rather than a quiet day. Four dimmed faces say what the list could not.
 *
 * The caption says it in words as well, because the dimming only reads as meaningful once
 * somebody already knows what it means — and the confusion it answers happens on the first
 * encounter, not the tenth.
 *
 * Used above the family summary and above a friends group's journal, exactly as its web
 * counterpart is. A group of friends has no head or spouse, so the ordering falls through
 * to the order the group lists its members.
 */
const DayRoster = memo(({ sections, day, dateText, onJumpToEntry }) => {
  const roster = rosterForDay(sections, day);
  if (roster.length === 0) return null;

  const caption = rosterCaption(roster, dateText);

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.faces}
      >
        {roster.map((person) => {
          const recorded = person.count > 0;

          return (
            <TouchableOpacity
              key={person.memberId}
              style={[styles.person, !recorded && styles.personQuiet]}
              // Only somebody with an entry has anywhere to be carried to. The rest stay
              // present and unpressable rather than being removed.
              disabled={!recorded}
              onPress={() => recorded && onJumpToEntry?.(person.entryIds[0], person)}
              accessibilityRole={recorded ? 'button' : 'text'}
              accessibilityLabel={
                recorded
                  ? `${person.name}, ${person.count} ${person.count === 1 ? 'entry' : 'entries'}`
                  : `${person.name}, nothing recorded`
              }
            >
              <Avatar src={person.avatar} name={person.name} size={40} />
              <Text style={styles.name} numberOfLines={1}>
                {(person.name || '').split(' ')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
});

DayRoster.displayName = 'DayRoster';

const styles = StyleSheet.create({
  container: {
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ece7e0',
  },
  faces: {
    paddingHorizontal: 16,
    gap: 14,
  },
  person: {
    alignItems: 'center',
    width: 52,
  },
  // Dimmed, not removed: the whole point is that they are still in scope.
  personQuiet: {
    opacity: 0.35,
  },
  name: {
    marginTop: 4,
    fontSize: 11,
    color: '#6b635a',
  },
  caption: {
    marginTop: 10,
    paddingHorizontal: 16,
    fontSize: 12,
    color: '#8a8179',
  },
});

export default DayRoster;
