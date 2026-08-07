/**
 * Base44 encoder / decoder — TypeScript.
 *
 * Byte-for-byte identical to the C# reference codec in this repo, so anything
 * encoded here decodes with the standalone `base44` CLI and vice-versa.
 *
 * Runtime-agnostic: depends only on `Uint8Array`, `TextEncoder`/`TextDecoder`.
 * Runs unchanged in the Base44 platform's Deno/Node serverless functions and
 * in the React frontend (browser).
 *
 * Scheme (RFC 9285 "Base45" generalised to a 44-symbol alphabet):
 *   - 2 input bytes  -> 3 output chars. A pair (a, b) is the 16-bit number
 *     n = a*256 + b, written as three base-44 digits, least-significant first.
 *     44^3 = 85184 > 65535, so three digits always suffice.
 *   - 1 trailing byte -> 2 output chars (44^2 = 1936 > 255).
 *
 * A valid Base44 string therefore has length % 3 === 0 or === 2.
 *
 * The alphabet is the single source of truth. To match a different Base44
 * variant, change ONLY this string (44 distinct ASCII characters).
 */

export const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$%*+-./:";
const BASE = 44;

// Reverse lookup: char code -> value (0..43), or -1 if not in the alphabet.
const DECODE: Int8Array = buildDecodeTable();

function buildDecodeTable(): Int8Array {
  if (ALPHABET.length !== BASE) {
    throw new Error(
      `Base44 alphabet must contain exactly ${BASE} characters, found ${ALPHABET.length}.`,
    );
  }
  const table = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) {
    const code = ALPHABET.charCodeAt(i);
    if (code >= 128) throw new Error("Base44 alphabet must be ASCII.");
    if (table[code] !== -1) {
      throw new Error(`Duplicate character '${ALPHABET[i]}' in Base44 alphabet.`);
    }
    table[code] = i;
  }
  return table;
}

/** Error thrown when Base44 input is malformed. */
export class Base44FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Base44FormatError";
  }
}

/** Encode raw bytes to a Base44 string. */
export function encode(data: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 1 < data.length; i += 2) {
    let n = (data[i] << 8) | data[i + 1];
    out += ALPHABET[n % BASE];
    n = (n / BASE) | 0;
    out += ALPHABET[n % BASE];
    n = (n / BASE) | 0;
    out += ALPHABET[n];
  }
  if (i < data.length) {
    let n = data[i];
    out += ALPHABET[n % BASE];
    n = (n / BASE) | 0;
    out += ALPHABET[n];
  }
  return out;
}

/**
 * Decode a Base44 string back to raw bytes.
 * ASCII whitespace (space, tab, CR, LF) is ignored so wrapped/piped text
 * decodes cleanly. Any other out-of-alphabet character throws.
 */
export function decode(text: string): Uint8Array {
  const out: number[] = [];
  const group = [0, 0, 0];
  let count = 0;

  for (let idx = 0; idx < text.length; idx++) {
    const c = text.charCodeAt(idx);
    if (c === 32 || c === 9 || c === 10 || c === 13) continue; // space/tab/LF/CR
    const v = c < 128 ? DECODE[c] : -1;
    if (v < 0) {
      throw new Base44FormatError(
        `Invalid Base44 character '${printable(c)}' (0x${c.toString(16).toUpperCase().padStart(2, "0")}).`,
      );
    }
    group[count++] = v;
    if (count === 3) {
      const n = group[0] + group[1] * BASE + group[2] * BASE * BASE;
      if (n > 0xffff) {
        throw new Base44FormatError(
          `Malformed Base44: 3-character group decodes to ${n}, which exceeds 65535.`,
        );
      }
      out.push((n >> 8) & 0xff, n & 0xff);
      count = 0;
    }
  }

  if (count === 1) {
    throw new Base44FormatError(
      "Malformed Base44: input ends with a single leftover character (a group must be 2 or 3 characters).",
    );
  }
  if (count === 2) {
    const n = group[0] + group[1] * BASE;
    if (n > 0xff) {
      throw new Base44FormatError(
        `Malformed Base44: final 2-character group decodes to ${n}, which exceeds 255.`,
      );
    }
    out.push(n);
  }

  return Uint8Array.from(out);
}

/** Convenience: encode a string (UTF-8) to Base44. */
export function encodeText(text: string): string {
  return encode(new TextEncoder().encode(text));
}

/** Convenience: decode Base44 to a UTF-8 string. */
export function decodeText(base44: string): string {
  return new TextDecoder().decode(decode(base44));
}

function printable(code: number): string {
  return code >= 32 && code < 127
    ? String.fromCharCode(code)
    : `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
}
