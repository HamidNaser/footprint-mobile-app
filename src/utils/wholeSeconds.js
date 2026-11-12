/** The server's durations are whole seconds (`int?`); a measured 4.37 is refused with a 400. */
export function wholeSeconds(value) {
  if (value === null || value === undefined) return value;
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}
