import assert from "node:assert";
import os from "node:os";
import { expect } from "vitest";
import { FileSyncEncoding, type MutationPublishFileSyncEventsArgs } from "../../src/__generated__/graphql.js";
import type { File, FileSync } from "../../src/services/filesync/filesync.js";
import { isNil } from "../../src/services/util/is.js";
import { defaults } from "../../src/services/util/object.js";
import type { PartialExcept } from "../types.js";
import { prettyJSON } from "./json.js";

export const defaultFileMode = os.platform() === "win32" ? 0o100666 : 0o100644;
export const defaultDirMode = os.platform() === "win32" ? 0o40666 : 0o40755;

export const makeFile = (options: PartialExcept<File, "path" | "content">): File => {
  const f = defaults(options, {
    mode: defaultFileMode,
    encoding: FileSyncEncoding.Base64,
  });

  assert(f.encoding);
  f.content = Buffer.from(f.content).toString(f.encoding);

  return f;
};

export const makeDir = (options: PartialExcept<File, "path">): File => {
  assert(options.path.endsWith("/"));
  return makeFile({ content: "", mode: defaultDirMode, ...options });
};

export const expectPublishVariables = (
  expected: MutationPublishFileSyncEventsArgs,
): ((actual: MutationPublishFileSyncEventsArgs) => void) => {
  return (actual) => {
    assert(!isNil(actual));

    // sort the events by path so that toEqual() doesn't complain about the order
    actual.input.changed = actual.input.changed.sort((a, b) => a.path.localeCompare(b.path));
    actual.input.deleted = actual.input.deleted.sort((a, b) => a.path.localeCompare(b.path));
    expected.input.changed = expected.input.changed.sort((a, b) => a.path.localeCompare(b.path));
    expected.input.deleted = expected.input.deleted.sort((a, b) => a.path.localeCompare(b.path));

    expect(actual).toEqual(expected);
  };
};

export const stateFile = (filesync: FileSync): string => {
  // @ts-expect-error _state is private
  return prettyJSON(filesync._state);
};
