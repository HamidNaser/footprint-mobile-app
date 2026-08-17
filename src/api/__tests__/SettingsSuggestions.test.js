import { SettingsApi } from '../SettingsApi';
import { ApiClient } from '../ApiClient';

jest.mock('../ApiClient', () => ({
  ApiClient: { get: jest.fn(), put: jest.fn() },
}));

/**
 * The switches that let somebody turn the suggestions off.
 *
 * Held on the server rather than on the device, and that is the thing worth protecting:
 * the prompts are raised server-side, so a value kept in AsyncStorage would hide the card
 * and do nothing about the notification — and this phone and the browser would disagree
 * about what had been chosen.
 */
describe('SettingsApi — suggestions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reads them from the Hub, not from the device', async () => {
    ApiClient.get.mockResolvedValue({ showSuggestions: false, notifyAboutSuggestions: false });

    const result = await SettingsApi.getSuggestionSettings();

    expect(ApiClient.get).toHaveBeenCalledWith(expect.stringContaining('/settings/suggestions'));
    expect(result.showSuggestions).toBe(false);
  });

  it('sends both switches together', async () => {
    // Sent as a pair so the server is never asked to guess at the one left out.
    ApiClient.put.mockResolvedValue({ showSuggestions: true, notifyAboutSuggestions: true });

    await SettingsApi.updateSuggestionSettings({
      showSuggestions: true,
      notifyAboutSuggestions: true,
    });

    expect(ApiClient.put).toHaveBeenCalledWith(
      expect.stringContaining('/settings/suggestions'),
      { showSuggestions: true, notifyAboutSuggestions: true }
    );
  });

  it('returns what was stored rather than what was asked for', async () => {
    // The server is the authority. Echoing the request back would let the screen show a
    // choice that was never saved.
    ApiClient.put.mockResolvedValue({ showSuggestions: false, notifyAboutSuggestions: false });

    const saved = await SettingsApi.updateSuggestionSettings({
      showSuggestions: true,
      notifyAboutSuggestions: true,
    });

    expect(saved.showSuggestions).toBe(false);
  });
});
