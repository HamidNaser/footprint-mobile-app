/**
 * 007 T060 -- every photo surface renders through DerivativeImage (thumbnailSource for tiles,
 * fullSizeSource for single-photo and full views), never `localPath || serverUrl`.
 * Source assertions, as for the other component tests here: these screens pull in native
 * modules that do not load under jest.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..', '..');
const read = (rel) => fs.readFileSync(path.join(SRC, rel), 'utf8');

const SURFACES = [
  'components/journal/JournalEntryCard.js',
  'components/journal/MediaGalleryTab.js',
  'components/journal/EntryGalleryModal.web.js',
  'components/journal/MediaExplorerSheet.js',
  'components/journal/MediaExplorerSheet.web.js',
  'components/journal/FullScreenMediaViewer.js',
  'components/places/MemoryCard.js',
  'screens/PlacesScreen.js',
  'screens/TimelineScreen.js',
  'screens/JournalEntryDetail.js',
  'screens/JournalEntryDetail.web.js',
];

/** Everything between <Image and its closing, for photo tiles. Avatars are not photographs. */
const imageTags = (src) => src.match(/<Image\b[\s\S]*?\/>/g) || [];

describe.each(SURFACES)('%s', (file) => {
  const src = read(file);

  it('renders photographs through DerivativeImage', () => {
    expect(src).toMatch(/import\s+DerivativeImage\s+from\s+['"][^'"]*media\/DerivativeImage['"]/);
    expect(src).toContain('<DerivativeImage');
  });

  it('never picks an image with localPath || serverUrl, or hands Image a null uri', () => {
    for (const tag of imageTags(src)) {
      expect(tag).not.toMatch(/localPath\s*\|\|/);
      expect(tag).not.toMatch(/serverUrl/);
      expect(tag).not.toMatch(/uri:\s*null/);
    }
    // Videos keep localPath || serverUrl for playback; a photograph never does.
    expect(src).not.toMatch(/uri:\s*(photo|photos\[\d\]|item|image|img)\.(localPath|serverUrl)\s*\|\|/);
  });
});

describe('single-photo and full views use the display copy', () => {
  it.each([
    'components/journal/FullScreenMediaViewer.js',
    'screens/JournalEntryDetail.js',
    'screens/JournalEntryDetail.web.js',
  ])('%s', (file) => {
    expect(read(file)).toMatch(/variant=["']display["']/);
  });
});

describe('JournalEntryCard', () => {
  const card = read('components/journal/JournalEntryCard.js');

  it('hands each tile its media item, so the placeholder shows when the source is null', () => {
    const tiles = card.match(/<PhotoImage[\s\S]*?\/>/g) || [];
    expect(tiles.length).toBeGreaterThanOrEqual(5);
    for (const tile of tiles) expect(tile).toMatch(/media=\{/);
    expect(card).not.toMatch(/source=\{\{\s*uri\s*\}\}/);
  });

  it('defines no component inside PhotoBlock (a hook there would restart on every render)', () => {
    const block = card.slice(card.indexOf('const PhotoBlock'));
    expect(block.slice(0, block.indexOf('const renderSinglePhoto'))).not.toMatch(/const (NativeImage|WebImage|FailedTile)\s*=/);
  });
});

describe('PlacesScreen carousel, TimelineScreen and MemoryCard', () => {
  it('PlacesScreen draws place.image and the carousel from media items', () => {
    const s = read('screens/PlacesScreen.js');
    expect(s).not.toMatch(/source=\{\{\s*uri:\s*place\.image/);
    expect(s).not.toMatch(/source=\{\{\s*uri:\s*photo\s*\}\}/);
  });
  it('TimelineScreen draws m.photos[0] as a media item', () => {
    expect(read('screens/TimelineScreen.js')).not.toMatch(/uri:\s*m\.photos\[0\]/);
  });
  it('MemoryCard draws media[0] as a media item', () => {
    const s = read('components/places/MemoryCard.js');
    expect(s).not.toMatch(/uri:\s*primaryImage/);
  });
});
