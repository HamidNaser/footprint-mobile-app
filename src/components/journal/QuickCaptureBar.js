/**
 * QuickCaptureBar Component (WhatsApp-style)
 * 
 * Bottom input bar that:
 * - Has expandable text input (grows as you type)
 * - Visibility selector (Facebook-style audience picker)
 * - Camera icon for photo capture
 * - Microphone icon for audio recording
 * - Send button appears when text is entered
 */

import React, { memo, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VisibilityOptions, VISIBILITY_CONFIG } from './JournalComposeModal';

/**
 * QuickCaptureBar Component (WhatsApp-style)
 */
const QuickCaptureBar = memo(({
  onSend,
  onCameraPress,
  onMicPress,
  placeholder = 'Message...',
  primaryColor = '#4361ee',
  defaultVisibility = VisibilityOptions.PRIVATE,
  style,
}) => {
  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(40);
  const [visibility, setVisibility] = useState(defaultVisibility);
  const [showVisibilityMenu, setShowVisibilityMenu] = useState(false);
  const inputRef = useRef(null);
  
  const hasText = text.trim().length > 0;
  const MAX_HEIGHT = 120; // Max 5-6 lines
  const MIN_HEIGHT = 40;
  
  const visibilityConfig = VISIBILITY_CONFIG[visibility];

  const handleSend = useCallback(() => {
    if (!hasText) return;
    
    onSend?.(text.trim(), visibility);
    setText('');
    setInputHeight(MIN_HEIGHT);
    Keyboard.dismiss();
  }, [text, hasText, visibility, onSend]);

  const handleContentSizeChange = useCallback((event) => {
    const newHeight = Math.min(
      Math.max(event.nativeEvent.contentSize.height, MIN_HEIGHT),
      MAX_HEIGHT
    );
    setInputHeight(newHeight);
  }, []);
  
  const handleSelectVisibility = useCallback((selected) => {
    setVisibility(selected);
    setShowVisibilityMenu(false);
  }, []);

  return (
    <View style={[styles.container, style]}>
      {/* Visibility button - icon only */}
      <TouchableOpacity
        style={styles.visibilityButton}
        onPress={() => setShowVisibilityMenu(true)}
        activeOpacity={0.7}
      >
        <Ionicons name={visibilityConfig.icon} size={20} color={primaryColor} />
      </TouchableOpacity>

      {/* Text input container */}
      <View style={styles.inputContainer}>
        <TextInput
          ref={inputRef}
          style={[styles.textInput, { height: Math.max(inputHeight, MIN_HEIGHT) }]}
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#999"
          multiline
          onContentSizeChange={handleContentSizeChange}
          textAlignVertical="center"
        />
      </View>

      {/* Camera button */}
      <TouchableOpacity
        style={styles.iconButton}
        onPress={onCameraPress}
        activeOpacity={0.7}
      >
        <Ionicons name="camera-outline" size={24} color="#666" />
      </TouchableOpacity>

      {/* Mic or Send button */}
      {hasText ? (
        <TouchableOpacity
          style={[styles.sendButton, { backgroundColor: primaryColor }]}
          onPress={handleSend}
          activeOpacity={0.8}
        >
          <Ionicons name="send" size={20} color="#FFF" />
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={styles.iconButton}
          onPress={onMicPress}
          activeOpacity={0.7}
        >
          <Ionicons name="mic-outline" size={24} color="#666" />
        </TouchableOpacity>
      )}

      {/* Visibility Menu Modal */}
      <Modal visible={showVisibilityMenu} transparent animationType="fade">
        <TouchableOpacity
          style={styles.visibilityOverlay}
          activeOpacity={1}
          onPress={() => setShowVisibilityMenu(false)}
        >
          <View style={styles.visibilityMenu}>
            <Text style={styles.visibilityMenuTitle}>Who can see this?</Text>
            {Object.entries(VISIBILITY_CONFIG).map(([key, cfg]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.visibilityOption,
                  visibility === key && { backgroundColor: primaryColor + '15' },
                ]}
                onPress={() => handleSelectVisibility(key)}
              >
                <Ionicons 
                  name={cfg.icon} 
                  size={22} 
                  color={visibility === key ? primaryColor : '#8E8E93'} 
                />
                <Text style={[
                  styles.visibilityOptionText,
                  visibility === key && { color: primaryColor, fontWeight: '600' },
                ]}>
                  {cfg.label}
                </Text>
                {visibility === key && (
                  <Ionicons name="checkmark" size={22} color={primaryColor} />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: '#FFF',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E0E0E0',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
      },
      android: {
        elevation: 4,
      },
    }),
  },

  visibilityButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },

  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  inputContainer: {
    flex: 1,
    backgroundColor: '#F0F0F0',
    borderRadius: 20,
    marginHorizontal: 4,
    paddingHorizontal: 12,
    justifyContent: 'center',
    minHeight: 40,
  },

  textInput: {
    fontSize: 16,
    color: '#000',
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    maxHeight: 120,
  },

  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Visibility menu styles
  visibilityOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  visibilityMenu: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  visibilityMenuTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#000',
    textAlign: 'center',
    marginBottom: 16,
  },
  visibilityOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  visibilityOptionText: {
    flex: 1,
    fontSize: 16,
    color: '#000',
    marginLeft: 14,
  },
});

export { QuickCaptureBar };
export default QuickCaptureBar;
