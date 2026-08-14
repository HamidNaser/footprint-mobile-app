import {
  stampLocation,
  withLocation,
  setCaptureEnabled,
  clearCachedLocation,
} from '../CaptureLocation';
import LocationService from '../LocationService';

jest.mock('../LocationService', () => ({
  __esModule: true,
  default: {
    getCurrentLocation: jest.fn(),
    getLastKnownLocation: jest.fn(),
  },
  LocationAccuracy: { BALANCED: 'balanced' },
}));

/**
 * Decision 10: everything captured should know where it happened.
 *
 * The rules worth guarding are all about what happens when the satellites do not
 * cooperate. A memory must save regardless — losing a grandparent's voice because the GPS
 * was cold would be an absurd trade.
 */
describe('CaptureLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearCachedLocation();
    setCaptureEnabled(true);
    LocationService.getLastKnownLocation.mockResolvedValue(null);
  });

  it('stamps a capture with where the device is', async () => {
    LocationService.getCurrentLocation.mockResolvedValue({
      latitude: 51.62, longitude: -3.94, accuracy: 12,
    });

    expect(await stampLocation()).toEqual({ lat: 51.62, lng: -3.94, accuracy: 12 });
  });

  it('returns null rather than throwing when there is no fix', async () => {
    // Permission refused, indoors, aeroplane mode, a cold start. All expected, none of
    // them a reason to fail a save.
    LocationService.getCurrentLocation.mockRejectedValue(new Error('permission denied'));

    await expect(stampLocation()).resolves.toBeNull();
  });

  it('falls back to a stale fix rather than nothing', async () => {
    // Somewhere approximately right is far more useful to a timeline than a memory that
    // happened nowhere.
    LocationService.getCurrentLocation.mockRejectedValue(new Error('timed out'));
    LocationService.getLastKnownLocation.mockResolvedValue({
      latitude: 38.62, longitude: -90.19, accuracy: 800,
    });

    expect(await stampLocation()).toEqual({ lat: 38.62, lng: -90.19, accuracy: 800 });
  });

  it('reuses one fix across a burst instead of waking the GPS repeatedly', async () => {
    // Eight photographs in a row is one place, not eight fixes.
    LocationService.getCurrentLocation.mockResolvedValue({
      latitude: 1, longitude: 2, accuracy: 5,
    });

    for (let i = 0; i < 8; i += 1) await stampLocation();

    expect(LocationService.getCurrentLocation).toHaveBeenCalledTimes(1);
  });

  it('asks again once the cache has expired', async () => {
    LocationService.getCurrentLocation.mockResolvedValue({
      latitude: 1, longitude: 2, accuracy: 5,
    });
    await stampLocation();

    clearCachedLocation();
    await stampLocation();

    expect(LocationService.getCurrentLocation).toHaveBeenCalledTimes(2);
  });

  it('captures nothing and asks for nothing when the setting is off', async () => {
    // Off must mean no permission prompt either, not merely a discarded result.
    setCaptureEnabled(false);

    expect(await stampLocation()).toBeNull();
    expect(LocationService.getCurrentLocation).not.toHaveBeenCalled();
  });

  it('refuses a half-formed coordinate', async () => {
    // A latitude with no longitude is not a place, and storing it would put a memory on
    // the prime meridian.
    LocationService.getCurrentLocation.mockResolvedValue({ latitude: 51.62 });

    expect(await stampLocation()).toBeNull();
  });

  describe('withLocation', () => {
    it("keeps a photograph's own EXIF coordinate over the device's", async () => {
      // Where the shutter actually fell. For an imported or older photograph that may be
      // years and continents from where the phone is standing now.
      LocationService.getCurrentLocation.mockResolvedValue({
        latitude: 51.62, longitude: -3.94, accuracy: 10,
      });

      const stamped = await withLocation(
        { uri: 'old.jpg' },
        { lat: 48.85, lng: 2.35 },
      );

      expect(stamped.location).toEqual({ lat: 48.85, lng: 2.35 });
      expect(LocationService.getCurrentLocation).not.toHaveBeenCalled();
    });

    it('falls back to the device when the capture knows nothing', async () => {
      LocationService.getCurrentLocation.mockResolvedValue({
        latitude: 51.62, longitude: -3.94, accuracy: 10,
      });

      const stamped = await withLocation({ uri: 'note.m4a' });

      expect(stamped.location).toEqual({ lat: 51.62, lng: -3.94, accuracy: 10 });
    });

    it('leaves the capture untouched when nowhere can be established', async () => {
      // No location key at all, rather than location: null, so nothing downstream has to
      // distinguish "we tried" from "we did not".
      LocationService.getCurrentLocation.mockRejectedValue(new Error('no signal'));

      const stamped = await withLocation({ uri: 'note.m4a' });

      expect(stamped).toEqual({ uri: 'note.m4a' });
      expect('location' in stamped).toBe(false);
    });

    it('never loses the capture itself', async () => {
      LocationService.getCurrentLocation.mockRejectedValue(new Error('boom'));

      const stamped = await withLocation({ uri: 'precious.m4a', duration: 42 });

      expect(stamped.uri).toBe('precious.m4a');
      expect(stamped.duration).toBe(42);
    });
  });
});
