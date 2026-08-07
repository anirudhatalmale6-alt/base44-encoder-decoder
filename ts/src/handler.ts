/**
 * Request-handling logic for the Base44 codec endpoint, kept separate from the
 * Deno/SDK wrapper so it is unit-testable under plain Node + vitest.
 *
 * The platform function (examples/base44Codec/entry.ts) inlines this exact
 * logic inside a Deno.serve(...) handler. This module is the source of truth
 * for the request/response shape; the codec itself lives in ./base44.ts.
 */
import { encode, decode, encodeText, Base44FormatError } from "./base44.ts";

export interface HandlerResult {
  status: number;
  payload: Record<string, unknown>;
}

/**
 * Map a decoded JSON request body to a { status, payload } response.
 *
 *   { mode: "encode", text: "Hello" }                  -> { success, result }
 *   { mode: "encode", base64: "SGVsbG8=" }             -> { success, result }   (encode raw bytes)
 *   { mode: "decode", base44: "9P9$EE...", as?: "text"|"base64" } -> { success, result }
 *
 * Malformed Base44 -> 422. Bad request shape -> 400. The codec never throws
 * anything other than Base44FormatError, so unexpected errors bubble to the
 * caller (the Deno wrapper turns them into a 500).
 */
export function processBase44(body: unknown): HandlerResult {
  if (typeof body !== "object" || body === null) {
    return { status: 400, payload: { error: "Request body must be a JSON object." } };
  }
  const b = body as Record<string, unknown>;

  try {
    if (b.mode === "encode") {
      if (typeof b.text === "string") {
        return { status: 200, payload: { success: true, result: encodeText(b.text) } };
      }
      if (typeof b.base64 === "string") {
        return { status: 200, payload: { success: true, result: encode(fromBase64(b.base64)) } };
      }
      return { status: 400, payload: { error: "Provide 'text' or 'base64' to encode." } };
    }

    if (b.mode === "decode") {
      if (typeof b.base44 !== "string") {
        return { status: 400, payload: { error: "Provide 'base44' to decode." } };
      }
      const bytes = decode(b.base44);
      const result = b.as === "base64" ? toBase64(bytes) : new TextDecoder().decode(bytes);
      return { status: 200, payload: { success: true, result } };
    }

    return { status: 400, payload: { error: "mode must be 'encode' or 'decode'." } };
  } catch (err) {
    if (err instanceof Base44FormatError) {
      return { status: 422, payload: { error: err.message } };
    }
    throw err;
  }
}

// Base64 <-> bytes (atob/btoa are globals in Deno and the browser).
export function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function toBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
