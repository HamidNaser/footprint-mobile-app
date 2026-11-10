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
 *    list is checked against the imports in `src/`, so adding an import without adding it here
 *    fails in one obvious place rather than as `Element type is invalid` inside a screen.
 */

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import fs from 'fs';
import path from 'path';

import MapView, { Marker, Callout, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';

global.IS_REACT_ACT_ENVIRONMENT = true;

const SRC = path.join(__dirname, '..', '..', '..');

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

  it('stubs every name this app imports from the module, and no more', () => {
    // Read from the imports themselves, so a new one has to be added here too. `MapView` is
    // the default import, under whatever local name a file gives it.
    const sources = ['components/journal/MediaExplorerSheet.js', 'components/map']
      .flatMap((entry) => {
        const target = path.join(SRC, entry);
        return fs.statSync(target).isDirectory()
          ? fs
              .readdirSync(target)
              .filter((name) => name.endsWith('.js'))
              .map((name) => path.join(target, name))
          : [target];
      })
      .map((file) => fs.readFileSync(file, 'utf8'));

    const named = new Set();
    for (const source of sources) {
      const match = source.match(/import\s+(?:\w+\s*,\s*)?\{([^}]*)\}\s+from\s+'react-native-maps'/);
      if (match) match[1].split(',').map((name) => name.trim()).filter(Boolean).forEach((name) => named.add(name));
    }

    // Everything the map folder and the explorer sheet ask for, and nothing invented here.
    expect([...named].sort()).toEqual(['Callout', 'Marker', 'PROVIDER_GOOGLE', 'Polyline']);

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
