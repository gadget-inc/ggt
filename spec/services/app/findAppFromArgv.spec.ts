import { describe, it, expect } from "vitest";

import { findAppFromArgv } from "../../../src/services/app/app.js";
import { testApp, testApp2 } from "../../__support__/app.js";

describe("findAppFromArgv", () => {
  it("finds app by --app slug form", () => {
    const result = findAppFromArgv([testApp], ["--app", testApp.slug]);
    expect(result).toBe(testApp);
  });

  it("finds app by --app=slug form", () => {
    const result = findAppFromArgv([testApp], ["--app=" + testApp.slug]);
    expect(result).toBe(testApp);
  });

  it("does not use a following flag as the slug", () => {
    const result = findAppFromArgv([testApp, testApp2], ["--app", "--env"]);
    expect(result).toBeUndefined();
  });

  it("returns undefined when no app matches", () => {
    const result = findAppFromArgv([testApp], ["--app", "nonexistent"]);
    expect(result).toBeUndefined();
  });

  it("skips the value token after an unmatched app flag so it is not re-examined as a flag", () => {
    // "--app" takes "-a" as its value (no match), then "-a" should NOT be
    // re-examined as a flag that reads "test" as its value.
    const result = findAppFromArgv([testApp], ["--app", "-a", testApp.slug]);
    expect(result).toBeUndefined();
  });
});
