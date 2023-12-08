import { describe, it } from "vitest";
import { Changes, printChanges } from "../../../src/services/filesync/changes.js";
import { expectStdout } from "../../__support__/stream.js";

describe("printChanges", () => {
  it("prints the changes in present tense", () => {
    const changes = new Changes();
    changes.set("foo", { type: "create" });
    changes.set("bar", { type: "update" });
    changes.set("baz", { type: "delete" });

    printChanges({ changes, tense: "present", message: "→ Sent 12:00:00 PM" });
    expectStdout().toMatchInlineSnapshot(`
      "→ Sent 12:00:00 PM
      bar  update ± 
      baz  delete - 
      foo  create + 

      "
    `);
  });

  it("prints the changes in past tense", () => {
    const changes = new Changes();
    changes.set("foo", { type: "create" });
    changes.set("bar", { type: "update" });
    changes.set("baz", { type: "delete" });

    printChanges({ changes, tense: "past", message: "← Received 12:00:00 PM" });
    expectStdout().toMatchInlineSnapshot(`
      "← Received 12:00:00 PM
      bar  updated ± 
      baz  deleted - 
      foo  created + 

      "
    `);
  });

  it("prints differently when there are 10+ changes", () => {
    const changes = new Changes();
    for (let i = 0; i < 10; i++) {
      changes.set(`file-${i}`, { type: "create" });
    }

    for (let i = 10; i < 20; i++) {
      changes.set(`file-${i}`, { type: "update" });
    }

    for (let i = 20; i < 30; i++) {
      changes.set(`file-${i}`, { type: "delete" });
    }

    printChanges({ changes, tense: "present", message: "→ Sent 12:00:00 PM" });
    expectStdout().toMatchInlineSnapshot(`
      "→ Sent 12:00:00 PM

      file-0   create + 
      file-1   create + 
      file-10  update ± 
      file-11  update ± 
      file-12  update ± 
      file-13  update ± 
      file-14  update ± 
      file-15  update ± 
      file-16  update ± 
      file-17  update ± 
      file-18  update ± 
      file-19  update ± 
      file-2   create + 
      file-20  delete - 
      file-21  delete - 
      file-22  delete - 
      file-23  delete - 
      file-24  delete - 
      file-25  delete - 
      file-26  delete - 
      file-27  delete - 
      file-28  delete - 
      file-29  delete - 
      file-3   create + 
      file-4   create + 
      file-5   create + 
      file-6   create + 
      file-7   create + 
      file-8   create + 
      file-9   create + 

      30 changes in total. 10 creates, 10 updates, 10 deletes.

      "
    `);
  });
});
