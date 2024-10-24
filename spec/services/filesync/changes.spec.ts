import figures from "figures";
import { describe, it } from "vitest";
import { Changes, printChanges } from "../../../src/services/filesync/changes.js";
import { testCtx } from "../../__support__/context.js";
import { expectStdout } from "../../__support__/output.js";

describe("printChanges", () => {
  it("prints the changes in present tense", () => {
    const changes = new Changes();
    changes.set("foo", { type: "create" });
    changes.set("bar", { type: "update" });
    changes.set("baz", { type: "delete" });

    printChanges(testCtx, { changes, tense: "present", title: "→ Sent to example (staging) 12:00:00 PM" });
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

    printChanges(testCtx, { changes, tense: "past", title: `Pulled files. ${figures.arrowLeft} 12:00:00 PM` });
    expectStdout().toMatchInlineSnapshot(`
      "Pulled files. ← 12:00:00 PM
      ±  bar  updated
      -  baz  deleted
      +  foo  created
      "
    `);
  });

  it("prints differently when there are 10+ changes", () => {
    const changes = new Changes([
      ["file-01", { type: "create" }],
      ["file-02", { type: "create" }],
      ["file-03", { type: "create" }],
      ["file-04", { type: "create" }],

      ["file-05", { type: "update" }],
      ["file-06", { type: "update" }],
      ["file-07", { type: "update" }],
      ["file-08", { type: "update" }],

      ["file-08", { type: "delete" }],
      ["file-09", { type: "delete" }],
      ["file-11", { type: "delete" }],
      ["file-12", { type: "delete" }],
    ]);

    printChanges(testCtx, { changes, tense: "present", title: "→ Sent to example (staging) 12:00:00 PM" });
    expectStdout().toMatchInlineSnapshot(`
      "→ Sent to example (staging) 12:00:00 PM
      +  file-01  create
      +  file-02  create
      +  file-03  create
      +  file-04  create
      ±  file-05  update
      ±  file-06  update
      ±  file-07  update
      -  file-08  delete
      -  file-09  delete
      -  file-11  delete
      -  file-12  delete

      11 changes in total. 4 creates, 3 updates, 4 deletes.
      "
    `);
  });
});
