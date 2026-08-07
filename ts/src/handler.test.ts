import { describe, it, expect } from "vitest";
import { processBase44, fromBase64, toBase64 } from "./handler.ts";

describe("processBase44 request handling", () => {
  it("encodes text", () => {
    expect(processBase44({ mode: "encode", text: "Hello, World!" })).toEqual({
      status: 200,
      payload: { success: true, result: "9P9$EE$UE7C4IWESEEX0" },
    });
  });

  it("encodes raw bytes supplied as base64", () => {
    const b64 = toBase64(new Uint8Array([0, 255, 128, 7]));
    const r = processBase44({ mode: "encode", base64: b64 });
    expect(r.status).toBe(200);
    // decode it back through the same endpoint as base64 and compare
    const back = processBase44({ mode: "decode", base44: r.payload.result, as: "base64" });
    expect(back.payload.result).toBe(b64);
  });

  it("decodes to text by default", () => {
    expect(processBase44({ mode: "decode", base44: "9P9$EE$UE7C4IWESEEX0" })).toEqual({
      status: 200,
      payload: { success: true, result: "Hello, World!" },
    });
  });

  it("returns 422 on malformed Base44", () => {
    const r = processBase44({ mode: "decode", base44: "AB&" });
    expect(r.status).toBe(422);
    expect(String(r.payload.error)).toContain("Invalid Base44 character");
  });

  it("returns 400 on missing fields", () => {
    expect(processBase44({ mode: "encode" }).status).toBe(400);
    expect(processBase44({ mode: "decode" }).status).toBe(400);
    expect(processBase44({ mode: "nonsense" }).status).toBe(400);
    expect(processBase44("not an object").status).toBe(400);
  });

  it("base64 helpers round-trip", () => {
    const bytes = new Uint8Array([1, 2, 3, 250, 0, 99]);
    expect(Array.from(fromBase64(toBase64(bytes)))).toEqual(Array.from(bytes));
  });
});
