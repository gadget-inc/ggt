import { beforeEach, describe, it } from "vitest";

import * as problems from "../../src/commands/problems.js";
import { PUBLISH_ISSUES_QUERY } from "../../src/services/app/edit/operation.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { nockEditResponse } from "../__support__/graphql.js";
import { expectStdout } from "../__support__/output.js";
import { mockSystemTime } from "../__support__/time.js";
import { loginTestUser } from "../__support__/user.js";

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

    await problems.run(testCtx, makeArgs(problems.args));

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

    await problems.run(testCtx, makeArgs(problems.args));

    expectStdout().toMatchInlineSnapshot(`
      "! Problems found in your app

      • myModel 1 problem
        ✖ Something is wrong myModel
      "
    `);
  });
});
