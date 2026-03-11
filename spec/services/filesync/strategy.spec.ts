import { describe, expect, it } from "vitest";

import { FlagError } from "../../../src/services/command/flag.js";
import { FileSyncStrategy, MergeConflictPreference, MergeConflictPreferenceArg } from "../../../src/services/filesync/strategy.js";

describe("FileSyncStrategy", () => {
  it("has expected values", () => {
    expect(FileSyncStrategy.CANCEL).toBe("cancel");
    expect(FileSyncStrategy.MERGE).toBe("merge");
    expect(FileSyncStrategy.PUSH).toBe("push");
    expect(FileSyncStrategy.PULL).toBe("pull");
  });

  it("is frozen", () => {
    expect(Object.isFrozen(FileSyncStrategy)).toBe(true);
  });
});

describe("MergeConflictPreference", () => {
  it("has expected values", () => {
    expect(MergeConflictPreference.CANCEL).toContain("Cancel");
    expect(MergeConflictPreference.LOCAL).toContain("local");
    expect(MergeConflictPreference.ENVIRONMENT).toContain("environment");
  });

  it("is frozen", () => {
    expect(Object.isFrozen(MergeConflictPreference)).toBe(true);
  });
});

describe("MergeConflictPreferenceArg", () => {
  it("returns LOCAL for 'local' value", () => {
    const result = MergeConflictPreferenceArg("local", "--prefer");

    expect(result).toBe(MergeConflictPreference.LOCAL);
  });

  it("returns ENVIRONMENT for 'environment' value", () => {
    const result = MergeConflictPreferenceArg("environment", "--prefer");

    expect(result).toBe(MergeConflictPreference.ENVIRONMENT);
  });

  it("throws FlagError for invalid values", () => {
    expect(() => MergeConflictPreferenceArg("invalid", "--prefer")).toThrow(FlagError);
  });

  it("throws with helpful message including valid options", () => {
    try {
      MergeConflictPreferenceArg("wrong", "--prefer");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FlagError);
      expect((error as FlagError).message).toContain("--prefer");
      expect((error as FlagError).message).toContain("local");
      expect((error as FlagError).message).toContain("environment");
    }
  });

  it("includes examples in error message", () => {
    try {
      MergeConflictPreferenceArg("bad", "--conflict-preference");
      expect.fail("Should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(FlagError);
      expect((error as FlagError).message).toContain("--conflict-preference=local");
      expect((error as FlagError).message).toContain("--conflict-preference=environment");
    }
  });

  it("is case-sensitive", () => {
    expect(() => MergeConflictPreferenceArg("LOCAL", "--prefer")).toThrow(FlagError);
    expect(() => MergeConflictPreferenceArg("Local", "--prefer")).toThrow(FlagError);
    expect(() => MergeConflictPreferenceArg("ENVIRONMENT", "--prefer")).toThrow(FlagError);
  });
});
