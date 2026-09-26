import { parseExifLocalDateTime } from '../services/LocationService';

/**
 * What the phone tells the server about a photograph (FR-014, research.md #13).
 *
 * A phone holds two accounts of the same moment: the file's own EXIF, and the device's
 * readings at the time of capture. **The file wins.** EXIF is the photograph's own record
 * of itself; a device reading is context. The device fills only what the file lacks, and
 * which of the two answered is recorded rather than discarded, so a weakly-sourced row can
 * be found and re-derived when a rule is later corrected.
 *
 * Getting that backwards is quiet: a GPS fix taken thirty seconds after the shutter, or a
 * phone clock that has drifted, silently overwrites a truth the file already carried.
 *
 * Lives here rather than in `MediaPicker.js`, which tasks.md T023 names, because that module
 * imports `expo-media-library` and cannot be loaded under jest — a rule this load-bearing
 * needs to be testable. `MediaPicker` imports it.
 *
 * The shape is deliberately identical to the web client's and to one element of the import
 * registration payload, so all three routes share one contract rather than drifting.
 */
export function buildPhotoMetadata(asset = {}, context = {}) {
  const exif = asset.exif ?? null;

  const fileDate = parseExifLocalDateTime(exif?.DateTimeOriginal ?? exif?.CreateDate ?? null);

  // The picker hands a creation time over on every asset, and it was being thrown away —
  // so a photograph whose file carried no EXIF date went to the holding area even though
  // the phone knew when it arrived. Weaker than the file and marked as such: a creation
  // time is when the file appeared on *this device*, which for anything transferred from
  // a camera or another phone is not when the photograph was taken.
  const deviceDate =
    parseExifLocalDateTime(context.capturedAt ?? null) ?? deviceClock(asset.creationTime);

  const fileLat = numberOrNull(exif?.GPSLatitude);
  const fileLng = numberOrNull(exif?.GPSLongitude);
  const hasFileCoordinates = fileLat !== null && fileLng !== null;

  const deviceLat = numberOrNull(context.location?.lat);
  const deviceLng = numberOrNull(context.location?.lng);
  const hasDeviceCoordinates = deviceLat !== null && deviceLng !== null;

  const takenAtLocal = fileDate ?? deviceDate ?? null;

  return {
    contentHash: context.contentHash ?? null,
    // A pick from the camera roll is not a capture, whatever the file says. Only the code
    // that opened the picker knows which it was.
    captureRoute: context.captureRoute ?? 'manual_upload',

    takenAtLocal,
    takenAtSource: fileDate ? 'exif.DateTimeOriginal' : deviceDate ? 'device_clock' : 'none',
    // FR-016: an implausible value is stored and marked, never nulled by the client. The
    // file it came from may be gone by the time anyone works out the rule was wrong.
    takenAtPlausible: isPlausibleDate(takenAtLocal),
    // Sent only where the file itself carried an offset tag (~2016+). Never guessed: a
    // guessed offset is indistinguishable from an observed one once stored.
    takenAtOffsetMinutes: offsetMinutes(exif?.OffsetTimeOriginal),

    rawLat: hasFileCoordinates ? fileLat : hasDeviceCoordinates ? deviceLat : null,
    rawLng: hasFileCoordinates ? fileLng : hasDeviceCoordinates ? deviceLng : null,
    altitude: numberOrNull(exif?.GPSAltitude),
    latLngSource: hasFileCoordinates ? 'exif_gps' : hasDeviceCoordinates ? 'device_fix' : 'none',
    latLngPlausible: true,

    cameraMake: exif?.Make ?? null,
    cameraModel: exif?.Model ?? null,
    lens: exif?.LensModel ?? null,
    orientation: exif?.Orientation ?? null,
    originalFileName: asset.fileName ?? null,

    /*
     * What the image itself is. Metadata *about* the source, never a substitute for it — the
     * whole EXIF payload still goes up as `rawMetadata` below.
     *
     * The asset wins over the file here, which is the opposite of the date and the location
     * above, and for a reason: the library reports the dimensions of the image as it stands,
     * while `ExifImageWidth` is what the camera wrote and is stale after a crop. For a
     * capture time or a coordinate the file is the original truth; for dimensions it is the
     * out-of-date one.
     *
     * Null is "not known", not zero. Nothing here decodes an image to find out.
     */
    width: numberOrNull(asset.width)
      ?? numberOrNull(exif?.ExifImageWidth ?? exif?.PixelXDimension ?? exif?.ImageWidth),
    height: numberOrNull(asset.height)
      ?? numberOrNull(exif?.ExifImageHeight ?? exif?.PixelYDimension ?? exif?.ImageHeight),

    /*
     * Not read here. Nothing in this function has stat'd anything, and `MediaApi.uploadMedia`
     * already reads the size before uploading — filling it in here would mean a second stat
     * per photograph for a value something else already holds. It is supplied through context
     * when a caller does happen to know it.
     */
    fileSizeBytes: numberOrNull(context.fileSizeBytes),

    // The whole payload, not only what this understood. The fields above are one reading of
    // the file; this is what a corrected rule gets re-applied to (FR-015).
    rawMetadata: exif && Object.keys(exif).length > 0 ? exif : null,
  };
}

/**
 * An epoch timestamp as a zone-less local wall clock.
 *
 * A `Date` is used here deliberately, which the EXIF path forbids — and the difference is
 * the point. An EXIF string has no zone, so attaching the host's is a fabrication. A
 * creation time *is* an instant recorded by this device, so reading it back in this
 * device's zone is what it actually means.
 */
function deviceClock(epochMillis) {
  if (typeof epochMillis !== 'number' || !Number.isFinite(epochMillis) || epochMillis <= 0) {
    return null;
  }

  const when = new Date(epochMillis);
  const pad = (n) => String(n).padStart(2, '0');

  return `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}`
    + `T${pad(when.getHours())}:${pad(when.getMinutes())}:${pad(when.getSeconds())}`;
}

function numberOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** `"-04:00"` to minutes. Anything else is no answer rather than a guess. */
function offsetMinutes(tag) {
  const match = typeof tag === 'string' ? tag.trim().match(/^([+-])(\d{2}):(\d{2})$/) : null;
  if (!match) return null;

  const [, sign, hours, minutes] = match;
  const total = Number(hours) * 60 + Number(minutes);
  return sign === '-' ? -total : total;
}

/**
 * A camera clock reset to its epoch, or one running ahead of the present. The value is kept
 * either way (FR-016); this only records the doubt.
 *
 * The epoch instants are checked exactly rather than by year, because a photograph really
 * taken in 1970 is perfectly plausible — what is not is midnight on the first of January,
 * which is what a clock that was never set reports.
 */
const CLOCK_NEVER_SET = new Set([
  '1970-01-01T00:00:00', // Unix epoch
  '1980-01-01T00:00:00', // FAT filesystem epoch
  '2000-01-01T00:00:00', // a common camera default
]);

function isPlausibleDate(takenAtLocal) {
  if (!takenAtLocal) return true;
  if (CLOCK_NEVER_SET.has(takenAtLocal)) return false;

  const year = Number(takenAtLocal.slice(0, 4));
  // Photography predates 1826 by nothing worth allowing for, and a capture time in the
  // future is a clock running ahead rather than a prediction.
  return year >= 1826 && year <= new Date().getFullYear() + 1;
}

export default buildPhotoMetadata;
