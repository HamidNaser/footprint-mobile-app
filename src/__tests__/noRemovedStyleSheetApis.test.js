/**
 * React Native 0.86 removed StyleSheet.absoluteFillObject. Spreading it spreads `undefined`,
 * which silently drops `position: 'absolute'`: on an iPhone the capture camera overlay laid out
 * at {y: 852, height: 0} and was invisible (013-capture-fixes, design row 1). Nothing renders
 * wrong in jest, so this guards the source instead.
 */
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '..');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(js|jsx|ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

it('uses no StyleSheet API that React Native 0.86 removed', () => {
  const offenders = walk(SRC)
    .filter((file) => file !== __filename)
    .filter((file) => /StyleSheet\.absoluteFillObject/.test(fs.readFileSync(file, 'utf8')))
    .map((file) => path.relative(SRC, file));
  expect(offenders).toEqual([]);
});

it('really is gone from this React Native', () => {
  const { StyleSheet } = jest.requireActual('react-native');
  expect(StyleSheet.absoluteFillObject).toBeUndefined();
  expect(StyleSheet.absoluteFill).toEqual(
    expect.objectContaining({ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }),
  );
});
