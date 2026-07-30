/**
 * EventCard — a single row in the events list. Shows a themed cover thumbnail,
 * title/subtitle, date · location, guest avatars, and a status pill
 * (guest → RSVP status, host → Published/Draft).
 */

import React, { memo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  getTemplate,
  formatEventShort,
  getGuestCounts,
} from '../../data/eventsData';
import GuestAvatarRow from './GuestAvatarRow';
import RsvpPill from './RsvpPill';

const EventCard = memo(({ event, onPress }) => {
  const template = getTemplate(event.templateId);
  const counts = getGuestCounts(event);
  const isHost = event.tab === 'my' || event.tab === 'drafts';
  const cover = event.coverImage || template.cover;

  return (
    <TouchableOpacity style={styles.card} onPress={() => onPress?.(event)} activeOpacity={0.85}>
      <View style={[styles.thumbWrap, { backgroundColor: template.accentSoft }]}>
        {cover ? (
          <Image source={{ uri: cover }} style={styles.thumb} />
        ) : (
          <Ionicons name={template.icon} size={24} color={template.accent} />
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {event.title || 'Untitled event'}
        </Text>
        {!!event.subtitle && (
          <Text style={styles.subtitle} numberOfLines={1}>
            {event.subtitle}
          </Text>
        )}

        <View style={styles.metaRow}>
          <Ionicons name="calendar-outline" size={13} color="#64748b" />
          <Text style={styles.metaText} numberOfLines={1}>
            {formatEventShort(event.date)}
          </Text>
          {!!event.location?.name && (
            <>
              <Ionicons name="location-outline" size={13} color="#64748b" style={styles.metaIcon} />
              <Text style={styles.metaText} numberOfLines={1}>
                {event.location.name}
              </Text>
            </>
          )}
        </View>

        <View style={styles.footer}>
          <GuestAvatarRow guests={event.guests} max={4} />
          {counts.going > 0 && (
            <Text style={styles.goingText}>{counts.going} going</Text>
          )}
        </View>
      </View>

      <View style={styles.statusCol}>
        {isHost ? (
          <View
            style={[
              styles.statusTag,
              event.status === 'draft' ? styles.draftTag : styles.publishedTag,
            ]}
          >
            <Text
              style={[
                styles.statusTagText,
                event.status === 'draft' ? styles.draftTagText : styles.publishedTagText,
              ]}
            >
              {event.status === 'draft' ? 'Draft' : 'Published'}
            </Text>
          </View>
        ) : (
          <RsvpPill status={event.rsvp || 'invited'} size="sm" />
        )}
        <Ionicons name="chevron-forward" size={18} color="#cbd5e1" />
      </View>
    </TouchableOpacity>
  );
});

EventCard.displayName = 'EventCard';

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  thumbWrap: {
    width: 64,
    height: 64,
    borderRadius: 12,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: '100%',
    height: '100%',
  },
  body: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    gap: 4,
  },
  metaIcon: {
    marginLeft: 6,
  },
  metaText: {
    fontSize: 12,
    color: '#64748b',
    flexShrink: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  goingText: {
    fontSize: 12,
    color: '#16a34a',
    fontWeight: '600',
  },
  statusCol: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginLeft: 8,
  },
  statusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  publishedTag: {
    backgroundColor: '#e0e7ff',
  },
  draftTag: {
    backgroundColor: '#f1f5f9',
  },
  statusTagText: {
    fontSize: 11,
    fontWeight: '700',
  },
  publishedTagText: {
    color: '#4361ee',
  },
  draftTagText: {
    color: '#64748b',
  },
});

export default EventCard;
