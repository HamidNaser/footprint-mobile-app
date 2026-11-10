/**
 * EventsScreen — the events list.
 *
 * Mirrors the web Events sidebar: a segmented control (My / Invites / Drafts),
 * a scrollable list of event cards, and a FAB to create a new event. Data comes
 * from `useEvents(tab)` which uses the Hub API when authenticated and falls back
 * to mock data otherwise.
 *
 * The list body (loading / empty / error states, the rows themselves) is
 * `EventsList` (T064, research R11) — the same component the Timeline tab's
 * Events pane uses, in its flat-list mode. `route.params.initialTab` is read as a
 * plain prop, not via `useRoute()`, so a direct render with no navigator (as this
 * screen's own FR-035 regression guard, `EventsScreen.route.test.js`, does) still
 * works and still defaults to 'my' — additive only, every existing way of reaching
 * this screen keeps working unchanged.
 */

import React, { useState, useCallback, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { EVENT_TABS } from '../data/eventsData';
import { useEvents } from '../hooks/useEvents';
import { EventsList } from '../components/events';

const PRIMARY = '#4361ee';
const BACKGROUND = '#F0F4FF';

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

export default function EventsScreen({ route }) {
  const navigation = useNavigation();
  const requestedTab = route?.params?.initialTab;
  const initialTab = EVENT_TABS.some((t) => t.id === requestedTab) ? requestedTab : 'my';
  const [activeTab, setActiveTab] = useState(initialTab);
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

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header onBack={() => navigation.goBack()} />
      <SegmentedTabs active={activeTab} onChange={setActiveTab} />

      <EventsList
        events={events}
        tab={activeTab}
        isLoading={isLoading}
        error={error}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        onRetry={refresh}
        onSelect={handleSelect}
      />

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
