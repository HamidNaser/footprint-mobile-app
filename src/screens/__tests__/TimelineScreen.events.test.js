/**
 * 013 fix T8 -- Events no longer live on the Timeline tab. T065 put a "Timeline | Events"
 * switch here; the owner decided Events do not belong on Timeline, so the switch, the Events
 * pane and the `useUpcomingEvents` call are gone. Home's "Coming up" > "See all" opens the
 * stand-alone `Events` screen instead (`HomeScreen.comingUp.test.js`).
 *
 * `LifelineApi` and `AuthContext` are mocked so this file controls what Timeline shows.
 * `useUpcomingEvents` is mocked only to prove it is never called.
 */

jest.mock('../../api/LifelineApi', () => ({
  getTimelineCandidates: jest.fn().mockResolvedValue([]),
  getLifeline: jest.fn(),
  getLifelineYear: jest.fn(),
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Sam', avatarUrl: null } }),
}));
jest.mock('../../hooks/useUpcomingEvents', () => ({ useUpcomingEvents: jest.fn() }));

import React from 'react';
import { act, create } from 'react-test-renderer';
import { getLifeline, getLifelineYear } from '../../api/LifelineApi';
import { useUpcomingEvents } from '../../hooks/useUpcomingEvents';
import TimelineScreen from '../TimelineScreen';

const OVERVIEW = {
  person: { personId: 'p1', isSelf: true, name: 'You' },
  years: [{ year: 1990, momentCount: 2, isBirthYear: false, milestones: [] }],
  lineage: [{ personId: 'p1', isSelf: true, name: 'You', avatar: null }],
};

const DETAIL = { age: 1, moments: [], gateway: [], atAge: [], world: null, isBirthYear: false };

function texts(tree) {
  return tree.root.findAllByType('Text').map((node) => {
    const children = Array.isArray(node.props.children) ? node.props.children.flat(3) : [node.props.children];
    return children.filter((c) => typeof c === 'string' || typeof c === 'number').join('');
  });
}

const shows = (tree, pattern) => texts(tree).some((t) => pattern.test(t));

async function mount(props) {
  let tree;
  getLifeline.mockResolvedValue(OVERVIEW);
  getLifelineYear.mockResolvedValue(DETAIL);
  await act(async () => {
    tree = create(<TimelineScreen navigation={{ navigate: jest.fn() }} {...props} />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return tree;
}

beforeEach(() => {
  getLifeline.mockReset();
  getLifelineYear.mockReset();
  useUpcomingEvents.mockReset();
  useUpcomingEvents.mockReturnValue({
    upcoming: [], past: [], draftsCount: 0, isLoading: false, error: null, refresh: jest.fn(),
  });
});

describe('TimelineScreen (013 fix T8 -- Events removed)', () => {
  it('has no Events switch and never asks for events', async () => {
    const tree = await mount();

    expect(shows(tree, /^Events$/)).toBe(false);
    expect(shows(tree, /^Timeline$/)).toBe(false);
    expect(useUpcomingEvents).not.toHaveBeenCalled();
  });

  it("ignores a stale { view: 'events' } route param: still the Timeline, still no events", async () => {
    const tree = await mount({ route: { params: { view: 'events' } } });

    expect(shows(tree, /Photos & Videos/)).toBe(true);
    expect(shows(tree, /^No events yet/)).toBe(false);
    expect(shows(tree, /^Events$/)).toBe(false);
    expect(useUpcomingEvents).not.toHaveBeenCalled();
  });

  it('shows the Lifeline header, the focused year and the media zone', async () => {
    const tree = await mount();

    expect(shows(tree, /^Lifeline$/)).toBe(true);
    expect(shows(tree, /^Your 1st year · 1990$/)).toBe(true);
    expect(shows(tree, /Photos & Videos/)).toBe(true);
    expect(shows(tree, /No media for this year yet\./)).toBe(true);
  });

  it('still shows the "your timeline is empty" state when there are no years, with no Events switch', async () => {
    getLifeline.mockResolvedValue({ person: { personId: 'p1', isSelf: true }, years: [], lineage: [] });
    let tree;
    await act(async () => {
      tree = create(<TimelineScreen navigation={{ navigate: jest.fn() }} />);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(shows(tree, /Your timeline is empty/)).toBe(true);
    expect(shows(tree, /^Events$/)).toBe(false);
    expect(useUpcomingEvents).not.toHaveBeenCalled();
  });
});
