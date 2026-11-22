/**
 * FacesRow -- the row of faces directly under the date bar on a group book (019 research R8,
 * data-model *Derived on the phone, per render* > Present ids, FR-010, FR-016).
 *
 * On the family-unit book, a household opened from the family tree's top card, and a friend
 * group's book, **every** person the book covers appears here once, in the given order, as the
 * page's second row -- the date bar is the first. Tapping a face reports it through `onToggle`;
 * this component does not decide what choosing does (add the id, empty the list, re-fetch
 * anything) -- that wiring is a screen/hook's job (T013), done above it. It is only ever handed
 * `people`, `presentIds` and `chosenIds`, and draws exactly those.
 *
 * ## Dimming (FR-010) -- the one subtlety
 *
 * `presentIds` is a `Set` of ids with at least one memory in the shown period, or `null` while
 * that period is loading or failed to load. A face is dimmed when `presentIds` is a `Set` that
 * does not contain its id -- **and it stays tappable even then**: FR-016's choosing does not care
 * whether a person has anything to show, only whether the reader wants to filter to them. With
 * `presentIds === null`, nothing is dimmed, deliberately: dimming then would draw "could not
 * load" as "nobody recorded anything", which is exactly the failure FR-010 exists to rule out.
 *
 * ## The label (prototype; task brief)
 *
 * "Showing everyone · tap a face to choose" with nobody chosen, or "Showing <names>" with a
 * "Show everyone" action once something is -- both wordings are the brief's own. The join for
 * three or more names ("A, B and C") is this file's own reasonable choice; the brief only pins
 * the two- and zero-chosen cases.
 *
 * ## This is a new component, not a change to `DayRoster` (R8)
 *
 * `DayRoster` (`src/components/DayRoster.js`) disables a face with nothing that day, has no
 * "chosen" state, includes members without an account, and matches on `memberId` only -- FR-010
 * and FR-016 need the opposite on each point. `DayRoster`'s own fate is a later task's (R11).
 */

import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import Avatar from '../Avatar';

// The app's own established accent (`PRIMARY_COLOR` in FriendsScreen.js, FamilyScreen.js,
// JournalScreen.js and others) -- reused here, not copied from the prototype's palette.
const PRIMARY_COLOR = '#4361ee';

/** "Huda", "Huda and Sami", "Huda, Sami and Lina" -- the reader's own name joined with "and". */
function joinNames(names) {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export const FacesRow = ({
  people,
  presentIds = null,
  chosenIds = [],
  onToggle,
  onShowEveryone,
}) => {
  const chosenSet = useMemo(() => new Set(chosenIds), [chosenIds]);

  const chosenNames = useMemo(
    () => (people || []).filter((p) => chosenSet.has(p.id)).map((p) => p.name),
    [people, chosenSet],
  );

  if (!people || people.length === 0) return null;

  const label =
    chosenNames.length > 0
      ? `Showing ${joinNames(chosenNames)}`
      : 'Showing everyone · tap a face to choose';

  return (
    <View style={styles.container}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {chosenNames.length > 0 ? (
          <TouchableOpacity
            testID="faces-row-show-everyone"
            onPress={onShowEveryone}
            accessibilityRole="button"
            accessibilityLabel="Show everyone"
          >
            <Text style={styles.showEveryone}>Show everyone</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        {people.map((person, index) => {
          const chosen = chosenSet.has(person.id);
          // `presentIds === null` means "not known yet" (loading or failed) -- never dimmed.
          const dimmed = presentIds !== null && !presentIds.has(person.id);

          const faceLabel = [
            person.name,
            chosen ? 'chosen' : null,
            dimmed ? 'nothing in this period' : null,
          ]
            .filter(Boolean)
            .join(', ');

          return (
            <TouchableOpacity
              // De-duplicating a repeated id (two family-tree nodes linked to one account) is a
              // later task's job (research R8/data-model, T010/T011) -- this component is only
              // ever handed what it is given, repeats included, so the key cannot assume `id` is
              // unique. `person.id` alone collided on a repeat (React's own "two children with
              // the same key" warning, unsupported reconciliation), which the index rules out.
              key={`${person.id}-${index}`}
              testID={`faces-row-face-${person.id}`}
              style={styles.face}
              onPress={() => onToggle?.(person.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              accessibilityLabel={faceLabel}
            >
              <View
                style={[
                  styles.avatarWrap,
                  chosen && styles.avatarWrapChosen,
                  dimmed && styles.avatarWrapDimmed,
                ]}
              >
                <Avatar src={person.avatarUrl} name={person.name} size={46} />
                {chosen ? (
                  <View style={styles.tick}>
                    <Ionicons name="checkmark" size={11} color="#fff" />
                  </View>
                ) : null}
              </View>
              <Text style={[styles.name, chosen && styles.nameChosen, dimmed && styles.nameDimmed]}>
                {person.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingTop: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#ece7e0',
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  label: {
    fontSize: 12,
    color: '#8a8179',
    flexShrink: 1,
  },
  showEveryone: {
    fontSize: 12,
    color: PRIMARY_COLOR,
    fontWeight: '600',
    marginLeft: 8,
  },
  row: {
    paddingHorizontal: 16,
    gap: 14,
  },
  face: {
    alignItems: 'center',
    width: 56,
  },
  avatarWrap: {
    borderRadius: 25,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 1,
  },
  avatarWrapChosen: {
    borderColor: PRIMARY_COLOR,
  },
  // Dimmed, not removed, and still tappable -- the whole point is that the person stays in scope.
  avatarWrapDimmed: {
    opacity: 0.35,
  },
  tick: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: PRIMARY_COLOR,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    marginTop: 4,
    fontSize: 11,
    color: '#6b635a',
  },
  nameChosen: {
    color: PRIMARY_COLOR,
    fontWeight: '700',
  },
  nameDimmed: {
    color: '#b9aa8c',
  },
});

export default FacesRow;
