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
  src/base44.ts            The codec (encode/decode + text helpers). Zero dependencies.
  src/base44.test.ts       Vitest suite (round-trip, exhaustive, malformed, whitespace).
  scripts/verify.ts        Standalone check runnable with plain Node (no framework).
  examples/backend-function.ts   Web-standard Request->Response handler for a Base44 function.
  examples/react-usage.tsx       Example encode/decode React component (Tailwind).
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

## Using it in a Base44 function

`examples/backend-function.ts` is a runtime-agnostic `Request -> Response`
handler. Wrap it in whatever signature your Base44 function expects; the core
call is just `encode(...)` / `decode(...)`. Binary payloads travel as standard
Base64 in JSON so the API stays clean:

```jsonc
// POST  { "mode": "encode", "text": "Hello" }        -> { "result": "9P9$EE..." }
// POST  { "mode": "decode", "base44": "9P9$EE...", "as": "text" } -> { "result": "Hello" }
```

## Using it in React

See `examples/react-usage.tsx` — a small encode/decode panel. Because the codec
is pure browser-safe TypeScript, you can offer Base44 to your clients directly in
the HR Pro UI with no server call.

## Matching a different Base44 variant

The alphabet is the single source of truth — the `ALPHABET` constant in
`src/base44.ts` (and the equivalent constant in the C# `Base44Codec.cs`). Keep
the two in sync and the CLI + platform stay interoperable.
