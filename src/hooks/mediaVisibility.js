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
export function useViewableKeys(keyExtractor = (item) => item?.key ?? item?.id) {
  const [keys, setKeys] = useState(null);
  const extractRef = useRef(keyExtractor);
  extractRef.current = keyExtractor;
  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    setKeys(new Set(viewableItems.map((v) => v.key ?? extractRef.current(v.item))));
  }, []);
  const isViewable = useCallback((key) => keys === null || keys.has(key), [keys]);
  return { onViewableItemsChanged, viewabilityConfig: VIEWABILITY_CONFIG, isViewable };
}

export default TileVisibility;
