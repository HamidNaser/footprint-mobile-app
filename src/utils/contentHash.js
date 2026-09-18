/**
 * Is this the same photograph we already have?
 *
 * The mobile half of a contract shared with `foot-print-web/src/utils/contentHash.js`.
 * Both must produce a byte-identical hash for a byte-identical file: a photograph
 * imported from a laptop and later from the phone that took it has to collide, or
 * cross-device duplicate detection quietly does nothing -- a failure that looks exactly
 * like success. The parity test (T005) is what holds the two halves together.
 *
 * The definition, implemented identically on both sides:
 *
 *   SHA-256( first 256 KB of the file  ++  the file's exact byte length, 8 bytes, big-endian )
 *
 * rendered as lowercase hex.
 *
 * Why a prefix and not the whole file: whole-file SHA-256 reads every byte of every
 * photograph on the device, which for a ten-thousand-photograph library is plausibly the
 * largest single cost of the import (research.md #8) -- and a phone is where that cost
 * hurts most. Two distinct photographs sharing both a byte-identical first 256 KB and an
 * identical total length is not something a personal library produces; if it ever
 * happened, the cost is one photograph skipped, not data lost.
 *
 * ⚠️ Provisional until the T006 benchmark settles it. If measuring on a real device shows
 * prefix hashing is not meaningfully faster, this becomes whole-file SHA-256 and the web
 * half changes with it. Nothing may register photographs against this hash until that
 * decision is closed: a hash already written to `photo_metadata` cannot be redefined
 * without re-reading every original file.
 *
 * No new dependency: expo-crypto and expo-file-system are both already here.
 */

import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

/** 256 KB. A starting point from research.md #8, not yet a measurement. */
export const HASH_PREFIX_BYTES = 256 * 1024;

/**
 * Read a bounded prefix of a file as bytes.
 *
 * Bounded at the file system rather than after the fact, so a 40 MB photograph is never
 * held in memory in full -- readAsStringAsync supports position/length precisely so a
 * caller need not read a whole file to see the start of it.
 */
async function readPrefix(uri, length) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
    position: 0,
    length,
  });

  const binary = global.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function getSize(uri) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error(`Cannot hash a file that is not there: ${uri}`);
  return info.size;
}

const DEFAULT_DEPS = {
  getSize,
  readPrefix,
  digest: (bytes) => Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes),
};

/**
 * The bytes that get hashed: the file's prefix, then its exact length.
 *
 * The length is what stops a truncated copy of a photograph from colliding with the
 * original, which under prefix hashing it otherwise would. Eight big-endian bytes,
 * matching the web half's DataView.setBigUint64(0, n, false).
 *
 * @param {Uint8Array} prefixBytes
 * @param {number} totalByteLength
 * @returns {Uint8Array}
 */
export function buildHashMessage(prefixBytes, totalByteLength) {
  const message = new Uint8Array(prefixBytes.length + 8);
  message.set(prefixBytes, 0);

  new DataView(message.buffer).setBigUint64(
    prefixBytes.length,
    BigInt(totalByteLength),
    false,
  );

  return message;
}

function toHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * The content hash of a file on this device.
 *
 * @param {string} uri - a local file uri
 * @param {{deps?: object}} [options]
 * @returns {Promise<string>} 64 lowercase hex characters
 */
export async function contentHash(uri, { deps = DEFAULT_DEPS } = {}) {
  const size = await deps.getSize(uri);
  const prefixBytes = await deps.readPrefix(uri, Math.min(HASH_PREFIX_BYTES, size));

  const digest = await deps.digest(buildHashMessage(prefixBytes, size));
  return toHex(digest);
}

export default contentHash;
