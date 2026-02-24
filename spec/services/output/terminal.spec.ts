import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resetTerminalTitle, ringBell, setTerminalTitle } from "../../../src/services/output/terminal.js";

describe("terminal", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;
  let originalIsTTY: boolean | undefined;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    originalIsTTY = process.stdout.isTTY;
  });

  afterEach(() => {
    process.stdout.isTTY = originalIsTTY as true;
  });

  describe("setTerminalTitle", () => {
    it("writes the OSC 2 escape sequence when stdout is a TTY", () => {
      process.stdout.isTTY = true;

      setTerminalTitle("ggt dev - my-app");

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy).toHaveBeenCalledWith("\x1b]2;ggt dev - my-app\x07");
    });

    it("does not write when stdout is not a TTY", () => {
      // @ts-expect-error - isTTY is typed as true but can be undefined
      process.stdout.isTTY = undefined;

      setTerminalTitle("ggt dev - my-app");

      expect(writeSpy).not.toHaveBeenCalled();
    });
  });

  describe("resetTerminalTitle", () => {
    it("writes an empty title escape sequence when stdout is a TTY", () => {
      process.stdout.isTTY = true;

      resetTerminalTitle();

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy).toHaveBeenCalledWith("\x1b]2;\x07");
    });
  });

  describe("ringBell", () => {
    it("writes BEL character when stdout is a TTY", () => {
      process.stdout.isTTY = true;

      ringBell();

      expect(writeSpy).toHaveBeenCalledOnce();
      expect(writeSpy).toHaveBeenCalledWith("\x07");
    });

    it("does not write when stdout is not a TTY", () => {
      // @ts-expect-error - isTTY is typed as true but can be undefined
      process.stdout.isTTY = undefined;

      ringBell();

      expect(writeSpy).not.toHaveBeenCalled();
    });
  });
});
