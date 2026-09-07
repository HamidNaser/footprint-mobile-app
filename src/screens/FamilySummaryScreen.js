/**
 * FamilySummaryScreen - The Whole Immediate Family At A Glance
 *
 * Opened from FamilyScreen when the signed-in user taps their own head card. Shows one
 * section per immediate-family member — self, then spouse, then each child — each headed by
 * that person's avatar and name, with their recent entries beneath.
 *
 * Sections and entry order both arrive settled from the server, so this screen renders what
 * it is given rather than re-sorting: the ordering rule lives in one place, and web and
 * mobile cannot drift into showing the same family in two different orders.
 *
 * Everything renders in the app's own styling. This feature deliberately does not apply each
 * relative's own journal theme (spec FR-007) — that waits on cross-platform theme
 * persistence, which does not exist on either client yet.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { JournalEntryCard } from '../components/journal/JournalEntryCard';
import { useAuth } from '../context/AuthContext';
import { getFamilySummary } from '../services/SocialService';
import { familySummaryToDays } from '../utils/familySummaryDays';
import DayRoster from '../components/DayRoster';


/** First and last initials, matching how the tree renders someone with no photograph. */
function initialsFor(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}


export default function FamilySummaryScreen({ navigation, route }) {
  const { user, accessToken } = useAuth();
  // Which household. A tree-node id, absent when it is your own.
  const memberId = route?.params?.memberId;
  const title = route?.params?.title || 'Family Journal';
  const [sections, setSections] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [refreshing, setRefreshing] = useState(false);
  const listRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const result = await getFamilySummary(accessToken, { memberId });
      setSections(result || []);
      setStatus('ready');
    } catch (err) {
      console.warn('[FamilySummaryScreen] failed to load family summary:', err.message);
      setStatus('error');
    }
  }, [accessToken, memberId]);

  useEffect(() => {
    load();
  }, [load]);

  // Carry the reader to the entry a face is about. Only ever called for somebody who
  // recorded that day, so the entry is present in the list by construction; the guard is
  // for a list that has since been refreshed out from under the press.
  const handleJumpToEntry = useCallback((entryId) => {
    if (!entryId) return;

    for (let s = 0; s < listSections.length; s += 1) {
      const index = listSections[s].data.findIndex(
        (item) => (item.serverId || item.localId) === entryId
      );
      if (index >= 0) {
        listRef.current?.scrollToLocation({
          sectionIndex: s,
          itemIndex: index,
          viewPosition: 0.2,
          animated: true,
        });
        return;
      }
    }
  }, [listSections]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // Grouped by day, not by person. The endpoint answers by member -- that is how it says
  // who is in this family -- but every other journal surface in the app is read by day, and
  // this screen alone arriving as five separate stacks meant "what happened on Sunday" had
  // to be assembled by eye. See familySummaryDays.
  //
  // 002 kept a member with nothing recorded in the list so they still got a header and the
  // screen could not disagree with the tree it was opened from. Grouped by day there is
  // nowhere to hang that header; the roster above the list carries it instead, drawing
  // everyone and dimming whoever recorded nothing.
  const listSections = useMemo(() => familySummaryToDays(sections), [sections]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="chevron-back" size={24} color="#4a453f" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        <View style={styles.backButton} />
      </View>

      {status === 'loading' && (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.statusText}>Loading your family's journals…</Text>
        </View>
      )}

      {status === 'error' && (
        <View style={styles.centered}>
          <Text style={styles.statusText}>Couldn't load the family summary.</Text>
          <TouchableOpacity onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'ready' && listSections.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.statusText}>
            No family recorded yet — add a spouse or child to your family tree to see their
            entries here.
          </Text>
        </View>
      )}

      {status === 'ready' && listSections.length > 0 && (
        <SectionList
          ref={listRef}
          sections={listSections}
          onScrollToIndexFailed={() => {}}
          keyExtractor={(item, index) => item.serverId || item.localId || String(index)}
          renderSectionHeader={({ section }) => (
            <View style={styles.dayBlock}>
              <Text style={styles.dayHeading}>{section.title}</Text>
              {/* Per day, not per screen: a roster drawn once at the top would describe
                  whichever day happened to be first and be wrong for every other. */}
              <DayRoster
                sections={sections}
                day={section.key === 'undated' ? null : section.key}
                dateText={section.title}
                onJumpToEntry={handleJumpToEntry}
              />
            </View>
          )}
          renderItem={({ item }) => (
            <JournalEntryCard entry={item} currentUserId={user?.id} showAuthor />
          )}
          contentContainerStyle={styles.listContent}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#faf8f4' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e6e1d8',
  },
  backButton: { width: 32, alignItems: 'flex-start' },
  headerTitle: { fontSize: 16, fontWeight: '600', color: '#4a453f' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 10 },
  statusText: { fontSize: 14, color: '#948e86', textAlign: 'center', lineHeight: 20 },
  retry: { paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { fontSize: 14, fontWeight: '600', color: '#4a453f' },
  listContent: { paddingBottom: 32 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
    backgroundColor: '#faf8f4',
  },
  avatar: { width: 36, height: 36, borderRadius: 18 },
  avatarFallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6e1d8' },
  avatarInitials: { fontSize: 13, fontWeight: '600', color: '#6b6660' },
  identity: { flexDirection: 'column' },
  name: { fontSize: 15, fontWeight: '600', color: '#4a453f' },
  relation: { fontSize: 12, color: '#948e86' },
  dayHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6b635a',
    letterSpacing: 0.3,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 8,
  },
  dayBlock: {
    backgroundColor: '#fbf8f4',
  },
});
