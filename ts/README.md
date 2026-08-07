# Base44 — TypeScript core (for the Base44 platform)

The same Base44 codec as the standalone C# CLI, implemented in dependency-free
TypeScript so it drops into an **Axcentrix / HR Pro** app on the Base44 platform:

- **Backend** — import it into a Base44 serverless function (Deno/Node runtime).
- **Frontend** — import it into the React + Vite + Tailwind app; it runs in the
  browser, no backend round-trip required.

It is **byte-for-byte identical** to the C# build. The test suite pins the exact
same vectors, and cross-interop is verified: bytes encoded by the CLI decode here
and vice-versa, and both produce the same output for the same input.

## Files

```
ts/
  src/base44.ts                    The codec (encode/decode + text helpers). Zero dependencies.
  src/base44.test.ts               Vitest suite (round-trip, exhaustive, malformed, whitespace).
  src/handler.ts                   Request->response mapping logic (testable).
  src/handler.test.ts              Vitest suite for the request handling.
  scripts/verify.ts                Framework-free check runnable with plain Node.
  examples/base44Codec/entry.ts    Drop-in Base44 platform function (Deno.serve + @base44/sdk).
  examples/react-usage.tsx         Example encode/decode React component (Tailwind).
```

## API

```ts
import { encode, decode, encodeText, decodeText, ALPHABET, Base44FormatError } from "./src/base44.ts";

encode(bytes: Uint8Array): string      // raw bytes  -> Base44 text
decode(text: string): Uint8Array       // Base44 text -> raw bytes  (throws Base44FormatError if malformed)
encodeText(s: string): string          // UTF-8 string -> Base44 text
decodeText(b44: string): string        // Base44 text  -> UTF-8 string
```

## Run the tests

```bash
cd ts
npm install
npm test          # vitest
npm run verify    # framework-free cross-check (Node 22+, uses --experimental-strip-types)
```

## Using it in a Base44 platform function

`examples/base44Codec/entry.ts` is written to the platform's exact convention:
one self-contained file at `base44/functions/<functionName>/entry.ts`, a
`Deno.serve(async (req) => Response)` handler, `createClientFromRequest(req)` for
auth, `Response.json(...)`, and an OPTIONS preflight. Drop it in as
`base44/functions/base44Codec/entry.ts` — no local imports, nothing else needed.

Call it from the React frontend:

```ts
const { data } = await base44.functions.invoke("base44Codec", {
  mode: "encode",
  text: "Hello, World!",
});
// data.result === "9P9$EE$UE7C4IWESEEX0"

const back = await base44.functions.invoke("base44Codec", {
  mode: "decode",
  base44: data.result,
});
// back.data.result === "Hello, World!"
```

Request/response contract (also encoded in `src/handler.ts`, which is unit-tested):

```jsonc
// { "mode": "encode", "text": "Hello" }                            -> { success, result }
// { "mode": "encode", "base64": "SGVsbG8=" }                       -> { success, result }  (raw bytes)
// { "mode": "decode", "base44": "9P9$EE...", "as": "text"|"base64" } -> { success, result }
// malformed Base44 -> HTTP 422; bad request shape -> HTTP 400
```

By default the function requires a logged-in user (`base44.auth.me()`); remove
those two lines to make it public, or use `asServiceRole` if you call it from
other server-side functions.

## Using it in React

See `examples/react-usage.tsx` — a small encode/decode panel. Because the codec
is pure browser-safe TypeScript, you can offer Base44 to your clients directly in
the HR Pro UI with no server call.

## Matching a different Base44 variant

The alphabet is the single source of truth — the `ALPHABET` constant in
`src/base44.ts` (and the equivalent constant in the C# `Base44Codec.cs`). Keep
the two in sync and the CLI + platform stay interoperable.
