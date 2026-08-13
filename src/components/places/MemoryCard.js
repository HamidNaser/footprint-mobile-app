/**
 * MemoryCard - Individual memory display component
 * 
 * Shows a photo/video with author attribution, date, and caption.
 * Used in YearMemoriesModal and other places.
 * 
 * Features:
 * - Photo display with tap to view full screen
 * - Author avatar and name
 * - Relationship badge (family/friend)
 * - Caption text
 * - "This is you" indicator for user's own memories
 * - Question indicators:
 *   - For YOUR memory: Shows when someone asked you about it (orange/yellow)
 *   - For others' memories: "Ask" button to ask questions
 */

import React, { memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getQuestionsForMemory } from '../../data/placesData';
import { buildStoryPrompts } from '../../utils/storyPrompts';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333333';
const TEXT_MUTED = '#666666';
const BORDER_COLOR = '#e0e0e0';
const SURFACE_COLOR = '#FFFFFF';

/**
 * Relationship badge colors
 */
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

/**
 * Format date for display
 */
const formatDate = (dateString) => {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/**
 * MemoryCard component
 */
const MemoryCard = memo(({
  memory,
  onPress,
  onAuthorPress,
  onStoryPromptPress,
  onAskAbout,  // Handler for asking about someone else's memory
  onAnswerQuestion,  // Handler for answering questions on YOUR memory
  variant = 'default', // 'default' | 'compact' | 'grid'
}) => {
  const { author, media, caption, date, isCurrentUser, hasStory, storyPrompt, needsStory } = memory;

  // A seeded memory keeps its hand-written prompt; a live one is worded from the same rule
  // the place's list uses, so the two never disagree about the same photographs.
  const [{ prompt: livePrompt } = {}] = buildStoryPrompts([memory], memory.year);
  const relationshipColor = RELATIONSHIP_COLORS[author.relationship] || RELATIONSHIP_COLORS.friend;
  
  // Get primary image
  const primaryImage = media[0]?.uri;
  const additionalCount = media.length - 1;

  // Get questions for this memory
  const allQuestions = getQuestionsForMemory(memory.id);
  
  // For YOUR OWN memory: questions others asked you (pending)
  const pendingQuestions = isCurrentUser ? allQuestions.filter(q => q.status === 'pending') : [];
  const hasPendingQuestions = pendingQuestions.length > 0;

  // For OTHERS' memories: did you ask a question? What's the status?
  const myQuestion = !isCurrentUser ? allQuestions.find(q => q.askerId === 'me') : null;
  const myQuestionStatus = myQuestion?.status; // 'pending' | 'answered' | undefined

  if (variant === 'grid') {
    return (
      <TouchableOpacity 
        style={styles.gridCard}
        onPress={() => onPress?.(memory)}
        activeOpacity={0.9}
      >
        <Image source={{ uri: primaryImage }} style={styles.gridImage} />
        {additionalCount > 0 && (
          <View style={styles.gridBadge}>
            <Text style={styles.gridBadgeText}>+{additionalCount}</Text>
          </View>
        )}
        <View style={styles.gridAuthor}>
          <Image source={{ uri: author.avatar }} style={styles.gridAvatar} />
        </View>
        {isCurrentUser && (
          <View style={styles.youBadge}>
            <Text style={styles.youBadgeText}>You</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  if (variant === 'compact') {
    return (
      <TouchableOpacity 
        style={styles.compactCard}
        onPress={() => onPress?.(memory)}
        activeOpacity={0.9}
      >
        <Image source={{ uri: primaryImage }} style={styles.compactImage} />
        <View style={styles.compactContent}>
          <View style={styles.compactHeader}>
            <Image source={{ uri: author.avatar }} style={styles.compactAvatar} />
            <Text style={styles.compactAuthorName} numberOfLines={1}>
              {isCurrentUser ? 'You' : author.firstName}
            </Text>
          </View>
          {caption && (
            <Text style={styles.compactCaption} numberOfLines={2}>{caption}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  // Default variant - full card
  return (
    <View style={styles.card}>
      {/* Header - Author info */}
      <TouchableOpacity 
        style={styles.header}
        onPress={() => onAuthorPress?.(author)}
        disabled={isCurrentUser}
      >
        <Image source={{ uri: author.avatar }} style={styles.avatar} />
        <View style={styles.authorInfo}>
          <View style={styles.authorNameRow}>
            <Text style={styles.authorName}>
              {isCurrentUser ? 'You' : author.name}
            </Text>
            {!isCurrentUser && (
              <View style={[styles.relationshipBadge, { backgroundColor: relationshipColor }]}>
                <Text style={styles.relationshipText}>{author.relationship}</Text>
              </View>
            )}
          </View>
          <Text style={styles.dateText}>{formatDate(date)}</Text>
        </View>
        {!isCurrentUser && (
          <TouchableOpacity style={styles.moreButton}>
            <Ionicons name="ellipsis-horizontal" size={20} color={TEXT_MUTED} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* Photo(s) */}
      <TouchableOpacity 
        style={styles.imageContainer}
        onPress={() => onPress?.(memory)}
        activeOpacity={0.95}
      >
        <Image source={{ uri: primaryImage }} style={styles.mainImage} />
        {additionalCount > 0 && (
          <View style={styles.additionalBadge}>
            <Ionicons name="images" size={14} color="#FFF" />
            <Text style={styles.additionalText}>+{additionalCount}</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* Caption */}
      {caption && (
        <View style={styles.captionContainer}>
          <Text style={styles.caption}>{caption}</Text>
        </View>
      )}

      {/* Story Prompt - if this memory has an untold story */}
      {/* Live now. `hasStory` was a hand-typed boolean on a few seeded records, so this
          prompt could never appear on a real memory. */}
      {(needsStory || hasStory) && (livePrompt || storyPrompt) && (
        <TouchableOpacity 
          style={styles.storyPromptContainer}
          onPress={() => onStoryPromptPress?.(memory)}
        >
          <View style={styles.storyPromptIcon}>
            <Ionicons name="mic" size={18} color={PRIMARY_COLOR} />
          </View>
          <View style={styles.storyPromptContent}>
            <Text style={styles.storyPromptText}>{livePrompt || storyPrompt}</Text>
            <Text style={styles.storyPromptHint}>Tap to record their story</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
        </TouchableOpacity>
      )}

      {/* SOMEONE ASKED ABOUT THIS - Shows on YOUR memory when someone asked you a question */}
      {isCurrentUser && hasPendingQuestions && (
        <TouchableOpacity 
          style={styles.questionReceivedContainer}
          onPress={() => onAnswerQuestion?.(memory, pendingQuestions)}
        >
          <View style={styles.questionReceivedIcon}>
            <Ionicons name="chatbubble-ellipses" size={18} color="#FFF" />
            {pendingQuestions.length > 1 && (
              <View style={styles.questionCountBadge}>
                <Text style={styles.questionCountText}>{pendingQuestions.length}</Text>
              </View>
            )}
          </View>
          <View style={styles.questionReceivedContent}>
            <Text style={styles.questionReceivedText}>
              {pendingQuestions.length === 1 
                ? `${pendingQuestions[0].asker.firstName} asked about this`
                : `${pendingQuestions.length} people asked about this`
              }
            </Text>
            <Text style={styles.questionReceivedHint}>Tap to answer</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color="#F59E0B" />
        </TouchableOpacity>
      )}

      {/* YOUR QUESTION STATUS - Shows on others' memories when you've asked about it */}
      {myQuestion && (
        <View style={[
          styles.myQuestionStatus,
          myQuestionStatus === 'answered' && styles.myQuestionAnswered
        ]}>
          <Ionicons 
            name={myQuestionStatus === 'answered' ? 'checkmark-circle' : 'time-outline'} 
            size={16} 
            color={myQuestionStatus === 'answered' ? '#10B981' : '#6B7280'} 
          />
          <Text style={[
            styles.myQuestionStatusText,
            myQuestionStatus === 'answered' && styles.myQuestionAnsweredText
          ]}>
            {myQuestionStatus === 'answered' 
              ? 'Your question was answered!' 
              : 'Waiting for answer...'}
          </Text>
        </View>
      )}

      {/* Action bar */}
      <View style={styles.actionBar}>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="heart-outline" size={22} color={TEXT_COLOR} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="chatbubble-outline" size={20} color={TEXT_COLOR} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="share-outline" size={22} color={TEXT_COLOR} />
        </TouchableOpacity>
        {/* Ask about this - small icon button for non-user memories */}
        {!isCurrentUser && onAskAbout && (
          <TouchableOpacity 
            style={styles.askActionButton}
            onPress={() => onAskAbout?.(memory)}
          >
            <Ionicons name="help-circle-outline" size={20} color={PRIMARY_COLOR} />
            <Text style={styles.askActionText}>Ask</Text>
          </TouchableOpacity>
        )}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.actionButton}>
          <Ionicons name="bookmark-outline" size={22} color={TEXT_COLOR} />
        </TouchableOpacity>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // Default card styles
  card: {
    backgroundColor: SURFACE_COLOR,
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: BORDER_COLOR,
  },
  authorInfo: {
    flex: 1,
    marginLeft: 10,
  },
  authorNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  relationshipBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  relationshipText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
    textTransform: 'capitalize',
  },
  dateText: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  moreButton: {
    padding: 4,
  },

  // Image styles
  imageContainer: {
    position: 'relative',
  },
  mainImage: {
    width: '100%',
    height: 280,
    backgroundColor: '#F0F0F0',
  },
  additionalBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    backgroundColor: 'rgba(0,0,0,0.7)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    gap: 4,
  },
  additionalText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
  },

  // Caption
  captionContainer: {
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  caption: {
    fontSize: 14,
    color: TEXT_COLOR,
    lineHeight: 20,
  },

  // Story prompt
  storyPromptContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    padding: 12,
    backgroundColor: '#F0F4FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D0DCFF',
  },
  storyPromptIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0EAFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  storyPromptContent: {
    flex: 1,
    marginLeft: 10,
  },
  storyPromptText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  storyPromptHint: {
    fontSize: 11,
    color: PRIMARY_COLOR,
    marginTop: 2,
  },

  // Question received (for YOUR memories when someone asked you)
  questionReceivedContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    padding: 12,
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  questionReceivedIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  questionCountBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFF7ED',
  },
  questionCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFF',
  },
  questionReceivedContent: {
    flex: 1,
    marginLeft: 10,
  },
  questionReceivedText: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  questionReceivedHint: {
    fontSize: 11,
    color: '#F59E0B',
    marginTop: 2,
  },

  // Your question status (shows when you've asked about someone's memory)
  myQuestionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    gap: 6,
  },
  myQuestionAnswered: {
    backgroundColor: '#ECFDF5',
  },
  myQuestionStatusText: {
    fontSize: 12,
    color: '#6B7280',
  },
  myQuestionAnsweredText: {
    color: '#10B981',
    fontWeight: '500',
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
  },
  actionButton: {
    padding: 8,
  },
  askActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#F0F4FF',
    borderRadius: 14,
    marginLeft: 4,
    gap: 4,
  },
  askActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: PRIMARY_COLOR,
  },

  // Grid variant
  gridCard: {
    width: (SCREEN_WIDTH - 48) / 3,
    height: (SCREEN_WIDTH - 48) / 3,
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F0F0F0',
  },
  gridBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  gridBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },
  gridAuthor: {
    position: 'absolute',
    bottom: 6,
    left: 6,
  },
  gridAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  youBadge: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  youBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFF',
  },

  // Compact variant
  compactCard: {
    flexDirection: 'row',
    backgroundColor: SURFACE_COLOR,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    marginBottom: 8,
  },
  compactImage: {
    width: 80,
    height: 80,
    backgroundColor: '#F0F0F0',
  },
  compactContent: {
    flex: 1,
    padding: 10,
    justifyContent: 'center',
  },
  compactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  compactAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    marginRight: 6,
  },
  compactAuthorName: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  compactCaption: {
    fontSize: 12,
    color: TEXT_MUTED,
    lineHeight: 16,
  },
});

export default MemoryCard;
