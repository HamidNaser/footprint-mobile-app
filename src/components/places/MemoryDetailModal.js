/**
 * MemoryDetailModal - Full-screen reader for a single memory
 *
 * Mirrors the web app's MemoryReadView: shows the memory's photo(s) large,
 * the author with a relationship badge, the caption/story, contextual
 * actions ("Ask about this" / "Record a story"), a story prompt, and the
 * questions people have asked about the memory.
 *
 * Opened when a user taps a memory card in the year view.
 */

import React, { memo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  FlatList,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { getQuestionsForMemory } from '../../data/placesData';
import { pickThenNow } from '../../utils/thenNow';
import { buildStoryPrompts } from '../../utils/storyPrompts';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333333';
const TEXT_MUTED = '#666666';
const BORDER_COLOR = '#e0e0e0';
const SURFACE_COLOR = '#FFFFFF';
const BACKGROUND_COLOR = '#F0F4FF';

const RELATIONSHIP_COLORS = {
  self: '#4361ee',
  grandfather: '#9333ea',
  grandmother: '#9333ea',
  father: '#059669',
  mother: '#059669',
  uncle: '#0891b2',
  aunt: '#0891b2',
  cousin: '#ea580c',
  friend: '#64748b',
};

const formatDate = (dateString) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/**
 * Swipeable media carousel with page dots.
 */
const MediaCarousel = memo(({ media }) => {
  const [index, setIndex] = useState(0);
  const items = (media || []).filter((m) => m?.uri);

  const onScroll = useCallback((e) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    setIndex(i);
  }, []);

  if (items.length === 0) return null;

  return (
    <View>
      <FlatList
        data={items}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item, i) => `${item.uri}-${i}`}
        onMomentumScrollEnd={onScroll}
        renderItem={({ item }) => (
          <Image source={{ uri: item.uri }} style={styles.media} resizeMode="cover" />
        )}
      />
      {items.length > 1 && (
        <View style={styles.dots}>
          {items.map((item, i) => (
            <View
              key={`${item.uri}-dot-${i}`}
              style={[styles.dot, i === index && styles.dotActive]}
            />
          ))}
        </View>
      )}
    </View>
  );
});

const MemoryDetailModal = ({
  memory,
  place,
  onClose,
  onAsk,
  onStartInterview,
  onThenNow,
  placeMemories,
}) => {
  if (!memory) return null;

  const author = memory.author || {};
  const relationshipColor =
    RELATIONSHIP_COLORS[author.relationship] || RELATIONSHIP_COLORS.friend;
  const questions = getQuestionsForMemory(memory.id) || [];
  const subtitle = [place?.name, memory.year].filter(Boolean).join(' · ');

  // Only offer Then & Now when this place genuinely spans two eras. Without the check the
  // button opens onto a comparison of a memory with itself.
  const hasThenNow = !!pickThenNow(placeMemories || []);

  // A seeded memory keeps its hand-written prompt; a live one is worded from the same rule
  // the place's list uses, so the two never disagree about the same photographs.
  const [{ prompt: livePrompt } = {}] = buildStoryPrompts([memory], memory.year);
  const storyPrompt = (memory.hasStory && memory.storyPrompt) || livePrompt || null;

  return (
    <View style={styles.overlay}>
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="chevron-back" size={24} color={TEXT_COLOR} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Memory</Text>
            {!!subtitle && <Text style={styles.headerSubtitle}>{subtitle}</Text>}
          </View>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Media */}
          <MediaCarousel media={memory.media} />

          <View style={styles.body}>
            {/* Author */}
            <View style={styles.authorRow}>
              {author.avatar ? (
                <Image source={{ uri: author.avatar }} style={styles.authorAvatar} />
              ) : (
                <View style={[styles.authorAvatar, styles.authorAvatarFallback]}>
                  <Text style={styles.authorInitial}>
                    {(author.name || '?').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              <View style={styles.authorInfo}>
                <View style={styles.authorNameRow}>
                  <Text style={styles.authorName}>
                    {memory.isCurrentUser ? 'You' : author.name}
                  </Text>
                  {!memory.isCurrentUser && author.relationship && (
                    <View
                      style={[
                        styles.relationshipBadge,
                        { backgroundColor: relationshipColor },
                      ]}
                    >
                      <Text style={styles.relationshipText}>{author.relationship}</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.dateText}>{formatDate(memory.date)}</Text>
              </View>
            </View>

            {/* Caption */}
            {!!memory.caption && <Text style={styles.caption}>{memory.caption}</Text>}

            {/* Action bar */}
            <View style={styles.actionBar}>
              <Ionicons name="heart-outline" size={22} color={TEXT_MUTED} />
              <Ionicons name="chatbubble-outline" size={20} color={TEXT_MUTED} />
              <Ionicons name="share-social-outline" size={20} color={TEXT_MUTED} />
              <Ionicons
                name="bookmark-outline"
                size={20}
                color={TEXT_MUTED}
                style={{ marginLeft: 'auto' }}
              />
            </View>

            {/* Contextual actions */}
            <View style={styles.pills}>
              {!memory.isCurrentUser && (
                <TouchableOpacity
                  style={[styles.pill, styles.pillPrimary]}
                  onPress={() => onAsk?.(memory)}
                >
                  <Ionicons name="help-circle-outline" size={15} color="#FFF" />
                  <Text style={styles.pillPrimaryText}>Ask about this</Text>
                </TouchableOpacity>
              )}
              {/* Not gated on memory.hasStory. That flag only ever existed on a handful of
                  seeded records, so on live memories it is always undefined and this button
                  never rendered. Recording a story is its own action -- sitting someone
                  down and asking what they remember -- and any memory can have one. */}
              <TouchableOpacity
                style={[styles.pill, styles.pillPrimary]}
                onPress={() => onStartInterview?.(memory)}
              >
                <Ionicons name="mic-outline" size={15} color="#FFF" />
                <Text style={styles.pillPrimaryText}>Record a story</Text>
              </TouchableOpacity>

              {/* The third button. ThenNowComparison has existed in this codebase the
                  whole time and was imported by nothing, so the feature had never once
                  appeared on a screen. Shown only when the place genuinely has two eras to
                  compare -- otherwise it opens onto an empty comparison. */}
              {hasThenNow && (
                <TouchableOpacity
                  style={[styles.pill, styles.pillSecondary]}
                  onPress={() => onThenNow?.(memory)}
                >
                  <Ionicons name="swap-horizontal-outline" size={15} color={PRIMARY_COLOR} />
                  <Text style={styles.pillSecondaryText}>Then &amp; Now</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Story prompt */}
            {!!storyPrompt && (
              <View style={styles.storyPrompt}>
                <Ionicons name="mic" size={18} color={PRIMARY_COLOR} />
                <Text style={styles.storyPromptText}>{storyPrompt}</Text>
              </View>
            )}

            {/* Questions */}
            {questions.length > 0 && (
              <View style={styles.questionsSection}>
                <Text style={styles.questionsTitle}>Questions</Text>
                {questions.map((q) => (
                  <View key={q.id} style={styles.questionCard}>
                    {q.asker?.avatar ? (
                      <Image source={{ uri: q.asker.avatar }} style={styles.questionAvatar} />
                    ) : (
                      <View style={[styles.questionAvatar, styles.authorAvatarFallback]} />
                    )}
                    <View style={styles.questionContent}>
                      <Text style={styles.questionText}>{q.question}</Text>
                      <Text style={styles.questionMeta}>
                        {q.asker?.firstName || q.asker?.name || 'Someone'} ·{' '}
                        <Text
                          style={{
                            color: q.status === 'answered' ? '#10b981' : '#f59e0b',
                            fontWeight: '600',
                          }}
                        >
                          {q.status}
                        </Text>
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}

            <View style={{ height: 40 }} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKGROUND_COLOR,
    zIndex: 20,
  },
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: SURFACE_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  closeButton: {
    padding: 4,
    width: 32,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_COLOR,
  },
  headerSubtitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
  media: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH * 0.85,
    backgroundColor: '#000',
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: BORDER_COLOR,
  },
  dotActive: {
    backgroundColor: PRIMARY_COLOR,
    width: 18,
  },
  body: {
    padding: 16,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 10,
  },
  authorAvatarFallback: {
    backgroundColor: '#3a527a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authorInitial: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 18,
  },
  authorInfo: {
    flex: 1,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    color: TEXT_COLOR,
  },
  relationshipBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
  },
  relationshipText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  caption: {
    fontSize: 15,
    lineHeight: 22,
    color: TEXT_COLOR,
    marginBottom: 14,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#f1f5f9',
  },
  pills: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 14,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
  },
  pillPrimary: {
    backgroundColor: PRIMARY_COLOR,
  },
  pillPrimaryText: {
    color: '#FFF',
    fontSize: 13,
    fontWeight: '600',
  },
  pillSecondary: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: PRIMARY_COLOR,
  },
  pillSecondaryText: {
    color: PRIMARY_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
  storyPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 16,
    backgroundColor: 'rgba(67, 97, 238, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(67, 97, 238, 0.2)',
    borderRadius: 12,
    padding: 12,
  },
  storyPromptText: {
    flex: 1,
    color: PRIMARY_COLOR,
    fontSize: 13,
    fontWeight: '600',
  },
  questionsSection: {
    marginTop: 20,
  },
  questionsTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: TEXT_COLOR,
    marginBottom: 10,
  },
  questionCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: '#eef0f4',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  questionAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
  },
  questionContent: {
    flex: 1,
  },
  questionText: {
    fontSize: 13,
    color: TEXT_COLOR,
  },
  questionMeta: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 2,
  },
});

export default memo(MemoryDetailModal);
