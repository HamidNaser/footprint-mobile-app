/**
 * EventDetailScreen — view a single event; RSVP (guest) or manage (host).
 *
 * Layout: themed hero header → details (time / location map / host) →
 * description → guests → sticky role-aware action bar. RSVP is optimistic
 * (updates immediately, reverts on failure), matching the web app.
 */

import React, { useState, useEffect, useCallback, memo } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Share,
  Modal,
  ImageBackground,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import PlaceMapPreview from '../components/map/PlaceMapPreview';
import { GuestAvatarRow, RsvpBar, RsvpPill } from '../components/events';
import { EventsApi } from '../api';
import {
  getTemplate,
  getEventById,
  getGuestCounts,
  getStatusMeta,
  formatEventDate,
  formatEventTime,
} from '../data/eventsData';

const FALLBACK_AVATAR = 'https://randomuser.me/api/portraits/lego/1.jpg';

const GuestListModal = memo(({ visible, event, onClose }) => {
  const counts = getGuestCounts(event);
  const guests = event?.guests || [];
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.guestSheet}>
          <View style={styles.guestSheetHeader}>
            <Text style={styles.guestSheetTitle}>Guests</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#475569" />
            </TouchableOpacity>
          </View>
          <View style={styles.countsRow}>
            {['going', 'maybe', 'declined', 'invited'].map((s) => {
              const meta = getStatusMeta(s);
              return (
                <View key={s} style={styles.countChip}>
                  <Text style={[styles.countNum, { color: meta.color }]}>{counts[s]}</Text>
                  <Text style={styles.countLabel}>{meta.label}</Text>
                </View>
              );
            })}
          </View>
          <ScrollView style={styles.guestScroll}>
            {guests.map((g) => {
              const meta = getStatusMeta(g.status);
              return (
                <View key={g.id} style={styles.guestRow}>
                  <Image source={{ uri: g.avatar || FALLBACK_AVATAR }} style={styles.guestAvatar} />
                  <Text style={styles.guestName}>{g.name}</Text>
                  <RsvpPill status={g.status} size="sm" />
                </View>
              );
            })}
            {guests.length === 0 && <Text style={styles.noGuests}>No guests invited yet.</Text>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
});
GuestListModal.displayName = 'GuestListModal';

export default function EventDetailScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { eventId, event: initialEvent } = route.params || {};

  const [event, setEvent] = useState(initialEvent || null);
  const [isLoading, setIsLoading] = useState(!initialEvent);
  const [rsvpPending, setRsvpPending] = useState(false);
  const [showGuests, setShowGuests] = useState(false);

  const loadEvent = useCallback(async () => {
    if (!eventId) return;
    try {
      if (EventsApi.isAuthenticated()) {
        const fresh = await EventsApi.getEvent(eventId);
        if (fresh) {
          setEvent(fresh);
          return;
        }
      }
      // Unauthenticated or not found → mock fallback.
      const mock = getEventById(eventId);
      if (mock) setEvent(mock);
    } catch (err) {
      console.warn('[EventDetail] load failed, using provided/mock:', err?.message);
      if (!event) setEvent(getEventById(eventId));
    } finally {
      setIsLoading(false);
    }
  }, [eventId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    // Refresh from the API on focus so RSVP/edits stay in sync.
    const unsub = navigation.addListener('focus', loadEvent);
    if (!initialEvent) loadEvent();
    return unsub;
  }, [navigation, loadEvent, initialEvent]);

  const isHost = event && (event.tab === 'my' || event.tab === 'drafts');

  const handleRsvp = useCallback(
    async (status) => {
      if (!event || rsvpPending) return;
      const previous = event.rsvp;
      // Optimistic update.
      setEvent((e) => ({ ...e, rsvp: status }));
      setRsvpPending(true);
      try {
        if (EventsApi.isAuthenticated()) {
          const updated = await EventsApi.rsvpEvent(event.id, status);
          if (updated) setEvent(updated);
        }
      } catch (err) {
        // Revert on failure.
        setEvent((e) => ({ ...e, rsvp: previous }));
        Alert.alert('Could not RSVP', 'Please check your connection and try again.');
      } finally {
        setRsvpPending(false);
      }
    },
    [event, rsvpPending]
  );

  const handleShare = useCallback(async () => {
    if (!event) return;
    try {
      await Share.share({
        message: `You're invited: ${event.title}\n${formatEventDate(event.date)} at ${formatEventTime(
          event.date
        )}${event.location?.name ? `\n${event.location.name}` : ''}`,
      });
    } catch {
      /* user dismissed */
    }
  }, [event]);

  const handleEdit = useCallback(
    () => navigation.navigate('EventForm', { mode: 'edit', event }),
    [navigation, event]
  );

  const handleDelete = useCallback(() => {
    if (!event) return;
    Alert.alert('Delete event?', `"${event.title}" will be permanently removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            if (EventsApi.isAuthenticated()) await EventsApi.deleteEvent(event.id);
            navigation.goBack();
          } catch {
            Alert.alert('Could not delete', 'Please try again.');
          }
        },
      },
    ]);
  }, [event, navigation]);

  if (isLoading || !event) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4361ee" />
      </SafeAreaView>
    );
  }

  const template = getTemplate(event.templateId);
  const cover = event.coverImage || template.cover;
  const counts = getGuestCounts(event);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <ImageBackground source={{ uri: cover }} style={styles.hero}>
          <View style={styles.heroOverlay} />
          <SafeAreaView edges={['top']} style={styles.heroTop}>
            <TouchableOpacity style={styles.heroBtn} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color="#fff" />
            </TouchableOpacity>
            <TouchableOpacity style={styles.heroBtn} onPress={handleShare}>
              <Ionicons name="share-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </SafeAreaView>
          <View style={styles.heroContent}>
            <View style={[styles.kicker, { backgroundColor: template.accent }]}>
              <Ionicons name={template.icon} size={13} color="#fff" />
              <Text style={styles.kickerText}>{template.name}</Text>
            </View>
            <Text style={styles.heroTitle}>{event.title}</Text>
            {!!event.subtitle && <Text style={styles.heroSubtitle}>{event.subtitle}</Text>}
            <View style={styles.heroMeta}>
              <Ionicons name="calendar" size={14} color="#fff" />
              <Text style={styles.heroMetaText}>
                {formatEventDate(event.date)} · {formatEventTime(event.date)}
              </Text>
            </View>
          </View>
        </ImageBackground>

        <View style={styles.body}>
          {/* Details */}
          <View style={styles.card}>
            <View style={styles.detailRow}>
              <View style={[styles.detailIcon, { backgroundColor: template.accentSoft }]}>
                <Ionicons name="time-outline" size={18} color={template.accent} />
              </View>
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>When</Text>
                <Text style={styles.detailValue}>
                  {formatEventDate(event.date)} · {formatEventTime(event.date)}
                </Text>
              </View>
            </View>

            {!!event.location?.name && (
              <View style={styles.detailRow}>
                <View style={[styles.detailIcon, { backgroundColor: template.accentSoft }]}>
                  <Ionicons name="location-outline" size={18} color={template.accent} />
                </View>
                <View style={styles.detailText}>
                  <Text style={styles.detailLabel}>Where</Text>
                  <Text style={styles.detailValue}>{event.location.name}</Text>
                  {!!event.location.address && (
                    <Text style={styles.detailSub}>{event.location.address}</Text>
                  )}
                </View>
              </View>
            )}

            {event.location?.lat != null && event.location?.lng != null && (
              <PlaceMapPreview lat={event.location.lat} lng={event.location.lng} height={150} />
            )}

            <View style={[styles.detailRow, { marginTop: 12 }]}>
              <Image
                source={{ uri: event.host?.avatar || FALLBACK_AVATAR }}
                style={styles.hostAvatar}
              />
              <View style={styles.detailText}>
                <Text style={styles.detailLabel}>Hosted by</Text>
                <Text style={styles.detailValue}>{event.host?.name || 'Host'}</Text>
              </View>
            </View>
          </View>

          {/* Description */}
          {!!event.description && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>About</Text>
              <Text style={styles.description}>{event.description}</Text>
            </View>
          )}

          {/* Guests */}
          <TouchableOpacity style={styles.card} onPress={() => setShowGuests(true)} activeOpacity={0.85}>
            <View style={styles.guestHeader}>
              <Text style={styles.sectionTitle}>Guests</Text>
              <Text style={styles.guestCount}>
                {counts.going} going · {counts.total} invited
              </Text>
            </View>
            <View style={styles.guestRowWrap}>
              <GuestAvatarRow guests={event.guests} max={6} onPress={() => setShowGuests(true)} />
              <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
            </View>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sticky action bar */}
      <SafeAreaView edges={['bottom']} style={styles.actionBarWrap}>
        {isHost ? (
          <View style={styles.actionBar}>
            <TouchableOpacity style={[styles.actionBtn, styles.dangerBtn]} onPress={handleDelete}>
              <Ionicons name="trash-outline" size={18} color="#dc2626" />
              <Text style={[styles.actionText, { color: '#dc2626' }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.secondaryBtn]} onPress={handleShare}>
              <Ionicons name="share-outline" size={18} color="#475569" />
              <Text style={[styles.actionText, { color: '#475569' }]}>Share</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.primaryBtn]} onPress={handleEdit}>
              <Ionicons name="create-outline" size={18} color="#fff" />
              <Text style={[styles.actionText, { color: '#fff' }]}>Edit</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.guestActionBar}>
            <RsvpBar value={event.rsvp} onChange={handleRsvp} pending={rsvpPending} />
            <TouchableOpacity style={styles.shareInvite} onPress={handleShare}>
              <Ionicons name="share-outline" size={18} color="#4361ee" />
              <Text style={styles.shareInviteText}>Share invite</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>

      <GuestListModal visible={showGuests} event={event} onClose={() => setShowGuests(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F4FF' },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0F4FF' },
  scroll: { paddingBottom: 24 },
  hero: {
    height: 320,
    justifyContent: 'space-between',
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  heroBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  heroContent: {
    padding: 20,
  },
  kicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 10,
  },
  kickerText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '800' },
  heroSubtitle: { color: '#f1f5f9', fontSize: 15, marginTop: 2 },
  heroMeta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  heroMetaText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  body: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  detailIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  hostAvatar: { width: 38, height: 38, borderRadius: 19, marginRight: 12 },
  detailText: { flex: 1 },
  detailLabel: { fontSize: 12, color: '#8a94a6', fontWeight: '600' },
  detailValue: { fontSize: 15, color: '#1e293b', fontWeight: '600', marginTop: 1 },
  detailSub: { fontSize: 13, color: '#64748b', marginTop: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b', marginBottom: 8 },
  description: { fontSize: 14, color: '#475569', lineHeight: 21 },
  guestHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  guestCount: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  guestRowWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  actionBarWrap: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  actionBar: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  guestActionBar: {
    padding: 16,
    gap: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  primaryBtn: { backgroundColor: '#4361ee' },
  secondaryBtn: { backgroundColor: '#f1f5f9' },
  dangerBtn: { backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' },
  actionText: { fontSize: 14, fontWeight: '700' },
  shareInvite: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  shareInviteText: { color: '#4361ee', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  guestSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  guestSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  guestSheetTitle: { fontSize: 18, fontWeight: '700', color: '#1e293b' },
  countsRow: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 16 },
  countChip: { alignItems: 'center', flex: 1 },
  countNum: { fontSize: 20, fontWeight: '800' },
  countLabel: { fontSize: 11, color: '#64748b', marginTop: 2 },
  guestScroll: { maxHeight: 360 },
  guestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  guestAvatar: { width: 40, height: 40, borderRadius: 20 },
  guestName: { flex: 1, fontSize: 15, color: '#1e293b', fontWeight: '500' },
  noGuests: { fontSize: 14, color: '#8a94a6', textAlign: 'center', paddingVertical: 24 },
});
