/**
 * EventsScreen — the events list.
 *
 * Mirrors the web Events sidebar: a segmented control (My / Invites / Drafts),
 * a scrollable list of event cards, and a FAB to create a new event. Data comes
 * from `useEvents(tab)` which uses the Hub API when authenticated and falls back
 * to mock data otherwise.
 */

import React, { useState, useCallback, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { EVENT_TABS } from '../data/eventsData';
import { useEvents } from '../hooks/useEvents';
import { EventCard } from '../components/events';

const PRIMARY = '#4361ee';
const BACKGROUND = '#F0F4FF';

const TAB_EMPTY = {
  my: { icon: 'calendar-outline', title: 'No events yet', hint: 'Tap + to create your first event.' },
  invites: { icon: 'mail-outline', title: 'No invitations', hint: "Invitations you receive will show up here." },
  drafts: { icon: 'document-outline', title: 'No drafts', hint: 'Saved-but-unsent events live here.' },
};

const Header = memo(({ onBack }) => (
  <View style={styles.header}>
    <TouchableOpacity style={styles.headerBtn} onPress={onBack}>
      <Ionicons name="arrow-back" size={24} color="#1e293b" />
    </TouchableOpacity>
    <Text style={styles.headerTitle}>Events</Text>
    {/* The "Demo" badge is gone: there is no demo mode any more, only live
        data with honest empty and error states. */}
    <View style={styles.headerBtn} />
  </View>
));
Header.displayName = 'EventsHeader';

const SegmentedTabs = memo(({ active, onChange }) => (
  <View style={styles.tabs}>
    {EVENT_TABS.map((tab) => {
      const isActive = active === tab.id;
      return (
        <TouchableOpacity
          key={tab.id}
          style={[styles.tab, isActive && styles.tabActive]}
          onPress={() => onChange(tab.id)}
          activeOpacity={0.8}
        >
          <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
        </TouchableOpacity>
      );
    })}
  </View>
));
SegmentedTabs.displayName = 'SegmentedTabs';

const EmptyState = memo(({ tab }) => {
  const cfg = TAB_EMPTY[tab] || TAB_EMPTY.my;
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
 * Shown when the request failed. Distinct from EmptyState on purpose: "you have
 * no events" and "we could not ask" are different facts, and collapsing them
 * into one blank screen is what hid the failure before.
 */
const ErrorState = memo(({ error, onRetry }) => {
  const detail = [error?.status, error?.code].filter(Boolean).join(' · ');
  return (
    <View style={styles.empty}>
      <Ionicons name="cloud-offline-outline" size={54} color="#fca5a5" />
      <Text style={styles.emptyTitle}>Couldn't load events</Text>
      <Text style={styles.emptyHint}>{error?.message || 'Something went wrong.'}</Text>
      {!!detail && <Text style={styles.errorDetail}>{detail}</Text>}
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Ionicons name="refresh" size={18} color="#fff" />
        <Text style={styles.retryText}>Try again</Text>
      </TouchableOpacity>
    </View>
  );
});
ErrorState.displayName = 'EventsErrorState';

export default function EventsScreen() {
  const navigation = useNavigation();
  const [activeTab, setActiveTab] = useState('my');
  const [refreshing, setRefreshing] = useState(false);
  const { events, isLoading, error, refresh } = useEvents(activeTab);

  const handleSelect = useCallback(
    (event) => navigation.navigate('EventDetail', { eventId: event.id, event }),
    [navigation]
  );

  const handleCreate = useCallback(
    () => navigation.navigate('EventForm', { mode: 'create' }),
    [navigation]
  );

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    refresh();
    // useEvents flips isLoading; clear the spinner shortly after.
    setTimeout(() => setRefreshing(false), 600);
  }, [refresh]);

  const renderItem = useCallback(
    ({ item }) => <EventCard event={item} onPress={handleSelect} />,
    [handleSelect]
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => navigation.goBack()} />
      <SegmentedTabs active={activeTab} onChange={setActiveTab} />

      {isLoading && !refreshing ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={PRIMARY} />
        </View>
      ) : (
        <FlatList
          data={events}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            error
              ? <ErrorState error={error} onRetry={refresh} />
              : <EmptyState tab={activeTab} />
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={PRIMARY} />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={handleCreate} activeOpacity={0.85}>
        <Ionicons name="add" size={30} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: '#e2e8f0',
    borderRadius: 12,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 9,
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: PRIMARY,
  },
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
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 28,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
});
