/**
 * RsvpBar — segmented RSVP control for guests (Going / Maybe / Declined).
 * Optimistic selection is driven by the parent; `pending` disables the row
 * while a request is in flight.
 */

import React, { memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const OPTIONS = [
  { status: 'going', label: 'Going', icon: 'checkmark-circle', color: '#16a34a' },
  { status: 'maybe', label: 'Maybe', icon: 'help-circle', color: '#d97706' },
  { status: 'declined', label: 'Declined', icon: 'close-circle', color: '#dc2626' },
];

const RsvpBar = memo(({ value, onChange, pending = false }) => (
  <View style={styles.container}>
    <Text style={styles.label}>Will you attend?</Text>
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const active = value === opt.status;
        return (
          <TouchableOpacity
            key={opt.status}
            style={[
              styles.segment,
              active && { backgroundColor: opt.color + '18', borderColor: opt.color },
            ]}
            onPress={() => onChange?.(opt.status)}
            disabled={pending}
            activeOpacity={0.8}
          >
            <Ionicons
              name={opt.icon}
              size={18}
              color={active ? opt.color : '#8a94a6'}
            />
            <Text style={[styles.segmentText, active && { color: opt.color }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  </View>
));

RsvpBar.displayName = 'RsvpBar';

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  segmentText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8a94a6',
  },
});

export default RsvpBar;
