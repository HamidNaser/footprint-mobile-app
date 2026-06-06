/**
 * CalendarPickerModal Component (Web Version)
 * 
 * Full calendar modal for selecting a date.
 * Uses a custom WebCalendar component since react-native-calendars
 * doesn't work on web.
 */

import React, { memo, useState, useMemo } from 'react';
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Format date to YYYY-MM-DD string
 */
const formatDateString = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Web calendar component using TouchableOpacity grid
 */
const WebCalendar = memo(({ selectedDate, onSelectDate, primaryColor, markedDates = {} }) => {
  const [viewDate, setViewDate] = useState(new Date(selectedDate));
  
  const daysInMonth = useMemo(() => {
    const year = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];
    
    // Add empty cells for days before the first day of the month
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }
    
    // Add all days in the month
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d));
    }
    
    return days;
  }, [viewDate]);
  
  const monthName = viewDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  
  const goToPrevMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };
  
  const goToNextMonth = () => {
    setViewDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };
  
  const isSelected = (date) => {
    if (!date) return false;
    return formatDateString(date) === formatDateString(selectedDate);
  };
  
  const isToday = (date) => {
    if (!date) return false;
    return formatDateString(date) === formatDateString(new Date());
  };

  const hasEntries = (date) => {
    if (!date) return false;
    const dateStr = formatDateString(date);
    return markedDates[dateStr]?.marked === true;
  };
  
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  
  return (
    <View style={webCalendarStyles.container}>
      {/* Month navigation */}
      <View style={webCalendarStyles.monthNav}>
        <TouchableOpacity onPress={goToPrevMonth} style={webCalendarStyles.navButton}>
          <Ionicons name="chevron-back" size={20} color={primaryColor} />
        </TouchableOpacity>
        <Text style={webCalendarStyles.monthText}>{monthName}</Text>
        <TouchableOpacity onPress={goToNextMonth} style={webCalendarStyles.navButton}>
          <Ionicons name="chevron-forward" size={20} color={primaryColor} />
        </TouchableOpacity>
      </View>
      
      {/* Day headers */}
      <View style={webCalendarStyles.dayHeaders}>
        {dayNames.map(day => (
          <Text key={day} style={webCalendarStyles.dayHeader}>{day}</Text>
        ))}
      </View>
      
      {/* Calendar grid */}
      <View style={webCalendarStyles.grid}>
        {daysInMonth.map((date, index) => (
          <TouchableOpacity
            key={index}
            style={[
              webCalendarStyles.dayCell,
              date && isSelected(date) && { backgroundColor: primaryColor },
              date && isToday(date) && !isSelected(date) && webCalendarStyles.todayCell,
            ]}
            onPress={() => date && onSelectDate(date)}
            disabled={!date}
          >
            {date && (
              <>
                <Text style={[
                  webCalendarStyles.dayText,
                  isSelected(date) && webCalendarStyles.selectedText,
                  isToday(date) && !isSelected(date) && { color: primaryColor, fontWeight: '700' },
                ]}>
                  {date.getDate()}
                </Text>
                {hasEntries(date) && (
                  <View style={[webCalendarStyles.entryDot, { backgroundColor: isSelected(date) ? '#fff' : primaryColor }]} />
                )}
              </>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
});

const webCalendarStyles = StyleSheet.create({
  container: {
    padding: 16,
  },
  monthNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  navButton: {
    padding: 8,
  },
  monthText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  dayHeaders: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dayHeader: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  entryDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    position: 'absolute',
    bottom: 4,
  },
  todayCell: {
    borderWidth: 1,
    borderColor: '#4361ee',
  },
  dayText: {
    fontSize: 14,
    color: '#333',
  },
  selectedText: {
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

/**
 * CalendarPickerModal component (Web version)
 */
export const CalendarPickerModal = memo(({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
  markedDates = {},
  primaryColor = '#4361ee',
  minDate,
  maxDate,
}) => {
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

              {/* Web Calendar */}
              <WebCalendar
                selectedDate={selectedDate}
                onSelectDate={(date) => {
                  onSelectDate(date);
                  onClose();
                }}
                primaryColor={primaryColor}
                markedDates={markedDates}
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
