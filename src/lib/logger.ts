import path from "path";
import type { Level, Logger } from "pino";
import pino, { multistream } from "pino";
import pinoPretty from "pino-pretty";
import { serializeError } from "serialize-error";
import { Env } from "./env";

export interface LoggerOptions {
  // The minimum level at which logs will be logged.
  level?: Level;
  // The minimum level at which logs will be logged to stdout.
  stdout?: Level;
  // The minimum level at which logs will be logged to the log file.
  file?: Level;
}

export let logger: Logger & { configure: (options: LoggerOptions) => void } = {} as any;

configure();

function configure(options?: LoggerOptions): void {
  options = {
    level: (process.env["GGT_LOG_LEVEL"] as Level) || "trace",
    stdout: Env.testLike ? "fatal" : "info",
    file: "trace",
    ...options,
  };

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const filename = `${new Date().toISOString().split("T")[0]!}.log`;

  const customPrettifiers = {
    files: (files: any) => `\n  - ${files.join("\n  - ") as string}`,
    query: (query: any) => `\`${query}\``,
  };

  logger = pino(
    {
      level: options.level,
      serializers: {
        err: serializeError,
        error: serializeError,
        files: slice,
      },
      redact: ["variables.input.changed[*].content"],
    },
    multistream([
      // stdout
      {
        level: options.stdout,
        stream: pinoPretty({
          ignore: "pid,hostname,time,level",
          colorize: true,
          sync: Env.testLike,
          customPrettifiers,
        }),
      },
      // file
      {
        level: options.file,
        stream: Env.productionLike
          ? pino.transport({
              target: "pino/file",
              options: {
                destination: path.join(Env.paths.log, filename),
                mkdir: true,
              },
            })
          : pinoPretty({
              destination: path.join(__dirname, "../../tmp/logs", Env.value, filename),
              mkdir: true,
              ignore: "pid,hostname",
              colorize: false,
              sync: Env.testLike,
              customPrettifiers,
              translateTime: "SYS:h:MM:ss.l TT",
            }),
      },
    ])
  ) as any;

  logger.configure = configure;
}

export function slice<T>(items: Iterable<T>, mapper: (item: T) => string = String, keep = 10): string[] {
  const itemsSlice = [];
  for (const item of items) {
    if (itemsSlice.length >= keep) {
      itemsSlice.push("...");
      break;
    }
    itemsSlice.push(mapper(item));
  }
  return itemsSlice;
}
