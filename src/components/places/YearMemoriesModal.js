/**
 * YearMemoriesModal - Shows all memories from a specific year at a place
 * 
 * This is the main feature that shows "who was here in [year]" with
 * all their photos/videos.
 * 
 * Features:
 * - Year header with place name
 * - People who were here in this year
 * - Photo grid (tap to see full cards)
 * - View toggle: Grid / Feed
 * - "I was here too" action if user wasn't there
 * - Story prompts for memories with untold stories
 */

import React, { useState, memo, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Modal,
  FlatList,
  Dimensions,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import MemoryCard from './MemoryCard';
import MemoryRequestCard from './MemoryRequestCard';
import MemoryDetailModal from './MemoryDetailModal';
import { getMemoriesForPlaceYear, PEOPLE, INTERVIEW_QUESTIONS } from '../../data/placesData';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333333';
const TEXT_MUTED = '#666666';
const BORDER_COLOR = '#e0e0e0';
const SURFACE_COLOR = '#FFFFFF';
const BACKGROUND_COLOR = '#F0F4FF';

/**
 * People strip showing who was here this year
 */
const PeopleStrip = memo(({ people, onPersonPress }) => {
  return (
    <View style={styles.peopleStrip}>
      <Text style={styles.peopleLabel}>Who was here:</Text>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.peopleList}
      >
        {people.map((person) => (
          <TouchableOpacity
            key={person.id}
            style={styles.personChip}
            onPress={() => onPersonPress?.(person)}
          >
            <Image source={{ uri: person.avatar }} style={styles.personAvatar} />
            <Text style={styles.personName}>
              {person.id === 'me' ? 'You' : person.firstName}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
});

/**
 * View toggle (Grid / Feed)
 */
const ViewToggle = memo(({ view, onViewChange }) => {
  return (
    <View style={styles.viewToggle}>
      <TouchableOpacity
        style={[styles.toggleButton, view === 'grid' && styles.toggleButtonActive]}
        onPress={() => onViewChange('grid')}
      >
        <Ionicons 
          name="grid-outline" 
          size={18} 
          color={view === 'grid' ? '#FFF' : TEXT_MUTED} 
        />
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.toggleButton, view === 'feed' && styles.toggleButtonActive]}
        onPress={() => onViewChange('feed')}
      >
        <Ionicons 
          name="list-outline" 
          size={18} 
          color={view === 'feed' ? '#FFF' : TEXT_MUTED} 
        />
      </TouchableOpacity>
    </View>
  );
});

/**
 * Grid view of memories
 */
const MemoriesGrid = memo(({ memories, onMemoryPress }) => {
  return (
    <View style={styles.grid}>
      {memories.map((memory) => (
        <MemoryCard
          key={memory.id}
          memory={memory}
          variant="grid"
          onPress={onMemoryPress}
        />
      ))}
    </View>
  );
});

/**
 * Feed view of memories
 */
const MemoriesFeed = memo(({ memories, onMemoryPress, onStoryPromptPress, onAskAbout, onAnswerQuestion }) => {
  return (
    <View style={styles.feed}>
      {memories.map((memory) => (
        <MemoryCard
          key={memory.id}
          memory={memory}
          variant="default"
          onPress={onMemoryPress}
          onStoryPromptPress={onStoryPromptPress}
          onAskAbout={onAskAbout}
          onAnswerQuestion={onAnswerQuestion}
        />
      ))}
    </View>
  );
});

/**
 * Story prompts section
 */
const StoryPrompts = memo(({ memories, onPromptPress }) => {
  const memoriesWithStories = memories.filter(m => m.hasStory);
  
  if (memoriesWithStories.length === 0) return null;

  return (
    <View style={styles.storyPromptsSection}>
      <View style={styles.storyPromptsHeader}>
        <Ionicons name="mic" size={20} color={PRIMARY_COLOR} />
        <Text style={styles.storyPromptsTitle}>Untold Stories</Text>
      </View>
      <Text style={styles.storyPromptsSubtitle}>
        Record the stories behind these memories
      </Text>
      {memoriesWithStories.map((memory) => (
        <TouchableOpacity
          key={memory.id}
          style={styles.storyPromptCard}
          onPress={() => onPromptPress?.(memory)}
        >
          <Image source={{ uri: memory.author.avatar }} style={styles.promptAvatar} />
          <View style={styles.promptContent}>
            <Text style={styles.promptText}>{memory.storyPrompt}</Text>
            <Text style={styles.promptAuthor}>
              Ask {memory.author.firstName}
            </Text>
          </View>
          <Ionicons name="arrow-forward-circle" size={28} color={PRIMARY_COLOR} />
        </TouchableOpacity>
      ))}
    </View>
  );
});

/**
 * "I was here too" banner for adding your memory
 */
const IWasHereToo = memo(({ year, hasMyMemory, onPress }) => {
  if (hasMyMemory) return null;

  return (
    <TouchableOpacity style={styles.iWasHereBanner} onPress={onPress}>
      <View style={styles.iWasHereIcon}>
        <Ionicons name="add" size={20} color="#FFF" />
      </View>
      <View style={styles.iWasHereContent}>
        <Text style={styles.iWasHereTitle}>Were you here in {year}?</Text>
        <Text style={styles.iWasHereSubtitle}>Add your photos and join the memories</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={PRIMARY_COLOR} />
    </TouchableOpacity>
  );
});

/**
 * Main YearMemoriesModal component
 */
const YearMemoriesModal = ({
  visible,
  place,
  year,
  onClose,
  onMemoryPress,
  onAddMemory,
  onStartInterview,
}) => {
  const [viewMode, setViewMode] = useState('grid');
  // Internal navigation stack for this modal host. Each entry is a view we
  // layer over the year list (e.g. { type: 'memory' } or { type: 'ask' }).
  // Using one modal + swapped inline overlays avoids the blank-screen bug
  // caused by presenting/dismissing nested native <Modal>s at the same time.
  const [viewStack, setViewStack] = useState([]);
  const topView = viewStack[viewStack.length - 1] || null;

  const pushView = useCallback((view) => {
    setViewStack((s) => [...s, view]);
  }, []);
  const popView = useCallback(() => {
    setViewStack((s) => s.slice(0, -1));
  }, []);

  // Get memories for this place/year. Prefer memories embedded in the live
  // place detail; fall back to local mock data when they aren't present.
  const memories = useMemo(() => {
    if (!place || !year) return [];
    const yearData = (place.years || []).find((y) => y.year === year);
    if (yearData?.memories?.length) {
      return yearData.memories;
    }
    return getMemoriesForPlaceYear(place.id, year);
  }, [place, year]);

  // Get unique people
  const people = useMemo(() => {
    const peopleMap = {};
    memories.forEach(m => {
      if (!peopleMap[m.author.id]) {
        peopleMap[m.author.id] = m.author;
      }
    });
    return Object.values(peopleMap);
  }, [memories]);

  // Check if user has memory this year
  const hasMyMemory = useMemo(() => {
    return memories.some(m => m.isCurrentUser);
  }, [memories]);

  const handlePersonPress = useCallback((person) => {
    // Could filter to show only that person's memories
    console.log('Person pressed:', person.name);
  }, []);

  // Open the full memory reader when a card is tapped.
  const handleMemoryPress = useCallback((memory) => {
    pushView({ type: 'memory', memory });
    onMemoryPress?.(memory);
  }, [pushView, onMemoryPress]);

  const handleStoryPromptPress = useCallback((memory) => {
    onStartInterview?.(memory);
  }, [onStartInterview]);

  // Handle "Ask about this" - layers the request sheet over the current view.
  const handleAskAbout = useCallback((memory) => {
    pushView({ type: 'ask', memory });
  }, [pushView]);

  // Handle answering questions on YOUR OWN memory
  const handleAnswerQuestion = useCallback((memory, pendingQuestions) => {
    // For prototype: Show an alert with the questions
    const questionList = pendingQuestions.map(q => `• ${q.asker.firstName}: "${q.question}"`).join('\n');
    Alert.alert(
      'Questions About Your Memory',
      `People are curious about this memory!\n\n${questionList}`,
      [
        { text: 'Later', style: 'cancel' },
        { 
          text: 'Record Answer', 
          onPress: () => {
            // Navigate to interview mode to record an answer
            onStartInterview?.(memory, pendingQuestions[0]);
          }
        },
      ]
    );
  }, [onStartInterview]);

  // Handle sending a memory request
  const handleSendRequest = useCallback((requestData) => {
    // In real app, this would call the API to create a request
    console.log('Sending memory request:', requestData);
    Alert.alert(
      'Request Sent!',
      `Your question has been sent to ${requestData.recipient.firstName}. They'll be notified to share their story.`,
      [{ text: 'OK' }]
    );
    popView();
  }, [popView]);

  // Available recipients (people at this place excluding current user)
  const potentialRecipients = useMemo(() => {
    return people.filter(p => p.id !== 'me');
  }, [people]);

  if (!place || !year) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top']}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Ionicons name="close" size={24} color={TEXT_COLOR} />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{place.name}</Text>
            <Text style={styles.headerYear}>{year}</Text>
          </View>
          <ViewToggle view={viewMode} onViewChange={setViewMode} />
        </View>

        <ScrollView 
          style={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {/* People strip */}
          <PeopleStrip people={people} onPersonPress={handlePersonPress} />

          {/* "I was here too" banner */}
          <IWasHereToo 
            year={year} 
            hasMyMemory={hasMyMemory} 
            onPress={() => onAddMemory?.(place, year)} 
          />

          {/* Story prompts (if any) */}
          <StoryPrompts 
            memories={memories} 
            onPromptPress={handleStoryPromptPress} 
          />

          {/* Memories */}
          <View style={styles.memoriesSection}>
            <Text style={styles.memoriesTitle}>
              {memories.length} {memories.length === 1 ? 'Memory' : 'Memories'}
            </Text>
            
            {viewMode === 'grid' ? (
              <MemoriesGrid 
                memories={memories} 
                onMemoryPress={handleMemoryPress} 
              />
            ) : (
              <MemoriesFeed 
                memories={memories} 
                onMemoryPress={handleMemoryPress}
                onStoryPromptPress={handleStoryPromptPress}
                onAskAbout={handleAskAbout}
                onAnswerQuestion={handleAnswerQuestion}
              />
            )}
          </View>

          {/* Bottom padding */}
          <View style={{ height: 40 }} />
        </ScrollView>

        {/* Memory Detail (full reader) - inline overlay, no nested Modal */}
        {topView?.type === 'memory' && (
          <MemoryDetailModal
            memory={topView.memory}
            place={place}
            onClose={popView}
            onAsk={handleAskAbout}
            onStartInterview={(memory) => {
              setViewStack([]);
              handleStoryPromptPress(memory);
            }}
          />
        )}

        {/* Ask for a Story - inline overlay, no nested Modal */}
        {topView?.type === 'ask' && (
          <View style={styles.overlay}>
            <SafeAreaView style={styles.requestModalContainer} edges={['top']}>
              <View style={styles.requestModalHeader}>
                <TouchableOpacity onPress={popView} style={styles.closeButton}>
                  <Ionicons name="close" size={24} color={TEXT_COLOR} />
                </TouchableOpacity>
                <Text style={styles.requestModalTitle}>Ask for a Story</Text>
                <View style={{ width: 32 }} />
              </View>
              <MemoryRequestCard
                memory={topView.memory}
                potentialRecipients={potentialRecipients}
                preSelectedRecipient={topView.memory?.author}
                place={place}
                year={year}
                onSend={handleSendRequest}
                onCancel={popView}
              />
            </SafeAreaView>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },

  // Header
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
  },
  headerCenter: {
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  headerYear: {
    fontSize: 24,
    fontWeight: '700',
    color: PRIMARY_COLOR,
  },

  // View toggle
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: '#F0F0F0',
    borderRadius: 8,
    padding: 2,
  },
  toggleButton: {
    padding: 6,
    borderRadius: 6,
  },
  toggleButtonActive: {
    backgroundColor: PRIMARY_COLOR,
  },

  // Content
  content: {
    flex: 1,
  },

  // People strip
  peopleStrip: {
    paddingVertical: 12,
    backgroundColor: SURFACE_COLOR,
  },
  peopleLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: TEXT_MUTED,
    paddingHorizontal: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  peopleList: {
    paddingHorizontal: 16,
    gap: 8,
  },
  personChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingVertical: 6,
    paddingHorizontal: 10,
    paddingRight: 14,
    borderRadius: 20,
    gap: 8,
  },
  personAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#FFF',
  },
  personName: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_COLOR,
  },

  // "I was here too" banner
  iWasHereBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    padding: 14,
    backgroundColor: SURFACE_COLOR,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: PRIMARY_COLOR,
    borderStyle: 'dashed',
  },
  iWasHereIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iWasHereContent: {
    flex: 1,
    marginLeft: 12,
  },
  iWasHereTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  iWasHereSubtitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },

  // Story prompts section
  storyPromptsSection: {
    margin: 16,
    padding: 16,
    backgroundColor: '#FFF7ED',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  storyPromptsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  storyPromptsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  storyPromptsSubtitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginBottom: 12,
  },
  storyPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: SURFACE_COLOR,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  promptAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: BORDER_COLOR,
  },
  promptContent: {
    flex: 1,
    marginLeft: 10,
  },
  promptText: {
    fontSize: 13,
    fontWeight: '500',
    color: TEXT_COLOR,
  },
  promptAuthor: {
    fontSize: 11,
    color: PRIMARY_COLOR,
    marginTop: 2,
  },

  // Memories section
  memoriesSection: {
    padding: 16,
  },
  memoriesTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },

  // Feed
  feed: {
    gap: 0,
  },

  // Request modal
  requestModalContainer: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },
  // Inline overlay used for the memory reader / ask sheet (no nested Modal)
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BACKGROUND_COLOR,
    zIndex: 20,
  },
  requestModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: SURFACE_COLOR,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
  },
  requestModalTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
});

export default YearMemoriesModal;
