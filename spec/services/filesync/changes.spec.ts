import { beforeEach, describe, it } from "vitest";
import type { Context } from "../../../src/services/command/context.js";
import { Changes, printChanges } from "../../../src/services/filesync/changes.js";
import { makeContext } from "../../__support__/context.js";
import { expectStdout } from "../../__support__/stream.js";

describe("printChanges", () => {
  let ctx: Context;

  beforeEach(() => {
    ctx = makeContext();
  });

  it("prints the changes in present tense", () => {
    const changes = new Changes();
    changes.set("foo", { type: "create" });
    changes.set("bar", { type: "update" });
    changes.set("baz", { type: "delete" });

    printChanges(ctx, { changes, tense: "present", message: "→ Sent to example (staging) 12:00:00 PM" });
    expectStdout().toMatchInlineSnapshot(`
      "→ Sent to example (staging) 12:00:00 PM
      ±  bar  update 
      -  baz  delete 
      +  foo  create 
      "
    `);
  });

  it("prints the changes in past tense", () => {
    const changes = new Changes();
    changes.set("foo", { type: "create" });
    changes.set("bar", { type: "update" });
    changes.set("baz", { type: "delete" });

    printChanges(ctx, { changes, tense: "past", message: "← Received from example (staging) 12:00:00 PM" });
    expectStdout().toMatchInlineSnapshot(`
      "← Received from example (staging) 12:00:00 PM
      ±  bar  updated 
      -  baz  deleted 
      +  foo  created 
      "
    `);
  });

  it("prints differently when there are 10+ changes", () => {
    const changes = new Changes();
    for (let i = 0; i < 9; i++) {
      changes.set(`file-0${i}`, { type: "create" });
    }
    changes.set("file-10", { type: "create" });

    for (let i = 10; i < 20; i++) {
      changes.set(`file-${i}`, { type: "update" });
    }

    for (let i = 20; i < 30; i++) {
      changes.set(`file-${i}`, { type: "delete" });
    }

    printChanges(ctx, { changes, tense: "present", message: "→ Sent to example (staging) 12:00:00 PM" });
    expectStdout().toMatchInlineSnapshot(`
      "→ Sent to example (staging) 12:00:00 PM

      +  file-00  create 
      +  file-01  create 
      +  file-02  create 
      +  file-03  create 
      +  file-04  create 
      +  file-05  create 
      +  file-06  create 
      +  file-07  create 
      +  file-08  create 
      ±  file-10  update 
      ±  file-11  update 
      ±  file-12  update 
      ±  file-13  update 
      ±  file-14  update 
      ±  file-15  update 
      ±  file-16  update 
      ±  file-17  update 
      ±  file-18  update 
      ±  file-19  update 
      -  file-20  delete 
      -  file-21  delete 
      -  file-22  delete 
      -  file-23  delete 
      -  file-24  delete 
      -  file-25  delete 
      -  file-26  delete 
      -  file-27  delete 
      -  file-28  delete 
      -  file-29  delete 

      29 changes in total. 9 creates, 10 updates, 10 deletes.
      "
    `);
  });
});
