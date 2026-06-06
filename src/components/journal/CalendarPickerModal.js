/**
 * CalendarPickerModal Component (Native Version)
 * 
 * Full calendar modal for selecting a date.
 * Uses react-native-calendars for the calendar UI.
 * Note: Web uses CalendarPickerModal.web.js instead.
 */

import React, { memo, useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Format date to YYYY-MM-DD string (required by react-native-calendars)
 */
const formatDateString = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * CalendarPickerModal component (Native version)
 */
export const CalendarPickerModal = memo(({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
  markedDates = {}, // Dates with entries
  primaryColor = '#4361ee',
  minDate,
  maxDate,
}) => {
  const today = useMemo(() => formatDateString(new Date()), []);
  const currentDateString = useMemo(() => formatDateString(selectedDate), [selectedDate]);

  // Combine marked dates with selected date styling
  const calendarMarkedDates = useMemo(() => {
    const marks = { ...markedDates };
    
    // Add selected date styling
    marks[currentDateString] = {
      ...marks[currentDateString],
      selected: true,
      selectedColor: primaryColor,
    };
    
    // Style today if different from selected
    if (currentDateString !== today) {
      marks[today] = {
        ...marks[today],
        today: true,
        todayTextColor: primaryColor,
      };
    }
    
    return marks;
  }, [markedDates, currentDateString, today, primaryColor]);

  /**
   * Handle day press
   */
  const handleDayPress = (day) => {
    const newDate = new Date(day.dateString);
    onSelectDate(newDate);
    onClose();
  };

  /**
   * Go to today
   */
  const goToToday = () => {
    onSelectDate(new Date());
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContainer}>
              {/* Header */}
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Select Date</Text>
                <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Calendar */}
              <Calendar
                current={currentDateString}
                onDayPress={handleDayPress}
                markedDates={calendarMarkedDates}
                minDate={minDate ? formatDateString(minDate) : undefined}
                maxDate={maxDate ? formatDateString(maxDate) : undefined}
                enableSwipeMonths
                theme={{
                  backgroundColor: '#FFFFFF',
                  calendarBackground: '#FFFFFF',
                  textSectionTitleColor: '#666',
                  selectedDayBackgroundColor: primaryColor,
                  selectedDayTextColor: '#FFFFFF',
                  todayTextColor: primaryColor,
                  dayTextColor: '#333',
                  textDisabledColor: '#d9e1e8',
                  dotColor: primaryColor,
                  selectedDotColor: '#FFFFFF',
                  arrowColor: primaryColor,
                  disabledArrowColor: '#d9e1e8',
                  monthTextColor: '#333',
                  indicatorColor: primaryColor,
                  textDayFontWeight: '500',
                  textMonthFontWeight: '600',
                  textDayHeaderFontWeight: '500',
                  textDayFontSize: 15,
                  textMonthFontSize: 16,
                  textDayHeaderFontSize: 13,
                }}
                style={styles.calendar}
              />

              {/* Footer with Today button */}
              <View style={styles.footer}>
                <TouchableOpacity
                  style={[styles.todayButton, { backgroundColor: primaryColor }]}
                  onPress={goToToday}
                >
                  <Ionicons name="today-outline" size={18} color="#FFF" />
                  <Text style={styles.todayButtonText}>Today</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },

  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: Math.min(SCREEN_WIDTH - 40, 360),
    maxWidth: 400,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
      },
    }),
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },

  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },

  closeButton: {
    padding: 4,
    borderRadius: 20,
  },

  calendar: {
    borderRadius: 8,
    paddingBottom: 8,
  },

  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E5E5',
  },

  todayButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 6,
  },

  todayButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default CalendarPickerModal;
