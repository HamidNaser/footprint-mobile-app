/**
 * Default icon set -- maps the theme's semantic icon names onto Ionicons,
 * which the app already depends on. Themes that ship their own artwork
 * (see StorybookIconSet) replace this wholesale.
 */
import React from 'react';
import { Ionicons } from '@expo/vector-icons';

// [outline, filled]
const MAP = {
  'home':          ['home-outline', 'home'],
  'journal':       ['book-outline', 'book'],
  'family':        ['people-outline', 'people'],
  'friends':       ['person-add-outline', 'person-add'],
  'places':        ['map-outline', 'map'],
  'timeline':      ['git-branch-outline', 'git-branch'],
  'location':      ['location-outline', 'location'],
  'calendar':      ['calendar-outline', 'calendar'],
  'search':        ['search-outline', 'search'],
  'notification':  ['notifications-outline', 'notifications'],
  'settings':      ['settings-outline', 'settings'],
  'add-person':    ['person-add-outline', 'person-add'],
  'chevron-down':  ['chevron-down', 'chevron-down'],
  'chevron-up':    ['chevron-up', 'chevron-up'],
};

export default function IoniconsSet({ name, size = 24, color, active = false }) {
  const pair = MAP[name];
  const glyph = pair ? pair[active ? 1 : 0] : 'ellipse-outline';
  return <Ionicons name={glyph} size={size} color={color} />;
}
