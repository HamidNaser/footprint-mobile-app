/**
 * The digest here is Node's, injected. expo-crypto is a native module that jest-expo
 * stubs out, and a test that hashes with a stub proves only that the stub was called.
 * Node's SHA-256 is the same SHA-256 the device computes, so injecting it tests the
 * assembly-and-encoding work this module actually does.
 */

import { createHash } from 'crypto';
import { contentHash, buildHashMessage, HASH_PREFIX_BYTES } from '../contentHash';

const nodeDigest = async (bytes) => createHash('sha256').update(Buffer.from(bytes)).digest().buffer;

/** Deterministic bytes, so a hash is comparable across runs. */
const bytesOfSize = (size, seed = 1) =>
  Uint8Array.from({ length: size }, (_, i) => (i * 31 + seed) % 256);

/** Stands in for the file system: one file of known content and length. */
const fileOf = (bytes) => ({
  getSize: async () => bytes.length,
  readPrefix: async (_uri, length) => bytes.slice(0, length),
  digest: nodeDigest,
});

describe('buildHashMessage', () => {
  it('puts the file bytes first, untouched', () => {
    const prefix = bytesOfSize(16, 4);

    const message = buildHashMessage(prefix, 16);

    expect([...message.slice(0, 16)]).toEqual([...prefix]);
  });

  it('appends the length as eight big-endian bytes', () => {
    const message = buildHashMessage(new Uint8Array([1, 2]), 258);

    expect([...message.slice(2)]).toEqual([0, 0, 0, 0, 0, 0, 1, 2]);
  });
});

describe('contentHash', () => {
  it('is lowercase hex of a SHA-256 digest', async () => {
    const hash = await contentHash('file://a.jpg', { deps: fileOf(bytesOfSize(512)) });

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('gives the same answer for the same bytes', async () => {
    const deps = fileOf(bytesOfSize(1024, 7));

    const first = await contentHash('file://a.jpg', { deps });
    const second = await contentHash('file://elsewhere/b.jpg', { deps });

    expect(first).toBe(second);
  });

  it('gives a different answer for different bytes', async () => {
    const a = await contentHash('file://a.jpg', { deps: fileOf(bytesOfSize(1024, 7)) });
    const b = await contentHash('file://b.jpg', { deps: fileOf(bytesOfSize(1024, 8)) });

    expect(a).not.toBe(b);
  });

  // Without the length in the hash, a truncated copy of a photo collides with the
  // original -- and under prefix hashing that is exactly what a truncated copy is.
  it('distinguishes files that begin identically but differ in length', async () => {
    const short = await contentHash('file://a.jpg', { deps: fileOf(bytesOfSize(2048, 3)) });
    const long = await contentHash('file://b.jpg', { deps: fileOf(bytesOfSize(4096, 3)) });

    expect(short).not.toBe(long);
  });

  it('reads no more than the prefix, however large the file is', async () => {
    const bytes = bytesOfSize(HASH_PREFIX_BYTES + 5000, 2);
    let requestedLength = null;
    const deps = {
      ...fileOf(bytes),
      readPrefix: async (_uri, length) => {
        requestedLength = length;
        return bytes.slice(0, length);
      },
    };

    await contentHash('file://big.jpg', { deps });

    expect(requestedLength).toBe(HASH_PREFIX_BYTES);
  });

  it('hashes the whole of a file shorter than the prefix', async () => {
    const bytes = bytesOfSize(100, 9);
    let requestedLength = null;
    const deps = {
      ...fileOf(bytes),
      readPrefix: async (_uri, length) => {
        requestedLength = length;
        return bytes.slice(0, length);
      },
    };

    await contentHash('file://small.jpg', { deps });

    expect(requestedLength).toBe(100);
  });
});
