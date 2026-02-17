import { describe, expect, it } from "vitest";

import { Conflicts, getConflicts, printConflicts, withoutConflictingChanges } from "../../../src/services/filesync/conflicts.js";
import { getNecessaryChanges } from "../../../src/services/filesync/hashes.js";
import { testCtx } from "../../__support__/context.js";
import { makeHashes } from "../../__support__/filesync.js";
import { expectStdout } from "../../__support__/output.js";

describe("getConflicts", () => {
  it("returns conflicting changes", async () => {
    const { localFilesVersionHashes, environmentHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
        "bar.js": "// bar",
        "baz.js": "// baz",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "bar.js": "// bar (local)",
        "qux.js": "// qux (local)",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
        "baz.js": "// baz (gadget)",
        "qux.js": "// qux (gadget)",
      },
    });

    const localChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: localHashes });
    const environmentChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: environmentHashes });
    const conflicts = getConflicts({ localChanges, environmentChanges });

    expect(Object.fromEntries(conflicts)).toEqual({
      "foo.js": {
        localChange: { type: "update", sourceHash: localFilesVersionHashes["foo.js"], targetHash: localHashes["foo.js"] },
        gadgetChange: { type: "update", sourceHash: localFilesVersionHashes["foo.js"], targetHash: environmentHashes["foo.js"] },
      },
      "bar.js": {
        localChange: { type: "update", sourceHash: localFilesVersionHashes["bar.js"], targetHash: localHashes["bar.js"] },
        gadgetChange: { type: "delete", sourceHash: localFilesVersionHashes["bar.js"] },
      },
      "baz.js": {
        localChange: { type: "delete", sourceHash: localFilesVersionHashes["baz.js"] },
        gadgetChange: { type: "update", sourceHash: localFilesVersionHashes["baz.js"], targetHash: environmentHashes["baz.js"] },
      },
      "qux.js": {
        localChange: { type: "create", targetHash: localHashes["qux.js"] },
        gadgetChange: { type: "create", targetHash: environmentHashes["qux.js"] },
      },
    });
  });

  it("doesn't return non-conflicting changes", async () => {
    const { localFilesVersionHashes, environmentHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
        "bar.js": "// bar",
        "baz.js": "// baz",
      },
      localFiles: {
        "foo.js": "// foo (same)",
        "bar.js": "// bar (local)",
        "baz.js": "// baz",
        "qux.js": "// qux (same)",
      },
      gadgetFiles: {
        "foo.js": "// foo (same)",
        "bar.js": "// bar",
        "baz.js": "// baz (gadget)",
        "qux.js": "// qux (same)",
      },
    });

    const localChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: localHashes });
    const environmentChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: environmentHashes });
    const conflicts = getConflicts({ localChanges, environmentChanges });

    expect(Object.fromEntries(conflicts)).toEqual({});
    expect(conflicts.size).toBe(0);
  });

  it("does not treat delete-vs-delete as a conflict", async () => {
    const { localFilesVersionHashes, environmentHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
      },
      localFiles: {},
      gadgetFiles: {},
    });

    const localChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: localHashes });
    const environmentChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: environmentHashes });
    const conflicts = getConflicts({ localChanges, environmentChanges });

    expect(conflicts.size).toBe(0);
  });

  it("ignores conflicts in .gadget/ paths", async () => {
    const { localFilesVersionHashes, environmentHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        ".gadget/client.js": "// client",
      },
      localFiles: {
        ".gadget/client.js": "// client (local)",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client (gadget)",
      },
    });

    const localChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: localHashes });
    const environmentChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: environmentHashes });
    const conflicts = getConflicts({ localChanges, environmentChanges });

    expect(conflicts.has(".gadget/client.js")).toBe(false);
    expect(conflicts.size).toBe(0);
  });

  it("ignores .gadget/ conflicts while preserving non-.gadget/ conflicts", async () => {
    const { localFilesVersionHashes, environmentHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        ".gadget/client.js": "// client",
        "app.js": "// app",
      },
      localFiles: {
        ".gadget/client.js": "// client (local)",
        "app.js": "// app (local)",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client (gadget)",
        "app.js": "// app (gadget)",
      },
    });

    const localChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: localHashes });
    const environmentChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: environmentHashes });
    const conflicts = getConflicts({ localChanges, environmentChanges });

    expect(conflicts.has(".gadget/client.js")).toBe(false);
    expect(conflicts.has("app.js")).toBe(true);
    expect(conflicts.size).toBe(1);
  });
});

describe("withoutConflictingChanges", () => {
  it("removes conflicting paths from changes", async () => {
    const { localFilesVersionHashes, environmentHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
        "bar.js": "// bar",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "bar.js": "// bar (local)",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
        "bar.js": "// bar",
      },
    });

    const localChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: localHashes });
    const environmentChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: environmentHashes });
    const conflicts = getConflicts({ localChanges, environmentChanges });

    expect(conflicts.size).toBe(1);
    expect(conflicts.has("foo.js")).toBe(true);

    const filtered = withoutConflictingChanges({ conflicts, changes: localChanges });

    expect(filtered.has("foo.js")).toBe(false);
    expect(filtered.has("bar.js")).toBe(true);
  });

  it("returns all changes when there are no conflicts", async () => {
    const { localFilesVersionHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "bar.js": "// bar (local)",
      },
    });

    const localChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: localHashes });
    const conflicts = new Conflicts();

    const filtered = withoutConflictingChanges({ conflicts, changes: localChanges });

    expect(filtered.size).toBe(localChanges.size);
  });

  it("returns empty when all changes conflict", async () => {
    const { localFilesVersionHashes, environmentHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
      },
    });

    const localChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: localHashes });
    const environmentChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: environmentHashes });
    const conflicts = getConflicts({ localChanges, environmentChanges });

    const filtered = withoutConflictingChanges({ conflicts, changes: localChanges });

    expect(filtered.size).toBe(0);
  });
});

describe("printConflicts", () => {
  it("prints a table of conflicts", async () => {
    const { localFilesVersionHashes, environmentHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
        "bar.js": "// bar",
        "baz.js": "// baz",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "bar.js": "// bar (local)",
        "qux.js": "// qux (local)",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
        "baz.js": "// baz (gadget)",
        "qux.js": "// qux (gadget)",
      },
    });

    const localChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: localHashes });
    const environmentChanges = getNecessaryChanges(testCtx, { from: localFilesVersionHashes, to: environmentHashes });
    const conflicts = getConflicts({ localChanges, environmentChanges });

    printConflicts({ conflicts });

    expectStdout().toMatchInlineSnapshot(`
      "These files have conflicting changes.

                 You     Environment
      bar.js  ± updated   - deleted
      baz.js  - deleted   ± updated
      foo.js  ± updated   ± updated
      qux.js  + created   + created
      "
    `);
  });
});
