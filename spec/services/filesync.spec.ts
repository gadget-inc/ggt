import fs from "fs-extra";
import path from "node:path";
import pMap from "p-map";
import { assert, beforeEach, describe, expect, it, vi } from "vitest";
import { FileSyncEncoding } from "../../src/__generated__/graphql.js";
import { ConflictPreference } from "../../src/commands/sync.js";
import * as app from "../../src/services/app/app.js";
import { ArgError, InvalidSyncFileError } from "../../src/services/errors.js";
import { Directory } from "../../src/services/filesync/directory.js";
import { FileSync } from "../../src/services/filesync/filesync.js";
import { isEmptyOrNonExistentDir } from "../../src/services/fs.js";
import * as prompt from "../../src/services/prompt.js";
import { testApp } from "../__support__/app.js";
import { expectError } from "../__support__/error.js";
import { readFiles, writeFiles } from "../__support__/files.js";
import { prettyJSON } from "../__support__/json.js";
import { testDirPath } from "../__support__/paths.js";
import { expectProcessExit } from "../__support__/process.js";
import { testUser } from "../__support__/user.js";

beforeEach(() => {
  vi.spyOn(app, "getApps").mockResolvedValue([
    testApp,
    { id: 2, slug: "not-test", primaryDomain: "not-test.gadget.app", hasSplitEnvironments: false, user: testUser },
  ]);
});

describe("FileSync.init", () => {
  let dir: string;

  beforeEach(() => {
    dir = testDirPath("app");
  });

  it("ensures `dir` exists", async () => {
    expect(fs.existsSync(dir)).toBe(false);

    await FileSync.init({ user: testUser, dir, app: testApp.slug });

    expect(fs.existsSync(dir)).toBe(true);
  });

  it("loads state from .gadget/sync.json", async () => {
    const state = { app: testApp.slug, filesVersion: "77" };
    await fs.outputJSON(path.join(dir, ".gadget/sync.json"), state);

    const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug });

    // @ts-expect-error _state is private
    expect(filesync._state).toEqual(state);
  });

  it("uses default state if .gadget/sync.json does not exist and `dir` is empty", async () => {
    const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug });

    // @ts-expect-error _state is private
    expect(filesync._state).toEqual({ app: "test", filesVersion: "0" });
  });

  it("throws InvalidSyncFileError if .gadget/sync.json does not exist and `dir` is not empty", async () => {
    await fs.outputFile(path.join(dir, "foo.js"), "foo");

    await expect(FileSync.init({ user: testUser, dir, app: testApp.slug })).rejects.toThrow(InvalidSyncFileError);
  });

  it("throws InvalidSyncFileError if .gadget/sync.json is invalid", async () => {
    // has trailing comma
    await fs.outputFile(path.join(dir, ".gadget/sync.json"), '{"app":"test","filesVersion":"77",}');

    await expect(FileSync.init({ user: testUser, dir, app: testApp.slug })).rejects.toThrow(InvalidSyncFileError);
  });

  it("does not throw InvalidSyncFileError if .gadget/sync.json is invalid and `--force` is passed", async () => {
    // has trailing comma
    await fs.outputFile(path.join(dir, ".gadget/sync.json"), '{"app":"test","filesVersion":"77",}');

    const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug, force: true });

    // @ts-expect-error _state is private
    expect(filesync._state).toEqual({ app: testApp.slug, filesVersion: "0" });
  });

  it("throws ArgError if the `--app` arg is passed a slug that does not exist within the user's available apps", async () => {
    const error = await expectError(() => FileSync.init({ user: testUser, dir, app: "does-not-exist" }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
            "Unknown application:

              does-not-exist

            Did you mean one of these?

              • not-test
              • test"
          `);
  });

  it("throws ArgError if the user doesn't have any available apps", async () => {
    vi.spyOn(app, "getApps").mockResolvedValue([]);

    const error = await expectError(() => FileSync.init({ user: testUser, dir, app: "does-not-exist" }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatchInlineSnapshot(`
            "You (test@example.com) don't have have any Gadget applications.

            Visit https://gadget.new to create one!"
          `);
  });

  it("throws ArgError if the `--app` flag is passed a different app name than the one in .gadget/sync.json", async () => {
    await fs.outputJson(path.join(dir, ".gadget/sync.json"), { app: "not-test", filesVersion: "77" });

    const error = await expectError(() => FileSync.init({ user: testUser, dir, app: testApp.slug }));

    expect(error).toBeInstanceOf(ArgError);
    expect(error.message).toMatch(/^You were about to sync the following app to the following directory:/);
  });

  it("does not throw ArgError if the `--app` flag is passed a different app name than the one in .gadget/sync.json and `--force` is passed", async () => {
    await fs.outputJson(path.join(dir, ".gadget/sync.json"), { app: "not-test", filesVersion: "77" });

    const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug, force: true });

    // @ts-expect-error _state is private
    expect(filesync._state).toEqual({ app: testApp.slug, filesVersion: "0" });
  });
});

describe("FileSync.writeToLocalFilesystem", () => {
  let dir: string;

  beforeEach(() => {
    dir = testDirPath("app");
  });

  it("removes old backup files before moving new files into place", async () => {
    const filesync = await FileSync.init({ user: testUser, dir, app: testApp.slug });

    // create a file named `foo.js`
    await fs.outputFile(filesync.directory.absolute("foo.js"), "// foo");

    // create a directory named `.gadget/backup/foo.js`
    await fs.mkdirp(filesync.directory.absolute(".gadget/backup/foo.js"));

    // tell filesync to delete foo.js, which should move it to .gadget/backup/foo.js
    // if the backup file is not removed first, this will fail with "Error: Cannot overwrite directory"
    await filesync.writeToLocalFilesystem({ filesVersion: 1n, files: [], delete: ["foo.js"] });

    // foo.js should be gone
    await expect(fs.exists(filesync.directory.absolute("foo.js"))).resolves.toBe(false);

    // .gadget/backup/foo.js should be the foo.js file that was deleted
    await expect(fs.readFile(filesync.directory.absolute(".gadget/backup/foo.js"), "utf8")).resolves.toBe("// foo");
  });
});

describe("FileSync.handleConflicts", () => {
  const setup = async ({
    gadgetFilesVersion,
    filesVersion1Files,
    localFiles,
    gadgetFiles,
  }: {
    gadgetFilesVersion?: bigint;
    filesVersion1Files: Record<string, string>;
    localFiles: Record<string, string>;
    gadgetFiles: Record<string, string>;
  }): Promise<{
    filesync: FileSync;
    gadgetFilesVersion: bigint;
    filesVersionDirs: Map<bigint, Directory>;
    localDir: Directory;
    gadgetDir: Directory;
    expectLocalAndGadgetHashesMatch: () => Promise<void>;
  }> => {
    await writeFiles(testDirPath(`fv-1`), { ".gadget/": "", ...filesVersion1Files });
    const filesVersionDirs = new Map<bigint, Directory>();
    filesVersionDirs.set(1n, new Directory(testDirPath(`fv-1`), false));

    const localDir = new Directory(testDirPath("local"), false);
    await writeFiles(localDir.path, {
      ".gadget/sync.json": prettyJSON({ app: testApp.slug, filesVersion: "1" }),
      ...localFiles,
    });

    const gadgetDir = new Directory(testDirPath("gadget"), false);
    await writeFiles(gadgetDir.path, { ".gadget/": "", ...gadgetFiles });

    gadgetFilesVersion ??= 1n;
    if (gadgetFilesVersion !== 1n) {
      const newFilesVersionDir = await Directory.init(testDirPath(`fv-${gadgetFilesVersion}`));
      await fs.copy(gadgetDir.path, newFilesVersionDir.path);
      filesVersionDirs.set(gadgetFilesVersion, newFilesVersionDir);
      console.log("set files version dir", { gadgetFilesVersion, filesVersionDirs });
    }

    const filesync = await FileSync.init({ user: testUser, dir: localDir.path });

    vi.spyOn(filesync, "getHashes").mockImplementation(async () => {
      const filesVersionDir = filesVersionDirs.get(filesync.filesVersion);
      assert(filesVersionDir, `filesVersionDir ${filesync.filesVersion} doesn't exist`);
      assert(gadgetFilesVersion);

      console.log("getHashes", { filesVersionDir, filesVersion: filesync.filesVersion, filesVersionDirs });

      return {
        gadgetFilesVersion,
        filesVersionHashes: await filesVersionDir.hashes(),
        localHashes: await localDir.hashes(),
        gadgetHashes: await gadgetDir.hashes(),
      };
    });

    vi.spyOn(filesync, "getFilesFromGadget").mockImplementation(async ({ paths, filesVersion }) => {
      filesVersion ??= filesync.filesVersion;

      return {
        filesVersion: filesVersion,
        files: await pMap(paths, async (filepath) => {
          const stats = await fs.stat(gadgetDir.absolute(filepath));
          return {
            path: filepath,
            mode: stats.mode,
            content: stats.isDirectory() ? "" : await fs.readFile(gadgetDir.absolute(filepath), { encoding: FileSyncEncoding.Base64 }),
            encoding: FileSyncEncoding.Base64,
          };
        }),
      };
    });

    vi.spyOn(filesync, "sendChangesToGadget").mockImplementation(async ({ expectedFilesVersion, changes }) => {
      expectedFilesVersion ??= filesync.filesVersion;
      assert(expectedFilesVersion === gadgetFilesVersion, "expectedFilesVersion should match gadgetFilesVersion");

      for (const [filepath, change] of changes) {
        switch (change.type) {
          case "create":
          case "update":
            if (filepath.endsWith("/")) {
              await fs.ensureDir(gadgetDir.absolute(filepath));
            } else {
              await fs.copyFile(localDir.absolute(filepath), gadgetDir.absolute(filepath));
            }
            break;
          case "delete":
            if (filepath.endsWith("/")) {
              // replicate dl and only delete the dir if it's empty
              // eslint-disable-next-line max-depth
              if (await isEmptyOrNonExistentDir(gadgetDir.absolute(filepath))) {
                await fs.remove(gadgetDir.absolute(filepath));
              }
            } else {
              await fs.remove(gadgetDir.absolute(filepath));
            }
            break;
        }
      }

      gadgetFilesVersion += 1n;

      const newFilesVersionDir = await Directory.init(testDirPath(`fv-${gadgetFilesVersion}`));
      await fs.copy(gadgetDir.path, newFilesVersionDir.path);
      filesVersionDirs.set(gadgetFilesVersion, newFilesVersionDir);

      // @ts-expect-error _state is private
      filesync._state = { filesVersion: String(gadgetFilesVersion), app: testApp.slug };

      // @ts-expect-error _save is private
      filesync._save();
    });

    vi.spyOn(filesync, "receiveChangesFromGadget");

    return {
      filesync,
      gadgetFilesVersion,
      filesVersionDirs,
      localDir,
      gadgetDir,
      expectLocalAndGadgetHashesMatch: async () => {
        const localHashes = await localDir.hashes();
        const gadgetHashes = await gadgetDir.hashes();
        expect(localHashes).toEqual(gadgetHashes);
        expect(filesync.filesVersion).toBe(gadgetFilesVersion);
      },
    };
  };

  it("does nothing if there aren't any changes", async () => {
    const { filesync, expectLocalAndGadgetHashesMatch } = await setup({
      filesVersion1Files: { "foo.js": "// foo" },
      localFiles: { "foo.js": "// foo" },
      gadgetFiles: { "foo.js": "// foo" },
    });

    vi.spyOn(prompt, "select");
    vi.spyOn(prompt, "confirm");

    await filesync.handleConflicts();

    expect(prompt.select).not.toHaveBeenCalled();
    expect(prompt.confirm).not.toHaveBeenCalled();
    expect(filesync.receiveChangesFromGadget).not.toHaveBeenCalled();
    expect(filesync.sendChangesToGadget).not.toHaveBeenCalled();
    await expectLocalAndGadgetHashesMatch();
  });

  it("automatically merges non-conflicting changes if there are no conflicting changes", async () => {
    const { filesync, filesVersionDirs, gadgetDir, localDir, expectLocalAndGadgetHashesMatch } = await setup({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo",
        "local-file.js": "// local",
      },
      gadgetFilesVersion: 2n,
      gadgetFiles: {
        "foo.js": "// foo",
        "gadget-file.js": "// gadget",
      },
    });

    vi.spyOn(prompt, "select");
    vi.spyOn(prompt, "confirm");

    await filesync.handleConflicts();

    expect(prompt.select).not.toHaveBeenCalled();
    expect(prompt.confirm).not.toHaveBeenCalled();
    expect(filesync.sendChangesToGadget.mock.lastCall).toMatchInlineSnapshot(`
      [
        {
          "changes": Map {
            "local-file.js" => {
              "oldPath": undefined,
              "targetHash": "569f07148d3870b4714cfd31efe35f6f7f58b574",
              "type": "create",
            },
          },
          "expectedFilesVersion": 2n,
        },
      ]
    `);
    expect(filesync.receiveChangesFromGadget.mock.lastCall).toMatchInlineSnapshot(`
      [
        {
          "changes": Map {
            "gadget-file.js" => {
              "oldPath": undefined,
              "targetHash": "ce7c600e6cda6dca5fe2bc9cd524c54e471003ab",
              "type": "create",
            },
          },
          "filesVersion": 2n,
        },
      ]
    `);

    expect(filesVersionDirs.size).toBe(3);
    await expect(readFiles(filesVersionDirs.get(1n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo",
      }
    `);
    await expect(readFiles(filesVersionDirs.get(2n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo",
        "gadget-file.js" => "// gadget",
      }
    `);
    await expect(readFiles(filesVersionDirs.get(3n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo",
        "local-file.js" => "// local",
        "gadget-file.js" => "// gadget",
      }
    `);
    await expect(readFiles(localDir.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        ".gadget/sync.json" => "{
        \\"filesVersion\\": \\"3\\",
        \\"app\\": \\"test\\"
      }
      ",
        "foo.js" => "// foo",
        "local-file.js" => "// local",
        "gadget-file.js" => "// gadget",
      }
    `);
    await expect(readFiles(gadgetDir.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo",
        "local-file.js" => "// local",
        "gadget-file.js" => "// gadget",
      }
    `);
    await expectLocalAndGadgetHashesMatch();
  });

  it(`exits the process when "${ConflictPreference.CANCEL}" is chosen`, async () => {
    const { filesync } = await setup({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// local foo",
      },
      gadgetFiles: {
        "foo.js": "// gadget foo",
      },
      gadgetFilesVersion: 2n,
    });

    vi.spyOn(prompt, "select").mockResolvedValue(ConflictPreference.CANCEL);
    vi.spyOn(prompt, "confirm");

    await expectProcessExit(() => filesync.handleConflicts());

    expect(prompt.select.mock.lastCall).toMatchInlineSnapshot(`
        [
          {
            "choices": [
              "Cancel (Ctrl+C)",
              "Keep my changes",
              "Keep Gadget's changes",
            ],
            "message": "How would you like to resolve these conflicts?",
          },
        ]
      `);
    expect(prompt.confirm).not.toHaveBeenCalled();
    expect(filesync.receiveChangesFromGadget).not.toHaveBeenCalled();
    expect(filesync.sendChangesToGadget).not.toHaveBeenCalled();
  });

  it(`uses local conflicting changes when "${ConflictPreference.LOCAL}" is chosen`, async () => {
    const { filesync, filesVersionDirs, gadgetDir, localDir, expectLocalAndGadgetHashesMatch } = await setup({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// local foo",
      },
      gadgetFilesVersion: 2n,
      gadgetFiles: {
        "foo.js": "// gadget foo",
      },
    });

    vi.spyOn(prompt, "select").mockResolvedValue(ConflictPreference.LOCAL);
    vi.spyOn(prompt, "confirm").mockResolvedValue();

    await filesync.handleConflicts();

    expect(prompt.select.mock.lastCall).toMatchInlineSnapshot(`
        [
          {
            "choices": [
              "Cancel (Ctrl+C)",
              "Keep my changes",
              "Keep Gadget's changes",
            ],
            "message": "How would you like to resolve these conflicts?",
          },
        ]
      `);
    expect(prompt.confirm.mock.lastCall).toMatchInlineSnapshot(`
        [
          {
            "message": "Are you sure you want to do this?",
          },
        ]
      `);
    expect(filesync.receiveChangesFromGadget).not.toHaveBeenCalled();
    expect(filesync.sendChangesToGadget.mock.lastCall).toMatchInlineSnapshot(`
        [
          {
            "changes": Map {
              "foo.js" => {
                "sourceHash": "176554ae143b13243600c00508d90339f5008f3e",
                "targetHash": "6eb9e95ecbb5a79840e1d6e854adf90205a1c02d",
                "type": "update",
              },
            },
            "expectedFilesVersion": 2n,
          },
        ]
      `);

    expect(filesVersionDirs.size).toBe(3);
    await expect(readFiles(filesVersionDirs.get(1n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo",
      }
    `);
    await expect(readFiles(filesVersionDirs.get(2n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// gadget foo",
      }
    `);
    await expect(readFiles(filesVersionDirs.get(3n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// local foo",
      }
    `);
    await expect(readFiles(localDir.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        ".gadget/sync.json" => "{
        \\"filesVersion\\": \\"3\\",
        \\"app\\": \\"test\\"
      }
      ",
        "foo.js" => "// local foo",
      }
    `);
    await expect(readFiles(gadgetDir.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// local foo",
      }
    `);
    await expectLocalAndGadgetHashesMatch();
  });

  it(`uses gadget's conflicting changes when "${ConflictPreference.GADGET}" is chosen`, async () => {
    const { filesync, filesVersionDirs, gadgetDir, localDir, expectLocalAndGadgetHashesMatch } = await setup({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// local foo",
      },
      gadgetFilesVersion: 2n,
      gadgetFiles: {
        "foo.js": "// gadget foo",
      },
    });

    vi.spyOn(prompt, "select").mockResolvedValue(ConflictPreference.GADGET);
    vi.spyOn(prompt, "confirm").mockResolvedValue();

    await filesync.handleConflicts();

    expect(prompt.select.mock.lastCall).toMatchInlineSnapshot(`
        [
          {
            "choices": [
              "Cancel (Ctrl+C)",
              "Keep my changes",
              "Keep Gadget's changes",
            ],
            "message": "How would you like to resolve these conflicts?",
          },
        ]
      `);
    expect(prompt.confirm.mock.lastCall).toMatchInlineSnapshot(`
        [
          {
            "message": "Are you sure you want to do this?",
          },
        ]
      `);
    expect(filesync.sendChangesToGadget).not.toHaveBeenCalled();
    expect(filesync.receiveChangesFromGadget.mock.lastCall).toMatchInlineSnapshot(`
        [
          {
            "changes": Map {
              "foo.js" => {
                "sourceHash": "176554ae143b13243600c00508d90339f5008f3e",
                "targetHash": "e41dc94c62c3fec361ed566c3790a24e3385d6bb",
                "type": "update",
              },
            },
            "filesVersion": 2n,
          },
        ]
      `);

    expect(filesVersionDirs.size).toBe(2);
    await expect(readFiles(filesVersionDirs.get(1n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo",
      }
    `);
    await expect(readFiles(filesVersionDirs.get(2n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// gadget foo",
      }
    `);
    await expect(readFiles(localDir.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        ".gadget/sync.json" => "{
        \\"app\\": \\"test\\",
        \\"filesVersion\\": \\"2\\"
      }
      ",
        "foo.js" => "// gadget foo",
      }
    `);
    await expect(readFiles(gadgetDir.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// gadget foo",
      }
    `);
    await expectLocalAndGadgetHashesMatch();
  });

  it("overwrites conflicting changes then merges non-conflicting changes", async () => {
    const { filesync, filesVersionDirs, gadgetDir, localDir, expectLocalAndGadgetHashesMatch } = await setup({
      filesVersion1Files: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo local",
        "local-file.js": "// local",
      },
      gadgetFilesVersion: 2n,
      gadgetFiles: {
        "foo.js": "// foo gadget",
        "gadget-file.js": "// gadget",
      },
    });

    vi.spyOn(prompt, "select").mockResolvedValue(ConflictPreference.LOCAL);
    vi.spyOn(prompt, "confirm").mockResolvedValue();

    await filesync.handleConflicts();

    expect(prompt.select.mock.lastCall).toMatchInlineSnapshot(`
      [
        {
          "choices": [
            "Cancel (Ctrl+C)",
            "Keep my changes",
            "Keep Gadget's changes",
          ],
          "message": "How would you like to resolve these conflicts?",
        },
      ]
    `);
    expect(prompt.confirm.mock.lastCall).toMatchInlineSnapshot(`
      [
        {
          "message": "Are you sure you want to do this?",
        },
      ]
    `);
    expect(filesync.sendChangesToGadget.mock.lastCall).toMatchInlineSnapshot(`
      [
        {
          "changes": Map {
            "foo.js" => {
              "sourceHash": "176554ae143b13243600c00508d90339f5008f3e",
              "targetHash": "b88c109594cd923b03ab1228bd1643c280061a51",
              "type": "update",
            },
            "local-file.js" => {
              "oldPath": undefined,
              "targetHash": "569f07148d3870b4714cfd31efe35f6f7f58b574",
              "type": "create",
            },
          },
          "expectedFilesVersion": 2n,
        },
      ]
    `);
    expect(filesync.receiveChangesFromGadget.mock.lastCall).toMatchInlineSnapshot(`
      [
        {
          "changes": Map {
            "gadget-file.js" => {
              "oldPath": undefined,
              "targetHash": "ce7c600e6cda6dca5fe2bc9cd524c54e471003ab",
              "type": "create",
            },
          },
          "filesVersion": 2n,
        },
      ]
    `);

    expect(filesVersionDirs.size).toBe(3);
    await expect(readFiles(filesVersionDirs.get(1n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo",
      }
    `);
    await expect(readFiles(filesVersionDirs.get(2n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo gadget",
        "gadget-file.js" => "// gadget",
      }
    `);
    await expect(readFiles(filesVersionDirs.get(3n)!.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo local",
        "local-file.js" => "// local",
        "gadget-file.js" => "// gadget",
      }
    `);
    await expect(readFiles(localDir.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        ".gadget/sync.json" => "{
        \\"filesVersion\\": \\"3\\",
        \\"app\\": \\"test\\"
      }
      ",
        "foo.js" => "// foo local",
        "local-file.js" => "// local",
        "gadget-file.js" => "// gadget",
      }
    `);
    await expect(readFiles(gadgetDir.path)).resolves.toMatchInlineSnapshot(`
      Map {
        ".gadget/" => "",
        "foo.js" => "// foo local",
        "local-file.js" => "// local",
        "gadget-file.js" => "// gadget",
      }
    `);
    await expectLocalAndGadgetHashesMatch();
  });
});
