import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

import { workspacePath } from "../src/services/util/paths.ts";

describe("main", () => {
  describe("node version check", () => {
    it("exits with an error when Node.js version is too old", () => {
      // Run a script that patches process.versions.node before importing the built main.js
      const script = `
        Object.defineProperty(process.versions, 'node', { value: '20.0.0', configurable: true });
        await import(${JSON.stringify(pathToFileURL(workspacePath("src/main.ts")).href)});
      `;

      try {
        execFileSync(process.execPath, ["--input-type=module", "--experimental-transform-types", "--eval", script], {
          encoding: "utf-8",
          env: { ...process.env, NODE_NO_WARNINGS: "1" },
          timeout: 10_000,
        });
        expect.fail("Expected process to exit with code 1");
      } catch (error) {
        const err = error as { status: number; stderr: string };
        expect(err.status).toBe(1);
        expect(err.stderr).toMatchInlineSnapshot(`
          "ggt requires Node.js v22 or later, but you're running v20.0.0.

          To upgrade Node.js, pick whichever method you used to install it:

            nvm:        nvm install 22 && nvm use 22
            fnm:        fnm install 22 && fnm use 22
            Homebrew:   brew upgrade node
            Installer:  https://nodejs.org/en/download

          After upgrading, run ggt again.
          "
        `);
      }
    });
  });
});
