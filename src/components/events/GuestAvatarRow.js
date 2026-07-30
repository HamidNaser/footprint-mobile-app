/**
 * GuestAvatarRow — horizontal stack of guest avatars with a status ring,
 * plus an optional "+N" overflow bubble. Tapping the row calls onPress.
 */

import React, { memo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { getStatusMeta } from '../../data/eventsData';

const FALLBACK_AVATAR = 'https://randomuser.me/api/portraits/lego/1.jpg';

const Avatar = memo(({ guest, index }) => {
  const meta = getStatusMeta(guest.status);
  return (
    <View
      style={[
        styles.avatarWrap,
        { borderColor: meta.color, marginLeft: index === 0 ? 0 : -10 },
      ]}
    >
      <Image source={{ uri: guest.avatar || FALLBACK_AVATAR }} style={styles.avatar} />
    </View>
  );
});
Avatar.displayName = 'GuestAvatar';

const GuestAvatarRow = memo(({ guests = [], max = 5, onPress }) => {
  const shown = guests.slice(0, max);
  const extra = guests.length - shown.length;

  const Wrapper = onPress ? TouchableOpacity : View;

  return (
    <Wrapper style={styles.row} onPress={onPress} activeOpacity={0.8}>
      {shown.map((g, i) => (
        <Avatar key={g.id || i} guest={g} index={i} />
      ))}
      {extra > 0 && (
        <View style={[styles.avatarWrap, styles.moreWrap, { marginLeft: -10 }]}>
          <Text style={styles.moreText}>+{extra}</Text>
        </View>
      )}
      {guests.length === 0 && <Text style={styles.emptyText}>No guests yet</Text>}
    </Wrapper>
  );
});

GuestAvatarRow.displayName = 'GuestAvatarRow';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  moreWrap: {
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eef2f7',
  },
  moreText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  emptyText: {
    fontSize: 13,
    color: '#8a94a6',
  },
});

export default GuestAvatarRow;
