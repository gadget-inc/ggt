import { beforeEach, describe, it } from "vitest";
import * as pull from "../../src/commands/pull.js";
import { nockTestApps } from "../__support__/app.js";
import { makeArgs } from "../__support__/arg.js";
import { testCtx } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { loginTestUser } from "../__support__/user.js";

describe("pull", () => {
  beforeEach(() => {
    loginTestUser();
    nockTestApps();
  });

  it("writes changes from gadget to the local filesystem", async () => {
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
});
