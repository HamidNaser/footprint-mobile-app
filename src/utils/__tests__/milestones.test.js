import { MILESTONE_ICONS, formatMilestoneDate } from '../milestones';

/**
 * The date handling here is the trap that once put journal entries on the wrong day:
 * `new Date('2015-08-22')` parses as UTC midnight and displays as 21 August to anyone west
 * of Greenwich. A wedding shown a day early is a small, specific insult.
 */
describe('formatMilestoneDate', () => {
  it('renders a civil date as the day it actually was', () => {
    expect(formatMilestoneDate('2015-08-22')).toMatch(/22/);
    expect(formatMilestoneDate('2015-08-22')).toMatch(/August/i);
  });

  it('handles the first of January, where the off-by-one crosses a year', () => {
    // Parsed through new Date() in the Americas this shows as 31 December 2014 -- wrong
    // day, wrong month, wrong year.
    const formatted = formatMilestoneDate('2015-01-01');
    expect(formatted).toMatch(/Jan/i);
    expect(formatted).not.toMatch(/Dec/i);
  });

  it('ignores a time component rather than letting it shift the day', () => {
    expect(formatMilestoneDate('2015-08-22T23:30:00Z')).toMatch(/22/);
  });

  it('returns nothing it cannot parse, rather than "Invalid Date"', () => {
    expect(formatMilestoneDate('')).toBe('');
    expect(formatMilestoneDate(null)).toBe('');
    expect(formatMilestoneDate('sometime in the forties')).toBe('');
  });
});

describe('MILESTONE_ICONS', () => {
  it('covers every type the backend can send', () => {
    for (const type of [
      'born', 'died', 'school_started', 'graduated', 'job_started',
      'job_ended', 'became_parent', 'married', 'moved_home', 'trip',
    ]) {
      expect(MILESTONE_ICONS[type]).toBeTruthy();
    }
  });

  it('does not colour-code life against death', () => {
    expect(MILESTONE_ICONS.born).not.toEqual(MILESTONE_ICONS.died);
  });
});
