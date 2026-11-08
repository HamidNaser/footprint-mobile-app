import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

/**
 * `Capture` (T013). Deliberately a stub -- it renders only its title. The real screen
 * (the piece dock, voice/camera capture, the save flow) is built on top of this starting
 * at T030; see `ui-contract.md` for the header titles this mirrors.
 */
export default function CaptureScreen({ route }) {
  const mode = route?.params?.mode ?? 'new';
  const title = mode === 'edit' ? 'Edit memory' : 'New memory';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
});
