import fs from "fs-extra";
import { beforeEach, describe, expect, it } from "vitest";
import * as push from "../../src/commands/push.js";
import { confirm } from "../../src/services/output/confirm.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { mockConfirmOnce } from "../__support__/mock.js";
import { loginTestUser } from "../__support__/user.js";

describe("push", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("automatically sends local changes to gadget when gadget hasn't made any changes", async () => {
    const { localDir, expectDirs } = await makeSyncScenario({
      localFiles: {
        ".gadget/": "",
      },
    });

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
          },
        }
      `);

    // add a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.txt`);
    for (const filename of files) {
      await fs.outputFile(localDir.absolute(filename), filename);
    }

    await push.run(testCtx, makeArgs(push.args));

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

  it("doesn't send changes from the local filesystem to gadget if the file is ignored", async () => {
    const { localDir, expectDirs } = await makeSyncScenario({
      filesVersion1Files: {
        ".ignore": "**/tmp",
      },
      gadgetFiles: {
        ".ignore": "**/tmp",
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
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
            ".ignore": "**/tmp",
          },
        }
      `);

    // add a bunch of files
    const files = Array.from({ length: 10 }, (_, i) => `file${i + 1}.txt`);
    for (const filename of files) {
      await fs.outputFile(localDir.absolute(`tmp/${filename}`), filename);
    }

    await push.run(testCtx, makeArgs(push.args));

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
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}}}",
            ".ignore": "**/tmp",
            "tmp/": "",
            "tmp/file1.txt": "file1.txt",
            "tmp/file10.txt": "file10.txt",
            "tmp/file2.txt": "file2.txt",
            "tmp/file3.txt": "file3.txt",
            "tmp/file4.txt": "file4.txt",
            "tmp/file5.txt": "file5.txt",
            "tmp/file6.txt": "file6.txt",
            "tmp/file7.txt": "file7.txt",
            "tmp/file8.txt": "file8.txt",
            "tmp/file9.txt": "file9.txt",
          },
        }
      `);
  });

  it("discards gadget changes and sends local changes to gadget after confirmation", async () => {
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

    await push.run(testCtx, makeArgs(push.args));

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
            "3": {
              ".gadget/": "",
              "local-file.js": "// local",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            "local-file.js": "// local",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
            "local-file.js": "// local",
          },
        }
      `);

    await expectLocalAndGadgetHashesMatch();

    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("discards gadget changes and sends local changes to gadget if --force is passed", async () => {
    const { expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {},
      localFiles: {
        "local-file.js": "// local",
      },
      gadgetFiles: {
        "gadget-file.js": "// gadget",
      },
    });

    await push.run(testCtx, makeArgs(push.args, "push", "--force"));

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
            "3": {
              ".gadget/": "",
              "local-file.js": "// local",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            "local-file.js": "// local",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
            "local-file.js": "// local",
          },
        }
      `);

    await expectLocalAndGadgetHashesMatch();
  });

  it("discards gadget changes and sends local changes to gadget if --force is passed, except for .gadget/ files", async () => {
    const { expectDirs, expectLocalAndGadgetHashesMatch } = await makeSyncScenario({
      filesVersion1Files: {
        ".gadget/client.js": "// client",
      },
      localFiles: {
        ".gadget/client.js": "// client",
        "local-file.js": "// local",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client v2",
        "gadget-file.js": "// gadget",
      },
    });

    await push.run(testCtx, makeArgs(push.args, "push", "--force"));

    await expectDirs().resolves.toMatchInlineSnapshot(`
        {
          "filesVersionDirs": {
            "1": {
              ".gadget/": "",
              ".gadget/client.js": "// client",
            },
            "2": {
              ".gadget/": "",
              ".gadget/client.js": "// client v2",
              "gadget-file.js": "// gadget",
            },
            "3": {
              ".gadget/": "",
              ".gadget/client.js": "// client v2",
              "local-file.js": "// local",
            },
          },
          "gadgetDir": {
            ".gadget/": "",
            ".gadget/client.js": "// client v2",
            "local-file.js": "// local",
          },
          "localDir": {
            ".gadget/": "",
            ".gadget/client.js": "// client",
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"3"}}}",
            "local-file.js": "// local",
          },
        }
      `);

    await expect(expectLocalAndGadgetHashesMatch()).rejects.toThrowError();
  });
});
