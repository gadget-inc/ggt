import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { getChanges, isEqualHash, isEqualHashes, withoutUnnecessaryChanges } from "../../../src/services/filesync/hashes.js";
import { makeHashes } from "../../__support__/filesync.js";

describe("getChanges", () => {
  it("returns no changes if hashes are equal", async () => {
    const files = {
      "foo.js": "// foo",
      "bar.js": "// bar",
      "baz.js": "// baz",
      "qux.js": "// qux",
      "some/nested/file.js": "// file",
    };

    const { filesVersionHashes, localHashes } = await makeHashes({ filesVersionFiles: files, localFiles: files });
    const changes = getChanges({ from: filesVersionHashes, to: localHashes });
    expect(Object.fromEntries(changes)).toEqual({});
    expect(changes.size).toBe(0);
  });

  it("returns changes if hashes are different", async () => {
    const { filesVersionHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
        "bar.js": "// bar",
      },
      localFiles: {
        "bar.js": "// bar changed",
        "baz.js": "// baz",
      },
    });

    const changes = getChanges({ from: filesVersionHashes, to: localHashes });
    expect(Object.fromEntries(changes)).toEqual({
      "foo.js": { type: "delete", sourceHash: filesVersionHashes["foo.js"] },
      "bar.js": { type: "update", sourceHash: filesVersionHashes["bar.js"], targetHash: localHashes["bar.js"] },
      "baz.js": { type: "create", targetHash: localHashes["baz.js"] },
    });
  });

  it("doesn't return changes for ignored paths", async () => {
    const { filesVersionHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        ".gadget/client.js": "// client",
        "foo.js": "// foo",
        "bar.js": "// bar",
      },
      localFiles: {
        ".gadget/client.js": "// client changed",
        ".gadget/new-file.js": "// new file",
        "bar.js": "// bar changed",
        "baz.js": "// baz",
      },
    });

    const changes = getChanges({ from: filesVersionHashes, to: localHashes, ignore: [".gadget/"] });
    expect(Object.fromEntries(changes)).toEqual({
      "foo.js": { type: "delete", sourceHash: filesVersionHashes["foo.js"] },
      "bar.js": { type: "update", sourceHash: filesVersionHashes["bar.js"], targetHash: localHashes["bar.js"] },
      "baz.js": { type: "create", targetHash: localHashes["baz.js"] },
    });
  });

  it("doesn't mark directories as deleted if they still have files inside", async () => {
    const { filesVersionHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "some/nested/file.js": "// file",
        "some/nested/other-file.js": "// other file",
      },
      localFiles: {
        "some/nested/file.js": "// file",
      },
    });

    // this should never happen, but just in case
    delete localHashes["some/"];
    delete localHashes["some/nested/"];

    const changes = getChanges({ from: filesVersionHashes, to: localHashes });
    expect(Object.fromEntries(changes)).toEqual({
      "some/nested/other-file.js": { type: "delete", sourceHash: filesVersionHashes["some/nested/other-file.js"] },
    });
  });
});

describe("withoutUnnecessaryChanges", () => {
  it("removes changes that existing already has", async () => {
    const { filesVersionHashes, localHashes, gadgetHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
      },
      localFiles: {
        "foo.js": "// foo (local)",
        "bar.js": "// bar",
      },
      gadgetFiles: {
        "foo.js": "// foo (gadget)",
        "bar.js": "// bar",
      },
    });

    const localChanges = getChanges({ from: filesVersionHashes, to: localHashes });
    expect(Object.fromEntries(localChanges)).toEqual({
      "foo.js": { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: localHashes["foo.js"] },
      "bar.js": { type: "create", targetHash: localHashes["bar.js"] },
    });

    const gadgetChanges = getChanges({ from: filesVersionHashes, to: gadgetHashes });
    expect(Object.fromEntries(gadgetChanges)).toEqual({
      "foo.js": { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: gadgetHashes["foo.js"] },
      "bar.js": { type: "create", targetHash: gadgetHashes["bar.js"] },
    });

    const localWithoutUnnecessaryChanges = withoutUnnecessaryChanges({ changes: localChanges, existing: gadgetHashes });
    expect(Object.fromEntries(localWithoutUnnecessaryChanges)).toEqual({
      "foo.js": { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: localHashes["foo.js"] },
    });

    const gadgetWithoutUnnecessaryChanges = withoutUnnecessaryChanges({ changes: gadgetChanges, existing: localHashes });
    expect(Object.fromEntries(gadgetWithoutUnnecessaryChanges)).toEqual({
      "foo.js": { type: "update", sourceHash: filesVersionHashes["foo.js"], targetHash: gadgetHashes["foo.js"] },
    });
  });
});

describe("isEqualHash", () => {
  it("returns true if hashes are equal", () => {
    const sha1 = randomUUID();
    const permissions = 0o777;

    expect(isEqualHash({ sha1, permissions }, { sha1, permissions })).toBe(true);
  });

  it("returns false if hashes are not equal", () => {
    const sha1 = randomUUID();
    const permissions = 0o777;

    expect(isEqualHash({ sha1, permissions }, { sha1: randomUUID(), permissions })).toBe(false);
    expect(isEqualHash({ sha1, permissions }, { sha1, permissions: 0o755 })).toBe(false);
  });

  it("ignores permissions if they are not set", () => {
    const sha1 = randomUUID();

    expect(isEqualHash({ sha1 }, { sha1, permissions: 0o777 })).toBe(true);
    expect(isEqualHash({ sha1, permissions: 0o777 }, { sha1 })).toBe(true);
  });
});

describe("isEqualHashes", () => {
  it("returns true if hashes are equal", () => {
    const sha1 = randomUUID();
    const permissions = 0o777;

    expect(isEqualHashes({ "foo.js": { sha1, permissions } }, { "foo.js": { sha1, permissions } })).toBe(true);
  });

  it("returns false if hashes are not equal", () => {
    const sha1 = randomUUID();
    const permissions = 0o777;

    expect(isEqualHashes({ "foo.js": { sha1, permissions } }, { "foo.js": { sha1: randomUUID(), permissions } })).toBe(false);
    expect(isEqualHashes({ "foo.js": { sha1, permissions } }, { "foo.js": { sha1, permissions: 0o755 } })).toBe(false);
  });

  it("ignores permissions if they are not set", () => {
    const sha1 = randomUUID();

    expect(isEqualHashes({ "foo.js": { sha1 } }, { "foo.js": { sha1, permissions: 0o777 } })).toBe(true);
    expect(isEqualHashes({ "foo.js": { sha1, permissions: 0o777 } }, { "foo.js": { sha1 } })).toBe(true);
  });

  it("returns false if one of the hashes is missing", () => {
    const sha1 = randomUUID();
    const permissions = 0o777;

    expect(isEqualHashes({ "foo.js": { sha1, permissions } }, {})).toBe(false);
    expect(isEqualHashes({}, { "foo.js": { sha1, permissions } })).toBe(false);
  });
});
