/** Block control bytes and invisible direction overrides in public visitor text. */
export function hasUnsafeCharacters(value) {
  // eslint-disable-next-line no-control-regex -- Control bytes are deliberately rejected.
  return /[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/.test(value);
}
