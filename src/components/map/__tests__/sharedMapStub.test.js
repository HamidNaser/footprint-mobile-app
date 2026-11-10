/**
 * 013 round-1 item 6 -- the shared `react-native-maps` stub in `jest.setup.js`.
 *
 * `react-native-maps` is native-only: importing it under jest reaches
 * `TurboModuleRegistry.getEnforcing` and throws `'RNMapsAirModule' could not be found`, which
 * fails a whole suite at import time rather than in a test. Since T050 `JournalEntryCard`
 * renders `MemoryRouteMap`, so every suite that renders a Journal card -- or reads a file that
 * imports one -- pulls the module in, and the stub is declared once in `jest.setup.js` instead
 * of in each of them.
 *
 * This file is that stub's own test, and it exists because the stub is shared: a suite that
 * declares its own `jest.mock('react-native-maps', …)` (the four map suites, and the two
 * screens' suites) overrides it and so cannot test it, and the suites that *do* rely on it
 * assert nothing about it. **Deliberately no `jest.mock` here**, so what is exercised is the
 * shared stub itself.
 *
 * Two things are pinned.
 *
 * 1. **The default export takes a ref.** `LocationPicker.js:320` and `JournalMapView.js:354`
 *    both hold a ref to `MapView` and call methods on it. A plain function component given a
 *    ref logs `Warning: Function components cannot be given refs` on `console.error` -- and
 *    output noise is a finding on this branch -- and leaves the ref null, so the first suite to
 *    render either of those components through this stub would fail for a reason that has
 *    nothing to do with what it was testing.
 * 2. **Only the names this app imports are stubbed.** A stub that answered every name would
 *    turn a typo, or a module that moved, into a component that silently renders nothing. The
 *    list is checked against what `src/` actually asks for, so adding an import without adding
 *    it here fails in one obvious place rather than as `Element type is invalid` inside a
 *    screen.
 *
 *    What "what `src/` actually asks for" means is pinned by three cases of its own, because
 *    until round 2 (finding B) it did not mean what this paragraph said: the scan read
 *    `components/map` and the explorer sheet only, matched `import … { } from` only, and took
 *    only the first match in a file -- so `EntryGalleryModal.js:61-62`, which requires the
 *    module lazily in two statements, was outside all three. It is now every `.js` file under
 *    `src` bar the test folders, both the `import` and the `require` form, every statement in
 *    a file. A guard whose comment overstates its reach is worse than no guard: it is read as
 *    cover that is not there.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';

import MapView, { Marker, Callout, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

global.IS_REACT_ACT_ENVIRONMENT = true;

const SRC = path.join(__dirname, '..', '..', '..');

/**
 * Every app source file this guard reads the import list out of: all of `src`, recursively.
 *
 * It scanned `components/map` and the explorer sheet alone until round 2 (finding B), which was
 * narrower than the promise at the top of this file: `EntryGalleryModal.js:61-62` imports from
 * the module and is in neither place, so a name added there would not have failed here.
 *
 * `__tests__` is skipped on purpose and is not an oversight. A suite that declares its own
 * `jest.mock('react-native-maps', …)` is not served by the shared stub at all, so letting its
 * imports drive the stub's contract would force a name into `jest.setup.js` that no app file
 * ever asks for -- the opposite of what the "and no more" half of the check is for.
 *
 * Extracted from the assertion below so the guard's own *reach* can be asserted too: a list
 * built inline inside the one assertion that consumes it can never be checked against the
 * promise it is supposed to keep.
 */
function appSourceFiles(dir = SRC) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : appSourceFiles(full);
    return entry.name.endsWith('.js') ? [full] : [];
  });
}

/**
 * The two forms this app pulls a name out of `react-native-maps` by.
 *
 * Both are global, because a file may use either more than once -- `EntryGalleryModal.js:61-62`
 * is two statements in two lines -- and a single non-global match stops at the first and leaves
 * the rest invisible.
 */
const NAMED_FORMS = [
  // `import { Marker } from 'react-native-maps'`, with or without a default import beside it.
  /import\s+(?:\w+\s*,\s*)?\{([^}]*)\}\s*from\s*['"]react-native-maps['"]/g,
  // `const { Marker } = require('react-native-maps')`. The module is native-only, so a file
  // with a web branch requires it lazily inside the native one rather than importing it at the
  // top -- `EntryGalleryModal.js:62` does exactly that, and an import-only pattern misses it.
  /\{([^}]*)\}\s*=\s*require\(\s*['"]react-native-maps['"]\s*\)/g,
];

/**
 * The names one source file pulls out of `react-native-maps` by name.
 *
 * `MapView` is the default export, under whatever local name a file gives it, so it is not in
 * here -- the default is asserted on the stub directly.
 */
function namesImportedFrom(source) {
  const names = new Set();

  for (const pattern of NAMED_FORMS) {
    for (const match of source.matchAll(pattern)) {
      match[1]
        .split(',')
        // `{ Marker as Pin }` binds `Pin` locally but asks the module for `Marker`, and it is
        // the module's name the stub has to carry.
        .map((name) => name.trim().split(/\s+as\s+/)[0].trim())
        .filter(Boolean)
        .forEach((name) => names.add(name));
    }
  }

  return names;
}

/** Every name the app pulls out of the module by name, across every file scanned. */
function namesImportedAcrossSrc() {
  const named = new Set();
  for (const file of appSourceFiles()) {
    namesImportedFrom(fs.readFileSync(file, 'utf8')).forEach((name) => named.add(name));
  }
  return named;
}

/** A repo-relative path with forward slashes, so an assertion reads the same on every platform. */
const relative = (file) => path.relative(SRC, file).split(path.sep).join('/');

describe('the shared react-native-maps stub', () => {
  it('loads at all, which is the whole point of it', () => {
    expect(MapView).toBeDefined();
    expect([Marker, Callout, Polyline].every(Boolean)).toBe(true);
    expect(PROVIDER_GOOGLE).toBe('google');
  });

  it('renders, and takes a ref without a warning', () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    const ref = React.createRef();
    let tree;

    act(() => {
      tree = renderer.create(
        <MapView ref={ref} testID="stub-map">
          <Marker coordinate={{ latitude: 51.5, longitude: -0.14 }} />
          <Polyline coordinates={[]} />
        </MapView>,
      );
    });

    expect(error).not.toHaveBeenCalled();
    expect(ref.current).not.toBeNull();
    expect(tree.root.findAll((node) => node.props?.testID === 'stub-map').length).toBeGreaterThan(0);

    act(() => tree.unmount());
    error.mockRestore();
  });

  it('scans every app file under src, not just the map folder and the explorer sheet', () => {
    const scanned = appSourceFiles().map(relative);

    // The file that found this guard wanting (round-2 finding B). `EntryGalleryModal.js:61-62`
    // pulls the default export and `{ Marker }` and sits in neither of the two places the scan
    // looked, so the promise at the top of this file -- that a new name fails "in one obvious
    // place" -- did not hold for it.
    expect(scanned).toContain('components/journal/EntryGalleryModal.js');
    expect(scanned).toContain('components/journal/MediaExplorerSheet.js');
    expect(scanned).toContain('components/map/NumberedPin.js');
    // Not the test folders: a suite that declares its own `jest.mock` does not rely on the
    // shared stub, so its imports must not be allowed to drive the stub's contract.
    expect(scanned.filter((file) => file.includes('__tests__'))).toEqual([]);
  });

  it('reads a name out of a require, not only out of an import', () => {
    // `EntryGalleryModal.js:62`, verbatim. The module is native-only, so that file requires it
    // lazily inside its native branch rather than importing it at the top -- a form an
    // import-only pattern cannot see.
    const source = "  const { Marker } = require('react-native-maps');";

    expect([...namesImportedFrom(source)]).toEqual(['Marker']);
  });

  it('reads every statement in a file, not just the first one it finds', () => {
    // `EntryGalleryModal.js:61-62` is two statements, and nothing stops a file having two
    // imports. A single non-global match stops at the first and the rest are invisible.
    const source = [
      "import MapView, { Marker } from 'react-native-maps';",
      "import { Callout } from 'react-native-maps';",
      'const Lazy = require("react-native-maps").default;',
      "const { Polyline, PROVIDER_GOOGLE } = require('react-native-maps');",
    ].join('\n');

    expect([...namesImportedFrom(source)].sort()).toEqual(
      ['Callout', 'Marker', 'PROVIDER_GOOGLE', 'Polyline'].sort(),
    );
  });

  it('stubs every name this app imports from the module, and no more', () => {
    // Everything src asks for by name, and nothing invented here.
    expect([...namesImportedAcrossSrc()].sort()).toEqual([
      'Callout',
      'Marker',
      'PROVIDER_GOOGLE',
      'Polyline',
    ]);

    const stub = require('react-native-maps');
    expect(Object.keys(stub).sort()).toEqual([
      '__esModule',
      'Callout',
      'MapView',
      'Marker',
      'PROVIDER_GOOGLE',
      'Polyline',
      'default',
    ].sort());
  });
});
