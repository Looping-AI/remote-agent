import { describe, it, expect } from "vitest";
import {
  sortKeys,
  canonicalCardPayload,
  base64UrlOfString
} from "../src/canonical";

describe("sortKeys", () => {
  it("sorts flat object keys alphabetically", () => {
    expect(sortKeys({ z: 1, a: 2, m: 3 })).toEqual({ a: 2, m: 3, z: 1 });
  });

  it("sorts nested object keys recursively", () => {
    const input = { b: { d: 4, c: 3 }, a: { f: 6, e: 5 } };
    expect(sortKeys(input)).toEqual({ a: { e: 5, f: 6 }, b: { c: 3, d: 4 } });
  });

  it("preserves array order while sorting keys inside array elements", () => {
    const input = [
      { b: 2, a: 1 },
      { d: 4, c: 3 }
    ];
    expect(sortKeys(input)).toEqual([
      { a: 1, b: 2 },
      { c: 3, d: 4 }
    ]);
  });

  it("passes primitives through unchanged", () => {
    expect(sortKeys(42)).toBe(42);
    expect(sortKeys("hello")).toBe("hello");
    expect(sortKeys(null)).toBe(null);
    expect(sortKeys(true)).toBe(true);
  });
});

describe("canonicalCardPayload", () => {
  it("excludes the signatures field", () => {
    const card = {
      name: "Echo",
      signatures: [{ protected: "abc", signature: "xyz" }]
    };
    const result = JSON.parse(canonicalCardPayload(card));
    expect(result).not.toHaveProperty("signatures");
  });

  it("sorts remaining keys alphabetically", () => {
    const card = { z: "last", a: "first", m: "middle" };
    const result = canonicalCardPayload(card);
    expect(result).toBe('{"a":"first","m":"middle","z":"last"}');
  });

  it("produces valid JSON with no whitespace", () => {
    const card = { name: "Agent", version: "1.0" };
    const result = canonicalCardPayload(card);
    expect(() => JSON.parse(result)).not.toThrow();
    expect(result).not.toMatch(/\s/);
  });
});

describe("base64UrlOfString", () => {
  it("produces no padding characters", () => {
    expect(base64UrlOfString("hello")).not.toContain("=");
    expect(base64UrlOfString("hello world")).not.toContain("=");
  });

  it("uses URL-safe characters instead of + and /", () => {
    // Run many strings to hit + and / in the base64 alphabet
    for (let i = 0; i < 256; i++) {
      const result = base64UrlOfString(String.fromCharCode(i) + "pad");
      expect(result).not.toContain("+");
      expect(result).not.toContain("/");
    }
  });

  it("round-trips through atob after re-adding padding", () => {
    const original = "canonical JSON payload";
    const encoded = base64UrlOfString(original);
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const rem = padded.length % 4;
    const repadded = rem === 0 ? padded : padded + "=".repeat(4 - rem);
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(repadded), (c) => c.charCodeAt(0))
    );
    expect(decoded).toBe(original);
  });
});
