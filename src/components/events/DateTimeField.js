/**
 * DateTimeField — a two-part date & time picker used by the event form.
 *
 * Reuses the app's existing `CalendarPickerModal` (react-native-calendars) for
 * the date, and a lightweight stepper modal for the time — this avoids adding a
 * native `@react-native-community/datetimepicker` dependency.
 *
 * Props:
 *   value: Date            — current value
 *   onChange: (Date) => {} — called with the merged date+time
 *   accent?: string        — theme color
 */

import React, { memo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CalendarPickerModal } from '../journal';
import { formatEventDate, formatEventTime } from '../../data/eventsData';

const PRIMARY = '#4361ee';

const parseDate = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? new Date() : d;
};

const Stepper = memo(({ label, onUp, onDown, children }) => (
  <View style={styles.stepper}>
    <TouchableOpacity style={styles.stepBtn} onPress={onUp}>
      <Ionicons name="chevron-up" size={22} color="#475569" />
    </TouchableOpacity>
    <Text style={styles.stepValue}>{children}</Text>
    <TouchableOpacity style={styles.stepBtn} onPress={onDown}>
      <Ionicons name="chevron-down" size={22} color="#475569" />
    </TouchableOpacity>
    <Text style={styles.stepLabel}>{label}</Text>
  </View>
));
Stepper.displayName = 'TimeStepper';

const DateTimeField = memo(({ value, onChange, accent = PRIMARY }) => {
  const date = parseDate(value);
  const [showCalendar, setShowCalendar] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [draft, setDraft] = useState(date);

  const openTime = useCallback(() => {
    setDraft(parseDate(value));
    setShowTime(true);
  }, [value]);

  const handleSelectDate = useCallback(
    (picked) => {
      // CalendarPickerModal passes a Date built from a 'YYYY-MM-DD' string
      // (UTC midnight); read UTC parts to avoid a timezone off-by-one, and
      // keep the existing time-of-day.
      const p = picked instanceof Date ? picked : new Date(picked);
      const next = new Date(date);
      next.setFullYear(p.getUTCFullYear(), p.getUTCMonth(), p.getUTCDate());
      onChange?.(next);
      setShowCalendar(false);
    },
    [date, onChange]
  );

  // ---- Time stepper helpers ----
  const hour12 = ((draft.getHours() + 11) % 12) + 1;
  const isPm = draft.getHours() >= 12;
  const minutes = draft.getMinutes();

  const bump = (mutator) => {
    const next = new Date(draft);
    mutator(next);
    setDraft(next);
  };

  const changeHour = (delta) => bump((d) => d.setHours((d.getHours() + delta + 24) % 24));
  const changeMinute = (delta) =>
    bump((d) => {
      const total = (d.getHours() * 60 + d.getMinutes() + delta * 5 + 1440) % 1440;
      d.setHours(Math.floor(total / 60), total % 60);
    });
  const toggleAmPm = () => bump((d) => d.setHours((d.getHours() + 12) % 24));

  const confirmTime = () => {
    onChange?.(draft);
    setShowTime(false);
  };

  return (
    <View>
      <View style={styles.row}>
        <TouchableOpacity style={styles.field} onPress={() => setShowCalendar(true)}>
          <Ionicons name="calendar-outline" size={18} color={accent} />
          <Text style={styles.fieldText}>{formatEventDate(date)}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.field} onPress={openTime}>
          <Ionicons name="time-outline" size={18} color={accent} />
          <Text style={styles.fieldText}>{formatEventTime(date)}</Text>
        </TouchableOpacity>
      </View>

      <CalendarPickerModal
        visible={showCalendar}
        selectedDate={date}
        onSelectDate={handleSelectDate}
        onClose={() => setShowCalendar(false)}
        primaryColor={accent}
      />

      <Modal visible={showTime} transparent animationType="fade" onRequestClose={() => setShowTime(false)}>
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setShowTime(false)}
        >
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Pick a time</Text>
            <View style={styles.steppers}>
              <Stepper
                label="Hour"
                onUp={() => changeHour(1)}
                onDown={() => changeHour(-1)}
              >
                {String(hour12).padStart(2, '0')}
              </Stepper>
              <Text style={styles.colon}>:</Text>
              <Stepper
                label="Min"
                onUp={() => changeMinute(1)}
                onDown={() => changeMinute(-1)}
              >
                {String(minutes).padStart(2, '0')}
              </Stepper>
              <TouchableOpacity style={styles.ampm} onPress={toggleAmPm}>
                <Text style={[styles.ampmText, { color: accent }]}>{isPm ? 'PM' : 'AM'}</Text>
                <Ionicons name="swap-vertical" size={16} color={accent} />
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: accent }]} onPress={confirmTime}>
              <Text style={styles.confirmText}>Set time</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
});

DateTimeField.displayName = 'DateTimeField';

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 10,
  },
  field: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  fieldText: {
    fontSize: 14,
    color: '#1e293b',
    fontWeight: '500',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 20,
  },
  sheetTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    textAlign: 'center',
    marginBottom: 16,
  },
  steppers: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 20,
  },
  stepper: {
    alignItems: 'center',
  },
  stepBtn: {
    padding: 4,
  },
  stepValue: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1e293b',
    fontVariant: ['tabular-nums'],
  },
  stepLabel: {
    fontSize: 11,
    color: '#8a94a6',
    marginTop: 2,
  },
  colon: {
    fontSize: 30,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 18,
  },
  ampm: {
    marginLeft: 8,
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#f1f5f9',
  },
  ampmText: {
    fontSize: 16,
    fontWeight: '700',
  },
  confirmBtn: {
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default DateTimeField;
