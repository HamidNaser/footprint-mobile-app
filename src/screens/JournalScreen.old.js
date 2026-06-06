import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons, Feather, FontAwesome5 } from '@expo/vector-icons';

// Sample data for journal entries
const journalEntries = [
  {
    id: 1,
    user: {
      name: 'Akram Naser',
      avatar: 'https://i.pravatar.cc/150?img=12',
    },
    timestamp: '3 hours ago',
    content:
      "I'm leaving today to pickup Rana from the airport. She will be arriving at 2:00 PM from Mexico today. We are going to meet with the rest of the family for dinner.",
    reactions: {
      claps: 2,
      checks: 3,
      likes: 1,
    },
    comments: 11,
    hasAudio: false,
  },
  {
    id: 2,
    user: {
      name: 'Akram Naser',
      avatar: 'https://i.pravatar.cc/150?img=12',
    },
    timestamp: '3 hours ago',
    content:
      'Picked up Rana from the airport and heading home now to meet with the rest of the family. Reem and AbdelHadi are coming for dinner.',
    reactions: {
      claps: 2,
      checks: 3,
    },
    views: 5,
    isPrivate: true,
    replies: {
      count: 9,
      avatars: [
        'https://i.pravatar.cc/150?img=1',
        'https://i.pravatar.cc/150?img=2',
        'https://i.pravatar.cc/150?img=3',
        'https://i.pravatar.cc/150?img=4',
        'https://i.pravatar.cc/150?img=5',
      ],
    },
    hasAudio: true,
    audioDuration: '02:45',
  },
];

// Streak flames component
const StreakIndicator = () => {
  const streakDays = 7;
  return (
    <View style={styles.streakContainer}>
      {[...Array(streakDays)].map((_, index) => (
        <Text key={index} style={styles.flameIcon}>
          🔥
        </Text>
      ))}
    </View>
  );
};

// Date selector component
const DateSelector = ({ date }) => {
  return (
    <View style={styles.dateSelector}>
      <TouchableOpacity style={styles.dateArrow}>
        <Ionicons name="chevron-back" size={20} color="#666" />
      </TouchableOpacity>
      <Text style={styles.dateText}>{date}</Text>
      <TouchableOpacity style={styles.dateArrow}>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </TouchableOpacity>
    </View>
  );
};

// Audio player component
const AudioPlayer = ({ duration }) => {
  return (
    <View style={styles.audioPlayer}>
      <TouchableOpacity style={styles.playButton}>
        <Ionicons name="play" size={16} color="#fff" />
      </TouchableOpacity>
      <View style={styles.waveformContainer}>
        {[...Array(20)].map((_, index) => (
          <View
            key={index}
            style={[
              styles.waveformBar,
              { height: Math.random() * 20 + 5 },
            ]}
          />
        ))}
      </View>
      <Text style={styles.audioDuration}>{duration}</Text>
      <Text style={styles.audioSpeed}>1x</Text>
      <TouchableOpacity>
        <Ionicons name="ellipsis-vertical" size={16} color="#666" />
      </TouchableOpacity>
    </View>
  );
};

// Journal entry component
const JournalEntry = ({ entry }) => {
  return (
    <View style={styles.entryCard}>
      {/* Header */}
      <View style={styles.entryHeader}>
        <Image source={{ uri: entry.user.avatar }} style={styles.avatar} />
        <View style={styles.entryHeaderText}>
          <Text style={styles.userName}>{entry.user.name}</Text>
          <View style={styles.timestampContainer}>
            <Text style={styles.timestamp}>• {entry.timestamp}</Text>
            {entry.views && (
              <View style={styles.viewsContainer}>
                <Feather name="users" size={12} color="#666" />
                <Text style={styles.viewsText}>{entry.views}</Text>
              </View>
            )}
            {entry.isPrivate && (
              <Ionicons name="eye-off" size={12} color="#666" style={styles.privateIcon} />
            )}
          </View>
        </View>
      </View>

      {/* Content */}
      <Text style={styles.entryContent}>{entry.content}</Text>

      {/* Reactions */}
      <View style={styles.reactionsContainer}>
        {entry.reactions.claps && (
          <View style={styles.reactionButton}>
            <Text style={styles.reactionEmoji}>👏</Text>
            <Text style={styles.reactionCount}>{entry.reactions.claps}</Text>
          </View>
        )}
        {entry.reactions.checks && (
          <View style={[styles.reactionButton, styles.reactionButtonActive]}>
            <Text style={styles.reactionEmoji}>☑️</Text>
            <Text style={[styles.reactionCount, styles.reactionCountActive]}>
              {entry.reactions.checks}
            </Text>
          </View>
        )}
        {entry.reactions.likes && (
          <View style={styles.reactionButton}>
            <Text style={styles.reactionEmoji}>👍</Text>
            <Text style={styles.reactionCount}>{entry.reactions.likes}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.addReactionButton}>
          <MaterialCommunityIcons name="emoticon-outline" size={18} color="#666" />
        </TouchableOpacity>
        {entry.comments && (
          <View style={styles.commentsButton}>
            <Ionicons name="chatbubble-outline" size={16} color="#666" />
            <Text style={styles.commentsCount}>{entry.comments}</Text>
          </View>
        )}
      </View>

      {/* Replies */}
      {entry.replies && (
        <View style={styles.repliesContainer}>
          <View style={styles.repliesAvatars}>
            {entry.replies.avatars.slice(0, 5).map((avatar, index) => (
              <Image
                key={index}
                source={{ uri: avatar }}
                style={[
                  styles.replyAvatar,
                  { marginLeft: index > 0 ? -8 : 0, zIndex: 5 - index },
                ]}
              />
            ))}
          </View>
          <Text style={styles.repliesText}>{entry.replies.count} replies</Text>
        </View>
      )}

      {/* Audio Player */}
      {entry.hasAudio && <AudioPlayer duration={entry.audioDuration} />}
    </View>
  );
};

export default function JournalScreen() {
  const [inputText, setInputText] = useState('');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Journal</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerIcon}>
            <Ionicons name="notifications-outline" size={24} color="#333" />
          </TouchableOpacity>
          <TouchableOpacity>
            <Image
              source={{ uri: 'https://i.pravatar.cc/150?img=12' }}
              style={styles.headerAvatar}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Streak */}
      <StreakIndicator />

      {/* Date Selector */}
      <DateSelector date="Wed, 24 May" />

      {/* Journal Entries */}
      <ScrollView
        style={styles.entriesContainer}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.entriesContent}
      >
        {journalEntries.map((entry) => (
          <JournalEntry key={entry.id} entry={entry} />
        ))}
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab}>
        <Ionicons name="chatbubble" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TouchableOpacity style={styles.addButton}>
          <Ionicons name="add" size={24} color="#666" />
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          placeholder="Write something..."
          placeholderTextColor="#999"
          value={inputText}
          onChangeText={setInputText}
        />
        <TouchableOpacity style={styles.inputIcon}>
          <Ionicons name="camera-outline" size={22} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.inputIcon}>
          <Ionicons name="mic-outline" size={22} color="#666" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4FF',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a2e',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIcon: {
    padding: 4,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#4361ee',
  },
  streakContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 8,
    gap: 2,
  },
  flameIcon: {
    fontSize: 20,
  },
  dateSelector: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    gap: 16,
  },
  dateArrow: {
    padding: 8,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  entriesContainer: {
    flex: 1,
  },
  entriesContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  entryCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  entryHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
  },
  entryHeaderText: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4361ee',
  },
  timestampContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  timestamp: {
    fontSize: 13,
    color: '#888',
  },
  viewsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    gap: 4,
  },
  viewsText: {
    fontSize: 12,
    color: '#666',
  },
  privateIcon: {
    marginLeft: 6,
  },
  entryContent: {
    fontSize: 15,
    lineHeight: 22,
    color: '#333',
    marginBottom: 12,
  },
  reactionsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 4,
  },
  reactionButtonActive: {
    backgroundColor: '#e8f0fe',
  },
  reactionEmoji: {
    fontSize: 14,
  },
  reactionCount: {
    fontSize: 13,
    color: '#666',
    fontWeight: '500',
  },
  reactionCountActive: {
    color: '#4361ee',
  },
  addReactionButton: {
    padding: 6,
  },
  commentsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 4,
  },
  commentsCount: {
    fontSize: 13,
    color: '#666',
  },
  repliesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  repliesAvatars: {
    flexDirection: 'row',
  },
  replyAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#fff',
  },
  repliesText: {
    fontSize: 14,
    color: '#4361ee',
    fontWeight: '500',
  },
  audioPlayer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: 24,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginTop: 12,
    gap: 8,
  },
  playButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4361ee',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveformContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    gap: 2,
  },
  waveformBar: {
    width: 3,
    backgroundColor: '#4361ee',
    borderRadius: 2,
  },
  audioDuration: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  audioSpeed: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 80,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#7c3aed',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 8,
  },
  addButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f5f5f5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    paddingVertical: 8,
  },
  inputIcon: {
    padding: 6,
  },
});
