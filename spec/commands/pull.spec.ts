import { beforeEach, describe, it } from "vitest";
import { args, run as pull, type PullArgs } from "../../src/commands/pull.js";
import { type Context } from "../../src/services/command/context.js";
import { makeContext } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { describeWithAuth } from "../utils.js";

describe("pull", () => {
  let ctx: Context<PullArgs>;

  describeWithAuth(() => {
    beforeEach(() => {
      ctx = makeContext({ parse: args, argv: ["pull"] });
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}},"app":"test","filesVersion":"1"}",
          },
        }
      `);

      await pull(ctx);

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"2"}},"app":"test","filesVersion":"2"}",
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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}},"app":"test","filesVersion":"1"}",
            ".ignore": "**/tmp",
          },
        }
      `);

      await pull(ctx);

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
            ".gadget/sync.json": "{"application":"test","environment":"development","environments":{"development":{"filesVersion":"1"}},"app":"test","filesVersion":"1"}",
            ".ignore": "**/tmp",
          },
        }
      `);
    });
  });
});
