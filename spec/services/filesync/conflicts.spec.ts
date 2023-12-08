import { describe, expect, it } from "vitest";
import { getConflicts } from "../../../src/services/filesync/conflicts.js";
import { getChanges } from "../../../src/services/filesync/hashes.js";
import { makeHashes } from "../../__support__/filesync.js";

describe("getConflicts", () => {
  it("returns conflicting changes", async () => {
    const { filesVersionHashes, gadgetHashes, localHashes } = await makeHashes({
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

    const localChanges = getChanges({ from: filesVersionHashes, to: localHashes });
    const gadgetChanges = getChanges({ from: filesVersionHashes, to: gadgetHashes });
    const conflicts = getConflicts({ localChanges, gadgetChanges });
    expect(Object.fromEntries(conflicts)).toEqual({
      "foo.js": {
        localChange: { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: localHashes["foo.js"] },
        gadgetChange: { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: gadgetHashes["foo.js"] },
      },
      "bar.js": {
        localChange: { type: "update", sourceHash: filesVersionHashes["bar.js"], targetHash: localHashes["bar.js"] },
        gadgetChange: { type: "delete", sourceHash: filesVersionHashes["bar.js"] },
      },
      "baz.js": {
        localChange: { type: "delete", sourceHash: filesVersionHashes["baz.js"] },
        gadgetChange: { type: "update", sourceHash: filesVersionHashes["baz.js"], targetHash: gadgetHashes["baz.js"] },
      },
      "qux.js": {
        localChange: { type: "create", targetHash: localHashes["qux.js"] },
        gadgetChange: { type: "create", targetHash: gadgetHashes["qux.js"] },
      },
    });
  });

  it("doesn't return non-conflicting changes", async () => {
    const { filesVersionHashes, gadgetHashes, localHashes } = await makeHashes({
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

    const localChanges = getChanges({ from: filesVersionHashes, to: localHashes });
    const gadgetChanges = getChanges({ from: filesVersionHashes, to: gadgetHashes });
    const conflicts = getConflicts({ localChanges, gadgetChanges });
    expect(Object.fromEntries(conflicts)).toEqual({});
    expect(conflicts.size).toBe(0);
  });

  it("deletes .gadget/ conflicts from local changes", async () => {
    const { filesVersionHashes, gadgetHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        ".gadget/client.js": "// client",
        "foo.js": "// foo",
      },
      localFiles: {
        ".gadget/client.js": "// client (local)",
        "foo.js": "// foo (local)",
      },
      gadgetFiles: {
        ".gadget/client.js": "// client (gadget)",
        "foo.js": "// foo (gadget)",
      },
    });

    const localChanges = getChanges({ from: filesVersionHashes, to: localHashes });
    expect(Object.fromEntries(localChanges)).toEqual({
      ".gadget/client.js": {
        type: "update",
        sourceHash: filesVersionHashes[".gadget/client.js"],
        targetHash: localHashes[".gadget/client.js"],
      },
      "foo.js": { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: localHashes["foo.js"] },
    });

    const gadgetChanges = getChanges({ from: filesVersionHashes, to: gadgetHashes });
    expect(Object.fromEntries(gadgetChanges)).toEqual({
      ".gadget/client.js": {
        type: "update",
        sourceHash: filesVersionHashes[".gadget/client.js"],
        targetHash: gadgetHashes[".gadget/client.js"],
      },
      "foo.js": { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: gadgetHashes["foo.js"] },
    });

    const conflicts = getConflicts({ localChanges, gadgetChanges });
    expect(Object.fromEntries(conflicts)).toEqual({
      "foo.js": {
        localChange: { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: localHashes["foo.js"] },
        gadgetChange: { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: gadgetHashes["foo.js"] },
      },
    });

    expect(Object.fromEntries(localChanges)).toEqual({
      "foo.js": { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: localHashes["foo.js"] },
    });

    expect(Object.fromEntries(gadgetChanges)).toEqual({
      ".gadget/client.js": {
        type: "update",
        sourceHash: filesVersionHashes[".gadget/client.js"],
        targetHash: gadgetHashes[".gadget/client.js"],
      },
      "foo.js": { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: gadgetHashes["foo.js"] },
    });
  });
});
