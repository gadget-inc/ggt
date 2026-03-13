import { beforeEach, describe, it } from "vitest";

import problems from "../../src/commands/problems.ts";
import { PUBLISH_ISSUES_QUERY } from "../../src/services/app/edit/operation.ts";
import { runCommand } from "../../src/services/command/run.ts";
import { nockTestApps } from "../__support__/app.ts";
import { testCtx } from "../__support__/context.ts";
import { makeSyncScenario } from "../__support__/filesync.ts";
import { nockEditResponse } from "../__support__/graphql.ts";
import { expectStdout } from "../__support__/output.ts";
import { mockSystemTime } from "../__support__/time.ts";
import { loginTestUser } from "../__support__/user.ts";

describe("problems", () => {
  mockSystemTime();

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("prints the expected message when there are no problems", async () => {
    const { syncJson } = await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
    });

    nockEditResponse({
      operation: PUBLISH_ISSUES_QUERY,
      response: { data: { publishIssues: [] } },
      environment: syncJson.environment,
      optional: false,
    });

    await runCommand(testCtx, problems);

    expectStdout().toMatchInlineSnapshot(`
      "No problems found.
      "
    `);
  });

  it("prints the expected message when there are problems", async () => {
    const { syncJson } = await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
    });

    nockEditResponse({
      operation: PUBLISH_ISSUES_QUERY,
      response: {
        data: {
          publishIssues: [
            {
              severity: "Error",
              message: "Something is wrong",
              node: {
                type: "Model",
                key: "abc123",
                apiIdentifier: "myModel",
                name: "My Model",
                fieldType: null,
                parentKey: null,
                parentApiIdentifier: null,
              },
              nodeLabels: [{ type: "Model", identifier: "myModel" }],
            },
          ],
        },
      },
      environment: syncJson.environment,
      optional: false,
    });

    await runCommand(testCtx, problems);

    expectStdout().toMatchInlineSnapshot(`
      "! Problems found in your app

      • myModel 1 problem
        ✖ Something is wrong myModel
      "
    `);
  });
});
