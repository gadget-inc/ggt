import chalk, { Chalk } from "chalk";

import { config } from "../config/config.js";
import { env } from "../config/env.js";
import { Level } from "./log/level.js";

const color = new Chalk({
  // we always turn off colors in tests (FORCE_COLOR=0) so that we get
  // predictable output, but if we're running with logs enabled
  // (GGT_LOG_LEVEL=info), we still want to see colors in our logs
  level: env.testLike && config.logLevel < Level.PRINT ? 3 : chalk.level,
});

export default {
  error: color.red,
  success: color.green,
  warn: color.yellow,
  link: color.cyan,
  highlighted: color.magentaBright,
  examplesQuestions: color.cyanBright,
  subdued: color.blackBright,
  body: color.whiteBright,

  black: color.black,
  blackBright: color.blackBright,
  red: color.red,
  redBright: color.redBright,
  green: color.green,
  greenBright: color.greenBright,
  yellow: color.yellow,
  yellowBright: color.yellowBright,
  blue: color.blue,
  blueBright: color.blueBright,
  magenta: color.magenta,
  magentaBright: color.magentaBright,
  cyan: color.cyan,
  cyanBright: color.cyanBright,
  white: color.white,
  whiteBright: color.whiteBright,
  bgBlack: color.bgBlack,
  bgBlackBright: color.bgBlackBright,
  bgRed: color.bgRed,
  bgRedBright: color.bgRedBright,
  bgGreen: color.bgGreen,
  bgGreenBright: color.bgGreenBright,
  bgYellow: color.bgYellow,
  bgYellowBright: color.bgYellowBright,
  bgBlue: color.bgBlue,
  bgBlueBright: color.bgBlueBright,
  bgMagenta: color.bgMagenta,
  bgMagentaBright: color.bgMagentaBright,
  bgCyan: color.bgCyan,
  bgCyanBright: color.bgCyanBright,
  bgWhite: color.bgWhite,
  bgWhiteBright: color.bgWhiteBright,
  reset: color.reset,
};

export const colorTest = (): string => {
  return `
${color.black("black")}
${color.blackBright("blackBright")}
${color.red("red")}
${color.redBright("redBright")}
${color.green("green")}
${color.greenBright("greenBright")}
${color.yellow("yellow")}
${color.yellowBright("yellowBright")}
${color.blue("blue")}
${color.blueBright("blueBright")}
${color.magenta("magenta")}
${color.magentaBright("magentaBright")}
${color.cyan("cyan")}
${color.cyanBright("cyanBright")}
${color.white("white")}
${color.whiteBright("whiteBright")}
${color.bgBlack("bgBlack")}
${color.bgBlackBright("bgBlackBright")}
${color.bgRed("bgRed")}
${color.bgRedBright("bgRedBright")}
${color.bgGreen("bgGreen")}
${color.bgGreenBright("bgGreenBright")}
${color.bgYellow("bgYellow")}
${color.bgYellowBright("bgYellowBright")}
${color.bgBlue("bgBlue")}
${color.bgBlueBright("bgBlueBright")}
${color.bgMagenta("bgMagenta")}
${color.bgMagentaBright("bgMagentaBright")}
${color.bgCyan("bgCyan")}
${color.bgCyanBright("bgCyanBright")}
${color.bgWhite("bgWhite")}
${color.bgWhiteBright("bgWhiteBright")}
  `;
};
