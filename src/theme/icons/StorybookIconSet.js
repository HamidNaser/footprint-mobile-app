/**
 * Enchanted Storybook icon set.
 *
 * Paths are lifted verbatim from the kit's SVGs (40x40 viewBox, stroke-width
 * 2.5). The kit ships a separate "-active" file per icon, but each one is the
 * same path as its base with a different stroke colour and width -- so this
 * renders one path and varies stroke via props, which is what the files
 * actually describe.
 */
import React from 'react';
import Svg, { Path } from 'react-native-svg';

const PATHS = {
  'home':         'M20 4L6 14v20h10V22h8v12h10V14z',
  'journal':      'M7 5h20a4 4 0 0 1 4 4v24H11a4 4 0 0 0-4 4zM7 5v28a4 4 0 0 1 4-4h20',
  'family':       'M20 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM9 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM31 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 34c1-8 15-8 16 0M3 33c0-5 7-7 10-4M27 29c3-3 10-1 10 4',
  'friends':      'M20 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 34c1-8 15-8 16 0M30 20v12M24 26h12',
  'places':       'M6 34V12l9-5 10 5 5-3v25l-10 4-9-4zM15 7v27M25 12v25',
  'timeline':     'M12 4v32M16 9h12M16 20h12M16 31h8',
  'location':     'M20 36C10 24 7 19 7 13a13 13 0 0 1 26 0c0 6-3 11-13 23zM20 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'calendar':     'M6 8h28v27H6zM12 4v8M28 4v8M6 16h28',
  'search':       'M17 27a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM25 25l9 9',
  'notification': 'M8 29h24M11 29V16a9 9 0 0 1 18 0v13M16 35h8',
  'settings':     'M20 4v6M20 30v6M4 20h6M30 20h6M8.7 8.7l4.2 4.2M27.1 27.1l4.2 4.2M31.3 8.7l-4.2 4.2M12.9 27.1l-4.2 4.2M26 20a6 6 0 1 1-12 0 6 6 0 0 1 12 0z',
  'add-person':   'M18 18a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM8 34c1-8 19-8 20 0M31 14v12M25 20h12',
  'chevron-down': 'M11 16l9 9 9-9',
  'chevron-up':   'M11 25l9-9 9 9',
};

export default function StorybookIconSet({ name, size = 24, color = '#8B735E', active = false }) {
  const d = PATHS[name];
  if (!d) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 40 40">
      <Path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={active ? 2.8 : 2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
