import { beforeEach, describe, expect, it } from "vitest";
import * as pull from "../../src/commands/pull.js";
import { confirm } from "../../src/services/output/confirm.js";
import { mockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { mockConfirmOnce } from "../__support__/mock.js";
import { loginTestUser } from "../__support__/user.js";

describe("pull", () => {
  beforeEach(() => {
    loginTestUser();
    mockTestApps();
  });

  it("receives gadget's changes", async () => {
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.txt`);

    const { expectDirs } = await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
      gadgetFiles: {
        ...files.reduce((acc, filename) => ({ ...acc, [filename]: filename }), {}),
      },
    });

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
            },
            "2": {
              ".gadget/": "",
              "file1.txt": "file1.txt",
              "file10.txt": "file10.txt",
              "file2.txt": "file2.txt",
              "file3.txt": "file3.txt",
              "file4.txt": "file4.txt",
              "file5.txt": "file5.txt",
              "file6.txt": "file6.txt",
              "file7.txt": "file7.txt",
              "file8.txt": "file8.txt",
              "file9.txt": "file9.txt",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            "file1.txt": "file1.txt",
            "file10.txt": "file10.txt",
            "file2.txt": "file2.txt",
            "file3.txt": "file3.txt",
            "file4.txt": "file4.txt",
            "file5.txt": "file5.txt",
            "file6.txt": "file6.txt",
            "file7.txt": "file7.txt",
            "file8.txt": "file8.txt",
            "file9.txt": "file9.txt",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
          },
        }
      `);

    await pull.run(testCtx, makeArgs(pull.args));

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
            },
            "2": {
              ".gadget/": "",
              "file1.txt": "file1.txt",
              "file10.txt": "file10.txt",
              "file2.txt": "file2.txt",
              "file3.txt": "file3.txt",
              "file4.txt": "file4.txt",
              "file5.txt": "file5.txt",
              "file6.txt": "file6.txt",
              "file7.txt": "file7.txt",
              "file8.txt": "file8.txt",
              "file9.txt": "file9.txt",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            "file1.txt": "file1.txt",
            "file10.txt": "file10.txt",
            "file2.txt": "file2.txt",
            "file3.txt": "file3.txt",
            "file4.txt": "file4.txt",
            "file5.txt": "file5.txt",
            "file6.txt": "file6.txt",
            "file7.txt": "file7.txt",
            "file8.txt": "file8.txt",
            "file9.txt": "file9.txt",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
            "file1.txt": "file1.txt",
            "file10.txt": "file10.txt",
            "file2.txt": "file2.txt",
            "file3.txt": "file3.txt",
            "file4.txt": "file4.txt",
            "file5.txt": "file5.txt",
            "file6.txt": "file6.txt",
            "file7.txt": "file7.txt",
            "file8.txt": "file8.txt",
            "file9.txt": "file9.txt",
          },
        }
      `);
  });

  it("receives gadget's changes and discards local changes after confirmation", async () => {
    const { expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    mockConfirmOnce();

    await pull.run(testCtx, makeArgs(pull.args));

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget-file.js": "// gadget",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "gadget-file.js": "// gadget",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/local-file.js": "// local",
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();

    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("receives gadget's changes and discards local changes if --force is passed", async () => {
    const { expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await pull.run(testCtx, makeArgs(pull.args, "pull", "--force"));

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget-file.js": "// gadget",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "gadget-file.js": "// gadget",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/local-file.js": "// local",
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("doesn't write changes from gadget to the local filesystem if the file is ignored", async () => {
    const files = Array.from({ length: 10 }, (_, i) => `tmp/file${i + 1}.txt`);

    const { expectDirs } = await makeSyncScenario({
      filesVersion1Files: {
        ".ignore": "**/tmp",
      },
      gadgetFiles: {
        ".ignore": "**/tmp",
        ...files.reduce((acc, filename) => ({ ...acc, [filename]: filename }), {}),
      },
      localFiles: {
        ".ignore": "**/tmp",
      },
    });

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
              ".ignore": "**/tmp",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            ".ignore": "**/tmp",
            "tmp/": "",
            "tmp/file1.txt": "tmp/file1.txt",
            "tmp/file10.txt": "tmp/file10.txt",
            "tmp/file2.txt": "tmp/file2.txt",
            "tmp/file3.txt": "tmp/file3.txt",
            "tmp/file4.txt": "tmp/file4.txt",
            "tmp/file5.txt": "tmp/file5.txt",
            "tmp/file6.txt": "tmp/file6.txt",
            "tmp/file7.txt": "tmp/file7.txt",
            "tmp/file8.txt": "tmp/file8.txt",
            "tmp/file9.txt": "tmp/file9.txt",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
            ".ignore": "**/tmp",
          },
        }
      `);

    await pull.run(testCtx, makeArgs(pull.args));

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
              ".ignore": "**/tmp",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            ".ignore": "**/tmp",
            "tmp/": "",
            "tmp/file1.txt": "tmp/file1.txt",
            "tmp/file10.txt": "tmp/file10.txt",
            "tmp/file2.txt": "tmp/file2.txt",
            "tmp/file3.txt": "tmp/file3.txt",
            "tmp/file4.txt": "tmp/file4.txt",
            "tmp/file5.txt": "tmp/file5.txt",
            "tmp/file6.txt": "tmp/file6.txt",
            "tmp/file7.txt": "tmp/file7.txt",
            "tmp/file8.txt": "tmp/file8.txt",
            "tmp/file9.txt": "tmp/file9.txt",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
            ".ignore": "**/tmp",
          },
        }
      `);
  });

  it("discards local .gadget/ changes without confirmation", async () => {
    const { expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        ".gadget/local.js": "// .gadget/local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await pull.run(testCtx, makeArgs(pull.args));

    await expectDirs().resolves.toMatchInlineSnapshot(`
      {
        "filesVersionDirs": {
          "1": {
            ".gadget/": "",
          },
          "2": {
            ".gadget/": "",
            "gadget-file.js": "// gadget",
          },
        },
        "gadgetDir": {
          ".gadget/": "",
          "gadget-file.js": "// gadget",
        },
        "localDir": {
          ".gadget/": "",
          ".gadget/backup/": "",
          ".gadget/backup/.gadget/": "",
          ".gadget/backup/.gadget/local.js": "// .gadget/local",
          ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}}}",
          "gadget-file.js": "// gadget",
        },
      }
    `);

    await expectLocalAndGadgetHashesMatch();
  });

  // can't write these tests until makeSyncScenario supports multiple environments
  it.todo("changes the environment when a different environment is specified");
  it.todo("does not change the environment when the production environment is specified");
});
