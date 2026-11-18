/**
 * CalendarSheet Component (Web Version)
 *
 * The Journal's calendar sheet in the app's web build. The calendar itself is
 * `CalendarSheetBody.js`, shared with the native entry point; this file exists to answer the two
 * questions a browser answers differently, and to be the name metro resolves. Read
 * `CalendarSheetBody.js`'s header for the calendar, for the prop contract, and for why the two
 * platform entry points are thin rather than a copy each.
 *
 * - **`useNativeDriver` is `false`.** There is no native animated module in a browser;
 *   `react-native-web` runs the animation itself, and asking for the native driver there warns
 *   and falls back to this anyway.
 * - **`sheetStyle` caps the width and centres it.** A browser window is far wider than a phone,
 *   and a calendar stretched the width of a monitor would put a day tile the size of a playing
 *   card in each corner of it. It stays about the width of a phone, against the bottom of the
 *   window, which is what a sheet is a picture of.
 *
 * Two things that look as though they ought to be here and are not, both explained in
 * `CalendarSheetBody.js`'s header: the pointer cursor (`react-native-web` already sets it, and
 * already withholds it from a disabled control, which is the part worth having), and any
 * stand-in for Android's back button (`react-native-web`'s own `Modal` calls `onRequestClose`
 * for the Escape key, so FR-003's third way out is already wired).
 *
 * ⚠ `CalendarSheet.js` is the other entry point, and metro resolves between the two by
 * platform -- which is why, as `CalendarPickerModal.js`'s header warns, **web extensions must not
 * be added to metro's `sourceExts`**.
 */

import React from 'react';
import { StyleSheet } from 'react-native';

import CalendarSheetBody, { CALENDAR_SHEET_COLOURS } from './CalendarSheetBody';

export { CALENDAR_SHEET_COLOURS };

const styles = StyleSheet.create({
  sheet: {
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
  },
});

export const CalendarSheet = (props) => (
  <CalendarSheetBody {...props} useNativeDriver={false} sheetStyle={styles.sheet} />
);

export default CalendarSheet;
