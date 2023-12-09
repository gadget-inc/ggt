import { describe, expect, it } from "vitest";
import { AppArg } from "../../../src/services/app/arg.js";
import { ArgError } from "../../../src/services/command/arg.js";
import { expectError } from "../../__support__/error.js";

describe("AppArg", () => {
  it.each([
    "my-app",
    "my-app.gadget.app",
    "my-app--development.gadget.app",
    "https://my-app.gadget.app",
    "https://my-app--development.gadget.app",
    "https://my-app.gadget.app/edit",
    "https://my-app.gadget.app/edit/files/routes/GET.js",
  ])("accepts %s", (value) => {
    expect(AppArg(value, "--app")).toEqual("my-app");
  });

  it.each(["~"])("rejects %s", async (value) => {
    const error = await expectError(() => AppArg(value, "--app"));
    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchSnapshot();
  });
});
