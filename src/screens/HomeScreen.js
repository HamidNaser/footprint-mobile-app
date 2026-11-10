import React, { useCallback, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { useUpcomingEvents } from '../hooks/useUpcomingEvents';
import ComingUpCard from '../components/home/ComingUpCard';

const PRIMARY_COLOR = '#4361ee';
const BACKGROUND_COLOR = '#F0F4FF';

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  // Home's "Coming up" card (FR-034, research R11) -- the hook's own behaviour (civil-date
  // split, fail-closed error) is covered by its own test; here it only feeds the card.
  const { upcoming, error: upcomingError, refresh: refreshUpcomingEvents } = useUpcomingEvents();

  // Home is a bottom-tab screen that never unmounts, so the one load on mount would otherwise
  // be the only load for the rest of the app session -- the same hazard `useUpcomingEvents`
  // gained `refresh()` for, one task ago, on the Timeline pane; its own doc comment gives this
  // exact scenario as the reason. A transient failure would strand the card on "Couldn't load
  // upcoming events" indefinitely, and an event created afterwards would never appear.
  //
  // Retried quietly on focus, not with a button: FR-034 asks for a *quiet* line, and a visible
  // "Try again" is a control the contract does not ask for. Only retried when there is an
  // error to recover from -- an ordinary tab switch must not refetch on every visit.
  //
  // Fix round 2, Critical: `upcomingError` must NOT sit in the focus callback's own dependency
  // array. `useUpcomingEvents.refresh()` sets a *new* `error` object on every failed load, even
  // for an identical repeated failure -- and React Navigation's `useFocusEffect`
  // (`@react-navigation/core/useFocusEffect.tsx`) re-invokes its callback immediately, without
  // a real focus/blur transition, whenever the callback's own identity changes while the screen
  // is already focused. Depending on `upcomingError` directly made the callback's identity
  // change on every failure, which retried immediately, which failed again, unbounded -- a
  // retry storm against the network on the app's landing screen, worst during exactly the
  // outage this retry exists to recover from. `PlacesScreen.js`'s own `useFocusEffect` avoids
  // this by depending only on a stable callback, never on error/result state; matched here as
  // closely as the extra "only when there is an error" condition allows -- by reading the
  // latest error through a ref (kept current by a plain effect) instead of through the
  // callback's closure, so the focus callback's identity depends only on the already-stable
  // `refreshUpcomingEvents`.
  const upcomingErrorRef = useRef(upcomingError);
  useEffect(() => {
    upcomingErrorRef.current = upcomingError;
  }, [upcomingError]);

  useFocusEffect(
    useCallback(() => {
      if (upcomingErrorRef.current) refreshUpcomingEvents();
    }, [refreshUpcomingEvents])
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Top Header with Avatar */}
      <View style={styles.topHeader}>
        <Text style={styles.headerTitle}>Home</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIcon}>
            <Ionicons name="notifications-outline" size={24} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
            <Image
              source={{ uri: user?.avatarUrl }}
              style={styles.headerAvatar}
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.content}>
        <Text style={styles.title}>Welcome to FootPrint</Text>
        <Text style={styles.subtitle}>Your personal journal awaits</Text>

        <TouchableOpacity
          style={styles.quickAction}
          onPress={() => navigation.navigate('Events')}
          activeOpacity={0.85}
        >
          <View style={styles.quickActionIcon}>
            <Ionicons name="calendar" size={22} color="#fff" />
          </View>
          <View style={styles.quickActionText}>
            <Text style={styles.quickActionTitle}>Events</Text>
            <Text style={styles.quickActionSubtitle}>Create & manage invitations</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
        </TouchableOpacity>

        <ComingUpCard
          upcoming={upcoming}
          error={upcomingError}
          onPress={() => navigation.navigate('Timeline', { view: 'events' })}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  topHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: BACKGROUND_COLOR,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    padding: 4,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: PRIMARY_COLOR,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginTop: 32,
    alignSelf: 'stretch',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  quickActionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  quickActionText: {
    flex: 1,
  },
  quickActionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
  },
});
