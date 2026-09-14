/**
 * FamilySummaryScreen - The Whole Immediate Family At A Glance
 *
 * Opened from FamilyScreen when the signed-in user taps their own head card. Shows one
 * family's journal book — a roster of who is in the household and, below it, everyone's
 * entries grouped by day, newest first.
 *
 * The journal book endpoint (phase 2 of this feature) already decides both the household's
 * membership and each day's entry order, so this screen renders what it is given rather than
 * re-deriving either: the ordering rule lives in one place, and web and mobile cannot drift
 * into showing the same family in two different orders.
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
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { JournalEntryCard } from '../components/journal/JournalEntryCard';
import { useAuth } from '../context/AuthContext';
import { getJournalBook } from '../services/SocialService';
import { journalBookToDays } from '../utils/journalBookDays';
import DayRoster from '../components/DayRoster';


export default function FamilySummaryScreen({ navigation, route }) {
  const { user, accessToken } = useAuth();
  // Which household. A tree-node id, absent when it is your own.
  const memberId = route?.params?.memberId;
  const title = route?.params?.title || 'Family Journal';

  // Membership and content are held separately because they arrive separately and change
  // on different schedules: `household` is set once per household and never touched again
  // by paging; `days` grows as older pages are fetched.
  const [household, setHousehold] = useState([]);
  const [days, setDays] = useState([]);
  const [oldestDate, setOldestDate] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const listRef = useRef(null);

  // Guards against `onEndReached` firing more than once per page. It fires repeatedly
  // while the list is mid-scroll, and state updates are async -- two calls in flight would
  // both read the same stale `hasMore`/`oldestDate` and both append the same page. A ref is
  // read synchronously, so the second call sees the first one's claim immediately.
  const loadingRef = useRef(false);

  // Identifies which household's request is current. Bumped once per household (every time
  // `memberId`/`accessToken` changes), and every in-flight request -- the initial load, a
  // refresh, or a page -- captures the value that was active when *it* started and compares
  // again once its await settles. A response for a household the reader has since navigated
  // away from is discarded rather than being applied or, worse, spliced into the new
  // household's days.
  //
  // A single shared "cancelled" boolean is not enough for this: setting it on cleanup and
  // clearing it again when the next effect starts means a request that was already in flight
  // when the household changed would see the flag freshly cleared and wrongly conclude it is
  // still current. A monotonically increasing epoch does not have that problem -- each
  // request's own captured value can only ever be behind, never reset out from under it.
  const epochRef = useRef(0);

  useEffect(() => {
    epochRef.current += 1;
    const myEpoch = epochRef.current;
    const requestMemberId = memberId;
    const requestToken = accessToken;

    // A new household. Its own load owns the paging guard until it settles; nothing prior
    // is still allowed to page against household/days state this effect is about to replace.
    loadingRef.current = true;
    setStatus('loading');
    setHousehold([]);
    setDays([]);
    setOldestDate(null);
    setHasMore(false);
    setLoadingMore(false);

    (async () => {
      try {
        const result = await getJournalBook(requestToken, { memberId: requestMemberId });
        if (myEpoch !== epochRef.current) return; // superseded by a newer household
        setHousehold(result.household || []);
        setDays(result.days || []);
        setOldestDate(result.oldestDate);
        setHasMore(result.hasMore);
        setStatus('ready');
      } catch (err) {
        if (myEpoch !== epochRef.current) return;
        console.warn('[FamilySummaryScreen] failed to load journal book:', err.message);
        setStatus('error');
      } finally {
        if (myEpoch === epochRef.current) loadingRef.current = false;
      }
    })();
  }, [accessToken, memberId]);

  const handleRefresh = useCallback(async () => {
    // Re-issues the same request the initial load makes, under the same epoch/ref guards.
    // A household is allowed to legitimately change on a full reload -- that's not the case
    // this file's paging guards exist for -- just never mid-page.
    // Guarded on `refreshing`, not `loadingRef`: a pull-to-refresh supersedes an in-flight
    // page rather than being blocked by it. Bumping the epoch below already invalidates that
    // page, and bailing instead would make the gesture silently do nothing -- the spinner
    // snaps back with no request issued, because `setRefreshing(true)` is never reached.
    if (refreshing) return;
    loadingRef.current = true;
    epochRef.current += 1;
    const myEpoch = epochRef.current;
    const requestMemberId = memberId;

    // Bumping the epoch above orphaned any in-flight page: its `finally` is guarded on the
    // epoch still matching, so it will skip its own `setLoadingMore(false)`. Nothing else
    // clears the flag, and if this refresh comes back with `hasMore: false` then `loadMore`
    // can never run again to clear it either -- leaving the footer spinner turning forever
    // under a list that is complete. Cleared here, the same way a household change does.
    setLoadingMore(false);

    setRefreshing(true);
    try {
      const result = await getJournalBook(accessToken, { memberId: requestMemberId });
      if (myEpoch !== epochRef.current) return;
      setHousehold(result.household || []);
      setDays(result.days || []);
      setOldestDate(result.oldestDate);
      setHasMore(result.hasMore);
      setStatus('ready');
    } catch (err) {
      if (myEpoch !== epochRef.current) return;
      console.warn('[FamilySummaryScreen] failed to refresh journal book:', err.message);
      // A failed refresh leaves whatever was already on screen rather than blanking it.
    } finally {
      if (myEpoch === epochRef.current) {
        loadingRef.current = false;
        setRefreshing(false);
      }
    }
  }, [accessToken, memberId, refreshing]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || status !== 'ready' || !hasMore || !oldestDate) return;
    loadingRef.current = true;
    setLoadingMore(true);
    const myEpoch = epochRef.current;
    const requestMemberId = memberId;
    const before = oldestDate;

    try {
      const result = await getJournalBook(accessToken, { memberId: requestMemberId, before });
      if (myEpoch !== epochRef.current) return; // the household changed under us; drop this page
      // `household` is stable across pages by contract and is never touched here -- only
      // the initial load and a refresh are allowed to set it.
      setDays((prev) => [...prev, ...(result.days || [])]);
      setOldestDate(result.oldestDate);
      setHasMore(result.hasMore);
    } catch (err) {
      console.warn('[FamilySummaryScreen] failed to load an older page:', err.message);
      // Whatever was already loaded stays exactly as it was, and `hasMore` is untouched, so
      // the list stays readable and a later scroll can simply try again.
    } finally {
      if (myEpoch === epochRef.current) {
        loadingRef.current = false;
        setLoadingMore(false);
      }
    }
  }, [accessToken, memberId, oldestDate, hasMore, status]);

  // Grouped by day, not by person. The endpoint answers by household -- that is how it says
  // who is in this family -- but every other journal surface in the app is read by day, and
  // this screen alone arriving as separate per-person stacks meant "what happened on Sunday"
  // had to be assembled by eye. See journalBookDays.
  //
  // A member with nothing recorded on a given day still belongs to the day -- there is
  // nowhere on a day-grouped list to hang a per-member header, so the roster above each
  // day's entries carries it instead, drawing everyone and dimming whoever recorded nothing.
  const listSections = useMemo(() => journalBookToDays(days, household), [days, household]);

  // Carry the reader to the entry a face is about. Only ever called for somebody who
  // recorded that day, so the entry is present in the list by construction; the guard is
  // for a list that has since been refreshed out from under the press.
  //
  // Declared after `listSections`, which it closes over: a `useCallback` declared before a
  // value it depends on would capture that value's not-yet-initialized first render forever
  // (babel-preset-expo transpiles `const` to `var`, so this does not throw -- it just quietly
  // never invalidates).
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
          <TouchableOpacity onPress={handleRefresh} style={styles.retry}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      )}

      {status === 'ready' && listSections.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.statusText}>
            {household.length === 0
              ? "No family recorded yet — add a spouse or child to your family tree to see their entries here."
              : 'Nobody in your family has recorded anything yet.'}
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
                household={household}
                dayEntries={section.data}
                dateText={section.title}
                onJumpToEntry={handleJumpToEntry}
              />
            </View>
          )}
          renderItem={({ item }) => (
            <JournalEntryCard entry={item} currentUserId={user?.id} showAuthor />
          )}
          onEndReached={loadMore}
          // Generous enough that the next page usually lands before the reader scrolls
          // into the gap, without refetching on every frame of a fast scroll.
          onEndReachedThreshold={0.6}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footer}>
                <ActivityIndicator />
              </View>
            ) : null
          }
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
  footer: { paddingVertical: 20 },
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
