/**
 * TemplateCard — a selectable themed invitation template in the create flow's
 * horizontal carousel (wedding / birthday / party).
 */

import React, { memo } from 'react';
import { View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const TemplateCard = memo(({ template, selected, onPress }) => (
  <TouchableOpacity
    style={[
      styles.card,
      { backgroundColor: template.accentSoft },
      selected && { borderColor: template.accent },
    ]}
    onPress={() => onPress?.(template)}
    activeOpacity={0.85}
  >
    <View style={styles.coverWrap}>
      <Image source={{ uri: template.cover }} style={styles.cover} />
      {selected && (
        <View style={[styles.check, { backgroundColor: template.accent }]}>
          <Ionicons name="checkmark" size={16} color="#fff" />
        </View>
      )}
    </View>
    <View style={styles.info}>
      <View style={[styles.iconChip, { backgroundColor: template.accent }]}>
        <Ionicons name={template.icon} size={14} color="#fff" />
      </View>
      <View style={styles.textCol}>
        <Text style={styles.name} numberOfLines={1}>
          {template.name}
        </Text>
        <Text style={styles.tagline} numberOfLines={1}>
          {template.tagline}
        </Text>
      </View>
    </View>
  </TouchableOpacity>
));

TemplateCard.displayName = 'TemplateCard';

const styles = StyleSheet.create({
  card: {
    width: 160,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 8,
    marginRight: 12,
  },
  coverWrap: {
    borderRadius: 12,
    overflow: 'hidden',
    height: 140,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  check: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  iconChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
  },
  name: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1e293b',
  },
  tagline: {
    fontSize: 11,
    color: '#64748b',
  },
});

export default TemplateCard;
