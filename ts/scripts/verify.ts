// Local cross-verification runner (plain Node assert, no test framework).
// Run: node --experimental-strip-types ts/scripts/verify.ts
import assert from "node:assert/strict";
import { encode, decode, encodeText, decodeText, Base44FormatError, ALPHABET } from "../src/base44.ts";

let checks = 0;
const ok = (cond: boolean, msg: string) => { assert.ok(cond, msg); checks++; };

// 1) Known vectors must match the C# reference build exactly.
const vectors: [string, string][] = [
  ["A", "L1"],
  ["AB", "UR8"],
  ["Hi", "DP9"],
  ["base44", "H0DHBFW+6"],
  ["Hello, World!", "9P9$EE$UE7C4IWESEEX0"],
];
for (const [input, expected] of vectors) {
  assert.equal(encodeText(input), expected, `encode("${input}")`);
  assert.equal(decodeText(expected), input, `decode("${expected}")`);
  checks += 2;
}

// 2) Empty input.
ok(encode(new Uint8Array()) === "", "encode empty");
ok(decode("").length === 0, "decode empty");

// 3) Every single byte 0..255 round-trips and is exactly 2 chars.
for (let b = 0; b < 256; b++) {
  const enc = encode(Uint8Array.of(b));
  assert.equal(enc.length, 2, `single byte ${b} length`);
  const dec = decode(enc);
  assert.equal(dec.length, 1, `single byte ${b} decode length`);
  assert.equal(dec[0], b, `single byte ${b} value`);
}
checks++;

// 4) Every byte pair 0..65535 round-trips and is exactly 3 chars.
for (let a = 0; a < 256; a++) {
  for (let b = 0; b < 256; b++) {
    const enc = encode(Uint8Array.of(a, b));
    if (enc.length !== 3) assert.fail(`pair (${a},${b}) length ${enc.length}`);
    const dec = decode(enc);
    if (dec[0] !== a || dec[1] !== b) assert.fail(`pair (${a},${b}) mismatch`);
  }
}
checks++;

// 5) Random binary of many lengths (deterministic-ish, index-seeded).
for (let len = 0; len <= 4000; len += (len < 40 ? 1 : 131)) {
  const data = new Uint8Array(len);
  for (let i = 0; i < len; i++) data[i] = (i * 2654435761 + len * 40503) & 0xff;
  const dec = decode(encode(data));
  assert.deepEqual(dec, data, `random len ${len}`);
}
checks++;

// 6) Encoded output uses only alphabet characters.
{
  const data = new Uint8Array(500);
  for (let i = 0; i < data.length; i++) data[i] = (i * 97 + 13) & 0xff;
  for (const ch of encode(data)) ok(ALPHABET.includes(ch), "output char in alphabet");
}

// 7) Malformed input is rejected.
assert.throws(() => decode("AB&"), Base44FormatError, "invalid char");
assert.throws(() => decode("L1L1L1L"), Base44FormatError, "lone trailing char"); // 7 chars -> remainder 1
assert.throws(() => decode(ALPHABET[43] + ALPHABET[43] + ALPHABET[43]), Base44FormatError, "triplet > 65535");
assert.throws(() => decode(ALPHABET[43] + ALPHABET[43]), Base44FormatError, "pair > 255");
checks += 4;

// 8) Whitespace ignored on decode.
ok(decodeText("9P9$EE\n$UE7C4 IWESEEX0") === "Hello, World!", "whitespace ignored");

console.log(`TypeScript codec OK — ${checks} check groups passed.`);
