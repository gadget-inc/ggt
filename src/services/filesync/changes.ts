import chalk from "chalk";
import assert from "node:assert";
import pluralize from "pluralize";
import { z } from "zod";
import { config } from "../config.js";
import { printTable, println, printlns, symbol } from "../print.js";

export const Hashes = z.union([z.record(z.string(), z.string()), z.map(z.string(), z.string())]).transform((files) => {
  let hashes: Hashes;

  // eslint-disable-next-line func-style
  function equals(this: Hashes, other: Hashes): boolean {
    if (this.size !== other.size) {
      return false;
    }

    for (const [path, hash] of this) {
      if (other.get(path) !== hash) {
        return false;
      }
    }

    return true;
  }

  if (files instanceof Map) {
    hashes = Object.assign(files, { equals });
  } else {
    hashes = Object.assign(new Map(Object.entries(files)), { equals });
  }

  return hashes;
});

export type Hashes = Map<string, string> & { equals(other: Hashes): boolean };

export type Change = Create | Update | Delete;
export type ChangeWithHash = CreateWithHash | UpdateWithHash | DeleteWithHash;

export class Changes<C extends Change = Change> extends Map<string, C> {
  created(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change instanceof Create)
      .map(([path]) => path);
  }

  updated(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change instanceof Update)
      .map(([path]) => path);
  }

  deleted(): string[] {
    return Array.from(this.entries())
      .filter(([, change]) => change instanceof Delete)
      .map(([path]) => path);
  }
}

export class ChangesWithHash extends Changes<ChangeWithHash> {}

export class Create {
  readonly type = "create";
  constructor(readonly oldPath?: string) {}
  toJSON(): typeof this {
    return { ...this };
  }
}

export class Update {
  readonly type = "update";
  toJSON(): typeof this {
    return { ...this };
  }
}

export class Delete {
  readonly type = "delete";
  toJSON(): typeof this {
    return { ...this };
  }
}

export class CreateWithHash extends Create {
  constructor(
    readonly targetHash: string,
    oldPath?: string,
  ) {
    super(oldPath);
  }
}

export class UpdateWithHash extends Update {
  constructor(
    readonly sourceHash: string,
    readonly targetHash: string,
  ) {
    super();
  }
}

export class DeleteWithHash extends Delete {
  constructor(readonly sourceHash: string) {
    super();
  }
}

/**
 * Calculates the changes that were made to `from` to make it end up as `to`.
 *
 * @param from - The source `Hashes` object to compare.
 * @param to - The target `Hashes` object to compare.
 * @param ignore - An optional array of path prefixes to ignore during
 * the comparison.
 * @returns A `ChangesWithHash` object representing the changes that
 * need to be made to transform `from` into the `to` object.
 */
export const getChanges = ({ from: source, to: target, ignore }: { from: Hashes; to: Hashes; ignore?: string[] }): ChangesWithHash => {
  const changes = new ChangesWithHash();

  const targetPaths = Array.from(target.keys());

  for (const [sourcePath, sourceHash] of source) {
    if (ignore?.some((ignored) => sourcePath.startsWith(ignored))) {
      continue;
    }

    const targetHash = target.get(sourcePath);
    if (!targetHash) {
      if (!sourcePath.endsWith("/") || !targetPaths.some((targetPath) => targetPath.startsWith(sourcePath))) {
        // sourcePath is a file and it doesn't exist in target OR
        // sourcePath is a directory and target doesn't have any
        // existing files inside it, therefor the sourcePath has been
        // deleted
        changes.set(sourcePath, new DeleteWithHash(sourceHash));
      }
    } else if (targetHash !== sourceHash) {
      // the file or directory exists in target, but has a different
      // hash, so it's been changed
      changes.set(sourcePath, new UpdateWithHash(sourceHash, targetHash));
    }
  }

  for (const targetPath of targetPaths) {
    if (ignore?.some((ignored) => targetPath.startsWith(ignored))) {
      continue;
    }

    if (!source.has(targetPath)) {
      // the targetPath doesn't exist in source, so it's been created
      const targetHash = target.get(targetPath);
      assert(targetHash);
      changes.set(targetPath, new CreateWithHash(targetHash));
    }
  }

  return changes;
};

/**
 * Filters out changes that
 * changes needed to be made to `existing` to apply all the `changes`.
 *
 * @param changes - The `ChangesWithHash` object containing the changes
 * to be made.
 * @param existing - The `Hashes` object containing the existing hashes.
 * @returns A new `ChangesWithHash` object containing only the necessary
 * changes to be made.
 */
export const withoutUnnecessaryChanges = ({ changes, existing }: { changes: ChangesWithHash; existing: Hashes }): ChangesWithHash => {
  const necessaryChanges = new ChangesWithHash();

  for (const [path, change] of changes) {
    const existingHash = existing.get(path);
    if (change instanceof Delete && !existingHash) {
      // already deleted
      continue;
    }

    if ((change instanceof Create || change instanceof Update) && change.targetHash === existingHash) {
      // already created or updated
      continue;
    }

    // technically, if the change is an Update and the existingHash
    // doesn't exist, then it we should change it to a Create, but
    // changing the type makes the output look confusing and it doesn't
    // really matter
    necessaryChanges.set(path, change);
  }

  return necessaryChanges;
};

/**
 * Prints the changes to the console.
 *
 * @param changes - The changes to print.
 * @param tense - The tense to use for the change type.
 * @param limit - The maximum number of changes to print.
 * @param mt - The number of empty lines to print before the changes.
 */
export const printChanges = ({
  changes,
  tense,
  limit = Infinity,
  mt = 1,
}: {
  changes: Changes;
  tense: "past" | "present";
  limit?: number;
  mt?: number;
}): void => {
  if (config.debug) {
    // always print all changes in debug mode
    limit = Infinity;
  }

  const created = chalk.greenBright("+ " + (tense === "past" ? "created" : "create"));
  const updated = chalk.blueBright("± " + (tense === "past" ? "updated" : "update"));
  const deleted = chalk.redBright("- " + (tense === "past" ? "deleted" : "delete"));

  for (let i = 0; i < mt; i++) {
    println("");
  }

  printTable({
    rows: Array.from(changes.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(0, limit)
      .map(([path, change]) => {
        switch (true) {
          case change instanceof Create:
            return [chalk.greenBright(path), created];
          case change instanceof Update:
            return [chalk.blueBright(path), updated];
          case change instanceof Delete:
            return [chalk.redBright(path), deleted];
          default:
            throw new Error(`Unknown change type: ${change.constructor.name}`);
        }
      }),
  });

  if (changes.size > limit) {
    println`{gray ${symbol.ellipsis} ${changes.size - limit} more}`;
  }

  const nChanges = pluralize("change", changes.size, true);
  const nCreates = pluralize("create", changes.created().length, true);
  const nUpdates = pluralize("update", changes.updated().length, true);
  const nDeletes = pluralize("delete", changes.deleted().length, true);

  printlns`{gray ${nChanges} in total.} {greenBright ${nCreates}}, {blueBright ${nUpdates}}, {redBright ${nDeletes}}`;
};
