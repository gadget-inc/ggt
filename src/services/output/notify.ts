import type { Context } from "../command/context.ts";

export type NotifyOptions = {
  subtitle?: string;
  message: string;
};

/**
 * Alerts the user by writing a terminal bell character (BEL) to stderr.
 *
 * This triggers the terminal's native attention mechanism — dock bounce on
 * macOS, taskbar flash on Linux/Windows — without any platform-specific
 * code or external dependencies.
 */
export const notify = (ctx: Context, notification: NotifyOptions): void => {
  ctx.log.info("notifying user", { subtitle: notification.subtitle, message: notification.message });
  process.stderr.write("\x07");
};
