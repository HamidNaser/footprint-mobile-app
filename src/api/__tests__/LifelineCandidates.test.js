import { ApiClient } from '../ApiClient';
import { getTimelineCandidates, dismissCandidate, restoreCandidate } from '../LifelineApi';

jest.mock('../ApiClient', () => ({
  ApiClient: { get: jest.fn(), post: jest.fn() },
}));

/**
 * The candidate calls, and the one asymmetry between them.
 *
 * Fetching may fail quietly -- a timeline missing its suggestions is a lesser harm than one
 * that will not load. Dismissing may not: a lost dismissal means showing the same memory
 * again to somebody who has already asked once to stop seeing it.
 */
describe('timeline candidates', () => {
  beforeEach(() => jest.clearAllMocks());

  it('fetches the suggestions', async () => {
    ApiClient.get.mockResolvedValue([{ candidateKey: 'gathering:stl:2022-06-14' }]);

    const found = await getTimelineCandidates();

    expect(found).toHaveLength(1);
    expect(ApiClient.get.mock.calls[0][0]).toContain('/lifeline/candidates');
  });

  it('returns nothing rather than inventing a suggestion', async () => {
    // Unlike the overview, this never falls back to mock data. Inventing one would mean
    // asking somebody about an afternoon that never happened.
    ApiClient.get.mockRejectedValue(new Error('offline'));

    expect(await getTimelineCandidates()).toEqual([]);
  });

  it('survives a response that is not a list', async () => {
    ApiClient.get.mockResolvedValue({ unexpected: true });

    expect(await getTimelineCandidates()).toEqual([]);
  });

  it('sends the key and the person when dismissing', async () => {
    ApiClient.post.mockResolvedValue(undefined);

    await dismissCandidate('gathering:stl:2022-06-14', 'person-1');

    const [url, body] = ApiClient.post.mock.calls[0];
    expect(url).toContain('/lifeline/candidates/dismiss');
    expect(body).toEqual({ candidateKey: 'gathering:stl:2022-06-14', personId: 'person-1' });
  });

  it('lets a failed dismissal surface', async () => {
    // The card puts itself back and says why. Swallowing this would silently lose the
    // dismissal and show the memory again.
    ApiClient.post.mockImplementation(async () => { throw new Error('Network down'); });

    await expect(dismissCandidate('gathering:stl:2022-06-14')).rejects.toThrow('Network down');
  });

  it('can undo a dismissal', async () => {
    ApiClient.post.mockResolvedValue(undefined);

    await restoreCandidate('trip:2007-07-01');

    expect(ApiClient.post.mock.calls[0][0]).toContain('/lifeline/candidates/restore');
  });
});
