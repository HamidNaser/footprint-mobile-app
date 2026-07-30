/**
 * MemoryRequestCard - "Ask about this place" UI component
 * 
 * Allows users to request memories/stories from family members
 * about specific places they haven't shared yet.
 * 
 * Features:
 * - Shows who might have stories about this place
 * - Easy send request button
 * - Suggested questions
 * - Request status tracking
 */

import React, { memo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  TextInput,
  Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333333';
const TEXT_MUTED = '#666666';
const BORDER_COLOR = '#e0e0e0';
const SURFACE_COLOR = '#FFFFFF';

/**
 * Suggested question pill
 */
const QuestionPill = memo(({ question, selected, onPress }) => (
  <TouchableOpacity
    style={[styles.questionPill, selected && styles.questionPillSelected]}
    onPress={onPress}
  >
    <Text style={[styles.questionPillText, selected && styles.questionPillTextSelected]}>
      {question}
    </Text>
  </TouchableOpacity>
));

/**
 * Recipient selection item
 */
const RecipientItem = memo(({ person, selected, onPress }) => (
  <TouchableOpacity
    style={[styles.recipientItem, selected && styles.recipientItemSelected]}
    onPress={onPress}
  >
    <Image source={{ uri: person.avatar }} style={styles.recipientAvatar} />
    {selected && (
      <View style={styles.checkBadge}>
        <Ionicons name="checkmark" size={12} color="#FFF" />
      </View>
    )}
    <Text style={styles.recipientName}>{person.firstName}</Text>
    <Text style={styles.recipientRelation}>{person.relationship}</Text>
  </TouchableOpacity>
));

/**
 * Request status card (for tracking sent requests)
 */
export const RequestStatusCard = memo(({ request, onResend, onCancel }) => {
  const statusColors = {
    pending: '#f59e0b',
    viewed: '#3b82f6',
    responded: '#10b981',
  };

  return (
    <View style={styles.statusCard}>
      <Image source={{ uri: request.recipient.avatar }} style={styles.statusAvatar} />
      <View style={styles.statusContent}>
        <Text style={styles.statusTitle}>
          Request sent to {request.recipient.firstName}
        </Text>
        <Text style={styles.statusPlace}>{request.placeName}</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, { backgroundColor: statusColors[request.status] }]}>
            <Text style={styles.statusBadgeText}>
              {request.status === 'pending' ? 'Pending' : 
               request.status === 'viewed' ? 'Viewed' : 'Responded'}
            </Text>
          </View>
          <Text style={styles.statusDate}>{request.sentDate}</Text>
        </View>
      </View>
      <TouchableOpacity 
        style={styles.statusAction}
        onPress={() => request.status === 'pending' ? onResend?.() : null}
      >
        <Ionicons 
          name={request.status === 'pending' ? 'refresh' : 'checkmark-circle'} 
          size={24} 
          color={request.status === 'responded' ? '#10b981' : TEXT_MUTED} 
        />
      </TouchableOpacity>
    </View>
  );
});

/**
 * Main MemoryRequestCard component (for creating new requests)
 */
const MemoryRequestCard = ({
  place,
  year,
  memory,  // Optional: the specific memory being asked about
  potentialRecipients = [],
  preSelectedRecipient,  // Optional: pre-select a specific person
  suggestedQuestions = [],
  onSendRequest,
  onSend,  // Alternative callback name
  onCancel,
  variant = 'inline', // 'inline' | 'modal' | 'compact'
}) => {
  // Initialize with pre-selected recipient if provided
  const [selectedRecipients, setSelectedRecipients] = useState(() => 
    preSelectedRecipient ? [preSelectedRecipient.id] : []
  );
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [customMessage, setCustomMessage] = useState('');

  // Use either callback (support both naming conventions)
  const sendCallback = onSend || onSendRequest;

  const toggleRecipient = (person) => {
    setSelectedRecipients(prev => 
      prev.includes(person.id)
        ? prev.filter(id => id !== person.id)
        : [...prev, person.id]
    );
  };

  const handleSend = () => {
    if (selectedRecipients.length === 0) {
      Alert.alert('Select Recipients', 'Please select at least one person to send the request to.');
      return;
    }

    const recipients = potentialRecipients.filter(p => selectedRecipients.includes(p.id));
    const recipient = recipients[0]; // Primary recipient for single-recipient case
    const message = selectedQuestion || customMessage || 'Please share your memories of this place!';

    sendCallback?.({
      place,
      year,
      memory,
      recipients,
      recipient,  // Include single recipient for convenience
      message,
    });

    // Reset form
    setSelectedRecipients([]);
    setSelectedQuestion(null);
    setCustomMessage('');
  };

  // Default suggested questions (customize based on context)
  const questions = suggestedQuestions.length > 0 ? suggestedQuestions : memory ? [
    `What was happening in this photo?`,
    `Who else was there?`,
    `What do you remember about this day?`,
    `Tell me the story behind this!`,
  ] : [
    'What year did you visit?',
    'Who were you with?',
    'Do you have photos?',
    'Tell me a story!',
  ];

  if (variant === 'compact') {
    return (
      <TouchableOpacity 
        style={styles.compactCard}
        onPress={() => onSendRequest?.({ place })}
      >
        <View style={styles.compactIcon}>
          <Ionicons name="chatbox-ellipses" size={20} color={PRIMARY_COLOR} />
        </View>
        <View style={styles.compactContent}>
          <Text style={styles.compactTitle}>Ask for memories</Text>
          <Text style={styles.compactSubtitle}>
            {potentialRecipients.length} people might have stories
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.card}>
      {/* Header - customized based on whether asking about specific memory */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="chatbox-ellipses" size={24} color={PRIMARY_COLOR} />
        </View>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>
            {memory ? 'Ask About This Memory' : 'Request Memories'}
          </Text>
          <Text style={styles.headerSubtitle}>
            {memory 
              ? `Ask ${memory.author?.firstName || memory.author?.name || 'them'} about their ${year || ''} memory`
              : `Ask family about their memories of ${place?.name || 'this place'}`
            }
          </Text>
        </View>
      </View>

      {/* Memory preview if asking about specific memory */}
      {memory && memory.media?.[0] && (
        <View style={styles.memoryPreview}>
          <Image 
            source={{ uri: typeof memory.media[0] === 'string' ? memory.media[0] : memory.media[0]?.uri }} 
            style={styles.memoryPreviewImage} 
          />
          {memory.caption && (
            <Text style={styles.memoryPreviewCaption} numberOfLines={2}>
              {memory.caption}
            </Text>
          )}
        </View>
      )}

      {/* Recipients */}
      {potentialRecipients.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Who do you want to ask?</Text>
          <View style={styles.recipientsList}>
            {potentialRecipients.map((person) => (
              <RecipientItem
                key={person.id}
                person={person}
                selected={selectedRecipients.includes(person.id)}
                onPress={() => toggleRecipient(person)}
              />
            ))}
          </View>
        </View>
      )}

      {/* Suggested questions */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>What do you want to know?</Text>
        <View style={styles.questionsList}>
          {questions.map((q, idx) => (
            <QuestionPill
              key={idx}
              question={q}
              selected={selectedQuestion === q}
              onPress={() => setSelectedQuestion(selectedQuestion === q ? null : q)}
            />
          ))}
        </View>
      </View>

      {/* Custom message */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>Or write your own message</Text>
        <TextInput
          style={styles.messageInput}
          placeholder="Ask something specific..."
          placeholderTextColor={TEXT_MUTED}
          value={customMessage}
          onChangeText={setCustomMessage}
          multiline
          numberOfLines={3}
        />
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {onCancel && (
          <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity 
          style={[
            styles.sendButton,
            selectedRecipients.length === 0 && styles.sendButtonDisabled
          ]} 
          onPress={handleSend}
        >
          <Ionicons name="send" size={18} color="#FFF" />
          <Text style={styles.sendButtonText}>
            Send Request{selectedRecipients.length > 1 ? 's' : ''}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE_COLOR,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8EDFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerContent: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_COLOR,
    marginBottom: 2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 18,
  },

  // Sections
  section: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Recipients
  recipientsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  recipientItem: {
    alignItems: 'center',
    padding: 8,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    width: 72,
  },
  recipientItemSelected: {
    borderColor: PRIMARY_COLOR,
    backgroundColor: '#F0F4FF',
  },
  recipientAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginBottom: 4,
  },
  checkBadge: {
    position: 'absolute',
    top: 4,
    right: 8,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipientName: {
    fontSize: 12,
    fontWeight: '500',
    color: TEXT_COLOR,
    textAlign: 'center',
  },
  recipientRelation: {
    fontSize: 10,
    color: TEXT_MUTED,
    textAlign: 'center',
    textTransform: 'capitalize',
  },

  // Questions
  questionsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  questionPill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F5F5F5',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  questionPillSelected: {
    backgroundColor: '#E8EDFF',
    borderColor: PRIMARY_COLOR,
  },
  questionPillText: {
    fontSize: 13,
    color: TEXT_COLOR,
  },
  questionPillTextSelected: {
    color: PRIMARY_COLOR,
    fontWeight: '500',
  },

  // Message input
  messageInput: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: TEXT_COLOR,
    minHeight: 80,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },

  // Actions
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_MUTED,
  },
  sendButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: PRIMARY_COLOR,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  sendButtonDisabled: {
    backgroundColor: '#A0AEC0',
  },
  sendButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFF',
  },

  // Compact variant
  compactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0F4FF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#D0DCFF',
  },
  compactIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0EAFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  compactContent: {
    flex: 1,
  },
  compactTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  compactSubtitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 1,
  },

  // Status card
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE_COLOR,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    marginBottom: 8,
  },
  statusAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 10,
  },
  statusContent: {
    flex: 1,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_COLOR,
  },
  statusPlace: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFF',
  },
  statusDate: {
    fontSize: 11,
    color: TEXT_MUTED,
  },
  statusAction: {
    padding: 4,
  },

  // Memory preview (when asking about specific memory)
  memoryPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    marginBottom: 16,
  },
  memoryPreviewImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  memoryPreviewCaption: {
    flex: 1,
    fontSize: 13,
    color: TEXT_COLOR,
    lineHeight: 18,
  },
});

export default MemoryRequestCard;
