import { describe, expect, it } from "vitest";
import { InvalidSyncFileError, YarnNotFoundError } from "../../../src/services/filesync/error.js";

describe("YarnNotFoundError", () => {
  it("renders correctly", () => {
    const error = new YarnNotFoundError();
    expect(error.toString()).toMatchInlineSnapshot(`
      "Yarn must be installed to sync your application. You can install it by running:

        $ npm install --global yarn

      For more information, see: https://classic.yarnpkg.com/en/docs/install"
    `);
  });
});

describe("InvalidSyncFileError", () => {
  it("renders correctly", () => {
    const dir = "/Users/jane/doe/";
    const app = "test";

    const error = new InvalidSyncFileError(dir, app);
    expect(error.toString()).toMatchInlineSnapshot(`
      "We failed to find a \\".gadget/sync.json\\" file in this directory:

        /Users/jane/doe/

      If you're running 'ggt sync' for the first time, we recommend
      using a gadget specific directory like this:

        ggt sync ~/gadget/test --app test

      If you're certain you want to sync the contents of that directory
      to Gadget, run 'ggt sync' again with the --force flag:

        ggt sync /Users/jane/doe/ --app test --force"
    `);
  });
});
