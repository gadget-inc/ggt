import { beforeEach, describe, it } from "vitest";
import { args, command as status, type StatusArgs } from "../../src/commands/status.js";
import type { Context } from "../../src/services/command/context.js";
import { nockTestApps } from "../__support__/app.js";
import { makeContext } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { expectStdout } from "../__support__/output.js";
import { loginTestUser } from "../__support__/user.js";

describe("status", () => {
  let ctx: Context<StatusArgs>;

  beforeEach(() => {
    loginTestUser();
    nockTestApps();

    ctx = makeContext({
      parse: args,
      argv: ["status"],
    });
  });

  it("prints the expected message when nothing has changed", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
    });

    await status(ctx);

    expectStdout().toMatchSnapshot();
  });

  it("prints the expected message when local files have changed", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
        "local-file.txt": "changed",
      },
    });

    await status(ctx);

    expectStdout().toMatchSnapshot();
  });

  it("prints the expected message when gadget files have changed", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
      gadgetFiles: {
        "gadget-file.txt": "changed",
      },
    });

    await status(ctx);

    expectStdout().toMatchSnapshot();
  });

  it("prints the expected message when both local and gadget files have changed", async () => {
    await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
        "local-file.txt": "changed",
      },
      gadgetFiles: {
        "gadget-file.txt": "changed",
      },
    });

    await status(ctx);

    expectStdout().toMatchSnapshot();
  });
});
