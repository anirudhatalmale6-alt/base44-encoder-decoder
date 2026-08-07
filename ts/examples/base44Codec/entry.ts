// base44/functions/base44Codec/entry.ts
//
// Drop-in Base44 encode/decode endpoint for the Base44 platform (Deno runtime).
// Self-contained on purpose — one function = one file, no local imports — so it
// deploys as-is. Invoke it from the frontend with:
//
//   const { data } = await base44.functions.invoke('base44Codec', {
//     mode: 'encode', text: 'Hello, World!'
//   });   // -> data.result === '9P9$EE$UE7C4IWESEEX0'
//
// Request body (JSON):
//   { "mode": "encode", "text": "Hello" }                          -> { success, result }
//   { "mode": "encode", "base64": "SGVsbG8=" }                     -> { success, result }  (encode raw bytes)
//   { "mode": "decode", "base44": "9P9$EE...", "as": "text"|"base64" } -> { success, result }
//
// The codec below is byte-for-byte identical to ts/src/base44.ts and to the C#
// CLI. It is INLINED here for self-containment; the ALPHABET constant is the
// single thing to keep in sync if you ever change the variant.

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// ===========================================================================
//  Base44 codec  (generated from ts/src/base44.ts — keep ALPHABET in sync)
// ===========================================================================
const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$%*+-./:";
const BASE = 44;

const DECODE = (() => {
  const t = new Int8Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) t[ALPHABET.charCodeAt(i)] = i;
  return t;
})();

class Base44FormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Base44FormatError";
  }
}

function encode(data: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 1 < data.length; i += 2) {
    let n = (data[i] << 8) | data[i + 1];
    out += ALPHABET[n % BASE]; n = (n / BASE) | 0;
    out += ALPHABET[n % BASE]; n = (n / BASE) | 0;
    out += ALPHABET[n];
  }
  if (i < data.length) {
    let n = data[i];
    out += ALPHABET[n % BASE]; n = (n / BASE) | 0;
    out += ALPHABET[n];
  }
  return out;
}

function decode(text: string): Uint8Array {
  const out: number[] = [];
  const group = [0, 0, 0];
  let count = 0;
  for (let idx = 0; idx < text.length; idx++) {
    const c = text.charCodeAt(idx);
    if (c === 32 || c === 9 || c === 10 || c === 13) continue;
    const v = c < 128 ? DECODE[c] : -1;
    if (v < 0) {
      throw new Base44FormatError(
        `Invalid Base44 character '${c >= 32 && c < 127 ? String.fromCharCode(c) : "\\u" + c.toString(16).toUpperCase().padStart(4, "0")}' (0x${c.toString(16).toUpperCase().padStart(2, "0")}).`,
      );
    }
    group[count++] = v;
    if (count === 3) {
      const n = group[0] + group[1] * BASE + group[2] * BASE * BASE;
      if (n > 0xffff) throw new Base44FormatError(`Malformed Base44: 3-character group decodes to ${n}, which exceeds 65535.`);
      out.push((n >> 8) & 0xff, n & 0xff);
      count = 0;
    }
  }
  if (count === 1) throw new Base44FormatError("Malformed Base44: input ends with a single leftover character (a group must be 2 or 3 characters).");
  if (count === 2) {
    const n = group[0] + group[1] * BASE;
    if (n > 0xff) throw new Base44FormatError(`Malformed Base44: final 2-character group decodes to ${n}, which exceeds 255.`);
    out.push(n);
  }
  return Uint8Array.from(out);
}

const encodeText = (s: string) => encode(new TextEncoder().encode(s));

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// ===========================================================================
//  HTTP handler
// ===========================================================================
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  // CORS preflight (matches your verifyLicense pattern for cross-origin callers).
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  try {
    // Resolve the caller. Require a logged-in user by default; delete these two
    // lines to make the endpoint public, or swap for asServiceRole if you call
    // it from other server-side functions.
    const base44 = createClientFromRequest(req);
    await base44.auth.me(); // throws if not authenticated

    const body = await req.json().catch(() => null);
    if (typeof body !== "object" || body === null) {
      return Response.json({ error: "Request body must be a JSON object." }, { status: 400, headers: CORS });
    }

    if (body.mode === "encode") {
      if (typeof body.text === "string") {
        return Response.json({ success: true, result: encodeText(body.text) }, { headers: CORS });
      }
      if (typeof body.base64 === "string") {
        return Response.json({ success: true, result: encode(fromBase64(body.base64)) }, { headers: CORS });
      }
      return Response.json({ error: "Provide 'text' or 'base64' to encode." }, { status: 400, headers: CORS });
    }

    if (body.mode === "decode") {
      if (typeof body.base44 !== "string") {
        return Response.json({ error: "Provide 'base44' to decode." }, { status: 400, headers: CORS });
      }
      const bytes = decode(body.base44);
      const result = body.as === "base64" ? toBase64(bytes) : new TextDecoder().decode(bytes);
      return Response.json({ success: true, result }, { headers: CORS });
    }

    return Response.json({ error: "mode must be 'encode' or 'decode'." }, { status: 400, headers: CORS });
  } catch (error) {
    // Malformed Base44 is a client error (422); everything else is a 500.
    if (error instanceof Base44FormatError) {
      return Response.json({ error: error.message }, { status: 422, headers: CORS });
    }
    return Response.json({ error: (error as Error).message }, { status: 500, headers: CORS });
  }
});
