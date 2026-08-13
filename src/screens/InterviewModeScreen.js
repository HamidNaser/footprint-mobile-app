/**
 * InterviewModeScreen - Guided interview for capturing elder stories
 * 
 * A special mode that guides users through asking family members
 * about their memories at specific places. Designed to be simple
 * and accessible for recording stories from older relatives.
 * 
 * Features:
 * - Large, clear UI for accessibility
 * - Step-by-step guided questions
 * - Voice recording with waveform visualization
 * - Photo attachment option
 * - Progress saving
 * - Can pause and resume later
 */

import React, { useState, useRef, useEffect, memo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Animated,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { INTERVIEW_QUESTIONS } from '../data/placesData';

// Theme colors
const PRIMARY_COLOR = '#4361ee';
const TEXT_COLOR = '#333333';
const TEXT_MUTED = '#666666';
const BORDER_COLOR = '#e0e0e0';
const SURFACE_COLOR = '#FFFFFF';
const BACKGROUND_COLOR = '#F0F4FF';
const SUCCESS_COLOR = '#10b981';
const RECORDING_COLOR = '#ef4444';

/**
 * Progress bar component
 */
const ProgressBar = memo(({ current, total }) => {
  const progress = (current / total) * 100;
  
  return (
    <View style={styles.progressContainer}>
      <View style={styles.progressBar}>
        <Animated.View 
          style={[styles.progressFill, { width: `${progress}%` }]} 
        />
      </View>
      <Text style={styles.progressText}>
        Question {current} of {total}
      </Text>
    </View>
  );
});

/**
 * Interviewee header
 */
const IntervieweeHeader = memo(({ person, place, onClose }) => (
  <View style={styles.header}>
    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
      <Ionicons name="close" size={28} color={TEXT_COLOR} />
    </TouchableOpacity>
    <View style={styles.headerCenter}>
      <Image source={{ uri: person?.avatar }} style={styles.headerAvatar} />
      <Text style={styles.headerTitle}>
        Interview with {person?.firstName || 'Family'}
      </Text>
      <Text style={styles.headerSubtitle}>
        About {place?.name || 'this place'}
      </Text>
    </View>
    <TouchableOpacity style={styles.helpButton}>
      <Ionicons name="help-circle-outline" size={28} color={TEXT_MUTED} />
    </TouchableOpacity>
  </View>
));

/**
 * Large question card
 */
const QuestionCard = memo(({ question, questionNumber }) => (
  <View style={styles.questionCard}>
    <View style={styles.questionNumber}>
      <Text style={styles.questionNumberText}>{questionNumber}</Text>
    </View>
    <Text style={styles.questionText}>{question.text}</Text>
    {question.hint && (
      <Text style={styles.questionHint}>{question.hint}</Text>
    )}
  </View>
));

/**
 * Recording interface (large button for accessibility)
 */
const RecordingInterface = memo(({ 
  isRecording, 
  duration,
  onStartRecording, 
  onStopRecording,
  onPlayback,
  hasRecording,
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <View style={styles.recordingContainer}>
      {isRecording && (
        <View style={styles.recordingIndicator}>
          <View style={styles.recordingDot} />
          <Text style={styles.recordingTime}>{formatDuration(duration)}</Text>
        </View>
      )}

      <View style={styles.recordingControls}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={[
              styles.recordButton,
              isRecording && styles.recordButtonRecording,
            ]}
            onPress={isRecording ? onStopRecording : onStartRecording}
          >
            <Ionicons 
              name={isRecording ? 'stop' : 'mic'} 
              size={48} 
              color="#FFF" 
            />
          </TouchableOpacity>
        </Animated.View>
        
        <Text style={styles.recordingLabel}>
          {isRecording 
            ? 'Tap to stop recording' 
            : hasRecording 
              ? 'Tap to re-record'
              : 'Tap to start recording'}
        </Text>
      </View>

      {hasRecording && !isRecording && (
        <TouchableOpacity style={styles.playbackButton} onPress={onPlayback}>
          <Ionicons name="play-circle" size={32} color={PRIMARY_COLOR} />
          <Text style={styles.playbackText}>Play Recording</Text>
        </TouchableOpacity>
      )}
    </View>
  );
});

/**
 * Text answer interface
 */
const TextAnswerInterface = memo(({ value, onChange }) => (
  <View style={styles.textAnswerContainer}>
    <TextInput
      style={styles.textAnswer}
      value={value}
      onChangeText={onChange}
      placeholder="Type the answer here..."
      placeholderTextColor={TEXT_MUTED}
      multiline
      numberOfLines={4}
    />
  </View>
));

/**
 * Photo attachment button
 */
const PhotoAttachment = memo(({ photos, onAddPhoto }) => (
  <View style={styles.photoSection}>
    <Text style={styles.photoLabel}>Add photos (optional)</Text>
    <View style={styles.photoRow}>
      {photos.map((photo, idx) => (
        <View key={idx} style={styles.photoThumb}>
          <Image source={{ uri: photo }} style={styles.photoImage} />
        </View>
      ))}
      <TouchableOpacity style={styles.addPhotoButton} onPress={onAddPhoto}>
        <Ionicons name="camera" size={24} color={PRIMARY_COLOR} />
        <Text style={styles.addPhotoText}>Add</Text>
      </TouchableOpacity>
    </View>
  </View>
));

/**
 * Navigation buttons
 */
const NavigationButtons = memo(({ 
  canGoBack, 
  canGoNext, 
  isLastQuestion,
  onBack, 
  onNext, 
  onFinish,
  onSkip,
}) => (
  <View style={styles.navigationContainer}>
    <TouchableOpacity 
      style={[styles.navButton, styles.backButton, !canGoBack && styles.navButtonDisabled]}
      onPress={onBack}
      disabled={!canGoBack}
    >
      <Ionicons name="arrow-back" size={24} color={canGoBack ? TEXT_COLOR : TEXT_MUTED} />
      <Text style={[styles.navButtonText, !canGoBack && styles.navButtonTextDisabled]}>
        Back
      </Text>
    </TouchableOpacity>

    <TouchableOpacity style={styles.skipButton} onPress={onSkip}>
      <Text style={styles.skipButtonText}>Skip</Text>
    </TouchableOpacity>

    <TouchableOpacity 
      style={[styles.navButton, styles.nextButton]}
      onPress={isLastQuestion ? onFinish : onNext}
    >
      <Text style={styles.nextButtonText}>
        {isLastQuestion ? 'Finish' : 'Next'}
      </Text>
      <Ionicons 
        name={isLastQuestion ? 'checkmark' : 'arrow-forward'} 
        size={24} 
        color="#FFF" 
      />
    </TouchableOpacity>
  </View>
));

/**
 * Import TextInput
 */
import { TextInput } from 'react-native';
import { Audio } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import MediaApi from '../api/MediaApi';
import { createInterviewSession } from '../utils/interviewSession';

/**
 * Main InterviewModeScreen component
 */
const InterviewModeScreen = ({
  person,
  place,
  memory,
  questionCategory = 'general',
  onComplete,
  onClose,
  onSaveProgress,
}) => {
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState({});
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // The live expo-av recording, held in a ref because it is a device handle rather than
  // rendered state.
  const recordingRef = useRef(null);

  // The server side of this interview. Answers used to live in component state and be
  // discarded on close; this is what makes them outlive the screen.
  const sessionRef = useRef(null);
  if (!sessionRef.current) {
    sessionRef.current = createInterviewSession({
      subject: person || memory?.author,
      place,
      // The memory being interviewed about. With it, finishing appends the story to that
      // entry rather than creating a second one beside the photographs it describes.
      targetEntryId: memory?.entryId || memory?.id,
      onError: setSaveError,
    });
  }

  // Get questions for this interview
  const questions = INTERVIEW_QUESTIONS[questionCategory] || INTERVIEW_QUESTIONS.general;
  const currentQuestion = questions[currentQuestionIndex];
  const totalQuestions = questions.length;

  // Recording timer
  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => {
        setRecordingDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleStartRecording = async () => {
    setSaveError(null);
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (!permission.granted) {
        // Say what happened rather than appearing to record and capturing nothing, which
        // is what this screen did before.
        setSaveError('Microphone access was blocked. Allow it in Settings to record.');
        return;
      }

      // Recording is silent on an iPhone with the ringer switch off unless this is set.
      // The failure is invisible: the UI counts up and the file is empty.
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });

      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
    } catch (e) {
      setSaveError(e?.message || 'Could not start recording.');
    }
  };

  const handleStopRecording = async () => {
    setIsRecording(false);

    const recording = recordingRef.current;
    recordingRef.current = null;
    if (!recording) return;

    let uri = null;
    try {
      await recording.stopAndUnloadAsync();
      uri = recording.getURI();
    } catch (e) {
      setSaveError(e?.message || 'Could not save that recording.');
      return;
    }

    // A button pressed and released captures nothing. An audio answer with no media
    // renders as a player that plays silence, which reads as a lost recording.
    if (!uri || recordingDuration <= 0) return;

    setBusy('Saving the recording...');
    try {
      // Uploaded now rather than at the end: the answers are worth keeping even if the
      // interview is abandoned, and a local file:// path means nothing to anyone else.
      const uploaded = await MediaApi.uploadMedia({ localUri: uri, type: 'audio' });
      const next = {
        ...answers,
        [currentQuestion.id]: {
          type: 'audio',
          url: uploaded.url,
          duration: recordingDuration,
        },
      };
      setAnswers(next);
      await sessionRef.current.persist(questions, next, photos);
    } catch (e) {
      setSaveError(e?.message || 'Could not upload that recording.');
    } finally {
      setBusy(null);
    }
  };

  const handlePlayback = async () => {
    const answer = answers[currentQuestion?.id];
    if (!answer?.url) return;

    try {
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync({ uri: answer.url }, { shouldPlay: true });
      // Freed once it finishes, rather than held open for the life of the screen.
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {
      setSaveError(e?.message || 'Could not play that recording.');
    }
  };

  const handleAddPhoto = async () => {
    setSaveError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setSaveError('Photo access was blocked. Allow it in Settings to attach photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;

      setBusy(result.assets.length === 1 ? 'Uploading photo...' : 'Uploading photos...');
      const uploaded = [];
      for (const asset of result.assets) {
        const media = await MediaApi.uploadMedia({ localUri: asset.uri, type: 'image' });
        uploaded.push({ url: media.url, uri: media.url });
      }

      const nextPhotos = [...photos, ...uploaded];
      setPhotos(nextPhotos);
      await sessionRef.current.persist(questions, answers, nextPhotos);
    } catch (e) {
      setSaveError(e?.message || 'Could not add that photo.');
    } finally {
      setBusy(null);
    }
  };

  const handleNext = () => {
    if (currentQuestionIndex < totalQuestions - 1) {
      // Saved on the way past, not only at the end. An interview is a conversation and
      // conversations get interrupted -- a phone call, a tired eighty-year-old, the app
      // backgrounded. You cannot ask again next week and get the same words.
      sessionRef.current.persist(questions, answers, photos);
      setCurrentQuestionIndex(prev => prev + 1);
      setRecordingDuration(0);
    }
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  };

  const handleSkip = () => {
    handleNext();
  };


  const handleFinish = async () => {
    setBusy('Saving the interview...');
    const outcome = await sessionRef.current.complete(questions, answers, photos);
    setBusy(null);

    // Stay on the screen when it could not be saved. The answers are still here and a
    // retry costs one tap; closing would throw away a conversation that cannot be had
    // twice. The error is already on screen via onError.
    if (!outcome) return;

    onComplete?.({
      person,
      place,
      memory,
      answers,
      photos,
      interviewId: outcome.interviewId,
      journalEntryId: outcome.journalEntryId,
      completedAt: new Date().toISOString(),
    });

    Alert.alert(
      'Interview Complete!',
      memory
        ? 'Their story has been added to this memory.'
        : 'Thank you for capturing this precious memory.'
    );
  };

  const hasCurrentAnswer = answers[currentQuestion?.id];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      {/* Header with interviewee info */}
      <IntervieweeHeader person={person} place={place} onClose={onClose} />

      {/* Progress bar */}
      <ProgressBar current={currentQuestionIndex + 1} total={totalQuestions} />

      <ScrollView 
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Question card */}
        <QuestionCard 
          question={currentQuestion} 
          questionNumber={currentQuestionIndex + 1}
        />

        {/* Answer interface - changes based on question type */}
        {currentQuestion?.type === 'audio' && (
          <RecordingInterface
            isRecording={isRecording}
            duration={recordingDuration}
            onStartRecording={handleStartRecording}
            onStopRecording={handleStopRecording}
            onPlayback={handlePlayback}
            hasRecording={!!hasCurrentAnswer}
          />
        )}

        {(currentQuestion?.type === 'text' || currentQuestion?.type === 'year') && (
          <TextAnswerInterface
            value={answers[currentQuestion.id]?.text || ''}
            onChange={(text) => setAnswers(prev => ({
              ...prev,
              [currentQuestion.id]: { type: 'text', text },
            }))}
          />
        )}

        {/* Photo attachment */}
        <PhotoAttachment photos={photos} onAddPhoto={handleAddPhoto} />

        {/* What the screen is doing, and what went wrong. Uploads and saves used to be
            entirely silent, so a failed recording looked identical to a saved one. */}
        {(busy || saveError) && (
          <Text style={saveError ? styles.interviewError : styles.interviewBusy}>
            {saveError || busy}
          </Text>
        )}
      </ScrollView>

      {/* Navigation */}
      <NavigationButtons
        canGoBack={currentQuestionIndex > 0}
        canGoNext={currentQuestionIndex < totalQuestions - 1}
        isLastQuestion={currentQuestionIndex === totalQuestions - 1}
        onBack={handleBack}
        onNext={handleNext}
        onFinish={handleFinish}
        onSkip={handleSkip}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  interviewBusy: {
    textAlign: 'center',
    color: TEXT_MUTED,
    fontSize: 13,
    marginTop: 12,
  },
  interviewError: {
    textAlign: 'center',
    color: '#EF4444',
    fontSize: 13,
    marginTop: 12,
    paddingHorizontal: 24,
  },
  container: {
    flex: 1,
    backgroundColor: BACKGROUND_COLOR,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
    alignItems: 'center',
  },
  headerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: PRIMARY_COLOR,
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: TEXT_COLOR,
  },
  headerSubtitle: {
    fontSize: 13,
    color: TEXT_MUTED,
  },
  helpButton: {
    padding: 4,
  },

  // Progress
  progressContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: SURFACE_COLOR,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#E0E0E0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: SUCCESS_COLOR,
    borderRadius: 4,
  },
  progressText: {
    fontSize: 12,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginTop: 8,
  },

  // Content
  content: {
    flex: 1,
  },
  contentContainer: {
    padding: 20,
  },

  // Question card
  questionCard: {
    backgroundColor: SURFACE_COLOR,
    borderRadius: 20,
    padding: 24,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    alignItems: 'center',
  },
  questionNumber: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  questionNumberText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
  },
  questionText: {
    fontSize: 22,
    fontWeight: '600',
    color: TEXT_COLOR,
    textAlign: 'center',
    lineHeight: 30,
  },
  questionHint: {
    fontSize: 14,
    color: TEXT_MUTED,
    textAlign: 'center',
    marginTop: 8,
  },

  // Recording interface
  recordingContainer: {
    alignItems: 'center',
    marginBottom: 24,
  },
  recordingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  recordingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: RECORDING_COLOR,
  },
  recordingTime: {
    fontSize: 24,
    fontWeight: '600',
    color: RECORDING_COLOR,
  },
  recordingControls: {
    alignItems: 'center',
  },
  recordButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: PRIMARY_COLOR,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: PRIMARY_COLOR,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  recordButtonRecording: {
    backgroundColor: RECORDING_COLOR,
    shadowColor: RECORDING_COLOR,
  },
  recordingLabel: {
    fontSize: 14,
    color: TEXT_MUTED,
    marginTop: 12,
  },
  playbackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
    padding: 12,
    backgroundColor: '#F0F4FF',
    borderRadius: 12,
  },
  playbackText: {
    fontSize: 14,
    fontWeight: '500',
    color: PRIMARY_COLOR,
  },

  // Text answer
  textAnswerContainer: {
    marginBottom: 24,
  },
  textAnswer: {
    backgroundColor: SURFACE_COLOR,
    borderRadius: 16,
    padding: 16,
    fontSize: 18,
    color: TEXT_COLOR,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },

  // Photo section
  photoSection: {
    marginBottom: 24,
  },
  photoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_MUTED,
    marginBottom: 12,
  },
  photoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  photoThumb: {
    width: 70,
    height: 70,
    borderRadius: 12,
    overflow: 'hidden',
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  addPhotoButton: {
    width: 70,
    height: 70,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: PRIMARY_COLOR,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0F4FF',
  },
  addPhotoText: {
    fontSize: 11,
    color: PRIMARY_COLOR,
    marginTop: 2,
  },

  // Navigation
  navigationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingBottom: 8,
    backgroundColor: SURFACE_COLOR,
    borderTopWidth: 1,
    borderTopColor: BORDER_COLOR,
    gap: 12,
  },
  navButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 12,
    gap: 6,
  },
  navButtonDisabled: {
    opacity: 0.5,
  },
  backButton: {
    backgroundColor: '#F0F0F0',
  },
  navButtonText: {
    fontSize: 15,
    fontWeight: '500',
    color: TEXT_COLOR,
  },
  navButtonTextDisabled: {
    color: TEXT_MUTED,
  },
  skipButton: {
    flex: 1,
    alignItems: 'center',
    padding: 14,
  },
  skipButtonText: {
    fontSize: 14,
    color: TEXT_MUTED,
  },
  nextButton: {
    backgroundColor: PRIMARY_COLOR,
  },
  nextButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
});

export default InterviewModeScreen;
