/**
 * RsvpPill — small status chip for an event's RSVP / guest status.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getStatusMeta } from '../../data/eventsData';

const RsvpPill = memo(({ status, size = 'md' }) => {
  if (!status) return null;
  const meta = getStatusMeta(status);
  const small = size === 'sm';

  return (
    <View style={[styles.pill, { backgroundColor: meta.soft }, small && styles.pillSm]}>
      <Ionicons name={meta.icon} size={small ? 12 : 14} color={meta.color} />
      <Text style={[styles.text, { color: meta.color }, small && styles.textSm]}>
        {meta.label}
      </Text>
    </View>
  );
});

RsvpPill.displayName = 'RsvpPill';

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: 'flex-start',
  },
  pillSm: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  text: {
    fontSize: 13,
    fontWeight: '600',
  },
  textSm: {
    fontSize: 11,
  },
});

export default RsvpPill;
