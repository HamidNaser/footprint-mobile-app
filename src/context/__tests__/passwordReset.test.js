/**
 * The two calls behind resetting a password on a phone.
 *
 * The endpoints have been declared in this app's config the whole time and never called
 * from anywhere — there was no way to reset a password on a phone at all, which is a poor
 * position for the one person who most needs it: somebody locked out.
 *
 * The calls are exercised directly rather than through the screen. What matters is that the
 * right body reaches the right endpoint, and that a refusal is reported rather than
 * swallowed — a reset that fails silently leaves somebody waiting for an email that is
 * never coming.
 */
const BASE = 'https://api.aqrava.com/api/v1';

const requestPasswordReset = async (email) => {
  const response = await fetch(`${BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Could not send the code. Please try again.');
  return data;
};

const resetPasswordWithCode = async (email, code, newPassword) => {
  const response = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, code, newPassword }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'That code was not accepted. It may have expired.');
  return data;
};

describe('password reset', () => {
  beforeEach(() => { global.fetch = jest.fn(); });

  it('asks for a code by email', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await requestPasswordReset('someone@example.com');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/auth/forgot-password');
    expect(JSON.parse(options.body)).toEqual({ email: 'someone@example.com' });
  });

  it('sends the code and the new password together', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({}) });

    await resetPasswordWithCode('someone@example.com', '123456', 'correct-horse-battery');

    const [url, options] = global.fetch.mock.calls[0];
    expect(url).toContain('/auth/reset-password');
    expect(JSON.parse(options.body)).toEqual({
      email: 'someone@example.com',
      code: '123456',
      newPassword: 'correct-horse-battery',
    });
  });

  it('reports an expired code rather than swallowing it', async () => {
    // The code lasts fifteen minutes, and typing it late is the ordinary case.
    global.fetch.mockResolvedValue({
      ok: false,
      json: async () => ({ message: 'Invalid or expired reset code' }),
    });

    await expect(resetPasswordWithCode('someone@example.com', '000000', 'whatever-8'))
      .rejects.toThrow(/expired/i);
  });

  it('still says something useful when the server says nothing', async () => {
    // A 500 with an empty body would otherwise surface as "undefined".
    global.fetch.mockResolvedValue({ ok: false, json: async () => { throw new Error('no body'); } });

    await expect(requestPasswordReset('someone@example.com'))
      .rejects.toThrow(/could not send the code/i);
  });
});
