/**
 * EventsList — the events list body: loading / empty / error states and the rows themselves.
 *
 * Extracted out of `EventsScreen` (research R11, T064) so the same list body serves two
 * different shapes:
 *
 *  - **flat mode** (`events`): one plain list, used by `EventsScreen`'s My / Invites / Drafts
 *    tabs exactly as before — the existing route FR-035 keeps working unchanged, pinned by
 *    `EventsScreen.route.test.js` (T063).
 *  - **sectioned mode** (`upcoming` / `past`): "Coming up" (ascending) then "Past" (descending),
 *    with an optional "Drafts (n)" row and a "+ New event" row above them — the Timeline tab's
 *    Events pane (FR-031–033).
 *
 * Sectioned mode is selected by passing `upcoming` and/or `past`; passing neither keeps the
 * original flat behaviour, which is what `EventsScreen` relies on. Section headers are shown
 * only for a list that actually has something in it — "Coming up" never renders over nothing,
 * and `(upcoming||[]).length === 0 && (past||[]).length === 0` is exactly the flat list's own
 * "no rows" case, so the one `ListEmptyComponent` below covers both modes.
 *
 * Every row is rendered through the real `EventCard`, which this component does not navigate
 * from directly: `onSelect`/`onDrafts`/`onCreate` are callback props, the same shape `EventCard`
 * itself takes (`onPress`) — the screen that renders `EventsList` owns navigation, not this list.
 *
 * `onRefresh` (pull-to-refresh) and `onRetry` (the error state's "Try again") are both optional,
 * independently of each other and of the mode: whichever caller does not have one to give (none
 * do today -- both `EventsScreen` and the Events pane always pass both) simply omits it, and
 * this component hides the control it would have driven rather than wiring a button to nothing.
 */

import React, { memo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import EventCard from './EventCard';

const PRIMARY = '#4361ee';

const TAB_EMPTY = {
  my: { icon: 'calendar-outline', title: 'No events yet', hint: 'Tap + to create your first event.' },
  invites: { icon: 'mail-outline', title: 'No invitations', hint: "Invitations you receive will show up here." },
  drafts: { icon: 'document-outline', title: 'No drafts', hint: 'Saved-but-unsent events live here.' },
};

/**
 * Sectioned mode's own empty copy (Minor 3): the only "+" on the Timeline tab is the capture
 * FAB, which starts a journal capture, not an event -- `TAB_EMPTY.my`'s "Tap + to create your
 * first event" would point at the wrong control. This points at the "+ New event" row that
 * renders directly above the list in that mode instead.
 */
const EVENTS_PANE_EMPTY = {
  icon: 'calendar-outline',
  title: 'No events yet',
  hint: 'Tap "+ New event" above to create one.',
};

const EmptyState = memo(({ cfg }) => {
  return (
    <View style={styles.empty}>
      <Ionicons name={cfg.icon} size={54} color="#c7d2fe" />
      <Text style={styles.emptyTitle}>{cfg.title}</Text>
      <Text style={styles.emptyHint}>{cfg.hint}</Text>
    </View>
  );
});
EmptyState.displayName = 'EventsEmptyState';

/**
 * Shown when the request failed. Distinct from EmptyState on purpose: "you have no events" and
 * "we could not ask" are different facts, and collapsing them into one blank screen is what hid
 * the failure before (EventsScreen's original comment, carried over with this extraction).
 * `onRetry` is optional: see the module doc on why a caller might have none to give.
 */
const ErrorState = memo(({ error, onRetry }) => {
  const detail = [error?.status, error?.code].filter(Boolean).join(' · ');
  return (
    <View style={styles.empty}>
      <Ionicons name="cloud-offline-outline" size={54} color="#fca5a5" />
      <Text style={styles.emptyTitle}>Couldn't load events</Text>
      <Text style={styles.emptyHint}>{error?.message || 'Something went wrong.'}</Text>
      {!!detail && <Text style={styles.errorDetail}>{detail}</Text>}
      {!!onRetry && (
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Ionicons name="refresh" size={18} color="#fff" />
          <Text style={styles.retryText}>Try again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});
ErrorState.displayName = 'EventsErrorState';

const DraftsRow = memo(({ count, onPress }) => (
  <TouchableOpacity style={styles.extraRow} onPress={onPress} activeOpacity={0.8}>
    <Ionicons name="document-outline" size={18} color="#64748b" />
    <Text style={styles.extraRowText}>{`Drafts (${count})`}</Text>
    <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
  </TouchableOpacity>
));
DraftsRow.displayName = 'EventsDraftsRow';

const CreateRow = memo(({ onPress }) => (
  <TouchableOpacity style={styles.extraRow} onPress={onPress} activeOpacity={0.8}>
    <Ionicons name="add-circle-outline" size={18} color={PRIMARY} />
    <Text style={[styles.extraRowText, styles.createRowText]}>+ New event</Text>
  </TouchableOpacity>
));
CreateRow.displayName = 'EventsCreateRow';

const SectionHeader = memo(({ title }) => <Text style={styles.sectionHeader}>{title}</Text>);
SectionHeader.displayName = 'EventsSectionHeader';

/**
 * Flat mode is the default: `data` is `events` as given, unchanged. Sectioned mode is flagged by
 * passing `upcoming` and/or `past` (even empty arrays) — a header entry precedes each non-empty
 * list, in "Coming up" then "Past" order. Header entries carry `__header` so `renderItem`/
 * `keyExtractor` can tell them from real events without it leaking into `EventCard`.
 */
function buildData(events, upcoming, past) {
  if (upcoming === undefined && past === undefined) {
    return events || [];
  }
  const data = [];
  if ((upcoming || []).length > 0) {
    data.push({ __header: true, key: 'section-upcoming', title: 'Coming up' });
    data.push(...upcoming);
  }
  if ((past || []).length > 0) {
    data.push({ __header: true, key: 'section-past', title: 'Past' });
    data.push(...past);
  }
  return data;
}

export default function EventsList({
  events,
  upcoming,
  past,
  tab = 'my',
  isLoading,
  error,
  refreshing,
  onRefresh,
  onRetry,
  onSelect,
  draftsCount,
  onDrafts,
  onCreate,
}) {
  const sectioned = upcoming !== undefined || past !== undefined;
  const data = buildData(events, upcoming, past);
  const emptyCfg = sectioned ? EVENTS_PANE_EMPTY : TAB_EMPTY[tab] || TAB_EMPTY.my;

  const renderItem = useCallback(
    ({ item }) =>
      item.__header ? (
        <SectionHeader title={item.title} />
      ) : (
        <EventCard event={item} onPress={onSelect} />
      ),
    [onSelect]
  );

  const keyExtractor = useCallback((item) => (item.__header ? item.key : item.id), []);

  const showDrafts = draftsCount > 0 && !!onDrafts;
  const showCreate = !!onCreate;
  const header =
    showDrafts || showCreate ? (
      <View>
        {showDrafts && <DraftsRow count={draftsCount} onPress={onDrafts} />}
        {showCreate && <CreateRow onPress={onCreate} />}
      </View>
    ) : null;

  if (isLoading && !refreshing) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={PRIMARY} />
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      contentContainerStyle={styles.list}
      ListHeaderComponent={header}
      // Hazard (Minor 2): this branch relies on every caller coupling a non-null `error` to an
      // empty list -- `useUpcomingEvents` and `useEvents` both fail closed (never a partial
      // list alongside an error), so that holds for both callers today, but an `error` passed
      // alongside a non-empty `events`/`upcoming`/`past` would hide the error entirely (`data`
      // non-empty means `FlatList` never shows `ListEmptyComponent` at all). Not changed here:
      // flat mode carries this forward verbatim from the original `EventsScreen`, and sectioned
      // mode's data source cannot produce that shape -- a future caller that can would need to
      // check `data.length === 0` itself before trusting this to surface the error.
      ListEmptyComponent={
        error ? <ErrorState error={error} onRetry={onRetry} /> : <EmptyState cfg={emptyCfg} />
      }
      refreshControl={
        onRefresh ? (
          <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={PRIMARY} />
        ) : undefined
      }
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingTop: 4,
    paddingBottom: 100,
    flexGrow: 1,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
  },
  extraRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  extraRowText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
  },
  createRowText: {
    color: PRIMARY,
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    marginTop: 16,
  },
  emptyHint: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    marginTop: 6,
  },
  errorDetail: {
    marginTop: 6,
    fontSize: 12,
    color: '#94a3b8',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 20,
    backgroundColor: '#4361ee',
  },
  retryText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
});
