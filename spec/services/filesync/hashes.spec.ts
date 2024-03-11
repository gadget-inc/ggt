import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import type { Context } from "../../../src/services/command/context.js";
import { getNecessaryChanges, isEqualHash, isEqualHashes, withoutUnnecessaryChanges } from "../../../src/services/filesync/hashes.js";
import { makeContext } from "../../__support__/context.js";
import { makeHashes } from "../../__support__/filesync.js";

describe("getChanges", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("returns no changes if hashes are equal", async () => {
    const files = {
      "foo.js": "// foo",
      "bar.js": "// bar",
      "baz.js": "// baz",
      "qux.js": "// qux",
      "some/nested/file.js": "// file",
    };

    const { localFilesVersionHashes, localHashes } = await makeHashes({ filesVersionFiles: files, localFiles: files });
    const changes = getNecessaryChanges(ctx, { from: localFilesVersionHashes, to: localHashes });
    expect(Object.fromEntries(changes)).toEqual({});
    expect(changes.size).toBe(0);
  });

  it("returns changes if hashes are different", async () => {
    const { localFilesVersionHashes, localHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
        "bar.js": "// bar",
      },
      localFiles: {
        "bar.js": "// bar changed",
        "baz.js": "// baz",
      },
    });

    const changes = getNecessaryChanges(ctx, { from: localFilesVersionHashes, to: localHashes });
    expect(Object.fromEntries(changes)).toEqual({
      "foo.js": { type: "delete", sourceHash: localFilesVersionHashes["foo.js"] },
      "bar.js": { type: "update", sourceHash: localFilesVersionHashes["bar.js"], targetHash: localHashes["bar.js"] },
      "baz.js": { type: "create", targetHash: localHashes["baz.js"] },
    });
  });

  it("doesn't return changes for ignored paths", async () => {
    const { localFilesVersionHashes, localHashes } = await makeHashes({
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

    const changes = getNecessaryChanges(ctx, { from: localFilesVersionHashes, to: localHashes, ignore: [".gadget/"] });
    expect(Object.fromEntries(changes)).toEqual({
      "foo.js": { type: "delete", sourceHash: localFilesVersionHashes["foo.js"] },
      "bar.js": { type: "update", sourceHash: localFilesVersionHashes["bar.js"], targetHash: localHashes["bar.js"] },
      "baz.js": { type: "create", targetHash: localHashes["baz.js"] },
    });
  });

  it("doesn't mark directories as deleted if they still have files inside", async () => {
    const { localFilesVersionHashes, localHashes } = await makeHashes({
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

    const changes = getNecessaryChanges(ctx, { from: localFilesVersionHashes, to: localHashes });
    expect(Object.fromEntries(changes)).toEqual({
      "some/nested/other-file.js": { type: "delete", sourceHash: localFilesVersionHashes["some/nested/other-file.js"] },
    });
  });

  it("doesn't return changes for files that existing already has", async () => {
    const { localFilesVersionHashes, localHashes, environmentHashes } = await makeHashes({
      filesVersionFiles: {
        "foo.js": "// foo",
        "bar.js": "// bar",
      },
      localFiles: {
        "bar.js": "// bar changed",
        "baz.js": "// baz",
        "qux.js": "// qux",
      },
      gadgetFiles: {
        "bar.js": "// bar changed",
        "baz.js": "// baz",
      },
    });

    const changes = getNecessaryChanges(ctx, { from: localFilesVersionHashes, to: localHashes, existing: environmentHashes });
    expect(Object.fromEntries(changes)).toEqual({
      "qux.js": { type: "create", targetHash: localHashes["qux.js"] },
    });
  });
});

describe("withoutUnnecessaryChanges", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("removes changes that existing already has", async () => {
    const { localFilesVersionHashes, localHashes, environmentHashes } = await makeHashes({
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

    const localChanges = getNecessaryChanges(ctx, { from: localFilesVersionHashes, to: localHashes });
    expect(Object.fromEntries(localChanges)).toEqual({
      "foo.js": { type: "update", sourceHash: localFilesVersionHashes["foo.js"], targetHash: localHashes["foo.js"] },
      "bar.js": { type: "create", targetHash: localHashes["bar.js"] },
    });

    const environmentChanges = getNecessaryChanges(ctx, { from: localFilesVersionHashes, to: environmentHashes });
    expect(Object.fromEntries(environmentChanges)).toEqual({
      "foo.js": { type: "update", sourceHash: localFilesVersionHashes["foo.js"], targetHash: environmentHashes["foo.js"] },
      "bar.js": { type: "create", targetHash: environmentHashes["bar.js"] },
    });

    const localWithoutUnnecessaryChanges = withoutUnnecessaryChanges(ctx, { changes: localChanges, existing: environmentHashes });
    expect(Object.fromEntries(localWithoutUnnecessaryChanges)).toEqual({
      "foo.js": { type: "update", sourceHash: localFilesVersionHashes["foo.js"], targetHash: localHashes["foo.js"] },
    });

    const gadgetWithoutUnnecessaryChanges = withoutUnnecessaryChanges(ctx, { changes: environmentChanges, existing: localHashes });
    expect(Object.fromEntries(gadgetWithoutUnnecessaryChanges)).toEqual({
      "foo.js": { type: "update", sourceHash: localFilesVersionHashes["foo.js"], targetHash: environmentHashes["foo.js"] },
    });
  });
});

describe("isEqualHash", () => {
  it("returns true if sha1s are equal", () => {
    const sha1 = randomUUID();

    expect(isEqualHash("file.txt", { sha1 }, { sha1 })).toBe(true);
    expect(isEqualHash("file.txt", { sha1, permissions: 0o664 }, { sha1, permissions: 0o644 })).toBe(true);
    expect(isEqualHash("file.txt", { sha1, permissions: 0o644 }, { sha1, permissions: 0o744 })).toBe(true);
    expect(isEqualHash("file.txt", { sha1 }, { sha1, permissions: 0o644 })).toBe(true);
    expect(isEqualHash("file.txt", { sha1, permissions: 0o644 }, { sha1 })).toBe(true);
  });

  it("returns false if sha1s are not equal", () => {
    const sha1 = randomUUID();
    const otherSha1 = randomUUID();

    expect(isEqualHash("file.txt", { sha1 }, { sha1: otherSha1 })).toBe(false);
    expect(isEqualHash("file.txt", { sha1, permissions: 0o664 }, { sha1: otherSha1, permissions: 0o644 })).toBe(false);
    expect(isEqualHash("file.txt", { sha1, permissions: 0o644 }, { sha1: otherSha1, permissions: 0o744 })).toBe(false);
    expect(isEqualHash("file.txt", { sha1 }, { sha1: otherSha1, permissions: 0o644 })).toBe(false);
    expect(isEqualHash("file.txt", { sha1, permissions: 0o644 }, { sha1: otherSha1 })).toBe(false);
  });
});

describe("isEqualHashes", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("returns true if all sha1s are equal", () => {
    const sha1 = randomUUID();

    expect(isEqualHashes(ctx, { "file.txt": { sha1 } }, { "file.txt": { sha1 } })).toBe(true);
    expect(isEqualHashes(ctx, { "file.txt": { sha1, permissions: 0o664 } }, { "file.txt": { sha1, permissions: 0o644 } })).toBe(true);
    expect(isEqualHashes(ctx, { "file.txt": { sha1, permissions: 0o644 } }, { "file.txt": { sha1, permissions: 0o744 } })).toBe(true);
    expect(isEqualHashes(ctx, { "file.txt": { sha1 } }, { "file.txt": { sha1, permissions: 0o644 } })).toBe(true);
    expect(isEqualHashes(ctx, { "file.txt": { sha1, permissions: 0o644 } }, { "file.txt": { sha1 } })).toBe(true);
  });

  it("returns true if any sha1s are not equal", () => {
    const sha1 = randomUUID();
    const otherSha1 = randomUUID();

    expect(isEqualHashes(ctx, { "file.txt": { sha1 } }, { "file.txt": { sha1: otherSha1 } })).toBe(false);
    expect(isEqualHashes(ctx, { "file.txt": { sha1, permissions: 0o664 } }, { "file.txt": { sha1: otherSha1, permissions: 0o644 } })).toBe(
      false,
    );
    expect(isEqualHashes(ctx, { "file.txt": { sha1, permissions: 0o644 } }, { "file.txt": { sha1: otherSha1, permissions: 0o744 } })).toBe(
      false,
    );
    expect(isEqualHashes(ctx, { "file.txt": { sha1 } }, { "file.txt": { sha1: otherSha1, permissions: 0o644 } })).toBe(false);
    expect(isEqualHashes(ctx, { "file.txt": { sha1, permissions: 0o644 } }, { "file.txt": { sha1: otherSha1 } })).toBe(false);
  });
});
