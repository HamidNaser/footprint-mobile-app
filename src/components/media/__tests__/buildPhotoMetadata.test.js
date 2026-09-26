import { buildPhotoMetadata } from '../../../utils/photoMetadata';

/**
 * What the phone tells the server about a photograph it just took (T023, FR-014).
 *
 * The rule worth pinning is precedence. A phone holds two accounts of the same moment: the
 * file's own EXIF, and the device's readings at the time of capture. **The file wins**
 * (research.md #13) — EXIF is the photograph's own record of itself and the device reading
 * is context. A device fills only what the file lacks, and which of the two answered is
 * recorded rather than discarded, so a weakly-sourced row can be found and re-derived later.
 *
 * Getting this backwards is quiet: a device fix taken thirty seconds after the shutter, or a
 * phone clock that drifted, silently overwrites the truth the file already carried.
 */
describe('buildPhotoMetadata', () => {
  const exif = {
    DateTimeOriginal: '2018:07:04 15:22:00',
    GPSLatitude: 43.65,
    GPSLongitude: -79.38,
    Make: 'Apple',
    Model: 'iPhone 15',
    LensModel: 'Wide',
    Orientation: 1,
    OffsetTimeOriginal: '-04:00',
  };

  const deviceLocation = { lat: 35.68, lng: 139.69 };

  // ---- Precedence: the file wins --------------------------------------------------------

  it('takes the capture time from the file, not the clock', () => {
    const built = buildPhotoMetadata({ exif }, { capturedAt: '2020-01-01T00:00:00' });

    expect(built.takenAtLocal).toBe('2018-07-04T15:22:00');
    expect(built.takenAtSource).toBe('exif.DateTimeOriginal');
  });

  it('takes the coordinates from the file, not the device fix', () => {
    // A fix taken thirty seconds after the shutter is a different place. The file was there.
    const built = buildPhotoMetadata({ exif }, { location: deviceLocation });

    expect(built.rawLat).toBe(43.65);
    expect(built.rawLng).toBe(-79.38);
    expect(built.latLngSource).toBe('exif_gps');
  });

  // ---- The device fills only what the file lacks ----------------------------------------

  it('falls back to the device clock when the file carries no date', () => {
    const built = buildPhotoMetadata(
      { exif: { Make: 'Apple' } }, { capturedAt: '2020-01-01T09:30:00' });

    expect(built.takenAtLocal).toBe('2020-01-01T09:30:00');
    expect(built.takenAtSource).toBe('device_clock');
  });

  it('falls back to the device fix when the file carries no coordinates', () => {
    const built = buildPhotoMetadata({ exif: { Make: 'Apple' } }, { location: deviceLocation });

    expect(built.rawLat).toBe(35.68);
    expect(built.latLngSource).toBe('device_fix');
  });

  it('says so plainly when neither had anything to offer', () => {
    // A scanned print picked out of the camera roll. "none" is a recorded fact, not a gap.
    const built = buildPhotoMetadata({ exif: {} }, {});

    expect(built.takenAtLocal).toBeNull();
    expect(built.takenAtSource).toBe('none');
    expect(built.rawLat).toBeNull();
    expect(built.latLngSource).toBe('none');
  });

  // ---- The capture time is never given a timezone ---------------------------------------

  it('keeps the wall clock zone-less, whatever the phone is set to', () => {
    // The same defect research.md #9 describes, on the other client. Parsed through the
    // shared convention rather than a Date, so the phone's zone can never attach itself.
    const built = buildPhotoMetadata({ exif }, {});

    expect(built.takenAtLocal).toBe('2018-07-04T15:22:00');
  });

  it('sends the offset only when the file actually carried one', () => {
    expect(buildPhotoMetadata({ exif }, {}).takenAtOffsetMinutes).toBe(-240);
    expect(buildPhotoMetadata({ exif: { DateTimeOriginal: '2018:07:04 15:22:00' } }, {})
      .takenAtOffsetMinutes).toBeNull();
  });

  // ---- Provenance and the rest -----------------------------------------------------------

  it('records how the photograph arrived', () => {
    expect(buildPhotoMetadata({ exif }, { captureRoute: 'live_capture' }).captureRoute)
      .toBe('live_capture');
    // A pick from the camera roll is not a capture, whatever the file says.
    expect(buildPhotoMetadata({ exif }, {}).captureRoute).toBe('manual_upload');
  });

  it('carries the camera facts worth querying and the file name', () => {
    const built = buildPhotoMetadata({ exif, fileName: 'IMG_0042.HEIC' }, {});

    expect(built.cameraMake).toBe('Apple');
    expect(built.cameraModel).toBe('iPhone 15');
    expect(built.orientation).toBe(1);
    expect(built.originalFileName).toBe('IMG_0042.HEIC');
  });

  it('keeps the whole payload for the sidecar rather than only what it understood', () => {
    // FR-015. The fields above are one reading of the file; this is what a corrected rule
    // gets re-applied to.
    expect(buildPhotoMetadata({ exif }, {}).rawMetadata).toEqual(exif);
  });

  it('survives an asset with no exif at all', () => {
    // Android pickers routinely return none, and a crash here costs the upload.
    const built = buildPhotoMetadata({}, {});

    expect(built.takenAtSource).toBe('none');
    expect(built.rawMetadata).toBeNull();
  });

  it('flags a date the file could not have recorded rather than dropping it', () => {
    // FR-016: an implausible value is stored and marked, never nulled by the client.
    const built = buildPhotoMetadata({ exif: { DateTimeOriginal: '1970:01:01 00:00:00' } }, {});

    expect(built.takenAtLocal).toBe('1970-01-01T00:00:00');
    expect(built.takenAtPlausible).toBe(false);
  });

  // ---- The asset's own creation time (T045) -------------------------------------------------

  it("falls back to the picker's creation time when the file carries no date", () => {
    // expo hands this over on every asset and it was being thrown away, so a photograph
    // whose file had no EXIF date went to the holding area even though the phone knew
    // when it was taken. The device-clock branch existed and nothing ever reached it.
    const created = new Date(2020, 0, 15, 9, 30, 0);

    const built = buildPhotoMetadata({ exif: {}, creationTime: created.getTime() }, {});

    expect(built.takenAtLocal).toBe('2020-01-15T09:30:00');
    expect(built.takenAtSource).toBe('device_clock');
  });

  it('still prefers the file over the picker', () => {
    // A creation time is when the file appeared on this device, which for anything
    // transferred from a camera or another phone is not when the photograph was taken.
    const built = buildPhotoMetadata(
      { exif: { DateTimeOriginal: '2018:07:04 15:22:00' }, creationTime: Date.now() }, {});

    expect(built.takenAtLocal).toBe('2018-07-04T15:22:00');
    expect(built.takenAtSource).toBe('exif.DateTimeOriginal');
  });

  it('ignores a creation time that is not a usable number', () => {
    expect(buildPhotoMetadata({ exif: {}, creationTime: null }, {}).takenAtSource).toBe('none');
    expect(buildPhotoMetadata({ exif: {}, creationTime: 0 }, {}).takenAtSource).toBe('none');
  });
});
