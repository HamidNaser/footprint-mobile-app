import React, { createContext, useCallback, useContext, useRef, useState } from 'react';

/**
 * Tells media tiles whether they are on screen (007 FR-027, SC-007).
 *
 * A list host (FlatList / SectionList) wraps each row in <TileVisibility visible={...}>; a tile
 * inside it stops asking the server about its photo while the row is off screen and asks again
 * when it returns. A tile with no host above it is treated as visible, so a screen that has
 * not been wired up behaves exactly as before.
 *
 *   const { onViewableItemsChanged, viewabilityConfig, isViewable } = useViewableKeys();
 *   <FlatList onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={viewabilityConfig}
 *     renderItem={({ item }) => <TileVisibility visible={isViewable(item.id)}>...</TileVisibility>} />
 *
 * `onViewableItemsChanged` is created once (React Native does not allow it to change on a live
 * list), so it only records keys and re-renders the host.
 */
const MediaVisibilityContext = createContext(true);

export function TileVisibility({ visible, children }) {
  return <MediaVisibilityContext.Provider value={visible !== false}>{children}</MediaVisibilityContext.Provider>;
}

/** Whether the nearest host says this tile is on screen. True when there is no host. */
export function useTileVisibility() {
  return useContext(MediaVisibilityContext);
}

const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1 };

/**
 * List-host helper. Until the list reports its first viewable set every row counts as visible,
 * so nothing is held back before FlatList has measured anything.
 */
export function useViewableKeys(keyExtractor = (item) => item?.key ?? item?.id, numColumns = 1) {
  const [keys, setKeys] = useState(null);
  const extractRef = useRef(keyExtractor);
  extractRef.current = keyExtractor;
  const columnsRef = useRef(numColumns);
  columnsRef.current = numColumns || 1;
  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    const next = new Set();
    for (const v of viewableItems) {
      // numColumns > 1: a viewable "row" is an array of items; their own keys count, not the row's.
      // The index passed is the item's index in the data (row * numColumns + column), as FlatList's
      // own keyExtractor call gets it, so index-based fallback keys line up.
      if (Array.isArray(v.item)) v.item.forEach((it, i) => next.add(extractRef.current(it, (v.index ?? 0) * columnsRef.current + i)));
      else {
        // Both the list's own key for the row AND the key the caller's extractor makes of the
        // item, because in a SectionList they are not the same string: VirtualizedSectionList
        // builds a row's key as `<section>:<itemKey>` (its `_subExtractor`), so a caller asking
        // `isViewable(keyExtractor(item))` -- which is what `wrapRender` below and every screen
        // does -- would never match and every row would read as off screen the moment the list
        // reported anything. Recording both is additive: the set only grows, so nothing that was
        // viewable stops being so. The cost is that two items in different sections sharing an
        // extractor key are viewable together; with entry ids as keys that means a duplicate
        // entry, which is not a case this distinguishes anyway.
        if (v.key != null) next.add(v.key);
        const own = extractRef.current(v.item, v.index);
        if (own != null) next.add(own);
      }
    }
    setKeys(next);
  }, []);
  const isViewable = useCallback((key) => keys === null || keys.has(key), [keys]);
  return { onViewableItemsChanged, viewabilityConfig: VIEWABILITY_CONFIG, isViewable, keys };
}

export default TileVisibility;
