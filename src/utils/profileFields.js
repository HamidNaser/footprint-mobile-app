/**
 * The fields the profile editor is allowed to send.
 *
 * The editor is opened with the whole user object — `openEditModal('general', user)` — and
 * whatever it hands back was being PATCHed wholesale: `_etag`, `id`, `email`, and the
 * nested `education`, `employment` and `addresses` arrays along with it. The server accepts
 * a small set of scalars, so at best the extra fields were ignored and at worst the body
 * failed to bind and the save came back 400.
 *
 * Listing them explicitly means the request says what it means. A field added to the editor
 * has to be added here too, which is the right amount of friction: the alternative is a
 * form that silently posts whatever happens to be in scope.
 */
export const EDITABLE_PROFILE_FIELDS = [
  'firstName',
  'lastName',
  'nameArabic',
  'phoneNumber',
  'bio',
];

/**
 * Keep only the editable fields, and only those actually present.
 *
 * Absent is not the same as blank. Sending `undefined` for a field the person never touched
 * would ask the server to consider changing it; omitting it says nothing about it at all.
 * An empty string is kept, because clearing a field is a real edit.
 */
export function pickEditableProfileFields(data) {
  if (!data || typeof data !== 'object') return {};

  const picked = {};
  for (const field of EDITABLE_PROFILE_FIELDS) {
    if (data[field] !== undefined && data[field] !== null) {
      picked[field] = data[field];
    }
  }
  return picked;
}
