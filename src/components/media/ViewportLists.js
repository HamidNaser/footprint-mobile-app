import React, { forwardRef, useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, ScrollView, SectionList, View } from 'react-native';
import { TileVisibility, useViewableKeys } from '../../hooks/mediaVisibility';

/**
 * Drop-in lists and scroll views that tell the media tiles inside them whether they are on
 * screen (007 FR-027, SC-007): an off-screen tile does not ask the server about its photo.
 *
 *  - ViewportFlatList / ViewportSectionList: swap in for FlatList / SectionList. Rows the list
 *    reports as viewable are visible; the rest are not. Until the list has reported anything,
 *    every row counts as visible. `extraData` is managed here so rows re-render when the
 *    viewable set changes.
 *  - ViewportScrollView + ViewportTile: for a plain ScrollView grid, which has no viewability
 *    callback. Wrap each tile in <ViewportTile>; it is visible while it overlaps the scroll
 *    view's window (plus a margin). Measured when the view lays out and when scrolling settles.
 */

const keyOf = (keyExtractor, item, index) => (keyExtractor ? keyExtractor(item, index) : item?.key ?? item?.id ?? String(index));

function useViewportRows(keyExtractor) {
  const { onViewableItemsChanged, viewabilityConfig, isViewable, keys } = useViewableKeys(keyExtractor);
  return { onViewableItemsChanged, viewabilityConfig, isViewable, keys };
}

function wrapRender(renderItem, isViewable, keyExtractor) {
  return (info) => (
    <TileVisibility visible={isViewable(keyOf(keyExtractor, info.item, info.index))}>{renderItem(info)}</TileVisibility>
  );
}

export const ViewportFlatList = forwardRef(function ViewportFlatList({ renderItem, keyExtractor, extraData, ...rest }, ref) {
  const { onViewableItemsChanged, viewabilityConfig, isViewable, keys } = useViewportRows(keyExtractor);
  const render = useMemo(() => wrapRender(renderItem, isViewable, keyExtractor), [renderItem, isViewable, keyExtractor]);
  return (
    <FlatList
      {...rest}
      ref={ref}
      keyExtractor={keyExtractor}
      renderItem={render}
      extraData={[extraData, keys]}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
    />
  );
});

export const ViewportSectionList = forwardRef(function ViewportSectionList({ renderItem, keyExtractor, extraData, ...rest }, ref) {
  const { onViewableItemsChanged, viewabilityConfig, isViewable, keys } = useViewportRows(keyExtractor);
  const render = useMemo(() => wrapRender(renderItem, isViewable, keyExtractor), [renderItem, isViewable, keyExtractor]);
  return (
    <SectionList
      {...rest}
      ref={ref}
      keyExtractor={keyExtractor}
      renderItem={render}
      extraData={[extraData, keys]}
      onViewableItemsChanged={onViewableItemsChanged}
      viewabilityConfig={viewabilityConfig}
    />
  );
});

// ---------------------------------------------------------------------------------------------
// ScrollView grids
// ---------------------------------------------------------------------------------------------

const ScrollWindowContext = React.createContext(null);
const WINDOW_MARGIN = 200;

export const ViewportScrollView = forwardRef(function ViewportScrollView(
  { onLayout, onMomentumScrollEnd, onScrollEndDrag, children, ...rest },
  forwardedRef,
) {
  const innerRef = useRef(null);
  const [win, setWin] = useState(null); // { top, bottom, tick }
  const measure = useCallback(() => {
    const node = innerRef.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((_x, y, _w, h) => setWin((w) => ({ top: y, bottom: y + h, tick: (w?.tick ?? 0) + 1 })));
  }, []);
  const setRef = useCallback(
    (node) => {
      innerRef.current = node;
      if (typeof forwardedRef === 'function') forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );
  return (
    <ScrollView
      {...rest}
      ref={setRef}
      onLayout={(e) => {
        measure();
        onLayout?.(e);
      }}
      onMomentumScrollEnd={(e) => {
        measure();
        onMomentumScrollEnd?.(e);
      }}
      onScrollEndDrag={(e) => {
        measure();
        onScrollEndDrag?.(e);
      }}
    >
      <ScrollWindowContext.Provider value={win}>{children}</ScrollWindowContext.Provider>
    </ScrollView>
  );
});

/** Wraps one tile of a ViewportScrollView grid. Without a ViewportScrollView above it, always visible. */
export function ViewportTile({ children, style, testID }) {
  const win = React.useContext(ScrollWindowContext);
  const ref = useRef(null);
  const [rect, setRect] = useState(null); // { top, bottom } in window coordinates
  const measure = useCallback(() => {
    const node = ref.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    node.measureInWindow((_x, y, _w, h) => setRect({ top: y, bottom: y + h }));
  }, []);
  // Re-measure whenever the scroll view reports a settled scroll (its tick moves).
  const tick = win?.tick;
  React.useEffect(() => {
    if (tick !== undefined) measure();
  }, [tick, measure]);
  const visible = !win || !rect || (rect.bottom >= win.top - WINDOW_MARGIN && rect.top <= win.bottom + WINDOW_MARGIN);
  return (
    <View ref={ref} collapsable={false} style={style} testID={testID} onLayout={measure}>
      <TileVisibility visible={visible}>{children}</TileVisibility>
    </View>
  );
}
