import fs from "fs-extra";
import { beforeEach, describe, it } from "vitest";
import { args, run as push, type PushArgs } from "../../src/commands/push.js";
import { type Context } from "../../src/services/command/context.js";
import { makeContext } from "../__support__/context.js";
import { makeSyncScenario } from "../__support__/filesync.js";
import { describeWithAuth } from "../utils.js";

describe("push", () => {
  let ctx: Context<PushArgs>;

  describeWithAuth(() => {
    beforeEach(() => {
      ctx = makeContext({ parse: args, argv: ["push"] });
    });

    it("sends changes from the local filesystem to gadget", async () => {
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

      await push(ctx);

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

      await push(ctx);

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
  });
});
