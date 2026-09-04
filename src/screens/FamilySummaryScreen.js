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

import React, { useState, useCallback, useEffect } from 'react';
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

const RELATION_LABELS = {
  self: 'You',
  spouse: 'Spouse',
  child: 'Child',
};

/** First and last initials, matching how the tree renders someone with no photograph. */
function initialsFor(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '·';
  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

function SectionHeader({ section }) {
  return (
    <View style={styles.sectionHeader}>
      {section.avatarUrl ? (
        <Image source={{ uri: section.avatarUrl }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <Text style={styles.avatarInitials}>{initialsFor(section.name)}</Text>
        </View>
      )}
      <View style={styles.identity}>
        <Text style={styles.name}>{section.name}</Text>
        <Text style={styles.relation}>
          {RELATION_LABELS[section.relation] || section.relation}
        </Text>
      </View>
    </View>
  );
}

export default function FamilySummaryScreen({ navigation }) {
  const { user, accessToken } = useAuth();
  const [sections, setSections] = useState([]);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready' | 'error'
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await getFamilySummary(accessToken);
      setSections(result || []);
      setStatus('ready');
    } catch (err) {
      console.warn('[FamilySummaryScreen] failed to load family summary:', err.message);
      setStatus('error');
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // SectionList wants `data`; an empty section stays in the list with an empty array so the
  // member still gets a header, and the empty state renders beneath it (spec FR-010).
  // Dropping them would make this screen quietly disagree with the tree it was opened from.
  const listSections = sections.map((section) => ({
    ...section,
    data: section.entries,
  }));

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
        <Text style={styles.headerTitle}>Family Journal</Text>
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
          sections={listSections}
          keyExtractor={(item, index) => item.serverId || item.localId || String(index)}
          renderSectionHeader={({ section }) => <SectionHeader section={section} />}
          renderSectionFooter={({ section }) =>
            section.data.length === 0 ? (
              <Text style={styles.emptySection}>No entries yet.</Text>
            ) : null
          }
          renderItem={({ item }) => (
            <JournalEntryCard entry={item} currentUserId={user?.id} showAuthor={false} />
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
  emptySection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
    fontSize: 13,
    fontStyle: 'italic',
    color: '#948e86',
  },
});
