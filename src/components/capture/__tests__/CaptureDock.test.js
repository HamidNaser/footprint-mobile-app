import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { StyleSheet, Text } from 'react-native';
import CaptureDock from '../CaptureDock';

jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

it('lays the recording bar across the whole dock, not in an 88 px slot', () => {
  let tree;
  act(() => { tree = renderer.create(<CaptureDock voice={<Text testID="voice" />} isRecording />); });
  const slot = tree.root.findByProps({ testID: 'voice' }).parent;
  const style = StyleSheet.flatten(slot.props.style);
  expect(style.position).toBe('absolute');
  expect(style.left).toBe(0);
  expect(style.right).toBe(0);
  expect(style.width).toBe('100%');
});
