/**
 * CalendarSheet Component (Web Version)
 *
 * 016 User Story 1: the book-style calendar the Journal's date bar opens, sliding up from the
 * bottom of the screen (FR-001). It replaces the platform's own white date picker on the
 * Journal tab -- `CalendarPickerModal`, which stays exactly as it is for the two other screens
 * that use it, `PersonJournalScreen` and `DateTimeField` (FR-015).
 *
 * Date, Month and Year; a month list and a twelve-year list, both reachable from the headers;
 * arrows that move by whatever set is on screen; faded days that cannot be tapped; counts on
 * the month and year tiles; today ringed in gold. **There is no Apply and no Done** -- a tap
 * takes effect at once (design §3), which is the whole reason this replaces a picker that had
 * Cancel and Done.
 *
 * ## It is presentational, and that is load-bearing
 *
 * It owns the sheet's own view state -- which of the three views is showing, which month and
 * year, which drop-down list is open, and where the twelve-year window starts (`data-model.md`
 * calls this the sheet view state, and says it is discarded on close). It reads **no** database
 * and imports no service: the calendar index arrives as a prop, already built by
 * `calendarModel.buildIndex` from `DatabaseService.getCalendarIndexRows` in `JournalScreen`
 * (plan.md item 2). That separation is what lets the whole of this component be tested without
 * a database, and it is why `CalendarSheet.test.js` is as thorough as it is.
 *
 * It reports upward **exactly twice**:
 *
 *   `onPick(period)`  a day, a month or a year was really chosen
 *   `onClose()`       the sheet was dismissed with nothing chosen (FR-003)
 *
 * Everything else -- the arrows, switching Date/Month/Year, opening or closing a drop-down
 * list, choosing a month or a year *inside* a list -- is **pure browsing** and calls neither.
 * Somebody hunting for last March must be able to wander the whole calendar without the Journal
 * changing under them, and a drop-down list exists to move the calendar rather than to choose.
 *
 * ⚠ **It does not close itself on a pick.** A pick calls `onPick` and nothing else; `JournalScreen`
 * stops rendering the sheet, which is what spec scenario 5 ("a day with memories is tapped, then
 * it closes") describes from the outside. Closing here *as well* would be the sheet and the
 * screen both deciding, and the test file pins this side of it so the two cannot disagree.
 *
 * ## Civil dates
 *
 * ⚠ **Nothing here hands a date string to `new Date`.** A date-only string parses, per the
 * language's own specification, as midnight **UTC**, so reading the day back west of Greenwich
 * gives the day before -- the defect FR-011 exists to prevent, and the one that has already cost
 * this project production bugs. (The exact spelling is not written out even in this comment: the
 * guard named below greps the file's text, comments included, and it is right to.) Years, months and
 * days are read out of a `'YYYY-MM-DD'` string with a regex, and all the calendar arithmetic
 * belongs to `calendarModel`, which holds itself to the same rule. The one `Date` in the whole
 * feature is built from numeric parts, inside `calendarModel.monthGrid`, which is a local
 * calendar day rather than an instant. `src/utils/__tests__/calendarModel.test.js` greps this
 * file to keep it that way.
 *
 * ## What differs from the native variant, and why -- and nothing else does
 *
 * This is the file metro resolves for the app's web build; the native one is `CalendarSheet.js`,
 * and -- as `CalendarPickerModal.js`'s header warns -- **web extensions must not be added to
 * metro's `sourceExts`**. Everything about the calendar's behaviour is the same in both, and
 * `CalendarSheet.test.js` runs every behavioural test against both files so that a change made
 * to one and not the other fails there rather than in somebody's browser. **Two** things differ,
 * both of them about the browser rather than about the calendar:
 *
 * 1. **The slide up runs on the JavaScript driver** (`useNativeDriver: false`). There is no
 *    native animated module in a browser; `react-native-web` runs the animation itself, and
 *    asking for the native driver there warns and falls back to this anyway.
 * 2. **The sheet is capped in width and centred.** A browser window is far wider than a phone,
 *    and a calendar stretched the width of a desktop monitor would put a day tile the size of a
 *    playing card at each corner of it. It stays the width of a phone, against the bottom of the
 *    window, which is what the sheet is a picture of.
 *
 * Two things that look as though they ought to be differences, and are not:
 *
 * - **The pointer cursor is not set here.** `react-native-web` already gives every
 *   `TouchableOpacity` `cursor: 'pointer'` and -- the part worth having -- withholds it from a
 *   `disabled` one (`TouchableOpacity/index.js`, `styles.actionable`). Setting it in this file
 *   would be redundant on every control and *wrong* on a faded day, which would invite a tap it
 *   is never going to answer.
 * - **Android's back button has no counterpart in a browser**, but `onRequestClose` still earns
 *   its keep: `react-native-web`'s own `Modal` calls it for the **Escape** key, which is the
 *   web's way of dismissing a dialog. So FR-003's third way out is wired by the same prop in
 *   both files, and the shared test covers both with one assertion.
 *
 * Accessibility labels and roles are T009's, deliberately, so that they are written over the
 * finished shape. Two things here are for their benefit: the body is a `ScrollView`, so the
 * sheet scrolls rather than overflowing at the phone's largest text size (FR-014), and no tile's
 * text carries a `numberOfLines` that could cut a label off.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import {
  WEEKDAY_NAMES,
  monthGrid,
  monthKey,
  stepMonth,
  stepWindow,
  stepYear,
  windowStartFor,
} from '../../utils/calendarModel';
import { monthName } from '../../utils/periodDate';
import { toDateKey } from '../../utils/journalDate';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

/** How far the sheet travels on its way up, and the tallest it is allowed to be. */
const SHEET_MAX_HEIGHT = Math.round(SCREEN_HEIGHT * 0.88);

/**
 * The parchment palette of the approved prototype (`docs/prototypes/journal-calendar-prototype.html`,
 * "Phone app" mode), which is also the web calendar's: the same calendar in both apps, as the
 * design says, without sharing a line of code.
 *
 * Exported so that the test file can assert *this* variant's own colours rather than carrying a
 * third copy of them, and so that the two variants can be checked against each other for drift
 * in one assertion. Blue is reserved for the current choice and gold for today; nothing else in
 * the sheet may use either.
 */
export const CALENDAR_SHEET_COLOURS = {
  paper: '#f7ecd3',
  paperShade: '#ecdcb5',
  tile: 'rgba(255, 250, 235, 0.75)',
  tileEmpty: 'rgba(255, 250, 235, 0.35)',
  rule: '#d9c9a4',
  ink: '#3a2f26',
  inkSoft: 'rgba(58, 47, 38, 0.62)',
  faded: 'rgba(58, 47, 38, 0.34)',
  picked: '#1f4ea6',
  pickedSoft: '#d4e2fa',
  pickedInk: '#ffffff',
  today: '#b48a3c',
  backdrop: 'rgba(0, 0, 0, 0.35)',
  grab: '#cdbb92',
};

const C = CALENDAR_SHEET_COLOURS;

/** The three views, in the order the switch draws them. */
const VIEWS = [
  ['date', 'Date'],
  ['month', 'Month'],
  ['year', 'Year'],
];

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * `{year, month, day, key}` read out of a `'YYYY-MM-DD'` string, or null for anything else.
 *
 * The leading date part and nothing else, which is `calendarModel.dayKeyOf`'s answer by
 * construction -- the same regex over the same three groups -- so this file and the model place
 * a memory on the same day. It exists alongside `dayKeyOf` rather than instead of it because the
 * grid needs the three *numbers* (which month to draw, which year to window around) and
 * `dayKeyOf` answers only with the key.
 *
 * ⚠ `key` is the normalised form, and the comparisons below use it rather than the raw prop: a
 * stored date may carry a time (`'2026-11-05T23:30:00Z'`), and a raw-string comparison would
 * silently mark no day at all while the month and the year drawn around it were right -- a sheet
 * that opens on the correct month with nothing marked on it.
 */
function civilDay(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(DAY_KEY);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    key: `${match[1]}-${match[2]}-${match[3]}`,
  };
}

/**
 * The view state a freshly opened sheet starts in.
 *
 * A picked month opens Month view and a picked year opens Year view, so that reopening the sheet
 * puts somebody back where the Journal already is rather than making them find it again. A
 * picked day -- and nothing picked at all -- opens Date view on that day's month (spec
 * scenario 1), falling back to today's month and, if even that is unreadable, to a month that at
 * least exists. The window always starts six years back, so the year on screen sits in the
 * middle of the twelve rather than in a corner of them.
 */
function initialView(picked, today) {
  if (picked && picked.kind === 'month'
    && Number.isInteger(picked.year) && Number.isInteger(picked.month)) {
    return {
      view: 'month', year: picked.year, month: picked.month, list: null,
      windowStart: windowStartFor(picked.year),
    };
  }

  if (picked && picked.kind === 'year' && Number.isInteger(picked.year)) {
    return {
      view: 'year', year: picked.year, month: 1, list: null,
      windowStart: windowStartFor(picked.year),
    };
  }

  const day = (picked && picked.kind === 'day' ? civilDay(picked.date) : null)
    || civilDay(today)
    || { year: 1970, month: 1 };

  return {
    view: 'date', year: day.year, month: day.month, list: null,
    windowStart: windowStartFor(day.year),
  };
}

/** How many memories the index holds for a key: a number, and 0 for a period with none. */
function countFor(map, key) {
  if (!map || typeof map.get !== 'function') return 0;
  const held = map.get(key);
  return typeof held === 'number' ? held : 0;
}

export const CalendarSheet = ({
  visible,
  picked = null,
  index = null,
  today,
  onPick,
  onClose,
}) => {
  // `today` is the device's civil day unless the caller says otherwise, through the one helper
  // that answers "which day is this instant on" for this app. A `Date` is an instant and reading
  // its local parts is the right thing to do with one; a date *string* is not, which is why the
  // prop itself is a `'YYYY-MM-DD'` key and is never parsed here.
  const todayKey = today || toDateKey(new Date());

  const [state, setState] = useState(() => initialView(picked, todayKey));

  // ---------------------------------------------------------------------------------------------
  // Opening: the slide up (FR-001), and the view state discarded on close (`data-model.md`).
  //
  // One `Animated.Value` and one `useEffect`, rather than `MediaExplorerSheet`'s pan responder
  // and three snap points: that sheet can be dragged between a collapsed and an expanded height,
  // and this one has a single position, so the gesture handling it needs is none. The approved
  // prototype's grab bar is decorative there too (`.grab` is a plain element with no handler),
  // and inventing a drag the design does not ask for would be a gesture nobody specified.
  //
  // The same effect resets the view state whenever the sheet is reopened, which is what
  // "discarded on close" means in practice: somebody who browsed off to 2029 and gave up is not
  // dropped back in 2029 next time. It follows `CalendarPickerModal`'s own
  // `useEffect(..., [visible])` for this, for the same reason and in the same shape.
  // ---------------------------------------------------------------------------------------------
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!visible) {
      slide.setValue(0);
      return;
    }
    setState(initialView(picked, todayKey));
    Animated.timing(slide, { toValue: 1, duration: 220, useNativeDriver: false }).start();
    // `picked` and `todayKey` are deliberately not dependencies: this is about *opening*, and
    // re-running it because the Journal's own date changed would throw away where somebody had
    // browsed to while the sheet was open in front of them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // ---------------------------------------------------------------------------------------------
  // Browsing. Not one of these tells the Journal anything.
  // ---------------------------------------------------------------------------------------------

  /** ◄ ► move by whatever set is on screen -- the open list first, then the view. */
  const step = useCallback((delta) => {
    setState((s) => {
      if (s.list === 'month') return { ...s, year: stepYear(s.year, delta) };
      if (s.list === 'year') return { ...s, windowStart: stepWindow(s.windowStart, delta) };
      if (s.view === 'date') {
        const next = stepMonth(s.year, s.month, delta);
        return { ...s, year: next.year, month: next.month };
      }
      if (s.view === 'month') return { ...s, year: stepYear(s.year, delta) };
      return { ...s, windowStart: stepWindow(s.windowStart, delta) }; // view === 'year'
    });
  }, []);

  const switchView = useCallback((view) => {
    setState((s) => ({ ...s, view, list: null, windowStart: windowStartFor(s.year) }));
  }, []);

  /** Design §3: a second tap of the open header closes its own list, having chosen nothing. */
  const toggleMonthList = useCallback(() => {
    setState((s) => ({ ...s, list: s.list === 'month' ? null : 'month' }));
  }, []);

  // Opening the year list rebuilds the window around the year on screen *now*, not the year the
  // sheet was opened on: after ◄ ► have moved the year, the twelve offered must be the twelve
  // around where somebody has got to.
  const toggleYearList = useCallback(() => {
    setState((s) => (s.list === 'year'
      ? { ...s, list: null }
      : { ...s, list: 'year', windowStart: windowStartFor(s.year) }));
  }, []);

  // ---------------------------------------------------------------------------------------------
  // What the index says, and the current choice.
  //
  // There is no "not loaded yet" state here, and that is a deliberate difference from the web's
  // 014 calendar, which has one because its index comes over the network and can fail. This one
  // is read from the phone's own database (plan.md: no server change), and the spec's own edge
  // case says what an absent index looks like -- *"An empty journal: the calendar opens with
  // everything faded"*. So a missing index is drawn as a journal with nothing in it, which is
  // both the honest reading and the fail-closed one: nothing can be picked that is not there.
  // ---------------------------------------------------------------------------------------------

  const dayCount = (key) => countFor(index && index.days, key);
  const monthCount = (year, month) => countFor(index && index.months, monthKey(year, month));
  const yearCount = (year) => countFor(index && index.years, String(year));

  // The month and the year the current choice falls in. A picked day names a definite month and
  // year -- the ones its own date falls in -- so the mark follows it onto Month and Year view
  // too. A picked year names no particular month, so no month tile ever matches it.
  const pickedIn = (() => {
    if (picked && picked.kind === 'day') {
      const day = civilDay(picked.date);
      return day ? { year: day.year, month: day.month, key: day.key } : {};
    }
    if (picked && picked.kind === 'month') return { year: picked.year, month: picked.month };
    if (picked && picked.kind === 'year') return { year: picked.year };
    return {};
  })();

  const todayCivil = civilDay(todayKey) || {};

  // ---------------------------------------------------------------------------------------------
  // The tiles.
  //
  // `disabled` is the fade and the inertness in one: a period the index has looked up and found
  // empty cannot be tapped (FR-002's "faded, untappable empty tiles"), and leaving it tappable
  // would lead to a Journal page with nothing on it. The one exception is the month or year a
  // **drop-down list's own header names right now**: it stays tappable even when it holds
  // nothing, because choosing it again is how the list is closed, and an empty journal would
  // otherwise open a list with no way out of it (the spec's empty-journal edge case).
  // ---------------------------------------------------------------------------------------------

  const renderDayTile = (cell) => {
    const count = dayCount(cell.key);
    const isPicked = pickedIn.key === cell.key;
    const empty = count === 0;

    return (
      <TouchableOpacity
        key={cell.key}
        testID={`calendar-day-${cell.key}`}
        style={[
          styles.dayTile,
          cell.key === todayCivil.key && styles.dayTileToday,
          isPicked && styles.dayTilePicked,
        ]}
        accessibilityState={{ selected: isPicked, disabled: empty }}
        disabled={empty}
        onPress={empty ? undefined : () => onPick({ kind: 'day', date: cell.key })}
      >
        {/* No count on a day tile: a number inside a circle a few millimetres across would be
            the size of the day number itself. Counts belong to the month and year tiles, which
            have room for them -- the same division the web calendar made. */}
        <Text
          style={[
            styles.dayNumber,
            empty && styles.textFaded,
            isPicked && styles.textPicked,
          ]}
        >
          {cell.day}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderDayGrid = () => (
    <View>
      <View style={styles.weekdayRow}>
        {WEEKDAY_NAMES.map((name) => (
          <Text key={name} style={styles.weekday}>{name}</Text>
        ))}
      </View>
      {monthGrid(state.year, state.month).map((row, rowIndex) => (
        // eslint-disable-next-line react/no-array-index-key
        <View key={`row-${rowIndex}`} style={styles.dayRow}>
          {row.map((cell, cellIndex) => (cell
            ? renderDayTile(cell)
            // A blank is a spacer and nothing else: never a neighbouring month's day, so
            // nothing outside the month on screen can be counted, marked or tapped.
            // eslint-disable-next-line react/no-array-index-key
            : <View key={`blank-${rowIndex}-${cellIndex}`} style={styles.dayTile} />))}
        </View>
      ))}
    </View>
  );

  const renderMonthTiles = (inList) => (
    <View style={styles.tileGrid}>
      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
        const count = monthCount(state.year, month);
        const isPicked = pickedIn.year === state.year && pickedIn.month === month;
        const onScreenNow = inList && month === state.month;
        const empty = count === 0 && !onScreenNow;

        return (
          <TouchableOpacity
            key={monthKey(state.year, month)}
            testID={`calendar-month-tile-${monthKey(state.year, month)}`}
            style={[
              styles.monthTile,
              empty && styles.tileEmpty,
              todayCivil.year === state.year && todayCivil.month === month && styles.tileToday,
              isPicked && styles.tilePicked,
            ]}
            accessibilityState={{ selected: isPicked, disabled: empty }}
            disabled={empty}
            onPress={empty ? undefined : () => {
              // In a list a tap browses: it moves the calendar to that month and closes the
              // list. In Month view's own grid it chooses.
              if (inList) setState((s) => ({ ...s, month, list: null }));
              else onPick({ kind: 'month', year: state.year, month });
            }}
          >
            {/* Three letters of the one home of the twelve month words, rather than a second
                array of abbreviations -- the approved prototype abbreviates the same way, by
                slicing the full names. "Nov" is a prefix of "November", so T009's spoken label
                can name the month in full without the visible text disagreeing with it. */}
            <Text style={[styles.tileName, empty && styles.textFaded]}>
              {monthName(month).slice(0, 3)}
            </Text>
            {count > 0 && (
              <Text style={styles.tileCount}>{count}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderYearTiles = (inList) => (
    <View style={styles.tileGrid}>
      {Array.from({ length: 12 }, (_, i) => state.windowStart + i).map((year) => {
        const count = yearCount(year);
        const isPicked = pickedIn.year === year;
        const onScreenNow = inList && year === state.year;
        const empty = count === 0 && !onScreenNow;

        return (
          <TouchableOpacity
            key={year}
            testID={`calendar-year-tile-${year}`}
            style={[
              styles.yearTile,
              empty && styles.tileEmpty,
              todayCivil.year === year && styles.tileToday,
              isPicked && styles.tilePicked,
            ]}
            accessibilityState={{ selected: isPicked, disabled: empty }}
            disabled={empty}
            onPress={empty ? undefined : () => {
              if (inList) setState((s) => ({ ...s, year, list: null }));
              else onPick({ kind: 'year', year });
            }}
          >
            <Text style={[styles.tileName, empty && styles.textFaded]}>{year}</Text>
            {count > 0 && (
              <Text style={styles.tileCount}>{count}</Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );

  const renderBody = () => {
    if (state.list === 'month') return renderMonthTiles(true);
    if (state.list === 'year') return renderYearTiles(true);
    if (state.view === 'date') return renderDayGrid();
    if (state.view === 'month') return renderMonthTiles(false);
    return renderYearTiles(false); // view === 'year'
  };

  /**
   * What sits between ◄ and ►.
   *
   * Date view offers both headers; Month view offers the year alone, because the year list opens
   * from there too (FR-002, spec scenario 3); Year view offers neither -- it already *is* the
   * twelve years, so there is nothing for a header to open, and the range is a plain label.
   */
  const renderHeader = () => {
    if (state.view === 'year') {
      return (
        <Text testID="calendar-window-label" style={styles.windowLabel}>
          {`${state.windowStart} - ${state.windowStart + 11}`}
        </Text>
      );
    }

    return (
      <View style={styles.headerRow}>
        {state.view === 'date' && (
          <TouchableOpacity
            testID="calendar-month-header"
            style={[styles.headerToggle, state.list === 'month' && styles.headerToggleOpen]}
            onPress={toggleMonthList}
          >
            <Text style={styles.headerToggleText}>{monthName(state.month)}</Text>
            <Ionicons
              name={state.list === 'month' ? 'chevron-up' : 'chevron-down'}
              size={14}
              color={C.ink}
            />
          </TouchableOpacity>
        )}
        <TouchableOpacity
          testID="calendar-year-header"
          style={[styles.headerToggle, state.list === 'year' && styles.headerToggleOpen]}
          onPress={toggleYearList}
        >
          <Text style={styles.headerToggleText}>{state.year}</Text>
          <Ionicons
            name={state.list === 'year' ? 'chevron-up' : 'chevron-down'}
            size={14}
            color={C.ink}
          />
        </TouchableOpacity>
      </View>
    );
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      // FR-003's third way out: Android's own back button, which is what this prop is.
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.root}>
        {/* FR-003's second: a tap outside the sheet. `activeOpacity={1}` so the dim does not
            flash on the way to closing, as `MediaExplorerSheet`'s backdrop does not. */}
        <TouchableOpacity
          testID="calendar-sheet-backdrop"
          style={styles.backdrop}
          activeOpacity={1}
          onPress={onClose}
        />

        <Animated.View
          testID="calendar-sheet"
          style={[
            styles.sheet,
            {
              transform: [{
                translateY: slide.interpolate({
                  inputRange: [0, 1],
                  outputRange: [SHEET_MAX_HEIGHT, 0],
                }),
              }],
            },
          ]}
        >
          <View style={styles.grab} />

          <View style={styles.toolbar}>
            <View style={styles.viewSwitch}>
              {VIEWS.map(([view, label]) => (
                <TouchableOpacity
                  key={view}
                  testID={`calendar-view-${view}`}
                  style={[styles.viewTab, state.view === view && styles.viewTabCurrent]}
                  onPress={() => switchView(view)}
                >
                  <Text
                    style={[
                      styles.viewTabText,
                      state.view === view && styles.viewTabTextCurrent,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* FR-003's first way out. */}
            <TouchableOpacity
              testID="calendar-sheet-close"
              style={styles.close}
              onPress={onClose}
            >
              <Ionicons name="close" size={20} color={C.ink} />
            </TouchableOpacity>
          </View>

          <View style={styles.nav}>
            <TouchableOpacity testID="calendar-prev" style={styles.navButton} onPress={() => step(-1)}>
              <Ionicons name="chevron-back" size={20} color={C.picked} />
            </TouchableOpacity>
            <View style={styles.navMiddle}>{renderHeader()}</View>
            <TouchableOpacity testID="calendar-next" style={styles.navButton} onPress={() => step(1)}>
              <Ionicons name="chevron-forward" size={20} color={C.picked} />
            </TouchableOpacity>
          </View>

          {/* A `ScrollView` rather than a plain `View`, so that at the phone's largest text size
              the sheet scrolls instead of overflowing (FR-014, SC-006 -- T009's requirement,
              made possible here). */}
          <ScrollView
            testID="calendar-sheet-scroll"
            style={styles.body}
            contentContainerStyle={styles.bodyContent}
          >
            {renderBody()}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.backdrop,
  },
  sheet: {
    maxHeight: SHEET_MAX_HEIGHT,
    // Difference 2: a phone's width at most, centred, however wide the browser window is.
    width: '100%',
    maxWidth: 420,
    alignSelf: 'center',
    backgroundColor: C.paper,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 26,
    borderTopWidth: 1,
    borderTopColor: C.paperShade,
  },
  grab: {
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: C.grab,
    alignSelf: 'center',
    marginBottom: 10,
  },

  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewSwitch: {
    flexDirection: 'row',
    flex: 1,
    backgroundColor: C.tile,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: C.rule,
    padding: 4,
  },
  viewTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 999,
  },
  viewTabCurrent: {
    backgroundColor: C.pickedSoft,
    borderWidth: 1.5,
    borderColor: C.picked,
  },
  viewTabText: {
    fontSize: 14,
    color: C.ink,
  },
  viewTabTextCurrent: {
    fontWeight: '600',
  },
  close: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navMiddle: {
    flex: 1,
    alignItems: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 999,
    marginHorizontal: 3,
  },
  headerToggleOpen: {
    backgroundColor: C.pickedSoft,
    borderWidth: 1.5,
    borderColor: C.picked,
  },
  headerToggleText: {
    fontSize: 20,
    fontWeight: '700',
    color: C.ink,
    marginRight: 4,
  },
  windowLabel: {
    fontSize: 20,
    fontWeight: '700',
    color: C.ink,
  },

  body: {
    marginTop: 8,
  },
  bodyContent: {
    paddingBottom: 6,
  },

  weekdayRow: {
    flexDirection: 'row',
    paddingBottom: 4,
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: C.inkSoft,
  },
  dayRow: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  dayTile: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    marginHorizontal: 2,
    // A transparent border on every tile, so that today's gold ring and the blue mark do not
    // shift the grid by a pixel and a half when they appear.
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  dayTileToday: {
    borderColor: C.today,
  },
  dayTilePicked: {
    backgroundColor: C.picked,
  },
  dayNumber: {
    fontSize: 16,
    fontWeight: '600',
    color: C.ink,
  },
  textFaded: {
    color: C.faded,
    fontWeight: '400',
  },
  textPicked: {
    color: C.pickedInk,
  },

  tileGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  monthTile: {
    width: '31.5%',
    alignItems: 'center',
    paddingVertical: 13,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: C.tile,
    borderWidth: 1.5,
    borderColor: C.rule,
  },
  yearTile: {
    width: '23%',
    alignItems: 'center',
    paddingVertical: 13,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: C.tile,
    borderWidth: 1.5,
    borderColor: C.rule,
  },
  tileEmpty: {
    backgroundColor: C.tileEmpty,
  },
  tileToday: {
    borderColor: C.today,
  },
  tilePicked: {
    backgroundColor: C.pickedSoft,
    borderColor: C.picked,
  },
  tileName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.ink,
  },
  tileCount: {
    fontSize: 11,
    color: C.inkSoft,
    marginTop: 2,
  },
});

export default CalendarSheet;
