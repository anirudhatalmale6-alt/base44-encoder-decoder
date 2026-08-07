import { describe, it, expect } from "vitest";
import { encode, decode, encodeText, decodeText, ALPHABET, Base44FormatError } from "./base44.ts";

describe("Base44 alphabet", () => {
  it("has 44 distinct ASCII characters", () => {
    expect(ALPHABET.length).toBe(44);
    expect(new Set(ALPHABET).size).toBe(44);
    for (const c of ALPHABET) expect(c.charCodeAt(0)).toBeLessThan(128);
  });
});

describe("Base44 round-trip", () => {
  // These vectors are identical to the C# reference build — cross-language interop.
  it.each([
    ["A", "L1"],
    ["AB", "UR8"],
    ["Hi", "DP9"],
    ["base44", "H0DHBFW+6"],
    ["Hello, World!", "9P9$EE$UE7C4IWESEEX0"],
  ])("encodes %j to %j and back", (input, expected) => {
    expect(encodeText(input)).toBe(expected);
    expect(decodeText(expected)).toBe(input);
  });

  it("handles empty input", () => {
    expect(encode(new Uint8Array())).toBe("");
    expect(decode("").length).toBe(0);
  });

  it("round-trips every single byte (2 chars each)", () => {
    for (let b = 0; b < 256; b++) {
      const enc = encode(Uint8Array.of(b));
      expect(enc.length).toBe(2);
      expect(Array.from(decode(enc))).toEqual([b]);
    }
  });

  it("round-trips every byte pair (3 chars each)", () => {
    for (let a = 0; a < 256; a++) {
      for (let b = 0; b < 256; b++) {
        const enc = encode(Uint8Array.of(a, b));
        expect(enc.length).toBe(3);
        expect(Array.from(decode(enc))).toEqual([a, b]);
      }
    }
  });

  it("round-trips random binary of many lengths", () => {
    for (let len = 0; len <= 3000; len += len < 40 ? 1 : 113) {
      const data = new Uint8Array(len);
      for (let i = 0; i < len; i++) data[i] = (i * 2654435761 + len * 40503) & 0xff;
      expect(Array.from(decode(encode(data)))).toEqual(Array.from(data));
    }
  });

  it("emits only alphabet characters", () => {
    const data = new Uint8Array(300);
    for (let i = 0; i < data.length; i++) data[i] = (i * 97 + 13) & 0xff;
    for (const ch of encode(data)) expect(ALPHABET).toContain(ch);
  });
});

describe("Base44 malformed input", () => {
  it("rejects an out-of-alphabet character", () => {
    expect(() => decode("AB&")).toThrow(Base44FormatError);
  });
  it("rejects a lone trailing character", () => {
    expect(() => decode("L1L1L1L")).toThrow(/single leftover character/);
  });
  it("rejects a triplet above 65535", () => {
    expect(() => decode(ALPHABET[43] + ALPHABET[43] + ALPHABET[43])).toThrow(/exceeds 65535/);
  });
  it("rejects a final pair above 255", () => {
    expect(() => decode(ALPHABET[43] + ALPHABET[43])).toThrow(/exceeds 255/);
  });
  it("ignores whitespace on decode", () => {
    expect(decodeText("9P9$EE\n$UE7C4 IWESEEX0")).toBe("Hello, World!");
  });
});
