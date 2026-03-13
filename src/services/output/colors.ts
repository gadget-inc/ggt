import chalk, { Chalk } from "chalk";

import { config } from "../config/config.ts";
import { env } from "../config/env.ts";
import { Level } from "./log/level.ts";

const color = new Chalk({
  // we always turn off colors in tests (FORCE_COLOR=0) so that we get
  // predictable output, but if we're running with logs enabled
  // (GGT_LOG_LEVEL=info), we still want to see colors in our logs
  level: env.testLike && config.logLevel < Level.PRINT ? 3 : chalk.level,
});

export { color };

export default {
  // Semantic names
  error: color.red,
  link: color.cyan,
  subdued: color.blackBright,

  /** Flag names, arg names, command names in help output. */
  identifier: color.bold,
  /** Value placeholders like `<app-slug>` in help output. */
  placeholder: color.italic,
  /** Section headings like USAGE, FLAGS, COMMANDS, EXAMPLES in help output. */
  header: color.bold,
  /** Inline command references in prose/footers like `ggt dev --help`. */
  hint: color.italic,
  /** The `$` shell prompt character in examples. */
  prompt: color.dim,

  // Value type tokens
  plain: color.reset,
  number: color.yellowBright,
  boolean: color.green,

  // Outcome / status
  /** Positive outcomes: "No problems found", "✓ done". */
  success: color.green,
  /** Caution: warning text. */
  warning: color.yellow,
  /** Key words in prompts: "discard local", "have not synced". */
  emphasis: color.underline,

  // Filesync change type indicators
  /** + symbol, create counts. */
  created: color.greenBright,
  /** ± symbol, update counts. */
  updated: color.blueBright,
  /** - symbol, delete counts. */
  deleted: color.redBright,
  /** → symbol, rename counts. */
  renamed: color.yellowBright,

  // Inline references
  /** Inline code, command, and file name references in prose. */
  code: color.cyanBright,

  // Log line tokens
  /** Source name in a log line (e.g. "gadget-api"). */
  logName: color.bold,
  /** Text inside a level badge (on a colored background). Uses RGB white
   *  so it stays readable regardless of the terminal's whiteBright. */
  levelBadgeText: color.rgb(255, 255, 255).bold,

  // Log level badge backgrounds
  levelPrint: color.bgBlack,
  levelTrace: color.bgBlue,
  levelDebug: color.bgMagenta,
  levelInfo: color.bgBlue,
  levelWarn: color.bgYellow,
  levelError: color.bgRed,
};
