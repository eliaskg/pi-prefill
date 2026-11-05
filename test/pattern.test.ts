import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { globToRegExp, matchesAny } from "../extensions/pattern.ts";

describe("globToRegExp", () => {
  it("matches an exact id", () => {
    const re = globToRegExp("llama.cpp");
    assert.ok(re.test("llama.cpp"));
    assert.ok(!re.test("llama-cpp"));
    assert.ok(!re.test("llama.cppx"));
    assert.ok(!re.test("xllama.cpp"));
  });

  it("matches a prefix pattern", () => {
    const re = globToRegExp("local-*");
    assert.ok(re.test("local-abc123"));
    assert.ok(re.test("local-"));
    assert.ok(!re.test("my-local-abc"));
  });

  it("matches a suffix pattern", () => {
    const re = globToRegExp("*-local");
    assert.ok(re.test("abc-local"));
    assert.ok(re.test("-local"));
    assert.ok(!re.test("abc-localx"));
  });

  it("matches an infix pattern", () => {
    const re = globToRegExp("lo*al");
    assert.ok(re.test("local"));
    assert.ok(re.test("loXal"));
    assert.ok(!re.test("lal"));
  });

  it("matches every provider with a bare star", () => {
    const re = globToRegExp("*");
    assert.ok(re.test("anything"));
    assert.ok(re.test(""));
  });

  it("escapes regex metacharacters", () => {
    const re = globToRegExp("llama.cpp");
    // The dot is literal, not "any character".
    assert.ok(!re.test("llamaXcpp"));
    const paren = globToRegExp("a(b)c");
    assert.ok(paren.test("a(b)c"));
    assert.ok(!paren.test("abc"));
  });

  it("is case-insensitive", () => {
    const re = globToRegExp("Local-*");
    assert.ok(re.test("LOCAL-abc"));
    assert.ok(re.test("local-ABC"));
  });

  it("lets multiple stars match long runs", () => {
    const re = globToRegExp("*-edge-*");
    assert.ok(re.test("us-edge-01"));
    assert.ok(!re.test("us-edge"));
  });
});

describe("matchesAny", () => {
  it("returns false for an empty list", () => {
    assert.equal(matchesAny([], "llama.cpp"), false);
  });

  it("returns true when one pattern hits", () => {
    const patterns = ["llama.cpp", "local-*"].map(globToRegExp);
    assert.equal(matchesAny(patterns, "local-9f2e"), true);
    assert.equal(matchesAny(patterns, "llama.cpp"), true);
    assert.equal(matchesAny(patterns, "openai"), false);
  });

  it("accepts a readonly pattern list", () => {
    const patterns: readonly RegExp[] = [globToRegExp("*")];
    assert.equal(matchesAny(patterns, "x"), true);
  });
});
