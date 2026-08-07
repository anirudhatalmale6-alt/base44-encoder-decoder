/**
 * Example Base44 backend function.
 *
 * This is a runtime-agnostic Web-standard handler (Request -> Response) that
 * runs in Deno, Node 18+, and edge runtimes — including the Base44 platform's
 * serverless functions. Adapt the thin wrapper to your platform's exact
 * function signature if it differs; the important part is that it calls the
 * shared `encode` / `decode` from `../src/base44.ts`, so output is identical
 * to the standalone CLI and the frontend.
 *
 * Request body (JSON):
 *   { "mode": "encode", "text": "Hello" }              -> { "result": "..." }
 *   { "mode": "encode", "base64": "SGVsbG8=" }         -> { "result": "..." }  (encode raw bytes)
 *   { "mode": "decode", "base44": "9P9$EE...", "as": "text" | "base64" }
 *
 * Encoding always operates on bytes; `text` is treated as UTF-8. For binary
 * payloads pass/receive standard Base64 so JSON stays clean.
 */
import { encode, decode, encodeText, Base44FormatError } from "../src/base44.ts";

interface EncodeRequest {
  mode: "encode";
  text?: string;
  base64?: string;
}
interface DecodeRequest {
  mode: "decode";
  base44: string;
  as?: "text" | "base64";
}
type Body = EncodeRequest | DecodeRequest;

export async function handler(request: Request): Promise<Response> {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ error: "Request body must be valid JSON." }, 400);
  }

  try {
    if (body.mode === "encode") {
      if (typeof body.text === "string") {
        return json({ result: encodeText(body.text) });
      }
      if (typeof body.base64 === "string") {
        return json({ result: encode(fromBase64(body.base64)) });
      }
      return json({ error: "Provide 'text' or 'base64' to encode." }, 400);
    }

    if (body.mode === "decode") {
      if (typeof body.base44 !== "string") {
        return json({ error: "Provide 'base44' to decode." }, 400);
      }
      const bytes = decode(body.base44);
      if (body.as === "base64") return json({ result: toBase64(bytes) });
      return json({ result: new TextDecoder().decode(bytes) });
    }

    return json({ error: "mode must be 'encode' or 'decode'." }, 400);
  } catch (err) {
    if (err instanceof Base44FormatError) {
      return json({ error: err.message }, 422); // malformed Base44 -> 422
    }
    return json({ error: "Unexpected error." }, 500);
  }
}

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" },
  });
}

// Base64 <-> bytes helpers (work in browser and Deno/Node via globalThis).
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
