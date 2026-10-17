/**
 * 007 FR-027, SC-007 -- the list and scroll-view wrappers that tell media tiles whether they
 * are on screen. An off-screen tile must not watch; it watches when it comes into view.
 */
import React from 'react';
import { FlatList, ScrollView, SectionList, Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';

import { useTileVisibility } from '../../../hooks/mediaVisibility';
import { ViewportFlatList, ViewportSectionList, ViewportScrollView, ViewportTile } from '../ViewportLists';

global.IS_REACT_ACT_ENVIRONMENT = true;

function Probe({ id }) {
  return <Text testID={`row-${id}`}>{useTileVisibility() ? 'visible' : 'hidden'}</Text>;
}
const state = (tree, id) => tree.root.findByProps({ testID: `row-${id}` }).props.children;
const token = (id, index) => ({ key: id, item: { id }, index, isViewable: true });

describe('ViewportFlatList', () => {
  const data = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const make = (extra) => {
    let tree;
    act(() => {
      tree = renderer.create(
        <ViewportFlatList data={data} keyExtractor={(i) => i.id} renderItem={({ item }) => <Probe id={item.id} />} {...extra} />,
      );
    });
    return tree;
  };

  it('every row counts as visible until the list reports what is viewable', () => {
    const tree = make();
    expect(['a', 'b', 'c'].map((id) => state(tree, id))).toEqual(['visible', 'visible', 'visible']);
  });

  it('rows leave and enter the viewable set, and re-render when they do', () => {
    const tree = make();
    const list = tree.root.findByType(FlatList);
    act(() => list.props.onViewableItemsChanged({ viewableItems: [token('a', 0)], changed: [] }));
    expect(['a', 'b', 'c'].map((id) => state(tree, id))).toEqual(['visible', 'hidden', 'hidden']);
    act(() => tree.root.findByType(FlatList).props.onViewableItemsChanged({ viewableItems: [token('b', 1), token('c', 2)], changed: [] }));
    expect(['a', 'b', 'c'].map((id) => state(tree, id))).toEqual(['hidden', 'visible', 'visible']);
  });

  it('keeps one stable onViewableItemsChanged and viewabilityConfig (React Native forbids changing them)', () => {
    const tree = make();
    const first = tree.root.findByType(FlatList).props;
    act(() => first.onViewableItemsChanged({ viewableItems: [token('a', 0)], changed: [] }));
    const second = tree.root.findByType(FlatList).props;
    expect(second.onViewableItemsChanged).toBe(first.onViewableItemsChanged);
    expect(second.viewabilityConfig).toBe(first.viewabilityConfig);
  });

  it('numColumns: a viewable row is an array; each item in it is visible', () => {
    const tree = make({ numColumns: 2 });
    const list = tree.root.findByType(FlatList);
    act(() => list.props.onViewableItemsChanged({ viewableItems: [{ key: 'a:b', item: [data[0], data[1]], index: 0 }], changed: [] }));
    expect(['a', 'b', 'c'].map((id) => state(tree, id))).toEqual(['visible', 'visible', 'hidden']);
  });

  it('passes the host extraData through and still forwards the ref', () => {
    const ref = React.createRef();
    const tree = make({ ref, extraData: 'x' });
    expect(ref.current).toBeTruthy();
    expect(tree.root.findByType(FlatList).props.extraData[0]).toBe('x');
  });
});

describe('ViewportFlatList: numColumns keys, extraData, host callbacks', () => {
  it('numColumns: item keys use the data index (row * numColumns + column), as the host keyExtractor sees them', () => {
    const data = [{}, {}, {}, {}];
    let tree;
    act(() => {
      tree = renderer.create(
        <ViewportFlatList
          data={data}
          numColumns={2}
          keyExtractor={(_item, index) => `media-${index}`}
          renderItem={({ index }) => <Probe id={index} />}
        />,
      );
    });
    // Row 1 (data indexes 2 and 3) is the only viewable row.
    act(() =>
      tree.root.findByType(FlatList).props.onViewableItemsChanged({
        viewableItems: [{ key: 'media-2:media-3', item: [data[2], data[3]], index: 1 }],
        changed: [],
      }),
    );
    expect([0, 1, 2, 3].map((i) => state(tree, i))).toEqual(['hidden', 'hidden', 'visible', 'visible']);
  });

  it('keeps the same extraData array while nothing changed, so FlatList can skip the render', () => {
    const data = [{ id: 'a' }];
    const el = (
      <ViewportFlatList data={data} keyExtractor={(i) => i.id} extraData="x" renderItem={({ item }) => <Probe id={item.id} />} />
    );
    let tree;
    act(() => {
      tree = renderer.create(el);
    });
    const first = tree.root.findByType(FlatList).props.extraData;
    act(() => tree.update(el));
    expect(tree.root.findByType(FlatList).props.extraData).toBe(first);
  });

  it("calls the host's own onViewableItemsChanged too, and honours its viewabilityConfig", () => {
    const data = [{ id: 'a' }, { id: 'b' }];
    const hostCb = jest.fn();
    const config = { itemVisiblePercentThreshold: 50 };
    let tree;
    act(() => {
      tree = renderer.create(
        <ViewportFlatList
          data={data}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => <Probe id={item.id} />}
          onViewableItemsChanged={hostCb}
          viewabilityConfig={config}
        />,
      );
    });
    expect(tree.root.findByType(FlatList).props.viewabilityConfig).toBe(config);
    const info = { viewableItems: [token('a', 0)], changed: [] };
    act(() => tree.root.findByType(FlatList).props.onViewableItemsChanged(info));
    expect(hostCb).toHaveBeenCalledWith(info);
    expect([state(tree, 'a'), state(tree, 'b')]).toEqual(['visible', 'hidden']);
  });
});

describe('ViewportSectionList', () => {
  it('gates items by the key the host extracts', () => {
    const sections = [{ title: 'T', data: [{ id: 'a' }, { id: 'b' }] }];
    let tree;
    act(() => {
      tree = renderer.create(
        <ViewportSectionList sections={sections} keyExtractor={(i) => i.id} renderItem={({ item }) => <Probe id={item.id} />} />,
      );
    });
    act(() => tree.root.findByType(SectionList).props.onViewableItemsChanged({ viewableItems: [token('b', 1)], changed: [] }));
    expect([state(tree, 'a'), state(tree, 'b')]).toEqual(['hidden', 'visible']);
  });
});

describe('ViewportScrollView + ViewportTile', () => {
  // Window coordinates the fake native nodes report; mutable so a test can "scroll".
  const pos = { near: { y: 100, h: 100 }, far: { y: 3000, h: 100 } };
  const fakeNode = (id) => (cb) => cb(0, pos[id].y, 100, pos[id].h);

  function mount() {
    const sv = React.createRef();
    let tree;
    act(() => {
      tree = renderer.create(
        <ViewportScrollView ref={sv}>
          <ViewportTile testID="near"><Probe id="near" /></ViewportTile>
          <ViewportTile testID="far"><Probe id="far" /></ViewportTile>
        </ViewportScrollView>,
      );
    });
    // react-native's jest View is a class component: its instance is what the ref holds.
    ['near', 'far'].forEach((id) => {
      const view = tree.root.findAll((n) => n.props.testID === id && n.instance)[0];
      view.instance.measureInWindow = fakeNode(id);
    });
    // The scroll view itself occupies window y 0..600.
    sv.current.measureInWindow = (cb) => cb(0, 0, 400, 600);
    return { tree, sv };
  }

  it('visible until measured', () => {
    const { tree } = mount();
    expect([state(tree, 'near'), state(tree, 'far')]).toEqual(['visible', 'visible']);
  });

  it('an off-screen tile is hidden once measured, and visible when scrolling brings it in', () => {
    const { tree } = mount();
    act(() => tree.root.findByType(ScrollView).props.onLayout({}));
    expect([state(tree, 'near'), state(tree, 'far')]).toEqual(['visible', 'hidden']);

    pos.far.y = 400; // scrolled up: now inside the window
    act(() => tree.root.findByType(ScrollView).props.onMomentumScrollEnd({}));
    expect(state(tree, 'far')).toBe('visible');

    pos.far.y = -2000; // and back out the top
    act(() => tree.root.findByType(ScrollView).props.onScrollEndDrag({}));
    expect(state(tree, 'far')).toBe('hidden');
    pos.far.y = 3000;
  });

  it('a tile outside any ViewportScrollView is always visible', () => {
    let tree;
    act(() => {
      tree = renderer.create(<ViewportTile><Probe id="solo" /></ViewportTile>);
    });
    expect(state(tree, 'solo')).toBe('visible');
  });
});
