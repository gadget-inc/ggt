import { describe, expect, it } from "vitest";
import { sprint, sprintln } from "../../../src/services/output/sprint.js";

describe("sprint", () => {
  it("accepts a string", () => {
    const result = sprint("hello");
    expect(result).toBe("hello");
  });

  it("accepts a template", () => {
    const world = "world";
    const result = sprint`hello ${world}`;
    expect(result).toBe("hello world");
  });

  it("adds margin top", () => {
    const result = sprint({ marginTop: true })("hello");
    expect(result).toBe("\nhello");
  });

  it("adds margin bottom", () => {
    const result = sprint({ marginBottom: true })("hello");
    expect(result).toBe("hello\n");
  });
});

describe("sprintln", () => {
  it("accepts a string", () => {
    const result = sprintln("hello");
    expect(result).toBe("hello\n");
  });

  it("accepts a template", () => {
    const world = "world";
    const result = sprintln`hello ${world}`;
    expect(result).toBe("hello world\n");
  });

  it("adds margin top", () => {
    const result = sprintln({ marginTop: true })("hello");
    expect(result).toBe("\nhello\n");
  });

  it("adds margin bottom", () => {
    const result = sprintln({ marginBottom: true })("hello");
    expect(result).toBe("hello\n\n");
  });
});
