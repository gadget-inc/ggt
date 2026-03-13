import os from "node:os";
import path from "node:path";

import fs from "fs-extra";
import { beforeEach, describe, expect, it } from "vitest";

import { ClientError } from "../../../src/services/app/error.ts";
import type { Command } from "../../../src/services/command/command.ts";
import { Directory } from "../../../src/services/filesync/directory.ts";
import {
  TooManyMergeAttemptsError,
  TooManyPushAttemptsError,
  UnknownDirectoryError,
  YarnNotFoundError,
  isFilesVersionMismatchError,
} from "../../../src/services/filesync/error.ts";
import { SyncJson, SyncJsonFlags } from "../../../src/services/filesync/sync-json.ts";
import { nockTestApps, testEnvironment } from "../../__support__/app.ts";
import { testCtx } from "../../__support__/context.ts";
import { makeFlags } from "../../__support__/flag.ts";
import { mockOnce } from "../../__support__/mock.ts";
import { loginTestUser } from "../../__support__/user.ts";

describe(YarnNotFoundError.name, () => {
  it("renders correctly", () => {
    const error = new YarnNotFoundError();
    expect(error.sprint()).toMatchInlineSnapshot(`
      "Yarn must be installed to sync your application. You can install it by running:

        $ npm install --global yarn

      For more information, see: https://classic.yarnpkg.com/en/docs/install"
    `);
  });
});

// these tests are skipped on Windows because the snapshot contains a
// Unix path that keeps failing in CI
describe.skipIf(os.platform() === "win32")(UnknownDirectoryError.name, () => {
  const makeSyncJson = async (command: Command): Promise<SyncJson> => {
    const flags = makeFlags(SyncJsonFlags, command, `--app=${testEnvironment.application.slug}`, `--env=${testEnvironment.name}`);
    const directory = await Directory.init(path.resolve("/Users/jane/doe/"));

    // @ts-expect-error - SyncJson's constructor is private
    const syncJson: SyncJson = new SyncJson(testCtx, flags, directory, testEnvironment, undefined, {
      application: testEnvironment.application.slug,
      environment: testEnvironment.name,
      environments: {
        [testEnvironment.name]: { filesVersion: "0" },
      },
    });

    return syncJson;
  };

  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it.each(["dev", "deploy", "push", "pull", "status", "problems", "open"] as const)(
    "renders correctly when %s is passed",
    async (command) => {
      const syncJson = await makeSyncJson(command);
      const error = new UnknownDirectoryError({ command, flags: syncJson.flags, directory: syncJson.directory });
      expect(error.sprint()).toMatchSnapshot();
    },
  );

  it("renders correctly when the file exists but is invalid", async () => {
    mockOnce(fs, "existsSync", () => true);
    const syncJson = await makeSyncJson("dev");
    const error = new UnknownDirectoryError({ command: "dev", flags: syncJson.flags, directory: syncJson.directory });
    expect(error.sprint()).toMatchSnapshot();
  });
});

describe(TooManyMergeAttemptsError.name, () => {
  it("renders correctly", () => {
    const error = new TooManyMergeAttemptsError(10);
    expect(error.sprint()).toMatchInlineSnapshot(`
      "We merged your local files with your environment's files 10 times,
      but your local and environment's files still don't match.

      Make sure no one else is editing files on your environment, and try again.

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });
});

describe(TooManyPushAttemptsError.name, () => {
  it("renders correctly", () => {
    const error = new TooManyPushAttemptsError(10, "push");
    expect(error.sprint()).toMatchInlineSnapshot(`
      "We tried to push your local changes to your environment 10 times,
      but your environment's files kept changing since we last checked.

      Please re-run "ggt push" to see the changes and try again.

      If you think this is a bug, use the link below to create an issue on GitHub.

      https://github.com/gadget-inc/ggt/issues/new?template=bug_report.yml&error-id=00000000-0000-0000-0000-000000000000
      "
    `);
  });
});

describe("isFilesVersionMismatchError", () => {
  it('returns true given an object with a message that starts with "Files version mismatch"', () => {
    expect(isFilesVersionMismatchError({ message: "Files version mismatch" })).toBe(true);
    expect(isFilesVersionMismatchError({ message: "Files version mismatch, expected 1 but got 2" })).toBe(true);
  });

  it("returns true given GraphQLErrors", () => {
    expect(isFilesVersionMismatchError([{ message: "Files version mismatch" }])).toBe(true);
  });

  it("returns true given a GraphQLResult", () => {
    expect(isFilesVersionMismatchError({ errors: [{ message: "Files version mismatch" }] })).toBe(true);
  });

  it("returns true given an EditGraphQLError", () => {
    expect(isFilesVersionMismatchError(new ClientError(undefined, [{ message: "Files version mismatch" }]))).toBe(true);
  });

  it("returns false given an object with a message that does not start with 'Files version mismatch'", () => {
    expect(isFilesVersionMismatchError({ message: "Something else" })).toBe(false);
  });
});
