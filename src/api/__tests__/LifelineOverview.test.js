import { ApiClient } from '../ApiClient';
import { getLifeline, getLifelineYear } from '../LifelineApi';

jest.mock('../ApiClient', () => ({
  ApiClient: { get: jest.fn(), post: jest.fn() },
}));

/**
 * Whose family the Timeline shows.
 *
 * The overview used to fall back to local mock data whenever the backend was
 * unreachable or the user was signed out, "so the screen always renders". What it
 * rendered was a father called Omar who died in 2019 and a grandfather called Ali
 * who emigrated across the sea, with stock portraits of strangers — shown to
 * somebody opening their own family timeline, with nothing to say it was not
 * theirs. TimelineScreen went further and seeded its initial state with the same
 * mock, so the invented family was on screen before any request was made.
 *
 * The candidates call in the same file already had the right answer written next
 * to it: inventing a suggestion would mean asking somebody about an afternoon that
 * never happened. Inventing a father is the same mistake, further along.
 */
describe('the lifeline overview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns the timeline it was given', async () => {
    ApiClient.get.mockResolvedValue({ person: { name: 'Hamid' }, years: [{ year: 2024 }] });

    const overview = await getLifeline();

    expect(overview.person.name).toBe('Hamid');
    expect(overview.years).toHaveLength(1);
  });

  it('returns nothing rather than inventing a family when the request fails', async () => {
    ApiClient.get.mockRejectedValue(new Error('offline'));

    expect(await getLifeline()).toBeNull();
  });

  it('does not invent a family for somebody who has recorded nothing', async () => {
    // A real timeline with no years in it was the trigger for the substitution: the old
    // code treated an empty result as a failure and replaced the reader's family with
    // Omar and Ali. An empty timeline is the truth about an empty timeline.
    ApiClient.get.mockResolvedValue({ person: { name: 'Hamid' }, years: [] });

    const overview = await getLifeline();

    expect(overview.person.name).toBe('Hamid');
    expect(overview.years).toEqual([]);
  });

  it('asks for a specific person when given one', async () => {
    ApiClient.get.mockResolvedValue({ person: {}, years: [] });

    await getLifeline('abc123');

    expect(ApiClient.get.mock.calls[0][0]).toContain('/lifeline/abc123');
  });

  it('returns nothing rather than inventing a year', async () => {
    ApiClient.get.mockRejectedValue(new Error('offline'));

    expect(await getLifelineYear('abc123', 2024)).toBeNull();
  });

  it('returns the year it was given', async () => {
    ApiClient.get.mockResolvedValue({ year: 2024, moments: [{ entryId: 'e1' }] });

    const detail = await getLifelineYear('abc123', 2024);

    expect(detail.year).toBe(2024);
    expect(detail.moments).toHaveLength(1);
  });
});
