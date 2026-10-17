/**
 * Shared jest setup.
 *
 * `MediaApi` reaches ApiClient -> AsyncStorage, which cannot load under jest. Since 007 the
 * display-copy hook calls `MediaApi.retry`, so every suite that renders a media tile pulled it
 * in. Mock it here once instead of in each suite. A suite that tests MediaApi itself opts out
 * with `jest.unmock('<path>/api/MediaApi')`; a suite may still declare its own `jest.mock`.
 */
jest.mock('./src/api/MediaApi', () => {
  const api = { retry: jest.fn(), status: jest.fn() };
  return { __esModule: true, MediaApi: api, default: api };
});
