/**
 * PlaceDetailsExplorer — reading a place by who was there.
 *
 * The web's "Details" tab, brought across. A place could only be read by year here: a
 * list of years and no way to ask what one person posted. This adds the strip of everyone
 * who has a memory at the place, selectable, and a Year / Person toggle that regroups
 * what is below it.
 *
 * The arithmetic is in utils/placeExplorer, shared with nothing yet but written the same
 * way the web computes it — so a place read on a phone and on a laptop cannot come to
 * different conclusions about who was there.
 */
import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MemoryCard from './MemoryCard';
import {
  peopleAtPlace,
  filterByPeople,
  togglePerson,
  buildGroups,
  placeStats,
} from '../../utils/placeExplorer';

const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333333';
const TEXT_MUTED = '#666666';
const BORDER_COLOR = '#e0e0e0';

const Initials = ({ name, size }) => (
  <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
    <Text style={styles.avatarFallbackText}>
      {(name || '?').trim().charAt(0).toUpperCase()}
    </Text>
  </View>
);

const PlaceDetailsExplorer = memo(({
  memories = [],
  selectedPeopleIds = [],
  onSelectPeople,
  groupBy = 'year',
  onGroupBy,
  onOpenMemory,
}) => {
  const people = useMemo(() => peopleAtPlace(memories), [memories]);
  const stats = useMemo(() => placeStats(memories), [memories]);
  const groups = useMemo(
    () => buildGroups(filterByPeople(memories, selectedPeopleIds), groupBy),
    [memories, selectedPeopleIds, groupBy]
  );

  return (
    <View>
      <View style={styles.stats}>
        <View style={styles.stat}>
          <Ionicons name="images-outline" size={18} color={PRIMARY_COLOR} />
          <Text style={styles.statValue}>{stats.memories}</Text>
          <Text style={styles.statLabel}>memories</Text>
        </View>
        <View style={styles.stat}>
          <Ionicons name="people-outline" size={18} color={PRIMARY_COLOR} />
          <Text style={styles.statValue}>{stats.visitors}</Text>
          <Text style={styles.statLabel}>visitors</Text>
        </View>
      </View>

      {people.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>WHO WAS HERE</Text>
            {selectedPeopleIds.length > 0 && (
              <TouchableOpacity onPress={() => onSelectPeople?.([])}>
                <Text style={styles.clear}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Horizontal, because a family reunion is not a short list and wrapping it
              would push the memories off the screen entirely. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {people.map((person) => {
              const active = selectedPeopleIds.includes(person.id);
              return (
                <TouchableOpacity
                  key={person.id}
                  style={styles.person}
                  onPress={() => onSelectPeople?.(togglePerson(selectedPeopleIds, person.id))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={person.name}
                >
                  {person.avatar ? (
                    <Image
                      source={{ uri: person.avatar }}
                      style={[styles.avatar, active && styles.avatarActive]}
                    />
                  ) : (
                    <Initials name={person.name} size={48} />
                  )}
                  <Text
                    style={[styles.personName, active && styles.personNameActive]}
                    numberOfLines={1}
                  >
                    {person.firstName || person.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.groupBar}>
        <Text style={styles.groupLabel}>Group by</Text>
        <View style={styles.toggle}>
          {['year', 'person'].map((mode) => (
            <TouchableOpacity
              key={mode}
              style={[styles.toggleBtn, groupBy === mode && styles.toggleBtnActive]}
              onPress={() => onGroupBy?.(mode)}
            >
              <Text style={[styles.toggleText, groupBy === mode && styles.toggleTextActive]}>
                {mode === 'year' ? 'Year' : 'Person'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {groups.length === 0 ? (
        <Text style={styles.empty}>
          {selectedPeopleIds.length > 0
            ? 'Nothing from the people you picked at this place.'
            : 'No memories here yet.'}
        </Text>
      ) : (
        groups.map((group) => (
          <View key={String(group.key)} style={styles.group}>
            <View style={styles.groupHead}>
              {group.avatar ? (
                <Image source={{ uri: group.avatar }} style={styles.groupAvatar} />
              ) : groupBy === 'person' ? (
                <Initials name={group.label} size={26} />
              ) : null}
              <Text style={styles.groupTitle}>{group.label}</Text>
              <Text style={styles.groupCount}>
                {group.items.length} {group.items.length === 1 ? 'memory' : 'memories'}
              </Text>
            </View>

            {group.items.map((memory) => (
              <MemoryCard key={memory.id} memory={memory} onPress={onOpenMemory} />
            ))}
          </View>
        ))
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  stats: { flexDirection: 'row', gap: 24, marginBottom: 18 },
  stat: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statValue: { fontWeight: '700', color: TEXT_COLOR, fontSize: 15 },
  statLabel: { color: TEXT_MUTED, fontSize: 13 },

  section: { marginBottom: 18 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: TEXT_MUTED, letterSpacing: 0.5 },
  clear: { color: PRIMARY_COLOR, fontSize: 12, fontWeight: '600' },

  person: { alignItems: 'center', width: 62, marginRight: 8 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  // A ring rather than a size change, so the strip does not reflow as people are picked.
  avatarActive: { borderColor: PRIMARY_COLOR },
  avatarFallback: { backgroundColor: '#cbd5e1', alignItems: 'center', justifyContent: 'center' },
  avatarFallbackText: { color: '#fff', fontWeight: '700' },
  personName: { fontSize: 11, color: TEXT_COLOR, marginTop: 4, maxWidth: 60 },
  personNameActive: { color: PRIMARY_COLOR, fontWeight: '600' },

  groupBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  groupLabel: { fontSize: 13, color: TEXT_MUTED, fontWeight: '600' },
  toggle: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderRadius: 999, padding: 3 },
  toggleBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 999 },
  toggleBtnActive: { backgroundColor: '#fff' },
  toggleText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  toggleTextActive: { color: PRIMARY_COLOR },

  group: { marginBottom: 20 },
  groupHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  groupAvatar: { width: 26, height: 26, borderRadius: 13 },
  groupTitle: { fontSize: 15, fontWeight: '700', color: TEXT_COLOR },
  groupCount: { marginLeft: 'auto', fontSize: 12, color: TEXT_MUTED },

  empty: { color: TEXT_MUTED, fontSize: 14, textAlign: 'center', paddingVertical: 24 },
});

export default PlaceDetailsExplorer;
