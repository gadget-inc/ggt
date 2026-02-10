import { describe, expect, it } from "vitest";

import { getConflicts } from "../../../src/services/filesync/conflicts.js";
import { getNecessaryChanges } from "../../../src/services/filesync/hashes.js";
import { testCtx } from "../../__support__/context.js";
import { makeHashes } from "../../__support__/filesync.js";

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
});
