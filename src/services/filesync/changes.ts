import chalk from "chalk";
import assert from "node:assert";
import pluralize from "pluralize";
import { z } from "zod";
import { printTable, println, printlns, symbol } from "../print.js";

export const Hashes = z.record(z.string());
export type Hashes = z.infer<typeof Hashes>;

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
}

export class Update {
  readonly type = "update";
}

export class Delete {
  readonly type = "delete";
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
 * @returns The changes that were made to `from` to make it match `to`.
 */
export const getChanges = ({ from: source, to: target, ignore }: { from: Hashes; to: Hashes; ignore?: string[] }): ChangesWithHash => {
  const changes = new ChangesWithHash();

  const targetPaths = Object.keys(target);

  for (const [sourcePath, sourceHash] of Object.entries(source)) {
    if (ignore?.some((ignored) => sourcePath.startsWith(ignored))) {
      continue;
    }

    const targetHash = target[sourcePath];
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

    if (!source[targetPath]) {
      // the targetPath doesn't exist in source, so it's been created
      const targetHash = target[targetPath];
      assert(targetHash);
      changes.set(targetPath, new CreateWithHash(targetHash));
    }
  }

  return changes;
};

/**
 * @returns the changes that need to be made to `to` to make it match `from`.
 */
export const getChangesToMake = ({
  from: source,
  to: target,
  ignore,
}: {
  from: Hashes;
  to: Hashes;
  ignore?: string[];
}): ChangesWithHash => {
  const changes = new ChangesWithHash();
  const targetPaths = Object.keys(target);

  for (const [sourcePath, sourceHash] of Object.entries(source)) {
    if (ignore?.some((ignored) => sourcePath.startsWith(ignored))) {
      continue;
    }

    const targetHash = target[sourcePath];
    if (!targetHash) {
      if (!sourcePath.endsWith("/") || !targetPaths.some((targetPath) => targetPath.startsWith(sourcePath))) {
        // sourcePath is a file and it doesn't exist in target OR
        // sourcePath is a directory and target doesn't have any
        // existing files inside it, therefor create we need to create
        // it
        changes.set(sourcePath, new CreateWithHash(sourceHash));
      }
    } else if (targetHash !== sourceHash) {
      // the file or directory exists in target, but has a different
      // hash, so it needs to be updated
      changes.set(sourcePath, new UpdateWithHash(sourceHash, targetHash));
    }
  }

  for (const targetPath of targetPaths) {
    if (!source[targetPath]) {
      if (ignore?.some((ignored) => targetPath.startsWith(ignored))) {
        continue;
      }

      // the targetPath doesn't exist in source, so it needs to be
      // deleted
      const targetHash = target[targetPath];
      assert(targetHash);
      changes.set(targetPath, new DeleteWithHash(targetHash));
    }
  }

  return changes;
};

/**
 * @returns the changes needed to apply `changes` to `existing`.
 */
export const getNecessaryChanges = ({ changes, existing }: { changes: ChangesWithHash; existing: Hashes }): ChangesWithHash => {
  const necessaryChanges = new ChangesWithHash();

  for (const [path, change] of changes) {
    const existingHash = existing[path];
    if (change instanceof Delete && !existingHash) {
      // already deleted
      continue;
    }

    if ((change instanceof Create || change instanceof Update) && change.targetHash === existingHash) {
      // already created or updated
      continue;
    }

    // if (change instanceof Update && !existingHash) {
    //   // we need to create this file
    //   necessaryChanges.set(path, new CreateWithHash(change.targetHash));
    // } else {
    // we need to update or delete this file
    necessaryChanges.set(path, change);
    // }
  }

  return necessaryChanges;
};

export const printChanges = ({ changes, limit = 10, mt = 1 }: { changes: Changes; limit?: number; mt?: number }): void => {
  const created = chalk.greenBright("+ created");
  const updated = chalk.blueBright("± updated");
  const deleted = chalk.redBright("- deleted");

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
    println`{gray ${symbol.ellipsis}  ${changes.size - limit} more}`;
  }

  const nChanges = pluralize("change", changes.size, true);
  const createdCount = changes.created.length;
  const updatedCount = changes.updated.length;
  const deletedCount = changes.deleted.length;

  printlns`{gray ${nChanges} in total. ${createdCount} ${created}, ${updatedCount} ${updated}, ${deletedCount} ${deleted}.}`;
};

export const printChangesToMake = ({ changes, limit = Infinity, mt = 1 }: { changes: Changes; limit?: number; mt?: number }): void => {
  const create = chalk.greenBright("+ create");
  const update = chalk.blueBright("± update");
  const del = chalk.redBright("- delete");

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
            return [chalk.greenBright(path), create];
          case change instanceof Update:
            return [chalk.blueBright(path), update];
          case change instanceof Delete:
            return [chalk.redBright(path), del];
          default:
            throw new Error(`Unknown change type: ${change.constructor.name}`);
        }
      }),
  });

  if (changes.size > limit) {
    println`{gray … ${changes.size - limit} more}`;
  }

  const nChanges = pluralize("change", changes.size, true);
  const createCount = changes.created.length;
  const updateCount = changes.updated.length;
  const deleteCount = changes.deleted.length;

  printlns`{gray ${nChanges} in total. ${createCount} to ${create}, ${updateCount} to ${update}, ${deleteCount} to ${del}.}`;
};
