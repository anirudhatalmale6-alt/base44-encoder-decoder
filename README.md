# base44 — Base44 Encoder / Decoder

A lightweight, well-documented Base44 data codec for Windows (and Linux/macOS).
It converts **any** text or binary input to Base44 text and decodes it back to the
**exact** original bytes. No compression, no encryption — pure encoding/decoding.

- 64-bit Windows single-file executable (no .NET install required on the target)
- Sensible CLI: file paths **or** stdin/stdout piping, just like `base64`
- Streams data in fixed 64 KiB chunks — memory stays flat on huge files
- Clear, specific error messages on malformed input
- xUnit test suite proving round-trip integrity and edge-case handling

---

## The Base44 scheme

Base44 uses a 44-symbol alphabet and the RFC 9285 ("Base45") grouping generalised
to 44 symbols:

- Every **2 input bytes** become **3 output characters**. A byte pair `(a, b)` is
  the 16-bit number `n = a*256 + b` (0…65535) written as three base-44 digits,
  **least-significant digit first**. Since `44³ = 85184 > 65535`, three digits
  always suffice.
- A single **trailing byte** `a` (0…255) becomes **2 characters** — two base-44
  digits, least-significant first. Since `44² = 1936 > 255`, two digits suffice.

Consequently a valid Base44 stream always has `length % 3 == 0` or `== 2`.
A remainder of one character is malformed.

**Alphabet** (value 0 → 43):

```
0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ$%*+-./:
```

The alphabet is defined in exactly one place — the `Alphabet` constant in
`src/Base44/Base44Codec.cs`. To match a different Base44 variant, change only
that 44-character string; the encoder, decoder, and tests all adapt automatically.

During decoding, ASCII whitespace (space, tab, CR, LF) is ignored, so wrapped or
piped text decodes cleanly. Any other character outside the alphabet is rejected.

---

## Installation

### Option A — use the prebuilt Windows executable

Grab `base44.exe` from the `dist/win-x64/` folder (or the release) and drop it
anywhere on your `PATH`. It is fully self-contained; Windows 10 (64-bit) or newer,
no .NET runtime needed.

```
C:\> base44 --version
base44 1.0.0
```

### Option B — build from source

Requires the [.NET 8 SDK](https://dotnet.microsoft.com/download).

```bash
# Run the tests
dotnet test

# Build the self-contained 64-bit Windows executable
dotnet publish src/Base44 -c Release -r win-x64 -o dist/win-x64
# -> dist/win-x64/base44.exe
```

The same sources also build a native binary for Linux (`-r linux-x64`) or
macOS (`-r osx-x64` / `-r osx-arm64`).

---

## Usage

```
base44 encode [-i <file>] [-o <file>]
base44 decode [-i <file>] [-o <file>]

  -i, --input <file>    Read from <file> instead of stdin.
  -o, --output <file>   Write to <file> instead of stdout.
  -h, --help            Show help.
  -v, --version         Show version.
```

### Example 1 — encode a string, then decode it back (piping)

```bash
$ echo -n "Hello, Base44!" | base44 encode
9P9$EE$UEUB4:*C$GDD+6

$ echo -n "9P9$EE$UEUB4:*C$GDD+6" | base44 decode
Hello, Base44!
```

### Example 2 — encode a binary file to a `.b44` text file

```bash
$ base44 encode -i photo.jpg -o photo.b44
$ base44 decode -i photo.b44 -o photo_restored.jpg
# photo_restored.jpg is byte-for-byte identical to photo.jpg
```

### Example 3 — pipe through, staying purely in the shell

```bash
# Round-trip any command's output and confirm it is unchanged
$ echo -n "round trip" | base44 encode | base44 decode
round trip
```

### Exit codes

| Code | Meaning                          |
|------|----------------------------------|
| 0    | Success                          |
| 1    | Usage error (bad command/args)   |
| 2    | Malformed Base44 input           |
| 3    | Input file not found             |
| 4    | Other I/O error                  |

---

## Project layout

```
Base44.sln
src/Base44/
  Base44Codec.cs     # the codec: alphabet, one-shot + streaming encode/decode
  Program.cs         # command-line interface
  Base44.csproj
tests/Base44.Tests/
  Base44CodecTests.cs
```

## Tests

```bash
dotnet test
```

The suite covers:

- Round-trip integrity for text, empty input, every single byte (0–255), and
  **every** byte pair (all 65,536), plus random binary of many lengths
- Encoded output uses only alphabet characters and has the expected length
- Malformed input is rejected: invalid character, lone trailing character,
  a triplet decoding above 65535, and a final pair decoding above 255
- Whitespace is ignored on decode
- Streaming encode/decode matches the one-shot result across every chunk boundary

## License

MIT
