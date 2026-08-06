/**
 * CalendarPickerModal Component (Native Version)
 *
 * Full-screen date picker backed by the platform's own control:
 *   - iOS     : UIDatePicker in `inline` mode. Shows a month grid; tapping the
 *               "August 2026 v" header collapses it into month/year wheels, which
 *               is the zoom-out behaviour of Apple's Calendar app.
 *   - Android : the system Material date dialog, which manages its own window.
 *   - Web     : CalendarPickerModal.web.js is used instead (see metro platform
 *               resolution -- do NOT add web extensions to metro sourceExts).
 *
 * NOTE ON `markedDates`: this prop is still accepted so callers (JournalScreen,
 * PersonJournalScreen) keep working unchanged, but it is intentionally IGNORED.
 * UIDatePicker is a system component and exposes no API for decorating
 * individual dates, so entry dots cannot be rendered here. This was a deliberate
 * trade chosen over keeping the JS calendar.
 */

import React, { memo, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Platform,
  SafeAreaView,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';

/** Coerce whatever the caller passed into a valid Date, falling back to today. */
const toDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

export const CalendarPickerModal = memo(({
  visible,
  selectedDate,
  onSelectDate,
  onClose,
  // eslint-disable-next-line no-unused-vars
  markedDates = {}, // accepted for API compatibility; see note above
  primaryColor = '#4361ee',
  minDate,
  maxDate,
}) => {
  // Held locally so the inline picker can be scrubbed without committing, and
  // Cancel can discard. Re-synced whenever the sheet is reopened.
  const [draftDate, setDraftDate] = useState(() => toDate(selectedDate));

  useEffect(() => {
    if (visible) setDraftDate(toDate(selectedDate));
  }, [visible, selectedDate]);

  const commit = useCallback((date) => {
    onSelectDate(date);
    onClose();
  }, [onSelectDate, onClose]);

  // ---------------------------------------------------------------------------
  // Android: the picker IS a dialog. Rendering it inside our own <Modal> would
  // nest two windows, so it is returned bare and dismisses itself.
  // ---------------------------------------------------------------------------
  if (Platform.OS === 'android') {
    if (!visible) return null;
    return (
      <DateTimePicker
        value={draftDate}
        mode="date"
        display="calendar"
        minimumDate={minDate ? toDate(minDate) : undefined}
        maximumDate={maxDate ? toDate(maxDate) : undefined}
        onChange={(event, date) => {
          if (event.type === 'set' && date) commit(date);
          else onClose();
        }}
      />
    );
  }

  // ---------------------------------------------------------------------------
  // iOS: full-screen sheet wrapping the inline UIDatePicker.
  // ---------------------------------------------------------------------------
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.sheet}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}>
            <Text style={[styles.headerAction, { color: primaryColor }]}>Cancel</Text>
          </TouchableOpacity>

          <Text style={styles.headerTitle}>Select Date</Text>

          <TouchableOpacity onPress={() => commit(draftDate)} hitSlop={12}>
            <Text style={[styles.headerAction, styles.headerActionStrong, { color: primaryColor }]}>
              Done
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.pickerWrap}>
          <DateTimePicker
            value={draftDate}
            mode="date"
            display="inline"
            accentColor={primaryColor}
            themeVariant="light"
            minimumDate={minDate ? toDate(minDate) : undefined}
            maximumDate={maxDate ? toDate(maxDate) : undefined}
            onChange={(_event, date) => { if (date) setDraftDate(date); }}
            style={styles.picker}
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.todayButton, { backgroundColor: primaryColor }]}
            onPress={() => commit(new Date())}
          >
            <Text style={styles.todayButtonText}>Today</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
});

const styles = StyleSheet.create({
  sheet: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E5E5',
  },

  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
  },

  headerAction: {
    fontSize: 17,
  },

  headerActionStrong: {
    fontWeight: '600',
  },

  // flex:1 is what lets the inline picker expand to fill the sheet rather than
  // collapsing to its compact intrinsic height.
  pickerWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },

  picker: {
    flex: 1,
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 22,
  },

  todayButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default CalendarPickerModal;
