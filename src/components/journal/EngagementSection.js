/**
 * EngagementSection Component
 * 
 * Expandable section showing:
 * - Reaction counts (collapsed view)
 * - Who reacted with what (expanded)
 * - Comments/Responses (expanded)
 * - Reply input (expanded)
 */

import React, { memo, useState, useCallback } from 'react';
import Avatar from '../Avatar';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Platform,
  LayoutAnimation,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { REACTIONS, getReactionByKey, ReactionPicker } from './ReactionPicker';

/**
 * Format relative time for comments
 */
const formatRelativeTime = (timestamp) => {
  const now = Date.now();
  const diff = now - timestamp;
  
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m`;
  if (hours < 24) return `${hours}h`;
  if (days < 7) return `${days}d`;
  
  const date = new Date(timestamp);
  return date.toLocaleDateString();
};

/**
 * Single comment/response item
 */
const ResponseItem = memo(({ response, onReply }) => {
  return (
    <View style={styles.responseItem}>
      <Avatar
        src={response.user?.avatarUrl}
        name={response.user?.name}
        style={styles.responseAvatar}
      />
      <View style={styles.responseContent}>
        <View style={styles.responseBubble}>
          <Text style={styles.responseName}>{response.user?.name || 'Unknown'}</Text>
          <Text style={styles.responseText}>{response.text}</Text>
        </View>
        <View style={styles.responseActions}>
          <Text style={styles.responseTime}>{formatRelativeTime(response.createdAt)}</Text>
          <TouchableOpacity onPress={() => onReply?.(response)}>
            <Text style={styles.responseReplyButton}>Reply</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

/**
 * Reactions summary - who reacted with what
 */
const ReactionsSummary = memo(({ reactions }) => {
  if (!reactions || Object.keys(reactions).length === 0) {
    return null;
  }

  return (
    <View style={styles.reactionsSummary}>
      <Text style={styles.sectionLabel}>Reactions</Text>
      {Object.entries(reactions).map(([key, users]) => {
        if (!Array.isArray(users) || users.length === 0) return null;
        const reaction = getReactionByKey(key);
        if (!reaction) return null;

        const names = users.map(u => u.name).join(', ');
        const displayNames = users.length > 3 
          ? `${users.slice(0, 2).map(u => u.name).join(', ')}, +${users.length - 2}`
          : names;

        return (
          <View key={key} style={styles.reactionRow}>
            <Text style={styles.reactionRowEmoji}>{reaction.emoji}</Text>
            <Text style={styles.reactionRowNames}>{displayNames}</Text>
          </View>
        );
      })}
    </View>
  );
});

/**
 * Main EngagementSection component
 */
export const EngagementSection = memo(({
  reactions,
  responses,
  userReaction,
  commentsCount = 0,
  onReact,
  onAddResponse,
  onViewAllResponses,
  currentUserId,
  primaryColor = '#4361ee',
  isExpanded: controlledExpanded,
  onToggleExpand,
}) => {
  // Internal expansion state if not controlled
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;
  
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [responseText, setResponseText] = useState('');
  const [pickerPosition, setPickerPosition] = useState({ top: 100, left: 20 });

  // Calculate totals - only count arrays (new format reactions)
  const totalReactions = reactions 
    ? Object.values(reactions).reduce((sum, users) => sum + (Array.isArray(users) ? users.length : 0), 0)
    : 0;
  const totalResponses = commentsCount || (responses?.length || 0);

  const handleToggle = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    if (onToggleExpand) {
      onToggleExpand();
    } else {
      setInternalExpanded(!internalExpanded);
    }
  }, [internalExpanded, onToggleExpand]);

  const handleReact = useCallback((reaction) => {
    onReact?.(reaction.key);
    setShowReactionPicker(false);
  }, [onReact]);

  const handleQuickReact = useCallback(() => {
    // Quick tap toggles heart reaction
    if (userReaction === 'heart') {
      onReact?.(null); // Remove reaction
    } else {
      onReact?.('heart');
    }
  }, [userReaction, onReact]);

  const handleShowPicker = useCallback((event) => {
    // Position picker near the touch point
    setPickerPosition({ top: 100, left: 20 });
    setShowReactionPicker(true);
  }, []);

  const handleSubmitResponse = useCallback(() => {
    if (responseText.trim()) {
      onAddResponse?.(responseText.trim());
      setResponseText('');
    }
  }, [responseText, onAddResponse]);

  // Nothing to show if no engagement
  const hasEngagement = totalReactions > 0 || totalResponses > 0;
  
  return (
    <View style={styles.container}>
      {/* Collapsed view - counts + quick actions */}
      <View style={styles.collapsedView}>
        {/* Left side - reaction/comment counts */}
        <TouchableOpacity 
          style={styles.countsRow}
          onPress={handleToggle}
          activeOpacity={0.7}
        >
          {totalReactions > 0 && (
            <View style={styles.countItem}>
              {/* Show first 3 reaction types */}
              <View style={styles.reactionStack}>
                {Object.entries(reactions || {})
                  .filter(([_, users]) => Array.isArray(users) && users.length > 0)
                  .slice(0, 3)
                  .map(([key], index) => {
                    const reaction = getReactionByKey(key);
                    return reaction ? (
                      <Text 
                        key={key} 
                        style={[styles.stackedEmoji, { marginLeft: index > 0 ? -4 : 0 }]}
                      >
                        {reaction.emoji}
                      </Text>
                    ) : null;
                  })}
              </View>
              <Text style={styles.countText}>{totalReactions}</Text>
            </View>
          )}
          
          {totalResponses > 0 && (
            <View style={styles.countItem}>
              <Ionicons name="chatbubble-outline" size={16} color="#666" />
              <Text style={styles.countText}>{totalResponses}</Text>
            </View>
          )}
          
          {hasEngagement && (
            <Ionicons 
              name={isExpanded ? "chevron-up" : "chevron-down"} 
              size={16} 
              color="#999" 
              style={styles.expandIcon}
            />
          )}
        </TouchableOpacity>

        {/* Right side - quick actions */}
        <View style={styles.actionsRow}>
          {/* React button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleQuickReact}
            onLongPress={handleShowPicker}
            delayLongPress={300}
            activeOpacity={0.7}
          >
            {userReaction ? (
              <Text style={styles.actionEmoji}>
                {getReactionByKey(userReaction)?.emoji || '❤️'}
              </Text>
            ) : (
              <Ionicons name="heart-outline" size={20} color="#666" />
            )}
          </TouchableOpacity>

          {/* Comment button */}
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleToggle}
            activeOpacity={0.7}
          >
            <Ionicons name="chatbubble-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Expanded view */}
      {isExpanded && (
        <View style={styles.expandedView}>
          {/* Reactions summary */}
          {totalReactions > 0 && (
            <ReactionsSummary reactions={reactions} />
          )}

          {/* Responses/Comments */}
          {responses && responses.length > 0 && (
            <View style={styles.responsesSection}>
              <Text style={styles.sectionLabel}>Responses</Text>
              {responses.slice(0, 4).map((response, index) => (
                <ResponseItem 
                  key={response.id || index} 
                  response={response}
                  onReply={() => {}}
                />
              ))}
              {totalResponses > 4 && (
                <TouchableOpacity 
                  style={styles.viewAllButton}
                  onPress={onViewAllResponses}
                >
                  <Text style={[styles.viewAllText, { color: primaryColor }]}>
                    View all {totalResponses} responses
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Response input */}
          <View style={styles.responseInput}>
            <TextInput
              style={styles.responseTextInput}
              placeholder="Write a response..."
              placeholderTextColor="#999"
              value={responseText}
              onChangeText={setResponseText}
              multiline
              maxLength={500}
            />
            {responseText.trim().length > 0 && (
              <TouchableOpacity
                style={[styles.sendButton, { backgroundColor: primaryColor }]}
                onPress={handleSubmitResponse}
              >
                <Ionicons name="send" size={16} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      {/* Reaction Picker Modal */}
      <ReactionPicker
        visible={showReactionPicker}
        onSelect={handleReact}
        onClose={() => setShowReactionPicker(false)}
        currentReaction={userReaction}
        position={pickerPosition}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E8E8',
    marginTop: 8,
  },

  // Collapsed view
  collapsedView: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },

  countsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },

  countItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },

  reactionStack: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  stackedEmoji: {
    fontSize: 16,
  },

  countText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },

  expandIcon: {
    marginLeft: 4,
  },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  actionButton: {
    padding: 8,
    marginLeft: 8,
  },

  actionEmoji: {
    fontSize: 20,
  },

  // Expanded view
  expandedView: {
    paddingBottom: 8,
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 8,
  },

  // Reactions summary
  reactionsSummary: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },

  reactionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },

  reactionRowEmoji: {
    fontSize: 18,
    marginRight: 8,
  },

  reactionRowNames: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },

  // Responses section
  responsesSection: {
    paddingVertical: 8,
  },

  responseItem: {
    flexDirection: 'row',
    marginBottom: 12,
  },

  responseAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E0E0E0',
  },

  responseContent: {
    flex: 1,
    marginLeft: 8,
  },

  responseBubble: {
    backgroundColor: '#F0F2F5',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },

  responseName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 2,
  },

  responseText: {
    fontSize: 14,
    color: '#1C1C1E',
    lineHeight: 18,
  },

  responseActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginLeft: 12,
  },

  responseTime: {
    fontSize: 12,
    color: '#8E8E93',
    marginRight: 12,
  },

  responseReplyButton: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },

  viewAllButton: {
    paddingVertical: 8,
  },

  viewAllText: {
    fontSize: 14,
    fontWeight: '500',
  },

  // Response input
  responseInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#F0F2F5',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 8,
  },

  responseTextInput: {
    flex: 1,
    fontSize: 14,
    color: '#000',
    maxHeight: 80,
    paddingVertical: Platform.OS === 'ios' ? 4 : 0,
  },

  sendButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});

export default EngagementSection;
