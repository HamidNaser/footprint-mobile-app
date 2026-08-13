/**
 * Rendering the events that make a year worth more than its photograph count.
 *
 * Mirrors the web app's copy in `TimelinePage.jsx`. The same glyph for the same kind of
 * event on both clients: somebody switching between phone and browser is looking at one
 * life, and it should not change its symbols on the way.
 */

/**
 * One glyph per kind of event, so a year reads at a glance.
 *
 * Deliberately not colour-coded. A life holds births and deaths, and colouring one green
 * and the other black would make the timeline editorialise about somebody's family.
 */
export const MILESTONE_ICONS = {
  born: '🎉',
  died: '🕊️',
  school_started: '📚',
  graduated: '🎓',
  job_started: '💼',
  job_ended: '📦',
  became_parent: '👶',
  married: '💍',
  moved_home: '🏠',
  trip: '✈️',
};

/**
 * A civil date, rendered as the day it actually was.
 *
 * Parsed by hand rather than through `new Date(...)`, which reads a bare `2015-08-22` as
 * UTC midnight and shows it a day early to anyone west of Greenwich — the same bug that
 * once put journal entries on the wrong day. The first of January is worse: parsed that
 * way it lands in the previous December, in the previous year.
 *
 * @param {string} value - a civil date, `YYYY-MM-DD`, optionally with a time
 * @returns {string} empty when it cannot be parsed, rather than "Invalid Date"
 */
export function formatMilestoneDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!match) return '';

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day))
    .toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

export default { MILESTONE_ICONS, formatMilestoneDate };
