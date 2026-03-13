import { describe, expect, it, vi } from "vitest";

import { notify } from "../../../src/services/output/notify.js";
import { testCtx } from "../../__support__/context.js";

describe("notify", () => {
  it("writes BEL to stderr", () => {
    const writeSpy = vi.spyOn(process.stderr, "write").mockReturnValue(true);

    notify(testCtx, { message: "Something broke" });

    expect(writeSpy).toHaveBeenCalledWith("\x07");
    writeSpy.mockRestore();
  });

  it("logs the notification details", () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const infoSpy = vi.spyOn(testCtx.log, "info");

    notify(testCtx, { subtitle: "Uh oh!", message: "Something broke" });

    expect(infoSpy).toHaveBeenCalledWith("notifying user", { subtitle: "Uh oh!", message: "Something broke" });
  });
});
