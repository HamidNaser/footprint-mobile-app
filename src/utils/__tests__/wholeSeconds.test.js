import { wholeSeconds } from '../wholeSeconds';

it.each([[4.37, 4], [4.5, 5], [0.2, 0], [12, 12], [null, null], [undefined, undefined], ['7', null], [NaN, null]])(
  'wholeSeconds(%p) is %p', (input, expected) => expect(wholeSeconds(input)).toBe(expected));
