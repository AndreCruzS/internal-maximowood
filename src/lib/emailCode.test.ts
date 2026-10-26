import { describe, expect, it } from "vitest";
import { cleanCode, codeThrottle, isCodeShape, usesEmailCode } from "./emailCode";

describe("usesEmailCode", () => {
  it("is only for gflumber.com addresses", () => {
    expect(usesEmailCode("  Jane.Doe@GFLumber.com ")).toBe(true);
    expect(usesEmailCode("anna.miguel@gmxgroup.com")).toBe(false);
    expect(usesEmailCode("someone@gmail.com")).toBe(false);
    expect(usesEmailCode("x@sub.gflumber.com")).toBe(false);
    expect(usesEmailCode("gflumber.com")).toBe(false);
    expect(usesEmailCode("a b@gflumber.com")).toBe(false);
  });
});

describe("cleanCode / isCodeShape", () => {
  it("keeps the digits of a pasted code", () => {
    expect(cleanCode(" 123-456 ")).toBe("123456");
    expect(isCodeShape("123456")).toBe(true);
    expect(isCodeShape("12345")).toBe(false);
    expect(isCodeShape("12345a")).toBe(false);
  });
});

describe("codeThrottle", () => {
  const now = new Date("2026-10-26T15:00:00Z");
  const ago = (s: number) => new Date(now.getTime() - s * 1000).toISOString();
  it("allows the first code", () => {
    expect(codeThrottle([], now)).toEqual({ ok: true });
  });
  it("waits a minute between codes", () => {
    expect(codeThrottle([ago(20)], now)).toEqual({ ok: false, retryAfter: 40 });
    expect(codeThrottle([ago(61)], now)).toEqual({ ok: true });
  });
  it("allows five an hour", () => {
    expect(codeThrottle([ago(3000), ago(2000), ago(1000), ago(500), ago(100)], now)).toEqual({ ok: false, retryAfter: 600 });
    expect(codeThrottle([ago(4000), ago(2000), ago(1000), ago(500), ago(100)], now)).toEqual({ ok: true });
  });
});
