/**
 * NumberedPin (013 T043) -- one marker on the map under a memory.
 *
 * A pin stands for a *group* of pieces: the pieces whose coordinates round to the same
 * 5-decimal key (about a metre) share one marker, and a lone piece is simply a group of one
 * (FR-023, research R10). So the pin is given `numbers` and nothing else decides what it is:
 * one number draws that number, several draw how many pieces are there, and a press hands the
 * whole group back, because tapping a merged marker highlights all of its pieces (FR-025).
 *
 * The coordinate test below is the one with teeth. `lat: 0` and `lng: 0` are real places -- the
 * equator and the prime meridian -- and `EntryMarker` on `release/1.0` drops a marker whose
 * latitude is falsy (`:182`), which silently loses a memory made on either line. This pin
 * tests with `== null` instead, so only a missing coordinate is missing.
 *
 * `react-native-maps` is native and cannot load under jest, so it is mocked to a string
 * element the way `EntryMarker.test.js` mocks it; the props the real `Marker` would receive
 * are then readable on the tree.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

jest.mock('react-native-maps', () => ({ Marker: 'Marker' }));

import NumberedPin, { PIN_COLOURS } from '../NumberedPin';

global.IS_REACT_ACT_ENVIRONMENT = true;

const render = (props) => {
  let tree;
  act(() => {
    tree = renderer.create(<NumberedPin numbers={[1]} kind="text" lat={51.5} lng={-0.14} {...props} />);
  });
  return tree;
};

const marker = (tree) => tree.root.findByType('Marker');
const bubbleStyle = (tree) =>
  StyleSheet.flatten(tree.root.findByProps({ testID: 'numbered-pin' }).props.style);
const label = (tree) => tree.root.findByProps({ testID: 'numbered-pin-label' }).props.children;

describe('a single pin', () => {
  it('shows its number', () => {
    expect(label(render({ numbers: [3] }))).toBe('3');
  });

  it('sits exactly on its coordinate', () => {
    expect(marker(render({ lat: 51.5009123, lng: -0.1420456 })).props.coordinate).toEqual({
      latitude: 51.5009123,
      longitude: -0.1420456,
    });
  });

  it('never repaints itself: there is nothing in it that arrives late', () => {
    // A native marker snapshots its view. A number and a colour are both known at render
    // time, so unlike a photo marker this one is settled from the start.
    expect(marker(render({})).props.tracksViewChanges).toBe(false);
  });
});

describe('a pin is coloured by its kind', () => {
  // The four kinds of piece, in the prototype's colours, which its map legend reads
  // "Note | Voice | Photo | Video". The kind names are the stored ones (`audio`, not `voice`).
  it.each([
    ['text', '#4361ee'],
    ['audio', '#8e44ad'],
    ['photo', '#2f9e6e'],
    ['video', '#c27c0e'],
  ])('a %s piece is %s', (kind, colour) => {
    expect(PIN_COLOURS[kind]).toBe(colour);
    expect(bubbleStyle(render({ kind })).backgroundColor).toBe(colour);
  });

  it('a kind it does not know still draws a pin', () => {
    // A piece with an unrecognised kind is still a piece in a place. Hiding its pin would
    // break the no-gaps numbering (FR-023) by leaving a number with nothing to tap.
    const tree = render({ kind: 'hologram', numbers: [2] });

    expect(label(tree)).toBe('2');
    expect(bubbleStyle(tree).backgroundColor).toBeDefined();
  });
});

describe('a merged pin', () => {
  it('shows how many pieces it holds, not their numbers', () => {
    expect(label(render({ numbers: [2, 3, 4] }))).toBe('3');
  });

  it('is one marker, however many pieces it holds', () => {
    expect(render({ numbers: [2, 3, 4] }).root.findAllByType('Marker')).toHaveLength(1);
  });
});

describe('a pin is drawn only where there is a place', () => {
  it('counts lat 0 as placed, because the equator is a real place', () => {
    const tree = render({ lat: 0, lng: 0, numbers: [1] });

    expect(marker(tree).props.coordinate).toEqual({ latitude: 0, longitude: 0 });
    expect(label(tree)).toBe('1');
  });

  it.each([
    ['no latitude', { lat: null }],
    ['no longitude', { lng: null }],
    ['neither', { lat: undefined, lng: undefined }],
  ])('draws nothing with %s', (_why, coords) => {
    expect(render(coords).root.findAllByType('Marker')).toHaveLength(0);
  });
});

describe('pressing a pin', () => {
  it('hands back the one number it holds', () => {
    const onPress = jest.fn();
    act(() => marker(render({ numbers: [3], onPress })).props.onPress());

    expect(onPress).toHaveBeenCalledWith([3]);
  });

  it('hands back every number a merged pin holds, so the card can highlight them all', () => {
    const onPress = jest.fn();
    act(() => marker(render({ numbers: [2, 3, 4], onPress })).props.onPress());

    expect(onPress).toHaveBeenCalledWith([2, 3, 4]);
  });

  it('is pressable with no handler given', () => {
    expect(() => act(() => marker(render({ onPress: undefined })).props.onPress())).not.toThrow();
  });
});
