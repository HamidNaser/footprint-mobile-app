import { pickEditableProfileFields, EDITABLE_PROFILE_FIELDS } from '../profileFields';

/**
 * What the profile editor is allowed to send.
 *
 * It is opened with the entire user object, and whatever came back was PATCHed wholesale --
 * `_etag`, `id`, `email` and the nested education, employment and address arrays included.
 * The server accepts a handful of scalars, so the extra fields were at best ignored and at
 * worst enough to fail the model binding, which is one of the two candidate causes of
 * "saving does nothing".
 */
describe('pickEditableProfileFields', () => {
  const wholeUser = {
    id: 'user-1',
    email: 'someone@example.com',
    _etag: '"7"',
    firstName: 'Hamid',
    lastName: 'Naser',
    nameArabic: 'حامد',
    phoneNumber: '+1 555 0100',
    bio: 'Building FootPrint',
    education: [{ id: 'e1', institution: 'SIUE' }],
    employment: [{ id: 'j1', company: 'Aqrava' }],
    addresses: [{ id: 'a1', city: 'Swansea' }],
    version: 7,
  };

  it('keeps the fields the editor owns', () => {
    const picked = pickEditableProfileFields(wholeUser);

    expect(picked.firstName).toBe('Hamid');
    expect(picked.lastName).toBe('Naser');
    expect(picked.phoneNumber).toBe('+1 555 0100');
    expect(picked.bio).toBe('Building FootPrint');
  });

  it('drops identity and version fields', () => {
    // Sending the etag in the body is harmless; sending the id invites a server to trust
    // it. Neither belongs in a request that says "change my name".
    const picked = pickEditableProfileFields(wholeUser);

    expect(picked).not.toHaveProperty('id');
    expect(picked).not.toHaveProperty('email');
    expect(picked).not.toHaveProperty('_etag');
    expect(picked).not.toHaveProperty('version');
  });

  it('drops the nested collections', () => {
    // These have their own endpoints. Posting them here asks one request to mean two
    // things, and the server accepts neither.
    const picked = pickEditableProfileFields(wholeUser);

    expect(picked).not.toHaveProperty('education');
    expect(picked).not.toHaveProperty('employment');
    expect(picked).not.toHaveProperty('addresses');
  });

  it('keeps a cleared field, because clearing is an edit', () => {
    expect(pickEditableProfileFields({ bio: '' })).toEqual({ bio: '' });
  });

  it('omits a field that was never touched', () => {
    // Absent is not blank. Sending undefined asks the server to consider changing it;
    // omitting it says nothing about it at all.
    const picked = pickEditableProfileFields({ firstName: 'Hamid', lastName: undefined });

    expect(picked).toEqual({ firstName: 'Hamid' });
  });

  it('survives being handed nothing', () => {
    expect(pickEditableProfileFields(null)).toEqual({});
    expect(pickEditableProfileFields(undefined)).toEqual({});
  });

  it('lists only fields the server actually accepts', () => {
    // Mirrors UpdateProfileRequest. A field added to the editor and not to the contract is
    // a save that appears to work and changes nothing.
    expect(EDITABLE_PROFILE_FIELDS).toEqual(
      expect.arrayContaining(['firstName', 'lastName', 'nameArabic', 'phoneNumber', 'bio'])
    );
    expect(EDITABLE_PROFILE_FIELDS).toHaveLength(5);
  });
});
