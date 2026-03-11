import { describe, expect, it } from "vitest";

import { AppSlug } from "../../../src/services/app/arg.js";
import { FlagError } from "../../../src/services/command/flag.js";
import { expectError } from "../../__support__/error.js";

describe("AppSlug", () => {
  it.each([
    "my-app",
    "my-app.gadget.app",
    "my-app--development.gadget.app",
    "https://my-app.gadget.app",
    "https://my-app--development.gadget.app",
    "https://my-app.gadget.app/edit",
    "https://my-app.gadget.app/edit/files/routes/GET.js",
    "https://my-app.gadget.app/edit/cool-new-environment",
  ])("accepts %s", (value) => {
    expect(AppSlug(value, "--app")).toEqual("my-app");
  });

  it.each(["~"])("rejects %s", async (value) => {
    const error = await expectError(() => AppSlug(value, "--app"));
    expect(error).toBeInstanceOf(FlagError);
    expect(error.message).toMatchSnapshot();
  });
});
