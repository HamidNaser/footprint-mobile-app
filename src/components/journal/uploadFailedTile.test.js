/**
 * 007 R-c: a photo that can never upload is visible on its tile, not silently gone.
 * Source assertions, as for the other component tests here: the card pulls in native modules
 * that do not load under jest.
 */
import fs from 'fs';
import path from 'path';

const card = fs.readFileSync(path.join(__dirname, 'JournalEntryCard.js'), 'utf8');

describe('JournalEntryCard photo tiles', () => {
  it("says \"Photo couldn't be uploaded\" for a flagged photo", () => {
    expect(card).toContain("Photo couldn't be uploaded");
  });

  it('reads the uploadFailed flag from the media item for every tile layout', () => {
    const tiles = card.match(/<PhotoImage[\s\S]*?\/>/g) || [];
    expect(tiles.length).toBeGreaterThanOrEqual(5);
    for (const tile of tiles) expect(tile).toMatch(/failed=\{[^}]*uploadFailed/);
  });
});
