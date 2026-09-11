import React, { memo } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';

/**
 * Somebody's photograph, or their initials when there isn't one.
 *
 * Every place that showed an avatar had its own fallback, and all of them were a
 * photograph of a stranger: a lego portrait from randomuser.me on event guests, an
 * Unsplash headshot of a real person on comments and on journal entry headers.
 * The journal card went further and fell back the *name* to "Alex Johnson", so an
 * entry whose author had not loaded was signed by somebody who does not exist.
 *
 * TimelineScreen already had this right, with a local copy of what is now here.
 * Initials rather than a silhouette, for the same reason it chose them: a column
 * of identical grey heads is worse than no picture, and initials at least tell one
 * unphotographed person from the next.
 */

/** A stable hue per person, so the same name is the same colour every time. */
function hueFor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) % 360;
  }
  return hash;
}

/** First and last initials — "Akram Naser" becomes AN, "Reem" becomes R. */
function initialsFor(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';

  const first = words[0].charAt(0);
  const last = words.length > 1 ? words[words.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

const Avatar = memo(({ src, name = '', size = 32, style }) => {
  const dim = { width: size, height: size, borderRadius: size / 2 };

  if (src) {
    return <Image source={{ uri: src }} style={[dim, style]} />;
  }

  const hue = hueFor(name);

  return (
    <View
      style={[
        dim,
        styles.fallback,
        { backgroundColor: `hsl(${hue}, 30%, 86%)` },
        style,
      ]}
    >
      <Text
        style={[
          styles.initials,
          { fontSize: size * 0.4, color: `hsl(${hue}, 42%, 32%)` },
        ]}
      >
        {initialsFor(name)}
      </Text>
    </View>
  );
});

Avatar.displayName = 'Avatar';

const styles = StyleSheet.create({
  fallback: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  initials: { fontWeight: '700' },
});

export default Avatar;
