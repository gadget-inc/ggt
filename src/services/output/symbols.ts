// eslint-disable-next-line no-restricted-imports -- this is the only place we're allowed to import figures
import figures, { mainSymbols } from "figures";
import isUnicodeSupported from "is-unicode-supported";
import { config } from "../config/config.js";
import { env } from "../config/env.js";

// we always use main symbols in tests rather than figures so that our
// tests are consistent across platforms (particularly Windows)
export const symbol = { ...(env.testLike ? mainSymbols : figures) };

if (isUnicodeSupported() && config.windowsOrWsl) {
  // when unicode is supported and we're on windows or wsl, these
  // symbols end up rendering over two cells while only taking up one,
  // so we add an extra space to each of them to make them take up two
  for (const name of ["tick", "cross"] as const) {
    symbol[name] += " ";
  }
}
