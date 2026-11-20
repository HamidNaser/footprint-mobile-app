/**
 * CalendarSheet Component (Native Version)
 *
 * The Journal's calendar sheet on iOS and Android. The calendar itself is
 * `CalendarSheetBody.js`, shared with the web build; this file exists to answer the two
 * questions that have a different answer on a phone than in a browser, and to be the name metro
 * resolves. Read `CalendarSheetBody.js`'s header for the calendar, for the prop contract, and for
 * why the two platform entry points are thin rather than a copy each.
 *
 * On a phone both answers are the defaults, so this wrapper passes only the one it is worth being
 * explicit about:
 *
 * - **`useNativeDriver`** is `true`. There is a native animated module here, and the slide up
 *   belongs on it: it runs on the UI thread, so the sheet keeps moving smoothly even while
 *   JavaScript is busy building the grid behind it.
 * - **`sheetStyle`** is nothing. A phone's screen is the width the sheet wants.
 *
 * ⚠ `CalendarSheet.web.js` is the other entry point, and metro resolves between the two by
 * platform -- which is why, as `CalendarPickerModal.js`'s header warns, **web extensions must not
 * be added to metro's `sourceExts`**.
 */

import React from 'react';

import CalendarSheetBody, { CALENDAR_SHEET_COLOURS } from './CalendarSheetBody';

export { CALENDAR_SHEET_COLOURS };

export const CalendarSheet = (props) => (
  <CalendarSheetBody {...props} useNativeDriver />
);

export default CalendarSheet;
